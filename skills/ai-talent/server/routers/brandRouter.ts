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

  // ── Brand CRUD ──
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const { brands } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(brands).where(eq(brands.userId, ctx.user.id)).orderBy(brands.createdAt);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const { brands } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.id), eq(brands.userId, ctx.user.id)))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      websiteUrl: z.string().optional(),
      industry: z.string().optional(),
      targetAudience: z.string().optional(),
      brandVoice: z.string().optional(),
      soworkAnalysis: z.record(z.unknown()).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      // 如果設為 default，先清除其他 default
      if (input.isDefault) {
        await (db.update(brands) as any)
          .set({ isDefault: false })
          .where(eq(brands.userId, ctx.user.id));
      }
      const result = await (db.insert(brands) as any).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        websiteUrl: input.websiteUrl ?? null,
        targetAudience: input.targetAudience ?? null,
        brandVoice: input.brandVoice ?? null,
        soworkAnalysis: input.soworkAnalysis ?? null,
        isDefault: input.isDefault ?? false,
        dataSource: "sowork",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const brandId = (result as any)[0]?.insertId ?? result.insertId;
      return { id: brandId, name: input.name };
    }),

  runOnboarding: protectedProcedure
    .input(z.object({
      brandName: z.string().min(1),
      industry: z.string().optional(),
      websiteUrl: z.string().optional(),
      targetAudience: z.string().optional(),
      competitors: z.array(z.string()).default([]),
      existingPositioning: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userApiKey = await getUserApiKey(ctx.user.id);
      const analysis = await analyzeBrandPositioning({
        ...input,
        userId: ctx.user.id,
        userApiKey,
        contentLanguage: "zh-TW",
      } as any);

      // 自動儲存到 brands 表
      const db = await getDb();
      if (db) {
        const { brands } = await import("../../drizzle/schema");
        const result = await (db.insert(brands) as any).values({
          userId: ctx.user.id,
          name: input.brandName,
          websiteUrl: input.websiteUrl ?? null,
          targetAudience: analysis.targetAudience,
          brandVoice: analysis.brandVoice,
          soworkAnalysis: analysis as unknown as Record<string, unknown>,
          isDefault: true,
          dataSource: "sowork",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const brandId = (result as any)[0]?.insertId ?? result.insertId;
        return { brandId, analysis };
      }
      return { brandId: null, analysis };
    }),

});