/**
 * triageRouter — the 2-question diagnostic wizard.
 *
 * Point B of the UX pivot: users don't browse 100 squads. They answer two
 * questions and get 2–3 recommended decision types with a "why this" rationale.
 *
 * Trigger taxonomy (Q1 options):
 *   new-launch           新品上市
 *   pricing-stuck        定價卡住
 *   audience-unclear     受眾模糊
 *   competitor-pressure  競品逼近
 *   engagement-drop      聲量下滑
 *   post-campaign        活動後複盤
 *   other                其他（free text）
 *
 * Stage/scale (Q2 options):
 *   startup | growth | mature | crisis
 *
 * Each trigger maps to an ordered list of MVP decision slugs — the recommender
 * picks top 2–3 with a short rationale. Expandable: later versions can learn
 * per-brand from triage_sessions history.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const trigger = z.enum([
  "new-launch",
  "pricing-stuck",
  "audience-unclear",
  "competitor-pressure",
  "engagement-drop",
  "post-campaign",
  "other",
]);

const stage = z
  .enum(["startup", "growth", "mature", "crisis"])
  .optional();

type TriggerKey = z.infer<typeof trigger>;

interface Recommendation {
  squadSlug: string;
  decisionType: string;
  label: string;
  rationale: string;
  layer: string;
}

// Trigger → recommended MVP decision squads (in priority order).
// Keep lean: 2–3 per trigger. Everything maps to the 6-decision MVP chain.
const TRIGGER_MAP: Record<TriggerKey, Recommendation[]> = {
  "new-launch": [
    {
      squadSlug: "sowork-brand-positioning",
      decisionType: "master-positioning",
      layer: "L1_brand",
      label: "品牌定位總檢",
      rationale: "新品上市先看整體品牌敘事是否支撐得起新產品線",
    },
    {
      squadSlug: "brand-archetype-positioning",
      decisionType: "archetype-choice",
      layer: "L1_brand",
      label: "品牌原型選擇",
      rationale: "新品是延伸原有原型，還是開新原型？先定案",
    },
    {
      squadSlug: "consumer-insight-intelligence",
      decisionType: "stp-audience",
      layer: "L3_audience",
      label: "受眾優先序",
      rationale: "新品要先打哪一群人，是所有下游內容的分水嶺",
    },
  ],
  "pricing-stuck": [
    {
      squadSlug: "benefit-based-positioning",
      decisionType: "benefit-ladder",
      layer: "L1_brand",
      label: "利益階梯重估",
      rationale: "定價卡住通常是情感/自我表達利益沒講清楚",
    },
    {
      squadSlug: "consumer-insight-intelligence",
      decisionType: "stp-audience",
      layer: "L3_audience",
      label: "受眾支付意願",
      rationale: "看 STP 分層找出願意付更高價的 segment",
    },
  ],
  "audience-unclear": [
    {
      squadSlug: "consumer-insight-intelligence",
      decisionType: "stp-audience",
      layer: "L3_audience",
      label: "STP 受眾決策",
      rationale: "受眾模糊就直接做一次 STP 重分",
    },
    {
      squadSlug: "brand-archetype-positioning",
      decisionType: "archetype-choice",
      layer: "L1_brand",
      label: "原型核對",
      rationale: "受眾模糊常因原型飄移，上游先校準",
    },
  ],
  "competitor-pressure": [
    {
      squadSlug: "brand-archetype-positioning",
      decisionType: "archetype-choice",
      layer: "L1_brand",
      label: "差異化原型選擇",
      rationale: "競品逼近時，找一個對方沒佔的原型空間",
    },
    {
      squadSlug: "benefit-based-positioning",
      decisionType: "benefit-ladder",
      layer: "L1_brand",
      label: "利益重構",
      rationale: "在對手強的功能層之外，找情感/自我表達層反擊",
    },
  ],
  "engagement-drop": [
    {
      squadSlug: "fb-garyvee-jab-hook",
      decisionType: "fb-content",
      layer: "L4_channel",
      label: "FB 內容節奏重設",
      rationale: "聲量下滑常是 Jab/Hook 比例失衡",
    },
    {
      squadSlug: "ig-baer-youtility",
      decisionType: "ig-content",
      layer: "L4_channel",
      label: "IG 實用內容補位",
      rationale: "Youtility 型內容最容易被分享救回觸及",
    },
    {
      squadSlug: "consumer-insight-intelligence",
      decisionType: "stp-audience",
      layer: "L3_audience",
      label: "受眾輪廓健檢",
      rationale: "有時候是受眾變了、不是內容變差",
    },
  ],
  "post-campaign": [
    {
      squadSlug: "consumer-insight-intelligence",
      decisionType: "stp-audience",
      layer: "L3_audience",
      label: "活動後受眾洞察",
      rationale: "活動結束後最有機會更新 STP 資料",
    },
    {
      squadSlug: "sowork-brand-positioning",
      decisionType: "master-positioning",
      layer: "L1_brand",
      label: "品牌定位校準",
      rationale: "把活動結果回寫進品牌總體定位",
    },
  ],
  other: [
    {
      squadSlug: "sowork-brand-positioning",
      decisionType: "master-positioning",
      layer: "L1_brand",
      label: "品牌總檢",
      rationale: "描述不明時，預設從品牌定位總檢切入",
    },
  ],
};

// Scale-specific nudges: inject or reorder based on stage.
function adjustForStage(recs: Recommendation[], s: typeof stage._type): Recommendation[] {
  if (!s) return recs;
  if (s === "crisis") {
    // Crisis → always lead with brand positioning re-check
    const head = recs.find((r) => r.layer === "L1_brand");
    const rest = recs.filter((r) => r !== head);
    return head ? [head, ...rest] : recs;
  }
  if (s === "startup") {
    // Startups favor STP + archetype (narrow focus) over master-positioning
    return [...recs].sort((a, b) => {
      const wa = a.layer === "L3_audience" ? 0 : a.layer === "L1_brand" ? 1 : 2;
      const wb = b.layer === "L3_audience" ? 0 : b.layer === "L1_brand" ? 1 : 2;
      return wa - wb;
    });
  }
  return recs;
}

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(sql`
    SELECT id FROM brands WHERE id = ${brandId} AND userId = ${userId} LIMIT 1
  `)) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}

export const triageRouter = router({
  // Start a diagnostic session and get recommendations
  startSession: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        trigger,
        stageOrScale: stage,
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const base = TRIGGER_MAP[input.trigger] ?? TRIGGER_MAP.other;
      const recs = adjustForStage(base, input.stageOrScale).slice(0, 3);

      const [result] = (await db.execute(sql`
        INSERT INTO decision_triage_sessions
          (brandId, userId, \`trigger\`, stageOrScale, recommendedDecisionIds, notes)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${input.trigger},
           ${input.stageOrScale ?? null},
           ${JSON.stringify(recs.map((r) => r.squadSlug))},
           ${input.notes ?? null})
      `)) as any;
      return {
        sessionId: result?.insertId ?? 0,
        recommendations: recs,
      };
    }),

  // Record which recommendation the user clicked into
  selectSquad: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        decisionId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        UPDATE decision_triage_sessions
        SET selectedDecisionId = ${input.decisionId ?? null}
        WHERE id = ${input.sessionId} AND userId = ${ctx.user.id}
      `);
      return { ok: true };
    }),

  // History for the brand
  listSessions: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT * FROM decision_triage_sessions
        WHERE brandId = ${input.brandId}
        ORDER BY createdAt DESC
        LIMIT ${input.limit}
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),
});
