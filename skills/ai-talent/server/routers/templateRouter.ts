/**
 * templateRouter — "My Methodology Library".
 *
 * Users remix a SoWork-original squad (override steps / prompts / accent)
 * and save it as a personal template bound to one brand. Templates can be
 * scheduled to re-run on a cron, with audit scores logged per run.
 *
 * Tables: user_methodology_templates + (reads decisions/decision_chat_threads).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const accent = z.enum(["teal", "red", "blue"]);

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(sql`
    SELECT id FROM brands WHERE id = ${brandId} AND userId = ${userId} LIMIT 1
  `)) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}

function slugify(name: string, fallback: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || fallback;
}

export const templateRouter = router({
  // Save current squad+customisations as a personal template
  save: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        baseSquadId: z.number().int().positive().optional(),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        accent: accent.default("teal"),
        stepsOverride: z.any().optional(),
        promptsOverride: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const slug = slugify(input.name, `tpl-${Date.now()}`);
      const [result] = (await db.execute(sql`
        INSERT INTO user_methodology_templates
          (brandId, userId, baseSquadId, slug, name, description, accent,
           stepsOverride, promptsOverride)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${input.baseSquadId ?? null},
           ${slug}, ${input.name}, ${input.description ?? null}, ${input.accent},
           ${input.stepsOverride ? JSON.stringify(input.stepsOverride) : null},
           ${input.promptsOverride ? JSON.stringify(input.promptsOverride) : null})
        ON DUPLICATE KEY UPDATE
          name            = VALUES(name),
          description     = VALUES(description),
          accent          = VALUES(accent),
          stepsOverride   = VALUES(stepsOverride),
          promptsOverride = VALUES(promptsOverride),
          updatedAt       = CURRENT_TIMESTAMP(3)
      `)) as any;
      return { templateId: result?.insertId ?? 0, slug };
    }),

  list: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        scheduled: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scheduledFilter = input.scheduled
        ? sql`AND scheduleCron IS NOT NULL`
        : sql``;
      const [rows] = (await db.execute(sql`
        SELECT * FROM user_methodology_templates
        WHERE brandId = ${input.brandId}
        ${scheduledFilter}
        ORDER BY updatedAt DESC
        LIMIT ${input.limit}
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),

  get: protectedProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT * FROM user_methodology_templates WHERE id = ${input.templateId} LIMIT 1
      `)) as any;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandOwner(ctx.user.id, row.brandId);
      return row;
    }),

  schedule: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        cron: z.string().nullable(),
        nextRunAt: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT brandId FROM user_methodology_templates WHERE id = ${input.templateId} LIMIT 1
      `)) as any;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandOwner(ctx.user.id, row.brandId);
      await db.execute(sql`
        UPDATE user_methodology_templates
        SET scheduleCron      = ${input.cron},
            scheduleNextRunAt = ${input.nextRunAt ?? null}
        WHERE id = ${input.templateId}
      `);
      return { ok: true };
    }),

  recordRun: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        auditScore: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // running avg
      await db.execute(sql`
        UPDATE user_methodology_templates
        SET runCount      = runCount + 1,
            lastRunAt     = CURRENT_TIMESTAMP(3),
            avgAuditScore = CASE
              WHEN avgAuditScore IS NULL OR runCount = 0 THEN ${input.auditScore ?? null}
              WHEN ${input.auditScore ?? null} IS NULL THEN avgAuditScore
              ELSE ((avgAuditScore * runCount) + ${input.auditScore ?? 0}) / (runCount + 1)
            END
        WHERE id = ${input.templateId}
      `);
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT brandId FROM user_methodology_templates WHERE id = ${input.templateId} LIMIT 1
      `)) as any;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandOwner(ctx.user.id, row.brandId);
      await db.execute(sql`
        DELETE FROM user_methodology_templates WHERE id = ${input.templateId}
      `);
      return { ok: true };
    }),
});
