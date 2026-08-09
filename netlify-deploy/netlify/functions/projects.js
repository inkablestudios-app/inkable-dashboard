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
      const rows = await db.sql`SELECT * FROM projects ORDER BY saved_at DESC`;
      // Reshape back to the flat structure the app already expects.
      const out = rows.map(r => ({
        id: r.id, name: r.name, estNo: r.est_no, projectNum: r.project_num,
        clientId: r.client_id, savedAt: r.saved_at, docType: r.doc_type,
        state: r.state, exportedPdfs: r.exported_pdfs,
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
