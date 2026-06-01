CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('person','place','date','institution','organization','misc','custom')),
  value TEXT NOT NULL,
  start_offset INTEGER NOT NULL DEFAULT 0,
  end_offset INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_entities_item_id ON entities(item_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

-- Historical note: the legacy item-level `vec_items` virtual table used to be
-- created at runtime by Rust after sqlite-vec was loaded.
-- Reason: sqlite-vec must be loaded before vec0 tables can be created. SQLite migrations run
-- before extension loading, so CREATE VIRTUAL TABLE USING vec0 cannot be in a migration file.
