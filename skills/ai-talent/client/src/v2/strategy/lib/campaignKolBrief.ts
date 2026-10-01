/**
 * 網紅任務說明單（畫面用）。欄位的意義與「為什麼是這些」寫在
 * server/strategy/core/campaignKolBrief.ts；這裡是同一份欄位的標籤、提示與預填。
 */
export type KolTier = "" | "mega" | "macro" | "mid" | "micro" | "nano";

export interface KolInfluencer { name?: string; type?: string; tier?: KolTier; platform?: string; angle?: string }

export interface KolBrief {
  influencers?: KolInfluencer[];
  objective?: string; kpi?: string; audience?: string;
  keyMessage?: string; mustSay?: string; mustNotSay?: string;
  deliverables?: string; timeline?: string; samples?: string;
  budget?: string; usageRights?: string; exclusivity?: string; review?: string; reporting?: string;
}

export type KolTextKey = Exclude<keyof KolBrief, "influencers">;

export const KOL_TIERS: Array<{ id: Exclude<KolTier, "">; zh: string; en: string }> = [
  { id: "mega", zh: "頭部（100 萬+）", en: "Mega (1M+)" },
  { id: "macro", zh: "大型（50–100 萬）", en: "Macro (500K–1M)" },
  { id: "mid", zh: "中腰部（10–50 萬）", en: "Mid-tier (100–500K)" },
  { id: "micro", zh: "微網紅（1–10 萬）", en: "Micro (10–100K)" },
  { id: "nano", zh: "奈米（1 萬以下）", en: "Nano (<10K)" },
];

/** 經紀公司收需求時要的東西，分四組；placeholder 是寫法示範。 */
export const KOL_BRIEF_GROUPS: Array<{
  zh: string; en: string;
  fields: Array<{ key: KolTextKey; zh: string; en: string; ph: string; long?: boolean }>;
}> = [
  {
    zh: "合作目標與成效", en: "Goals & results",
    fields: [
      { key: "objective", zh: "合作目標", en: "Objective", ph: "例：讓還沒聽過我們的中小品牌主知道上市試用（認知為主，帶一點導購）" },
      { key: "kpi", zh: "成效指標", en: "KPIs", ph: "例：總觸及 20 萬、連結點擊 2,000、試用申請 150" },
      { key: "audience", zh: "想觸及的人", en: "Audience", ph: "例：25–40 歲、自己經營品牌或負責行銷的人" },
    ],
  },
  {
    zh: "要說什麼", en: "Messaging",
    fields: [
      { key: "keyMessage", zh: "核心訊息", en: "Key message", ph: "一句話，網紅講完觀眾要記住的那句", long: true },
      { key: "mustSay", zh: "必提", en: "Must include", ph: "例：#廣告 或「合作」標示、活動連結、折扣碼、截止日", long: true },
      { key: "mustNotSay", zh: "禁提", en: "Must avoid", ph: "例：不提競品名稱、不說「保證」、不做療效宣稱", long: true },
    ],
  },
  {
    zh: "產出與時程", en: "Deliverables & timeline",
    fields: [
      { key: "deliverables", zh: "產出形式與數量", en: "Deliverables", ph: "例：IG 貼文 1＋限動 3（含連結貼紙）；或 YouTube 開箱 1 支", long: true },
      { key: "timeline", zh: "時程", en: "Timeline", ph: "例：10/15 前提名單 → 10/20 確認 → 10/28 交初稿 → 11/1–11/7 上線", long: true },
      { key: "samples", zh: "產品寄送／體驗", en: "Product / samples", ph: "例：提供 2 個月試用帳號；不需寄實體產品" },
    ],
  },
  {
    zh: "預算與條款", en: "Budget & terms",
    fields: [
      { key: "budget", zh: "預算", en: "Budget", ph: "例：總預算 30 萬（未稅）；單價範圍 1–8 萬；可接受產品互惠" },
      { key: "usageRights", zh: "二次授權", en: "Usage rights", ph: "例：內容可轉發到品牌官方帳號、可拿去投廣告 3 個月" },
      { key: "exclusivity", zh: "競品排他", en: "Exclusivity", ph: "例：上線前後 30 天不接同類型 AI 行銷工具" },
      { key: "review", zh: "審稿流程", en: "Review", ph: "例：上線前 3 天交稿，品牌修改 2 次" },
      { key: "reporting", zh: "成效回報", en: "Reporting", ph: "例：上線 7 天後提供後台截圖（觸及、互動、點擊）" },
    ],
  },
];

/** 說明單還是空的時候，用活動已經有的東西先填一版（使用者會看到、可以改）。 */
export function prefillKolBrief(args: {
  brief: KolBrief | null | undefined;
  smp?: string | null; goal?: string | null; audience?: string | null;
  startAt?: string | null; endAt?: string | null;
}): KolBrief {
  const b: KolBrief = { ...(args.brief ?? {}) };
  const empty = !Object.values(b).some((v) => (Array.isArray(v) ? v.length : !!v));
  if (!empty) return b;
  const md = (s: string) => s.slice(5).replace("-", "/");
  if (args.smp) b.keyMessage = args.smp;
  if (args.goal) b.objective = args.goal;
  if (args.audience) b.audience = args.audience.slice(0, 300);
  if (args.startAt) b.timeline = `上線期間：${md(args.startAt)}${args.endAt ? ` – ${md(args.endAt)}` : ""}`;
  // 台灣的業配要標示「廣告」或「合作」（公平交易委員會）：預設就帶上。
  b.mustSay = "業配標示「#廣告」或「合作」";
  return b;
}
