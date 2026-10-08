/**
 * refineNotes — 「請 AI 改」的歷史修改意見（caption_refine_notes）。
 *
 * 2026-10-08（CJ「第一次請他減少故事感，改好了；再請他增加 CTA，故事感又很強。
 * 他似乎沒有辦法記錄我前幾次的意見。是否可呈現出歷史修改意見的紀錄」）：
 *
 * 活動視窗的「請 AI 改」每次只送當下那一句；成品頁有帶前幾句，但只活在開著的頁面裡，
 * 重新整理就沒了。兩邊也互相不知道對方改過什麼。
 *
 *   · 一列＝用戶對某一篇的某個版本提過的一句意見（加上 AI 當時說它改了什麼）。
 *   · 每次改寫都把還有效的意見接進 system prompt：這次只處理新的那一句，
 *     但成品不可以違反先前任何一條；直接衝突時以這次為準。
 *   · 用戶可以把某一條拿掉（removedAt）——之後的改寫就不再照它。列不刪，只是不再讀。
 *   · 存取一律經過 ownsOutput：成品的任務要是這個帳號的。
 *   · 這張表是輔助：讀寫失敗都不可以讓改寫本身失敗（回空陣列／安靜略過）。
 */
import localPool from "../../../localDb.js";

export const CAPTION_REFINE_NOTES_DDL = `
  CREATE TABLE IF NOT EXISTS caption_refine_notes (
    id           INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    outputId     INT            NOT NULL,
    variantKey   VARCHAR(24)    NOT NULL,
    userId       INT            NOT NULL,
    feedback     VARCHAR(1000)  NOT NULL,
    explanation  VARCHAR(600)   NULL,
    removedAt    DATETIME(3)    NULL,
    createdAt    DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_crn_output (outputId, variantKey, removedAt, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 一個版本最多帶幾條意見進 prompt（也是畫面列出的上限）。 */
export const MAX_ACTIVE_NOTES = 12;
/** 每條意見進 prompt 時最多幾個字。 */
const NOTE_PROMPT_CHARS = 300;

export interface RefineNote {
  id: number;
  feedback: string;
  explanation: string | null;
  createdAt: string;
}

export interface VariantSelector {
  variantIndex?: number;
  contentKind?: string;
  contentIndex?: number;
}

/** 這條意見是對哪個版本說的：跟畫面的 locator 同一套（一般版本 / 策略包的 planning、public）。 */
export function variantKeyOf(sel: VariantSelector): string {
  return sel.contentKind
    ? `${sel.contentKind}:${sel.contentIndex ?? 0}`
    : `legacy:${sel.variantIndex ?? 0}`;
}

/**
 * 接進 system prompt 的「先前的修改意見」。沒有意見就回空字串。
 * 舊的在前、新的在後——衝突時後面的贏，跟用戶的直覺一致。
 */
export function priorNotesBlock(notes: Array<Pick<RefineNote, "feedback">>): string {
  const lines = notes
    .map((n) => n.feedback.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(-MAX_ACTIVE_NOTES)
    .map((t, i) => `${i + 1}. ${t.length > NOTE_PROMPT_CHARS ? `${t.slice(0, NOTE_PROMPT_CHARS)}…` : t}`);
  if (!lines.length) return "";
  return [
    "",
    "【這篇先前已經提過的修改意見 —— 全部仍然有效】",
    ...lines,
    "目前的文案已經照上面這些意見改過。這次只處理用戶這一次提的意見，",
    "但改完的成品不可以違反上面任何一條（例如先前要求減少故事感，這次加 CTA 時就不能把故事感寫回來）。",
    "這次的意見如果跟先前某一條直接衝突，以這次為準。",
    "",
  ].join("\n");
}

/** 這篇成品是不是這個帳號的（跟 output.updateVariantCaption 同一個條件）。 */
export async function ownsOutput(outputId: number, userId: number): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT o.id FROM mission_outputs o JOIN missions m ON m.id = o.missionId
      WHERE o.id = ? AND m.userId = ? LIMIT 1`,
    [outputId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** 這個版本還有效的意見，舊→新。 */
export async function listRefineNotes(outputId: number, variantKey: string): Promise<RefineNote[]> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, feedback, explanation, createdAt FROM caption_refine_notes
        WHERE outputId = ? AND variantKey = ? AND removedAt IS NULL
        ORDER BY id DESC LIMIT ${MAX_ACTIVE_NOTES}`,
      [outputId, variantKey],
    );
    return (rows as any[]).reverse().map((r) => ({
      id: Number(r.id),
      feedback: String(r.feedback ?? ""),
      explanation: r.explanation ? String(r.explanation) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    }));
  } catch (e) {
    console.warn("[refineNotes] list failed:", (e as Error).message);
    return [];
  }
}

export async function addRefineNote(args: {
  outputId: number; variantKey: string; userId: number; feedback: string; explanation?: string | null;
}): Promise<void> {
  try {
    await localPool.execute(
      `INSERT INTO caption_refine_notes (outputId, variantKey, userId, feedback, explanation) VALUES (?, ?, ?, ?, ?)`,
      [args.outputId, args.variantKey, args.userId, args.feedback.slice(0, 1000), (args.explanation ?? "").slice(0, 600) || null],
    );
  } catch (e) {
    console.warn("[refineNotes] add failed:", (e as Error).message);
  }
}

/** 拿掉一條（之後的改寫不再照它）。回傳有沒有真的拿掉。 */
export async function removeRefineNote(noteId: number, userId: number): Promise<boolean> {
  const [res]: any = await localPool.execute(
    `UPDATE caption_refine_notes n
       JOIN mission_outputs o ON o.id = n.outputId
       JOIN missions m ON m.id = o.missionId
        SET n.removedAt = NOW(3)
      WHERE n.id = ? AND m.userId = ? AND n.removedAt IS NULL`,
    [noteId, userId],
  );
  return Number(res?.affectedRows ?? 0) > 0;
}
