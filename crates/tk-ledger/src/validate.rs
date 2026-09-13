//! 入参校验。
//!
//! 校验规则来自 BRD（名称长度、金额上限、日期键格式、颜色与图标名形态）。
//! 前端也会做一遍即时校验，但入库前必须再校验一次：数据层的规则不依赖 UI。

use tk_domain::{MAX_AMOUNT_CENTS, MAX_NOTE_CHARS};

use crate::dates;
use crate::error::{LedgerError, LedgerResult};

/// 账本名：1~20 字。
pub const BOOK_NAME_MAX: usize = 20;
/// 账户名：1~12 字。
pub const ACCOUNT_NAME_MAX: usize = 12;
/// 分类名：1~8 字。
pub const CATEGORY_NAME_MAX: usize = 8;

/// 名称通用校验：去首尾空白后不能为空、字符数在区间内。
pub fn name_in_range(value: &str, label: &str, max: usize) -> LedgerResult<String> {
    let trimmed = value.trim();
    let chars = trimmed.chars().count();
    if chars == 0 {
        return Err(LedgerError::validation(format!("{label}不能为空")));
    }
    if chars > max {
        return Err(LedgerError::validation(format!(
            "{label}不能超过 {max} 个字"
        )));
    }
    Ok(trimmed.to_string())
}

pub fn book_name(value: &str) -> LedgerResult<String> {
    name_in_range(value, "账本名", BOOK_NAME_MAX)
}

pub fn account_name(value: &str) -> LedgerResult<String> {
    name_in_range(value, "账户名", ACCOUNT_NAME_MAX)
}

pub fn category_name(value: &str) -> LedgerResult<String> {
    name_in_range(value, "分类名", CATEGORY_NAME_MAX)
}

/// 备注：可为空，最长 [`MAX_NOTE_CHARS`] 字。
pub fn note(value: &str) -> LedgerResult<String> {
    let trimmed = value.trim();
    let chars = trimmed.chars().count();
    if chars > MAX_NOTE_CHARS {
        return Err(LedgerError::validation(format!(
            "备注不能超过 {MAX_NOTE_CHARS} 个字"
        )));
    }
    Ok(trimmed.to_string())
}

/// 金额：必须 > 0 且不超过上限（分）。
pub fn amount_cents(value: i64) -> LedgerResult<()> {
    if value <= 0 {
        return Err(LedgerError::validation("金额必须大于 0"));
    }
    if value > MAX_AMOUNT_CENTS {
        return Err(LedgerError::validation("金额超过单笔上限"));
    }
    Ok(())
}

/// 颜色：`theme`（跟随主题色）或 `#RRGGBB`。
pub fn color(value: &str) -> LedgerResult<()> {
    if value == "theme" {
        return Ok(());
    }
    let bytes = value.as_bytes();
    let valid = bytes.len() == 7
        && bytes[0] == b'#'
        && bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit());
    if valid {
        Ok(())
    } else {
        Err(LedgerError::validation(format!(
            "颜色格式不合法：{value}（应为 theme 或 #RRGGBB）"
        )))
    }
}

/// 图标名：必须是渲染端已离线注册的 Iconify 集合名字（`mdi:xxx` / `simple-icons:xxx`），
/// 与前端 `IconName` 的集合保持一致，保证渲染端一定能取到 body。
pub fn icon_name(value: &str) -> LedgerResult<()> {
    let name = value
        .strip_prefix("mdi:")
        .or_else(|| value.strip_prefix("simple-icons:"))
        .unwrap_or("");
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
    if valid {
        Ok(())
    } else {
        Err(LedgerError::validation(format!(
            "图标名不合法：{value}（应为 mdi: 或 simple-icons: 前缀的 Iconify 名字）"
        )))
    }
}

/// day / month 键格式，以及两者必须匹配（month = day 的前 7 位）。
pub fn day_and_month(day: &str, month: &str) -> LedgerResult<()> {
    if !dates::is_valid_day_key(day) {
        return Err(LedgerError::validation(format!(
            "日期格式不合法：{day}（应为 YYYY-MM-DD）"
        )));
    }
    if !dates::is_valid_month_key(month) {
        return Err(LedgerError::validation(format!(
            "月份格式不合法：{month}（应为 YYYY-MM）"
        )));
    }
    if dates::month_key_of_day(day).as_deref() != Some(month) {
        return Err(LedgerError::validation(
            "账单的月份与日期不一致".to_string(),
        ));
    }
    Ok(())
}

/// 搜索关键字最大字符数（明细页 FR-DET-10；过长关键字没有实际意义）。
pub const SEARCH_KEYWORD_MAX: usize = 32;

