import { getDatabase } from "@netlify/database";

const db = getDatabase();

export default async (req) => {
  const method = req.method;
  const url = new URL(req.url);

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT * FROM job_meta`;
      // Reshape into the {projectId: {status, tags, notes, ...}} map the app uses.
      const out = {};
      rows.forEach(r => {
        out[r.project_id] = {
          status: r.status, tags: r.tags, notes: r.notes,
          installDate: r.install_date, proofLink: r.proof_link, payments: r.payments,
        };
      });
      return Response.json(out);
    }

    if (method === "POST") {
      const m = await req.json();
      if (!m.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
      const [row] = await db.sql`
        INSERT INTO job_meta (project_id, status, tags, notes, install_date, proof_link, payments, updated_at)
        VALUES (${m.projectId}, ${m.status || "send"}, ${JSON.stringify(m.tags || [])}, ${m.notes || ""},
                ${m.installDate || ""}, ${m.proofLink || ""}, ${JSON.stringify(m.payments || [])}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET
          status=EXCLUDED.status, tags=EXCLUDED.tags, notes=EXCLUDED.notes,
          install_date=EXCLUDED.install_date, proof_link=EXCLUDED.proof_link,
          payments=EXCLUDED.payments, updated_at=NOW()
        RETURNING *
      `;
      return Response.json(row);
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("job-meta function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/job-meta" };
