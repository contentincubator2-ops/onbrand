/**
 * campaignChatStore — 活動頁對話存進資料庫（campaign_chat_messages）。
 *
 * 2026-10-02（CJ「對話要存到資料庫中」）：原本這串只記在瀏覽器（localStorage），
 * 換台電腦就沒了，而且「復原」用的修改前快照只活在開著的頁面裡，重新整理就不能復原。
 *
 *   · 一列＝畫面上的一則（使用者、團隊裡某一位、交棒／換人那一行）。
 *   · clientKey：畫面產的鍵，標「已復原」靠它，不用等伺服器回 id。
 *   · beforePlan／beforeBasis：那一則修改前的企劃與策略依據格子，復原用。讀回畫面時只給
 *     整檔活動最新那一次修改（復原會把企劃蓋回去，只有最新一次蓋回去不會吃掉後面的修改）。
 *   · 第一次載入時，畫面會把舊的 localStorage 對話補進來，之後就只讀資料庫。
 *
 * 2026-10-02（CJ「對話多了以後就很亂，也沒辦法告一個段落，版面很擠，也無法重新開啟對話」）：
 *   · 對話分成一段一段的「討論」（campaign_chat_threads）。結束這段→留標題與摘要（改了什麼），
 *     下一句就是新的一段；過去的討論列成清單，點一下重新打開接著談。
 *   · 一段放著超過一天沒動，下次打開就從新的一段開始（舊的那段在清單最上面，一鍵打開）。
 *   · 模型只讀目前這一段的對話，加上最近幾段的摘要——不用把三天前的來回全部塞進去。
 *   · threadId 是 NULL 的舊列（分段之前存的）第一次讀清單時收成一段。
 */
import localPool from "../../localDb.js";

/** 介面語言：伺服器自己產的字（預設標題、自動摘要）跟著它。 */
export type Lang = "zh" | "en";

export const CAMPAIGN_CHAT_DDL = `
  CREATE TABLE IF NOT EXISTS campaign_chat_messages (
    id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    eventId      INT           NOT NULL,
    userId       INT           NOT NULL,
    threadId     INT           NULL,
    clientKey    VARCHAR(40)   NOT NULL,
    role         VARCHAR(12)   NOT NULL,
    speaker      VARCHAR(16)   NULL,
    name         VARCHAR(60)   NULL,
    content      TEXT          NULL,
    proposal     MEDIUMTEXT    NULL,
    beforePlan   MEDIUMTEXT    NULL,
    beforeBasis  MEDIUMTEXT    NULL,
    truncated    TINYINT(1)    NOT NULL DEFAULT 0,
    undone       TINYINT(1)    NOT NULL DEFAULT 0,
    clearedAt    DATETIME(3)   NULL,
    createdAt    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_ccm_key (eventId, userId, clientKey),
    INDEX idx_ccm_event (eventId, userId, clearedAt, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const CAMPAIGN_CHAT_THREADS_DDL = `
  CREATE TABLE IF NOT EXISTS campaign_chat_threads (
    id         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    eventId    INT           NOT NULL,
    userId     INT           NOT NULL,
    title      VARCHAR(80)   NOT NULL DEFAULT '',
    summary    VARCHAR(600)  NULL,
    status     VARCHAR(8)    NOT NULL DEFAULT 'open',
    createdAt  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closedAt   DATETIME(3)   NULL,
    INDEX idx_cct_event (eventId, userId, updatedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 分段之前建的表沒有 threadId：補上欄位與索引。 */
export async function migrateCampaignChat(): Promise<void> {
  const [cols]: any = await localPool.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_chat_messages'`,
  );
  const have = new Set((cols as any[]).map((c) => String(c.COLUMN_NAME)));
  if (!have.has("threadId")) {
    await localPool.execute(`ALTER TABLE campaign_chat_messages ADD COLUMN threadId INT NULL AFTER userId`);
  }
  const [idx]: any = await localPool.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_chat_messages' AND INDEX_NAME = 'idx_ccm_thread'`,
  );
  if (!(idx as any[]).length) {
    await localPool.execute(`ALTER TABLE campaign_chat_messages ADD INDEX idx_ccm_thread (threadId, id)`);
  }
}

/** 一段讀回畫面時最多幾則（畫面也只顯示這麼多）。 */
export const CHAT_KEEP = 80;
/** 一則的上限：快照是整份企劃，40 篇大約 15KB；留足但擋住異常大的。 */
export const SNAPSHOT_MAX = 400_000;
/** 一段放著超過這麼久沒動，下次打開就從新的一段開始。 */
export const IDLE_MS = 24 * 3600_000;

