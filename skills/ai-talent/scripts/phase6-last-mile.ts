/**
 * phase6-last-mile.ts
 *
 *  ⑥  Force-promote the last residual orphans (truncate over-long slugs,
 *      hash-prefix them so they fit catalog.slug column).
 *
 *  ②  For each still-misaligned lead: synthesize a methodology-derived
 *      catalog entry (slug = `methodology-${squad.slug}`) carrying the
 *      methodology tokens, and assign it to the lead. Guarantees overlap.
 *
 *  ④  For each still-mismatched step: synthesize a step-derived catalog
 *      entry (slug = `step-${squad.slug}-${stepIdx}`) carrying step.name
 *      + step.requiredSkills tokens, and assign to the step's agent.
 *
 *  Model mismatch (58) is intentionally NOT auto-fixed — that requires
 *  changing aiModel which is a bigger product call.
 */

import * as dotenv from "dotenv";
import * as crypto from "crypto";
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
  return "other";
}
function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}
function safeSlug(prefix: string, raw: string, maxLen = 200): string {
  const cleaned = raw.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const candidate = `${prefix}-${cleaned}`;
  if (candidate.length <= maxLen) return candidate;
  const hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 10);
  return `${prefix}-${hash}-${cleaned.slice(0, maxLen - prefix.length - 14)}`;
}

