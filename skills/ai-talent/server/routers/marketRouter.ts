/**
 * Market Router — Multi-market configuration API
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tenantMarkets } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TARGET_MARKETS, CONTENT_LANGUAGES } from "../../../../shared/globalization";

// STAB-5: Build allowlists from canonical shared constants (validated at module load time)
const validMarketIds = TARGET_MARKETS.map((m) => m.value);
const validLanguageCodes = CONTENT_LANGUAGES.map((l) => l.value);

export const marketRouter = router({
  /** List available markets */
  listMarkets: protectedProcedure.query(() => TARGET_MARKETS),

  /** List available languages */
  listLanguages: protectedProcedure.query(() => CONTENT_LANGUAGES),

  /** Get current tenant's active markets */
  getMyMarkets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(tenantMarkets).where(eq(tenantMarkets.tenantId, ctx.user.id));
  }),

  /** Set default market for this user/tenant */
  setMarket: protectedProcedure
    .input(
      z.object({
        // STAB-5: Validate marketId against canonical TARGET_MARKETS allowlist
        marketId: z.string().refine((v) => validMarketIds.includes(v), {
          message: "Invalid market ID",
        }),
        // STAB-5: Validate contentLanguage against canonical CONTENT_LANGUAGES allowlist
        contentLanguage: z.string().refine((v) => validLanguageCodes.includes(v), {
          message: "Invalid language code",
        }),
        isDefault: z.boolean().default(true),
        // STAB-5: Restrict complianceFlags to known enum values only
        complianceFlags: z
          .array(z.enum(["GDPR", "FTC", "PDPA", "PIPL", "APPI"]))
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Deactivate previous default if setting new one
      if (input.isDefault) {
        await db
          .update(tenantMarkets)
          .set({ isDefault: false })
          .where(eq(tenantMarkets.tenantId, ctx.user.id));
      }

      // Upsert market config
      const existing = await db
        .select()
        .from(tenantMarkets)
        .where(
          and(
            eq(tenantMarkets.tenantId, ctx.user.id),
            eq(tenantMarkets.marketId, input.marketId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(tenantMarkets)
          .set({
            contentLanguage: input.contentLanguage,
            isDefault: input.isDefault,
            complianceFlags: input.complianceFlags,
          })
          .where(
            and(
              eq(tenantMarkets.tenantId, ctx.user.id),
              eq(tenantMarkets.marketId, input.marketId)
            )
          );
      } else {
        await db.insert(tenantMarkets).values({
          tenantId: ctx.user.id,
          marketId: input.marketId,
          contentLanguage: input.contentLanguage,
          isDefault: input.isDefault,
          complianceFlags: input.complianceFlags,
        });
      }

      return { success: true };
    }),
});
