import { getDatabase } from "@netlify/database";

const db = getDatabase();

export default async (req) => {
  const method = req.method;

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT data FROM pricing_settings WHERE id = 1`;
      return Response.json(rows[0]?.data || {});
    }

    if (method === "POST") {
      const data = await req.json();
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
