/**
 * skill-match-atomic-agents — for each ATOMIC task in task_catalog,
 * pick the best-matching agent based on:
 *
 *   1. Task description + name keyword overlap with agent.primarySkill +
 *      agent.specialty + agent.skills (JSON array)
 *   2. Workspace alignment (FB tasks prefer FB agents)
 *   3. Lead status — prefer agents already on a related squad
 *
 * Replaces the lazy "fb-copywriter slug → first FB agent" fallback the
 * initial seed used. CJ requirement: 所有 agent 的資格都要掃描過.
 *
 * Score = w1·keyword_overlap + w2·workspace_match + w3·on_related_squad
 * Tie-break: lower agent.id (earlier seeded → more likely audited).
 *
 * Idempotent: only updates rows where status='active' AND impl_kind='atomic'.
 * Reports the chosen score so CJ can spot weak matches.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const STOP_WORDS = new Set([
  "facebook", "fb", "貼文", "文案", "post", "content", "task", "用戶",
  "的", "是", "在", "和", "與", "或", "及", "以", "為", "了", "於", "之",
  "the", "a", "an", "of", "for", "to", "and", "or", "with", "from", "by",
]);

function tokenize(s: string): string[] {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[（）()·,，。、:：!！?？\[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function safeJsonArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  try { const j = JSON.parse(String(v)); return Array.isArray(j) ? j.map(String) : []; }
  catch { return []; }
}

interface Task { id: number; slug: string; name_zh: string; description: string; workspace: string; agent_id: number | null; }
interface Agent {
  id: number; slug: string; name: string; title: string;
  primarySkill: string; specialty: string; skills: string[];
  aiModel: string;
}

function score(task: Task, agent: Agent, onRelatedSquad: boolean): { total: number; breakdown: string } {
  const taskBag = new Set([
    ...tokenize(task.name_zh),
    ...tokenize(task.description),
    ...tokenize(task.slug.replace(/-/g, " ")),
  ]);
  const agentBag = new Set([
    ...tokenize(agent.primarySkill),
    ...tokenize(agent.specialty),
    ...tokenize(agent.title),
    ...agent.skills.flatMap(tokenize),
  ]);

  let overlap = 0;
  for (const t of taskBag) if (agentBag.has(t)) overlap++;

  const wsMatch = (() => {
    const w = task.workspace.toLowerCase();
    const haystack = [agent.primarySkill, agent.specialty, agent.title, ...agent.skills].join(" ").toLowerCase();
    if (w === "facebook" && /facebook|fb/.test(haystack)) return 1;
    if (w === "instagram" && /instagram|ig/.test(haystack)) return 1;
    return 0;
  })();

  const w1 = 10, w2 = 8, w3 = 5;
  const total = w1 * overlap + w2 * wsMatch + w3 * (onRelatedSquad ? 1 : 0);
  return {
    total,
    breakdown: `keywords:${overlap}×${w1} + ws:${wsMatch}×${w2} + squad:${onRelatedSquad ? 1 : 0}×${w3}`,
  };
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  // Load active atomic tasks
  const [taskRows]: any = await pool.execute(
    `SELECT id, slug, name_zh, description, workspace, agent_id
       FROM task_catalog
      WHERE status = 'active' AND impl_kind = 'atomic'
      ORDER BY id ASC`,
  );
  const tasks = taskRows as Task[];
  console.log(`[skill-match] ${tasks.length} active atomic tasks to score`);

  if (tasks.length === 0) { await pool.end(); return; }

  // Load all agents — only those with non-empty primarySkill (filter noise)
  const [agentRows]: any = await pool.execute(
    `SELECT id, slug, name, title, primarySkill, specialty, skills, aiModel
       FROM agents
      WHERE primarySkill IS NOT NULL AND primarySkill <> ''
      ORDER BY id ASC`,
  );
  const agents: Agent[] = (agentRows as any[]).map((a) => ({
    id: a.id, slug: a.slug, name: a.name, title: a.title ?? "",
    primarySkill: a.primarySkill ?? "", specialty: a.specialty ?? "",
    skills: safeJsonArray(a.skills),
    aiModel: a.aiModel ?? "",
  }));
  console.log(`[skill-match] scoring ${tasks.length} tasks × ${agents.length} agents…\n`);

  // Pre-compute "agents on FB-related squads" for the bonus
  const [fbSquadAgents]: any = await pool.execute(
    `SELECT DISTINCT JSON_EXTRACT(agents, '$[*].id') AS ids
       FROM squads WHERE JSON_CONTAINS(workspace, '"facebook"')`,
  );
  const onFbSquad = new Set<number>();
  for (const r of (fbSquadAgents as any[])) {
    const ids = safeJsonArray(r.ids).map(Number).filter(Boolean);
    for (const id of ids) onFbSquad.add(id);
  }

  const updates: { taskId: number; oldAgent: number | null; newAgent: number; score: number; breakdown: string }[] = [];

  for (const task of tasks) {
    const ranked = agents
      .map((a) => ({ agent: a, ...score(task, a, task.workspace === "facebook" && onFbSquad.has(a.id)) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || a.agent.id - b.agent.id);

    const top3 = ranked.slice(0, 3);
    const winner = top3[0]?.agent ?? null;

    console.log(`[task ${task.id}] ${task.slug}`);
    if (top3.length === 0) {
      console.log(`  ✗ no agent scored > 0 — keeping current agent_id=${task.agent_id}`);
      continue;
    }
    for (const r of top3) {
      console.log(`    ${r === top3[0] ? "→" : " "} #${r.agent.id} ${r.agent.name} (${r.agent.primarySkill || "—"})  score=${r.total}  [${r.breakdown}]`);
    }

    if (winner && winner.id !== task.agent_id) {
      updates.push({
        taskId: task.id, oldAgent: task.agent_id, newAgent: winner.id,
        score: top3[0].total, breakdown: top3[0].breakdown,
      });
    }
  }

  console.log(`\n[skill-match] ${updates.length} task(s) need re-binding`);
  for (const u of updates) {
    await pool.execute(
      `UPDATE task_catalog SET agent_id = ? WHERE id = ?`,
      [u.newAgent, u.taskId],
    );
    console.log(`  ✓ task ${u.taskId}: agent ${u.oldAgent ?? "null"} → ${u.newAgent}  (score=${u.score})`);
  }

  // Final state
  console.log("\n=== Final atomic-task agent bindings ===");
  const [finalRows]: any = await pool.execute(
    `SELECT t.id, t.slug, t.agent_id, a.name AS agent_name, a.primarySkill
       FROM task_catalog t LEFT JOIN agents a ON a.id = t.agent_id
      WHERE t.status = 'active' AND t.impl_kind = 'atomic'
      ORDER BY t.id`,
  );
  for (const r of (finalRows as any[])) {
    console.log(`  task ${r.id}  ${r.slug.padEnd(30)} → #${r.agent_id ?? "—"}  ${r.agent_name ?? "—"}  (${r.primarySkill ?? "—"})`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
