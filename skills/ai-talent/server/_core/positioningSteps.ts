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
 * Event   (11 steps = EVENT_SEGMENTS ids): brief, context, audience, objectives,
 *           awards, smp, messaging, creative, guidelines, channels, journey
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

/**
 * 2026-08-11: does this parsed segment actually carry anything a human would
 * read? Every fallback shape in this file is an all-empty skeleton
 * ({ primary: "", matrix: [] } and friends) — none of them is a meaningful
 * default, they exist only so a parse failure doesn't crash. So "no strings
 * and no populated arrays anywhere" is indistinguishable from failure, and
 * must be treated as one.
 *
 * Numbers and booleans alone don't count: taglineScore's skeleton is
 * { rows: [], total: 0 }, and a real score always carries text in rows[].
 */
export function hasContent(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number" || typeof v === "boolean") return false;
  if (Array.isArray(v)) return v.some(hasContent);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasContent);
  return false;
}

// 2026-07-19 (CJ「競品分析 7/17-18 突然變不精準」post-mortem): the LLM
// chain silently degraded to gpt-4.1 for two days (Anthropic credits ran
// out) and nobody noticed until output quality complaints came in.
// Surface degradation loudly: one warn per (model, hour) into error_log
// so the ops dashboard flags it within minutes, not days.
const _degradedModelWarnedAt = new Map<string, number>();
async function warnIfDegradedModel(model: string, stepId: string): Promise<void> {
  if (!model || /claude/i.test(model)) return; // claude family = primary, healthy
  const now = Date.now();
  if (now - (_degradedModelWarnedAt.get(model) ?? 0) < 60 * 60_000) return;
  _degradedModelWarnedAt.set(model, now);
  try {
    const { logError } = await import("../routers/opsRouter");
    await logError({
      source: "positioningSteps",
      level: "warn",
      fingerprint: "positioning-degraded-model",
      message: `定位步驟正在用降級模型「${model}」跑（step: ${stepId}）— 主力 claude 鏈可能額度耗盡或故障，分析深度會下降（7/17-18 競品分析退化即此原因）`,
    });
  } catch { /* non-fatal */ }
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
  void warnIfDegradedModel(r.model || "", stepId);

  // 2026-08-11 (heytom-market onboarding: job reported done 10/10 with an
  // entirely blank 目標受眾): this used to `return safeJSON(text, fallback)`,
  // which swallowed both failure modes — unparseable output and an empty
  // object — by writing the empty skeleton and reporting success.
  //
  // That silently bypassed the runner's own safety net. positioningJobRunner
  // already retries a throwing step 5 times with backoff and marks the job
  // failed if it never recovers; returning a fallback meant that machinery
  // never engaged. A blank segment then reaches the customer looking like a
  // finished deliverable, which is worse than an honest failure.
  //
  // Throwing hands control back to the retry loop. `fallback` is still used —
  // spread underneath the parsed object so expected keys always exist — it
  // just can no longer stand in for a result.
  const PARSE_FAILED = Symbol("parse-failed");
  const parsed = safeJSON<any>(text, PARSE_FAILED as any);
  if (parsed === (PARSE_FAILED as any)) {
    throw new Error(
      `positioning step "${stepId}" returned unparseable output ` +
      `(model=${r.model || "?"}, ${text.length} chars): ${text.slice(0, 200)}`,
    );
  }
  if (!hasContent(parsed)) {
    throw new Error(
      `positioning step "${stepId}" parsed but produced no content ` +
      `(model=${r.model || "?"}) — refusing to write a blank segment`,
    );
  }
  return { ...(fallback as any), ...parsed };
}


const SYS = (lang: string) => `你是品牌定位專家，請用${lang}回答，輸出純 JSON。`;

