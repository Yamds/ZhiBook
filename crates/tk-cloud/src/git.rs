//! Git 对象模型（blob / tree / commit）、仓库 URL 解析与 refs 广告解析。
//!
//! 只覆盖本项目需要的最小面：不用 delta、不打 tag、不做 history 遍历。

use std::collections::BTreeMap;

use sha1::{Digest, Sha1};

use crate::{CloudError, CloudResult};

/// 计算 Git 对象 id：`<type> <len>\0<payload>` 的 SHA-1 十六进制。
pub fn object_id(kind: &str, data: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("{kind} {}\0", data.len()).as_bytes());
    hasher.update(data);
    hex(&hasher.finalize())
}

pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub fn unhex(text: &str) -> CloudResult<Vec<u8>> {
    let text = text.trim();
    if text.len() % 2 != 0 {
        return Err(CloudError::Protocol(format!("不是合法的对象 id：{text}")));
    }
    let mut out = Vec::with_capacity(text.len() / 2);
    let chars: Vec<char> = text.chars().collect();
    for pair in chars.chunks(2) {
        let value = u8::from_str_radix(&format!("{}{}", pair[0], pair[1]), 16)
            .map_err(|_| CloudError::Protocol(format!("不是合法的对象 id：{text}")))?;
        out.push(value);
    }
    Ok(out)
}

/// 空对象 id（40 个 0），用于「创建新分支」的 push 命令。
pub const ZERO_ID: &str = "0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// tree / commit
// ---------------------------------------------------------------------------

/// tree 条目。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    /// `100644`（普通文件）/ `100755` / `40000`（子树）/ `120000`（符号链接）。
    pub mode: String,
    pub name: String,
    pub id: String,
}

/// tree 的二进制内容（条目按 git 规则排序：子树名按 `name/` 参与比较）。
pub fn tree_bytes(entries: &[TreeEntry]) -> Vec<u8> {
    let mut ordered: Vec<&TreeEntry> = entries.iter().collect();
    ordered.sort_by_cached_key(|entry| sort_key(entry));
    let mut out = Vec::new();
    for entry in ordered {
        out.extend_from_slice(format!("{} {}\0", entry.mode, entry.name).as_bytes());
        let raw = unhex(&entry.id).unwrap_or_default();
        out.extend_from_slice(&raw);
    }
    out
}

fn sort_key(entry: &TreeEntry) -> Vec<u8> {
    let mut key = entry.name.as_bytes().to_vec();
    if entry.mode == "40000" {
        key.push(b'/');
    }
    key
}

/// commit 文本内容（固定作者与 `+0000` 时区，提交信息脱敏由调用方保证）。
pub fn commit_bytes(
    tree: &str,
    parents: &[String],
    author: &str,
    timestamp: i64,
    message: &str,
) -> Vec<u8> {
    let mut out = String::new();
    out.push_str(&format!("tree {tree}\n"));
    for parent in parents {
        out.push_str(&format!("parent {parent}\n"));
    }
    out.push_str(&format!("author {author} {timestamp} +0000\n"));
    out.push_str(&format!("committer {author} {timestamp} +0000\n"));
    out.push('\n');
    out.push_str(message);
    if !message.ends_with('\n') {
        out.push('\n');
    }
    out.into_bytes()
}

// ---------------------------------------------------------------------------
// 仓库 URL
// ---------------------------------------------------------------------------

/// 解析后的仓库 URL（只支持 http / https）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoUrl {
    pub scheme: String,
    pub host: String,
    pub port: Option<u16>,
    /// `/owner/repo`（已去掉末尾 `/` 与 `.git`）。
    pub path: String,
}

impl RepoUrl {
    pub fn parse(input: &str) -> CloudResult<Self> {
        let trimmed = input.trim().trim_end_matches('/');
        let (scheme, rest) = trimmed
            .split_once("://")
            .ok_or_else(|| CloudError::InvalidUrl("仓库地址必须以 http:// 或 https:// 开头".to_string()))?;
        let scheme = scheme.to_ascii_lowercase();
        if scheme != "http" && scheme != "https" {
            return Err(CloudError::InvalidUrl(
                "只支持 http / https 的 Git 仓库地址".to_string(),
            ));
        }
        let (authority, path) = rest.split_once('/').ok_or_else(|| {
            CloudError::InvalidUrl("仓库地址缺少 owner/repo 路径".to_string())
        })?;
        let (host, port) = match authority.split_once(':') {
            Some((host, port)) => {
                let port = port
                    .parse::<u16>()
                    .map_err(|_| CloudError::InvalidUrl("端口不是合法数字".to_string()))?;
                (host.to_string(), Some(port))
            }
            None => (authority.to_string(), None),
        };
        if host.is_empty() {
            return Err(CloudError::InvalidUrl("仓库地址缺少主机名".to_string()));
        }
        let path = path.trim_end_matches('/');
        let path = path.strip_suffix(".git").unwrap_or(path);
        let segments: Vec<&str> = path.split('/').filter(|item| !item.is_empty()).collect();
        if segments.len() < 2 {
            return Err(CloudError::InvalidUrl(
                "仓库地址需要包含 owner 与仓库名".to_string(),
            ));
        }
        Ok(Self {
            scheme,
            host,
            port,
            path: format!("/{}", segments.join("/")),
        })
    }

