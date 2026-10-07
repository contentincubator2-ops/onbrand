/**
 * proactiveStore — 「主動收件匣」的資料層：AI 主動做好、等人點頭的事。
 *
 * 2026-10-07（CJ「整個要有 instinct 的主動性」→「除了 A 以外，你就開始做」）。
 *
 * ── 一則事件是什麼 ────────────────────────────────────────────────────
 * 一位收件人（userId）、一個品牌、一件已經替他做好或查好的事，加上他可以按的動作。
 * 不是「提醒你該去做」——每一則都指向一個成品（排好的一週、卡住的那篇稿）。
 *
 * ── 三條界線 ──────────────────────────────────────────────────────────
 * 1. **同一件事只出現一次。** (userId, dedupeKey) 唯一；檢查器每一拍都可以重跑，
 *    已經存在的事件不會重開，被略過的也不會復活。
 * 2. **條件消失就自己收掉。** 檢查器回報「現在還成立的 key」，其餘同類的 open
 *    事件標成 resolved（稿被放行了、貼文已核准），不留一則按了沒反應的死卡。
 * 3. **收件匣是個人的。** 查詢一律以收件人為準，不跟著團隊身分切換；
 *    會動到品牌資料的動作另外檢查品牌權限（見 proactiveRouter）。
 */
import localPool from "../../localDb";

