import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";
import crypto from "node:crypto";

const db = getDatabase();

export default async (req) => {
  if (!requireAuth(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const projectId = url.searchParams.get("projectId");
      if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

      const rows = await db.sql`SELECT * FROM proof_shares WHERE project_id = ${projectId}`;
      if (!rows.length) return Response.json({ exists: false });
      const r = rows[0];
      return Response.json({
        exists: true, token: r.token,
        firstViewedAt: r.first_viewed_at, lastViewedAt: r.last_viewed_at, viewCount: r.view_count,
        response: r.response, responseNote: r.response_note, responseAt: r.response_at,
      });
    }

    if (req.method === "POST") {
      const { projectId } = await req.json();
      if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

      // Idempotent — "same link always works" means re-clicking "Get
      // Client Link" on a job that already has one just hands back the
      // existing token instead of minting a second, orphaned one.
      const existing = await db.sql`SELECT token FROM proof_shares WHERE project_id = ${projectId}`;
      if (existing.length) return Response.json({ token: existing[0].token });

      const token = crypto.randomBytes(24).toString("base64url");
      await db.sql`INSERT INTO proof_shares (token, project_id) VALUES (${token}, ${projectId})`;
      return Response.json({ token });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("proof-share function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/proof-share" };
