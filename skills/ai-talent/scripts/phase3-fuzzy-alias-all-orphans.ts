/**
 * phase3-fuzzy-alias-all-orphans.ts
 *
 * Final pass: every remaining orphan slug in agent.skills JSON gets
 * auto-aliased to the best-matching catalog slug via token overlap.
 *
 *   - For each orphan slug: tokenize → score against every catalog slug
 *     → pick highest token-overlap (tiebreak: catalog slug shorter wins).
 *   - Threshold: overlap ≥ 1 token. If no match, skip (leave in JSON).
 *   - Rewrite agent.skills JSON; INSERT IGNORE assignment so router sees
 *     it.
 *   - Same treatment for step.requiredSkills (rewrite in squads.steps JSON).
 *
 * Also handles ② residual lead misalignment by adding a method-aligned
 * skill from catalog (relaxed: any token overlap ≥ 1).
 *
 * Idempotent.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().split(/[^\u4e00-\u9fa5a-z0-9]+/).filter((t) => t.length >= 2);
}
// note: support CJK chars by including unicode range; min 2 chars (so single CJK char + bi-grams)

function provFamily(aiModel: string): string {
  const m = (aiModel || "").toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o3") || m.startsWith("o4") || m.includes("openai")) return "openai";
  if (m.includes("glm") || m.includes("zai") || m.includes("zhipu")) return "zai";
  if (m.includes("qwen") || m.includes("dashscope")) return "qwen";
  return "other";
}

function isCompatible(bp: string, fam: string): boolean {
  const b = (bp || "any").toLowerCase();
  if (b === "any" || b === "tool" || b === "fal.ai") return true;
  if (b === "anthropic") return fam === "anthropic";
  if (b === "openai") return fam === "openai";
  if (b === "zai" || b === "zhipu" || b === "glm") return fam === "zai";
  if (b === "qwen" || b === "dashscope") return fam === "qwen";
  return true;
}

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

interface CatEntry { slug: string; bp: string; tokens: Set<string>; }

function bestMatch(orig: string, catalog: Map<string, CatEntry>): { slug: string; bp: string } | null {
  const tokens = tokenize(orig);
  if (tokens.length === 0) return null;
  let best: { slug: string; bp: string; overlap: number; len: number } | null = null;
  for (const [slug, c] of catalog) {
    let o = 0;
    for (const t of tokens) if (c.tokens.has(t)) o++;
    if (o === 0) continue;
    if (!best || o > best.overlap || (o === best.overlap && slug.length < best.len)) {
      best = { slug, bp: c.bp, overlap: o, len: slug.length };
    }
  }
  if (!best) return null;
  return { slug: best.slug, bp: best.bp };
}

async function main() {
  const pool = getPool();

  const [catRows]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`,
  );
  const catalog = new Map<string, CatEntry>();
  for (const c of catRows) {
    let tags: string[] = [];
    try { tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []); } catch {}
    catalog.set(c.slug, {
      slug: c.slug, bp: c.boundProvider,
      tokens: new Set([
        ...tokenize(c.slug), ...tokenize(c.name), ...tokenize(c.category || ""),
        ...tags.flatMap((t: string) => tokenize(t)),
      ]),
    });
  }
  console.log(`▼ catalog: ${catalog.size}`);

  const insertSql = `INSERT IGNORE INTO agent_skill_assignments
    (agentId, skillSlug, boundProvider, matchReason, confidence) VALUES (?, ?, ?, ?, ?)`;

  // ─── A) Fuzzy-alias agent.skills JSON ───
  console.log("\n══ A) Fuzzy-alias agent.skills ══");
  const [agents]: any = await pool.query(
    `SELECT id, COALESCE(skills, JSON_ARRAY()) AS skillsJson, aiModel FROM agents`,
  );
  let aAgents = 0, aRewrites = 0, aUnresolved = 0;
  const aliasCache = new Map<string, { slug: string; bp: string } | null>();
  for (const a of agents) {
    const arr = parseJson(a.skillsJson);
    if (!Array.isArray(arr)) continue;
    const fam = provFamily(a.aiModel);
    const out: string[] = [];
    let changed = false;
    for (const s of arr) {
      const orig = typeof s === "string" ? s : (s && typeof s.slug === "string" ? s.slug : null);
      if (!orig) continue;
      if (catalog.has(orig)) { out.push(orig); continue; }
      let m = aliasCache.get(orig);
      if (m === undefined) {
        m = bestMatch(orig, catalog);
        aliasCache.set(orig, m);
      }
      if (m && isCompatible(m.bp, fam)) {
        out.push(m.slug);
        changed = true;
        aRewrites++;
        if (!DRY_RUN) {
          await pool.execute(insertSql, [a.id, m.slug, m.bp, `fuzzy:${orig.slice(0,40)}`, 0.55]);
        }
      } else {
        aUnresolved++;
        out.push(orig);
      }
    }
    if (changed) {
      aAgents++;
      const dedup = [...new Set(out)];
      if (!DRY_RUN) {
        await pool.execute(`UPDATE agents SET skills = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(dedup), a.id]);
      }
    }
  }
  console.log(`  agents touched: ${aAgents}, rewrites: ${aRewrites}, unresolved: ${aUnresolved}`);

  // ─── B) Fuzzy-alias step.requiredSkills + backfill agent ───
  console.log("\n══ B) Fuzzy-alias step.requiredSkills ══");
  const [squads]: any = await pool.query(`
    SELECT id, slug, COALESCE(steps, JSON_ARRAY()) AS sj FROM squads WHERE is_active = 1`);

  // re-load skill map
  const [allAgents]: any = await pool.query(
    `SELECT a.id, a.aiModel, COALESCE(a.skills, JSON_ARRAY()) AS skillsJson FROM agents a`);
  const [allAsgn]: any = await pool.query(`SELECT agentId, skillSlug FROM agent_skill_assignments`);
  const skillMap = new Map<number, Set<string>>();
  const modelMap = new Map<number, string>();
  for (const a of allAgents) {
    skillMap.set(a.id, new Set());
    modelMap.set(a.id, a.aiModel);
    const arr = parseJson(a.skillsJson);
    if (Array.isArray(arr)) for (const x of arr) {
      const slug = typeof x === "string" ? x : (x && typeof x.slug === "string" ? x.slug : null);
      if (slug) skillMap.get(a.id)!.add(slug);
    }
  }
  for (const r of allAsgn) {
    if (!skillMap.has(r.agentId)) skillMap.set(r.agentId, new Set());
    skillMap.get(r.agentId)!.add(r.skillSlug);
  }

  let bRewrites = 0, bAdded = 0, bSquadsChanged = 0;
  for (const s of squads) {
    const steps = parseJson(s.sj);
    if (!Array.isArray(steps)) continue;
    let dirty = false;
    for (const st of steps) {
      if (!Array.isArray(st.requiredSkills)) continue;
      const newReq: string[] = [];
      for (const r of st.requiredSkills) {
        if (typeof r !== "string") { newReq.push(r); continue; }
        if (catalog.has(r)) { newReq.push(r); continue; }
        let m = aliasCache.get(r);
        if (m === undefined) { m = bestMatch(r, catalog); aliasCache.set(r, m); }
        if (m) { newReq.push(m.slug); dirty = true; bRewrites++; }
        else newReq.push(r);
      }
      st.requiredSkills = newReq;

      // backfill assigned agent
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (aid) {
        const have = skillMap.get(aid) || new Set();
        const fam = provFamily(modelMap.get(aid) || "");
        for (const slug of newReq) {
          if (!catalog.has(slug)) continue;
          if (have.has(slug)) continue;
          const c = catalog.get(slug)!;
          if (!isCompatible(c.bp, fam)) continue;
          if (!DRY_RUN) {
            const [rr]: any = await pool.execute(insertSql, [aid, slug, c.bp, `phase3-step:${s.slug}`, 0.6]);
            if (rr.affectedRows === 1) { bAdded++; have.add(slug); }
          } else bAdded++;
        }
      }
    }
    if (dirty) {
      bSquadsChanged++;
      if (!DRY_RUN) {
        await pool.execute(`UPDATE squads SET steps = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(steps), s.id]);
      }
    }
  }
  console.log(`  step rewrites: ${bRewrites}, agent skills added: ${bAdded}, squads changed: ${bSquadsChanged}`);

  // ─── C) Lead realign — relaxed token match (any catalog slug w/ overlap) ───
  console.log("\n══ C) Lead realign (final relaxed pass) ══");
  const [squads2]: any = await pool.query(`
    SELECT s.id AS sid, s.slug, s.methodology, s.strategy_layer,
           s.lead_agent_id, COALESCE(s.tags, JSON_ARRAY()) AS tagsJson,
           COALESCE(s.use_cases, JSON_ARRAY()) AS useCasesJson
    FROM squads s WHERE s.is_active = 1 AND s.lead_agent_id IS NOT NULL`);

  let cAdded = 0;
  for (const s of squads2) {
    const tags = parseJson(s.tagsJson) || [];
    const useCases = parseJson(s.useCasesJson) || [];
    const tokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.slug || ""),
      ...(Array.isArray(tags) ? tags.flatMap((t: any) => tokenize(String(t))) : []),
      ...(Array.isArray(useCases) ? useCases.flatMap((u: any) => tokenize(String(u))) : []),
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

    // find best catalog match
    let best: { slug: string; bp: string; o: number } | null = null;
    for (const [slug, c] of catalog) {
      let o = 0;
      for (const t of tokens) if (c.tokens.has(t)) o++;
      if (o > 0 && (!best || o > best.o)) best = { slug, bp: c.bp, o };
    }
    if (best && isCompatible(best.bp, provFamily(modelMap.get(s.lead_agent_id) || ""))) {
      if (!DRY_RUN) {
        const [r]: any = await pool.execute(insertSql, [s.lead_agent_id, best.slug, best.bp, `phase3-lead:${s.slug}`, 0.65]);
        if (r.affectedRows === 1) cAdded++;
      } else cAdded++;
    }
  }
  console.log(`  lead skills added: ${cAdded}`);

  console.log("\n✅ Phase-3 complete");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
