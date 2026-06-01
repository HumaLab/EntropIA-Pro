use std::path::{Path, PathBuf};

/// Normalize Windows extended-length paths (`\\?\`) into plain filesystem paths.
///
/// Tauri resource resolution may return extended-length paths on Windows. Those
/// work for many Rust APIs, but they are noisy in logs and can confuse some
/// subprocesses/native libraries. On non-Windows platforms this is a no-op.
pub fn normalize_windows_path(path: impl AsRef<Path>) -> PathBuf {
    #[cfg(windows)]
    {
        let s = path.as_ref().to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }

    path.as_ref().to_path_buf()
}

pub fn normalize_windows_path_string(path: impl AsRef<Path>) -> String {
    normalize_windows_path(path).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_plain_paths_unchanged() {
        let path = PathBuf::from(r"C:\tmp\file.txt");
        assert_eq!(normalize_windows_path(&path), path);
    }

    #[test]
    fn strips_windows_extended_prefix() {
        #[cfg(windows)]
        {
            let path = PathBuf::from(r"\\?\C:\tmp\file.txt");
            assert_eq!(
                normalize_windows_path(path),
                PathBuf::from(r"C:\tmp\file.txt")
            );
        }
    }
}
