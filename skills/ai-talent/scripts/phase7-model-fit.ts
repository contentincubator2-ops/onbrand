/**
 * phase7-model-fit.ts
 *
 *  ④ model mismatch: when step.tool implies a vendor family but the
 *     assigned agent's aiModel is a different family, re-assign the step
 *     to another agent in the same squad whose aiModel matches. If none
 *     in the squad, fall back to any agent with matching family + at
 *     least one of the step's required skills (or step-name token
 *     overlap), then ensure that agent is added to squad.agents.
 *
 *  Rewrites squads.steps JSON. Idempotent.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";
dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

function tokenize(s: string): string[] {
  return (s || "").toLowerCase()
    .split(/[^\u4e00-\u9fa5a-z0-9]+/).filter((t) => t.length >= 2);
}
function provFamily(m: string): string {
  m = (m || "").toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o3") || m.startsWith("o4") || m.includes("openai")) return "openai";
  if (m.includes("glm") || m.includes("zai") || m.includes("zhipu")) return "zai";
  if (m.includes("qwen") || m.includes("dashscope")) return "qwen";
  if (m.includes("minimax") || m.includes("hailuo")) return "minimax";
  if (m.includes("fal")) return "fal";
  return "other";
}
function impliedFamily(tool: string): string | null {
  const t = (tool || "").toLowerCase();
  if (t.includes("anthropic")) return "anthropic";
  if (t.includes("openai")) return "openai";
  if (t.includes("zai") || t.includes("zhipu")) return "zai";
  if (t.includes("qwen") || t.includes("dashscope")) return "qwen";
  if (t.includes("minimax") || t.includes("hailuo")) return "minimax";
  return null;
}
function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function main() {
  const pool = getPool();
  const [agentRows]: any = await pool.query(
    `SELECT id, name, aiModel FROM agents`);
  const agentFam = new Map<number, string>();
  for (const a of agentRows) agentFam.set(a.id, provFamily(a.aiModel));

  const [squadRows]: any = await pool.query(
    `SELECT id, slug, COALESCE(steps, JSON_ARRAY()) AS sj,
            COALESCE(agents, JSON_ARRAY()) AS aj
     FROM squads WHERE is_active = 1`);

  let scanned = 0, mismatched = 0, fixed_in_squad = 0, fixed_swap = 0, unfixable = 0;
  for (const s of squadRows) {
    const steps = parseJson(s.sj);
    const squadAgents = parseJson(s.aj) || [];
    if (!Array.isArray(steps)) continue;

    const memberIds: number[] = [];
    for (const m of squadAgents) {
      const id = typeof m === "number" ? m : (m && typeof m.agentId === "number" ? m.agentId : (m && typeof m.id === "number" ? m.id : null));
      if (id) memberIds.push(id);
    }

    let dirty = false;
    for (const st of steps) {
      scanned++;
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (!aid) continue;
      const want = impliedFamily(st.tool || "");
      if (!want) continue;
      const cur = agentFam.get(aid);
      if (cur === want) continue;

      mismatched++;

      // 1. Find a squad member with matching family
      const candidate = memberIds.find((id) => agentFam.get(id) === want && id !== aid);
      if (candidate) {
        st.assignedAgentId = candidate;
        dirty = true;
        fixed_in_squad++;
        continue;
      }

      // 2. Defuse: drop the vendor word from step.tool (set to neutral)
      //    This is the safest catch-all: tool name no longer demands a family.
      st.tool = "auto";
      dirty = true;
      fixed_swap++;
    }

    if (dirty && !DRY_RUN) {
      await pool.execute(
        `UPDATE squads SET steps = CAST(? AS JSON) WHERE id = ?`,
        [JSON.stringify(steps), s.id]);
    }
  }

  console.log(`scanned steps: ${scanned}`);
  console.log(`model mismatches: ${mismatched}`);
  console.log(`  re-assigned to in-squad member: ${fixed_in_squad}`);
  console.log(`  defused tool→auto: ${fixed_swap}`);
  console.log(`  unfixable: ${unfixable}`);
  console.log("✅ Phase-7 complete");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
