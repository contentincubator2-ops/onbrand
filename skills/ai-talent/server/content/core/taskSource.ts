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
  /**
   * 傳播證據。**只有 viral 用，而且是必填。**
   *
   * 得獎是評審給的，講得出獎名就夠了；爆款是「真的傳開了」，所以證據是數字：
   * 「6 天 4.3 億次播放、25 萬支投稿」。填不出數字就不是爆款，是你覺得它紅。
   */
  metric?: string;
  /**
   * 這個數字是什麼時候量的，格式 YYYY-MM。**只有 viral 用，而且是必填。**
   *
   * 為什麼只有爆款要日期：得獎不會過期，2014 年的 Grand Prix 今天還是 Grand
   * Prix；爆款會。Metricool 2026 分析 230 萬則貼文，TikTok 單則內容壽命約
   * 10 天；Publicis 的調查裡只有 27% 的趨勢活過兩週。
   *
   * 所以這裡有一條界線要守住：**爆款「結構」可以留，爆款「熱點」不要做成卡。**
   * 熱點 3–5 天就死，做成卡等於上架即過期，那是流程要解的問題不是卡。
   * 這張卡如果離不開某個特定音樂或梗，它就不該是 viral。
   */
  asOf?: string;
  /**
   * 2026-09-29（CJ「要有更新時間，也要有參考文章的連結」）：報導這個數字的文章。
   * 看卡的人要能自己點過去核對，數字才可信。2026-07 起量測的 viral 卡必填
   * （validateTaskSource 擋）；更早的舊卡還沒補，逐步回填。
   */
  url?: string;
  /** 原始貼文（找得到才填）。 */
  postUrl?: string;
  /**
   * 2026-09-29（CJ「數字是原貼文的。類似這樣」）：這個案例的弱點，一句話照實寫——
   * 跨平台合計、品牌自報、政治人物／名人帳號、數字屬於別人的貼文……
   * 卡片上直接印出來，讓用戶自己判斷，不藏在詳情裡。
   */
  caveat?: string;
}

/**
 * 2026-09-29 CJ「爆款結構至少要是當月的」→ 因當月 FB 案例太少改為「近 3 個月」，
 * 滑出視窗自動下架：前台只列 asOf 落在台北時間本月＋前兩個月的爆款卡
 * （client sourceVocabulary.isRecentViral 是同一條規則）。
 */
export const VIRAL_WINDOW_MONTHS = 3;
export function currentYmTaipei(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 7);
}
export function viralWindowStart(now: Date = new Date()): string {
  const [y, m] = currentYmTaipei(now).split("-").map(Number);
  const idx = y! * 12 + (m! - 1) - (VIRAL_WINDOW_MONTHS - 1);
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
export function isRecentViral(s: TaskSource | null | undefined, now: Date = new Date()): boolean {
  if (s?.type !== "viral" || !s.asOf) return false;
  return s.asOf >= viralWindowStart(now) && s.asOf <= currentYmTaipei(now);
}

/** 從這個年月起量測的爆款卡，必須附參考文章連結。 */
export const VIRAL_URL_REQUIRED_FROM = "2026-07";

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
  if (s.type === "viral") {
    // 爆款是唯一「證據會過期」的類型，所以它是唯一要交數字和日期的。
    // 這條擋的不是筆誤，是「我覺得這個很紅」被寫成事實。
    if (!s.metric || !s.metric.trim()) {
      return `source.type="viral" 必須填 metric（傳播數字，例：6 天 4.3 億次播放）`;
    }
    if (!s.asOf || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.asOf)) {
      return `source.type="viral" 必須填 asOf（測量年月 YYYY-MM），現值：${s.asOf ?? "（空）"}`;
    }
    if (s.asOf >= VIRAL_URL_REQUIRED_FROM && !s.url) {
      return `source.type="viral" 且 asOf ≥ ${VIRAL_URL_REQUIRED_FROM} 必須填 url（參考文章連結）`;
    }
  }
  for (const k of ["url", "postUrl"] as const) {
    const v = s[k];
    if (v !== undefined && !/^https:\/\/\S+$/.test(v)) return `source.${k} 必須是 https:// 開頭的完整網址，現值：${v}`;
  }
  return null;
}

/**
 * 這個來源的數字有多舊（月）。非 viral 或沒有 asOf 回 null。
 *
 * 刻意不在這裡定「幾個月算過期」：爆款「結構」可以放很久（e.l.f. 那支 2019
 * 年的做法今天還在教），會爛掉的是熱點。所以這裡只給年齡，讓前台把日期顯示
 * 出來、由看的人自己判斷，而不是我們替他決定什麼時候該不信。
 */
export function sourceAgeMonths(s: TaskSource, now: Date = new Date()): number | null {
  if (s.type !== "viral" || !s.asOf) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s.asOf);
  if (!m) return null;
  return (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2]));
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
