use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_LOG_ENTRIES: usize = 2_000;
const LOG_FILE_NAME: &str = "entropia.log";
const MAX_MESSAGE_CHARS: usize = 4_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppLogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppLogEntry {
    pub id: u64,
    pub timestamp_ms: u64,
    pub level: AppLogLevel,
    pub source: String,
    pub message: String,
}

#[derive(Debug)]
struct AppLogsInner {
    entries: VecDeque<AppLogEntry>,
    next_id: u64,
}

#[derive(Debug)]
pub struct AppLogsState {
    inner: Mutex<AppLogsInner>,
    file_lock: Mutex<()>,
    log_dir: PathBuf,
    log_file: PathBuf,
}

impl AppLogsState {
    pub fn new(log_dir: PathBuf) -> Self {
        let log_file = log_dir.join(LOG_FILE_NAME);
        let entries = load_existing_entries(&log_file, MAX_LOG_ENTRIES);
        let next_id = entries
            .iter()
            .map(|entry| entry.id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);

        Self {
            inner: Mutex::new(AppLogsInner { entries, next_id }),
            file_lock: Mutex::new(()),
            log_dir,
            log_file,
        }
    }

    fn entries(&self) -> Vec<AppLogEntry> {
        let inner = self
            .inner
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        inner.entries.iter().cloned().collect()
    }

    fn clear(&self) -> Result<(), String> {
        {
            let mut inner = self
                .inner
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            inner.entries.clear();
            inner.next_id = 0;
        }

        let _file_guard = self
            .file_lock
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        fs::create_dir_all(&self.log_dir)
            .map_err(|error| format!("No se pudo crear el directorio de logs: {error}"))?;
        fs::write(&self.log_file, "")
            .map_err(|error| format!("No se pudo limpiar el archivo de logs: {error}"))?;
        Ok(())
    }

    fn append(
        &self,
        level: AppLogLevel,
        source: impl Into<String>,
        message: impl Into<String>,
    ) -> AppLogEntry {
        let entry = {
            let mut inner = self
                .inner
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            let entry = AppLogEntry {
                id: inner.next_id,
                timestamp_ms: now_ms(),
                level,
                source: sanitize_field(source.into(), 96),
                message: sanitize_field(message.into(), MAX_MESSAGE_CHARS),
            };
            inner.next_id = inner.next_id.saturating_add(1);
            inner.entries.push_back(entry.clone());
            while inner.entries.len() > MAX_LOG_ENTRIES {
                inner.entries.pop_front();
            }
            entry
        };

        self.append_to_file(&entry);
        entry
    }

    fn append_to_file(&self, entry: &AppLogEntry) {
        let _file_guard = self
            .file_lock
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());

        if fs::create_dir_all(&self.log_dir).is_err() {
            return;
        }

        let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file)
        else {
            return;
        };

        if let Ok(line) = serde_json::to_string(entry) {
            let _ = writeln!(file, "{line}");
        }
    }

    fn log_dir(&self) -> &Path {
        &self.log_dir
    }
}

#[tauri::command]
pub fn logs_get(state: State<'_, AppLogsState>) -> Result<Vec<AppLogEntry>, String> {
    Ok(state.entries())
}

#[tauri::command]
pub fn logs_clear(state: State<'_, AppLogsState>) -> Result<(), String> {
    state.clear()
}

#[tauri::command]
pub fn logs_open_dir(state: State<'_, AppLogsState>) -> Result<(), String> {
    fs::create_dir_all(state.log_dir())
        .map_err(|error| format!("No se pudo crear el directorio de logs: {error}"))?;
    open_path(state.log_dir())
}

pub fn info(app_handle: &AppHandle, source: impl Into<String>, message: impl Into<String>) {
    append(app_handle, AppLogLevel::Info, source, message);
}

pub fn warn(app_handle: &AppHandle, source: impl Into<String>, message: impl Into<String>) {
    append(app_handle, AppLogLevel::Warn, source, message);
}

pub fn error(app_handle: &AppHandle, source: impl Into<String>, message: impl Into<String>) {
    append(app_handle, AppLogLevel::Error, source, message);
}

fn append(
    app_handle: &AppHandle,
    level: AppLogLevel,
    source: impl Into<String>,
    message: impl Into<String>,
) {
    let entry = app_handle
        .state::<AppLogsState>()
        .append(level, source, message);
    let _ = app_handle.emit("logs://entry", entry);
}

fn load_existing_entries(log_file: &Path, max_entries: usize) -> VecDeque<AppLogEntry> {
    let Ok(contents) = fs::read_to_string(log_file) else {
        return VecDeque::new();
    };

    let mut entries = VecDeque::new();
    for line in contents.lines() {
        let Ok(entry) = serde_json::from_str::<AppLogEntry>(line) else {
            continue;
        };
        entries.push_back(entry);
        while entries.len() > max_entries {
            entries.pop_front();
        }
    }
    entries
}

fn sanitize_field(value: String, max_chars: usize) -> String {
    let mut cleaned = String::new();
    for ch in value.chars().take(max_chars) {
        if ch.is_control() && ch != '\n' && ch != '\t' {
            cleaned.push(' ');
        } else {
            cleaned.push(ch);
        }
    }

    if value.chars().count() > max_chars {
        cleaned.push_str("… [truncado]");
    }

    redact_sensitive(cleaned)
}

fn redact_sensitive(value: String) -> String {
    let sensitive_markers = [
        "api_key",
        "apikey",
        "authorization",
        "bearer ",
        "token",
        "password",
        "secret",
        "openrouter",
        "assemblyai",
    ];

    let lower = value.to_ascii_lowercase();
    if sensitive_markers
        .iter()
        .any(|marker| lower.contains(marker))
    {
        // Keep the log useful without risking leaked credentials.
        return value
            .split_whitespace()
            .map(|part| {
                let part_lower = part.to_ascii_lowercase();
                if sensitive_markers
                    .iter()
                    .any(|marker| part_lower.contains(marker))
                    || part.len() > 48 && part.chars().any(|ch| ch.is_ascii_alphabetic())
                {
                    "[redactado]".to_string()
                } else {
                    part.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
    }

    value
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(path);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(path);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(path);
        cmd
    };

    command
        .spawn()
        .map_err(|error| format!("No se pudo abrir el directorio de logs: {error}"))?;
    Ok(())
}
