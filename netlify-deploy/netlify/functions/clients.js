import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

// The prefs column comes with migration 012; added here too (once per
// function start) so saving clients can't break if the migration is late.
let prefsReady = false;
async function ensurePrefs() {
  if (prefsReady) return;
  try { await db.sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS prefs JSONB DEFAULT '{}'::jsonb`; } catch (e) { /* the migration adds it */ }
  prefsReady = true;
}

export default async (req) => {
  if (!(await requireAuth(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = req.method;
  const url = new URL(req.url);

  try {
    await ensurePrefs();
    if (method === "GET") {
      const rows = await db.sql`SELECT * FROM clients ORDER BY name`;
      // lead_source is the first multi-word column on this table — reshape
      // it to leadSource so the client-side code doesn't need to know
      // about snake_case, matching how projects.js/sync-all.js already
      // handle their own multi-word columns.
      const out = rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone, email: r.email || "", addr: r.addr, city: r.city,
        state: r.state, zip: r.zip, notes: r.notes, log: r.log,
        leadSource: r.lead_source, prefs: r.prefs || {},
      }));
      return Response.json(out);
    }

    if (method === "POST") {
      const c = await req.json();
      // Edits send only what changed, and the call log is merged by entry
      // (not replaced), so a call logged on the phone survives the computer
      // fixing the client's email.
      if (c.patch && c.id) {
        const has = k => Object.prototype.hasOwnProperty.call(c, k);
        if (has("name") && !String(c.name || "").trim()) return Response.json({ error: "name is required" }, { status: 400 });
        const upLog = Array.isArray(c.logUpsert) ? c.logUpsert.filter(e => e && e.id) : [];
        const dropLog = JSON.stringify([...upLog.map(e => e.id), ...(Array.isArray(c.removedLogIds) ? c.removedLogIds : [])].map(String));
        const [row] = await db.sql`
          UPDATE clients SET
            name = CASE WHEN ${has("name")} THEN ${c.name || ""} ELSE name END,
            phone = CASE WHEN ${has("phone")} THEN ${c.phone || ""} ELSE phone END,
            email = CASE WHEN ${has("email")} THEN ${c.email || ""} ELSE email END,
            addr = CASE WHEN ${has("addr")} THEN ${c.addr || ""} ELSE addr END,
            city = CASE WHEN ${has("city")} THEN ${c.city || ""} ELSE city END,
            state = CASE WHEN ${has("state")} THEN ${c.state || ""} ELSE state END,
            zip = CASE WHEN ${has("zip")} THEN ${c.zip || ""} ELSE zip END,
            notes = CASE WHEN ${has("notes")} THEN ${c.notes || ""} ELSE notes END,
            lead_source = CASE WHEN ${has("leadSource")} THEN ${c.leadSource || ""} ELSE lead_source END,
            prefs = CASE WHEN ${has("prefs")} THEN ${JSON.stringify(c.prefs || {})}::jsonb ELSE prefs END,
            log = ${JSON.stringify(upLog)}::jsonb || COALESCE((
              SELECT jsonb_agg(e) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(log) = 'array' THEN log ELSE '[]'::jsonb END) AS e
              WHERE NOT jsonb_exists(${dropLog}::jsonb, e->>'id')
            ), '[]'::jsonb),
            updated_at = NOW()
          WHERE id = ${c.id}
          RETURNING *
        `;
        if (!row) return Response.json({ error: "That client no longer exists." }, { status: 409 });
        return Response.json({
          id: row.id, name: row.name, phone: row.phone, email: row.email || "", addr: row.addr, city: row.city,
          state: row.state, zip: row.zip, notes: row.notes, log: row.log,
          leadSource: row.lead_source, prefs: row.prefs || {},
        });
      }
      if (!c.id || !c.name) {
        return Response.json({ error: "id and name are required" }, { status: 400 });
      }
      const [row] = await db.sql`
        INSERT INTO clients (id, name, phone, email, addr, city, state, zip, notes, log, lead_source, prefs, updated_at)
        VALUES (${c.id}, ${c.name}, ${c.phone || ""}, ${c.email || ""}, ${c.addr || ""}, ${c.city || ""},
                ${c.state || ""}, ${c.zip || ""}, ${c.notes || ""}, ${JSON.stringify(c.log || [])},
                ${c.leadSource || ""}, ${JSON.stringify(c.prefs || {})}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, phone=EXCLUDED.phone, email=EXCLUDED.email, addr=EXCLUDED.addr, city=EXCLUDED.city,
          state=EXCLUDED.state, zip=EXCLUDED.zip, notes=EXCLUDED.notes, log=EXCLUDED.log,
          lead_source=EXCLUDED.lead_source, prefs=EXCLUDED.prefs, updated_at=NOW()
        RETURNING *
      `;
      return Response.json({
        id: row.id, name: row.name, phone: row.phone, email: row.email || "", addr: row.addr, city: row.city,
        state: row.state, zip: row.zip, notes: row.notes, log: row.log,
        leadSource: row.lead_source, prefs: row.prefs || {},
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
