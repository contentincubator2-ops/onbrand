import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getSoworkDb } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { matchAgents } from "../agentMatcher";

// ── Shared schema (single source of truth — no duplication) ───────────────
import { soworkAgents } from "../_schemas/soworkAgents";

// ── Task type detection ────────────────────────────────────────────────────
function detectTaskType(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("廣告") || d.includes("ad copy") || d.includes("文案")) return "ad_copy";
  if (d.includes("競品") || d.includes("competitor")) return "competitor_analysis";
  if (d.includes("社群") || d.includes("social")) return "social_content";
  if (d.includes("press") || d.includes("新聞稿")) return "press_release";
  if (d.includes("seo") || d.includes("搜尋")) return "seo_content";
  if (d.includes("市場") || d.includes("market research")) return "market_research";
  if (d.includes("email") || d.includes("郵件")) return "email_marketing";
  return "brand_positioning";
}

// ── Router ─────────────────────────────────────────────────────────────────
export const agentRouter = router({
  /** List all available agents, optional layer filter */
  list: protectedProcedure
    .input(
      z.object({
        layer: z.enum(["strategy", "execution", "training"]).optional(),
        limit: z.number().default(50),
        workspace: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getSoworkDb();
      if (!db) return [];
            // Build dynamic where: isAvailable + optional layer + optional workspace
      const conditions = [eq(soworkAgents.isAvailable, true)];
      if (input.layer) conditions.push(eq(soworkAgents.layer, input.layer));
      if (input.workspace) conditions.push(eq(soworkAgents.workspace, input.workspace));
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      return db
        .select()
        .from(soworkAgents)
        .where(whereClause)
        .limit(input.limit);
    }),

  /** Count agents grouped by layer */
  countByLayer: protectedProcedure.query(async () => {
    const db = await getSoworkDb();
    if (!db) return { total: 0, strategy: 0, execution: 0, training: 0 };
    const rows = await db
      .select({
        layer: soworkAgents.layer,
        count: sql<number>`COUNT(*)`,
      })
      .from(soworkAgents)
      .where(eq(soworkAgents.isAvailable, true))
      .groupBy(soworkAgents.layer);

    const result = { total: 0, strategy: 0, execution: 0, training: 0 };
    for (const r of rows) {
      const c = Number(r.count);
      (result as Record<string, number>)[r.layer] = c;
      result.total += c;
    }
    return result;
  }),

  /** Match best agents for a task description + build execution plan */
  matchForTask: protectedProcedure
    .input(
      z.object({
        taskDescription: z.string(),
        limit: z.number().default(3),
      })
    )
    .query(async ({ ctx, input }) => {
      const taskType = detectTaskType(input.taskDescription);
      const agents = await matchAgents({
        userId: ctx.user.id,
        taskType,
        limit: input.limit,
      });

      const STEP_ACTIONS = [
        "分析任務需求，制定執行策略",
        "執行核心任務，產出初稿",
        "品質審核，優化最終輸出",
      ];

      // Fix: graceful fallback when 0 agents returned — use a default CMO agent
      const effectiveAgents =
        agents.length > 0
          ? agents
          : [
              {
                id: 0,
                slug: "cmo-default",
                name: "策略總監",
                title: "CMO / 首席行銷官",
                layer: "strategy" as const,
                specialty: "品牌策略、行銷規劃、任務統籌",
                bio: "預設 AI 策略代理人",
                rating: 5,
                hireCount: 0,
                pricePerTask: 0,
                priceMonthly: 0,
                matchScore: 100,
                matchReasons: ["fallback agent"],
              },
            ];

      const plan = effectiveAgents.slice(0, 3).map((a, i) => ({
        step:       i + 1,
        agentName:  a.name,
        agentTitle: a.title,
        layer:      a.layer,
        action:     STEP_ACTIONS[i] ?? "執行任務",
      }));

      return { agents: effectiveAgents, plan, taskType };
    }),
});
