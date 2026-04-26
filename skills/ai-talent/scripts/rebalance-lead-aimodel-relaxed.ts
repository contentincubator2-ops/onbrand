/**
 * rebalance-lead-aimodel-relaxed.ts
 *
 * Phase-2 rebalance for the 483 squads where the strict "same primarySkill"
 * candidate pool was empty. Adds two fallback strategies, in order:
 *
 *   1. MEMBER-PROMOTE   Look at squads.agents JSON. If any non-lead member
 *                       already has aiModel in a target family for the
 *                       layer, promote that member to lead. (They were
 *                       already vetted as topically relevant when the
 *                       squad was built — strongest signal.)
 *
 *   2. SKILL-FAMILY     Tokenise the lead's primarySkill (e.g.
 *                       "seo-content-strategy" → ["seo","content","strategy"])
 *                       and find agents whose primarySkill shares ≥1 token
 *                       AND whose aiModel is in a target family.
 *                       Score by token overlap, prefer higher overlap.
 *
 *   3. SKILLS-JSON      As a last resort, find agents whose `skills` JSON
 *                       array literally contains the lead's primarySkill
 *                       string AND aiModel is in a target family.
 *
 * Author-locked squads remain skipped (methodology author identity wins).
 *
 * Default = dry-run.
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
  | "anthropic-opus" | "anthropic-sonnet" | "anthropic-haiku"
  | "openai-gpt5" | "openai-gpt4o" | "openai-gpt41" | "openai-o3" | "openai-o4"
  | "google-gemini-pro" | "google-gemini-flash"
  | "deepseek" | "qwen" | "kimi" | "llama" | "phi" | "mistral"
  | "xai" | "perplexity" | "other";

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
  const authorPart = methodology.split(/[—–-]/)[0]?.toLowerCase() || "";
  const tokens = authorPart.split(/[\s,]+/).filter((t) => t.length >= 4);
  if (!tokens.length) return false;
  const hay = `${lead?.name || ""} ${lead?.title || ""}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

async function main() {
  const pool = getPool();

  const squadSql = `
    SELECT s.id, s.slug, s.strategy_layer, s.methodology, s.lead_agent_id,
           s.agents AS agents_json,
           a.id AS lead_id, a.name AS lead_name, a.title AS lead_title,
           a.aiModel AS lead_aiModel, a.primarySkill AS lead_primarySkill
    FROM squads s
    LEFT JOIN agents a ON a.id = s.lead_agent_id
    WHERE s.is_active = 1 AND s.lead_agent_id IS NOT NULL
    ${ONLY_LAYER ? "AND s.strategy_layer = ?" : ""}`;
  const [squads]: any = await pool.query(squadSql, ONLY_LAYER ? [ONLY_LAYER] : []);
  console.log(`▼ ${squads.length} active squads with leads${ONLY_LAYER ? ` in ${ONLY_LAYER}` : ""}`);

  const before: Record<string, number> = {};
  for (const s of squads) before[fam(s.lead_aiModel)] = (before[fam(s.lead_aiModel)] || 0) + 1;

  type Plan = {
    squadId: number; slug: string; layer: string;
    fromAgent: number; fromModel: string; fromFam: Family;
    toAgent: number;   toModel: string;   toFam: Family;
    via: "member-promote" | "skill-family" | "skills-json";
  };
  const plans: Plan[] = [];
  let lockedByAuthor = 0, alreadyOnTarget = 0, noCandidate = 0;
  const viaCounts: Record<string, number> = { "member-promote": 0, "skill-family": 0, "skills-json": 0 };

  for (const s of squads) {
    const layer = s.strategy_layer || "unassigned";
    const prefs = LAYER_PREFS[layer] || LAYER_PREFS.unassigned;
    const currentFam = fam(s.lead_aiModel);
    if (prefs.includes(currentFam)) { alreadyOnTarget++; continue; }

    if (isLeadLockedByAuthor({ name: s.lead_name, title: s.lead_title }, s.methodology)) {
      lockedByAuthor++;
      continue;
    }

    let chosen: { id: number; aiModel: string; via: Plan["via"] } | null = null;

    // ── Strategy 1: member promote ───────────────────────────────────────
    let agentsJson: any[] = [];
    try {
      agentsJson = typeof s.agents_json === "string" ? JSON.parse(s.agents_json) : (s.agents_json || []);
    } catch { agentsJson = []; }
    const memberIds = agentsJson
      .filter((m: any) => m.agent_id && m.agent_id !== s.lead_id && !m.is_lead)
      .map((m: any) => m.agent_id);

    if (memberIds.length) {
      const [memRows]: any = await pool.query(
        `SELECT id, name, aiModel FROM agents WHERE id IN (${memberIds.map(() => "?").join(",")}) AND aiModel IS NOT NULL`,
        memberIds,
      );
      const ranked = memRows
        .map((m: any) => ({ ...m, fam: fam(m.aiModel), rank: prefs.indexOf(fam(m.aiModel)) }))
        .filter((m: any) => m.rank >= 0)
        .sort((a: any, b: any) => a.rank - b.rank);
      if (ranked.length) chosen = { id: ranked[0].id, aiModel: ranked[0].aiModel, via: "member-promote" };
    }

    // ── Strategy 2: skill family (token overlap) ────────────────────────
    if (!chosen && s.lead_primarySkill) {
      const toks = tokenize(s.lead_primarySkill);
      if (toks.length) {
        const likeClauses = toks.map(() => "primarySkill LIKE ?").join(" OR ");
        const params = [...toks.map((t) => `%${t}%`), s.lead_id];
        const [cand]: any = await pool.query(
          `SELECT id, name, aiModel, primarySkill
             FROM agents
             WHERE (${likeClauses}) AND id <> ? AND aiModel IS NOT NULL
             LIMIT 400`,
          params,
        );
        const scored = cand
          .map((a: any) => {
            const aToks = tokenize(a.primarySkill);
            const overlap = aToks.filter((t: string) => toks.includes(t)).length;
            return { ...a, overlap, fam: fam(a.aiModel), rank: prefs.indexOf(fam(a.aiModel)) };
          })
          .filter((a: any) => a.rank >= 0 && a.overlap >= 1)
          .sort((a: any, b: any) => b.overlap - a.overlap || a.rank - b.rank);
        if (scored.length) chosen = { id: scored[0].id, aiModel: scored[0].aiModel, via: "skill-family" };
      }
    }

    // ── Strategy 3: skills JSON contains primarySkill ───────────────────
    if (!chosen && s.lead_primarySkill) {
      const [cand]: any = await pool.query(
        `SELECT id, name, aiModel
           FROM agents
           WHERE JSON_SEARCH(skills, 'one', ?) IS NOT NULL
             AND id <> ? AND aiModel IS NOT NULL
           LIMIT 200`,
        [s.lead_primarySkill, s.lead_id],
      );
      const target = cand.find((a: any) => prefs.includes(fam(a.aiModel)));
      if (target) chosen = { id: target.id, aiModel: target.aiModel, via: "skills-json" };
    }

    if (!chosen) { noCandidate++; continue; }

    plans.push({
      squadId: s.id, slug: s.slug, layer,
      fromAgent: s.lead_id, fromModel: s.lead_aiModel, fromFam: currentFam,
      toAgent: chosen.id, toModel: chosen.aiModel, toFam: fam(chosen.aiModel),
      via: chosen.via,
    });
    viaCounts[chosen.via]++;
    if (plans.length >= CAP) break;
  }

  console.log(`\n▼ Plan: ${plans.length} swaps (cap=${CAP})`);
  console.log(`   already on target: ${alreadyOnTarget}`);
  console.log(`   author-locked:     ${lockedByAuthor}`);
  console.log(`   no candidate:      ${noCandidate}`);
  console.log(`   via member-promote: ${viaCounts["member-promote"]}`);
  console.log(`   via skill-family:   ${viaCounts["skill-family"]}`);
  console.log(`   via skills-json:    ${viaCounts["skills-json"]}`);

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

  console.log("\n   sample (first 10):");
  for (const p of plans.slice(0, 10)) {
    console.log(`     [${p.layer}] ${p.slug.padEnd(36)} ${p.fromModel.padEnd(22)} → ${p.toModel.padEnd(22)} (${p.via})`);
  }

  if (DRY_RUN) {
    console.log("\n  (dry-run — no UPDATE issued)");
    await closePool();
    return;
  }

  console.log("\n▼ Applying swaps...");
  for (const p of plans) {
    await pool.execute(`UPDATE squads SET lead_agent_id = ? WHERE id = ?`, [p.toAgent, p.squadId]);
  }
  console.log(`✅ swapped ${plans.length} squad leads`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
