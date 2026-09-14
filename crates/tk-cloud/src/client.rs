//! Git smart HTTP 客户端（只覆盖本项目用到的操作）。
//!
//! - refs 广告：`GET {repo}.git/info/refs?service=git-{upload,receive}-pack`
//! - 推送：`POST {repo}.git/git-receive-pack`（pkt-line 命令 + pack）
//! - 恢复：各平台 raw 下载（不解析 pack delta）
//!
//! 认证统一为 HTTP Basic（账号 + PAT；GitHub 惯例用户名 `x-access-token`）；
//! GitHub 的 raw 走 API（私有仓库的 raw.githubusercontent 不接受 Token）。

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::git::{RefAdvertisement, RepoUrl, ServerKind, ZERO_ID};
use crate::pktline;
use crate::transport::{HttpMethod, HttpRequest, HttpTransport};
use crate::{CloudError, CloudResult};

/// Git 服务类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GitService {
    UploadPack,
    ReceivePack,
}

impl GitService {
    fn slug(self) -> &'static str {
        match self {
            Self::UploadPack => "git-upload-pack",
            Self::ReceivePack => "git-receive-pack",
        }
    }
}

/// 账号 + PAT。
#[derive(Debug, Clone)]
pub struct GitCredentials {
    pub username: String,
    pub token: String,
}

impl GitCredentials {
    pub fn new(username: impl Into<String>, token: impl Into<String>) -> Self {
        Self {
            username: username.into(),
            token: token.into(),
        }
    }

    /// Basic 认证头（用户名 + Token 作为密码）。
    pub fn basic_header(&self) -> String {
        let username = if self.username.trim().is_empty() {
            "x-access-token"
        } else {
            self.username.trim()
        };
        format!("Basic {}", BASE64.encode(format!("{username}:{}", self.token)))
    }
}

/// 推送结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushReport {
    pub unpack_ok: bool,
    pub ref_ok: bool,
    pub detail: String,
}

/// 一个远端仓库（绑定传输实现与凭据）。
pub struct GitClient<'a, T: HttpTransport + ?Sized> {
    pub transport: &'a T,
    pub remote: RepoUrl,
    pub credentials: GitCredentials,
}

impl<'a, T: HttpTransport + ?Sized> GitClient<'a, T> {
    pub fn new(transport: &'a T, remote: RepoUrl, credentials: GitCredentials) -> Self {
        Self {
            transport,
            remote,
            credentials,
        }
    }

    /// 读取 refs 广告（同时验证网络与凭据）。
    pub fn fetch_refs(&self, service: GitService) -> CloudResult<RefAdvertisement> {
        let url = format!(
            "{}/info/refs?service={}",
            self.remote.git_endpoint(),
            service.slug()
        );
        let request = HttpRequest::get(url)
            .header("Accept", format!("application/x-{}-advertisement", service.slug()))
            .header("Authorization", self.credentials.basic_header())
            .header("User-Agent", "zhizhang/0.1")
            .timeout(30);
        let response = self.transport.execute(&request)?;
        self.expect_status(&response, "读取 refs")?;
        let lines = pktline::decode_all(&response.body)?;
        crate::git::parse_refs(&lines)
    }

