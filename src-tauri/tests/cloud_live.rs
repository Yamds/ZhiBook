//! 真实 Git 仓库的端到端集成测试（默认忽略，需环境变量）。
//!
//! 运行方式（PowerShell）：
//! ```powershell
//! $env:YAMDS_CLOUD_TEST_REPO = 'https://git.example.com/owner/repo.git'
//! $env:YAMDS_CLOUD_TEST_USER = 'user'
//! $env:YAMDS_CLOUD_TEST_TOKEN = '<PAT>'
//! cargo test -p zhibook --test cloud_live -- --ignored --nocapture --test-threads=1
//! ```
//!
//! 测试会在专用测试分支上完成：备份 → 换机（恢复密钥解锁）→ 双端合并 → 清理分支。
//! 凭证只从环境变量读取，绝不写入仓库。

#![allow(
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::panic,
    clippy::expect_used,
    clippy::unwrap_used
)]

use tk_domain::{EntryKind, NewTransaction};
use tk_ledger::{seed, Ledger};

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("缺少环境变量 {name}"))
}

fn add_transaction(ledger: &Ledger, note: &str) {
    ledger
        .create_transaction(NewTransaction {
            book_id: seed::DEFAULT_BOOK_ID.to_string(),
            kind: EntryKind::Expense,
            category_id: "expense_food".to_string(),
            account_id: None,
            amount_cents: 1234,
            note: note.to_string(),
            day: "2025-09-08".to_string(),
            month: "2025-09".to_string(),
            occurred_at_ms: 1,
        })
        .expect("create transaction");
}

#[test]
#[ignore = "需要真实仓库与 PAT（见文件头注释）"]
fn live_backup_restore_merge_and_cleanup() {
    let repo_url = env("YAMDS_CLOUD_TEST_REPO");
    let username = env("YAMDS_CLOUD_TEST_USER");
    let token = env("YAMDS_CLOUD_TEST_TOKEN");
    let branch = format!("live-test-{}", std::process::id());

    let transport = zhibook::http_transport::build_http_transport();

    // 分支清理守卫：无论测试成功还是中途 panic，都尝试删掉测试分支。
    struct BranchCleanup<'a> {
        client: tk_cloud::GitClient<'a, dyn tk_cloud::HttpTransport>,
        branch: String,
    }
    impl Drop for BranchCleanup<'_> {
        fn drop(&mut self) {
            if let Err(error) = self.client.delete_branch(&self.branch) {
                eprintln!("清理测试分支 {} 失败：{error}", self.branch);
            }
        }
    }
    let remote = tk_cloud::git::RepoUrl::parse(&repo_url).expect("url");
    let _cleanup = BranchCleanup {
        client: tk_cloud::GitClient::new(
            transport.as_ref(),
            remote,
            tk_cloud::GitCredentials::new(&username, &token),
        ),
        branch: branch.clone(),
    };

    // 设备 A：配置 → 生成密钥 → 首次备份
    let dir_a = tempfile::TempDir::new().expect("dir a");
    let ledger_a = Ledger::open(dir_a.path()).expect("ledger a");
    add_transaction(&ledger_a, "来自设备 A");
    let service_a = tk_cloud::service::CloudService::new(transport.clone(), dir_a.path());
    let info = service_a
        .save_config(&repo_url, &username, &token, &branch)
        .expect("save config");
    assert!(!info.branch_exists, "测试分支应不存在或已被清理");
    let created = service_a.create_key(None).expect("create key");

    let first = service_a.run_backup(&ledger_a).expect("first backup");
    assert!(first.pushed, "{first:?}");
    println!(
        "A 首次备份：commit={:?} files={} bytes={}",
        first.commit, first.file_count, first.uploaded_bytes
    );

    // 设备 A 再备份一次：内容没变 → 不产生新提交
    let second = service_a.run_backup(&ledger_a).expect("second backup");
    assert!(!second.pushed, "内容未变化时不应新增提交：{second:?}");

    // 设备 B：换机恢复（只带恢复密钥，不共享 config）
    let dir_b = tempfile::TempDir::new().expect("dir b");
    let ledger_b = Ledger::open(dir_b.path()).expect("ledger b");
    let service_b = tk_cloud::service::CloudService::new(transport.clone(), dir_b.path());
    service_b
        .save_config(&repo_url, &username, &token, &branch)
        .expect("save config b");
    let locked = service_b.preview_restore(None).expect("locked preview");
    assert!(locked.needs_key, "新设备应要求输入恢复密钥：{locked:?}");
    let key_input = tk_domain::CloudKeyInput {
        kind: "recovery".to_string(),
        value: created.recovery_key.clone(),
    };
    let preview = service_b
        .preview_restore(Some(&key_input))
        .expect("preview with recovery key");
    assert_eq!(preview.counts.expect("counts").transactions, 1);
    let restored = service_b
        .run_restore(Some(&key_input), &ledger_b)
        .expect("restore");
    assert_eq!(restored.counts.transactions, 1);
    assert!(restored.key_imported, "换机应导入云端密钥");

    // 设备 B 记一笔并备份：远端已前进 → 自动合并后再推
    add_transaction(&ledger_b, "来自设备 B");
    let backup_b = service_b.run_backup(&ledger_b).expect("backup b");
    assert!(backup_b.pushed, "{backup_b:?}");
    println!("B 备份：commit={:?} merged={:?}", backup_b.commit, backup_b.merged);

    // 设备 A 再记一笔并备份：应合并 B 的提交且不丢数据
    add_transaction(&ledger_a, "来自设备 A 的第二笔");
    let backup_a = service_a.run_backup(&ledger_a).expect("backup a");
    assert!(backup_a.pushed, "{backup_a:?}");
    let merged = backup_a.merged.expect("A 应合并 B 的提交");
    assert_eq!(merged.transactions.added, 1, "应合并 B 新增的 1 笔：{merged:?}");
    let list = ledger_a
        .list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-09-08")
        .expect("list a");
    assert_eq!(list.len(), 3, "合并后 A 应有 3 笔账单");

    // 设备 B 拉取合并后的状态：三笔都在
    let input_b = tk_domain::CloudKeyInput {
        kind: "recovery".to_string(),
        value: created.recovery_key.clone(),
    };
    let preview_b = service_b
        .preview_restore(Some(&input_b))
        .expect("preview b");
    assert_eq!(preview_b.counts.expect("counts").transactions, 3);

    println!("端到端验证完成（测试分支将在作用域结束时清理）");
}
