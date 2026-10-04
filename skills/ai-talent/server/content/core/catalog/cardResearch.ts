/**
 * cardResearch — 自建任務卡建卡時，AI 自己上網找「可查證的資料來源」。
 *
 * 2026-10-04（CJ 實測：貼了小店家行銷手法的文章，試寫卻寫出店家裝潢，而且看不出資料
 * 哪來的；「我是要 AI 直接自己去找資料來源，蒐集可查證的資料來源後，附給用戶看」）。
 *
 * ── 絕不編造 ────────────────────────────────────────────────────────────
 * 沿用 postFormatScout 的規矩：
 *   · 網址只來自搜尋服務實際回傳的結果。模型只能用「編號」挑結果、寫重點，**不能自己寫網址**
 *     —— 讓模型寫 URL 就是讓它編 URL。
 *   · 要點只能依該筆搜尋結果的內文摘錄，不能憑印象補。
 *   · 沒有搜尋金鑰、搜尋失敗、沒有結果 → 回空陣列並說明原因；**不退回無搜尋的模型知識**。
 *     知識模式答得出東西，但那些「來源」是編的，比沒有更糟。
 */
import { invokeLLM } from "../../../platform/core/llm/llm";

export interface CardReference {
  title: string;
  url: string;
  /** 網址的網域，給用戶一眼看出出處。 */
  host: string;
  /** 這個來源說了什麼（依搜尋結果摘錄整理，非模型印象）。 */
  takeaway: string;
  retrievedAt: string;
}

export interface ResearchResult {
  references: CardReference[];
  /** 沒找到或沒搜的原因，給 UI 誠實顯示。有 references 時為 null。 */
  note: string | null;
}

export interface RawHit { title: string; url: string; content: string }

export const MAX_REFERENCES = 6;

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function cleanHttpUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return null;
  return hostOf(s) ? s : null;
}

/** 同網址（忽略 hash／結尾斜線）只留一筆。 */
export function dedupeHits(hits: RawHit[]): RawHit[] {
  const seen = new Set<string>();
  const out: RawHit[] = [];
  for (const h of hits) {
    const url = cleanHttpUrl(h.url);
    if (!url) continue;
    const key = url.replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: String(h.title ?? "").trim() || hostOf(url), url, content: String(h.content ?? "").trim() });
  }
  return out;
}

function extractJson(raw: string): any {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const a = s.search(/[{[]/);
  if (a < 0) throw new Error("no json");
  const open = s[a]!, close = open === "{" ? "}" : "]";
  const b = s.lastIndexOf(close);
  if (b <= a) throw new Error("no json");
  return JSON.parse(s.slice(a, b + 1));
}

/**
 * 模型回 {"picks":[{"n":2,"takeaway":"…"}]}，n 是搜尋結果編號。
 * 編號不存在、重複、沒有要點的丟掉；網址一律從 hits 取，不看模型寫了什麼。
 */
export function pickReferences(raw: string, hits: RawHit[], now = new Date().toISOString()): CardReference[] {
  let list: any[] = [];
  try {
    const parsed = extractJson(raw);
    list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.picks) ? parsed.picks : [];
  } catch { return []; }
  const used = new Set<number>();
  const out: CardReference[] = [];
  for (const p of list) {
    const n = Number(p?.n);
    if (!Number.isInteger(n) || n < 1 || n > hits.length || used.has(n)) continue;
    const takeaway = String(p?.takeaway ?? "").trim().slice(0, 400);
    if (takeaway.length < 10) continue;
    used.add(n);
    const h = hits[n - 1]!;
    out.push({ title: h.title.slice(0, 200), url: h.url, host: hostOf(h.url), takeaway, retrievedAt: now });
    if (out.length >= MAX_REFERENCES) break;
  }
  return out;
}

// ─── 搜尋 ───────────────────────────────────────────────────────────────────

async function tavilySearch(query: string): Promise<RawHit[]> {
  const key = (process.env.TAVILY_API_KEY ?? process.env.TAVILY_API_KEY_1 ?? "").trim();
  if (!key) throw new Error("no tavily key");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 8 }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const json = await res.json() as any;
  return (json?.results ?? []).map((r: any) => ({
    title: String(r.title ?? ""), url: String(r.url ?? ""), content: String(r.content ?? r.snippet ?? ""),
  }));
}

/**
 * Gemini + Google 搜尋。回傳文字是模型寫的，但 groundingMetadata 的 chunk 是搜尋實際引用的
 * 頁面；我們只收「網域出現在 chunk 裡」的網址，編出來的網址對不上就丟。
 */
