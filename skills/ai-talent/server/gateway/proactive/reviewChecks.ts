/**
 * reviewChecks — 面向「審核與發布」：稿卡在審核、或快到發布時間卻還沒核准。
 *
 * 兩種事件，都只查資料庫、不叫模型：
 *   review_overdue      送審超過 24 小時還沒人放行 → 給能放行的人
 *   publish_unapproved  24 小時內要發、但還沒核准的排程 → 給排程的人；剩不到 2 小時標成急件
 *
 * 稿被放行、退回、取消排程或時間過了，這一拍就不再回報那個 key，
 * 事件由 proactiveStore.resolveGone 自己收掉。
 */
import localPool from "../../localDb";
import { isHiddenHistoryItem } from "../../platform/core/billing/planGate";
import { outputApprovalState, type ApprovalState } from "../../content/core/publishGate";
import type { NewProactiveEvent } from "./proactiveStore";
import { fmtTaipei } from "./proactiveTime";

export const REVIEW_OVERDUE_HOURS = 24;
export const PUBLISH_LOOKAHEAD_HOURS = 24;
export const PUBLISH_URGENT_HOURS = 2;

const PLATFORM_ZH: Record<string, string> = {
  facebook: "FB", instagram: "IG", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "電子報", website: "官網",
};
const platformZh = (p: unknown) => PLATFORM_ZH[String(p ?? "").toLowerCase()] ?? String(p ?? "");

const parseIds = (v: unknown): number[] => {
  let j: unknown = v;
  if (typeof v === "string") { try { j = JSON.parse(v); } catch { j = null; } }
  return Array.isArray(j) ? j.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
};

export interface OverdueReview {
  queueId: number; outputId: number; brandId: number; brandName: string; title: string; platform: string;
  requesterId: number; requesterName: string; createdAt: Date; scheduledAt: Date | null;
}

/** 純函式：一筆卡住的送審 → 給某位審核人的事件。 */
export function reviewOverdueEvent(r: OverdueReview, reviewerId: number, now: Date): NewProactiveEvent {
  const hours = Math.floor((now.getTime() - r.createdAt.getTime()) / 3_600_000);
  const waited = hours >= 48 ? `${Math.floor(hours / 24)} 天` : `${hours} 小時`;
  const bits = [
    r.requesterName ? `${r.requesterName} 送審` : "",
    r.brandName, platformZh(r.platform),
    r.scheduledAt ? `預計 ${fmtTaipei(r.scheduledAt)} 發布` : "",
  ].filter(Boolean);
  return {
    userId: reviewerId, brandId: r.brandId, aspect: "review", kind: "review_overdue",
    dedupeKey: `review:${r.queueId}`,
    title: `「${r.title || "未命名的稿"}」等你審核已經 ${waited}`,
    body: bits.join(" · "),
    payload: { queueId: r.queueId, outputId: r.outputId, requesterId: r.requesterId },
    navUrl: "/review",
  };
}

export interface UnapprovedPost {
  scheduledId: number; userId: number; brandId: number; brandName: string; outputId: number;
  title: string; platform: string; scheduledAt: Date;
}

const STATE_ZH: Record<Exclude<ApprovalState, "approved">, string> = {
  in_review: "還在審核中",
  revision_requested: "被退回修改，還沒重新送審",
  not_submitted: "還沒送審",
};

/** 純函式：一則還沒核准的排程 → 給排程者的事件。 */
export function publishUnapprovedEvent(p: UnapprovedPost, state: Exclude<ApprovalState, "approved">, now: Date): NewProactiveEvent {
  const hoursLeft = (p.scheduledAt.getTime() - now.getTime()) / 3_600_000;
  const urgent = hoursLeft <= PUBLISH_URGENT_HOURS;
  return {
    userId: p.userId, brandId: p.brandId, aspect: "review", kind: "publish_unapproved",
    dedupeKey: `sched:${p.scheduledId}`,
    urgency: urgent ? "urgent" : "normal",
    title: `${fmtTaipei(p.scheduledAt)} 要發的 ${platformZh(p.platform)} 貼文${STATE_ZH[state]}`,
    body: [p.brandName, p.title ? `「${p.title}」` : "", "沒核准的稿到時間不會自動發出去。"].filter(Boolean).join(" · "),
    payload: { scheduledId: p.scheduledId, outputId: p.outputId, state },
    navUrl: `/run/${p.outputId}`,
  };
}

