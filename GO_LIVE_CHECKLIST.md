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
- [ ] Database migrations 008, 009, 010, 011 and 012 (estimate visual, checkout, status time, client email, estimate acceptance, client settings columns) applied: on the test address, saving a
      job, saving a client and opening a client link all work. If job saves fail with a server error, the migration
      didn't run. (012 is also added by the clients function on its own if it hasn't run.)
- [ ] Settings → Shop / Business / Reminders: the new settings (labor per sq ft, customer's material,
      card fee 30¢ and "only when paying by card", numbering, invoice terms, address/website, logo)
      filled in with your real numbers, or left at 0/off on purpose.
- [ ] Turn on Stripe email for successful payments (Settings > Notifications).
- [ ] Settings → Business: check email, phone, Instagram, deposit %, estimate valid days, tax rate,
      default terms.
- [ ] After this update goes live, every device (computer, phone) has to log in again once.
- Note: checkouts are card-only (Apple Pay / Google Pay included) — this is set in the app, so
  Stripe's payment-method settings don't change it.
