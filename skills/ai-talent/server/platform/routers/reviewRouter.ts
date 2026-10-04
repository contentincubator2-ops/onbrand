/**
 * reviewRouter — 產出送審與放行。
 *
 * 2026-09-06。`mission_review_queue` 這張表 2026 上半年就建好了，欄位設計
 * 也完整（五態 status、reviewerIds、revisionNote、deadline），但**server 與
 * client 都沒有任何程式碼在用它** —— 整套審核只存在於資料表裡。定價把「審核
 * 工作流」寫成 9,000 方案 5 席的理由，那句話在這支寫完之前是不成立的。
 *
 * ── 權限模型 ─────────────────────────────────────────────────────────
 * 誰能放行：在「與送審者共用的 workspace」裡具 owner / admin 角色的人，
 * 或被明確列進 reviewerIds 的人。
 *
 * 為什麼不是「品牌擁有者」：審核的意義就在產出的人與放行的人分開。
 * 用 workspace_members 的角色是唯一真的存在、而且已經在收費（席次）的
 * 那套權限，不需要另外發明一套。
 *
 * missions.workspace 是頻道名（'facebook' / 'linkedin'…），不是租戶
 * workspace id —— 別被欄位名騙了，這裡一律走 workspace_members。
 *
 * 2026-10-02（CJ「送審時要先問排的時間…我現在也不知道送審給誰？」）：
 *   · 送審要指定一位審核人（reviewers 列出可選的人：跟我同一個 workspace、角色 owner／admin）。
 *     指定了就只有那一位能放行／退回——「送給誰」要是真的，不是一句說明。
 *     沒指定（舊的成品頁路徑）照舊：同 workspace 的 owner／admin 都可以。
 *   · listPending 帶排定時間與品牌：審核人的本週企劃把待審的稿放在它要發的那一天。
 *
 * 2026-10-02（活動企劃上每一篇的狀態）：送審／放行／退回順手同步
 * mission_outputs.status（pending_review／approved／draft）。專案頁與活動地圖
 * 讀的是那一欄；只改佇列的話，放行過的稿在那兩個地方還是「草稿」。
 * 已經排程或發布的不動——那是更後面的關卡。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import { assertReviewAllowed, isHiddenHistoryItem } from "../core/billing/planGate";

/** 2026-09-29 CJ「前台隱藏，資料保留」：下架通路（LinkedIn／YouTube／新聞稿／X）的稿不列、不算紅點。 */
const hiddenReview = (r: any) =>
  isHiddenHistoryItem({ platform: r.platform, taskId: r.taskId }) || isHiddenHistoryItem({ platform: r.workspace });
const REVIEW_TASK_COLS = `NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')), 'null') AS taskId, m.workspace AS workspace`;

/** mysql2 execute() 不吃 LIMIT 的 ? 參數（"Incorrect arguments to mysqld_stmt_execute"），一律夾成整數直接寫進 SQL。 */
const safeLimit = (n: number | undefined) => Math.min(100, Math.max(1, Math.trunc(Number(n) || 50)));

const REVIEW_TYPES = ["internal", "external", "legal", "client"] as const;

/** 這個人能不能放行那個人送的審。 */
async function canApprove(reviewerId: number, requesterId: number, reviewerIds: number[] | null) {
  if (reviewerIds?.includes(reviewerId)) return true;
  if (reviewerIds && reviewerIds.length > 0) return false; // 指定了審核人：只有那幾位
  if (reviewerId === requesterId) return false; // 自己送的自己不能放行
  const { default: localPool } = await import("../../localDb");
  try {
    const [rows]: any = await localPool.execute(
      `SELECT 1 FROM workspace_members me
         JOIN workspace_members req ON req.workspaceId = me.workspaceId
        WHERE me.userId = ? AND me.role IN ('owner','admin') AND req.userId = ?
        LIMIT 1`,
      [reviewerId, requesterId],
    );
    return (rows as any[]).length > 0;
  } catch {
    return false; // 查不到就不放行 —— 預設往嚴格的方向錯
  }
}

/** 審核結果寫回產出本身（見檔頭）。只從 from 列出的狀態改；失敗不擋審核本身。 */
async function syncOutputStatus(outputId: number, to: string, from: string[]): Promise<void> {
  if (!Number.isInteger(outputId) || outputId <= 0) return;
  try {
    const { default: localPool } = await import("../../localDb");
    await localPool.execute(
      `UPDATE mission_outputs SET status = ?, updatedAt = NOW() WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`,
      [to, outputId, ...from],
    );
  } catch (e) {
    console.warn("[review] syncOutputStatus failed", (e as Error)?.message);
  }
}

