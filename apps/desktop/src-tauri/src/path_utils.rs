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

/// Canonicalize a path that must already exist and be a regular file.
///
/// Rejects empty paths, paths that cannot be canonicalized (broken or
/// nonexistent), and paths that resolve to something other than a file.
/// Returns the canonicalized path (on Windows this carries the `\\?\`
/// verbatim prefix — compare it only against other canonicalized paths).
pub fn validate_existing_file(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let canonical =
        std::fs::canonicalize(path).map_err(|e| format!("Failed to resolve path '{path}': {e}"))?;

    if !canonical.is_file() {
        return Err(format!("Path is not a file: {path}"));
    }

    Ok(canonical)
}

/// Canonicalize a path whose deepest components may not exist yet (e.g. an
/// output directory that will be created later).
///
/// The deepest existing ancestor is canonicalized with `std::fs::canonicalize`
/// and the remaining (missing) components are appended verbatim. Any `..` or
/// `.` remnant in the missing tail is refused — it cannot be resolved against
/// the filesystem, so it could only be a traversal attempt.
pub fn canonicalize_allowing_missing_tail(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    if path.as_os_str().is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let mut existing = path.to_path_buf();
    let mut missing_tail: Vec<std::ffi::OsString> = Vec::new();

    loop {
        match std::fs::canonicalize(&existing) {
            Ok(canonical) => {
                let mut resolved = canonical;
                for component in missing_tail.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(_) => {
                let Some(file_name) = existing.file_name() else {
                    return Err(format!(
                        "Failed to resolve path '{}': no existing ancestor",
                        path.display()
                    ));
                };
                missing_tail.push(file_name.to_os_string());
                if !existing.pop() {
                    return Err(format!(
                        "Failed to resolve path '{}': no existing ancestor",
                        path.display()
                    ));
                }
            }
        }
    }
}

/// Ensure `path` resolves inside `root` (which must exist).
///
/// Both sides are canonicalized before comparison so Windows `\\?\` verbatim
/// prefixes, symlinks, and `..` traversal are all resolved consistently.
/// `path` itself may have a missing tail (see
/// [`canonicalize_allowing_missing_tail`]), but missing components must not
/// contain `..` or `.` remnants. Returns the canonicalized path on success.
pub fn ensure_within_dir(
    path: impl AsRef<Path>,
    root: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let path = path.as_ref();
    let root = root.as_ref();

    let canonical_root = std::fs::canonicalize(root)
        .map_err(|e| format!("Failed to resolve directory '{}': {e}", root.display()))?;

    let canonical_path = canonicalize_allowing_missing_tail(path)?;

    if has_traversal_remnants(&canonical_path) {
        return Err(format!(
            "Path '{}' contains '..' traversal segments",
            path.display()
        ));
    }

    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "Path '{}' is outside the allowed directory '{}'",
            path.display(),
            root.display()
        ));
    }

    Ok(canonical_path)
}

/// True when a resolved path still carries `..`/`.` components. Canonicalized
/// prefixes never do; this only triggers for remnants in a missing tail.
fn has_traversal_remnants(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir | std::path::Component::CurDir
        )
    })
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

    #[test]
    fn validate_existing_file_accepts_real_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file_path = dir.path().join("asset.png");
        std::fs::write(&file_path, b"data").expect("write file");

        let canonical = validate_existing_file(&file_path.to_string_lossy())
            .expect("existing file should validate");
        assert!(canonical.is_file());
    }

    #[test]
    fn validate_existing_file_rejects_empty_missing_and_directories() {
        let dir = tempfile::tempdir().expect("tempdir");

        assert!(validate_existing_file("").is_err());
        assert!(validate_existing_file("   ").is_err());
        assert!(validate_existing_file(&dir.path().join("missing.png").to_string_lossy()).is_err());
        assert!(validate_existing_file(&dir.path().to_string_lossy()).is_err());
    }

    #[test]
    fn canonicalize_allowing_missing_tail_appends_missing_components() {
        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("assets").join("col-1").join("item-1");

        let resolved =
            canonicalize_allowing_missing_tail(&target).expect("missing tail should resolve");
        let canonical_root = std::fs::canonicalize(dir.path()).expect("canonicalize root");
        assert!(resolved.starts_with(&canonical_root));
        assert!(resolved.ends_with(Path::new("assets/col-1/item-1")));
    }

    #[test]
    fn ensure_within_dir_accepts_nested_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("assets").join("col-1");
        std::fs::create_dir_all(&nested).expect("create nested dirs");
        let file_path = nested.join("asset.png");
        std::fs::write(&file_path, b"data").expect("write file");

        assert!(ensure_within_dir(&file_path, dir.path()).is_ok());
        // A directory that does not exist yet is still in scope.
        assert!(ensure_within_dir(nested.join("item-9"), dir.path()).is_ok());
    }

    #[test]
    fn ensure_within_dir_rejects_outside_paths() {
        let root = tempfile::tempdir().expect("tempdir root");
        let other = tempfile::tempdir().expect("tempdir other");
        let outside_file = other.path().join("outside.png");
        std::fs::write(&outside_file, b"data").expect("write file");

        assert!(ensure_within_dir(&outside_file, root.path()).is_err());
    }

    #[test]
    fn ensure_within_dir_rejects_traversal() {
        let root = tempfile::tempdir().expect("tempdir root");
        let nested = root.path().join("assets");
        std::fs::create_dir_all(&nested).expect("create nested dir");

        // Resolvable `..` components escape the root — caught by the scope check.
        let escape = nested.join("..").join("..");
        assert!(ensure_within_dir(&escape, root.path()).is_err());

        // `..` after a missing component cannot be resolved against the
        // filesystem — refused outright as a traversal remnant.
        let missing_escape = nested.join("ghost").join("phantom").join("..").join("evil");
        assert!(ensure_within_dir(&missing_escape, root.path()).is_err());
    }
}
