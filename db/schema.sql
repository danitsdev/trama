CREATE TABLE IF NOT EXISTS trama_puzzles (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trama_puzzles_created_at_idx
  ON trama_puzzles (created_at DESC);
