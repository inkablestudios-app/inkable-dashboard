// What a client is asked to pay, worked out in one place so the client
// page shows exactly the amount Stripe will charge.

// Rounds to the cent the way people do (32.175 -> 32.18), not the way
// binary floating point does (32.17).
const toCents = n => Number(Math.round(Number(n) + "e2") + "e-2");

// This job's own deposit % if it has one, else the shop default, else 50%.
// 0 is a real choice: no deposit, the client pays when the job is done.
const pct = v => (v !== null && v !== undefined && v !== "" && Number(v) >= 0) ? Number(v) : null;
export function jobDepositPct(summary, settings) {
  return Math.min(100, pct(summary?.depositPct) ?? pct(settings?.depositPct) ?? 50);
}

// A job paid in stages (e.g. 50/40/10): the stage percentages, else null.
export function paySchedule(summary) {
  const s = Array.isArray(summary?.paySchedule) ? summary.paySchedule.map(Number) : null;
  return s && s.length > 1 && s.every(n => n > 0) && Math.abs(s.reduce((a, b) => a + b, 0) - 100) < 0.001 ? s : null;
}

// The next amount to ask for: the next stage of a schedule, or the deposit
// before anything is paid, or what's left. null = nothing to ask for yet
// (no deposit, nothing paid: the client pays at completion).
export function nextPayment(summary, settings, paid) {
  const total = Number(summary.total) || 0, balance = Math.max(0, total - paid);
  if (balance <= 0.005) return null;
  const stages = paySchedule(summary);
  if (stages) {
    let target = 0;
    for (let i = 0; i < stages.length; i++) {
      target += stages[i];
      const due = toCents(total * target / 100 - paid);
      if (due > 0.005) return { amount: Math.min(due, toCents(balance)), label: `Payment ${i + 1} of ${stages.length} (${stages[i]}%)`, stage: i + 1, stages: stages.length };
    }
    return { amount: toCents(balance), label: "Remaining balance" };
  }
  if (paid > 0.005) return { amount: toCents(balance), label: "Remaining balance" };
  const dep = jobDepositPct(summary, settings);
  if (dep <= 0) return null;
  return { amount: depositAmount(summary, dep), label: dep + "% deposit" };
}

// Card fee added at checkout, for jobs set to charge it only when paying by card.
export function cardFeeFor(summary, amount) {
  if (!summary?.cardFeeOnCard) return 0;
  return toCents(amount * (Number(summary.cardFeePct) || 0) / 100 + (Number(summary.cardFeeFixed) || 0));
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
