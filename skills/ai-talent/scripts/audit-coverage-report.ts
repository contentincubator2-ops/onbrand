/**
 * audit-coverage-report — comprehensive scan of squad ↔ agent ↔
 * task_catalog three-way binding + per-workspace coverage map.
 *
 * CJ direction 2026-05-02: 「作一個完整性的掃描，按照編號順序，掃描
 * squad and agent and user task 的匹配度。然後，給我目前squad的任務
 * 分配情況」.
 *
 * Sections:
 *   A. Workspace coverage matrix — one row per (workspace, category_kind)
 *      with task counts. Lets CJ see at a glance "FB has 14 tasks
 *      across planning/campaign/content/analytics/crisis; IG has 13;
 *      Web has 0; EDM has 0; …".
 *
 *   B. Per-task numerical inventory — ORDER BY task_catalog.id ASC,
 *      one row per task with: name / workspace / methodology / impl /
 *      bound squad slug / squad agent count / mockups used / status.
 *
 *   C. Squad inventory — every active-bound squad with its agent
 *      crew + step count + which task it serves.
 *
 *   D. Orphans — squads / agents not bound to any active task_catalog row.
 *
 *   E. Recommendations — workspaces with 0 tasks; suggested next build.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import mysql from "mysql2/promise";

const KNOWN_WORKSPACES = [
  "facebook", "instagram", "linkedin", "youtube", "tiktok",
  "edm", "blog", "web", "pr", "podcast", "shopee", "thread", "x",
];

const CATEGORY_KINDS = ["planning", "content", "campaign", "analytics", "crisis"] as const;

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const lines: string[] = [];
  lines.push(`# Coverage Report (${new Date().toISOString().split("T")[0]})\n`);
  lines.push(`Comprehensive scan of squad ↔ agent ↔ task_catalog bindings, ordered by task id ASC.\n`);

  // ── Section A: Workspace × category_kind matrix ────────────────────────
  lines.push(`\n## A. Workspace × Category Coverage\n`);
  const [coverage]: any = await pool.execute(
    `SELECT t.workspace,
            COALESCE(c.category_kind, t.category) AS category_kind,
            COUNT(*) AS task_count,
            SUM(CASE WHEN t.status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN t.status = 'coming_soon' THEN 1 ELSE 0 END) AS coming_soon
       FROM task_catalog t
  LEFT JOIN task_category c ON c.id = t.category_id
      WHERE t.status IN ('active','coming_soon')
   GROUP BY t.workspace, COALESCE(c.category_kind, t.category)
   ORDER BY t.workspace, category_kind`,
  );

  // Pivot into a workspace × category matrix
  const matrix: Record<string, Record<string, { active: number; coming: number }>> = {};
  for (const r of (coverage as any[])) {
    const ws = r.workspace ?? "—";
    const ck = r.category_kind ?? "—";
    matrix[ws] = matrix[ws] ?? {};
    matrix[ws][ck] = { active: Number(r.active), coming: Number(r.coming_soon) };
  }
  const wsList = Object.keys(matrix).sort();
  lines.push(`| workspace | planning | content | campaign | analytics | crisis | total |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const ws of wsList) {
    const row = matrix[ws] ?? {};
    const cells = CATEGORY_KINDS.map((k) => {
      const v = row[k];
      if (!v) return "—";
      return v.coming > 0 ? `${v.active} +${v.coming}🟡` : `${v.active}`;
    });
    const total = CATEGORY_KINDS.reduce((sum, k) => sum + (row[k]?.active ?? 0) + (row[k]?.coming ?? 0), 0);
    lines.push(`| **${ws}** | ${cells.join(" | ")} | **${total}** |`);
  }
  lines.push(`\n*Format: \`active\` or \`active +coming🟡\`*\n`);

  // ── Section B: Task inventory (numbered) ───────────────────────────────
  lines.push(`\n## B. Task Inventory (id ASC)\n`);
  const [tasks]: any = await pool.execute(
    `SELECT t.id, t.slug, t.name_zh, t.workspace, t.impl_kind, t.status,
            t.methodology_label, t.estimated_minutes,
            t.squad_id, s.slug AS squad_slug, s.name AS squad_name, s.steps AS squad_steps,
            JSON_LENGTH(s.steps) AS step_count, JSON_LENGTH(s.agents) AS crew_size,
            t.agent_id, a.name AS agent_name, a.primarySkill AS agent_skill
       FROM task_catalog t
  LEFT JOIN squads s ON s.id = t.squad_id
  LEFT JOIN agents a ON a.id = t.agent_id
      WHERE t.status IN ('active','coming_soon')
      ORDER BY t.id ASC`,
  );

  lines.push(`| # | name | ws | impl | status | bound to | crew/steps | mockup variants used |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const t of (tasks as any[])) {
    let mockupSet = "—";
    if (t.squad_steps) {
      try {
        const steps = typeof t.squad_steps === "string" ? JSON.parse(t.squad_steps) : t.squad_steps;
        if (Array.isArray(steps)) {
          const variants = Array.from(new Set(steps.map((s: any) => s.mockupVariant).filter(Boolean)));
          mockupSet = variants.length > 0 ? variants.map((v) => `\`${v}\``).join(", ") : "—";
        }
      } catch {}
    }
    const bound = t.impl_kind === "squad"
      ? (t.squad_slug ? `squad \`${t.squad_slug}\`` : "❌ no squad")
      : (t.agent_name ? `${t.agent_name} (${t.agent_skill ?? "—"})` : "❌ no agent");
    const crewSteps = t.impl_kind === "squad"
      ? `${t.crew_size ?? "?"} agents / ${t.step_count ?? "?"} steps`
      : "atomic (1 agent)";
    const statusBadge = t.status === "active" ? "🟢" : "🟡";
    lines.push(`| ${t.id} | **${t.name_zh}** | ${t.workspace} | ${t.impl_kind} | ${statusBadge} ${t.status} | ${bound} | ${crewSteps} | ${mockupSet} |`);
  }

  // ── Section C: Squad inventory (active-bound) ──────────────────────────
  lines.push(`\n## C. Active-Bound Squads (members + steps)\n`);
  const [squads]: any = await pool.execute(
    `SELECT s.id, s.slug, s.name, s.agents, s.steps, s.workspace, s.is_approved,
            s.hero_image_url,
            (SELECT GROUP_CONCAT(t.slug SEPARATOR ', ')
               FROM task_catalog t WHERE t.squad_id = s.id) AS bound_tasks
       FROM squads s
      WHERE s.id IN (SELECT DISTINCT squad_id FROM task_catalog WHERE squad_id IS NOT NULL AND status IN ('active','coming_soon'))
      ORDER BY s.id ASC`,
  );

  for (const sq of (squads as any[])) {
    let agents: any[] = [];
    let steps: any[] = [];
    try { agents = typeof sq.agents === "string" ? JSON.parse(sq.agents) : sq.agents; } catch {}
    try { steps  = typeof sq.steps  === "string" ? JSON.parse(sq.steps)  : sq.steps;  } catch {}
    if (!Array.isArray(agents)) agents = [];
    if (!Array.isArray(steps))  steps = [];

    lines.push(`\n### #${sq.id} \`${sq.slug}\` — ${sq.name}\n`);
    lines.push(`- workspace: \`${sq.workspace}\`  ·  approved: ${sq.is_approved ? "✓" : "✗"}  ·  hero: ${sq.hero_image_url ? "✓" : "✗"}`);
    lines.push(`- bound tasks: ${sq.bound_tasks ?? "—"}`);
    lines.push(`- crew (${agents.length}):`);
    for (const a of agents) {
      lines.push(`  - ${a.is_lead ? "👑 " : ""}#${a.id} ${a.name ?? "?"} (${a.role ?? "—"})`);
    }
    lines.push(`- steps (${steps.length}):`);
    for (const s of steps) {
      const mv = s.mockupVariant ? `\`${s.mockupVariant}\`` : "❌ no mockup";
      lines.push(`  - ${s.order} ${s.name ?? "?"} → ${s.assignedAgentName ?? "?"} → ${mv}`);
    }
  }

  // ── Section D: Orphans ─────────────────────────────────────────────────
  lines.push(`\n## D. Orphans\n`);

  // D1: tasks with no squad/agent bound
  const [orphanTasks]: any = await pool.execute(
    `SELECT id, slug, name_zh, workspace, impl_kind, status
       FROM task_catalog
      WHERE status IN ('active','coming_soon')
        AND ((impl_kind = 'squad' AND squad_id IS NULL)
          OR (impl_kind = 'atomic' AND agent_id IS NULL))
      ORDER BY id`,
  );
  lines.push(`\n### D1. Tasks with no underlying impl (${(orphanTasks as any[]).length})`);
  if ((orphanTasks as any[]).length === 0) {
    lines.push(`✓ all tasks have squad/agent bound`);
  } else {
    for (const t of (orphanTasks as any[])) {
      lines.push(`- ❌ #${t.id} \`${t.slug}\` (${t.workspace}, ${t.impl_kind}, ${t.status}) — needs ${t.impl_kind === "squad" ? "squad" : "agent"} bound`);
    }
  }

  // D2: squads bound to NO active task_catalog (i.e. orphan squads)
  const [orphanSquadsCount]: any = await pool.execute(
    `SELECT COUNT(*) AS c FROM squads
      WHERE is_active = 1
        AND id NOT IN (SELECT DISTINCT squad_id FROM task_catalog WHERE squad_id IS NOT NULL AND status IN ('active','coming_soon'))`,
  );
  const orphanCount = Number((orphanSquadsCount as any[])[0]?.c ?? 0);
  lines.push(`\n### D2. Squads not bound to any catalog task (${orphanCount})`);
  lines.push(`These exist in DB but no user can find them via picker. Either:`);
  lines.push(`- bind them to a task_catalog row (CJ approves), OR`);
  lines.push(`- archive them (\`is_active = 0\`)`);
  if (orphanCount > 0 && orphanCount <= 50) {
    const [orphanList]: any = await pool.execute(
      `SELECT id, slug, name FROM squads
        WHERE is_active = 1
          AND id NOT IN (SELECT DISTINCT squad_id FROM task_catalog WHERE squad_id IS NOT NULL AND status IN ('active','coming_soon'))
        ORDER BY id LIMIT 50`,
    );
    for (const s of (orphanList as any[])) {
      lines.push(`- #${s.id} \`${s.slug}\` — ${s.name ?? "—"}`);
    }
  } else if (orphanCount > 50) {
    lines.push(`*(${orphanCount} total — too many to list. Most are auto-generated legacy squads from earlier seeds. Most should be archived.)*`);
  }

  // ── Section E: Workspace gap analysis ─────────────────────────────────
  lines.push(`\n## E. Workspace Coverage Gaps\n`);
  const wsCounts: Record<string, number> = {};
  for (const ws of KNOWN_WORKSPACES) wsCounts[ws] = 0;
  for (const r of (coverage as any[])) {
    wsCounts[r.workspace] = (wsCounts[r.workspace] ?? 0) + Number(r.task_count);
  }
  lines.push(`| workspace | task count | recommended next? |`);
  lines.push(`|---|---|---|`);
  const RECOMMEND: Record<string, string> = {
    facebook:   "✓ done",
    instagram:  "✓ done",
    linkedin:   "← B2B 提案 / 思想領導，PlatformMockup 已有 8 變體",
    edm:        "← 高頻 deliverable（每月 newsletter），需新 mockup（無）",
    blog:       "← SEO 長文，需新 mockup（無）",
    youtube:    "← 已有 PlatformMockup 6 變體，可建（次優先）",
    tiktok:     "← 短影音重疊 IG Reels，可重用 IGReels chrome",
    web:        "← 官網 / landing page，需新 mockup（無）",
    pr:         "← 新聞稿，需新 mockup（無）",
    podcast:    "← show notes / cover，需新 mockup（無）",
  };
  for (const ws of KNOWN_WORKSPACES) {
    const c = wsCounts[ws] ?? 0;
    lines.push(`| ${ws} | ${c} | ${RECOMMEND[ws] ?? "—"} |`);
  }

  // ── Section F: Honest summary ──────────────────────────────────────────
  const totalTasks = (tasks as any[]).length;
  const fbTasks = (tasks as any[]).filter((t) => t.workspace === "facebook").length;
  const igTasks = (tasks as any[]).filter((t) => t.workspace === "instagram").length;
  const totalSquads = (squads as any[]).length;
  lines.push(`\n## F. Quick Stats\n`);
  lines.push(`- task_catalog rows (active + coming_soon): **${totalTasks}**`);
  lines.push(`  - Facebook: ${fbTasks}`);
  lines.push(`  - Instagram: ${igTasks}`);
  lines.push(`  - Other: ${totalTasks - fbTasks - igTasks}`);
  lines.push(`- active-bound squads: **${totalSquads}**`);
  lines.push(`- orphan tasks (no impl bound): **${(orphanTasks as any[]).length}**`);
  lines.push(`- orphan squads (not in catalog): **${orphanCount}**`);

  writeFileSync("/tmp/coverage-report.md", lines.join("\n"));
  console.log("Coverage report written to /tmp/coverage-report.md");
  console.log(`\nQuick stats:`);
  console.log(`  tasks: ${totalTasks} (FB ${fbTasks} + IG ${igTasks} + other ${totalTasks - fbTasks - igTasks})`);
  console.log(`  bound squads: ${totalSquads}`);
  console.log(`  orphan tasks: ${(orphanTasks as any[]).length}`);
  console.log(`  orphan squads: ${orphanCount}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
