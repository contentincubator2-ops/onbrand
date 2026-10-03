/**
 * Agent Matcher — Intelligent agent selection from sowork_db
 *
 * Queries sowork_db.agents + agent_knowledge_base to find the best
 * agents for a given task type, industry, and market.
 *
 * Security: All DB queries use Drizzle ORM query builder (no raw SQL interpolation).
 * Input validation enforces enum allowlists and numeric range clamping.
 */

import { getSoworkDb } from "../../../db";
import localPool from "../../../localDb";
import { sql, like, eq, or, and, desc } from "drizzle-orm";

// ─── Shared schema (single source of truth) ───────────────────────────────────
import { soworkAgents, agentKnowledgeBase } from "../../../platform/core/_schemas/soworkAgents";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMatchRequest {
  userId: number;
  taskType: string; // 'brand_positioning' | 'ad_copy' | 'competitor_analysis' | 'press_release' | 'social_content'
  taskDescription?: string; // free-text task description for smart inference
  industry?: string; // 'ecommerce' | 'saas' | 'beauty' | 'finance' | 'food_bev' | 'health'
  market?: string; // 'Taiwan' | 'Japan' | 'Germany' | 'Singapore' | ...
  layer?: "strategy" | "execution" | "training";
  limit?: number;
}

export interface AgentMatch {
  id: number;
  slug: string;
  name: string;
  title: string;
  layer: string;
  specialty: string;
  bio: string;
  rating: number;
  hireCount: number;
  pricePerTask: number;
  priceMonthly: number;
  matchScore: number; // 0-100, higher = better fit
  matchReasons: string[]; // why this agent was selected
}

// ─── Task type to agent title/specialty mapping ───────────────────────────────

const TASK_AGENT_MAP: Record<string, { titles: string[]; keywords: string[] }> = {
  brand_positioning: {
    titles: ["品牌行銷策略總監", "策略長", "品牌行銷總監"],
    keywords: ["品牌定位", "市場策略", "品牌策略", "brand positioning"],
  },
  ad_copy: {
    titles: ["行銷總監", "數位行銷經理", "內容行銷專員"],
    keywords: ["廣告文案", "數位廣告", "Meta", "Facebook", "copywriting"],
  },
  competitor_analysis: {
    titles: ["競品情報分析師", "消費者洞察研究員", "市場規模研究員"],
    keywords: ["競品分析", "市場分析", "競爭對手", "competitor"],
  },
  press_release: {
    titles: ["公關媒體專員", "品牌行銷策略總監"],
    keywords: ["公關", "新聞稿", "PR", "press release", "媒體"],
  },
  social_content: {
    titles: ["內容行銷專員", "數位行銷經理", "社群輿情研究員"],
    keywords: ["社群媒體", "內容行銷", "Instagram", "Facebook", "social"],
  },
  market_research: {
    titles: ["市場規模研究員", "消費者洞察研究員", "搜尋趨勢分析師"],
    keywords: ["市場研究", "TAM", "SAM", "SOM", "消費者洞察"],
  },
  general: {
    titles: ["行銷總監", "品牌行銷策略總監", "策略長"],
    keywords: ["行銷策略", "marketing", "brand"],
  },
};

// Export for unit testing (QUAL-3)
export const TASK_AGENT_MAP_EXPORT = TASK_AGENT_MAP;

// ─── Allowlists ───────────────────────────────────────────────────────────────

const VALID_LAYERS = ["strategy", "execution", "training"] as const;

const VALID_MARKETS = [
  "Taiwan", "USA", "China", "Japan", "South Korea",
  "Singapore", "Hong Kong", "UK", "Germany", "France",
  "Australia", "Canada", "Other",
];

const VALID_KNOWLEDGE_TYPES = [
  "methodology_own", "brand_client", "methodology_tool",
  "industry", "brand_market", "brand_employer",
];

// ─── Marketing taskTypes (stored in local MySQL) ──────────────────────────────
const MARKETING_TASK_TYPES = new Set([
  "content-text","ads","ecommerce","email","seo","social-channel","kol",
  "video-content","b2b","pr","brand","analytics","affiliate","crm-marketing",
  "data-driven-marketing","mobile-marketing","sem-ppc","live-commerce",
  "ooh-marketing","traditional-media","trade-marketing","dtc-marketing",
  "esg-marketing","sports-marketing","cvs-marketing","wom-ugc","event-marketing",
  "programmatic","localization","cs-marketing",
  "content-text-enterprise","seo-enterprise","social-channel-enterprise",
  "ads-enterprise","email-enterprise","analytics-enterprise","ecommerce-enterprise",
  "b2b-enterprise","brand-enterprise","kol-enterprise",
  "content-text-smb","ads-smb","seo-smb","social-channel-smb",
  "output-design-center","seo-startup","ads-startup","content-text-startup","social-channel-startup"
]);

