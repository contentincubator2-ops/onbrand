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
import { callLLM } from "../_core/llmRouter";

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
  /**
   * Picker front-door — categories with their methods nested. CJ direction
   * 2026-05-02: each deliverable kind is a category, multiple methods can
   * sit under it. UI shows category cards first, drills into method choice.
   */
  listCategoriesForPicker: protectedProcedure
    .input(z.object({ workspace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const wsFilter = input?.workspace ? "AND c.workspace = ?" : "";
      const params: any[] = input?.workspace ? [input.workspace] : [];
      const cats = await rowsAll<any>(
        `SELECT c.id, c.slug, c.name_zh, c.name_en, c.description,
                c.workspace, c.category_kind, c.default_mockup,
                c.search_keywords, c.is_open_for_methods
           FROM task_category c
          WHERE c.status = 'active' ${wsFilter}
          ORDER BY c.workspace ASC, c.category_kind ASC, c.name_zh ASC`,
        params,
      );
      // Nested methods for each category
      const out: any[] = [];
      for (const c of cats) {
        const methods = await rowsAll<any>(
          `SELECT t.id, t.slug, t.name_zh, t.methodology_label,
                  t.impl_kind, t.squad_id, s.slug AS squad_slug, s.name AS squad_name,
                  t.agent_id, a.name AS agent_name, a.avatarUrl AS agent_avatar,
                  t.bypassable, t.estimated_minutes
             FROM task_catalog t
        LEFT JOIN squads s ON s.id = t.squad_id
        LEFT JOIN agents a ON a.id = t.agent_id
            WHERE t.category_id = ? AND t.status = 'active'
            ORDER BY t.id`,
          [c.id],
        );
        out.push({ ...c, methods });
      }
      return out;
    }),

  /** Picker front-door (flat) — active tasks by default; pass
   *  `includeComingSoon: true` to also include reviewing/coming-soon
   *  rows so CJ can find anything just-built without an admin gate.
   */
  listForPicker: protectedProcedure
    .input(z.object({
      workspace: z.string().optional(),
      query: z.string().optional(),
      includeComingSoon: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      // CJ direction 2026-05-02: 「我要能在前端直接測試 / 顯示 approved
      // and reviewing」. Default surfaces both states so everything just-
      // built is findable without admin steps. Archived stays hidden.
      const statusList = input?.includeComingSoon === false
        ? ["active"]
        : ["active", "coming_soon"];
      const placeholders = statusList.map(() => "?").join(",");
      const conds: string[] = [`t.status IN (${placeholders})`];
      const params: any[] = [...statusList];
      if (input?.workspace) {
        conds.push("t.workspace = ?");
        params.push(input.workspace);
      }
      if (input?.query?.trim()) {
        conds.push("(t.name_zh LIKE ? OR t.name_en LIKE ? OR t.description LIKE ? OR t.search_keywords LIKE ? OR t.methodology_label LIKE ?)");
        const q = `%${input.query.trim()}%`;
        params.push(q, q, q, q, q);
      }
      // JOIN squads + agents so the client can navigate / display without
      // a second round-trip. squad_slug feeds picker's setSelectedSlug();
      // agent_name is shown on the task card.
      return rowsAll(
        `SELECT t.id, t.slug, t.name_zh, t.name_en, t.description,
                t.workspace, t.category, t.impl_kind, t.status,
                t.squad_id, s.slug AS squad_slug, s.name AS squad_name,
                t.agent_id, a.name AS agent_name, a.avatarUrl AS agent_avatar,
                t.bypassable, t.estimated_minutes,
                t.methodology_label, t.created_at
           FROM task_catalog t
      LEFT JOIN squads s ON s.id = t.squad_id
      LEFT JOIN agents a ON a.id = t.agent_id
          WHERE ${conds.join(" AND ")}
          ORDER BY
            CASE t.status WHEN 'active' THEN 0 ELSE 1 END,
            t.workspace ASC, t.category ASC, t.name_zh ASC`,
        params,
      );
    }),

  /**
   * Recently added tasks — sorted by created_at DESC, limited.
   * Used by MissionsHome 最近新增 rail so CJ lands on the homepage
   * and immediately sees what was just built.
   */
  listRecent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(30) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 30;
      return rowsAll(
        `SELECT t.id, t.slug, t.name_zh, t.name_en, t.description,
                t.workspace, t.category, t.impl_kind, t.status,
                t.squad_id, s.slug AS squad_slug, s.name AS squad_name,
                t.agent_id, a.name AS agent_name, a.avatarUrl AS agent_avatar,
                t.bypassable, t.estimated_minutes,
                t.methodology_label, t.created_at
           FROM task_catalog t
      LEFT JOIN squads s ON s.id = t.squad_id
      LEFT JOIN agents a ON a.id = t.agent_id
          WHERE t.status IN ('active', 'coming_soon')
          ORDER BY t.created_at DESC
          LIMIT ${limit}`,
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

  /**
   * runAtomic — execute a single-agent (impl_kind='atomic') task end-to-end.
   *
   * No mission row, no mission_step_progress. Just: load task → load agent
   * → resolve scope context → call LLM → return text + parse hints. Caller
   * is the picker's "🚀 立即產出" button on a CatalogTaskCard.
   *
   * For squad-impl tasks, callers should still go through the existing
   * mission.create + stepExecute flow, not this.
   */
  runAtomic: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      // Same scope shape as squad.runStepLive — brand/product/event optional
      scopeBrandId:   z.number().nullable().optional(),
      scopeProductId: z.number().nullable().optional(),
      scopeEventId:   z.number().nullable().optional(),
      // Free-form user notes (from intake step's optional fields)
      userInput: z.string().max(4000).optional().default(""),
    }))
    .mutation(async ({ input }) => {
      // 1. Load task + bound agent
      const task = await rowsAll<any>(
        `SELECT t.*, a.id AS agent_id_resolved, a.name AS agent_name,
                a.title AS agent_title, a.primarySkill AS agent_skill,
                a.aiModel AS agent_model
           FROM task_catalog t
      LEFT JOIN agents a ON a.id = t.agent_id
          WHERE t.id = ? LIMIT 1`,
        [input.taskId],
      ).then((r) => r[0]);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: `task ${input.taskId} not found` });
      // Allow atomic tasks OR bypassable squad tasks (bypassable = "can run without intake form")
      const canRunAtomic = task.impl_kind === "atomic" || task.bypassable === 1 || task.bypassable === true;
      if (!canRunAtomic) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `task ${task.slug} is impl_kind=${task.impl_kind} and not bypassable. Use squad.stepExecute.` });
      }
      // agent_id is optional for bypassable squad tasks — fallback to generic persona
      const agentName  = task.agent_name  ?? task.name_zh ?? "行銷 Agent";
      const agentTitle = task.agent_title ?? "內容創作專家";
      const agentSkill = task.agent_skill ?? task.description ?? "社群內容創作";

      // 2. Resolve scope context — same logic as stepExecute
      const contextParts: string[] = [];
      if (input.scopeBrandId) {
        const b = await rowsAll<any>(
          `SELECT name, industry, description, positioningSummary, positioning
             FROM brands WHERE id = ? LIMIT 1`,
          [input.scopeBrandId],
        ).then((r) => r[0]);
        if (b) {
          const sub = [`【品牌】${b.name}${b.industry ? `（${b.industry}）` : ""}`];
          if (b.positioningSummary) sub.push(`品牌定位：${String(b.positioningSummary).slice(0, 600)}`);
          else if (b.description)   sub.push(`品牌描述：${String(b.description).slice(0, 400)}`);
          else if (b.positioning) {
            const pos = typeof b.positioning === "string" ? b.positioning : JSON.stringify(b.positioning);
            sub.push(`品牌定位（JSON）：${pos.slice(0, 800)}`);
          }
          contextParts.push(sub.join("\n"));
        }
      }
      if (input.scopeProductId) {
        const p = await rowsAll<any>(
          `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
          [input.scopeProductId],
        ).then((r) => r[0]);
        if (p) {
          const pos = typeof p.positioning === "string" ? p.positioning : (p.positioning ? JSON.stringify(p.positioning) : "");
          contextParts.push(`【產品】${p.name}${pos ? `\n產品定位：${pos.slice(0, 800)}` : ""}`);
        }
      }
      if (input.scopeEventId) {
        const e = await rowsAll<any>(
          `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`,
          [input.scopeEventId],
        ).then((r) => r[0]);
        if (e) {
          const period = e.startAt ? `${String(e.startAt).split("T")[0]} ~ ${String(e.endAt ?? "").split("T")[0]}` : "（無日期）";
          const pos = typeof e.positioning === "string" ? e.positioning : (e.positioning ? JSON.stringify(e.positioning) : "");
          contextParts.push(`【活動】${e.name}（期間 ${period}）\n${pos ? `活動定位（11-segment）：${pos.slice(0, 1500)}` : "活動定位：（未填）"}`);
          contextParts.push(`【重要】此任務的 scope 是上面這個「活動」，所有舉例必須緊扣活動本身，禁止用品牌通用範例。`);
        }
      }
      const scopeContext = contextParts.join("\n\n");

      // 3. Build prompts — atomic task = direct deliverable, no envelope
      const isContent = /(post|caption|hashtag|content|文案|貼文|reel|腳本)/i.test(task.slug + " " + task.description);
      const guide = isContent
        ? `【嚴格禁止 — 違反任一條都算失敗】
✗ 禁止 markdown 標題符號（# ## ### 等）
✗ 禁止內部標籤（Jab 1: / Step N: / 貼文 1：等）
✗ 禁止前言（「以下是」「我會這樣寫」）
✗ 禁止 markdown 條列（- *）
✗ 禁止 hashtag 出現在貼文上半段
【正確輸出】直接是 Facebook / IG / TikTok 用戶看到的那行字。emoji + hook 開頭 + CTA + 結尾 hashtag。`
        : `直接交付完成品本身，不要寫「我會這樣做」的方法論說明。`;

      const systemPrompt = `你是 ${agentName}（${agentTitle}），專長：${agentSkill}。
你正在執行「${task.name_zh}」這個 atomic 任務（單 agent 直接交付，不分多步驟）。

任務描述：${task.description}

${guide}

用繁體中文。如果有 scope 上下文，所有舉例必須緊扣 scope，禁止通用範本。`;

      const userPrompt = scopeContext
        ? `${scopeContext}\n\n${input.userInput ? `【使用者補充】\n${input.userInput}\n\n` : ""}請直接交付【成品內容】 — atomic 任務，第一句就開始寫成品本身，不要前言。`
        : `${input.userInput ? `【使用者補充】\n${input.userInput}\n\n` : ""}【警告】此任務沒有綁定 brand/product/event scope，請提示使用者先到右上角選擇後再執行。
請直接交付【成品內容】。`;

      // 4. Call LLM with cross-provider fallback
      const t0 = Date.now();
      let rawText = "";
      try {
        const result = await callLLM({
          system: systemPrompt,
          user: userPrompt,
          maxTokens: 1500,
          timeoutMs: 35_000,
        });
        rawText = result.text;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Atomic task LLM failed: ${msg}` });
      }

      // 5. Defensive cleanup for content-type tasks
      const stripContentArtifacts = (s: string): string => s
        .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
        .trim();
      const output = isContent ? stripContentArtifacts(rawText) : rawText;

      return {
        ok: true,
        task: { id: task.id, slug: task.slug, name: task.name_zh },
        agent: { id: task.agent_id_resolved ?? null, name: agentName, title: agentTitle },
        output,
        rawText: rawText !== output ? rawText : undefined,
        durationMs: Date.now() - t0,
      };
    }),
});
