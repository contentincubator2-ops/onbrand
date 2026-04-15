import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionSops, missionSopSteps } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const sopRouter = router({
  list: protectedProcedure
    .input(z.object({
      missionId: z.number().optional(),
      brandId: z.number().optional(),
      isGlobal: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.missionId) conditions.push(eq(missionSops.missionId, input.missionId));
      if (input.brandId) conditions.push(eq(missionSops.brandId, input.brandId));
      const sops = await db.select().from(missionSops)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(missionSops.updatedAt));
      const result = [];
      for (const sop of sops) {
        const steps = await db.select().from(missionSopSteps)
          .where(eq(missionSopSteps.sopId, sop.id))
          .orderBy(missionSopSteps.stepOrder);
        result.push({ ...sop, steps });
      }
      return result;
    }),

  create: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      brandId: z.number().optional(),
      title: z.string().min(1).max(255),
      sourceType: z.enum(["auto_learned","manual","imported"]).default("manual"),
      importSource: z.enum(["text","pdf","url"]).optional(),
      steps: z.array(z.object({
        stepOrder: z.number(),
        stepType: z.enum(["sequential","parallel","conditional"]).default("sequential"),
        parallelGroupId: z.string().optional(),
        agentSlug: z.string().optional(),
        label: z.string(),
        promptSnapshot: z.string().optional(),
        outputSummary: z.string().optional(),
        durationEstimate: z.string().optional(),
        notes: z.string().optional(),
      })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(missionSops).values({
        missionId: input.missionId,
        brandId: input.brandId ?? null,
        title: input.title,
        sourceType: input.sourceType,
        importSource: input.importSource ?? null,
      });
      const sopId = result.insertId;
      if (input.steps.length > 0) {
        await db.insert(missionSopSteps).values(
          input.steps.map(s => ({
            ...s,
            sopId,
            parallelGroupId: s.parallelGroupId ?? null,
            agentSlug: s.agentSlug ?? null,
            promptSnapshot: s.promptSnapshot ?? null,
            outputSummary: s.outputSummary ?? null,
            durationEstimate: s.durationEstimate ?? null,
            notes: s.notes ?? null,
            conditionJson: null,
          }))
        );
      }
      return { id: sopId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      isGlobal: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, ...updates } = input;
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length > 0) {
        await db.update(missionSops).set(clean).where(eq(missionSops.id, id));
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.delete(missionSopSteps).where(eq(missionSopSteps.sopId, input.id));
      await db.delete(missionSops).where(eq(missionSops.id, input.id));
      return { success: true };
    }),

  promote: protectedProcedure
    .input(z.object({ id: z.number(), brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(missionSops).set({ brandId: input.brandId, isGlobal: 1 })
        .where(eq(missionSops.id, input.id));
      return { success: true };
    }),

  getForMission: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [sop] = await db.select().from(missionSops)
        .where(eq(missionSops.missionId, input.missionId))
        .orderBy(desc(missionSops.updatedAt))
        .limit(1);
      if (!sop) return null;
      const steps = await db.select().from(missionSopSteps)
        .where(eq(missionSopSteps.sopId, sop.id))
        .orderBy(missionSopSteps.stepOrder);
      return { ...sop, steps };
    }),
});
