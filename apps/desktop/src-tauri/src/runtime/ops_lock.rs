use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

const DEFAULT_WAIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);
const WAIT_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(200);

static RUNTIME_DEPS_OP_LOCK: OnceLock<AtomicBool> = OnceLock::new();

pub(crate) struct RuntimeDepsOperationGuard {
    lock: &'static AtomicBool,
}

pub(crate) fn try_acquire(operation: &str) -> Result<RuntimeDepsOperationGuard, String> {
    let lock = RUNTIME_DEPS_OP_LOCK.get_or_init(|| AtomicBool::new(false));
    acquire_now(lock, operation)
}

pub(crate) async fn acquire_with_timeout(
    operation: &str,
) -> Result<RuntimeDepsOperationGuard, String> {
    let lock = RUNTIME_DEPS_OP_LOCK.get_or_init(|| AtomicBool::new(false));
    let started_at = std::time::Instant::now();

    loop {
        match acquire_now(lock, operation) {
            Ok(guard) => return Ok(guard),
            Err(_) if started_at.elapsed() < DEFAULT_WAIT_TIMEOUT => {
                tokio::time::sleep(WAIT_POLL_INTERVAL).await;
            }
            Err(_) => {
                return Err(format!(
                    "Otra operación de runtime/dependencias sigue en curso después de {}s. Esperá a que termine antes de iniciar `{operation}`.",
                    DEFAULT_WAIT_TIMEOUT.as_secs()
                ));
            }
        }
    }
}

fn acquire_now(
    lock: &'static AtomicBool,
    operation: &str,
) -> Result<RuntimeDepsOperationGuard, String> {
    if lock
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_ok()
    {
        Ok(RuntimeDepsOperationGuard { lock })
    } else {
        Err(format!(
            "Ya hay una operación de runtime/dependencias en curso. Esperá a que termine antes de iniciar `{operation}`."
        ))
    }
}

impl Drop for RuntimeDepsOperationGuard {
    fn drop(&mut self) {
        self.lock.store(false, Ordering::Release);
    }
}
