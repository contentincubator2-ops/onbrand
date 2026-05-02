/**
 * boardRouter — Task Progress Board aggregate.
 *
 * Columns = decision status (draft / recommended / approved / stale).
 * Each card = one decision with its assigned agent, waiting mentions,
 * last activity.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { assertBrandOwner } from "../_core/brandAuth";

export const boardRouter = router({
  columns: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rows] = (await db.execute(sql`
        SELECT d.id, d.decisionType, d.status, d.title, d.summary,
               d.auditScore, d.staleAt, d.activatedAt, d.createdAt, d.updatedAt,
               d.squadId,
               s.name AS squadName, s.slug AS squadSlug,
               (SELECT COUNT(*) FROM decision_chat_messages m
                  WHERE m.decisionId = d.id) AS chatCount,
               (SELECT COUNT(*) FROM decision_chat_messages m
                  WHERE m.decisionId = d.id AND m.role = 'mention') AS mentionCount
        FROM decisions d
        LEFT JOIN squads s ON s.id = d.squadId
        WHERE d.brandId = ${input.brandId}
          AND d.status IN ('draft','recommended','approved','active','stale')
        ORDER BY d.updatedAt DESC
        LIMIT 500
      `)) as any;

      const all = Array.isArray(rows) ? rows : [];
      const bucket = (status: string) =>
        all.filter((r: any) => {
          if (status === "approved") return r.status === "approved" || r.status === "active";
          return r.status === status;
        });

      return {
        draft:       bucket("draft"),
        recommended: bucket("recommended"),
        approved:    bucket("approved"),
        stale:       bucket("stale"),
        total:       all.length,
      };
    }),
});
