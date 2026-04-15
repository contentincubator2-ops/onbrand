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
        { workspace: 'strategy', title: '品牌定位',    isRecurring: false, recurringSchedule: null,     squadSlug: 'tw-b2b-saas-gtm' },
        { workspace: 'strategy', title: '競品每日情報', isRecurring: true,  recurringSchedule: 'daily',   squadSlug: 'mkt-analytics-attribution' },
        { workspace: 'website',  title: '官網文案調整', isRecurring: false, recurringSchedule: null,     squadSlug: 'tw-website-rebuild' },
        { workspace: 'website',  title: '每周長文',    isRecurring: true,  recurringSchedule: 'weekly',  squadSlug: 'mkt-seo-growth' },
        { workspace: 'facebook', title: '固定品牌貼文', isRecurring: true,  recurringSchedule: 'weekly',  squadSlug: 'mkt-content-engine' },
        { workspace: 'facebook', title: '廣告投放優化', isRecurring: false, recurringSchedule: null,     squadSlug: 'tw-ecom-full-funnel' },
      ];
      for (const m of ONBOARDING_MISSIONS) {
        try {
          await db.execute(
            sql`INSERT INTO missions (userId, brandId, workspace, title, squadSlug, isRecurring, recurringSchedule, status)
                VALUES (${ctx.user.id}, ${brandId}, ${m.workspace}, ${m.title}, ${m.squadSlug},
                       ${m.isRecurring ? 1 : 0}, ${m.recurringSchedule ?? null}, 'active')`
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

      // Auto-estimate brand positioning after creation
      try {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
        const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
        if (endpoint && apiKey) {
          const promptText = `你是品牌策略專家。根據以下品牌資訊，推估品牌定位，用繁體中文，以 JSON 格式輸出。
品牌名稱：${input.name}
產業：${input.industry ?? "未知"}
品牌簡介：${input.description ?? "無"}
官網：${input.website ?? "無"}

輸出 JSON：{"tagline":"20字內標語","valueProposition":"50字內價值主張","targetMarket":"10字內目標市場","audienceA":"15字內主要客群","audienceB":"15字內次要客群","emotionalDiff":"20字內情感差異化","functionalDiff":"20字內功能差異化"}`;

          const res = await fetch(
            `${endpoint}/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-02-01`,
            {
              method: "POST",
              headers: { "api-key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [{ role: "user", content: promptText }],
                max_tokens: 400,
                response_format: { type: "json_object" },
              }),
            }
          );
          const gptData = await res.json() as any;
          const gptContent = gptData?.choices?.[0]?.message?.content;
          if (gptContent) {
            const est = JSON.parse(gptContent);
            await db.execute(sql`UPDATE brands SET
              tagline=${est.tagline ?? null},
              valueProposition=${JSON.stringify(est.valueProposition ?? '')},
              targetMarket=${est.targetMarket ?? null},
              audienceA=${est.audienceA ?? null},
              audienceB=${est.audienceB ?? null},
              emotionalDiff=${est.emotionalDiff ?? null},
              functionalDiff=${est.functionalDiff ?? null},
              isEstimate=1
              WHERE id=${brandId}`);
          }
        }
      } catch (e) {
        // Non-fatal: ignore estimate errors
        console.error('[brand estimate] failed:', e);
      }

      // Seed workspaces and missions for the new brand
      const workspaceSeeds = [
        { wsKey: 'strategy', label: '策略定位', sortOrder: 0 },
        { wsKey: 'website',  label: '官網',     sortOrder: 1 },
        { wsKey: 'facebook', label: 'Facebook', sortOrder: 2 },
      ];
      for (const ws of workspaceSeeds) {
        await db.execute(
          sql`INSERT IGNORE INTO user_workspaces (userId, wsKey, label, sortOrder, brandId)
              VALUES (${ctx.user.id}, ${ws.wsKey}, ${ws.label}, ${ws.sortOrder}, ${brandId})`
        );
      }

      const missionSeeds = [
        { workspace: 'strategy', title: '品牌定位',  squadSlug: 'brand-positioning', welcome: '你好！我是你的品牌定位顧問。\n\n🎯 接下來我們將一起完成 11 步驟品牌策略定位，幫你建立清晰的品牌定位基礎。\n\n準備好了嗎？先告訴我：你的品牌主要解決什麼問題？目標客戶是誰？' },
        { workspace: 'strategy', title: '產品定位',  squadSlug: 'brand-positioning', welcome: '你好！我是你的產品定位顧問。\n\n讓我們一起梳理產品的核心價值主張、目標市場和差異化優勢。\n\n請先告訴我：你的產品是什麼？它解決哪個具體痛點？' },
        { workspace: 'website',  title: 'SEO 優化',  squadSlug: 'tw-website-rebuild', welcome: '你好！我是你的 SEO 策略師。\n\n我們將從關鍵字研究到內容優化，全面提升你的網站搜尋排名。\n\n請先告訴我：你的官網 URL 是什麼？' },
        { workspace: 'website',  title: '首頁文案調整', squadSlug: 'tw-website-rebuild', welcome: '你好！我是你的文案策略師。\n\n好的首頁文案能在 5 秒內抓住訪客注意力。請先貼上你目前的首頁主標題和副標題。' },
        { workspace: 'facebook', title: '品牌貼文',  squadSlug: 'mkt-social-content', welcome: '你好！我是你的社群內容策略師。\n\n請先告訴我：你的品牌受眾是誰？目前 Facebook 粉專的現況如何？' },
        { workspace: 'facebook', title: '廣告文案',  squadSlug: 'tw-facebook-ads', welcome: '你好！我是你的 Facebook 廣告文案師。\n\n讓我們一起打造高轉換的廣告文案。請告訴我：你目前在投什麼廣告目標？' },
      ];
      for (const m of missionSeeds) {
        await db.execute(
          sql`INSERT IGNORE INTO missions (userId, workspace, title, squadSlug, welcomeMessage, isRecurring, status, brandId)
              VALUES (${ctx.user.id}, ${m.workspace}, ${m.title}, ${m.squadSlug}, ${m.welcome}, 0, 'active', ${brandId})`
        );
      }

      // Get first mission id (品牌定位) for redirect
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
   * 取得品牌定位欄資料
   */
  getPositioning: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rows] = await db.execute(
        sql`SELECT tagline, valueProposition, targetMarket, audienceA, audienceB,
               emotionalDiff, functionalDiff, isEstimate, positioningStatus, name, description, industry
          FROM brands WHERE id=${input.brandId}
          LIMIT 1`
      ) as any;
      const row = rows?.[0] ?? null;
      if (row && typeof row.valueProposition === 'string') {
        try { row.valueProposition = JSON.parse(row.valueProposition); } catch {}
      }
      return row;
    }),

  /**
   * AI 推估品牌定位（GPT-4o-mini）
   */
  generateEstimate: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rows] = await db.execute(
        sql`SELECT name, description, industry, website, tagline FROM brands
          WHERE id=${input.brandId} LIMIT 1`
      ) as any;
      const brand = rows?.[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });

      if (brand.tagline) return { skipped: true };

      const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
      const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
      const deployment = "gpt-4o-mini";
      const prompt = `你是品牌策略專家。根據以下品牌資訊，推估品牌定位，用繁體中文回答，以 JSON 格式輸出。

品牌名稱：${brand.name}
產業：${brand.industry ?? "未知"}
品牌簡介：${brand.description ?? "無"}
官網：${brand.website ?? "無"}

請輸出以下 JSON（每個欄位限制字數如括號所示）：
{
  "tagline": "品牌標語，20字內，有力量感",
  "valueProposition": "核心價值主張，50字內，說明如何幫助客戶",
  "targetMarket": "目標市場，10字內，如：台灣中小企業",
  "audienceA": "主要目標客群，15字內，如：25-40歲品牌創辦人",
  "audienceB": "次要目標客群，15字內，如：中小企業行銷主管",
  "emotionalDiff": "情感差異化要素，20字內，感受層面的差異",
  "functionalDiff": "功能差異化要素，20字內，功能層面的差異"
}`;

      const res = await fetch(
        `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`,
        {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
            response_format: { type: "json_object" },
          }),
        }
      );
      const data = await res.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GPT 回應為空" });

      let parsed: any;
      try { parsed = JSON.parse(content); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GPT JSON 解析失敗" }); }

      await db.execute(
        sql`UPDATE brands SET
          tagline=${parsed.tagline ?? null},
          valueProposition=${JSON.stringify(parsed.valueProposition ?? '')},
          targetMarket=${parsed.targetMarket ?? null},
          audienceA=${parsed.audienceA ?? null},
          audienceB=${parsed.audienceB ?? null},
          emotionalDiff=${parsed.emotionalDiff ?? null},
          functionalDiff=${parsed.functionalDiff ?? null},
          isEstimate=1
        WHERE id=${input.brandId}`
      );
      return { success: true, data: parsed };
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