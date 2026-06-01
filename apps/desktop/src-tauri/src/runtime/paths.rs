use std::path::{Path, PathBuf};

pub fn current_runtime_platform() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub fn runtime_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("runtime")
}

pub fn managed_pack_dir(app_data_dir: &Path, pack_version: &str) -> PathBuf {
    runtime_root(app_data_dir).join(pack_version)
}

pub fn managed_venv_dir(managed_root: &Path) -> PathBuf {
    managed_root.join("venv").join("entropia-env")
}

pub fn managed_venv_python_path(managed_root: &Path) -> PathBuf {
    let venv_dir = managed_venv_dir(managed_root);
    if cfg!(windows) {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        venv_dir.join("bin").join("python")
    }
}

pub fn managed_wheelhouse_dir(managed_root: &Path) -> PathBuf {
    managed_root.join("wheelhouse")
}

pub fn managed_scripts_dir(managed_root: &Path) -> PathBuf {
    managed_root.join("scripts")
}

pub fn managed_script_path(managed_root: &Path, script_name: &str) -> PathBuf {
    managed_scripts_dir(managed_root).join(script_name)
}

pub fn managed_hf_cache_dir(managed_root: &Path) -> PathBuf {
    managed_root.join("caches").join("hf")
}

pub fn managed_paddlex_cache_dir(managed_root: &Path) -> PathBuf {
    managed_root.join("caches").join("paddlex")
}

pub fn managed_resource_path(managed_root: &Path, relative_path: &str) -> PathBuf {
    managed_root.join("resources").join(relative_path)
}

pub fn managed_entry_path(managed_root: &Path, relpath: &str) -> PathBuf {
    managed_root.join(relpath)
}

pub fn staging_pack_dir(app_data_dir: &Path, pack_version: &str) -> PathBuf {
    runtime_root(app_data_dir).join(format!(".{pack_version}.staging"))
}

pub fn stage_marker_path(app_data_dir: &Path, pack_version: &str) -> PathBuf {
    runtime_root(app_data_dir).join(format!(".{pack_version}.stage.json"))
}

pub fn ensure_executable_bit(_path: &Path, _executable: bool) -> Result<(), String> {
    #[cfg(unix)]
    {
        if _executable {
            use std::os::unix::fs::PermissionsExt;

            let metadata = std::fs::metadata(_path).map_err(|error| {
                format!("Failed to read metadata for {}: {error}", _path.display())
            })?;
            let mut permissions = metadata.permissions();
            permissions.set_mode(permissions.mode() | 0o755);
            std::fs::set_permissions(_path, permissions).map_err(|error| {
                format!(
                    "Failed to set executable bit for {}: {error}",
                    _path.display()
                )
            })?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use tempfile::tempdir;

    #[test]
    fn computes_stable_runtime_layout_paths() {
        let app_data = PathBuf::from("/tmp/entropia-data");
        let managed_root = managed_pack_dir(&app_data, "2026.05.0");

        assert_eq!(runtime_root(&app_data), app_data.join("runtime"));
        assert_eq!(managed_root, app_data.join("runtime").join("2026.05.0"));
        assert_eq!(
            stage_marker_path(&app_data, "2026.05.0"),
            app_data.join("runtime").join(".2026.05.0.stage.json")
        );
        assert_eq!(
            managed_venv_dir(&managed_root),
            managed_root.join("venv").join("entropia-env")
        );
        assert_eq!(
            managed_wheelhouse_dir(&managed_root),
            managed_root.join("wheelhouse")
        );
    }

    #[test]
    fn managed_runtime_binary_paths_follow_platform_conventions() {
        let managed_root = PathBuf::from("/tmp/entropia-data/runtime/2026.05.0");

        let venv_python = managed_venv_python_path(&managed_root);
        if cfg!(windows) {
            assert_eq!(
                venv_python.file_name().and_then(|name| name.to_str()),
                Some("python.exe")
            );
            assert_eq!(
                venv_python
                    .parent()
                    .and_then(|path| path.file_name())
                    .and_then(|name| name.to_str()),
                Some("Scripts")
            );
        } else {
            assert!(venv_python.to_string_lossy().ends_with("bin/python"));
        }
    }

    #[test]
    fn managed_runtime_cache_and_script_paths_follow_conventions() {
        let managed_root = PathBuf::from("/tmp/entropia-data/runtime/2026.05.0");

        assert_eq!(
            managed_scripts_dir(&managed_root),
            managed_root.join("scripts")
        );
        assert_eq!(
            managed_script_path(&managed_root, "transcribe.py"),
            managed_root.join("scripts").join("transcribe.py")
        );
        assert_eq!(
            managed_hf_cache_dir(&managed_root),
            managed_root.join("caches").join("hf")
        );
        assert_eq!(
            managed_paddlex_cache_dir(&managed_root),
            managed_root.join("caches").join("paddlex")
        );
        assert_eq!(
            managed_resource_path(&managed_root, "models/ocr"),
            managed_root.join("resources").join("models").join("ocr")
        );
    }

    #[test]
    fn current_platform_contains_os_and_arch() {
        let platform = current_runtime_platform();

        assert!(platform.contains(std::env::consts::OS));
        assert!(platform.contains(std::env::consts::ARCH));
    }

    #[cfg(unix)]
    #[test]
    fn ensures_executable_bit_for_marked_files() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempdir().expect("temp dir");
        let binary = dir.path().join("uv");
        fs::write(&binary, "uv").expect("write file");
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o644)).expect("set perms");

        ensure_executable_bit(&binary, true).expect("set exec bit");

        let mode = fs::metadata(&binary)
            .expect("metadata")
            .permissions()
            .mode();
        assert_ne!(mode & 0o111, 0, "expected executable bit to be set");
    }
}
