/**
 * audit-agent-fit — semantic check of task_catalog agent assignments.
 *
 * Earlier keyword-overlap skill-match assigned SEO agents to FB-post
 * tasks. This script uses callLLM to ASK whether each (task, agent)
 * pairing actually makes sense — same way a human would judge.
 *
 * Per task / per squad-step:
 *   - Print bound agent's primarySkill + specialty
 *   - Ask LLM: "Does this agent fit this deliverable? Output JSON
 *     {fit: 'good'|'marginal'|'mismatch', reason: '<25 words>',
 *      better_skill_hint: '<keyword agent should have>'}"
 *
 * Output: a markdown report saved to /tmp/agent-fit-audit.md, plus
 * inline console summary (✓ / ⚠ / ✗ per row).
 *
 * Cost: ~14 LLM calls × $0.005 ≈ $0.07. Cheap.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import mysql from "mysql2/promise";
import { callLLM } from "../server/_core/llmRouter";

interface Task {
  id: number; slug: string; name_zh: string; description: string;
  impl_kind: string; squad_id: number | null; agent_id: number | null;
  squad_name?: string;
}
interface Agent {
  id: number; name: string; title: string;
  primarySkill: string; specialty: string;
}
interface FitVerdict {
  fit: "good" | "marginal" | "mismatch";
  reason: string;
  better_skill_hint: string;
}

async function judge(taskName: string, taskDesc: string, agent: Agent): Promise<FitVerdict> {
  const sys = `你是 SoWork 行銷顧問人力主管。給你一個交付物 + 一個 agent，判斷這個 agent 的專長是否真的適合這個交付物。\n\n嚴格回 JSON：\n{"fit": "good" | "marginal" | "mismatch", "reason": "<25 字內，繁中>", "better_skill_hint": "<理想 agent 應該有的關鍵專長關鍵字，繁中或英文>"}`;
  const user = `【交付物】${taskName}\n${taskDesc}\n\n【Agent】${agent.name}（${agent.title || "—"}）\n主要專長 (primarySkill)：${agent.primarySkill || "—"}\n描述 (specialty)：${(agent.specialty || "").slice(0, 300)}`;
  try {
    const r = await callLLM({ system: sys, user, maxTokens: 200, timeoutMs: 25_000 });
    const txt = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const j = JSON.parse(txt);
    return {
      fit: j.fit === "good" || j.fit === "marginal" || j.fit === "mismatch" ? j.fit : "marginal",
      reason: String(j.reason ?? "").slice(0, 100),
      better_skill_hint: String(j.better_skill_hint ?? ""),
    };
  } catch (e) {
    return { fit: "marginal", reason: `judge failed: ${e instanceof Error ? e.message.slice(0, 50) : "—"}`, better_skill_hint: "" };
  }
}

const ICON: Record<FitVerdict["fit"], string> = { good: "✓", marginal: "⚠", mismatch: "✗" };

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const [taskRows]: any = await pool.execute(
    `SELECT t.id, t.slug, t.name_zh, t.description, t.impl_kind,
            t.squad_id, t.agent_id, s.name AS squad_name, s.steps AS squad_steps
       FROM task_catalog t LEFT JOIN squads s ON s.id = t.squad_id
      WHERE t.status = 'active' AND t.workspace = 'facebook'
      ORDER BY t.impl_kind, t.id`,
  );
  const tasks = taskRows as any[];

  const lines: string[] = [`# Agent-fit audit — FB tasks (${new Date().toISOString().split("T")[0]})\n`];
  let counts = { good: 0, marginal: 0, mismatch: 0 };

  for (const t of tasks) {
    console.log(`\n=== task #${t.id} ${t.slug} (${t.impl_kind}) ===`);
    lines.push(`\n## #${t.id} ${t.name_zh} \`${t.slug}\` (${t.impl_kind})\n`);

    if (t.impl_kind === "atomic") {
      if (!t.agent_id) {
        console.log(`  ✗ no agent_id bound`);
        lines.push(`- ✗ **no agent bound**`);
        counts.mismatch++;
        continue;
      }
      const [aRows]: any = await pool.execute(
        `SELECT id, name, title, primarySkill, specialty FROM agents WHERE id = ? LIMIT 1`,
        [t.agent_id],
      );
      const a = (aRows as any[])?.[0] as Agent;
      if (!a) {
        console.log(`  ✗ agent #${t.agent_id} not found`);
        lines.push(`- ✗ **agent #${t.agent_id} not found**`);
        counts.mismatch++;
        continue;
      }
      const v = await judge(t.name_zh, t.description, a);
      counts[v.fit]++;
      console.log(`  ${ICON[v.fit]} agent #${a.id} ${a.name} (${a.primarySkill || "—"})`);
      console.log(`    fit=${v.fit}  reason: ${v.reason}`);
      if (v.better_skill_hint) console.log(`    better_skill_hint: ${v.better_skill_hint}`);
      lines.push(`- bound agent: **#${a.id} ${a.name}** (\`${a.primarySkill || "—"}\`)`);
      lines.push(`- verdict: ${ICON[v.fit]} **${v.fit}** — ${v.reason}`);
      if (v.better_skill_hint) lines.push(`- ideal skill: \`${v.better_skill_hint}\``);
    } else if (t.impl_kind === "squad" && t.squad_steps) {
      // Check every squad step's bound agent
      const steps = (() => { try { return typeof t.squad_steps === "string" ? JSON.parse(t.squad_steps) : t.squad_steps; } catch { return []; } })();
      lines.push(`- bound squad: **#${t.squad_id} ${t.squad_name}** (${steps.length} steps)\n`);
      lines.push(`| step | name | agent | primarySkill | fit | reason |`);
      lines.push(`|---|---|---|---|---|---|`);
      for (const s of steps) {
        if (!s.assignedAgentId) continue;
        if (s.aiModel === "n/a") continue; // UI-only checkpoint
        const [aRows]: any = await pool.execute(
          `SELECT id, name, title, primarySkill, specialty FROM agents WHERE id = ? LIMIT 1`,
          [s.assignedAgentId],
        );
        const a = (aRows as any[])?.[0];
        if (!a) {
          console.log(`  step ${s.order} ${s.name}: ✗ agent #${s.assignedAgentId} not found`);
          lines.push(`| ${s.order} | ${s.name} | #${s.assignedAgentId} (missing) | — | ✗ | not in DB |`);
          counts.mismatch++;
          continue;
        }
        const stepName = `${t.name_zh} — Step ${s.order}: ${s.name}`;
        const v = await judge(stepName, s.description ?? s.name, a);
        counts[v.fit]++;
        console.log(`  step ${s.order} ${s.name}: ${ICON[v.fit]} ${a.name} (${a.primarySkill || "—"}) — ${v.reason}`);
        lines.push(`| ${s.order} | ${s.name} | ${a.name} | \`${a.primarySkill || "—"}\` | ${ICON[v.fit]} | ${v.reason} |`);
      }
    }
  }

  lines.push(`\n## Summary\n`);
  lines.push(`- ✓ good:     ${counts.good}`);
  lines.push(`- ⚠ marginal: ${counts.marginal}`);
  lines.push(`- ✗ mismatch: ${counts.mismatch}`);

  writeFileSync("/tmp/agent-fit-audit.md", lines.join("\n"));
  console.log(`\n=== summary === good=${counts.good}  marginal=${counts.marginal}  mismatch=${counts.mismatch}`);
  console.log(`Full report → /tmp/agent-fit-audit.md`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
