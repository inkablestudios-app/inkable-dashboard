import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

// Same stripping as projects.js's bulk listing — the PDF bytes are the
// heaviest thing in this whole payload, and this endpoint runs on every
// login. Keeping them out here is what actually fixes the local storage
// quota problem, not just the try/catch that handles it gracefully.
function stripPdfBytes(exportedPdfs) {
  if (!exportedPdfs) return {};
  const out = {};
  for (const [type, snap] of Object.entries(exportedPdfs)) {
    out[type] = { savedAt: snap.savedAt, storedInCloud: true };
  }
  return out;
}

// One round-trip for the "pull the latest before showing anything" step on
// app load, instead of four separate requests. Read-only — writes still go
// through the individual endpoints (clients.js, projects.js, job-meta.js,
// pricing.js) so each save stays a small, precise operation, not a full
// re-upload of everything.
export default async (req) => {
  if (!requireAuth(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const [clientRows, projectRows, metaRows, pricingRows, proofRows] = await Promise.all([
      db.sql`SELECT * FROM clients ORDER BY name`,
      db.sql`SELECT * FROM projects ORDER BY saved_at DESC`,
      db.sql`SELECT * FROM job_meta`,
      db.sql`SELECT data FROM pricing_settings WHERE id = 1`,
      // Only rows with an actual response — this powers the "client
      // responded while you were away" notification, so jobs no one's
      // replied to yet don't need to come along for the ride.
      db.sql`SELECT project_id, response, response_note, response_at FROM proof_shares WHERE response IS NOT NULL`,
    ]);

    const clients = clientRows.map(r => ({
      id: r.id, name: r.name, phone: r.phone, addr: r.addr, city: r.city,
      state: r.state, zip: r.zip, notes: r.notes, log: r.log,
      leadSource: r.lead_source,
    }));

    const projects = projectRows.map(r => ({
      id: r.id, name: r.name, estNo: r.est_no, projectNum: r.project_num,
      clientId: r.client_id, savedAt: r.saved_at, docType: r.doc_type,
      state: r.state, exportedPdfs: stripPdfBytes(r.exported_pdfs),
    }));

    const jobMeta = {};
    metaRows.forEach(r => {
      jobMeta[r.project_id] = {
        status: r.status, tags: r.tags, notes: r.notes,
        installDate: r.install_date, installTime: r.install_time, proofLink: r.proof_link, payments: r.payments,
        expenses: r.expenses, excluded: r.is_excluded, calendarEventId: r.calendar_event_id,
      };
    });

    const proofResponses = {};
    proofRows.forEach(r => {
      proofResponses[r.project_id] = {
        response: r.response, responseNote: r.response_note, responseAt: r.response_at,
      };
    });

    return Response.json({
      clients,
      projects,
      jobMeta,
      pricing: pricingRows[0]?.data || {},
      proofResponses,
    });
  } catch (err) {
    console.error("sync-all function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/sync-all" };
