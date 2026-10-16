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
      // The column is named is_excluded (not "excluded") specifically to
      // avoid any collision with Postgres's own EXCLUDED pseudo-table used
      // in the upsert below — same value, safer name.
      const out = {};
      rows.forEach(r => {
        out[r.project_id] = {
          status: r.status, tags: r.tags, notes: r.notes,
          installDate: r.install_date, installTime: r.install_time, proofLink: r.proof_link,
          estimateVisualLink: r.estimate_visual_link,
          payments: r.payments, expenses: r.expenses,
          excluded: r.is_excluded, calendarEventId: r.calendar_event_id,
        };
      });
      return Response.json(out);
    }

    if (method === "POST") {
      const m = await req.json();
      if (!m.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

      // Payments are MERGED, never blindly replaced. The Stripe webhook
      // writes payments straight to the server, so a Dashboard tab holding
      // an older copy of this job must not wipe them out when it saves an
      // unrelated change (status, notes...). Rule: keep every payment the
      // server already has unless the Dashboard sent it (by id) or
      // explicitly asked to delete it via removedPaymentIds.
      const incomingPayments = Array.isArray(m.payments) ? m.payments : [];
      const keepOutIds = JSON.stringify([
        ...incomingPayments.map(p => p && p.id).filter(Boolean),
        ...(Array.isArray(m.removedPaymentIds) ? m.removedPaymentIds : []),
      ].map(String));
      // Same rule for expenses — the webhook adds the Stripe fee there.
      const incomingExpenses = Array.isArray(m.expenses) ? m.expenses : [];
      const keepOutExpenseIds = JSON.stringify([
        ...incomingExpenses.map(e => e && e.id).filter(Boolean),
        ...(Array.isArray(m.removedExpenseIds) ? m.removedExpenseIds : []),
      ].map(String));
      const [row] = await db.sql`
        INSERT INTO job_meta (project_id, status, tags, notes, install_date, install_time, proof_link, estimate_visual_link, payments, expenses, is_excluded, calendar_event_id, updated_at)
        VALUES (${m.projectId}, ${m.status || "send"}, ${JSON.stringify(m.tags || [])}, ${m.notes || ""},
                ${m.installDate || ""}, ${m.installTime || ""}, ${m.proofLink || ""}, ${m.estimateVisualLink || ""}, ${JSON.stringify(incomingPayments)}::jsonb,
                ${JSON.stringify(incomingExpenses)}::jsonb, ${!!m.excluded}, ${m.calendarEventId || ""}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET
          status=EXCLUDED.status, tags=EXCLUDED.tags, notes=EXCLUDED.notes,
          install_date=EXCLUDED.install_date, install_time=EXCLUDED.install_time, proof_link=EXCLUDED.proof_link, estimate_visual_link=EXCLUDED.estimate_visual_link,
          payments=EXCLUDED.payments || COALESCE((
            SELECT jsonb_agg(e) FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(job_meta.payments) = 'array' THEN job_meta.payments ELSE '[]'::jsonb END
            ) AS e
            WHERE NOT jsonb_exists(${keepOutIds}::jsonb, e->>'id')
          ), '[]'::jsonb),
          expenses=EXCLUDED.expenses || COALESCE((
            SELECT jsonb_agg(e) FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(job_meta.expenses) = 'array' THEN job_meta.expenses ELSE '[]'::jsonb END
            ) AS e
            WHERE NOT jsonb_exists(${keepOutExpenseIds}::jsonb, e->>'id')
          ), '[]'::jsonb),
          is_excluded=EXCLUDED.is_excluded, calendar_event_id=EXCLUDED.calendar_event_id, updated_at=NOW()
        RETURNING *
      `;
      return Response.json({
        status: row.status, tags: row.tags, notes: row.notes,
        installDate: row.install_date, installTime: row.install_time, proofLink: row.proof_link,
        estimateVisualLink: row.estimate_visual_link,
        payments: row.payments, expenses: row.expenses,
        excluded: row.is_excluded, calendarEventId: row.calendar_event_id,
      });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    console.error("job-meta function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/job-meta" };
