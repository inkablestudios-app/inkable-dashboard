import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";
import { hashPassword, makeToken, verifyToken, hasSecret } from "./_shared/auth.js";

const db = getDatabase();
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default async (req) => {
  if (!hasSecret()) {
    return Response.json(
      { error: "Server not configured — set the AUTH_JWT_SECRET environment variable in Netlify first." },
      { status: 500 }
    );
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  try {
    if (body.action === "status") {
      // Lets the app know whether a password has ever been set, so it can
      // show "create a password" on first use vs. "enter your password"
      // every time after.
      const rows = await db.sql`SELECT password_hash FROM app_auth WHERE id = 1`;
      return Response.json({ configured: !!(rows[0] && rows[0].password_hash) });
    }

    if (body.action === "login") {
      const rows = await db.sql`SELECT * FROM app_auth WHERE id = 1`;
      if (!rows.length || !rows[0].password_hash) {
        return Response.json({ error: "No password has been set yet." }, { status: 400 });
      }
      const hash = hashPassword(body.password || "", rows[0].password_salt);
      if (hash !== rows[0].password_hash) {
        return Response.json({ error: "Incorrect password." }, { status: 401 });
      }
      const token = makeToken({ exp: Date.now() + THIRTY_DAYS });
      return Response.json({ token });
    }

    if (body.action === "set-password") {
      const rows = await db.sql`SELECT * FROM app_auth WHERE id = 1`;
      const hasExisting = rows.length && rows[0].password_hash;
      if (hasExisting) {
        // Changing an existing password requires either the current
        // password or a currently-valid session — not open to anyone.
        const currentValid = body.currentPassword
          ? hashPassword(body.currentPassword, rows[0].password_salt) === rows[0].password_hash
          : false;
        const tokenValid = verifyToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
        if (!currentValid && !tokenValid) {
          return Response.json({ error: "Current password (or an active session) is required to change it." }, { status: 401 });
        }
      }
      if (!body.newPassword || body.newPassword.length < 6) {
        return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = hashPassword(body.newPassword, salt);
      await db.sql`
        INSERT INTO app_auth (id, password_hash, password_salt, updated_at)
        VALUES (1, ${hash}, ${salt}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          updated_at = NOW()
      `;
      const token = makeToken({ exp: Date.now() + THIRTY_DAYS });
      return Response.json({ token });
    }

    if (body.action === "verify") {
      return Response.json({ valid: !!verifyToken(body.token) });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("auth function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/auth" };
