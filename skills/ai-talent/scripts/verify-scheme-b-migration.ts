/**
 * verify-scheme-b-migration.ts
 * One-off sanity check for Scheme B schema migration.
 *
 * Triggers ensureTable() in squadSessionManager, then inspects:
 *   - squad_chat_sessions columns & indexes
 *   - chat_messages phaseOrder column & index
 *
 * Run with:
 *   npx tsx scripts/verify-scheme-b-migration.ts
 */

import "dotenv/config";
import localPool from "../server/localDb";
import {
  getOrCreateSquadSession,
  listPhaseSessions,
  ensurePhaseSessions,
} from "../server/content/core/squadSessionManager";

async function describe(table: string) {
  const [cols] = await localPool.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  ) as any[];
  const [idx] = await localPool.execute(
    `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     GROUP BY INDEX_NAME, NON_UNIQUE
     ORDER BY INDEX_NAME`,
    [table]
  ) as any[];
  return { cols: cols as any[], idx: idx as any[] };
}

async function main() {
  console.log("\n=== Scheme B migration verification ===\n");

  // 1. Trigger ensureTable
  console.log("[1/4] Trigger ensureTable via getOrCreateSquadSession(missionId=0, slug='__probe__')...");
  try {
    const s = await getOrCreateSquadSession(localPool as any, 0, "__probe__", 0);
    console.log("     Probe session id =", s.id, "phaseOrder =", s.phaseOrder);
  } catch (e: any) {
    console.error("     FAILED:", e?.message);
    process.exit(1);
  }

  // 2. Inspect squad_chat_sessions
  console.log("\n[2/4] squad_chat_sessions schema:");
  const scs = await describe("squad_chat_sessions");
  console.log("  Columns:");
  for (const c of scs.cols) console.log(`    • ${c.COLUMN_NAME.padEnd(14)} ${c.COLUMN_TYPE}`);
  console.log("  Indexes:");
  for (const i of scs.idx) console.log(`    • ${i.INDEX_NAME.padEnd(20)} ${i.NON_UNIQUE === 0 ? "UNIQUE" : "INDEX"}  (${i.cols})`);

  const hasPhaseOrder = scs.cols.some(c => c.COLUMN_NAME === "phaseOrder");
  const hasCompositeUq = scs.idx.some(i => i.INDEX_NAME === "uq_mission_phase" && i.NON_UNIQUE === 0);
  const hasOldMissionUq = scs.idx.some(
    i => i.NON_UNIQUE === 0 && i.cols === "missionId" && i.INDEX_NAME !== "PRIMARY"
  );
  console.log(`  ✓ phaseOrder column       : ${hasPhaseOrder ? "PASS" : "FAIL"}`);
  console.log(`  ✓ UNIQUE(missionId, phase): ${hasCompositeUq ? "PASS" : "FAIL"}`);
  console.log(`  ✓ old UNIQUE(missionId) dropped: ${!hasOldMissionUq ? "PASS" : "FAIL"}`);

  // 3. Inspect chat_messages
  console.log("\n[3/4] chat_messages schema:");
  const cm = await describe("chat_messages");
  const cmPhase = cm.cols.find(c => c.COLUMN_NAME === "phaseOrder");
  console.log(`    phaseOrder column : ${cmPhase ? `${cmPhase.COLUMN_TYPE} default=${cmPhase.COLUMN_DEFAULT}` : "MISSING"}`);
  const cmIdx = cm.idx.some(i => i.INDEX_NAME === "idx_mission_phase");
  console.log(`    idx_mission_phase : ${cmIdx ? "PASS" : "FAIL"}`);

  // 4. Test ensurePhaseSessions + listPhaseSessions
  console.log("\n[4/4] ensurePhaseSessions(mission=0, slug='__probe__', phaseCount=3) + list:");
  await ensurePhaseSessions(localPool as any, 0, "__probe__", 3);
  const phases = await listPhaseSessions(localPool as any, 0);
  console.log(`    ${phases.length} rows:`);
  for (const p of phases) {
    console.log(`      • phase=${p.phaseOrder}  status=${p.status}  currentStep=${p.currentStep}  squadSlug=${p.squadSlug}`);
  }

  // Cleanup probe rows
  console.log("\n[cleanup] removing probe rows (missionId=0)...");
  await localPool.execute(`DELETE FROM squad_chat_sessions WHERE missionId = 0 AND squadSlug = '__probe__'`);

  console.log("\n=== DONE — check PASS markers above ===\n");
  await localPool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  try { await localPool.end(); } catch {}
  process.exit(1);
});
