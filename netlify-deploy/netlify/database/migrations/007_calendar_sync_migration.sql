-- Supports Google Calendar sync for install dates.
--
-- install_time is optional — a job with a date but no time syncs as an
-- all-day calendar event. calendar_event_id tracks the Google Calendar
-- event tied to this job, so a later date/time change updates the SAME
-- event instead of creating a duplicate, and clearing the date removes
-- it cleanly instead of leaving a stale event behind.
ALTER TABLE job_meta ADD COLUMN install_time TEXT DEFAULT '';
ALTER TABLE job_meta ADD COLUMN calendar_event_id TEXT DEFAULT '';
