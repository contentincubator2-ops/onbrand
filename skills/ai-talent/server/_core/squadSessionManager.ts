/**
 * squadSessionManager.ts
 * 追蹤每個 mission × phase 的 squad 對話進度（哪一步、前步結果）
 *
 * Scheme B: 一個 mission 有 N 個 phase，每個 phase 獨立 session + 對話歷史。
 *   phaseOrder = 0    → overall intake / squad lead 對話（向後相容）
 *   phaseOrder = 1..N → workflow step N 的獨立對話
 *
 * Table: squad_chat_sessions
 *   id           INT PK AI
 *   missionId    INT
 *   phaseOrder   INT DEFAULT 0
 *   squadSlug    VARCHAR(120)
 *   currentStep  INT DEFAULT 0
 *   stepResults  LONGTEXT        -- JSON: { [step]: string }
 *   status       VARCHAR(20)     -- 'intake' | 'executing' | 'awaiting_reply' | 'complete' | 'discussing'
 *   createdAt    DATETIME
 *   updatedAt    DATETIME
 *   UNIQUE (missionId, phaseOrder)
 */

import type mysql from "mysql2/promise";

export interface SquadSession {
  id: number;
  missionId: number;
  phaseOrder: number;
  squadSlug: string;
  currentStep: number;
  stepResults: Record<number, string>;
  status: "intake" | "executing" | "awaiting_reply" | "complete" | "discussing";
}

// ── Schema bootstrap + migration ─────────────────────────────────────────────
let tableReady = false;
async function ensureTable(pool: mysql.Pool): Promise<void> {
  if (tableReady) return;

  // Base table (first install)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS squad_chat_sessions (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      missionId   INT NOT NULL,
      phaseOrder  INT NOT NULL DEFAULT 0,
      squadSlug   VARCHAR(120) NOT NULL,
      currentStep INT NOT NULL DEFAULT 0,
      stepResults LONGTEXT,
      status      VARCHAR(20) NOT NULL DEFAULT 'intake',
      createdAt   DATETIME(3) DEFAULT NOW(3),
      updatedAt   DATETIME(3) DEFAULT NOW(3),
      INDEX idx_mission (missionId),
      UNIQUE KEY uq_mission_phase (missionId, phaseOrder)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Migration for existing installations ──────────────────────────────────
  // 1. Add phaseOrder column if missing
  const [colRows] = await pool.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squad_chat_sessions' AND COLUMN_NAME = 'phaseOrder'`
  ) as any[];
  if (!(colRows as any[])?.length) {
    await pool.execute(
      `ALTER TABLE squad_chat_sessions ADD COLUMN phaseOrder INT NOT NULL DEFAULT 0 AFTER missionId`
    );
  }

  // 2. Drop old UNIQUE(missionId), add UNIQUE(missionId, phaseOrder)
  const [idxRows] = await pool.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squad_chat_sessions'
       AND NON_UNIQUE = 0 AND COLUMN_NAME = 'missionId'`
  ) as any[];
  for (const idx of (idxRows as any[]) ?? []) {
    const name = idx.INDEX_NAME;
    if (name && name !== "PRIMARY" && name !== "uq_mission_phase") {
      try { await pool.execute(`ALTER TABLE squad_chat_sessions DROP INDEX ${name}`); } catch {}
    }
  }
  const [uqRows] = await pool.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squad_chat_sessions'
       AND INDEX_NAME = 'uq_mission_phase'`
  ) as any[];
  if (!(uqRows as any[])?.length) {
    try {
      await pool.execute(
        `ALTER TABLE squad_chat_sessions ADD UNIQUE KEY uq_mission_phase (missionId, phaseOrder)`
      );
    } catch {}
  }

  // 3. chat_messages: add phaseOrder column if missing
  const [cmCol] = await pool.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_messages' AND COLUMN_NAME = 'phaseOrder'`
  ) as any[];
  if (!(cmCol as any[])?.length) {
    try {
      await pool.execute(
        `ALTER TABLE chat_messages ADD COLUMN phaseOrder INT NOT NULL DEFAULT 0`
      );
      await pool.execute(
        `ALTER TABLE chat_messages ADD INDEX idx_mission_phase (missionId, phaseOrder)`
      );
    } catch {}
  }

  tableReady = true;
}

// ── getOrCreate ──────────────────────────────────────────────────────────────
export async function getOrCreateSquadSession(
  pool: mysql.Pool,
  missionId: number,
  squadSlug: string,
  phaseOrder: number = 0
): Promise<SquadSession> {
  await ensureTable(pool);

  const [rows] = await pool.execute(
    `SELECT id, missionId, phaseOrder, squadSlug, currentStep, stepResults, status
     FROM squad_chat_sessions WHERE missionId = ? AND phaseOrder = ? LIMIT 1`,
    [missionId, phaseOrder]
  ) as any[];

  const existing = (rows as any[])?.[0];
  if (existing) {
    return {
      id: existing.id,
      missionId: existing.missionId,
      phaseOrder: existing.phaseOrder ?? 0,
      squadSlug: existing.squadSlug,
      currentStep: existing.currentStep ?? 0,
      stepResults: safeParseJson(existing.stepResults),
      status: existing.status ?? "intake",
    };
  }

  const [result] = await pool.execute(
    `INSERT INTO squad_chat_sessions (missionId, phaseOrder, squadSlug, currentStep, stepResults, status)
     VALUES (?, ?, ?, 0, '{}', 'intake')`,
    [missionId, phaseOrder, squadSlug]
  ) as any[];

  return {
    id: (result as any).insertId,
    missionId,
    phaseOrder,
    squadSlug,
    currentStep: 0,
    stepResults: {},
    status: "intake",
  };
}

