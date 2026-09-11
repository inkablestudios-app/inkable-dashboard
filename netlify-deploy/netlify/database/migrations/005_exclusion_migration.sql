-- Marks a job as excluded from Reports financial totals — comped jobs,
-- personal projects, anything that happened but shouldn't count toward
-- the real business numbers. The job itself stays fully visible
-- everywhere else in the app; this only affects what Reports adds up.
--
-- Named is_excluded rather than "excluded" specifically to avoid any
-- collision with Postgres's own EXCLUDED pseudo-table used in the
-- ON CONFLICT DO UPDATE upsert in job-meta.js.
ALTER TABLE job_meta ADD COLUMN is_excluded BOOLEAN DEFAULT FALSE;
