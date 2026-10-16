import { getDatabase } from "@netlify/database";

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
      SELECT ps.token, ps.project_id, ps.checkout_session_id, p.name AS job_name, p.est_no, p.state, jm.payments
      FROM proof_shares ps
      JOIN projects p ON p.id = ps.project_id
      LEFT JOIN job_meta jm ON jm.project_id = ps.project_id
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
    const paid = (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const balance = Math.max(0, summary.total - paid);

    if (balance <= 0.005) {
      return Response.json({ error: "This job is already paid in full." }, { status: 400 });
    }

    // Once anything has been paid, "50% deposit" no longer means
    // anything — always charge the real remaining balance regardless of
    // which button was clicked.
    let amount, description;
    if (paid > 0.005) {
      amount = balance;
      description = "Remaining balance";
    } else if (amountType === "deposit") {
      amount = summary.total * 0.5;
      description = "50% deposit";
    } else {
      amount = summary.total;
      description = "Full payment";
    }
    amount = Math.round(amount * 100) / 100;

    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/proof.html?token=${encodeURIComponent(token)}&payment=success`;
    const cancelUrl = `${origin}/proof.html?token=${encodeURIComponent(token)}&payment=cancelled`;

    const jobName = state?.form?.jobName || r.job_name || "Your job";
    const productName = `${jobName}${r.est_no ? " — " + r.est_no : ""} (${description})`;

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
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": productName,
      "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
      "line_items[0][quantity]": "1",
      "metadata[project_id]": r.project_id,
      "metadata[token]": token,
      "metadata[description]": description,
    });

    await db.sql`UPDATE proof_shares SET checkout_session_id = ${session.id} WHERE token = ${token}`;

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session function error:", err);
    return Response.json({ error: err.message || "Something went wrong on our end." }, { status: 500 });
  }
};

export const config = { path: "/api/create-checkout-session" };
