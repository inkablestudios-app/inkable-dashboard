Test pass of Oct 25, 2026 (see TEST_PASS_2026-10-25.md in the repo root).

Not part of the website. To run: copy the `pass-*.mjs` files next to copies of
`netlify-deploy/netlify/functions/*.js` (with `_shared/auth.js` stubbed to allow every request), in a
folder whose node_modules has @electric-sql/pglite, jsdom and jspdf, then `node pass-run.mjs`
(or `node pass-run.mjs B01,C05` for some cases). `pass-layout.cjs` needs Playwright + Chromium.

Later tests, same setup:
- `fix-rates.mjs`, `fix-round.mjs`: the Oct 26 fix pass (each job keeps its rates; cents add up).
- `sim-settings.mjs`: every setting changed through the Settings screen and checked where it shows up.
- `new-a.mjs` … `new-e.mjs`: the 21 settings added on Oct 26 (A prices, B payments, C client
  settings, D documents, E reminders).
- `pass-layout.cjs` now also covers the Settings tabs, the client form, the payment window and the
  pricer's "client settings applied" notice.
