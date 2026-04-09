import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getSoworkDb } from "../db";
import { sql, eq } from "drizzle-orm";
import { matchAgents } from "../agentMatcher";
import {
  mysqlTable,
  int,
  varchar,
  text,
  decimal,
  boolean,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// ── sowork_db.agents schema ────────────────────────────────────────────────
const soworkAgents = mysqlTable("agents", {
  id:           int("id").primaryKey(),
  slug:         varchar("slug", { length: 64 }).notNull(),
  name:         varchar("name", { length: 64 }).notNull(),
  title:        varchar("title", { length: 128 }).notNull(),
  layer:        mysqlEnum("layer", ["strategy", "execution", "training"]).notNull(),
  specialty:    text("specialty"),
  bio:          text("bio"),
  rating:       decimal("rating", { precision: 3, scale: 2 }),
  hireCount:    int("hireCount").default(0),
  pricePerTask: decimal("pricePerTask", { precision: 10, scale: 2 }),
  priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }),
  isAvailable:  boolean("isAvailable").default(true),
});

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
      })
    )
    .query(async ({ input }) => {
      const db = await getSoworkDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(soworkAgents)
        .where(
          input.layer
            ? eq(soworkAgents.isAvailable, true)
            : eq(soworkAgents.isAvailable, true)
        )
        .limit(input.limit);
      // filter by layer in JS if provided (avoids extra and() import)
      return input.layer ? rows.filter((r) => r.layer === input.layer) : rows;
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

      const plan = agents.slice(0, 3).map((a, i) => ({
        step:       i + 1,
        agentName:  a.name,
        agentTitle: a.title,
        layer:      a.layer,
        action:     STEP_ACTIONS[i] ?? "執行任務",
      }));

      return { agents, plan, taskType };
    }),
});
