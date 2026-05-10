/**
 * achievementsRouter — list / progress / evaluate user's achievements.
 *
 * 2026-05-10 (CJ「成就系統，引導用戶使用完整個系統」).
 *
 * Endpoints:
 *   list       — full catalog + each one's locked/unlocked status for the user
 *   getProgress — summary stats: unlocked count, total points, route breakdown
 *   evaluate   — force-run evaluator (also called automatically after task events)
 *   getNewlyUnlocked — pop unread unlocks for toast notification
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  ACHIEVEMENTS,
  ROUTE_META,
  TOTAL_ACHIEVEMENTS,
  TOTAL_POINTS,
  evaluateAndRecord,
  type AchievementRoute,
} from "../_core/achievements";

export const achievementsRouter = router({
  /** Full catalog with each item's unlocked status. */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT code, unlockedAt FROM user_achievements WHERE userId = ?`,
        [ctx.user!.id],
      );
      const unlockedMap = new Map<string, Date>();
      for (const r of rows as any[]) {
        unlockedMap.set(r.code, r.unlockedAt instanceof Date ? r.unlockedAt : new Date(r.unlockedAt));
      }
      return ACHIEVEMENTS.map((a) => ({
        ...a,
        unlocked: unlockedMap.has(a.code),
        unlockedAt: unlockedMap.get(a.code)?.toISOString() ?? null,
      }));
    }),

  /** Summary: counts + total points + by-route breakdown. */
  getProgress: protectedProcedure
    .query(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT code FROM user_achievements WHERE userId = ?`,
        [ctx.user!.id],
      );
      const unlockedSet = new Set((rows as any[]).map((r) => r.code));

      let earnedPoints = 0;
      const byRoute: Record<AchievementRoute, { unlocked: number; total: number; }> = {} as any;
      for (const a of ACHIEVEMENTS) {
        if (!byRoute[a.route]) byRoute[a.route] = { unlocked: 0, total: 0 };
        byRoute[a.route].total += 1;
        if (unlockedSet.has(a.code)) {
          earnedPoints += a.points;
          byRoute[a.route].unlocked += 1;
        }
      }

      // "下一步試試" — first 3 still-locked achievements in order of routes
      const suggestions = ACHIEVEMENTS
        .filter((a) => !unlockedSet.has(a.code))
        .sort((a, b) => {
          const routeOrder: AchievementRoute[] = ["onboarding", "explore", "visual", "planning", "integration", "publish", "upgrade"];
          return routeOrder.indexOf(a.route) - routeOrder.indexOf(b.route) || a.order - b.order;
        })
        .slice(0, 3)
        .map((a) => ({ code: a.code, title: a.title, ctaPath: a.ctaPath ?? null, ctaText: a.ctaText ?? null }));

      return {
        unlockedCount: unlockedSet.size,
        totalCount: TOTAL_ACHIEVEMENTS,
        earnedPoints,
        totalPoints: TOTAL_POINTS,
        byRoute,
        routeMeta: ROUTE_META,
        suggestions,
      };
    }),

  /** Run evaluator + record any new unlocks. Returns the freshly unlocked
   *  achievement objects so frontend can toast them. */
  evaluate: protectedProcedure
    .mutation(async ({ ctx }) => {
      const fresh = await evaluateAndRecord(ctx.user!.id);
      return fresh.map((code) => {
        const a = ACHIEVEMENTS.find((x) => x.code === code);
        return a ? { code, title: a.title, description: a.description, points: a.points, icon: a.icon } : null;
      }).filter(Boolean);
    }),

  /** Mark an unlock as "seen" so we don't re-toast it. Optional polish. */
  acknowledge: protectedProcedure
    .input(z.object({ codes: z.array(z.string().max(64)).max(20) }))
    .mutation(async ({ ctx, input }) => {
      // For now we just no-op; a future `seenAt` column would track this.
      // Frontend uses localStorage for unlock-toast dedup.
      return { ok: true, count: input.codes.length };
    }),
});
