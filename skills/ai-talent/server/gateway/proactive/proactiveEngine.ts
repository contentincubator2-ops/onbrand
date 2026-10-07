/**
 * proactiveEngine — 主動引擎的排程：定時跑各面向的檢查器，把結果寫成收件匣事件。
 *
 * 一拍做五件事，前三件只查資料庫：
 *   1. 過期的事件收掉
 *   2. 審核與發布（reviewChecks）——全部重算，新增的寫入、不再成立的收掉
 *   3. 每日彙整信（另一個開關）
 *   4. 發文節奏（weekPlanCheck）——要叫模型，一拍只排一個品牌
 *   5. 節慶檔期（festivalCheck）——要叫模型，一拍只想一個節點
 *
 * 預設關閉：該環境要設 PROACTIVE_ENGINE=on。它會替用戶的品牌排草稿、叫模型花錢，
 * 每個環境要自己決定打開。彙整信再多一道 PROACTIVE_DIGEST_EMAIL=on（會寄信給真的用戶）。
 */
import localPool from "../../localDb";
import { isRuntimeFeatureEnabled } from "../../platform/core/ops/runtimeSafety";
import { createEvent, expireOverdue, resolveGone, track, type NewProactiveEvent } from "./proactiveStore";
import { collectReviewEvents } from "./reviewChecks";
import { tickWeekPlan } from "./weekPlanCheck";
import { tickFestival } from "./festivalCheck";
import { taipeiParts } from "./proactiveTime";

const on = (v: string | undefined) => v?.trim().toLowerCase() === "on";

export function isProactiveEnabled(): boolean {
  return on(process.env.PROACTIVE_ENGINE);
}
export function isDigestEmailEnabled(): boolean {
  return isProactiveEnabled() && on(process.env.PROACTIVE_DIGEST_EMAIL) && isRuntimeFeatureEnabled("OUTBOUND_EMAIL_ENABLED");
}

async function writeAll(events: NewProactiveEvent[]): Promise<number> {
  let created = 0;
  for (const e of events) {
    try {
      if (await createEvent(e)) {
        created++;
        void track("created", e.userId, { kind: e.kind, aspect: e.aspect, brandId: e.brandId, urgency: e.urgency ?? "normal" });
      }
    } catch (err: any) {
      console.error(`[proactive] createEvent ${e.kind} failed:`, err?.message ?? err);
    }
  }
  return created;
}

/** 每日彙整的時段：台北早上 9 點到中午前。過了中午才出現的事留到明天。 */
export function inDigestWindow(now: Date): boolean {
  const { hour } = taipeiParts(now);
  return hour >= 9 && hour < 12;
}

export async function tickDigest(now: Date): Promise<number> {
  if (!isDigestEmailEnabled() || !inDigestWindow(now)) return 0;
  const { ymd } = taipeiParts(now);
  const [users]: any = await localPool.execute(
    `SELECT e.userId, u.email, u.name FROM proactive_events e
       JOIN users u ON u.id = e.userId
       LEFT JOIN proactive_digests d ON d.userId = e.userId AND d.ymd = ?
       LEFT JOIN proactive_mutes mu ON mu.userId = e.userId AND mu.kind = 'digest'
      WHERE e.status = 'open' AND d.userId IS NULL AND mu.userId IS NULL AND u.email IS NOT NULL
      GROUP BY e.userId, u.email, u.name LIMIT 20`,
    [ymd],
  );
  let sent = 0;
  for (const u of users as any[]) {
    const userId = Number(u.userId);
    const [items]: any = await localPool.execute(
      `SELECT e.title, e.urgency, b.name AS brandName FROM proactive_events e LEFT JOIN brands b ON b.id = e.brandId
        WHERE e.userId = ? AND e.status = 'open' ORDER BY (e.urgency = 'urgent') DESC, e.createdAt DESC LIMIT 50`,
      [userId],
    );
    if (!(items as any[]).length) continue;
    // 先佔位再寄：兩個行程同時跑，也只有一個寄得出去。寄失敗今天就不再試，寧可少一封也不要重複。
    const [claim]: any = await localPool.execute(
      `INSERT IGNORE INTO proactive_digests (userId, ymd, items) VALUES (?, ?, ?)`,
      [userId, ymd, (items as any[]).length],
    );
    if (!Number(claim?.affectedRows ?? 0)) continue;
    try {
      const { sendProactiveDigest } = await import("../../platform/auth/emailService");
      await sendProactiveDigest({
        to: String(u.email), name: String(u.name ?? "") || String(u.email),
        inboxUrl: `${process.env.APP_URL ?? "https://onbrand.sowork.ai"}/inbox`,
        items: (items as any[]).map((i) => ({ brandName: String(i.brandName ?? ""), title: String(i.title ?? ""), urgent: i.urgency === "urgent" })),
      });
      sent++;
      void track("digest", userId, { kind: "digest", items: (items as any[]).length });
    } catch (err: any) {
      console.error(`[proactive] digest to user ${userId} failed:`, err?.message ?? err);
    }
  }
  return sent;
}

export async function tickProactive(now: Date = new Date()): Promise<{ created: number; resolved: number; expired: number; digests: number }> {
  const out = { created: 0, resolved: 0, expired: 0, digests: 0 };
  if (!isProactiveEnabled()) return out;

  out.expired = await expireOverdue().catch(() => 0);

  try {
    const review = await collectReviewEvents(now);
    out.created += await writeAll(review);
    out.resolved = await resolveGone(["review_overdue", "publish_unapproved"], new Set(review.map((e) => `${e.userId}|${e.dedupeKey}`)));
  } catch (err: any) {
    console.error("[proactive] review checks failed:", err?.message ?? err);
  }

  out.digests = await tickDigest(now).catch((err) => { console.error("[proactive] digest failed:", err?.message ?? err); return 0; });

  try {
    out.created += await tickWeekPlan(now);
  } catch (err: any) {
    console.error("[proactive] week plan failed:", err?.message ?? err);
  }

  try {
    const f = await tickFestival(now);
    out.created += f.created;
    out.resolved += await resolveGone(["festival_node"], f.stillTrue);
  } catch (err: any) {
    console.error("[proactive] festival failed:", err?.message ?? err);
  }
  return out;
}