// 2026-07-17 多市場: brands.outputLanguage (BCP 47) → SYS 語言標籤。
// 回傳 null = 沿用舊 lang 參數（zh-TW/en 二元）行為。
function langLabelOf(outputLanguage?: string | null): string | null {
  if (!outputLanguage) return null;
  const l = outputLanguage.trim().toLowerCase();
  if (!l || l === "zh-tw" || l === "zh-hant") return null; // legacy default
  if (l.startsWith("en")) return "English";
  if (l.startsWith("ja")) return "日本語";
  if (l.startsWith("ko")) return "한국어";
  if (l === "zh-cn" || l === "zh-hans") return "简体中文";
  return `${outputLanguage}（品牌目標市場語言）`;
}

// 2026-07-17 多市場: 市場段落注入 — 讓競品 / 趨勢 / 受眾研究以品牌目標
// 市場為範圍，而不是預設台灣。marketContext 由 positioningJobRunner 從
// brands.targetCountry 經 buildMarketContext 載入（product/event 繼承母品牌）。
// 2026-07-19 (CJ「競品分析突然抓不到 copy.ai / posty.ai」regression fix):
// 原句「所有研究必須以此市場為範圍」讓模型把「總部不在該國」的競品
// 全部排除 — SoWork(TW) 的真實競品是國際 SaaS，卻被換成泛泛本地選項。
// 市場設定約束的是「受眾、語言、文化與法規」；競品的正確定義是
// 「在此市場爭奪同一群客戶的所有選項」，國際產品/線上工具當然算。
function marketBlock(c: StepContext): string {
  return c.marketContext
    ? `\n\n【目標市場設定 — 受眾/語言/文化/法規以此市場為準】${c.marketContext}` +
      `\n（競品注意：競爭格局要涵蓋「在此市場爭奪同一群目標客戶」的所有實際選項 — ` +
      `包含國際品牌、跨境電商、線上工具/SaaS。不要因為公司總部不在此國就排除；` +
      `也不要為了湊在地性而編造不知名的本地品牌。）`
    : "";
}

// 2026-07-23 (CJ IRIS 訓練「要確保都是用他們確定的客群，例如 30-40 歲皇家
// 經典客群，但我們系統中，可以針對該客群，做更深入地描繪」): 品牌方已定案
// 的客群是「錨點」— 受眾相關輸出只能在此基礎上深化（人物誌、生活場景、
// 痛點、需求、MOT），絕不可換成 AI 自己發明的其他客群輪廓。
function audienceAnchorBlock(c: StepContext): string {
  return c.officialAudience
    ? `\n\n【官方確認客群 — 品牌方已定案，此為不可更改的錨點】${c.officialAudience}` +
      `\n（所有受眾相關內容必須以此客群為基礎做更深入的描繪與展開；` +
      `不可替換、擴大或縮小成其他輪廓的客群。）`
    : "";
}

