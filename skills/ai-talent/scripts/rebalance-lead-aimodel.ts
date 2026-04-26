/**
 * rebalance-lead-aimodel.ts
 *
 * Diversifies squad lead_agent_id across aiModel families.
 *
 * Why: Current state of 688 active squads has ~92% leads on Claude-Opus —
 * a single-vendor monoculture that breaks if Anthropic rate-limits or has
 * an outage. Per user directive (Azure AI Foundry priority), we want:
 *
 *   Target distribution (per layer):
 *     L1_brand        → claude-opus or gpt-5 (deep reasoning)        45/45
 *     L2_product      → gpt-4o or claude-sonnet                       50/50
 *     L3_audience     → gemini-2.5-pro or claude-sonnet                50/50
 *     L4_channel      → gpt-4o (Foundry) priority for tactical work    70/30 vs claude
 *     L5_campaign     → claude-sonnet for orchestration                60/40 vs gpt-4o
 *     L6_validation   → o3 (reasoning) for audits                      70/30 vs claude
 *     unassigned      → gpt-4o (cheap default)                        100
 *
 * Mechanics:
 *   1. For each squad, identify the layer-target families above
 *   2. If current lead's aiModel is NOT in the layer's target families,
 *      try to swap to an agent (same primarySkill, different aiModel) in
 *      a target family. If no candidate exists, leave the lead untouched.
 *   3. After swap, also patch the lead's row in `agents.aiModel` is NOT
 *      changed — we only change squads.lead_agent_id pointer.
 *
 * Constraints:
 *   - Never break methodology-author alignment: a brand-archetype squad
 *     led by a "carol-pearson" agent stays with that agent regardless
 *     of aiModel (the agent's identity matters more than the model).
 *     Detection: if lead's name/title contains the methodology author
 *     name from squads.methodology, lock the lead.
 *
 * Flags:
 *   --dry-run   show planned swaps, no UPDATE
 *   --layer X   only act on squads whose strategy_layer = X
 *   --apply-cap N  hard limit on number of swaps (safety)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const layerArg = process.argv.find((a) => a.startsWith("--layer="));
const ONLY_LAYER = layerArg ? layerArg.split("=")[1] : "";
const capArg = process.argv.find((a) => a.startsWith("--apply-cap="));
const CAP = capArg ? parseInt(capArg.split("=")[1], 10) : 99999;

type Family =
  | "anthropic-opus"
  | "anthropic-sonnet"
  | "anthropic-haiku"
  | "openai-gpt5"
  | "openai-gpt4o"
  | "openai-gpt41"
  | "openai-o3"
  | "openai-o4"
  | "google-gemini-pro"
  | "google-gemini-flash"
  | "deepseek"
  | "qwen"
  | "kimi"
  | "llama"
  | "phi"
  | "mistral"
  | "xai"
  | "perplexity"
  | "other";

function fam(model: string): Family {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return "anthropic-opus";
  if (m.includes("sonnet")) return "anthropic-sonnet";
  if (m.includes("haiku")) return "anthropic-haiku";
  if (m.includes("gpt-5") || m.includes("gpt5")) return "openai-gpt5";
  if (m.includes("gpt-4o") || m === "gpt-4o") return "openai-gpt4o";
  if (m.includes("gpt-4.1") || m.includes("gpt-41")) return "openai-gpt41";
  if (m.startsWith("o3")) return "openai-o3";
  if (m.startsWith("o4")) return "openai-o4";
  if (m.includes("gemini") && (m.includes("pro") || m.includes("2.5"))) return "google-gemini-pro";
  if (m.includes("gemini") && m.includes("flash")) return "google-gemini-flash";
  if (m.includes("gemini")) return "google-gemini-pro";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("qwen")) return "qwen";
  if (m.includes("kimi") || m.includes("moonshot")) return "kimi";
  if (m.includes("llama")) return "llama";
  if (m.includes("phi")) return "phi";
  if (m.includes("mistral")) return "mistral";
  if (m.includes("grok") || m.includes("xai")) return "xai";
  if (m.includes("sonar") || m.includes("perplexity")) return "perplexity";
  return "other";
}

// Per-layer preferred families ordered by priority (first = preferred lead)
const LAYER_PREFS: Record<string, Family[]> = {
  L1_brand:       ["anthropic-opus", "openai-gpt5",        "openai-gpt41",     "anthropic-sonnet"],
  L2_product:     ["openai-gpt4o",   "anthropic-sonnet",   "google-gemini-pro","openai-gpt41"],
  L3_audience:    ["google-gemini-pro", "anthropic-sonnet","openai-gpt4o",     "deepseek"],
  L4_channel:     ["openai-gpt4o",   "anthropic-sonnet",   "deepseek",         "openai-gpt41"],
  L5_campaign:    ["anthropic-sonnet","openai-gpt4o",      "openai-gpt5",      "google-gemini-pro"],
  L6_validation:  ["openai-o3",      "openai-o4",          "anthropic-opus",   "openai-gpt5"],
  unassigned:     ["openai-gpt4o",   "anthropic-sonnet",   "deepseek",         "google-gemini-pro"],
};

function isLeadLockedByAuthor(lead: any, methodology: string): boolean {
  if (!methodology) return false;
  // Pull author tokens from "Donald Miller — StoryBrand 7" → ["donald","miller"]
  const authorPart = methodology.split(/[—–-]/)[0]?.toLowerCase() || "";
  const tokens = authorPart.split(/[\s,]+/).filter((t) => t.length >= 4);
  if (!tokens.length) return false;
  const hay = `${lead?.name || ""} ${lead?.title || ""}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

async function main() {
  const pool = getPool();

  // 1. Pull squad rows + their current lead agent
  const squadSql = `
    SELECT s.id, s.slug, s.strategy_layer, s.methodology, s.lead_agent_id,
           s.tier,
           a.id AS lead_id, a.name AS lead_name, a.title AS lead_title,
           a.aiModel AS lead_aiModel, a.primarySkill AS lead_primarySkill
    FROM squads s
    LEFT JOIN agents a ON a.id = s.lead_agent_id
    WHERE s.is_active = 1 AND s.lead_agent_id IS NOT NULL
    ${ONLY_LAYER ? "AND s.strategy_layer = ?" : ""}`;
  const [squads]: any = await pool.query(squadSql, ONLY_LAYER ? [ONLY_LAYER] : []);
  console.log(`▼ ${squads.length} active squads with leads${ONLY_LAYER ? ` in ${ONLY_LAYER}` : ""}`);

  // Current distribution
  const before: Record<string, number> = {};
  for (const s of squads) before[fam(s.lead_aiModel)] = (before[fam(s.lead_aiModel)] || 0) + 1;

  // 2. For each squad needing swap, find candidate agent
  type Plan = {
    squadId: number; slug: string; layer: string;
    fromAgent: number; fromModel: string; fromFam: Family;
    toAgent: number;   toModel: string;   toFam: Family;
    reason: string;
  };
  const plans: Plan[] = [];
  let lockedByAuthor = 0, alreadyOnTarget = 0, noCandidate = 0;

  for (const s of squads) {
    const layer = s.strategy_layer || "unassigned";
    const prefs = LAYER_PREFS[layer] || LAYER_PREFS.unassigned;
    const currentFam = fam(s.lead_aiModel);
    if (prefs.includes(currentFam)) { alreadyOnTarget++; continue; }

    // Author-lock check: leave alone if lead matches methodology author
    if (isLeadLockedByAuthor({ name: s.lead_name, title: s.lead_title }, s.methodology)) {
      lockedByAuthor++;
      continue;
    }

    // Find candidate: same primarySkill, model in any of the preferred families
    const skill = s.lead_primarySkill;
    if (!skill) { noCandidate++; continue; }
    const [cand]: any = await pool.query(
      `SELECT id, name, aiModel, primarySkill
       FROM agents
       WHERE primarySkill = ? AND id <> ? AND aiModel IS NOT NULL
       LIMIT 200`,
      [skill, s.lead_id]
    );
    const targetAgent = cand.find((a: any) => prefs.includes(fam(a.aiModel)));
    if (!targetAgent) { noCandidate++; continue; }

    plans.push({
      squadId: s.id, slug: s.slug, layer,
      fromAgent: s.lead_id, fromModel: s.lead_aiModel, fromFam: currentFam,
      toAgent: targetAgent.id, toModel: targetAgent.aiModel, toFam: fam(targetAgent.aiModel),
      reason: `${layer} prefers ${prefs.slice(0, 2).join("/")}`,
    });
    if (plans.length >= CAP) break;
  }

  console.log(`\n▼ Plan: ${plans.length} swaps (cap=${CAP})`);
  console.log(`   already on target: ${alreadyOnTarget}`);
  console.log(`   author-locked:     ${lockedByAuthor}`);
  console.log(`   no candidate:      ${noCandidate}`);

  // Distribution after
  const after: Record<string, number> = { ...before };
  for (const p of plans) {
    after[p.fromFam] = (after[p.fromFam] || 1) - 1;
    after[p.toFam] = (after[p.toFam] || 0) + 1;
  }
  console.log("\n   distribution shift:");
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of [...keys].sort()) {
    const b = before[k] || 0, a = after[k] || 0;
    console.log(`     ${k.padEnd(22)} ${String(b).padStart(4)} → ${String(a).padStart(4)}  (${a - b >= 0 ? "+" : ""}${a - b})`);
  }

  // Sample plans
  console.log("\n   sample (first 8):");
  for (const p of plans.slice(0, 8)) {
    console.log(`     [${p.layer}] ${p.slug.padEnd(36)} ${p.fromModel.padEnd(22)} → ${p.toModel}`);
  }

  if (DRY_RUN) {
    console.log("\n  (dry-run — no UPDATE issued)");
    await closePool();
    return;
  }

  // 3. Apply
  console.log("\n▼ Applying swaps...");
  for (const p of plans) {
    await pool.execute(`UPDATE squads SET lead_agent_id = ? WHERE id = ?`, [p.toAgent, p.squadId]);
  }
  console.log(`✅ swapped ${plans.length} squad leads`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
