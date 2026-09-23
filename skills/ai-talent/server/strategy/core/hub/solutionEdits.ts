/**
 * solutionEdits — 產品描述的編輯、審核與紀錄。
 *
 * 2026-09-23 (CJ)：
 *   1. 用戶可以編輯產品的名稱與簡介
 *   2. 用戶可以新增產品，並且有 AI 幫忙寫描述
 *   3. 編輯要有紀錄（誰、什麼時候），而且要有核准的權限管理
 *
 * ── 為什麼編輯不直接寫進 hub_solutions ───────────────────────────────
 * 直接寫的話，行銷部一改，**下一篇貼文立刻就用新描述**——那等於沒有核准這件事。
 * 所以提案存在 `pending` 這個 JSON 欄位裡，正式欄位不動；核准的時候才合併過去。
 * 業務與 AI 讀到的永遠是已核准的版本。這跟寫作技能（hub_skills 的 status /
 * approved_by / approved_at）是同一個模子。
 *
 * ── 為什麼價格不在可編輯範圍 ─────────────────────────────────────────
 * CJ 說的是「產品的描述內容，包括產品和簡介」。價格另外一條路：它是合規引擎
 * 唯一認的數字，改價要連帶處理「引用舊價的貼文變成過期」，不是一個文字編輯
 * 框該順手做的事。這支只動文字。
 *
 * ── 核准權限 ────────────────────────────────────────────────────────
 * hub_approvers 列出可以核准的人。**刻意允許這張表是空的**：空的時候退回
 * 「平台管理員可以核准」，不然第一次部署沒有人能核准任何東西，整個流程卡死。
 * 但只要有人被加進去，就只有名單上的人能核准。
 *
 * 提案人不能核准自己的提案——那是「作者自己核准」那個老問題，repo 裡已經
 * 記過一次（review 核准不擋任何東西，作者還能自己核准）。
 */
import localPool from "../../../localDb";

const TAIL = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

