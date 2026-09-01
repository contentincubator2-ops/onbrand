/**
 * Mock dataset for the 成效 workspace (2026-08-11).
 *
 * DELIBERATELY FAKE. Nothing here touches a real API — the point is to settle
 * what the workspace should SHOW before paying for the integration work, since
 * the connectors differ wildly in cost:
 *   Meta        — pages_read_engagement is already requested, may work today
 *   Google Ads  — separate OAuth + developer token + MCC approval
 *   SHOPLINE    — per-merchant API credentials
 *   91APP       — per-merchant API credentials
 *   GA4         — separate OAuth
 *
 * Every consumer must render the 模擬資料 banner. If this data ever appears
 * without it, someone will screenshot it into a client deck as real numbers.
 *
 * The centrepiece is `byAudience`: performance grouped by the audience segment
 * a piece was written for. That grouping is the actual product differentiator —
 * it is only possible because each piece records which 族群 / 甜蜜點 it came
 * from, which a general chatbot has no way to know.
 */

export type ConnectionState = "connected" | "available" | "needs_reauth";

export interface PlatformConnection {
  id: string;
  label: string;
  kind: "ads" | "commerce" | "web";
  state: ConnectionState;
  /** What we'd pull once connected — shown so the value is legible pre-connect. */
  provides: string;
  /** Honest note about what connecting actually costs the customer. */
  note?: string;
}

export const platformConnections: PlatformConnection[] = [
  {
    id: "meta",
    label: "Meta（Facebook / Instagram）",
    kind: "ads",
    state: "connected",
    provides: "貼文觸及、互動、廣告花費、ROAS、受眾輪廓",
  },
  {
    id: "google",
    label: "Google Ads",
    kind: "ads",
    state: "available",
    provides: "關鍵字、Search / PMax 花費、轉換、搜尋字詞",
    note: "需要另外授權，並取得開發者權杖",
  },
  {
    id: "shopline",
    label: "SHOPLINE",
    kind: "commerce",
    state: "available",
    provides: "訂單、營收、客單價、回購率、商品排行",
    note: "需要商店管理員提供 API 金鑰",
  },
  {
    id: "91app",
    label: "91APP",
    kind: "commerce",
    state: "available",
    provides: "訂單、會員分層、回購、門市與線上分流",
    note: "需要商店管理員提供 API 金鑰",
  },
  {
    id: "ga",
    label: "GA4 / 官網",
    kind: "web",
    state: "needs_reauth",
    provides: "流量來源、著陸頁、路徑、站內轉換",
    note: "既有授權沒有涵蓋報表讀取範圍，需重新授權",
  },
];

export interface Kpi {
  id: string;
  label: string;
  value: string;
  /** Percent change vs previous period. Positive isn't always good — see goodWhen. */
  deltaPct: number;
  goodWhen: "up" | "down";
  hint: string;
}

export const kpis: Kpi[] = [
  { id: "spend",   label: "廣告花費",   value: "NT$ 428,600", deltaPct: 12.4, goodWhen: "down", hint: "Meta + Google Ads 合計" },
  { id: "revenue", label: "歸因營收",   value: "NT$ 1,704,200", deltaPct: 21.8, goodWhen: "up", hint: "SHOPLINE + 91APP 訂單" },
  { id: "roas",    label: "ROAS",       value: "3.98",         deltaPct: 8.3,  goodWhen: "up", hint: "歸因營收 ÷ 廣告花費" },
  { id: "orders",  label: "訂單數",     value: "1,246",        deltaPct: 15.1, goodWhen: "up", hint: "含線上與門市自取" },
  { id: "aov",     label: "客單價",     value: "NT$ 1,368",    deltaPct: -3.2, goodWhen: "up", hint: "歸因營收 ÷ 訂單數" },
];

/**
 * The differentiator view: same content budget, split by which audience the
 * piece was written for. `sweetSpot` is the 甜蜜點 it came from in the
 * strategy workbench.
 */
export interface AudiencePerformance {
  audience: string;
  sweetSpot: string;
  pieces: number;
  reach: number;
  engagementRate: number;
  orders: number;
  revenue: number;
  roas: number;
}

export const byAudience: AudiencePerformance[] = [
  { audience: "忙碌雙薪爸媽", sweetSpot: "5 分鐘就能上桌",   pieces: 14, reach: 268_400, engagementRate: 6.8, orders: 512, revenue: 742_300, roas: 5.21 },
  { audience: "在家宴客的主人", sweetSpot: "端得出手的體面", pieces: 9,  reach: 154_900, engagementRate: 5.4, orders: 331, revenue: 512_800, roas: 4.36 },
  { audience: "獨居上班族",   sweetSpot: "一個人也值得吃好", pieces: 11, reach: 198_200, engagementRate: 3.1, orders: 214, revenue: 271_500, roas: 2.28 },
  { audience: "健身備餐族",   sweetSpot: "高蛋白免調理",     pieces: 7,  reach: 96_100,  engagementRate: 2.4, orders: 189, revenue: 177_600, roas: 1.74 },
];

export interface ContentPerformance {
  id: string;
  title: string;
  platform: "facebook" | "instagram" | "google" | "shopline" | "91app";
  audience: string;
  publishedAt: string;
  reach: number;
  engagementRate: number;
  orders: number;
  revenue: number;
}

export const topContent: ContentPerformance[] = [
  { id: "c1", title: "晚上 8 點，孩子還在滾床單⋯", platform: "facebook",  audience: "忙碌雙薪爸媽",   publishedAt: "2026-08-04", reach: 62_400, engagementRate: 9.2, orders: 148, revenue: 214_600 },
  { id: "c2", title: "端得出手的年菜，其實只要 5 分鐘", platform: "instagram", audience: "在家宴客的主人", publishedAt: "2026-08-02", reach: 41_800, engagementRate: 7.6, orders: 112, revenue: 186_400 },
  { id: "c3", title: "和牛牛舌 × 火鍋湯底組合",     platform: "shopline",  audience: "在家宴客的主人", publishedAt: "2026-07-30", reach: 18_200, engagementRate: 4.1, orders: 96,  revenue: 158_200 },
  { id: "c4", title: "一個人的晚餐，也不用將就",     platform: "facebook",  audience: "獨居上班族",     publishedAt: "2026-07-28", reach: 37_600, engagementRate: 3.4, orders: 64,  revenue: 78_900 },
  { id: "c5", title: "高蛋白備餐包｜免調理系列",     platform: "91app",     audience: "健身備餐族",     publishedAt: "2026-07-26", reach: 22_400, engagementRate: 2.2, orders: 71,  revenue: 68_300 },
];

export const MOCK_PERIOD = "2026/07/13 – 2026/08/11（近 30 天）";