    /// 推送：`old` → `new` 更新 `refs/heads/<branch>`，随后写入 pack。
    ///
    /// 新建分支时 `old` 传 [`ZERO_ID`]。
    pub fn push(&self, branch: &str, old: &str, new: &str, pack: &[u8]) -> CloudResult<PushReport> {
        let ref_name = format!("refs/heads/{branch}");
        let mut body = pktline::encode(&format!(
            "{old} {new} {ref_name}\0report-status agent=zhizhang/0.1\n"
        ));
        body.extend_from_slice(pktline::FLUSH);
        body.extend_from_slice(pack);

        let url = format!("{}/git-receive-pack", self.remote.git_endpoint());
        let request = HttpRequest::post(url, body)
            .header("Content-Type", "application/x-git-receive-pack-request")
            .header("Accept", "application/x-git-receive-pack-result")
            .header("Authorization", self.credentials.basic_header())
            .header("User-Agent", "zhizhang/0.1")
            .timeout(180);
        let response = self.transport.execute(&request)?;
        self.expect_status(&response, "推送")?;

        let lines = pktline::decode_all(&response.body)?;
        let mut report = PushReport {
            unpack_ok: false,
            ref_ok: false,
            detail: String::new(),
        };
        for line in lines.iter().flatten() {
            let text = String::from_utf8_lossy(line);
            let text = text.trim_end_matches('\n');
            if text.starts_with("unpack ok") {
                report.unpack_ok = true;
            } else if text.starts_with("unpack ") {
                report.detail = text.to_string();
            } else if text == format!("ok {ref_name}") {
                report.ref_ok = true;
            } else if let Some(reason) = text.strip_prefix(&format!("ng {ref_name} ")) {
                report.detail = reason.to_string();
            }
        }
        if !report.unpack_ok {
            return Err(CloudError::PushRejected(if report.detail.is_empty() {
                "服务器未能解包".to_string()
            } else {
                report.detail.clone()
            }));
        }
        if !report.ref_ok {
            return Err(CloudError::PushRejected(if report.detail.is_empty() {
                format!("{ref_name} 被拒绝（可能是非快进推送）")
            } else {
                report.detail.clone()
            }));
        }
        Ok(report)
    }

    /// 删除分支（集成测试清理用）。
    pub fn delete_branch(&self, branch: &str) -> CloudResult<()> {
        let report = self.fetch_refs(GitService::ReceivePack)?;
        let Some(old) = report.head_of(branch).map(|item| item.to_string()) else {
            return Ok(());
        };
        let ref_name = format!("refs/heads/{branch}");
        let mut body = pktline::encode(&format!(
            "{old} {ZERO_ID} {ref_name}\0report-status agent=zhizhang/0.1\n"
        ));
        body.extend_from_slice(pktline::FLUSH);
        let url = format!("{}/git-receive-pack", self.remote.git_endpoint());
        let request = HttpRequest::post(url, body)
            .header("Content-Type", "application/x-git-receive-pack-request")
            .header("Accept", "application/x-git-receive-pack-result")
            .header("Authorization", self.credentials.basic_header())
            .timeout(60);
        let response = self.transport.execute(&request)?;
        self.expect_status(&response, "删除分支")?;
        let lines = pktline::decode_all(&response.body)?;
        let mut unpack_ok = false;
        let mut ref_ok = false;
        let mut detail = String::new();
        for line in lines.iter().flatten() {
            let text = String::from_utf8_lossy(line);
            let text = text.trim_end_matches('\n');
            if text.starts_with("unpack ok") {
                unpack_ok = true;
            } else if text == format!("ok {ref_name}") {
                ref_ok = true;
            } else if text.starts_with("ng ") {
                detail = text.to_string();
            }
        }
        if !(unpack_ok && ref_ok) {
            return Err(CloudError::PushRejected(if detail.is_empty() {
                "服务器未确认删除分支".to_string()
            } else {
                detail
            }));
        }
        Ok(())
    }

