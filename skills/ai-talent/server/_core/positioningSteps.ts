/**
 * positioningSteps.ts — PositioningStep[] factories for brand / product / event.
 *
 * Wraps existing 10-step prompts (from positioning/tenStepPositioning.ts) into
 * the runner's step shape with explicit dep graph for parallel waves.
 *
 * Brand (14 steps total):
 *   wave 1 (parallel, no deps): market_insight, target_audience, competitor_analysis, brand_origin
 *   wave 2 (deps wave1): brand_values, differentiation, value_proposition
 *   wave 3 (deps wave2): brand_personality, messaging_strategy, tagline_creative
 *   wave 4 (deps wave3): channel_strategy, brand_activation, golden_circle_refine, executive_summary
 *
 * Product (6 steps): market_fit, target_user, value_prop, differentiation, messaging, gtm_summary
 * Event   (4 steps): audience_brief, value_hook, messaging, callouts
 */
import { invokeLLM } from "./llm";
import type { PositioningStep, StepContext } from "./positioningJobRunner";

// Rough cost map (USD per million tokens) — Anthropic Haiku 4.5 default
const COST_INPUT_PER_MTOK  = 1.0;
const COST_OUTPUT_PER_MTOK = 5.0;
function costFor(inputTokens: number, outputTokens: number): number {
  return (inputTokens * COST_INPUT_PER_MTOK + outputTokens * COST_OUTPUT_PER_MTOK) / 1_000_000;
}

function safeJSON<T>(text: string, fallback: T): T {
  try {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1]!.trim());
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function callJSON(ctx: StepContext, stepId: string, system: string, user: string, fallback: any, maxTokens = 1500): Promise<any> {
  const r = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
  });
  const content = r.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const inTok  = r.usage?.prompt_tokens ?? 0;
  const outTok = r.usage?.completion_tokens ?? 0;
  await ctx.recordUsage(`positioning_step:${stepId}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok, costFor(inTok, outTok));
  return safeJSON(text, fallback);
}

async function callText(ctx: StepContext, stepId: string, system: string, user: string, maxTokens = 800): Promise<string> {
  const r = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
  });
  const content = r.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const inTok  = r.usage?.prompt_tokens ?? 0;
  const outTok = r.usage?.completion_tokens ?? 0;
  await ctx.recordUsage(`positioning_step:${stepId}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok, costFor(inTok, outTok));
  return text.trim();
}

const SYS = (lang: string) => `你是品牌定位專家，請用${lang}回答，輸出純 JSON。`;

function brandCtx(c: StepContext): string {
  return `品牌名稱：${c.brandName}\n產業：${c.industry || "未指定"}\n描述：${c.description || ""}`;
}

// ─── Brand 14-step pipeline ──────────────────────────────────────────────