// ── Save step result (no advance) ────────────────────────────────────────────
export async function saveStepResultOnly(
  pool: mysql.Pool,
  missionId: number,
  step: number,
  result: string,
  phaseOrder: number = 0
): Promise<void> {
  await ensureTable(pool);

  const [rows] = await pool.execute(
    `SELECT stepResults FROM squad_chat_sessions
     WHERE missionId = ? AND phaseOrder = ? LIMIT 1`,
    [missionId, phaseOrder]
  ) as any[];
  const row = (rows as any[])?.[0];
  const existing: Record<number, string> = safeParseJson(row?.stepResults);

  existing[step] = result.slice(0, 2000);

  await pool.execute(
    `UPDATE squad_chat_sessions
     SET stepResults = ?, status = 'awaiting_reply', updatedAt = NOW(3)
     WHERE missionId = ? AND phaseOrder = ?`,
    [JSON.stringify(existing), missionId, phaseOrder]
  );
}

// ── Advance to next step ─────────────────────────────────────────────────────
export async function advanceToNextStep(
  pool: mysql.Pool,
  missionId: number,
  nextStep: number,
  totalSteps: number,
  phaseOrder: number = 0
): Promise<void> {
  await ensureTable(pool);
  const newStatus = nextStep > totalSteps ? "complete" : "executing";
  await pool.execute(
    `UPDATE squad_chat_sessions
     SET currentStep = ?, status = ?, updatedAt = NOW(3)
     WHERE missionId = ? AND phaseOrder = ?`,
    [nextStep, newStatus, missionId, phaseOrder]
  );
}

// ── Save step + advance (legacy, squad lead intake) ──────────────────────────
export async function saveStepAndAdvance(
  pool: mysql.Pool,
  missionId: number,
  step: number,
  result: string,
  totalSteps: number,
  phaseOrder: number = 0
): Promise<number> {
  await ensureTable(pool);

  const [rows] = await pool.execute(
    `SELECT stepResults, currentStep FROM squad_chat_sessions
     WHERE missionId = ? AND phaseOrder = ? LIMIT 1`,
    [missionId, phaseOrder]
  ) as any[];
  const row = (rows as any[])?.[0];
  const existing: Record<number, string> = safeParseJson(row?.stepResults);

  existing[step] = result.slice(0, 2000);
  const nextStep = step + 1;
  const newStatus = nextStep > totalSteps ? "complete" : "executing";

  await pool.execute(
    `UPDATE squad_chat_sessions
     SET currentStep = ?, stepResults = ?, status = ?, updatedAt = NOW(3)
     WHERE missionId = ? AND phaseOrder = ?`,
    [nextStep, JSON.stringify(existing), newStatus, missionId, phaseOrder]
  );

  return nextStep;
}

// ── Reset ────────────────────────────────────────────────────────────────────
export async function resetSquadSession(
  pool: mysql.Pool,
  missionId: number,
  phaseOrder: number = 0
): Promise<void> {
  await ensureTable(pool);
  await pool.execute(
    `UPDATE squad_chat_sessions
     SET currentStep = 0, stepResults = '{}', status = 'intake', updatedAt = NOW(3)
     WHERE missionId = ? AND phaseOrder = ?`,
    [missionId, phaseOrder]
  );
}

// ── List all phase sessions for a mission (Scheme B) ────────────────────────
export async function listPhaseSessions(
  pool: mysql.Pool,
  missionId: number
): Promise<SquadSession[]> {
  await ensureTable(pool);
  const [rows] = await pool.execute(
    `SELECT id, missionId, phaseOrder, squadSlug, currentStep, stepResults, status
     FROM squad_chat_sessions WHERE missionId = ? ORDER BY phaseOrder ASC`,
    [missionId]
  ) as any[];
  return ((rows as any[]) ?? []).map(r => ({
    id: r.id,
    missionId: r.missionId,
    phaseOrder: r.phaseOrder ?? 0,
    squadSlug: r.squadSlug,
    currentStep: r.currentStep ?? 0,
    stepResults: safeParseJson(r.stepResults),
    status: r.status ?? "intake",
  }));
}

// ── Bulk pre-create phase sessions when mission is created ──────────────────
export async function ensurePhaseSessions(
  pool: mysql.Pool,
  missionId: number,
  squadSlug: string,
  phaseCount: number
): Promise<void> {
  await ensureTable(pool);
  // phaseOrder 0 = intake, 1..phaseCount = workflow phases
  for (let p = 0; p <= phaseCount; p++) {
    await pool.execute(
      `INSERT IGNORE INTO squad_chat_sessions
         (missionId, phaseOrder, squadSlug, currentStep, stepResults, status)
       VALUES (?, ?, ?, 0, '{}', 'intake')`,
      [missionId, p, squadSlug]
    );
  }
}

// ── Helper ───────────────────────────────────────────────────────────────────
function safeParseJson(val: string | null | undefined): Record<number, string> {
  if (!val) return {};
  try { return JSON.parse(val); } catch { return {}; }
}
