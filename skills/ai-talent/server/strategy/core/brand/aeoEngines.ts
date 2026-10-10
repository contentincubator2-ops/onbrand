/**
 * aeoEngines — 拿一個顧客問題去問各家 AI 搜尋引擎，記下它查了什麼、引用了誰、有沒有提到品牌。
 *
 * 2026-10-10（CJ「可以使用 github secret 裡面的不同 API KEY 進行比對」「在策略面的 AI 搜尋，
 * 應該是會顯示出不同顧客問題中，不同 AI 的搜尋結果」）。
 *
 * 我們看不到別人問了 AI 什麼（沒有任何一家公開），但可以自己拿同一個問題去問，看它的行為：
 *   queries   它把問題拆成哪些檢索詞去查（Claude、Gemini 會回；OpenAI 多半照搬原句）
 *   related   Google「其他人也問了」＋相關搜尋——這是唯一由真人問出來的問題
 *   domains   它引用了哪些網站
 *   mentioned 回答或引用裡有沒有出現品牌
 *
 * 五個來源：Perplexity、ChatGPT（OpenAI 網路搜尋）、Gemini（Google 搜尋接地）、Claude（網路搜尋）、
 * Google（SerpApi：搜尋結果頁與 AI 摘要）。回應格式都在 2026-10-10 用真的金鑰實測過
 * （.github/workflows/op-probe-ai-search-engines.yml）。
 *
 * 金鑰：各家可以放好幾把（逗號分隔），第一把沒額度就換下一把——實測 Claude 八把裡前六把沒額度。
 * 沒設金鑰的來源回 status="unconfigured"，不算失敗。
 *
 * 每次問的結果會有波動；這裡只記「這一次看到的」，不做統計上的保證。
 */

export const AEO_ENGINES = ["google", "chatgpt", "gemini", "claude", "perplexity"] as const;
export type AeoEngine = (typeof AEO_ENGINES)[number];

export const AEO_ENGINE_LABEL: Record<AeoEngine, { zh: string; en: string }> = {
  google: { zh: "Google 搜尋與 AI 摘要", en: "Google Search & AI Overview" },
  chatgpt: { zh: "ChatGPT", en: "ChatGPT" },
  gemini: { zh: "Gemini", en: "Gemini" },
  claude: { zh: "Claude", en: "Claude" },
  perplexity: { zh: "Perplexity", en: "Perplexity" },
};

export interface AeoEngineResult {
  engine: AeoEngine;
  status: "ok" | "failed" | "unconfigured";
  error?: string;
  /** 回答或引用裡有沒有出現品牌。 */
  mentioned: boolean;
  /** 它查的檢索詞。 */
  queries: string[];
  /** 其他人也問了／相關搜尋（只有 Google 有）。 */
  related: string[];
  /** 引用的網域，照出現順序、不重複。 */
  domains: string[];
  /** 回答開頭（給人掃一眼用）。 */
  excerpt: string;
}

// ── 純函式 ───────────────────────────────────────────────────────────────

const uniq = (a: Array<string | null | undefined>) => [...new Set(a.map((x) => String(x ?? "").trim()).filter(Boolean))];

export function domainOf(urlOrTitle: string): string {
  const s = String(urlOrTitle ?? "").trim();
  try { return new URL(s).hostname.replace(/^www\./, "").toLowerCase(); } catch { return s.replace(/^www\./, "").toLowerCase().slice(0, 80); }
}

/**
 * 品牌的辨識字串：品牌名本身，加上官網網域（去掉 www 與頂級網域）。
 * 太短的（少於 3 個英數字或 2 個中文字）不用——「AI」「on」這種會到處誤判。
 */
export function brandTermsOf(brandName: string | null | undefined, website?: string | null): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const v = t.trim().toLowerCase();
    if (!v) return;
    const cjk = /[㐀-鿿]/.test(v);
    if ((cjk && [...v].length >= 2) || (!cjk && v.replace(/[^a-z0-9]/g, "").length >= 3)) out.push(v);
  };
  push(String(brandName ?? ""));
  if (website) {
    const host = domainOf(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    push(host);
    push(host.split(".")[0] ?? "");
  }
  return [...new Set(out)];
}

export function mentionsBrand(texts: Array<string | null | undefined>, terms: string[]): boolean {
  if (!terms.length) return false;
  const hay = texts.map((t) => String(t ?? "").toLowerCase()).join("\n");
  return terms.some((t) => hay.includes(t));
}

const excerptOf = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 280);

