/// Tauri IPC commands for OCR operations.
use super::{update_extraction_text, OcrQueue};
use crate::db::state::AppDbState;
use crate::nlp::NlpQueue;
use crate::path_utils::normalize_windows_path_string;
use serde::Serialize;
use tauri::{AppHandle, State};

/// A single rendered PDF page returned by `render_pdf_pages_cmd`.
#[derive(Clone, Serialize)]
pub struct RenderedPage {
    pub page_number: u32,
    pub png_path: String,
}

/// Submit an OCR extraction job to the background worker queue.
///
/// Returns immediately with `Ok("queued")`. The worker will process the job
/// asynchronously and emit `ocr:progress`, `ocr:complete`, or `ocr:error` events.
///
/// # Arguments
/// * `asset_id`   — unique ID of the asset in the database
/// * `asset_path` — absolute filesystem path to the asset file
/// * `asset_type` — `"pdf"` or `"image"`
/// * `mode`       — `"light"` (plain PaddleOCR, default) or `"high"` (PaddleVL → PaddleOCR)
/// * `ocr_queue`  — managed state injected by Tauri
#[tauri::command]
pub async fn extract_text(
    asset_id: String,
    asset_path: String,
    asset_type: String,
    mode: Option<String>,
    app_handle: AppHandle,
    ocr_queue: State<'_, OcrQueue>,
    db: State<'_, AppDbState>,
) -> Result<String, String> {
    let ocr_mode = match mode.as_deref() {
        Some("high") => super::OcrMode::High,
        _ => super::OcrMode::Light, // default to light
    };

    if ocr_mode == super::OcrMode::High {
        let conn = db
            .ui_conn
            .lock()
            .map_err(|e| format!("DB lock poisoned: {e}"))?;
        super::ensure_selected_cloud_key(&conn)?;
    }

    crate::app_logs::info(
        &app_handle,
        "ocr",
        format!(
            "Trabajo OCR encolado: asset_id={}, tipo={}, modo={:?}",
            asset_id, asset_type, ocr_mode
        ),
    );

    let job = super::OcrJob {
        asset_id,
        asset_path,
        asset_type,
        mode: ocr_mode,
    };

    ocr_queue.submit(job)?;
    Ok("queued".to_string())
}

#[tauri::command]
pub async fn test_glm_ocr_connection(api_key: String) -> Result<(), String> {
    super::glm_ocr::GlmOcrClient::new(api_key)
        .test_connection()
        .await
}

/// Update the text_content of the latest extraction for an asset.
///
/// This allows users to manually correct OCR output and persist the correction.
/// The original extraction metadata (id, created_at, method, confidence) is preserved.
#[tauri::command]
pub async fn update_extraction_text_cmd(
    asset_id: String,
    text_content: String,
    db: State<'_, AppDbState>,
    _nlp_queue: State<'_, NlpQueue>,
) -> Result<(), String> {
    let conn = db
        .ui_conn
        .lock()
        .map_err(|e| format!("DB lock poisoned: {e}"))?;
    update_extraction_text(&conn, &asset_id, &text_content)?;

    Ok(())
}

/// Generate a thumbnail PNG for the first page of a PDF.
///
/// Returns the filesystem path to the cached thumbnail. The frontend should
/// use `convertFileSrc()` to turn this path into a webview-accessible URL.
///
/// Thumbnails are cached at `{app_data_dir}/thumbnails/{asset_id}.png`.
/// If a cached thumbnail already exists, the cached path is returned immediately
/// without re-rendering.
#[tauri::command]
pub async fn generate_pdf_thumbnail(
    asset_path: String,
    asset_id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use std::io::Write;
    use tauri::Manager;

    // Ensure Pdfium DLL path is initialized before any PDF operations.
    // This is a no-op if already called by the OCR worker; safe to call multiple times.
    super::pdf::init_pdfium_path(&app_handle);

    // Resolve thumbnails directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let thumb_dir = app_dir.join("thumbnails");
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Failed to create thumbnails directory: {e}"))?;

    let thumb_path = thumb_dir.join(format!("{asset_id}.png"));

    // Return cached thumbnail immediately if it exists
    if thumb_path.exists() {
        return Ok(normalize_windows_path_string(&thumb_path));
    }

    // Read PDF and render thumbnail in a blocking task
    // (pdfium is CPU-intensive and must not block the async runtime)
    let result_path = tokio::task::spawn_blocking(move || {
        let bytes =
            std::fs::read(&asset_path).map_err(|e| format!("Failed to read PDF file: {e}"))?;

        let png_data = super::pdf::render_pdf_thumbnail(&bytes)?;

        // Write thumbnail to disk
        let mut file = std::fs::File::create(&thumb_path)
            .map_err(|e| format!("Failed to create thumbnail file: {e}"))?;
        file.write_all(&png_data)
            .map_err(|e| format!("Failed to write thumbnail data: {e}"))?;

        Ok::<String, String>(normalize_windows_path_string(&thumb_path))
    })
    .await
    .map_err(|e| format!("Thumbnail generation task panicked: {e}"))??;

    Ok(result_path)
}

