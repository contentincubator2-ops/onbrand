/**
 * brandBrainRouter.ts — tRPC router for Brand Brain
 * Mirrors the functionality of /api/brand-brain/:brandId REST endpoint
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const brandBrainRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { brandId: input.brandId, entries: {} };

      try {
        const [rows] = await db.execute(
          sql`
            SELECT id, brand_id, category, title, content, source_mission_id, created_at, updated_at
            FROM brand_brain
            WHERE brand_id = ${input.brandId}
            ORDER BY category, updated_at DESC
          `
        ) as any;

        const entries: Record<string, any[]> = {
          positioning: [],
          audience: [],
          voice: [],
          competitors: [],
          custom: [],
        };

        for (const row of rows ?? []) {
          const cat = row.category as string;
          if (entries[cat]) {
            entries[cat].push({
              id: row.id,
              title: row.title,
              content: row.content,
              sourceMissionId: row.source_mission_id,
              updatedAt: row.updated_at,
            });
          }
        }

        return { brandId: input.brandId, entries };
      } catch (error) {
        console.error('[brandBrain.list] Error:', error);
        return { brandId: input.brandId, entries: {} };
      }
    }),
});
