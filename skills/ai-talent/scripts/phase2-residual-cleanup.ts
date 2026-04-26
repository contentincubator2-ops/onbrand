/**
 * phase2-residual-cleanup.ts
 *
 * After Phase-1 (normalize + harvest + lead-realign + step-backfill),
 * residuals remained:
 *   - ② 104 leads still misaligned w/ methodology
 *   - ③ 6 squad steps with no assignedAgentId (nanobanana-ppt-skills-*)
 *   - ④ 2800 step-skill mismatches + 58 model-tool mismatches
 *   - ⑥ 3392 orphan slugs (industry verticals + Chinese variants)
 *
 * This phase:
 *   A) Add ~25 industry-vertical catalog entries (ecommerce, beauty, fashion,
 *      food, fintech, saas, healthcare, education, b2b, b2c, retail, etc.)
 *   B) Extend alias map for additional Chinese / English variants
 *   C) Fix 6 nanobanana steps — assign first available squad member
 *   D) For each step skill-mismatch, rewrite step.requiredSkills inline
 *      to use catalog slugs (where alias resolves) so future audit passes
 *   E) For 104 still-misaligned leads, relax token match by also matching
 *      against squad.tags + squad.use_cases tokens
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

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

// Industry verticals — add as catalog entries (category="vertical", bp="any")
const VERTICALS = [
  ["vertical-ecommerce", "E-commerce vertical", ["ecommerce", "online retail"]],
  ["vertical-beauty", "Beauty & cosmetics vertical", ["beauty", "cosmetics"]],
  ["vertical-fashion", "Fashion vertical", ["fashion", "apparel"]],
  ["vertical-food", "Food & beverage vertical", ["food", "beverage", "fnb"]],
  ["vertical-fintech", "Fintech vertical", ["fintech", "finance"]],
  ["vertical-saas", "SaaS vertical", ["saas", "software"]],
  ["vertical-healthcare", "Healthcare vertical", ["healthcare", "medical"]],
  ["vertical-education", "Education vertical", ["education", "edtech"]],
  ["vertical-b2b", "B2B vertical", ["b2b"]],
  ["vertical-b2c", "B2C vertical", ["b2c"]],
  ["vertical-retail", "Retail vertical", ["retail"]],
  ["vertical-restaurant", "Restaurant vertical", ["restaurant", "fnb"]],
  ["vertical-realestate", "Real estate vertical", ["realestate", "property"]],
  ["vertical-automotive", "Automotive vertical", ["automotive", "auto"]],
  ["vertical-travel", "Travel vertical", ["travel", "tourism"]],
  ["vertical-gaming", "Gaming vertical", ["gaming", "esports"]],
  ["vertical-luxury", "Luxury vertical", ["luxury"]],
  ["vertical-cpg", "Consumer-packaged-goods vertical", ["cpg", "fmcg"]],
  ["vertical-manufacturing", "Manufacturing vertical", ["manufacturing"]],
  ["vertical-logistics", "Logistics vertical", ["logistics"]],
  ["vertical-energy", "Energy vertical", ["energy"]],
  ["vertical-nonprofit", "Non-profit vertical", ["nonprofit", "ngo"]],
  ["vertical-government", "Government vertical", ["government", "publicsector"]],
  ["vertical-entertainment", "Entertainment vertical", ["entertainment", "media"]],
  ["vertical-fitness", "Fitness & wellness vertical", ["fitness", "wellness"]],
];

// Extended alias map (Phase-2)
const ALIAS_2: Record<string, string> = {
  // Verticals (lowercase)
  "ecommerce": "vertical-ecommerce",
  "beauty": "vertical-beauty",
  "fashion": "vertical-fashion",
  "food": "vertical-food",
  "fintech": "vertical-fintech",
  "saas": "vertical-saas",
  "healthcare": "vertical-healthcare",
  "education": "vertical-education",
  "b2b": "vertical-b2b",
  "b2c": "vertical-b2c",
  "retail": "vertical-retail",
  "restaurant": "vertical-restaurant",
  // Chinese variants
  "客戶關係管理": "customer-relationship",
  "數據驅動決策": "data-driven-marketing",
  "客戶開發": "business-development",
  "銷售管理": "sales-negotiation",
  "客戶服務": "customer-relationship",
  "市場行銷": "marketing-generalist",
  "企業策略": "marketing-strategy-pmm",
  "電商營運": "vertical-ecommerce",
  "網路行銷": "marketing-generalist",
  "公關媒體": "press",
  "活動策劃": "campaign-management",
  "品牌行銷": "brand-strategy",
  "設計思考": "marketing-strategy-pmm",
  "用戶體驗": "audience-research",
  "產品經理": "product-marketing",
  "成長駭客": "growth-marketing",
  "內容策略": "content-strategy",
  "社群經營": "social-media-marketing",
  "電子郵件行銷": "email-marketing-strategy",
  "搜尋引擎行銷": "seo-strategy",
  "聯盟行銷": "affiliate-marketing",
  "影音行銷": "social-media-marketing",
  "直播行銷": "social-media-marketing",
  "口碑行銷": "marketing-generalist",
  "數位廣告": "campaign-management",
  "媒體採買": "campaign-management",
  "投放優化": "campaign-management",
  // Title-Case extras
  "Marketing Strategy": "marketing-strategy-pmm",
  "Brand Strategy": "brand-strategy",
  "Content Marketing": "content-strategy",
  "Social Media": "social-media-marketing",
  "Email Marketing": "email-marketing-strategy",
  "SEO": "seo-strategy",
  "PPC": "campaign-management",
  "Growth Hacking": "growth-marketing",
  "User Research": "audience-research",
  "Product Management": "product-marketing",
  "CRM": "crm-marketing",
  "Influencer Marketing": "kol-brief",
  "Affiliate Marketing": "affiliate-marketing",
  "Public Relations": "press",
  "Event Management": "campaign-management",
  "Brand Management": "brand-management",
  "Digital Transformation": "digital-transformation",
  "Customer Experience": "audience-research",
};

async function main() {
  const pool = getPool();

  // ─── A) Add verticals ───
  console.log("══ A) Add industry-vertical catalog ══");
  let aIns = 0;
  for (const [slug, name, tags] of VERTICALS) {
    if (DRY_RUN) { aIns++; continue; }
    const [r]: any = await pool.execute(
      `INSERT INTO skill_catalog (slug, name, category, boundProvider, tags, description, source)
       VALUES (?, ?, 'vertical', 'any', CAST(? AS JSON), ?, 'industry-verticals')
       ON DUPLICATE KEY UPDATE name=VALUES(name), tags=VALUES(tags)`,
      [slug, name, JSON.stringify(tags), `Industry vertical: ${name}`],
    );
    if (r.affectedRows === 1) aIns++;
  }
  console.log(`  +${aIns} verticals`);

  // ─── Reload catalog ───
  const [catRows]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`,
  );
  const catalog = new Map<string, any>();
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
  console.log(`  catalog now: ${catalog.size}`);

  // ─── B) Apply Phase-2 aliases to agent.skills JSON ───
  console.log("\n══ B) Phase-2 alias rewrite ══");
  const [agents]: any = await pool.query(
    `SELECT id, COALESCE(skills, JSON_ARRAY()) AS skillsJson, aiModel FROM agents`,
  );
  let bAgents = 0, bSlugs = 0;
  const insertSql = `INSERT IGNORE INTO agent_skill_assignments
    (agentId, skillSlug, boundProvider, matchReason, confidence) VALUES (?, ?, ?, ?, ?)`;
  for (const a of agents) {
    const arr = parseJson(a.skillsJson);
    if (!Array.isArray(arr)) continue;
    const newSkills: string[] = [];
    let changed = false;
    for (const s of arr) {
      const orig = typeof s === "string" ? s : (s && typeof s.slug === "string" ? s.slug : null);
      if (!orig) continue;
      if (catalog.has(orig)) { newSkills.push(orig); continue; }
      const mapped = ALIAS_2[orig];
      if (mapped && catalog.has(mapped)) {
        newSkills.push(mapped);
        changed = true;
        bSlugs++;
        if (!DRY_RUN) {
          const c = catalog.get(mapped);
          await pool.execute(insertSql, [a.id, mapped, c.bp, `phase2-alias:${orig}`, 0.7]);
        }
      } else {
        newSkills.push(orig);
      }
    }
    if (changed) {
      bAgents++;
      const dedup = [...new Set(newSkills)];
      if (!DRY_RUN) {
        await pool.execute(`UPDATE agents SET skills = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(dedup), a.id]);
      }
    }
  }
  console.log(`  agents touched: ${bAgents}, slugs rewritten: ${bSlugs}`);

  // ─── C) Fix 6 nanobanana steps without assignedAgentId ───
  console.log("\n══ C) Fix steps without assignedAgentId ══");
  const [orphSquads]: any = await pool.query(`
    SELECT id, slug, COALESCE(steps, JSON_ARRAY()) AS stepsJson,
           COALESCE(agents, JSON_ARRAY()) AS agentsJson, lead_agent_id
    FROM squads WHERE is_active = 1`);
  let cFixed = 0;
  for (const s of orphSquads) {
    const steps = parseJson(s.stepsJson);
    if (!Array.isArray(steps)) continue;
    const members = parseJson(s.agentsJson);
    const memberIds: number[] = Array.isArray(members)
      ? members.map((m: any) => (typeof m === "number" ? m : m?.id ?? m?.agentId)).filter(Boolean)
      : [];
    let changed = false;
    for (const st of steps) {
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (aid) continue;
      const pick = s.lead_agent_id || memberIds[0];
      if (pick) {
        st.assignedAgentId = pick;
        changed = true;
        cFixed++;
      }
    }
    if (changed && !DRY_RUN) {
      await pool.execute(`UPDATE squads SET steps = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(steps), s.id]);
    }
  }
  console.log(`  steps fixed: ${cFixed}`);

  // ─── D) Lead realign Phase-2 — relax token match by including squad.tags ───
  console.log("\n══ D) Lead realign Phase-2 (with tags) ══");
  const [squads2]: any = await pool.query(`
    SELECT s.id AS sid, s.slug, s.methodology, s.strategy_layer,
           s.lead_agent_id, COALESCE(s.tags, JSON_ARRAY()) AS tagsJson,
           COALESCE(s.use_cases, JSON_ARRAY()) AS useCasesJson,
           COALESCE(s.agents, JSON_ARRAY()) AS membersJson
    FROM squads s WHERE s.is_active = 1`);

  // Re-load skill map
  const [allAgents]: any = await pool.query(
    `SELECT a.id, a.aiModel, COALESCE(a.skills, JSON_ARRAY()) AS skillsJson FROM agents a`);
  const [allAsgn]: any = await pool.query(`SELECT agentId, skillSlug FROM agent_skill_assignments`);
  const skillMap = new Map<number, Set<string>>();
  const modelMap = new Map<number, string>();
  for (const a of allAgents) {
    skillMap.set(a.id, new Set());
    modelMap.set(a.id, a.aiModel);
    const arr = parseJson(a.skillsJson);
    if (Array.isArray(arr)) for (const s of arr) {
      const slug = typeof s === "string" ? s : (s && typeof s.slug === "string" ? s.slug : null);
      if (slug) skillMap.get(a.id)!.add(slug);
    }
  }
  for (const r of allAsgn) {
    if (!skillMap.has(r.agentId)) skillMap.set(r.agentId, new Set());
    skillMap.get(r.agentId)!.add(r.skillSlug);
  }

  function aligns(agentId: number, tokens: Set<string>): boolean {
    const set = skillMap.get(agentId);
    if (!set) return false;
    for (const slug of set) {
      const c = catalog.get(slug);
      if (!c) continue;
      for (const t of tokens) if (c.tokens.has(t)) return true;
    }
    return false;
  }

  let dAdded = 0;
  for (const s of squads2) {
    if (!s.lead_agent_id) continue;
    const tags = parseJson(s.tagsJson) || [];
    const useCases = parseJson(s.useCasesJson) || [];
    const tokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.slug || ""),
      ...(Array.isArray(tags) ? tags.flatMap((t: string) => tokenize(String(t))) : []),
      ...(Array.isArray(useCases) ? useCases.flatMap((u: string) => tokenize(String(u))) : []),
    ]);
    if (tokens.size === 0) continue;
    if (aligns(s.lead_agent_id, tokens)) continue;

    // Find best matching catalog skill, add to lead
    let best: { slug: string; bp: string; overlap: number } | null = null;
    for (const [slug, c] of catalog) {
      let o = 0;
      for (const t of tokens) if (c.tokens.has(t)) o++;
      if (o > 0 && (!best || o > best.overlap)) best = { slug, bp: c.bp, overlap: o };
    }
    if (best && isCompatible(best.bp, provFamily(modelMap.get(s.lead_agent_id) || ""))) {
      if (!DRY_RUN) {
        const [r]: any = await pool.execute(insertSql, [s.lead_agent_id, best.slug, best.bp, `lead-method-tag-align:${s.slug}`, 0.7]);
        if (r.affectedRows === 1) dAdded++;
      } else dAdded++;
    }
  }
  console.log(`  lead skills added: ${dAdded}`);

  // ─── E) Step skill mismatch fix Phase-2: alias step.requiredSkills + add ───
  console.log("\n══ E) Step requiredSkills alias rewrite + backfill ══");
  let eRewrites = 0, eAdded = 0;
  for (const s of squads2) {
    const [stepsRow]: any = await pool.query(`SELECT COALESCE(steps, JSON_ARRAY()) AS sj FROM squads WHERE id = ?`, [s.sid]);
    const steps = parseJson(stepsRow[0].sj);
    if (!Array.isArray(steps)) continue;
    let dirty = false;
    for (const st of steps) {
      if (!Array.isArray(st.requiredSkills)) continue;
      const newReq: string[] = [];
      for (const r of st.requiredSkills) {
        if (typeof r !== "string") { newReq.push(r); continue; }
        if (catalog.has(r)) { newReq.push(r); continue; }
        const mapped = ALIAS_2[r];
        if (mapped && catalog.has(mapped)) {
          newReq.push(mapped);
          dirty = true;
          eRewrites++;
        } else {
          newReq.push(r);
        }
      }
      st.requiredSkills = newReq;

      // Backfill skill to assigned agent
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (aid) {
        const have = skillMap.get(aid) || new Set();
        const fam = provFamily(modelMap.get(aid) || "");
        for (const slug of newReq) {
          if (!catalog.has(slug)) continue;
          if (have.has(slug)) continue;
          const c = catalog.get(slug);
          if (!isCompatible(c.bp, fam)) continue;
          if (!DRY_RUN) {
            const [rr]: any = await pool.execute(insertSql, [aid, slug, c.bp, `phase2-step-required:${s.slug}`, 0.7]);
            if (rr.affectedRows === 1) { eAdded++; have.add(slug); }
          } else eAdded++;
        }
      }
    }
    if (dirty && !DRY_RUN) {
      await pool.execute(`UPDATE squads SET steps = CAST(? AS JSON) WHERE id = ?`, [JSON.stringify(steps), s.sid]);
    }
  }
  console.log(`  step.requiredSkills rewrites: ${eRewrites}, agent skills added: ${eAdded}`);

  console.log("\n✅ Phase-2 complete");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
