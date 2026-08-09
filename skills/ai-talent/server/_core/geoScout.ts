/**
 * geoScout — GEO (Generative Engine Optimization) monitoring core.
 *
 * Measures how a brand + its competitors show up in AI engines' answers to
 * category / brand / comparison questions: presence, rank, share-of-voice,
 * sentiment framing, and the sources the AI cites. This is the "AI 能見度"
 * counterpart to 輿情 — but far simpler to make reliable: the engine returns a
 * structured, dated-free answer we analyse directly (no scraping / no licensed
 * social data / no publish-date problem).
 *
 * MVP engine: Gemini 2.5 Flash + Google Search grounding (real, current answers
 * WITH citations). Additional engines (OpenAI / Perplexity / Claude) slot into
 * runOnEngine() when their keys are provided — the analysis layer is shared.
 */
import { scoreSentiment, type BrandCtx, type Sentiment } from "./listeningScopes";

export const GEO_ENGINES = ["gemini"] as const;
export type GeoEngine = typeof GEO_ENGINES[number];

export interface GeoPrompt { id: string; kind: "category" | "brand" | "compare"; label: string; text: string; }

export interface GeoResult {
  engine: GeoEngine;
  prompt: GeoPrompt;
  ok: boolean;
  answer: string;
  brandPresent: boolean;
  brandRank: number | null;              // 1 = brand named before any competitor
  competitorsPresent: string[];
  sentiment: Sentiment;                  // framing of the brand in this answer
  citations: Array<{ title: string; url: string }>;
  error?: string;
}

export interface GeoScan {
  ok: boolean;
  brandName: string;
  generatedAt: string;
  results: GeoResult[];
  summary: {
    appearanceRate: number;              // fraction of prompts where the brand appeared
    prompts: number;
    appeared: number;
    shareOfVoice: Record<string, number>; // brand + competitors → mention counts across answers
    sentimentMix: Record<Sentiment, number>;
    topCitations: Array<{ title: string; url: string; count: number }>;
  };
  message?: string;
}

/** Category / brand / comparison probes derived from the brand context. */
export function buildGeoPrompts(brand: BrandCtx): GeoPrompt[] {
  const cat = (brand.industry?.trim() || brand.name);
  const region = brand.isTaiwan ? "台灣" : "";
  const zh = brand.isTaiwan;
  const comps = brand.competitors.slice(0, 3);
  const prompts: GeoPrompt[] = zh ? [
    { id: "cat_reco", kind: "category", label: "品類推薦", text: `請推薦${region}優質的${cat}品牌，並簡短說明推薦理由。` },
    { id: "cat_best", kind: "category", label: "品類熱門", text: `${region}最受歡迎、口碑最好的${cat}有哪些？` },
    { id: "brand_eval", kind: "brand", label: "品牌評價", text: `${brand.name} 這個品牌評價如何？有哪些優缺點？` },
    { id: "brand_reco", kind: "brand", label: "是否推薦", text: `${brand.name} 值得買嗎？適合哪些人？` },
  ] : [
    { id: "cat_reco", kind: "category", label: "Category reco", text: `Recommend the best ${cat} brands and briefly say why.` },
    { id: "cat_best", kind: "category", label: "Category top", text: `What are the most popular, best-reviewed ${cat}?` },
    { id: "brand_eval", kind: "brand", label: "Brand review", text: `How is the brand ${brand.name} regarded? What are its pros and cons?` },
    { id: "brand_reco", kind: "brand", label: "Worth it?", text: `Is ${brand.name} worth buying, and who is it for?` },
  ];
  if (comps.length) {
    prompts.push(zh
      ? { id: "compare", kind: "compare", label: "與競品比較", text: `${brand.name} 和 ${comps.join("、")} 相比，哪個比較好？請客觀比較。` }
      : { id: "compare", kind: "compare", label: "vs competitors", text: `How does ${brand.name} compare to ${comps.join(", ")}? Give an objective comparison.` });
  }
  return prompts;
}

/** One Gemini answer WITH Google Search grounding → natural answer + citations.
 *  (Grounding is incompatible with responseMimeType:json, and 2.5-flash must
 *  have thinking disabled or it truncates — same gotchas as perplexityScout.) */
