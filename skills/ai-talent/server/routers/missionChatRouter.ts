/**
 * missionChatRouter.ts — tRPC router for missionChat procedures.
 *
 * Provides the `missionChat.start` procedure used by clients that prefer
 * tRPC over the SSE-based REST route at /api/chat.
 *
 * Backpressure: the procedure honours the same load-shedding thresholds as
 * the Express middleware by calling `shouldShedLoad()` from the shared
 * backpressure module. When the server is overloaded it returns:
 *
 *   TRPCError({ code: "TOO_MANY_REQUESTS" })
 *
 * which maps to HTTP 429 on the client.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { shouldShedLoad, getBackpressureCounter } from "../middleware/backpressure";

export const missionChatRouter = router({
  /**
   * Start a mission chat turn.
   *
   * Returns a stub acknowledgement — the actual streaming content is
   * delivered via the SSE route at /api/chat. This procedure exists to
   * give tRPC clients a typed entry-point with backpressure protection.
   */
  start: protectedProcedure
    .input(
      z.object({
        missionId: z.number(),
        message:   z.string().min(1).max(8_000),
        brandId:   z.number().optional(),
        workspace: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // ── Backpressure check ────────────────────────────────────────────────
      const decision = await shouldShedLoad();

      if (decision.shed && decision.reason) {
        getBackpressureCounter().inc({ reason: decision.reason });

        throw new TRPCError({
          code:    "TOO_MANY_REQUESTS",
          message: `Server under load (${decision.reason}). Retry in 10 s.`,
        });
      }

      // ── Acknowledge receipt ───────────────────────────────────────────────
      // Real streaming happens via the SSE route at /api/chat.
      // This ack lets the client know the request was accepted.
      return {
        accepted:  true,
        missionId: input.missionId,
      };
    }),
});
