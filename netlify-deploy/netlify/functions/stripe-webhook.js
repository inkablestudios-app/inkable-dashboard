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
  const parts = Object.fromEntries(
    signatureHeader.split(",").map(kv => kv.split("="))
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // Reject anything older than 5 minutes — a captured/replayed webhook
  // request shouldn't still be usable long after the fact.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(v1, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
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

  // Everything past this point returns 200 even on internal errors —
  // Stripe retries non-2xx responses, and a bug in OUR processing
  // shouldn't turn into Stripe hammering this endpoint forever.
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const projectId = session.metadata?.project_id;
      const description = session.metadata?.description || "Payment";
      const amount = (session.amount_total || 0) / 100;

      if (projectId && amount > 0) {
        const rows = await db.sql`SELECT payments FROM job_meta WHERE project_id = ${projectId}`;
        let payments = rows.length ? rows[0].payments : [];
        if (typeof payments === "string") {
          try { payments = JSON.parse(payments); } catch { payments = []; }
        }
        payments = payments || [];

        // Idempotent — Stripe retries webhook deliveries, so the same
        // session completing twice must not record the payment twice.
        const alreadyRecorded = payments.some(p => p.stripeSessionId === session.id);
        if (!alreadyRecorded) {
          payments.push({
            id: "pmt_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
            amount,
            method: "Card (Stripe) — " + description,
            date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            stripeSessionId: session.id,
          });

          await db.sql`
            INSERT INTO job_meta (project_id, payments, updated_at)
            VALUES (${projectId}, ${JSON.stringify(payments)}, NOW())
            ON CONFLICT (project_id) DO UPDATE SET payments = ${JSON.stringify(payments)}, updated_at = NOW()
          `;
        }
      }
    }
  } catch (err) {
    console.error("stripe-webhook processing error:", err);
  }

  return new Response("ok", { status: 200 });
};

export const config = { path: "/api/stripe-webhook" };
