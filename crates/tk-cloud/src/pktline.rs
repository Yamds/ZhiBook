//! Git smart HTTP 的 pkt-line 编码 / 解码（协议 v0/v1 的文本部分）。
//!
//! 一条 pkt-line = 4 位 hex 长度（含自身）+ 负载；`0000` 是 flush，`0001` 是 delim。

use crate::{CloudError, CloudResult};

/// flush-pkt。
pub const FLUSH: &[u8; 4] = b"0000";
/// delim-pkt。
pub const DELIM: &[u8; 4] = b"0001";

/// 编码一条 ASCII pkt-line。
pub fn encode(text: &str) -> Vec<u8> {
    let payload = text.as_bytes();
    let length = payload.len() + 4;
    let mut out = format!("{length:04x}").into_bytes();
    out.extend_from_slice(payload);
    out
}

/// 编码二进制 pkt-line（长度按 UTF-8 文本长度校验的同一套规则）。
pub fn encode_bytes(payload: &[u8]) -> Vec<u8> {
    let length = payload.len() + 4;
    let mut out = format!("{length:04x}").into_bytes();
    out.extend_from_slice(payload);
    out
}

/// 解码一段 pkt-line 流；flush / delim 以 `None` 表示。
pub fn decode_all(input: &[u8]) -> CloudResult<Vec<Option<Vec<u8>>>> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while cursor < input.len() {
        if cursor + 4 > input.len() {
            return Err(CloudError::Protocol("pkt-line 长度域不完整".to_string()));
        }
        let header = std::str::from_utf8(&input[cursor..cursor + 4])
            .map_err(|_| CloudError::Protocol("pkt-line 长度域不是 ASCII".to_string()))?;
        let length = usize::from_str_radix(header, 16)
            .map_err(|_| CloudError::Protocol(format!("pkt-line 长度不合法：{header}")))?;
        cursor += 4;
        match length {
            0 | 1 => {
                out.push(None);
                continue;
            }
            2 | 3 => {
                return Err(CloudError::Protocol(format!("pkt-line 长度过小：{length}")));
            }
            _ => {}
        }
        let payload_len = length - 4;
        if cursor + payload_len > input.len() {
            return Err(CloudError::Protocol("pkt-line 负载被截断".to_string()));
        }
        out.push(Some(input[cursor..cursor + payload_len].to_vec()));
        cursor += payload_len;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_uses_hex_length_including_header() {
        assert_eq!(encode("a\n"), b"0006a\n");
        assert_eq!(encode("hello"), b"0009hello");
        assert_eq!(encode(""), b"0004");
    }

    #[test]
    fn decode_handles_flush_and_multiple_lines() {
        let mut stream = Vec::new();
        stream.extend_from_slice(b"001f# service=git-receive-pack\n");
        stream.extend_from_slice(FLUSH);
        stream.extend_from_slice(&encode("hello\n"));
        stream.extend_from_slice(DELIM);
        let lines = decode_all(&stream).expect("decode");
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0].as_deref(), Some(b"# service=git-receive-pack\n".as_slice()));
        assert!(lines[1].is_none());
        assert_eq!(lines[2].as_deref(), Some(b"hello\n".as_slice()));
        assert!(lines[3].is_none());
    }

    #[test]
    fn decode_rejects_truncated_stream() {
        assert!(decode_all(b"0009hel").is_err());
        assert!(decode_all(b"zzzz").is_err());
    }
}