async function geminiSearch(query: string): Promise<RawHit[]> {
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "").trim();
  if (!key) throw new Error("no gemini key");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text:
          "你是研究助理。用搜尋找出和問題直接相關、內容具體的公開文章。只輸出 JSON：" +
          '{"items":[{"title":string,"url":string,"summary":string(依該頁內容寫，<=200字)}]}。' +
          "每筆必須是搜尋實際看到的真實網址；找不到就回空陣列，不要為了湊數而編。" }] },
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(40_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json() as any;
  const cand = json?.candidates?.[0];
  const text: string = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  const chunkHosts = new Set<string>(
    (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: any) => String(c?.web?.title ?? "").toLowerCase().replace(/^www\./, ""))
      .filter(Boolean),
  );
  if (chunkHosts.size === 0) return [];
  let items: any[] = [];
  try { const p = extractJson(text); items = Array.isArray(p) ? p : (p?.items ?? []); } catch { return []; }
  return items
    .map((it) => ({ title: String(it?.title ?? ""), url: String(it?.url ?? ""), content: String(it?.summary ?? "") }))
    .filter((h) => {
      const host = hostOf(h.url);
      return host && [...chunkHosts].some((c) => host === c || host.endsWith(`.${c}`) || c.endsWith(`.${host}`));
    });
}

async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const r = await Promise.race([
    invokeLLM({ messages: [{ role: "system", content: system }, { role: "user", content: user }], maxTokens }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 60_000)),
  ]);
  const c = r.choices[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

async function writeQueries(args: { name: string; channel: string; primaryQuestion: string; gist: string; market: string }): Promise<string[]> {
  const fallback = [`${args.name} ${args.channel} ${args.primaryQuestion}`.slice(0, 120)];
  try {
    const raw = await ask(
      `替一張寫作任務卡想 2 到 3 條網路搜尋關鍵字，目的是找「做這類內容的可查證做法、案例、數據」的文章。
關鍵字用目標市場的語言（${args.market}）。要具體（含通路與內容類型），不要只寫品牌或商品名。
只輸出 JSON：{"queries":["…","…"]}`,
      `任務卡：${args.name}\n通路：${args.channel}\n每次會問用戶：${args.primaryQuestion}\n範例開頭：${args.gist}`,
      400,
    );
    const q = extractJson(raw)?.queries;
    const list = (Array.isArray(q) ? q : []).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 3);
    return list.length ? list : fallback;
  } catch { return fallback; }
}

export async function researchCardSources(args: {
  name: string; channel: string; primaryQuestion: string; samples: string[]; market?: string;
}): Promise<ResearchResult> {
  const market = args.market || "zh-TW";
  const queries = await writeQueries({
    name: args.name, channel: args.channel, primaryQuestion: args.primaryQuestion,
    gist: (args.samples[0] ?? "").slice(0, 200), market,
  });

  let hits: RawHit[] = [];
  const errors: string[] = [];
  const settled = await Promise.allSettled(queries.map((q) => tavilySearch(q)));
  for (const s of settled) {
    if (s.status === "fulfilled") hits.push(...s.value); else errors.push(String(s.reason?.message ?? s.reason));
  }
  if (hits.length === 0) {
    const g = await Promise.allSettled(queries.slice(0, 2).map((q) => geminiSearch(q)));
    for (const s of g) {
      if (s.status === "fulfilled") hits.push(...s.value); else errors.push(String(s.reason?.message ?? s.reason));
    }
  }
  hits = dedupeHits(hits).slice(0, 20);

  if (hits.length === 0) {
    const noKey = errors.length > 0 && errors.every((e) => /no (tavily|gemini) key/.test(e));
    return {
      references: [],
      note: noKey
        ? "系統目前沒有可用的搜尋服務，沒有附上資料來源。"
        : "這次沒有搜尋到可查證的資料來源，所以沒有附上（不會用沒有出處的內容充數）。",
    };
  }

  const list = hits.map((h, i) => `[${i + 1}] ${h.title}\n網址：${h.url}\n內文摘錄：${h.content.slice(0, 500)}`).join("\n\n");
  let picked: CardReference[] = [];
  try {
    const raw = await ask(
      `下面是搜尋結果，編號 [n]。我們在做一張「${args.name}」（${args.channel}）寫作任務卡，要挑出最能當**依據**的來源。
挑選條件：內容具體（有做法、案例、數據）、和這類內容直接相關、來源看起來可信（媒體、官方、專業機構優先；內容農場、廣告頁、純商品頁不要）。
最多挑 ${MAX_REFERENCES} 筆。每筆寫 takeaway：這個來源說了什麼可用的重點，1~2 句，**只能依該筆「內文摘錄」寫**，摘錄沒有的不要補。
你只回編號，不要寫網址。只輸出 JSON：{"picks":[{"n":2,"takeaway":"…"}]}`,
      list, 2000,
    );
    picked = pickReferences(raw, hits);
  } catch (e) {
    console.warn("[cardResearch] 挑選失敗：", String((e as any)?.message ?? e).slice(0, 200));
  }
  if (picked.length === 0) {
    return { references: [], note: "搜尋到了網頁，但沒有一筆夠具體可以當依據，所以沒有附上。" };
  }
  return { references: picked, note: null };
}
