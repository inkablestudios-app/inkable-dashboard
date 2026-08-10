import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

// Strips the actual PDF bytes out of exportedPdfs, keeping just the
// metadata (that a PDF exists, and when). Used for the bulk list endpoint
// so pulling "all projects" stays small — the actual bytes are only ever
// fetched on demand, for one project at a time, via ?id=.
function stripPdfBytes(exportedPdfs) {
  if (!exportedPdfs) return {};
  const out = {};
  for (const [type, snap] of Object.entries(exportedPdfs)) {
    out[type] = { savedAt: snap.savedAt, storedInCloud: true };
  }
  return out;
}

export default async (req) => {
  if (!requireAuth(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = req.method;
  const url = new URL(req.url);

  try {
    if (method === "GET") {
      const id = url.searchParams.get("id");

      if (id) {
        // Single project, WITH the actual PDF bytes — this is the on-demand
        // fetch used when someone clicks "View Estimate" etc.
        const rows = await db.sql`SELECT * FROM projects WHERE id = ${id}`;
        if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });
        const r = rows[0];
        return Response.json({
          id: r.id, name: r.name, estNo: r.est_no, projectNum: r.project_num,
          clientId: r.client_id, savedAt: r.saved_at, docType: r.doc_type,
          state: r.state, exportedPdfs: r.exported_pdfs,
        });
      }

      const rows = await db.sql`SELECT * FROM projects ORDER BY saved_at DESC`;
      const out = rows.map(r => ({
        id: r.id, name: r.name, estNo: r.est_no, projectNum: r.project_num,
        clientId: r.client_id, savedAt: r.saved_at, docType: r.doc_type,
        state: r.state, exportedPdfs: stripPdfBytes(r.exported_pdfs),
      }));
      return Response.json(out);
    }

    if (method === "POST") {
      const p = await req.json();
      if (!p.id) return Response.json({ error: "id is required" }, { status: 400 });
      const [row] = await db.sql`
        INSERT INTO projects (id, name, est_no, project_num, client_id, saved_at, doc_type, state, exported_pdfs, updated_at)
        VALUES (${p.id}, ${p.name || ""}, ${p.estNo || ""}, ${p.projectNum || ""}, ${p.clientId || null},
                ${p.savedAt || ""}, ${p.docType || "estimate"}, ${JSON.stringify(p.state || {})},
                ${JSON.stringify(p.exportedPdfs || {})}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, est_no=EXCLUDED.est_no, project_num=EXCLUDED.project_num,
          client_id=EXCLUDED.client_id, saved_at=EXCLUDED.saved_at, doc_type=EXCLUDED.doc_type,
          state=EXCLUDED.state, exported_pdfs=EXCLUDED.exported_pdfs, updated_at=NOW()
        RETURNING *
      `;
      return Response.json(row);
    }

    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "id query param is required" }, { status: 400 });
      await db.sql`DELETE FROM projects WHERE id = ${id}`;
      return Response.json({ deleted: id });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("projects function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/projects" };
