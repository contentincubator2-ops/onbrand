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

const typeSchema = z.enum(["competitor", "trend", "social", "internal", "manual"]);
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
});
