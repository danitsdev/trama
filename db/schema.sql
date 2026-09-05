CREATE TABLE IF NOT EXISTS trama_puzzles (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trama_puzzles ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE trama_puzzles ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';

UPDATE trama_puzzles
SET title = COALESCE(payload::jsonb ->> 'title', ''),
    author = COALESCE(payload::jsonb ->> 'author', '')
WHERE title = '';

CREATE INDEX IF NOT EXISTS trama_puzzles_created_at_idx
  ON trama_puzzles (created_at DESC);