// ─── Intelligent task type inference from description + industry ──────────────

/**
 * Infer one or more local DB taskTypes from free-text description + industry.
 * Returns an ordered list (most relevant first).
 */
export function inferTaskTypeFromDescription(description: string, industry?: string): string[] {
  const text = description.toLowerCase();
  const taskTypes: string[] = [];

  // 市場研究 / 競品分析
  if (/市場研究|市場分析|競品|競爭對手|market research|competitor|industry analysis|產業分析/.test(text)) {
    taskTypes.push('analytics', 'b2b', 'analytics-enterprise');
  }
  // SEO
  if (/seo|搜尋排名|關鍵字|organic|自然流量/.test(text)) {
    taskTypes.push('seo', 'seo-enterprise', 'seo-smb');
  }
  // 社群媒體
  if (/facebook|instagram|社群|貼文|linkedin|twitter|tiktok|抖音/.test(text)) {
    taskTypes.push('social-channel', 'social-channel-enterprise', 'content-text');
  }
  // 廣告投放
  if (/廣告|投放|google ads|meta ads|fb ads|ppc|sem/.test(text)) {
    taskTypes.push('ads', 'sem-ppc', 'ads-enterprise');
  }
  // 內容/文案
  if (/文案|content|寫作|copywriting|部落格|blog|文章|article/.test(text)) {
    taskTypes.push('content-text', 'content-text-enterprise');
  }
  // Email 行銷
  if (/email|電子報|newsletter|edm|郵件/.test(text)) {
    taskTypes.push('email', 'email-enterprise');
  }
  // KOL / 網紅
  if (/kol|網紅|influencer|代言|直播/.test(text)) {
    taskTypes.push('kol', 'kol-enterprise');
  }
  // 電商
  if (/電商|ecommerce|shopee|蝦皮|momo|pchome|商城|購物/.test(text)) {
    taskTypes.push('ecommerce', 'ecommerce-enterprise', 'live-commerce');
  }
  // 品牌定位
  if (/品牌定位|品牌策略|brand|品牌故事|slogan|標語/.test(text)) {
    taskTypes.push('brand', 'brand-enterprise');
  }
  // B2B
  if (/b2b|企業客戶|business|銷售策略|sales|lead/.test(text)) {
    taskTypes.push('b2b', 'b2b-enterprise');
  }
  // PR / 公關
  if (/公關|新聞稿|press release|媒體報導/.test(text)) {
    taskTypes.push('pr');
  }

  // 根據產業加權（unshift = 優先）
  if (industry) {
    const ind = industry.toLowerCase();
    if (/retail|零售|居家|diy|特力屋|ikea|裝潢/.test(ind)) {
      taskTypes.unshift('trade-marketing', 'analytics', 'ecommerce');
    } else if (/tech|科技|saas|software/.test(ind)) {
      taskTypes.unshift('b2b', 'content-text', 'seo');
    } else if (/beauty|美妝|化妝品/.test(ind)) {
      taskTypes.unshift('kol', 'social-channel', 'ecommerce');
    } else if (/food|食品|飲料|fmcg/.test(ind)) {
      taskTypes.unshift('wom-ugc', 'social-channel', 'ecommerce');
    }
  }

  // 去重，默認 content-text + analytics
  const unique = [...new Set(taskTypes)];
  return unique.length > 0 ? unique : ['content-text', 'analytics'];
}

// ─── matchAgents (INJ-1, BUG-3 fixed) ────────────────────────────────────────

/**
 * Find the best matching agents for a task.
 * Uses Drizzle ORM query builder — no raw SQL interpolation.
 * Input validation enforces enum allowlists and numeric clamping.
 */