async function askGeminiGrounded(prompt: string): Promise<{ answer: string; citations: Array<{ title: string; url: string }> }> {
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "").trim();
  if (!key) throw new Error("no gemini key");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j: any = await res.json();
  const cand = j?.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: any) => p?.text).filter(Boolean).join("\n").trim();
  const chunks: any[] = cand?.groundingMetadata?.groundingChunks ?? [];
  const citations = chunks
    .map((c) => ({ title: String(c?.web?.title ?? ""), url: String(c?.web?.uri ?? "") }))
    .filter((c) => c.url);
  if (!answer) throw new Error("empty answer");
  return { answer, citations };
}

/** Presence / rank / competitors / sentiment of the brand within an answer. */
export function analyzeAnswer(answer: string, brand: BrandCtx): Pick<GeoResult, "brandPresent" | "brandRank" | "competitorsPresent" | "sentiment"> {
  const low = answer.toLowerCase();
  const brandIdx = low.indexOf(brand.name.toLowerCase());
  const brandPresent = brandIdx >= 0;
  const names = [brand.name, ...brand.competitors];
  const order = names
    .map((n) => ({ n, i: low.indexOf(n.toLowerCase()) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const brandRank = brandPresent ? order.findIndex((p) => p.n === brand.name) + 1 : null;
  const competitorsPresent = brand.competitors.filter((c) => c && low.includes(c.toLowerCase()));
  // Sentiment: a generous window around the brand mention (AI answers list 優點/
  // 缺點 over several lines, so a narrow window reads falsely neutral).
  const window = brandPresent ? answer.slice(Math.max(0, brandIdx - 120), brandIdx + 500) : answer;
  const sentiment = brandPresent ? scoreSentiment(window) : "neutral";
  return { brandPresent, brandRank, competitorsPresent, sentiment };
}

async function runOnEngine(engine: GeoEngine, prompt: GeoPrompt, brand: BrandCtx): Promise<GeoResult> {
  const base: GeoResult = { engine, prompt, ok: false, answer: "", brandPresent: false, brandRank: null, competitorsPresent: [], sentiment: "neutral", citations: [] };
  try {
    if (engine === "gemini") {
      const { answer, citations } = await askGeminiGrounded(prompt.text);
      return { ...base, ok: true, answer, citations, ...analyzeAnswer(answer, brand) };
    }
    return { ...base, error: `engine ${engine} not implemented` };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 120) };
  }
}

/** Run the full GEO scan for a brand across the requested engines. */
export async function runGeoScan(brand: BrandCtx, engines: GeoEngine[] = ["gemini"]): Promise<GeoScan> {
  const prompts = buildGeoPrompts(brand);
  const results: GeoResult[] = [];
  for (const engine of engines) {
    for (const prompt of prompts) {
      results.push(await runOnEngine(engine, prompt, brand));
      await new Promise((r) => setTimeout(r, 400)); // gentle pacing
    }
  }

  const ok = results.filter((r) => r.ok);
  if (!ok.length) {
    return { ok: false, brandName: brand.name, generatedAt: new Date().toISOString(), results, summary: emptySummary(prompts.length), message: "AI 引擎查詢失敗（請確認金鑰）。" };
  }

  const appeared = ok.filter((r) => r.brandPresent).length;
  const shareOfVoice: Record<string, number> = { [brand.name]: 0 };
  for (const c of brand.competitors) shareOfVoice[c] = 0;
  const sentimentMix: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 };
  const citeCount = new Map<string, { title: string; url: string; count: number }>();
  for (const r of ok) {
    if (r.brandPresent) { shareOfVoice[brand.name] = (shareOfVoice[brand.name] ?? 0) + 1; sentimentMix[r.sentiment]++; }
    for (const c of r.competitorsPresent) shareOfVoice[c] = (shareOfVoice[c] ?? 0) + 1;
    for (const cite of r.citations) {
      // Gemini returns redirect URLs (vertexaisearch…) but a real source `title`;
      // aggregate by title so the same source across answers counts together.
      const key = (cite.title || cite.url).toLowerCase();
      const prev = citeCount.get(key);
      if (prev) prev.count++; else citeCount.set(key, { ...cite, count: 1 });
    }
  }
  const topCitations = [...citeCount.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    ok: true,
    brandName: brand.name,
    generatedAt: new Date().toISOString(),
    results,
    summary: {
      appearanceRate: ok.length ? appeared / ok.length : 0,
      prompts: ok.length,
      appeared,
      shareOfVoice,
      sentimentMix,
      topCitations,
    },
  };
}

function emptySummary(prompts: number): GeoScan["summary"] {
  return { appearanceRate: 0, prompts, appeared: 0, shareOfVoice: {}, sentimentMix: { positive: 0, negative: 0, neutral: 0 }, topCitations: [] };
}
