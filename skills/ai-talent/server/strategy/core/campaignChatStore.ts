/**
 * campaignChatStore — 活動頁對話存進資料庫（campaign_chat_messages）。
 *
 * 2026-10-02（CJ「對話要存到資料庫中」）：原本這串只記在瀏覽器（localStorage），
 * 換台電腦就沒了，而且「復原」用的修改前快照只活在開著的頁面裡，重新整理就不能復原。
 *
 *   · 一列＝畫面上的一則（使用者、團隊裡某一位、交棒／換人那一行）。
 *   · clientKey：畫面產的鍵，標「已復原」靠它，不用等伺服器回 id。
 *   · beforePlan／beforeBasis：那一則修改前的企劃與策略依據格子，復原用。只有帶修改的
 *     那幾則有；讀回畫面時只給最新那一次修改（只有最新一次能復原，其他的給了也用不到）。
 *   · 清掉這串＝標 clearedAt，不刪列（之後要查「當時怎麼改的」還找得到）。
 *   · 第一次載入時，畫面會把舊的 localStorage 對話補進來（importLocal），之後就只讀資料庫。
 */
import localPool from "../../localDb.js";

export const CAMPAIGN_CHAT_DDL = `
  CREATE TABLE IF NOT EXISTS campaign_chat_messages (
    id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    eventId      INT           NOT NULL,
    userId       INT           NOT NULL,
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

/** 讀回畫面時最多幾則（畫面也只顯示這麼多）。 */
export const CHAT_KEEP = 60;
/** 一則的上限：快照是整份企劃，40 篇大約 15KB；留足但擋住異常大的。 */
export const SNAPSHOT_MAX = 400_000;

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

const json = (v: unknown): string | null => {
  if (v == null) return null;
  const s = JSON.stringify(v);
  return s.length > SNAPSHOT_MAX ? null : s;
};
const parse = (s: unknown): unknown => {
  if (s == null || s === "") return undefined;
  try { return JSON.parse(String(s)); } catch { return undefined; }
};

/**
 * 資料列 → 畫面的訊息。只有最新一則「還沒復原的修改」帶快照（純函式）。
 * rows 要照 id 由舊到新。
 */
export function rowsToMessages(rows: any[]): StoredChatMsg[] {
  let lastChange = -1;
  rows.forEach((r, i) => { if (r.proposal && !Number(r.undone)) lastChange = i; });
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

export async function listChat(eventId: number, userId: number): Promise<StoredChatMsg[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM (
       SELECT id, clientKey, role, speaker, name, content, proposal, beforePlan, beforeBasis, truncated, undone
         FROM campaign_chat_messages
        WHERE eventId = ? AND userId = ? AND clearedAt IS NULL
        ORDER BY id DESC LIMIT ${CHAT_KEEP}
     ) t ORDER BY id ASC`,
    [eventId, userId],
  );
  return rowsToMessages(rows as any[]);
}

/** 追加幾則。同一個 clientKey 再送一次（重送、補匯入）不會重複。 */
export async function appendChat(eventId: number, userId: number, msgs: StoredChatMsg[]): Promise<number> {
  let n = 0;
  for (const m of msgs) {
    const [res]: any = await localPool.execute(
      `INSERT IGNORE INTO campaign_chat_messages
         (eventId, userId, clientKey, role, speaker, name, content, proposal, beforePlan, beforeBasis, truncated, undone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId, userId, m.key.slice(0, 40), m.role, m.speaker?.slice(0, 16) ?? null, m.name?.slice(0, 60) ?? null,
        m.content.slice(0, 4000), json(m.proposal), json(m.before), json(m.beforeBasis),
        m.truncated ? 1 : 0, m.undone ? 1 : 0,
      ],
    );
    n += Number(res?.affectedRows ?? 0);
  }
  return n;
}

/** 標「已復原」，快照一併清掉（復原過就不能再復原一次）。 */
export async function markUndone(eventId: number, userId: number, key: string): Promise<void> {
  await localPool.execute(
    `UPDATE campaign_chat_messages SET undone = 1, beforePlan = NULL, beforeBasis = NULL
      WHERE eventId = ? AND userId = ? AND clientKey = ?`,
    [eventId, userId, key],
  );
}

/** 清掉這串：標 clearedAt，不刪列。 */
export async function clearChat(eventId: number, userId: number): Promise<void> {
  await localPool.execute(
    `UPDATE campaign_chat_messages SET clearedAt = CURRENT_TIMESTAMP(3), beforePlan = NULL, beforeBasis = NULL
      WHERE eventId = ? AND userId = ? AND clearedAt IS NULL`,
    [eventId, userId],
  );
}
