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
 * ── 價格也可以編輯了，但走的是版本，不是覆寫 ────────────────────────
 * 2026-09-23 CJ「編輯的功能，要可以編輯產品現在呈現的每個欄位」——包含價格。
 * 我原本把它排除在外，理由是改價會讓引用舊價的貼文變成過期。那個顧慮還在，
 * 處理方式是**不覆寫**：核准的時候把舊價的 effective_to 設成昨天、插入一筆
 * 今天生效的新價。hub_prices 本來就是這樣設計的（effective_from / effective_to），
 * 只是先前沒有任何地方真的用到它。
 *
 * 誠實地說清楚目前的極限：**「引用舊價的貼文自動標記為過期」還沒有實作**。
 * 價格的歷史留住了，所以之後要回頭算得出來；但今天改價不會去回標既有貼文。
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
import { normaliseProfile, profileToText, type SolutionProfile } from "./solutionProfile";

/**
 * 純文字／布林欄位。2026-09-23 CJ「編輯的功能，要可以編輯產品現在呈現的每個
 * 欄位」，所以從原本的六個擴到涵蓋卡片與 modal 上看得到的全部。
 */
export const EDITABLE_FIELDS = [
  "name_en", "name_zh", "vendor", "category",
  "summary_en", "summary_zh", "audience_en", "audience_zh",
  "source_url", "featured",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * 結構化欄位：特色與價格。它們是陣列，逐欄比對沒有意義，所以正規化成一行一筆
 * 的文字再比——紀錄看得懂，審核的人也看得出哪一行動了。
 */
export const STRUCTURED_FIELDS = ["features", "prices", "profile"] as const;
export type StructuredField = (typeof STRUCTURED_FIELDS)[number];

export interface FeatureRow { en: string; zh: string }
export interface PriceRow {
  planEn: string;
  planZh: string;
  amount: number | null;
  billing: "month" | "year" | "one_time" | "quote";
  startsFrom: boolean;
}

/** 一行一筆的可讀形式。diff 與紀錄都用這個。 */
export function featuresToText(rows: FeatureRow[]): string {
  return rows
    .map((r) => `${String(r?.en ?? "").trim()} | ${String(r?.zh ?? "").trim()}`)
    .filter((l) => l !== " | ")
    .join("\n");
}

export function pricesToText(rows: PriceRow[]): string {
  return rows
    .map((r) => {
      const amt = r?.amount == null || r?.billing === "quote" ? "quote" : String(r.amount);
      return `${String(r?.planEn ?? "").trim()} | ${String(r?.planZh ?? "").trim()} | ${amt} | ${r?.billing ?? "quote"}${r?.startsFrom ? " | from" : ""}`;
    })
    .filter((l) => !l.startsWith(" |  | "))
    .join("\n");
}

export type EditAction = "created" | "edited" | "approved" | "rejected" | "withdrawn";

/**
 * 這裡用到的資料表與欄位（hub_solution_edits、hub_approvers、hub_solutions 上
 * 那七個後加的欄位）**定義在 platform/core/hub/hubDdl.ts**，不在這裡。
 *
 * 原因是 2026-09-23 的一次部署失敗：schema 原本由這支的懶載入負責，只有 tRPC
 * 請求會觸發，而 hub-seed.ts 在部署時就要讀 `profile` 欄位——部署直接中止，
 * 站上留在上一版。schema 屬於啟動路徑，不屬於請求路徑。
 *
 * 這支保留同名函式，是因為 router 有七處在呼叫；它現在就是 ensureHubTables()。
 */
export async function ensureSolutionEditTables(): Promise<void> {
  const { ensureHubTables } = await import("../../../platform/core/hub/hubDdl");
  await ensureHubTables();
}

// ── 核准權限 ─────────────────────────────────────────────────────────────

export interface Approver {
  id: number;
  email: string;
  addedBy: string | null;
  /**
   * 這個 email 在系統裡有沒有帳號。
   *
   * 2026-09-23 加的，因為名單是純文字比對：打錯一個字母，那一列看起來好好的，
   * 但那個人永遠登不進來、也就永遠核准不了任何東西。而且名單只要非空就會把
   * 平台管理員擋在外面——一個打錯的 email 可以讓整個組織沒有人能核准。
   * 這件事必須在畫面上看得到，不能等到有人按不下核准才發現。
   */
  hasLogin: boolean;
}

export async function listApprovers(orgId: number): Promise<Approver[]> {
  const [rows]: any = await localPool.execute(
    `SELECT id, email, added_by FROM hub_approvers WHERE org_id = ? ORDER BY email`,
    [orgId],
  );
  const list = (rows as any[]).map((r) => ({ id: r.id, email: r.email, addedBy: r.added_by ?? null }));
  if (!list.length) return [];

  // 分開查而不是 LEFT JOIN LOWER(u.email)：欄位是 utf8mb4_unicode_ci（不分大小寫），
  // 所以 IN 直接命中 email 的索引；包一層 LOWER() 反而會讓索引用不到。
  const [users]: any = await localPool.execute(
    `SELECT email FROM users WHERE email IN (${list.map(() => "?").join(", ")})`,
    list.map((a) => a.email),
  );
  const known = new Set((users as any[]).map((u) => String(u.email).trim().toLowerCase()));
  return list.map((a) => ({ ...a, hasLogin: known.has(a.email) }));
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

/** 目前生效中的價格，轉成編輯器與 diff 用的形狀。 */
export async function currentPrices(solutionId: number): Promise<PriceRow[]> {
  const [rows]: any = await localPool.execute(
    `SELECT plan_en, plan_zh, amount, billing, starts_from FROM hub_prices
      WHERE solution_id = ? AND effective_from <= CURDATE() AND (effective_to IS NULL OR effective_to >= CURDATE())
      ORDER BY id`,
    [solutionId],
  );
  return (rows as any[]).map((r) => ({
    planEn: r.plan_en, planZh: r.plan_zh,
    amount: r.amount == null ? null : Number(r.amount),
    billing: r.billing, startsFrom: Boolean(r.starts_from),
  }));
}

export async function proposeEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
  proposed: Partial<Record<EditableField, string>>;
  features?: FeatureRow[];
  prices?: PriceRow[];
  profile?: SolutionProfile;
  note?: string;
}): Promise<{ changed: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT ${EDITABLE_FIELDS.join(", ")}, features, profile FROM hub_solutions WHERE id = ? AND org_id = ? LIMIT 1`,
    [args.solutionId, args.orgId],
  );
  const current = (rows as any[])[0];
  if (!current) throw new Error("solution not found");

  const changes: Array<{ field: string; from: string; to: string }> = diffFields(current, args.proposed);
  const payload: Record<string, any> = Object.fromEntries(changes.map((c) => [c.field, c.to]));

  // 結構化欄位比「一行一筆」的文字形式 —— 紀錄看得懂，也看得出哪一行動了。
  if (args.features) {
    const from = featuresToText(parseJson(current.features) ?? []);
    const to = featuresToText(args.features);
    if (from !== to) {
      changes.push({ field: "features", from, to });
      payload.features = args.features;
    }
  }
  if (args.prices) {
    const from = pricesToText(await currentPrices(args.solutionId));
    const to = pricesToText(args.prices);
    if (from !== to) {
      changes.push({ field: "prices", from, to });
      payload.prices = args.prices;
    }
  }

  if (args.profile) {
    const from = profileToText(normaliseProfile(parseJson(current.profile)));
    const to = profileToText(normaliseProfile(args.profile));
    if (from !== to) {
      changes.push({ field: "profile", from, to });
      payload.profile = normaliseProfile(args.profile);
    }
  }

  if (!changes.length) return { changed: 0 };

  await localPool.execute(
    `UPDATE hub_solutions SET pending = ?, pending_by = ?, pending_at = NOW(3) WHERE id = ? AND org_id = ?`,
    [JSON.stringify(payload), args.actor, args.solutionId, args.orgId],
  );
  await logEdit({ orgId: args.orgId, solutionId: args.solutionId, actor: args.actor, action: "edited", changes, note: args.note ?? null });
  return { changed: changes.length };
}

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

export async function approveEdit(args: {
  orgId: number;
  solutionId: number;
  actor: string;
}): Promise<{ applied: number }> {
  const [rows]: any = await localPool.execute(
    `SELECT pending, pending_by, ${EDITABLE_FIELDS.join(", ")}, features, profile FROM hub_solutions WHERE id = ? AND org_id = ? LIMIT 1`,
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

  const changes: Array<{ field: string; from: string; to: string }> = diffFields(row, pending);

  const scalars = Object.keys(pending).filter((k) => (EDITABLE_FIELDS as readonly string[]).includes(k));
  const sets = scalars.map((k) => `${k} = ?`);
  const params = scalars.map((k) => String(pending[k] ?? ""));

  if (pending.features) {
    changes.push({
      field: "features",
      from: featuresToText(parseJson(row.features) ?? []),
      to: featuresToText(pending.features),
    });
    sets.push("features = ?");
    params.push(JSON.stringify(pending.features));
  }

  if (pending.profile) {
    changes.push({
      field: "profile",
      from: profileToText(normaliseProfile(parseJson(row.profile))),
      to: profileToText(normaliseProfile(pending.profile)),
    });
    sets.push("profile = ?");
    params.push(JSON.stringify(normaliseProfile(pending.profile)));
  }

  if (sets.length) {
    await localPool.execute(
      `UPDATE hub_solutions SET ${sets.join(", ")}, updated_by = ?, updated_at = NOW(3) WHERE id = ? AND org_id = ?`,
      [...params, args.actor, args.solutionId, args.orgId],
    );
  }

  // 價格走版本不走覆寫：舊的收在昨天，新的從今天生效。這樣歷史留得住，
  // 「這篇貼文當時引用的價格是不是還有效」以後算得出來。
  if (pending.prices) {
    const before = pricesToText(await currentPrices(args.solutionId));
    await localPool.execute(
      `UPDATE hub_prices SET effective_to = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        WHERE solution_id = ? AND (effective_to IS NULL OR effective_to >= CURDATE())`,
      [args.solutionId],
    );
    for (const p of pending.prices as PriceRow[]) {
      const quote = p.billing === "quote" || p.amount == null;
      await localPool.execute(
        `INSERT INTO hub_prices (solution_id, plan_en, plan_zh, amount, currency, billing, starts_from, effective_from, source_url)
         VALUES (?, ?, ?, ?, 'TWD', ?, ?, CURDATE(), NULL)`,
        [args.solutionId, p.planEn, p.planZh, quote ? null : p.amount, p.billing, p.startsFrom ? 1 : 0],
      );
    }
    changes.push({ field: "prices", from: before, to: pricesToText(pending.prices as PriceRow[]) });
  }

  await localPool.execute(
    `UPDATE hub_solutions SET pending = NULL, pending_by = NULL, pending_at = NULL WHERE id = ? AND org_id = ?`,
    [args.solutionId, args.orgId],
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
