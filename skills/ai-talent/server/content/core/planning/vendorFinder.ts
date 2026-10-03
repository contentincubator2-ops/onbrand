/**
 * vendorFinder — 產出旁邊的「找合作對象」：用 AI 搜尋公開網頁，列出可以自己接洽的廠商。
 *
 * 2026-10-01（CJ「在網紅或臉書經營的實際產出旁邊…用 AI 幫忙查出可以合作的廠商，可以自己
 * 接洽聯繫」→「就開始做 AI 搜尋，先不做報價紀錄」）。
 *
 * ── 不編造的做法 ──────────────────────────────────────────────────────
 *   1. 先搜真的網頁（Tavily；沒有就用 Gemini + Google Search grounding 的來源清單）。
 *   2. 再請模型**只從這些搜尋結果**整理出廠商：名稱、類型、為什麼適合、官網、聯絡頁、出處。
 *   3. 伺服器逐筆檢查：官網的網域要出現在搜尋結果裡、聯絡頁與出處必須是搜尋結果裡的網址——
 *      對不上的網址丟掉，沒有出處的廠商整筆丟掉（validateVendors，純函式、有測試）。
 *   不給價格、不估報價（CJ：「AI 估算的預算可能不準」）；不抓個人聯絡資料，只列公司官網與
 *   公開的聯絡頁；系統不會替使用者聯繫任何人。畫面上標明「AI 依公開網頁搜尋，請自行確認」。
 */
import { invokeLLM } from "../../../platform/core/llm/llm";

export type VendorKind = "kol_agency" | "cobrand_partner" | "ad_agency";

export const VENDOR_KIND_LABEL: Record<VendorKind, string> = {
  kol_agency: "網紅經紀／網紅行銷公司",
  cobrand_partner: "異業合作夥伴",
  ad_agency: "數位廣告代理商",
};

export interface SearchResult { title: string; url: string; content: string }

export interface Vendor {
  name: string;
  /** 一句話：做什麼的。 */
  what: string;
  /** 為什麼適合這次。 */
  why: string;
  website: string | null;
  contactUrl: string | null;
  sources: string[];
}

const COUNTRY_ZH: Record<string, string> = { TW: "台灣", HK: "香港", SG: "新加坡", MY: "馬來西亞", JP: "日本", US: "美國" };

/** 預設的搜尋字串（使用者可以改）。純函式。 */
export function defaultVendorQuery(kind: VendorKind, ctx: {
  country?: string | null; industry?: string | null; kolTypes?: string[]; platforms?: string[]; hint?: string | null;
}): string {
  const where = COUNTRY_ZH[String(ctx.country ?? "TW").toUpperCase()] ?? "";
  if (kind === "kol_agency") {
    const types = (ctx.kolTypes ?? []).filter(Boolean).slice(0, 3).join(" ");
    const plats = (ctx.platforms ?? []).filter(Boolean).slice(0, 2).join(" ");
    return [where, types || ctx.industry || "", plats, "網紅經紀公司 網紅行銷"].filter(Boolean).join(" ");
  }
  if (kind === "cobrand_partner") {
    return [where, ctx.hint || ctx.industry || "", "品牌 異業合作 聯名"].filter(Boolean).join(" ");
  }
  return [where, ctx.industry || "", "數位廣告代理商 Meta 廣告 代操"].filter(Boolean).join(" ");
}

/** 哪一種產出找哪一種廠商：kl- 卡→網紅經紀；cb- 卡→異業合作夥伴；標了廣告的→廣告代理。 */
export function vendorKindFor(taskId: string | null | undefined, paid: boolean): VendorKind | null {
  const id = String(taskId ?? "");
  if (id.startsWith("kl-")) return "kol_agency";
  if (id.startsWith("cb-")) return "cobrand_partner";
  if (paid) return "ad_agency";
  return null;
}

const hostOf = (u: string): string | null => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h.replace(/^www\./, "");
  } catch { return null; }
};
const isHttp = (u: string) => /^https?:\/\//i.test(u);

/**
 * 模型整理出來的廠商 → 只留得到驗證的。純函式。
 *   · 官網：網域要出現在搜尋結果裡（給的網址網域對不上就清掉）。
 *   · 聯絡頁、出處：必須逐字是搜尋結果裡的網址。
 *   · 一個出處都沒有的廠商丟掉；同一個官網網域只留第一筆；最多 8 筆。
 */
