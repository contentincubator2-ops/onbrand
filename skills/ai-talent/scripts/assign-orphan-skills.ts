/**
 * assign-orphan-skills.ts
 *
 * Assigns skill_catalog skills to orphan agents (agents not referenced by any
 * squad as lead_agent_id or step.assignedAgentId).
 *
 * Matching strategy (highest precedence wins):
 *   1. Provider lock: skills with boundProvider compatible with the agent's
 *      aiModel family are eligible. We never put a Claude-only skill on a
 *      Qwen agent — that's the "skill ↔ aiModel binding" the user mandated.
 *   2. Token overlap: score each eligible skill by overlap between its
 *      slug+tags+category and the agent's primarySkill+title tokens.
 *   3. Fallback: if no token overlap, pick 3 generic skills from the same
 *      provider (e.g. anthropic agents get the 3 most-tagged "general"
 *      skills from the anthropics/skills harvest).
 *
 * Each orphan gets up to 5 skill rows in agent_skill_assignments.
 *
 * Idempotent on (agentId, skillSlug) UNIQUE — re-running keeps existing
 * assignments and only adds missing ones.
 *
 * Flags:
 *   --dry-run     show stats, no INSERTs
 *   --limit N     only process first N orphans
 *   --max-skills N  cap per-agent (default 5)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const limArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limArg ? parseInt(limArg.split("=")[1], 10) : 0;
const maxArg = process.argv.find((a) => a.startsWith("--max-skills="));
const MAX_SKILLS = maxArg ? parseInt(maxArg.split("=")[1], 10) : 5;

function family(m: string): string {
  const x = (m || "").toLowerCase();
  if (x.includes("claude") || x.includes("anthropic")) return "anthropic";
  if (x.includes("gpt") || x.startsWith("o3") || x.startsWith("o4") || x.includes("openai")) return "openai";
  if (x.includes("gemini") || x.includes("google") || x.includes("vertex")) return "google";
  if (x.includes("glm") || x.includes("zai") || x.includes("zhipu")) return "zai";
  if (x.includes("qwen") || x.includes("alibaba")) return "qwen";
  if (x.includes("deepseek")) return "deepseek";
  if (x.includes("kimi") || x.includes("moonshot")) return "moonshot";
  if (x.includes("mistral")) return "mistral";
  if (x.includes("phi")) return "microsoft";
  if (x.includes("llama") || x.includes("meta-llama")) return "meta";
  if (x.includes("grok")) return "xai";
  return "other";
}

// Provider compatibility: which families a bound_provider's skill works on.
// "tool-wrappers" (fal.ai, tavily, etc.) work on every family — they are
// API-driven, not model-locked.
const PROV_COMPAT: Record<string, Set<string>> = {
  anthropic: new Set(["anthropic"]),
  zai: new Set(["zai"]),
  zhipu: new Set(["zai"]),
  glm: new Set(["zai"]),
  openai: new Set(["openai"]),
  google: new Set(["google"]),
  qwen: new Set(["qwen"]),
  deepseek: new Set(["deepseek"]),
  moonshot: new Set(["moonshot"]),
  // Tool wrappers are universal
  tool: new Set(["*"]),
  any: new Set(["*"]),
  "fal.ai": new Set(["*"]),
  tavily: new Set(["*"]),
  perplexity: new Set(["*"]),
  browserbase: new Set(["*"]),
  meta: new Set(["*"]),
  cohere: new Set(["*"]),
  manus: new Set(["*"]),
  voltagent: new Set(["*"]),
  community: new Set(["*"]),
};

function isProviderCompatible(boundProvider: string, fam: string): boolean {
  const set = PROV_COMPAT[boundProvider];
  if (!set) return true; // unknown provider → permissive
  if (set.has("*")) return true;
  return set.has(fam);
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, " ")
    .split(/[\s\-_]+/)
    .filter((t) => t.length >= 3);
}

function score(agentTokens: Set<string>, skill: any): number {
  const skillTokens = new Set([
    ...tokenize(skill.slug),
    ...tokenize(skill.name),
    ...tokenize(skill.category || ""),
    ...tokenize(skill.description || ""),
    ...(Array.isArray(skill.tags) ? skill.tags.flatMap((t: string) => tokenize(t)) : []),
  ]);
  let s = 0;
  for (const t of agentTokens) if (skillTokens.has(t)) s++;
  return s;
}

async function main() {
  const pool = getPool();

  // 1. Load skill_catalog
  const [catRows]: any = await pool.query(`SELECT * FROM skill_catalog`);
  if (!catRows.length) {
    console.error("skill_catalog is empty — run db:harvest-skill-catalog + db:load-skill-catalog first");
    process.exit(1);
  }
  console.log(`▼ Loaded ${catRows.length} skills from skill_catalog`);

  // Parse JSON columns once
  const catalog = catRows.map((r: any) => ({
    ...r,
    tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : [],
    compatibleModels: r.compatibleModels ? (typeof r.compatibleModels === "string" ? JSON.parse(r.compatibleModels) : r.compatibleModels) : [],
  }));

  // Pre-bucket by provider for fallback path
  const byProvider: Record<string, any[]> = {};
  for (const s of catalog) (byProvider[s.boundProvider] ||= []).push(s);

  // 2. Find orphan agent ids
  console.log("▼ Identifying orphan agents...");
  // Lead agents
  const [leadRows]: any = await pool.query(
    `SELECT DISTINCT lead_agent_id AS id FROM squads WHERE lead_agent_id IS NOT NULL`
  );
  const assigned = new Set<number>(leadRows.map((r: any) => r.id));

  // assignedAgentId from steps JSON (688 squads, do it in JS)
  const [squadRows]: any = await pool.query(`SELECT steps FROM squads WHERE steps IS NOT NULL`);
  for (const sq of squadRows) {
    let steps: any[] = [];
    try { steps = typeof sq.steps === "string" ? JSON.parse(sq.steps) : sq.steps || []; } catch {}
    for (const st of steps) {
      if (st?.assignedAgentId) assigned.add(Number(st.assignedAgentId));
    }
  }
  console.log(`  ${assigned.size} agents are assigned to squads`);

  // 3. Fetch orphan agents
  const orphanSql = `SELECT id, name, title, primarySkill, aiModel
                     FROM agents
                     WHERE id NOT IN (${Array.from(assigned).join(",") || "0"})
                     ${LIMIT ? `LIMIT ${LIMIT}` : ""}`;
  const [orphans]: any = await pool.query(orphanSql);
  console.log(`▼ ${orphans.length} orphan agents to assign skills`);

  // 4. Score & insert
  const famCounts: Record<string, number> = {};
  const provDistrib: Record<string, number> = {};
  let totalAssign = 0, agentsTouched = 0;

  for (const a of orphans) {
    const fam = family(a.aiModel);
    famCounts[fam] = (famCounts[fam] || 0) + 1;
    const tokens = new Set([...tokenize(a.primarySkill), ...tokenize(a.title), ...tokenize(a.name)]);

    // Eligible skills (provider compatible)
    const eligible = catalog.filter((s: any) => isProviderCompatible(s.boundProvider, fam));
    if (!eligible.length) continue;

    // Score
    const scored = eligible
      .map((s: any) => ({ s, score: score(tokens, s) }))
      .sort((x, y) => y.score - x.score);

    // Pick top N (must have score>0 OR fallback to first N from native provider)
    let picks: any[] = scored.filter((x) => x.score > 0).slice(0, MAX_SKILLS).map((x) => x.s);
    if (picks.length < MAX_SKILLS) {
      // fallback: native provider bucket first, then universal "tool" / fal.ai
      const nativeBucket =
        byProvider[fam] ||
        (fam === "zai" ? byProvider["zhipu"] || byProvider["glm"] || [] : []) ||
        [];
      const universal = [
        ...(byProvider["tool"] || []),
        ...(byProvider["fal.ai"] || []),
        ...(byProvider["any"] || []),
      ];
      for (const s of [...nativeBucket, ...universal]) {
        if (picks.length >= MAX_SKILLS) break;
        if (!picks.find((p) => p.slug === s.slug)) picks.push(s);
      }
    }
    if (!picks.length) continue;

    if (DRY_RUN) {
      totalAssign += picks.length;
      agentsTouched++;
      for (const p of picks) provDistrib[p.boundProvider] = (provDistrib[p.boundProvider] || 0) + 1;
      continue;
    }

    for (const p of picks) {
      try {
        await pool.execute(
          `INSERT IGNORE INTO agent_skill_assignments
             (agentId, skillSlug, boundProvider, matchReason, confidence)
           VALUES (?, ?, ?, ?, ?)`,
          [
            a.id,
            p.slug,
            p.boundProvider,
            "token-overlap+provider-bind",
            Math.min(1, score(tokens, p) / 5),
          ]
        );
        totalAssign++;
        provDistrib[p.boundProvider] = (provDistrib[p.boundProvider] || 0) + 1;
      } catch (e: any) {
        // skip duplicates / fk errors silently
      }
    }
    agentsTouched++;
    if (agentsTouched % 1000 === 0) console.log(`  …${agentsTouched} orphans processed`);
  }

  console.log(`\n✅ ${DRY_RUN ? "would assign" : "assigned"} ${totalAssign} skills across ${agentsTouched} orphans`);
  console.log("  orphan family distribution:");
  for (const [k, v] of Object.entries(famCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(12)} ${v}`);
  }
  console.log("  skills assigned by provider:");
  for (const [k, v] of Object.entries(provDistrib).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(14)} ${v}`);
  }
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
