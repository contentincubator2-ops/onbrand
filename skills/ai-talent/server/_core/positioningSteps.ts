/**
 * positioningSteps.ts — PositioningStep[] factories for brand / product / event.
 *
 * 2026-05-17 ROOT-CAUSE REFACTOR (品牌大腦 14-step cards always empty):
 *   The brand pipeline previously emitted ad-hoc step-keyed JSON into the
 *   wrong column (brands.soworkAnalysis). The「品牌大腦」cards read
 *   brands.positioning.<segmentId> where segmentId ∈ BRAND_SEGMENTS
 *   (client/src/v2/lib/positioningSchema.ts). Step ids ≠ segment ids and
 *   column was wrong → cards never populated.
 *
 *   Now: ONE step per BRAND_SEGMENTS id; each step's id IS the segment id
 *   and its LLM prompt emits JSON in EXACTLY that segment's field schema.
 *   No post-transform — the LLM produces the final card shape. The runner
 *   merges { [segmentId]: <segment object> } straight into the
 *   brands.positioning column (single source of truth, no detour).
 *
 *   Brand segment ids (= step ids), dependency-wave ordered:
 *     wave 1 (no deps):   audience, competition, trends, origin
 *     wave 2 (deps w1):   values, differentiation
 *     wave 3 (deps w2):   goldenCircle
 *     wave 4 (deps w3):   tagline
 *     wave 5 (deps w4):   taglineScore
 *     wave 6 (deps all):  voice
 *   Deleted (no card segment): value_proposition, channel_strategy,
 *     brand_activation, executive_summary (+ old step-keyed market_insight,
 *     messaging_strategy, tagline_creative, golden_circle_refine,
 *     brand_personality — folded into the segment steps above).
 *
 * Product (6 steps = PRODUCT_SEGMENTS ids): core, audience, value, competition, strategy, marketing
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
  const tryParse = (s: string): T | undefined => {
    try { return JSON.parse(s); } catch { return undefined; }
  };
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1]! : text).trim();
  let v = tryParse(raw);
  if (v !== undefined) return v;
  // 2026-05-17: heavy steps (e.g. competition) can truncate mid-JSON →
  // parse fails → silent empty segment. Recover by slicing from the
  // first { to the last balanced } and retrying before giving up.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    v = tryParse(raw.slice(start, end + 1));
    if (v !== undefined) return v;
  }
  return fallback;
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


const SYS = (lang: string) => `你是品牌定位專家，請用${lang}回答，輸出純 JSON。`;

function brandCtx(c: StepContext): string {
  const base = `品牌名稱：${c.brandName}\n產業：${c.industry || "未指定"}\n描述：${c.description || ""}`;
  if (c.realContent) {
    return base + `\n\n【官網 / 社群真實內容（以下為爬取結果，請以此為定位基礎）】\n${c.realContent}`;
  }
  return base;
}

// ─── Brand pipeline — one step per BRAND_SEGMENTS id ─────────────────────
//
// Each step's `id` IS the segment id. Each `run` returns
// { [segmentId]: <segment object matching positioningSchema.ts fields> }.
// positioningJobRunner.mergePositioning() spreads these straight into
// brands.positioning — NO post-transform, NO soworkAnalysis detour.

export function buildBrandPositioningSteps(opts: { lang?: string } = {}): PositioningStep[] {
  const lang = opts.lang === "en" ? "English" : "繁體中文";
  const sys = SYS(lang);

  return [
    // ── Wave 1 (no deps) — grounding research ──
    {
      id: "audience",
      label: "目標受眾",
      deps: [],
      run: async (c) => ({
        audience: await callJSON(c, "audience", sys,
          `${brandCtx(c)}\n\n定義此品牌的目標受眾。輸出 JSON，鍵名固定如下：
{"primary":"主受眾完整敘事（人口統計 / 心理 / 情感需求 / 痛點 / 偏好管道，150-300字）","secondary":"次受眾敘事（80-150字）","matrix":[{"dim":"情感需求維度","primary":主受眾分數1-10,"fan":粉絲分數1-10,"weight":"★★★★★"}]}
matrix 至少 5 個維度。`,
          { primary: "", secondary: "", matrix: [] }, 1500),
      }),
    },
    {
      id: "competition",
      label: "競爭格局分析",
      deps: [],
      run: async (c) => ({
        competition: await callJSON(c, "competition", sys,
          `${brandCtx(c)}\n\n分析此品牌的競爭格局。只輸出 JSON，鍵名固定如下：
{"intensity":"競爭強度評估（2-3 句）","direct":[{"name":"競品名","position":"市場地位","tone":"品牌調性","weakness":"弱點（精簡一句）","ourEdge":"我方差異點（精簡一句）"}],"indirect":[{"name":"間接競品","threat":"威脅程度","response":"應對策略（精簡一句）"}],"map":"競爭定位地圖描述（2-3 句）"}
direct 2-3 個、indirect 1-2 個；每個欄位精簡一句，控制總長度，務必輸出完整且可解析的 JSON。`,
          { intensity: "", direct: [], indirect: [], map: "" }, 2600),
      }),
    },
    {
      id: "trends",
      label: "市場趨勢與機會",
      deps: [],
      run: async (c) => ({
        trends: await callJSON(c, "trends", sys,
          `${brandCtx(c)}\n\n分析此品牌所處的市場趨勢與機會。輸出 JSON，鍵名固定如下：
{"favorable":[{"name":"有利趨勢標題","body":"60-120字說明"}],"risks":[{"name":"風險標題","body":"60-120字應對方向"}]}
favorable 3-4 個，risks 2-3 個。`,
          { favorable: [], risks: [] }, 1200),
      }),
    },
    {
      id: "origin",
      label: "品牌起源故事",
      deps: [],
      run: async (c) => ({
        origin: await callJSON(c, "origin", sys,
          `${brandCtx(c)}\n\n撰寫此品牌的起源故事與信念五層深挖。輸出 JSON，鍵名固定如下：
{"story":"整段品牌起源敘事（150-300字）","belief5Layers":[{"layer":"1 表面動機","body":"內容"},{"layer":"2 問題意識","body":"內容"},{"layer":"3 方法選擇","body":"內容"},{"layer":"4 信念基礎","body":"內容"},{"layer":"5 核心情緒動機","body":"一句話最本質情緒動機"}]}`,
          { story: "", belief5Layers: [] }, 1200),
      }),
    },

    // ── Wave 2 (deps wave1) ──
    {
      id: "values",
      label: "品牌核心價值觀",
      deps: ["origin"],
      run: async (c) => {
        const origin = c.prevOutputs.origin?.origin;
        return {
          values: await callJSON(c, "values", sys,
            `${brandCtx(c)}\n\n從以下品牌起源信念蒸餾出 3-5 條最不可複製的核心價值觀：
起源故事：${origin?.story || ""}
信念深挖：${JSON.stringify(origin?.belief5Layers || [])}

輸出 JSON，鍵名固定如下：
{"items":[{"label":"2-4字核心標籤","body":"50-80字說明（品牌做事方式的本質宣言，非行銷話術）"}]}
items 3-5 條，彼此互補不重複。`,
            { items: [] }, 1200),
        };
      },
    },
    {
      id: "differentiation",
      label: "品牌差異化戰略",
      deps: ["competition", "audience"],
      run: async (c) => {
        const comp = c.prevOutputs.competition?.competition;
        const aud  = c.prevOutputs.audience?.audience;
        return {
          differentiation: await callJSON(c, "differentiation", sys,
            `${brandCtx(c)}\n\n基於競爭格局與目標受眾，制定品牌差異化戰略：
競爭格局：${JSON.stringify(comp || {}).slice(0, 1500)}
主受眾：${(aud?.primary || "").slice(0, 600)}

輸出 JSON，鍵名固定如下：
{"emotional":"情感差異化（為什麼愛我，100-200字）","functional":"功能差異化（為什麼選我，100-200字）","summary":"差異化總結句（一句話品牌定位）"}`,
            { emotional: "", functional: "", summary: "" }, 1200),
        };
      },
    },

    // ── Wave 3 (deps wave2) ──
    {
      id: "goldenCircle",
      label: "品牌黃金圈",
      deps: ["origin", "differentiation", "values"],
      run: async (c) => {
        const origin = c.prevOutputs.origin?.origin;
        const diff   = c.prevOutputs.differentiation?.differentiation;
        return {
          goldenCircle: await callJSON(c, "goldenCircle", sys,
            `${brandCtx(c)}\n\n從品牌起源與差異化蒸餾出黃金圈：
核心情緒動機：${JSON.stringify(origin?.belief5Layers?.slice(-1) || [])}
差異化總結：${diff?.summary || ""}

輸出 JSON，鍵名固定如下：
{"why":"WHY 品牌願景 — 相信什麼 / 為什麼存在（50-100字）","how":"HOW 品牌使命 — 怎麼做 / 方法（50-100字）","what":"WHAT 品牌產品或服務 — 提供什麼具體東西（50-100字）"}`,
            { why: "", how: "", what: "" }, 1000),
        };
      },
    },

    // ── Wave 4 (deps wave3) ──
    {
      id: "tagline",
      label: "品牌核心標語",
      deps: ["goldenCircle", "differentiation"],
      run: async (c) => {
        const gc   = c.prevOutputs.goldenCircle?.goldenCircle;
        const diff = c.prevOutputs.differentiation?.differentiation;
        return {
          tagline: await callJSON(c, "tagline", sys,
            `${brandCtx(c)}\n\n基於黃金圈與差異化生成品牌核心標語：
WHY：${gc?.why || ""}
差異化總結：${diff?.summary || ""}

輸出 JSON，鍵名固定如下：
{"zhTagline":"中文主標語","enTagline":"英文主標語","type":"標語類型（如：四字單句、直擊核心）","scenes":["應用場景1","應用場景2","應用場景3"],"competitorDiff":"與競品標語的差異（一段）","story":"標語背後的品牌故事（150-300字）"}`,
            { zhTagline: "", enTagline: "", type: "", scenes: [], competitorDiff: "", story: "" }, 1200),
        };
      },
    },

    // ── Wave 5 (deps wave4) ──
    {
      id: "taglineScore",
      label: "標語評分摘要",
      deps: ["tagline"],
      run: async (c) => {
        const tl = c.prevOutputs.tagline?.tagline;
        return {
          taglineScore: await callJSON(c, "taglineScore", sys,
            `${brandCtx(c)}\n\n對以下主標語進行 6 維度評分（每維度 1-100 分）：
中文標語：${tl?.zhTagline || ""}
英文標語：${tl?.enTagline || ""}

6 維度：記憶(Memorability) / 差異(Uniqueness) / 情感(Emotional) / 簡潔(Clarity) / 國際化(Global) / 可延展(Extensible)

輸出 JSON，鍵名固定如下：
{"rows":[{"dim":"記憶","code":"Memorability","score":分數,"comment":"30-60字評析"}],"total":總分0-100}
rows 必須含全部 6 維度，total = 6 維度平均。`,
            { rows: [], total: 0 }, 1200),
        };
      },
    },

    // ── Wave 6 (deps all) — voice last ──
    {
      id: "voice",
      label: "品牌個性與溝通風格",
      deps: ["goldenCircle", "differentiation", "values"],
      run: async (c) => {
        const gc   = c.prevOutputs.goldenCircle?.goldenCircle;
        const vals = c.prevOutputs.values?.values;
        return {
          voice: await callJSON(c, "voice", sys,
            `${brandCtx(c)}\n\n基於黃金圈與核心價值觀，定義品牌個性與溝通風格：
WHY：${gc?.why || ""}
核心價值觀：${JSON.stringify(vals?.items || [])}

輸出 JSON，鍵名固定如下：
{"archetypes":["主原型（從英雄/智者/創造者/照顧者/探險家/反叛者/魔法師/一般人/戀人/弄臣/統治者/純真者選）","次原型"],"tone":["語調關鍵詞1","語調關鍵詞2","語調關鍵詞3","語調關鍵詞4"],"forbidden":["溝通禁區1","溝通禁區2","溝通禁區3"],"samples":[{"generic":"一般說法","ours":"我們的說法"}]}
samples 3-4 組。`,
            { archetypes: [], tone: [], forbidden: [], samples: [] }, 1200),
        };
      },
    },
  ];
}

// ─── Product 6-step pipeline ─────────────────────────────────────────────

// ─── Product pipeline — one step per PRODUCT_SEGMENTS id ─────────────────
//
// 2026-06-16 ROOT-CAUSE FIX (CJ「產品定位看起來沒跑完」): the previous
// product pipeline emitted ad-hoc keys (marketFit / targetUser / valueProp /
// productDifferentiation / productMessaging / gtmSummary) that NO reader
// understood. The 品牌大腦 cards, the task-modal context chips, and
// positioningJobsRouter.getCurrent all read products.positioning.<segmentId>
// where segmentId ∈ PRODUCT_SEGMENTS (client/src/v2/lib/positioningSchema.ts):
// core / audience / value / competition / strategy / marketing. So the job
// would report done 6/6 yet every field showed「尚未填寫」.
//
// Now: ONE step per PRODUCT_SEGMENTS id; each step's id IS the segment id and
// its LLM prompt emits JSON in EXACTLY that segment's field schema. The runner
// merges { [segmentId]: <segment object> } straight into products.positioning.
export function buildProductPositioningSteps(opts: { lang?: string } = {}): PositioningStep[] {
  const lang = opts.lang === "en" ? "English" : "繁體中文";
  const sys = SYS(lang);
  const pCtx = (c: StepContext) => {
    const base = `產品名稱：${c.brandName}\n類別：${c.industry || "未指定"}\n描述：${c.description || ""}`;
    if (c.realContent) {
      return base + `\n\n【官網 / 社群真實內容（以下為爬取結果，請以此為定位基礎）】\n${c.realContent}`;
    }
    return base;
  };

  return [
    // ── Wave 1 (no deps) ──
    {
      id: "core",
      label: "產品核心定位",
      deps: [],
      run: async (c) => ({
        core: await callJSON(c, "core", sys,
          `${pCtx(c)}\n\n撰寫此產品的核心定位。只輸出 JSON，鍵名固定如下：
{"name":"產品名稱","zhTagline":"中文標語（12字內）","enTagline":"英文標語","coreStatement":"核心定位敘述（80-150字）","oneLineValueProp":"一句話價值主張（速查卡用，30字內）"}`,
          { name: "", zhTagline: "", enTagline: "", coreStatement: "", oneLineValueProp: "" }, 1200),
      }),
    },
    {
      id: "audience",
      label: "目標族群",
      deps: [],
      run: async (c) => ({
        audience: await callJSON(c, "audience", sys,
          `${pCtx(c)}\n\n定義此產品的目標族群。只輸出 JSON，鍵名固定如下：
{"primary":"主目標族群完整敘事（人口統計 / 心理 / 使用情境 / 痛點，120-250字）","secondary":"次目標族群（60-120字）","pains":["痛點1","痛點2","痛點3"],"needs":["需求1","需求2","需求3"]}`,
          { primary: "", secondary: "", pains: [], needs: [] }, 1400),
      }),
    },
    // ── Wave 2 (deps core) ──
    {
      id: "value",
      label: "產品價值主張",
      deps: ["core"],
      run: async (c) => ({
        value: await callJSON(c, "value", sys,
          `${pCtx(c)}\n\n撰寫此產品的價值主張。只輸出 JSON，鍵名固定如下：
{"coreFunctions":["核心功能1","核心功能2","核心功能3"],"features":["特色1","特色2"],"advantages":["優勢1","優勢2"],"primaryEmotion":"主要情緒價值（一句話）","personality":"品牌個性（一句話）","userFeeling":"使用者感受（一句話）"}`,
          { coreFunctions: [], features: [], advantages: [], primaryEmotion: "", personality: "", userFeeling: "" }, 1400),
      }),
    },
    {
      id: "competition",
      label: "競爭定位",
      deps: ["core"],
      run: async (c) => ({
        competition: await callJSON(c, "competition", sys,
          `${pCtx(c)}\n\n分析此產品的競爭定位。只輸出 JSON，鍵名固定如下：
{"competitors":[{"name":"競品名","position":"市場定位"}],"uniqueUsp":"獨家賣點（只有你說得出口，80-150字）","rareUsp":"少數競品也說的賣點","commonUsp":"多數競爭者都說的賣點"}
competitors 2-3 個。`,
          { competitors: [], uniqueUsp: "", rareUsp: "", commonUsp: "" }, 1600),
      }),
    },
    // ── Wave 3 (deps wave 2) ──
    {
      id: "strategy",
      label: "產品策略",
      deps: ["audience", "competition"],
      run: async (c) => ({
        strategy: await callJSON(c, "strategy", sys,
          `${pCtx(c)}\n\n制定此產品的市場策略。只輸出 JSON，鍵名固定如下：
{"positioning":"產品定位策略（一句話）","pricing":"定價策略","channel":"通路策略","promotion":["推廣手法1","推廣手法2"],"lifecycleStage":"生命週期階段","marketGap":"市場受眾缺口","channelGap":"銷售通路缺口","priceGap":"價格區間缺口","promotionGap":"推廣策略缺口"}`,
          { positioning: "", pricing: "", channel: "", promotion: [], lifecycleStage: "", marketGap: "", channelGap: "", priceGap: "", promotionGap: "" }, 1600),
      }),
    },
    {
      id: "marketing",
      label: "行銷文字指引",
      deps: ["value"],
      run: async (c) => ({
        marketing: await callJSON(c, "marketing", sys,
          `${pCtx(c)}\n\n制定此產品的行銷文字指引（文字 DNA，所有文案都要符合）。只輸出 JSON，鍵名固定如下：
{"tone":"品牌語氣（一句話）","style":"溝通風格（一句話）","keywords":["關鍵詞1","關鍵詞2","關鍵詞3"],"visualStyle":"視覺文字搭配","colorStrategy":"色彩與情緒聯想","imageStyle":"圖像語言"}`,
          { tone: "", style: "", keywords: [], visualStyle: "", colorStrategy: "", imageStyle: "" }, 1200),
      }),
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
