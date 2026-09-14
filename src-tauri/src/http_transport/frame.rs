//! Kotlin `YamdsHttp` 与 Rust 之间的二进制帧（纯逻辑，宿主可测）。
//!
//! 请求头：Rust → JSON **对象**（`{"Accept":"..."}`），Kotlin 用 `JSONObject` 解析。
//! 响应帧：`[u32 status][u32 headersJsonLen][headersJson][body]`；
//! `headersJson` = `[["Name","Value"], ...]`（对应 Rust 的 `Vec<(String, String)>`）；
//! `status = 0` 表示请求失败，`error` 里是文案。

use serde::{Deserialize, Serialize};
use tk_cloud::{CloudError, CloudResult, HttpResponse};

/// 请求头 → JSON 对象字符串。
pub fn headers_to_json(headers: &[(String, String)]) -> String {
    let map: serde_json::Map<String, serde_json::Value> = headers
        .iter()
        .map(|(name, value)| (name.clone(), serde_json::Value::String(value.clone())))
        .collect();
    serde_json::Value::Object(map).to_string()
}

/// Kotlin 返回的帧头 JSON。
#[derive(Debug, Serialize, Deserialize)]
struct HeaderFrame {
    headers: Vec<(String, String)>,
    #[serde(default)]
    error: Option<String>,
}

/// 解析响应帧。
pub fn parse_response(bytes: &[u8]) -> CloudResult<HttpResponse> {
    if bytes.len() < 8 {
        return Err(CloudError::Http("原生 HTTP 响应过短".to_string()));
    }
    let status = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    let header_len = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    if bytes.len() < 8 + header_len {
        return Err(CloudError::Http("原生 HTTP 响应头被截断".to_string()));
    }
    let frame: HeaderFrame = serde_json::from_slice(&bytes[8..8 + header_len])?;
    if status == 0 {
        return Err(CloudError::Http(
            frame
                .error
                .unwrap_or_else(|| "原生 HTTP 请求失败".to_string()),
        ));
    }
    Ok(HttpResponse {
        status: status as u16,
        headers: frame.headers,
        body: bytes[8 + header_len..].to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_serialize_as_json_object_for_kotlin() {
        let json = headers_to_json(&[
            ("Authorization".to_string(), "Basic abc".to_string()),
            ("Accept".to_string(), "*/*".to_string()),
        ]);
        let value: serde_json::Value = serde_json::from_str(&json).expect("json");
        assert_eq!(
            value.get("Authorization").and_then(|item| item.as_str()),
            Some("Basic abc")
        );
        assert_eq!(value.get("Accept").and_then(|item| item.as_str()), Some("*/*"));
        assert!(value.is_object(), "必须是对象（Kotlin 侧 JSONObject）：{json}");
    }

    #[test]
    fn parse_response_reads_binary_frame() {
        let headers = serde_json::to_vec(&HeaderFrame {
            headers: vec![("Content-Type".to_string(), "text/plain".to_string())],
            error: None,
        })
        .expect("headers");
        let mut frame = Vec::new();
        frame.extend_from_slice(&200u32.to_be_bytes());
        frame.extend_from_slice(&(headers.len() as u32).to_be_bytes());
        frame.extend_from_slice(&headers);
        frame.extend_from_slice(b"body");
        let response = parse_response(&frame).expect("parse");
        assert_eq!(response.status, 200);
        assert_eq!(response.header("content-type"), Some("text/plain"));
        assert_eq!(response.body, b"body");
    }

    #[test]
    fn parse_response_maps_error_frame() {
        let headers = serde_json::to_vec(&HeaderFrame {
            headers: vec![],
            error: Some("连接超时".to_string()),
        })
        .expect("headers");
        let mut frame = Vec::new();
        frame.extend_from_slice(&0u32.to_be_bytes());
        frame.extend_from_slice(&(headers.len() as u32).to_be_bytes());
        frame.extend_from_slice(&headers);
        let error = parse_response(&frame).expect_err("error");
        assert!(error.to_string().contains("连接超时"), "{error:?}");
    }

    #[test]
    fn parse_response_rejects_truncated_frame() {
        assert!(parse_response(&[0, 0]).is_err());
        let mut frame = Vec::new();
        frame.extend_from_slice(&200u32.to_be_bytes());
        frame.extend_from_slice(&100u32.to_be_bytes()); // 声称 100 字节头但没有
        assert!(parse_response(&frame).is_err());
    }
}