type Parsed = Pick<AeoEngineResult, "queries" | "related" | "domains" | "excerpt"> & { text: string; cites: string[] };
const done = (text: string, cites: string[], queries: string[] = [], related: string[] = []): Parsed => ({
  text, cites, queries: uniq(queries).slice(0, 8), related: uniq(related).slice(0, 12),
  domains: uniq(cites.map(domainOf)).slice(0, 15), excerpt: excerptOf(text),
});

export function parsePerplexity(d: any): Parsed {
  const cites: string[] = (Array.isArray(d?.search_results) ? d.search_results.map((s: any) => s?.url) : null) ?? d?.citations ?? [];
  return done(d?.choices?.[0]?.message?.content ?? "", cites, [], d?.related_questions ?? []);
}

export function parseOpenAi(d: any, question: string): Parsed {
  const out: any[] = d?.output ?? [];
  const queries = out.filter((o) => o?.type === "web_search_call")
    .flatMap((o) => o?.action?.queries ?? (o?.action?.query ? [o.action.query] : []))
    // 它常常把原句照搬當檢索詞——那不是「它怎麼拆問題」，不列。
    .filter((q: string) => String(q).trim() !== question.trim());
  const parts = out.filter((o) => o?.type === "message").flatMap((o) => o?.content ?? []);
  const cites = parts.flatMap((c: any) => (c?.annotations ?? []).filter((a: any) => a?.type === "url_citation").map((a: any) => a.url));
  return done(parts.map((c: any) => c?.text ?? "").join("\n"), cites, queries);
}

export function parseGemini(d: any): Parsed {
  const c = d?.candidates?.[0] ?? {};
  const g = c?.groundingMetadata ?? {};
  // 接地來源的網址是 Google 的轉址，真正的網域在 title。
  const cites = (g?.groundingChunks ?? []).map((x: any) => x?.web?.title || x?.web?.uri);
  return done((c?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("\n"), cites, g?.webSearchQueries ?? []);
}

export function parseClaude(d: any): Parsed {
  const blocks: any[] = d?.content ?? [];
  const queries = blocks.filter((b) => b?.type === "server_tool_use").map((b) => b?.input?.query);
  const cites = blocks.filter((b) => b?.type === "web_search_tool_result")
    .flatMap((b) => (Array.isArray(b?.content) ? b.content : []).map((r: any) => r?.url));
  return done(blocks.filter((b) => b?.type === "text").map((b) => b?.text ?? "").join(""), cites, queries);
}

export function parseSerp(d: any, overview?: any): Parsed {
  const ao = overview ?? d?.ai_overview ?? null;
  const organic: any[] = (d?.organic_results ?? []).slice(0, 5);
  const aoText = ao?.text_blocks ? JSON.stringify(ao.text_blocks) : "";
  const related = [
    ...(d?.related_questions ?? []).map((x: any) => x?.question),
    ...(d?.related_searches ?? []).slice(0, 5).map((x: any) => x?.query),
  ];
  const cites = [...(ao?.references ?? []).map((x: any) => x?.link), ...organic.map((x) => x?.link)];
  const text = aoText || organic.map((x) => `${x?.title ?? ""} ${x?.snippet ?? ""}`).join("\n");
  // AI 摘要是一串結構，摘不出好讀的開頭；給前幾筆搜尋結果的標題。
  return { ...done(text, cites, [], related), excerpt: excerptOf(organic.map((x) => x?.title ?? "").join("｜")) };
}

// ── 呼叫 ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 75_000;

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  return JSON.parse(t);
}
const post = (url: string, headers: Record<string, string>, body: unknown) =>
  fetchJson(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** 這個來源的金鑰：專用的那一串（逗號分隔）優先，沒有就用 app 原本那一把。 */
export function keysFor(engine: AeoEngine, env: Record<string, string | undefined> = process.env): string[] {
  const names: Record<AeoEngine, [string, string]> = {
    perplexity: ["AEO_PERPLEXITY_KEYS", "PERPLEXITY_API_KEY"],
    chatgpt: ["AEO_OPENAI_KEYS", "OPENAI_API_KEY"],
    gemini: ["AEO_GEMINI_KEYS", "GOOGLE_AI_API_KEY"],
    claude: ["AEO_CLAUDE_KEYS", "ANTHROPIC_API_KEY"],
    google: ["AEO_SERP_KEYS", "SERP_API_KEY"],
  };
  const [multi, single] = names[engine];
  return uniq([...(env[multi] ?? "").split(","), env[single]]);
}

/** 上一次能用的是第幾把，下次先試它（行程內記憶，重啟就重來）。 */
const lastGood = new Map<AeoEngine, number>();

async function withKeys<T>(engine: AeoEngine, fn: (key: string) => Promise<T>): Promise<T> {
  const keys = keysFor(engine);
  const start = lastGood.get(engine) ?? 0;
  const order = keys.map((_, i) => (start + i) % keys.length);
  let last: unknown;
  for (const i of order) {
    try { const r = await fn(keys[i]!); lastGood.set(engine, i); return r; } catch (e) { last = e; }
  }
  throw last ?? new Error("no key");
}

const CALLERS: Record<AeoEngine, (q: string) => Promise<Parsed>> = {
  perplexity: (q) => withKeys("perplexity", async (key) => parsePerplexity(await post(
    "https://api.perplexity.ai/chat/completions", { authorization: `Bearer ${key}` },
    { model: process.env.AEO_PERPLEXITY_MODEL || "sonar", messages: [{ role: "user", content: q }], return_related_questions: true },
  ))),
  chatgpt: (q) => withKeys("chatgpt", async (key) => parseOpenAi(await post(
    "https://api.openai.com/v1/responses", { authorization: `Bearer ${key}` },
    // tool_choice=required：不強制的話它常常不上網，直接用舊知識回答（實測引用是空的）。
    { model: process.env.AEO_OPENAI_MODEL || "gpt-4.1-mini", tools: [{ type: "web_search" }], tool_choice: "required", input: q },
  ), q)),
  gemini: (q) => withKeys("gemini", async (key) => parseGemini(await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.AEO_GEMINI_MODEL || "gemini-3.8-flash"}:generateContent?key=${key}`, {},
    // 不明講要查的話，它會判斷不需要上網，接地資料整個是空的（實測）。
    { contents: [{ role: "user", parts: [{ text: `${q}\n\n請上網查最新資料再回答，並附上來源。` }] }], tools: [{ google_search: {} }] },
  ))),
  claude: (q) => withKeys("claude", async (key) => parseClaude(await post(
    "https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model: process.env.AEO_CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: q }],
    },
  ))),
  google: (q) => withKeys("google", async (key) => {
    const d = await fetchJson(`https://serpapi.com/search.json?engine=google&hl=zh-tw&gl=tw&q=${encodeURIComponent(q)}&api_key=${key}`);
    let ao = d?.ai_overview ?? null;
    // AI 摘要常常只回一個 page_token，要再打一次才拿得到內容。
    if (ao?.page_token && !ao.text_blocks) {
      ao = await fetchJson(`https://serpapi.com/search.json?engine=google_ai_overview&page_token=${encodeURIComponent(ao.page_token)}&api_key=${key}`)
        .then((x) => x?.ai_overview ?? ao).catch(() => ao);
    }
    return parseSerp(d, ao);
  }),
};

