/**
 * fix-fb-mismatches — one-shot patch for the 2 fixable agent mismatches
 * found by audit-agent-fit on 2026-05-01:
 *
 *   - Squad #557 (GaryVee Jab) steps 3-5 "Jab 視覺素材製作":
 *       蘇雅玲 (press-release-writer) → Mandy Cheng (239184, fb-visual-director)
 *
 *   - task_catalog #12 (fb-crisis-reply):
 *       Aiden Hsu (239183, fb-copywriting) → Claire Hsu (180159,
 *       social-media-manager) — closer fit until a crisis-comms
 *       agent is built.
 *
 * Idempotent: re-running just re-applies the same UPDATEs.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const MANDY_ID = 239184;
const CLAIRE_ID = 180159;

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  // 1. Patch task_catalog #12 → Claire Hsu
  const [r1]: any = await pool.execute(
    `UPDATE task_catalog SET agent_id = ? WHERE slug = 'fb-crisis-reply'`,
    [CLAIRE_ID],
  );
  console.log(`✓ fb-crisis-reply → Claire Hsu (#${CLAIRE_ID}). affected=${r1.affectedRows}`);

  // 2. Patch squad #557 steps 3-5 (Jab 視覺素材製作 / image / video) → Mandy Cheng
  const [sq]: any = await pool.execute(
    `SELECT id, steps FROM squads WHERE id = 557 LIMIT 1`,
  );
  const row = (sq as any[])?.[0];
  if (!row) { console.warn("squad 557 not found"); await pool.end(); return; }
  const steps = typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps;
  if (!Array.isArray(steps)) { console.warn("steps not array"); await pool.end(); return; }

  let changed = 0;
  for (const s of steps) {
    if (typeof s.name === "string" && s.name.includes("視覺素材")) {
      const before = s.assignedAgentId;
      s.assignedAgentId = MANDY_ID;
      s.assignedAgentName = "Mandy Cheng";
      console.log(`  step ${s.order} "${s.name}": agent #${before} → #${MANDY_ID}`);
      changed++;
    }
  }
  if (changed > 0) {
    await pool.execute(
      `UPDATE squads SET steps = ? WHERE id = 557`,
      [JSON.stringify(steps)],
    );
    console.log(`✓ squad #557: ${changed} step(s) re-assigned to Mandy Cheng`);
  } else {
    console.log("  squad #557: no 視覺素材 steps found (already patched?)");
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