export interface StoredChatMsg {
  key: string;
  role: "user" | "assistant" | "handoff";
  content: string;
  speaker?: string;
  name?: string;
  proposal?: unknown;
  before?: unknown;
  beforeBasis?: unknown;
  undone?: boolean;
  truncated?: boolean;
}

export interface ChatThread {
  id: number;
  title: string;
  summary: string | null;
  status: "open" | "closed";
  messageCount: number;
  changeCount: number;
  createdAt: string;
  updatedAt: string;
}

const json = (v: unknown): string | null => {
  if (v == null) return null;
  const s = JSON.stringify(v);
  return s.length > SNAPSHOT_MAX ? null : s;
};
const parse = (s: unknown): unknown => {
  if (s == null || s === "") return undefined;
  try { return JSON.parse(String(s)); } catch { return undefined; }
};
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : "");

/**
 * 資料列 → 畫面的訊息（純函式）。rows 要照 id 由舊到新。
 * snapshotKey：整檔最新一次還沒復原的修改；只有那一則帶快照。沒給就用 rows 裡最新的一則。
 */
export function rowsToMessages(rows: any[], snapshotKey?: string | null): StoredChatMsg[] {
  let lastChange = -1;
  if (snapshotKey === undefined) rows.forEach((r, i) => { if (r.proposal && !Number(r.undone)) lastChange = i; });
  else lastChange = rows.findIndex((r) => String(r.clientKey) === snapshotKey);
  return rows.map((r, i) => {
    const m: StoredChatMsg = {
      key: String(r.clientKey),
      role: (["user", "assistant", "handoff"].includes(r.role) ? r.role : "assistant") as StoredChatMsg["role"],
      content: String(r.content ?? ""),
    };
    if (r.speaker) m.speaker = String(r.speaker);
    if (r.name) m.name = String(r.name);
    const proposal = parse(r.proposal);
    if (proposal) m.proposal = proposal;
    if (Number(r.undone)) m.undone = true;
    if (Number(r.truncated)) m.truncated = true;
    if (i === lastChange) {
      const before = parse(r.beforePlan);
      const beforeBasis = parse(r.beforeBasis);
      if (before) m.before = before;
      if (beforeBasis) m.beforeBasis = beforeBasis;
    }
    return m;
  });
}

/** 一段的標題：第一句使用者說的話（純函式）。 */
export function threadTitle(firstUserText: string | null | undefined, lang: Lang = "zh"): string {
  const t = String(firstUserText ?? "").replace(/^\s*[@＠]\S+\s*/, "").replace(/\s+/g, " ").trim();
  if (!t) return lang === "en" ? "Discussion" : "討論";
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
}

/**
 * 打開對話卡時接哪一段（純函式）：最近動過、還開著、沒放超過一天的那段；都沒有就 null（新的一段）。
 */
export function pickCurrentThread(threads: Pick<ChatThread, "id" | "status" | "updatedAt">[], now = Date.now()): number | null {
  const t = threads.find((x) => x.status === "open");
  if (!t) return null;
  return now - new Date(t.updatedAt).getTime() > IDLE_MS ? null : t.id;
}

async function ownThread(eventId: number, userId: number, threadId: number): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM campaign_chat_threads WHERE id = ? AND eventId = ? AND userId = ? LIMIT 1`,
    [threadId, eventId, userId],
  );
  return (rows as any[]).length > 0;
}

/** 分段之前的舊列（threadId 是 NULL、沒清掉）收成一段。 */
async function adoptLegacy(eventId: number, userId: number): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id, role, content, createdAt FROM campaign_chat_messages
      WHERE eventId = ? AND userId = ? AND threadId IS NULL AND clearedAt IS NULL ORDER BY id ASC`,
    [eventId, userId],
  );
  const list = rows as any[];
  if (!list.length) return;
  const first = list.find((r) => r.role === "user");
  const last = list[list.length - 1];
  const [res]: any = await localPool.execute(
    `INSERT INTO campaign_chat_threads (eventId, userId, title, status, createdAt, updatedAt) VALUES (?, ?, ?, 'open', ?, ?)`,
    [eventId, userId, threadTitle(first?.content), list[0].createdAt, last.createdAt],
  );
  await localPool.execute(
    `UPDATE campaign_chat_messages SET threadId = ? WHERE eventId = ? AND userId = ? AND threadId IS NULL AND clearedAt IS NULL`,
    [res.insertId, eventId, userId],
  );
}

