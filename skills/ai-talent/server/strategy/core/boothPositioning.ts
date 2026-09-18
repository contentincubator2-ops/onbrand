/**
 * boothPositioning — 小定位：直接把官網內容摘要成定位。
 *
 * 2026-09-19 (CJ「我們跑小定位，也就是直接根據她官網的內容，摘要成定位就好」)：
 * 展場上訪客給公司名和網址，我們要在一個對話回合內回他一句像樣的定位。完整的
 * 14 步 `startPositioningJob` 要跑幾分鐘，`generateInterimPulse` 要先叫
 * Perplexity（5-8 秒，而且要錢）。這支兩個都不用：爬站 → 一次 LLM → 寫檔。
 *
 * ── 為什麼只填五個 segment ────────────────────────────────────────────
 * 官網撐得起 goldenCircle / tagline / audience / differentiation / voice，
 * 撐不起 competition / trends / taglineScore / origin / values —— 那些要外部
 * 研究，不是讀一個網站能讀出來的。所以那五個**刻意留空**，不是還沒做：
 * 硬填等於編造競品，而編造的競品分析比沒有更糟。留空同時也是最好的升級說詞：
 * 「競品跟趨勢要跑完整版，那是付費版在做的事。」
 *
 * 沿用 positioningSteps 的紀律：模型給了空殼就不寫，寧可少一個 segment，
 * 也不要讓客戶在定位頁上看到一張空卡。
 */
import localPool from "../../localDb";
import { invokeLLM } from "../../platform/core/llm";
import { crawlWebsite } from "./productDiscovery";

/** 官網讀得出來的五個。其餘 segment 要外部研究，展場模式不碰。 */
export const BOOTH_SEGMENTS = ["goldenCircle", "tagline", "audience", "differentiation", "voice"] as const;
export type BoothSegment = (typeof BOOTH_SEGMENTS)[number];

/** 要外部研究才寫得出來的，留給完整版。 */
export const PAID_ONLY_SEGMENTS = ["competition", "trends", "taglineScore", "origin", "values"] as const;

export interface BoothPositioningResult {
  /** 真的寫進去的 segment id。 */
  filled: BoothSegment[];
  /** 模型交白卷、我們拒絕寫的。 */
  thin: BoothSegment[];
  /** bot 可以直接唸出來的一句話。 */
  pulse: string;
  tagline: string | null;
  crawledChars: number;
  model: string;
  latencyMs: number;
}

export class SiteUnreadableError extends Error {
  constructor(public readonly website: string) {
    super(`crawl returned too little text from ${website}`);
    this.name = "SiteUnreadableError";
  }
}

/** 一個 segment 至少要有這些欄位有東西，才算不是空殼。 */
const REQUIRED_FIELDS: Record<BoothSegment, string[]> = {
  goldenCircle: ["why", "how", "what"],
  tagline: ["zhTagline", "enTagline"],
  audience: ["primary"],
  differentiation: ["summary"],
  voice: ["tone"],
};

function hasSubstance(segment: BoothSegment, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  // tagline 允許中英擇一 —— 英文站沒有中文標語是正常的，不是交白卷。
  const needed = REQUIRED_FIELDS[segment];
  const filled = needed.filter((k) => {
    const v = obj[k];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.trim().length >= 4;
  });
  return segment === "tagline" ? filled.length >= 1 : filled.length === needed.length;
}

/**
 * 從模型回來的物件裡挑出「真的有東西」的 segment。空殼一律不寫——定位頁上
 * 一張空卡比少一張卡糟得多，而且不在 BOOTH_SEGMENTS 裡的一律丟掉，免得模型
 * 自作主張生出 competition。
 */
export function pickSegments(parsed: Record<string, unknown>): {
  patch: Record<string, unknown>;
  filled: BoothSegment[];
  thin: BoothSegment[];
} {
  const patch: Record<string, unknown> = {};
  const filled: BoothSegment[] = [];
  const thin: BoothSegment[] = [];
  for (const id of BOOTH_SEGMENTS) {
    if (hasSubstance(id, parsed[id])) {
      patch[id] = parsed[id];
      filled.push(id);
    } else {
      thin.push(id);
    }
  }
  return { patch, filled, thin };
}

