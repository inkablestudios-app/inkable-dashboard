// What a client is asked to pay, worked out in one place so the client
// page shows exactly the amount Stripe will charge.

// Rounds to the cent the way people do (32.175 -> 32.18), not the way
// binary floating point does (32.17).
const toCents = n => Number(Math.round(Number(n) + "e2") + "e-2");

// This job's own deposit % if it has one, else the shop default, else 50%.
export function jobDepositPct(summary, settings) {
  return Math.min(100, Number(summary?.depositPct) > 0 ? Number(summary.depositPct)
    : Number(settings?.depositPct) > 0 ? Number(settings.depositPct) : 50);
}

export function depositAmount(summary, pct) {
  return toCents(Number(summary.total) * pct / 100);
}

export function paidSoFar(payments) {
  return (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
}

// The client must (re)accept before paying when nothing is paid yet, or
// when they accepted a different total (the job was re-priced since).
// Older jobs paid before online acceptance existed have no record and
// carry on as before.
export function needsAcceptance({ accepted, acceptedAt, paid }) {
  return !accepted && (paid <= 0.005 || !!acceptedAt);
}

// Stripe won't take a card payment under 50 cents.
export const STRIPE_MIN = 0.5;

export { toCents };