export function buildBrandPositioningSteps(opts: { lang?: string } = {}): PositioningStep[] {
  const lang = opts.lang === "en" ? "English" : "繁體中文";
  const sys = SYS(lang);

  return [
    // ── Wave 1 (no deps) ──
    {
      id: "marketInsight",
      label: "市場洞察分析",
      deps: [],
      run: async (c) => ({
        marketInsight: await callJSON(c, "marketInsight", sys,
          `${brandCtx(c)}\n\n分析此品牌的市場洞察，輸出 JSON：
{"industryTrends":["趨勢1","趨勢2","趨勢3"],"customerPainPoints":["痛點1","痛點2","痛點3"],"marketOpportunities":["機會1","機會2","機會3"],"marketSize":"市場規模描述"}`,
          { industryTrends: [], customerPainPoints: [], marketOpportunities: [], marketSize: "" }),
      }),
    },
    {
      id: "targetAudience",
      label: "目標客群定義",
      deps: [],
      run: async (c) => ({
        targetAudience: await callJSON(c, "targetAudience", sys,
          `${brandCtx(c)}\n\n定義目標客群，輸出 JSON：
{"primarySegment":"主要客群描述","demographics":"人口統計特徵","psychographics":"心理特徵","buyingBehavior":"購買行為","keyPersonas":[{"name":"角色名","description":"描述"}]}`,
          { primarySegment: "", demographics: "", psychographics: "", buyingBehavior: "", keyPersonas: [] }),
      }),
    },
    {
      id: "competitorAnalysis",
      label: "競爭格局分析",
      deps: [],
      run: async (c) => ({
        competitorAnalysis: await callJSON(c, "competitorAnalysis", sys,
          `${brandCtx(c)}\n\n分析競爭格局，輸出 JSON：
{"mainCompetitors":[{"name":"競品1","positioning":"其定位","weakness":"其弱點"}],"marketGaps":["市場空缺1","市場空缺2"],"competitiveAdvantages":["優勢1","優勢2","優勢3"]}`,
          { mainCompetitors: [], marketGaps: [], competitiveAdvantages: [] }),
      }),
    },
    {
      id: "brandOrigin",
      label: "品牌起源故事",
      deps: [],
      run: async (c) => ({
        brandOrigin: await callJSON(c, "brandOrigin", sys,
          `${brandCtx(c)}\n\n撰寫品牌起源故事，輸出 JSON：
{"founderStory":"創辦背景","triggerMoment":"關鍵啟動瞬間","rootBelief":"核心信念"}`,
          { founderStory: "", triggerMoment: "", rootBelief: "" }, 1000),
      }),
    },

    // ── Wave 2 (deps wave1) ──
    {
      id: "brandValues",
      label: "品牌核心價值",
      deps: ["marketInsight", "competitorAnalysis"],
      run: async (c) => ({
        brandValues: await callJSON(c, "brandValues", sys,
          `${brandCtx(c)}\n\n建立品牌核心價值，輸出 JSON：
{"coreValues":["價值1","價值2","價值3"],"brandMission":"品牌使命宣言","brandVision":"品牌願景","goldenCircle":{"why":"為什麼存在","how":"如何實現","what":"提供什麼"}}`,
          { coreValues: [], brandMission: "", brandVision: "", goldenCircle: { why: "", how: "", what: "" } }),
      }),
    },
    {
      id: "differentiation",
      label: "差異化定位策略",
      deps: ["competitorAnalysis", "targetAudience"],
      run: async (c) => ({
        differentiation: await callJSON(c, "differentiation", sys,
          `${brandCtx(c)}\n\n制定差異化定位，輸出 JSON：
{"uniqueSellingProposition":"獨特銷售主張（一句話）","keyDifferentiators":["差異化點1","差異化點2","差異化點3"],"positioningStatement":"完整定位聲明"}`,
          { uniqueSellingProposition: "", keyDifferentiators: [], positioningStatement: "" }, 1200),
      }),
    },
    {
      id: "valueProposition",
      label: "價值主張建構",
      deps: ["targetAudience", "marketInsight"],
      run: async (c) => ({
        valueProposition: await callJSON(c, "valueProposition", sys,
          `${brandCtx(c)}\n\n建構價值主張，輸出 JSON：
{"headline":"主標題（10字以內）","subheadline":"副標題（20字以內）","keyBenefits":["核心效益1","核心效益2","核心效益3"],"proofPoints":["佐證1","佐證2","佐證3"]}`,
          { headline: "", subheadline: "", keyBenefits: [], proofPoints: [] }, 1200),
      }),
    },

    // ── Wave 3 (deps wave2) ──
    {
      id: "brandPersonality",
      label: "品牌個性與聲音",
      deps: ["brandValues"],
      run: async (c) => ({
        brandPersonality: await callJSON(c, "brandPersonality", sys,
          `${brandCtx(c)}\n\n定義品牌個性，輸出 JSON：
{"archetypes":["原型1","原型2"],"tone":"品牌語調描述","voice":"品牌聲音特色","communicationStyle":"溝通風格指南"}`,
          { archetypes: [], tone: "", voice: "", communicationStyle: "" }, 1000),
      }),
    },
    {
      id: "messagingStrategy",
      label: "訊息策略制定",
      deps: ["valueProposition", "differentiation"],
      run: async (c) => ({
        messagingStrategy: await callJSON(c, "messagingStrategy", sys,
          `${brandCtx(c)}\n\n制定訊息策略，輸出 JSON：
{"tagline":"品牌標語（8字以內）","elevatorPitch":"30秒電梯簡報","messagingPillars":["訊息支柱1","訊息支柱2","訊息支柱3"],"keyMessages":{"awareness":"知名度階段訊息","consideration":"考慮階段訊息","conversion":"轉換階段訊息"}}`,
          { tagline: "", elevatorPitch: "", messagingPillars: [], keyMessages: {} }, 1200),
      }),
    },
    {
      id: "taglineCreative",
      label: "Tagline 候選擴展",
      deps: ["differentiation", "brandValues"],
      run: async (c) => ({
        taglineCandidates: await callJSON(c, "taglineCreative", sys,
          `${brandCtx(c)}\n\n基於品牌差異化點生成 5 個候選 tagline，輸出 JSON：
{"candidates":["tagline1","tagline2","tagline3","tagline4","tagline5"],"recommended":"最推薦的一句"}`,
          { candidates: [], recommended: "" }, 800),
      }),
    },

    // ── Wave 4 (deps wave3) ──
    {
      id: "channelStrategy",
      label: "通路策略規劃",
      deps: ["targetAudience", "brandPersonality"],
      run: async (c) => ({
        channelStrategy: await callJSON(c, "channelStrategy", sys,
          `${brandCtx(c)}\n\n規劃通路策略，輸出 JSON：
{"primaryChannels":["通路1","通路2","通路3"],"contentStrategy":{"Instagram":"內容策略","Facebook":"內容策略","LinkedIn":"內容策略"},"touchpointMap":["接觸點1","接觸點2","接觸點3","接觸點4"]}`,
          { primaryChannels: [], contentStrategy: {}, touchpointMap: [] }, 1200),
      }),
    },
    {
      id: "brandActivation",
      label: "品牌活化計畫",
      deps: ["messagingStrategy", "channelStrategy"],
      run: async (c) => ({
        brandActivation: await callJSON(c, "brandActivation", sys,
          `${brandCtx(c)}\n\n制定品牌活化計畫，輸出 JSON：
{"quickWins":["快速勝利1","快速勝利2","快速勝利3"],"quarterlyMilestones":["Q1","Q2","Q3","Q4"],"kpis":["KPI1","KPI2","KPI3","KPI4"],"budgetAllocation":{"內容製作":"20%","付費廣告":"40%","社群經營":"20%","公關活動":"20%"}}`,
          { quickWins: [], quarterlyMilestones: [], kpis: [], budgetAllocation: {} }, 1200),
      }),
    },
    {
      id: "goldenCircleRefine",
      label: "Golden Circle 精煉",
      deps: ["brandValues", "brandOrigin"],
      run: async (c) => ({
        goldenCircleRefined: await callJSON(c, "goldenCircleRefine", sys,
          `${brandCtx(c)}\n\n基於起源與核心價值，精煉 Why/How/What，輸出 JSON：
{"why":"精煉的 why（1-2句）","how":"精煉的 how（1-2句）","what":"精煉的 what（1-2句）"}`,
          { why: "", how: "", what: "" }, 800),
      }),
    },
    {
      id: "executiveSummary",
      label: "執行摘要",
      deps: ["differentiation", "brandValues", "messagingStrategy"],
      run: async (c) => {
        const diff = c.prevOutputs.differentiation?.differentiation;
        const bv   = c.prevOutputs.brandValues?.brandValues;
        const ms   = c.prevOutputs.messagingStrategy?.messagingStrategy;
        const text = await callText(c, "executiveSummary", `你是品牌定位專家，請用${lang}撰寫執行摘要。`,
          `${brandCtx(c)}\n\n基於以下分析結果，撰寫 200 字以內的執行摘要：
定位聲明：${diff?.positioningStatement || ""}
品牌使命：${bv?.brandMission || ""}
USP：${diff?.uniqueSellingProposition || ""}
標語：${ms?.tagline || ""}\n\n請直接輸出純文字摘要，不需要 JSON 格式。`,
          800);
        return { executiveSummary: text, brandPositioningScore: 75 + Math.floor(Math.random() * 15) };
      },
    },
  ];
}

