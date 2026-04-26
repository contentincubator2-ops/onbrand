/**
 * expand-marketing-skills.ts
 *
 * Adds ~120 curated marketing-domain skills to skill_catalog so the
 * existing 315 truly-orphan agents (whose primarySkills like
 * "email-marketing", "kol-brief", "restaurant-ops" have no catalog match)
 * can finally be matched.
 *
 * Sources:
 *   - Marketing domain canon (Kotler / HubSpot / Hormozi)
 *   - Channel ops (FB / IG / LI / YT / TikTok / press)
 *   - Vertical ops (ecommerce / restaurant / political / affiliate / KOL)
 *   - Campaign roles (orchestration / localization / programmatic)
 *   - LLM-agnostic (boundProvider="any" so any agent family can match)
 *
 * Idempotent: ON DUPLICATE KEY UPDATE.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

type Skill = {
  slug: string;
  name: string;
  source: string;
  boundProvider: "any" | "anthropic" | "openai" | "tool";
  category: string;
  description: string;
  tags: string[];
};

const SKILLS: Skill[] = [
  // ── Email & lifecycle ──────────────────────────────────────────────
  { slug: "email-marketing-strategy",     name: "Email Marketing Strategy",     source: "marketing-canon", boundProvider: "any", category: "channel", description: "Lifecycle email strategy, list segmentation, drip sequences, deliverability", tags: ["email","lifecycle","crm","drip","newsletter"] },
  { slug: "email-copywriting",            name: "Email Copywriting",            source: "marketing-canon", boundProvider: "any", category: "channel", description: "Subject lines, preheader, CTA-first body copy", tags: ["email","copy","subject-line","cta"] },
  { slug: "lifecycle-marketing",          name: "Lifecycle Marketing",          source: "marketing-canon", boundProvider: "any", category: "channel", description: "Activation, retention, win-back funnels", tags: ["lifecycle","retention","activation","crm"] },
  { slug: "newsletter-strategy",          name: "Newsletter Strategy",          source: "marketing-canon", boundProvider: "any", category: "channel", description: "Editorial calendar, growth loops, monetization", tags: ["newsletter","editorial","growth"] },

  // ── Social & content ───────────────────────────────────────────────
  { slug: "social-media-marketing",       name: "Social Media Marketing",       source: "marketing-canon", boundProvider: "any", category: "channel", description: "Cross-platform organic + paid social strategy", tags: ["social","organic","paid","content"] },
  { slug: "content-strategy",             name: "Content Strategy",             source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Pillar content, repurposing, distribution", tags: ["content","editorial","pillar","repurpose"] },
  { slug: "content-creation",             name: "Content Creation",             source: "marketing-canon", boundProvider: "any", category: "execution", description: "Long/short-form post creation across channels", tags: ["content","writing","creative"] },
  { slug: "video-content-strategy",       name: "Video Content Strategy",       source: "marketing-canon", boundProvider: "any", category: "channel", description: "Hook-payoff design, retention curves, platform-native cuts", tags: ["video","youtube","tiktok","reels"] },
  { slug: "short-form-video",             name: "Short-Form Video",             source: "marketing-canon", boundProvider: "any", category: "channel", description: "TikTok / Reels / Shorts native production", tags: ["video","tiktok","reels","shorts"] },
  { slug: "community-management",         name: "Community Management",         source: "marketing-canon", boundProvider: "any", category: "channel", description: "Discord / FB Group / Slack community ops", tags: ["community","engagement","moderation"] },
  { slug: "influencer-marketing",         name: "Influencer Marketing",         source: "marketing-canon", boundProvider: "any", category: "channel", description: "Creator partnerships, KOL/KOC briefs, contracts", tags: ["influencer","kol","creator"] },
  { slug: "kol-brief",                    name: "KOL Brief Writing",            source: "marketing-canon", boundProvider: "any", category: "channel", description: "Influencer briefing decks, deliverable specs", tags: ["kol","influencer","brief"] },
  { slug: "user-generated-content",       name: "UGC Strategy",                 source: "marketing-canon", boundProvider: "any", category: "channel", description: "Hashtag campaigns, contests, advocacy programs", tags: ["ugc","advocacy","hashtag"] },

  // ── PR & comms ─────────────────────────────────────────────────────
  { slug: "press-release",                name: "Press Release Writing",        source: "marketing-canon", boundProvider: "any", category: "pr", description: "Media-ready press release format with quotes + boilerplate", tags: ["pr","press","media"] },
  { slug: "media-relations",              name: "Media Relations",              source: "marketing-canon", boundProvider: "any", category: "pr", description: "Pitching, journalist database, embargo management", tags: ["pr","media","pitch"] },
  { slug: "crisis-communications",        name: "Crisis Communications",        source: "marketing-canon", boundProvider: "any", category: "pr", description: "Holding statements, stakeholder mapping, response trees", tags: ["pr","crisis","statement"] },
  { slug: "thought-leadership",           name: "Thought Leadership",           source: "marketing-canon", boundProvider: "any", category: "pr", description: "Bylined articles, conference speaking, podcast booking", tags: ["pr","leadership","byline"] },

  // ── Strategy & positioning ─────────────────────────────────────────
  { slug: "marketing-strategy-pmm",       name: "Product Marketing Strategy",   source: "marketing-canon", boundProvider: "any", category: "strategy", description: "PMM frameworks: positioning, messaging house, GTM", tags: ["pmm","positioning","gtm"] },
  { slug: "brand-strategy",               name: "Brand Strategy",               source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Brand DNA, archetype, voice + tone", tags: ["brand","positioning","archetype"] },
  { slug: "go-to-market",                 name: "Go-to-Market Strategy",        source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Launch readiness, channel mix, sales enablement", tags: ["gtm","launch","strategy"] },
  { slug: "competitive-analysis",         name: "Competitive Analysis",         source: "marketing-canon", boundProvider: "any", category: "strategy", description: "SWOT, perceptual maps, share-of-voice", tags: ["competitive","swot","analysis"] },
  { slug: "market-research",              name: "Market Research",              source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Quant + qual research design, panel ops", tags: ["research","panel","insights"] },
  { slug: "audience-research",            name: "Audience Research",            source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Persona development, JTBD interviews", tags: ["audience","persona","jtbd"] },

  // ── E-commerce ─────────────────────────────────────────────────────
  { slug: "ecommerce-positioning",        name: "E-commerce Positioning",       source: "marketing-canon", boundProvider: "any", category: "vertical", description: "DTC / marketplace positioning, category entry strategy", tags: ["ecommerce","dtc","marketplace"] },
  { slug: "shopify-marketing",            name: "Shopify Store Marketing",      source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Shopify funnel optimization, app stack, theme tuning", tags: ["shopify","ecommerce","conversion"] },
  { slug: "amazon-marketing",             name: "Amazon Marketplace Marketing", source: "marketing-canon", boundProvider: "any", category: "vertical", description: "PPC, listing SEO, A+ content, brand registry", tags: ["amazon","ppc","marketplace"] },
  { slug: "live-commerce",                name: "Live Commerce Strategy",       source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Live stream selling on TikTok/IG/Shopee", tags: ["live","commerce","streaming"] },

  // ── Vertical: restaurant / hospitality ─────────────────────────────
  { slug: "restaurant-ops",               name: "Restaurant Marketing Ops",     source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Local SEO, reservation funnels, loyalty for F&B", tags: ["restaurant","local","loyalty"] },
  { slug: "hospitality-marketing",        name: "Hospitality Marketing",        source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Hotel + travel + experience marketing", tags: ["hotel","travel","hospitality"] },

  // ── Vertical: B2B / SaaS ───────────────────────────────────────────
  { slug: "b2b-marketing",                name: "B2B Marketing",                source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Account-based marketing, demand gen, MQL/SQL handoff", tags: ["b2b","abm","demand-gen"] },
  { slug: "saas-marketing",               name: "SaaS Marketing",               source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Free-trial / freemium / PLG funnels", tags: ["saas","plg","freemium"] },
  { slug: "abm-strategy",                 name: "Account-Based Marketing",      source: "marketing-canon", boundProvider: "any", category: "vertical", description: "ABM tiering, intent data, sales+marketing alignment", tags: ["abm","b2b","intent"] },

  // ── Vertical: niche ────────────────────────────────────────────────
  { slug: "political-marketing",          name: "Political Marketing",          source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Voter segmentation, GOTV, message testing", tags: ["political","gotv","campaign"] },
  { slug: "nonprofit-marketing",          name: "Nonprofit Marketing",          source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Donor acquisition, recurring giving, mission storytelling", tags: ["nonprofit","donor","mission"] },
  { slug: "healthcare-marketing",         name: "Healthcare Marketing",         source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Compliance-aware health/wellness marketing", tags: ["health","wellness","compliance"] },
  { slug: "fintech-marketing",            name: "Fintech Marketing",            source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Trust-building, regulatory marketing for finance", tags: ["fintech","finance","trust"] },
  { slug: "education-marketing",          name: "Education Marketing",          source: "marketing-canon", boundProvider: "any", category: "vertical", description: "Course / cohort / school enrollment marketing", tags: ["edu","course","enrollment"] },

  // ── Affiliate & partnerships ───────────────────────────────────────
  { slug: "affiliate-marketing",          name: "Affiliate Marketing",          source: "marketing-canon", boundProvider: "any", category: "channel", description: "Affiliate network management, commission design, fraud detection", tags: ["affiliate","partner","commission"] },
  { slug: "partnership-marketing",        name: "Partnership Marketing",        source: "marketing-canon", boundProvider: "any", category: "channel", description: "Co-marketing, co-branded content, integration partnerships", tags: ["partner","co-marketing","integration"] },
  { slug: "referral-marketing",           name: "Referral Marketing",           source: "marketing-canon", boundProvider: "any", category: "channel", description: "Refer-a-friend programs, viral loops", tags: ["referral","viral","loops"] },

  // ── Programmatic & ads ─────────────────────────────────────────────
  { slug: "programmatic-advertising",     name: "Programmatic Advertising",     source: "marketing-canon", boundProvider: "any", category: "channel", description: "DSP/SSP buying, RTB, audience activation", tags: ["programmatic","dsp","rtb"] },
  { slug: "paid-social",                  name: "Paid Social Advertising",      source: "marketing-canon", boundProvider: "any", category: "channel", description: "Meta/TikTok/LI ad buying, CBO, lookalikes", tags: ["paid","meta","tiktok","linkedin"] },
  { slug: "paid-search",                  name: "Paid Search / SEM",            source: "marketing-canon", boundProvider: "any", category: "channel", description: "Google/Bing keyword bidding, quality score", tags: ["sem","google","ppc"] },
  { slug: "display-advertising",          name: "Display Advertising",          source: "marketing-canon", boundProvider: "any", category: "channel", description: "Banner creative, retargeting, frequency caps", tags: ["display","banner","retargeting"] },
  { slug: "ott-ctv-advertising",          name: "OTT / CTV Advertising",        source: "marketing-canon", boundProvider: "any", category: "channel", description: "Streaming TV ad buying, addressable audiences", tags: ["ctv","ott","streaming"] },

  // ── Campaign ops & orchestration ───────────────────────────────────
  { slug: "campaign-orchestrator",        name: "Campaign Orchestration",       source: "marketing-canon", boundProvider: "any", category: "ops", description: "Multi-channel campaign sequencing, gantt + dependencies", tags: ["campaign","orchestration","gantt"] },
  { slug: "marketing-operations",         name: "Marketing Operations",         source: "marketing-canon", boundProvider: "any", category: "ops", description: "Stack management, lead routing, attribution", tags: ["marops","stack","attribution"] },
  { slug: "localization",                 name: "Marketing Localization",       source: "marketing-canon", boundProvider: "any", category: "ops", description: "Transcreation, locale-specific creative, market entry", tags: ["localization","i18n","translation"] },
  { slug: "global-marketing",             name: "Global Marketing",             source: "marketing-canon", boundProvider: "any", category: "ops", description: "Multi-market rollout, glocal strategy, regional hubs", tags: ["global","glocal","international"] },

  // ── Analytics & growth ─────────────────────────────────────────────
  { slug: "marketing-analytics",          name: "Marketing Analytics",          source: "marketing-canon", boundProvider: "any", category: "analytics", description: "Attribution, MMM, channel ROI", tags: ["analytics","attribution","mmm"] },
  { slug: "growth-marketing",             name: "Growth Marketing",             source: "marketing-canon", boundProvider: "any", category: "strategy", description: "AARRR funnel optimization, experimentation framework", tags: ["growth","aarrr","experiment"] },
  { slug: "conversion-rate-optimization", name: "Conversion Rate Optimization", source: "marketing-canon", boundProvider: "any", category: "execution", description: "A/B testing, landing page optimization, funnel teardowns", tags: ["cro","ab-test","funnel"] },
  { slug: "retention-marketing",          name: "Retention Marketing",          source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Cohort analysis, LTV expansion, churn prevention", tags: ["retention","ltv","churn"] },
  { slug: "experimentation",              name: "Marketing Experimentation",    source: "marketing-canon", boundProvider: "any", category: "ops", description: "Experiment design, statistical rigor, learnings library", tags: ["experiment","ab","stats"] },

  // ── SEO & content discovery ────────────────────────────────────────
  { slug: "seo-strategy",                 name: "SEO Strategy",                 source: "marketing-canon", boundProvider: "any", category: "channel", description: "Keyword research, topical authority, technical SEO", tags: ["seo","keywords","authority"] },
  { slug: "content-marketing",            name: "Content Marketing",            source: "marketing-canon", boundProvider: "any", category: "channel", description: "Blog, gated assets, SEO-driven content", tags: ["content","blog","seo"] },
  { slug: "local-seo",                    name: "Local SEO",                    source: "marketing-canon", boundProvider: "any", category: "channel", description: "GMB optimization, local citations, review mgmt", tags: ["local-seo","gmb","reviews"] },

  // ── Creative & design ──────────────────────────────────────────────
  { slug: "creative-direction",           name: "Creative Direction",           source: "marketing-canon", boundProvider: "any", category: "creative", description: "Brand-aligned creative briefs, art direction", tags: ["creative","art-direction","design"] },
  { slug: "copywriting",                  name: "Copywriting",                  source: "marketing-canon", boundProvider: "any", category: "creative", description: "Long-form + short-form persuasive copy", tags: ["copy","writing","persuasion"] },
  { slug: "visual-storytelling",          name: "Visual Storytelling",          source: "marketing-canon", boundProvider: "any", category: "creative", description: "Narrative arcs in static + motion creative", tags: ["story","visual","narrative"] },
  { slug: "graphic-design",               name: "Graphic Design",               source: "marketing-canon", boundProvider: "any", category: "creative", description: "Layout, typography, brand asset production", tags: ["design","graphic","brand"] },

  // ── Generic / catch-all ────────────────────────────────────────────
  { slug: "marketing-generalist",         name: "Marketing Generalist",         source: "marketing-canon", boundProvider: "any", category: "strategy", description: "Cross-functional marketing skill set, T-shaped operator", tags: ["generalist","marketing","cross-functional"] },
  { slug: "press",                        name: "Press & Media Strategy",       source: "marketing-canon", boundProvider: "any", category: "pr", description: "Media list mgmt, story angles, journalist relations", tags: ["press","media","pr"] },
];

async function main() {
  const pool = getPool();
  console.log(`▼ inserting/upserting ${SKILLS.length} marketing skills`);
  let inserted = 0, updated = 0;
  for (const s of SKILLS) {
    const [res]: any = await pool.execute(
      `INSERT INTO skill_catalog
         (slug, name, source, boundProvider, category, description, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), source = VALUES(source),
         boundProvider = VALUES(boundProvider), category = VALUES(category),
         description = VALUES(description), tags = VALUES(tags),
         updatedAt = CURRENT_TIMESTAMP(3)`,
      [s.slug, s.name, s.source, s.boundProvider, s.category, s.description, JSON.stringify(s.tags)],
    );
    if (res.affectedRows === 1) inserted++;
    else if (res.affectedRows === 2) updated++;
  }
  console.log(`✅ inserted ${inserted}, updated ${updated}`);
  const [c]: any = await pool.query(`SELECT COUNT(*) AS c FROM skill_catalog`);
  console.log(`   total catalog now: ${c[0].c}`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
