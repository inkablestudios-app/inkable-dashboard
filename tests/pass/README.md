Test pass of Oct 25, 2026 (see TEST_PASS_2026-10-25.md in the repo root).

Not part of the website. To run: copy the `pass-*.mjs` files next to copies of
`netlify-deploy/netlify/functions/*.js` (with `_shared/auth.js` stubbed to allow every request), in a
folder whose node_modules has @electric-sql/pglite, jsdom and jspdf, then `node pass-run.mjs`
(or `node pass-run.mjs B01,C05` for some cases). `pass-layout.cjs` needs Playwright + Chromium.
