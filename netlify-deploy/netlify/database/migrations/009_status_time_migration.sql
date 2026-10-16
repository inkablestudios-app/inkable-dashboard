-- When the job's status last changed (milliseconds since 1970), from
-- whichever side changed it: the Dashboard or the client approving /
-- requesting changes on their page. A save carrying an OLDER status time
-- (e.g. from a Dashboard tab that hadn't synced yet) no longer puts the
-- status back.
ALTER TABLE job_meta ADD COLUMN IF NOT EXISTS status_at BIGINT DEFAULT 0;
