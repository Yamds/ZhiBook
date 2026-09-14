//! 非 Android 平台的 HTTP 传输：调用系统 `curl`。
//!
//! 仅用于开发联调与集成测试（Windows 自带 curl.exe；真机走 [`super::android`] 的 JNI 桥）。
//! 不引入 Rust TLS 依赖，保证安卓产物体积不被测试路径污染。

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use tk_cloud::{CloudError, CloudResult, HttpMethod, HttpRequest, HttpResponse, HttpTransport};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub struct CurlHttpTransport;

impl HttpTransport for CurlHttpTransport {
    fn execute(&self, request: &HttpRequest) -> CloudResult<HttpResponse> {
        let workspace = Workspace::create()?;
        if let Some(body) = &request.body {
            fs::write(&workspace.body, body)?;
        }

        let timeout = if request.timeout_secs == 0 {
            120
        } else {
            request.timeout_secs
        };
        let mut command = Command::new("curl");
        command
            .arg("-sS")
            .arg("--connect-timeout")
            .arg("20")
            .arg("--max-time")
            .arg(timeout.to_string())
            .arg("-X")
            .arg(match request.method {
                HttpMethod::Get => "GET",
                HttpMethod::Post => "POST",
            })
            .arg("--dump-header")
            .arg(&workspace.headers)
            .arg("--output")
            .arg(&workspace.response)
            .arg("--write-out")
            .arg("%{http_code}");
        if request.method == HttpMethod::Get {
            // GET 允许跟随重定向（Gitea 的 raw 路径在不同版本间会有 302）。
            command.arg("-L");
        }
        for (name, value) in &request.headers {
            command.arg("--header").arg(format!("{name}: {value}"));
        }
        if request.body.is_some() {
            command
                .arg("--data-binary")
                .arg(format!("@{}", workspace.body.display()));
        }
        command.arg(&request.url);

        let output = match command.output() {
            Ok(output) => output,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(CloudError::Http(
                    "找不到系统 curl（仅桌面调试路径需要）".to_string(),
                ));
            }
            Err(error) => return Err(CloudError::Io(error)),
        };
        if !output.status.success() {
            return Err(CloudError::Http(format!(
                "curl 执行失败：{}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
        let status: u16 = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .map_err(|_| CloudError::Http("curl 没有返回 HTTP 状态码".to_string()))?;
        let headers = parse_headers(&workspace.headers)?;
        let body = fs::read(&workspace.response).unwrap_or_default();
        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }
}

/// 单次请求的临时文件（逐文件删除，目录只删一次空目录）。
struct Workspace {
    dir: PathBuf,
    body: PathBuf,
    response: PathBuf,
    headers: PathBuf,
}

impl Workspace {
    fn create() -> CloudResult<Self> {
        let unique = format!(
            "zhizhang-curl-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let dir = std::env::temp_dir().join(unique);
        fs::create_dir_all(&dir)?;
        Ok(Self {
            body: dir.join("body"),
            response: dir.join("response"),
            headers: dir.join("headers"),
            dir,
        })
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        for path in [&self.body, &self.response, &self.headers] {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
        }
        let _ = fs::remove_dir(&self.dir);
    }
}

/// 取最后一个响应头块（`-L` 会把重定向链都写进来）。
fn parse_headers(path: &std::path::Path) -> CloudResult<Vec<(String, String)>> {
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(Vec::new());
    };
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
        } else {
            current.push(line);
        }
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    let Some(block) = blocks.last() else {
        return Ok(Vec::new());
    };
    let mut headers = Vec::new();
    for line in block.iter().skip(1) {
        // 第一行是 `HTTP/1.1 200 OK`
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_string(), value.trim().to_string()));
        }
    }
    Ok(headers)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实网络冒烟（默认忽略）：`cargo test -p zhibook -- --ignored curl_network_smoke`
    #[test]
    #[ignore = "需要外网"]
    fn curl_network_smoke() {
        let transport = CurlHttpTransport;
        let response = transport
            .execute(
                &HttpRequest::get("https://git.yamds.cafe/api/v1/version")
                    .header("User-Agent", "zhizhang-test"),
            )
            .expect("request");
        assert!(response.status == 200 || response.status == 401, "{}", response.status);
    }
}