export function validateVendors(raw: unknown, results: SearchResult[]): Vendor[] {
  const urls = new Set(results.map((r) => r.url));
  const hosts = new Set(results.map((r) => hostOf(r.url)).filter((h): h is string => !!h));
  const list: any[] = Array.isArray((raw as any)?.vendors) ? (raw as any).vendors : [];
  const out: Vendor[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    const name = String(v?.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const sources = (Array.isArray(v?.sources) ? v.sources : []).map(String).filter((u: string) => urls.has(u)).slice(0, 3);
    if (!sources.length) continue;
    const site = typeof v?.website === "string" && isHttp(v.website) ? v.website.trim() : "";
    const siteHost = site ? hostOf(site) : null;
    const website = siteHost && hosts.has(siteHost) ? site : null;
    const contact = typeof v?.contactUrl === "string" && urls.has(v.contactUrl) ? v.contactUrl : null;
    const key = (website ? hostOf(website) : null) ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name, website, contactUrl: contact, sources,
      what: String(v?.what ?? "").trim().slice(0, 120),
      why: String(v?.why ?? "").trim().slice(0, 160),
    });
    if (out.length >= 8) break;
  }
  return out;
}

// ─── 搜尋 ────────────────────────────────────────────────────────────

async function searchTavily(query: string): Promise<SearchResult[]> {
  const key = (process.env.TAVILY_API_KEY ?? "").trim();
  if (!key) throw new Error("no tavily key");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 12 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const json = await res.json() as any;
  return ((json?.results ?? []) as any[])
    .filter((r) => typeof r?.url === "string" && isHttp(r.url))
    .map((r) => ({ title: String(r.title ?? "").slice(0, 200), url: String(r.url).slice(0, 500), content: String(r.content ?? "").slice(0, 700) }));
}

/** Gemini + Google Search：沒有 Tavily 時用。來源取 groundingChunks（標題通常就是網域）。 */
async function searchGemini(query: string): Promise<SearchResult[]> {
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "").trim();
  if (!key) throw new Error("no gemini key");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `搜尋並列出：${query}。每一家寫公司名稱、做什麼、官網。` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json() as any;
  const text: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  const chunks: any[] = json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map((c) => {
      const title = String(c?.web?.title ?? "").trim();
      // grounding 的 uri 是轉址連結；標題通常就是網域，用它組官網。
      const url = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) ? `https://${title}` : String(c?.web?.uri ?? "");
      return { title, url, content: text.slice(0, 700) };
    })
    .filter((r) => isHttp(r.url));
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    const r = await searchTavily(query);
    if (r.length) return r;
  } catch (e) {
    console.warn("[vendorFinder] Tavily failed:", (e as Error).message);
  }
  try {
    return await searchGemini(query);
  } catch (e) {
    console.warn("[vendorFinder] Gemini failed:", (e as Error).message);
    return [];
  }
}

// ─── 整理 ────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; vendors: Vendor[] }>();
const CACHE_MS = 24 * 3600_000;

export async function findVendors(args: { kind: VendorKind; query: string; context?: string }): Promise<{ vendors: Vendor[]; searched: number }> {
  const query = args.query.trim().slice(0, 120);
  const ckey = `${args.kind}|${query}`;
  const hit = cache.get(ckey);
  if (hit && Date.now() - hit.at < CACHE_MS) return { vendors: hit.vendors, searched: -1 };

  const results = await searchWeb(query);
  if (!results.length) return { vendors: [], searched: 0 };

  const list = results.map((r, i) => `[${i + 1}] ${r.title}\n網址：${r.url}\n摘要：${r.content.replace(/\s+/g, " ").slice(0, 400)}`).join("\n\n");
  const r = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `你幫行銷人員整理「可以自己接洽的${VENDOR_KIND_LABEL[args.kind]}」。只能用下面搜尋結果裡出現的公司，不准用你自己的記憶補。
- 只列公司或品牌，不列個人、不列新聞標題本身、不列名單網站或比價網站本身（但可以列這些頁面裡提到、而且有自己網址的公司）。
- website 要用搜尋結果裡那家公司自己的網址；不確定就填空字串。contactUrl 只有搜尋結果裡真的有那家公司的聯絡頁網址才填。
- sources 填你依據的搜尋結果網址（逐字照抄）。
- 不寫價格、報價、收費。不寫聯絡人姓名、電話、Email。
- 只輸出 JSON：{"vendors":[{"name":"公司名稱","what":"做什麼（30字內）","why":"為什麼適合這次（40字內）","website":"","contactUrl":"","sources":["…"]}]}，最多 8 家。`,
      },
      { role: "user", content: `${args.context ? `【這次的需求】${args.context.slice(0, 400)}\n\n` : ""}【搜尋：${query}】\n\n${list}` },
    ],
    maxTokens: 1800,
  });
  const text = String(r.choices?.[0]?.message?.content ?? "");
  let parsed: unknown = null;
  try {
    const s = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    parsed = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  } catch { parsed = null; }
  const vendors = validateVendors(parsed, results);
  cache.set(ckey, { at: Date.now(), vendors });
  return { vendors, searched: results.length };
}