/// Delete a cached PDF thumbnail for an asset.
///
/// Called when a PDF asset is deleted to clean up the thumbnail cache.
/// Returns `Ok(())` even if the file doesn't exist (ENOENT is OK).
#[tauri::command]
pub async fn delete_pdf_thumbnail(
    asset_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let thumb_path = app_dir.join("thumbnails").join(format!("{asset_id}.png"));

    if thumb_path.exists() {
        std::fs::remove_file(&thumb_path)
            .map_err(|e| format!("Failed to delete thumbnail: {e}"))?;
    }

    Ok(())
}

/// Check whether a PDF is scanned (image-only) by testing if its native text
/// layer passes quality checks.
///
/// Returns `true` if the PDF has insufficient native text (likely scanned/image-only)
/// and should be split into per-page image assets during import.
#[tauri::command]
pub async fn is_scanned_pdf(
    asset_path: String,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    // Ensure Pdfium is initialized
    super::pdf::init_pdfium_path(&app_handle);

    let bytes = tokio::task::spawn_blocking(move || std::fs::read(&asset_path))
        .await
        .map_err(|e| format!("Failed to read PDF file: {e}"))?
        .map_err(|e| format!("Failed to read PDF file: {e}"))?;

    let is_scanned = tokio::task::spawn_blocking(move || {
        // Try native text extraction first
        let native_text = super::pdf::extract_pdf_text(&bytes);
        match native_text {
            Ok(text) => !super::pdf::is_quality_text(&text),
            Err(_) => true, // If extraction itself fails, treat as scanned
        }
    })
    .await
    .map_err(|e| format!("PDF check task panicked: {e}"))?;

    Ok(is_scanned)
}

/// Render all pages of a PDF as PNG images and save them to disk.
///
/// Used by the frontend import flow to convert scanned PDFs into per-page
/// image assets. Each page is rendered at 300 DPI (target width 2550px),
/// saved as a PNG file in the specified output directory.
///
/// # Arguments
/// * `pdf_path` — Absolute filesystem path to the source PDF file
/// * `output_dir` — Directory where PNG files will be saved (created if missing)
/// * `filename_prefix` — Prefix for output filenames (e.g., "document" → "document_page_1.png")
///
/// # Returns
/// A list of `RenderedPage` objects with page numbers and absolute file paths.
#[tauri::command]
pub async fn render_pdf_pages(
    pdf_path: String,
    output_dir: String,
    filename_prefix: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<RenderedPage>, String> {
    use std::io::Write;

    // Ensure Pdfium is initialized
    super::pdf::init_pdfium_path(&app_handle);

    // Create output directory if it doesn't exist
    let out_dir = std::path::PathBuf::from(&output_dir);
    std::fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create output directory: {e}"))?;

    // Read PDF and render pages in a blocking task
    let pages = tokio::task::spawn_blocking(move || {
        let bytes =
            std::fs::read(&pdf_path).map_err(|e| format!("Failed to read PDF file: {e}"))?;

        // Check if PDF has quality text (skip rendering if it's a text PDF)
        // This is a safety check — the frontend should only call this for scanned PDFs
        let native_text = super::pdf::extract_pdf_text(&bytes);
        if let Ok(ref text) = native_text {
            if super::pdf::is_quality_text(text) {
                return Err(
                    "PDF has quality native text — not a scanned PDF. Use as PDF asset instead."
                        .to_string(),
                );
            }
        }

        let page_count = super::pdf::pdf_page_count(&bytes)
            .map_err(|e| format!("Failed to get PDF page count: {e}"))?;

        eprintln!("[render_pdf_pages] Rendering {page_count} pages from PDF");

        let mut rendered_pages: Vec<RenderedPage> = Vec::with_capacity(page_count);

        for page_idx in 0..page_count {
            let png_data = super::pdf::render_pdf_page_to_image(&bytes, page_idx)
                .map_err(|e| format!("Failed to render PDF page {}: {e}", page_idx + 1))?;

            let page_number = (page_idx + 1) as u32;
            let filename = format!("{filename_prefix}_page_{page_number}.png");
            let file_path = out_dir.join(&filename);

            let mut file = std::fs::File::create(&file_path)
                .map_err(|e| format!("Failed to create PNG file for page {page_number}: {e}"))?;
            file.write_all(&png_data)
                .map_err(|e| format!("Failed to write PNG data for page {page_number}: {e}"))?;

            rendered_pages.push(RenderedPage {
                page_number,
                png_path: normalize_windows_path_string(&file_path),
            });

            eprintln!("[render_pdf_pages] Rendered page {page_number}/{page_count}");
        }

        Ok(rendered_pages)
    })
    .await
    .map_err(|e| format!("PDF render task panicked: {e}"))??;

    Ok(pages)
}