export const PROACTIVE_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS proactive_events (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId      INT          NOT NULL,
    brandId     INT          NOT NULL,
    aspect      VARCHAR(24)  NOT NULL,
    kind        VARCHAR(40)  NOT NULL,
    dedupeKey   VARCHAR(191) NOT NULL,
    urgency     VARCHAR(8)   NOT NULL DEFAULT 'normal',
    title       VARCHAR(255) NOT NULL,
    body        TEXT         NULL,
    payload     JSON         NULL,
    navUrl      VARCHAR(500) NULL,
    status      VARCHAR(12)  NOT NULL DEFAULT 'open',
    dueAt       DATETIME(3)  NULL,
    actedAt     DATETIME(3)  NULL,
    actedAction VARCHAR(24)  NULL,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_proactive_dedupe (userId, dedupeKey),
    KEY idx_proactive_inbox (userId, status, createdAt),
    KEY idx_proactive_kind (kind, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 每位收件人每天最多寄一封彙整信；有這列＝今天寄過了。 */
export const PROACTIVE_DIGESTS_DDL = `
  CREATE TABLE IF NOT EXISTS proactive_digests (
    userId    INT         NOT NULL,
    ymd       DATE        NOT NULL,
    items     INT         NOT NULL DEFAULT 0,
    sentAt    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (userId, ymd)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/**
 * 「這類不用再提醒」：有這一列＝這位用戶關掉了這一種事件（kind='digest'＝不收每日彙整信）。
 * 關掉之後檢查器照跑，只是不替這個人開事件；已經開著的留著讓他處理完。
 */
export const PROACTIVE_MUTES_DDL = `
  CREATE TABLE IF NOT EXISTS proactive_mutes (
    userId    INT         NOT NULL,
    kind      VARCHAR(40) NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (userId, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 行銷人員要顧的面向（規劃裡的 F1–F13）。先開用得到的，其餘做到再加。 */
export type ProactiveAspect = "rhythm" | "review" | "festival";
export type ProactiveKind = "week_plan_ready" | "review_overdue" | "publish_unapproved" | "festival_node";
export const PROACTIVE_KINDS: ProactiveKind[] = ["week_plan_ready", "review_overdue", "publish_unapproved", "festival_node"];
/** 偏好設定裡可以關掉的項目：每一種事件，加上每日彙整信。 */
export type MutableKind = ProactiveKind | "digest";
export type ProactiveUrgency = "normal" | "urgent";
export type ProactiveStatus = "open" | "done" | "dismissed" | "resolved" | "expired";

export interface NewProactiveEvent {
  userId: number;
  brandId: number;
  aspect: ProactiveAspect;
  kind: ProactiveKind;
  dedupeKey: string;
  urgency?: ProactiveUrgency;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  navUrl?: string;
  dueAt?: Date | null;
}

export interface ProactiveEventRow {
  id: number;
  userId: number;
  brandId: number;
  brandName: string;
  aspect: ProactiveAspect;
  kind: ProactiveKind;
  urgency: ProactiveUrgency;
  title: string;
  body: string;
  payload: Record<string, any>;
  navUrl: string;
  status: ProactiveStatus;
  dueAtIso: string | null;
  createdAtIso: string;
}

const parseJson = (v: unknown): Record<string, any> => {
  if (v && typeof v === "object") return v as Record<string, any>;
  if (typeof v === "string") { try { return JSON.parse(v) ?? {}; } catch { return {}; } }
  return {};
};

export function rowToEvent(r: any): ProactiveEventRow {
  return {
    id: Number(r.id), userId: Number(r.userId), brandId: Number(r.brandId), brandName: String(r.brandName ?? ""),
    aspect: r.aspect, kind: r.kind, urgency: r.urgency === "urgent" ? "urgent" : "normal",
    title: String(r.title ?? ""), body: String(r.body ?? ""), payload: parseJson(r.payload),
    navUrl: String(r.navUrl ?? ""), status: r.status,
    dueAtIso: r.dueAt ? new Date(r.dueAt).toISOString() : null,
    createdAtIso: new Date(r.createdAt).toISOString(),
  };
}

/**
 * 新增一則事件。收件人關掉了這一類、或已經有同一個 (userId, dedupeKey)，就什麼都不做並回 false——
 * 唯一的例外是還開著的事件變急了（排程時間逼近），那只更新急迫程度與內容。
 */
export async function createEvent(e: NewProactiveEvent): Promise<boolean> {
  if (await isMuted(e.userId, e.kind)) return false;
  const [r]: any = await localPool.execute(
    `INSERT INTO proactive_events (userId, brandId, aspect, kind, dedupeKey, urgency, title, body, payload, navUrl, dueAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title   = IF(status = 'open' AND VALUES(urgency) = 'urgent' AND urgency <> 'urgent', VALUES(title), title),
       body    = IF(status = 'open' AND VALUES(urgency) = 'urgent' AND urgency <> 'urgent', VALUES(body), body),
       urgency = IF(status = 'open' AND VALUES(urgency) = 'urgent', 'urgent', urgency)`,
    [
      e.userId, e.brandId, e.aspect, e.kind, e.dedupeKey.slice(0, 191), e.urgency ?? "normal",
      e.title.slice(0, 255), e.body ?? null, e.payload ? JSON.stringify(e.payload) : null,
      e.navUrl ? e.navUrl.slice(0, 500) : null, e.dueAt ?? null,
    ],
  );
  // mysql2：新增 affectedRows = 1；重複鍵且有改動 = 2；重複鍵沒改動 = 0。
  return Number(r?.affectedRows ?? 0) === 1;
}

/** 這個 key 有沒有出現過（任何狀態）。花錢的檢查器在動手前先問，免得白做一次。 */
export async function eventExists(userId: number, dedupeKey: string): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT 1 FROM proactive_events WHERE userId = ? AND dedupeKey = ? LIMIT 1`,
    [userId, dedupeKey.slice(0, 191)],
  );
  return (rows as any[]).length > 0;
}

/** 條件已經不成立的 open 事件 → resolved。stillTrue 是這一拍仍成立的 "userId|dedupeKey"。 */
export async function resolveGone(kinds: ProactiveKind[], stillTrue: Set<string>): Promise<number> {
  if (!kinds.length) return 0;
  const [rows]: any = await localPool.execute(
    `SELECT id, userId, dedupeKey FROM proactive_events
      WHERE status = 'open' AND kind IN (${kinds.map(() => "?").join(",")})`,
    kinds,
  );
  const gone = (rows as any[]).filter((r) => !stillTrue.has(`${r.userId}|${r.dedupeKey}`)).map((r) => Number(r.id));
  if (!gone.length) return 0;
  await localPool.execute(
    `UPDATE proactive_events SET status = 'resolved', actedAt = NOW(3)
      WHERE status = 'open' AND id IN (${gone.map(() => "?").join(",")})`,
    gone,
  );
  return gone.length;
}

/** 過了期限還沒人理的 → expired（排好的那一週已經過完）。 */
export async function expireOverdue(): Promise<number> {
  const [r]: any = await localPool.execute(
    `UPDATE proactive_events SET status = 'expired', actedAt = NOW(3)
      WHERE status = 'open' AND dueAt IS NOT NULL AND dueAt < NOW(3)`,
  );
  return Number(r?.affectedRows ?? 0);
}

const SELECT_EVENT = `
  SELECT e.*, b.name AS brandName
    FROM proactive_events e LEFT JOIN brands b ON b.id = e.brandId`;

export async function listOpen(userId: number, limit = 100): Promise<ProactiveEventRow[]> {
  const n = Math.min(200, Math.max(1, Math.trunc(limit) || 100));
  const [rows]: any = await localPool.execute(
    `${SELECT_EVENT}
      WHERE e.userId = ? AND e.status = 'open'
      ORDER BY (e.urgency = 'urgent') DESC, e.createdAt DESC
      LIMIT ${n}`,
    [userId],
  );
  return (rows as any[]).map(rowToEvent);
}

export async function countOpen(userId: number): Promise<{ open: number; urgent: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT COUNT(*) AS open, COALESCE(SUM(urgency = 'urgent'), 0) AS urgent
       FROM proactive_events WHERE userId = ? AND status = 'open'`,
    [userId],
  );
  const r = (rows as any[])[0] ?? {};
  return { open: Number(r.open ?? 0), urgent: Number(r.urgent ?? 0) };
}

/** 只拿收件人自己的那一則；別人的事件一律當作不存在。 */
export async function getOwn(userId: number, id: number): Promise<ProactiveEventRow | null> {
  const [rows]: any = await localPool.execute(`${SELECT_EVENT} WHERE e.id = ? AND e.userId = ? LIMIT 1`, [id, userId]);
  const r = (rows as any[])[0];
  return r ? rowToEvent(r) : null;
}

/** open → done／dismissed。回 false＝已經被處理過（另一個分頁、或條件先消失了）。 */
export async function closeEvent(userId: number, id: number, status: "done" | "dismissed", action: string): Promise<boolean> {
  const [r]: any = await localPool.execute(
    `UPDATE proactive_events SET status = ?, actedAt = NOW(3), actedAction = ?
      WHERE id = ? AND userId = ? AND status = 'open'`,
    [status, action.slice(0, 24), id, userId],
  );
  return Number(r?.affectedRows ?? 0) > 0;
}

/** 分析事件（error_log 的 level=info；讀錯誤的人要記得濾 level）。失敗不影響主流程。 */
export async function track(name: "created" | "acted" | "digest", userId: number, meta: Record<string, unknown>): Promise<void> {
  try {
    const { logError } = await import("../../platform/routers/opsRouter");
    void logError({ source: `proactive.${name}`, message: String(meta.kind ?? name), userId, meta, level: "info" });
  } catch { /* telemetry only */ }
}

// ─── 偏好：這類不用再提醒 ─────────────────────────────────────────────

export async function listMuted(userId: number): Promise<MutableKind[]> {
  try {
    const [rows]: any = await localPool.execute(`SELECT kind FROM proactive_mutes WHERE userId = ?`, [userId]);
    return (rows as any[]).map((r) => String(r.kind) as MutableKind);
  } catch { return []; } // 表還沒建：當作沒關任何一類
}

export async function isMuted(userId: number, kind: MutableKind): Promise<boolean> {
  try {
    const [rows]: any = await localPool.execute(`SELECT 1 FROM proactive_mutes WHERE userId = ? AND kind = ? LIMIT 1`, [userId, kind]);
    return (rows as any[]).length > 0;
  } catch { return false; }
}

export async function setMuted(userId: number, kind: MutableKind, muted: boolean): Promise<void> {
  if (muted) await localPool.execute(`INSERT IGNORE INTO proactive_mutes (userId, kind) VALUES (?, ?)`, [userId, kind]);
  else await localPool.execute(`DELETE FROM proactive_mutes WHERE userId = ? AND kind = ?`, [userId, kind]);
}

/** 最近處理掉的這一類事件，是不是連續 n 則都被按「不用」。是的話前端會問要不要整類關掉——不替用戶決定。 */
export async function dismissStreak(userId: number, kind: ProactiveKind, n = 3): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT status FROM proactive_events
      WHERE userId = ? AND kind = ? AND status IN ('done','dismissed')
      ORDER BY actedAt DESC, id DESC LIMIT ${Math.max(2, Math.min(10, Math.trunc(n)))}`,
    [userId, kind],
  );
  return (rows as any[]).length >= n && (rows as any[]).every((r) => r.status === "dismissed");
}
