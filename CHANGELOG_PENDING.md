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
- Reports review fixes:
  - Tax Report and Print now use the period on screen (Month/Quarter/Year + ◀ ▶), so any past
    month/quarter/year can be printed. Before, both always printed the CURRENT period.
  - Reports counted pricer expenses (Materials, Design, Install, Setup, Hardware) twice: once by
    the job's save date and again as "extra". Profit was understated by that amount.
  - Week = last 7 whole days (was a rolling window that could drop a payment from 7 days ago), and
    weeks can now be browsed with ◀ ▶. Period end dates cover the whole last day.
  - Trend chart follows the period being browsed and uses the same ranges as the totals.
  - Job profit (Sales + Reports) = total minus sales tax minus expenses, so the card fee is counted
    the same way everywhere. Uses the frozen estimate when there is one.
  - Printed Sales list: excluded jobs are still listed but no longer added into the totals.
  - Payment and expense dates use a date picker (free text could silently drop a payment from
    every report if the date didn't parse).
- Only COMMITTED jobs count as owed (paid something, or status Proof Approved / In Production /
  Done): Reports "Balance owed", unpaid/partial counts, Sales sidebar badge, overdue reminders and the
  printed Sales totals. Open estimates show an "Estimate" badge in Sales instead of red "Unpaid".
- Stripe's fee is recorded automatically as a job expense ("Stripe card fee") when a card payment
  arrives: the exact fee from Stripe, or 2.9% + 30c marked "(estimated)" if the lookup fails.
- Expenses are now merged on the server like payments (so a Dashboard save can't wipe the Stripe fee);
  deleting an expense sends an explicit removedExpenseIds.
- Pricer ↔ Projects/Sales review fixes:
  - Unsent changes are no longer lost. A save that failed to reach the server (offline/hiccup) was
    overwritten by the next sync. Failed saves now wait in an outbox, are re-sent first, and the
    Dashboard won't replace its copy until they're delivered. Also re-sends as soon as the device is
    back online.
  - The pricer tracks the job it's editing by id. Before: changing the Est # created a duplicate job,
    and typing an Est # another job already used overwrote that other job. Now: rename updates the same
    job; a clashing Est # is blocked with a message. Exported PDFs attach to the right job.
  - Re-saving a job keeps its date (from the pricer's Date field) instead of resetting it to today,
    which moved old jobs' costs into the current Reports period and reset reminders.
  - Reports "Est. / Invoices" counts jobs with a generated invoice (was always 0).
