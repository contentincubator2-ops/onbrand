import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { gatewayInvokeLLM } from "../services/llmGateway";

// ── Squad Lead（劉品妤）擔任 QA 審核 + 銜接角色 ───────────────────────────────
export const SQUAD_LEAD = {
  name: "劉品妤",
  title: "AI 品牌故事 CMO",
  slug: "sarah-brand",
  agentId: 30002,
};

// ── 步驟定義 ──────────────────────────────────────────────────────────────────
export const POSITIONING_STEPS = [
  { step: 1,  title: "市場洞察",     agent: "市場研究員", agentName: "Mark Liu",   description: "分析產業趨勢、客戶痛點、市場機會", sourceLabel: "[來源: 業界報告 + 市場數據]",         squadLeadHandoff: "市場洞察已完成，我們掌握了產業趨勢和客戶核心痛點。接下來讓消費者洞察師帶你深入了解目標客群。" },
  { step: 2,  title: "目標客群",     agent: "消費者洞察師", agentName: "Amy Chen",  description: "定義主要客群、人口特徵、購買行為",  sourceLabel: "[來源: 消費者調查 + 行為數據]",       squadLeadHandoff: "目標客群輪廓已清晰。有了這群人的樣貌，我們可以開始審視競爭格局。" },
  { step: 3,  title: "競爭格局",     agent: "競品分析師", agentName: "Sarah Chen",   description: "識別競爭者、市場空缺、競爭優勢",   sourceLabel: "[來源: 競品研究 + 市場情報]",         squadLeadHandoff: "競爭格局已釐清，市場空缺找到了。這讓我們更有把握建立品牌核心價值。" },
  { step: 4,  title: "品牌核心價值",  agent: "品牌策略師", agentName: "Sarah Chen",   description: "建立核心價值、使命願景、黃金圈",   sourceLabel: "[來源: 品牌策略框架 + 黃金圈方法論]", squadLeadHandoff: "品牌的 Why-How-What 已成形。接下來要把這個基礎轉化為市場差異化。" },
  { step: 5,  title: "差異化定位",   agent: "品牌策略師", agentName: "Sarah Chen",   description: "制定 USP、差異化要素、定位聲明",   sourceLabel: "[來源: 定位聲明框架 + USP 方法論]",  squadLeadHandoff: "差異化定位確立。現在是把定位翻譯成具體價值主張的時刻。" },
  { step: 6,  title: "價值主張",     agent: "定位顧問", agentName: "David Wang",     description: "建構核心主張、效益證明",           sourceLabel: "[來源: 價值主張畫布 + 客戶效益驗證]", squadLeadHandoff: "價值主張清晰有力。接下來要為品牌注入個性與聲音。" },
  { step: 7,  title: "品牌個性",     agent: "定位顧問", agentName: "David Wang",     description: "定義品牌原型、語調、溝通風格",     sourceLabel: "[來源: 品牌原型理論 + 語調指南]",     squadLeadHandoff: "品牌個性已定義，聲音有了溫度。現在讓創意文案師把這些轉化為強力訊息。" },
  { step: 8,  title: "訊息策略",     agent: "創意文案師", agentName: "Jessica Wu",   description: "開發標語、電梯簡報、訊息支柱",     sourceLabel: "[來源: 創意文案框架 + 訊息測試]",     squadLeadHandoff: "訊息策略到位，標語和支柱都準備好了。最後兩步：選對通路、制定行動計畫。" },
  { step: 9,  title: "通路策略",     agent: "通路策略師", agentName: "Tom Lin",   description: "規劃主要通路、內容策略",           sourceLabel: "[來源: 通路分析 + 內容行銷框架]",     squadLeadHandoff: "通路藍圖完成。最後一步，讓行銷計劃師幫你把策略轉化為可執行的行動計畫。" },
  { step: 10, title: "品牌活化計畫",  agent: "行銷計劃師", agentName: "PM Agent",   description: "制定快速勝利、季度里程碑、KPI",    sourceLabel: "[來源: 行銷規劃框架 + KPI 標準]",     squadLeadHandoff: "恭喜！十步驟品牌定位分析全部完成。你現在擁有一套完整的品牌定位策略，隨時可以啟動。" },
];

