CREATE TABLE IF NOT EXISTS vec_assets(
  asset_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  embedding BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vec_assets_item_id ON vec_assets(item_id);
