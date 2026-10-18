import { getDatabase } from "@netlify/database";
import { requireAuth } from "./_shared/auth.js";

const db = getDatabase();

const metaOut = row => ({
  status: row.status, tags: row.tags, notes: row.notes,
  installDate: row.install_date, installTime: row.install_time, proofLink: row.proof_link,
  estimateVisualLink: row.estimate_visual_link, statusAt: Number(row.status_at) || 0,
  payments: row.payments, expenses: row.expenses,
  excluded: row.is_excluded, calendarEventId: row.calendar_event_id,
});

export default async (req) => {
  if (!(await requireAuth(req))) {
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
          estimateVisualLink: r.estimate_visual_link, statusAt: Number(r.status_at) || 0,
          payments: r.payments, expenses: r.expenses,
          excluded: r.is_excluded, calendarEventId: r.calendar_event_id,
        };
      });
      return Response.json(out);
    }

    if (method === "POST") {
      const m = await req.json();
      if (!m.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

      // Everyday edits send only what changed (a "patch"), so a device holding
      // an older copy of the job can't put back what another device changed or
      // deleted (notes, install date, a removed payment...). Full records
      // (restoring a backup, older app versions) go through the merge below.
      if (m.patch) {
        const has = k => Object.prototype.hasOwnProperty.call(m, k);
        const statusAt = Number(m.statusAt) > 0 ? Math.floor(Number(m.statusAt)) : 0;
        const upPay = Array.isArray(m.paymentsUpsert) ? m.paymentsUpsert.filter(p => p && p.id) : [];
        const dropPay = JSON.stringify([...upPay.map(p => p.id), ...(Array.isArray(m.removedPaymentIds) ? m.removedPaymentIds : [])].map(String));
        const upExp = Array.isArray(m.expensesUpsert) ? m.expensesUpsert.filter(e => e && e.id) : [];
        const dropExp = JSON.stringify([...upExp.map(e => e.id), ...(Array.isArray(m.removedExpenseIds) ? m.removedExpenseIds : [])].map(String));
        await db.sql`INSERT INTO job_meta (project_id, updated_at) VALUES (${m.projectId}, NOW()) ON CONFLICT (project_id) DO NOTHING`;
        const [row] = await db.sql`
          UPDATE job_meta SET
            status = CASE WHEN ${has("status")} AND ${statusAt} >= COALESCE(status_at, 0) THEN ${m.status || "send"} ELSE status END,
            status_at = CASE WHEN ${has("status")} THEN GREATEST(${statusAt}, COALESCE(status_at, 0)) ELSE status_at END,
            tags = CASE WHEN ${has("tags")} THEN ${JSON.stringify(m.tags || [])}::jsonb ELSE tags END,
            notes = CASE WHEN ${has("notes")} THEN ${m.notes || ""} ELSE notes END,
            install_date = CASE WHEN ${has("installDate")} THEN ${m.installDate || ""} ELSE install_date END,
            install_time = CASE WHEN ${has("installTime")} THEN ${m.installTime || ""} ELSE install_time END,
            proof_link = CASE WHEN ${has("proofLink")} THEN ${m.proofLink || ""} ELSE proof_link END,
            estimate_visual_link = CASE WHEN ${has("estimateVisualLink")} THEN ${m.estimateVisualLink || ""} ELSE estimate_visual_link END,
            is_excluded = CASE WHEN ${has("excluded")} THEN ${!!m.excluded} ELSE is_excluded END,
            calendar_event_id = CASE WHEN ${has("calendarEventId")} THEN ${m.calendarEventId || ""} ELSE calendar_event_id END,
            payments = COALESCE((
              SELECT jsonb_agg(e) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payments) = 'array' THEN payments ELSE '[]'::jsonb END) AS e
              WHERE NOT jsonb_exists(${dropPay}::jsonb, e->>'id')
            ), '[]'::jsonb) || ${JSON.stringify(upPay)}::jsonb,
            expenses = COALESCE((
              SELECT jsonb_agg(e) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(expenses) = 'array' THEN expenses ELSE '[]'::jsonb END) AS e
              WHERE NOT jsonb_exists(${dropExp}::jsonb, e->>'id')
            ), '[]'::jsonb) || ${JSON.stringify(upExp)}::jsonb,
            updated_at = NOW()
          WHERE project_id = ${m.projectId}
          RETURNING *
        `;
        return Response.json(metaOut(row));
      }

      // Payments are MERGED, never blindly replaced. The Stripe webhook
      // writes payments straight to the server, so a Dashboard tab holding
      // an older copy of this job must not wipe them out when it saves an
      // unrelated change (status, notes...). Rule: keep every payment the
      // server already has unless the Dashboard sent it (by id) or
      // explicitly asked to delete it via removedPaymentIds.
      // Status: the newest change wins. A save without a status time (older
      // app versions) counts as time 0, so it only wins over rows that have
      // never recorded one — the old behaviour.
      const statusAt = Number(m.statusAt) > 0 ? Math.floor(Number(m.statusAt)) : 0;
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
        INSERT INTO job_meta (project_id, status, status_at, tags, notes, install_date, install_time, proof_link, estimate_visual_link, payments, expenses, is_excluded, calendar_event_id, updated_at)
        VALUES (${m.projectId}, ${m.status || "send"}, ${statusAt}, ${JSON.stringify(m.tags || [])}, ${m.notes || ""},
                ${m.installDate || ""}, ${m.installTime || ""}, ${m.proofLink || ""}, ${m.estimateVisualLink || ""}, ${JSON.stringify(incomingPayments)}::jsonb,
                ${JSON.stringify(incomingExpenses)}::jsonb, ${!!m.excluded}, ${m.calendarEventId || ""}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET
          status = CASE WHEN EXCLUDED.status_at >= COALESCE(job_meta.status_at, 0) THEN EXCLUDED.status ELSE job_meta.status END,
          status_at = GREATEST(EXCLUDED.status_at, COALESCE(job_meta.status_at, 0)),
          tags=EXCLUDED.tags, notes=EXCLUDED.notes,
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
      return Response.json(metaOut(row));
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err) {
    // The job was deleted (e.g. on another device): a rejection, not a
    // server problem, so the Dashboard stops retrying it.
    if (err.code === "23503") return Response.json({ error: "That job no longer exists." }, { status: 409 });
    console.error("job-meta function error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/job-meta" };
