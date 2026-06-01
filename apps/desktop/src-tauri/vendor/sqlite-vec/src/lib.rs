use rusqlite::{ffi::sqlite3_auto_extension, Connection};

/// No-op sqlite-vec loader used only on Windows until upstream crate fixes
/// MSVC build packaging (`sqlite-vec-diskann.c` missing in 0.1.10-alpha.3).
///
/// We intentionally degrade embedding vector-table support and let callers
/// continue with graceful fallback paths.
pub fn load(_conn: &Connection) -> Result<(), String> {
    unsafe {
        sqlite3_auto_extension(None);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_returns_ok_for_in_memory_connection() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let result = load(&conn);
        assert!(result.is_ok(), "Windows shim must not fail startup path");
    }

    #[test]
    fn load_is_idempotent() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        assert!(load(&conn).is_ok());
        assert!(load(&conn).is_ok());
    }
}
