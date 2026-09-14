//! 应用会话日志:文件落盘 + tracing 初始化。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

use tk_config::{DataPaths, LOG_KEEP_DAYS, MAX_LOG_FILES};
use tracing_subscriber::EnvFilter;

static SESSION: OnceLock<Arc<Session>> = OnceLock::new();

struct Session {
    path: PathBuf,
    file: Mutex<std::fs::File>,
}

pub fn init(data_root: &Path) {
    if SESSION.get().is_some() {
        return;
    }
    let dir = DataPaths::new(data_root).app_log_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    // 每次启动都会新建一个会话日志，不清理就会无限堆积。
    prune_old_logs(&dir, MAX_LOG_FILES, LOG_KEEP_DAYS);
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let path = dir.join(format!("{stamp}.log"));
    let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(true)
        .try_init();
    let session = Arc::new(Session {
        path,
        file: Mutex::new(file),
    });
    let _ = SESSION.set(session);
    write_session_line("INFO", "app", "app log session started");
}

pub fn active_log_path() -> Option<PathBuf> {
    SESSION.get().map(|session| session.path.clone())
}

pub fn write_session_line(level: &str, target: &str, message: &str) {
    let Some(session) = SESSION.get() else {
        return;
    };
    let time = chrono::Local::now().format("%y-%m-%d %H:%M:%S");
    let line = format!("{time} | [{level}] | [{target}] | {message}\n");
    if let Ok(mut file) = session.file.lock() {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }
}

pub fn read_tail_text(path: &Path, max_bytes: usize) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let start = bytes.len().saturating_sub(max_bytes);
    Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

/// 清理旧会话日志：先按住的天数删，再按份数保留最新的 `keep_files` 份。
///
/// 逐文件 `remove_file`（不通配、不递归）：日志目录里只有我们自己写的 `.log`。
fn prune_old_logs(dir: &Path, keep_files: usize, keep_days: u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();
    let keep_age = Duration::from_secs(keep_days.saturating_mul(24 * 60 * 60));
    let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(modified) = entry.metadata().ok().and_then(|meta| meta.modified().ok()) else {
            continue;
        };
        let expired = now
            .duration_since(modified)
            .map(|age| age > keep_age)
            .unwrap_or(false);
        if expired {
            let _ = fs::remove_file(&path);
            continue;
        }
        files.push((modified, path));
    }
    if files.len() <= keep_files {
        return;
    }
    files.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (_, path) in files.into_iter().skip(keep_files) {
        let _ = fs::remove_file(path);
    }
}
