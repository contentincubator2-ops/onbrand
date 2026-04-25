/**
 * align-squad-leads.ts — Phase 2 of schema consolidation
 *
 * Re-assigns squad lead_agent_id so the lead's primarySkill aligns with
 * the squad's methodology (per the "golden standard" set by Mary Allen
 * on brand-archetype-positioning).
 *
 * Algorithm per squad:
 *   1. Tokenize squad.slug into keywords (e.g. "blue-ocean-positioning"
 *      → ["blue", "ocean", "positioning"]).
 *   2. Score every active agent's primarySkill against those tokens:
 *        +50 if primarySkill is fully contained in slug or vice versa
 *        +20 per token contained in primarySkill
 *        +30 if a known author surname matches (godin, sinek, holt, …)
 *        +10 fallback if step[0].requiredSkill matches primarySkill
 *   3. Prefer agents NOT already used as lead in this batch (de-dup).
 *   4. Score ≥ MIN_SCORE → assign; else leave unresolved.
 *
 * Modes:
 *   --layer L1_brand | L2_product | L3_audience | L4_channel | L5_campaign
 *   --workspace facebook | linkedin | …       (alternative grouping)
 *   --slugs slug1,slug2,slug3                 (explicit list)
 *   --dry-run | --apply
 *
 * Examples:
 *   tsx scripts/align-squad-leads.ts --layer L1_brand --dry-run
 *   tsx scripts/align-squad-leads.ts --layer L1_brand --apply
 */

import { createPool, type Pool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const MIN_SCORE = 30;

// Author surnames whose presence in BOTH slug and primarySkill is strong signal.
const KNOWN_AUTHORS = [
  "ries", "trout", "kotler", "sinek", "keller", "miller", "holt",
  "dunford", "neumeier", "sharp", "godin", "gerhardt", "ritson",
  "kim", "mauborgne", "pearson", "mark", "lochhead", "moore",
  "andreessen", "sutherland", "christensen", "hormozi", "ogilvy",
  "garyvee", "vaynerchuk", "schwartz", "kennedy", "berger", "schaefer",
  "dietrich", "gladwell", "fishkin", "baer", "patel", "pat-flynn",
  "mrbeast", "kim-scott", "rand", "loomer", "deiss", "hollis",
];

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  strategy_layer: string | null;
  workspace: any;
  steps: any;
  lead_agent_id: number | null;
  agents: any;
}

interface AgentRow {
  id: number;
  name: string;
  title: string | null;
  primarySkill: string | null;
  rating: number | null;
}

interface Candidate {
  agent: AgentRow;
  score: number;
  reasons: string[];
}

interface Plan {
  squad: SquadRow;
  currentLeadId: number | null;
  currentLeadOk: boolean;
  best: Candidate | null;
  alternatives: Candidate[];
}

function safeJson<T>(v: unknown, fb: T): T {
  if (v === null || v === undefined) return fb;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fb; }
  }
  return fb;
}

/** Split a slug into kebab tokens, lowercase. */
function tokenize(s: string): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function scoreAgent(squad: SquadRow, agent: AgentRow, stepRequiredSkill: string | null): Candidate {
  const reasons: string[] = [];
  let score = 0;

  const ps = (agent.primarySkill ?? "").toLowerCase().trim();
  if (!ps) return { agent, score: 0, reasons: ["no primarySkill"] };

  const slug = squad.slug.toLowerCase();
  const slugTokens = tokenize(slug);
  const psTokens = tokenize(ps);

  // 1) Full containment in either direction → strong signal
  if (slug.includes(ps) || ps.includes(slug)) {
    score += 50;
    reasons.push(`whole-match(${ps})`);
  }

  // 2) Per-token overlap
  const overlap = slugTokens.filter((t) => psTokens.includes(t));
  if (overlap.length > 0) {
    const add = Math.min(80, overlap.length * 20);
    score += add;
    reasons.push(`tokens=[${overlap.join(",")}](+${add})`);
  }

  // 3) Author name match — both slug and primarySkill carry the same surname
  for (const author of KNOWN_AUTHORS) {
    if (slug.includes(author) && ps.includes(author)) {
      score += 30;
      reasons.push(`author=${author}(+30)`);
    }
  }

  // 4) Fallback: step[0].requiredSkill matches primarySkill
  if (stepRequiredSkill) {
    const rs = stepRequiredSkill.toLowerCase().trim();
    if (rs === ps || rs.includes(ps) || ps.includes(rs)) {
      score += 10;
      reasons.push(`step1Skill≈ps(+10)`);
    }
  }

  // 5) Tiny rating bonus to break ties
  if (typeof agent.rating === "number") {
    score += Math.min(3, agent.rating / 2);
  }

  return { agent, score, reasons };
}