    /// 从分支 raw 下载单个文件（恢复路径）。
    pub fn download_raw(&self, branch: &str, path: &str) -> CloudResult<Vec<u8>> {
        let kind = self.remote.server_kind();
        let (url, headers) = match kind {
            ServerKind::GitHub => {
                let owner = self
                    .remote
                    .owner()
                    .ok_or_else(|| CloudError::InvalidUrl("缺少 owner".to_string()))?;
                let repo = self
                    .remote
                    .repo()
                    .ok_or_else(|| CloudError::InvalidUrl("缺少仓库名".to_string()))?;
                (
                    format!(
                        "https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
                    ),
                    vec![
                        ("Authorization".to_string(), format!("Bearer {}", self.credentials.token)),
                        (
                            "Accept".to_string(),
                            "application/vnd.github.raw".to_string(),
                        ),
                        (
                            "X-GitHub-Api-Version".to_string(),
                            "2022-11-28".to_string(),
                        ),
                    ],
                )
            }
            ServerKind::GitLab => (
                format!("{}{}/-/raw/{branch}/{path}", self.remote.base(), self.remote.path),
                vec![(
                    "PRIVATE-TOKEN".to_string(),
                    self.credentials.token.clone(),
                )],
            ),
            ServerKind::Gitea => (
                format!(
                    "{}{}/raw/branch/{branch}/{path}",
                    self.remote.base(),
                    self.remote.path
                ),
                vec![(
                    "Authorization".to_string(),
                    self.credentials.basic_header(),
                )],
            ),
        };
        let mut request = HttpRequest::get(url).timeout(180);
        for (name, value) in headers {
            request = request.header(name, value);
        }
        let response = self.transport.execute(&request)?;
        self.expect_status(&response, "下载文件")?;
        Ok(response.body)
    }

    fn expect_status(&self, response: &crate::transport::HttpResponse, action: &str) -> CloudResult<()> {
        match response.status {
            200..=299 => Ok(()),
            401 | 403 => Err(CloudError::Auth),
            404 => Err(CloudError::NotFound),
            status => Err(CloudError::Http(format!(
                "{action}失败：HTTP {status}"
            ))),
        }
    }
}

