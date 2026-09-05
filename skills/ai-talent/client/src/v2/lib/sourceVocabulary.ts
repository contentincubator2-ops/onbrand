/**
 * sourceVocabulary — 任務卡「結構來源」的顯示名與識別色的唯一轉換點。
 *
 * 2026-09-05 (CJ「這個分類，要很明顯呈現在每一個用戶的前台」)
 *
 * ── 分工，與 tierVocabulary 同一套 ─────────────────────────────────────
 *
 *   · server/_core/taskSource.ts ＝ 識別碼（type）。跟著卡片存、跟著 API 走，
 *     永不改名。
 *   · 這份 ＝ 顯示名、說明與顏色。文案隨時可以改，而且只改這一個地方。
 *
 * client 不 import server（跨邊界規則），所以這裡自己宣告一份同名 union；
 * sourceVocabulary.test.ts 會比對 server 那份，兩邊漂了就紅。
 *
 * ── 為什麼要出前台 ─────────────────────────────────────────────────────
 *
 * 用戶現在看到的是「FB 短貼文」，看不到它憑什麼這樣寫。競爭者也有 FB 短貼文，
 * 所以那四個字不構成任何差異。
 *
 * 「FB 短貼文 · 結構參考 Bellroy 差異圖解」就構成差異 —— 而且那一行字，
 * 通用工具寫不出來，因為他們沒有人去拆過。
 *
 * 所以 pill 上真正在賣的不是分類，是 `short` 那個具體出處。分類只是讓
 * 出處有地方掛。evergreen 沒有出處，pill 就只顯示分類，這是誠實的預設值。
 */

/** 與 server/_core/taskSource.ts 的 TaskSourceType 同步。 */
export type TaskSourceType =
  | "evergreen"
  | "viral"
  | "award"
  | "benchmark"
  | "brand-method"
  | "channel-spec";

export interface TaskSource {
  type: TaskSourceType;
  short?: string;
  takeaway?: string;
}

export interface SourceVocabEntry {
  /** 短版 —— pill 上的字，越短越好 */
  zh: string;
  en: string;
  /** 長版 —— 篩選列與說明用 */
  zhLong: string;
  enLong: string;
  /** 一句話解釋這一類憑什麼可信 */
  zhWhy: string;
  enWhy: string;
  accent: string;
}

export const SOURCE_VOCAB: Record<TaskSourceType, SourceVocabEntry> = {
  evergreen: {
    zh: "長青公式", en: "Evergreen",
    zhLong: "長青公式", enLong: "Evergreen formula",
    zhWhy: "平台通則，長期可複用的基本結構。",
    enWhy: "Platform fundamentals that stay valid.",
    accent: "#64748B",
  },
  viral: {
    zh: "爆款結構", en: "Viral",
    zhLong: "爆款結構", enLong: "Viral structure",
    zhWhy: "從真實高表現帳號逐則拆解。會過期，每月更新。",
    enWhy: "Reverse-engineered from real high-performing accounts. Refreshed monthly.",
    accent: "#E11D48",
  },
  award: {
    zh: "得獎案例", en: "Award",
    zhLong: "得獎案例結構", enLong: "Award-winning structure",
    zhWhy: "從廣告獎作品拆解出的敘事機制。",
    enWhy: "Narrative mechanics taken from award-winning work.",
    accent: "#B45309",
  },
  benchmark: {
    zh: "標竿品牌", en: "Benchmark",
    zhLong: "標竿品牌結構", enLong: "Benchmark brand structure",
    zhWhy: "從國際品牌公開的內容資產拆解出的寫法。",
    enWhy: "Drawn from how benchmark brands actually write.",
    accent: "#4F46E5",
  },
  "brand-method": {
    zh: "品牌方法論", en: "Brand method",
    zhLong: "你的品牌方法論", enLong: "Your brand's own method",
    zhWhy: "從你自己的方法論長出來的卡，只有你有。",
    enWhy: "Built from your own methodology. Yours alone.",
    accent: "#0F766E",
  },
  "channel-spec": {
    zh: "通路規格", en: "Channel spec",
    zhLong: "通路規格遵循", enLong: "Channel specification",
    zhWhy: "平台欄位與規格遵循，不是創意結構。",
    enWhy: "Platform field and spec compliance, not creative structure.",
    accent: "#475569",
  },
};

/** 篩選列的顯示順序 —— 由弱到強，「你的」放最後最顯眼。 */
export const SOURCE_ORDER: readonly TaskSourceType[] = [
  "evergreen", "benchmark", "award", "viral", "channel-spec", "brand-method",
] as const;

const isKnown = (t: unknown): t is TaskSourceType =>
  typeof t === "string" && t in SOURCE_VOCAB;

/** 拿不到或不認得的一律當長青公式 —— 前台永遠有東西可以顯示。 */
export function resolveSource(s: unknown): TaskSource {
  const t = (s as any)?.type;
  if (!isKnown(t)) return { type: "evergreen" };
  return {
    type: t,
    short: typeof (s as any).short === "string" ? (s as any).short : undefined,
    takeaway: typeof (s as any).takeaway === "string" ? (s as any).takeaway : undefined,
  };
}

export function sourceLabel(t: unknown, lang: string, opt?: { long?: boolean }): string {
  const e = SOURCE_VOCAB[isKnown(t) ? t : "evergreen"];
  const en = lang === "en";
  return opt?.long ? (en ? e.enLong : e.zhLong) : (en ? e.en : e.zh);
}

export function sourceWhy(t: unknown, lang: string): string {
  const e = SOURCE_VOCAB[isKnown(t) ? t : "evergreen"];
  return lang === "en" ? e.enWhy : e.zhWhy;
}

export function sourceAccent(t: unknown): string {
  return SOURCE_VOCAB[isKnown(t) ? t : "evergreen"].accent;
}

/**
 * pill 上實際印的字。有具體出處就印出處 —— 那才是賣點；
 * 沒有就退回分類名。
 */
export function sourcePillText(s: unknown, lang: string): string {
  const r = resolveSource(s);
  if (r.short && r.short.trim()) return r.short.trim();
  return sourceLabel(r.type, lang);
}
