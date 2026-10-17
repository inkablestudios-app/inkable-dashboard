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
- Projects / Sales / Clients review fixes:
  - Sorting by date compared the text ("Apr" < "Oct" < "Sep"), so "newest first" was really
    alphabetical by month. Now real dates. Est # sorts as numbers (EST-999 before EST-1000). Status sort
    includes Awaiting Approval and In Design Revision (they sorted like "Send Estimate").
  - Sales list is newest first (it was in alphabetical month order from the server).
  - Changing status to "Awaiting Proof Approval" from the Projects list dropdown now clears the
    client's old response, same as the job window already did.
  - Search also finds jobs by the billing name on the estimate (jobs with no client record).
  - Client detail shows "Paid to date" and "Owed now", and paid-of-total per job, newest first.
- Final review pass:
  - Pricing math checked: 60 random estimates (flat/material lines, design, install hourly/flat,
    discounts, minimum charge, tax-exempt, card fee) give the same total in the live preview, the PDF,
    the saved job and Sales. No changes needed.
  - Outbox hardening: a change the server keeps rejecting (e.g. an offline edit to a job that was then
    deleted) no longer blocks all syncing. Other queued changes still go out; after 5 rejections it's
    dropped with a red notice. Changes that just couldn't reach the server are never dropped. Deleting a
    job clears its queued edits.
  - Restore-from-backup message now says what it really does (puts backed-up jobs/clients back; keeps
    anything added later) instead of claiming everything newer is lost.
- End-to-end check (pricer → server → Sales, Reports, client page) on 24 varied jobs: totals, paid,
  balance and status match everywhere. Two fixes from it:
  - Client page now shows a "Minimum Job Charge Adjustment" row, so its rows add up to the total for
    jobs under the shop minimum (the total itself was already right).
  - Status "Send Proof" (your to-do) showed the client "Proof Sent"; it now says "Proof Ready".
- Settings fixes:
  - The card processing fee rate didn't load into Settings, so saving ANY setting reset it to 2.9%.
  - Typing 0 in any setting (print cost, card fee, a "my cost") was replaced by the default.
  - Deleting a default vinyl/laminate/substrate didn't stick: it came back the next time Settings
    was saved.
- New settings (Settings → Business and Data):
  - Contact details (email, phone, Instagram) used on PDFs and the client page. Client page now has
    tap-to-call, "Text us" and Instagram links (replaces the "messaging coming soon" placeholder).
  - Deposit % (default 50): client page "Pay X% Deposit" button, the Stripe charge, and the
    "deposit paid — ready to start" alerts.
  - Sales tax rate (default 8.25%) for NEW estimates; each job keeps the rate it was priced with
    (older jobs stay at 8.25%).
  - Default notes and terms, pre-filled on every new estimate.
  - Change password (needs the current password; min 8 characters).
- FIX: the Dashboard's server address was hard-coded to the LIVE site, so the test address saved
  through the live site's old server code. It now uses whichever site it's opened from.
- Data tab text corrected: data lives in the cloud; the backup file is an extra safety copy.
- Per-job deposit %: a "Deposit to start" box in the pricer (starts at the Settings default). The client
  page button, the Stripe charge and the deposit-paid alert use that job's %.
- Phone placeholder: phone is blank by default; client page shows "Phone line coming soon" (no
  call/text links) and PDFs show "Coming soon" until a number is entered in Settings → Business.
- Job status is protected: each status change is time-stamped, and the server keeps the NEWEST
  change. A Dashboard save from a copy that hadn't synced can no longer undo a client's approval or
  change request. Needs migration 009 (status_at column).
- New Installs tab (📅): jobs grouped Overdue / Today / Tomorrow / Next 7 days / Later, plus approved or
  in-production jobs with no install date. Shows time, client address and phone, and the amount still
  to collect. Sidebar badge = overdue + next 7 days. Done and excluded jobs are left out.
- Backup reminder in the bell when no backup has been downloaded in 30 days (Settings → Reminders);
  clicking it opens Settings → Data. The last backup date syncs across devices.
- Phone: when no phone is set, it's simply left off (client page and PDFs) — no "coming soon".
- Client email field (client form + new-client picker; shown in client details). Needs migration 010.
- "✉ Email link" button in the job window's client-link section: opens your email app with a ready
  message to the client (first name, job, the link; says "proof ready" or "estimate + deposit"
  depending on whether a proof is uploaded). Nothing is sent until you press Send.
- Notifications without refreshing: switching back to the Dashboard tab/window checks for news right
  away (max once per 30 seconds), on top of the 5-minute timer. (Found in the first real test: card
  payment alerts only appeared after a refresh.)
- TESTED on the test address (Oct 16-17): declined card, 50% deposit, remaining balance, paid in full,
  Dashboard payment + Stripe fee, Email link — all worked as expected.
- CoreBridge-style additions:
  - Clients accept the ESTIMATE online: client page shows your terms, a typed-name signature and an
    "I agree" box. Accepting records name, date and the exact total; if you re-price the job, the client
    is asked to accept again. Accepted jobs count as committed (money owed), get an ACCEPTED tag in
    Projects, show "Estimate accepted by…" in the job window, and alert you (toast + bell). The job
    status is NOT changed automatically. Needs migration 011.
  - Stripe receipts: checkout pre-fills the client's email and asks Stripe to email them a receipt
    (live mode only — Stripe never emails in test mode).
  - Work Order (⋯ menu): a one-page production sheet with NO prices — items, sizes, qty, sqft, media,
    laminate, substrate, design/install, client contact, install address/date, notes, proof link, and
    a checkbox per item.
  - Copy as New Estimate (⋯ menu): opens the pricer with the old job's items as a new estimate (new
    Est #, today's date and tax rate). The original is untouched.
  - Search also looks at item descriptions, vehicle info and notes.
