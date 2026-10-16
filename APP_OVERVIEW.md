# How the Inkable Dashboard fits together (plain-language notes)

Written after a read-through of v2.38 on 2026-10-16. Keep this updated when the structure changes.

## The pieces
- **Dashboard** (`netlify-deploy/index.html`, one big file): login, Projects, Sales, Clients, Reports tabs,
  the pricer (estimates), PDF estimates/invoices/receipts, Settings, Google Drive proof uploads,
  Google Calendar sync (parked).
- **Client page** (`netlify-deploy/proof.html`): opened by a client from a private link. Shows the proof,
  approve / request changes, estimate details, and the Stripe pay buttons.
- **Server** (`netlify-deploy/netlify/functions/`): small functions that read/write the Postgres database.
  Everything except the client page and the Stripe webhook requires the Dashboard login.

## Where data lives
- The **database** is the real copy: clients, projects (estimates), job_meta (status, notes, payments,
  expenses, install date), pricing settings, proof links and client responses.
- The **browser** keeps a fast local copy. On load, and every 5 minutes, the Dashboard pulls everything
  from `/api/sync-all` and replaces its local copy. Each edit is saved locally AND sent to the server.
- Local copies are per browser AND per web address (the test address has its own; that's why
  Google Drive settings are blank there).
- PDF files (estimate/invoice) are stored only in the database; the browser just remembers they exist.

## Money
- Job total = items + setup + hardware - discount, + 8.25% tax (unless tax-exempt),
  + card processing fee if that box is ticked.
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

## Known gaps / decisions for the owner
- **Client page needs a proof before it shows anything**, including the pay buttons. So a client can't pay
  the 50% deposit "to start" until a proof is uploaded. Decide: allow paying before the proof?
- **No alert for Stripe payments.** The "50% paid" toast only fires for payments typed in by hand.
  A card payment just appears after the next sync. (Roadmap item: owner notifications.)
- **Totals can drift**: if shop rates change, the Dashboard's total for an old job changes, but the client
  page/Stripe still use the frozen total from when it was saved.
- **Double payment possible**: a client who opens two payment tabs could pay the deposit twice
  (Stripe would show both; refund one).
- **Client approval vs. Dashboard save**: approving on the client page sets the status on the server;
  a Dashboard tab with an older copy can set it back when saving that job (v2.37 reduced but did not
  remove this).
- Cash/check clients are quoted a total that includes the card fee (decide on a "remove fee" path).
- Login has no limit on wrong-password attempts (low risk for now; use a strong password).
