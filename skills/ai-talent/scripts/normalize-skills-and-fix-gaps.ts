/**
 * normalize-skills-and-fix-gaps.ts
 *
 * Stage A: expand catalog with tools + missing slugs (~70 new entries)
 * Stage B: normalize orphan slugs in skills JSON via alias map
 *          (Chinese names + Title-Case marketing terms → catalog slugs)
 * Stage C: realign squad leads — for every squad whose lead skill has
 *          zero token-overlap with squad methodology, look at squad.agents
 *          (or top step requiredSkills) for a member whose skill DOES
 *          align, and swap lead_agent_id to that member.
 * Stage D: step-aware skill backfill — for every step with assigned
 *          agent whose skills don't intersect step.requiredSkills,
 *          INSERT IGNORE the requiredSkills directly to that agent
 *          (filtered by catalog membership + provider compatibility).
 * Stage E: residual fix — agents with 0 skills get backstop trio.
 *
 * Idempotent. Pass --dry-run to print plan only.
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

// ─── New catalog entries (tools + missing canonical slugs) ───
// All boundProvider="any" / "tool" → universal compatibility
const NEW_CATALOG: Array<{ slug: string; name: string; category: string; bp: string; tags: string[]; description: string }> = [
  // Programming/data tools
  { slug: "tool-pandas", name: "Pandas data manipulation", category: "tool", bp: "tool", tags: ["python", "data", "analytics"], description: "Use pandas for data wrangling and analysis." },
  { slug: "tool-python", name: "Python programming", category: "tool", bp: "tool", tags: ["python", "scripting"], description: "Write and execute Python code." },
  { slug: "tool-sql", name: "SQL queries", category: "tool", bp: "tool", tags: ["sql", "database"], description: "Compose SQL queries and database operations." },
  { slug: "tool-numpy", name: "NumPy numerical compute", category: "tool", bp: "tool", tags: ["python", "numerical"], description: "Use NumPy for numerical computation." },
  { slug: "tool-scipy-stats", name: "SciPy statistics", category: "tool", bp: "tool", tags: ["python", "statistics"], description: "Statistical analysis with SciPy." },
  { slug: "tool-matplotlib", name: "Matplotlib charts", category: "tool", bp: "tool", tags: ["python", "viz"], description: "Plot charts via matplotlib." },
  { slug: "tool-jupyter", name: "Jupyter notebook authoring", category: "tool", bp: "tool", tags: ["python", "notebook"], description: "Author Jupyter notebooks." },
  { slug: "tool-docker", name: "Docker containers", category: "tool", bp: "tool", tags: ["devops"], description: "Build and run Docker containers." },
  { slug: "tool-kubernetes", name: "Kubernetes orchestration", category: "tool", bp: "tool", tags: ["devops"], description: "Deploy on Kubernetes." },
  { slug: "tool-react", name: "React UI development", category: "tool", bp: "tool", tags: ["frontend"], description: "Build React UIs." },
  { slug: "tool-javascript", name: "JavaScript programming", category: "tool", bp: "tool", tags: ["frontend", "node"], description: "Write JavaScript." },
  { slug: "tool-web-search", name: "Web search", category: "tool", bp: "tool", tags: ["search", "research"], description: "Perform web searches." },
  { slug: "tool-web-scraping", name: "Web scraping", category: "tool", bp: "tool", tags: ["scraping", "research"], description: "Scrape web pages." },
  { slug: "tool-serpapi", name: "SerpAPI search", category: "tool", bp: "tool", tags: ["search"], description: "Query SerpAPI for SERP data." },
  { slug: "tool-similarweb", name: "SimilarWeb API", category: "tool", bp: "tool", tags: ["analytics", "competitive"], description: "Pull SimilarWeb traffic data." },
  { slug: "tool-google-sheets", name: "Google Sheets API", category: "tool", bp: "tool", tags: ["spreadsheets", "google"], description: "Read/write Google Sheets." },
  { slug: "tool-google-forms", name: "Google Forms API", category: "tool", bp: "tool", tags: ["forms", "google"], description: "Operate Google Forms." },
  { slug: "tool-google-search-console", name: "Google Search Console API", category: "tool", bp: "tool", tags: ["seo", "google"], description: "Pull Search Console data." },
  { slug: "tool-pytrends", name: "Google Trends (pytrends)", category: "tool", bp: "tool", tags: ["trends", "research"], description: "Query Google Trends via pytrends." },
  { slug: "tool-surveymonkey", name: "SurveyMonkey API", category: "tool", bp: "tool", tags: ["survey"], description: "Operate SurveyMonkey." },
  { slug: "tool-semrush", name: "SEMrush API", category: "tool", bp: "tool", tags: ["seo", "competitive"], description: "Query SEMrush." },
  { slug: "tool-world-bank", name: "World Bank API", category: "tool", bp: "tool", tags: ["macro", "data"], description: "Pull World Bank macro data." },
  // Output formats
  { slug: "output-excel", name: "Excel workbook export", category: "output", bp: "tool", tags: ["spreadsheet", "report"], description: "Export to .xlsx." },
  { slug: "output-tableau-csv", name: "Tableau-ready CSV export", category: "output", bp: "tool", tags: ["bi", "csv"], description: "Generate CSV for Tableau." },
  { slug: "output-pptx", name: "PowerPoint deck (python-pptx)", category: "output", bp: "tool", tags: ["deck", "presentation"], description: "Author .pptx via python-pptx." },
  { slug: "output-pdf-report", name: "PDF report generation", category: "output", bp: "tool", tags: ["report"], description: "Generate PDF reports." },
  // Marketing canon — additions
  { slug: "crm-marketing", name: "CRM marketing", category: "marketing-channel", bp: "any", tags: ["crm", "lifecycle"], description: "Use CRM for lifecycle marketing." },
  { slug: "data-driven-marketing", name: "Data-driven marketing", category: "marketing-strategy", bp: "any", tags: ["analytics"], description: "Leverage analytics to drive marketing decisions." },
  { slug: "mobile-marketing", name: "Mobile marketing", category: "marketing-channel", bp: "any", tags: ["mobile", "app"], description: "Engage users via mobile channels." },
  { slug: "programmatic-advertising-2", name: "Programmatic advertising operations", category: "marketing-channel", bp: "any", tags: ["adtech"], description: "Execute programmatic ad buys." },
  { slug: "campaign-management", name: "Campaign management", category: "marketing-strategy", bp: "any", tags: ["campaign"], description: "Manage end-to-end marketing campaigns." },
  { slug: "personalization", name: "Personalization strategy", category: "marketing-strategy", bp: "any", tags: ["personalization"], description: "Personalize messaging by segment." },
  { slug: "customer-segmentation", name: "Customer segmentation", category: "audience", bp: "any", tags: ["segmentation"], description: "Segment customers." },
  { slug: "product-marketing", name: "Product marketing", category: "marketing-strategy", bp: "any", tags: ["pmm"], description: "Drive product positioning and launch." },
  { slug: "data-analytics", name: "Data analytics", category: "analytics", bp: "any", tags: ["analytics", "data"], description: "Analyze marketing data." },
  { slug: "market-analysis", name: "Market analysis", category: "research", bp: "any", tags: ["market", "research"], description: "Analyze market structure and dynamics." },
  { slug: "competitive-analysis", name: "Competitive analysis", category: "research", bp: "any", tags: ["competitive"], description: "Profile competitors." },
  { slug: "market-sizing", name: "Market sizing (TAM/SAM/SOM)", category: "research", bp: "any", tags: ["sizing"], description: "Build TAM/SAM/SOM estimates." },
  { slug: "financial-modeling", name: "Financial modeling", category: "ops", bp: "any", tags: ["finance"], description: "Build financial models." },
  { slug: "risk-management", name: "Risk management", category: "ops", bp: "any", tags: ["risk"], description: "Identify and mitigate risks." },
  { slug: "team-leadership", name: "Team leadership", category: "leadership", bp: "any", tags: ["leadership"], description: "Lead cross-functional teams." },
  { slug: "cross-functional-collab", name: "Cross-functional collaboration", category: "leadership", bp: "any", tags: ["collab"], description: "Drive cross-team coordination." },
  { slug: "supply-chain-management", name: "Supply chain management", category: "ops", bp: "any", tags: ["supply-chain"], description: "Manage supply chain operations." },
  { slug: "data-governance", name: "Data governance", category: "ops", bp: "any", tags: ["governance"], description: "Establish data governance practices." },
  { slug: "esg-reporting", name: "ESG reporting", category: "ops", bp: "any", tags: ["esg", "sustainability"], description: "Author ESG / sustainability reports." },
  { slug: "carbon-management", name: "Carbon management", category: "ops", bp: "any", tags: ["esg", "carbon"], description: "Track carbon footprint and reduction." },
  { slug: "stakeholder-communication", name: "Stakeholder communication", category: "leadership", bp: "any", tags: ["comms"], description: "Communicate with stakeholders." },
  { slug: "organizational-development", name: "Organizational development", category: "leadership", bp: "any", tags: ["orgdev"], description: "Drive organizational change." },
  { slug: "digital-transformation", name: "Digital transformation", category: "strategy", bp: "any", tags: ["transformation"], description: "Lead digital transformation." },
  { slug: "business-development", name: "Business development", category: "sales", bp: "any", tags: ["bizdev"], description: "Drive new business pipelines." },
  { slug: "sales-negotiation", name: "Sales negotiation", category: "sales", bp: "any", tags: ["sales"], description: "Negotiate complex deals." },
  { slug: "solution-selling", name: "Solution selling", category: "sales", bp: "any", tags: ["sales"], description: "Sell consultative solutions." },
  { slug: "customer-relationship", name: "Customer relationship management", category: "sales", bp: "any", tags: ["crm", "account"], description: "Manage long-term customer relationships." },
  { slug: "proposal-management", name: "Proposal management", category: "sales", bp: "any", tags: ["proposal", "rfp"], description: "Author B2B proposals." },
  { slug: "value-communication", name: "Value communication", category: "sales", bp: "any", tags: ["value-prop"], description: "Articulate value propositions." },
  { slug: "customer-insight", name: "Customer insight", category: "research", bp: "any", tags: ["insight"], description: "Synthesize customer insights." },
  { slug: "market-positioning", name: "Market positioning", category: "marketing-strategy", bp: "any", tags: ["positioning"], description: "Position in market." },
  { slug: "production-coordination", name: "Production coordination", category: "ops", bp: "any", tags: ["production"], description: "Coordinate production lines." },
  { slug: "delivery-control", name: "Delivery control", category: "ops", bp: "any", tags: ["logistics"], description: "Manage delivery schedules." },
  { slug: "inventory-optimization", name: "Inventory optimization", category: "ops", bp: "any", tags: ["inventory"], description: "Optimize inventory levels." },
  { slug: "process-design", name: "Process design", category: "ops", bp: "any", tags: ["process"], description: "Design business processes." },
  { slug: "tool-erp", name: "ERP system operations", category: "tool", bp: "tool", tags: ["erp"], description: "Operate ERP systems." },
  { slug: "tool-mes", name: "MES (Manufacturing Execution System)", category: "tool", bp: "tool", tags: ["manufacturing"], description: "Use MES." },
  { slug: "certification-management", name: "Certification management", category: "ops", bp: "any", tags: ["compliance"], description: "Manage certifications and audits." },
  { slug: "brand-management", name: "Brand management", category: "marketing-strategy", bp: "any", tags: ["brand"], description: "Manage brand health." },
  // Meta — agent traits (low value but high volume)
  { slug: "methodology-led-delivery", name: "Methodology-led delivery", category: "meta", bp: "any", tags: ["meta"], description: "Deliver via documented methodology." },
  { slug: "squad-leadership", name: "Squad leadership", category: "meta", bp: "any", tags: ["meta", "leadership"], description: "Lead a marketing squad." },
  { slug: "boardroom-deliverables", name: "Boardroom-grade deliverables", category: "meta", bp: "any", tags: ["meta", "executive"], description: "Produce boardroom-grade output." },
];

// ─── Alias map (orphan free-text → catalog slug) ───
const ALIAS: Record<string, string> = {
  // tools
  "pandas": "tool-pandas",
  "python": "tool-python",
  "Python": "tool-python",
  "sql": "tool-sql",
  "SQL": "tool-sql",
  "numpy": "tool-numpy",
  "scipy stats": "tool-scipy-stats",
  "matplotlib": "tool-matplotlib",
  "python-pptx": "output-pptx",
  "Excel export": "output-excel",
  "Excel export (.xlsx)": "output-excel",
  "Excel (openpyxl)": "output-excel",
  "Excel financial modeling": "financial-modeling",
  "Tableau CSV": "output-tableau-csv",
  "Jupyter Notebook": "tool-jupyter",
  "Docker": "tool-docker",
  "Kubernetes": "tool-kubernetes",
  "React": "tool-react",
  "JavaScript": "tool-javascript",
  "web_search": "tool-web-search",
  "web_scraping": "tool-web-scraping",
  "SerpAPI": "tool-serpapi",
  "SimilarWeb API": "tool-similarweb",
  "Google Sheets": "tool-google-sheets",
  "Google Sheets API": "tool-google-sheets",
  "Google Forms API": "tool-google-forms",
  "Google Search Console API": "tool-google-search-console",
  "pytrends (Google Trends)": "tool-pytrends",
  "SurveyMonkey API": "tool-surveymonkey",
  "SEMrush API": "tool-semrush",
  "World Bank API": "tool-world-bank",
  "exec": "tool-python",
  "market sizing models": "market-sizing",
  // Title-Case marketing terms
  "marketing": "marketing-generalist",
  "analytics": "data-analytics",
  "Product Marketing": "product-marketing",
  "Customer Segmentation": "customer-segmentation",
  "Campaign Management": "campaign-management",
  "Data Analysis": "data-analytics",
  "Personalization": "personalization",
  "programmatic": "programmatic-advertising-2",
  "crm-marketing": "crm-marketing",
  "data-driven-marketing": "data-driven-marketing",
  "mobile-marketing": "mobile-marketing",
  // Chinese skill names
  "風險管理": "risk-management",
  "數據分析": "data-analytics",
  "市場分析": "market-analysis",
  "團隊領導": "team-leadership",
  "跨部門協作": "cross-functional-collab",
  "供應鏈管理": "supply-chain-management",
  "品牌策略": "brand-strategy",
  "業務開發": "business-development",
  "資料治理": "data-governance",
  "永續報告": "esg-reporting",
  "B2B行銷": "b2b-marketing",
  "市場定位": "market-positioning",
  "客戶洞察": "customer-insight",
  "價值溝通": "value-communication",
  "提案管理": "proposal-management",
  "客戶經營": "customer-relationship",
  "商務談判": "sales-negotiation",
  "方案銷售": "solution-selling",
  "生產協調": "production-coordination",
  "交期控管": "delivery-control",
  "庫存優化": "inventory-optimization",
  "ERP": "tool-erp",
  "MES": "tool-mes",
  "流程設計": "process-design",
  "ESG": "esg-reporting",
  "碳管理": "carbon-management",
  "認證管理": "certification-management",
  "利害關係人溝通": "stakeholder-communication",
  "組織發展": "organizational-development",
  "數位轉型": "digital-transformation",
  "品牌管理": "brand-management",
  "SEO優化": "seo-strategy",
  "內容行銷": "content-strategy",
  "文案撰寫": "copywriting",
  "廣告投放": "campaign-management",
  // meta agent-trait
  "Methodology-led Delivery": "methodology-led-delivery",
  "Squad Leadership": "squad-leadership",
  "Boardroom Deliverables": "boardroom-deliverables",
};

const BACKSTOP = ["marketing-generalist", "content-strategy", "audience-research"];

async function main() {
  const pool = getPool();

  // Add description column if missing
  console.log("▼ ensuring skill_catalog.description column exists");
  if (!DRY_RUN) {
    try {
      await pool.query(`ALTER TABLE skill_catalog ADD COLUMN description TEXT NULL`);
      console.log("  added description column");
    } catch (e: any) {
      if (e.code === "ER_DUP_FIELDNAME") console.log("  already exists");
      else console.log(`  alter skipped: ${e.code || e.message}`);
    }
  }

  // ─── Stage A: expand catalog ───
  console.log("\n══ Stage A: expand skill_catalog ══");
  let aInserted = 0, aUpdated = 0;
  for (const s of NEW_CATALOG) {
    if (DRY_RUN) { aInserted++; continue; }
    const [r]: any = await pool.execute(
      `INSERT INTO skill_catalog (slug, name, category, boundProvider, tags, description, source)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category),
         boundProvider=VALUES(boundProvider), tags=VALUES(tags), description=VALUES(description),
         source=VALUES(source)`,
      [s.slug, s.name, s.category, s.bp, JSON.stringify(s.tags), s.description, "marketing-canon"],
    );
    if (r.affectedRows === 1) aInserted++;
    else if (r.affectedRows === 2) aUpdated++;
  }
  console.log(`  catalog: +${aInserted} inserted, ~${aUpdated} updated`);

  // ─── Re-load catalog ───
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
  console.log(`  catalog now: ${catalog.size} skills`);

  // ─── Stage B: normalize agent.skills JSON ───
  console.log("\n══ Stage B: normalize agent.skills JSON via alias ══");
  const [agents]: any = await pool.query(
    `SELECT id, COALESCE(skills, JSON_ARRAY()) AS skillsJson, aiModel FROM agents`,
  );
  let bAgents = 0, bSlugsRewritten = 0;
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
      if (catalog.has(orig)) {
        newSkills.push(orig);
        continue;
      }
      const mapped = ALIAS[orig];
      if (mapped && catalog.has(mapped)) {
        newSkills.push(mapped);
        changed = true;
        bSlugsRewritten++;
        // also write to assignment table for routing engine
        if (!DRY_RUN) {
          const c = catalog.get(mapped);
          await pool.execute(insertSql, [a.id, mapped, c.bp, `alias:${orig}`, 0.7]);
        }
      } else {
        // keep unrecognized free-text in JSON (low cost) but DON'T add as assignment
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
  console.log(`  agents touched: ${bAgents}, slugs rewritten: ${bSlugsRewritten}`);

  // ─── Stage C: lead realign ───
  console.log("\n══ Stage C: realign squad leads ══");
  const [squads]: any = await pool.query(`
    SELECT s.id AS sid, s.slug, s.methodology, s.strategy_layer,
           s.lead_agent_id, COALESCE(s.agents, JSON_ARRAY()) AS membersJson
    FROM squads s WHERE s.is_active = 1`);

  // Re-load agent skill map after Stage B
  const [allAgents]: any = await pool.query(`
    SELECT a.id, a.aiModel, COALESCE(a.skills, JSON_ARRAY()) AS skillsJson FROM agents a`);
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

  function alignsWithMethod(agentId: number, methTokens: Set<string>): boolean {
    const set = skillMap.get(agentId);
    if (!set) return false;
    for (const slug of set) {
      const c = catalog.get(slug);
      if (!c) continue;
      for (const t of methTokens) if (c.tokens.has(t)) return true;
    }
    return false;
  }

  let cSwapped = 0, cSkillsAdded = 0;
  for (const s of squads) {
    if (!s.lead_agent_id) continue;
    const methTokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.slug || ""),
    ]);
    if (methTokens.size === 0) continue;
    if (alignsWithMethod(s.lead_agent_id, methTokens)) continue;

    // try to find a member that aligns
    const members = parseJson(s.membersJson);
    const memberIds: number[] = Array.isArray(members)
      ? members.map((m: any) => (typeof m === "number" ? m : m?.id ?? m?.agentId)).filter(Boolean)
      : [];
    let chosen: number | null = null;
    for (const mid of memberIds) {
      if (mid !== s.lead_agent_id && alignsWithMethod(mid, methTokens)) {
        chosen = mid;
        break;
      }
    }
    if (chosen) {
      cSwapped++;
      if (!DRY_RUN) {
        await pool.execute(`UPDATE squads SET lead_agent_id = ? WHERE id = ?`, [chosen, s.sid]);
      }
    } else {
      // no aligned member — add a method-aligned skill to existing lead
      // pick best catalog match (token overlap with methTokens)
      let best: { slug: string; bp: string; overlap: number } | null = null;
      for (const [slug, c] of catalog) {
        let o = 0;
        for (const t of methTokens) if (c.tokens.has(t)) o++;
        if (o > 0 && (!best || o > best.overlap)) best = { slug, bp: c.bp, overlap: o };
      }
      if (best && isCompatible(best.bp, provFamily(modelMap.get(s.lead_agent_id) || ""))) {
        if (!DRY_RUN) {
          const [r]: any = await pool.execute(insertSql, [s.lead_agent_id, best.slug, best.bp, `lead-method-align:${s.slug}`, 0.75]);
          if (r.affectedRows === 1) {
            cSkillsAdded++;
            if (!skillMap.has(s.lead_agent_id)) skillMap.set(s.lead_agent_id, new Set());
            skillMap.get(s.lead_agent_id)!.add(best.slug);
          }
        } else cSkillsAdded++;
      }
    }
  }
  console.log(`  leads swapped: ${cSwapped}, lead skills added: ${cSkillsAdded}`);

  // ─── Stage D: step-aware skill backfill ───
  console.log("\n══ Stage D: step-aware skill backfill ══");
  const [squads2]: any = await pool.query(`
    SELECT id, slug, COALESCE(steps, JSON_ARRAY()) AS stepsJson FROM squads WHERE is_active = 1`);
  let dStepsFixed = 0, dSkillsAdded = 0;
  for (const s of squads2) {
    const steps = parseJson(s.stepsJson);
    if (!Array.isArray(steps)) continue;
    for (const st of steps) {
      const aid = st.assignedAgentId ?? st.agentId ?? null;
      if (!aid) continue;
      const required: string[] = Array.isArray(st.requiredSkills) ? st.requiredSkills : [];
      if (required.length === 0) continue;
      const have = skillMap.get(aid) || new Set();
      const missing: string[] = [];
      for (const r of required) if (!have.has(r) && catalog.has(r)) missing.push(r);
      // if NONE of required are in catalog, try alias
      const aliasedMissing: string[] = [];
      for (const r of required) {
        if (have.has(r)) continue;
        if (catalog.has(r)) continue;
        const m = ALIAS[r];
        if (m && catalog.has(m) && !have.has(m)) aliasedMissing.push(m);
      }
      const all = [...new Set([...missing, ...aliasedMissing])];
      if (all.length === 0) continue;
      const fam = provFamily(modelMap.get(aid) || "");
      let added = 0;
      for (const slug of all) {
        const c = catalog.get(slug)!;
        if (!isCompatible(c.bp, fam)) continue;
        if (!DRY_RUN) {
          const [r]: any = await pool.execute(insertSql, [aid, slug, c.bp, `step-required:${s.slug}`, 0.7]);
          if (r.affectedRows === 1) { added++; have.add(slug); }
        } else added++;
      }
      if (added > 0) { dStepsFixed++; dSkillsAdded += added; }
    }
  }
  console.log(`  steps fixed: ${dStepsFixed}, skills added: ${dSkillsAdded}`);

  // ─── Stage E: backstop residuals ───
  console.log("\n══ Stage E: backstop residuals ══");
  let eFilled = 0;
  for (const a of allAgents) {
    const set = skillMap.get(a.id);
    if (set && set.size > 0) continue;
    for (const slug of BACKSTOP) {
      if (!DRY_RUN) {
        await pool.execute(insertSql, [a.id, slug, "any", "residual-backstop", 0.4]);
      }
    }
    eFilled++;
  }
  console.log(`  residual agents filled: ${eFilled}`);

  console.log("\n✅ all stages complete");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
