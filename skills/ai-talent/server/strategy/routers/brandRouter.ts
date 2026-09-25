import { getBrandPositioning, getBrandPositioningById } from "../core/positioningBridge";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { executeTenStepAnalysis, getLatestJobForBrand } from "../positioning";
import {
  analyzeBrandPositioning,
  generateCampaignPositioning,
  generateBrandContentCalendar,
  analyzeBrandCompetitors,
} from "../core/brandEngine";
import { getDb } from "../../db";
import { userApiKeys } from "../../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { invokeLLM } from "../../platform/core/llm";
import { assertBrandOwner } from "../../platform/core/brandAuth";
import { isPositioningLocked } from "../core/positioningLock";

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
    const { brands } = await import("../../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(brands).where(eq(brands.userId, ctx.user.id)).orderBy(brands.createdAt);
  }),

  /**
   * 2026-05-11 (CJ「我需要管理我所有的品牌，看每個底下有多少活動和產品」):
   * Returns brands with aggregated counts for the manage dashboard.
   *   productCount  — products owned by user under this brand
   *   eventCount    — events under this brand
   *   missionCount  — missions for this brand
   *   outputCount   — total mission_outputs across this brand's missions
   *   lastActivity  — latest output createdAt (for sorting / display)
   */
  listWithStats: protectedProcedure.query(async ({ ctx }) => {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT
         b.id, b.name, b.logoUrl, b.industry, b.website, b.createdAt,
         COALESCE(p.cnt, 0) AS productCount,
         COALESCE(e.cnt, 0) AS eventCount,
         COALESCE(m.cnt, 0) AS missionCount,
         COALESCE(o.cnt, 0) AS outputCount,
         o.lastActivity
       FROM brands b
       LEFT JOIN (
         SELECT brandId, COUNT(*) AS cnt FROM products WHERE userId = ? GROUP BY brandId
       ) p ON p.brandId = b.id
       LEFT JOIN (
         SELECT brandId, COUNT(*) AS cnt FROM events WHERE userId = ? GROUP BY brandId
       ) e ON e.brandId = b.id
       LEFT JOIN (
         SELECT brandId, COUNT(*) AS cnt FROM missions WHERE userId = ? GROUP BY brandId
       ) m ON m.brandId = b.id
       LEFT JOIN (
         SELECT mi.brandId, COUNT(*) AS cnt, MAX(mo.createdAt) AS lastActivity
         FROM mission_outputs mo
         JOIN missions mi ON mi.id = mo.missionId
         WHERE mi.userId = ?
         GROUP BY mi.brandId
       ) o ON o.brandId = b.id
       WHERE b.userId = ?
       ORDER BY o.lastActivity DESC, b.createdAt DESC`,
      [ctx.user.id, ctx.user.id, ctx.user.id, ctx.user.id, ctx.user.id],
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      name: r.name,
      logoUrl: r.logoUrl,
      industry: r.industry,
      website: r.website,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      productCount: Number(r.productCount ?? 0),
      eventCount: Number(r.eventCount ?? 0),
      missionCount: Number(r.missionCount ?? 0),
      outputCount: Number(r.outputCount ?? 0),
      lastActivity: r.lastActivity instanceof Date ? r.lastActivity.toISOString() : (r.lastActivity ?? null),
    }));
  }),

  /**
   * 2026-05-11: detailed drill-down for one brand — list all its products,
   * events, missions for the manage dashboard's expanded view.
   */
  getDetail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const [brandRows]: any = await localPool.execute(
        `SELECT * FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, ctx.user.id],
      );
      const brand = (brandRows as any[])[0];
      if (!brand) return null;
      const [products]: any = await localPool.execute(
        `SELECT id, name, slug, description, createdAt FROM products
         WHERE brandId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 50`,
        [input.id, ctx.user.id],
      );
      const [events]: any = await localPool.execute(
        `SELECT id, name, slug, productId, startAt, endAt, createdAt FROM events
         WHERE brandId = ? AND userId = ? ORDER BY COALESCE(startAt, createdAt) DESC LIMIT 50`,
        [input.id, ctx.user.id],
      );
      const [missions]: any = await localPool.execute(
        `SELECT id, title, workspace, status, createdAt, updatedAt FROM missions
         WHERE brandId = ? AND userId = ? ORDER BY updatedAt DESC LIMIT 50`,
        [input.id, ctx.user.id],
      );
      return { brand, products, events, missions };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const { brands } = await import("../../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.id), eq(brands.userId, ctx.user.id)))
        .limit(1);
      const b: any = rows[0] ?? null;
      if (!b) return null;
      // 2026-07-19 (CJ「基本資料頁欄位未與定位同步 — 產業／品牌在做什麼／AI
      // 定位摘要在定位完成後仍空白」): the 14-step pipeline writes the
      // canonical positioning JSON but never backfills these flat columns,
      // and the onboarding wizard didn't send industry at all. Derive
      // read-time fallbacks from the positioning JSON (canonical segments +
      // _interim quick pulse) — no migration needed; a manually edited
      // (non-empty) column always wins.
      try {
        let p: any = b.positioning;
        if (typeof p === "string") p = JSON.parse(p);
        p = p ?? {};
        const interim = p._interim ?? {};
        const gc = p.goldenCircle ?? {};
        const diff = p.differentiation ?? {};
        const tl = p.tagline ?? {};
        const fb = (...vals: any[]): string =>
          (vals.find((v) => typeof v === "string" && v.trim()) as string | undefined)?.trim() ?? "";
        if (!b.industry) b.industry = fb(p.industry, interim.industry) || b.industry;
        if (!b.description) b.description = fb(gc.what, interim.positioning, diff.summary) || b.description;
        if (!b.tagline) b.tagline = fb(tl.zhTagline, tl.enTagline, interim.tagline) || b.tagline;
        if (!b.positioningSummary) {
          b.positioningSummary = fb(diff.summary, gc.why, interim.positioningSummary, interim.positioning) || b.positioningSummary;
        }
        // 2026-07-29 (CJ「系統應該要直接抓取品牌定位書的內容，定義目標族群」):
        // targetAudience joins the read-time fallback family — canonical
        // audience segment first, interim pulse second.
        if (!b.targetAudience) {
          b.targetAudience = fb(p.audience?.primary, interim.audience, interim.targetAudience) || b.targetAudience;
        }
      } catch { /* display fallback only — never block the read */ }
      return b;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      website: z.string().optional(),
      // 2026-07-19 (CJ 基本資料同步): the onboarding wizard collects 產業
      // but had nowhere to send it — brands.industry stayed NULL forever.
      industry: z.string().max(64).optional().nullable(),
      targetAudience: z.string().optional(),
      competitors: z.string().optional(),
      targetMarket: z.string().optional(),
      contentLanguage: z.string().optional(),
      // 2026-05-21 global localisation
      targetCountry: z.string().length(2).optional().nullable(),
      outputLanguage: z.string().max(10).optional().nullable(),
      marketContextOverride: z.string().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");

      // 2026-05-14 (CJ Solo pricing pivot): enforce brand-count quota.
      // Solo = 1 brand, Studio = 3 brands, Trial = 1 brand, Agency / enterprise = unlimited.
      // Refusing at create-time is the right boundary (not delete-time)
      // so the user gets a clear upgrade CTA instead of accidentally
      // creating a brand they can't use.
      //
      // 2026-05-21 (CJ): admin users and users with hasUnlimitedCredits=1 bypass the cap entirely.
      try {
        const { default: localPool } = await import("../../localDb");
        const [pRows]: any = await localPool.execute(
          `SELECT planCode, hasUnlimitedCredits, role, email FROM users WHERE id = ? LIMIT 1`,
          [ctx.user.id],
        );
        const row = (pRows as any[])[0];
        // Admins and unlimited-credit users have no brand cap.
        // Use Number() cast because mysql2 may return TINYINT(1) as boolean true
        // rather than the integer 1, making strict === 1 fail.
        // 2026-07-07 (CJ「sowork.tw 網域底下都可以使用很多品牌」): internal team
        // accounts (@sowork.tw / @sowork.ai) are uncapped by policy — same
        // domain whitelist used by adminProcedure (_core/trpc.ts) + support.
        // This means a new colleague isn't blocked at 1 brand before someone
        // manually grants them enterprise.
        const isSoworkTeam = typeof row?.email === "string" && /@sowork\.(tw|ai)$/i.test(row.email);
        const isUnlimited = Number(row?.hasUnlimitedCredits) === 1 || row?.role === "admin" || isSoworkTeam;
        if (!isUnlimited) {
          const planCode = row?.planCode ?? "trial";
          const { getPlan } = await import("../../platform/core/plans");
          const plan = getPlan(planCode);
          const cap = plan.quota.brands;
          if (typeof cap === "number" && cap > 0) {
            const [cRows]: any = await localPool.execute(
              `SELECT COUNT(*) AS n FROM brands WHERE userId = ?`,
              [ctx.user.id],
            );
            const used = Number((cRows as any[])[0]?.n ?? 0);
            if (used >= cap) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: cap === 1
                  ? `您的方案（${plan.name}）只支援 1 個品牌。需要管理多個品牌屬於企業客製版，請聯繫業務洽詢。`
                  : `您的方案（${plan.name}）最多 ${cap} 個品牌。需要更多品牌屬於企業客製版，請聯繫業務洽詢。`,
              });
            }
          }
        }
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.warn("[brand.create] quota check failed (non-fatal):", (e as Error)?.message);
      }

      // Auto-generate a unique slug from the brand name. 2026-07-19 (CJ
      // 「slug 直接用中文字元」): ASCII-only — CJK names fall back to the
      // "brand" prefix; the random suffix carries uniqueness.
      const slugBase = input.name.toLowerCase().trim()
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "brand";
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;
      const result = await (db.insert(brands) as any).values({
        userId: ctx.user.id,
        createdBy: ctx.user.id,
        slug,
        name: input.name,
        website: input.website ?? null,
        industry: input.industry?.trim() || null,
        targetAudience: input.targetAudience ?? null,
        soworkAnalysis: {
          competitors: input.competitors ?? null,
          // 2026-07-18 多市場 (P2): derive from the wizard's country pick
          // instead of hardcoding Taiwan/zh-TW for every new brand.
          targetMarket: input.targetMarket
            ?? (input.targetCountry && input.targetCountry.toUpperCase() !== 'TW'
                  ? input.targetCountry.toUpperCase() : 'Taiwan'),
          contentLanguage: input.contentLanguage ?? input.outputLanguage ?? 'zh-TW',
        },
        // 2026-05-21 global localisation
        targetCountry: input.targetCountry ?? null,
        outputLanguage: input.outputLanguage ?? null,
        marketContextOverride: input.marketContextOverride ?? null,
        dataSource: 'manual',
        isDefault: false,
      });
      const brandId = (result as any)[0]?.insertId ?? (result as any).insertId;

      // Auto-add creator to brand_members as owner — without this, the
      // listByMember query (used by CreateScopeModal etc.) filters this
      // brand out and the user can't see their own brand in pickers.
      // CJ caught the bug 2026-04-30: Pokemon GO event create modal had
      // empty brand picker because every brand created via this endpoint
      // had no corresponding brand_members row.
      try {
        await db.execute(
          sql`INSERT INTO brand_members (brandId, userId, role, addedBy)
              VALUES (${brandId}, ${ctx.user.id}, 'owner', ${ctx.user.id})`
        );
      } catch (err) {
        console.error('[brand.create] brand_members seed failed:', err);
      }

      // NOTE: onboarding mission seeds removed 2026-06-05 — they created 6
      // empty "shell" missions on every new brand that cluttered /projects
      // with cards showing nothing when clicked. Users start with a clean
      // workspace and create missions by actually running tasks.

      // 2026-09-24（CJ「刪除AI掃描官網的功能」）：建立品牌時原本會自動排入
      // 「爬官網找產品」的工作，整個功能已移除。產品一律由使用者自己新增。

      return { id: brandId, name: input.name };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      await db.delete(brands).where(and(eq(brands.id, input.id), eq(brands.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * 2026-07-28 (CJ「視覺頁沒有全自動填寫按鈕」): the 視覺 tab's asset
   * cards (BrandAssetEditor) were manual-only by design — no LLM auto-fill
   * existed at all, unlike 定位's per-segment pipeline. This adds AI-
   * suggested drafts for the fields that are genuinely text/style
   * guidance (not real assets the AI can't originate — logo/photos/
   * templates stay manual). Only fills keys that are currently EMPTY —
   * never overwrites a real value the user (or a prior run) already put
   * in. Every generated value is tagged `aiSuggested: true` so the UI can
   * flag it as a draft pending confirmation, not a finalized asset.
   */
  autoFillVisualAssets: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
        [input.brandId],
      );
      let positioning: any = rows[0]?.positioning ?? {};
      if (typeof positioning === "string") {
        try { positioning = JSON.parse(positioning || "{}"); } catch { positioning = {}; }
      }
      const assets: Record<string, any> = positioning._assets ?? {};

      const FILLABLE = ["guidelines", "imagery_style", "icon_style", "chart_style", "layout_rules", "fonts", "colors"] as const;
      const isEmpty = (v: any) => {
        if (!v || typeof v !== "object") return true;
        if (typeof v.text === "string" && v.text.trim()) return false;
        if (Array.isArray(v.list) && v.list.length > 0) return false;
        if (typeof v.zhPrimary === "string" && v.zhPrimary.trim()) return false;
        return true;
      };
      const toFill = FILLABLE.filter((k) => isEmpty(assets[k]));
      if (toFill.length === 0) {
        return { ok: true as const, filled: [] as string[], skipped: FILLABLE as unknown as string[] };
      }

      const voice = positioning.voice ?? {};
      const values = positioning.values ?? {};
      const goldenCircle = positioning.goldenCircle ?? {};
      const briefCtx = [
        goldenCircle.why ? `WHY: ${goldenCircle.why}` : "",
        Array.isArray(values.items) ? `核心價值觀: ${values.items.map((v: any) => v?.label).filter(Boolean).join("、")}` : "",
        Array.isArray(voice.archetypes) ? `人格原型: ${voice.archetypes.join("、")}` : "",
        Array.isArray(voice.tone) ? `語調關鍵詞: ${voice.tone.join("、")}` : "",
      ].filter(Boolean).join("\n");

      const FIELD_SHAPES: Record<string, string> = {
        guidelines:    `"guidelines":{"text":"視覺使用規範建議（100-200字）"}`,
        imagery_style: `"imagery_style":{"text":"攝影調性/構圖/色溫建議（80-150字）"}`,
        icon_style:    `"icon_style":{"text":"圖示風格建議（Line/Solid/Duotone，50-100字）"}`,
        chart_style:   `"chart_style":{"text":"資料視覺化配色與樣式建議（50-100字）"}`,
        layout_rules:  `"layout_rules":{"text":"留白/對齊/標題層級建議（80-150字）"}`,
        fonts:         `"fonts":{"zhPrimary":"中文字型建議","enPrimary":"英文字型建議","serifDisplay":"標題襯線字建議（可選，無則空字串）","mono":"","guidelines":"字型使用建議（50-100字）"}`,
        colors:        `"colors":{"list":[{"name":"色票名稱","hex":"#XXXXXX","role":"primary/secondary/accent 等"}]}（至少 3 筆）`,
      };
      const shapeLines = toFill.map((k) => FIELD_SHAPES[k]).join(",\n");

      const r = await invokeLLM({
        provider: "anthropic",
        messages: [
          {
            role: "system",
            content: "你是品牌視覺顧問，根據品牌定位提出視覺風格建議草案，作為給品牌方參考的「AI 建議起點」，不是正式定案。只輸出純 JSON，不要其他文字或 markdown 圍欄。",
          },
          {
            role: "user",
            content: `品牌定位摘要：\n${briefCtx || "（尚無足夠定位資料，請依一般兒童/消費品牌慣例給合理建議）"}\n\n` +
              `請只針對以下欄位提出建議，鍵名與格式固定如下（只回傳這幾個鍵，不要多也不要少）：\n{\n${shapeLines}\n}`,
          },
        ],
        maxTokens: 1200,
      });
      const content = r.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : "";
      let generated: any = {};
      try {
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        generated = JSON.parse((m ? m[1]! : text).trim());
      } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { generated = JSON.parse(text.slice(start, end + 1)); } catch { generated = {}; }
        }
      }

      const nextAssets = { ...assets };
      const filled: string[] = [];
      for (const key of toFill) {
        if (generated[key]) {
          nextAssets[key] = { ...generated[key], aiSuggested: true };
          filled.push(key);
        }
      }
      if (filled.length > 0) {
        const nextPositioning = { ...positioning, _assets: nextAssets };
        await localPool.execute(
          `UPDATE brands SET positioning = ? WHERE id = ?`,
          [JSON.stringify(nextPositioning), input.brandId],
        );
      }
      const skipped = FILLABLE.filter((k) => !filled.includes(k));
      return { ok: true as const, filled, skipped };
    }),

  /**
   * Update brand's external connections — website + per-platform URLs.
   * Called from the 連結 tile on Brand workspace.
   *
   * CJ direction (2026-05-07):
   *   "我不知道我要去哪裡輸入官網和各種社群平台的連結，應該也是在
   *    品牌區嗎? 有一個連結器的 tile?"
   *
   * Invalidates the brandRealContent cache so the next 自動填寫 / 測試
   * uses the freshly-saved URLs instead of stale ones.
   */
  updateConnections: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      website: z.string().max(2048).optional().nullable(),
      socialLinks: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      // Verify ownership
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      // 2026-05-15: read-side — null over NOT_FOUND. Frontend null-safe.
      if (!rows[0]) return null;

      const cleanLinks: Record<string, string> = {};
      if (input.socialLinks) {
        for (const [k, v] of Object.entries(input.socialLinks)) {
          if (typeof v === "string" && v.trim()) cleanLinks[k] = v.trim();
        }
      }

      await db.update(brands).set({
        website: input.website?.trim() || null,
        socialLinks: Object.keys(cleanLinks).length > 0 ? cleanLinks : null,
      } as any).where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));

      // Invalidate the real-content cache so AI 自動填寫 / 測試 picks up
      // the new URLs immediately.
      try {
        const { invalidateBrandRealContent } = await import("../core/brandRealContent");
        invalidateBrandRealContent(input.brandId);
      } catch {/* non-fatal */}

      return { ok: true as const };
    }),

  /**
   * 2026-05-14 (CJ「品牌大腦」panel data source).
   * Returns the aggregate "brand brain" state powering the top-right pill
   * dropdown. Three semantic groups matching the locked-vs-curated model:
   *
   *   1. Locked Constitution — positioning lock state + completion count
   *   2. User-Curated References — knowledge / preferred / banned / visual / bindings
   *   3. AI Usage — output counts (term-use instrumentation lands later)
   *
   * Designed to be CHEAP (single round-trip, indexed counts) so the pill
   * dropdown stays snappy. Per-brand cache 60s on client side.
   */
  getBrainSummary: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      // Ownership check + base brand data
      // 2026-05-15 (CJ「完整後端測試」): `fb_page_id` column does not
      // exist on brands — FB binding lives in `socialLinks` JSON. The old
      // SELECT was throwing on every call, which is why the brain panel
      // showed all zeros (whole query crashed before counting).
      const [bRows]: any = await localPool.execute(
        `SELECT id, name, positioning, positioningStatus, logoUrl,
                primaryColor, socialLinks
           FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      const brand = (bRows as any[])[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });
      // Derive FB / IG connection from socialLinks json
      let fbPageId: string | null = null;
      let igUserId: string | null = null;
      try {
        const sl = typeof brand.socialLinks === "string"
          ? JSON.parse(brand.socialLinks || "{}")
          : (brand.socialLinks ?? {});
        fbPageId = sl?.facebook?.pageId ?? sl?.fb?.pageId ?? sl?.facebookPageId ?? null;
        igUserId = sl?.instagram?.userId ?? sl?.ig?.userId ?? sl?.instagramUserId ?? null;
      } catch { /* tolerated */ }
      (brand as any).fbPageId = fbPageId;
      (brand as any).igUserId = igUserId;

      // Positioning completion — count only real segment keys. 2026-05-17:
      // after the single-source refactor, positioning holds 10 segment
      // keys + meta keys (_assets/_aiPrompts/_interim). Exclude any
      // "_"-prefixed meta key, and report against the real segment
      // total (10) so the panel shows N/10 not N/14.
      const BRAND_SEGMENT_TOTAL = 10;
      let completedSections = 0;
      let positioningAssets: any = {};
      try {
        const p = typeof brand.positioning === "string"
          ? JSON.parse(brand.positioning || "{}")
          : (brand.positioning ?? {});
        positioningAssets = p?._assets ?? {};
        completedSections = Object.keys(p).filter(
          (k) => !k.startsWith("_") && p[k] != null &&
            (typeof p[k] !== "object" || Object.keys(p[k]).length > 0),
        ).length;
      } catch { /* non-fatal */ }
      const isLocked = brand.positioningStatus === "completed";

      // Knowledge count
      let knowledgeCount = 0;
      try {
        const [kRows]: any = await localPool.execute(
          `SELECT COUNT(*) AS n FROM brand_knowledge_items WHERE brandId = ?`,
          [input.brandId],
        );
        knowledgeCount = Number((kRows as any[])[0]?.n ?? 0);
      } catch { /* table may not exist on older deploys */ }

      // Preferred / banned terms. 2026-05-17 (CJ「偏好詞/禁用詞沒正確
      //顯示，實際 _assets 有資料」): canonical source is
      // positioning._assets (what BrandAssetEditor reads/writes:
      // preferred_terms.items[] / banned_words.items[]). The old
      // brand_caption_rules table is legacy and usually empty → panel
      // showed 0 despite filled assets. Read _assets first, fall back
      // to the legacy table only when _assets has nothing.
      let preferredCount = 0, bannedCount = 0;
      const arrLen = (x: any) =>
        Array.isArray(x?.items) ? x.items.filter((s: any) => String(s ?? "").trim()).length
        : Array.isArray(x) ? x.filter((s: any) => String(s ?? "").trim()).length : 0;
      preferredCount = arrLen(positioningAssets?.preferred_terms);
      bannedCount = arrLen(positioningAssets?.banned_words);
      if (preferredCount === 0 && bannedCount === 0) {
        try {
          const [rRows]: any = await localPool.execute(
            `SELECT kind, COUNT(*) AS n FROM brand_caption_rules
              WHERE brandId = ? GROUP BY kind`,
            [input.brandId],
          );
          for (const r of (rRows as any[])) {
            if (r.kind === "preferred" || r.kind === "preferred_term") preferredCount = Number(r.n);
            else if (r.kind === "banned" || r.kind === "banned_word") bannedCount = Number(r.n);
          }
        } catch { /* non-fatal */ }
      }

      // Output counts: total + last 7 days
      let totalOutputs = 0, last7DaysOutputs = 0;
      try {
        const [oRows]: any = await localPool.execute(
          `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN mo.createdAt >= NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last7
            FROM mission_outputs mo
            JOIN missions m ON m.id = mo.missionId
            WHERE m.brandId = ?`,
          [input.brandId],
        );
        const row = (oRows as any[])[0];
        totalOutputs = Number(row?.total ?? 0);
        last7DaysOutputs = Number(row?.last7 ?? 0);
      } catch { /* non-fatal */ }

      return {
        positioning: {
          isLocked,
          completedSections,
          totalSections: BRAND_SEGMENT_TOTAL,
        },
        knowledge: {
          count: knowledgeCount,
        },
        preferences: {
          preferredCount,
          bannedCount,
        },
        visual: {
          hasLogo: !!brand.logoUrl,
          hasColors: !!brand.primaryColor,
        },
        connections: {
          fb: !!brand.fbPageId,
          ig: !!brand.igUserId,
        },
        outputs: {
          totalCount: totalOutputs,
          last7DaysCount: last7DaysOutputs,
        },
      };
    }),

  /** 2026-05-12 (CJ「視覺還在開發，請開發完成」): visual identity getter.
   *  Returns logoUrl + 3 brand colors + font + guidelines. */
  getVisual: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      const rows = await db.select({
        logoUrl:          brands.logoUrl,
        primaryColor:     brands.primaryColor,
        secondaryColor:   brands.secondaryColor,
        accentColor:      brands.accentColor,
        fontFamily:       brands.fontFamily,
        visualGuidelines: brands.visualGuidelines,
      }).from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      // 2026-05-15: read-side — null over NOT_FOUND. Frontend null-safe.
      if (!rows[0]) return null;
      return rows[0];
    }),

  /** Update visual identity columns. logoUrl is updated by a separate
   *  upload route; this mutation handles only the metadata. */
  updateVisual: protectedProcedure
    .input(z.object({
      brandId:          z.number().int().positive(),
      primaryColor:     z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      secondaryColor:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      accentColor:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      fontFamily:       z.string().max(64).optional().nullable(),
      visualGuidelines: z.string().max(4000).optional().nullable(),
      logoUrl:          z.string().max(2048).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      // 2026-05-15: read-side — null over NOT_FOUND. Frontend null-safe.
      if (!rows[0]) return null;
      const patch: Record<string, any> = {};
      if (input.primaryColor     !== undefined) patch.primaryColor     = input.primaryColor;
      if (input.secondaryColor   !== undefined) patch.secondaryColor   = input.secondaryColor;
      if (input.accentColor      !== undefined) patch.accentColor      = input.accentColor;
      if (input.fontFamily       !== undefined) patch.fontFamily       = input.fontFamily?.trim() || null;
      if (input.visualGuidelines !== undefined) patch.visualGuidelines = input.visualGuidelines?.trim() || null;
      if (input.logoUrl          !== undefined) patch.logoUrl          = input.logoUrl?.trim() || null;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      await db.update(brands).set(patch as any)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));
      return { ok: true as const };
    }),

  /**
   * 2026-05-18 (CJ「他對 sowork.ai 認識不正確，又沒地方調整基本資料」):
   * edit the brand's basic data + hard-correct the AI-derived positioning
   * summary. Previously there was NO brand.update — the 基本資料 editor was
   * a placeholder, so a mis-read brand could never be corrected.
   */
  update: protectedProcedure
    .input(z.object({
      brandId:               z.number().int().positive(),
      name:                  z.string().min(1).max(255).optional(),
      industry:              z.string().max(64).optional().nullable(),
      description:           z.string().max(4000).optional().nullable(),
      website:               z.string().max(2048).optional().nullable(),
      socialLinks:           z.record(z.string(), z.string()).optional().nullable(),
      tagline:               z.string().max(1000).optional().nullable(),
      targetAudience:        z.string().max(2000).optional().nullable(),
      brandVoice:            z.string().max(2000).optional().nullable(),
      positioningSummary:    z.string().max(8000).optional().nullable(),
      // 2026-05-21 global localisation
      targetCountry:         z.string().length(2).optional().nullable(),
      outputLanguage:        z.string().max(10).optional().nullable(),
      marketContextOverride: z.string().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      if (!rows[0]) return null;
      const patch: Record<string, any> = {};
      if (input.name               !== undefined) patch.name               = input.name.trim();
      if (input.industry           !== undefined) patch.industry           = input.industry?.trim() || null;
      if (input.description        !== undefined) patch.description        = input.description?.trim() || null;
      if (input.website            !== undefined) patch.website            = input.website?.trim() || null;
      if (input.socialLinks        !== undefined) patch.socialLinks        = input.socialLinks ?? null;
      if (input.tagline            !== undefined) patch.tagline            = input.tagline?.trim() || null;
      // 2026-07-19 (CJ「基本資料頁 vs 定位頁 標語不一致」): a manual tagline
      // edit must also land in the CANONICAL positioning JSON
      // (tagline.zhTagline) — otherwise 定位頁 keeps showing the old
      // pipeline value and the next finalize would clobber the edit.
      if (input.tagline !== undefined && input.tagline?.trim()) {
        try {
          const { default: localPool } = await import("../../localDb");
          const [pRows]: any = await localPool.execute(
            `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
            [input.brandId, ctx.user.id],
          );
          let pos: any = (pRows as any[])[0]?.positioning ?? null;
          if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
          if (pos && typeof pos === "object") {
            pos.tagline = { ...(pos.tagline ?? {}), zhTagline: input.tagline.trim() };
            await localPool.execute(
              `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
              [JSON.stringify(pos), input.brandId, ctx.user.id],
            );
          }
        } catch (e) {
          console.warn("[brand.update] canonical tagline sync failed (non-fatal):", (e as Error)?.message);
        }
      }
      if (input.targetAudience     !== undefined) patch.targetAudience     = input.targetAudience?.trim() || null;
      if (input.brandVoice         !== undefined) patch.brandVoice         = input.brandVoice?.trim() || null;
      if (input.positioningSummary !== undefined) patch.positioningSummary = input.positioningSummary?.trim() || null;
      // 2026-05-21 global localisation
      if (input.targetCountry         !== undefined) patch.targetCountry         = input.targetCountry ?? null;
      if (input.outputLanguage        !== undefined) patch.outputLanguage        = input.outputLanguage ?? null;
      if (input.marketContextOverride !== undefined) patch.marketContextOverride = input.marketContextOverride ?? null;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      await db.update(brands).set(patch as any)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));
      return { ok: true as const };
    }),

  /**
   * 2026-05-18 (CJ「讀取錯誤時還是無法重新校對」): re-run the positioning
   * analysis from the (now corrected) website / fanpage — works even when
   * positioning is "completed" (the OLD positioningStatus lock), by
   * resetting status first.
   *
   * 2026-08-21 (CJ「剛剛所訂好的競爭對手和主打優勢，突然之間就跑掉了」):
   * that positioningStatus reset must NOT also bypass the user-facing 定位
   * tab lock (tabLocks.positioning, set via 鎖定定位) — that lock means
   * "this is final, don't touch it", which recalibrate previously ignored
   * entirely. A locked brand now refuses recalibrate until unlocked.
   */
  recalibrate: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      const brand = rows[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      if (await isPositioningLocked("brand", input.brandId, ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "定位已鎖定，請先解鎖再重新校對" });
      }
      // unlock so the pipeline can overwrite the (wrong) understanding
      await db.update(brands).set({ positioningStatus: "in_progress" } as any)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));
      const { startPositioningJob } = await import("../core/positioningJobRunner");
      const { buildBrandPositioningSteps } = await import("../core/positioningSteps");
      startPositioningJob({
        userId: ctx.user.id,
        entityKind: "brand",
        entityId: input.brandId,
        brandName: (brand as any).name,
        industry: (brand as any).industry ?? undefined,
        description: (brand as any).description ?? undefined,
        // 2026-07-17 多市場: 用品牌自己的 outputLanguage（was 硬寫 zh-TW）。
        steps: buildBrandPositioningSteps({ lang: "zh-TW", outputLanguage: (brand as any).outputLanguage ?? undefined }),
      });
      return { ok: true as const };
    }),

  /** Read connections (website + socialLinks) for the connector tile UI. */
  getConnections: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const { brands } = await import("../../../drizzle/schema");
      const rows = await db.select().from(brands)
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      let links: any = (r as any).socialLinks ?? {};
      if (typeof links === "string") { try { links = JSON.parse(links); } catch { links = {}; } }
      return {
        website: (r as any).website ?? "",
        socialLinks: (links && typeof links === "object" ? links : {}) as Record<string, string>,
      };
    }),

  /**
   * Fetch a brand's Facebook page profile picture and save it as the brand
   * logo. Uses Facebook's public Graph picture endpoint — no token needed
   * for public pages: graph.facebook.com/{handle}/picture?width=400&redirect=true
   *
   * Input accepts either a bare handle ("桂冠營養研究室") or a full URL
   * ("https://www.facebook.com/桂冠營養研究室"). We extract the handle.
   *
   * 2026-05-05 — see project_design_system memory for FB avatar Layer 1 plan.
   */
  fetchFacebookAvatar: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      handleOrUrl: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");

      // Authorize — must be a brand the user owns or is a member of
      try {
        await assertBrandOwner(input.brandId, ctx.user.id);
      } catch {
        throw new TRPCError({ code: "FORBIDDEN", message: "你沒有這個品牌的編輯權限" });
      }

      // Extract handle from URL if a URL was given
      let handle = input.handleOrUrl.trim();
      const m = handle.match(/facebook\.com\/(?:pg\/|pages\/[^/]+\/)?([^/?#]+)/i);
      if (m && m[1]) handle = m[1];
      handle = decodeURIComponent(handle).replace(/^@/, "");
      if (!handle) throw new TRPCError({ code: "BAD_REQUEST", message: "無法從輸入抽出 FB 粉專 handle" });

      // Hit Graph picture endpoint — public pages return 302 to CDN
      const graphUrl = `https://graph.facebook.com/${encodeURIComponent(handle)}/picture?width=400&redirect=true`;
      let imageUrl: string;
      try {
        const r = await fetch(graphUrl, { redirect: "follow" });
        if (!r.ok) {
          throw new Error(`graph ${r.status}`);
        }
        // r.url is the final URL after redirects (the CDN image URL)
        imageUrl = r.url;
        if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
          throw new Error("graph returned no usable image url");
        }

        // Download + persist
        const { mkdirSync, writeFileSync } = await import("fs");
        const { join } = await import("path");
        // 2026-05-28: updated default to match infra rename /opt/marketing-os → /opt/onbrand
        const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
        const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
        mkdirSync(COVERS_DIR, { recursive: true });
        const fileId = `brand-${input.brandId}-fb-${Date.now()}.jpg`;
        const filePath = join(COVERS_DIR, fileId);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 200) {
          throw new Error("downloaded image suspiciously small (likely a 404 placeholder)");
        }
        writeFileSync(filePath, buf);
        const localUrl = `${COVERS_URL_PREFIX}/${fileId}`;

        // Update brand.logoUrl
        await db.update(brands).set({ logoUrl: localUrl })
          .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));

        return {
          ok: true,
          handle,
          logoUrl: localUrl,
          remoteUrl: imageUrl,
          bytes: buf.length,
        };
      } catch (e: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `FB 粉專頭像抓取失敗：${e?.message ?? String(e)}（檢查 handle 拼字、粉專是否公開）`,
        });
      }
    }),

  /**
   * 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」)：logo 也可以手動上傳，
   * 不必只靠 FB 粉專抓。實際位元組走 /api/asset-photo/upload（跟品牌照片庫
   * 同一支），這裡只是把上傳完拿到的 URL 指定成 logoUrl —— 跟
   * fetchFacebookAvatar 寫 logoUrl 的最後一步同一套。
   */
  setLogo: protectedProcedure
    .input(z.object({ brandId: z.number(), logoUrl: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { brands } = await import("../../../drizzle/schema");
      try {
        await assertBrandOwner(input.brandId, ctx.user.id);
      } catch {
        throw new TRPCError({ code: "FORBIDDEN", message: "你沒有這個品牌的編輯權限" });
      }
      if (!input.logoUrl.startsWith("/static/asset-photos/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "logoUrl 必須是剛上傳的照片網址" });
      }
      await db.update(brands).set({ logoUrl: input.logoUrl })
        .where(and(eq(brands.id, input.brandId), eq(brands.userId, ctx.user.id)));
      return { ok: true, logoUrl: input.logoUrl };
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
        const { brands } = await import("../../../drizzle/schema");
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
          { id: 29, name: "Lyra Voss", title: "公關策略師", specialty: "品牌定位、PR策略", layer: "strategy", taskType: "research" },
          { id: 26, name: "Nova Kim", title: "META廣告策略師", specialty: "品牌廣告、受眾策略", layer: "strategy", taskType: "strategy" },
          { id: 32, name: "Sage Ellis", title: "文案撰寫師", specialty: "廣告文案、品牌語調", layer: "execution", taskType: "copywriting" },
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
        const { brands } = await import("../../../drizzle/schema");
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
      try {
        const db = await getDb();
        if (!db) {
          console.error('[brand.listByMember] Database connection failed');
          return [];
        }

        console.log('[brand.listByMember] Fetching brands for userId:', ctx.user.id);

        const [rows] = await db.execute(
          sql`SELECT b.*, bm.role
            FROM brands b
            INNER JOIN brand_members bm ON bm.brandId = b.id
            WHERE bm.userId = ${ctx.user.id}
            ORDER BY b.createdAt DESC`
        ) as any;

        console.log('[brand.listByMember] Found', rows?.length ?? 0, 'brands for user', ctx.user.id);

        return rows ?? [];
      } catch (error) {
        console.error('[brand.listByMember] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch brands',
        });
      }
    }),

  /**
   * 取得單一品牌（含定位步驟進度），需為成員
   */
  getByMember: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) {
          console.error('[brand.getByMember] Database connection failed for brandId:', input.brandId);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        }

        console.log('[brand.getByMember] Fetching brand', input.brandId, 'for userId:', ctx.user.id);

        const [membership] = await db.execute(
          sql`SELECT role FROM brand_members WHERE brandId = ${input.brandId} AND userId = ${ctx.user.id} LIMIT 1`
        ) as any;

        if (!membership?.[0]) {
          console.warn('[brand.getByMember] User', ctx.user.id, 'is not a member of brand', input.brandId);
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this brand" });
        }

        const [brandRows] = await db.execute(
          sql`SELECT * FROM brands WHERE id = ${input.brandId} LIMIT 1`
        ) as any;

        const brand = brandRows?.[0];
        if (!brand) {
          console.warn('[brand.getByMember] Brand', input.brandId, 'not found');
          throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
        }

        const [stepRows] = await db.execute(
          sql`SELECT * FROM brand_positioning_steps WHERE brandId = ${input.brandId} ORDER BY step ASC`
        ) as any;

        console.log('[brand.getByMember] Successfully fetched brand', input.brandId);
        return { ...brand, role: membership[0].role, positioningSteps: stepRows ?? [] };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[brand.getByMember] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch brand',
        });
      }
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
      // 2026-05-15 (CJ「完整後端測試」): SEC — was missing userId clause,
      // any logged-in user could read any brand's positioning. Tighten.
      const [rows] = await db.execute(
        sql`SELECT tagline, valueProposition, targetMarket, audienceA, audienceB,
               emotionalDiff, functionalDiff, isEstimate, positioningStatus, name, description, industry
          FROM brands WHERE id=${input.brandId} AND userId=${ctx.user.id}
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
          WHERE id=${input.brandId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      const brand = rows?.[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND" });

      if (brand.tagline) return { skipped: true };

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

      const llmResult = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 500,
      });
      const content = String(llmResult.choices[0]?.message?.content ?? "");
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM 回應為空" });

      let parsed: any;
      try {
        const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM JSON 解析失敗" }); }

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
        WHERE id=${input.brandId} AND userId=${ctx.user.id}`
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