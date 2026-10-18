import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";

// AUTH_JWT_SECRET must be set as a Netlify environment variable — never
// hardcoded here. Without it, tokens can't be signed or verified, and
// every protected endpoint fails closed (denies access) rather than open.
const SECRET = process.env.AUTH_JWT_SECRET;

export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function makeToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// Returns the decoded payload if the token is validly signed and not
// expired, or null otherwise. Never throws — callers just check truthiness.
export function verifyToken(token) {
  if (!token || !SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// A short fingerprint of the current password, carried inside every login.
// Changing the password changes it, which signs out every other device
// (e.g. a lost phone) instead of leaving their logins valid for 30 days.
export function passwordStamp(passwordHash) {
  return crypto.createHash("sha256").update(String(passwordHash || "")).digest("hex").slice(0, 16);
}
export async function currentPasswordStamp() {
  const rows = await getDatabase().sql`SELECT password_hash FROM app_auth WHERE id = 1`;
  return rows[0]?.password_hash ? passwordStamp(rows[0].password_hash) : null;
}
// A login that is validly signed, not expired, and issued under the
// current password.
export async function isValidLogin(token) {
  const payload = verifyToken(token);
  if (!payload) return false;
  const stamp = await currentPasswordStamp();
  return !!stamp && payload.pw === stamp;
}

// Call at the top of every protected function. Resolves true/false —
// doesn't throw, so callers just do: if (!(await requireAuth(req))) return 401.
export async function requireAuth(req) {
  const header = req.headers.get("authorization") || "";
  return isValidLogin(header.replace(/^Bearer\s+/i, ""));
}

export function hasSecret() {
  return !!SECRET;
}
