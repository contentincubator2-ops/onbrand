/**
 * festivalRouter — 節慶日曆 + 自動提醒.
 *
 * 2026-05-11 (CJ「下週是中秋節，要不要先準備 5 篇？」). Proactive nudges
 * keep daily users coming back: a small-editor opens the app and sees
 * "中秋節 18 天後 — 要不要先排 5 篇？" with one-click route into 99s task.
 *
 * Data:
 *   festivals          — seeded TW solar/lunar dates 2026-2027
 *   festival_dismissals — per-user mute (so users who don't celebrate
 *                         e.g. 聖誕 / 萬聖 can quiet it)
 *
 * Endpoints:
 *   upcoming(windowDays, region) — next N festivals within window
 *                                  (excludes user-dismissed)
 *   list(year, month)            — month view for /calendar overlay
 *   dismiss(festivalId)          — mute one
 *   undismiss(festivalId)        — undo
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";

export const festivalRouter = router({
  /**
   * Upcoming festivals within `windowDays` from today. Public so an
   * unauthenticated landing page can show "下週是中秋節" too.
   * For authenticated users, filters out anything they've dismissed.
   */
  upcoming: publicProcedure
    .input(z.object({
      windowDays: z.number().int().min(1).max(180).default(45),
      region: z.string().default("TW"),
      limit: z.number().int().min(1).max(20).default(8),
      minPriority: z.number().int().min(1).max(5).default(3),
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const userId = ctx?.user?.id ?? null;
      const dismissedJoin = userId
        ? "LEFT JOIN festival_dismissals d ON d.festivalId = f.id AND d.userId = ?"
        : "";
      const dismissedFilter = userId ? "AND d.festivalId IS NULL" : "";
      const params: any[] = [];
      if (userId) params.push(userId);
      params.push(input.region, input.minPriority);
      // Inline integers that mysql2 prepared statements refuse to bind into
      // (INTERVAL clause + LIMIT). Both are already validated by zod above.
      const windowDays = Math.floor(input.windowDays);
      const limit = Math.floor(input.limit);
      const [rows]: any = await localPool.execute(
        `SELECT f.id, f.slug, f.date, f.name_zh, f.name_en, f.region,
                f.category, f.priority, f.emoji, f.themes, f.contentHint,
                DATEDIFF(f.date, CURDATE()) AS daysAway
         FROM festivals f
         ${dismissedJoin}
         WHERE f.region = ?
           AND f.date >= CURDATE()
           AND f.date <= DATE_ADD(CURDATE(), INTERVAL ${windowDays} DAY)
           AND f.priority >= ?
           ${dismissedFilter}
         ORDER BY f.date ASC
         LIMIT ${limit}`,
        params,
      );
      return (rows as any[]).map((r) => ({
        ...r,
        themes: parseJsonSafe(r.themes),
        daysAway: Number(r.daysAway),
      }));
    }),

  /** List festivals within a calendar month for the /calendar overlay. */
  monthList: publicProcedure
    .input(z.object({
      year: z.number().int().min(2025).max(2030),
      month: z.number().int().min(1).max(12),
      region: z.string().default("TW"),
    }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../localDb");
      const start = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const [rows]: any = await localPool.execute(
        `SELECT id, slug, date, name_zh, name_en, region, category, priority, emoji, themes, contentHint
         FROM festivals
         WHERE region = ?
           AND date >= ?
           AND date < DATE_ADD(?, INTERVAL 1 MONTH)
         ORDER BY date ASC`,
        [input.region, start, start],
      );
      return (rows as any[]).map((r) => ({ ...r, themes: parseJsonSafe(r.themes) }));
    }),

  /** Dismiss a festival for the calling user (won't appear in upcoming). */
  dismiss: protectedProcedure
    .input(z.object({ festivalId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      await localPool.execute(
        `INSERT IGNORE INTO festival_dismissals (userId, festivalId) VALUES (?, ?)`,
        [ctx.user.id, input.festivalId],
      );
      return { ok: true };
    }),

  undismiss: protectedProcedure
    .input(z.object({ festivalId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      await localPool.execute(
        `DELETE FROM festival_dismissals WHERE userId = ? AND festivalId = ?`,
        [ctx.user.id, input.festivalId],
      );
      return { ok: true };
    }),
});

function parseJsonSafe(s: any): any {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return null; }
}