/** 可以被編輯的欄位。價格不在內，理由見檔頭。 */
export const EDITABLE_FIELDS = ["name_en", "name_zh", "summary_en", "summary_zh", "audience_en", "audience_zh"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type EditAction = "created" | "edited" | "approved" | "rejected" | "withdrawn";

const DDL = [
  // 提案欄位掛在方案本身：一個方案同時間只會有一份待審提案，不需要另一張表。
  `ALTER TABLE hub_solutions ADD COLUMN pending JSON NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN pending_by VARCHAR(160) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN pending_at DATETIME(3) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN updated_by VARCHAR(160) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN updated_at DATETIME(3) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN created_by VARCHAR(160) NULL`,
];

const TABLES = [
  `CREATE TABLE IF NOT EXISTS hub_solution_edits (
    id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id       INT          NOT NULL,
    solution_id  INT          NOT NULL,
    actor        VARCHAR(160) NOT NULL,
    action       VARCHAR(16)  NOT NULL,
    /** 這次動到哪些欄位，每個欄位的前後值。審核的人要看得到差異。 */
    changes      JSON         NULL,
    note         VARCHAR(400) NULL,
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_solution (solution_id, created_at),
    INDEX idx_org (org_id, created_at)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_approvers (
    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id     INT          NOT NULL,
    email      VARCHAR(160) NOT NULL,
    added_by   VARCHAR(160) NULL,
    created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_email (org_id, email)
  ) ${TAIL}`,
];

export async function ensureSolutionEditTables(): Promise<void> {
  for (const ddl of TABLES) await localPool.execute(ddl);
  // ALTER 沒有 IF NOT EXISTS，重跑會噴 duplicate column —— 那是預期的，吞掉。
  for (const ddl of DDL) {
    await localPool.execute(ddl).catch((e: any) => {
      if (!/duplicate column/i.test(String(e?.message ?? ""))) {
        console.warn("[solutionEdits] ddl:", e?.message ?? e);
      }
    });
  }
}

// ── 核准權限 ─────────────────────────────────────────────────────────────

export async function listApprovers(orgId: number): Promise<Array<{ id: number; email: string; addedBy: string | null }>> {
  const [rows]: any = await localPool.execute(
    `SELECT id, email, added_by FROM hub_approvers WHERE org_id = ? ORDER BY email`,
    [orgId],
  );
  return (rows as any[]).map((r) => ({ id: r.id, email: r.email, addedBy: r.added_by ?? null }));
}

export async function addApprover(orgId: number, email: string, addedBy: string): Promise<void> {
  await localPool.execute(
    `INSERT IGNORE INTO hub_approvers (org_id, email, added_by) VALUES (?, ?, ?)`,
    [orgId, email.trim().toLowerCase(), addedBy],
  );
}

export async function removeApprover(orgId: number, id: number): Promise<void> {
  await localPool.execute(`DELETE FROM hub_approvers WHERE id = ? AND org_id = ?`, [id, orgId]);
}

/**
 * 這個人能不能核准。
 *
 * 名單空的時候退回「平台管理員可以」——否則第一次部署沒有人核准得了任何東西。
 * 一旦名單上有人，就只認名單。
 */
export async function canApprove(orgId: number, email: string, isPlatformAdmin: boolean): Promise<boolean> {
  const approvers = await listApprovers(orgId);
  if (!approvers.length) return isPlatformAdmin;
  return approvers.some((a) => a.email === email.trim().toLowerCase());
}

// ── 編輯紀錄 ─────────────────────────────────────────────────────────────

export interface EditRecord {
  id: number;
  solutionId: number;
  actor: string;
  action: EditAction;
  changes: Array<{ field: string; from: string; to: string }>;
  note: string | null;
  createdAt: string;
}

export async function logEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
  action: EditAction;
  changes?: Array<{ field: string; from: string; to: string }>;
  note?: string | null;
}): Promise<void> {
  await localPool.execute(
    `INSERT INTO hub_solution_edits (org_id, solution_id, actor, action, changes, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [args.orgId, args.solutionId, args.actor, args.action, JSON.stringify(args.changes ?? []), args.note ?? null],
  );
}

export async function listEdits(orgId: number, solutionId?: number, limit = 50): Promise<EditRecord[]> {
  const cap = Math.max(1, Math.min(200, Math.floor(limit)));
  const [rows]: any = solutionId
    ? await localPool.execute(
        `SELECT id, solution_id, actor, action, changes, note, created_at FROM hub_solution_edits
          WHERE org_id = ? AND solution_id = ? ORDER BY id DESC LIMIT ${cap}`,
        [orgId, solutionId],
      )
    : await localPool.execute(
        `SELECT id, solution_id, actor, action, changes, note, created_at FROM hub_solution_edits
          WHERE org_id = ? ORDER BY id DESC LIMIT ${cap}`,
        [orgId],
      );
  return (rows as any[]).map((r) => ({
    id: r.id,
    solutionId: r.solution_id,
    actor: r.actor,
    action: r.action,
    changes: typeof r.changes === "string" ? safeJson(r.changes) : (r.changes ?? []),
    note: r.note ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ── 提案 / 核准 ──────────────────────────────────────────────────────────

/** 只留真的變了的欄位，並記下前後值給審核的人看。 */
export function diffFields(
  current: Record<string, any>,
  proposed: Partial<Record<EditableField, string>>,
): Array<{ field: EditableField; from: string; to: string }> {
  const out: Array<{ field: EditableField; from: string; to: string }> = [];
  for (const f of EDITABLE_FIELDS) {
    if (!(f in proposed)) continue;
    const to = String(proposed[f] ?? "").trim();
    const from = String(current[f] ?? "").trim();
    if (to !== from) out.push({ field: f, from, to });
  }
  return out;
}

export async function proposeEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
  proposed: Partial<Record<EditableField, string>>;
  note?: string;
}): Promise<{ changed: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT ${EDITABLE_FIELDS.join(", ")} FROM hub_solutions WHERE id = ? AND org_id = ? LIMIT 1`,
    [args.solutionId, args.orgId],
  );
  const current = (rows as any[])[0];
  if (!current) throw new Error("solution not found");

  const changes = diffFields(current, args.proposed);
  if (!changes.length) return { changed: 0 };

  const payload = Object.fromEntries(changes.map((c) => [c.field, c.to]));
  await localPool.execute(
    `UPDATE hub_solutions SET pending = ?, pending_by = ?, pending_at = NOW(3) WHERE id = ? AND org_id = ?`,
    [JSON.stringify(payload), args.actor, args.solutionId, args.orgId],
  );
  await logEdit({ orgId: args.orgId, solutionId: args.solutionId, actor: args.actor, action: "edited", changes, note: args.note ?? null });
  return { changed: changes.length };
}

