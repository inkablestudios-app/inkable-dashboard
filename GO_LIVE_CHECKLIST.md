# Before switching Stripe to the real (live) account

Do NOT skip these. Tick each one off before taking real payments.

- [ ] In Stripe, switch to Live mode and copy the live secret key (`sk_live_...`).
- [ ] In Netlify (Project configuration > Environment variables), edit `STRIPE_SECRET_KEY`:
      paste the key in the **Value** box (not the Key/name box), and tick
      **"Contains secret values"** so it is hidden. (The test key had to be stored
      as a normal, visible value because Netlify's tools would not save it as secret.)
- [ ] Create a NEW webhook in Stripe Live mode pointing at
      `https://inkable-dashboard.netlify.app/api/stripe-webhook` (event: `checkout.session.completed`),
      and put its own `whsec_...` signing secret in `STRIPE_WEBHOOK_SECRET`, also marked secret.
- [ ] Redeploy so Netlify picks up the new values.
- [ ] One real small payment (e.g. $1), check it lands in the Dashboard, then refund it in Stripe.
- [ ] Everything under "Before going live" in the handoff is done (payment overwrite fix: done;
      localStorage storage error; owner notification; cash/check "remove fee" option decided).
- [ ] Database migrations 008, 009, 010 and 011 (estimate visual, checkout, status time, client email, estimate acceptance columns) applied: on the test address, saving a
      job and opening a client link both work. If job saves fail with a server error, the migration
      didn't run.
- [ ] Turn on Stripe email for successful payments (Settings > Notifications).
- [ ] Settings → Business: check email, phone, Instagram, deposit %, tax rate, default terms.
