-- Client email address, used by the "Email link" button in a job's window.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
