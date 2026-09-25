/**
 * strategyConsultantRouter — 策略顧問 (Strategy Consultant)
 *
 * Routes:
 *   listAgents(scenario, limit)     — return strategy agents filtered by scenario
 *   analyze(...)                    — McKinsey-style report with Tavily grounding
 *   chat(...)                       — follow-up Q&A with full message history
 *
 * 5 Scenarios + methodology keys:
 *   business   — 商業策略 (Blue Ocean, Five Forces, SWOT, BCG, Ansoff, Value Chain, Moat)
 *   audience   — 受眾洞察 (STP, Persona, JTBD, Journey Map, RFM, Empathy Map)
 *   pricing    — 定價策略 (12 pricing methods)
 *   promotion  — 推廣策略 (Kotler 5A, AIDA, AISAS, AARRR, Content Funnel, Inbound, WOM)
 *   channel    — 通路與產品 (DTC, Marketplace, GTM, Stage-Gate, Lean, Design Thinking)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel } from "../_core/multiModelRouter";
import { buildBrandPrefix } from "../_core/brandContext";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ENV } from "../_core/env";
import { loadAgentKnowledge, withAgentKnowledge } from "../_core/agentKnowledge";

// ─── Scenario → keyword mapping ────────────────────────────────────────────

const SCENARIO_KEYWORDS: Record<string, string[]> = {
  business: [
    "strategy", "mbb-strategist", "competitive-analysis", "market-research",
    "positioning", "blue-ocean", "five-forces", "swot", "bcg", "ansoff",
    "value-chain", "competitive-intelligence", "market-analysis", "brand-strategy",
    "category-design", "category-creation", "differentiation", "competitive",
  ],
  audience: [
    "segmentation", "stp", "buyer-persona", "icp", "customer-research",
    "jobs-to-be-done", "jtbd", "consumer-insights", "audience-analysis",
    "qualitative-research", "ux-research", "behavioral", "empathy",
    "market-research", "voice-of-customer", "audience-intelligence-research",
  ],
  pricing: [
    "pricing", "value-proposition", "cro", "conversion", "gtm", "go-to-market",
    "product-marketing", "pmm", "saas", "demand-gen", "grand-slam-offer-framework",
    "offer-first-ad-strategy", "revenue", "monetization",
  ],
  promotion: [
    "campaign-strategy", "content-strategy", "media-planning", "paid-ads",
    "social-media-marketing", "content-marketing", "inbound", "ad-strategy",
    "email-marketing", "influencer", "kol-brief", "performance-marketing",
    "advertising", "marketing-strategy-pmm", "magnetic-marketing-framework",
  ],
  channel: [
    "channel-strategy", "dtc", "marketplace", "gtm", "go-to-market",
    "launch-strategy", "product-marketing", "pmm", "sales-enablement",
    "omnichannel", "retail", "distribution", "omo-strategy-design",
    "demand-gen", "growth",
  ],
};

// ─── Methodology → framework prompt injection ───────────────────────────────

const METHODOLOGY_PROMPTS: Record<string, string> = {
  // Business Strategy
  "blue-ocean":   "Apply Blue Ocean Strategy: use the Four Actions Framework (Eliminate / Reduce / Raise / Create) and the Six Paths Framework to identify uncontested market space. Show the Strategy Canvas comparing current vs. proposed value curves.",
  "five-forces":  "Apply Porter's Five Forces: analyze (1) Competitive Rivalry, (2) Supplier Power, (3) Buyer Power, (4) Threat of Substitutes, (5) Threat of New Entrants. Score each force 1–5 and derive strategic implications.",
  "swot":         "Conduct a rigorous SWOT Analysis with cross-analysis (SO / ST / WO / WT strategies). Each quadrant must have 3–5 specific, evidence-backed points. Derive the top 3 strategic priorities from the cross-analysis.",
  "bcg":          "Apply BCG Matrix: position each product/business unit as Star / Cash Cow / Question Mark / Dog based on relative market share and market growth rate. Provide resource allocation recommendations.",
  "ansoff":       "Apply Ansoff Growth Matrix: evaluate all four quadrants (Market Penetration / Market Development / Product Development / Diversification). Rank by risk-return profile and recommend the primary growth vector.",
  "value-chain":  "Apply Porter's Value Chain Analysis: map primary activities (Inbound Logistics → Operations → Outbound Logistics → Marketing & Sales → Service) and support activities (Infrastructure / HR / Technology / Procurement). Identify where competitive advantage can be built or cost reduced.",
  "moat":         "Analyze Competitive Moat using Morningstar's 5 sources: Network Effects / Intangible Assets / Cost Advantages / Switching Costs / Efficient Scale. Rate the strength of each moat source (Wide / Narrow / None) with evidence.",

  // Audience
  "stp":          "Apply STP Framework rigorously: (1) Segmentation — define demographic, psychographic, behavioral, geographic segments; (2) Targeting — score segments by size, growth, profitability, accessibility, fit; (3) Positioning — craft a positioning statement and build a perceptual map.",
  "persona":      "Build a detailed Customer Persona including: demographics, psychographics, Goals & Motivations, Pain Points & Frustrations, Media Consumption habits, Buying Triggers & Barriers, and a direct quote summarizing their worldview.",
  "jtbd":         "Apply Jobs-to-be-Done theory: identify the functional job, emotional job, and social job the customer is hiring your product to do. Use the Job Story format: 'When [situation], I want to [motivation], so I can [expected outcome].' Map competing solutions.",
  "journey":      "Map the Customer Journey across 5 stages: Awareness → Consideration → Purchase → Retention → Advocacy. For each stage: customer action, touchpoints, emotional state (on scale), pain points, and brand intervention opportunities.",
  "rfm":          "Conduct RFM Analysis: segment customers by Recency (last purchase), Frequency (purchase count), Monetary (spend). Create segments (Champions / Loyal / At-Risk / Hibernating / Lost) and prescribe retention/re-engagement tactics per segment.",
  "empathy":      "Build an Empathy Map: What does the customer Think & Feel / Hear / See / Say & Do? What are their Pains and Gains? Derive 3 actionable insights from the empathy analysis.",

  // Pricing
  "penetration":  "Apply Penetration Pricing strategy: set a low initial price to gain market share quickly. Analyze: break-even volume, competitive reaction, customer acquisition cost vs. LTV, and the path to price normalization.",
  "skimming":     "Apply Price Skimming strategy: set a high initial price targeting early adopters, then lower progressively. Analyze: willingness-to-pay segments, competitive moat durability, and the price decline schedule.",
  "value-based":  "Apply Value-Based Pricing: quantify the economic value delivered to customers (EVE model: reference value + differentiation value). Set price as a percentage of captured value. Build the value communication narrative.",
  "cost-plus":    "Apply Cost-Plus Pricing: calculate COGS, operating costs, and target margin. Benchmark against competitors. Identify where this model creates competitive disadvantage and how to transition toward value-based pricing.",
  "competitive":  "Apply Competitive Pricing: map competitor price points across tiers (budget / mainstream / premium). Identify the optimal price positioning relative to competitors given your differentiation. Prescribe dynamic response rules.",
  "freemium":     "Apply Freemium Pricing: design the free tier (what's in / what's out), the conversion trigger (the 'aha moment'), the paid tier value gap, and the conversion rate optimization roadmap. Benchmark against 3 comparable SaaS products.",
  "anchor":       "Apply Anchor Pricing: design a 3-tier pricing architecture (Good / Better / Best) where the highest tier anchors perception and the middle tier is the intended purchase. Analyze price ratio psychology.",
  "decoy":        "Apply Decoy Effect Pricing: introduce an asymmetrically dominated option that makes the target option appear superior. Design the specific decoy structure and test hypothesis.",
  "psychological":"Apply Psychological Pricing: use charm pricing (.99 / .95), price-quality signaling, left-digit effect, and framing (per day vs. per month). Provide specific price point recommendations.",
  "dynamic":      "Apply Dynamic Pricing: identify the demand and supply variables that should trigger price adjustments. Design the pricing algorithm logic, guardrails (floor/ceiling), and customer communication strategy.",
  "subscription": "Apply Subscription Pricing: design the subscription tier structure, billing cadence (monthly/annual discount), churn reduction tactics (lock-in mechanisms, habit loops), and the LTV vs. CAC equation.",
  "bundle":       "Apply Bundle Pricing: identify products/features with complementary demand elasticity. Design pure bundle, mixed bundle, and unbundling scenarios. Calculate the total willingness-to-pay vs. individual WTP sum.",

  // Promotion
  "kotler-5a":    "Apply Kotler's 5A Customer Path: Aware → Appeal → Ask → Act → Advocate. For each stage: what content/touchpoint drives movement, what metric tracks it, and what the bottleneck is. Design the full-funnel strategy.",
  "aida":         "Apply the AIDA Model: Attention (how to break through noise) → Interest (key message and proof points) → Desire (emotional driver and social proof) → Action (CTA design and friction reduction). Specify creative and media for each stage.",
  "aisas":        "Apply the AISAS Model for digital: Attention → Interest → Search → Action → Share. Identify the search keywords to own, the trigger for sharing, and design the viral loop.",
  "aarrr":        "Apply the AARRR (Pirate Metrics) framework: Acquisition / Activation / Retention / Referral / Revenue. Benchmark current conversion rates, identify the biggest bottleneck (the 'leaky bucket'), and prescribe 3 high-leverage experiments.",
  "content-funnel":"Design a Content Marketing Funnel: Top-of-Funnel (awareness content types and SEO strategy) → Middle-of-Funnel (nurture content and lead magnet) → Bottom-of-Funnel (conversion content and social proof). Include content calendar rhythm.",
  "inbound":      "Apply Inbound Marketing methodology (HubSpot): Attract (SEO / social / content) → Convert (CTA / landing page / forms) → Close (lead scoring / email sequences / CRM) → Delight (onboarding / NPS / upsell). Design the flywheel.",
  "wom":          "Apply Word-of-Mouth Marketing (WOMM): identify the Talkers, Topics, Tools, and Taking Part. Design a Talk Trigger (a remarkable, repeatable differentiator). Map the amplification mechanisms (referral program, UGC, community).",

  // Channel & Product
  "dtc":          "Apply DTC (Direct-to-Consumer) Strategy: map the customer acquisition funnel (paid social → owned email → subscription), design the post-purchase experience, and model unit economics (blended CAC, gross margin, payback period).",
  "marketplace":  "Design Marketplace Channel Strategy: evaluate platform fit (Amazon / Shopee / Shopify / LINE Shopping), organic vs. paid visibility, pricing strategy on platform, review generation, and the path to reducing marketplace dependency.",
  "gtm":          "Build a Go-to-Market (GTM) Plan: define ICP, select distribution channel (direct / channel / product-led), design the sales motion, set pricing structure, create launch sequence (weeks 1–8), and define success metrics.",
  "stage-gate":   "Apply Stage-Gate New Product Development: Gate 1 (Idea Screening) → Gate 2 (Business Case) → Gate 3 (Development) → Gate 4 (Testing) → Gate 5 (Launch). Define the specific deliverables and kill criteria at each gate.",
  "lean-startup": "Apply Lean Startup methodology: define the Leap-of-Faith Assumptions, design the minimum viable experiment (MVE), specify Build-Measure-Learn cycle metrics (vanity vs. actionable), and establish the pivot/persevere decision framework.",
  "design-thinking":"Apply Design Thinking for product development: Empathize (user research methods) → Define (problem statement using HMW format) → Ideate (divergent ideation and prioritization) → Prototype (fidelity level and test plan) → Test (success criteria).",
};

// ─── Tavily grounding ───────────────────────────────────────────────────────

async function fetchTavilyContext(query: string): Promise<string> {
  const key = ENV.TAVILY_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5,
      }),
    });
    if (!res.ok) return "";
    const json = await res.json() as any;
    const items = (json?.results ?? []) as any[];
    if (!items.length) return "";
    return items.slice(0, 5).map((r: any) =>
      `[${r.title}](${r.url}) — ${(r.content ?? r.snippet ?? "").slice(0, 300)}`
    ).join("\n");
  } catch {
    return "";
  }
}

// ─── System prompt builder ──────────────────────────────────────────────────

function buildSystemPrompt(
  agentName: string,
  agentTitle: string,
  agentBio: string,
  agentSpecialty: string,
  agentMethodology: string,
  scenario: string,
  methodology: string,
  brandContext: string,
  tavilyContext: string,
): string {
  const methodologyPrompt = METHODOLOGY_PROMPTS[methodology] ?? `Apply rigorous strategic analysis for the ${methodology} framework.`;

  const scenarioLabel: Record<string, string> = {
    business:  "商業策略顧問",
    audience:  "受眾洞察顧問",
    pricing:   "定價策略顧問",
    promotion: "推廣策略顧問",
    channel:   "通路與產品策略顧問",
  };

  return `You are ${agentName}, ${agentTitle} — a ${scenarioLabel[scenario] ?? "策略顧問"} operating at McKinsey & Company standard.

Your background:
${agentBio || agentSpecialty || "Senior strategy consultant with deep marketing expertise."}

Your methodology:
${agentMethodology || "Evidence-based strategic analysis with structured frameworks."}

━━━ CLIENT BRAND CONTEXT ━━━
${brandContext || "Brand context not provided — proceed with general strategic analysis."}

━━━ FRAMEWORK TO APPLY ━━━
${methodologyPrompt}

━━━ MARKET INTELLIGENCE (real-time web) ━━━
${tavilyContext || "No live web data available — draw on your knowledge base."}

━━━ OUTPUT REQUIREMENTS ━━━
Your analysis MUST follow this McKinsey-standard structure:

## 執行摘要
3–4 sentence synthesis. The most important insight comes first.

## 情境診斷
Apply the [${methodology}] framework rigorously. Show your analytical work — tables, matrices, scoring where applicable.

## 關鍵發現
3–5 numbered findings. Each MUST:
- Be specific and quantified where possible
- Cite a source (market report / competitor data / framework principle)
- Link directly to a strategic implication

## 策略建議
3 prioritized recommendations. Each recommendation:
- **標題**：one-line action
- 理由：why this, why now (1–2 sentences)
- 執行要點：3 specific actions
- 預期結果：measurable outcome within 90 days

## 行動計畫
Week 1–2 / Week 3–4 / Month 2–3 milestones. Be specific about owners and success metrics.

---
Rules:
- Write in Traditional Chinese (繁體中文)
- Be direct, specific, and commercially rigorous — no generic platitudes
- Every claim needs evidence or logical grounding
- You may push back on the client's assumptions if the framework analysis demands it
- Do NOT pad with caveats. Make clear recommendations.`;
}

// ─── Router ────────────────────────────────────────────────────────────────

const scenarioEnum = z.enum(["business", "audience", "pricing", "promotion", "channel"]);

export const strategyConsultantRouter = router({

  /** List strategy agents relevant to a scenario, ordered by persona richness. */
  listAgents: protectedProcedure
    .input(z.object({
      scenario: scenarioEnum,
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const keywords = SCENARIO_KEYWORDS[input.scenario] ?? [];
      // Build LIKE conditions for specialty field
      const likeClauses = keywords.slice(0, 12).map(
        (k) => `(IFNULL(specialty, '') LIKE '%${k}%' OR IFNULL(primarySkill, '') LIKE '%${k}%')`
      ).join(" OR ");

      const rows = await db.execute(sql.raw(`
        SELECT id, name, title, bio, specialty, methodology, avatarUrl, primarySkill, aiModel
        FROM agents
        WHERE isAvailable = 1
          AND layer = 'strategy'
          ${likeClauses ? `AND (${likeClauses})` : ""}
        ORDER BY (
          CHAR_LENGTH(IFNULL(bio, '')) +
          CHAR_LENGTH(IFNULL(specialty, '')) +
          CHAR_LENGTH(IFNULL(methodology, ''))
        ) DESC
        LIMIT ${input.limit}
      `)) as any;

      const agents = Array.isArray(rows) ? rows : (rows?.rows ?? []);
      return (agents as any[]).map((a) => ({
        id: Number(a.id),
        name: String(a.name ?? ""),
        title: String(a.title ?? ""),
        bio: a.bio ? String(a.bio).slice(0, 400) : null,
        specialty: a.specialty ? String(a.specialty).slice(0, 200) : null,
        methodology: a.methodology ? String(a.methodology).slice(0, 300) : null,
        avatarUrl: a.avatarUrl ? String(a.avatarUrl) : null,
        primarySkill: a.primarySkill ? String(a.primarySkill) : null,
        aiModel: String(a.aiModel ?? ""),
      }));
    }),

  /** Generate initial McKinsey-style report for a selected scenario + methodology. */
  analyze: protectedProcedure
    .input(z.object({
      agentId:     z.number(),
      brandId:     z.number().optional(),
      scenario:    scenarioEnum,
      methodology: z.string().max(64),
      question:    z.string().max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // 1. Fetch agent persona
      let agent: any = null;
      if (db) {
        const rows = await db.execute(sql.raw(
          `SELECT name, title, bio, specialty, methodology, aiModel FROM agents WHERE id = ${input.agentId} LIMIT 1`
        )) as any;
        const arr = Array.isArray(rows) ? rows : (rows?.rows ?? []);
        agent = arr[0] ?? null;
      }

      const agentName       = agent?.name       ? String(agent.name) : "策略顧問";
      const agentTitle      = agent?.title      ? String(agent.title) : "Strategy Consultant";
      const agentBio        = agent?.bio        ? String(agent.bio).slice(0, 600) : "";
      const agentSpecialty  = agent?.specialty  ? String(agent.specialty).slice(0, 400) : "";
      const agentMethodology= agent?.methodology? String(agent.methodology).slice(0, 600) : "";

      // 2. Fetch brand context
      const brandContext = input.brandId
        ? await buildBrandPrefix(input.brandId, ctx.user.id)
        : "";

      // 3. Tavily grounding
      const tavilyQuery = `${input.question} ${input.methodology} strategy ${agentTitle}`;
      const tavilyContext = await fetchTavilyContext(tavilyQuery);

      // 4. Build system prompt
      const systemPrompt = withAgentKnowledge(buildSystemPrompt(
        agentName, agentTitle, agentBio, agentSpecialty, agentMethodology,
        input.scenario, input.methodology, brandContext, tavilyContext,
      ), await loadAgentKnowledge(input.agentId));

      // 5. Call LLM
      const aiModel = agent?.aiModel ? String(agent.aiModel) : "gpt-4o";
      const provider = (() => {
        const m = aiModel.toLowerCase();
        if (m.includes("claude") || m.includes("anthropic")) return "anthropic" as const;
        if (m.includes("gemini")) return "gemini" as const;
        if (m.includes("qwen") || m.includes("dashscope")) return "qwen" as const;
        return "azure-foundry" as const;
      })();

      // 2026-05-12: callModel signature is (messages, taskType?, preferredProvider?, preferredModel?)
      const result = await callModel(
        [
          { role: "system", content: systemPrompt },
          { role: "user",   content: input.question || "請針對我的品牌進行全面的策略分析。" },
        ],
        undefined,
        provider,
      );

      return {
        agentName,
        agentTitle,
        report: result.content ?? "",
        provider: result.provider ?? provider,
        model: result.model ?? aiModel,
      };
    }),

  /** Follow-up Q&A — pass full message history for stateless context. */
  chat: protectedProcedure
    .input(z.object({
      agentId:     z.number(),
      brandId:     z.number().optional(),
      scenario:    scenarioEnum,
      methodology: z.string().max(64),
      messages:    z.array(z.object({
        role:    z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })).max(40),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Fetch agent
      let agent: any = null;
      if (db) {
        const rows = await db.execute(sql.raw(
          `SELECT name, title, bio, specialty, methodology, aiModel FROM agents WHERE id = ${input.agentId} LIMIT 1`
        )) as any;
        const arr = Array.isArray(rows) ? rows : (rows?.rows ?? []);
        agent = arr[0] ?? null;
      }

      const agentName       = agent?.name       ? String(agent.name) : "策略顧問";
      const agentTitle      = agent?.title      ? String(agent.title) : "Strategy Consultant";
      const agentBio        = agent?.bio        ? String(agent.bio).slice(0, 600) : "";
      const agentSpecialty  = agent?.specialty  ? String(agent.specialty).slice(0, 400) : "";
      const agentMethodology= agent?.methodology? String(agent.methodology).slice(0, 600) : "";

      const brandContext = input.brandId
        ? await buildBrandPrefix(input.brandId, ctx.user.id)
        : "";

      // For follow-ups, only do Tavily on the latest user message if it looks like a research question
      const lastUserMsg = [...input.messages].reverse().find(m => m.role === "user");
      let tavilyContext = "";
      if (lastUserMsg && lastUserMsg.content.length > 20) {
        tavilyContext = await fetchTavilyContext(lastUserMsg.content);
      }

      const systemPrompt = withAgentKnowledge(buildSystemPrompt(
        agentName, agentTitle, agentBio, agentSpecialty, agentMethodology,
        input.scenario, input.methodology, brandContext, tavilyContext,
      ), await loadAgentKnowledge(input.agentId));

      const aiModel = agent?.aiModel ? String(agent.aiModel) : "gpt-4o";
      const provider = (() => {
        const m = aiModel.toLowerCase();
        if (m.includes("claude") || m.includes("anthropic")) return "anthropic" as const;
        if (m.includes("gemini")) return "gemini" as const;
        if (m.includes("qwen") || m.includes("dashscope")) return "qwen" as const;
        return "azure-foundry" as const;
      })();

      const result = await callModel(
        [
          { role: "system", content: systemPrompt },
          ...input.messages,
        ],
        undefined,
        provider,
      );

      return {
        agentName,
        agentTitle,
        reply: result.content ?? "",
        provider: result.provider ?? provider,
        model: result.model ?? aiModel,
      };
    }),
});
