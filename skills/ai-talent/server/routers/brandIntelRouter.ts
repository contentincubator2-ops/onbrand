/**
 * brandIntelRouter — Phase 2A of the Strategy Deck.
 *
 * Stores "情報點" (intelligence signals) that feed the 偵測 zone and,
 * importantly, ground strategyDeck.autoFill in real data instead of
 * generic methodology templates.
 *
 * Phase 2A is manual-entry only. Phase 2A Ext will add automatic
 * competitor scraping, Google Trends, social listening.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { runScouts } from "../_core/scouts/orchestrator";
import { loadToolCredential } from "./toolCredRouter";

const typeSchema = z.enum(["competitor", "trend", "social", "internal", "manual"]);

// In-process cache for LLM-driven auto-feed (brandId-scoped, 20-min TTL).
// Prevents repeated tab opens from re-burning Perplexity credits.
const feedAutoCache = new Map<string, { ts: number; payload: any }>();
const relevanceSchema = z.enum(["high", "medium", "low"]);

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

async function loadSignal(userId: number, id: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [rows] = (await db.execute(sql`
    SELECT s.* FROM brand_intel_signals s
    INNER JOIN brands b ON b.id = s.brandId
    WHERE s.id = ${id} AND b.userId = ${userId}
    LIMIT 1
  `)) as any;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Signal not found" });
  return row;
}

export const brandIntelRouter = router({
  listByBrand: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        type: typeSchema.optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return [];
      const typeFilter = input.type ? sql`AND type = ${input.type}` : sql``;
      const [rows] = (await db.execute(sql`
        SELECT id, brandId, userId, type, source, headline, body, url,
               relevance, capturedAt, createdAt, updatedAt
        FROM brand_intel_signals
        WHERE brandId = ${input.brandId}
        ${typeFilter}
        ORDER BY capturedAt DESC
        LIMIT ${input.limit}
      `)) as any;
      return (rows as any[]) ?? [];
    }),

  summarize: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return { total: 0, byType: {}, recentHeadlines: [] };
      const [countRows] = (await db.execute(sql`
        SELECT type, COUNT(*) as count
        FROM brand_intel_signals
        WHERE brandId = ${input.brandId}
        GROUP BY type
      `)) as any;
      const byType: Record<string, number> = {};
      let total = 0;
      for (const r of ((countRows as any[]) ?? [])) {
        const n = Number(r.count ?? 0);
        byType[r.type] = n;
        total += n;
      }
      const [headlineRows] = (await db.execute(sql`
        SELECT headline, type, capturedAt
        FROM brand_intel_signals
        WHERE brandId = ${input.brandId}
        ORDER BY capturedAt DESC
        LIMIT 5
      `)) as any;
      return {
        total,
        byType,
        recentHeadlines: (headlineRows as any[]) ?? [],
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        type: typeSchema.default("manual"),
        source: z.string().min(1).max(255),
        headline: z.string().min(1).max(500),
        body: z.string().max(8000).optional(),
        url: z.string().max(1000).optional(),
        relevance: relevanceSchema.default("medium"),
        capturedAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const capturedAt = input.capturedAt ?? null;
      const [result] = (await db.execute(sql`
        INSERT INTO brand_intel_signals
          (brandId, userId, type, source, headline, body, url, relevance, capturedAt)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${input.type}, ${input.source},
           ${input.headline}, ${input.body ?? null}, ${input.url ?? null},
           ${input.relevance},
           ${capturedAt ? sql`${capturedAt}` : sql`NOW(3)`})
      `)) as any;
      const insertId = (result as any)?.insertId ?? 0;
      return { id: insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        type: typeSchema.optional(),
        source: z.string().min(1).max(255).optional(),
        headline: z.string().min(1).max(500).optional(),
        body: z.string().max(8000).optional(),
        url: z.string().max(1000).optional(),
        relevance: relevanceSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await loadSignal(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.execute(sql`
        UPDATE brand_intel_signals
        SET type = ${input.type ?? current.type},
            source = ${input.source ?? current.source},
            headline = ${input.headline ?? current.headline},
            body = ${input.body ?? current.body},
            url = ${input.url ?? current.url},
            relevance = ${input.relevance ?? current.relevance}
        WHERE id = ${input.id}
      `);
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await loadSignal(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.execute(sql`DELETE FROM brand_intel_signals WHERE id = ${input.id}`);
      return { ok: true };
    }),

  // ─── Watchlist (Phase 2A Ext) ─────────────────────────────────────────────
  // One row per brand. Tracks keywords + competitor names that drive the
  // DetectZone auto-feed (queries sowork_db.market_data with these terms).

  getWatchlist: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return null;
      const [rows] = (await db.execute(sql`
        SELECT id, brandId, keywords, competitorNames, industryTags,
               suggestedBy, suggestedAt, updatedAt
        FROM brand_watchlist
        WHERE brandId = ${input.brandId}
        LIMIT 1
      `)) as any;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      const parseJson = (v: any): any[] => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };
      return {
        id: row.id,
        brandId: row.brandId,
        keywords: parseJson(row.keywords),
        competitorNames: parseJson(row.competitorNames),
        industryTags: parseJson(row.industryTags),
        suggestedBy: row.suggestedBy,
        suggestedAt: row.suggestedAt,
        updatedAt: row.updatedAt,
      };
    }),

  setWatchlist: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        keywords: z.array(z.string().min(1).max(100)).max(30).default([]),
        competitorNames: z.array(z.string().min(1).max(100)).max(30).default([]),
        industryTags: z.array(z.string().min(1).max(60)).max(10).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const kw = JSON.stringify(input.keywords);
      const cn = JSON.stringify(input.competitorNames);
      const it = JSON.stringify(input.industryTags);
      await db.execute(sql`
        INSERT INTO brand_watchlist (brandId, userId, keywords, competitorNames, industryTags)
        VALUES (${input.brandId}, ${ctx.user.id}, ${kw}, ${cn}, ${it})
        ON DUPLICATE KEY UPDATE
          keywords = ${kw},
          competitorNames = ${cn},
          industryTags = ${it}
      `);
      return { ok: true };
    }),

  // LLM-generated watchlist suggestions. Reads brand name + brand_brain (if any)
  // and returns suggested keywords / competitorNames / industryTags. Client shows
  // these as suggestion chips — user picks which to keep.
  suggestWatchlist: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // 1. Load brand basics
      const [brandRows] = (await db.execute(sql`
        SELECT id, name, industry, description
        FROM brands WHERE id = ${input.brandId} LIMIT 1
      `)) as any;
      const brand = (Array.isArray(brandRows) ? brandRows[0] : null) ?? {};
      if (!brand?.id) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });

      // 2. Try to read brand_brain (handle snake_case + camelCase schemas)
      let brainText = "";
      try {
        const [r] = (await db.execute(sql`
          SELECT content FROM brand_brain WHERE brand_id = ${input.brandId}
          ORDER BY updated_at DESC LIMIT 1
        `)) as any;
        const row = Array.isArray(r) ? r[0] : null;
        if (row?.content) brainText = String(row.content).slice(0, 3000);
      } catch {
        try {
          const [r] = (await db.execute(sql`
            SELECT content FROM brand_brain WHERE brandId = ${input.brandId}
            ORDER BY updatedAt DESC LIMIT 1
          `)) as any;
          const row = Array.isArray(r) ? r[0] : null;
          if (row?.content) brainText = String(row.content).slice(0, 3000);
        } catch { /* no brain table or no row */ }
      }

      // 3. Ask LLM for structured watchlist suggestions
      const systemPrompt =
        "你是品牌情報分析師。根據給定的品牌資訊，建議追蹤用的關鍵字、競品名稱、產業標籤。" +
        "只輸出 JSON：{\"keywords\":string[], \"competitorNames\":string[], \"industryTags\":string[], \"rationale\":string}。" +
        "規則：\n" +
        "- keywords: 8–15 個中英文混合的搜尋詞（避免只有品牌自己的名字）\n" +
        "- competitorNames: 5–10 個真實可辨識的競品公司/品牌名（必須是現存品牌，不要虛構）\n" +
        "- industryTags: 3–5 個產業分類\n" +
        "- rationale: 50 字內說明這個名單的邏輯";

      const userPrompt = [
        `【品牌名稱】${brand.name ?? ""}`,
        brand.industry ? `【產業】${brand.industry}` : "",
        brand.description ? `【簡介】${String(brand.description).slice(0, 500)}` : "",
        brainText ? `【品牌大腦摘錄】\n${brainText}` : "",
      ].filter(Boolean).join("\n");

      let parsed: any = {};
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 600,
          responseFormat: { type: "json_object" },
        } as any);
        const rawContent = (result as any)?.choices?.[0]?.message?.content;
        const raw = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
            : "";
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (err: any) {
        console.error("[brandIntel.suggestWatchlist] LLM failed:", err?.message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI 建議失敗，請稍後再試",
        });
      }

      const toStringArr = (v: any, cap: number): string[] =>
        Array.isArray(v)
          ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, cap)
          : [];
      const suggestion = {
        keywords: toStringArr(parsed.keywords, 20),
        competitorNames: toStringArr(parsed.competitorNames, 15),
        industryTags: toStringArr(parsed.industryTags, 8),
        rationale: String(parsed.rationale ?? "").slice(0, 300),
      };

      // 4. Mark suggestedBy/suggestedAt on existing watchlist (or create empty row)
      //    so the UI can show "AI suggested N hours ago"
      await db.execute(sql`
        INSERT INTO brand_watchlist (brandId, userId, suggestedBy, suggestedAt)
        VALUES (${input.brandId}, ${ctx.user.id}, 'llm', NOW(3))
        ON DUPLICATE KEY UPDATE
          suggestedBy = 'llm',
          suggestedAt = NOW(3)
      `);

      return suggestion;
    }),

  // ─── Auto-feed via scout orchestrator (Batch 2-2b) ───────────────────────
  // Runs all available scouts (perplexity, google news, google trends …) in
  // parallel. Tier B/C scouts activate when the brand has stored creds. Each
  // scout fails in isolation; per-scout status is returned so UI can show
  // "連 N 個來源（M 個需授權）".
  //
  // Cached in-process per (brandId) with 20-min TTL so multiple tab opens
  // don't re-burn the scout budget.

  feedAuto: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        days: z.number().min(1).max(90).default(14),
        limit: z.number().min(1).max(50).default(24),
        force: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return { items: [], keywords: [], source: "none" };

      // Load watchlist + brand name
      const [wrows] = (await db.execute(sql`
        SELECT keywords, competitorNames, industryTags
        FROM brand_watchlist WHERE brandId = ${input.brandId} LIMIT 1
      `)) as any;
      const w = Array.isArray(wrows) ? wrows[0] : null;
      const parseJson = (v: any): string[] => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };
      const keywords = parseJson(w?.keywords).map((s) => String(s).trim()).filter((s) => s.length >= 2);
      const competitors = parseJson(w?.competitorNames).map((s) => String(s).trim()).filter((s) => s.length >= 2);
      const industries = parseJson(w?.industryTags).map((s) => String(s).trim()).filter((s) => s.length >= 2);
      const kwAll = [...keywords, ...competitors, ...industries];

      if (!kwAll.length) {
        return { items: [], keywords: [], source: "empty-watchlist" };
      }

      const [brandRows] = (await db.execute(sql`
        SELECT name, industry FROM brands WHERE id = ${input.brandId} LIMIT 1
      `)) as any;
      const brandRow = Array.isArray(brandRows) ? brandRows[0] : null;
      const brandName = String(brandRow?.name ?? "").trim();

      // Cache key — invalidate every 20 min
      const CACHE_TTL_MS = 20 * 60 * 1000;
      const bucketKey = JSON.stringify({ b: input.brandId, d: input.days, l: input.limit, kw: kwAll.sort() });
      const cached = feedAutoCache.get(bucketKey);
      const now = Date.now();
      if (!input.force && cached && now - cached.ts < CACHE_TTL_MS) {
        return { ...cached.payload, cached: true };
      }

      // Run scout orchestrator — parallel, isolated failures
      try {
        const out = await runScouts(
          {
            brandId: input.brandId,
            brandName,
            industry: brandRow?.industry ?? undefined,
            keywords,
            competitors,
            industryTags: industries,
            days: input.days,
            limit: input.limit,
            loadCred: async (tool: string) => {
              const c = await loadToolCredential(input.brandId, tool);
              return c ? c.payload : null;
            },
          },
          60_000
        );

        const payload = {
          items: out.items,
          keywords: kwAll,
          source: out.items.length > 0 ? "scouts" : "empty-scouts",
          scouts: out.scouts.map((s) => ({
            id: s.scoutId,
            ok: s.ok,
            count: s.items.length,
            elapsedMs: s.elapsedMs,
            skipped: s.skipped,
            error: s.error,
          })),
          availableScouts: out.availableScouts,
          authedScouts: out.authedScouts,
          unauthedScouts: out.unauthedScouts,
          fetchedAt: out.fetchedAt,
        };
        feedAutoCache.set(bucketKey, { ts: now, payload });
        return { ...payload, cached: false };
      } catch (err: any) {
        console.error("[brandIntel.feedAuto] orchestrator failed:", err?.message);
        return {
          items: [],
          keywords: kwAll,
          source: "error",
          error: err?.message ?? "orchestrator failed",
        };
      }
    }),

  // Pin a market_data row → brand_intel_signals so autoFill can reference it.
  // Accepts the raw card fields (title / source / content / url / type) because
  // market_data rows aren't stable across refreshes.
  pinFromAuto: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        type: z.enum(["competitor_news", "trending_topic", "social_trend"]),
        title: z.string().min(1).max(500),
        content: z.string().max(8000).optional(),
        source: z.string().min(1).max(255),
        url: z.string().max(1000).optional(),
        publishedAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const typeMap: Record<string, string> = {
        competitor_news: "competitor",
        trending_topic:  "trend",
        social_trend:    "social",
      };
      const mapped = typeMap[input.type] ?? "manual";
      // Use publishedAt if valid, else NOW()
      const capturedAt = input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt))
        ? new Date(input.publishedAt).toISOString().slice(0, 19).replace("T", " ")
        : null;
      const [result] = (await db.execute(sql`
        INSERT INTO brand_intel_signals
          (brandId, userId, type, source, headline, body, url, relevance, capturedAt)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${mapped}, ${input.source},
           ${input.title}, ${input.content ?? null}, ${input.url ?? null},
           'medium',
           ${capturedAt ? sql`${capturedAt}` : sql`NOW(3)`})
      `)) as any;
      const insertId = (result as any)?.insertId ?? 0;
      return { id: insertId, mappedType: mapped };
    }),
});
