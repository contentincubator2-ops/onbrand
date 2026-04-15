import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const POSITIONING_STEPS = [
  { step: 1, title: "市場洞察", agent: "市場研究員", description: "分析產業趨勢、客戶痛點、市場機會" },
  { step: 2, title: "目標客群", agent: "消費者洞察師", description: "定義主要客群、人口特徵、購買行為" },
  { step: 3, title: "競爭格局", agent: "競品分析師", description: "識別競爭者、市場空缺、競爭優勢" },
  { step: 4, title: "品牌核心價值", agent: "品牌策略師", description: "建立核心價值、使命願景、黃金圈" },
  { step: 5, title: "差異化定位", agent: "品牌策略師", description: "制定 USP、差異化要素、定位聲明" },
  { step: 6, title: "價值主張", agent: "定位顧問", description: "建構核心主張、效益證明" },
  { step: 7, title: "品牌個性", agent: "定位顧問", description: "定義品牌原型、語調、溝通風格" },
  { step: 8, title: "訊息策略", agent: "創意文案師", description: "開發標語、電梯簡報、訊息支柱" },
  { step: 9, title: "通路策略", agent: "通路策略師", description: "規劃主要通路、內容策略" },
  { step: 10, title: "品牌活化計畫", agent: "行銷計劃師", description: "制定快速勝利、季度里程碑、KPI" },
];

export const positioningRouter = router({
  // 取得或建立 positioning session
  getSession: protectedProcedure
    .input(z.object({ missionId: z.number(), brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rows] = await db.execute(
        sql`SELECT * FROM positioning_sessions WHERE missionId=${input.missionId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      if (rows?.[0]) {
        const s = rows[0];
        return {
          ...s,
          stepResults: typeof s.stepResults === 'string' ? JSON.parse(s.stepResults) : (s.stepResults ?? {}),
        };
      }
      // 初次建立
      await db.execute(
        sql`INSERT INTO positioning_sessions (missionId, brandId, userId, currentStep, status, stepResults)
            VALUES (${input.missionId}, ${input.brandId}, ${ctx.user.id}, 0, 'pending', '{}')`
      );
      return { missionId: input.missionId, brandId: input.brandId, currentStep: 0, status: 'pending', stepResults: {} };
    }),

  // 取得步驟清單（含狀態）
  getSteps: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return POSITIONING_STEPS;
      const [rows] = await db.execute(
        sql`SELECT currentStep, status, stepResults FROM positioning_sessions WHERE missionId=${input.missionId} LIMIT 1`
      ) as any;
      const session = rows?.[0];
      const currentStep = session?.currentStep ?? 0;
      const status = session?.status ?? 'pending';
      return POSITIONING_STEPS.map(s => ({
        ...s,
        state: s.step < currentStep ? 'done' :
               s.step === currentStep && status === 'in_progress' ? 'running' :
               s.step === currentStep && status === 'waiting_confirm' ? 'confirm' :
               'wait',
      }));
    }),

  // 確認當前步驟，推進到下一步
  confirmStep: protectedProcedure
    .input(z.object({ missionId: z.number(), stepResult: z.record(z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = await db.execute(
        sql`SELECT currentStep, stepResults FROM positioning_sessions WHERE missionId=${input.missionId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      const session = rows?.[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const currentStep = session.currentStep;
      const existing = typeof session.stepResults === 'string' ? JSON.parse(session.stepResults) : (session.stepResults ?? {});
      if (input.stepResult) existing[currentStep] = input.stepResult;
      const nextStep = currentStep + 1;
      const nextStatus = nextStep > 10 ? 'completed' : 'in_progress';
      await db.execute(
        sql`UPDATE positioning_sessions SET currentStep=${nextStep}, status=${nextStatus}, stepResults=${JSON.stringify(existing)} WHERE missionId=${input.missionId} AND userId=${ctx.user.id}`
      );
      return { nextStep, completed: nextStep > 10 };
    }),
});
