/**
 * taskCatalogRouter — curated catalog of REAL deliverables.
 *
 * CJ direction 2026-05-01: front-door for picker search. User searches
 * for "Facebook 月行事曆" and hits a curated task here, not a raw squad
 * from the auto-generated bulk. Keeps generic squads hidden behind
 * status='archived' until they earn a slot.
 *
 * Each task is either:
 *   - atomic   → single agent_id (e.g. 1 FB post copy)
 *   - squad    → squad_id (e.g. FB monthly calendar)
 *
 * Status:
 *   - active      → surfaces in picker search
 *   - coming_soon → "+1 我也想要" page; counted via upvotes
 *   - archived    → admin only
 *
 * bypassable:
 *   - true  → user can skip every intake field, run with system defaults
 *   - false → some intake field is physically required (e.g. analytics
 *             report needs actual data)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";

// ── helpers ──────────────────────────────────────────────────────────
async function rowsAll<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const [r]: any = await localPool.execute(sqlText, params);
  return (r as T[]) ?? [];
}

const taskShape = z.object({
  slug: z.string().min(1).max(120),
  name_zh: z.string().min(1).max(255),
  name_en: z.string().max(255).nullable().optional(),
  description: z.string().min(1),
  workspace: z.string().min(1).max(50),
  category: z.string().min(1).max(50),
  impl_kind: z.enum(["atomic", "squad"]),
  squad_id: z.number().nullable().optional(),
  agent_id: z.number().nullable().optional(),
  status: z.enum(["active", "coming_soon", "archived"]).default("coming_soon"),
  bypassable: z.boolean().default(true),
  search_keywords: z.string().nullable().optional(),
  estimated_minutes: z.number().int().min(0).nullable().optional(),
});

export const taskCatalogRouter = router({
  /** Picker front-door — only active tasks, optionally filtered by workspace. */
  listForPicker: protectedProcedure
    .input(z.object({
      workspace: z.string().optional(),
      query: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conds: string[] = ["status = 'active'"];
      const params: any[] = [];
      if (input?.workspace) {
        conds.push("workspace = ?");
        params.push(input.workspace);
      }
      if (input?.query?.trim()) {
        conds.push("(name_zh LIKE ? OR name_en LIKE ? OR description LIKE ? OR search_keywords LIKE ?)");
        const q = `%${input.query.trim()}%`;
        params.push(q, q, q, q);
      }
      return rowsAll(
        `SELECT id, slug, name_zh, name_en, description, workspace, category,
                impl_kind, squad_id, agent_id, bypassable, estimated_minutes
           FROM task_catalog
          WHERE ${conds.join(" AND ")}
          ORDER BY workspace ASC, category ASC, name_zh ASC`,
        params,
      );
    }),

  /** Coming-soon page — sorted by upvotes desc so CJ knows priority. */
  listComingSoon: protectedProcedure
    .input(z.object({ workspace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const conds: string[] = ["status = 'coming_soon'"];
      const params: any[] = [];
      if (input?.workspace) {
        conds.push("workspace = ?");
        params.push(input.workspace);
      }
      return rowsAll(
        `SELECT id, slug, name_zh, name_en, description, workspace, category,
                impl_kind, upvotes, estimated_minutes
           FROM task_catalog
          WHERE ${conds.join(" AND ")}
          ORDER BY upvotes DESC, name_zh ASC`,
        params,
      );
    }),

  /** "+1 我也想要" — increments upvotes on a coming_soon task. */
  upvote: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await localPool.execute(
        `UPDATE task_catalog SET upvotes = upvotes + 1 WHERE id = ? AND status = 'coming_soon'`,
        [input.id],
      );
      return { ok: true };
    }),

  /** Admin: full list including archived. */
  listForAdmin: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "coming_soon", "archived", "all"]).default("all"),
      workspace: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conds: string[] = [];
      const params: any[] = [];
      if (input?.status && input.status !== "all") {
        conds.push("status = ?");
        params.push(input.status);
      }
      if (input?.workspace) {
        conds.push("workspace = ?");
        params.push(input.workspace);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      return rowsAll(
        `SELECT * FROM task_catalog ${where}
          ORDER BY workspace ASC, status ASC, category ASC, name_zh ASC`,
        params,
      );
    }),

  /** Admin: full row for editing. */
  getForAdmin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const r = await rowsAll(`SELECT * FROM task_catalog WHERE id = ? LIMIT 1`, [input.id]);
      if (!r[0]) throw new TRPCError({ code: "NOT_FOUND", message: `task ${input.id} not found` });
      return r[0];
    }),

  /** Admin: create/update. Slug is the natural key — upsert by slug. */
  upsert: protectedProcedure
    .input(taskShape.extend({ id: z.number().optional() }))
    .mutation(async ({ input }) => {
      // Validate atomic→agent_id, squad→squad_id
      if (input.impl_kind === "atomic" && !input.agent_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "atomic task needs agent_id" });
      }
      if (input.impl_kind === "squad" && !input.squad_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "squad task needs squad_id" });
      }
      if (input.id) {
        await localPool.execute(
          `UPDATE task_catalog
              SET slug=?, name_zh=?, name_en=?, description=?, workspace=?, category=?,
                  impl_kind=?, squad_id=?, agent_id=?, status=?, bypassable=?,
                  search_keywords=?, estimated_minutes=?
            WHERE id = ?`,
          [
            input.slug, input.name_zh, input.name_en ?? null, input.description,
            input.workspace, input.category, input.impl_kind,
            input.squad_id ?? null, input.agent_id ?? null,
            input.status, input.bypassable ? 1 : 0,
            input.search_keywords ?? null, input.estimated_minutes ?? null,
            input.id,
          ],
        );
        return { id: input.id };
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO task_catalog
           (slug, name_zh, name_en, description, workspace, category,
            impl_kind, squad_id, agent_id, status, bypassable,
            search_keywords, estimated_minutes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
            name_zh=VALUES(name_zh), name_en=VALUES(name_en),
            description=VALUES(description), workspace=VALUES(workspace),
            category=VALUES(category), impl_kind=VALUES(impl_kind),
            squad_id=VALUES(squad_id), agent_id=VALUES(agent_id),
            status=VALUES(status), bypassable=VALUES(bypassable),
            search_keywords=VALUES(search_keywords),
            estimated_minutes=VALUES(estimated_minutes)`,
        [
          input.slug, input.name_zh, input.name_en ?? null, input.description,
          input.workspace, input.category, input.impl_kind,
          input.squad_id ?? null, input.agent_id ?? null,
          input.status, input.bypassable ? 1 : 0,
          input.search_keywords ?? null, input.estimated_minutes ?? null,
        ],
      );
      return { id: Number(r?.insertId ?? 0) };
    }),

  /** Admin: flip to active (= goes live in picker search). */
  activate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await localPool.execute(
        `UPDATE task_catalog
            SET status = 'active', approved_at = NOW(), approved_by = ?
          WHERE id = ?`,
        [ctx.user!.id, input.id],
      );
      return { ok: true };
    }),

  /** Admin: archive (hide from search; reversible). */
  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await localPool.execute(
        `UPDATE task_catalog SET status = 'archived' WHERE id = ?`,
        [input.id],
      );
      return { ok: true };
    }),
});
