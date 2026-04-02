/**
 * Agent Matcher — Intelligent agent selection from sowork_db
 *
 * Queries sowork_db.agents + agent_knowledge_base to find the best
 * agents for a given task type, industry, and market.
 *
 * Uses agent_user_affinity scores to personalize recommendations.
 */

import { getSoworkDb } from "./db";
import { sql } from "drizzle-orm";

export interface AgentMatchRequest {
  userId: number;
  taskType: string; // 'brand_positioning' | 'ad_copy' | 'competitor_analysis' | 'press_release' | 'social_content'
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

// Task type to agent title/specialty mapping
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

/**
 * Find the best matching agents for a task
 */
export async function matchAgents(req: AgentMatchRequest): Promise<AgentMatch[]> {
  const db = await getSoworkDb();
  const limit = req.limit ?? 5;
  const taskConfig = TASK_AGENT_MAP[req.taskType] ?? TASK_AGENT_MAP.general;

  // Build title filter
  const titleList = taskConfig.titles.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");

  // Build keyword filter for specialty
  const keywordConditions = taskConfig.keywords
    .map((k) => `a.specialty LIKE '%${k.replace(/'/g, "''")}%'`)
    .join(" OR ");

  // Market filter (if specified)
  const marketCondition = req.market
    ? `AND (a.specialty LIKE '%${req.market}%' OR a.slug LIKE '%-${req.market.toLowerCase().replace(/\s/g, "-")}-%')`
    : "";

  // Layer filter
  const layerCondition = req.layer ? `AND a.layer = '${req.layer}'` : "";

  const rows = await db.execute(sql.raw(`
    SELECT
      a.id, a.slug, a.name, a.title, a.layer, a.specialty, a.bio,
      COALESCE(a.rating, 4.5) as rating,
      COALESCE(a.hireCount, 0) as hireCount,
      COALESCE(a.pricePerTask, 0) as pricePerTask,
      COALESCE(a.priceMonthly, 0) as priceMonthly,
      -- Affinity score from agent_user_affinity (if exists)
      COALESCE(aff.affinity_score, 50.0) as affinityScore,
      -- Match score: title match(40) + rating(30) + hire count(20) + affinity(10)
      (
        CASE WHEN a.title IN (${titleList}) THEN 40 ELSE
          CASE WHEN (${keywordConditions}) THEN 20 ELSE 0 END
        END
        + LEAST(COALESCE(a.rating, 4.5) * 6, 30)
        + LEAST(COALESCE(a.hireCount, 0) * 2, 20)
        + COALESCE(aff.affinity_score, 50) / 10
      ) as matchScore
    FROM agents a
    LEFT JOIN agent_user_affinity aff
      ON aff.agentId = a.id AND aff.userId = ${req.userId}
    WHERE a.isAvailable = 1
      ${layerCondition}
      ${marketCondition}
      AND (
        a.title IN (${titleList})
        OR (${keywordConditions})
      )
    ORDER BY matchScore DESC, a.hireCount DESC, a.rating DESC
    LIMIT ${limit}
  `));

  const agents = rows as any[];

  return agents.map((agent) => {
    const matchReasons: string[] = [];
    if (taskConfig.titles.includes(agent.title)) {
      matchReasons.push(`職稱完全匹配：${agent.title}`);
    }
    if (agent.hireCount > 20) {
      matchReasons.push(`高需求：已被聘用 ${agent.hireCount} 次`);
    }
    if (agent.rating >= 4.8) {
      matchReasons.push(`高評分：${agent.rating}/5`);
    }
    if (agent.affinityScore > 60) {
      matchReasons.push(`與你的歷史合作紀錄相符`);
    }
    if (matchReasons.length === 0) {
      matchReasons.push(`專長符合：${agent.specialty?.slice(0, 50)}`);
    }
    return {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      title: agent.title,
      layer: agent.layer,
      specialty: agent.specialty ?? "",
      bio: agent.bio ?? "",
      rating: Number(agent.rating),
      hireCount: Number(agent.hireCount),
      pricePerTask: Number(agent.pricePerTask),
      priceMonthly: Number(agent.priceMonthly),
      matchScore: Number(agent.matchScore),
      matchReasons,
    };
  });
}

/**
 * Update user-agent affinity after task completion
 * Higher affinity = agent will be recommended more often
 */
export async function updateAgentAffinity(
  userId: number,
  agentId: number,
  taskSuccess: boolean,
  userRating?: number
): Promise<void> {
  const db = await getSoworkDb();
  const delta = taskSuccess ? (userRating ? (userRating - 3) * 5 : 5) : -10;

  await db.execute(sql.raw(`
    INSERT INTO agent_user_affinity (slack_user_id, agent_id, affinity_score, interaction_count, task_success_count, last_used_at)
    VALUES (CAST(${userId} AS CHAR), ${agentId}, GREATEST(0, LEAST(100, 50 + ${delta})), 1, ${taskSuccess ? 1 : 0}, NOW())
    ON DUPLICATE KEY UPDATE
      affinity_score = GREATEST(0, LEAST(100, affinity_score + ${delta})),
      interaction_count = interaction_count + 1,
      task_success_count = task_success_count + ${taskSuccess ? 1 : 0},
      last_used_at = NOW()
  `));
}

/**
 * Get agent knowledge base context for injection into LLM prompt
 */
export async function getAgentKnowledge(
  agentId: number,
  types?: string[],
  limit = 5
): Promise<string> {
  const db = await getSoworkDb();
  const typeFilter = types?.length
    ? `AND type IN (${types.map((t) => `'${t}'`).join(",")})`
    : "";

  const rows = (await db.execute(sql.raw(`
    SELECT type, content
    FROM agent_knowledge_base
    WHERE agentId = ${agentId} AND isActive = 1
    ${typeFilter}
    ORDER BY FIELD(type, 'methodology_own', 'brand_client', 'methodology_tool', 'industry', 'brand_market', 'brand_employer')
    LIMIT ${limit}
  `))) as any[];

  if (!rows.length) return "";

  const sections = rows.map((r: any) => {
    const typeLabel: Record<string, string> = {
      methodology_own: "個人方法論",
      brand_client: "客戶品牌案例",
      methodology_tool: "工具與框架",
      industry: "行業知識",
      brand_market: "市場品牌研究",
      brand_employer: "雇主品牌背景",
    };
    return `【${typeLabel[r.type] ?? r.type}】\n${String(r.content).slice(0, 500)}`;
  });

  return "\n\n【Agent 深度知識庫】\n" + sections.join("\n\n");
}
