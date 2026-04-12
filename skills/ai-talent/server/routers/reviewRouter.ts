import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionReviewQueue } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

export const reviewRouter = router({
  list: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      status: z.enum(["pending","in_review","approved","revision_requested","expired"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(missionReviewQueue.missionId, input.missionId)];
      if (input.status) conditions.push(eq(missionReviewQueue.status, input.status as any));
      return db.select().from(missionReviewQueue)
        .where(and(...conditions))
        .orderBy(desc(missionReviewQueue.createdAt));
    }),

  request: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      outputId: z.number(),
      reviewType: z.enum(["internal","external","legal","client"]).default("internal"),
      reviewerIds: z.array(z.number()).optional(),
      isUrgent: z.boolean().default(false),
      deadlineAt: z.string().optional(),
      fastTrack: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const externalToken = (input.reviewType === "external" || input.reviewType === "client")
        ? crypto.randomBytes(32).toString("hex")
        : null;
      const externalExpireAt = externalToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
      const [result] = await db.insert(missionReviewQueue).values({
        missionId: input.missionId,
        outputId: input.outputId,
        requestedBy: ctx.user.id,
        reviewType: input.reviewType,
        reviewerIds: input.reviewerIds ?? null,
        isUrgent: input.isUrgent ? 1 : 0,
        deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
        fastTrack: input.fastTrack ? 1 : 0,
        externalToken,
        externalExpireAt,
        status: "pending",
      });
      return {
        id: result.insertId,
        externalToken,
        externalLink: externalToken ? `/review/${externalToken}` : null,
      };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missionReviewQueue)
        .set({ status: "approved", approvedAt: new Date() })
        .where(eq(missionReviewQueue.id, input.id));
      return { success: true };
    }),

  requestRevision: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missionReviewQueue)
        .set({ status: "revision_requested", revisionNote: input.note })
        .where(eq(missionReviewQueue.id, input.id));
      return { success: true };
    }),

  pendingCount: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return 0;
      const items = await db.select().from(missionReviewQueue)
        .where(and(
          eq(missionReviewQueue.missionId, input.missionId),
          eq(missionReviewQueue.status, "pending")
        ));
      return items.length;
    }),
});
