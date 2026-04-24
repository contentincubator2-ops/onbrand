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

  // ── Auto-fill (Phase 1.5) ──────────────────────────────────────────────────
  // Reads brand context (brands row + brand_brain) and asks the LLM to produce
  // a JSON config matching the methodology's field schema. Frontend merges the
  // result into the user's current config (user can still edit).
  autoFill: protectedProcedure
    .input(
      z.object({
        strategyId: z.number(),
        overwriteFilled: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const strategy = await loadStrategy(ctx.user.id, input.strategyId);
      const methodology = getMethodology(strategy.methodologySlug);
      if (!methodology) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown methodology" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // 1. Load brand context
      const [brandRows] = (await db.execute(sql`
        SELECT name, industry, description, tagline,
               valueProposition, targetMarket, audienceA, audienceB,
               emotionalDiff, functionalDiff
        FROM brands WHERE id = ${strategy.brandId} LIMIT 1
      `)) as any;
      const brand = (Array.isArray(brandRows) ? brandRows[0] : null) ?? {};

      const [brainRows] = (await db.execute(sql`
        SELECT category, content FROM brand_brain
        WHERE brandId = ${strategy.brandId}
        ORDER BY updatedAt DESC
        LIMIT 40
      `)) as any;
      const brainByCategory: Record<string, string[]> = {};
      for (const r of ((brainRows as any[]) ?? [])) {
        const cat = r.category ?? "general";
        (brainByCategory[cat] ??= []).push(r.content);
      }

      // 2. Determine which fields to (re)generate
      const currentConfig: Record<string, any> = (() => {
        if (!strategy.config) return {};
        if (typeof strategy.config === "string") {
          try { return JSON.parse(strategy.config); } catch { return {}; }
        }
        return strategy.config;
      })();

      const fieldsToFill = methodology.fields.filter((f) => {
        if (input.overwriteFilled) return true;
        const v = currentConfig[f.key];
        if (v == null) return true;
        if (typeof v === "string" && !v.trim()) return true;
        if (Array.isArray(v) && v.length === 0) return true;
        return false;
      });

      if (fieldsToFill.length === 0) {
        return { config: currentConfig, filledKeys: [], skipped: "already-complete" as const };
      }

      // 3. Build JSON schema for structured output
      const schemaProperties: Record<string, any> = {};
      for (const f of fieldsToFill) {
        if (f.type === "list") {
          schemaProperties[f.key] = {
            type: "array",
            items: { type: "string" },
            description: f.label,
          };
        } else {
          schemaProperties[f.key] = {
            type: "string",
            description: f.label,
          };
        }
      }

      // 4. Build system + user prompt
      const brandBlock = [
        brand.name && `品牌名稱：${brand.name}`,
        brand.industry && `產業：${brand.industry}`,
        brand.tagline && `標語：${brand.tagline}`,
        brand.description && `品牌描述：${brand.description}`,
        brand.valueProposition && `價值主張：${brand.valueProposition}`,
        brand.targetMarket && `目標市場：${brand.targetMarket}`,
        brand.audienceA && `主要受眾 A：${brand.audienceA}`,
        brand.audienceB && `次要受眾 B：${brand.audienceB}`,
        brand.emotionalDiff && `情感差異：${brand.emotionalDiff}`,
        brand.functionalDiff && `功能差異：${brand.functionalDiff}`,
      ].filter(Boolean).join("\n");

      const brainBlock = Object.entries(brainByCategory)
        .slice(0, 8)
        .map(([cat, items]) =>
          `【${cat}】\n${items.slice(0, 6).map((x) => `- ${String(x).slice(0, 400)}`).join("\n")}`
        )
        .join("\n\n");

      const fieldsDescription = fieldsToFill
        .map((f) => `- ${f.key} (${f.label})${f.type === "list" ? " [陣列]" : ""}`)
        .join("\n");

      const alreadyFilledDesc = methodology.fields
        .filter((f) => !fieldsToFill.find((x) => x.key === f.key))
        .map((f) => `- ${f.key}: ${JSON.stringify(currentConfig[f.key])}`)
        .join("\n");

      const systemPrompt = [
        `你是資深品牌策略顧問，現在要依「${methodology.name}」方法論（作者：${methodology.author}）幫用戶的品牌產出策略卡內容。`,
        ``,
        `方法論核心：${methodology.summary}`,
        ``,
        `規則：`,
        `1. 僅輸出 JSON，符合指定 schema。不要加說明、不要 markdown、不要 code fence。`,
        `2. 每個欄位要具體、可執行，不要空話。`,
        `3. 如果品牌資料不足以產出某欄位，就基於方法論常見做法合理推斷，但要具體。`,
        `4. 用繁體中文。`,
        `5. 欄位內容避免超過 200 字；陣列型欄位 3–5 項為佳，每項 15 字內。`,
      ].join("\n");

      const userPrompt = [
        `【品牌資料】`,
        brandBlock || "（品牌基本欄位多數為空，請盡量依品牌名稱與產業推斷）",
        ``,
        brainBlock ? `【品牌大腦（Brain）摘錄】\n${brainBlock}\n` : "",
        alreadyFilledDesc ? `【用戶已填欄位（不要改）】\n${alreadyFilledDesc}\n` : "",
        `【請產出的欄位】`,
        fieldsDescription,
      ].filter(Boolean).join("\n");

      // 5. Call LLM with JSON object output
      let parsed: Record<string, any> = {};
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
        } as any);
        const rawContent = (result as any)?.choices?.[0]?.message?.content;
        const raw = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
            : "";
        // Strip any accidental ```json fences
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (err: any) {
        console.error("[strategyDeck.autoFill] LLM failed:", err?.message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI 產生失敗，請稍後再試或改用手動輸入",
        });
      }

      // 6. Coerce list fields — sometimes LLM returns comma-string, normalize
      for (const f of fieldsToFill) {
        const v = parsed[f.key];
        if (f.type === "list") {
          if (typeof v === "string") {
            parsed[f.key] = v.split(/[,、\n;；]/).map((s) => s.trim()).filter(Boolean);
          } else if (!Array.isArray(v)) {
            parsed[f.key] = [];
          }
        } else if (Array.isArray(v)) {
          parsed[f.key] = v.join("、");
        } else if (v == null) {
          parsed[f.key] = "";
        } else {
          parsed[f.key] = String(v);
        }
      }

      // 7. Merge and persist
      const merged = input.overwriteFilled
        ? { ...currentConfig, ...parsed }
        : { ...parsed, ...currentConfig, ...Object.fromEntries(
            fieldsToFill.map((f) => [f.key, parsed[f.key]])
          ) };

      await db.execute(sql`
        UPDATE brand_strategies
        SET config = ${JSON.stringify(merged)}
        WHERE id = ${input.strategyId}
      `);

      return {
        config: merged,
        filledKeys: fieldsToFill.map((f) => f.key),
        skipped: null as null,
      };
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
