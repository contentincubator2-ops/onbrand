/**
 * calendarRouter — Content Calendar aggregate.
 *
 * Pulls content-type decisions (fb-content / ig-content / linkedin-content etc)
 * from the decisions table, bucketed by day, with audit score + publish state.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const CONTENT_TYPES = [
  "fb-content",
  "ig-content",
  "linkedin-content",
  "youtube-content",
  "pr-content",
];

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(sql`
    SELECT id FROM brands WHERE id = ${brandId} AND userId = ${userId} LIMIT 1
  `)) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const calendarRouter = router({
  month: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        year: z.number().int().min(2020).max(2099),
        month: z.number().int().min(1).max(12), // 1-based
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const start = new Date(Date.UTC(input.year, input.month - 1, 1));
      const end = new Date(Date.UTC(input.year, input.month, 1));

      const [rows] = (await db.execute(sql`
        SELECT id, decisionType, status, title, auditScore,
               publishedAt, activatedAt, createdAt, payload
        FROM decisions
        WHERE brandId = ${input.brandId}
          AND decisionType IN (${sql.join(CONTENT_TYPES.map((t) => sql`${t}`), sql`, `)})
          AND (
                (publishedAt IS NOT NULL AND publishedAt >= ${start} AND publishedAt < ${end})
             OR (publishedAt IS NULL AND createdAt >= ${start} AND createdAt < ${end})
          )
        ORDER BY COALESCE(publishedAt, createdAt) ASC
      `)) as any;

      const all = Array.isArray(rows) ? rows : [];
      const byDay: Record<string, any[]> = {};
      for (const r of all) {
        const ts = r.publishedAt ?? r.createdAt;
        const k = dayKey(new Date(ts));
        (byDay[k] ??= []).push({
          id: r.id,
          channel: r.decisionType.replace("-content", ""),
          status: r.status,
          title: r.title,
          auditScore: r.auditScore,
          published: !!r.publishedAt,
          scheduled: !r.publishedAt && r.status === "approved",
        });
      }
      return { byDay, total: all.length };
    }),

  day: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const start = new Date(`${input.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 3600 * 1000);

      const [rows] = (await db.execute(sql`
        SELECT d.id, d.decisionType, d.status, d.title, d.summary,
               d.auditScore, d.publishedAt, d.activatedAt, d.createdAt,
               o.payload AS optionPayload
        FROM decisions d
        LEFT JOIN decision_options o ON o.id = d.recommendedOptionId
        WHERE d.brandId = ${input.brandId}
          AND d.decisionType IN (${sql.join(CONTENT_TYPES.map((t) => sql`${t}`), sql`, `)})
          AND (
                (d.publishedAt IS NOT NULL AND d.publishedAt >= ${start} AND d.publishedAt < ${end})
             OR (d.publishedAt IS NULL AND d.createdAt >= ${start} AND d.createdAt < ${end})
          )
        ORDER BY COALESCE(d.publishedAt, d.createdAt) ASC
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),
});
