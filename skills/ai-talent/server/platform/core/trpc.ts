/**
 * tRPC setup — router and procedure factories.
 * Sprint 3: Real JWT authentication via getJwtSecret()
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { Request } from "express";
import * as jose from "jose"; // lightweight JWT library

export interface TRPCContext {
  user: { id: number; email?: string } | null;
}

export async function createContext({ req }: { req: Request }): Promise<TRPCContext> {
  let token: string | null = null;
  let tokenSource: string = "";

  // 1. Try Authorization header first (for legacy JWT token support)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
    tokenSource = "Authorization header";
  }
  // 2. Try Cookie session (for email login)
  else if ((req as any).cookies?.session) {
    token = (req as any).cookies.session;
    tokenSource = "Cookie session";
  }

  // 3. Dev fallback: allow x-user-id header ONLY when ALLOW_DEV_AUTH=true AND not production
  if (!token) {
    const devAuthAllowed =
      process.env.ALLOW_DEV_AUTH === "true" &&
      process.env.NODE_ENV !== "production";
    if (devAuthAllowed) {
      const devUserId = parseInt((req.headers["x-user-id"] as string) ?? "0");
      if (devUserId > 0) {
        console.log('[auth] Using dev auth for userId:', devUserId);
        return { user: { id: devUserId } };
      }
    }
    return { user: null };
  }

  try {
    const { getJwtSecret } = await import("./env");
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jose.jwtVerify(token, secret);

    // 2026-05-29 (GDPR data minimisation): removed per-request userId log.
    // userId in every request log = extensive personal data processing.
    // JWT verification failures are still logged (below) for security monitoring.

    return {
      user: {
        id: Number(payload.sub ?? (payload as any).userId ?? 0),
        email: typeof payload.email === "string" ? payload.email : undefined,
      },
    };
  } catch (err) {
    // P1-7: Structured logging for JWT verification failures (no token content)
    console.warn("[auth] Token verification failed:", {
      tokenSource,
      ip: req.ip,
      path: req.path,
      reason: err instanceof Error ? err.message : "unknown",
      ts: new Date().toISOString(),
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;

/**
 * 2026-05-11 — Sentry-lite error capture middleware.
 *
 * Wraps EVERY procedure call so any uncaught error is recorded to the
 * error_log table with full context (procedure path, type, userId,
 * stack trace, error code). Expected-by-design errors (UNAUTHORIZED,
 * BAD_REQUEST, NOT_FOUND, FORBIDDEN, PRECONDITION_FAILED) are skipped
 * to avoid noise — those are user-facing flow control, not server bugs.
 *
 * Implementation note: kept inline (no top-level import) because the
 * opsRouter helper does a dynamic localDb import; loading it eagerly
 * here would risk a circular dep during cold start.
 */
const errorLoggerMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  try {
    return await next();
  } catch (err: any) {
    const code = err?.code ?? "INTERNAL_SERVER_ERROR";
    const isExpected =
      code === "UNAUTHORIZED" ||
      code === "BAD_REQUEST" ||
      code === "NOT_FOUND" ||
      code === "FORBIDDEN" ||
      code === "PRECONDITION_FAILED" ||
      code === "CONFLICT" ||
      code === "TOO_MANY_REQUESTS";
    if (!isExpected) {
      try {
        const { logError } = await import("../routers/opsRouter");
        // Fingerprint = source path + first line of error message, so
        // duplicate errors group together in the admin dashboard.
        const firstLine = String(err?.message ?? err).split("\n")[0] ?? "";
        const fingerprint = `trpc:${path}:${firstLine.slice(0, 80)}`;
        await logError({
          source: `trpc.${type}`,
          route: path,
          message: firstLine.slice(0, 500),
          stack: typeof err?.stack === "string" ? err.stack : undefined,
          userId: ctx.user?.id,
          fingerprint,
          meta: {
            code,
            type,
            path,
            // Cause if upstream wrapped a real error in a TRPCError.
            cause: err?.cause ? String(err.cause).slice(0, 300) : undefined,
          },
          level: "error",
        });
      } catch (logErr) {
        console.error("[trpc errorLogger] failed to record:", logErr);
      }
    }
    throw err; // never swallow — propagate to client
  }
});

export const publicProcedure = t.procedure.use(errorLoggerMiddleware);

/**
 * Protected procedure — requires authenticated user.
 * Throws UNAUTHORIZED if no user in context.
 */
