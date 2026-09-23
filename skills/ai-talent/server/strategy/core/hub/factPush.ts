/**
 * factPush — 一則市場消息的推播設定。
 *
 * 2026-09-23 (CJ「要做推播，是由建置該消息的用戶，設定推播的銷售業務員群組
 * 還有頻率」)。
 *
 * ── 指名 vs 自動比對 ─────────────────────────────────────────────────
 * 預設用產業標籤自動比對（factRouting）。但建立消息的人可以**指名**一組業務，
 * 指名之後就以指名的為準——他比自動比對更清楚這則消息真正該給誰。
 *
 * 兩者不是互斥的選項而是有先後：沒指名就自動，指名了就聽人的。這樣新加的消息
 * 不必先設定就會動，而想精準控制的時候控制得住。
 *
 * ── 頻率只有四個 ─────────────────────────────────────────────────────
 * off / once / weekly / before_deadline。刻意不做 cron 表達式：這是行銷部的人
 * 在用的，而且真正需要的就這四種。before_deadline 是補助案唯一真正需要的那一種
 * ——截止前提醒，而不是每週吵一次。
 *
 * ── 這一支只決定「該不該送」，不送 ───────────────────────────────────
 * 送訊息給真人是另一件事，需要退訂機制與明確的授權。這裡算出來的結果會顯示在
 * 後台，實際發送還沒有接上。**沒接上就要說沒接上。**
 */
import { isLive, daysLeft } from "./industries";

export const CADENCES = ["off", "once", "weekly", "before_deadline"] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_LABELS: Record<Cadence, [en: string, zh: string]> = {
  off: ["Not pushed", "不推播"],
  once: ["Once, when it is added", "新增時推一次"],
  weekly: ["Weekly while it is open", "有效期間每週一次"],
  before_deadline: ["As the deadline approaches", "接近截止日時提醒"],
};

/** 截止前幾天開始提醒。三個節點，不是每天吵。 */
export const DEADLINE_REMINDERS = [30, 7, 1];

export interface PushSettings {
  cadence: Cadence;
  /** 指名的業務 id。空 = 用產業標籤自動比對。 */
  audience: number[];
  lastPushedAt: string | null;
}

export function readPushSettings(row: {
  push_cadence?: unknown;
  push_audience?: unknown;
  push_last_at?: unknown;
}): PushSettings {
  const raw = String(row?.push_cadence ?? "");
  const cadence = (CADENCES as readonly string[]).includes(raw) ? (raw as Cadence) : "off";
  let audience: number[] = [];
  const a = row?.push_audience;
  if (Array.isArray(a)) audience = a.map(Number).filter(Number.isFinite);
  else if (typeof a === "string") {
    try {
      const p = JSON.parse(a);
      if (Array.isArray(p)) audience = p.map(Number).filter(Number.isFinite);
    } catch { /* 壞掉的 JSON 當成沒指名 —— 退回自動比對，不要整則消息不見 */ }
  }
  return {
    cadence,
    audience,
    lastPushedAt: row?.push_last_at ? new Date(row.push_last_at as any).toISOString() : null,
  };
}

/**
 * 這則消息今天該不該送，以及送給誰。
 *
 * `autoAudience` 是產業比對算出來的結果（factRouting 的 repIds）。指名的名單
 * 優先，但**指名不能繞過時效**：過期的消息即使指名了也不送，理由跟自動比對
 * 那邊一樣——業務轉給客戶、客戶去申請才發現結束了。
 */
export function dueToday(args: {
  settings: PushSettings;
  autoAudience: number[];
  expiresOn: string | null;
  /** factRouting 已經判斷過「這則可不可以往外轉」（競品、待查證都排除）。 */
  forwardable: boolean;
  today: string;
}): { due: boolean; audience: number[]; reason: string } {
  const { settings, autoAudience, expiresOn, forwardable, today } = args;
  const audience = settings.audience.length ? settings.audience : autoAudience;

  if (settings.cadence === "off") return { due: false, audience, reason: "cadence is off" };
  if (!forwardable) return { due: false, audience, reason: "not forwardable (HQ-only or unverified)" };
  if (!isLive(expiresOn, today)) return { due: false, audience, reason: "past its deadline" };
  if (!audience.length) return { due: false, audience, reason: "nobody to send it to" };

  if (settings.cadence === "once") {
    return settings.lastPushedAt
      ? { due: false, audience, reason: "already sent once" }
      : { due: true, audience, reason: "first send" };
  }

  if (settings.cadence === "weekly") {
    const since = daysSince(settings.lastPushedAt, today);
    return since == null || since >= 7
      ? { due: true, audience, reason: since == null ? "first send" : `${since} days since the last one` }
      : { due: false, audience, reason: `sent ${since} day(s) ago` };
  }

  // before_deadline：沒有截止日就沒有意義，不要退化成每天送。
  const left = daysLeft(expiresOn, today);
  if (left == null) return { due: false, audience, reason: "no deadline to count down to" };
  if (!DEADLINE_REMINDERS.includes(left)) return { due: false, audience, reason: `${left} days left, not a reminder day` };
  const since = daysSince(settings.lastPushedAt, today);
  return since === 0
    ? { due: false, audience, reason: "already sent today" }
    : { due: true, audience, reason: `${left} days to the deadline` };
}

function daysSince(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
