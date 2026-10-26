-- Per-client pricing and billing settings (tax-exempt + certificate, discount,
-- deposit, payment terms, estimate terms), as one JSON object.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS prefs JSONB DEFAULT '{}'::jsonb;
