use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::{LlmDownloadCompletePayload, LlmDownloadProgressPayload};

const DOWNLOAD_CHUNK_SIZE: usize = 64 * 1024;
const DOWNLOAD_TIMEOUT_SECS: u64 = 600;

/// Download a GGUF model file from `url` to `dest`, emitting progress events
/// via the Tauri event bus.
pub fn download_model_file(url: &str, dest: &Path, app_handle: &AppHandle) -> Result<(), String> {
    let tmp_path = dest.with_extension("download.tmp");

    // Clean up any stale temp file
    let _ = std::fs::remove_file(&tmp_path);

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("Failed to start download: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Download request failed with HTTP {status}"));
    }

    let total_bytes = response.content_length();
    let mut reader = response;
    let mut file = std::fs::File::create(&tmp_path)
        .map_err(|e| format!("Failed to create temp file {}: {e}", tmp_path.display()))?;

    let mut downloaded_bytes = 0u64;
    let mut buffer = vec![0u8; DOWNLOAD_CHUNK_SIZE];
    let mut last_reported_pct = 0u8;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed while reading download stream: {e}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|e| format!("Failed while writing download: {e}"))?;
        downloaded_bytes += read as u64;

        let pct = total_bytes.and_then(|t| {
            if t > 0 {
                Some(((downloaded_bytes.saturating_mul(100)) / t).min(100) as u8)
            } else {
                None
            }
        });

        if let Some(p) = pct {
            if p >= last_reported_pct.saturating_add(5) || p == 100 {
                last_reported_pct = p;
                let _ = app_handle.emit(
                    "llm:download_progress",
                    LlmDownloadProgressPayload {
                        pct: p,
                        downloaded_bytes,
                        total_bytes,
                    },
                );
                crate::app_logs::info(
                    app_handle,
                    "llm/download",
                    format!("Descarga de modelo local {p}%"),
                );
            }
        }
    }

    drop(file);
    validate_gguf_download(&tmp_path)?;
    std::fs::rename(&tmp_path, dest).map_err(|e| {
        format!(
            "Failed to finalize download from {} to {}: {e}",
            tmp_path.display(),
            dest.display()
        )
    })?;

    let _ = app_handle.emit(
        "llm:download_complete",
        LlmDownloadCompletePayload {
            path: dest.to_string_lossy().to_string(),
        },
    );
    crate::app_logs::info(
        app_handle,
        "llm/download",
        format!("Descarga de modelo local completada: {}", dest.display()),
    );

    Ok(())
}

fn validate_gguf_download(path: &Path) -> Result<(), String> {
    let mut file = std::fs::File::open(path).map_err(|e| {
        format!(
            "Failed to validate downloaded model {}: {e}",
            path.display()
        )
    })?;
    let metadata = file
        .metadata()
        .map_err(|e| format!("Failed to inspect downloaded model {}: {e}", path.display()))?;
    if metadata.len() < 8 {
        return Err(format!(
            "Downloaded model is too small to be a valid GGUF file ({} bytes)",
            metadata.len()
        ));
    }
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)
        .map_err(|e| format!("Failed to read GGUF header from {}: {e}", path.display()))?;
    if &magic != b"GGUF" {
        return Err("Downloaded model is not a GGUF file (missing GGUF header)".to_string());
    }
    Ok(())
}
