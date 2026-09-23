/**
 * pushQueue — 推播的最後一段：誰真的收得到、由總部按下送出。
 *
 * 2026-09-23 (CJ)：「退訂就只針對該類訊息退訂」「總部看過清單再按」。
 *
 * ── 為什麼是「先看清單再按」而不是排程自動送 ─────────────────────────
 * CJ 的決定，而且理由站得住：送出去的訊息收不回來。展場期間資料還在變，
 * 自動送的東西一旦錯了，是業務對著客戶收拾。**自動化要等流程先跑順。**
 *
 * 所以這一支只做兩件事：算出「今天該送什麼、給誰」，以及在有人按下之後送出去。
 * 它自己不會挑時間、不會自己觸發。
 *
 * ── 退訂是逐類的，不是全有全無 ───────────────────────────────────────
 * 一個業務可能很需要補助消息，但不想收市場統計。全有全無的退訂會讓他為了
 * 擋掉一種而關掉全部——然後補助也錯過了。退訂記在 (rep, kind) 上。
 *
 * ── 「送不到」要在按之前就看得見 ─────────────────────────────────────
 * 沒綁 LINE 的業務、退訂了的業務，都會出現在清單上但標成送不到，並且寫明原因。
 * 按下送出之後才發現「其實只送到兩個人」，那個清單就沒有存在的意義。
 */

export type PushBlockReason = "opted_out" | "no_line_account";

export interface QueueRecipient {
  repId: number;
  name: string;
  deliverable: boolean;
  blockedBy: PushBlockReason | null;
}

export interface QueueEntry {
  factId: number;
  kind: string;
  market: string;
  title: { en: string; zh: string };
  /** 為什麼今天該送（factPush.dueToday 的判斷）。 */
  reason: string;
  recipients: QueueRecipient[];
  deliverable: number;
}

/** 這則消息的收件人清單，連送不到的人一起列出來。 */
export function buildRecipients(args: {
  audience: number[];
  reps: Array<{ id: number; name: string; lineUserId: string | null }>;
  optedOut: Set<number>;
}): QueueRecipient[] {
  const byId = new Map(args.reps.map((r) => [r.id, r]));
  return args.audience.map((id) => {
    const rep = byId.get(id);
    const name = rep?.name ?? `#${id}`;
    // 退訂優先於「沒綁帳號」：一個退訂了的人，就算之後綁了帳號也還是不該收到。
    if (args.optedOut.has(id)) return { repId: id, name, deliverable: false, blockedBy: "opted_out" as const };
    if (!rep?.lineUserId) return { repId: id, name, deliverable: false, blockedBy: "no_line_account" as const };
    return { repId: id, name, deliverable: true, blockedBy: null };
  });
}

// ── 退訂 ────────────────────────────────────────────────────────────────────

async function db() {
  const { default: localPool } = await import("../../../localDb");
  return localPool;
}

export async function listOptOuts(orgId: number): Promise<Array<{ repId: number; kind: string }>> {
  const [rows]: any = await (await db()).execute(
    `SELECT rep_id, kind FROM hub_push_optouts WHERE org_id = ?`,
    [orgId],
  );
  return (rows as any[]).map((r) => ({ repId: r.rep_id, kind: r.kind }));
}

export async function optOut(orgId: number, repId: number, kind: string): Promise<void> {
  await (await db()).execute(
    `INSERT IGNORE INTO hub_push_optouts (org_id, rep_id, kind) VALUES (?, ?, ?)`,
    [orgId, repId, kind],
  );
}

export async function optIn(orgId: number, repId: number, kind: string): Promise<void> {
  await (await db()).execute(
    `DELETE FROM hub_push_optouts WHERE org_id = ? AND rep_id = ? AND kind = ?`,
    [orgId, repId, kind],
  );
}

/**
 * 「停止補助」「取消市場統計」這類回覆 → 是哪一類。
 *
 * 刻意只認中文的那幾個詞，不做模糊比對：**認錯一個退訂比漏認一個糟得多**。
 * 漏認的話業務會再講一次（而且我們會回一句「你是不是想退訂？」）；認錯的話
 * 他以為自己退了某一類，結果退到另一類，下次還是收到——那會讓人不再相信退訂。
 */
const KIND_WORDS: Record<string, string[]> = {
  subsidy: ["補助", "subsidy", "subsidies"],
  market: ["市場", "統計", "market"],
  platform: ["平台", "platform"],
  regulation: ["法規", "regulation"],
  competitor: ["競品", "competitor"],
};

export function parseOptOut(text: string): { kind: string | null; intent: "stop" | "resume" | null } {
  const t = String(text ?? "").trim().toLowerCase();
  const stop = /停止|取消|退訂|unsubscribe|stop/.test(t);
  const resume = /恢復|重新訂閱|resume|subscribe/.test(t) && !stop;
  if (!stop && !resume) return { kind: null, intent: null };
  for (const [kind, words] of Object.entries(KIND_WORDS)) {
    if (words.some((w) => t.includes(w.toLowerCase()))) {
      return { kind, intent: stop ? "stop" : "resume" };
    }
  }
  // 說了「停止」但沒講哪一類 —— 不猜，交給呼叫端去問。
  return { kind: null, intent: stop ? "stop" : "resume" };
}

// ── 送出紀錄 ────────────────────────────────────────────────────────────────

export async function logPush(args: {
  orgId: number;
  factId: number;
  repId: number;
  actor: string;
  ok: boolean;
  detail?: string | null;
}): Promise<void> {
  await (await db()).execute(
    `INSERT INTO hub_push_log (org_id, fact_id, rep_id, actor, ok, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    [args.orgId, args.factId, args.repId, args.actor, args.ok ? 1 : 0, args.detail ?? null],
  );
}

export async function listPushLog(orgId: number, limit = 60): Promise<Array<{
  id: number; factId: number; repId: number; actor: string; ok: boolean; detail: string | null; createdAt: string;
}>> {
  const cap = Math.max(1, Math.min(200, Math.floor(limit)));
  const [rows]: any = await (await db()).execute(
    `SELECT id, fact_id, rep_id, actor, ok, detail, created_at FROM hub_push_log
      WHERE org_id = ? ORDER BY id DESC LIMIT ${cap}`,
    [orgId],
  );
  return (rows as any[]).map((r) => ({
    id: r.id, factId: r.fact_id, repId: r.rep_id, actor: r.actor,
    ok: Boolean(r.ok), detail: r.detail ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** 推播訊息的內容。每一則結尾都要有退訂指示 —— 沒有退訂就不該有推播。 */
export function pushText(args: {
  statement: string;
  sourceName: string;
  expiresOn: string | null;
  kindLabel: string;
  zh: boolean;
}): string {
  const lines = [
    args.zh ? `【${args.kindLabel}】` : `[${args.kindLabel}]`,
    args.statement,
  ];
  if (args.expiresOn) {
    lines.push(args.zh ? `截止：${args.expiresOn}` : `Deadline: ${args.expiresOn}`);
  }
  lines.push(args.zh ? `出處：${args.sourceName}` : `Source: ${args.sourceName}`);
  lines.push("");
  lines.push(
    args.zh
      ? `不想再收到這一類，回覆「停止${args.kindLabel}」。`
      : `Reply "stop ${args.kindLabel}" to stop receiving this category.`,
  );
  return lines.join("\n");
}
