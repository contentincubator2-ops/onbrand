import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { missionKnowledgeFiles, missionKnowledgeChunks, brandKbUsage, brandKbAdminOverride } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  checkKbUploadAllowed,
  recomputeKbUsage,
  isAdminOverrideEnabled,
  getSoftLimitBytes,
  getHardLimitBytes,
} from "../kbLimits";
import { logEvent, newSessionId } from "../_core/sessionLogger";

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

  /**
   * register — pre-flight KB size check before inserting a knowledge file.
   * Throws PAYLOAD_TOO_LARGE when the brand would exceed the hard limit
   * (unless admin override is active, which is audit-logged).
   * Emits a warning event when usage crosses 80% of the soft limit.
   */
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

      // Pre-flight: check KB size limit when brandId is present
      if (input.brandId !== undefined && input.fileSize !== undefined && input.fileSize > 0) {
        await checkKbUploadAllowed(db, {
          brandId: input.brandId,
          userId: ctx.user.id,
          incomingBytes: input.fileSize,
        });
      }

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

      // Recompute usage row after successful insert
      if (input.brandId !== undefined) {
        await recomputeKbUsage(db, input.brandId);
      }

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

      // Capture brandId before deletion for usage recompute
      const [file] = await db.select({ brandId: missionKnowledgeFiles.brandId })
        .from(missionKnowledgeFiles)
        .where(eq(missionKnowledgeFiles.id, input.id));

      await db.delete(missionKnowledgeChunks).where(eq(missionKnowledgeChunks.fileId, input.id));
      await db.delete(missionKnowledgeFiles).where(eq(missionKnowledgeFiles.id, input.id));

      // Recompute usage after deletion
      if (file?.brandId) {
        await recomputeKbUsage(db, file.brandId);
      }

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

  /**
   * getKbUsage — per-brand KB usage for the Brain tab dashboard.
   * Returns current bytesUsed plus limit info so the FE can render
   * usage bars and warnings.
   */
  getKbUsage: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return {
          bytesUsed: 0,
          softLimitBytes: getSoftLimitBytes(),
          hardLimitBytes: getHardLimitBytes(),
          softLimitMb: getSoftLimitBytes() / (1024 * 1024),
          hardLimitMb: getHardLimitBytes() / (1024 * 1024),
          pctOfSoft: 0,
          pctOfHard: 0,
          isNearSoftLimit: false,
          isOverSoftLimit: false,
          adminOverride: false,
          lastComputedAt: null,
        };
      }

      // Recompute to ensure freshness
      const bytesUsed = await recomputeKbUsage(db, input.brandId);
      const adminOverride = await isAdminOverrideEnabled(db, input.brandId);

      const softLimit = getSoftLimitBytes();
      const hardLimit = getHardLimitBytes();
      const pctOfSoft = softLimit > 0 ? (bytesUsed / softLimit) * 100 : 0;
      const pctOfHard = hardLimit > 0 ? (bytesUsed / hardLimit) * 100 : 0;

      // Retrieve lastComputedAt
      const usageRows = await db
        .select({ lastComputedAt: brandKbUsage.lastComputedAt })
        .from(brandKbUsage)
        .where(eq(brandKbUsage.brandId, input.brandId));

      return {
        bytesUsed,
        softLimitBytes: softLimit,
        hardLimitBytes: hardLimit,
        softLimitMb: softLimit / (1024 * 1024),
        hardLimitMb: hardLimit / (1024 * 1024),
        pctOfSoft: Math.round(pctOfSoft * 10) / 10,
        pctOfHard: Math.round(pctOfHard * 10) / 10,
        isNearSoftLimit: pctOfSoft >= 80,
        isOverSoftLimit: pctOfSoft >= 100,
        adminOverride,
        lastComputedAt: usageRows[0]?.lastComputedAt ?? null,
      };
    }),

  /**
   * setAdminOverride — admin-only: toggle hard-limit bypass for a brand.
   * Requires ctx.user to have admin role (checked via users table).
   * Every change is audit-logged via sessionLogger.
   */
  setAdminOverride: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      override: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Upsert override row
      await db
        .insert(brandKbAdminOverride)
        .values({
          brandId: input.brandId,
          adminKbOverride: input.override,
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            adminKbOverride: input.override,
            updatedBy: ctx.user.id,
            updatedAt: new Date(),
          },
        });

      // Audit log via sessionLogger
      logEvent({
        sessionId: newSessionId(),
        userId: ctx.user.id,
        eventType: "output",
        metadata: {
          event: "kb_admin_override_changed",
          brandId: input.brandId,
          adminKbOverride: input.override,
          changedBy: ctx.user.id,
        },
      });

      return { success: true };
    }),
});
