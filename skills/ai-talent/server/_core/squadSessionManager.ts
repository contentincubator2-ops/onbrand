/**
 * squadSessionManager.ts
 * 追蹤每個 mission 的 squad 對話進度（哪一步、前步結果）
 *
 * Table: squad_chat_sessions
 *   id           INT PK AI
 *   missionId    INT UNIQUE
 *   squadSlug    VARCHAR(120)
 *   currentStep  INT DEFAULT 0   -- 0=squad lead intake, 1,2,3...=workflow steps
 *   stepResults  LONGTEXT         -- JSON: { [step]: string }
 *   status       VARCHAR(20)      -- 'intake' | 'executing' | 'complete'
 *   createdAt    DATETIME
 *   updatedAt    DATETIME
 */

import type mysql from "mysql2/promise";

export interface SquadSession {
  id: number;
  missionId: number;
  squadSlug: string;
  currentStep: number;
  stepResults: Record<number, string>;
  status: "intake" | "executing" | "complete";
}

// ── 確保 table 存在（首次呼叫時建立）────────────────────────────────────────
let tableReady = false;
async function ensureTable(pool: mysql.Pool): Promise<void> {
  if (tableReady) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS squad_chat_sessions (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      missionId   INT NOT NULL UNIQUE,
      squadSlug   VARCHAR(120) NOT NULL,
      currentStep INT NOT NULL DEFAULT 0,
      stepResults LONGTEXT,
      status      VARCHAR(20) NOT NULL DEFAULT 'intake',
      createdAt   DATETIME(3) DEFAULT NOW(3),
      updatedAt   DATETIME(3) DEFAULT NOW(3),
      INDEX idx_mission (missionId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

// ── 取得或建立 session ────────────────────────────────────────────────────────
export async function getOrCreateSquadSession(
  pool: mysql.Pool,
  missionId: number,
  squadSlug: string
): Promise<SquadSession> {
  await ensureTable(pool);

  const [rows] = await pool.execute(
    `SELECT id, missionId, squadSlug, currentStep, stepResults, status
     FROM squad_chat_sessions WHERE missionId = ? LIMIT 1`,
    [missionId]
  ) as any[];

  const existing = (rows as any[])?.[0];
  if (existing) {
    return {
      id: existing.id,
      missionId: existing.missionId,
      squadSlug: existing.squadSlug,
      currentStep: existing.currentStep ?? 0,
      stepResults: safeParseJson(existing.stepResults),
      status: existing.status ?? "intake",
    };
  }

  // 建立新 session
  const [result] = await pool.execute(
    `INSERT INTO squad_chat_sessions (missionId, squadSlug, currentStep, stepResults, status)
     VALUES (?, ?, 0, '{}', 'intake')`,
    [missionId, squadSlug]
  ) as any[];

  return {
    id: (result as any).insertId,
    missionId,
    squadSlug,
    currentStep: 0,
    stepResults: {},
    status: "intake",
  };
}

// ── 儲存本步驟結果並推進到下一步 ────────────────────────────────────────────
export async function saveStepAndAdvance(
  pool: mysql.Pool,
  missionId: number,
  step: number,
  result: string,
  totalSteps: number
): Promise<number> {
  await ensureTable(pool);

  // 讀取現有 stepResults
  const [rows] = await pool.execute(
    `SELECT stepResults, currentStep FROM squad_chat_sessions WHERE missionId = ? LIMIT 1`,
    [missionId]
  ) as any[];
  const row = (rows as any[])?.[0];
  const existing: Record<number, string> = safeParseJson(row?.stepResults);

  existing[step] = result.slice(0, 2000); // 限制每步摘要長度
  const nextStep = step + 1;
  const newStatus = nextStep > totalSteps ? "complete" : "executing";

  await pool.execute(
    `UPDATE squad_chat_sessions
     SET currentStep = ?, stepResults = ?, status = ?, updatedAt = NOW(3)
     WHERE missionId = ?`,
    [nextStep, JSON.stringify(existing), newStatus, missionId]
  );

  return nextStep;
}

// ── 重置 session（重新開始）──────────────────────────────────────────────────
export async function resetSquadSession(
  pool: mysql.Pool,
  missionId: number
): Promise<void> {
  await ensureTable(pool);
  await pool.execute(
    `UPDATE squad_chat_sessions
     SET currentStep = 0, stepResults = '{}', status = 'intake', updatedAt = NOW(3)
     WHERE missionId = ?`,
    [missionId]
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────
function safeParseJson(val: string | null | undefined): Record<number, string> {
  if (!val) return {};
  try { return JSON.parse(val); } catch { return {}; }
}
