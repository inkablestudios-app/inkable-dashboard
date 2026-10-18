import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

export default async (req) => {
  if (!(await requireAuth(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = req.method;

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT data FROM pricing_settings WHERE id = 1`;
      return Response.json(rows[0]?.data || {});
    }

    if (method === "POST") {
      const data = await req.json();
      // Settings saves send only the fields that changed, merged into what
      // the server has, so one device can't put back another device's older
      // settings. A full set (restoring a backup) still replaces everything.
      if (data && data.patch && typeof data.patch === "object") {
        const [row] = await db.sql`
          INSERT INTO pricing_settings (id, data, updated_at)
          VALUES (1, ${JSON.stringify(data.patch)}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            data = (CASE WHEN jsonb_typeof(pricing_settings.data) = 'object' THEN pricing_settings.data ELSE '{}'::jsonb END) || EXCLUDED.data,
            updated_at = NOW()
          RETURNING data
        `;
        return Response.json(row.data);
      }
      await db.sql`
        INSERT INTO pricing_settings (id, data, updated_at)
        VALUES (1, ${JSON.stringify(data)}, NOW())
        ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
      `;
      return Response.json(data);
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("pricing function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/pricing" };
