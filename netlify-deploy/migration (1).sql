-- Single-row table holding the one shared password (hashed + salted,
-- never stored in plain text). Same single-row pattern as pricing_settings.
CREATE TABLE app_auth (
  id INTEGER PRIMARY KEY DEFAULT 1,
  password_hash TEXT,
  password_salt TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
