/**
 * strategyEdits — 策略層通用的編輯、權限與紀錄。
 *
 * 2026-09-23 (CJ「策略層的每一個 mission tray，內容的任務卡片都是可以被用戶
 * 編輯，並且會有權限和紀錄的」)。
 *
 * ── 為什麼現在才抽出來 ───────────────────────────────────────────────
 * 同樣的東西已經長了兩套半：產品有 hub_solution_edits（含核准）、用詞有
 * hub_wording_edits（無核准）、品牌／法規／市場數據三個 tray 連紀錄都沒有。
 * 「複製第二次還可以，第三次就該收斂」——現在要補上三個 tray，那就是第三次。
 *
 * 這一支不去動既有的兩張表（產品與用詞的流程正在跑，硬遷移是拿正在用的東西
 * 冒險換一個更漂亮的結構）。它是**給還沒有紀錄的那三個 tray 用的那一套**，
 * 並且是之後統一的目標形狀。兩張舊表要不要併過來，是另一次有測試護著的搬家。
 *
 * ── 權限沿用既有的核准名單 ───────────────────────────────────────────
 * 不另外發明一套。hub_approvers 已經是「誰能核准」的單一來源，而且它的退回
 * 規則（名單空的時候才回到平台管理員）已經在用詞與產品兩邊驗過。
 *
 * ── 紀錄記「前後值」，不記「新版本」 ─────────────────────────────────
 * 審核一段內容的時候，「哪裡變了」比「現在長怎樣」重要得多。這一點在產品那邊
 * 已經證明有效，這裡照搬。
 */
import { isEditableField, strategyEntity } from "./strategyRegistry";

/**
 * 資料庫連線是延遲載入的，不是頂層 import。
 *
 * 這一支裡最值得測的東西（diffStrategyFields —— 通用編輯層唯一的安全邊界）
 * 完全不碰資料庫。頂層 import localDb 會讓整個模組在沒有 DB 密碼的環境載入
 * 失敗，於是那些純函式就一條都測不到。solutionEdits 與 brandAssets 就是這樣
 * 在本機永遠紅著的。
 */
async function db() {
  const { default: localPool } = await import("../../../localDb");
  return localPool;
}

export type StrategyAction = "created" | "edited" | "approved" | "rejected" | "removed";

export interface StrategyEdit {
  id: number;
  entity: string;
  entityId: number;
  actor: string;
  action: StrategyAction;
  changes: Array<{ field: string; from: string; to: string }>;
  note: string | null;
  label: string | null;
  createdAt: string;
}

const PAGE = 80;

/**
 * 紀錄表。跟 hub_solution_edits 同一個形狀，多一個 entity 欄位。
 *
 * entity_id 不設外鍵：刪掉的那一筆，紀錄還要留著——「誰把這個拿掉的」正好是
 * 資料已經不在的時候才會被問的問題。
 */
export const STRATEGY_EDIT_DDL = `CREATE TABLE IF NOT EXISTS hub_strategy_edits (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id      INT          NOT NULL,
  entity      VARCHAR(24)  NOT NULL,
  entity_id   INT          NULL,
  actor       VARCHAR(160) NOT NULL,
  action      VARCHAR(16)  NOT NULL,
  changes     JSON         NULL,
  note        VARCHAR(400) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_org (org_id, created_at),
  INDEX idx_entity (org_id, entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export async function logStrategyEdit(args: {
  orgId: number;
  entity: string;
  entityId: number | null;
  actor: string;
  action: StrategyAction;
  changes?: Array<{ field: string; from: string; to: string }>;
  note?: string | null;
  /** 這一筆在當下叫什麼。資料刪掉之後，光有 id 沒人看得懂。 */
  label?: string | null;
}): Promise<void> {
  await (await db()).execute(
    `INSERT INTO hub_strategy_edits (org_id, entity, entity_id, actor, action, changes, note, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [args.orgId, args.entity, args.entityId, args.actor, args.action,
     JSON.stringify(args.changes ?? []), args.note ?? null, args.label ?? null],
  );
}

