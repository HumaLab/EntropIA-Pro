//! Shared SQL helpers used by the DB browser commands.
//!
//! These were promoted verbatim from `db/commands.rs` private scope so other
//! call sites can reuse the exact same identifier validation/quoting and
//! JSON→SQL parameter binding without duplicating behavior.

/// Returns true when `value` is a safe SQL identifier: it must start with an
/// ASCII letter or underscore and contain only ASCII alphanumerics or
/// underscores. Mirrors the `^[A-Za-z_][A-Za-z0-9_]*$` contract used before any
/// identifier is interpolated into SQL.
pub fn is_safe_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() || first == '_' => {}
        _ => return false,
    }

    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

/// Wraps an identifier in double quotes for safe interpolation. Callers MUST
/// validate with [`is_safe_identifier`] first; this only adds the quoting.
pub fn quote_identifier(value: &str) -> String {
    format!("\"{value}\"")
}

/// Converts a JSON value into a boxed rusqlite parameter. Numbers prefer i64,
/// fall back to f64; booleans bind as 0/1; null binds as SQL NULL; everything
/// non-scalar (arrays/objects) is serialized back to its JSON string form.
pub fn json_to_sql_param(val: &serde_json::Value) -> Box<dyn rusqlite::ToSql> {
    match val {
        serde_json::Value::Null => Box::new(rusqlite::types::Null),
        serde_json::Value::Bool(b) => Box::new(*b as i64),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(rusqlite::types::Null)
            }
        }
        serde_json::Value::String(s) => Box::new(s.clone()),
        other => Box::new(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_safe_identifier_accepts_valid_table_names() {
        assert!(is_safe_identifier("items"));
        assert!(is_safe_identifier("_migrations"));
        assert!(is_safe_identifier("rag_conversations"));
        assert!(is_safe_identifier("Col1"));
    }

    #[test]
    fn is_safe_identifier_rejects_injection_attempts() {
        assert!(!is_safe_identifier(""));
        assert!(!is_safe_identifier("1items"));
        assert!(!is_safe_identifier("items; DROP TABLE x"));
        assert!(!is_safe_identifier("items x"));
        assert!(!is_safe_identifier("\"items\""));
        assert!(!is_safe_identifier("tablé"));
    }

    #[test]
    fn quote_identifier_wraps_in_double_quotes() {
        assert_eq!(quote_identifier("items"), "\"items\"");
    }

    #[test]
    fn json_to_sql_param_binds_scalars_and_serializes_containers() {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        let cases: Vec<(serde_json::Value, &str)> = vec![
            (serde_json::Value::Null, "NULL"),
            (serde_json::json!(true), "1"),
            (serde_json::json!(42), "42"),
            (serde_json::json!(1.5), "1.5"),
            (serde_json::json!("hola"), "hola"),
            (serde_json::json!([1, 2]), "[1,2]"),
            (serde_json::json!({"a": 1}), "{\"a\":1}"),
        ];
        for (value, expected) in cases {
            let param = json_to_sql_param(&value);
            let rendered: String = conn
                .query_row("SELECT CAST(?1 AS TEXT)", [param.as_ref()], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .expect("query")
                .unwrap_or_else(|| "NULL".to_string());
            assert_eq!(rendered, expected, "value {value:?}");
        }
    }
}
