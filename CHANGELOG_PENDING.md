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
- Accept & Pay in one step (client page): name + "I accept" box, then "Accept & Pay X% Deposit" or
  "Accept & Pay in Full" goes straight to Stripe; "Accept now, pay later (cash or check)" link. The
  server refuses a first payment without an accepted estimate for the current total.
- Estimate validity (Settings → Business, default 30 days): every save is a (re)quote. Client page and
  estimate PDF say "valid for 30 days, until <date> — material prices change often". After that date,
  an un-accepted, unpaid estimate shows "expired — contact us for an updated quote" and can't be
  accepted or paid (enforced on the server). Once accepted, the price holds. Older jobs don't expire.
- Validity wording made more formal ("valid for 30 days, through <date>. Due to fluctuating material
  costs, pricing is subject to change after this date.") on the client page and estimate PDF. On the
  client page it now sits WITH the estimate ("Valid through" next to the Total + a notice under the
  estimate details), not in the Accept & Pay box; hidden once the client has accepted or paid.
- Phone and tablet layout (screens up to 820px wide; the computer layout is unchanged, checked
  screen by screen against before-pictures):
  - The left menu becomes a tab bar at the bottom (Projects, Sales, Installs, Clients, Reports, with
    their badges). The top bar is compact: ⚙️ for Settings, "＋ New" for a new estimate.
  - Projects, Sales and Installs rows become cards with labels (Total, Paid, Balance…). Reports go to
    one column. Job, payment, client and expense windows slide up from the bottom.
  - Pricer: one column, with a bar fixed at the bottom showing the Total and a Save button.
  - Settings: tabs scroll sideways; rate rows wrap to fit.
  - Text boxes use a larger font so iPhone doesn't zoom in when you tap one.
  - Tested at iPhone size (390 wide) and iPad portrait (768 wide): nothing runs off the side.
  - iPhone: PDFs inside the viewer can be limited; "↗ Open in new tab" always works.
- Installs: the address opens Google Maps and the phone number is tap-to-call (computer too). The
  client details phone is tap-to-call.
- The job ⋯ menu opens upward when there is no room below it (rows near the bottom of the screen).
- Fix: the pricer's Total box left out the card processing fee when the box was checked. The saved
  total, PDFs, client page and Stripe already included it; now the box on screen matches.
- Fix: Sales showed a red "$0.00" balance on a fully paid job when a Stripe payment differed by a
  fraction of a cent. It now shows grey like any paid job.
- Money / Reports review fixes:
  - Reports counted the pricer's estimated costs (materials, labor, setup, hardware) for EVERY
    quote, including ones the client never accepted, so expenses were too high and profit too low.
    Now only committed jobs count. Expenses you add by hand and Stripe fees still count by their date.
  - Payments can now be deleted: the "+ Payment" window lists the job's payments (date, method,
    amount) with a 🗑 for each, after a confirmation. Before, a mistyped payment could never be
    fixed. Deleting a card payment does not refund it in Stripe.
  - Tax report: "Taxable sales" was everything collected minus tax, so it included card fees and
    tax-exempt jobs. Now it is only the taxable part of each payment.
  - Jobs from the old single-item pricer counted as $0 in Reports (nothing owed, no tax). They now
    use the same total as Sales.
  - Sales margin % now uses the same base as Reports (total minus sales tax), so a job can't show
    more than 100%. Negative amounts show as "-$50.00".
  - Top clients: jobs with no client (or a deleted client) are listed by the name on the estimate
    instead of all lumped together as "Unknown Client".
  - Tax-due reminder still shows the due date on the 20th itself ("today") instead of jumping to
    the next quarter.
  - "All Time" now includes post-dated payments (they already showed in their month and year).
  - "Done This Month" counts jobs marked Done this month (was: estimated in a month with the same
    name, any year).
  - Printed Sales list: same order as the Sales tab (newest first), and its totals add up to the
    rows above them (they could be a cent off).
  - A $0 job (comped, warranty redo) counts as paid instead of "Unpaid".
- Safety review fixes (client page, payments, syncing, login):
  - Security: text a client types on their page (their signature name, a change-request note) is
    shown in the Dashboard as plain text. Before, it was treated as page code, so someone could
    have run their own code inside your logged-in Dashboard.
  - Login: changing the password signs out every other device (e.g. a lost phone), and a
    logged-in device alone can't set a new password. An expired login now shows the login screen
    instead of "Offline". After this update, every device logs in again once.
  - No double charges: if a client pays and Stripe's notice is slow, the page shows "Confirming
    your payment…" with no Pay buttons until the payment is recorded, and the server refuses a new
    checkout while the last one is paid but not yet recorded. Checkouts close after ~31 minutes
    and are card-only (Apple Pay / Google Pay included). If a payment can't be recorded, Stripe is
    told to try again (it retries for 3 days and emails you if it keeps failing).
  - Re-pricing: if you change a job's price after the client accepted (even after a deposit),
    they accept the new total before paying anything more. Accepting records only the total the
    client was looking at.
  - Dates use Houston time everywhere: install dates on the client page were a day early; evening
    card payments were dated the next day (and could land in the next month or tax quarter); the
    last valid day of an estimate ended at 6-7 PM instead of midnight.
  - The deposit shown on the client page is exactly what Stripe charges (could be 1¢ off); a
    balance under 50¢ gets a "contact us" note (Stripe can't charge less).
  - A late Approve / Request Changes click on an old link no longer moves a job that's in
    production or done backwards, and those jobs show no buttons.
  - Phone + computer: each device now sends only what it changed (job details, clients, Settings),
    so a device with an older copy can't bring back a deleted payment or wipe an install date,
    note, tag, call-log entry or setting changed on the other device. Edits made during a sync stay
    on screen, unsent edits are kept through server outages, and opening a job window (or getting
    a client link) no longer moves its status back to "Proof Approved".
  - Client answers (approved / changes requested) pop up once per device; a new phone doesn't list
    every old answer. Restoring a backup puts statuses back and keeps the latest backup date.