/// POST 的 body 也可能为空；保留给将来的 GET 流式实现。
#[allow(dead_code)]
fn _assert_methods() {
    let _ = HttpMethod::Get;
    let _ = HttpMethod::Post;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::MockTransport;

    fn gitea() -> RepoUrl {
        RepoUrl::parse("https://git.example.com/Yamds/Book.git").expect("url")
    }

    #[test]
    fn fetch_refs_sends_basic_auth_and_parses_advertisement() {
        let transport = MockTransport::default();
        let body = {
            let mut body = pktline::encode("# service=git-receive-pack\n");
            body.extend_from_slice(pktline::FLUSH);
            body.extend_from_slice(&pktline::encode(
                "1111111111111111111111111111111111111111 refs/heads/backup\0report-status\n",
            ));
            body.extend_from_slice(pktline::FLUSH);
            body
        };
        transport.push(
            "/info/refs?service=git-receive-pack",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body,
            },
        );
        let client = GitClient::new(
            &transport,
            gitea(),
            GitCredentials::new("Yamds", "token-123"),
        );
        let refs = client.fetch_refs(GitService::ReceivePack).expect("refs");
        assert_eq!(
            refs.head_of("backup"),
            Some("1111111111111111111111111111111111111111")
        );
        let requests = transport.requests.lock().expect("requests");
        assert_eq!(requests.len(), 1);
        let auth = requests[0]
            .headers
            .iter()
            .find(|(key, _)| key == "Authorization")
            .map(|(_, value)| value.clone())
            .expect("auth header");
        let decoded = BASE64
            .decode(auth.trim_start_matches("Basic "))
            .expect("base64");
        assert_eq!(String::from_utf8_lossy(&decoded), "Yamds:token-123");
    }

    #[test]
    fn push_builds_receive_pack_body_and_reads_report() {
        let transport = MockTransport::default();
        transport.push(
            "/git-receive-pack",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body: {
                    let mut body = pktline::encode("unpack ok\n");
                    body.extend_from_slice(&pktline::encode("ok refs/heads/backup\n"));
                    body.extend_from_slice(pktline::FLUSH);
                    body
                },
            },
        );
        let client = GitClient::new(&transport, gitea(), GitCredentials::new("Yamds", "t"));
        let report = client
            .push("backup", ZERO_ID, "2222222222222222222222222222222222222222", b"PACKDATA")
            .expect("push");
        assert!(report.unpack_ok && report.ref_ok);

        let requests = transport.requests.lock().expect("requests");
        let body = requests[0].body.as_ref().expect("body");
        let text = String::from_utf8_lossy(body);
        assert!(text.contains("refs/heads/backup\0report-status"), "{text}");
        assert!(text.ends_with("PACKDATA"), "{text}");
    }

    #[test]
    fn push_failure_reports_reason() {
        let transport = MockTransport::default();
        transport.push(
            "/git-receive-pack",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body: {
                    let mut body = pktline::encode("unpack ok\n");
                    body.extend_from_slice(&pktline::encode(
                        "ng refs/heads/backup non-fast-forward\n",
                    ));
                    body.extend_from_slice(pktline::FLUSH);
                    body
                },
            },
        );
        let client = GitClient::new(&transport, gitea(), GitCredentials::new("Yamds", "t"));
        let error = client
            .push("backup", "3333333333333333333333333333333333333333", "4444444444444444444444444444444444444444", b"x")
            .expect_err("reject");
        assert!(matches!(error, CloudError::PushRejected(_)), "{error:?}");
    }

    #[test]
    fn raw_download_uses_platform_specific_urls() {
        // GitHub：API + Bearer
        let transport = MockTransport::default();
        transport.push(
            "api.github.com/repos/Yamds/Book/contents/backup/manifest.json",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body: b"{\"ok\":true}".to_vec(),
            },
        );
        let github = RepoUrl::parse("https://github.com/Yamds/Book.git").expect("url");
        let client = GitClient::new(&transport, github, GitCredentials::new("", "gh-token"));
        let bytes = client.download_raw("backup", "backup/manifest.json").expect("raw");
        assert_eq!(bytes, b"{\"ok\":true}");
        {
            let requests = transport.requests.lock().expect("requests");
            assert_eq!(
                requests[0].headers.iter().find(|(key, _)| key == "Authorization").map(|(_, value)| value.as_str()),
                Some("Bearer gh-token")
            );
        }

        // Gitea：/raw/branch/ + Basic
        let transport = MockTransport::default();
        transport.push(
            "/raw/branch/backup/backup/data.enc",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body: vec![1, 2, 3],
            },
        );
        let client = GitClient::new(&transport, gitea(), GitCredentials::new("Yamds", "t"));
        assert_eq!(
            client.download_raw("backup", "backup/data.enc").expect("raw"),
            vec![1, 2, 3]
        );

        // GitLab：/-/raw/ + PRIVATE-TOKEN
        let transport = MockTransport::default();
        transport.push(
            "gitlab.com/g/R/-/raw/backup/backup/manifest.json",
            crate::transport::HttpResponse {
                status: 200,
                headers: vec![],
                body: b"raw".to_vec(),
            },
        );
        let gitlab = RepoUrl::parse("https://gitlab.com/g/R.git").expect("url");
        let client = GitClient::new(&transport, gitlab, GitCredentials::new("g", "gl-token"));
        assert_eq!(
            client.download_raw("backup", "backup/manifest.json").expect("raw"),
            b"raw"
        );
        {
            let requests = transport.requests.lock().expect("requests");
            assert_eq!(
                requests[0]
                    .headers
                    .iter()
                    .find(|(key, _)| key == "PRIVATE-TOKEN")
                    .map(|(_, value)| value.as_str()),
                Some("gl-token")
            );
        }
    }

    #[test]
    fn auth_and_not_found_are_classified() {
        let transport = MockTransport::default();
        transport.push(
            "/info/refs",
            crate::transport::HttpResponse {
                status: 401,
                headers: vec![],
                body: vec![],
            },
        );
        let client = GitClient::new(&transport, gitea(), GitCredentials::new("u", "t"));
        assert!(matches!(
            client.fetch_refs(GitService::UploadPack),
            Err(CloudError::Auth)
        ));

        let transport = MockTransport::default();
        transport.push(
            "/info/refs",
            crate::transport::HttpResponse {
                status: 404,
                headers: vec![],
                body: vec![],
            },
        );
        let client = GitClient::new(&transport, gitea(), GitCredentials::new("u", "t"));
        assert!(matches!(
            client.fetch_refs(GitService::UploadPack),
            Err(CloudError::NotFound)
        ));
    }
}