/** 能放行這位送審者的人：指定了就是那幾位；沒指定＝同 workspace 的 owner／admin（不含送審者）。 */
async function reviewersFor(requesterId: number, named: number[]): Promise<number[]> {
  if (named.length) return named;
  const [rows]: any = await localPool.execute(
    `SELECT DISTINCT other.userId FROM workspace_members me
       JOIN workspace_members other ON other.workspaceId = me.workspaceId
      WHERE me.userId = ? AND other.userId <> ? AND other.role IN ('owner','admin')`,
    [requesterId, requesterId],
  );
  return (rows as any[]).map((r) => Number(r.userId));
}

export async function collectReviewEvents(now: Date): Promise<NewProactiveEvent[]> {
  const out: NewProactiveEvent[] = [];

  const [queue]: any = await localPool.execute(
    `SELECT q.id, q.outputId, q.requestedBy, q.reviewerIds, q.createdAt,
            o.title AS outputTitle, o.platform,
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')), 'null') AS taskId,
            m.workspace, m.brandId, b.name AS brandName, u.name AS requesterName, u.email AS requesterEmail,
            (SELECT sp.scheduledAt FROM scheduled_posts sp
              WHERE sp.outputId = q.outputId AND sp.status = 'pending' ORDER BY sp.id DESC LIMIT 1) AS scheduledAt
       FROM mission_review_queue q
       LEFT JOIN mission_outputs o ON o.id = q.outputId
       LEFT JOIN missions m ON m.id = q.missionId
       LEFT JOIN brands b ON b.id = m.brandId
       LEFT JOIN users u ON u.id = q.requestedBy
      WHERE q.status IN ('pending','in_review')
        AND q.createdAt < NOW(3) - INTERVAL ${REVIEW_OVERDUE_HOURS} HOUR
      ORDER BY q.createdAt ASC LIMIT 200`,
  );
  for (const r of queue as any[]) {
    if (isHiddenHistoryItem({ platform: r.platform, taskId: r.taskId }) || isHiddenHistoryItem({ platform: r.workspace })) continue;
    const row: OverdueReview = {
      queueId: Number(r.id), outputId: Number(r.outputId), brandId: Number(r.brandId ?? 0), brandName: String(r.brandName ?? ""),
      title: String(r.outputTitle ?? ""), platform: String(r.platform ?? ""),
      requesterId: Number(r.requestedBy), requesterName: String(r.requesterName ?? "") || String(r.requesterEmail ?? ""),
      createdAt: new Date(r.createdAt), scheduledAt: r.scheduledAt ? new Date(r.scheduledAt) : null,
    };
    for (const reviewerId of await reviewersFor(row.requesterId, parseIds(r.reviewerIds))) {
      out.push(reviewOverdueEvent(row, reviewerId, now));
    }
  }

  const [posts]: any = await localPool.execute(
    `SELECT sp.id, sp.userId, sp.brandId, sp.outputId, sp.platform, sp.scheduledAt,
            o.title AS outputTitle, m.title AS missionTitle, b.name AS brandName
       FROM scheduled_posts sp
       LEFT JOIN mission_outputs o ON o.id = sp.outputId
       LEFT JOIN missions m ON m.id = o.missionId
       LEFT JOIN brands b ON b.id = sp.brandId
      WHERE sp.status = 'pending'
        AND sp.scheduledAt > NOW(3)
        AND sp.scheduledAt <= NOW(3) + INTERVAL ${PUBLISH_LOOKAHEAD_HOURS} HOUR
      ORDER BY sp.scheduledAt ASC LIMIT 200`,
  );
  for (const r of posts as any[]) {
    if (isHiddenHistoryItem({ platform: r.platform })) continue;
    const state = await outputApprovalState(localPool, Number(r.outputId), Number(r.userId));
    if (state === "approved") continue;
    out.push(publishUnapprovedEvent({
      scheduledId: Number(r.id), userId: Number(r.userId), brandId: Number(r.brandId ?? 0), brandName: String(r.brandName ?? ""),
      outputId: Number(r.outputId), title: String(r.missionTitle ?? r.outputTitle ?? ""), platform: String(r.platform ?? ""),
      scheduledAt: new Date(r.scheduledAt),
    }, state, now));
  }
  return out;
}
