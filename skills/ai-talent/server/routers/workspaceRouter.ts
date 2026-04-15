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
    { userId, workspace: "strategy", title: "品牌定位",    isRecurring: false, recurringSchedule: null as string | null, squadSlug: "tw-b2b-saas-gtm" },
    { userId, workspace: "strategy", title: "競品每日情報", isRecurring: true,  recurringSchedule: "daily" as string | null, squadSlug: "mkt-analytics-attribution" },
    { userId, workspace: "website",  title: "官網文案調整", isRecurring: false, recurringSchedule: null as string | null, squadSlug: "tw-website-rebuild" },
    { userId, workspace: "website",  title: "每周長文",    isRecurring: true,  recurringSchedule: "weekly" as string | null, squadSlug: "mkt-seo-growth" },
    { userId, workspace: "facebook", title: "固定品牌貼文", isRecurring: true,  recurringSchedule: "weekly" as string | null, squadSlug: "mkt-content-engine" },
    { userId, workspace: "facebook", title: "廣告投放優化", isRecurring: false, recurringSchedule: null as string | null, squadSlug: "tw-ecom-full-funnel" },
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