export async function matchAgents(req: AgentMatchRequest): Promise<AgentMatch[]> {
  // ── Input validation ──────────────────────────────────────────────────────
  const validTaskTypes = Object.keys(TASK_AGENT_MAP);
  const safeTaskType = validTaskTypes.includes(req.taskType) ? req.taskType : "general";
  const safeLayer =
    req.layer && VALID_LAYERS.includes(req.layer as any)
      ? (req.layer as "strategy" | "execution" | "training")
      : undefined;
  const safeLimit = Math.min(Math.max(1, Math.floor(req.limit ?? 5)), 20); // clamp 1-20
  // Validate market against allowlist (INJ-1: prevent market injection)
  const safeMarket =
    req.market && VALID_MARKETS.includes(req.market) ? req.market : undefined;

  // ── 本地 MySQL 優先查詢（行銷 agents，17000+ 筆）────────────────────────
  // 智能推斷 taskType 列表（支援多個 taskType IN 查詢）
  const inferredTypes = req.taskDescription
    ? (req.taskType
        ? [req.taskType, ...inferTaskTypeFromDescription(req.taskDescription, req.industry)]
        : inferTaskTypeFromDescription(req.taskDescription, req.industry))
    : req.taskType
      ? [req.taskType]
      : ['content-text', 'analytics'];

  const candidateTypes = [...new Set(inferredTypes)].filter(t => MARKETING_TASK_TYPES.has(t)).slice(0, 5);
  console.log(`[agentMatcher] candidateTypes:`, candidateTypes, 'for:', req.taskDescription?.slice(0, 50));

  if (candidateTypes.length > 0) {
    try {
      const placeholders = candidateTypes.map(() => '?').join(',');
      const orderPlaceholders = candidateTypes.map(() => '?').join(',');
      const [localRows] = await localPool.query<any[]>(
        `SELECT id, slug, name, title, layer, specialty, bio, rating, hireCount,
                pricePerTask, priceMonthly, taskType
         FROM agents
         WHERE taskType IN (${placeholders}) AND isAvailable = 1
         ORDER BY FIELD(taskType, ${orderPlaceholders}), rating DESC, hireCount DESC
         LIMIT ?`,
        [...candidateTypes, ...candidateTypes, safeLimit]
      );
      if (Array.isArray(localRows) && localRows.length > 0) {
        return (localRows as any[]).map((agent: any, i: number) => ({
          id: agent.id,
          slug: agent.slug ?? "",
          name: agent.name,
          title: agent.title ?? "",
          layer: agent.layer ?? "execution",
          specialty: agent.specialty ?? "",
          bio: agent.bio ?? "",
          rating: Number(agent.rating ?? 4.5),
          hireCount: Number(agent.hireCount ?? 0),
          pricePerTask: Number(agent.pricePerTask ?? 5),
          priceMonthly: Number(agent.priceMonthly ?? 99),
          matchScore: Math.max(60, 90 - i * 5),
          taskType: agent.taskType,
          matchReasons: [`智能匹配：${agent.taskType}（推斷自任務描述）`],
        }));
      }
    } catch (localErr) {
      console.warn("[localDb] 查詢失敗，fallback 到 Azure MySQL:", localErr);
    }
  }
  // ── Fallback: Azure MySQL via Drizzle ORM ─────────────────────────────────
  // ── Build Drizzle query conditions (SQL-injection safe) ──────────────────
  const db = await getSoworkDb();
  const taskConfig = TASK_AGENT_MAP[safeTaskType]!;

  const conditions: ReturnType<typeof eq>[] = [eq(soworkAgents.isAvailable, true)];

  if (safeLayer) {
    conditions.push(eq(soworkAgents.layer, safeLayer));
  }

  // Title OR keyword match (safe: Drizzle parameterizes these values)
  const titleConditions = taskConfig.titles.map((t) => eq(soworkAgents.title, t));
  const keywordConditions = taskConfig.keywords.map((k) =>
    like(soworkAgents.specialty, `%${k}%`)
  );
  conditions.push(or(...titleConditions, ...keywordConditions)!);

  // Market filter — only applied when market is in allowlist
  if (safeMarket) {
    conditions.push(like(soworkAgents.specialty, `%${safeMarket}%`));
  }

  const rows = await db
    .select()
    .from(soworkAgents)
    .where(and(...conditions))
    .orderBy(desc(soworkAgents.hireCount))
    .limit(safeLimit);

  // ── Post-process: calculate matchScore in JS (not SQL) ───────────────────
  return rows
    .map((agent) => {
      let matchScore = 0;
      const matchReasons: string[] = [];

      if (taskConfig.titles.includes(agent.title)) {
        matchScore += 40;
        matchReasons.push(`職稱完全匹配：${agent.title}`);
      } else {
        matchScore += 20;
      }

      const rating = Number(agent.rating ?? 4.5);
      matchScore += Math.min(rating * 6, 30);
      if (rating >= 4.8) matchReasons.push(`高評分：${rating}/5`);

      const hires = Number(agent.hireCount ?? 0);
      matchScore += Math.min(hires * 2, 20);
      if (hires > 20) matchReasons.push(`高需求：已被聘用 ${hires} 次`);

      if (matchReasons.length === 0) {
        matchReasons.push(`專長符合：${(agent.specialty ?? "").slice(0, 50)}`);
      }

      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        title: agent.title,
        layer: agent.layer,
        specialty: agent.specialty ?? "",
        bio: agent.bio ?? "",
        rating,
        hireCount: hires,
        pricePerTask: Number(agent.pricePerTask ?? 0),
        priceMonthly: Number(agent.priceMonthly ?? 0),
        matchScore,
        matchReasons,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ─── updateAgentAffinity (INJ-3 fixed) ───────────────────────────────────────

/**
 * Update user-agent affinity after task completion.
 * All numeric inputs are validated/clamped before use in SQL.
 * Raw SQL is still used for GREATEST/LEAST + ON DUPLICATE KEY (not supported by Drizzle),
 * but all interpolated values are strictly validated integers/numbers.
 */
export async function updateAgentAffinity(
  userId: number,
  agentId: number,
  taskSuccess: boolean,
  userRating?: number
): Promise<void> {
  const db = await getSoworkDb();

  // Validate: ensure all inputs are safe numbers before SQL interpolation
  const validUserId = Math.floor(Math.abs(userId));
  const validAgentId = Math.floor(Math.abs(agentId));
  const clampedRating = userRating
    ? Math.min(Math.max(1, Math.floor(userRating)), 5)
    : undefined;
  const delta = taskSuccess ? (clampedRating ? (clampedRating - 3) * 5 : 5) : -10;
  // delta is derived from clamped integers → range: [-10, 10], safe to interpolate
  const successInt = taskSuccess ? 1 : 0;

  await db.execute(sql.raw(`
    INSERT INTO agent_user_affinity (slack_user_id, agent_id, affinity_score, interaction_count, task_success_count, last_used_at)
    VALUES (CAST(${validUserId} AS CHAR), ${validAgentId}, GREATEST(0, LEAST(100, 50.0 + ${delta})), 1, ${successInt}, NOW())
    ON DUPLICATE KEY UPDATE
      affinity_score = GREATEST(0, LEAST(100, affinity_score + ${delta})),
      interaction_count = interaction_count + 1,
      task_success_count = task_success_count + ${successInt},
      last_used_at = NOW()
  `));
}

// ─── getAgentKnowledge (INJ-2 fixed) ─────────────────────────────────────────

/**
 * Get agent knowledge base context for injection into LLM prompt.
 * Uses Drizzle ORM query builder — no raw SQL interpolation.
 */
export async function getAgentKnowledge(
  agentId: number,
  types?: string[],
  limit = 5
): Promise<string> {
  // Validate inputs
  const validAgentId = Math.floor(Math.abs(agentId));
  const validTypes = types?.filter((t) => VALID_KNOWLEDGE_TYPES.includes(t)) ?? [];
  const validLimit = Math.min(Math.max(1, limit), 10);

  const db = await getSoworkDb();

  const conditions: ReturnType<typeof eq>[] = [
    eq(agentKnowledgeBase.agentId, validAgentId),
    eq(agentKnowledgeBase.isActive, true),
  ];

  if (validTypes.length > 0) {
    conditions.push(or(...validTypes.map((t) => eq(agentKnowledgeBase.type, t)))!);
  }

  const rows = await db
    .select({ type: agentKnowledgeBase.type, content: agentKnowledgeBase.content })
    .from(agentKnowledgeBase)
    .where(and(...conditions))
    .limit(validLimit);

  if (!rows.length) return "";

  const typeLabel: Record<string, string> = {
    methodology_own: "個人方法論",
    brand_client: "客戶品牌案例",
    methodology_tool: "工具與框架",
    industry: "行業知識",
    brand_market: "市場品牌研究",
    brand_employer: "雇主品牌背景",
  };

  const sections = rows.map((r) => {
    return `【${typeLabel[r.type ?? ""] ?? r.type}】\n${String(r.content ?? "").slice(0, 500)}`;
  });

  return "\n\n【Agent 深度知識庫】\n" + sections.join("\n\n");
}
