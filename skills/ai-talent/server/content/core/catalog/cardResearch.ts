/**
 * cardResearch — 自建任務卡「每次寫文案時」主動上網找與當次主題相關的案例與說法。
 *
 * 2026-10-04（CJ 實測：貼了小店家行銷手法的文章，試寫卻寫出店家裝潢，內容空洞、看不出
 * 資料哪來的。「寫範例貼文還有未來執行該任務卡的時候，應該要主動搜尋相關案例或說法的資料，
 * 補充文案本身的內容；而不是這張任務卡都侷限在特定資料來源」）。
 *
 * 所以這裡的單位是「一次執行」而不是「一張卡」：試寫與每次正式執行都以當次主題搜尋，
 * 查到的案例／說法／數據餵給寫作，來源另外附給用戶看（成品旁），卡片本身不綁固定資料。
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

async function writeQueries(args: { topic: string; cardName: string; channel: string; market: string }): Promise<string[]> {
  const fallback = [`${args.topic} ${args.cardName}`.slice(0, 120)];
  try {
    const raw = await ask(
      `替下面這次要寫的貼文主題想 2 條網路搜尋關鍵字，目的是找「可以充實這篇內容的真實案例、說法、數據、做法」。
關鍵字用目標市場的語言（${args.market}），要具體：包含主題本身的關鍵名詞，不要只寫通路或文體。
只輸出 JSON：{"queries":["…","…"]}`,
      `貼文類型：${args.cardName}
通路：${args.channel}
這次的主題／輸入：${args.topic}`,
      400,
    );
    const q = extractJson(raw)?.queries;
    const list = (Array.isArray(q) ? q : []).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 2);
    return list.length ? list : fallback;
  } catch { return fallback; }
}

/** 餵給寫作模型的區塊。來源編號讓模型能對應，但貼文本身不放網址。 */
export function formatResearchForPrompt(refs: CardReference[]): string {
  if (refs.length === 0) return "";
  const lines = refs.map((r, i) => `[${i + 1}] ${r.title}（${r.host}）
    可引用：${r.takeaway}`).join("\n");
  return `

# 即時查到的案例與說法（本次寫作可引用，用來充實內容）
下面是系統針對這次主題剛上網查到的真實資料。請從中挑最貼近主題的案例、說法或數據，自然地織進文案
（例如「根據…的調查」「有間…的店家做法是…」），讓內容具體、有依據。
規則：
- 只能引用下列資料裡真的有的內容；不要擴寫、不要加料、不要把數字或案例改成別的樣子。
- 文案裡不要放網址或編號 [n]；需要時用出處名稱帶過即可。
- 資料與主題無關的就不要硬用；資料以外的事實（店家細節、價格、地點）仍只能來自使用者輸入與品牌資料，沒有就不寫。
${lines}
`;
}

export async function researchTopic(args: {
  topic: string; cardName: string; channel: string; market?: string;
}): Promise<ResearchResult> {
  const topic = args.topic.trim().slice(0, 300);
  if (topic.length < 2) return { references: [], note: null };
  const market = args.market || "zh-TW";
  const queries = await writeQueries({ topic, cardName: args.cardName, channel: args.channel, market });

  let hits: RawHit[] = [];
  const errors: string[] = [];
  const settled = await Promise.allSettled(queries.map((q) => tavilySearch(q)));
  for (const s of settled) {
    if (s.status === "fulfilled") hits.push(...s.value); else errors.push(String(s.reason?.message ?? s.reason));
  }
  if (hits.length === 0) {
    const g = await Promise.allSettled(queries.map((q) => geminiSearch(q)));
    for (const s of g) {
      if (s.status === "fulfilled") hits.push(...s.value); else errors.push(String(s.reason?.message ?? s.reason));
    }
  }
  hits = dedupeHits(hits).slice(0, 16);

  if (hits.length === 0) {
    const noKey = errors.length > 0 && errors.every((e) => /no (tavily|gemini) key/.test(e));
    return {
      references: [],
      note: noKey
        ? "系統目前沒有可用的搜尋服務，這次文案沒有附上外部資料。"
        : "這次沒有搜尋到可查證的相關資料，文案只依你的輸入與品牌資料寫成（不會用沒有出處的內容充數）。",
    };
  }

  const list = hits.map((h, i) => `[${i + 1}] ${h.title}
網址：${h.url}
內文摘錄：${h.content.slice(0, 600)}`).join("\n\n");
  let picked: CardReference[] = [];
  try {
    const raw = await ask(
      `下面是搜尋結果，編號 [n]。我們要寫一篇「${args.cardName}」（${args.channel}），主題是「${topic}」。
請挑出最能**充實這篇文案內容**的來源：有具體案例、說法、數據、做法，且和主題直接相關；來源要可信
（媒體、官方、專業機構優先；內容農場、廣告頁、純商品頁不要）。最多 ${MAX_REFERENCES} 筆，沒有夠好的就少挑或不挑。
每筆寫 takeaway：這個來源裡**可以引用的具體案例／說法／數據**，1~2 句；**只能依該筆「內文摘錄」寫**，摘錄沒有的不要補。
你只回編號，不要寫網址。只輸出 JSON：{"picks":[{"n":2,"takeaway":"…"}]}`,
      list, 2000,
    );
    picked = pickReferences(raw, hits);
  } catch (e) {
    console.warn("[cardResearch] 挑選失敗：", String((e as any)?.message ?? e).slice(0, 200));
  }
  if (picked.length === 0) {
    return { references: [], note: "搜尋到了網頁，但沒有一筆夠具體、夠相關，所以沒有附上。" };
  }
  return { references: picked, note: null };
}
