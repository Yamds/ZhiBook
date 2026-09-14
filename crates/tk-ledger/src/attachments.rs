//! 附件文件存储。
//!
//! 数据库只存**相对 data_root 的路径**（`ledger/attachments/<账单 id>/<附件 id>.<ext>`），
//! 文件本身逐张落盘、逐张删除——不做任何批量 / 递归删除（全局约束）。
//!
//! P3 的读写走 base64 over IPC：不依赖 asset 协议与额外作用域配置，
//! 前后端行为一致（见 P3 汇报里的方案说明）。

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use rusqlite::Connection;
use tk_domain::{Attachment, AttachmentData, MAX_ATTACHMENTS_PER_TRANSACTION};

use crate::error::{LedgerError, LedgerResult};
use crate::id::{new_id, now_ms};
use crate::repo;
use crate::validate;

/// 单张附件的字节上限（压缩后的 JPEG 通常远小于此）。
pub const MAX_ATTACHMENT_BYTES: usize = 8 * 1024 * 1024;

/// 附件根目录名（相对 data_root）。
pub const ATTACHMENTS_RELATIVE_ROOT: &str = "ledger/attachments";

/// 附件文件仓库（只看文件，不碰数据库）。
#[derive(Debug, Clone)]
pub struct AttachmentStore {
    data_root: PathBuf,
}

impl AttachmentStore {
    pub fn new(data_root: impl Into<PathBuf>) -> Self {
        Self {
            data_root: data_root.into(),
        }
    }

    /// 相对路径 → 绝对路径。
    ///
    /// **不校验**：只给「我们自己刚拼出来的路径」用（[`Self::relative_path`]）。
    /// 任何来自数据库 / 备份包 / 云端的路径必须先过 [`Self::resolve_checked`]。
    pub fn resolve(&self, relative_path: &str) -> PathBuf {
        self.data_root.join(relative_path)
    }

    /// 带校验的相对路径 → 绝对路径；越界路径直接报错，绝不落到 data_root 之外。
    pub fn resolve_checked(&self, relative_path: &str) -> LedgerResult<PathBuf> {
        validate::attachment_relative_path(relative_path)?;
        Ok(self.resolve(relative_path))
    }

    /// 相对路径拼装（账单 id / 附件 id 都是我们生成的短 id）。
    pub fn relative_path(transaction_id: &str, attachment_id: &str, extension: &str) -> String {
        format!("{ATTACHMENTS_RELATIVE_ROOT}/{transaction_id}/{attachment_id}.{extension}")
    }

    /// 保存一张附件：解码 → 写文件 → 落库；落库失败则回滚文件。
    pub fn save(
        &self,
        conn: &Connection,
        transaction_id: &str,
        mime: &str,
        base64: &str,
    ) -> LedgerResult<Attachment> {
        let mime = validate::attachment_mime(mime)?;
        if !is_safe_id(transaction_id) {
            return Err(LedgerError::validation("账单 id 不合法"));
        }
        let bytes = BASE64
            .decode(base64.trim())
            .map_err(|error| LedgerError::validation(format!("附件数据不是合法的 base64：{error}")))?;
        if bytes.is_empty() {
            return Err(LedgerError::validation("附件内容为空"));
        }
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(LedgerError::validation(format!(
                "单张附件不能超过 {} MB",
                MAX_ATTACHMENT_BYTES / 1024 / 1024
            )));
        }

        let existing = repo::count_attachments(conn, transaction_id)?;
        if existing >= MAX_ATTACHMENTS_PER_TRANSACTION {
            return Err(LedgerError::validation(format!(
                "单笔账单最多 {MAX_ATTACHMENTS_PER_TRANSACTION} 张附件"
            )));
        }

