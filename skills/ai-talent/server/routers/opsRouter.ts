/**
 * opsRouter — internal ops + Sentry-lite error tracking.
 *
 * 2026-05-10 (CJ「明天串金流，今天都做」prep): minimal in-house error
 * collection so we can debug production issues without paying Sentry $26/mo
 * during early days. Replace with proper Sentry once we have ARR > $1k/mo.
 *
 * frontend posts to ops.logError when it catches uncaught errors;
 * server-side code can also use logError() helper directly.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";

export const opsRouter = router({
  /** Frontend uncaught error / API error logger. publicProcedure so unauthed
   *  pages (auth/register etc.) can also report errors. */
  logError: publicProcedure
    .input(z.object({
      level: z.enum(["error", "warn", "info"]).default("error"),
      source: z.string().max(64),
      message: z.string().max(500),
      stack: z.string().max(4000).optional(),
      meta: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { default: localPool } = await import("../localDb");
        await localPool.execute(
          `INSERT INTO error_log (level, source, userId, message, stack, meta)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            input.level,
            input.source,
            ctx?.user?.id ?? null,
            input.message,
            input.stack ?? null,
            input.meta ? JSON.stringify(input.meta) : null,
          ],
        );
      } catch (e) {
        // Never throw on error logging — would create cascading failures
        console.error("[opsRouter.logError] insert failed:", e);
      }
      return { ok: true };
    }),

  /** Admin-only: read recent errors for debugging */
  listRecentErrors: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      source: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // TODO: gate by admin role
      const { default: localPool } = await import("../localDb");
      const params: any[] = [];
      let where = "";
      if (input.source) { where = "WHERE source = ?"; params.push(input.source); }
      params.push(input.limit);
      const [rows]: any = await localPool.execute(
        `SELECT id, level, source, userId, message, LEFT(stack, 500) AS stack_preview, createdAt
         FROM error_log ${where}
         ORDER BY id DESC LIMIT ?`,
        params,
      );
      return rows;
    }),
});

/** Server-side helper to log without going through tRPC. Use in
 *  catch blocks of routers / orchestra / cron jobs. */
export async function logError(args: {
  source: string;
  message: string;
  userId?: number;
  stack?: string;
  meta?: Record<string, any>;
  level?: "error" | "warn" | "info";
}): Promise<void> {
  try {
    const { default: localPool } = await import("../localDb");
    await localPool.execute(
      `INSERT INTO error_log (level, source, userId, message, stack, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        args.level ?? "error",
        args.source.slice(0, 64),
        args.userId ?? null,
        args.message.slice(0, 500),
        args.stack?.slice(0, 4000) ?? null,
        args.meta ? JSON.stringify(args.meta) : null,
      ],
    );
  } catch (e) {
    console.error("[logError] failed:", e);
  }
}
