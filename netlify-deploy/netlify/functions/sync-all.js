import { getDatabase } from "@netlify/database";

const db = getDatabase();

// One round-trip for the "pull the latest before showing anything" step on
// app load, instead of four separate requests. Read-only — writes still go
// through the individual endpoints (clients.js, projects.js, job-meta.js,
// pricing.js) so each save stays a small, precise operation, not a full
// re-upload of everything.
export default async (req) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const [clients, projectRows, metaRows, pricingRows] = await Promise.all([
      db.sql`SELECT * FROM clients ORDER BY name`,
      db.sql`SELECT * FROM projects ORDER BY saved_at DESC`,
      db.sql`SELECT * FROM job_meta`,
      db.sql`SELECT data FROM pricing_settings WHERE id = 1`,
    ]);

    const projects = projectRows.map(r => ({
      id: r.id, name: r.name, estNo: r.est_no, projectNum: r.project_num,
      clientId: r.client_id, savedAt: r.saved_at, docType: r.doc_type,
      state: r.state, exportedPdfs: r.exported_pdfs,
    }));

    const jobMeta = {};
    metaRows.forEach(r => {
      jobMeta[r.project_id] = {
        status: r.status, tags: r.tags, notes: r.notes,
        installDate: r.install_date, proofLink: r.proof_link, payments: r.payments,
      };
    });

    return Response.json({
      clients,
      projects,
      jobMeta,
      pricing: pricingRows[0]?.data || {},
    });
  } catch (err) {
    console.error("sync-all function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/sync-all" };
