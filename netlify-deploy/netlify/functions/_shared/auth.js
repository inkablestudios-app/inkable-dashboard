import crypto from "node:crypto";

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

// Call at the top of every protected function. Returns true/false —
// doesn't throw, so callers just do: if (!requireAuth(req)) return 401.
export function requireAuth(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  return !!verifyToken(token);
}

export function hasSecret() {
  return !!SECRET;
}