        let attachment_id = new_id("att");
        let extension = validate::extension_for_mime(mime);
        let relative = Self::relative_path(transaction_id, &attachment_id, extension);
        let absolute = self.resolve(&relative);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent).map_err(|error| LedgerError::io_at(parent, error))?;
        }
        fs::write(&absolute, &bytes).map_err(|error| LedgerError::io_at(&absolute, error))?;

        let attachment = Attachment {
            id: attachment_id,
            transaction_id: transaction_id.to_string(),
            path: relative,
            mime: mime.to_string(),
            byte_size: bytes.len() as i64,
            sort_order: existing,
            created_at_ms: now_ms(),
        };
        if let Err(error) = repo::insert_attachment(conn, &attachment) {
            // 落库失败就把刚写的文件删掉，避免孤儿文件
            let _ = fs::remove_file(&absolute);
            return Err(error);
        }
        Ok(attachment)
    }

    /// 读取附件内容（base64），供详情页展示。
    pub fn read(&self, conn: &Connection, attachment_id: &str) -> LedgerResult<AttachmentData> {
        let attachment = repo::get_attachment(conn, attachment_id)?
            .ok_or_else(|| LedgerError::not_found(format!("附件不存在：{attachment_id}")))?;
        let absolute = self.resolve_checked(&attachment.path)?;
        let bytes = match fs::read(&absolute) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Err(LedgerError::missing_path(absolute))
            }
            Err(error) => return Err(LedgerError::io_at(&absolute, error)),
        };
        Ok(AttachmentData {
            attachment,
            base64: BASE64.encode(bytes),
        })
    }

    /// 逐文件删除（缺失视为已删）；任何一次失败就中止，交给调用方决定是否重试。
    ///
    /// 路径来自数据库，先过校验：一条被污染的记录不允许把删除动作带到 data_root 之外。
    ///
    /// 注意：调用方必须在**数据库事务提交之后**调它（见 `Ledger::cleanup_attachment_files`）。
    pub fn remove_files(&self, relative_paths: &[String]) -> LedgerResult<()> {
        for relative in relative_paths {
            let absolute = self.resolve_checked(relative)?;
            match fs::remove_file(&absolute) {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::NotFound => {}
                Err(error) => return Err(LedgerError::io_at(&absolute, error)),
            }
        }
        Ok(())
    }

    /// 删掉某账单的附件目录（只删空目录，非递归）。
    pub fn remove_transaction_dir(&self, transaction_id: &str) {
        if !is_safe_id(transaction_id) {
            return;
        }
        let dir = self
            .data_root
            .join(ATTACHMENTS_RELATIVE_ROOT)
            .join(transaction_id);
        let _ = fs::remove_dir(dir);
    }
}

/// 只接受我们生成的短 id：挡掉路径穿越与分隔符。
fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