/** 可以替這個人審稿的人：同一個 workspace、角色 owner／admin，不含自己。 */
async function eligibleReviewers(userId: number): Promise<Array<{ userId: number; name: string; email: string; role: string }>> {
  const { default: localPool } = await import("../../localDb");
  try {
    const [rows]: any = await localPool.execute(
      `SELECT DISTINCT other.userId, other.role, u.name, u.email
         FROM workspace_members me
         JOIN workspace_members other ON other.workspaceId = me.workspaceId
         JOIN users u ON u.id = other.userId
        WHERE me.userId = ? AND other.userId <> ? AND other.role IN ('owner','admin')
        ORDER BY FIELD(other.role, 'owner', 'admin'), u.name`,
      [userId, userId],
    );
    const seen = new Set<number>();
    return (rows as any[]).filter((r) => !seen.has(Number(r.userId)) && seen.add(Number(r.userId))).map((r) => ({
      userId: Number(r.userId), name: String(r.name ?? "") || String(r.email ?? ""), email: String(r.email ?? ""), role: String(r.role ?? ""),
    }));
  } catch {
    return [];
  }
}

function parseReviewers(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.filter((n): n is number => typeof n === "number");
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.filter((n): n is number => typeof n === "number") : null;
    } catch { return null; }
  }
  return null;
}

