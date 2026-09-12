-- Powers the client-facing proof approval page. This is intentionally a
-- separate table from job_meta — the public page that reads/writes here
-- has NO login and NO auth token, so it must only ever be able to touch
-- exactly one project (the one tied to its specific token), never browse
-- or affect anything else.
--
-- The token is tied to the PROJECT, not to any single proof upload — the
-- same link keeps working even after the proof file gets replaced, always
-- showing whatever is currently uploaded.
CREATE TABLE proof_shares (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  response TEXT,              -- 'approved' | 'changes' | null (no response yet)
  response_note TEXT DEFAULT '',
  response_at TIMESTAMPTZ
);