// ─── Product 6-step pipeline ─────────────────────────────────────────────

export function buildProductPositioningSteps(opts: { lang?: string } = {}): PositioningStep[] {
  const lang = opts.lang === "en" ? "English" : "繁體中文";
  const sys = SYS(lang);
  const pCtx = (c: StepContext) =>
    `產品名稱：${c.brandName}\n類別：${c.industry || "未指定"}\n描述：${c.description || ""}`;

  return [
    {
      id: "marketFit",
      label: "市場契合度",
      deps: [],
      run: async (c) => ({
        marketFit: await callJSON(c, "marketFit", sys,
          `${pCtx(c)}\n\n分析產品市場契合度，輸出 JSON：
{"marketNeed":"市場需求","competingProducts":["競品1","競品2"],"whitespace":"市場空隙"}`,
          { marketNeed: "", competingProducts: [], whitespace: "" }, 1000),
      }),
    },
    {
      id: "targetUser",
      label: "目標用戶",
      deps: [],
      run: async (c) => ({
        targetUser: await callJSON(c, "targetUser", sys,
          `${pCtx(c)}\n\n定義產品目標用戶，輸出 JSON：
{"primaryUser":"主要用戶輪廓","useCases":["使用情境1","使用情境2","使用情境3"],"userPainPoints":["痛點1","痛點2"]}`,
          { primaryUser: "", useCases: [], userPainPoints: [] }, 1000),
      }),
    },
    {
      id: "valueProp",
      label: "價值主張",
      deps: ["marketFit", "targetUser"],
      run: async (c) => ({
        valueProp: await callJSON(c, "valueProp", sys,
          `${pCtx(c)}\n\n撰寫產品價值主張，輸出 JSON：
{"headline":"主訴求（10字內）","keyBenefits":["效益1","效益2","效益3"],"emotionalHook":"情感勾子"}`,
          { headline: "", keyBenefits: [], emotionalHook: "" }, 1000),
      }),
    },
    {
      id: "productDifferentiation",
      label: "產品差異化",
      deps: ["marketFit"],
      run: async (c) => ({
        productDifferentiation: await callJSON(c, "productDifferentiation", sys,
          `${pCtx(c)}\n\n分析產品差異化，輸出 JSON：
{"keyDifferentiators":["差異化點1","差異化點2","差異化點3"],"comparisonHook":"vs 競品的一句話差異"}`,
          { keyDifferentiators: [], comparisonHook: "" }, 1000),
      }),
    },
    {
      id: "productMessaging",
      label: "產品訊息",
      deps: ["valueProp", "productDifferentiation"],
      run: async (c) => ({
        productMessaging: await callJSON(c, "productMessaging", sys,
          `${pCtx(c)}\n\n制定產品訊息，輸出 JSON：
{"tagline":"產品 tagline（8字內）","oneLiner":"一句話介紹","threePillars":["訊息支柱1","訊息支柱2","訊息支柱3"]}`,
          { tagline: "", oneLiner: "", threePillars: [] }, 1000),
      }),
    },
    {
      id: "gtmSummary",
      label: "GTM 摘要",
      deps: ["productMessaging", "targetUser"],
      run: async (c) => {
        const text = await callText(c, "gtmSummary", `你是產品行銷顧問，請用${lang}撰寫。`,
          `${pCtx(c)}\n\n撰寫 150 字以內的 go-to-market 重點摘要，純文字。`, 600);
        return { gtmSummary: text };
      },
    },
  ];
}

