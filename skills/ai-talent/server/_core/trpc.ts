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
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    // Dev fallback: allow x-user-id header in non-production
    if (process.env.NODE_ENV !== "production") {
      const devUserId = parseInt((req.headers["x-user-id"] as string) ?? "0");
      if (devUserId > 0) return { user: { id: devUserId } };
    }
    return { user: null };
  }

  try {
    const { getJwtSecret } = await import("./env");
    const secret = new TextEncoder().encode(getJwtSecret());
    const token = authHeader.slice(7);
    const { payload } = await jose.jwtVerify(token, secret);
    return {
      user: {
        id: Number(payload.sub ?? (payload as any).userId ?? 0),
        email: typeof payload.email === "string" ? payload.email : undefined,
      },
    };
  } catch {
    return { user: null };
  }
}

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires authenticated user.
 * Throws UNAUTHORIZED if no user in context.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
