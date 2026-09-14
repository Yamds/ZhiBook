//! HTTP 传输抽象。
//!
//! Android 生产路径走 Kotlin 原生桥（系统 TLS，不把 TLS 栈打进 `.so`）；
//! Windows 测试 / 桌面预览可以接任何实现（见 `src-tauri` 的 reqwest 实现）。

use crate::CloudResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}

#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    /// 单次请求的超时（秒）；0 = 用实现默认值。
    pub timeout_secs: u64,
}

impl HttpRequest {
    pub fn get(url: impl Into<String>) -> Self {
        Self {
            method: HttpMethod::Get,
            url: url.into(),
            headers: Vec::new(),
            body: None,
            timeout_secs: 0,
        }
    }

    pub fn post(url: impl Into<String>, body: Vec<u8>) -> Self {
        Self {
            method: HttpMethod::Post,
            url: url.into(),
            headers: Vec::new(),
            body: Some(body),
            timeout_secs: 0,
        }
    }

    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    pub fn timeout(mut self, seconds: u64) -> Self {
        self.timeout_secs = seconds;
        self
    }
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

/// 同步 HTTP 传输（调用方负责放在后台线程里跑）。
pub trait HttpTransport: Send + Sync {
    fn execute(&self, request: &HttpRequest) -> CloudResult<HttpResponse>;
}

/// 测试用：把「请求 → 响应」写死。
#[cfg(test)]
#[derive(Default)]
pub struct MockTransport {
    responses: std::sync::Mutex<Vec<(String, HttpResponse)>>,
    pub requests: std::sync::Mutex<Vec<HttpRequest>>,
}

#[cfg(test)]
impl MockTransport {
    pub fn push(&self, url_contains: &str, response: HttpResponse) {
        if let Ok(mut responses) = self.responses.lock() {
            responses.push((url_contains.to_string(), response));
        }
    }
}

#[cfg(test)]
impl HttpTransport for MockTransport {
    fn execute(&self, request: &HttpRequest) -> CloudResult<HttpResponse> {
        let mut requests = self
            .requests
            .lock()
            .map_err(|_| crate::CloudError::Http("mock 请求锁已损坏".to_string()))?;
        requests.push(request.clone());
        let mut responses = self
            .responses
            .lock()
            .map_err(|_| crate::CloudError::Http("mock 响应锁已损坏".to_string()))?;
        let index = responses
            .iter()
            .position(|(needle, _)| request.url.contains(needle.as_str()))
            .ok_or_else(|| crate::CloudError::Http(format!("mock 没有匹配的响应：{}", request.url)))?;
        Ok(responses.remove(index).1)
    }
}
