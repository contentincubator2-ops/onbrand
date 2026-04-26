/**
 * backfill-squads.ts — Bring squad data up to product-readiness.
 *
 *  Step A  Fill blank descriptions
 *  Step B  Derive methodology label (human-readable) for squads missing it
 *  Step C  Assign a lead_agent_id to orphan squads (best primarySkill match)
 *  Step D  Re-run B for newly-leaded squads
 *  Step E  Print final coverage + remaining gaps
 *
 * Run:    npx tsx skills/ai-talent/scripts/backfill-squads.ts
 *         (or via the admin-backfill-squads workflow on the VM)
 */

import { getPool, closePool } from "./squad-builder/db";

// ─── Methodology hardcoded map (well-known squads) ────────────────────────
const METHOD_BY_SLUG: Record<string, string> = {
  // L1 brand
  "brand-archetype-positioning": "Carol Pearson & Margaret Mark — 12 Jung Archetypes",
  "mind-positioning": "Al Ries & Jack Trout — Positioning: The Battle for Your Mind",
  "category-design-positioning": "Play Bigger — Category Design",
  "differentiation-positioning": "Jack Trout — Differentiate or Die",
  "competitive-perceptual-mapping": "Philip Kotler — Perceptual Mapping",
  "purpose-driven-positioning": "Simon Sinek — Start With Why (Golden Circle)",
  "blue-ocean-positioning": "W. Chan Kim & Renée Mauborgne — Blue Ocean Strategy",
  "brand-equity-cbbe": "Kevin Lane Keller — Customer-Based Brand Equity (CBBE)",
  "brand-story-positioning": "Donald Miller — StoryBrand 7 Framework",
  "cultural-branding": "Douglas Holt — Cultural Branding",
  "jtbd-positioning": "Clayton Christensen — Jobs to Be Done",
  "sowork-brand-positioning": "SoWork Proprietary Brand Method",
  "segmentation-based-positioning": "Philip Kotler — STP Segmentation",
  "brand-narrative-cultural": "Douglas Holt — Cultural Branding",
  // L2 product
  "value-proposition-canvas": "Alex Osterwalder — Value Proposition Canvas",
  "benefit-ladder-positioning": "Means-End Theory — Benefit Ladder",
  "benefit-ladder-product-positioning": "Means-End Theory — Benefit Ladder",
  "benefit-based-positioning": "Means-End Theory — Benefit Ladder",
  "jtbd-product-positioning": "Clayton Christensen — Jobs to Be Done",
  "fab-positioning": "FAB — Features, Advantages, Benefits",
  "fab-product-positioning": "FAB — Features, Advantages, Benefits",
  "kano-model-positioning": "Noriaki Kano — Customer Satisfaction Model",
  "kano-product-positioning": "Noriaki Kano — Customer Satisfaction Model",
  "kano-model-product-squad": "Noriaki Kano — Customer Satisfaction Model",
  "product-golden-circle": "Simon Sinek — Golden Circle (applied to products)",
  "crossing-the-chasm": "Geoffrey Moore — Crossing the Chasm",
  "4p-marketing-mix": "E. Jerome McCarthy — 4P Marketing Mix",
  "product-market-fit": "Marc Andreessen — Product-Market Fit",
  "product-market-fit-validation": "Marc Andreessen — Product-Market Fit",
  "value-proposition-mapping": "Alex Osterwalder — Value Proposition Canvas",
  "anti-market-positioning": "Rory Sutherland — Alchemy (Behavioral Positioning)",
  "jtbd-user-research-squad": "Clayton Christensen — Jobs to Be Done",
  "ecom-product-analytics-squad": "RFM × CLV Product Analytics",
  // L3 audience
  "stp-segmentation": "Philip Kotler — STP (Segmentation–Targeting–Positioning)",
  "persona-canvas-positioning": "Alan Cooper — Persona Canvas",
  "icp-positioning-b2b": "Ideal Customer Profile (B2B)",
  "tribes-audience-strategy": "Seth Godin — Tribes",
  "vals-framework": "SRI International — VALS Psychographics",
  "behavioral-segmentation": "Behavioral Segmentation (RFM, Engagement)",
  "psychographic-segmentation": "Psychographic Segmentation (Lifestyle / Values)",
  "ethnographic-research": "Ethnographic Field Research",
  "audience-first-strategy": "Rand Fishkin — Audience First",
  "generational-segmentation": "Generational Segmentation (Gen Z / Millennial / Boomer)",
  "rfm-customer-segmentation-squad": "RFM Customer Segmentation",
  "email-lifecycle-revenue-squad": "Email Lifecycle Revenue",
  // L5 campaign
  "plf-launch-formula": "Jeff Walker — Product Launch Formula",
  "ev-pine-experience-economy": "Pine & Gilmore — Experience Economy",
  "ev-schmitt-sem": "Bernd Schmitt — Strategic Experiential Modules",
  "ev-smilansky-activation": "Sam Smilansky — Brand Activation",
  "ev-cialdini-presuasion": "Robert Cialdini — Pre-Suasion",
  "ev-godin-tribes": "Seth Godin — Tribes",
  "ev-anderson-ted": "Chris Anderson — TED Commandments",
  "ev-ferrazzi-networking": "Keith Ferrazzi — Strategic Networking",
  "ev-goldblatt-csep": "Joe Goldblatt — Certified Special Events Professional",
  "ev-collins-culture": "Jim Collins — Culture Building",
  "hormozi-offer-forge": "Alex Hormozi — $100M Offers",
};

