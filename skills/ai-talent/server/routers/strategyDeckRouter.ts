/**
 * strategyDeckRouter.ts — Phase 1 of the Strategy Deck feature.
 *
 * Responsible for:
 *   - Listing methodology catalog (for the diagnostic wizard & free-pick)
 *   - Running the 2-question diagnostic → top-3 recommendations
 *   - Strategy card CRUD on `brand_strategies`:
 *       list / get / create / update / activate / archive
 *   - Mini chat (card-back drawer) over `brand_strategy_messages`
 *
 * Notes:
 *   - A strategy defaults to 'draft'. Activating sets activatedAt=now() and
 *     expiresAt=now()+90d. Archiving sets archivedAt.
 *   - "Stale" is computed client-side from expiresAt; no cron needed for Phase 1.
 *   - Execution / optimization / intel zones will read active strategies via
 *     listActive() in later phases.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  METHODOLOGY_CATALOG,
  getMethodology,
  listMethodologies,
  recommendMethodologies,
  type DiagnosticSituation,
  type DiagnosticStage,
} from "../_core/methodologyCatalog";
import { invokeLLM } from "../_core/llm";

const situationSchema = z.enum([
  "new-launch",
  "pricing-stuck",
  "audience-unclear",
  "competitor-pressure",
  "rebranding",
  "new-market",
]);
const stageSchema = z.enum(["early", "growth", "mature"]);
const statusSchema = z.enum(["draft", "active", "archived"]);

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const { brands } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
    .limit(1);
  if (!rows.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found or not owned" });
  }
}

async function loadStrategy(userId: number, strategyId: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [rows] = (await db.execute(sql`
    SELECT s.* FROM brand_strategies s
    INNER JOIN brands b ON b.id = s.brandId
    WHERE s.id = ${strategyId} AND b.userId = ${userId}
    LIMIT 1
  `)) as any;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy not found" });
  return row;
}

export const strategyDeckRouter = router({
  // ── Methodology catalog ────────────────────────────────────────────────────
  listMethodologies: protectedProcedure
    .input(z.object({ layer: z.enum(["L1", "L2", "L3"]).optional() }).optional())
    .query(({ input }) => {
      return listMethodologies(input?.layer);
    }),

  getMethodology: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => {
      const m = getMethodology(input.slug);
      if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Methodology not found" });
      return m;
    }),

  // ── Diagnostic wizard ──────────────────────────────────────────────────────
  diagnose: protectedProcedure
    .input(z.object({ situation: situationSchema, stage: stageSchema }))
    .query(({ input }) => {
      return recommendMethodologies(input);
    }),

  // ── Strategy CRUD ──────────────────────────────────────────────────────────
  listByBrand: protectedProcedure
    .input(z.object({ brandId: z.number(), status: statusSchema.optional() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return [];
      const statusFilter = input.status ? sql`AND status = ${input.status}` : sql``;
      const [rows] = (await db.execute(sql`
        SELECT id, brandId, userId, methodologySlug, methodologyName, methodologyAuthor,
               layer, name, status, summary, config, activatedAt, expiresAt, archivedAt,
               createdAt, updatedAt
        FROM brand_strategies
        WHERE brandId = ${input.brandId}
        ${statusFilter}
        ORDER BY
          CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
          updatedAt DESC
      `)) as any;
      return (rows as any[]) ?? [];
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return loadStrategy(ctx.user.id, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        methodologySlug: z.string(),
        name: z.string().min(1).max(255),
        summary: z.string().max(2000).optional(),
        config: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const m = getMethodology(input.methodologySlug);
      if (!m) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown methodology" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const configJson = input.config ? JSON.stringify(input.config) : null;
      const [result] = (await db.execute(sql`
        INSERT INTO brand_strategies
          (brandId, userId, methodologySlug, methodologyName, methodologyAuthor,
           layer, name, status, summary, config)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${m.slug}, ${m.name}, ${m.author},
           ${m.layer}, ${input.name}, 'draft', ${input.summary ?? null},
           ${configJson})
      `)) as any;

      const insertId = (result as any)?.insertId ?? 0;
      return { id: insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        summary: z.string().max(2000).optional(),
        config: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await loadStrategy(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const newName = input.name ?? current.name;
      const newSummary = input.summary ?? current.summary;
      const mergedConfig = input.config
        ? JSON.stringify({ ...(current.config ?? {}), ...input.config })
        : current.config
          ? JSON.stringify(current.config)
          : null;

      await db.execute(sql`
        UPDATE brand_strategies
        SET name = ${newName},
            summary = ${newSummary},
            config = ${mergedConfig}
        WHERE id = ${input.id}
      `);
      return { ok: true };
    }),

  activate: protectedProcedure
    .input(z.object({ id: z.number(), validDays: z.number().min(7).max(365).default(90) }))
    .mutation(async ({ ctx, input }) => {
      await loadStrategy(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.execute(sql`
        UPDATE brand_strategies
        SET status = 'active',
            activatedAt = NOW(3),
            expiresAt = DATE_ADD(NOW(3), INTERVAL ${input.validDays} DAY),
            archivedAt = NULL
        WHERE id = ${input.id}
      `);
      return { ok: true };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await loadStrategy(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.execute(sql`
        UPDATE brand_strategies
        SET status = 'archived', archivedAt = NOW(3)
        WHERE id = ${input.id}
      `);
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await loadStrategy(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Hard-delete draft only; archived stays (audit). Refuse if active.
      const current = await loadStrategy(ctx.user.id, input.id);
      if (current.status === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archive before deleting an active strategy",
        });
      }
      await db.execute(sql`DELETE FROM brand_strategy_messages WHERE strategyId = ${input.id}`);
      await db.execute(sql`DELETE FROM brand_strategies WHERE id = ${input.id}`);
      return { ok: true };
    }),

  // ── Mini chat drawer ───────────────────────────────────────────────────────
  listMessages: protectedProcedure
    .input(z.object({ strategyId: z.number() }))
    .query(async ({ ctx, input }) => {
      await loadStrategy(ctx.user.id, input.strategyId);
      const db = await getDb();
      if (!db) return [];
      const [rows] = (await db.execute(sql`
        SELECT id, role, content, createdAt
        FROM brand_strategy_messages
        WHERE strategyId = ${input.strategyId}
        ORDER BY createdAt ASC
        LIMIT 200
      `)) as any;
      return (rows as any[]) ?? [];
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        strategyId: z.number(),
        content: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const strategy = await loadStrategy(ctx.user.id, input.strategyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // 1. Persist user turn
      await db.execute(sql`
        INSERT INTO brand_strategy_messages (strategyId, role, content)
        VALUES (${input.strategyId}, 'user', ${input.content})
      `);

      // 2. Load recent history (last 20)
      const [histRows] = (await db.execute(sql`
        SELECT role, content FROM brand_strategy_messages
        WHERE strategyId = ${input.strategyId}
        ORDER BY createdAt DESC
        LIMIT 20
      `)) as any;
      const history = ((histRows as any[]) ?? [])
        .reverse()
        .map((r) => ({ role: r.role as "user" | "assistant" | "system", content: r.content }));

      const methodology = getMethodology(strategy.methodologySlug);
      const configJson = typeof strategy.config === "string"
        ? strategy.config
        : JSON.stringify(strategy.config ?? {});

      const systemPrompt = [
        `你是一位資深品牌策略顧問，現在正在幫使用者微調一張「策略卡」。`,
        `策略卡名稱：${strategy.name}`,
        `採用方法論：${methodology?.name ?? strategy.methodologyName}（${methodology?.author ?? strategy.methodologyAuthor}）`,
        `方法論重點：${methodology?.summary ?? ""}`,
        `使用者目前填入的設定（JSON）：${configJson}`,
        ``,
        `規則：`,
        `1. 只回答跟這張策略卡有關的問題或修改建議。`,
        `2. 回覆要精短（3–5 句），不要整段重寫。`,
        `3. 如果使用者要求改欄位，直接給新值建議，不要反問太多。`,
        `4. 用繁體中文。`,
      ].join("\n");

      let assistantContent = "";
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
          ],
          maxTokens: 600,
        } as any);
        const rawContent = (result as any)?.choices?.[0]?.message?.content;
        if (typeof rawContent === "string") {
          assistantContent = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Some providers return content as an array of parts
          assistantContent = rawContent
            .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
            .join("");
        } else {
          assistantContent = "";
        }
      } catch (err: any) {
        console.error("[strategyDeck.sendMessage] LLM failed:", err?.message);
        assistantContent = "（暫時無法取得 AI 回覆，請稍後再試）";
      }

      await db.execute(sql`
        INSERT INTO brand_strategy_messages (strategyId, role, content)
        VALUES (${input.strategyId}, 'assistant', ${assistantContent})
      `);

      return { assistant: assistantContent };
    }),
});