export const protectedProcedure = t.procedure
  .use(errorLoggerMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.user) {
      console.warn('[trpc] protectedProcedure: No user in context');
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
  .use(({ ctx, next }) => {
    // 2026-05-29 (GDPR data minimisation): removed per-call userId log.
    // Logging userId on every tRPC call creates extensive personal data
    // processing records. Errors are still captured via errorLoggerMiddleware.
    return next({ ctx });
  });

/**
 * 2026-08-19 — process-local per-user concurrency guard.
 *
 * Motivation: quickTask.runSquadAuto runs a ~3-minute pipeline synchronously
 * inside the HTTP request. The client's progress ring is calibrated for 100s,
 * so a user who is still waiting at 100s reads it as stuck and clicks again.
 * Each extra click starts another full pipeline on the same single-fork Node
 * process, and the per-step Promise.race timeout does not cancel the upstream
 * provider call, so abandoned work keeps consuming memory and provider quota.
 *
 * Guard is process-local, which is sufficient today: production runs one
 * PM2 fork (`pm2 start tsx --name onbrand`, ci.yml). If this ever becomes
 * cluster mode or multi-VM, this must move to Redis SET NX + TTL.
 *
 * CONFLICT is deliberate: it maps to HTTP 409 with a JSON tRPC envelope, so
 * `authAwareFetch` in client/src/lib/trpc.ts leaves it alone (it only rewrites
 * NON-JSON gateway errors into the synthetic "伺服器忙碌" 502 message). The
 * user therefore sees the real reason, not a fake server error. CONFLICT is
 * also already on errorLoggerMiddleware's expected list, so it does not
 * pollute error_log.
 *
 * The TTL is a lease recovery ceiling, not an eager cancellation mechanism.
 * A call keeps its slot normally until `finally`; only a later request can
 * prune a generation whose owner has remained unresolved past the configured
 * limit. Pruning does not cancel that owner, so actual concurrency may briefly
 * exceed `maxConcurrent` while stale work finishes. Setting maxConcurrent > 1
 * also weakens protection against repeated clicks by the same user compared
 * with the default single-slot behavior; that tradeoff is intentional.
 */
export function singleFlightPerUser(
  opts: { key: string; message: string; ttlMs: number; maxConcurrent?: number },
  { now = Date.now }: { now?: () => number } = {},
) {
  if (!Number.isFinite(opts.ttlMs) || opts.ttlMs <= 0) {
    throw new RangeError("single-flight TTL must be a positive finite number");
  }
  const maxConcurrent = opts.maxConcurrent ?? 1;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new RangeError("single-flight maxConcurrent must be a positive integer");
  }

  const inFlight = new Map<number, Map<symbol, number>>();
  return t.middleware(async ({ ctx, next }) => {
    const userId = ctx.user?.id;
    // Unauthenticated calls are rejected by protectedProcedure anyway; not
    // holding a slot for them keeps this guard free of a null-key bucket.
    if (!userId) return next();

    const startedAt = now();
    let bucket = inFlight.get(userId);
    if (bucket) {
      for (const [existingToken, existingStartedAt] of bucket) {
        const elapsedMs = startedAt - existingStartedAt;
        if (elapsedMs >= opts.ttlMs) {
          bucket.delete(existingToken);
          console.warn(
            `[singleFlight] expired stale slot for ${opts.key} for user ${userId}; elapsedMs=${elapsedMs}`,
          );
        }
      }
      if (bucket.size >= maxConcurrent) {
        console.warn(`[singleFlight] rejected duplicate ${opts.key} for user ${userId}`);
        throw new TRPCError({ code: "CONFLICT", message: opts.message });
      }
    } else {
      bucket = new Map<symbol, number>();
      inFlight.set(userId, bucket);
    }

    // Every generation gets a unique token, so each finally can release only
    // its own slot even if another generation has the same injected timestamp.
    const token = Symbol(opts.key);
    bucket.set(token, startedAt);
    try {
      return await next();
    } finally {
      // Every resolved exit path releases: success, TRPCError, provider throw.
      // A client disconnect does NOT release early — the handler keeps running
      // because nothing propagates cancellation into it yet. Until the TTL is
      // reached, this prevents a reconnecting tab from stacking a pipeline.
      // A stale call may finish after its token was pruned and a newer call
      // took its place. Deleting only this token prevents that old finally
      // from unlocking the replacement generation.
      const currentBucket = inFlight.get(userId);
      if (currentBucket) {
        currentBucket.delete(token);
        if (currentBucket.size === 0) inFlight.delete(userId);
      }
    }
  });
}

/**
 * 2026-05-11 — adminProcedure: gated by users.role = 'admin'. Used by
 * the error-tracking dashboard + future admin tools.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { default: localPool } = await import("../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT role, email FROM users WHERE id = ? LIMIT 1`,
    [ctx.user.id],
  );
  const u = (rows as any[])[0] ?? {};
  // 2026-05-29 (security): removed hardcoded userId 199 check — that's a
  // magic-number IDOR risk (anyone who learns user 199 exists can craft tokens
  // if the secret ever leaks). Admin access is now strictly role- or
  // email-domain based. Set users.role='admin' via DB migration for staff.
  const email = String(u.email ?? ctx.user.email ?? "");
  const isAdmin =
    u.role === "admin" ||
    /@sowork\.(tw|ai)$/i.test(email);
  if (!isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
  return next({ ctx });
});