// ─── Author-token map (parses slugs like "fb-schwartz-awareness") ─────────
type AuthorEntry = { author: string; method?: string };
const AUTHOR_BY_TOKEN: Record<string, AuthorEntry> = {
  // FB
  schwartz: { author: "Eugene Schwartz", method: "5 Levels of Awareness" },
  deiss: { author: "Ryan Deiss", method: "Customer Value Optimization (CVO)" },
  marshall: { author: "Perry Marshall", method: "80/20 Sales & Marketing" },
  kennedy: { author: "Dan Kennedy", method: "Magnetic Marketing" },
  hormozi: { author: "Alex Hormozi", method: "$100M Offers" },
  ogilvy: { author: "David Ogilvy", method: "Long-Form Copy" },
  loomer: { author: "Jon Loomer", method: "Custom Audience Marketing" },
  garyvee: { author: "Gary Vaynerchuk", method: "Jab Jab Jab Right Hook" },
  kern: { author: "Frank Kern", method: "Mass Control" },
  pittman: { author: "Jon Pittman", method: "Traffic Strategy" },
  // IG
  hollis: { author: "Rachel Hollis", method: "Radical Authenticity" },
  star: { author: "Jasmine Star", method: "Visual Storytelling" },
  lau: { author: "Vanessa Lau", method: "Niche Authority" },
  do: { author: "Chris Do", method: "Visual Brand System" },
  later: { author: "Later — Optimal Posting Time" },
  baer: { author: "Jay Baer", method: "Youtility" },
  patel: { author: "Neil Patel", method: "Repurposing Engine" },
  fanzo: { author: "Brian Fanzo", method: "Live Video" },
  // LinkedIn
  welsh: { author: "Justin Welsh", method: "Content Operating System" },
  vanderblom: { author: "Richard van der Blom", method: "LinkedIn Algorithm" },
  blom: { author: "Richard van der Blom", method: "LinkedIn Algorithm" },
  disney: { author: "Daniel Disney", method: "Social Selling" },
  hughes: { author: "Tim Hughes", method: "Social Selling" },
  nemo: { author: "Andy Nemo", method: "LinkedIn Riches" },
  walker: { author: "Jeff Walker", method: "Product Launch Formula" },
  simmonds: { author: "Lana Simmonds", method: "Distribution" },
  // YouTube / Short Video
  mrbeast: { author: "MrBeast", method: "Hook + Payoff" },
  kane: { author: "Brendan Kane", method: "Hook Point" },
  nasdaily: { author: "Nas Daily", method: "60-Second Format" },
  blake: { author: "Roberto Blake", method: "Binge-Worthy Content" },
  flynn: { author: "Pat Flynn", method: "Teach to Sell" },
  bloom: { author: "Sahil Bloom", method: "Edu-tainment" },
  // Content marketing
  pulizzi: { author: "Joe Pulizzi", method: "Content Inc." },
  sheridan: { author: "Marcus Sheridan", method: "They Ask, You Answer" },
  dean: { author: "Brian Dean", method: "Skyscraper Technique" },
  handley: { author: "Ann Handley", method: "Everybody Writes" },
  crestodina: { author: "Andy Crestodina", method: "Brain Food Content" },
  fishkin: { author: "Rand Fishkin", method: "SparkToro" },
  schaefer: { author: "Mark Schaefer", method: "Content Shock" },
  rose: { author: "Robert Rose", method: "Chief Content Officer" },
  bullas: { author: "Jeff Bullas", method: "Power Blogging" },
  // Email
  chaperon: { author: "André Chaperon", method: "Soap Opera Sequence" },
  sethi: { author: "Ramit Sethi", method: "Email Course" },
  porterfield: { author: "Amy Porterfield", method: "Launch" },
  bly: { author: "Bob Bly", method: "Direct Response Copy" },
  settle: { author: "Kevin Settle", method: "Email Players" },
  goff: { author: "Mike Goff", method: "High Frequency" },
  brunson: { author: "Russell Brunson", method: "DotCom Email" },
  wiebe: { author: "Joanna Wiebe", method: "Conversion Copy" },
  // PR
  berger: { author: "Jonah Berger", method: "STEPPS" },
  dietrich: { author: "Gini Dietrich", method: "PESO Model" },
  holiday: { author: "Ryan Holiday", method: "Media Manipulation" },
  gladwell: { author: "Malcolm Gladwell", method: "Tipping Point" },
  solis: { author: "Brian Solis", method: "PESO" },
  ries: { author: "Al Ries", method: "PR" },
  edelman: { author: "Edelman", method: "Trust Barometer" },
  fleishman: { author: "FleishmanHillard", method: "Integrated PR" },
};