function step1Skill(steps: any[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const s = steps[0];
  return s?.requiredSkill ?? s?.skill ?? null;
}

interface Args {
  layer?: string;
  workspace?: string;
  slugs?: string[];
  apply: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { apply: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--layer") out.layer = argv[++i];
    else if (a === "--workspace") out.workspace = argv[++i];
    else if (a === "--slugs") out.slugs = argv[++i]?.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!out.apply && !out.dryRun) {
    console.error("Usage: --layer L1_brand|... | --workspace ws | --slugs s1,s2 (--dry-run | --apply)");
    process.exit(1);
  }
  if (out.apply && out.dryRun) {
    console.error("Pick one: --dry-run OR --apply");
    process.exit(1);
  }
  return out;
}

async function loadSquads(pool: Pool, args: Args): Promise<SquadRow[]> {
  if (args.slugs?.length) {
    const list = args.slugs.map(() => "?").join(",");
    const [rows] = await pool.execute(
      `SELECT id, slug, name, strategy_layer, workspace, steps, lead_agent_id, agents
         FROM squads WHERE is_active=1 AND slug IN (${list}) ORDER BY id`,
      args.slugs
    ) as any[];
    return rows as SquadRow[];
  }
  if (args.layer) {
    const [rows] = await pool.execute(
      `SELECT id, slug, name, strategy_layer, workspace, steps, lead_agent_id, agents
         FROM squads WHERE is_active=1 AND strategy_layer = ? ORDER BY id`,
      [args.layer]
    ) as any[];
    return rows as SquadRow[];
  }
  if (args.workspace) {
    const [rows] = await pool.execute(
      `SELECT id, slug, name, strategy_layer, workspace, steps, lead_agent_id, agents
         FROM squads WHERE is_active=1 AND workspace LIKE ? ORDER BY id`,
      [`%${args.workspace}%`]
    ) as any[];
    return rows as SquadRow[];
  }
  throw new Error("Need --layer, --workspace, or --slugs");
}

async function loadCandidateAgents(pool: Pool): Promise<AgentRow[]> {
  // Agents that have a meaningful primarySkill. We scan all of them and let
  // the scoring filter; this is ~13k rows but fits comfortably in memory.
  const [rows] = await pool.execute(
    `SELECT id, name, title, primarySkill, rating FROM agents
      WHERE primarySkill IS NOT NULL AND primarySkill != '' AND primarySkill != 'general'`
  ) as any[];
  return rows as AgentRow[];
}

function buildPlan(squad: SquadRow, agents: AgentRow[]): Plan {
  const stepReqSkill = step1Skill(safeJson<any[]>(squad.steps, []));
  const scored = agents
    .map((a) => scoreAgent(squad, a, stepReqSkill))
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const currentLeadOk = (() => {
    if (!squad.lead_agent_id) return false;
    const cur = agents.find((a) => a.id === squad.lead_agent_id);
    if (!cur) return false;
    const c = scoreAgent(squad, cur, stepReqSkill);
    return c.score >= MIN_SCORE;
  })();

  return {
    squad,
    currentLeadId: squad.lead_agent_id ?? null,
    currentLeadOk,
    best: scored[0] ?? null,
    alternatives: scored.slice(1, 4),
  };
}

function pickBatchUnique(plans: Plan[]): Map<number, Candidate | null> {
  // Greedy: assign the highest-scoring choice first; for each subsequent
  // squad, if the best is taken, fall back to next alternative. We allow
  // the same agent to lead multiple squads only if no alternative reaches
  // MIN_SCORE — uniqueness is a soft preference.
  const used = new Set<number>();
  const result = new Map<number, Candidate | null>();
  const ordered = [...plans].sort((a, b) => (b.best?.score ?? 0) - (a.best?.score ?? 0));

  for (const p of ordered) {
    const candidates: Candidate[] = [p.best, ...p.alternatives].filter((x): x is Candidate => !!x);
    let pick = candidates.find((c) => !used.has(c.agent.id));
    if (!pick && candidates.length > 0) pick = candidates[0]; // accept duplicate if needed
    if (pick) used.add(pick.agent.id);
    result.set(p.squad.id, pick ?? null);
  }
  return result;
}

function fmtPlan(plans: Plan[], picks: Map<number, Candidate | null>) {
  console.log("");
  console.log("============= ALIGNMENT PLAN =============");
  console.log("");
  let assigned = 0, unresolved = 0, alreadyOk = 0;
  for (const p of plans) {
    const pick = picks.get(p.squad.id) ?? null;
    const tag = p.currentLeadOk
      ? "✓ ALREADY OK"
      : pick
      ? `→ ASSIGN`
      : "✗ NO MATCH ≥ " + MIN_SCORE;
    if (p.currentLeadOk) alreadyOk++;
    else if (pick) assigned++;
    else unresolved++;

    console.log(`[${tag}]  ${p.squad.slug} (id=${p.squad.id})`);
    console.log(`        name: ${p.squad.name}`);
    console.log(`        current lead: ${p.currentLeadId ?? "NULL"}${p.currentLeadOk ? " (aligned)" : ""}`);
    if (pick) {
      console.log(`        new lead   : id=${pick.agent.id} ${pick.agent.name}  primarySkill=${pick.agent.primarySkill}`);
      console.log(`        score      : ${pick.score.toFixed(0)}  [${pick.reasons.join("; ")}]`);
    }
    if (p.alternatives.length > 0 && !p.currentLeadOk) {
      const alts = p.alternatives.slice(0, 2).map((a) =>
        `${a.agent.primarySkill}(${a.score.toFixed(0)})`
      ).join(", ");
      console.log(`        also      : ${alts}`);
    }
    console.log("");
  }
  console.log(`============= SUMMARY =============`);
  console.log(`  Total in batch:   ${plans.length}`);
  console.log(`  Already aligned:  ${alreadyOk}`);
  console.log(`  Will assign:      ${assigned}`);
  console.log(`  Unresolved:       ${unresolved}`);
  console.log("");
}

async function applyPlan(pool: Pool, plans: Plan[], picks: Map<number, Candidate | null>) {
  const conn = await pool.getConnection();
  let written = 0;
  try {
    await conn.beginTransaction();
    for (const p of plans) {
      if (p.currentLeadOk) continue;
      const pick = picks.get(p.squad.id);
      if (!pick) continue;

      // Update lead_agent_id
      await conn.execute(
        `UPDATE squads SET lead_agent_id = ? WHERE id = ?`,
        [pick.agent.id, p.squad.id]
      );

      // Sync agents JSON: ensure pick is in the array as is_lead=1, others is_lead=0
      const cur = safeJson<any[]>(p.squad.agents, []);
      const filtered = cur.filter((m: any) => m && m.agent_id !== pick.agent.id);
      const others = filtered.map((m: any) => ({ ...m, is_lead: 0 }));
      const newMembers = [
        { agent_id: pick.agent.id, role: "squad_lead", is_lead: 1, order: 1 },
        ...others.map((m: any, i: number) => ({ ...m, order: (m.order ?? i + 2) })),
      ];
      await conn.execute(
        `UPDATE squads SET agents = CAST(? AS JSON) WHERE id = ?`,
        [JSON.stringify(newMembers), p.squad.id]
      );
      written++;
    }
    await conn.commit();
    console.log(`\n[apply] ✅ Wrote ${written} squads (lead + agents JSON) in single transaction.`);
  } catch (e) {
    await conn.rollback();
    console.error(`\n[apply] ❌ Rolled back:`, e);
    throw e;
  } finally {
    conn.release();
  }
}

async function main() {
  const args = parseArgs();
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });

  try {
    console.log(`[align-leads] Mode=${args.dryRun ? "DRY-RUN" : "APPLY"}; filter=`, {
      layer: args.layer, workspace: args.workspace, slugs: args.slugs?.length,
    });

    const squads = await loadSquads(pool, args);
    console.log(`[align-leads] Loaded ${squads.length} squads.`);

    const agents = await loadCandidateAgents(pool);
    console.log(`[align-leads] Scoring against ${agents.length} candidate agents (primarySkill non-empty).`);

    const plans = squads.map((s) => buildPlan(s, agents));
    const picks = pickBatchUnique(plans);

    fmtPlan(plans, picks);

    if (args.dryRun) {
      console.log("[dry-run] No writes performed. Re-run with --apply to commit.");
      return;
    }
    await applyPlan(pool, plans, picks);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[align-leads] FATAL:", e);
  process.exit(1);
});
