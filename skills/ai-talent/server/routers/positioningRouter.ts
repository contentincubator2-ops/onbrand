import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ── Squad Lead（劉品妤）擔任各步驟的銜接總結角色 ────────────────────────────────
export const SQUAD_LEAD = {
  name: "劉品妤",
  title: "AI 品牌故事 CMO",
  slug: "sarah-brand",
  agentId: 30002,
};

// ── 步驟定義（含來源標籤 + Squad Lead 銜接文字） ─────────────────────────────────
export const POSITIONING_STEPS = [
  {
    step: 1,
    title: "市場洞察",
    agent: "市場研究員",
    description: "分析產業趨勢、客戶痛點、市場機會",
    sourceLabel: "[來源: 業界報告 + 市場數據]",
    squadLeadHandoff: "劉品妤 ✦ 市場洞察已完成，我們掌握了產業趨勢和客戶核心痛點。接下來讓消費者洞察師帶你深入了解目標客群。",
  },
  {
    step: 2,
    title: "目標客群",
    agent: "消費者洞察師",
    description: "定義主要客群、人口特徵、購買行為",
    sourceLabel: "[來源: 消費者調查 + 行為數據]",
    squadLeadHandoff: "劉品妤 ✦ 目標客群輪廓已清晰。有了這群人的樣貌，我們可以開始審視競爭格局。",
  },
  {
    step: 3,
    title: "競爭格局",
    agent: "競品分析師",
    description: "識別競爭者、市場空缺、競爭優勢",
    sourceLabel: "[來源: 競品研究 + 市場情報]",
    squadLeadHandoff: "劉品妤 ✦ 競爭格局已釐清，市場空缺找到了。這讓我們更有把握建立品牌核心價值。",
  },
  {
    step: 4,
    title: "品牌核心價值",
    agent: "品牌策略師",
    description: "建立核心價值、使命願景、黃金圈",
    sourceLabel: "[來源: 品牌策略框架 + 黃金圈方法論]",
    squadLeadHandoff: "劉品妤 ✦ 品牌的 Why-How-What 已成形。接下來要把這個基礎轉化為市場差異化。",
  },
  {
    step: 5,
    title: "差異化定位",
    agent: "品牌策略師",
    description: "制定 USP、差異化要素、定位聲明",
    sourceLabel: "[來源: 定位聲明框架 + USP 方法論]",
    squadLeadHandoff: "劉品妤 ✦ 差異化定位確立。現在是把定位翻譯成具體價值主張的時刻。",
  },
  {
    step: 6,
    title: "價值主張",
    agent: "定位顧問",
    description: "建構核心主張、效益證明",
    sourceLabel: "[來源: 價值主張畫布 + 客戶效益驗證]",
    squadLeadHandoff: "劉品妤 ✦ 價值主張清晰有力。接下來要為品牌注入個性與聲音。",
  },
  {
    step: 7,
    title: "品牌個性",
    agent: "定位顧問",
    description: "定義品牌原型、語調、溝通風格",
    sourceLabel: "[來源: 品牌原型理論 + 語調指南]",
    squadLeadHandoff: "劉品妤 ✦ 品牌個性已定義，聲音有了溫度。現在讓創意文案師把這些轉化為強力訊息。",
  },
  {
    step: 8,
    title: "訊息策略",
    agent: "創意文案師",
    description: "開發標語、電梯簡報、訊息支柱",
    sourceLabel: "[來源: 創意文案框架 + 訊息測試]",
    squadLeadHandoff: "劉品妤 ✦ 訊息策略到位，標語和支柱都準備好了。最後兩步：選對通路、制定行動計畫。",
  },
  {
    step: 9,
    title: "通路策略",
    agent: "通路策略師",
    description: "規劃主要通路、內容策略",
    sourceLabel: "[來源: 通路分析 + 內容行銷框架]",
    squadLeadHandoff: "劉品妤 ✦ 通路藍圖完成。最後一步，讓行銷計劃師幫你把策略轉化為可執行的行動計畫。",
  },
  {
    step: 10,
    title: "品牌活化計畫",
    agent: "行銷計劃師",
    description: "制定快速勝利、季度里程碑、KPI",
    sourceLabel: "[來源: 行銷規劃框架 + KPI 標準]",
    squadLeadHandoff: "劉品妤 ✦ 恭喜！十步驟品牌定位分析全部完成。你現在擁有一套完整的品牌定位策略，隨時可以啟動。",
  },
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

  // 取得步驟清單（含狀態 + Squad Lead 資訊）
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
        squadLead: SQUAD_LEAD,
        state: s.step < currentStep ? 'done' :
               s.step === currentStep && status === 'in_progress' ? 'running' :
               s.step === currentStep && status === 'waiting_confirm' ? 'confirm' :
               'wait',
      }));
    }),

  // 取得 Squad Lead 資訊
  getSquadLead: protectedProcedure
    .query(async () => {
      return SQUAD_LEAD;
    }),

  // 確認當前步驟，推進到下一步（回傳 Squad Lead 銜接文字）
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

      // 回傳當前步驟的 Squad Lead 銜接文字
      const currentStepDef = POSITIONING_STEPS.find(s => s.step === currentStep);
      return {
        nextStep,
        completed: nextStep > 10,
        squadLeadHandoff: currentStepDef?.squadLeadHandoff ?? null,
        sourceLabel: currentStepDef?.sourceLabel ?? null,
        squadLead: SQUAD_LEAD,
      };
    }),

  // 取得單一步驟資訊（含來源標籤）
  getStepInfo: protectedProcedure
    .input(z.object({ step: z.number() }))
    .query(async ({ input }) => {
      const stepDef = POSITIONING_STEPS.find(s => s.step === input.step);
      if (!stepDef) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...stepDef, squadLead: SQUAD_LEAD };
    }),
});
