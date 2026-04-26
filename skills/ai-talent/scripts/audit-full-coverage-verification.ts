/**
 * audit-full-coverage-verification.ts
 *
 * Comprehensive 6-axis verification per user requirements:
 *   ① Every active squad has non-empty methodology
 *   ② Every squad lead has ≥1 skill overlapping with squad methodology tokens
 *   ③ Every squad step has assignedAgentId (or owner→agent resolvable)
 *   ④ Each step's assigned agent has compatible aiModel for that step's tool/family
 *      AND has ≥1 skill overlap with step.requiredSkills (or step name)
 *   ⑤ Every agent (lead + member + general) has ≥1 skill (token or assignment)
 *   ⑥ All skills used are sourced from skill_catalog (no orphan skill slugs)
 *
 * Read-only. Prints PASS/FAIL per axis with sample failures.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function provFamily(aiModel: string): string {
  const m = (aiModel || "").toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o3") || m.startsWith("o4") || m.includes("openai")) return "openai";
  if (m.includes("glm") || m.includes("zai") || m.includes("zhipu")) return "zai";
  if (m.includes("qwen") || m.includes("dashscope")) return "qwen";
  if (m.includes("minimax") || m.includes("hailuo")) return "minimax";
  if (m.includes("fal")) return "fal";
  return "other";
}

function isCompatible(bp: string, fam: string): boolean {
  const b = (bp || "any").toLowerCase();
  if (b === "any" || b === "tool" || b === "fal.ai" || b === "fal") return true;
  if (b === "anthropic") return fam === "anthropic";
  if (b === "openai") return fam === "openai";
  if (b === "zai" || b === "zhipu" || b === "glm") return fam === "zai";
  if (b === "qwen" || b === "dashscope") return fam === "qwen";
  if (b === "minimax" || b === "hailuo") return fam === "minimax";
  return true;
}

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function main() {
  const pool = getPool();

  // ────────────── Pre-load catalog ──────────────
  const [catalogRows]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`,
  );
  const catalog = new Map<string, any>();
  for (const c of catalogRows) {
    let tags: string[] = [];
    try { tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []); } catch {}
    catalog.set(c.slug, {
      slug: c.slug, bp: c.boundProvider, name: c.name,
      tokens: new Set([
        ...tokenize(c.slug), ...tokenize(c.name), ...tokenize(c.category || ""),
        ...tags.flatMap((t: string) => tokenize(t)),
      ]),
    });
  }
  console.log(`▼ catalog: ${catalog.size} skills loaded`);

  // ────────────── Pre-load agent → skill map ──────────────
  const [allAgents]: any = await pool.query(`
    SELECT a.id, a.name, a.aiModel, a.primarySkill,
           COALESCE(a.skills, JSON_ARRAY()) AS skillsJson
    FROM agents a`);
  const [allAssignments]: any = await pool.query(
    `SELECT agentId, skillSlug FROM agent_skill_assignments`);

  const agentSkills = new Map<number, Set<string>>();
  for (const a of allAgents) agentSkills.set(a.id, new Set<string>());
  for (const a of allAgents) {
    const arr = parseJson(a.skillsJson);
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (typeof s === "string") agentSkills.get(a.id)!.add(s);
        else if (s && typeof s.slug === "string") agentSkills.get(a.id)!.add(s.slug);
      }
    }
  }
  for (const r of allAssignments) {
    if (!agentSkills.has(r.agentId)) agentSkills.set(r.agentId, new Set());
    agentSkills.get(r.agentId)!.add(r.skillSlug);
  }
  const agentById = new Map<number, any>();
  for (const a of allAgents) agentById.set(a.id, a);

  // ────────────── ① Methodology ──────────────
  const [allSquads]: any = await pool.query(`
    SELECT id, slug, methodology, strategy_layer, lead_agent_id,
           COALESCE(steps, JSON_ARRAY()) AS steps,
           COALESCE(agents, JSON_ARRAY()) AS agentsJson
    FROM squads WHERE is_active = 1`);

  const noMethodology = allSquads.filter((s: any) => !s.methodology || String(s.methodology).trim() === "");
  console.log("\n════════════════════════════════════════");
  console.log("  ① EVERY SQUAD HAS METHODOLOGY");
  console.log("════════════════════════════════════════");
  console.log(`  active squads:                ${allSquads.length}`);
  console.log(`  squads without methodology:   ${noMethodology.length}`);
  if (noMethodology.length) {
    for (const s of noMethodology.slice(0, 10)) console.log(`    [${s.id}] ${s.slug}`);
    console.log(`  ❌ FAIL`);
  } else console.log(`  ✅ PASS`);

  // ────────────── ② Lead skill aligns with methodology ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  ② LEAD SKILL ↔ METHODOLOGY ALIGNMENT");
  console.log("════════════════════════════════════════");
  let leadAlignFail: any[] = [];
  for (const s of allSquads) {
    if (!s.lead_agent_id) continue;
    const methTokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.slug || ""),
    ]);
    const leadSkillSet = agentSkills.get(s.lead_agent_id) || new Set();
    let overlap = false;
    for (const slug of leadSkillSet) {
      const c = catalog.get(slug);
      if (!c) continue;
      for (const t of methTokens) if (c.tokens.has(t)) { overlap = true; break; }
      if (overlap) break;
    }
    if (!overlap) leadAlignFail.push({ slug: s.slug, lead: s.lead_agent_id, meth: s.methodology });
  }
  console.log(`  squads checked:               ${allSquads.length}`);
  console.log(`  leads NOT aligned w/ method:  ${leadAlignFail.length}`);
  for (const f of leadAlignFail.slice(0, 8)) {
    const a = agentById.get(f.lead);
    console.log(`    [${f.slug}] lead=${a?.name || f.lead} method="${(f.meth||"").slice(0,40)}"`);
  }
  console.log(leadAlignFail.length === 0 ? `  ✅ PASS` : `  ⚠️  ${leadAlignFail.length} need attention`);

  // ────────────── ③ Every step has assignedAgentId ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  ③ EVERY STEP HAS ASSIGNED AGENT");
  console.log("════════════════════════════════════════");
  let totalSteps = 0, missingAssign = 0;
  const stepFailSamples: string[] = [];
  for (const s of allSquads) {
    const steps = parseJson(s.steps);
    if (!Array.isArray(steps)) continue;
    for (const st of steps) {
      totalSteps++;
      const aid = st.assignedAgentId ?? st.agentId ?? st.assigned_agent_id ?? null;
      if (!aid) {
        missingAssign++;
        if (stepFailSamples.length < 8) {
          stepFailSamples.push(`[${s.slug}] step="${st.name || st.id || "?"}"`);
        }
      }
    }
  }
  console.log(`  total steps across squads:    ${totalSteps}`);
  console.log(`  steps without assigned agent: ${missingAssign}`);
  for (const ln of stepFailSamples) console.log(`    ${ln}`);
  console.log(missingAssign === 0 ? `  ✅ PASS` : `  ❌ FAIL`);

  // ────────────── ④ Step agent has compatible model + skill ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  ④ STEP AGENT MODEL + SKILL FIT");
  console.log("════════════════════════════════════════");
  let stepsWithAgent = 0, modelMismatch = 0, skillMismatch = 0;
  const fitSamples: string[] = [];
  for (const s of allSquads) {
    const steps = parseJson(s.steps);
    if (!Array.isArray(steps)) continue;
    for (const st of steps) {
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (!aid) continue;
      const a = agentById.get(aid);
      if (!a) continue;
      stepsWithAgent++;
      const fam = provFamily(a.aiModel);

      // model fit: if step.tool implies family, check
      const tool = (st.tool || "").toLowerCase();
      let modelOk = true;
      if (tool.includes("anthropic") && fam !== "anthropic") modelOk = false;
      else if (tool.includes("openai") && fam !== "openai") modelOk = false;
      else if ((tool.includes("zai") || tool.includes("zhipu")) && fam !== "zai") modelOk = false;
      else if ((tool.includes("qwen") || tool.includes("dashscope")) && fam !== "qwen") modelOk = false;
      if (!modelOk) modelMismatch++;

      // skill fit
      const required: string[] = Array.isArray(st.requiredSkills) ? st.requiredSkills : [];
      const stepTokens = new Set([
        ...required.flatMap((r: string) => tokenize(r)),
        ...tokenize(st.name || ""),
      ]);
      const agentSkillSet = agentSkills.get(aid) || new Set();
      let skillOk = required.length === 0 && stepTokens.size === 0; // no requirement → trivially ok
      if (!skillOk) {
        // direct slug match
        for (const r of required) if (agentSkillSet.has(r)) { skillOk = true; break; }
      }
      if (!skillOk) {
        // token overlap via catalog
        for (const slug of agentSkillSet) {
          const c = catalog.get(slug);
          if (!c) continue;
          for (const t of stepTokens) if (c.tokens.has(t)) { skillOk = true; break; }
          if (skillOk) break;
        }
      }
      if (!skillOk) {
        skillMismatch++;
        if (fitSamples.length < 8) fitSamples.push(`[${s.slug}] step="${st.name}" agent=${a.name} (no skill overlap)`);
      }
    }
  }
  console.log(`  steps with agent assigned:    ${stepsWithAgent}`);
  console.log(`  steps with model mismatch:    ${modelMismatch}`);
  console.log(`  steps with skill mismatch:    ${skillMismatch}`);
  for (const ln of fitSamples) console.log(`    ${ln}`);
  console.log((modelMismatch === 0 && skillMismatch === 0) ? `  ✅ PASS` : `  ⚠️  attention needed`);

  // ────────────── ⑤ Every agent has ≥1 skill ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  ⑤ EVERY AGENT HAS ≥1 SKILL");
  console.log("════════════════════════════════════════");
  let zero = 0;
  const zeroSamples: string[] = [];
  for (const a of allAgents) {
    const set = agentSkills.get(a.id);
    if (!set || set.size === 0) {
      zero++;
      if (zeroSamples.length < 8) zeroSamples.push(`[${a.id}] ${a.name} (${a.aiModel})`);
    }
  }
  console.log(`  total agents:                 ${allAgents.length}`);
  console.log(`  agents with 0 skills:         ${zero}`);
  for (const ln of zeroSamples) console.log(`    ${ln}`);
  console.log(zero === 0 ? `  ✅ PASS` : `  ❌ FAIL`);

  // ────────────── ⑥ Skills sourced from catalog ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  ⑥ ALL SKILLS SOURCED FROM CATALOG");
  console.log("════════════════════════════════════════");
  const orphanSkills = new Map<string, number>();
  for (const [, set] of agentSkills) {
    for (const slug of set) {
      if (!catalog.has(slug)) orphanSkills.set(slug, (orphanSkills.get(slug) || 0) + 1);
    }
  }
  console.log(`  catalog size:                 ${catalog.size}`);
  console.log(`  unique orphan skill slugs:    ${orphanSkills.size}`);
  let usageTotal = 0;
  const orphanSorted = [...orphanSkills.entries()].sort((a, b) => b[1] - a[1]);
  for (const [, n] of orphanSorted) usageTotal += n;
  console.log(`  total orphan-skill usages:    ${usageTotal}`);
  for (const [slug, n] of orphanSorted.slice(0, 10)) {
    console.log(`    "${slug}" used by ${n} agents`);
  }
  console.log(orphanSkills.size === 0 ? `  ✅ PASS` : `  ⚠️  ${orphanSkills.size} slugs not in catalog`);

  // ────────────── Summary ──────────────
  console.log("\n════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("════════════════════════════════════════");
  const results = [
    ["①  squad methodology",          noMethodology.length === 0],
    ["②  lead↔method skill align",   leadAlignFail.length === 0],
    ["③  every step has agent",       missingAssign === 0],
    ["④  step agent model+skill fit", modelMismatch === 0 && skillMismatch === 0],
    ["⑤  every agent ≥1 skill",       zero === 0],
    ["⑥  all skills in catalog",      orphanSkills.size === 0],
  ];
  for (const [label, ok] of results) console.log(`  ${ok ? "✅" : "❌"}  ${label}`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