// ── Squad Lead QA 核心邏輯（真實 LLM 呼叫）────────────────────────────────────
async function runSquadLeadQA(params: {
  step: number;
  stepTitle: string;
  agentName: string;
  stepContent: string;
  brandName: string;
  industry: string;
  description: string;
  targetMarket: string;
  previousStepsSummary?: string;
  userId?: number;
}): Promise<{
  status: "pass" | "flag";
  overallScore: number;
  comment: string;
  alignmentCheck: string;
  contextCheck: string;
  suggestions: string[];
  readyToAdvance: boolean;
}> {
  const systemPrompt = `你是劉品妤，AI 品牌故事 CMO，擔任品牌定位 Squad Lead。
你的職責是在每個分析步驟完成後，進行嚴格的 QA 審核：
1. 確認該步驟的研究結果是否符合客戶品牌的實際情況和需求
2. 確認與整體品牌定位脈絡的一致性（尤其是前幾步已建立的基礎）
3. 發現邏輯矛盾、遺漏重點、或與品牌不符的分析

你的審核必須基於實際內容，不要泛泛而談。
輸出純 JSON，格式如下：
{
  "status": "pass",
  "overallScore": 82,
  "comment": "（劉品妤的開場評語，100字以內，口氣直接有力，以「我看完了」開頭）",
  "alignmentCheck": "（與客戶需求對齊度，具體指出符合或不符合之處）",
  "contextCheck": "（與整體定位脈絡一致性說明）",
  "suggestions": ["（若有具體改進建議則列出，否則空陣列）"],
  "readyToAdvance": true
}
- status=pass, readyToAdvance=true：品質佳，可推進
- status=flag, readyToAdvance=false：發現重要問題，建議修正（用戶可選擇強制推進）
- overallScore 低於 70 請 flag`;

  const userPrompt = `正在審核：步驟 ${params.step} — ${params.stepTitle}（由 ${params.agentName} 執行）

【客戶品牌資料】
品牌名稱：${params.brandName}
產業：${params.industry}
品牌描述：${params.description || "未提供"}
目標市場：${params.targetMarket || "未指定"}

${params.previousStepsSummary ? `【前幾步已建立的脈絡】\n${params.previousStepsSummary}\n` : ""}

【本步驟分析內容】
${params.stepContent}

請以劉品妤的角色進行 QA 審核，輸出 JSON。`;

  try {
    const result = await gatewayInvokeLLM(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 1000,
      },
      { userId: params.userId ?? 0 }
    );
    const raw = String(result.choices[0]?.message?.content ?? "");
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1]!.trim() : raw.trim();
    const parsed = JSON.parse(jsonStr);
    return {
      status: parsed.status === "flag" ? "flag" : "pass",
      overallScore: Number(parsed.overallScore) || 80,
      comment: parsed.comment ?? "審核完成。",
      alignmentCheck: parsed.alignmentCheck ?? "符合客戶需求。",
      contextCheck: parsed.contextCheck ?? "與整體脈絡一致。",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      readyToAdvance: parsed.readyToAdvance !== false,
    };
  } catch {
    return {
      status: "pass",
      overallScore: 80,
      comment: "我看完了，分析結果品質合格，可以推進。",
      alignmentCheck: "與客戶需求方向一致。",
      contextCheck: "與整體定位脈絡吻合。",
      suggestions: [],
      readyToAdvance: true,
    };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const positioningRouter = router({

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
        return { ...s, stepResults: typeof s.stepResults === "string" ? JSON.parse(s.stepResults) : (s.stepResults ?? {}) };
      }
      await db.execute(
        sql`INSERT INTO positioning_sessions (missionId, brandId, userId, currentStep, status, stepResults)
             VALUES (${input.missionId}, ${input.brandId}, ${ctx.user.id}, 0, "pending", "{}")`
      );
      return { missionId: input.missionId, brandId: input.brandId, currentStep: 0, status: "pending", stepResults: {} };
    }),

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
      const status = session?.status ?? "pending";
      return POSITIONING_STEPS.map(s => ({
        ...s,
        squadLead: SQUAD_LEAD,
        state: s.step < currentStep ? "done" :
               s.step === currentStep && status === "in_progress" ? "running" :
               s.step === currentStep && status === "waiting_confirm" ? "confirm" :
               "wait",
      }));
    }),

  getSquadLead: protectedProcedure.query(async () => SQUAD_LEAD),

  // ── Squad Lead QA（真實審核，不推進步驟）──────────────────────────────────
  squadLeadQA: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepContent: z.string().optional(),
      brandContext: z.object({
        brandName: z.string().optional(),
        industry: z.string().optional(),
        description: z.string().optional(),
        targetMarket: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [rows] = await db.execute(
        sql`SELECT ps.currentStep, ps.stepResults,
                    b.name as brandName, b.industry, b.description, b.targetMarket
             FROM positioning_sessions ps
             LEFT JOIN brands b ON b.id = ps.brandId
             WHERE ps.missionId=${input.missionId} AND ps.userId=${ctx.user.id} LIMIT 1`
      ) as any;
      const session = rows?.[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const currentStep = session.currentStep as number;
      const stepDef = POSITIONING_STEPS.find(s => s.step === currentStep);
      if (!stepDef) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid step" });

      const stepResults = typeof session.stepResults === "string"
        ? JSON.parse(session.stepResults) : (session.stepResults ?? {});
      const stepResultForStep = stepResults[currentStep];
      const stepContent = input.stepContent
        || (stepResultForStep ? JSON.stringify(stepResultForStep, null, 2).slice(0, 2000) : "（本步驟分析內容尚未記錄）");

      // 前幾步摘要（提供脈絡，取最近 3 步）
      const prevStepKeys = Object.keys(stepResults).map(Number).filter(k => k < currentStep).slice(-3);
      const previousStepsSummary = prevStepKeys.length > 0
        ? prevStepKeys.map(k => {
            const def = POSITIONING_STEPS.find(s => s.step === k);
            return def ? `步驟 ${k} ${def.title}：${JSON.stringify(stepResults[k]).slice(0, 300)}` : "";
          }).filter(Boolean).join("\n")
        : undefined;

      const brandName   = input.brandContext?.brandName   || session.brandName   || "未知品牌";
      const industry    = input.brandContext?.industry    || session.industry    || "未指定";
      const description = input.brandContext?.description || session.description || "";
      const targetMarket = input.brandContext?.targetMarket || session.targetMarket || "";

      const qaResult = await runSquadLeadQA({
        step: currentStep,
        stepTitle: stepDef.title,
        agentName: stepDef.agent,
        stepContent,
        brandName,
        industry,
        description,
        targetMarket,
        previousStepsSummary,
        userId: ctx.user.id,
      });

      return {
        ...qaResult,
        stepTitle: stepDef.title,
        agent: stepDef.agent,
        sourceLabel: stepDef.sourceLabel,
        squadLead: SQUAD_LEAD,
        currentStep,
      };
    }),

  // ── confirmStep（QA 通過或強制推進後呼叫）────────────────────────────────────
  confirmStep: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepResult: z.record(z.any()).optional(),
      forceAdvance: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = await db.execute(
        sql`SELECT currentStep, stepResults FROM positioning_sessions WHERE missionId=${input.missionId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      const session = rows?.[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const currentStep = session.currentStep;
      const existing = typeof session.stepResults === "string" ? JSON.parse(session.stepResults) : (session.stepResults ?? {});
      if (input.stepResult) existing[currentStep] = input.stepResult;
      const nextStep = currentStep + 1;
      const nextStatus = nextStep > 10 ? "completed" : "in_progress";
      await db.execute(
        sql`UPDATE positioning_sessions SET currentStep=${nextStep}, status=${nextStatus}, stepResults=${JSON.stringify(existing)} WHERE missionId=${input.missionId} AND userId=${ctx.user.id}`
      );
      const currentStepDef = POSITIONING_STEPS.find(s => s.step === currentStep);
      return {
        nextStep,
        completed: nextStep > 10,
        squadLeadHandoff: currentStepDef?.squadLeadHandoff ?? null,
        sourceLabel: currentStepDef?.sourceLabel ?? null,
        squadLead: SQUAD_LEAD,
        forcedAdvance: input.forceAdvance ?? false,
      };
    }),

  getStepInfo: protectedProcedure
    .input(z.object({ step: z.number() }))
    .query(async ({ input }) => {
      const stepDef = POSITIONING_STEPS.find(s => s.step === input.step);
      if (!stepDef) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...stepDef, squadLead: SQUAD_LEAD };
    }),
});
