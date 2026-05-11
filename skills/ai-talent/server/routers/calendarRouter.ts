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
import { assertBrandOwner } from "../_core/brandAuth";

const CONTENT_TYPES = [
  "fb-content",
  "ig-content",
  "linkedin-content",
  "youtube-content",
  "pr-content",
];

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

  // ─── 2026-05-11 (P0-1 內容日曆 + 排程發布) ────────────────────────
  // New surface combining `scheduled_posts` (pending future posts) +
  // `mission_outputs` (already published) into a single calendar feed.
  // The legacy month/day above is for decisions; this is for content runs.

  /** Unified [from, to) feed of scheduled + published posts owned by caller. */
  range: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
      brandId: z.number().int().positive().optional(),
      workspaceId: z.number().int().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const brandFilter = input.brandId ? "AND sp.brandId = ?" : "";
      const wsFilter    = input.workspaceId ? "AND sp.workspaceId = ?" : "";
      const params: any[] = [ctx.user.id, input.from, input.to];
      if (input.brandId) params.push(input.brandId);
      if (input.workspaceId) params.push(input.workspaceId);

      const [scheduled]: any = await localPool.execute(
        `SELECT sp.id, sp.outputId, sp.variantIndex, sp.platform,
                sp.scheduledAt, sp.status, sp.publishedAt, sp.externalUrl,
                sp.brandId, b.name AS brandName,
                o.content AS outputContent, m.title AS missionTitle
         FROM scheduled_posts sp
         LEFT JOIN brands b ON b.id = sp.brandId
         LEFT JOIN mission_outputs o ON o.id = sp.outputId
         LEFT JOIN missions m ON m.id = o.missionId
         WHERE sp.userId = ?
           AND sp.scheduledAt >= ? AND sp.scheduledAt < ?
           ${brandFilter} ${wsFilter}
         ORDER BY sp.scheduledAt ASC`,
        params,
      );

      const params2: any[] = [ctx.user.id, input.from, input.to];
      if (input.brandId) params2.push(input.brandId);
      const brandFilter2 = input.brandId ? "AND m.brandId = ?" : "";
      const [published]: any = await localPool.execute(
        `SELECT o.id, o.content, o.publishedAt, o.status,
                m.brandId, b.name AS brandName, m.title AS missionTitle,
                m.workspace AS platform
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE m.userId = ?
           AND o.publishedAt IS NOT NULL
           AND o.publishedAt >= ? AND o.publishedAt < ?
           ${brandFilter2}
         ORDER BY o.publishedAt DESC
         LIMIT 200`,
        params2,
      );

      const items = [
        ...(scheduled as any[]).map((s) => ({
          kind: "scheduled" as const,
          id: s.id,
          outputId: s.outputId,
          at: s.scheduledAt,
          platform: s.platform,
          status: s.status,
          brandId: s.brandId,
          brandName: s.brandName,
          missionTitle: s.missionTitle,
          externalUrl: s.externalUrl,
          preview: extractCaption(s.outputContent, s.variantIndex),
        })),
        ...(published as any[]).map((p) => ({
          kind: "published" as const,
          id: p.id,
          outputId: p.id,
          at: p.publishedAt,
          platform: p.platform,
          status: p.status,
          brandId: p.brandId,
          brandName: p.brandName,
          missionTitle: p.missionTitle,
          externalUrl: null,
          preview: extractCaption(p.content, 0),
        })),
      ];
      return items;
    }),

  schedule: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      variantIndex: z.number().int().min(0).default(0),
      scheduledAt: z.string(),
      platform: z.string().min(1).max(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT m.userId, m.brandId, b.workspaceId
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE o.id = ? LIMIT 1`,
        [input.outputId],
      );
      const row = (rows as any[])[0];
      if (!row || row.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      }
      const at = new Date(input.scheduledAt);
      if (isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledAt 必須是未來時間" });
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO scheduled_posts
           (userId, workspaceId, brandId, outputId, variantIndex, platform, scheduledAt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [ctx.user.id, row.workspaceId ?? null, row.brandId ?? null,
         input.outputId, input.variantIndex, input.platform, at],
      );
      return { ok: true, id: (r as any).insertId as number };
    }),

  reschedule: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      scheduledAt: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const at = new Date(input.scheduledAt);
      if (isNaN(at.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date" });
      }
      const [r]: any = await localPool.execute(
        `UPDATE scheduled_posts SET scheduledAt = ?
         WHERE id = ? AND userId = ? AND status = 'pending'`,
        [at, input.id, ctx.user.id],
      );
      if ((r as any).affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到此排程，或已發布 / 取消" });
      }
      return { ok: true };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      await localPool.execute(
        `UPDATE scheduled_posts
         SET status = 'cancelled', cancelledAt = NOW(3), cancelledBy = ?
         WHERE id = ? AND userId = ? AND status = 'pending'`,
        [ctx.user.id, input.id, ctx.user.id],
      );
      return { ok: true };
    }),
});

function extractCaption(content: any, variantIndex: number): string {
  if (!content) return "";
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const variants = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
    const v = variants[variantIndex] ?? variants[0];
    const cap = v?.caption ?? v?.text ?? "";
    return String(cap).slice(0, 120);
  } catch {
    return String(content).slice(0, 120);
  }
}