    pub fn authority(&self) -> String {
        match self.port {
            Some(port) => format!("{}:{port}", self.host),
            None => self.host.clone(),
        }
    }

    /// 站点根（raw / API 用）。
    pub fn base(&self) -> String {
        format!("{}://{}", self.scheme, self.authority())
    }

    /// smart HTTP 端点根（带 `.git`）。
    pub fn git_endpoint(&self) -> String {
        format!("{}{}.git", self.base(), self.path)
    }

    pub fn owner(&self) -> Option<&str> {
        self.path.trim_start_matches('/').split('/').next()
    }

    pub fn repo(&self) -> Option<&str> {
        self.path.trim_start_matches('/').split('/').nth(1)
    }

    /// 站点类型（raw 下载规则不同）。主机名带 github/gitlab 的按对应平台处理，其余按 Gitea 风格。
    pub fn server_kind(&self) -> ServerKind {
        let host = self.host.to_ascii_lowercase();
        if host.contains("github") {
            ServerKind::GitHub
        } else if host.contains("gitlab") {
            ServerKind::GitLab
        } else {
            ServerKind::Gitea
        }
    }
}

/// 站点类型：决定 raw 下载的 URL 规则与鉴权头。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Gitea,
    GitHub,
    GitLab,
}

impl ServerKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Gitea => "gitea",
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
        }
    }
}

// ---------------------------------------------------------------------------
// refs 广告
// ---------------------------------------------------------------------------

/// `GET /info/refs` 的解析结果。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RefAdvertisement {
    pub refs: BTreeMap<String, String>,
    pub capabilities: Vec<String>,
    pub symrefs: BTreeMap<String, String>,
}

impl RefAdvertisement {
    pub fn head_of(&self, branch: &str) -> Option<&str> {
        self.refs
            .get(&format!("refs/heads/{branch}"))
            .map(|item| item.as_str())
    }

    pub fn has_branch(&self, branch: &str) -> bool {
        self.refs.contains_key(&format!("refs/heads/{branch}"))
    }
}

/// 解析 `# service=...` 之后的 refs 广告行（`decode_all` 的产物）。
pub fn parse_refs(lines: &[Option<Vec<u8>>]) -> CloudResult<RefAdvertisement> {
    let mut result = RefAdvertisement::default();
    for line in lines.iter().flatten() {
        let text = std::str::from_utf8(line)
            .map_err(|_| CloudError::Protocol("refs 广告不是 UTF-8".to_string()))?;
        let text = text.trim_end_matches('\n');
        if text.is_empty() || text.starts_with('#') {
            continue;
        }
        if text == "version 2" || text.starts_with("version ") {
            return Err(CloudError::Protocol(
                "服务器返回了协议 v2，当前客户端只支持 v0/v1".to_string(),
            ));
        }
        let (head, tail) = match text.split_once('\0') {
            Some((head, tail)) => (head, Some(tail)),
            None => (text, None),
        };
        let mut parts = head.splitn(2, ' ');
        let id = parts.next().unwrap_or_default();
        let name = parts.next().unwrap_or_default();
        if id.len() != 40 || name.is_empty() {
            continue;
        }
        if let Some(tail) = tail {
            for capability in tail.split(' ') {
                if let Some((key, value)) = capability.split_once('=') {
                    if key == "symref" {
                        if let Some((from, to)) = value.split_once(':') {
                            result.symrefs.insert(from.to_string(), to.to_string());
                        }
                    }
                }
                result.capabilities.push(capability.to_string());
            }
        }
        result.refs.insert(name.to_string(), id.to_string());
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// 用系统 git 校验 pack（开发期测试）
// ---------------------------------------------------------------------------

#[cfg(test)]
#[derive(Debug)]
pub enum GitVerifyError {
    GitMissing,
    Failed(String),
}

#[cfg(test)]
impl std::fmt::Display for GitVerifyError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GitMissing => write!(formatter, "找不到系统 git"),
            Self::Failed(message) => write!(formatter, "{message}"),
        }
    }
}

