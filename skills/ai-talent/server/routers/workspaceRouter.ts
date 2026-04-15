/**
 * workspaceRouter.ts — 用戶自訂工作區 CRUD
 *
 * workspace.list   → 列出當前用戶的所有工作區，若無則自動 seed 預設工作區（含 onboarding 任務）
 * workspace.create → 新增工作區 { label: string }
 * workspace.delete → 刪除工作區 { wsKey: string }
 * workspace.reorder → 調整排序 { items: { wsKey: string; sortOrder: number }[] }
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { userWorkspaces, missions } from "../../drizzle/schema";
import { eq, and, asc, sql } from "drizzle-orm";

// Default workspaces seeded for new users
const DEFAULT_WORKSPACE_SEEDS = [
  { wsKey: "strategy", label: "策略定位",   sortOrder: 0 },
  { wsKey: "website",  label: "官網",       sortOrder: 1 },
  { wsKey: "facebook", label: "Facebook",  sortOrder: 2 },
];

// Onboarding missions: 6 pre-defined missions across 3 workspaces
// 每個工作區：一個一次性任務 + 一個定期任務
function buildOnboardingMissions(userId: number) {
  return [
    // ── 策略定位 workspace ─────────────────────────────────────────────────
    {
      userId,
      workspace: "strategy",
      title: "品牌定位",
      isRecurring: false,
      recurringSchedule: null as string | null,
      squadSlug: "tw-b2b-saas-gtm",
      welcomeMessage: `👋 嗨！我是為你的「品牌定位」任務組建的 AI 團隊 — **B2B SaaS GTM 策略組**。

我們的團隊包含：
• 品牌策略師/PMM（隊長）
• SEO策略師
• Email/CRM策略師
• Google Ads投手
• 數據分析師

這是一次性的品牌定位分析任務。請告訴我你的品牌名稱和主要目標，我們馬上開始！`,
    },
    {
      userId,
      workspace: "strategy",
      title: "競品每日情報",
      isRecurring: true,
      recurringSchedule: "daily" as string | null,
      squadSlug: "mkt-analytics-attribution",
      welcomeMessage: `👋 嗨！我是為你的「競品每日情報」任務組建的 AI 團隊 — **行銷數據歸因組**。

我們的團隊包含：
• GA4數據架構師（隊長）
• Multi-touch歸因分析師
• Google Ads分析師
• Meta廣告分析師

這是每日定期任務，我們會持續追蹤競品動態並提供情報摘要。請告訴我要追蹤哪些競品！`,
    },
    // ── 官網 workspace ─────────────────────────────────────────────────────
    {
      userId,
      workspace: "website",
      title: "官網文案調整",
      isRecurring: false,
      recurringSchedule: null as string | null,
      squadSlug: "tw-website-rebuild",
      welcomeMessage: `👋 嗨！我是為你的「官網文案調整」任務組建的 AI 團隊 — **官網重建技術組**。

我們的團隊包含：
• UX/UI設計師（隊長）
• 前端工程師
• CRO專員
• MarTech工程師

這是一次性的官網文案優化任務。請提供你的官網連結或現有文案，我們幫你分析並優化！`,
    },
    {
      userId,
      workspace: "website",
      title: "每周長文",
      isRecurring: true,
      recurringSchedule: "weekly" as string | null,
      squadSlug: "mkt-seo-growth",
      welcomeMessage: `👋 嗨！我是為你的「每周長文」任務組建的 AI 團隊 — **SEO 自然流量成長組**。

我們的團隊包含：
• SEO策略總監（隊長）
• SEO內容寫手
• GA4數據驗證師
• B2B SEO專家

這是每週定期任務，我們每週為你產出一篇 SEO 優化的長文。請告訴我你的主題方向和目標關鍵字！`,
    },
    // ── Facebook workspace ─────────────────────────────────────────────────
    {
      userId,
      workspace: "facebook",
      title: "固定品牌貼文",
      isRecurring: true,
      recurringSchedule: "weekly" as string | null,
      squadSlug: "mkt-content-engine",
      welcomeMessage: `👋 嗨！我是為你的「固定品牌貼文」任務組建的 AI 團隊 — **內容行銷引擎組**。

我們的團隊包含：
• 內容策略總監（隊長）
• 社群媒體策略師
• SEO內容寫手
• 社群聆聽分析師

這是每週定期任務，我們定期為你產出品牌社群貼文。請告訴我你的品牌風格和目標受眾！`,
    },
    {
      userId,
      workspace: "facebook",
      title: "廣告投放優化",
      isRecurring: false,
      recurringSchedule: null as string | null,
      squadSlug: "tw-ecom-full-funnel",
      welcomeMessage: `👋 嗨！我是為你的「廣告投放優化」任務組建的 AI 團隊 — **全漏斗電商行銷組**。

我們的團隊包含：
• 品牌策略師（隊長）
• Meta廣告投手
• SEO策略師
• Email/CRM策略師
• 數據分析師

這是一次性的廣告投放優化任務。請提供你的廣告帳號數據或目前投放情況，我們幫你分析改善方向！`,
    },
  ];
}

/** Convert a label string to a slug-style wsKey */
function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")   // keep word chars, CJK, hyphens
    .slice(0, 64) || `ws-${Date.now()}`;
}

export const workspaceRouter = router({
  // ── List (with auto-seed) ──────────────────────────────────────────────────
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(userWorkspaces)
        .where(eq(userWorkspaces.userId, ctx.user.id))
        .orderBy(asc(userWorkspaces.sortOrder), asc(userWorkspaces.createdAt));

      return rows;
    }),

  // ── Create ─────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const wsKey = labelToKey(input.label);

      // Get current max sortOrder
      const existing = await db
        .select()
        .from(userWorkspaces)
        .where(eq(userWorkspaces.userId, ctx.user.id));

      const maxSort = existing.reduce(
        (max, w) => Math.max(max, w.sortOrder ?? 0),
        -1
      );

      await db.insert(userWorkspaces).values({
        userId: ctx.user.id,
        wsKey,
        label: input.label.trim(),
        sortOrder: maxSort + 1,
      });

      // Return the newly created row
      const [created] = await db
        .select()
        .from(userWorkspaces)
        .where(
          and(
            eq(userWorkspaces.userId, ctx.user.id),
            eq(userWorkspaces.wsKey, wsKey)
          )
        )
        .limit(1);

      return created;
    }),

  // ── Delete ─────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ wsKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db
        .delete(userWorkspaces)
        .where(
          and(
            eq(userWorkspaces.userId, ctx.user.id),
            eq(userWorkspaces.wsKey, input.wsKey)
          )
        );

      return { success: true };
    }),

  // ── Reorder (optional) ─────────────────────────────────────────────────────
  reorder: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            wsKey: z.string().min(1),
            sortOrder: z.number().int().min(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      for (const item of input.items) {
        await db
          .update(userWorkspaces)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(userWorkspaces.userId, ctx.user.id),
              eq(userWorkspaces.wsKey, item.wsKey)
            )
          );
      }

      return { success: true };
    }),
});
