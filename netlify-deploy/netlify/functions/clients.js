import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

export default async (req) => {
  if (!requireAuth(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = req.method;
  const url = new URL(req.url);

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT * FROM clients ORDER BY name`;
      // lead_source is the first multi-word column on this table — reshape
      // it to leadSource so the client-side code doesn't need to know
      // about snake_case, matching how projects.js/sync-all.js already
      // handle their own multi-word columns.
      const out = rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone, addr: r.addr, city: r.city,
        state: r.state, zip: r.zip, notes: r.notes, log: r.log,
        leadSource: r.lead_source,
      }));
      return Response.json(out);
    }

    if (method === "POST") {
      const c = await req.json();
      if (!c.id || !c.name) {
        return Response.json({ error: "id and name are required" }, { status: 400 });
      }
      const [row] = await db.sql`
        INSERT INTO clients (id, name, phone, addr, city, state, zip, notes, log, lead_source, updated_at)
        VALUES (${c.id}, ${c.name}, ${c.phone || ""}, ${c.addr || ""}, ${c.city || ""},
                ${c.state || ""}, ${c.zip || ""}, ${c.notes || ""}, ${JSON.stringify(c.log || [])},
                ${c.leadSource || ""}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, phone=EXCLUDED.phone, addr=EXCLUDED.addr, city=EXCLUDED.city,
          state=EXCLUDED.state, zip=EXCLUDED.zip, notes=EXCLUDED.notes, log=EXCLUDED.log,
          lead_source=EXCLUDED.lead_source, updated_at=NOW()
        RETURNING *
      `;
      return Response.json({
        id: row.id, name: row.name, phone: row.phone, addr: row.addr, city: row.city,
        state: row.state, zip: row.zip, notes: row.notes, log: row.log,
        leadSource: row.lead_source,
      });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "id query param is required" }, { status: 400 });
      await db.sql`DELETE FROM clients WHERE id = ${id}`;
      return Response.json({ deleted: id });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("clients function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/clients" };
