/**
 * opsRouter — internal ops + Sentry-lite error tracking.
 *
 * 2026-05-10 (CJ「明天串金流，今天都做」prep): minimal in-house error
 * collection so we can debug production issues without paying Sentry $26/mo
 * during early days. Replace with proper Sentry once we have ARR > $1k/mo.
 *
 * 2026-05-11 (CJ「補 Sentry-style error tracking」extensions):
 *   - server-side errors now auto-captured by tRPC errorLoggerMiddleware
 *     (see _core/trpc.ts) — no need for hand-rolled try/catch in every
 *     router
 *   - logError() helper accepts route + fingerprint for dashboard grouping
 *   - listForAdmin / errorStats / markResolved gated by adminProcedure
 *   - logError() always writes to console.error so PM2 logs still see it
 *     when DB is the failure mode
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";

export const opsRouter = router({
  /** Frontend uncaught error / API error logger. publicProcedure so unauthed
   *  pages (auth/register etc.) can also report errors. */
  logError: publicProcedure
    .input(z.object({
      level: z.enum(["error", "warn", "info"]).default("error"),
      source: z.string().max(64),
      route: z.string().max(160).optional(),
      message: z.string().max(500),
      stack: z.string().max(4000).optional(),
      fingerprint: z.string().max(64).optional(),
      meta: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await logError({
        source: input.source,
        route: input.route,
        message: input.message,
        stack: input.stack,
        fingerprint: input.fingerprint,
        meta: input.meta,
        userId: ctx?.user?.id,
        level: input.level,
      });
      return { ok: true };
    }),

  /**
   * Admin: list recent errors with optional filters.
   *  - resolved="unresolved" (default) shows only unhandled cases
   *  - source/route filters narrow the view
   */
  listForAdmin: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      resolved: z.enum(["unresolved", "resolved", "all"]).default("unresolved"),
      source: z.string().optional(),
      route: z.string().optional(),
      level: z.enum(["error", "warn", "info"]).optional(),
    }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../localDb");
      const where: string[] = [];
      const params: any[] = [];
      if (input.resolved === "unresolved") where.push("resolvedAt IS NULL");
      else if (input.resolved === "resolved") where.push("resolvedAt IS NOT NULL");
      if (input.source) { where.push("source = ?"); params.push(input.source); }
      if (input.route)  { where.push("route = ?");  params.push(input.route); }
      if (input.level)  { where.push("level = ?");  params.push(input.level); }
      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const safeLimit1 = Math.max(1, Math.min(500, Number(input.limit) || 100));
      const [rows]: any = await localPool.execute(
        `SELECT id, level, source, route, userId, message,
                LEFT(stack, 2000) AS stack, meta, fingerprint,
                createdAt, resolvedAt, resolvedBy
         FROM error_log ${whereSql}
         ORDER BY id DESC LIMIT ${safeLimit1}`,
        params,
      );
      return (rows as any[]).map((r) => ({
        ...r,
        meta: r.meta ? (typeof r.meta === "string" ? safeParseJson(r.meta) : r.meta) : null,
      }));
    }),

  /** Admin: rolled-up stats — top N fingerprints by frequency in last 24h / 7d. */
  errorStats: adminProcedure
    .input(z.object({ window: z.enum(["24h", "7d"]).default("24h") }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../localDb");
      const hours = input.window === "24h" ? 24 : 7 * 24;
      const [groupRows]: any = await localPool.execute(
        `SELECT fingerprint, source, route,
                COUNT(*) AS count,
                MAX(createdAt) AS lastSeen,
                MAX(id) AS latestId,
                ANY_VALUE(LEFT(message, 200)) AS sampleMessage
         FROM error_log
         WHERE createdAt > NOW() - INTERVAL ? HOUR
           AND resolvedAt IS NULL
           AND fingerprint IS NOT NULL
         GROUP BY fingerprint, source, route
         ORDER BY count DESC
         LIMIT 50`,
        [hours],
      );
      const [totalRow]: any = await localPool.execute(
        `SELECT
           SUM(CASE WHEN resolvedAt IS NULL THEN 1 ELSE 0 END) AS unresolved,
           SUM(CASE WHEN resolvedAt IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
           COUNT(*) AS total
         FROM error_log
         WHERE createdAt > NOW() - INTERVAL ? HOUR`,
        [hours],
      );
      const totals = (totalRow as any[])[0] ?? { unresolved: 0, resolved: 0, total: 0 };
      return {
        window: input.window,
        groups: groupRows as any[],
        totals: {
          unresolved: Number(totals.unresolved ?? 0),
          resolved: Number(totals.resolved ?? 0),
          total: Number(totals.total ?? 0),
        },
      };
    }),

  /** Admin: mark a single error (or all errors sharing a fingerprint) as
   *  resolved — useful for clearing one-off issues you've already fixed. */
  markResolved: adminProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      fingerprint: z.string().max(64).optional(),
    }).refine((d) => d.id || d.fingerprint, { message: "id or fingerprint required" }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      if (input.id) {
        const [r]: any = await localPool.execute(
          `UPDATE error_log SET resolvedAt = NOW(3), resolvedBy = ? WHERE id = ?`,
          [ctx.user.id, input.id],
        );
        return { ok: true, affected: (r as any).affectedRows ?? 0 };
      }
      // zod refine guarantees fingerprint is set when id isn't, but TS
      // doesn't narrow refine() output — explicit fallback satisfies the type.
      const fp = input.fingerprint ?? "";
      const [r]: any = await localPool.execute(
        `UPDATE error_log SET resolvedAt = NOW(3), resolvedBy = ?
         WHERE fingerprint = ? AND resolvedAt IS NULL`,
        [ctx.user.id, fp],
      );
      return { ok: true, affected: (r as any).affectedRows ?? 0 };
    }),

  /** Legacy: kept for back-compat with any caller still pointing at the
   *  old name. Prefer ops.listForAdmin in new code. */
  listRecentErrors: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      source: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { default: localPool } = await import("../localDb");
      const params: any[] = [];
      let where = "";
      if (input.source) { where = "WHERE source = ?"; params.push(input.source); }
      const safeLimit2 = Math.max(1, Math.min(500, Number(input.limit) || 100));
      const [rows]: any = await localPool.execute(
        `SELECT id, level, source, userId, message, LEFT(stack, 500) AS stack_preview, createdAt
         FROM error_log ${where}
         ORDER BY id DESC LIMIT ${safeLimit2}`,
        params,
      );
      return rows;
    }),

  /**
   * 2026-05-15 (P1): inspect LLM circuit breaker state.
   * Returns one row per provider with state (CLOSED/OPEN/HALF_OPEN),
   * recent failure ratio, and how long since OPEN trip.
   */
  llmCircuitState: adminProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const { snapshot } = await import("../_core/llmCircuitBreaker");
      return snapshot();
    }),
  /** 2026-05-15: manual reset, in case a provider recovered and we want
   *  to clear OPEN state without waiting for cooloff. */
  llmCircuitReset: adminProcedure
    .input(z.object({ provider: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { reset } = await import("../_core/llmCircuitBreaker");
      reset(input.provider);
      return { ok: true };
    }),

  /**
   * 2026-05-15 (P1): post-deploy self-test for the recordTaskRun pipeline.
   * Exercises the same code path a real task run does (ensureMission →
   * mission_outputs INSERT → cleanup). If this fails after a deploy, the
   * 'task disappears after run' bug is back. Cleans up its own rows.
   */
  selfTestRecordTaskRun: adminProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const t0 = Date.now();
      try {
        const { recordTaskRun } = await import("../_core/recordTaskRun");
        const stampId = `__selftest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const r = await recordTaskRun({
          userId: ctx.user.id,
          brandId: null,
          workspace: "facebook",
          taskId: stampId,
          taskLabel: "Self-test",
          tier: "30s",
          content: JSON.stringify([{ label: "test", caption: "hello 自我測試 🚀" }]),
          metadata: { selfTest: true },
        });
        // Cleanup — delete the row we just created
        const { default: localPool } = await import("../localDb");
        if (r.outputId) await localPool.execute("DELETE FROM mission_outputs WHERE id = ?", [r.outputId]);
        if (r.missionId) await localPool.execute("DELETE FROM missions WHERE id = ?", [r.missionId]);
        const ok = !!r.outputId && !!r.missionId;
        return {
          ok,
          latencyMs: Date.now() - t0,
          missionId: r.missionId,
          outputId: r.outputId,
          message: ok ? "recordTaskRun pipeline healthy" : "recordTaskRun returned null IDs",
        };
      } catch (e: any) {
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          missionId: null,
          outputId: null,
          message: `EXCEPTION: ${e?.code ?? ""} ${String(e?.message ?? e).slice(0, 200)}`,
        };
      }
    }),
});

function safeParseJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** Server-side helper to log without going through tRPC. Use in
 *  catch blocks of routers / orchestra / cron jobs. The tRPC error
 *  middleware also calls this automatically for any uncaught error. */
export async function logError(args: {
  source: string;
  message: string;
  route?: string;
  userId?: number;
  stack?: string;
  fingerprint?: string;
  meta?: Record<string, any>;
  level?: "error" | "warn" | "info";
}): Promise<void> {
  // Always print to PM2 stdout so logs are visible even if DB write fails.
  const logLine = `[errorLog ${args.level ?? "error"}] ${args.source}${args.route ? ` (${args.route})` : ""}: ${args.message.slice(0, 200)}`;
  if ((args.level ?? "error") === "error") console.error(logLine);
  else console.warn(logLine);

  try {
    const { default: localPool } = await import("../localDb");
    await localPool.execute(
      `INSERT INTO error_log (level, source, route, userId, message, stack, fingerprint, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.level ?? "error",
        args.source.slice(0, 64),
        args.route?.slice(0, 160) ?? null,
        args.userId ?? null,
        args.message.slice(0, 500),
        args.stack?.slice(0, 4000) ?? null,
        args.fingerprint?.slice(0, 64) ?? null,
        args.meta ? JSON.stringify(args.meta) : null,
      ],
    );
  } catch (e) {
    console.error("[logError] DB write failed:", e);
  }
}
