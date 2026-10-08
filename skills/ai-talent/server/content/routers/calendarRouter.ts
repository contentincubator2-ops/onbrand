/**
 * calendarRouter — Content Calendar aggregate.
 *
 * Pulls content-type decisions (fb-content / ig-content / linkedin-content etc)
 * from the decisions table, bucketed by day, with audit score + publish state.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertCanAct, isHiddenHistoryItem } from "../../platform/core/billing/planGate";
import { outputApprovalState, APPROVAL_BLOCK_MESSAGE, canPublishFor } from "../core/publishGate";
import { friendlyPublishError } from "../core/publish/publishErrors";
import { APPROVAL_HINT } from "../core/scheduledPublishWorker";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";
import { assertBrandOwner } from "../../platform/core/brandAuth";
import { createZernioClient } from "../../platform/core/connectors/zernio";
import { createZernioAdapter } from "../../platform/core/connectors/publish/zernioAdapter";
import { PublishUserError } from "../../platform/core/connectors/publish/publishAdapter";
import {
  contentSelectorFields,
  outputItemCaption,
  outputItemMedia,
  requirePlanningConfirmation,
  resolveOutputContent,
  resolveStoredContentSelector,
} from "../core/engine/outputContentEnvelope";

const CONTENT_TYPES = [
  "fb-content",
  "ig-content",
  "linkedin-content",
  "youtube-content",
  "pr-content",
];

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const calendarRouter = router({
  month: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        year: z.number().int().min(2020).max(2099),
        month: z.number().int().min(1).max(12), // 1-based
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const start = new Date(Date.UTC(input.year, input.month - 1, 1));
      const end = new Date(Date.UTC(input.year, input.month, 1));

      const [rows] = (await db.execute(sql`
        SELECT id, decisionType, status, title, auditScore,
               publishedAt, activatedAt, createdAt, payload
        FROM decisions
        WHERE brandId = ${input.brandId}
          AND decisionType IN (${sql.join(CONTENT_TYPES.map((t) => sql`${t}`), sql`, `)})
          AND (
                (publishedAt IS NOT NULL AND publishedAt >= ${start} AND publishedAt < ${end})
             OR (publishedAt IS NULL AND createdAt >= ${start} AND createdAt < ${end})
          )
        ORDER BY COALESCE(publishedAt, createdAt) ASC
      `)) as any;

      const all = Array.isArray(rows) ? rows : [];
      const byDay: Record<string, any[]> = {};
      for (const r of all) {
        const ts = r.publishedAt ?? r.createdAt;
        const k = dayKey(new Date(ts));
        (byDay[k] ??= []).push({
          id: r.id,
          channel: r.decisionType.replace("-content", ""),
          status: r.status,
          title: r.title,
          auditScore: r.auditScore,
          published: !!r.publishedAt,
          scheduled: !r.publishedAt && r.status === "approved",
        });
      }
      return { byDay, total: all.length };
    }),

  day: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const start = new Date(`${input.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 3600 * 1000);

      const [rows] = (await db.execute(sql`
        SELECT d.id, d.decisionType, d.status, d.title, d.summary,
               d.auditScore, d.publishedAt, d.activatedAt, d.createdAt,
               o.payload AS optionPayload
        FROM decisions d
        LEFT JOIN decision_options o ON o.id = d.recommendedOptionId
        WHERE d.brandId = ${input.brandId}
          AND d.decisionType IN (${sql.join(CONTENT_TYPES.map((t) => sql`${t}`), sql`, `)})
          AND (
                (d.publishedAt IS NOT NULL AND d.publishedAt >= ${start} AND d.publishedAt < ${end})
             OR (d.publishedAt IS NULL AND d.createdAt >= ${start} AND d.createdAt < ${end})
          )
        ORDER BY COALESCE(d.publishedAt, d.createdAt) ASC
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),

  // ─── 2026-05-11 (P0-1 內容日曆 + 排程發布) ────────────────────────
  // New surface combining `scheduled_posts` (pending future posts) +
  // `mission_outputs` (already published) into a single calendar feed.
  // The legacy month/day above is for decisions; this is for content runs.

  /** Unified [from, to) feed of scheduled + published posts owned by caller. */
  range: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
      brandId: z.number().int().positive().optional(),
      workspaceId: z.number().int().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const brandFilter = input.brandId ? "AND sp.brandId = ?" : "";
      const wsFilter    = input.workspaceId ? "AND sp.workspaceId = ?" : "";
      const params: any[] = [ctx.user.id, input.from, input.to];
      if (input.brandId) params.push(input.brandId);
      if (input.workspaceId) params.push(input.workspaceId);

      const [scheduled]: any = await localPool.execute(
        `SELECT sp.id, sp.userId AS ownerId, sp.outputId, sp.variantIndex, sp.contentKind, sp.contentIndex, sp.platform,
                sp.scheduledAt, sp.status, sp.publishedAt, sp.externalUrl, sp.lastError, sp.attempts,
                sp.brandId, b.name AS brandName,
                o.content AS outputContent, o.metadata AS outputMetadata,
                m.title AS missionTitle, m.squadSlug AS missionSquadSlug,
                -- 2026-09-29 送審是排程的一個狀態，不是另一條路：週曆格子要看得到「待審／退回／已放行」。
                (SELECT q.status FROM mission_review_queue q WHERE q.outputId = sp.outputId
                  ORDER BY q.id DESC LIMIT 1) AS reviewStatus
         FROM scheduled_posts sp
         LEFT JOIN brands b ON b.id = sp.brandId
         LEFT JOIN mission_outputs o ON o.id = sp.outputId
         LEFT JOIN missions m ON m.id = o.missionId
         WHERE sp.userId = ?
           AND sp.scheduledAt >= ? AND sp.scheduledAt < ?
           ${brandFilter} ${wsFilter}
         ORDER BY sp.scheduledAt ASC`,
        params,
      );

      const params2: any[] = [ctx.user.id, input.from, input.to];
      if (input.brandId) params2.push(input.brandId);
      const brandFilter2 = input.brandId ? "AND m.brandId = ?" : "";
      const [published]: any = await localPool.execute(
        `SELECT o.id, o.content, o.publishedAt, o.status,
                m.brandId, b.name AS brandName, m.title AS missionTitle,
                m.workspace AS platform,
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')), 'null') AS taskId
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE m.userId = ?
           AND o.publishedAt IS NOT NULL
           AND o.publishedAt >= ? AND o.publishedAt < ?
           ${brandFilter2}
         ORDER BY o.publishedAt DESC
         LIMIT 200`,
        params2,
      );

      // 2026-09-29 CJ「前台隱藏，資料保留」：下架通路（LinkedIn／YouTube／新聞稿／X）
      // 的排程與已發布不上日曆。X 產出的 platform 是 generic，只能靠 task id 認。
      const metaTaskId = (m: unknown): string | null => {
        try { const j = typeof m === "string" ? JSON.parse(m) : m; return typeof (j as any)?.taskId === "string" ? (j as any).taskId : null; }
        catch { return null; }
      };
      const items = [
        ...(scheduled as any[])
          .filter((s) => !isHiddenHistoryItem({ platform: s.platform, taskId: metaTaskId(s.outputMetadata) }))
          .map((s) => {
          const selector = resolveStoredContentSelector({
            variantIndex: s.variantIndex,
            contentKind: s.contentKind,
            contentIndex: s.contentIndex,
            outputMetadata: s.outputMetadata,
            missionSquadSlug: s.missionSquadSlug,
          });
          return {
            kind: "scheduled" as const,
            id: s.id,
            outputId: s.outputId,
            at: s.scheduledAt,
            platform: s.platform,
            status: s.status,
            brandId: s.brandId,
            brandName: s.brandName,
            missionTitle: s.missionTitle,
            externalUrl: s.externalUrl,
            variantIndex: s.variantIndex == null ? null : Number(s.variantIndex),
            lastError: s.lastError ? String(s.lastError) : null,
            awaitingApproval: s.status === "pending" && s.lastError === APPROVAL_HINT,
            attempts: Number(s.attempts ?? 0),
            reviewStatus: s.reviewStatus ? String(s.reviewStatus) : null,
            contentKind: selector.contentKind ?? null,
            contentIndex: selector.contentIndex ?? null,
            preview: extractCaption(s.outputContent, selector),
          };
        }),
        ...(published as any[])
          .filter((p) => !isHiddenHistoryItem({ platform: p.platform, taskId: p.taskId }))
          .map((p) => ({
          kind: "published" as const,
          id: p.id,
          outputId: p.id,
          at: p.publishedAt,
          platform: p.platform,
          status: p.status,
          brandId: p.brandId,
          brandName: p.brandName,
          missionTitle: p.missionTitle,
          externalUrl: null,
          preview: extractCaption(p.content, { variantIndex: 0 }),
        })),
      ];
      return items;
    }),

  schedule: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      ...contentSelectorFields,
      confirmPlanningContent: z.boolean().optional(),
      scheduledAt: z.string(),
      platform: z.string().min(1).max(24),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx.user!.id);   // 2026-09-07 viewer 只能看，不能發布／排程／建卡
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT m.userId, m.brandId, b.workspaceId, o.content
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE o.id = ? LIMIT 1`,
        [input.outputId],
      );
      const row = (rows as any[])[0];
      if (!row || row.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Output not found or not yours" });
      }
      const selected = resolveOutputContent(row.content, input);
      requirePlanningConfirmation(selected, input.confirmPlanningContent, "schedule");
      const at = new Date(input.scheduledAt);
      if (isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledAt 必須是未來時間" });
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO scheduled_posts
           (userId, workspaceId, brandId, outputId, variantIndex, contentKind, contentIndex,
            planningConfirmed, platform, scheduledAt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [ctx.user.id, row.workspaceId ?? null, row.brandId ?? null,
         input.outputId, input.variantIndex, selected.storageKind, selected.storageIndex,
         selected.kind === "planning" ? 1 : 0, input.platform, at],
      );
      return {
        ok: true,
        id: (r as any).insertId as number,
        contentKind: selected.kind,
        contentIndex: selected.index,
      };
    }),

  reschedule: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      scheduledAt: z.string(),
    }))
    .mutation(async ({ ctx, input }) => rescheduleScheduledPost({ id: input.id, userId: ctx.user!.id, scheduledAt: input.scheduledAt })),

  /**
   * Put a failed post back in the queue (status failed → pending, lastError
   * cleared, attempts kept). It does NOT publish and does not touch approval:
   * publish still runs the approval gate. Owner or workspace owner/admin only.
   */
  retry: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => retryScheduledPost({ id: input.id, userId: ctx.user!.id })),

  cancel: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      await localPool.execute(
        `UPDATE scheduled_posts
         SET status = 'cancelled', cancelledAt = NOW(3), cancelledBy = ?
         WHERE id = ? AND userId = ? AND status = 'pending'`,
        [ctx.user.id, input.id, ctx.user.id],
      );
      return { ok: true };
    }),

  /** Publish approved scheduled content through Zernio and record its external post ID and URL. */
  publish: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      confirmPlanningContent: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) =>
      publishScheduledPost({ id: input.id, userId: ctx.user!.id, confirmPlanningContent: input.confirmPlanningContent })),
});

/**
 * Publish one scheduled_posts row. Shared by the "publish now" mutation and the
 * auto-publish worker (content/core/scheduledPublishWorker.ts).
 *
 * `claimed` = the worker already flipped the row pending → publishing, so a
 * 'publishing' status is expected instead of 'pending'.
 */
export async function publishScheduledPost(args: {
  id: number;
  userId: number;
  confirmPlanningContent?: boolean;
  claimed?: boolean;
}) {
  try {
    return await publishScheduledPostInner(args);
  } catch (e: any) {
    const code = e instanceof TRPCError ? e.code : "INTERNAL_SERVER_ERROR";
    const friendly = friendlyPublishError(e);
    // Record what went wrong on the row so the calendar can show it. Skipped
    // for caller mistakes (permission, not found, not approved, already done);
    // the worker writes its own lastError for claimed rows.
    const callerMistake = ["BAD_REQUEST", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"].includes(code);
    if (!args.claimed && !callerMistake) {
      try {
        const { default: localPool } = await import("../../localDb");
        await localPool.execute(
          `UPDATE scheduled_posts SET lastError = ?, attempts = attempts + 1 WHERE id = ? AND status = 'pending'`,
          [friendly.slice(0, 1000), args.id],
        );
      } catch { /* the original error matters more */ }
    }
    if (friendly !== (e?.message ?? "")) {
      throw new TRPCError({ code: code as any, message: friendly, cause: e });
    }
    throw e;
  }
}

/** Move a pending or failed post to a new time; a failed post goes back to pending. */
export async function rescheduleScheduledPost(args: { id: number; userId: number; scheduledAt: string }) {
  await assertCanAct(args.userId);   // 2026-09-07 viewer 只能看，不能發布／排程／建卡
  const { default: localPool } = await import("../../localDb");
  const at = new Date(args.scheduledAt);
  if (isNaN(at.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date" });
  }
  // lastError is assigned before status: MySQL applies SET assignments left to right.
  const [r]: any = await localPool.execute(
    `UPDATE scheduled_posts
        SET scheduledAt = ?, lastError = IF(status = 'failed' OR lastError = ?, NULL, lastError), status = 'pending'
      WHERE id = ? AND userId = ? AND status IN ('pending','failed')`,
    [at, APPROVAL_HINT, args.id, args.userId],
  );
  if ((r as any).affectedRows === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "找不到此排程，或已發布 / 取消" });
  }
  return { ok: true };
}

/** failed → pending. Never publishes and never bypasses the approval gate. */
export async function retryScheduledPost(args: { id: number; userId: number }) {
  await assertCanAct(args.userId);
  const { default: localPool } = await import("../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT userId AS ownerId, status FROM scheduled_posts WHERE id = ? LIMIT 1`,
    [args.id],
  );
  const row = (rows as any[])[0];
  // Same NOT_FOUND for "missing" and "not yours" so ids can't be probed.
  if (!row || !(await canPublishFor(localPool, args.userId, Number(row.ownerId)))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "排程不存在或無權限" });
  }
  if (row.status !== "failed") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "只有發布失敗的貼文可以重試" });
  }
  const [r]: any = await localPool.execute(
    `UPDATE scheduled_posts SET status = 'pending', lastError = NULL WHERE id = ? AND status = 'failed'`,
    [args.id],
  );
  if ((r as any).affectedRows === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "只有發布失敗的貼文可以重試" });
  }
  return { ok: true };
}

