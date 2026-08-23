/**
 * postFormatRouter — 貼文形式候選佇列的審核 API（admin only）。
 *
 * 2026-08-23 (CJ「候選佇列，你審核後才建卡」)
 *
 * 每月排程（op-scan-post-formats.yml → scripts/scan-post-formats.ts）把候選
 * 寫進 post_format_candidates，這裡負責讓人看與判斷。核准**不會**自動建卡：
 * 建一張卡要動 5 個地方（任務定義 / orchestra config / agent 指派 /
 * FB_TASK_REF / TASK_FORMAT_MAP）還要跑 probe E2E，30s SOP 寫明「失敗不上線」。
 * approved 的意思是「這個形式值得開卡」，開卡是下一段人做的事，做完回填
 * shippedTaskId 把佇列跟目錄接起來。
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import localPool from "../localDb";

const STATUS = z.enum(["pending", "approved", "rejected", "shipped"]);

function parseEvidence(raw: unknown): Array<{ title: string; url: string; observedAt?: string }> {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const postFormatRouter = router({
  /** 佇列內容 + 各狀態計數（給分頁標籤上的數字）。 */
  list: adminProcedure
    .input(z.object({
      status: STATUS.optional(),
      kind: z.enum(["format", "topic"]).optional(),
      market: z.string().max(8).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).default({ limit: 100 }))
    .query(async ({ input }) => {
      const where: string[] = [];
      const args: any[] = [];
      if (input.status) { where.push("status = ?"); args.push(input.status); }
      if (input.kind) { where.push("kind = ?"); args.push(input.kind); }
      if (input.market) { where.push("market = ?"); args.push(input.market.toUpperCase()); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows]: any = await localPool.execute(
        `SELECT id, platform, market, language, kind, name, nameEn, mechanism,
                whyItWorks, evidence, duplicateOf, status, seenCount,
                firstSeenAt, lastSeenAt, reviewNote, shippedTaskId
           FROM post_format_candidates
           ${clause}
          ORDER BY (status = 'pending') DESC, seenCount DESC, lastSeenAt DESC
          LIMIT ${input.limit}`,
        args,
      );

      const [counts]: any = await localPool.execute(
        `SELECT status, kind, COUNT(*) AS n FROM post_format_candidates GROUP BY status, kind`,
      );
      const [markets]: any = await localPool.execute(
        `SELECT market, COUNT(*) AS n FROM post_format_candidates GROUP BY market ORDER BY n DESC`,
      );

      return {
        items: (rows as any[]).map((r) => ({ ...r, evidence: parseEvidence(r.evidence) })),
        counts: (counts as any[]).map((c) => ({
          status: String(c.status), kind: String(c.kind), n: Number(c.n),
        })),
        markets: (markets as any[]).map((m) => ({ market: String(m.market), n: Number(m.n) })),
      };
    }),

  /**
   * 改狀態。shippedTaskId 只有在 status='shipped' 時才寫 —— 那是「卡真的開好
   * 上線了」的憑據，不該在只是核准時就填。
   */
  setStatus: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: STATUS,
      note: z.string().max(2000).optional(),
      shippedTaskId: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await localPool.execute(
        `UPDATE post_format_candidates
            SET status = ?,
                reviewNote = COALESCE(?, reviewNote),
                reviewedBy = ?,
                reviewedAt = CURRENT_TIMESTAMP(3),
                shippedTaskId = CASE WHEN ? = 'shipped' THEN ? ELSE shippedTaskId END
          WHERE id = ?`,
        [input.status, input.note ?? null, ctx.user!.id, input.status, input.shippedTaskId ?? null, input.id],
      );
      return { ok: true as const };
    }),
});
