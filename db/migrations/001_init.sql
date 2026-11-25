CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  model_base_url TEXT,
  model_name TEXT,
  model_api_key_enc BLOB,
  search_base_url TEXT,
  search_model TEXT,
  search_api_key_enc BLOB,
  theme TEXT NOT NULL DEFAULT 'light',
  reading_size REAL NOT NULL DEFAULT 1,
  presets_linked INTEGER NOT NULL DEFAULT 0,
  selection_presets TEXT,
  followup_presets TEXT
);

CREATE TABLE IF NOT EXISTS burrows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  viewport TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  burrow_id TEXT NOT NULL REFERENCES burrows(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  followups TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nodes_by_burrow ON nodes(burrow_id, parent_id);
CREATE INDEX IF NOT EXISTS nodes_by_delete ON nodes(deleted_at);

CREATE INDEX IF NOT EXISTS burrows_by_user ON burrows(user_id, created_at);

-- Titles are unique per owner, case-insensitively. Different users may share one.
CREATE UNIQUE INDEX IF NOT EXISTS burrows_unique_title ON burrows(user_id, lower(title));

-- One row per login. The cookie carries `id.secret`; only sha256(secret) is stored.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_by_user ON refresh_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS push_subscriptions_by_user ON push_subscriptions(user_id);
