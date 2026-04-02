/**
 * Agent Matcher — Intelligent agent selection from sowork_db
 *
 * Queries sowork_db.agents + agent_knowledge_base to find the best
 * agents for a given task type, industry, and market.
 *
 * Security: All DB queries use Drizzle ORM query builder (no raw SQL interpolation).
 * Input validation enforces enum allowlists and numeric range clamping.
 */

import { getSoworkDb } from "./db";
import { sql, like, eq, or, and, desc } from "drizzle-orm";
import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// ─── sowork_db table schemas (minimal, for type-safe Drizzle queries) ────────

const soworkAgents = mysqlTable("agents", {
  id: int("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  layer: mysqlEnum("layer", ["strategy", "execution", "training"]).notNull(),
  specialty: text("specialty"),
  bio: text("bio"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  hireCount: int("hireCount").default(0),
  pricePerTask: decimal("pricePerTask", { precision: 10, scale: 2 }),
  priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }),
  isAvailable: boolean("isAvailable").default(true),
});

const agentKnowledgeBase = mysqlTable("agent_knowledge_base", {
  id: int("id").primaryKey(),
  agentId: int("agentId").notNull(),
  type: varchar("type", { length: 50 }),
  content: text("content"),
  isActive: boolean("isActive").default(true),
});

// ─── Types ────────────────────────────────────────────────────────────────────

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
