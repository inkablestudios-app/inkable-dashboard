# Pending changes (on branch wip-v2.38, not deployed)

- v2.37: six bug fixes (proof page buttons, status race, Sales greying, sync indicator, modals/Escape/tablet drag, contact email).
- v2.38: Processing Fee checkbox + Settings rate.
- Stripe Checkout payments (create-checkout-session, stripe-webhook, proof page pay buttons).
- Fix: payments can no longer be wiped by a Dashboard save. The server now merges payment lists by id
  instead of replacing them; deleting a payment sends an explicit `removedPaymentIds`. The webhook
  appends its payment in a single atomic database statement. Tested against Postgres (PGlite).
- Fix: re-saving a job no longer wipes stored estimate/invoice PDFs on the server.
- Fix: Sales/Reports totals include the card processing fee.
- Fix: estimate save goes to the server first; a full browser storage now shows a warning instead of losing the save.
- Client page works before a proof exists: shows the estimate and pay buttons; proof area says
  "being prepared". Client link can be created before a proof (status only moves to
  "Awaiting Proof Approval" if a proof exists). Client link now uses the address the Dashboard is
  opened from (so the test address gives test links).
- Estimate visual: one Drive file per job (PDF for several images), shown on the client page next
  to the estimate, no approve/reject. Needs migration 008 (new column).
- Card payment alerts: a toast + notification-bell entry when a sync brings in a new Stripe
  payment, plus the "50% paid" toast. Once per device.
- Only one open Stripe checkout per job: starting a new one cancels the previous unfinished one
  (completed payments untouched). Paying deposit then balance minutes apart still works.
- Dashboard job totals use the total frozen when the estimate was saved (same as client page /
  Stripe), so changing shop rates no longer changes old jobs. Older jobs fall back to recalculating.
- Decision: same price for every payment method; Processing Fee box stays ON by default.
