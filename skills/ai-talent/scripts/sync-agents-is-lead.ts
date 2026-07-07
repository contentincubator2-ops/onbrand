/**
 * sync-agents-is-lead.ts — Phase 2 cleanup
 *
 * Ensures squads.agents JSON has is_lead=true ONLY on the entry whose
 * agent_id matches squads.lead_agent_id. If lead_agent_id has no member
 * row, prepend a synthetic squad_lead entry. Idempotent.
 *
 * Necessary because some Phase 2 batches (the bulk SQL fallback for
 * 26 stragglers) updated lead_agent_id directly without touching the
 * JSON. After this script every squad has consistent flags so any
 * downstream code using `agents.find(is_lead)` agrees with lead_agent_id.
 *
 *   npx tsx scripts/sync-agents-is-lead.ts --apply
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

interface MemberRow { agent_id: number; role?: string; order?: number; is_lead?: boolean | number; }

function safeJson<T>(v: unknown, fb: T): T {
  if (v === null || v === undefined) return fb;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } }
  return fb;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "MUST_SET_LOCAL_DB_PASSWORD",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });

  try {
    const [rows] = await pool.execute(
      `SELECT id, slug, lead_agent_id, agents FROM squads
        WHERE is_active=1 AND lead_agent_id IS NOT NULL`
    ) as any[];

    let needFix = 0, prepended = 0, fixed = 0;
    const updates: { id: number; agents: MemberRow[] }[] = [];

    for (const r of rows as any[]) {
      const leadId = Number(r.lead_agent_id);
      const members = safeJson<MemberRow[]>(r.agents, []);
      const before = JSON.stringify(members);

      let leadInList = false;
      for (const m of members) {
        const isLead = Number(m.agent_id) === leadId;
        m.is_lead = isLead;
        if (isLead) leadInList = true;
      }
      if (!leadInList) {
        members.unshift({ agent_id: leadId, role: "squad_lead", order: 1, is_lead: true });
        prepended++;
      }
      const after = JSON.stringify(members);
      if (after !== before) {
        needFix++;
        updates.push({ id: r.id, agents: members });
      }
    }

    console.log(`[sync] scanned=${rows.length}  needFix=${needFix}  prepended=${prepended}`);
    if (!apply) {
      console.log("[dry-run] no writes. Re-run with --apply.");
      console.log("Sample:", updates.slice(0, 3));
      return;
    }
    if (needFix === 0) { console.log("[apply] nothing to do."); return; }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const u of updates) {
        await conn.execute(
          `UPDATE squads SET agents = CAST(? AS JSON) WHERE id = ?`,
          [JSON.stringify(u.agents), u.id]
        );
        fixed++;
        if (fixed % 50 === 0) console.log(`  ... ${fixed}/${needFix}`);
      }
      await conn.commit();
      console.log(`[apply] ✅ Synced ${fixed} squads.`);
    } catch (e) {
      await conn.rollback();
      console.error("[apply] ❌ Rolled back:", e);
      throw e;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
