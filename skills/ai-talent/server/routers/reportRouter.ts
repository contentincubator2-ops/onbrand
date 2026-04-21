import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * reportRouter — reads/writes brand_reports + brand_report_sections.
 *
 * Frontend surfaces:
 *   - Report Editor page (/m/:id/report)
 *   - Right-panel SOP section deep-links
 *   - Chat message regenerate flow (future sprint)
 *
 * Authorisation: every endpoint validates that the requesting user owns
 * the mission via missions.userId.
 */

async function ensureMissionOwner(
  db: any,
  missionId: number,
  userId: number,
): Promise<void> {
  const [rows] = (await db.execute(
    sql`SELECT id FROM missions WHERE id=${missionId} AND userId=${userId} LIMIT 1`,
  )) as any;
  if (!rows?.[0]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not authorized for this mission",
    });
  }
}

export const reportRouter = router({
  // Get the report + all current sections for a mission.
  getByMission: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      await ensureMissionOwner(db, input.missionId, ctx.user.id);

      const [reportRows] = (await db.execute(
        sql`SELECT id, missionId, squadId, squadSlug, brandId, title, status,
                   createdAt, updatedAt
            FROM brand_reports WHERE missionId=${input.missionId} LIMIT 1`,
      )) as any;
      const report = (reportRows as any[])[0];
      if (!report) return null;

      const [sectionRows] = (await db.execute(
        sql`SELECT id, reportId, stepOrder, stepName,
                   agentId, agentRole, agentName,
                   content, userEdited, version, sourceMessageId,
                   isCurrent, createdAt, updatedAt
            FROM brand_report_sections
            WHERE reportId=${report.id} AND isCurrent=1
            ORDER BY stepOrder ASC`,
      )) as any;

      return {
        ...report,
        sections: sectionRows ?? [],
      };
    }),

  // Get a single section by id — used when user clicks a section/step card.
  getSection: protectedProcedure
    .input(z.object({ sectionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      // Join with brand_reports + missions to verify ownership
      const [rows] = (await db.execute(
        sql`SELECT brs.*, br.missionId
            FROM brand_report_sections brs
            JOIN brand_reports br ON br.id = brs.reportId
            JOIN missions m ON m.id = br.missionId
            WHERE brs.id=${input.sectionId} AND m.userId=${ctx.user.id}
            LIMIT 1`,
      )) as any;
      return (rows as any[])[0] ?? null;
    }),

  // User-edit: update section content + flag userEdited=1.
  // Regeneration later will see userEdited=1 and version++ instead of overwriting.
  updateSection: protectedProcedure
    .input(
      z.object({
        sectionId: z.number(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify ownership
      const [rows] = (await db.execute(
        sql`SELECT brs.id FROM brand_report_sections brs
            JOIN brand_reports br ON br.id = brs.reportId
            JOIN missions m ON m.id = br.missionId
            WHERE brs.id=${input.sectionId} AND m.userId=${ctx.user.id}
            LIMIT 1`,
      )) as any;
      if (!rows?.[0]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized for this section",
        });
      }

      await db.execute(
        sql`UPDATE brand_report_sections
            SET content=${input.content}, userEdited=1,
                updatedAt=CURRENT_TIMESTAMP(3)
            WHERE id=${input.sectionId}`,
      );
      return { success: true };
    }),

  // List all versions for a given (reportId, stepOrder) — version history UI.
  getSectionVersions: protectedProcedure
    .input(z.object({ reportId: z.number(), stepOrder: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership via report → mission
      const [ownRows] = (await db.execute(
        sql`SELECT br.id FROM brand_reports br
            JOIN missions m ON m.id = br.missionId
            WHERE br.id=${input.reportId} AND m.userId=${ctx.user.id}
            LIMIT 1`,
      )) as any;
      if (!ownRows?.[0]) return [];

      const [rows] = (await db.execute(
        sql`SELECT id, version, userEdited, isCurrent,
                   sourceMessageId, createdAt, updatedAt,
                   LEFT(content, 200) AS contentPreview
            FROM brand_report_sections
            WHERE reportId=${input.reportId} AND stepOrder=${input.stepOrder}
            ORDER BY version DESC`,
      )) as any;
      return rows ?? [];
    }),
});
