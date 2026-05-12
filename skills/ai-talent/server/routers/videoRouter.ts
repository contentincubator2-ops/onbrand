/**
 * videoRouter.ts — AI 影片生成 tRPC Router
 * 工作流：腳本生成 → Seedance 2.0（fal.ai）→ ElevenLabs TTS → Creatomate 合成
 *
 * Endpoints:
 *   video.generate  — 啟動影片生成任務
 *   video.status    — 查詢任務進度
 *   video.list      — 列出用戶的影片任務
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { videoJobs } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateVideoAsync } from "../video/videoService";

// ─── Input Schemas ──────────────────────────────────────────────────────────

const PlatformEnum = z.enum(["youtube", "instagram", "tiktok", "facebook"]);
const LanguageEnum = z.enum(["zh-TW", "zh-CN", "en"]);
const StyleEnum = z.enum(["professional", "casual", "energetic", "minimalist"]);
// 2026-05-12 (CJ「給用戶選 video model」): expose PiAPI video model picker.
const VideoModelEnum = z.enum([
  "auto",
  "piapi/kling-v2-master",   // 主力，3-5 min/clip, A-grade
  "piapi/kling-v1-6-i2v",    // 快速，1-2 min
  "piapi/runway-gen-4",      // 電影感
  "piapi/runway-gen-4-turbo",
  "piapi/pika-v2",           // 急用
]);

// ─── Router ─────────────────────────────────────────────────────────────────

export const videoRouter = router({

  /**
   * 啟動影片生成任務
   * POST /trpc/video.generate
   */
  generate: protectedProcedure
    .input(
      z.object({
        topic:    z.string().min(2).max(200),
        platform: PlatformEnum.default("youtube"),
        language: LanguageEnum.default("zh-TW"),
        duration: z.number().int().min(15).max(180).default(60), // seconds
        style:    StyleEnum.default("professional"),
        brandId:  z.number().int().optional(),
        videoModel: VideoModelEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // 2026-05-12: paywall quota check (plan video_gen cap)
      const { assertWithinPlan, recordQuotaUsage } = await import("./billingRouter");
      await assertWithinPlan(ctx.user.id, "video_gen");
      await recordQuotaUsage(ctx.user.id, "video_gen", "brand", input.brandId ?? null);

      // Resolve "auto" to the default video model id for the worker
      const resolvedVideoModel = !input.videoModel || input.videoModel === "auto"
        ? "piapi/kling-v2-master"
        : input.videoModel;

      // 建立任務記錄
      const [result] = await db.insert(videoJobs).values({
        userId:   ctx.user.id,
        brandId:  input.brandId ?? null,
        topic:    input.topic,
        platform: input.platform,
        language: input.language,
        duration: input.duration,
        style:    input.style,
        status:   "pending",
      });

      const jobId = result.insertId as number;

      // 非同步執行（不等待完成）
      generateVideoAsync(jobId, { ...input, videoModel: resolvedVideoModel }, ctx.user.id).catch((err) => {
        console.error(`[video] job ${jobId} failed:`, err);
      });

      return {
        jobId,
        status: "pending",
        message: `影片生成任務已啟動，預計 5–10 分鐘完成`,
      };
    }),

  /**
   * 查詢任務狀態
   * GET /trpc/video.status
   */
  status: protectedProcedure
    .input(z.object({ jobId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [job] = await db
        .select()
        .from(videoJobs)
        .where(eq(videoJobs.id, input.jobId))
        .limit(1);

      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.userId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your job" });

      return {
        jobId:        job.id,
        status:       job.status,
        progress:     job.progress,
        videoUrl:     job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        script:       job.script,
        errorMessage: job.errorMessage,
        createdAt:    job.createdAt,
        updatedAt:    job.updatedAt,
      };
    }),

  /**
   * 列出用戶的影片任務
   * GET /trpc/video.list
   */
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(videoJobs)
        .where(eq(videoJobs.userId, ctx.user.id))
        .orderBy(desc(videoJobs.createdAt))
        .limit(input.limit);
    }),
});
