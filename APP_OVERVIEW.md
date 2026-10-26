# How the Inkable Dashboard fits together (plain-language notes)

Written after a read-through of v2.38 on 2026-10-16. Keep this updated when the structure changes.

## The pieces
- **Dashboard** (`netlify-deploy/index.html`, one big file): login, Projects, Sales, Clients, Reports tabs,
  the pricer (estimates), PDF estimates/invoices/receipts, Settings, Google Drive proof uploads,
  Google Calendar sync (parked).
  Phones and tablets (up to 820px wide) get their own layout from one `@media (max-width:820px)` block
  in the first `<style>`: bottom tab bar, cards, windows that slide up, pricer with a fixed Total + Save
  bar. Change the computer layout outside that block; check both sizes after a layout change.
  A job's "name" is always the client's name (filled in automatically); jobs also have an optional short description (jobDesc). Clicking a job opens the job page (tab-job-page, renderJobPage); the job window (openJobModal) still holds status/proof/notes/expenses editing.
- **Client page** (`netlify-deploy/proof.html`): opened by a client from a private link. Shows the proof,
  approve / request changes, estimate details, and the Stripe pay buttons.
- **Server** (`netlify-deploy/netlify/functions/`): small functions that read/write the Postgres database.
  Everything except the client page and the Stripe webhook requires the Dashboard login.

## Where data lives
- The **database** is the real copy: clients, projects (estimates), job_meta (status, notes, payments,
  expenses, install date), pricing settings, proof links and client responses.
- The **browser** keeps a fast local copy. On load, every 5 minutes, and when you come back to the tab,
  the Dashboard pulls everything from `/api/sync-all`. Each edit is saved locally AND sent to the
  server as a "patch" (only the fields that changed; payments, expenses and call-log entries by id),
  so two devices can't undo each other. Edits that couldn't be sent wait in an outbox (combined per
  record) and are re-applied on top of every pull until the server has them.
- Logins last 30 days and carry a fingerprint of the password: changing the password signs out
  every other device.
- Local copies are per browser AND per web address (the test address has its own; that's why
  Google Drive settings are blank there).
- PDF files (estimate/invoice) are stored only in the database; the browser just remembers they exist.

## Money
- Job total = items + setup + hardware - discount, + 8.25% tax (unless tax-exempt),
  + card processing fee if that box is ticked. One routine (`priceJob`) does this for the pricer,
  saved jobs, PDFs and the client page: each amount is rounded to the cent first (half up), then
  totals are built from the rounded amounts.
- Each job keeps the rates it was priced with (`pricerData.rates`) and each item its material
  prices (`vinylCost/lamCost/subCost`). Settings changes only affect new estimates or jobs where
  "Use today's rates" is pressed.
- Pricer cost entries (Materials, Design Labor…) follow re-pricing unless edited by hand
  (`seedAmount` remembers what the pricer last put there). Reports count a job's costs in
  proportion to the money received in each period.
- Status "Cancelled": not owed, payments still count. Refunds are negative payments.
- Settings added Oct 26 (labor per sq ft, customer's material, markup/waste per material, quantity
  breaks, rush, trip, card fee fixed part / card-only, numbering, invoice terms, reminders…) live in
  one table, `EXTRA_SETTINGS`, read with `setting(key)`; Settings draws them from that table. The ones
  that change prices are saved in each job's rates (`rateSnapshot`); `RATES_ADDED_OFF` makes jobs saved
  before they existed treat them as off. Per-client settings are `client.prefs` (database column
  `clients.prefs`, migration 012) and are copied into a new estimate when it's opened
  (`applyClientDefaults`); the job then keeps its own values (`pd.taxCert`, `pd.payTerms`…).
- Invoices: dated the day the job was marked Done (today until then), due per the job's terms
  (client) or Settings → Invoices due (`invoiceTermsFor`, `prepInvoice`).
- The client page and Stripe charge from a snapshot of the estimate frozen when the job was saved.
  The Dashboard recalculates totals from current rates (see "Known gaps").
- Stripe: the server works out the amount itself (client can't change it), Stripe hosts the card form,
  and the webhook records the payment on the job.

## Fixed during this read (on wip-v2.38)
1. Saving a job could wipe a Stripe payment (server now merges payment lists).
2. Re-saving a job, or exporting an invoice, wiped the stored PDF of earlier documents on the server
   (same overwrite pattern). "View Estimate" then silently rebuilt it from current rates, so it might
   not match what the client was sent. Server now keeps stored PDFs.
3. Sales/Reports totals left out the card processing fee, so a job paid in full through Stripe would
   look over-paid / not match the client's total. Now included.
4. If browser storage was full, saving an estimate threw an error BEFORE sending it to the server, so the
   save was lost silently. Now it saves to the server first and shows a red notice if the local copy fails.
   (Likely related to the `inkable_saved_estimates` storage error in the old screenshot; older versions
   kept PDF bytes in the browser. Not fully confirmed.)

## Decisions made
- Money owed = committed jobs only (paid something, or Proof Approved / In Production / Done).
- Stripe's fee is recorded as a job expense automatically.
- Same price for every payment method; Processing Fee box ON by default.

## Known gaps / decisions for the owner
- DONE: client page works before a proof; estimate visual slot; card payment alerts; one open
  checkout per job; frozen totals. (See CHANGELOG_PENDING.md.)
- Card payment alerts only appear when the Dashboard is open/synced. For alerts while away, turn on
  Stripe's own email: Stripe Settings > Notifications > Successful payments.
- **Client approval vs. Dashboard save**: approving on the client page sets the status on the server;
  a Dashboard tab with an older copy can set it back when saving that job (v2.37 reduced but did not
  remove this).
- Decided: same price for all payment methods; Processing Fee box ON by default (Settings can now
  charge the card fee only at card checkout instead). Payment method is recorded per payment (the
  list is in Settings → Business; Stripe = "Card (Stripe)").
- Login has no limit on wrong-password attempts (low risk for now; use a strong password).

## Parked for later (owner's choice)
- Owner's real rates: send a screenshot of Settings (pricing + materials) so tests can judge prices
  with real numbers instead of the built-in defaults. (Parked Oct 25.)
- Real past jobs (sizes, materials, what was charged) to compare against the pricer: the owner will
  collect them from the tool later. (Parked Oct 25.)
- DONE Oct 26: "Customer's material" per item with print-only / cut-only rates in Settings.
- Multi-piece signs (e.g. clear acrylic face + vinyl + backer): enter each piece as its own item
  ("＋ Add Item"). For a plain piece with no vinyl, add a material "None (substrate only)" at $0 in
  Settings and untick "Printed on our printer". (A per-item "layers" feature was built and removed
  on Oct 25 because items already cover this.)
- The old Inkatool's ready-made item list (DEFAULT_QQ_PRESETS: yard sign, DOT decal, banners,
  partner-shop print items) is still in the code but nothing uses it. Owner doesn't need it now.
- Far future: monuments and channel letters (see the Oct 25 test report for what that would take).
