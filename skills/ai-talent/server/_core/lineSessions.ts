/**
 * lineSessions — LINE 使用者目前走到哪一個流程的哪一步。
 *
 * 2026-09-18。一個 LINE 使用者同時只會在一個流程裡，所以 lineUserId 就是主鍵，
 * 開新流程直接覆蓋舊的 —— 她按了「FB文案」又改按「IG文案」，意思很清楚是換一個，
 * 不是要並行兩個。
 *
 * ── 為什麼是資料表而不是記憶體 ────────────────────────────────────────────
 * 記憶體的 Map 會在每次部署後蒸發。使用者按了按鈕、正在打字、這時我們發版，
 * 她送出的內容就會變成「認不得的訊息」然後收到一份選單 —— 而且她永遠不會知道
 * 發生什麼事，只覺得這東西很怪。部署是常態，不是例外。
 *
 * ── 逾時 ──────────────────────────────────────────────────────────────────
 * 昨天按了「FB文案」沒回，今天打招呼不該被當成昨天那則的素材。超過
 * SESSION_TTL_MS 的 session 視同不存在。不主動刪除，讀的時候判斷就好 ——
 * 少一個排程，而且留著對查問題有幫助。
 */
import localPool from "../localDb";

export const SESSION_TTL_MS = 30 * 60_000; // 30 分鐘

export interface LineSession {
  lineUserId: string;
  flowId: string;
  step: string;
  data: Record<string, string>;
  updatedAt: Date;
}

function parseData(raw: unknown): Record<string, string> {
  if (!raw) return {};
  const obj = typeof raw === "string" ? safeJson(raw) : raw;
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** 逾時的 session 一律當作不存在。讀不到或出錯也回 null —— 最壞情況是重新開始。 */
export async function getSession(lineUserId: string): Promise<LineSession | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT lineUserId, flowId, step, data, updatedAt
         FROM line_sessions WHERE lineUserId = ? LIMIT 1`,
      [lineUserId],
    );
    const r = rows?.[0];
    if (!r) return null;
    const updatedAt = r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    if (Date.now() - updatedAt.getTime() > SESSION_TTL_MS) return null;
    return {
      lineUserId: String(r.lineUserId),
      flowId: String(r.flowId),
      step: String(r.step),
      data: parseData(r.data),
      updatedAt,
    };
  } catch (e: any) {
    console.error("[line] getSession failed:", e?.message ?? e);
    return null;
  }
}

export async function setSession(
  lineUserId: string,
  flowId: string,
  step: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    await localPool.execute(
      `INSERT INTO line_sessions (lineUserId, flowId, step, data)
            VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
            flowId = VALUES(flowId), step = VALUES(step), data = VALUES(data)`,
      [lineUserId, flowId, step, JSON.stringify(data)],
    );
  } catch (e: any) {
    // 寫不進去不該讓整條回覆掛掉 —— 她至少還是會收到引導句，
    // 只是下一則訊息會被當成新的開始。
    console.error("[line] setSession failed:", e?.message ?? e);
  }
}

export async function clearSession(lineUserId: string): Promise<void> {
  try {
    await localPool.execute(`DELETE FROM line_sessions WHERE lineUserId = ?`, [lineUserId]);
  } catch (e: any) {
    console.error("[line] clearSession failed:", e?.message ?? e);
  }
}
