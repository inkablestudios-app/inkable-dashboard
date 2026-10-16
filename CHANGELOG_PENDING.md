# Pending changes (on branch wip-v2.38, not deployed)

- v2.37: six bug fixes (proof page buttons, status race, Sales greying, sync indicator, modals/Escape/tablet drag, contact email).
- v2.38: Processing Fee checkbox + Settings rate.
- Stripe Checkout payments (create-checkout-session, stripe-webhook, proof page pay buttons).
- Fix: payments can no longer be wiped by a Dashboard save. The server now merges payment lists by id
  instead of replacing them; deleting a payment sends an explicit `removedPaymentIds`. The webhook
  appends its payment in a single atomic database statement. Tested against Postgres (PGlite).
