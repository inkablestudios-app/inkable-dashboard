import { getDatabase } from "@netlify/database";
import { jobDepositPct, depositAmount, paidSoFar, needsAcceptance, STRIPE_MIN, toCents } from "./_shared/pay.js";

const db = getDatabase();

// Raw REST calls to Stripe's API — no SDK, to keep this dependency-free
// like the rest of the functions here. Basic auth with the secret key
// base64-encoded, form-urlencoded body (that's what Checkout Sessions
// expects, not JSON).
const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(path, params) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  const body = new URLSearchParams(params);
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(secretKey + ":").toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe returned ${res.status}`);
  return data;
}

// Was this earlier checkout already paid? (Its payment may not be recorded
// yet if Stripe's notice is slow.) Unknown or unreachable counts as no.
async function checkoutWasPaid(sessionId) {
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { "Authorization": "Basic " + Buffer.from(process.env.STRIPE_SECRET_KEY + ":").toString("base64") },
    });
    if (!res.ok) return false;
    const s = await res.json();
    return s?.payment_status === "paid";
  } catch {
    return false;
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { token, amountType } = await req.json();
    if (!token) return Response.json({ error: "Missing token" }, { status: 400 });
    if (!["deposit", "full"].includes(amountType)) {
      return Response.json({ error: "amountType must be 'deposit' or 'full'" }, { status: 400 });
    }

    const rows = await db.sql`
      SELECT ps.token, ps.project_id, ps.checkout_session_id, c.email AS client_email,
             ps.estimate_accepted_at, ps.estimate_accepted_total, p.name AS job_name, p.est_no, p.state, jm.payments
      FROM proof_shares ps
      JOIN projects p ON p.id = ps.project_id
      LEFT JOIN job_meta jm ON jm.project_id = ps.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE ps.token = ${token}
    `;
    if (!rows.length) return Response.json({ error: "This link isn't valid." }, { status: 404 });
    const r = rows[0];

    let state = r.state;
    if (typeof state === "string") {
      try { state = JSON.parse(state); } catch { state = {}; }
    }
    const summary = state?.form?.estimateSummary;
    if (!summary || !summary.total) {
      return Response.json({ error: "No estimate is available to charge against yet." }, { status: 400 });
    }

    let payments = r.payments;
    if (typeof payments === "string") {
      try { payments = JSON.parse(payments); } catch { payments = []; }
    }
    const paid = paidSoFar(payments);
    const balance = Math.max(0, summary.total - paid);

    if (balance <= 0.005) {
      return Response.json({ error: "This job is already paid in full." }, { status: 400 });
    }
    // Paying needs an accepted estimate (name + agreement to the price,
    // terms and validity) for the CURRENT total: before the first payment,
    // and again if the job was re-priced after the client accepted.
    // Expired estimates can't be accepted, so this also blocks paying one.
    const accepted = !!(r.estimate_accepted_at && Math.abs(Number(r.estimate_accepted_total) - Number(summary.total)) < 0.005);
    if (needsAcceptance({ accepted, acceptedAt: r.estimate_accepted_at, paid })) {
      return Response.json({ error: paid > 0.005 ? "This estimate was updated. Please review and accept the new total first." : "Please accept the estimate first." }, { status: 400 });
    }
    // The client's last checkout may already be paid while Stripe's notice
    // is still on its way; a new checkout now could charge them twice.
    if (r.checkout_session_id && !(payments || []).some(p => p.stripeSessionId === r.checkout_session_id)
        && await checkoutWasPaid(r.checkout_session_id)) {
      return Response.json({ error: "We've received your payment and are still recording it. Please refresh this page in a minute." }, { status: 409 });
    }

    // Once anything has been paid, "50% deposit" no longer means
    // anything — always charge the real remaining balance regardless of
    // which button was clicked.
    const settingsRows = await db.sql`SELECT data FROM pricing_settings WHERE id = 1`;
    let settings = settingsRows[0]?.data || {};
    if (typeof settings === "string") { try { settings = JSON.parse(settings); } catch { settings = {}; } }
    const depositPct = jobDepositPct(summary, settings);

    let amount, description;
    if (paid > 0.005) {
      amount = toCents(balance);
      description = "Remaining balance";
    } else if (amountType === "deposit") {
      amount = depositAmount(summary, depositPct);
      description = depositPct + "% deposit";
    } else {
      amount = toCents(summary.total);
      description = "Full payment";
    }
    if (amount < STRIPE_MIN) {
      return Response.json({ error: `The amount left ($${amount.toFixed(2)}) is too small to pay by card. Please contact us to settle it.` }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    // Stripe fills in {CHECKOUT_SESSION_ID}, so the page can tell when THIS
    // payment has been recorded.
    const successUrl = `${origin}/proof.html?token=${encodeURIComponent(token)}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/proof.html?token=${encodeURIComponent(token)}&payment=cancelled`;

    const jobName = state?.form?.jobName || r.job_name || "Your job";
    const jobDesc = (state?.form?.jobDesc || "").trim();
    const productName = `${jobName}${jobDesc ? " — " + jobDesc : ""}${r.est_no ? " — " + r.est_no : ""} (${description})`;

    // Only one open checkout per job: cancel the previous one if it was never
    // finished. Stripe refuses to expire a session that was already paid or
    // already expired, which is fine — that error is ignored, and completed
    // payments are never affected.
    if (r.checkout_session_id) {
      try {
        await stripeRequest(`/checkout/sessions/${encodeURIComponent(r.checkout_session_id)}/expire`, {});
      } catch { /* already completed or expired */ }
    }

    const session = await stripeRequest("/checkout/sessions", {
      "mode": "payment",
      // Cards only (Apple Pay / Google Pay included): they're confirmed on
      // the spot, unlike bank debits that can still fail days later.
      "payment_method_types[0]": "card",
      // A checkout left open can't be paid later, after the balance changed
      // (30 minutes is Stripe's minimum).
      "expires_at": String(Math.floor(Date.now() / 1000) + 31 * 60),
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": productName,
      "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
      "line_items[0][quantity]": "1",
      "metadata[project_id]": r.project_id,
      "metadata[token]": token,
      "metadata[description]": description,
      // Client's email from their record: pre-fills Stripe's form and
      // gets them Stripe's emailed receipt (live mode only; Stripe never
      // emails in test mode).
      ...(r.client_email && /@/.test(r.client_email) ? {
        "customer_email": r.client_email,
        "payment_intent_data[receipt_email]": r.client_email,
      } : {}),
    });

    await db.sql`UPDATE proof_shares SET checkout_session_id = ${session.id} WHERE token = ${token}`;

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session function error:", err);
    return Response.json({ error: err.message || "Something went wrong on our end." }, { status: 500 });
  }
};

export const config = { path: "/api/create-checkout-session" };
