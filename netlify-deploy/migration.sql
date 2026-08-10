-- Inkable Studios Dashboard — initial schema.
-- Mirrors the four localStorage keys the app already uses, so migrating
-- data over is a straight mapping, not a redesign.

CREATE TABLE clients (
  id TEXT PRIMARY KEY,              -- keeps the existing 'cl_...' ids from localStorage
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  log JSONB DEFAULT '[]',           -- communication log entries, same shape as today
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,              -- keeps the existing Date.now()-based ids
  name TEXT,
  est_no TEXT,
  project_num TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  saved_at TEXT,
  doc_type TEXT DEFAULT 'estimate',
  state JSONB NOT NULL,             -- the full pricerData/form blob, unchanged shape
  exported_pdfs JSONB DEFAULT '{}', -- estimate/invoice/receipt snapshots
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_projects_client_id ON projects(client_id);

CREATE TABLE job_meta (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'send',
  tags JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  install_date TEXT DEFAULT '',
  proof_link TEXT DEFAULT '',
  payments JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pricing_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,  -- single-row table, one shop's settings
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
