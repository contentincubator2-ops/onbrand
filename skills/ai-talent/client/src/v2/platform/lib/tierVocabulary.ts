/**
 * tierVocabulary — 內部 tier code ↔ 用戶可見名稱的「唯一轉換點」。
 *
 * 2026-08-23 (CJ「現在的任務，對用戶來看已經沒有秒數之分了，但內部語言還是有分，
 * 我不知該如何統一」)
 *
 * ── 結論：不統一，改成明確分層 ──────────────────────────────────────────
 *
 * 兩層本來就該分開，不該互相靠攏：
 *
 *   · tier code（"30s" / "60s" / "99s"）＝ 資料。它是地址，不是說明。
 *     DB 存的是它、task id 前綴用的是它、routing / quota / timeout 讀的是它。
 *     它的價值在於「永不改變」，而不是「看起來有意義」。
 *
 *     再改一次名的代價是有前例的：上一次（100s → 99s，2026-05-17）為了避開
 *     破壞性 DB migration，在 server/_core/tierCompat.ts 留下一層永久相容
 *     shim —— production 至今仍存著 `[task:fb-100-...]`，每個 taskId 進出
 *     邊界都得穿過 normalizeTaskId()。把 fb-30-* 改成 fb-single-* 只會得到
 *     第二層 shim，零用戶價值。
 *
 *   · 顯示名（單篇 / 套組 / 企劃）＝ 文案。它隨時可以改，而且只該改一個地方。
 *
 * 真正壞掉的從來不是「內外不一致」，是「外部那層自己不一致」：在這份檔案出現
 * 之前，PlatformTaskPage.tsx 一個檔案裡就有三種寫法（檔頭註解「一篇內容 /
 * 完整活動」、tierLabel()「單篇 / 企劃」、TIER_TABS「單篇內容 / 完整企劃」），
 * 另有 AccountPage / RunPage 各自硬寫一份。
 *
 * 所以：任何要把 tier 變成人看得懂的字的地方，都必須經過這裡。
 *
 * ── 守衛 ────────────────────────────────────────────────────────────────
 * tierVocabulary.test.ts 會掃描整個 client/src 把規則鎖住：
 *   ① 帶中文的字串裡不准出現 30s / 60s / 90s / 99s / 100s
 *      （用戶可見文案禁用秒數；要講時間就寫「秒」）
 *   ② 「單篇」「套組」「企劃」「單篇內容」「內容套組」「完整企劃」這些顯示名，
 *      只准以完整字串的形式出現在這份檔案裡 —— 其他地方一律呼叫 tierLabel()。
 *      （句子裡順帶提到不算，例如首頁的「單篇內容 · 內容套組 · 完整企劃」。）
 *
 * 對應：server/_core/tierCompat.ts 管的是 taskId / tier 的「識別碼」相容，
 * 這份管的是「顯示名」。兩者互不重疊。
 */

/** 內部 tier code —— 引擎設定與資料儲存用，永不改名。 */
export type TierCode = "30s" | "60s" | "99s";

export interface TierVocabEntry {
  /** 短版 —— 空間吃緊處（chip、點數表格欄位） */
  zh: string;
  /** 長版 —— 需要自我說明處（分頁標籤、首頁） */
  zhLong: string;
  /**
   * 英文。目前長短版共用同一個字（現行 UI 兩處都是 Single / Pack / Campaign），
   * 之後若要分再加 enLong —— 不預先發明沒人用的文案。
   */
  en: string;
  /** tier 識別色 */
  accent: string;
}

export const TIER_VOCAB: Record<TierCode, TierVocabEntry> = {
  "30s": { zh: "單篇", zhLong: "單篇內容", en: "Single", accent: "#00b4bc" },
  "60s": { zh: "套組", zhLong: "內容套組", en: "Pack", accent: "#7c3aed" },
  "99s": { zh: "企劃", zhLong: "完整企劃", en: "Campaign", accent: "#f59e0b" },
};

/** 由輕到重 —— 分頁、清單一律依這個順序，不要各自手排。 */
export const TIER_ORDER: readonly TierCode[] = ["30s", "60s", "99s"] as const;

/**
 * 已退役的 tier 值 → 現行 code。存量資料還會送這些值上來：
 *   100s  2026-05-17 改名為 99s，未做 DB migration（見 tierCompat.ts）
 *   90s   2026-07-20 整層退役，等價任務全部搬到 99s（見 quickTaskFB.ts
 *         FB_90S_TASK_INDEX 的退役說明）
 * 少了這張表，一筆 tier="100s" 的舊 mission 會被當成 fallback 顯示成「單篇」，
 * 而它其實是企劃級的產出。
 */
const RETIRED_TIER: Record<string, TierCode> = {
  "100s": "99s",
  "90s": "99s",
};

/**
 * 把任何來源的 tier 值收斂成現行 code。
 * 認不得的值（含 null / undefined）→ "30s"，與收斂前各處的 fallback 行為一致：
 * 寧可少報規格，不要對用戶誇大交付物。
 */
export function normalizeTier(tier: string | null | undefined): TierCode {
  if (!tier) return "30s";
  if (tier in TIER_VOCAB) return tier as TierCode;
  return RETIRED_TIER[tier] ?? "30s";
}

/**
 * tier → 用戶可見名稱。**唯一**該把 tier 變成文字的入口。
 *
 * @param lang  "en" 走英文，其餘走中文（沿用全站 lang === "en" 慣例）
 * @param opts.long  中文要長版（單篇內容）而非短版（單篇）；英文長短相同
 */
export function tierLabel(
  tier: string | null | undefined,
  lang: string,
  opts?: { long?: boolean },
): string {
  const entry = TIER_VOCAB[normalizeTier(tier)];
  if (lang === "en") return entry.en;
  return opts?.long ? entry.zhLong : entry.zh;
}

/** tier → 識別色。 */
export function tierAccent(tier: string | null | undefined): string {
  return TIER_VOCAB[normalizeTier(tier)].accent;
}
