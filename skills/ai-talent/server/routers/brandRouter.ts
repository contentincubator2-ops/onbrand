import { getBrandPositioning, getBrandPositioningById } from "../positioningBridge";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { executeTenStepAnalysis, getLatestJobForBrand } from "../positioning";
import {
  analyzeBrandPositioning,
  generateCampaignPositioning,
  generateBrandContentCalendar,
  analyzeBrandCompetitors,
} from "../brand/brandEngine";
import { getDb } from "../db";
import { userApiKeys, missions } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

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
      website: z.string().optional(),
      targetAudience: z.string().optional(),
      competitors: z.string().optional(),
      targetMarket: z.string().optional(),
      contentLanguage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../drizzle/schema");
      const result = await (db.insert(brands) as any).values({
        userId: ctx.user.id,
        name: input.name,
        websiteUrl: input.website ?? null,
        targetAudience: input.targetAudience ?? null,
        soworkAnalysis: {
          competitors: input.competitors ?? null,
          targetMarket: input.targetMarket ?? 'Taiwan',
          contentLanguage: input.contentLanguage ?? 'zh-TW',
        },
        dataSource: 'manual',
        isDefault: false,
      });
      const brandId = (result as any)[0]?.insertId ?? (result as any).insertId;

      // Auto-seed 6 onboarding missions for this brand
      const ONBOARDING_MISSIONS = [
        { workspace: 'strategy', title: '品牌定位', isRecurring: false, recurringSchedule: null, squadSlug: 'tw-b2b-saas-gtm', welcomeMessage: '🔍 **B2B SaaS GTM 策略組**已集結！我們採「先研究、再確認」的 10 步驟流程，每步都帶著分析結果給你看。目標：2個方向×5個定位=10個方案。請告訴我品牌名稱和主要產品/服務（有官網更好）！' },
        { workspace: 'strategy', title: '競品每日情報', isRecurring: true, recurringSchedule: 'daily', squadSlug: 'mkt-analytics-attribution', welcomeMessage: '📊 **行銷數據歸因組**上線！我會主動搜尋競品最新動態，帶研究結果給你確認，不空問。請告訴我品牌名稱和所在產業，我立刻幫你搜尋主要競品清單！' },
        { workspace: 'website', title: '官網文案調整', isRecurring: false, recurringSchedule: null, squadSlug: 'tw-website-rebuild', welcomeMessage: '💻 **官網重建技術組**就位！我會先分析你現有官網文案，再對比競品找改善機會。請提供官網網址，我馬上掃描 Hero/CTA/Value Prop！' },
        { workspace: 'website', title: '每周長文', isRecurring: true, recurringSchedule: 'weekly', squadSlug: 'mkt-seo-growth', welcomeMessage: '✍️ **SEO 自然流量成長組**就緒！流程：先做關鍵字研究+競品文章分析，提出主題候選給你選，確認後輸出1500字+SEO長文。請告訴我品牌/產業，有沒有特別想寫的主題方向？' },
        { workspace: 'facebook', title: '固定品牌貼文', isRecurring: true, recurringSchedule: 'weekly', squadSlug: 'mkt-content-engine', welcomeMessage: '📱 **內容行銷引擎組**開始！我先搜尋本週行業熱門話題，提出一週排期草稿給你確認。請告訴我品牌名稱，我馬上查本週熱門話題！' },
        { workspace: 'facebook', title: '廣告投放優化', isRecurring: false, recurringSchedule: null, squadSlug: 'tw-ecom-full-funnel', welcomeMessage: '🎯 **全漏斗電商行銷組**集結！我先診斷問題點、研究競品廣告策略，帶3個Ad Set優化方向給你確認。請告訴我品牌名稱和目前主要廣告類型（流量/轉換/再行銷）！' },
      ]
      for (const m of ONBOARDING_MISSIONS) {
        try {
          await db.execute(
            sql`INSERT INTO missions (userId, brandId, workspace, title, squadSlug, welcomeMessage, isRecurring, recurringSchedule, status)
                VALUES (${ctx.user.id}, ${brandId}, ${m.workspace}, ${m.title}, ${m.squadSlug},
                       ${m.welcomeMessage}, ${m.isRecurring ? 1 : 0}, ${m.recurringSchedule ?? null}, 'active')`
          );
        } catch (err) {
          console.error('[brand.create] mission seed failed:', m.title, err);
        }
      }

      return { id: brandId, name: input.name };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../drizzle/schema");
      await db.delete(brands).where(and(eq(brands.id, input.id), eq(brands.userId, ctx.user.id)));
      return { success: true };
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


  /**
   * 從 sowork_db 即時匹配適合 Onboarding 的 Agents
   * 根據任務類型（research / strategy / copywriting）選最佳人選
   */
  matchAgentsForOnboarding: protectedProcedure
    .input(z.object({
      brandName: z.string(),
      industry: z.string().optional(),
      taskTypes: z.array(z.enum(["research", "strategy", "copywriting", "ads", "seo", "pr"])).default(["research", "strategy", "copywriting"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        // fallback 靜態資料
        return [
          { id: 29, name: "蘇雅玲", title: "公關策略師", specialty: "品牌定位、PR策略", layer: "strategy", taskType: "research" },
          { id: 26, name: "吳佳穎", title: "META廣告策略師", specialty: "品牌廣告、受眾策略", layer: "strategy", taskType: "strategy" },
          { id: 32, name: "許雅芳", title: "文案撰寫師", specialty: "廣告文案、品牌語調", layer: "execution", taskType: "copywriting" },
        ];
      }

      const mysql2 = require("mysql2/promise");
      const pool = await mysql2.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false },
      });

      const matched: any[] = [];
      const industry = input.industry ?? "";

      // 每個任務類型找最適合的 agent
      const taskQueries: Record<string, string> = {
        research: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND layer='strategy' AND (specialty LIKE '%定位%' OR specialty LIKE '%研究%' OR specialty LIKE '%PR%' OR specialty LIKE '%品牌%') ORDER BY rating DESC LIMIT 1`,
        strategy: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND layer='strategy' AND specialty LIKE '%策略%' ORDER BY rating DESC LIMIT 1`,
        copywriting: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND (layer='execution') AND (specialty LIKE '%文案%' OR specialty LIKE '%腳本%' OR specialty LIKE '%撰寫%') ORDER BY rating DESC LIMIT 1`,
        ads: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND specialty LIKE '%廣告%' ORDER BY rating DESC LIMIT 1`,
        seo: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND specialty LIKE '%SEO%' ORDER BY rating DESC LIMIT 1`,
        pr: `SELECT id, name, title, specialty, layer FROM agents WHERE isAvailable=1 AND specialty LIKE '%公關%' ORDER BY rating DESC LIMIT 1`,
      };

      for (const taskType of input.taskTypes) {
        const q = taskQueries[taskType];
        if (!q) continue;
        const [rows] = await pool.query(q) as any;
        if (rows.length > 0) {
          matched.push({ ...rows[0], taskType });
        }
      }

      await pool.end();
      return matched;
    }),


  /**
   * 品牌定位分析 — Positioning Bridge
   * 查 DB 快取 → 若無則 AI 生成（5步驟簡化版）
   */
  startPositioningAnalysis: protectedProcedure
    .input(z.object({
      brandName: z.string().min(1).max(128),
      industry: z.string().optional(),
      description: z.string().optional(),
      targetMarket: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userApiKey = await getUserApiKey(ctx.user.id);
      const result = await getBrandPositioning({
        userId: ctx.user.id,
        userApiKey,
        brandName: input.brandName,
        industry: input.industry,
        description: input.description,
        targetMarket: input.targetMarket,
      });
      return result;
    }),

  /**
   * 根據 brandId 取得定位上下文
   */
  getPositioningById: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getBrandPositioningById(input.brandId, ctx.user.id);
    }),

  /**
   * 本地十步驟品牌定位分析（Marketing OS 自有引擎）
   * 不依賴 app.sowork.ai，完全在本 VM 執行
   */
  runLocalPositioningAnalysis: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      brandName: z.string().min(1).max(128),
      industry: z.string().optional(),
      description: z.string().optional(),
      targetMarket: z.string().optional(),
      contentLanguage: z.string().default("zh-TW"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { jobId, result } = await executeTenStepAnalysis({
        brandId: input.brandId,
        userId: String(ctx.user?.id ?? "mos-user"),
        brandName: input.brandName,
        industry: input.industry,
        description: input.description,
        targetMarket: input.targetMarket ?? null,
        contentLanguage: input.contentLanguage,
      });
      return { success: true, jobId, result };
    }),

  /**
   * 取得定位分析進度 / 結果
   * SEC: 改成 protectedProcedure，只允許品牌擁有者查詢
   */
  getLocalAnalysisStatus: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (db) {
        const { brands } = await import("../../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");
        // 驗證 brand 屬於當前用戶
        const rows = await db.select({ id: brands.id }).from(brands)
          .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
          .limit(1);
        if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found or unauthorized" });
      }
      const job = await getLatestJobForBrand(input.brandId);
      return job ?? null;
    }),


  // ── New: brand_members & positioning steps ─────────────────────────────────

  /**
   * 列出用戶有權限的品牌（透過 brand_members 表）
   */
  listByMember: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(
        sql`SELECT b.*, bm.role
            FROM brands b
            INNER JOIN brand_members bm ON bm.brandId = b.id
            WHERE bm.userId = ${ctx.user.id}
            ORDER BY b.createdAt DESC`
      ) as any;
      return rows ?? [];
    }),

  /**
   * 取得單一品牌（含定位步驟進度），需為成員
   */
  getByMember: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [membership] = await db.execute(
        sql`SELECT role FROM brand_members WHERE brandId = ${input.brandId} AND userId = ${ctx.user.id} LIMIT 1`
      ) as any;
      if (!membership?.[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this brand" });
      const [brandRows] = await db.execute(
        sql`SELECT * FROM brands WHERE id = ${input.brandId} LIMIT 1`
      ) as any;
      const brand = brandRows?.[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      const [stepRows] = await db.execute(
        sql`SELECT * FROM brand_positioning_steps WHERE brandId = ${input.brandId} ORDER BY step ASC`
      ) as any;
      return { ...brand, role: membership[0].role, positioningSteps: stepRows ?? [] };
    }),

  /**
   * 建立品牌並加入 brand_members 為 owner
   */
  createWithMember: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      website: z.string().optional(),
      socialLinks: z.string().optional(),
      description: z.string().optional(),
      industry: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const slug = input.name
        .toLowerCase().trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
      // Convert socialLinks string to JSON
      let socialLinksJson: string | null = null;
      if (input.socialLinks?.trim()) {
        try { JSON.parse(input.socialLinks); socialLinksJson = input.socialLinks; }
        catch { socialLinksJson = JSON.stringify(input.socialLinks.split(/[,\n]+/).map((s:string)=>s.trim()).filter(Boolean)); }
      }
            const [result] = await db.execute(
        sql`INSERT INTO brands (name, slug, industry, website, socialLinks, description, createdBy, userId)
            VALUES (${input.name}, ${slug}, ${input.industry ?? null},
                    ${input.website ?? null}, ${socialLinksJson},
                    ${input.description ?? null}, ${ctx.user.id}, ${ctx.user.id})`
      ) as any;
      const brandId = result?.insertId;
      if (!brandId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create brand" });
      await db.execute(
        sql`INSERT INTO brand_members (brandId, userId, role, addedBy)
            VALUES (${brandId}, ${ctx.user.id}, "owner", ${ctx.user.id})`
      );

      // 1. 建立 strategy workspace（若用戶還沒有）
      await db.execute(
        sql`INSERT IGNORE INTO user_workspaces (userId, wsKey, label, sortOrder, brandId)
            VALUES (${ctx.user.id}, 'strategy', '策略定位', 0, ${brandId})`
      );

      // 取得剛建立的 workspace id（或已存在的）
      const [wsRows] = await db.execute(
        sql`SELECT id FROM user_workspaces WHERE userId=${ctx.user.id} AND wsKey='strategy' AND brandId=${brandId} LIMIT 1`
      ) as any;
      const _wsId = wsRows?.[0]?.id;

      // 2. 建立「品牌定位」mission
      const positioningWelcome = `你好！我是你的品牌定位顧問。

🎯 接下來我們將一起完成 **11 步驟品牌策略定位**，幫你建立清晰的品牌定位基礎。

這 11 個步驟包含：
1. 品牌核心價值定義
2. 目標受眾分析
3. 競品定位對比
4. 獨特價值主張（UVP）
5. 品牌個性與語調
6. 市場定位地圖
7. 價格定位策略
8. 通路策略
9. 內容主題柱
10. 品牌故事框架
11. 執行優先序

準備好了嗎？先告訴我：**你的品牌主要解決什麼問題？目標客戶是誰？**`;

      await db.execute(
        sql`INSERT INTO missions (userId, workspace, title, squadSlug, welcomeMessage, isRecurring, status, brandId)
            VALUES (${ctx.user.id}, 'strategy', '品牌定位', 'brand-positioning', ${positioningWelcome}, 0, 'active', ${brandId})
            ON DUPLICATE KEY UPDATE id=id`
      );

      // 取得 mission id
      const [missionRows] = await db.execute(
        sql`SELECT id FROM missions WHERE userId=${ctx.user.id} AND workspace='strategy' AND title='品牌定位' AND brandId=${brandId} LIMIT 1`
      ) as any;
      const missionId = missionRows?.[0]?.id;

      return { id: brandId, name: input.name, slug, missionId: missionId ?? null };
    }),

  /**
   * 加入成員
   */
  addMember: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      userId: z.number(),
      role: z.enum(["editor", "viewer"]).default("editor"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [memberRows] = await db.execute(
        sql`SELECT role FROM brand_members WHERE brandId = ${input.brandId} AND userId = ${ctx.user.id} LIMIT 1`
      ) as any;
      const callerRole = memberRows?.[0]?.role;
      if (!callerRole || callerRole === "viewer") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }
      await db.execute(
        sql`INSERT INTO brand_members (brandId, userId, role, addedBy)
            VALUES (${input.brandId}, ${input.userId}, ${input.role}, ${ctx.user.id})
            ON DUPLICATE KEY UPDATE role = ${input.role}`
      );
      return { success: true };
    }),

  /**
   * 更新定位步驟結果
   * 若 step=11 且 status=completed 則更新 brands.positioningStatus="completed"
   */
  savePositioningStep: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      step: z.number().int().min(0).max(11),
      content: z.string(),
      status: z.enum(["pending", "in_progress", "completed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [memberRows] = await db.execute(
        sql`SELECT role FROM brand_members WHERE brandId = ${input.brandId} AND userId = ${ctx.user.id} LIMIT 1`
      ) as any;
      const callerRole = memberRows?.[0]?.role;
      if (!callerRole || callerRole === "viewer") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }
      await db.execute(
        sql`INSERT INTO brand_positioning_steps (brandId, step, content, status, completedAt)
            VALUES (${input.brandId}, ${input.step}, ${input.content}, ${input.status},
                    ${input.status === "completed" ? new Date() : null})
            ON DUPLICATE KEY UPDATE
              content = VALUES(content),
              status = VALUES(status),
              completedAt = IF(VALUES(status) = "completed", NOW(), NULL)`
      );
      if (input.step === 11 && input.status === "completed") {
        await db.execute(
          sql`UPDATE brands SET positioningStatus = "completed", onboardingStep = 11 WHERE id = ${input.brandId}`
        );
      } else if (input.status === "in_progress") {
        await db.execute(
          sql`UPDATE brands SET positioningStatus = "in_progress", onboardingStep = ${input.step} WHERE id = ${input.brandId}`
        );
      }
      return { success: true };
    }),

  /**
   * 取得可用資源數量（依 workspace label 匹配 agents）
   */
  resourceCount: protectedProcedure
    .input(z.object({ wsKey: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const pattern = "%" + input.wsKey + "%";
      const [rows] = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM agents
            WHERE isAvailable = 1
              AND (primarySkill LIKE ${pattern} OR specialty LIKE ${pattern})`
      ) as any;
      return { count: Number(rows?.[0]?.cnt ?? 0) };
    }),

});