// ─── Layer-prefix map for slug parsing ─────────────────────────────────────
const LAYER_PREFIX = ["fb-","ig-","li-","sv-","yt-","cm-","em-","pr-","ev-","tt-","x-"];

function deriveMethodologyFromSlug(slug: string, name: string): string | null {
  if (METHOD_BY_SLUG[slug]) return METHOD_BY_SLUG[slug];

  // Strip channel prefix (fb-, ig-, etc.)
  let s = slug;
  for (const p of LAYER_PREFIX) if (s.startsWith(p)) { s = s.slice(p.length); break; }

  const tokens = s.split("-");
  for (const tok of tokens) {
    const entry = AUTHOR_BY_TOKEN[tok.toLowerCase()];
    if (entry) {
      return entry.method ? `${entry.author} — ${entry.method}` : entry.author;
    }
  }

  // Fallback: prettify name
  return name || null;
}

function deriveMethodologyFromLeadSkill(leadPrimarySkill: string | null): string | null {
  if (!leadPrimarySkill) return null;
  // primarySkill like "category-design-positioning" → tokens
  const tokens = leadPrimarySkill.toLowerCase().split(/[-_\s]/);
  for (const tok of tokens) {
    const entry = AUTHOR_BY_TOKEN[tok];
    if (entry) return entry.method ? `${entry.author} — ${entry.method}` : entry.author;
  }
  // Title-case the slug
  return leadPrimarySkill
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Steps ─────────────────────────────────────────────────────────────────
async function stepA_FillBlankDescriptions(pool: any): Promise<number> {
  const [r] = await pool.execute(
    `UPDATE squads
        SET description = CONCAT(name, ' — methodology-led marketing squad.')
      WHERE is_active=1
        AND (description IS NULL OR description='')`
  );
  return (r as any).affectedRows ?? 0;
}

async function stepB_FillMethodology(pool: any): Promise<{ filled: number; total: number }> {
  const [rows] = await pool.execute(
    `SELECT s.id, s.slug, s.name, s.lead_agent_id,
            COALESCE(a.primarySkill,'') AS lead_skill
       FROM squads s
       LEFT JOIN agents a ON s.lead_agent_id = a.id
      WHERE s.is_active=1
        AND (s.methodology IS NULL OR s.methodology='')`
  );
  const list = rows as any[];
  let filled = 0;
  for (const r of list) {
    const m =
      deriveMethodologyFromSlug(String(r.slug || ""), String(r.name || "")) ||
      deriveMethodologyFromLeadSkill(r.lead_skill || null);
    if (m) {
      await pool.execute(`UPDATE squads SET methodology=? WHERE id=?`, [m, r.id]);
      filled++;
    }
  }
  return { filled, total: list.length };
}

async function stepC_AssignOrphanLeads(pool: any): Promise<{ assigned: number; total: number }> {
  const [orphans] = await pool.execute(
    `SELECT id, slug, name, strategy_layer
       FROM squads
      WHERE is_active=1 AND lead_agent_id IS NULL`
  );
  const list = orphans as any[];
  let assigned = 0;

  // Pre-load primarySkill index: map skill → array of agent ids
  const [agents] = await pool.execute(
    `SELECT id, COALESCE(primarySkill,'') AS primarySkill, COALESCE(layer,'') AS layer
       FROM agents
      WHERE primarySkill IS NOT NULL AND primarySkill <> ''`
  );
  const skillToAgents = new Map<string, number[]>();
  for (const a of agents as any[]) {
    const k = String(a.primarySkill).toLowerCase();
    if (!skillToAgents.has(k)) skillToAgents.set(k, []);
    skillToAgents.get(k)!.push(Number(a.id));
  }

  // Track which agents have already been assigned to keep variety
  const usedLeads = new Set<number>();
  const [usedRows] = await pool.execute(
    `SELECT DISTINCT lead_agent_id FROM squads WHERE is_active=1 AND lead_agent_id IS NOT NULL`
  );
  for (const r of usedRows as any[]) usedLeads.add(Number(r.lead_agent_id));

  for (const sq of list) {
    const slug = String(sq.slug || "").toLowerCase();
    const tokens = slug.split(/[-_]/).filter((t: string) => t.length >= 3);

    let pickedAgentId: number | null = null;

    // (1) Look for skill matching any whole token
    for (const tok of tokens) {
      // Try exact match
      const exact = skillToAgents.get(tok);
      if (exact) {
        const fresh = exact.find((id) => !usedLeads.has(id));
        if (fresh) { pickedAgentId = fresh; break; }
      }
    }

    // (2) Fuzzy match: find any skill containing the longest token
    if (!pickedAgentId) {
      const longest = tokens.sort((a: string, b: string) => b.length - a.length)[0];
      if (longest) {
        for (const [skill, ids] of skillToAgents) {
          if (skill.includes(longest)) {
            const fresh = ids.find((id) => !usedLeads.has(id));
            if (fresh) { pickedAgentId = fresh; break; }
          }
        }
      }
    }

    // (3) Last resort: any agent with primarySkill
    if (!pickedAgentId) {
      for (const ids of skillToAgents.values()) {
        const fresh = ids.find((id) => !usedLeads.has(id));
        if (fresh) { pickedAgentId = fresh; break; }
      }
    }

    if (pickedAgentId) {
      await pool.execute(`UPDATE squads SET lead_agent_id=? WHERE id=?`, [pickedAgentId, sq.id]);
      usedLeads.add(pickedAgentId);
      assigned++;
    }
  }

  return { assigned, total: list.length };
}

async function stepE_FinalCoverage(pool: any) {
  const [r] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(description IS NOT NULL AND description<>'')   AS d_ok,
       SUM(methodology IS NOT NULL AND methodology<>'')   AS m_ok,
       SUM(lead_agent_id IS NOT NULL)                      AS l_ok,
       SUM(strategy_layer IS NOT NULL)                     AS layer_ok,
       SUM(tier='core')                                    AS core_count,
       SUM(steps IS NOT NULL AND JSON_LENGTH(steps)>0)    AS steps_ok
       FROM squads WHERE is_active=1`
  );
  return (r as any[])[0];
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  📋 SQUAD BACKFILL — methodology / description / lead");
  console.log("════════════════════════════════════════════════════════════════");

  const pool = getPool();

  console.log("\n▼ Step A — fill blank descriptions");
  const aCount = await stepA_FillBlankDescriptions(pool);
  console.log(`  ✓ filled ${aCount} description(s)`);

  console.log("\n▼ Step B — derive methodology (round 1)");
  const b1 = await stepB_FillMethodology(pool);
  console.log(`  ✓ filled ${b1.filled} / ${b1.total} methodology fields`);

  console.log("\n▼ Step C — assign leads to orphan squads");
  const c = await stepC_AssignOrphanLeads(pool);
  console.log(`  ✓ assigned ${c.assigned} / ${c.total} orphan lead_agent_id(s)`);

  console.log("\n▼ Step D — derive methodology (round 2, after lead assignment)");
  const b2 = await stepB_FillMethodology(pool);
  console.log(`  ✓ filled ${b2.filled} / ${b2.total} methodology fields`);

  console.log("\n▼ Step E — final coverage");
  const cov = await stepE_FinalCoverage(pool);
  console.log("  ", cov);

  await closePool();
  console.log("\n✅ done");
})().catch((e) => {
  console.error("[backfill-squads] failed:", e);
  process.exit(1);
});
