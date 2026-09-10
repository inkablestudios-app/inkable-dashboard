-- Track where a client came from — referral, social media, walk-in, etc.
-- Optional, defaults to empty so existing clients aren't affected.
ALTER TABLE clients ADD COLUMN lead_source TEXT DEFAULT '';
