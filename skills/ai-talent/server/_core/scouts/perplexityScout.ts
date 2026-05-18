/**
 * perplexityScout — web-grounded market intel fetch.
 *
 * Provider cascade (Perplexity quota exhausted → replaced):
 *   1. Gemini 2.0 Flash + Google Search grounding  (raw fetch)
 *   2. Tavily search API  (raw fetch, include_answer)
 *   3. Azure Foundry LLM fallback  (invokeLLM, knowledge-only)
 *
 * Keeps the same Scout interface so orchestrator.ts is unchanged.
 */

import { invokeLLM, invokeVertexGrounding } from "../llm";
import type { Scout, ScoutContext, IntelItem, IntelItemType } from "./types";

const ALLOWED: Set<IntelItemType> = new Set([
  "competitor_news",
  "trending_topic",
  "social_trend",
]);

// ─── helpers ────────────────────────────────────────────────────────────────

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function buildPrompts(ctx: ScoutContext) {
  const { brandName, industry, keywords, competitors, industryTags, days, limit } = ctx;

  const system =
    "You are a marketing intel agent. Given a brand's watchlist, fetch RECENT real news/trend/social items " +
    "from the open web. Prefer items within the last " + days + " days. " +
    "Return ONLY a JSON object: {\"items\":[{\"type\":\"competitor_news\"|\"trending_topic\"|\"social_trend\"," +
    "\"title\":string,\"content\":string (<=220 chars summary),\"source\":string (publisher/domain)," +
    "\"url\":string,\"publishedAt\":\"YYYY-MM-DD\" or ISO,\"relevanceScore\":0..1}]}. " +
    "Rules: no duplicate titles; each item must cite a real URL; content must reflect the article, not filler. " +
    "Mix types — aim ~50% competitor_news, ~30% trending_topic, ~20% social_trend. Cap at " + limit + " items.";

  const userMsg = [
    brandName ? `【Brand】${brandName}` : "",
    industry ? `【Industry】${industry}` : "",
    competitors?.length ? `【Competitors to watch】${competitors.join(", ")}` : "",
    keywords?.length ? `【Keywords】${keywords.join(", ")}` : "",
    industryTags?.length ? `【Industry tags】${industryTags.join(", ")}` : "",
    `【Recency】past ${days} days`,
    `【Target】${limit} items`,
  ].filter(Boolean).join("\n");

  return { system, userMsg };
}

