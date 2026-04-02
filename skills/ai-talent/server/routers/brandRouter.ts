import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  analyzeBrandPositioning,
  generateCampaignPositioning,
  generateBrandContentCalendar,
  analyzeBrandCompetitors,
} from "../brand/brandEngine";
import { getDb } from "../db";
import { userApiKeys } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Helper to get user's API key
async function getUserApiKey(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) return `internal-${userId}`;
  const rows = await db
    .select({ apiKey: userApiKeys.apiKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.isActive, true)))
    .limit(1);
  return rows[0]?.apiKey ?? `internal-${userId}`;
}

export const brandRouter = router({
  analyzeBrand: protectedProcedure
    .input(
      z.object({
        brandName: z.string().min(1).max(100),
        industry: z.string().optional(),
        targetMarket: z.string().optional(),
        websiteUrl: z.string().url().optional(),
        competitors: z.array(z.string()).max(5).default([]),
        existingPositioning: z.string().max(500).optional(),
        contentLanguage: z.string().default("zh-TW"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userApiKey = await getUserApiKey(ctx.user.id);
      return analyzeBrandPositioning({ ...input, userId: ctx.user.id, userApiKey } as any);
    }),

  generateContentCalendar: protectedProcedure
    .input(
      z.object({
        brandName: z.string().min(1),
        weeks: z.number().min(1).max(12).default(4),
        platforms: z.array(z.string()).default(["Facebook", "Instagram"]),
        targetMarket: z.string().optional(),
        contentLanguage: z.string().default("zh-TW"),
        userApiKey: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return generateBrandContentCalendar({ ...input as any, userId: ctx.user!.id });
    }),

  analyzeCompetitors: protectedProcedure
    .input(
      z.object({
        brandName: z.string().min(1),
        industry: z.string().optional(),
        competitors: z.array(z.string()).default([]),
        contentLanguage: z.string().default("zh-TW"),
        userApiKey: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return analyzeBrandCompetitors({ ...input as any, userId: ctx.user!.id });
    }),

  generateCampaign: protectedProcedure
    .input(
      z.object({
        brandName: z.string().min(1).max(100),
        campaignGoal: z.string().min(1).max(300),
        targetAudience: z.string().min(1).max(300),
        channels: z
          .array(z.enum(["Facebook", "Instagram", "LINE", "Google", "TikTok", "YouTube"]))
          .default(["Facebook", "Instagram"]),
        contentLanguage: z.string().default("zh-TW"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userApiKey = await getUserApiKey(ctx.user.id);
      return generateCampaignPositioning({ ...input, userId: ctx.user.id, userApiKey } as any);
    }),
});
