/**
 * campaignKolBrief — 活動的「網紅任務說明單」：給網紅經紀公司（MCN）或網紅本人的需求單。
 *
 * 2026-10-01（CJ「按下網紅以後，應該要叫用戶選填網紅的名單或類型，後續寫文章安排時程的
 * 時候，才能根據不同網紅設計不同角度…跳出來的調整活動設計，其實就像是網紅任務說明單，
 * 我想改成這個名字，而 brief 單裡面的內容，就要按照 brief 一個網紅經紀公司時，所需要填的
 * 內容說明，你研究看看」）。
 *
 * ── 經紀公司收需求時要的東西（欄位就照這個排） ─────────────────────────
 *   1. 網紅名單或類型：指定人選或「類型＋層級＋平台」，經紀公司據此提名單。
 *      層級用台灣業界慣用的粉絲數級距：頭部 100 萬+／大型 50–100 萬／中腰部 10–50 萬／
 *      微網紅 1–10 萬／奈米 1 萬以下。
 *   2. 合作目標與成效：要認知、互動還是導購；看什麼數字（觸及、互動、點擊、導購）；想觸及誰。
 *   3. 要說什麼：核心訊息、必提（hashtag、連結、折扣碼、業配揭露）、禁提（競品、誇大療效）。
 *   4. 產出與時程：平台與形式、數量；提案截止→名單確認→交稿→上線期間；寄送產品或體驗。
 *   5. 合作條款：二次授權（可否拿去投廣告、期限）；
 *      競品排他期；審稿流程（幾次修改）；成效回報（截圖、後台數據、何時交）。
 *   台灣法規提醒：業配要標示「廣告」或「合作」（公平交易委員會）；食品、化妝品、
 *   健康食品另有不得宣稱療效的規定——必提欄位預設就帶揭露標示。
 *
 * ── 用在哪 ─────────────────────────────────────────────────────────
 *   · 企劃的網紅那條線：名單裡每一位（或每一類）各自一封邀約、一份 brief，角度照他填的
 *     （campaignPlan.laneItems 的 influencers）。
 *   · 寫網紅那幾件時，整張說明單＋「這一件是給誰」接在寫手的說明後面（campaignItemBrief）。
 *
 * 存在 events.positioning.kolBrief（跟活動設定分開：改說明單不該讓企劃變成「設定已改、
 * 要重排」）。
 *
 * 2026-10-01（CJ「我要移除預算，因為 AI 估算的預算，可能不準」）：說明單不收預算欄位，
 * 寫手也不會拿到任何價格。網紅報價由使用者跟經紀公司直接談。
 */

export type KolTier = "" | "mega" | "macro" | "mid" | "micro" | "nano";

export interface KolInfluencer {
  /** 名字或帳號（選填，沒有就只寫類型）。 */
  name?: string;
  /** 類型／領域：美妝、親子、科技開箱… */
  type?: string;
  tier?: KolTier;
  /** 主要平台：instagram／youtube／tiktok／facebook／threads／podcast… */
  platform?: string;
  /** 想請他從什麼角度講（選填）。 */
  angle?: string;
}

export interface KolBrief {
  influencers?: KolInfluencer[];
  objective?: string;
  kpi?: string;
  audience?: string;
  keyMessage?: string;
  mustSay?: string;
  mustNotSay?: string;
  deliverables?: string;
  timeline?: string;
  samples?: string;
  usageRights?: string;
  exclusivity?: string;
  review?: string;
  reporting?: string;
}

export const KOL_TIER_LABEL: Record<Exclude<KolTier, "">, string> = {
  mega: "頭部（100 萬+）", macro: "大型（50–100 萬）", mid: "中腰部（10–50 萬）",
  micro: "微網紅（1–10 萬）", nano: "奈米（1 萬以下）",
};

/** 說明單的文字欄位：鍵 → 標籤。順序就是給寫手看的順序。 */
export const KOL_BRIEF_FIELDS: Array<[Exclude<keyof KolBrief, "influencers">, string]> = [
  ["objective", "合作目標"],
  ["kpi", "成效指標"],
  ["audience", "想觸及的人"],
  ["keyMessage", "核心訊息"],
  ["mustSay", "必提"],
  ["mustNotSay", "禁提"],
  ["deliverables", "產出形式與數量"],
  ["timeline", "時程"],
  ["samples", "產品寄送／體驗"],
  ["usageRights", "二次授權"],
  ["exclusivity", "競品排他"],
  ["review", "審稿流程"],
  ["reporting", "成效回報"],
];

const TEXT_MAX = 600;
const MAX_INFLUENCERS = 8;
const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** 收進來的說明單 → 乾淨的說明單（空的欄位不留）。純函式。 */
export function cleanKolBrief(raw: any): KolBrief {
  const out: KolBrief = {};
  for (const [k] of KOL_BRIEF_FIELDS) {
    const v = t(raw?.[k], TEXT_MAX);
    if (v) out[k] = v;
  }
  const tiers = new Set(Object.keys(KOL_TIER_LABEL));
  const list: KolInfluencer[] = (Array.isArray(raw?.influencers) ? raw.influencers : [])
    .map((r: any) => {
      const row: KolInfluencer = {};
      const name = t(r?.name, 60), type = t(r?.type, 40), platform = t(r?.platform, 30), angle = t(r?.angle, 120);
      if (name) row.name = name;
      if (type) row.type = type;
      if (tiers.has(String(r?.tier))) row.tier = r.tier;
      if (platform) row.platform = platform;
      if (angle) row.angle = angle;
      return row;
    })
    .filter((r: KolInfluencer) => r.name || r.type)
    .slice(0, MAX_INFLUENCERS);
  if (list.length) out.influencers = list;
  return out;
}

/** 一位網紅給人看的名字：「林小美（美妝・中腰部・IG）」或「美妝網紅（中腰部・IG）」。 */
export function influencerLabel(r: KolInfluencer): string {
  const tier = r.tier ? KOL_TIER_LABEL[r.tier].replace(/（.*）/, "") : "";
  const bits = [r.name ? r.type : "", tier, r.platform].filter(Boolean);
  const head = r.name || (r.type ? `${r.type}網紅` : "網紅");
  return bits.length ? `${head}（${bits.join("・")}）` : head;
}

/** 給寫手的說明單（只列有填的）；完全空白回空字串。 */
export function kolBriefText(brief: KolBrief | null | undefined): string {
  if (!brief) return "";
  const lines: string[] = [];
  if (brief.influencers?.length) {
    lines.push(`- 網紅名單或類型：${brief.influencers.map((r) => `${influencerLabel(r)}${r.angle ? `，角度：${r.angle}` : ""}`).join("；")}`);
  }
  for (const [k, label] of KOL_BRIEF_FIELDS) if (brief[k]) lines.push(`- ${label}：${brief[k]}`);
  return lines.length ? `[網紅任務說明單]\n${lines.join("\n")}` : "";
}