/// 附件目录是否已被创建（诊断用）。
pub fn attachments_root_exists(data_root: &Path) -> bool {
    data_root.join(ATTACHMENTS_RELATIVE_ROOT).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestLedger;
    use tk_domain::{EntryKind, NewAttachment, NewTransaction};

    fn create_transaction(ledger: &TestLedger, note: &str) -> String {
        ledger
            .create_transaction(NewTransaction {
                book_id: "book_default".to_string(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: note.to_string(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1_757_318_400_000,
            })
            .expect("create transaction")
            .id
    }

    fn save(ledger: &TestLedger, transaction_id: &str, mime: &str, payload: &str) -> LedgerResult<Attachment> {
        ledger.save_attachment(NewAttachment {
            transaction_id: transaction_id.to_string(),
            mime: mime.to_string(),
            base64: payload.to_string(),
        })
    }

    #[test]
    fn save_read_and_delete_round_trip() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "带图");
        let payload = BASE64.encode(b"fake-jpeg-bytes");

        let saved = save(&ledger, &transaction_id, "image/jpeg", &payload).expect("save attachment");
        assert_eq!(saved.byte_size, 15);
        assert_eq!(saved.sort_order, 0);
        assert!(saved.path.starts_with("ledger/attachments/"));

        let data = ledger.read_attachment(&saved.id).expect("read attachment");
        assert_eq!(data.base64, payload);
        assert!(attachments_root_exists(ledger.data_root()));

        ledger.delete_attachment(&saved.id).expect("delete");
        assert!(ledger.read_attachment(&saved.id).is_err());
        assert!(!ledger.data_root().join(&saved.path).exists());
    }

    #[test]
    fn attachments_are_capped_per_transaction() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "九张");
        let payload = BASE64.encode(b"x");
        for _ in 0..9 {
            save(&ledger, &transaction_id, "image/png", &payload).expect("前 9 张应成功");
        }
        let error = save(&ledger, &transaction_id, "image/png", &payload).expect_err("第 10 张应被拒");
        assert!(matches!(error, LedgerError::Validation(_)), "{error:?}");
    }

    #[test]
    fn read_refuses_a_path_outside_the_attachments_dir() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "越界");
        // 直接在库里塞一条被污染的记录（模拟恶意备份包导入后的状态）
        let secret = ledger.data_root().join("config/security.json");
        std::fs::create_dir_all(secret.parent().expect("parent")).expect("mkdir");
        std::fs::write(&secret, b"{\"secret\":true}").expect("write");
        ledger
            .with_tx(|conn| {
                repo::insert_attachment(
                    conn,
                    &Attachment {
                        id: "att_evil".to_string(),
                        transaction_id: transaction_id.clone(),
                        path: "ledger/attachments/../config/security.json".to_string(),
                        mime: "image/jpeg".to_string(),
                        byte_size: 16,
                        sort_order: 0,
                        created_at_ms: 1,
                    },
                )
            })
            .expect("insert poisoned row");

        let error = ledger.read_attachment("att_evil").expect_err("必须拒绝越界路径");
        assert!(matches!(error, LedgerError::Validation(_)), "{error:?}");
        // 文件本身没有被读走，也没有被删掉
        assert!(secret.exists());
    }

    #[test]
    fn deleting_refuses_escaping_paths() {
        let ledger = TestLedger::new();
        let error = ledger
            .attachments
            .remove_files(&["ledger/attachments/../../ledger.db".to_string()])
            .expect_err("必须拒绝越界路径");
        assert!(matches!(error, LedgerError::Validation(_)), "{error:?}");
    }

    #[test]
    fn rejects_bad_mime_and_bad_base64() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "非法");
        assert!(save(&ledger, &transaction_id, "image/gif", "AAAA").is_err());
        assert!(save(&ledger, &transaction_id, "image/jpeg", "not base64 !!").is_err());
    }

    #[test]
    fn deleting_transaction_removes_attachment_files() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "待删");
        let saved = save(&ledger, &transaction_id, "image/jpeg", &BASE64.encode(b"abc")).expect("save");
        let absolute = ledger.data_root().join(&saved.path);
        assert!(absolute.exists());

        ledger.delete_transaction(&transaction_id).expect("delete");
        assert!(!absolute.exists());
        assert!(!absolute.parent().expect("parent").exists());
    }

    /// 回归（REV-08）：文件清理失败不得影响数据库删除（删除顺序 = 先提交 DB）。
    #[test]
    fn database_delete_succeeds_even_when_file_cleanup_fails() {
        let ledger = TestLedger::new();
        let transaction_id = create_transaction(&ledger, "清理会失败");
        let saved = save(&ledger, &transaction_id, "image/jpeg", &BASE64.encode(b"abc")).expect("save");
        let absolute = ledger.data_root().join(&saved.path);
        // 把文件换成一个同名目录：remove_file 必然失败（Windows / Unix 都失败）
        std::fs::remove_file(&absolute).expect("remove file");
        std::fs::create_dir_all(&absolute).expect("replace with dir");

        ledger
            .delete_transaction(&transaction_id)
            .expect("数据库删除必须成功（文件清理是尽力而为）");
        assert!(ledger.get_transaction(&transaction_id).expect("get").is_none());
    }
}
