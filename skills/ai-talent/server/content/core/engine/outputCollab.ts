/**
 * outputCollab — 作品頁右欄的「紀錄」與「留言」兩個分頁（2026-10-09）。
 *
 * CJ「你還缺乏了每次對話修改紀錄，還有其他人的意見區」。
 *
 *   caption_edit_log   一列＝AI 對某一篇的某個版本做的一次修改：誰、請它做什麼、它說改了什麼、
 *                      改之前與改之後的全文。畫面上每一列都能「回到這次修改之前」。
 *                      只記 AI 動的（請他改／換個寫法／換口氣／照留言改／還原），
 *                      用戶自己打字是每 1.2 秒自動存一次，記了只會洗版。
 *   output_comments    一列＝團隊成員對某一篇的某個版本留的一句意見。可以標成已處理、
 *                      可以一鍵交給 AI 照著改；刪除只有留言的人自己能做。
 *
 * 跟 refineNotes 的差別：refineNotes 是「AI 之後每次改寫都要照著的規則」，這裡是「發生過什麼」。
 * 存取一律先過 ownsOutput（團隊成員操作時 ctx.user 已換成品牌擁有者，見 teamAccess）。
 * 兩張表都是輔助：寫入失敗不可以讓存檔失敗。
 */
import localPool from "../../../localDb.js";

export const CAPTION_EDIT_LOG_DDL = `
  CREATE TABLE IF NOT EXISTS caption_edit_log (
    id             INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    outputId       INT            NOT NULL,
    variantKey     VARCHAR(24)    NOT NULL,
    actorId        INT            NOT NULL,
    actorName      VARCHAR(80)    NULL,
    kind           VARCHAR(16)    NOT NULL,
    ask            VARCHAR(1000)  NULL,
    explanation    VARCHAR(600)   NULL,
    captionBefore  MEDIUMTEXT     NULL,
    captionAfter   MEDIUMTEXT     NULL,
    createdAt      DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_cel_output (outputId, variantKey, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const OUTPUT_COMMENTS_DDL = `
  CREATE TABLE IF NOT EXISTS output_comments (
    id          INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    outputId    INT            NOT NULL,
    variantKey  VARCHAR(24)    NOT NULL,
    authorId    INT            NOT NULL,
    authorName  VARCHAR(80)    NULL,
    body        VARCHAR(2000)  NOT NULL,
    resolvedAt  DATETIME(3)    NULL,
    resolvedBy  INT            NULL,
    deletedAt   DATETIME(3)    NULL,
    createdAt   DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_oc_output (outputId, variantKey, deletedAt, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** chat＝請他改；restyle＝換個寫法；voice＝換口氣；comment＝照留言改；restore＝還原到某次修改之前。 */
export const EDIT_KINDS = ["chat", "restyle", "voice", "comment", "restore"] as const;
export type EditKind = (typeof EDIT_KINDS)[number];

/** 畫面一次列幾筆（新的在前）。 */
export const MAX_LOG_ROWS = 40;
export const MAX_COMMENT_ROWS = 80;
export const COMMENT_MAX_CHARS = 2000;

export interface EditLogRow {
  id: number;
  actorName: string | null;
  kind: EditKind;
  ask: string | null;
  explanation: string | null;
  /** 改之前的全文；還原用。 */
  captionBefore: string;
  createdAt: string;
}

export interface CommentRow {
  id: number;
  authorId: number;
  authorName: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));

/** 文字有沒有真的變（只差頭尾空白不算一次修改）。 */
export function isRealChange(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

/** 顯示用的名字：有名字用名字，沒有就用信箱 @ 前面那段。 */
export function displayNameOf(u: { name?: string | null; email?: string | null } | null | undefined): string | null {
  const name = (u?.name ?? "").trim();
  if (name) return name.slice(0, 80);
  const local = (u?.email ?? "").split("@")[0]?.trim();
  return local ? local.slice(0, 80) : null;
}

export async function actorNameOf(userId: number): Promise<string | null> {
  try {
    const [rows]: any = await localPool.execute(`SELECT name, email FROM users WHERE id = ? LIMIT 1`, [userId]);
    return displayNameOf(rows?.[0]);
  } catch {
    return null;
  }
}

export async function addEditLog(args: {
  outputId: number; variantKey: string; actorId: number; kind: EditKind;
  ask?: string | null; explanation?: string | null; before: string; after: string;
}): Promise<void> {
  if (!isRealChange(args.before, args.after)) return;
  try {
    await localPool.execute(
      `INSERT INTO caption_edit_log (outputId, variantKey, actorId, actorName, kind, ask, explanation, captionBefore, captionAfter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.outputId, args.variantKey, args.actorId, await actorNameOf(args.actorId), args.kind,
        (args.ask ?? "").slice(0, 1000) || null, (args.explanation ?? "").slice(0, 600) || null,
        args.before, args.after,
      ],
    );
  } catch (e) {
    console.warn("[outputCollab] edit log failed:", (e as Error).message);
  }
}

/** 這個版本的修改紀錄，新→舊。 */
export async function listEditLog(outputId: number, variantKey: string): Promise<EditLogRow[]> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, actorName, kind, ask, explanation, captionBefore, createdAt FROM caption_edit_log
        WHERE outputId = ? AND variantKey = ? ORDER BY id DESC LIMIT ${MAX_LOG_ROWS}`,
      [outputId, variantKey],
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      actorName: r.actorName ? String(r.actorName) : null,
      kind: (EDIT_KINDS as readonly string[]).includes(r.kind) ? r.kind : "chat",
      ask: r.ask ? String(r.ask) : null,
      explanation: r.explanation ? String(r.explanation) : null,
      captionBefore: String(r.captionBefore ?? ""),
      createdAt: iso(r.createdAt),
    }));
  } catch (e) {
    console.warn("[outputCollab] edit log list failed:", (e as Error).message);
    return [];
  }
}

