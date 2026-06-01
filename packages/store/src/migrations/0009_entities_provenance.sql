-- No-op migration that remains executable with `client.execute(...)`.
-- Provenance columns are guaranteed by the Rust-side schema guard and by
-- 0010_entities_type_expansion.sql, which rebuilds `entities` with source/model_name.
CREATE TEMP TABLE IF NOT EXISTS __entropia_migration_0009_noop (id INTEGER);
DROP TABLE IF EXISTS __entropia_migration_0009_noop;
