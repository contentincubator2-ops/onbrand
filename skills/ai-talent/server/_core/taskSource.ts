/**
 * taskSource — 任務卡「憑什麼這樣寫」的唯一分類點。
 *
 * 2026-09-05 (CJ「這個分類，要很明顯呈現在每一個用戶的前台」)
 *
 * ── 為什麼需要這個檔案 ─────────────────────────────────────────────────
 *
 * 這個分類其實一直存在，只是沒有名字，也沒有出前台。四個客製包各自用了
 * 一種不同的權威來源，看包名就分得出來：
 *
 *   盛全工業      參考 Filson / Stripe Docs / Patagonia / Adam Grant
 *   優人升活      參考 Nike「You Can't Stop Us」/ Dove r/eal reviews
 *   HOTU          mavix_xo 懶人包 / asmr_lisandra 感官解壓（真實帳號拆解）
 *   五感十築      十築自然 / 十築好氧（客戶自己的十支柱）
 *
 * 而 gusheng.ts 與 urenshenghuo.ts 各自宣告了一份一模一樣的 `Exemplar`，
 * 只把它拼進 systemPrompt，從來沒有送到前台。那份型別的註解甚至寫著
 * 「顯示在卡片標題上的名字 —— 那是 pill 上的空間」，意圖早就在了。
 *
 * ── 分工 ───────────────────────────────────────────────────────────────
 *
 *   · 這裡（server）＝ 資料。type 是識別碼，跟著卡片存、跟著 API 走。
 *   · client/src/v2/lib/sourceVocabulary.ts ＝ 顯示名與顏色。要改字改那裡。
 *
 * 與 tierVocabulary / tierCompat 同一組分工原則：識別碼永不改名，顯示名
 * 隨時可改而且只改一個地方。client 不 import 這個檔案（跨邊界規則），它
 * 自己宣告一份同名 union，由 taskSource.test.ts 鎖住兩邊一致。
 *
 * ── 誠實規則（重要）────────────────────────────────────────────────────
 *
 * `evergreen` 是預設值，意思是「平台通則」，它不需要出處。其餘五類**一定**
 * 要有 `short`，因為它們的整個價值就在於「說得出是哪一個來源」。填不出具體
 * 出處就不要標成 award / benchmark / viral —— 標了卻答不出來，比不標更傷。
 */

/** 卡片結構的來源類型 —— 識別碼，永不改名。 */
export type TaskSourceType =
  /** 長青公式：平台通則、可長期複用的基本結構。不需要出處。 */
  | "evergreen"
  /** 爆款結構：從真實高表現帳號逐則拆解出來的結構。會過期，需定期更新。 */
  | "viral"
  /** 得獎案例：從廣告獎作品拆解出的敘事機制。 */
  | "award"
  /** 標竿品牌：從國際品牌公開的內容資產拆解出的寫法。 */
  | "benchmark"
  /** 品牌方法論：從客戶自己的方法論長出來的卡。只有該客戶有。 */
  | "brand-method"
  /** 通路規格：平台的欄位與規格遵循（如 Amazon A+ 模組），不是創意結構。 */
  | "channel-spec";

export const TASK_SOURCE_TYPES: readonly TaskSourceType[] = [
  "evergreen", "viral", "award", "benchmark", "brand-method", "channel-spec",
] as const;

export interface TaskSource {
  type: TaskSourceType;
  /**
   * 具體出處，越短越好 —— 這是卡片 pill 上的空間。
   * 必須具體到可查證：「Patagonia Worn Wear」可以，「參考國外案例」不行。
   * evergreen 以外的類型都必須有。
   */
  short?: string;
  /**
   * 拆解結論：這個來源到底做對了什麼可遷移的結構，一句話。
   * 顯示在卡片詳情，也是寫卡的人自我檢查的欄位 —— 寫不出來代表還沒拆完。
   */
  takeaway?: string;
}

/** 未標記的卡一律視為長青公式。不猜、不編。 */
export const DEFAULT_TASK_SOURCE: TaskSource = { type: "evergreen" };

export function resolveTaskSource(s?: TaskSource | null): TaskSource {
  return s && TASK_SOURCE_TYPES.includes(s.type) ? s : DEFAULT_TASK_SOURCE;
}

/**
 * 上架檢核：evergreen 以外都必須說得出出處。
 * brandPacks.test.ts 與 taskSource.test.ts 都用它，所以規則只有一份。
 */
export function validateTaskSource(s: TaskSource): string | null {
  if (!TASK_SOURCE_TYPES.includes(s.type)) return `unknown source type: ${s.type}`;
  if (s.type === "evergreen") return null;
  if (!s.short || !s.short.trim()) return `source.type="${s.type}" 必須填 short（具體出處）`;
  if (s.short.trim().length > 40) return `source.short 過長（${s.short.length}），pill 放不下`;
  return null;
}

/**
 * 客製包既有的 Exemplar（gusheng / urenshenghuo 各自宣告一份）轉成 TaskSource。
 * 那個型別只有 award | known 兩種 kind，known 對應到標竿品牌。
 */
export function fromExemplar(
  ex: { short: string; note?: string; kind: "award" | "known" } | undefined | null,
): TaskSource | undefined {
  if (!ex) return undefined;
  return {
    type: ex.kind === "award" ? "award" : "benchmark",
    short: ex.short,
    takeaway: ex.note,
  };
}