function brandCtx(c: StepContext): string {
  const base = `品牌名稱：${c.brandName}\n產業：${c.industry || "未指定"}\n描述：${c.description || ""}${marketBlock(c)}${audienceAnchorBlock(c)}`;
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

export function buildBrandPositioningSteps(opts: { lang?: string; outputLanguage?: string } = {}): PositioningStep[] {
  // 多市場: outputLanguage（品牌欄位）優先；否則沿用舊 lang 二元參數。
  const lang = langLabelOf(opts.outputLanguage) ?? (opts.lang === "en" ? "English" : "繁體中文");
  const sys = SYS(lang);

  return [
    // ── Wave 1 (no deps) — grounding research ──
    {
      id: "audience",
      label: "目標受眾",
      deps: [],
      run: async (c) => ({
        audience: await callJSON(c, "audience", sys,
          `${brandCtx(c)}\n\n定義此品牌的目標受眾。若上文提供【官方確認客群】，primary 與 secondary 都必須以該客群為錨點向下深化——展開其生活場景、心理動機、情感需求、痛點、偏好管道與購買關鍵時刻（MOT），不可發明不同輪廓的受眾。輸出 JSON，鍵名固定如下：
{"primary":"主受眾完整敘事（人口統計 / 心理 / 情感需求 / 痛點 / 偏好管道，150-300字）","secondary":"次受眾敘事（80-150字）","matrix":[{"name":"族群名稱（例如 主受眾 / 次受眾，可依實際情況命名）","needs":[{"dim":"情感或功能需求維度","score":需求強度1-10,"weight":"★★★★★"}]}]}
matrix 至少包含 primary 與 secondary 兩個族群，每個族群的 needs 至少 5 個維度（情感需求與功能需求都要涵蓋）。`,
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
{"zhTagline":"${lang === "繁體中文" ? "中文主標語" : `主標語（用${lang}——品牌目標市場語言，不要用中文）`}","enTagline":"英文主標語","type":"標語類型（如：四字單句、直擊核心）","scenes":["應用場景1","應用場景2","應用場景3"],"competitorDiff":"與競品標語的差異（一段）","story":"標語背後的品牌故事（150-300字）"}`,
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
export function buildProductPositioningSteps(opts: { lang?: string; outputLanguage?: string } = {}): PositioningStep[] {
  const lang = langLabelOf(opts.outputLanguage) ?? (opts.lang === "en" ? "English" : "繁體中文");
  const sys = SYS(lang);
  const pCtx = (c: StepContext) => {
    // audienceAnchorBlock: 產品受眾必須落在母品牌官方客群之內（2026-07-23）。
    const base = `產品名稱：${c.brandName}\n類別：${c.industry || "未指定"}\n描述：${c.description || ""}${marketBlock(c)}${audienceAnchorBlock(c)}`;
    if (c.realContent) {
      return base + `\n\n${c.realContent}`;
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
{"name":"產品名稱","zhTagline":"${lang === "繁體中文" ? "中文標語（12字內）" : `標語（用${lang}——目標市場語言，不要用中文）`}","enTagline":"英文標語","coreStatement":"核心定位敘述（80-150字）","oneLineValueProp":"一句話價值主張（速查卡用，30字內）"}`,
          { name: "", zhTagline: "", enTagline: "", coreStatement: "", oneLineValueProp: "" }, 1200),
      }),
    },
    {
      id: "audience",
      label: "目標族群",
      deps: [],
      run: async (c) => ({
        audience: await callJSON(c, "audience", sys,
          `${pCtx(c)}\n\n定義此產品的目標族群。若上文提供【官方確認客群】，主/次族群必須落在該客群之內並向下深化（此產品對應的具體使用情境、痛點、需求），不可發明品牌客群以外的族群。只輸出 JSON，鍵名固定如下：
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

// ─── Event pipeline — one step per EVENT_SEGMENTS id ─────────────────────
//
// 2026-06-16 ROOT-CAUSE FIX (CJ「請繼續修產品和活動」): same schema mismatch
// as the product pipeline had. The old event pipeline emitted ad-hoc keys
// (audienceBrief / valueHook / eventMessaging / callouts) that NO reader
// understood — the 品牌大腦 cards, task-modal EVENT_SOURCES chips, and
// positioningJobsRouter.getCurrent all read events.positioning.<segmentId>
// where segmentId ∈ EVENT_SEGMENTS (client/src/v2/lib/positioningSchema.ts):
// brief / context / audience / objectives / awards / smp / messaging /
// creative / guidelines / channels / journey.
//
// Now: ONE step per EVENT_SEGMENTS id, each emitting JSON in that segment's
// exact field schema. `awards` is left for the dedicated DB-RAG award-matcher
// in BrandsPage (it needs creative_cases); the background step seeds plausible
// award DIRECTIONS only, clearly framed, never fabricated DB matches.
export function buildEventPositioningSteps(opts: { lang?: string; outputLanguage?: string } = {}): PositioningStep[] {
  const lang = langLabelOf(opts.outputLanguage) ?? (opts.lang === "en" ? "English" : "繁體中文");
  const sys = SYS(lang);
  const eCtx = (c: StepContext) => {
    // audienceAnchorBlock: 活動受眾同樣鎖在母品牌官方客群（2026-07-23）。
    const base = `活動名稱：${c.brandName}\n類別：${c.industry || "未指定"}\n描述：${c.description || ""}${marketBlock(c)}${audienceAnchorBlock(c)}`;
    if (c.realContent) {
      return base + `\n\n【官網 / 社群真實內容（以下為爬取結果，請以此為定位基礎）】\n${c.realContent}`;
    }
    return base;
  };

  return [
    // ── Wave 1 (no deps) ──
    {
      id: "brief",
      label: "戰略 Brief",
      deps: [],
      run: async (c) => ({
        brief: await callJSON(c, "brief", sys,
          `${eCtx(c)}\n\n撰寫此活動的戰略 brief。只輸出 JSON，鍵名固定如下：
{"eventType":"活動類型（brand / growth / conversion / hybrid 擇一）","roleThisRound":"本次角色（品牌升維 / 新市場切入 / 認知建立 / 轉換衝刺 擇一）","briefSummary":"活動定位摘要（150-200字）","relatedProducts":["對應產品（若有）"]}`,
          { eventType: "", roleThisRound: "", briefSummary: "", relatedProducts: [] }, 1200),
      }),
    },
    {
      id: "context",
      label: "背景與問題",
      deps: [],
      run: async (c) => ({
        context: await callJSON(c, "context", sys,
          `${eCtx(c)}\n\n分析此活動的商業背景與核心問題。只輸出 JSON，鍵名固定如下：
{"businessBackground":"商業背景（公司/品牌目前狀態，80-150字）","marketingStatus":"當前行銷現況（被市場怎麼認知）","coreProblem":"核心問題（1 句話）","rootCause":"根本原因（為什麼會發生）"}`,
          { businessBackground: "", marketingStatus: "", coreProblem: "", rootCause: "" }, 1200),
      }),
    },
    {
      id: "audience",
      label: "目標受眾",
      deps: [],
      run: async (c) => ({
        audience: await callJSON(c, "audience", sys,
          `${eCtx(c)}\n\n定義此活動的目標受眾。只輸出 JSON，鍵名固定如下：
{"primaryAudience":"核心受眾（人群輪廓 / 行為特徵 / 心理洞察，120-250字）","secondaryAudience":"次要受眾（60-120字）","keyInsight":"關鍵洞察（一句話）"}`,
          { primaryAudience: "", secondaryAudience: "", keyInsight: "" }, 1400),
      }),
    },
    // ── Wave 2 (deps context + audience) ──
    {
      id: "objectives",
      label: "活動目標（三層）",
      deps: ["context", "audience"],
      run: async (c) => ({
        objectives: await callJSON(c, "objectives", sys,
          `${eCtx(c)}\n\n制定此活動的三層目標。只輸出 JSON，鍵名固定如下：
{"businessGoal":"商業目標（Business）","marketingGoal":"行銷目標（Marketing / Brand）","userActionGoal":"用戶行為目標（User Action）","kpis":["可量化 KPI 1","可量化 KPI 2","可量化 KPI 3"]}`,
          { businessGoal: "", marketingGoal: "", userActionGoal: "", kpis: [] }, 1200),
      }),
    },
    {
      id: "smp",
      label: "單一核心命題（SMP）",
      deps: ["context", "audience"],
      run: async (c) => ({
        smp: await callJSON(c, "smp", sys,
          `${eCtx(c)}\n\n為此活動提煉單一核心命題（SMP）。只輸出 JSON，鍵名固定如下：
{"singleMindedProposition":"SMP（一句話，最高創意原則）","rationale":"為什麼是這句（200 字內）"}`,
          { singleMindedProposition: "", rationale: "" }, 1200),
      }),
    },
    // ── Wave 3 ──
    {
      id: "awards",
      label: "獎項方向（建議）",
      deps: ["objectives"],
      run: async (c) => ({
        awards: await callJSON(c, "awards", sys,
          `${eCtx(c)}\n\n建議此活動可投件的「獎項方向」（非實際比對，僅方向建議）。只輸出 JSON，鍵名固定如下：
{"selectedAwards":[{"name":"獎項方向名稱","subCategory":"適合的子類別","matchReason":"為什麼適合（建議方向，1 句）"}]}
selectedAwards 2-3 個。`,
          { selectedAwards: [] }, 1200),
      }),
    },
    {
      id: "messaging",
      label: "訊息架構",
      deps: ["smp"],
      run: async (c) => ({
        messaging: await callJSON(c, "messaging", sys,
          `${eCtx(c)}\n\n依 SMP「${c.prevOutputs?.smp?.smp?.singleMindedProposition ?? ""}」制定訊息架構。只輸出 JSON，鍵名固定如下：
{"coreMessage":"核心訊息（Core Message）","supportingPoints":["支撐訊息1","支撐訊息2","支撐訊息3"],"proofs":["證據/案例/數據1","證據2"]}`,
          { coreMessage: "", supportingPoints: [], proofs: [] }, 1400),
      }),
    },
    {
      id: "creative",
      label: "創意概念",
      deps: ["smp"],
      run: async (c) => ({
        creative: await callJSON(c, "creative", sys,
          `${eCtx(c)}\n\n為此活動發展創意概念（big idea）。只輸出 JSON，鍵名固定如下：
{"creativeTheme":"創意主題（活動 big idea）","coreMetaphor":"核心比喻","coreTranslation":"核心轉譯（一句話 hook）","referenceCases":[]}`,
          { creativeTheme: "", coreMetaphor: "", coreTranslation: "", referenceCases: [] }, 1400),
      }),
    },
    // ── Wave 4 ──
    {
      id: "guidelines",
      label: "創意與內容規範",
      deps: ["creative"],
      run: async (c) => ({
        guidelines: await callJSON(c, "guidelines", sys,
          `${eCtx(c)}\n\n制定此活動的創意與內容規範。只輸出 JSON，鍵名固定如下：
{"visualLanguage":"視覺語言（Visual System）","toneOfVoice":"語氣（Tone of Voice）","mustHaveElements":["必須出現元素1","必須出現元素2"],"forbiddenElements":["禁用元素1","禁用元素2"]}`,
          { visualLanguage: "", toneOfVoice: "", mustHaveElements: [], forbiddenElements: [] }, 1200),
      }),
    },
    {
      id: "channels",
      label: "內容與管道策略",
      deps: ["messaging", "objectives"],
      run: async (c) => ({
        channels: await callJSON(c, "channels", sys,
          `${eCtx(c)}\n\n規劃此活動的內容與管道策略（分階段）。只輸出 JSON，鍵名固定如下：
{"phases":[{"stage":"階段名（如 預熱/開跑/衝刺）","channels":"管道（逗號分隔）","contentTypes":"內容型態（逗號分隔）","rationale":"為何這配置（1 句）"}]}
phases 3-4 個階段。`,
          { phases: [] }, 1400),
      }),
    },
    {
      id: "journey",
      label: "用戶旅程",
      deps: ["audience", "messaging"],
      run: async (c) => ({
        journey: await callJSON(c, "journey", sys,
          `${eCtx(c)}\n\n描繪此活動的用戶旅程（Awareness → Conversion）。只輸出 JSON，鍵名固定如下：
{"journey":[{"step":"步驟名","emotion":"情緒狀態","touchpoint":"接觸點","outcome":"預期反應"}]}
journey 5 步。`,
          { journey: [] }, 1400),
      }),
    },
  ];
}
