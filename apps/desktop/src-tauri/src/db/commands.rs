use rusqlite::types::Value;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

use crate::db::state::AppDbState;

const DB_BROWSER_HIDDEN_TABLES: &[&str] = &["app_settings", "_migrations", "fts_items"];
const DB_BROWSER_CANDIDATE_TABLES: &[&str] = &[
    "collections",
    "items",
    "assets",
    "notes",
    "extractions",
    "transcriptions",
    "entities",
    "triples",
    "topics",
    "item_topics",
    "vec_assets",
    "layouts",
    "llm_results",
    "annotations",
];

#[derive(Serialize)]
pub struct ExecuteResult {
    pub rows_affected: u64,
}

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DbBrowserTableInfo {
    pub name: String,
}

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DbBrowserColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbBrowserQueryResponse {
    pub table: String,
    pub page: u32,
    pub page_size: u32,
    pub total: u64,
    pub rows: Vec<serde_json::Value>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbBrowserQueryRequest {
    pub table: String,
    pub page: u32,
    pub page_size: u32,
    pub sort_column: Option<String>,
    pub sort_direction: Option<String>,
    pub search: Option<String>,
}

/// Execute multiple SQL statements atomically within a transaction.
/// Used for cascade deletes and other multi-statement operations.
#[tauri::command]
pub fn db_execute_batch(db: State<'_, AppDbState>, sql: String) -> Result<(), String> {
    validate_sql_batch(&sql)?;
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_execute(
    db: State<'_, AppDbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<ExecuteResult, String> {
    validate_sql_execute(&sql)?;
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    let params_ref: Vec<Box<dyn rusqlite::ToSql>> = params.iter().map(json_to_sql_param).collect();
    let params_as_refs: Vec<&dyn rusqlite::ToSql> = params_ref.iter().map(|b| b.as_ref()).collect();
    let rows_affected = conn
        .execute(&sql, params_as_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(ExecuteResult {
        rows_affected: rows_affected as u64,
    })
}

#[tauri::command]
pub fn db_select(
    db: State<'_, AppDbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    validate_sql_row_query(&sql)?;
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    let params_ref: Vec<Box<dyn rusqlite::ToSql>> = params.iter().map(json_to_sql_param).collect();
    let params_as_refs: Vec<&dyn rusqlite::ToSql> = params_ref.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    let rows = stmt
        .query_map(params_as_refs.as_slice(), |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in col_names.iter().enumerate() {
                let val: Value = row.get(i)?;
                map.insert(name.clone(), rusqlite_value_to_json(val));
            }
            Ok(serde_json::Value::Object(map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Returns rows as arrays in column order — required by Drizzle sqlite-proxy
/// to guarantee correct column mapping (Object.values() order is not guaranteed).
#[tauri::command]
pub fn db_select_rows(
    db: State<'_, AppDbState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<Vec<serde_json::Value>>, String> {
    validate_sql_row_query(&sql)?;
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    let params_ref: Vec<Box<dyn rusqlite::ToSql>> = params.iter().map(json_to_sql_param).collect();
    let params_as_refs: Vec<&dyn rusqlite::ToSql> = params_ref.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();

    let rows = stmt
        .query_map(params_as_refs.as_slice(), |row| {
            let mut values = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: Value = row.get(i)?;
                values.push(rusqlite_value_to_json(val));
            }
            Ok(values)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn db_browser_list_tables(
    db: State<'_, AppDbState>,
) -> Result<Vec<DbBrowserTableInfo>, String> {
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    list_db_browser_tables(&conn)
}

#[tauri::command]
pub fn db_browser_describe_table(
    db: State<'_, AppDbState>,
    table: String,
) -> Result<Vec<DbBrowserColumnInfo>, String> {
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    describe_db_browser_table(&conn, &table)
}

#[tauri::command]
pub fn db_browser_query_rows(
    db: State<'_, AppDbState>,
    table: String,
    page: u32,
    page_size: u32,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    search: Option<String>,
) -> Result<DbBrowserQueryResponse, String> {
    let conn = db.ui_conn.lock().map_err(|e| e.to_string())?;
    query_db_browser_rows(
        &conn,
        DbBrowserQueryRequest {
            table,
            page,
            page_size,
            sort_column,
            sort_direction,
            search,
        },
    )
}

fn list_db_browser_tables(conn: &Connection) -> Result<Vec<DbBrowserTableInfo>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
        .map_err(|e| format!("Failed to inspect sqlite schema: {e}"))?;

    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query sqlite schema: {e}"))?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|e| format!("Failed to read sqlite schema: {e}"))?;

    Ok(DB_BROWSER_CANDIDATE_TABLES
        .iter()
        .filter(|table| !DB_BROWSER_HIDDEN_TABLES.contains(table) && names.contains(**table))
        .map(|name| DbBrowserTableInfo {
            name: (*name).to_string(),
        })
        .collect())
}

fn describe_db_browser_table(
    conn: &Connection,
    table: &str,
) -> Result<Vec<DbBrowserColumnInfo>, String> {
    ensure_db_browser_table_allowed(conn, table)?;

    let sql = format!("PRAGMA table_info({})", quote_identifier(table));
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to inspect table '{table}': {e}"))?;

    let columns = stmt
        .query_map([], |row| {
            Ok(DbBrowserColumnInfo {
                name: row.get::<_, String>(1)?,
                data_type: row.get::<_, String>(2).unwrap_or_default(),
                nullable: row.get::<_, i64>(3)? == 0,
                is_primary_key: row.get::<_, i64>(5)? > 0,
            })
        })
        .map_err(|e| format!("Failed to read columns for '{table}': {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect columns for '{table}': {e}"))?;

    if columns.is_empty() {
        return Err(format!("Table '{table}' has no browsable columns"));
    }

    Ok(columns)
}

fn query_db_browser_rows(
    conn: &Connection,
    request: DbBrowserQueryRequest,
) -> Result<DbBrowserQueryResponse, String> {
    let table = request.table.trim();
    let columns = describe_db_browser_table(conn, table)?;
    let column_names: Vec<String> = columns.iter().map(|column| column.name.clone()).collect();
    let sort_column = request
        .sort_column
        .as_deref()
        .filter(|name| column_names.iter().any(|column| column == name))
        .map(str::to_string)
        .unwrap_or_else(|| {
            columns
                .iter()
                .find(|column| column.is_primary_key)
                .map(|column| column.name.clone())
                .unwrap_or_else(|| column_names[0].clone())
        });
    let sort_direction = parse_sort_direction(request.sort_direction.as_deref());
    let page_size = request.page_size.clamp(1, 100);
    let page = request.page.max(1);
    let offset = (page.saturating_sub(1) as i64) * (page_size as i64);
    let search = request.search.unwrap_or_default().trim().to_string();
    let quoted_table = quote_identifier(table);
    let quoted_sort_column = quote_identifier(&sort_column);

    let search_clause = if search.is_empty() {
        String::new()
    } else {
        let clauses = column_names
            .iter()
            .map(|column| {
                format!(
                    "CAST({} AS TEXT) LIKE ?1 COLLATE NOCASE",
                    quote_identifier(column)
                )
            })
            .collect::<Vec<_>>()
            .join(" OR ");
        format!(" WHERE {clauses}")
    };

    let total_sql = format!("SELECT COUNT(*) FROM {quoted_table}{search_clause}");
    let data_sql = format!(
        "SELECT * FROM {quoted_table}{search_clause} ORDER BY {quoted_sort_column} {sort_direction} LIMIT ?{} OFFSET ?{}",
        if search.is_empty() { "1" } else { "2" },
        if search.is_empty() { "2" } else { "3" }
    );

    let total = if search.is_empty() {
        conn.query_row(&total_sql, [], |row| row.get::<_, i64>(0))
    } else {
        let pattern = format!("%{search}%");
        conn.query_row(&total_sql, rusqlite::params![pattern], |row| {
            row.get::<_, i64>(0)
        })
    }
    .map_err(|e| format!("Failed to count rows for '{table}': {e}"))?
    .max(0) as u64;

    let mut stmt = conn
        .prepare(&data_sql)
        .map_err(|e| format!("Failed to prepare rows query for '{table}': {e}"))?;

    let rows = if search.is_empty() {
        stmt.query_map(rusqlite::params![page_size as i64, offset], |row| {
            Ok(row_to_json(row, &column_names))
        })
        .map_err(|e| format!("Failed to query rows for '{table}': {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect rows for '{table}': {e}"))?
    } else {
        let pattern = format!("%{search}%");
        stmt.query_map(
            rusqlite::params![pattern, page_size as i64, offset],
            |row| Ok(row_to_json(row, &column_names)),
        )
        .map_err(|e| format!("Failed to query rows for '{table}': {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect rows for '{table}': {e}"))?
    };

    Ok(DbBrowserQueryResponse {
        table: table.to_string(),
        page,
        page_size,
        total,
        rows,
    })
}

fn row_to_json(row: &rusqlite::Row<'_>, column_names: &[String]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (index, name) in column_names.iter().enumerate() {
        let value = row.get::<_, Value>(index).unwrap_or(Value::Null);
        map.insert(name.clone(), rusqlite_value_to_json(value));
    }
    serde_json::Value::Object(map)
}

fn ensure_db_browser_table_allowed(conn: &Connection, table: &str) -> Result<(), String> {
    if !is_safe_identifier(table) {
        return Err("Invalid table name".to_string());
    }

    let allowed = list_db_browser_tables(conn)?;
    if allowed.iter().any(|candidate| candidate.name == table) {
        Ok(())
    } else {
        Err(format!(
            "Table '{table}' is not available in the DB browser"
        ))
    }
}

fn is_safe_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() || first == '_' => {}
        _ => return false,
    }

    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn quote_identifier(value: &str) -> String {
    format!("\"{value}\"")
}

fn parse_sort_direction(value: Option<&str>) -> &'static str {
    match value.unwrap_or("asc").to_ascii_lowercase().as_str() {
        "desc" => "DESC",
        _ => "ASC",
    }
}

fn json_to_sql_param(val: &serde_json::Value) -> Box<dyn rusqlite::ToSql> {
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

fn rusqlite_value_to_json(val: Value) -> serde_json::Value {
    match val {
        Value::Null => serde_json::Value::Null,
        Value::Integer(i) => serde_json::Value::Number(i.into()),
        Value::Real(f) => serde_json::json!(f),
        Value::Text(s) => serde_json::Value::String(s),
        Value::Blob(b) => serde_json::Value::String(base64_encode(&b)),
    }
}

fn base64_encode(data: &[u8]) -> String {
    // Simple base64 without external crate
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 {
            chunk[1] as usize
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            chunk[2] as usize
        } else {
            0
        };
        result.push(CHARS[b0 >> 2] as char);
        result.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((b1 & 15) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[b2 & 63] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn normalize_sql(sql: &str) -> String {
    sql.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn validate_sql_row_query(sql: &str) -> Result<(), String> {
    let normalized = normalize_sql(sql);

    if normalized.contains(';') {
        return Err("db_select/db_select_rows accept only a single SQL statement".to_string());
    }

    for forbidden in ["pragma ", "attach ", "detach ", "vacuum "] {
        if normalized.starts_with(forbidden) || normalized.contains(&format!(" {forbidden}")) {
            return Err("Restricted SQL statement for db_select/db_select_rows".to_string());
        }
    }

    if normalized.starts_with("select ") || normalized.starts_with("with ") {
        return Ok(());
    }

    let is_dml = normalized.starts_with("insert ")
        || normalized.starts_with("update ")
        || normalized.starts_with("delete ");

    if is_dml && normalized.contains(" returning ") {
        return Ok(());
    }

    Err(
        "Only row-returning queries (SELECT/WITH or DML with RETURNING) are allowed in db_select/db_select_rows"
            .to_string(),
    )
}

fn validate_sql_execute(sql: &str) -> Result<(), String> {
    let normalized = normalize_sql(sql);
    if normalized.contains(';') {
        return Err("db_execute accepts only a single SQL statement".to_string());
    }
    if normalized.starts_with("pragma ")
        || normalized.starts_with("attach ")
        || normalized.starts_with("detach ")
        || normalized.starts_with("vacuum ")
    {
        return Err("Restricted SQL statement for db_execute".to_string());
    }
    Ok(())
}

fn validate_sql_batch(sql: &str) -> Result<(), String> {
    let normalized = normalize_sql(sql);
    for forbidden in ["attach ", "detach ", "vacuum ", "pragma "] {
        if normalized.contains(forbidden) {
            return Err("Restricted SQL statement in db_execute_batch".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db_browser_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(
            r#"
            CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT NOT NULL, collection_id TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO collections (id, name, created_at) VALUES
                ('col-1', 'Archivo histórico', 10),
                ('col-2', 'Fotografías', 20);
            INSERT INTO items (id, title, collection_id, created_at) VALUES
                ('item-1', 'Acta fundacional', 'col-1', 10),
                ('item-2', 'Carta manuscrita', 'col-1', 20);
            "#,
        )
        .expect("test schema should be created");
        conn
    }

    #[test]
    fn db_browser_list_tables_excludes_sensitive_tables() {
        let conn = setup_db_browser_test_db();

        let tables = list_db_browser_tables(&conn).unwrap();
        let names: Vec<String> = tables.into_iter().map(|table| table.name).collect();

        assert!(names.contains(&"collections".to_string()));
        assert!(names.contains(&"items".to_string()));
        assert!(!names.contains(&"app_settings".to_string()));
    }

    #[test]
    fn db_browser_query_rows_rejects_invalid_identifier() {
        let conn = setup_db_browser_test_db();

        let result = query_db_browser_rows(
            &conn,
            DbBrowserQueryRequest {
                table: "collections; DROP TABLE items".to_string(),
                page: 1,
                page_size: 25,
                sort_column: None,
                sort_direction: None,
                search: None,
            },
        );

        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), "Invalid table name");
    }

    #[test]
    fn db_browser_query_rows_applies_search_sort_and_pagination() {
        let conn = setup_db_browser_test_db();

        let response = query_db_browser_rows(
            &conn,
            DbBrowserQueryRequest {
                table: "collections".to_string(),
                page: 1,
                page_size: 1,
                sort_column: Some("name".to_string()),
                sort_direction: Some("desc".to_string()),
                search: Some("a".to_string()),
            },
        )
        .unwrap();

        assert_eq!(response.total, 2);
        assert_eq!(response.rows.len(), 1);
        assert_eq!(
            response.rows[0]["name"],
            serde_json::Value::String("Fotografías".to_string())
        );
    }
}
