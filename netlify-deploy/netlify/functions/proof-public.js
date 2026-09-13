import { getDatabase } from "@netlify/database";

const db = getDatabase();

// Converts a Google Drive "view" link into the embeddable "preview" format
// — same conversion the main Dashboard uses, needed here too since this
// page also has to display the proof inline.
function getDriveEmbedUrl(url) {
  const match = url && url.match(/\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : url;
}

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.json({ error: "Missing token" }, { status: 400 });

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT ps.*, p.name AS job_name, p.est_no, p.state, p.saved_at, p.client_id,
               jm.proof_link, jm.status, jm.install_date,
               c.name AS client_name
        FROM proof_shares ps
        JOIN projects p ON p.id = ps.project_id
        LEFT JOIN job_meta jm ON jm.project_id = ps.project_id
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE ps.token = ${token}
      `;
      if (!rows.length) return Response.json({ error: "This link isn't valid — it may have been removed." }, { status: 404 });
      const r = rows[0];

      // Record the view — this is the "real record of when they actually
      // looked" the feature is for. Every GET counts as a view; first_viewed_at
      // only ever gets set once, last_viewed_at always moves forward.
      await db.sql`
        UPDATE proof_shares SET
          first_viewed_at = COALESCE(first_viewed_at, NOW()),
          last_viewed_at = NOW(),
          view_count = view_count + 1
        WHERE token = ${token}
      `;

      if (!r.proof_link) {
        return Response.json({ error: "No proof has been uploaded for this job yet." }, { status: 404 });
      }

      // state may come back as a JSON string or an already-parsed object
      // depending on the driver — handle both rather than assume.
      let state = r.state;
      if (typeof state === "string") {
        try { state = JSON.parse(state); } catch { state = {}; }
      }
      const estimateSummary = state?.form?.estimateSummary || null;

      return Response.json({
        jobName: state?.form?.jobName || r.job_name || "Your job",
        estNo: r.est_no || "",
        clientName: r.client_name || "",
        status: r.status || "send",
        requestedDate: r.saved_at || "",
        installDate: r.install_date || "",
        proofEmbedUrl: getDriveEmbedUrl(r.proof_link),
        response: r.response,
        responseNote: r.response_note,
        estimateSummary,
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const response = body.response;
      const note = (body.note || "").slice(0, 2000); // sane cap, this is unauthenticated input
      if (!["approved", "changes"].includes(response)) {
        return Response.json({ error: "Invalid response" }, { status: 400 });
      }

      const rows = await db.sql`SELECT project_id FROM proof_shares WHERE token = ${token}`;
      if (!rows.length) return Response.json({ error: "This link isn't valid." }, { status: 404 });
      const projectId = rows[0].project_id;

      await db.sql`
        UPDATE proof_shares SET response = ${response}, response_note = ${note}, response_at = NOW()
        WHERE token = ${token}
      `;

      // The only write this public, unauthenticated endpoint is allowed to
      // make to job_meta — and only for the ONE project this specific
      // token is tied to, never anything else. Upsert rather than a plain
      // UPDATE, since a job_meta row might not exist yet for this project
      // in the rare case a proof was uploaded before any other job_meta
      // field was ever synced.
      const newStatus = response === "approved" ? "approved" : "revision";
      await db.sql`
        INSERT INTO job_meta (project_id, status, updated_at)
        VALUES (${projectId}, ${newStatus}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET status = ${newStatus}, updated_at = NOW()
      `;

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("proof-public function error:", err);
    return Response.json({ error: "Something went wrong on our end." }, { status: 500 });
  }
};

export const config = { path: "/api/proof-public" };
