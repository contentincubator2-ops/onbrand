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
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires authenticated user.
 * Throws UNAUTHORIZED if no user in context.
 */
export const protectedProcedure = t.procedure
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