export async function listThreads(eventId: number, userId: number): Promise<{ threads: ChatThread[]; currentId: number | null }> {
  await adoptLegacy(eventId, userId);
  const [rows]: any = await localPool.execute(
    `SELECT t.id, t.title, t.summary, t.status, t.createdAt, t.updatedAt,
            COUNT(m.id) AS messageCount,
            SUM(CASE WHEN m.proposal IS NOT NULL AND m.undone = 0 THEN 1 ELSE 0 END) AS changeCount
       FROM campaign_chat_threads t
       LEFT JOIN campaign_chat_messages m ON m.threadId = t.id AND m.clearedAt IS NULL
      WHERE t.eventId = ? AND t.userId = ?
      GROUP BY t.id
     HAVING messageCount > 0
      ORDER BY t.updatedAt DESC
      LIMIT 50`,
    [eventId, userId],
  );
  const threads: ChatThread[] = (rows as any[]).map((r) => ({
    id: Number(r.id), title: String(r.title || "討論"), summary: r.summary ? String(r.summary) : null,
    status: r.status === "closed" ? "closed" : "open",
    messageCount: Number(r.messageCount) || 0, changeCount: Number(r.changeCount) || 0,
    createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
  }));
  return { threads, currentId: pickCurrentThread(threads) };
}

/** 一段的對話。只有整檔最新一次還沒復原的修改帶快照。 */
export async function listChat(eventId: number, userId: number, threadId: number): Promise<StoredChatMsg[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM (
       SELECT id, clientKey, role, speaker, name, content, proposal, beforePlan, beforeBasis, truncated, undone
         FROM campaign_chat_messages
        WHERE eventId = ? AND userId = ? AND threadId = ? AND clearedAt IS NULL
        ORDER BY id DESC LIMIT ${CHAT_KEEP}
     ) t ORDER BY id ASC`,
    [eventId, userId, threadId],
  );
  const [latest]: any = await localPool.execute(
    `SELECT clientKey FROM campaign_chat_messages
      WHERE eventId = ? AND userId = ? AND clearedAt IS NULL AND proposal IS NOT NULL AND undone = 0
      ORDER BY id DESC LIMIT 1`,
    [eventId, userId],
  );
  return rowsToMessages(rows as any[], (latest as any[])[0]?.clientKey ?? null);
}

/** 最近幾段已結束的討論的摘要（給模型當前情提要）。 */
export async function recentSummaries(eventId: number, userId: number, exceptThreadId: number | null, n = 3): Promise<string[]> {
  const [rows]: any = await localPool.execute(
    `SELECT title, summary FROM campaign_chat_threads
      WHERE eventId = ? AND userId = ? AND status = 'closed' AND id <> ? AND summary IS NOT NULL
      ORDER BY updatedAt DESC LIMIT ${Math.max(1, Math.min(5, n))}`,
    [eventId, userId, exceptThreadId ?? 0],
  );
  return (rows as any[]).reverse().map((r) => `「${r.title}」：${r.summary}`);
}

/**
 * 追加幾則。threadId 沒給就開新的一段（標題取第一句使用者的話），回傳這段的 id。
 * 同一個 clientKey 再送一次（重送、補匯入）不會重複。
 */
export async function appendChat(eventId: number, userId: number, threadId: number | null, msgs: StoredChatMsg[], lang: Lang = "zh"): Promise<{ threadId: number; added: number }> {
  let tid = threadId && (await ownThread(eventId, userId, threadId)) ? threadId : null;
  if (!tid) {
    // 開新的一段：還開著的舊段收起來（沒有手動結束的，用伺服器算的摘要）。
    await closeOpenThreads(eventId, userId, null, lang);
    const first = msgs.find((m) => m.role === "user");
    const [res]: any = await localPool.execute(
      `INSERT INTO campaign_chat_threads (eventId, userId, title, status) VALUES (?, ?, ?, 'open')`,
      [eventId, userId, threadTitle(first?.content, lang)],
    );
    tid = Number(res.insertId);
  }
  let n = 0;
  for (const m of msgs) {
    const [res]: any = await localPool.execute(
      `INSERT IGNORE INTO campaign_chat_messages
         (eventId, userId, threadId, clientKey, role, speaker, name, content, proposal, beforePlan, beforeBasis, truncated, undone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId, userId, tid, m.key.slice(0, 40), m.role, m.speaker?.slice(0, 16) ?? null, m.name?.slice(0, 60) ?? null,
        m.content.slice(0, 4000), json(m.proposal), json(m.before), json(m.beforeBasis),
        m.truncated ? 1 : 0, m.undone ? 1 : 0,
      ],
    );
    n += Number(res?.affectedRows ?? 0);
  }
  // 有人說話＝這段又活起來（重新打開的、或接著談的）。
  await localPool.execute(
    `UPDATE campaign_chat_threads SET updatedAt = CURRENT_TIMESTAMP(3), status = 'open', closedAt = NULL,
            title = IF(title IN ('討論', 'Discussion', ''), ?, title)
      WHERE id = ?`,
    [threadTitle(msgs.find((m) => m.role === "user")?.content, lang), tid],
  );
  return { threadId: tid, added: n };
}

