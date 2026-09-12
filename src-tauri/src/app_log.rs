//! 应用会话日志:文件落盘 + tracing 初始化。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use tk_config::DataPaths;
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
