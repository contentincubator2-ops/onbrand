import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionKnowledgeFiles, missionKnowledgeChunks } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const knowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ missionId: z.number().optional(), brandId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input.brandId !== undefined) {
        return db.select().from(missionKnowledgeFiles)
          .where(eq(missionKnowledgeFiles.brandId, input.brandId))
          .orderBy(desc(missionKnowledgeFiles.createdAt));
      }
      if (input.missionId === undefined) return [];
      return db.select().from(missionKnowledgeFiles)
        .where(eq(missionKnowledgeFiles.missionId, input.missionId))
        .orderBy(desc(missionKnowledgeFiles.createdAt));
    }),

  register: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      brandId: z.number().optional(),
      filename: z.string(),
      originalName: z.string().optional(),
      fileType: z.enum(["pdf","docx","xlsx","csv","txt","url","other"]).default("other"),
      fileUrl: z.string(),
      fileSize: z.number().optional(),
      autoInject: z.boolean().default(false),
      isForSopOnly: z.boolean().default(false),
      isSensitive: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(missionKnowledgeFiles).values({
        missionId: input.missionId,
        brandId: input.brandId ?? null,
        userId: ctx.user.id,
        filename: input.filename,
        originalName: input.originalName ?? input.filename,
        fileType: input.fileType,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize ?? null,
        autoInject: input.autoInject ? 1 : 0,
        isForSopOnly: input.isForSopOnly ? 1 : 0,
        isSensitive: input.isSensitive ? 1 : 0,
        embeddingStatus: "pending",
      });
      return { id: result.insertId };
    }),

  updateSettings: protectedProcedure
    .input(z.object({
      id: z.number(),
      autoInject: z.boolean().optional(),
      isForSopOnly: z.boolean().optional(),
      isSensitive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, ...updates } = input;
      const clean: any = {};
      if (updates.autoInject !== undefined) clean.autoInject = updates.autoInject ? 1 : 0;
      if (updates.isForSopOnly !== undefined) clean.isForSopOnly = updates.isForSopOnly ? 1 : 0;
      if (updates.isSensitive !== undefined) clean.isSensitive = updates.isSensitive ? 1 : 0;
      if (Object.keys(clean).length > 0) {
        await db.update(missionKnowledgeFiles).set(clean).where(eq(missionKnowledgeFiles.id, id));
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.delete(missionKnowledgeChunks).where(eq(missionKnowledgeChunks.fileId, input.id));
      await db.delete(missionKnowledgeFiles).where(eq(missionKnowledgeFiles.id, input.id));
      return { success: true };
    }),

  getAutoInjectFiles: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(missionKnowledgeFiles)
        .where(and(
          eq(missionKnowledgeFiles.missionId, input.missionId),
          eq(missionKnowledgeFiles.autoInject, 1),
          eq(missionKnowledgeFiles.embeddingStatus, "completed")
        ));
    }),
});