export const reviewRouter = router({
  /** 送審可以送給誰（見檔頭）。一個都沒有＝還沒邀主管進 workspace。 */
  reviewers: protectedProcedure.query(async ({ ctx }) => eligibleReviewers(ctx.user!.id)),

  /** 送審。同一個 output 已經在排隊就不重複送。 */
  submit: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      outputId: z.number(),
      reviewType: z.enum(REVIEW_TYPES).default("internal"),
      reviewerIds: z.array(z.number()).max(10).optional(),
      isUrgent: z.boolean().default(false),
      note: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertReviewAllowed(ctx.user!.id);
      const userId = ctx.user!.id;
      const { default: localPool } = await import("../../localDb");
      if (input.reviewerIds?.length) {
        const ok = new Set((await eligibleReviewers(userId)).map((r) => r.userId));
        if (input.reviewerIds.some((id) => !ok.has(id))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "審核人要是同一個團隊裡的管理者（owner／admin）。" });
        }
      }

      // tenantGuard has verified the mission is the caller's; the output has to be in it.
      const [own]: any = await localPool.execute(
        `SELECT id FROM mission_outputs WHERE id = ? AND missionId = ? LIMIT 1`,
        [input.outputId, input.missionId],
      );
      if ((own as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這則產出。" });
      }

      const [dup]: any = await localPool.execute(
        `SELECT id, status FROM mission_review_queue
          WHERE outputId = ? AND status IN ('pending','in_review') LIMIT 1`,
        [input.outputId],
      );
      if ((dup as any[]).length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "這則產出已經在審核中了，不用重複送。",
        });
      }

      const [r]: any = await localPool.execute(
        `INSERT INTO mission_review_queue
           (missionId, outputId, requestedBy, reviewType, status, reviewerIds, isUrgent, revisionNote)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [input.missionId, input.outputId, userId, input.reviewType,
         input.reviewerIds ? JSON.stringify(input.reviewerIds) : null,
         input.isUrgent ? 1 : 0, input.note ?? null],
      );
      await syncOutputStatus(input.outputId, "pending_review", ["draft", "approved"]);
      return { id: Number(r?.insertId ?? 0), status: "pending" as const };
    }),

  /**
   * 單一產出的最新審核狀態。
   *
   * 產出頁的送審按鈕需要它才誠實：沒有這支，按鈕永遠顯示「送審」，
   * 使用者會重複送、或不知道稿子已經被退回。
   */
  statusFor: protectedProcedure
    .input(z.object({ outputId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        // Only the author, the output's owner, or a named reviewer may read it.
        `SELECT q.id, q.status, q.requestedBy, q.reviewerIds, q.revisionNote, q.approvedAt, q.createdAt
           FROM mission_review_queue q
          WHERE q.outputId = ?
            AND (q.requestedBy = ?
                 OR JSON_CONTAINS(q.reviewerIds, CAST(? AS JSON))
                 OR EXISTS (SELECT 1 FROM mission_outputs o JOIN missions m ON m.id = o.missionId
                             WHERE o.id = q.outputId AND m.userId = ?))
          ORDER BY q.id DESC LIMIT 1`,
        [input.outputId, ctx.user!.id, String(ctx.user!.id), ctx.user!.id],
      );
      const r = (rows as any[])[0];
      if (!r) return null;
      return {
        id: Number(r.id),
        status: String(r.status),
        revisionNote: r.revisionNote ?? null,
        approvedAt: r.approvedAt ?? null,
        createdAt: r.createdAt,
        mine: Number(r.requestedBy) === ctx.user!.id,
        canApprove: await canApprove(ctx.user!.id, Number(r.requestedBy), parseReviewers(r.reviewerIds)),
      };
    }),

  /** 等我放行的（給主管看）。 */
  listPending: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT q.id, q.missionId, q.outputId, q.requestedBy, q.reviewType, q.status,
                q.reviewerIds, q.isUrgent, q.revisionNote, q.createdAt,
                o.title AS outputTitle, o.platform, o.outputType,
                u.name AS requesterName, u.email AS requesterEmail, ${REVIEW_TASK_COLS},
                m.brandId AS brandId, b.name AS brandName, LEFT(o.content, 600) AS contentHead,
                (SELECT sp.scheduledAt FROM scheduled_posts sp
                  WHERE sp.outputId = q.outputId AND sp.status = 'pending' ORDER BY sp.id DESC LIMIT 1) AS scheduledAt,
                (SELECT sp.platform FROM scheduled_posts sp
                  WHERE sp.outputId = q.outputId AND sp.status = 'pending' ORDER BY sp.id DESC LIMIT 1) AS scheduledPlatform
           FROM mission_review_queue q
           LEFT JOIN mission_outputs o ON o.id = q.outputId
           LEFT JOIN missions m ON m.id = q.missionId
           LEFT JOIN brands b ON b.id = m.brandId
           LEFT JOIN users u ON u.id = q.requestedBy
          WHERE q.status IN ('pending','in_review')
          ORDER BY q.isUrgent DESC, q.createdAt ASC
          LIMIT ${safeLimit(input?.limit)}`,
        [],
      );
      const out = [];
      for (const r of rows as any[]) {
        if (hiddenReview(r)) continue;
        if (await canApprove(userId, Number(r.requestedBy), parseReviewers(r.reviewerIds))) {
          out.push({ ...r, reviewerIds: parseReviewers(r.reviewerIds) });
        }
      }
      return out;
    }),

  /** 我送出去的（給小編看自己的稿在哪一關）。 */
  listMine: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT q.id, q.missionId, q.outputId, q.status, q.reviewType, q.revisionNote,
                q.approvedAt, q.createdAt, o.title AS outputTitle, o.platform, ${REVIEW_TASK_COLS}
           FROM mission_review_queue q
           LEFT JOIN mission_outputs o ON o.id = q.outputId
           LEFT JOIN missions m ON m.id = q.missionId
          WHERE q.requestedBy = ?
          ORDER BY q.createdAt DESC
          LIMIT ${safeLimit(input?.limit)}`,
        [ctx.user!.id],
      );
      return (rows as any[]).filter((r) => !hiddenReview(r));
    }),

  /** 待審數量，給側邊欄的紅點用。 */
  pendingCount: protectedProcedure.query(async ({ ctx }) => {
    const { default: localPool } = await import("../../localDb");
    try {
      const [rows]: any = await localPool.execute(
        `SELECT q.requestedBy, q.reviewerIds, o.platform, ${REVIEW_TASK_COLS}
           FROM mission_review_queue q
           LEFT JOIN mission_outputs o ON o.id = q.outputId
           LEFT JOIN missions m ON m.id = q.missionId
          WHERE q.status IN ('pending','in_review') LIMIT 200`,
      );
      let n = 0;
      for (const r of rows as any[]) {
        if (hiddenReview(r)) continue;
        if (await canApprove(ctx.user!.id, Number(r.requestedBy), parseReviewers(r.reviewerIds))) n++;
      }
      return n;
    } catch { return 0; }
  }),

  /** 放行。 */
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertReviewAllowed(ctx.user!.id);
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT requestedBy, reviewerIds, status, outputId FROM mission_review_queue WHERE id = ? LIMIT 1`,
        [input.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這筆審核。" });
      if (!(await canApprove(ctx.user!.id, Number(row.requestedBy), parseReviewers(row.reviewerIds)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你沒有放行這則產出的權限。" });
      }
      await localPool.execute(
        `UPDATE mission_review_queue SET status = 'approved', approvedAt = NOW() WHERE id = ?`,
        [input.id],
      );
      await syncOutputStatus(Number(row.outputId), "approved", ["draft", "pending_review"]);
      return { id: input.id, status: "approved" as const };
    }),

  /** 退回修改。一定要寫理由 —— 沒有理由的退件只會來回三次。 */
  requestRevision: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().min(2).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await assertReviewAllowed(ctx.user!.id);
      const { default: localPool } = await import("../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT requestedBy, reviewerIds, outputId FROM mission_review_queue WHERE id = ? LIMIT 1`,
        [input.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這筆審核。" });
      if (!(await canApprove(ctx.user!.id, Number(row.requestedBy), parseReviewers(row.reviewerIds)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你沒有退回這則產出的權限。" });
      }
      await localPool.execute(
        `UPDATE mission_review_queue SET status = 'revision_requested', revisionNote = ? WHERE id = ?`,
        [input.note, input.id],
      );
      await syncOutputStatus(Number(row.outputId), "draft", ["pending_review"]);
      return { id: input.id, status: "revision_requested" as const };
    }),
});
