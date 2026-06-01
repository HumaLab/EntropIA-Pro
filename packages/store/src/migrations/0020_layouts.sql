CREATE TABLE IF NOT EXISTS layouts (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  regions TEXT NOT NULL,
  blocks TEXT NOT NULL,
  model TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

DELETE FROM layouts
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM layouts GROUP BY asset_id
);

CREATE INDEX IF NOT EXISTS idx_layouts_asset_id ON layouts(asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_layouts_asset_id_unique ON layouts(asset_id);
