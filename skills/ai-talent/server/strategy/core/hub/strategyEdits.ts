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
import localPool from "../../../localDb";
import { isEditableField, strategyEntity } from "./strategyRegistry";

export type StrategyAction = "created" | "edited" | "approved" | "rejected" | "removed";

export interface StrategyEdit {
  id: number;
  entity: string;
  entityId: number;
  actor: string;
  action: StrategyAction;
  changes: Array<{ field: string; from: string; to: string }>;
  note: string | null;
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
}): Promise<void> {
  await localPool.execute(
    `INSERT INTO hub_strategy_edits (org_id, entity, entity_id, actor, action, changes, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [args.orgId, args.entity, args.entityId, args.actor, args.action,
     JSON.stringify(args.changes ?? []), args.note ?? null],
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
  const [rows]: any = await localPool.execute(
    `SELECT id, entity, entity_id, actor, action, changes, note, created_at
       FROM hub_strategy_edits WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${PAGE}`,
    params,
  );
  return (rows as any[]).map((r) => ({
    id: r.id, entity: r.entity, entityId: r.entity_id ?? 0, actor: r.actor, action: r.action,
    changes: typeof r.changes === "string" ? safeJson(r.changes) : (r.changes ?? []),
    note: r.note ?? null,
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
