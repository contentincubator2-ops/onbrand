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

    console.log('[auth] Successfully verified token from', tokenSource, 'for userId:', Number(payload.sub ?? (payload as any).userId ?? 0));

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
  .use(({ ctx, next, path }) => {
    // Log all protected procedure calls
    console.log(`[trpc] Protected procedure called: ${path} by userId:`, ctx.user?.id);
    return next({ ctx });
  });

/**
 * 2026-05-11 — adminProcedure: gated by users.role = 'admin'. Used by
 * the error-tracking dashboard + future admin tools.
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { default: localPool } = await import("../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT role, email FROM users WHERE id = ? LIMIT 1`,
    [ctx.user.id],
  );
  const u = (rows as any[])[0] ?? {};
  // 2026-05-16 (CJ「後台監控」): accept role='admin' OR the SoWork staff
  // allowlist (mirrors supportRouter.isAdminUser) so internal team gets
  // in without a manual users.role flip. CJ = userId 199 / @sowork.tw.
  const email = String(u.email ?? ctx.user.email ?? "");
  const isAdmin =
    u.role === "admin" ||
    ctx.user.id === 199 ||
    /@sowork\.(tw|ai)$/i.test(email);
  if (!isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
  return next({ ctx });
});
