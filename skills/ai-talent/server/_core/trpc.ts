/**
 * tRPC setup — router and procedure factories.
 * Full tRPC integration with authentication will be completed in Sprint 2.
 */

import { initTRPC, TRPCError } from "@trpc/server";

// Context type — populated per-request
export interface TRPCContext {
  user: {
    id: number;
    email?: string;
  } | null;
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
