import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

const db = getDatabase();

// Stripe signs webhooks as "t=<timestamp>,v1=<hmac>". Verifying this
// ourselves (no SDK) means: parse the header, recompute the HMAC over
// "<timestamp>.<rawBody>" with the webhook signing secret, and compare
// with a constant-time comparison so this can't be timed. The signature
// MUST be computed over the exact raw bytes Stripe sent — parsing the
// body to JSON first and re-stringifying it will not match.
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const pairs = signatureHeader.split(",").map(kv => kv.split("="));
  const timestamp = (pairs.find(([k]) => k === "t") || [])[1];
  // While a signing secret is being replaced Stripe sends one v1 per
  // active secret; any one matching is enough.
  const signatures = pairs.filter(([k, v]) => k === "v1" && v).map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;

  // Reject anything older than 5 minutes — a captured/replayed webhook
  // request shouldn't still be usable long after the fact.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some(v1 => {
    const actualBuf = Buffer.from(v1, "utf8");
    return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
  });
}

// Stripe's actual fee for this payment (in dollars). It lives on the
// charge's balance transaction, which the checkout event doesn't include,
// so look it up. If that fails for any reason, fall back to Stripe's
// standard US card rate so the job still shows a realistic cost.
async function getStripeFee(session, amount) {
  const estimate = Math.round((amount * 0.029 + 0.30) * 100) / 100;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !session.payment_intent) return { fee: estimate, exact: false };
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge.balance_transaction`,
      { headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64") } }
    );
    const pi = await res.json();
    const cents = pi?.latest_charge?.balance_transaction?.fee;
    if (res.ok && typeof cents === "number") return { fee: cents / 100, exact: true };
  } catch (err) {
    console.warn("stripe-webhook: fee lookup failed, using estimate", err);
  }
  return { fee: estimate, exact: false };
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signatureHeader = req.headers.get("stripe-signature");
  // Raw text, NOT req.json() — signature verification needs the exact
  // bytes Stripe sent, before any parsing.
  const rawBody = await req.text();

  if (!secret || !verifyStripeSignature(rawBody, signatureHeader, secret)) {
    console.warn("stripe-webhook: signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response("Invalid payload", { status: 400 });
  }

  // If recording fails, answer with an error so Stripe tries again later
  // (it retries for up to 3 days and emails the account owner if it keeps
  // failing). Recording twice is safe: the same checkout is only added once.
  try {
    const type = event.type;
    const session = event.data?.object || {};
    // Only money that has actually arrived. (Card payments are "paid" at
    // once; a delayed method would report later through the second event.)
    if ((type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded")
        && session.payment_status === "paid") {
      const projectId = session.metadata?.project_id;
      const description = session.metadata?.description || "Payment";
      const amount = (session.amount_total || 0) / 100;

      if (projectId && amount > 0) {
        // The shop's date (Houston), not the server's UTC date: an evening
        // payment belongs to that day, month and tax quarter.
        const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
        const { fee, exact } = await getStripeFee(session, amount);
        // Recorded as a regular job expense so Sales/Reports profit reflects
        // what actually reaches the bank. Editable/deletable like any other.
        const feeExpense = {
          id: "exp_stripe_" + session.id,
          description: "Stripe card fee" + (exact ? "" : " (estimated)"),
          amount: fee,
          date: today,
          source: "stripe",
          stripeSessionId: session.id,
        };
        const payment = {
          id: "pmt_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
          amount,
          method: "Card (Stripe) — " + description,
          date: today,
          stripeSessionId: session.id,
        };
        // One atomic statement: append to whatever is in the database at
        // this instant (no read-then-write gap a Dashboard save could slip
        // into), and skip it if this session was already recorded —
        // Stripe retries deliveries, so the same session can arrive twice.
        const newList = JSON.stringify([payment]);
        const feeList = JSON.stringify(fee > 0 ? [feeExpense] : []);
        const sessionMatch = JSON.stringify([{ stripeSessionId: session.id }]);
        await db.sql`
          INSERT INTO job_meta (project_id, payments, expenses, updated_at)
          VALUES (${projectId}, ${newList}::jsonb, ${feeList}::jsonb, NOW())
          ON CONFLICT (project_id) DO UPDATE SET
            payments = CASE
              WHEN jsonb_typeof(job_meta.payments) = 'array' AND job_meta.payments @> ${sessionMatch}::jsonb
                THEN job_meta.payments
              ELSE (CASE WHEN jsonb_typeof(job_meta.payments) = 'array' THEN job_meta.payments ELSE '[]'::jsonb END) || ${newList}::jsonb
            END,
            expenses = CASE
              WHEN jsonb_typeof(job_meta.expenses) = 'array' AND job_meta.expenses @> ${sessionMatch}::jsonb
                THEN job_meta.expenses
              ELSE (CASE WHEN jsonb_typeof(job_meta.expenses) = 'array' THEN job_meta.expenses ELSE '[]'::jsonb END) || ${feeList}::jsonb
            END,
            updated_at = NOW()
        `;
      }
    }
  } catch (err) {
    console.error("stripe-webhook processing error:", err);
    return new Response("Could not record the payment", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};

export const config = { path: "/api/stripe-webhook" };
