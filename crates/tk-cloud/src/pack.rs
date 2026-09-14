//! Git packfile 生成（v2，无 delta）。
//!
//! 结构与 `git index-pack` 兼容：`PACK` 头 + 版本号 + 对象数 + 每个对象（varint 头 +
//! zlib 数据）+ 全文件 SHA-1 尾。只写完整对象，不做 delta / thin pack——对象都是自己
//! 生成的，压缩交给 zlib 即可。

use std::io::Write;

use flate2::Compression;
use flate2::write::ZlibEncoder;
use sha1::{Digest, Sha1};

use crate::{CloudError, CloudResult};

/// pack 里的对象类型编号（Git 协议固定值）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PackObjectKind {
    Commit = 1,
    Tree = 2,
    Blob = 3,
    Tag = 4,
}

/// 一个待打包对象。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackObject {
    pub kind: PackObjectKind,
    pub data: Vec<u8>,
}

/// 生成 packfile 字节。
pub fn write_pack(objects: &[PackObject]) -> CloudResult<Vec<u8>> {
    let mut out = Vec::with_capacity(1024 + objects.iter().map(|item| item.data.len()).sum::<usize>());
    out.extend_from_slice(b"PACK");
    out.extend_from_slice(&2u32.to_be_bytes());
    let count = u32::try_from(objects.len())
        .map_err(|_| CloudError::Protocol("对象数量超出 pack 上限".to_string()))?;
    out.extend_from_slice(&count.to_be_bytes());

    // 同类对象按内容排序，让相同输入产生相同 pack（便于测试与缓存）。
    let mut ordered: Vec<&PackObject> = objects.iter().collect();
    ordered.sort_by(|left, right| {
        (left.kind, &left.data).cmp(&(right.kind, &right.data))
    });
    for object in ordered {
        write_object_header(&mut out, object.kind, object.data.len());
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&object.data)
            .map_err(CloudError::Io)?;
        let compressed = encoder.finish().map_err(CloudError::Io)?;
        out.extend_from_slice(&compressed);
    }

    let mut hasher = Sha1::new();
    hasher.update(&out);
    let digest = hasher.finalize();
    out.extend_from_slice(&digest);
    Ok(out)
}

/// varint 头：首字节低 4 位是 size 低位，后续字节按 7 位续接；高 4 位是类型。
fn write_object_header(out: &mut Vec<u8>, kind: PackObjectKind, size: usize) {
    let mut byte = ((kind as u8) << 4) | ((size & 0x0f) as u8);
    let mut remaining = size >> 4;
    while remaining > 0 {
        out.push(byte | 0x80);
        byte = (remaining & 0x7f) as u8;
        remaining >>= 7;
    }
    out.push(byte);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git;

    /// 用系统 git 验证 pack 合法：解包后内容与对象 id 都能对上。
    #[test]
    fn pack_is_accepted_by_git_index_pack() {
        let blob_a = b"hello pack\n".to_vec();
        let blob_b = vec![0u8; 100_000];
        let tree_entries = vec![
            git::TreeEntry {
                mode: "100644".to_string(),
                name: "a.txt".to_string(),
                id: git::object_id("blob", &blob_a),
            },
            git::TreeEntry {
                mode: "100644".to_string(),
                name: "b.bin".to_string(),
                id: git::object_id("blob", &blob_b),
            },
        ];
        let tree_data = git::tree_bytes(&tree_entries);
        let tree_id = git::object_id("tree", &tree_data);
        let commit_data = git::commit_bytes(&tree_id, &[], "Test <test@example.com>", 1_700_000_000, "backup\n");
        let commit_id = git::object_id("commit", &commit_data);

        let pack = write_pack(&[
            PackObject {
                kind: PackObjectKind::Blob,
                data: blob_a.clone(),
            },
            PackObject {
                kind: PackObjectKind::Blob,
                data: blob_b.clone(),
            },
            PackObject {
                kind: PackObjectKind::Tree,
                data: tree_data.clone(),
            },
            PackObject {
                kind: PackObjectKind::Commit,
                data: commit_data.clone(),
            },
        ])
        .expect("pack");

        let verify = git::verify_pack_with_git(&pack, &[
            ("blob", &blob_a),
            ("blob", &blob_b),
            ("tree", &tree_data),
            ("commit", &commit_data),
        ]);
        match verify {
            Ok(()) => {}
            Err(git::GitVerifyError::GitMissing) => {
                // 没有系统 git 时至少校验尾部 SHA-1 与对象数。
                assert_eq!(&pack[..4], b"PACK");
                assert_eq!(u32::from_be_bytes(pack[4..8].try_into().expect("count")), 4);
                let body = &pack[..pack.len() - 20];
                let mut hasher = Sha1::new();
                hasher.update(body);
                assert_eq!(hasher.finalize()[..], pack[pack.len() - 20..]);
            }
            Err(error) => panic!("pack 被 git 拒绝：{error}"),
        }
        assert_eq!(commit_id.len(), 40);
    }
}
