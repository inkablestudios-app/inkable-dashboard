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
  if (!(await requireAuth(req))) {
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

      // PDF-only update (id + exportedPdfs, no job data): adds the PDF to a job
      // that's already here. Never inserts, so a job deleted on another device
      // stays deleted (then there's nothing to do: updated is false).
      if (p.pdfsOnly || p.state == null) {
        const pdfs = Object.fromEntries(Object.entries(p.exportedPdfs || {})
          .filter(([k, v]) => PDF_TYPES.includes(k) && v && typeof v === "object"));
        const rows = await db.sql`
          UPDATE projects SET
            exported_pdfs = (CASE WHEN jsonb_typeof(exported_pdfs) = 'object' THEN exported_pdfs ELSE '{}'::jsonb END) || COALESCE((
              SELECT jsonb_object_agg(k,
                CASE WHEN NOT jsonb_exists(v, 'data') AND jsonb_exists(COALESCE(projects.exported_pdfs -> k, '{}'::jsonb), 'data')
                     THEN projects.exported_pdfs -> k ELSE v END)
              FROM jsonb_each(${JSON.stringify(pdfs)}::jsonb) AS x(k, v)
            ), '{}'::jsonb),
            updated_at = NOW()
          WHERE id = ${p.id}
          RETURNING id
        `;
        return Response.json({ id: p.id, updated: rows.length > 0 });
      }

      // Est # already used by ANOTHER job: two devices made the same number
      // before syncing. A new job is refused (409). The Dashboard asks for
      // the next free number instead (onEstClash: "renumber"), which also
      // covers a save that waited offline; a job renamed into a taken number
      // keeps its own. Jobs that already shared a number are left alone.
      let renumbered = null;
      const est = String(p.estNo || "").trim();
      if (est) {
        const taken = await db.sql`SELECT 1 FROM projects WHERE est_no = ${est} AND id <> ${p.id} LIMIT 1`;
        const [cur] = taken.length ? await db.sql`SELECT est_no, project_num FROM projects WHERE id = ${p.id}` : [];
        if (taken.length && (!cur || cur.est_no !== est)) {
          if (p.onEstClash !== "renumber") {
            if (!cur) return Response.json({ error: `${est} is already used by another job. Change the Est # and save again.` }, { status: 409 });
          } else {
            let estNo = null, projectNum = null;
            if (cur && cur.est_no) {
              const own = await db.sql`SELECT 1 FROM projects WHERE est_no = ${cur.est_no} AND id <> ${p.id} LIMIT 1`;
              if (!own.length) { estNo = cur.est_no; projectNum = cur.project_num; }
            }
            if (!estNo) {
              const all = await db.sql`SELECT est_no, project_num FROM projects`;
              let hi = Math.max(0, (parseInt(p.minNextNum, 10) || 0) - 1);
              for (const r of all) hi = Math.max(hi, numberIn(r.est_no), numberIn(r.project_num));
              // same prefix as the number it replaces (Settings → Numbering)
              projectNum = String(hi + 1); estNo = (prefixOf(est) || "EST-") + projectNum;
            }
            const invNo = (prefixOf(p.state?.form?.invNo) || "INV-") + (numberIn(estNo) || projectNum);
            renumbered = { from: est, estNo, projectNum, invNo, kept: !!cur };
            p.estNo = estNo; p.projectNum = projectNum;
            if (p.state && p.state.form) Object.assign(p.state.form, { estNo, projectNum, invNo });
          }
        }
      }
      // A re-priced or edited job: its stored estimate/invoice PDFs show the
      // old version, so they're dropped and rebuilt from the new numbers.
      const drop = (Array.isArray(p.dropPdfs) ? p.dropPdfs : []).filter(k => PDF_TYPES.includes(k));

      const [row] = await db.sql`
        INSERT INTO projects (id, name, est_no, project_num, client_id, saved_at, doc_type, state, exported_pdfs, updated_at)
        VALUES (${p.id}, ${p.name || ""}, ${p.estNo || ""}, ${p.projectNum || ""},
                (SELECT id FROM clients WHERE id = ${p.clientId || null}),
                ${p.savedAt || ""}, ${p.docType || "estimate"}, ${JSON.stringify(p.state || {})},
                ${JSON.stringify(p.exportedPdfs || {})}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, est_no=EXCLUDED.est_no, project_num=EXCLUDED.project_num,
          client_id=EXCLUDED.client_id, saved_at=EXCLUDED.saved_at, doc_type=EXCLUDED.doc_type,
          state=EXCLUDED.state,
          -- The Dashboard only keeps PDF *metadata* locally (no bytes), so a
          -- normal re-save sends entries without "data". Keep the stored bytes
          -- for those, and keep any PDF types the save didn't mention at all;
          -- only an entry that carries new bytes replaces the old one.
          exported_pdfs = ((CASE WHEN jsonb_typeof(projects.exported_pdfs) = 'object' THEN projects.exported_pdfs ELSE '{}'::jsonb END) || COALESCE((
            SELECT jsonb_object_agg(k,
              CASE WHEN NOT jsonb_exists(v, 'data') AND jsonb_exists(COALESCE(projects.exported_pdfs -> k, '{}'::jsonb), 'data')
                   THEN projects.exported_pdfs -> k ELSE v END)
            FROM jsonb_each(EXCLUDED.exported_pdfs) AS x(k, v)
          ), '{}'::jsonb)) - ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(drop)}::jsonb)),
          updated_at=NOW()
        RETURNING *
      `;
      return Response.json(renumbered ? { ...row, renumbered } : row);
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

const PDF_TYPES = ["estimate", "invoice", "receipt"];
// The number at the end of an Est # or project number ("EST-1005" → 1005).
function numberIn(s) {
  const m = /(\d+)\s*$/.exec(String(s || ""));
  const n = m ? parseInt(m[1], 10) : 0;
  return n < 1e9 ? n : 0;
}
// What comes before that number ("IS-2500" → "IS-").
function prefixOf(s) {
  return String(s || "").trim().replace(/\d+\s*$/, "");
}

export const config = { path: "/api/projects" };
