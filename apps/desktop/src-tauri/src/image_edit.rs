//! Image editing commands: crop, rotate, erase region.
//!
//! All operations write a NEW versioned file (never in-place) to force
//! browser cache invalidation and support undo. The previous file is
//! kept on disk so undo can restore it by pointing the asset path back.

use image::{DynamicImage, GenericImage, GenericImageView, Rgba};
use std::path::Path;

/// Result of an image edit operation. Returned to the frontend so it can
/// update asset paths and dimensions, and maintain an undo history.
#[derive(serde::Serialize)]
pub struct ImageEditResult {
    /// New path of the edited image (always a new versioned file)
    pub path: String,
    /// Width in pixels after the edit
    pub width: u32,
    /// Height in pixels after the edit
    pub height: u32,
    /// True when the file format changed (e.g. JPEG → PNG for transparency)
    pub format_changed: bool,
    /// Path of the file before the edit (kept on disk for undo)
    pub previous_path: String,
}

/// Generate a new versioned path for an image file.
///
/// Finds the next available version number by checking the filesystem,
/// so undo paths that are still on disk won't be overwritten.
///
/// Examples:
///   `photo.jpg` → `photo_v2.jpg` (if _v2 doesn't exist)
///   `photo_v2.jpg` → `photo_v3.jpg` (if _v3 doesn't exist)
///   `photo_v2.jpg` → `photo_v4.jpg` (if _v3 exists but _v4 doesn't)
fn next_version_path(path: &str, force_extension: Option<&str>) -> String {
    let p = Path::new(path);
    let ext =
        force_extension.unwrap_or_else(|| p.extension().and_then(|e| e.to_str()).unwrap_or(""));
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let dir = p.parent().unwrap_or(Path::new("."));

    // Parse existing version suffix: "photo" → (photo, 2), "photo_v2" → (photo, 3)
    let (base_stem, first_version) = if let Some(idx) = stem.rfind("_v") {
        let suffix = &stem[idx + 2..];
        if let Ok(v) = suffix.parse::<u32>() {
            (&stem[..idx], v + 1)
        } else {
            (stem, 2u32)
        }
    } else {
        (stem, 2u32)
    };

    // Find the next available version number
    let mut version = first_version;
    loop {
        let new_stem = format!("{}_v{}", base_stem, version);
        let new_filename = if !ext.is_empty() {
            format!("{}.{}", new_stem, ext)
        } else {
            new_stem
        };
        let new_path = dir.join(new_filename);
        if !new_path.exists() {
            return new_path.to_string_lossy().to_string();
        }
        version += 1;
    }
}

/// Crop an image to the specified pixel region.
///
/// Saves the result as a NEW versioned file (never in-place).
/// The original file is kept on disk for undo.
#[tauri::command]
pub fn crop_image(
    path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ImageEditResult, String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
    let (orig_w, orig_h) = img.dimensions();

    // Clamp crop region to image bounds
    let cx = x.min(orig_w);
    let cy = y.min(orig_h);
    let cw = width.min(orig_w.saturating_sub(cx));
    let ch = height.min(orig_h.saturating_sub(cy));

    if cw == 0 || ch == 0 {
        return Err("Crop region is outside image bounds or has zero dimensions".to_string());
    }

    // Use crop_imm to get a SubImage view, then copy to a new owned image
    let sub = img.crop_imm(cx, cy, cw, ch);
    let mut result = DynamicImage::new_rgba8(cw, ch);
    result
        .copy_from(&sub, 0, 0)
        .map_err(|e| format!("Failed to copy cropped region: {e}"))?;

    let new_path = next_version_path(&path, None);
    result
        .save(&new_path)
        .map_err(|e| format!("Failed to save cropped image: {e}"))?;

    Ok(ImageEditResult {
        path: new_path,
        width: cw,
        height: ch,
        format_changed: false,
        previous_path: path,
    })
}

/// Rotate an image 90° in the specified direction.
///
/// Saves the result as a NEW versioned file (never in-place).
/// The original file is kept on disk for undo.
///
/// - `"left"` = 90° counter-clockwise (270° CW)
/// - `"right"` = 90° clockwise
#[tauri::command]
pub fn rotate_image(path: String, direction: String) -> Result<ImageEditResult, String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;

    let rotated = match direction.as_str() {
        "left" => img.rotate270(), // 90° counter-clockwise
        "right" => img.rotate90(), // 90° clockwise
        _ => {
            return Err(format!(
                "Invalid direction: '{direction}'. Use 'left' or 'right'."
            ))
        }
    };

    let (w, h) = rotated.dimensions();
    let new_path = next_version_path(&path, None);
    rotated
        .save(&new_path)
        .map_err(|e| format!("Failed to save rotated image: {e}"))?;

    Ok(ImageEditResult {
        path: new_path,
        width: w,
        height: h,
        format_changed: false,
        previous_path: path,
    })
}

/// Erase (fill) a rectangular region of an image with a solid or transparent color.
///
/// Saves the result as a NEW versioned file (never in-place).
/// When `fill` is `"transparent"` and the source format doesn't support alpha
/// (e.g. JPEG), the output is converted to PNG.
/// The original file is kept on disk for undo.
#[tauri::command]
pub fn erase_region(
    path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    fill: String,
) -> Result<ImageEditResult, String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
    let (orig_w, orig_h) = img.dimensions();

    // Clamp region to image bounds
    let ex = x.min(orig_w);
    let ey = y.min(orig_h);
    let ew = width.min(orig_w.saturating_sub(ex));
    let eh = height.min(orig_h.saturating_sub(ey));

    if ew == 0 || eh == 0 {
        return Err("Erase region is outside image bounds or has zero dimensions".to_string());
    }

    // Determine if format supports alpha channel
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let supports_alpha = !matches!(ext.as_str(), "jpg" | "jpeg");
    let needs_conversion = fill == "transparent" && !supports_alpha;

    // Always work in RGBA for erase — ensures alpha channel exists
    let mut rgba_img = img.to_rgba8();

    // Determine fill colour
    let fill_color: Rgba<u8> = match fill.as_str() {
        "transparent" => Rgba([0, 0, 0, 0]),
        "white" => Rgba([255, 255, 255, 255]),
        "black" => Rgba([0, 0, 0, 255]),
        _ => {
            return Err(format!(
                "Invalid fill: '{fill}'. Use 'transparent', 'white', or 'black'."
            ))
        }
    };

    // Fill the region pixel-by-pixel
    for py in ey..ey + eh {
        for px in ex..ex + ew {
            rgba_img.put_pixel(px, py, fill_color);
        }
    }

    let (w, h) = rgba_img.dimensions();

    // Generate versioned path with the appropriate extension
    let forced_ext = if needs_conversion { Some("png") } else { None };
    let new_path = next_version_path(&path, forced_ext);

    let result = DynamicImage::ImageRgba8(rgba_img);
    if needs_conversion {
        result
            .save_with_format(&new_path, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to save image as PNG: {e}"))?;
    } else {
        result
            .save(&new_path)
            .map_err(|e| format!("Failed to save erased image: {e}"))?;
    }

    Ok(ImageEditResult {
        path: new_path,
        width: w,
        height: h,
        format_changed: needs_conversion,
        previous_path: path,
    })
}