async function publishScheduledPostInner(args: {
  id: number;
  userId: number;
  confirmPlanningContent?: boolean;
  claimed?: boolean;
}) {
  await assertCanAct(args.userId);   // 2026-09-07 viewer 只能看，不能發布／排程／建卡
  const { default: localPool } = await import("../../localDb");

  // Load scheduled_post + verify ownership
  const [rows]: any = await localPool.execute(
    `SELECT sp.id, sp.userId AS ownerId, sp.outputId, sp.variantIndex, sp.contentKind, sp.contentIndex,
            sp.planningConfirmed, sp.platform, sp.status, sp.brandId, sp.attempts,
            o.content AS outputContent, o.metadata AS outputMetadata,
            m.squadSlug AS missionSquadSlug,
            b.name AS brandName
     FROM scheduled_posts sp
     LEFT JOIN mission_outputs o ON o.id = sp.outputId
     LEFT JOIN missions m ON m.id = o.missionId
     LEFT JOIN brands b ON b.id = sp.brandId
     WHERE sp.id = ? LIMIT 1`,
    [args.id],
  );
  const row = (rows as any[])[0];
  // 2026-10-04: the owner, or an owner/admin of the owner's workspace, may publish.
  // Same NOT_FOUND for both "missing" and "not yours" so ids can't be probed.
  if (!row || !(await canPublishFor(localPool, args.userId, Number(row.ownerId)))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "排程不存在或無權限" });
  }
  const ownerId = Number(row.ownerId);
  if (row.status !== (args.claimed ? "publishing" : "pending")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "此貼文已發布或已取消，無法重複發布" });
  }
  // 2026-10-04：核准才能發布。審核中、被退回、從沒送審的稿都不能發（見 publishGate.ts）。
  const approval = await outputApprovalState(localPool, Number(row.outputId), ownerId);
  if (approval !== "approved") {
    throw new TRPCError({ code: "BAD_REQUEST", message: APPROVAL_BLOCK_MESSAGE[approval] });
  }

  // Normalise platform
  const platformRaw: string = (row.platform ?? "").toLowerCase();
  const platform =
    platformRaw === "fb" ? "facebook" :
    platformRaw === "ig" ? "instagram" :
    platformRaw === "li" ? "linkedin" :
    platformRaw === "yt" ? "youtube" :
    platformRaw === "tt" ? "tiktok" :
    platformRaw === "pr" ? "press" :
    platformRaw;

  const selected = resolveOutputContent(
    row.outputContent,
    resolveStoredContentSelector({
      variantIndex: row.variantIndex,
      contentKind: row.contentKind,
      contentIndex: row.contentIndex,
      outputMetadata: row.outputMetadata,
      missionSquadSlug: row.missionSquadSlug,
    }),
  );
  requirePlanningConfirmation(
    selected,
    Number(row.planningConfirmed ?? 0) === 1 || args.confirmPlanningContent === true,
    "publish",
  );
  if (
    selected.kind === "planning" &&
    args.confirmPlanningContent === true &&
    Number(row.planningConfirmed ?? 0) !== 1
  ) {
    await localPool.execute(
      `UPDATE scheduled_posts SET planningConfirmed = 1 WHERE id = ? AND userId = ?`,
      [args.id, ownerId],
    );
  }
  const caption = outputItemCaption(selected.item);
  if (!caption.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "此貼文沒有文字內容可發布" });
  }

  const t0 = Date.now();
  let permalink: string | null = null;
  let postId: string | null = null;

  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) throw new TRPCError({
    code: "PRECONDITION_FAILED", message: "發布服務尚未啟用，請聯絡 sowork@sowork.ai。",
  });
  const media = outputItemMedia(selected.item);
  try {
    const adapter = createZernioAdapter({ client: createZernioClient({ apiKey }), pool: localPool,
      brandNameOf: async () => row.brandName ?? "",
      publicBaseUrl: process.env.APP_URL,
    });
    const result = await adapter.publish({ scheduledPostId: row.id, brandId: row.brandId,
      platform, caption, imageUrls: media.imageUrls, videoUrl: media.videoUrl,
      // Workers increment before publishing; manual attempts increment on failure.
      // Normalize both paths so a manual retry after a worker failure gets a new key.
      attempt: Number(row.attempts ?? 0) + (args.claimed ? 0 : 1),
    });
    postId = result.postId;
    permalink = result.permalink;
  } catch (e) {
    throw new TRPCError({ code: e instanceof PublishUserError ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: e instanceof Error ? e.message : "Zernio 發布失敗",
    });
  }

  const latencyMs = Date.now() - t0;

  // Mark scheduled_post as published.
  // 2026-08-11: externalPostId is now persisted too. The column has existed
  // since the table was created but nothing ever wrote it — only the
  // permalink was kept. Platform insights APIs are keyed by POST ID (a
  // permalink can't be passed to Graph API), so without this every post we
  // publish is permanently unmeasurable. This is not recoverable after the
  // fact: if we don't record the id at publish time, that post's metrics
  // are gone for good.
  try {
    await localPool.execute(
      `UPDATE scheduled_posts
          SET status = 'published', publishedAt = NOW(3), lastError = NULL,
              externalUrl = ?, externalPostId = ?
        WHERE id = ?`,
      [permalink, postId, args.id],
    );
  } catch (e) { console.error("[calendar.publish] update scheduled_posts failed:", e); }

  // Mark mission_output as published
  if (row.outputId) {
    try {
      await localPool.execute(
        `UPDATE mission_outputs
            SET status = 'published', publishedAt = NOW(), updatedAt = NOW(),
                metadata = JSON_MERGE_PATCH(COALESCE(metadata, JSON_OBJECT()), CAST(? AS JSON))
          WHERE id = ?`,
        [JSON.stringify({ publish: { platform, postId, permalink, publishedAt: new Date().toISOString() } }), row.outputId],
      );
    } catch (e) { console.error("[calendar.publish] update mission_outputs failed:", e); }
  }

  return { ok: true, latencyMs, postId, permalink };
}

function extractCaption(
  content: any,
  selector: { variantIndex: number; contentKind?: "planning" | "public"; contentIndex?: number },
): string {
  if (!content) return "";
  try {
    return outputItemCaption(resolveOutputContent(content, selector).item).slice(0, 120);
  } catch {
    return "";
  }
}
