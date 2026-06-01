use std::env;
use std::path::{Path, PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-env-changed=ENTROPIA_RUNTIME_BOOTSTRAP_MANIFEST_URL");
    println!("cargo:rerun-if-env-changed=ENTROPIA_RUNTIME_BOOTSTRAP_PUBLIC_KEY_ID");
    println!("cargo:rerun-if-env-changed=ENTROPIA_RUNTIME_BOOTSTRAP_PUBLIC_KEY_BASE64");

    ensure_windows_vc_runtime_glob_exists();
    stage_windows_vc_runtime();

    tauri_build::build()
}

fn ensure_windows_vc_runtime_glob_exists() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    if target_os != "windows" || target_env != "msvc" {
        return;
    }

    let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") else {
        return;
    };

    let placeholder_dir = PathBuf::from(manifest_dir)
        .join("target")
        .join("release")
        .join("vc-runtime");

    if let Err(error) = std::fs::create_dir_all(&placeholder_dir) {
        println!(
            "cargo:warning=Failed to create VC runtime placeholder dir {}: {error}",
            placeholder_dir.display()
        );
        return;
    }

    let placeholder = placeholder_dir.join(".gitkeep");
    if !placeholder.exists() {
        if let Err(error) = std::fs::write(&placeholder, b"") {
            println!(
                "cargo:warning=Failed to create VC runtime placeholder {}: {error}",
                placeholder.display()
            );
        }
    }
}

fn stage_windows_vc_runtime() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    let profile = env::var("PROFILE").unwrap_or_default();

    if target_os != "windows" || target_env != "msvc" || profile != "release" {
        return;
    }

    let Some(target_profile_dir) = target_profile_dir() else {
        println!("cargo:warning=Unable to resolve target profile dir for VC runtime staging");
        return;
    };

    let required = [
        "msvcp140.dll",
        "msvcp140_1.dll",
        "vcomp140.dll",
        "vcruntime140.dll",
        "vcruntime140_1.dll",
    ];
    let optional = ["concrt140.dll"];

    let mut target_vc_runtime_dirs = vec![target_profile_dir.join("vc-runtime")];

    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let manifest_dir = PathBuf::from(manifest_dir);
        if let Some(desktop_dir) = manifest_dir.parent() {
            target_vc_runtime_dirs.push(
                desktop_dir
                    .join("target")
                    .join("release")
                    .join("vc-runtime"),
            );
        }
        if let Some(repo_root) = manifest_dir.ancestors().nth(3) {
            target_vc_runtime_dirs
                .push(repo_root.join("target").join("release").join("vc-runtime"));
        }
    }

    for dll in required {
        for dir in &target_vc_runtime_dirs {
            stage_vc_runtime_dll(dll, dir, true);
        }
    }
    for dll in optional {
        for dir in &target_vc_runtime_dirs {
            stage_vc_runtime_dll(dll, dir, false);
        }
    }
}

fn target_profile_dir() -> Option<PathBuf> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").ok()?);
    out_dir.ancestors().nth(3).map(Path::to_path_buf)
}

fn stage_vc_runtime_dll(name: &str, target_vc_runtime_dir: &Path, required: bool) {
    let Some(source) = find_vc_runtime_dll(name) else {
        let message = format!(
            "Required VC runtime DLL {name} was not found; clean Windows installs will fail before EntropIA can start"
        );
        if required {
            panic!("{message}");
        }
        println!("cargo:warning={message}");
        return;
    };

    if let Err(error) = std::fs::create_dir_all(target_vc_runtime_dir) {
        let message = format!(
            "Failed to create VC runtime staging dir {}: {error}",
            target_vc_runtime_dir.display()
        );
        if required {
            panic!("{message}");
        }
        println!("cargo:warning={message}");
        return;
    }

    let destination = target_vc_runtime_dir.join(name);
    if let Err(error) = std::fs::copy(&source, &destination) {
        let message = format!(
            "Failed to stage VC runtime DLL {} from {} to {}: {error}",
            name,
            source.display(),
            destination.display()
        );
        if required {
            panic!("{message}");
        }
        println!("cargo:warning={message}");
    }
}

fn find_vc_runtime_dll(name: &str) -> Option<PathBuf> {
    if let Ok(dir) = env::var("ENTROPIA_VC_RUNTIME_DIR") {
        let candidate = PathBuf::from(dir).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    if let Ok(system_root) = env::var("WINDIR") {
        let candidate = PathBuf::from(system_root).join("System32").join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}