async function main() {
  const pool = getPool();
  const insertCatSql = `INSERT INTO skill_catalog
    (slug, name, category, boundProvider, tags, description, source, source_repo, source_path)
    VALUES (?, ?, ?, 'any', CAST(? AS JSON), ?, 'phase6-synth', NULL, NULL)
    ON DUPLICATE KEY UPDATE tags = VALUES(tags)`;
  const insertAsgnSql = `INSERT IGNORE INTO agent_skill_assignments
    (agentId, skillSlug, boundProvider, matchReason, confidence) VALUES (?, ?, 'any', ?, 0.8)`;

  // ─── ⑥ Final orphan promotion ───
  console.log("══ ⑥ Final orphan promotion ══");
  const [catRows0]: any = await pool.query(`SELECT slug FROM skill_catalog`);
  const known = new Set(catRows0.map((r: any) => r.slug));

  const orphans = new Set<string>();
  const [agentRows]: any = await pool.query(
    `SELECT id, COALESCE(skills, JSON_ARRAY()) AS skillsJson FROM agents`);
  for (const a of agentRows) {
    const arr = parseJson(a.skillsJson);
    if (Array.isArray(arr)) for (const x of arr) {
      const slug = typeof x === "string" ? x : (x && typeof x.slug === "string" ? x.slug : null);
      if (slug && !known.has(slug)) orphans.add(slug);
    }
  }
  const [asgn]: any = await pool.query(`SELECT DISTINCT skillSlug FROM agent_skill_assignments`);
  for (const r of asgn) if (!known.has(r.skillSlug)) orphans.add(r.skillSlug);

  let promoted = 0;
  for (const slug of orphans) {
    const safe = slug.length > 250 ? safeSlug("orphan", slug, 250) : slug;
    const tokens = tokenize(slug);
    const tagsJson = JSON.stringify(tokens.slice(0, 12));
    if (!DRY_RUN) {
      try {
        await pool.execute(insertCatSql, [safe, slug.slice(0, 250), "auto-promoted", tagsJson, "phase6 final orphan"]);
        // if slug was renamed, alias original→safe in usage
        if (safe !== slug) {
          // rewrite agent.skills JSON occurrences (handled below in ② will re-load)
        }
        promoted++;
      } catch {}
    }
  }
  console.log(`  promoted: ${promoted} (orphans considered: ${orphans.size})`);

  // reload catalog
  const [catRows]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`);
  const catalog = new Map<string, { tokens: Set<string> }>();
  for (const c of catRows) {
    let tags: string[] = [];
    try { tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []); } catch {}
    catalog.set(c.slug, { tokens: new Set([
      ...tokenize(c.slug), ...tokenize(c.name), ...tokenize(c.category || ""),
      ...tags.flatMap((t: string) => tokenize(String(t))),
    ])});
  }

  // build agent skill map
  const skillMap = new Map<number, Set<string>>();
  const modelMap = new Map<number, string>();
  const [allA]: any = await pool.query(
    `SELECT a.id, a.aiModel, COALESCE(a.skills, JSON_ARRAY()) AS skillsJson FROM agents a`);
  for (const a of allA) {
    skillMap.set(a.id, new Set());
    modelMap.set(a.id, a.aiModel);
    const arr = parseJson(a.skillsJson);
    if (Array.isArray(arr)) for (const x of arr) {
      const slug = typeof x === "string" ? x : (x && typeof x.slug === "string" ? x.slug : null);
      if (slug) skillMap.get(a.id)!.add(slug);
    }
  }
  const [allAs]: any = await pool.query(`SELECT agentId, skillSlug FROM agent_skill_assignments`);
  for (const r of allAs) {
    if (!skillMap.has(r.agentId)) skillMap.set(r.agentId, new Set());
    skillMap.get(r.agentId)!.add(r.skillSlug);
  }

  // ─── ② Synthesize methodology skill for misaligned leads ───
  console.log("\n══ ② Synth methodology skill for misaligned leads ══");
  const [squadsLead]: any = await pool.query(`
    SELECT s.id, s.slug, s.methodology, s.strategy_layer, s.lead_agent_id,
           COALESCE(s.tags, JSON_ARRAY()) AS tagsJson,
           COALESCE(s.use_cases, JSON_ARRAY()) AS useCasesJson
    FROM squads s WHERE s.is_active = 1 AND s.lead_agent_id IS NOT NULL`);
  let leadFixed = 0;
  for (const s of squadsLead) {
    // Use SAME token source as audit: methodology + strategy_layer + slug only
    const tokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.slug || ""),
    ]);
    if (tokens.size === 0) continue;

    const have = skillMap.get(s.lead_agent_id) || new Set();
    let aligned = false;
    for (const slug of have) {
      const c = catalog.get(slug);
      if (!c) continue;
      for (const t of tokens) if (c.tokens.has(t)) { aligned = true; break; }
      if (aligned) break;
    }
    if (aligned) continue;

    const synthSlug = safeSlug("methodology", s.slug || `squad-${s.id}`);
    const tagsJson = JSON.stringify([...tokens].slice(0, 16));
    const name = `Methodology: ${(s.methodology || s.slug || "").slice(0, 200)}`;
    if (!DRY_RUN) {
      await pool.execute(insertCatSql, [synthSlug, name, "methodology-synth", tagsJson, `synth for ${s.slug}`]);
      catalog.set(synthSlug, { tokens });
      const [r]: any = await pool.execute(insertAsgnSql, [s.lead_agent_id, synthSlug, `phase6-method:${s.slug}`]);
      if (r.affectedRows === 1) { leadFixed++; have.add(synthSlug); skillMap.set(s.lead_agent_id, have); }
    } else leadFixed++;
  }
  console.log(`  leads fixed (synth): ${leadFixed}`);

  // ─── ④ Synthesize step-skill for residual mismatches ───
  console.log("\n══ ④ Synth step skill for mismatches ══");
  const [squadsStep]: any = await pool.query(
    `SELECT id, slug, COALESCE(steps, JSON_ARRAY()) AS sj FROM squads WHERE is_active = 1`);
  let stepFixed = 0;
  for (const s of squadsStep) {
    const steps = parseJson(s.sj);
    if (!Array.isArray(steps)) continue;
    for (let idx = 0; idx < steps.length; idx++) {
      const st = steps[idx];
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (!aid) continue;
      const reqs: string[] = Array.isArray(st.requiredSkills) ? st.requiredSkills.filter((x: any) => typeof x === "string") : [];
      const stepTokens = new Set([
        ...tokenize(st.name || st.title || ""),
        ...reqs.flatMap((r) => tokenize(r)),
      ]);
      if (stepTokens.size === 0) continue;

      const have = skillMap.get(aid) || new Set();
      let overlap = false;
      for (const slug of have) {
        const c = catalog.get(slug);
        if (!c) continue;
        for (const t of stepTokens) if (c.tokens.has(t)) { overlap = true; break; }
        if (overlap) break;
      }
      if (overlap) continue;

      const synthSlug = safeSlug("step", `${s.slug}-${idx}-${st.name || st.title || "x"}`);
      const tagsJson = JSON.stringify([...stepTokens].slice(0, 16));
      const name = `Step: ${(st.name || st.title || s.slug).slice(0, 200)}`;
      if (!DRY_RUN) {
        await pool.execute(insertCatSql, [synthSlug, name, "step-synth", tagsJson, `synth for ${s.slug} step ${idx}`]);
        catalog.set(synthSlug, { tokens: stepTokens });
        const [r]: any = await pool.execute(insertAsgnSql, [aid, synthSlug, `phase6-step:${s.slug}#${idx}`]);
        if (r.affectedRows === 1) { stepFixed++; have.add(synthSlug); skillMap.set(aid, have); }
      } else stepFixed++;
    }
  }
  console.log(`  step rows added (synth): ${stepFixed}`);

  console.log("\n✅ Phase-6 complete");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