/// 把 pack 交给系统 git 解包，并逐对象核对内容（测试用；没有 git 时返回 `GitMissing`）。
#[cfg(test)]
pub fn verify_pack_with_git(
    pack: &[u8],
    expected: &[(&str, &[u8])],
) -> Result<(), GitVerifyError> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let dir = tempfile::TempDir::new().map_err(|error| GitVerifyError::Failed(error.to_string()))?;
    let repo = dir.path();
    let init = Command::new("git")
        .args(["init", "-q", "--bare"])
        .current_dir(repo)
        .output();
    let init = match init {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(GitVerifyError::GitMissing);
        }
        Err(error) => return Err(GitVerifyError::Failed(error.to_string())),
    };
    if !init.status.success() {
        return Err(GitVerifyError::Failed(
            String::from_utf8_lossy(&init.stderr).to_string(),
        ));
    }

    let mut child = Command::new("git")
        .args(["unpack-objects", "-r"])
        .current_dir(repo)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitVerifyError::GitMissing
            } else {
                GitVerifyError::Failed(error.to_string())
            }
        })?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| GitVerifyError::Failed("无法写入 git stdin".to_string()))?
        .write_all(pack)
        .map_err(|error| GitVerifyError::Failed(error.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|error| GitVerifyError::Failed(error.to_string()))?;
    if !output.status.success() {
        return Err(GitVerifyError::Failed(format!(
            "git unpack-objects 失败：{}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    for (kind, data) in expected {
        let id = object_id(kind, data);
        let output = Command::new("git")
            .args(["cat-file", kind, &id])
            .current_dir(repo)
            .output()
            .map_err(|error| GitVerifyError::Failed(error.to_string()))?;
        if !output.status.success() {
            return Err(GitVerifyError::Failed(format!(
                "对象 {id}（{kind}）没有出现在 pack 里：{}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        if output.stdout != *data {
            return Err(GitVerifyError::Failed(format!("对象 {id} 内容不一致")));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 `git hash-object` 的已知结果对齐（空 blob 与 "hello\n"）。
    #[test]
    fn object_id_matches_git_known_values() {
        assert_eq!(object_id("blob", b""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
        assert_eq!(
            object_id("blob", b"hello\n"),
            "ce013625030ba8dba906f756967f9e9ca394464a"
        );
    }

    #[test]
    fn tree_bytes_sorts_entries_like_git() {
        let entries = vec![
            TreeEntry {
                mode: "100644".to_string(),
                name: "b.txt".to_string(),
                id: object_id("blob", b"b"),
            },
            TreeEntry {
                mode: "40000".to_string(),
                name: "a".to_string(),
                id: object_id("tree", b""),
            },
            TreeEntry {
                mode: "100644".to_string(),
                name: "a.txt".to_string(),
                id: object_id("blob", b"a"),
            },
        ];
        let bytes = tree_bytes(&entries);
        let text = String::from_utf8_lossy(&bytes);
        let a_file = text.find("100644 a.txt").expect("a.txt");
        let a_dir = text.find("40000 a").expect("a dir");
        let b_file = text.find("100644 b.txt").expect("b.txt");
        // git 规则：目录名按 `a/` 参与比较 → a.txt（'.' < '/'）在 a/ 之前
        assert!(a_file < a_dir && a_dir < b_file, "{text}");
    }

    #[test]
    fn repo_url_parses_and_normalizes() {
        let url = RepoUrl::parse("https://git.yamds.cafe/Yamds/ZhiBook-Repo.git").expect("parse");
        assert_eq!(url.scheme, "https");
        assert_eq!(url.host, "git.yamds.cafe");
        assert_eq!(url.path, "/Yamds/ZhiBook-Repo");
        assert_eq!(url.owner(), Some("Yamds"));
        assert_eq!(url.repo(), Some("ZhiBook-Repo"));
        assert_eq!(
            url.git_endpoint(),
            "https://git.yamds.cafe/Yamds/ZhiBook-Repo.git"
        );
        assert_eq!(url.server_kind(), ServerKind::Gitea);

        let gitlab = RepoUrl::parse("http://gitlab.example.com:8080/group/sub/repo/").expect("parse");
        assert_eq!(gitlab.port, Some(8080));
        assert_eq!(gitlab.path, "/group/sub/repo");
        assert_eq!(gitlab.server_kind(), ServerKind::GitLab);
        assert!(RepoUrl::parse("git@github.com:Yamds/x.git").is_err());
        assert!(RepoUrl::parse("https://github.com/only-one").is_err());
    }

    #[test]
    fn parse_refs_reads_capabilities_and_symrefs() {
        let lines = vec![
            Some(b"# service=git-receive-pack\n".to_vec()),
            Some(
                b"abcdef0123456789abcdef0123456789abcdef01 refs/heads/backup\0report-status side-band-64k symref=HEAD:refs/heads/backup agent=git/2.54\n"
                    .to_vec(),
            ),
            None,
        ];
        let ad = parse_refs(&lines).expect("parse");
        assert_eq!(
            ad.head_of("backup"),
            Some("abcdef0123456789abcdef0123456789abcdef01")
        );
        assert!(ad.capabilities.iter().any(|item| item == "report-status"));
        assert_eq!(
            ad.symrefs.get("HEAD").map(String::as_str),
            Some("refs/heads/backup")
        );
    }
}
