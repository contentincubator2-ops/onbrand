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
  /** 傳播證據，只有 viral 有（server 端強制必填）。 */
  metric?: string;
  /** 這個數字量測的年月 YYYY-MM，只有 viral 有（server 端強制必填）。 */
  asOf?: string;
  /** 報導這個數字的參考文章（2025 年以後量測的爆款卡必填）。 */
  url?: string;
  /** 原始貼文連結（找得到才有）。 */
  postUrl?: string;
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
  /**
   * 2026-09-06：改成中性灰階。
   *
   * 原本六個類型各一個色（玫瑰紅／琥珀／靛藍／藍綠…），出現在 249 張卡
   * 的每一張上 —— 那違反 2026-05-10 就寫在 BrandsPage 的紀律：
   * 「4A 代理商專業感，不要彩色」B&W Notion discipline。
   *
   * 現在只留一個功能性的強調：爆款結構（viral）用最深的墨色 #171717，
   * 因為它是付費才有的那一類；其餘一律灰。色彩用來標示差異，不用來裝飾。
   */
  accent: string;
}

export const SOURCE_VOCAB: Record<TaskSourceType, SourceVocabEntry> = {
  evergreen: {
    zh: "長青公式", en: "Evergreen",
    zhLong: "長青公式", enLong: "Evergreen formula",
    zhWhy: "平台通則，長期可複用的基本結構。",
    enWhy: "Platform fundamentals that stay valid.",
    accent: "#737373",
  },
  viral: {
    zh: "爆款結構", en: "Viral",
    zhLong: "爆款結構", enLong: "Viral structure",
    zhWhy: "從真實高表現帳號逐則拆解。會過期，每月更新。",
    enWhy: "Reverse-engineered from real high-performing accounts. Refreshed monthly.",
    accent: "#171717",
  },
  award: {
    zh: "得獎案例", en: "Award",
    zhLong: "得獎案例結構", enLong: "Award-winning structure",
    zhWhy: "從廣告獎作品拆解出的敘事機制。",
    enWhy: "Narrative mechanics taken from award-winning work.",
    accent: "#404040",
  },
  benchmark: {
    zh: "標竿品牌", en: "Benchmark",
    zhLong: "標竿品牌結構", enLong: "Benchmark brand structure",
    zhWhy: "從國際品牌公開的內容資產拆解出的寫法。",
    enWhy: "Drawn from how benchmark brands actually write.",
    accent: "#525252",
  },
  "brand-method": {
    zh: "品牌方法論", en: "Brand method",
    zhLong: "你的品牌方法論", enLong: "Your brand's own method",
    zhWhy: "從你自己的方法論長出來的卡，只有你有。",
    enWhy: "Built from your own methodology. Yours alone.",
    accent: "#404040",
  },
  "channel-spec": {
    zh: "通路規格", en: "Channel spec",
    zhLong: "通路規格遵循", enLong: "Channel specification",
    zhWhy: "平台欄位與規格遵循，不是創意結構。",
    enWhy: "Platform field and spec compliance, not creative structure.",
    accent: "#737373",
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

/**
 * 滑過 pill 時看到的完整說明。
 *
 * 爆款一定要把「數字 + 什麼時候量的」講出來。這一類的可信度整個建立在
 * 那個數字上，而數字會老 —— 只寫「爆款結構」不寫哪一年，等於要對方
 * 相信一個我們沒說出口的東西。其餘類型不需要日期：獎不會過期。
 */
export function sourceTooltip(s: TaskSource | undefined, lang: string): string {
  const t = s?.type ?? "evergreen";
  const parts: string[] = [];
  if (s?.short) parts.push(s.short);
  if (s?.metric) parts.push(s.metric);
  if (s?.asOf) parts.push(lang === "en" ? `measured ${s.asOf}` : `${s.asOf} 量測`);
  if (s?.takeaway) parts.push(s.takeaway);
  if (!parts.length) return sourceWhy(t, lang);
  return `${sourceLabel(t, lang)}｜${parts.join("・")}`;
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

/**
 * 2026-09-29 CJ「任務卡的類型，前台只要留下爆款結構和品牌自建這兩個類別就好。
 * 後端都還是要留著」。
 *
 * 所以這裡只管「前台列不列」：得獎／標竿／長青／通路規格的卡後端照舊回傳，
 * 本週企劃、策略會議、?rerun= 之類用 id 找卡的地方都還找得到；只有卡片清單、
 * 篩選、張數、選卡器不列。
 *
 *   own   ＝ 品牌自建（用戶自己建的卡 ownCardId；品牌客製包 brand-method 也算，
 *           那是替這個品牌做的卡）
 *   viral ＝ 爆款結構（只算近 3 個月量測的，見 isRecentViral）
 */
export type FrontCardKind = "viral" | "own";
export const FRONT_CARD_KINDS: readonly FrontCardKind[] = ["viral", "own"];

/**
 * 2026-09-29 CJ「爆款結構，至少要是當月的，不能太久以前的」，後來因為當月 FB 案例太少改成
 * 「視窗放寬到近 3 個月」：前台只列 source.asOf 落在「台北時間的本月＋前兩個月」的爆款卡，
 * 月份一滑出去就自動下架。舊卡後端照留（本週企劃、策略會議仍會用），只是任務頁、
 * 選卡器、張數都不算。server 端 taskSource.isRecentViral 是同一條規則。
 */
export const VIRAL_WINDOW_MONTHS = 3;
export function currentYm(now: Date = new Date()): string {
  // sv-SE 的日期格式是 YYYY-MM-DD；用台北時區，月底晚上不會提早換月。
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 7);
}

/** 視窗最早的年月（含）。例：2026-09 → 2026-07。 */
export function viralWindowStart(now: Date = new Date()): string {
  const [y, m] = currentYm(now).split("-").map(Number);
  const idx = y! * 12 + (m! - 1) - (VIRAL_WINDOW_MONTHS - 1);
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function isRecentViral(source: unknown, now: Date = new Date()): boolean {
  const s = source as any;
  if (s?.type !== "viral" || typeof s?.asOf !== "string") return false;
  return s.asOf >= viralWindowStart(now) && s.asOf <= currentYm(now);
}

export function frontCardKind(task: unknown, now: Date = new Date()): FrontCardKind | null {
  const t = task as any;
  if (t?.ownCardId || t?.source?.type === "brand-method") return "own";
  if (isRecentViral(t?.source, now)) return "viral";
  return null;
}

export function isFrontVisibleCard(task: unknown): boolean {
  return frontCardKind(task) !== null;
}

export function frontCardKindLabel(k: FrontCardKind, lang: string): string {
  const en = lang === "en";
  return k === "viral" ? (en ? "Viral structure" : "爆款結構") : (en ? "Brand-built" : "品牌自建");
}