/** Extract the outermost JSON object or array, ignoring trailing non-JSON text. */
function extractJsonStr(raw: string): string {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const first = s.search(/[{\[]/);
  if (first === -1) return s;
  const open = s[first] as string;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = first; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  return s.slice(first); // unclosed — best effort
}

function parseItems(raw: string, limit: number, scoutId: string): IntelItem[] {
  const cleaned = extractJsonStr(raw);
  const parsed = JSON.parse(cleaned);
  const items = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);

  return (items as any[])
    .filter((x) => x && typeof x === "object" && ALLOWED.has(x.type) && typeof x.title === "string")
    .slice(0, limit)
    .map((x: any, idx: number) => ({
      key: `${scoutId}:${hashish((x.url as string) || (x.title as string))}-${idx}`,
      type: x.type,
      title: String(x.title).slice(0, 240),
      content: String(x.content ?? "").slice(0, 600),
      source: String(x.source ?? "").slice(0, 120) || "web",
      url: typeof x.url === "string" ? x.url.slice(0, 500) : undefined,
      publishedAt: typeof x.publishedAt === "string" ? x.publishedAt : undefined,
      relevanceScore: typeof x.relevanceScore === "number"
        ? Math.max(0, Math.min(1, x.relevanceScore))
        : 0.6,
      scoutId,
    }));
}

// ─── Provider 1: Gemini 2.0 Flash + Google Search grounding ─────────────────

async function fetchViaGemini(ctx: ScoutContext): Promise<IntelItem[]> {
  const geminiKey =
    (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "").trim();
  if (!geminiKey) throw new Error("no gemini key");

  const { system, userMsg } = buildPrompts(ctx);

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    tools: [{ google_search: {} }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2400 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const json = await res.json() as any;
  const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!raw.trim()) throw new Error("Gemini empty response");

  return parseItems(raw, ctx.limit, "gemini-search");
}

// ─── Provider 2: Tavily ──────────────────────────────────────────────────────

async function fetchViaTavily(ctx: ScoutContext): Promise<IntelItem[]> {
  const tavilyKey = (process.env.TAVILY_API_KEY ?? "").trim();
  if (!tavilyKey) throw new Error("no tavily key");

  const { brandName, industry, keywords, competitors, days } = ctx;
  const q = [brandName, industry, ...(keywords ?? []), ...(competitors ?? [])]
    .filter(Boolean).slice(0, 6).join(" ");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: q,
      search_depth: "advanced",
      include_answer: true,
      max_results: Math.min(ctx.limit * 2, 20),
      days,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);

  const json = await res.json() as any;
  const results: any[] = json?.results ?? [];

  return results.slice(0, ctx.limit).map((r: any, idx: number) => ({
    key: `tavily:${hashish(r.url ?? r.title ?? String(idx))}-${idx}`,
    type: "trending_topic" as IntelItemType,
    title: String(r.title ?? "").slice(0, 240),
    content: String(r.content ?? r.snippet ?? "").slice(0, 600),
    source: String(r.url ?? "").replace(/^https?:\/\//, "").split("/")[0] || "web",
    url: typeof r.url === "string" ? r.url.slice(0, 500) : undefined,
    publishedAt: typeof r.published_date === "string" ? r.published_date : undefined,
    relevanceScore: typeof r.score === "number" ? Math.min(1, r.score) : 0.55,
    scoutId: "tavily",
  }));
}

// ─── Provider 3: Azure Foundry (LLM knowledge fallback) ─────────────────────

const AZURE_SCOUT_TIMEOUT_MS = 8_000; // fail fast — scout is best-effort

async function fetchViaAzure(ctx: ScoutContext): Promise<IntelItem[]> {
  const { system, userMsg } = buildPrompts(ctx);

  const llmPromise = invokeLLM({
    provider: "azure-foundry",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
    maxTokens: 2400,
    responseFormat: { type: "json_object" },
  } as any);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Azure scout timeout after ${AZURE_SCOUT_TIMEOUT_MS}ms`)), AZURE_SCOUT_TIMEOUT_MS),
  );

  const result = await Promise.race([llmPromise, timeoutPromise]);

  const rawContent = (result as any)?.choices?.[0]?.message?.content;
  const raw = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
      : "";
  if (!raw.trim()) throw new Error("Azure empty response");

  return parseItems(raw, ctx.limit, "azure-foundry");
}

// ─── Scout export ────────────────────────────────────────────────────────────

export const perplexityScout: Scout = {
  id: "perplexity",
  label: "Web 市調 (Gemini/Tavily)",
  tier: "free",

  async isAvailable(): Promise<boolean> {
    return (
      !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_VERTEX_TOKEN) ||
      !!(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY) ||
      !!process.env.TAVILY_API_KEY
    );
  },

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    // 0. Vertex AI Grounding (Google Search via Vertex AI)
    const hasVertexCreds = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_VERTEX_TOKEN);
    if (hasVertexCreds) {
      try {
        const { brandName, industry, keywords, competitors, days, limit } = ctx;
        const q = [
          `【品牌】${brandName ?? ""}`, `【產業】${industry ?? ""}`,
          competitors?.length ? `【競品】${competitors.join(", ")}` : "",
          keywords?.length ? `【關鍵字】${keywords.join(", ")}` : "",
          `近 ${days} 天的最新新聞、趨勢、社群話題。產出 ${limit} 筆 JSON: {"items":[{"type":"competitor_news"|"trending_topic"|"social_trend","title":string,"content":string,"source":string,"url":string,"publishedAt":string,"relevanceScore":number}]}`,
        ].filter(Boolean).join("\n");

        const raw = await invokeVertexGrounding({
          query: q,
          system: "你是行銷市調 agent。只輸出 JSON，不要前言。",
          maxOutputTokens: 2400,
        });
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        const items = parseItems(cleaned, limit, "vertex-grounding");
        if (items.length > 0) {
          console.log("[perplexityScout] Vertex Grounding OK, items:", items.length);
          return items;
        }
      } catch (e) {
        console.warn("[perplexityScout] Vertex Grounding failed:", (e as Error).message);
      }
    }

    // 1. Gemini + Google Search grounding
    try {
      const items = await fetchViaGemini(ctx);
      if (items.length > 0) return items;
    } catch (e) {
      console.warn("[perplexityScout] Gemini failed:", (e as Error).message);
    }

    // 2. Tavily
    try {
      const items = await fetchViaTavily(ctx);
      if (items.length > 0) return items;
    } catch (e) {
      console.warn("[perplexityScout] Tavily failed:", (e as Error).message);
    }

    // 3. Perplexity — DISABLED: all 5 keys quota-exhausted (probed 2026-05-04, all 401)
    // Re-enable by uncommenting when new keys available.

    // 4. Qwen/Zhipu/Azure Foundry via invokeLLM (knowledge-only, no live web)
    try {
      const items = await fetchViaAzure(ctx);
      if (items.length > 0) return items;
    } catch (e) {
      console.warn("[perplexityScout] Azure fallback failed:", (e as Error).message);
    }

    return [];
  },
};
