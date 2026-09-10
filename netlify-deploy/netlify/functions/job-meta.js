import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

export default async (req) => {
  if (!requireAuth(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = req.method;

  try {
    if (method === "GET") {
      const rows = await db.sql`SELECT * FROM job_meta`;
      // Reshape into the {projectId: {status, tags, notes, ...}} map the
      // app uses. install_date, proof_link, and expenses are multi-word
      // or newer columns that need explicit reshaping to camelCase.
      const out = {};
      rows.forEach(r => {
        out[r.project_id] = {
          status: r.status, tags: r.tags, notes: r.notes,
          installDate: r.install_date, proofLink: r.proof_link,
          payments: r.payments, expenses: r.expenses,
        };
      });
      return Response.json(out);
    }

    if (method === "POST") {
      const m = await req.json();
      if (!m.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
      const [row] = await db.sql`
        INSERT INTO job_meta (project_id, status, tags, notes, install_date, proof_link, payments, expenses, updated_at)
        VALUES (${m.projectId}, ${m.status || "send"}, ${JSON.stringify(m.tags || [])}, ${m.notes || ""},
                ${m.installDate || ""}, ${m.proofLink || ""}, ${JSON.stringify(m.payments || [])},
                ${JSON.stringify(m.expenses || [])}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET
          status=EXCLUDED.status, tags=EXCLUDED.tags, notes=EXCLUDED.notes,
          install_date=EXCLUDED.install_date, proof_link=EXCLUDED.proof_link,
          payments=EXCLUDED.payments, expenses=EXCLUDED.expenses, updated_at=NOW()
        RETURNING *
      `;
      return Response.json({
        status: row.status, tags: row.tags, notes: row.notes,
        installDate: row.install_date, proofLink: row.proof_link,
        payments: row.payments, expenses: row.expenses,
      });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("job-meta function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/job-meta" };