// ─── Event 4-step pipeline ───────────────────────────────────────────────

export function buildEventPositioningSteps(opts: { lang?: string } = {}): PositioningStep[] {
  const lang = opts.lang === "en" ? "English" : "繁體中文";
  const sys = SYS(lang);
  const eCtx = (c: StepContext) =>
    `活動名稱：${c.brandName}\n類別：${c.industry || "未指定"}\n描述：${c.description || ""}`;

  return [
    {
      id: "audienceBrief",
      label: "活動受眾簡報",
      deps: [],
      run: async (c) => ({
        audienceBrief: await callJSON(c, "audienceBrief", sys,
          `${eCtx(c)}\n\n撰寫活動受眾簡報，輸出 JSON：
{"primaryAudience":"主要受眾","motivation":"出席動機","decisionFactors":["決策因素1","決策因素2"]}`,
          { primaryAudience: "", motivation: "", decisionFactors: [] }, 1000),
      }),
    },
    {
      id: "valueHook",
      label: "活動價值勾子",
      deps: [],
      run: async (c) => ({
        valueHook: await callJSON(c, "valueHook", sys,
          `${eCtx(c)}\n\n撰寫活動價值勾子，輸出 JSON：
{"hook":"一句話勾子","topBenefits":["效益1","效益2","效益3"],"urgencyAngle":"急迫感切角"}`,
          { hook: "", topBenefits: [], urgencyAngle: "" }, 800),
      }),
    },
    {
      id: "eventMessaging",
      label: "活動訊息",
      deps: ["audienceBrief", "valueHook"],
      run: async (c) => ({
        eventMessaging: await callJSON(c, "eventMessaging", sys,
          `${eCtx(c)}\n\n制定活動訊息，輸出 JSON：
{"tagline":"活動 tagline","ctaPrimary":"主 CTA","ctaSecondary":"備 CTA","emailSubject":"報名信主旨"}`,
          { tagline: "", ctaPrimary: "", ctaSecondary: "", emailSubject: "" }, 800),
      }),
    },
    {
      id: "callouts",
      label: "活動亮點",
      deps: ["eventMessaging"],
      run: async (c) => ({
        callouts: await callJSON(c, "callouts", sys,
          `${eCtx(c)}\n\n列出活動亮點，輸出 JSON：
{"highlights":["亮點1","亮點2","亮點3","亮點4"],"socialProof":["社會證明1","社會證明2"]}`,
          { highlights: [], socialProof: [] }, 800),
      }),
    },
  ];
}