/** 錯誤訊息只留種類，不把供應商回的整段（可能帶帳號資訊）存下來。 */
export function errorKind(e: unknown): string {
  const m = String((e as any)?.message ?? e);
  if (/quota|credit|balance|insufficient|billing|429/i.test(m)) return "額度用完或被限流";
  if (/401|403|invalid.*key|unauthor/i.test(m)) return "金鑰無效";
  if (/timeout|aborted|TimeoutError/i.test(m)) return "逾時";
  if (/HTTP 4\d\d/.test(m)) return "請求被拒絕";
  if (/HTTP 5\d\d/.test(m)) return "對方服務暫時有問題";
  return "連線失敗";
}

export async function askEngine(engine: AeoEngine, question: string, brandTerms: string[]): Promise<AeoEngineResult> {
  const empty = { engine, mentioned: false, queries: [], related: [], domains: [], excerpt: "" };
  if (!keysFor(engine).length) return { ...empty, status: "unconfigured" };
  try {
    const p = await CALLERS[engine](question);
    return {
      engine, status: "ok", queries: p.queries, related: p.related, domains: p.domains, excerpt: p.excerpt,
      mentioned: mentionsBrand([p.text, ...p.cites], brandTerms),
    };
  } catch (e) {
    console.warn(`[aeoEngines] ${engine} failed: ${String((e as any)?.message ?? e).slice(0, 200)}`);
    return { ...empty, status: "failed", error: errorKind(e) };
  }
}

/** 五家一起問。一家失敗不影響其他家。 */
export async function askAllEngines(question: string, brandTerms: string[]): Promise<AeoEngineResult[]> {
  return Promise.all(AEO_ENGINES.map((e) => askEngine(e, question, brandTerms)));
}
