-- Real costs recorded against a job after pricing, for when production
-- drifts from the original estimate (extra materials, unplanned hardware,
-- a sub charging more than quoted). Same pattern as the existing payments
-- column — a JSONB array of {id, description, amount, date} entries.
ALTER TABLE job_meta ADD COLUMN expenses JSONB DEFAULT '[]';
