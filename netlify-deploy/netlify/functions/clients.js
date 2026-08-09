import { getDatabase } from "@netlify/database";

const db = getDatabase();

export default async (req) => {
  const method = req.method;
  const url = new URL(req.url);

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT * FROM clients ORDER BY name`;
      return Response.json(rows);
    }

    if (method === "POST") {
      const c = await req.json();
      if (!c.id || !c.name) {
        return Response.json({ error: "id and name are required" }, { status: 400 });
      }
      const [row] = await db.sql`
        INSERT INTO clients (id, name, phone, addr, city, state, zip, notes, log, updated_at)
        VALUES (${c.id}, ${c.name}, ${c.phone || ""}, ${c.addr || ""}, ${c.city || ""},
                ${c.state || ""}, ${c.zip || ""}, ${c.notes || ""}, ${JSON.stringify(c.log || [])}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, phone=EXCLUDED.phone, addr=EXCLUDED.addr, city=EXCLUDED.city,
          state=EXCLUDED.state, zip=EXCLUDED.zip, notes=EXCLUDED.notes, log=EXCLUDED.log,
          updated_at=NOW()
        RETURNING *
      `;
      return Response.json(row);
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