/** 結束這段：留摘要（畫面算好的：改了什麼），之後的話就是新的一段。 */
export async function closeThread(eventId: number, userId: number, threadId: number, summary: string): Promise<void> {
  await localPool.execute(
    `UPDATE campaign_chat_threads SET status = 'closed', closedAt = CURRENT_TIMESTAMP(3), summary = ?
      WHERE id = ? AND eventId = ? AND userId = ?`,
    [summary.slice(0, 600) || null, threadId, eventId, userId],
  );
}

/**
 * 沒手動結束就被換掉的段（開了新的一段、打開了別段）：摘要用伺服器算——改了幾處＋最後一句回覆。
 * 手動結束的段已經有畫面算好的摘要，不覆蓋。
 */
async function closeOpenThreads(eventId: number, userId: number, exceptId: number | null, lang: Lang = "zh"): Promise<void> {
  const [open]: any = await localPool.execute(
    `SELECT id, summary FROM campaign_chat_threads WHERE eventId = ? AND userId = ? AND status = 'open' AND id <> ?`,
    [eventId, userId, exceptId ?? 0],
  );
  for (const t of open as any[]) {
    let summary: string | null = t.summary ?? null;
    if (!summary) {
      const [rows]: any = await localPool.execute(
        `SELECT role, content, proposal, undone FROM campaign_chat_messages WHERE threadId = ? AND clearedAt IS NULL ORDER BY id ASC`,
        [t.id],
      );
      summary = autoSummary(rows as any[], lang);
    }
    await localPool.execute(
      `UPDATE campaign_chat_threads SET status = 'closed', closedAt = CURRENT_TIMESTAMP(3), summary = ? WHERE id = ?`,
      [summary, t.id],
    );
  }
}

/** 伺服器版摘要（純函式）：改了幾處＋最後一句回覆的開頭。 */
export function autoSummary(rows: Array<{ role: string; content?: string | null; proposal?: string | null; undone?: number | boolean | null }>, lang: Lang = "zh"): string | null {
  if (!rows.length) return null;
  const changes = rows.filter((r) => r.proposal && !Number(r.undone)).length;
  const last = [...rows].reverse().find((r) => r.role === "assistant" && r.content)?.content ?? "";
  const gist = String(last).replace(/\s+/g, " ").trim().split(/(?<=[。！？!?])|(?<=\.)\s/)[0]!.slice(0, 80);
  const head = lang === "en"
    ? (changes ? `Changed the plan ${changes} time${changes > 1 ? "s" : ""}` : "Discussion only, no plan changes")
    : (changes ? `改了企劃 ${changes} 次` : "只有討論，沒改企劃");
  return [head, gist].filter(Boolean).join(lang === "en" ? " · " : "・");
}

/** 重新打開一段：其他還開著的收起來（同時只有一段在談）。 */
export async function reopenThread(eventId: number, userId: number, threadId: number, lang: Lang = "zh"): Promise<boolean> {
  if (!(await ownThread(eventId, userId, threadId))) return false;
  await closeOpenThreads(eventId, userId, threadId, lang);
  await localPool.execute(
    `UPDATE campaign_chat_threads SET status = 'open', closedAt = NULL, updatedAt = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [threadId],
  );
  return true;
}

/** 標「已復原」，快照一併清掉（復原過就不能再復原一次）。 */
export async function markUndone(eventId: number, userId: number, key: string): Promise<void> {
  await localPool.execute(
    `UPDATE campaign_chat_messages SET undone = 1, beforePlan = NULL, beforeBasis = NULL
      WHERE eventId = ? AND userId = ? AND clientKey = ?`,
    [eventId, userId, key],
  );
}
