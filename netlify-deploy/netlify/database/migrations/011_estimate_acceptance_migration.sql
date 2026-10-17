-- A client accepting the ESTIMATE on their page (separate from approving a
-- proof): the name they typed as a signature, when, and the total they
-- accepted. If the estimate's total changes afterwards, the acceptance no
-- longer matches and the client is asked to accept again.
ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS estimate_accepted_at TIMESTAMPTZ;
ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS estimate_accepted_name TEXT DEFAULT '';
ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS estimate_accepted_total NUMERIC;
