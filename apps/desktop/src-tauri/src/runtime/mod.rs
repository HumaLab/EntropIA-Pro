pub mod bootstrap;
pub mod download;
pub mod manager;
pub mod manifest;
pub(crate) mod ops_lock;
pub mod paths;
pub mod status;

pub use manager::RuntimeManager;
pub use paths::{
    managed_entry_path, managed_hf_cache_dir, managed_paddlex_cache_dir, managed_resource_path,
    managed_script_path, managed_venv_dir, managed_venv_python_path, managed_wheelhouse_dir,
};

#[tauri::command]
pub fn runtime_get_status(app_handle: tauri::AppHandle) -> Result<status::RuntimeStatus, String> {
    RuntimeManager::new().status(&app_handle)
}

#[tauri::command]
pub fn runtime_get_bootstrap_plan(
    app_handle: tauri::AppHandle,
) -> Result<bootstrap::BootstrapPlan, String> {
    RuntimeManager::new().bootstrap_plan(&app_handle)
}

#[tauri::command]
pub fn runtime_repair(app_handle: tauri::AppHandle) -> Result<status::RuntimeStatus, String> {
    let _guard = ops_lock::try_acquire("runtime_repair")?;
    RuntimeManager::new().repair(&app_handle)
}
