-- estimate_visual_link: a Drive file (usually a PDF) of estimate graphics,
-- e.g. the car with the wrap areas marked. Shown on the client page next to
-- the estimate, before any proof exists, with no approve/reject buttons.
--
-- checkout_session_id: the most recent Stripe Checkout started from a
-- client link. Starting a new one cancels the previous unfinished one, so
-- an old tab can't be used to pay the same deposit twice.
ALTER TABLE job_meta ADD COLUMN IF NOT EXISTS estimate_visual_link TEXT DEFAULT '';
ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS checkout_session_id TEXT DEFAULT '';