export async function approveEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
}): Promise<{ applied: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT pending, pending_by, ${EDITABLE_FIELDS.join(", ")} FROM hub_solutions WHERE id = ? AND org_id = ? LIMIT 1`,
    [args.solutionId, args.orgId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error("solution not found");
  const pending = typeof row.pending === "string" ? safeJson(row.pending) : row.pending;
  if (!pending || !Object.keys(pending).length) return { applied: 0 };

  // 作者不能核准自己的提案 —— repo 裡踩過一次（review 核准不擋任何東西）。
  if (String(row.pending_by ?? "").toLowerCase() === args.actor.toLowerCase()) {
    throw new Error("You proposed this change — someone else has to approve it.");
  }

  const changes = diffFields(row, pending);
  const sets = Object.keys(pending)
    .filter((k) => (EDITABLE_FIELDS as readonly string[]).includes(k))
    .map((k) => `${k} = ?`);
  const params = Object.keys(pending)
    .filter((k) => (EDITABLE_FIELDS as readonly string[]).includes(k))
    .map((k) => String(pending[k] ?? ""));
  if (!sets.length) return { applied: 0 };

  await localPool.execute(
    `UPDATE hub_solutions SET ${sets.join(", ")}, pending = NULL, pending_by = NULL, pending_at = NULL,
            updated_by = ?, updated_at = NOW(3)
      WHERE id = ? AND org_id = ?`,
    [...params, args.actor, args.solutionId, args.orgId],
  );
  await logEdit({ orgId: args.orgId, solutionId: args.solutionId, actor: args.actor, action: "approved", changes });
  return { applied: changes.length };
}

export async function rejectEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
  note?: string;
}): Promise<void> {
  await localPool.execute(
    `UPDATE hub_solutions SET pending = NULL, pending_by = NULL, pending_at = NULL WHERE id = ? AND org_id = ?`,
    [args.solutionId, args.orgId],
  );
  await logEdit({ orgId: args.orgId, solutionId: args.solutionId, actor: args.actor, action: "rejected", note: args.note ?? null });
}

// ── 新增產品 ─────────────────────────────────────────────────────────────

export async function createSolution(args: {
  orgId: number;
  actor: string;
  nameEn: string;
  nameZh: string;
  vendor: string;
  category: string;
  summaryEn: string;
  summaryZh: string;
  sourceUrl?: string;
}): Promise<{ id: number; slug: string }> {
  const base = slugify(args.nameEn || args.nameZh);
  let slug = base;
  for (let i = 2; ; i++) {
    const [dupe]: any = await localPool.execute(
      `SELECT id FROM hub_solutions WHERE org_id = ? AND slug = ? LIMIT 1`,
      [args.orgId, slug],
    );
    if (!(dupe as any[]).length) break;
    slug = `${base}-${i}`;
  }

  const [ins]: any = await localPool.execute(
    `INSERT INTO hub_solutions
       (org_id, slug, name_en, name_zh, vendor, category, industries, summary_en, summary_zh, features,
        source_url, featured, is_asus, created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, '[]', ?, 0, ?, ?, ?, NOW(3))`,
    [
      args.orgId, slug, args.nameEn.trim(), args.nameZh.trim(), args.vendor.trim(), args.category.trim(),
      args.summaryEn.trim(), args.summaryZh.trim(), args.sourceUrl?.trim() || null,
      /asus|華碩/i.test(args.vendor) ? 1 : 0, args.actor, args.actor,
    ],
  );
  await logEdit({
    orgId: args.orgId,
    solutionId: ins.insertId,
    actor: args.actor,
    action: "created",
    note: `${args.nameEn || args.nameZh} — ${args.vendor}`,
  });
  // 新產品沒有價格，所以業務報不了價 —— 那是正確的預設，價格要另外走流程加。
  return { id: ins.insertId, slug };
}

function slugify(name: string): string {
  return (
    name.toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "solution"
  );
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