function prompt(brandName: string, website: string, pages: string, lang: "zh-TW" | "en-US"): string {
  const outputLang = lang === "en-US" ? "English" : "繁體中文";
  return `以下是「${brandName}」官網（${website}）抓下來的文字內容：

---
${pages}
---

請**只根據上面這段官網內容**，整理出這個品牌的定位。輸出 JSON 物件，鍵值固定如下：

{
  "goldenCircle": { "why": "品牌存在的信念", "how": "他們用什麼方式做到", "what": "他們實際賣什麼" },
  "tagline": { "zhTagline": "中文標語", "enTagline": "英文標語", "type": "標語類型", "scenes": ["應用場景"] },
  "audience": { "primary": "主受眾：是誰、什麼處境、想解決什麼", "secondary": "次受眾" },
  "differentiation": { "functional": "功能上的差異", "emotional": "情感上的差異", "summary": "一句話總結差異化" },
  "voice": { "archetypes": ["主原型", "次原型"], "tone": ["語調關鍵詞"], "samples": [{ "generic": "一般品牌會這樣說", "ours": "他們會這樣說" }] }
}

規則：
- 全部用${outputLang}書寫。
- **標語優先直接引用官網上真的出現過的句子**，官網沒有標語才自己下一句，並在 type 註明「（推導）」。
- voice.tone 和 voice.samples 要從官網**實際的用字**歸納，不要套用通用形容詞。samples 的 ours 要像官網會寫的句子。
- 官網沒講的就把那個欄位留成空字串，不要補。特別是：不要臆測競爭對手、不要引用官網沒有的數字、不要編造創辦故事。
- 只輸出 JSON 物件，不要任何說明文字。`;
}

/**
 * 爬官網 → 一次 LLM → 寫進 brands.positioning 的正規 segment id。
 * 爬不到東西就丟 SiteUnreadableError，讓呼叫端去問使用者要一個產品頁網址
 * （JS 商店首頁常常是空殼，IRIS 那次就是這樣）。
 */
export async function summariseSiteIntoPositioning(args: {
  brandId: number;
  userId: number;
  brandName: string;
  website: string;
  lang?: "zh-TW" | "en-US";
}): Promise<BoothPositioningResult> {
  const lang = args.lang ?? "zh-TW";
  const started = Date.now();

  const pages = await crawlWebsite(args.website);
  if (pages.trim().length < 200) throw new SiteUnreadableError(args.website);

  const result = await invokeLLM({
    provider: "anthropic",
    messages: [{ role: "user", content: prompt(args.brandName, args.website, pages, lang) }],
    maxTokens: 2500,
  });

  const text = String(result.choices?.[0]?.message?.content ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in booth positioning response");
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

  const { patch, filled, thin } = pickSegments(parsed);
  if (filled.length === 0) throw new Error("booth positioning produced nothing usable");

  // 出處標記：定位頁要能分辨「這是展場小定位」和「這是跑完整版的結果」，
  // 不然客戶會以為付費版就只有這樣。
  patch._source = {
    kind: "booth_quick",
    website: args.website,
    crawledChars: pages.length,
    at: new Date().toISOString(),
    missing: [...PAID_ONLY_SEGMENTS, ...thin],
  };

  await mergeBrandPositioning(args.brandId, args.userId, patch);

  const tag = (parsed.tagline ?? {}) as Record<string, string>;
  const tagline = (lang === "en-US" ? tag.enTagline : tag.zhTagline) || tag.zhTagline || tag.enTagline || null;
  const diff = (parsed.differentiation ?? {}) as Record<string, string>;

  return {
    filled,
    thin,
    pulse: [tagline, diff.summary].filter(Boolean).join(" — ") || String(diff.summary ?? ""),
    tagline,
    crawledChars: pages.length,
    model: String((result as any)?.model ?? "unknown"),
    latencyMs: Date.now() - started,
  };
}

/**
 * 跟 positioningJobRunner.mergePositioning 同樣的 top-level spread，
 * 保住 _assets / _aiPrompts / _interim 和使用者手改過的 segment。
 */
async function mergeBrandPositioning(brandId: number, userId: number, patch: Record<string, unknown>): Promise<void> {
  const { isPositioningLocked } = await import("./positioningLock");
  if (await isPositioningLocked("brand", brandId, userId)) return;

  const [rows]: any = await localPool.execute(
    `SELECT positioning AS payload FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`brand ${brandId} not found`);
  let cur: any = row.payload;
  if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
  await localPool.execute(
    `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify({ ...(cur ?? {}), ...patch }), brandId, userId],
  );
}
