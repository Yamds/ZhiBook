//! 日期键纯逻辑（与前端 `src/core/domain/date.ts` 保持同一套规则）。
//!
//! 只在 Rust 侧需要的地方使用：算当月天数、按月份偏移生成趋势序列。
//! 时区判断不在这里做——day / month 由前端按设备本地时区算好后写入。

/// 是否闰年（公历）。
pub fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

/// 某年某月的天数。
pub fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// `YYYY-MM` → (年, 月)；格式不合法返回 None。
pub fn parse_month_key(key: &str) -> Option<(i32, u32)> {
    let bytes = key.as_bytes();
    if bytes.len() != 7 || bytes[4] != b'-' {
        return None;
    }
    let year = key.get(0..4)?.parse::<i32>().ok()?;
    let month = key.get(5..7)?.parse::<u32>().ok()?;
    if !(1..=12).contains(&month) {
        return None;
    }
    Some((year, month))
}

/// `YYYY-MM-DD` → (年, 月, 日)；格式与取值范围都校验。
pub fn parse_day_key(key: &str) -> Option<(i32, u32, u32)> {
    let bytes = key.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let (year, month) = parse_month_key(key.get(0..7)?)?;
    let day = key.get(8..10)?.parse::<u32>().ok()?;
    if day == 0 || day > days_in_month(year, month) {
        return None;
    }
    Some((year, month, day))
}

/// `YYYY-MM-DD` 是否是合法日期键。
pub fn is_valid_day_key(key: &str) -> bool {
    parse_day_key(key).is_some()
}

/// `YYYY-MM` 是否是合法月份键。
pub fn is_valid_month_key(key: &str) -> bool {
    parse_month_key(key).is_some()
}

/// 由 day key 取出月 key（调用方保证格式合法）。
pub fn month_key_of_day(day: &str) -> Option<String> {
    let (year, month, _) = parse_day_key(day)?;
    Some(month_key(year, month))
}

/// 生成 `YYYY-MM`。
pub fn month_key(year: i32, month: u32) -> String {
    format!("{year:04}-{month:02}")
}

/// 生成 `YYYY-MM-DD`。
pub fn day_key(year: i32, month: u32, day: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}

/// 月份偏移（跨年安全）；`delta` 可正可负。
pub fn shift_month(year: i32, month: u32, delta: i32) -> (i32, u32) {
    let zero_based = year as i64 * 12 + (month as i64 - 1) + delta as i64;
    let new_year = zero_based.div_euclid(12) as i32;
    let new_month = zero_based.rem_euclid(12) as u32 + 1;
    (new_year, new_month)
}

/// 以 `end_month` 结尾、向前共 `count` 个月的月序列（含 end）。
pub fn trailing_months(end_month: &str, count: usize) -> Option<Vec<String>> {
    let (year, month) = parse_month_key(end_month)?;
    if count == 0 {
        return Some(Vec::new());
    }
    let mut months = Vec::with_capacity(count);
    for offset in (0..count as i32).rev() {
        let (y, m) = shift_month(year, month, -offset);
        months.push(month_key(y, m));
    }
    Some(months)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leap_year_rules() {
        assert!(is_leap_year(2024));
        assert!(!is_leap_year(2025));
        assert!(!is_leap_year(1900));
        assert!(is_leap_year(2000));
    }

    #[test]
    fn days_in_month_covers_february_and_big_months() {
        assert_eq!(days_in_month(2024, 2), 29);
        assert_eq!(days_in_month(2025, 2), 28);
        assert_eq!(days_in_month(2025, 4), 30);
        assert_eq!(days_in_month(2025, 12), 31);
    }

    #[test]
    fn parse_day_key_rejects_impossible_dates() {
        assert_eq!(parse_day_key("2025-02-29"), None);
        assert_eq!(parse_day_key("2024-02-29"), Some((2024, 2, 29)));
        assert_eq!(parse_day_key("2025-13-01"), None);
        assert_eq!(parse_day_key("2025-1-01"), None);
        assert_eq!(month_key_of_day("2025-09-08").as_deref(), Some("2025-09"));
    }

    #[test]
    fn shift_month_crosses_year_boundaries() {
        assert_eq!(shift_month(2025, 1, -1), (2024, 12));
        assert_eq!(shift_month(2025, 12, 1), (2026, 1));
        assert_eq!(shift_month(2025, 6, -11), (2024, 7));
    }

    #[test]
    fn trailing_months_is_inclusive_and_ordered() {
        let months = trailing_months("2026-01", 12).expect("valid month");
        assert_eq!(months.len(), 12);
        assert_eq!(months[0], "2025-02");
        assert_eq!(months[11], "2026-01");
    }
}