/// 搜索关键字 → SQLite `LIKE` 模式：转义 `\` `%` `_` 后两端加 `%`。
///
/// 不转义的话用户输入 `%` 会变成通配符（检索到全部账单），属于隐性的注入式误用。
pub fn like_pattern(keyword: &str) -> LedgerResult<String> {
    let trimmed = keyword.trim();
    let chars = trimmed.chars().count();
    if chars == 0 {
        return Err(LedgerError::validation("搜索关键字不能为空"));
    }
    if chars > SEARCH_KEYWORD_MAX {
        return Err(LedgerError::validation(format!(
            "搜索关键字不能超过 {SEARCH_KEYWORD_MAX} 个字"
        )));
    }
    let mut pattern = String::with_capacity(trimmed.len() + 2);
    pattern.push('%');
    for ch in trimmed.chars() {
        match ch {
            '\\' => pattern.push_str("\\\\"),
            '%' => pattern.push_str("\\%"),
            '_' => pattern.push_str("\\_"),
            other => pattern.push(other),
        }
    }
    pattern.push('%');
    Ok(pattern)
}

/// 附件 MIME：只接受前端压缩后的三种图片。
pub fn attachment_mime(value: &str) -> LedgerResult<&'static str> {
    match value {
        "image/jpeg" | "image/jpg" => Ok("image/jpeg"),
        "image/png" => Ok("image/png"),
        "image/webp" => Ok("image/webp"),
        other => Err(LedgerError::validation(format!(
            "不支持的附件类型：{other}（仅支持 JPEG / PNG / WebP）"
        ))),
    }
}

/// MIME → 落盘扩展名。
pub fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_trimmed_and_length_checked() {
        assert_eq!(book_name("  日常账  ").expect("合法"), "日常账");
        assert!(book_name("   ").is_err());
        assert!(book_name(&"字".repeat(21)).is_err());
        assert!(category_name(&"字".repeat(8)).is_ok());
        assert!(category_name(&"字".repeat(9)).is_err());
    }

    #[test]
    fn note_allows_empty_but_caps_length() {
        assert_eq!(note("  ").expect("空备注合法"), "");
        assert!(note(&"a".repeat(MAX_NOTE_CHARS)).is_ok());
        assert!(note(&"a".repeat(MAX_NOTE_CHARS + 1)).is_err());
    }

    #[test]
    fn amount_must_be_positive_and_within_cap() {
        assert!(amount_cents(1).is_ok());
        assert!(amount_cents(0).is_err());
        assert!(amount_cents(-1).is_err());
        assert!(amount_cents(MAX_AMOUNT_CENTS).is_ok());
        assert!(amount_cents(MAX_AMOUNT_CENTS + 1).is_err());
    }

    #[test]
    fn color_accepts_theme_or_hex() {
        assert!(color("theme").is_ok());
        assert!(color("#a1B2c3").is_ok());
        assert!(color("#12345").is_err());
        assert!(color("red").is_err());
        assert!(color("#gggggg").is_err());
    }

    #[test]
    fn icon_name_requires_known_collection_prefix() {
        assert!(icon_name("mdi:noodles").is_ok());
        assert!(icon_name("simple-icons:alipay").is_ok());
        assert!(icon_name("noodles").is_err());
        assert!(icon_name("mdi:Noodles").is_err());
        assert!(icon_name("mdi:").is_err());
        assert!(icon_name("simple-icons:").is_err());
        assert!(icon_name("simple-icons:Alipay").is_err());
        assert!(icon_name("lucide:apple").is_err());
    }

    #[test]
    fn like_pattern_trims_escapes_and_rejects_empty() {
        assert_eq!(like_pattern("  早餐 ").expect("ok"), "%早餐%");
        assert_eq!(like_pattern("50%").expect("ok"), "%50\\%%");
        assert_eq!(like_pattern("a_b\\c").expect("ok"), "%a\\_b\\\\c%");
        assert!(like_pattern("   ").is_err());
        assert!(like_pattern(&"字".repeat(SEARCH_KEYWORD_MAX + 1)).is_err());
    }

    #[test]
    fn day_and_month_must_agree() {
        assert!(day_and_month("2025-09-08", "2025-09").is_ok());
        assert!(day_and_month("2025-09-08", "2025-10").is_err());
        assert!(day_and_month("2025-02-30", "2025-02").is_err());
    }

    #[test]
    fn attachment_mime_normalizes_jpg() {
        assert_eq!(attachment_mime("image/jpg").expect("jpg"), "image/jpeg");
        assert_eq!(attachment_mime("image/webp").expect("webp"), "image/webp");
        assert!(attachment_mime("image/gif").is_err());
        assert_eq!(extension_for_mime("image/png"), "png");
    }
}
