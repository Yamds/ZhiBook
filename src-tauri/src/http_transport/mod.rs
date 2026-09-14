//! HTTP 传输实现（平台相关）。
//!
//! - Android：Kotlin `YamdsHttp`（HttpURLConnection + 系统 TLS），**不把 TLS 栈打进 .so**；
//! - 其它平台（开发 / 测试）：`curl` 子进程实现，仅用于本地联调与集成测试。
//!
//! 两边的行为必须一致：不自动跟随跨主机重定向、不静默丢响应体、状态码原样回传。

use std::sync::Arc;

use tk_cloud::HttpTransport;

#[cfg(target_os = "android")]
mod android;
#[cfg(not(target_os = "android"))]
mod curl;
pub mod frame;

/// 构建当前平台的 HTTP 传输。
pub fn build_http_transport() -> Arc<dyn HttpTransport> {
    #[cfg(target_os = "android")]
    {
        Arc::new(android::AndroidHttpTransport)
    }
    #[cfg(not(target_os = "android"))]
    {
        Arc::new(curl::CurlHttpTransport)
    }
}