/** 這個版本的留言，舊→新（像對話一樣往下讀）。 */
export async function listComments(outputId: number, variantKey: string): Promise<CommentRow[]> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, authorId, authorName, body, resolvedAt, createdAt FROM output_comments
        WHERE outputId = ? AND variantKey = ? AND deletedAt IS NULL ORDER BY id DESC LIMIT ${MAX_COMMENT_ROWS}`,
      [outputId, variantKey],
    );
    return (rows as any[]).reverse().map((r) => ({
      id: Number(r.id),
      authorId: Number(r.authorId),
      authorName: r.authorName ? String(r.authorName) : null,
      body: String(r.body ?? ""),
      resolved: !!r.resolvedAt,
      createdAt: iso(r.createdAt),
    }));
  } catch (e) {
    console.warn("[outputCollab] comments list failed:", (e as Error).message);
    return [];
  }
}

export async function addComment(args: { outputId: number; variantKey: string; authorId: number; body: string }): Promise<number> {
  const [res]: any = await localPool.execute(
    `INSERT INTO output_comments (outputId, variantKey, authorId, authorName, body) VALUES (?, ?, ?, ?, ?)`,
    [args.outputId, args.variantKey, args.authorId, await actorNameOf(args.authorId), args.body.trim().slice(0, COMMENT_MAX_CHARS)],
  );
  return Number(res?.insertId ?? 0);
}

/** 留言屬於哪一篇（給呼叫端過 ownsOutput）。找不到回 null。 */
export async function commentOutputId(commentId: number): Promise<{ outputId: number; authorId: number } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT outputId, authorId FROM output_comments WHERE id = ? AND deletedAt IS NULL LIMIT 1`, [commentId]);
  const r = rows?.[0];
  return r ? { outputId: Number(r.outputId), authorId: Number(r.authorId) } : null;
}

export async function setCommentResolved(commentId: number, resolved: boolean, byUserId: number): Promise<void> {
  if (resolved) {
    await localPool.execute(`UPDATE output_comments SET resolvedAt = NOW(3), resolvedBy = ? WHERE id = ?`, [byUserId, commentId]);
  } else {
    await localPool.execute(`UPDATE output_comments SET resolvedAt = NULL, resolvedBy = NULL WHERE id = ?`, [commentId]);
  }
}

export async function deleteComment(commentId: number): Promise<void> {
  await localPool.execute(`UPDATE output_comments SET deletedAt = NOW(3) WHERE id = ?`, [commentId]);
}
