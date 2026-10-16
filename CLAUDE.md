# Working on the Inkable Dashboard

Owner is not a programmer: explain in plain language, be direct, no flattery. Lean, one phase at a time,
nothing that costs money without asking. Read APP_OVERVIEW.md, CHANGELOG_PENDING.md and
GO_LIVE_CHECKLIST.md first.

## Branches and Netlify credits (owner is on Netlify's free plan)
- `main` = live site. Never push to it without the owner's explicit OK.
- `wip-v2.38` = the TEST address (wip-v2-38--inkable-dashboard.netlify.app). Netlify BUILDS every push
  to it, which uses free credits. Only update it when a meaningful batch is ready to test, and tell
  the owner before doing so.
- `dev` = everyday work branch. Netlify does NOT build it. Commit and push here often (sandbox resets
  lose unpushed work). Test locally first: JS parse checks, PGlite (in-memory Postgres) for server
  functions, jsdom for pages.
- When a batch is ready: merge `dev` into `wip-v2.38` and push once.