export async function listStrategyEdits(
  orgId: number,
  filter: { entity?: string; entityId?: number } = {},
): Promise<StrategyEdit[]> {
  const where = ["org_id = ?"];
  const params: any[] = [orgId];
  if (filter.entity) { where.push("entity = ?"); params.push(filter.entity); }
  if (filter.entityId) { where.push("entity_id = ?"); params.push(filter.entityId); }
  const [rows]: any = await (await db()).execute(
    `SELECT id, entity, entity_id, actor, action, changes, note, label, created_at
       FROM hub_strategy_edits WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${PAGE}`,
    params,
  );
  return (rows as any[]).map((r) => ({
    id: r.id, entity: r.entity, entityId: r.entity_id ?? 0, actor: r.actor, action: r.action,
    changes: typeof r.changes === "string" ? safeJson(r.changes) : (r.changes ?? []),
    note: r.note ?? null,
    label: r.label ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * 只留真的變了的欄位，並且**擋掉不在白名單上的欄位**。
 *
 * 白名單是這一層唯一的防線：沒有它，一個通用的編輯介面就等於「任意欄位寫入」，
 * 呼叫端可以改 org_id 把資料搬到別的組織去。所以不在 editableFields 裡的欄位
 * 不是忽略，是**回報**——靜默丟掉會讓人以為存好了。
 */
export function diffStrategyFields(
  entity: string,
  current: Record<string, any>,
  proposed: Record<string, any>,
): { changes: Array<{ field: string; from: string; to: string }>; rejected: string[] } {
  const changes: Array<{ field: string; from: string; to: string }> = [];
  const rejected: string[] = [];
  for (const [field, raw] of Object.entries(proposed ?? {})) {
    if (!isEditableField(entity, field)) { rejected.push(field); continue; }
    const to = normalise(raw);
    const from = normalise(current?.[field]);
    if (to !== from) changes.push({ field, from, to });
  }
  return { changes, rejected };
}

function normalise(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

/** 這一種資料改了之後要不要等核准。 */
export function requiresApproval(entity: string): boolean {
  return Boolean(strategyEntity(entity)?.requiresApproval);
}

function safeJson(s: string): any {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ── 提案 / 核准 ──────────────────────────────────────────────────────────────

/**
 * 待審提案。一筆資料同時只會有一份（uniq key），跟產品那邊的規則一樣。
 *
 * 為什麼不像產品那樣在每張表加一個 pending 欄位：那要再改三張表，而且每加一種
 * 資料就要再改一次。提案本來就是「暫時的、跟資料本體無關的東西」，放在自己的
 * 表裡更誠實——正式欄位在核准之前完全不動，這也正是核准的意義。
 */
export const STRATEGY_PENDING_DDL = `CREATE TABLE IF NOT EXISTS hub_strategy_pending (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id      INT          NOT NULL,
  entity      VARCHAR(24)  NOT NULL,
  entity_id   INT          NOT NULL,
  changes     JSON         NOT NULL,
  proposed_by VARCHAR(160) NOT NULL,
  proposed_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  note        VARCHAR(400) NULL,
  UNIQUE KEY uq_row (org_id, entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export interface PendingEdit {
  entity: string;
  entityId: number;
  changes: Array<{ field: string; from: string; to: string }>;
  proposedBy: string;
  proposedAt: string;
  note: string | null;
}

export async function listPending(orgId: number, entity?: string): Promise<PendingEdit[]> {
  const [rows]: any = entity
    ? await (await db()).execute(
        `SELECT * FROM hub_strategy_pending WHERE org_id = ? AND entity = ? ORDER BY id DESC`,
        [orgId, entity],
      )
    : await (await db()).execute(`SELECT * FROM hub_strategy_pending WHERE org_id = ? ORDER BY id DESC`, [orgId]);
  return (rows as any[]).map((r) => ({
    entity: r.entity, entityId: r.entity_id,
    changes: typeof r.changes === "string" ? safeJson(r.changes) : (r.changes ?? []),
    proposedBy: r.proposed_by,
    proposedAt: new Date(r.proposed_at).toISOString(),
    note: r.note ?? null,
  }));
}

/** 讀出這一筆現在的值，不管它存在欄位還是 JSON 裡。 */
async function readCurrent(orgId: number, entity: string, entityId: number): Promise<Record<string, any> | null> {
  const spec = strategyEntity(entity);
  if (!spec) throw new Error(`unknown strategy entity: ${entity}`);
  const [rows]: any = await (await db()).execute(
    `SELECT * FROM ${spec.table} WHERE id = ? AND org_id = ? LIMIT 1`,
    [entityId, orgId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  if (spec.storage.kind === "columns") return row;
  const raw = row[spec.storage.column];
  const payload = typeof raw === "string" ? safeObject(raw) : (raw ?? {});
  return payload;
}

/**
 * 提出修改。**正式欄位完全不動。**
 *
 * 不需要核准的種類（用詞）直接套用，因為那一頁承諾即時生效。需要核准的存進
 * 待審表，等人核准才合併過去。
 */
export async function proposeStrategyEdit(args: {
  orgId: number;
  entity: string;
  entityId: number;
  actor: string;
  proposed: Record<string, any>;
  note?: string | null;
}): Promise<{ applied: boolean; changes: Array<{ field: string; from: string; to: string }>; rejected: string[] }> {
  const current = await readCurrent(args.orgId, args.entity, args.entityId);
  if (!current) throw new Error("That entry is gone — someone may have removed it.");

  const { changes, rejected } = diffStrategyFields(args.entity, current, args.proposed);
  if (rejected.length) throw new Error(`These fields cannot be edited here: ${rejected.join(", ")}`);
  if (!changes.length) return { applied: false, changes: [], rejected: [] };

  if (!requiresApproval(args.entity)) {
    await applyChanges(args.orgId, args.entity, args.entityId, changes);
    await logStrategyEdit({ ...args, entityId: args.entityId, action: "edited", changes, note: args.note });
    return { applied: true, changes, rejected: [] };
  }

  await (await db()).execute(
    `INSERT INTO hub_strategy_pending (org_id, entity, entity_id, changes, proposed_by, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE changes = VALUES(changes), proposed_by = VALUES(proposed_by),
       proposed_at = CURRENT_TIMESTAMP(3), note = VALUES(note)`,
    [args.orgId, args.entity, args.entityId, JSON.stringify(changes), args.actor, args.note ?? null],
  );
  await logStrategyEdit({ ...args, entityId: args.entityId, action: "edited", changes, note: args.note });
  return { applied: false, changes, rejected: [] };
}

/**
 * 核准並合併。
 *
 * 提案人不能核准自己的提案 —— repo 裡踩過一次「review 核准不擋任何東西」。
 */
export async function approveStrategyEdit(args: {
  orgId: number;
  entity: string;
  entityId: number;
  actor: string;
}): Promise<{ applied: number }> {
  const [rows]: any = await (await db()).execute(
    `SELECT changes, proposed_by FROM hub_strategy_pending WHERE org_id = ? AND entity = ? AND entity_id = ? LIMIT 1`,
    [args.orgId, args.entity, args.entityId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error("There is nothing waiting for approval here.");
  if (String(row.proposed_by ?? "").toLowerCase() === args.actor.toLowerCase()) {
    throw new Error("You proposed this change — someone else has to approve it.");
  }
  const changes = typeof row.changes === "string" ? safeJson(row.changes) : (row.changes ?? []);
  await applyChanges(args.orgId, args.entity, args.entityId, changes);
  await (await db()).execute(
    `DELETE FROM hub_strategy_pending WHERE org_id = ? AND entity = ? AND entity_id = ?`,
    [args.orgId, args.entity, args.entityId],
  );
  await logStrategyEdit({ ...args, action: "approved", changes });
  return { applied: changes.length };
}

export async function rejectStrategyEdit(args: {
  orgId: number;
  entity: string;
  entityId: number;
  actor: string;
  note?: string | null;
}): Promise<void> {
  const [rows]: any = await (await db()).execute(
    `SELECT changes FROM hub_strategy_pending WHERE org_id = ? AND entity = ? AND entity_id = ? LIMIT 1`,
    [args.orgId, args.entity, args.entityId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error("There is nothing waiting for approval here.");
  await (await db()).execute(
    `DELETE FROM hub_strategy_pending WHERE org_id = ? AND entity = ? AND entity_id = ?`,
    [args.orgId, args.entity, args.entityId],
  );
  await logStrategyEdit({
    ...args, action: "rejected",
    changes: typeof row.changes === "string" ? safeJson(row.changes) : (row.changes ?? []),
    note: args.note,
  });
}

/**
 * 把已核准的改動寫進去。
 *
 * 欄位名只可能來自 editableFields（proposeStrategyEdit 已經擋過），所以拼進
 * SQL 是安全的 —— 但仍然在這裡再擋一次，因為這支是 exported 的，之後可能有
 * 別的呼叫端，而「上游已經檢查過」是最容易在重構中失效的假設。
 */
async function applyChanges(
  orgId: number,
  entity: string,
  entityId: number,
  changes: Array<{ field: string; to: string }>,
): Promise<void> {
  const spec = strategyEntity(entity);
  if (!spec) throw new Error(`unknown strategy entity: ${entity}`);
  const safe = changes.filter((c) => isEditableField(entity, c.field));
  if (!safe.length) return;

  if (spec.storage.kind === "columns") {
    await (await db()).execute(
      `UPDATE ${spec.table} SET ${safe.map((c) => `\`${c.field}\` = ?`).join(", ")} WHERE id = ? AND org_id = ?`,
      [...safe.map((c) => c.to), entityId, orgId],
    );
    return;
  }

  // JSON 儲存：讀出來、合併、寫回去。整個 payload 換掉，所以沒動到的鍵要保留。
  const col = spec.storage.column;
  const [rows]: any = await (await db()).execute(
    `SELECT \`${col}\` AS payload FROM ${spec.table} WHERE id = ? AND org_id = ? LIMIT 1`,
    [entityId, orgId],
  );
  const raw = (rows as any[])[0]?.payload;
  const payload = typeof raw === "string" ? safeObject(raw) : (raw ?? {});
  for (const c of safe) payload[c.field] = c.to;
  await (await db()).execute(
    `UPDATE ${spec.table} SET \`${col}\` = ? WHERE id = ? AND org_id = ?`,
    [JSON.stringify(payload), entityId, orgId],
  );
}

function safeObject(s: string): Record<string, any> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// ── 舊紀錄表的搬遷 ──────────────────────────────────────────────────────────

/**
 * 把 hub_solution_edits 與 hub_wording_edits 併進 hub_strategy_edits。
 *
 * 2026-09-23：這是收斂的最後一步。三張表記同一件事（誰在什麼時候改了什麼），
 * 而且每加一種資料就要再開一張——那正是為什麼要有通用層。
 *
 * ── 可以重複執行 ─────────────────────────────────────────────────────
 * 每次部署都會跑，但靠 (org_id, entity, legacy_id) 的唯一鍵只會搬一次。
 * **一次性的腳本最後總是會被跑第二次**，與其靠紀律不如靠資料庫。
 *
 * ── 舊表不刪 ─────────────────────────────────────────────────────────
 * 搬完之後舊表不再被讀也不再被寫，但**留著**。刪資料是不可逆的，而且這是
 * 稽核紀錄——「搬遷把三個月的紀錄弄丟了」是沒有辦法補救的那種錯。要不要清掉
 * 是之後另外決定的事，不是搬遷順便做的。
 */
export async function migrateLegacyEdits(orgId: number): Promise<{ solutions: number; wording: number }> {
  const pool = await db();
  const out = { solutions: 0, wording: 0 };

  const hasTable = async (name: string) => {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
      [name],
    );
    return Number((rows as any[])[0]?.n ?? 0) > 0;
  };

  if (await hasTable("hub_solution_edits")) {
    const [r]: any = await pool.execute(
      `INSERT IGNORE INTO hub_strategy_edits
         (org_id, entity, entity_id, actor, action, changes, note, created_at, legacy_id)
       SELECT org_id, 'solution', solution_id, actor, action, changes, note, created_at, id
         FROM hub_solution_edits WHERE org_id = ?`,
      [orgId],
    );
    out.solutions = Number(r?.affectedRows ?? 0);
  }

  if (await hasTable("hub_wording_edits")) {
    // 用詞的舊表把「這是哪個詞」存在自己的 term 欄位；通用表用 label。
    const [r]: any = await pool.execute(
      `INSERT IGNORE INTO hub_strategy_edits
         (org_id, entity, entity_id, actor, action, changes, label, created_at, legacy_id)
       SELECT org_id, 'wording', wording_id, actor,
              CASE action WHEN 'added' THEN 'created' ELSE action END,
              changes, term, created_at, id
         FROM hub_wording_edits WHERE org_id = ?`,
      [orgId],
    );
    out.wording = Number(r?.affectedRows ?? 0);
  }

  return out;
}
