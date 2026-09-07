/**
 * OnBrand plan config — single tier, monthly fixed.
 *
 * Decision (2026-05-10, CJ direction「都由你訂定 + AI 小白 + 月費固定」):
 *   - One plan, one price. No tier-decision fatigue for newbie users.
 *   - Trial 7d, no credit card upfront.
 *   - Quotas balance UX (enough for a real workflow) + cost (70% margin
 *     assuming heavy users hit 80% of caps).
 *
 * Cost basis (Anthropic Haiku + PiAPI flux-schnell + PiAPI Kling pro):
 *   30s task:  ~$0.01 USD
 *   60s task:  ~$0.04 USD (5 variants + QA)
 *   99s task:  ~$0.20 USD (multi-day campaign)
 *   image:     ~$0.04 USD
 *   video:     ~$1.00 USD per 5s clip
 *
 * Heavy-use cost @ 80% caps: ~$13 USD, vs US$25 early-bird → ~48% margin (Solo US$100 → ~87%).
 */

// 2026-05-11 — multi-tier for $1M ARR strategy. Solo / Team / Agency
// split (CJ「Team / Agency 方案是 $1M 真正的槓桿」).
export type PlanCode = "trial" | "drop_starter" | "drop_pro" | "drop_team" | "drop_agency" | "enterprise";

export interface PlanQuota {
  /** -1 means unlimited */
  task_30s: number;
  task_60s: number;
  task_99s: number;
  image_gen: number;
  video_gen: number;
  brands: number;
  fb_publish: number;
  /** 2026-05-11 — max members in this workspace plan (1 = solo only). */
  team_members: number;
  /** 2026-05-11 — can the workspace host multi-client (sub-brand sharing)? */
  multi_client: boolean;
  /** 2026-05-14 — monthly point allocation (refilled on the 1st).
   *  1 point = 1 second of task compute. Trial gets a one-time grant
   *  (pointsPerCycle and pointsCycleDays=7); paid plans refresh monthly.
   *  -1 = unlimited (bypass point gating). */
  pointsPerCycle: number;
  pointsCycleDays: number;   // 7 for trial, 30 for monthly subs
  /**
   * 2026-09-06 定價改版 —— 以下五個欄位是「2,250 vs 9,000」那條線的全部依據。
   *
   * 在這之前兩級的差別只有 runsPerCycle（50 次 vs 無限），那是用量限制；
   * CJ 的新設計把差別移到能力上：能開幾個通路、能不能用爆款結構卡、
   * 能做幾個產品定位。用量限制留著，功能限制拿掉 —— 2,250 的任務是
   * 取得客戶，不是賺錢。
   */
  /** 可同時啟用的通路數。-1 = 無限。 */
  platforms: number;
  /** 更換通路的冷卻天數。30 = 每月可換一次；0 = 隨時可換。 */
  platformSwapDays: number;
  /** 品牌自建任務卡上限（張）。-1 = 無限。
   *  刻意低於策略顧問導入送的 8 張 —— 自建卡不能變成客製導入的替代品。 */
  ownTaskCards: number;
  /**
   * 能不能使用爆款結構卡（source.type === "viral"，目前 46 張）。
   *
   * 這是 2,250 → 9,000 的主要升級鉤子，而且它是唯一由產品本身逼出續訂的
   * 機制：爆款卡的 pill 上印著 asOf 量測年月，而 TikTok 只有 27% 的趨勢
   * 活過兩週 —— 那個日期會自己變舊，客戶看得到它舊了。
   */
  viralTaskCards: boolean;
  /** 產品定位數上限。2,250 只有品牌定位，所以是 0。 */
  products: number;
  /** 每個計費週期可做幾次活動定位。 */
  eventsPerCycle: number;
  /** 2026-05-19 (CJ Starter plan) — monthly run limit regardless of task type.
   *  1 run = 1 task execution (all variants + images count as 1 run).
   *  -1 = unlimited. Enforced in executeTask.ts / quickTaskOrchestra.ts.
   *  Starter = 50. All other paid plans = -1. */
  runsPerCycle: number;
}


/**
 * 2026-05-14 (CJ「TWD + USD 雙幣」): currency derives from
 * users.billingCountry. TW → TWD, anything else → USD. We don't tie
 * currency to display language — same user always pays the same currency
 * regardless of language toggle.
 */
export type Currency = "TWD" | "USD";

export function currencyFromCountry(country: string | null | undefined): Currency {
  if (!country) return "TWD";
  const c = country.toUpperCase().trim();
  return c === "TW" ? "TWD" : "USD";
}

/** Map an Accept-Language header to a sensible billing country. */
export function inferBillingCountryFromAcceptLanguage(header: string | null | undefined): string {
  if (!header) return "TW";
  const first = header.split(",")[0]?.toLowerCase() ?? "";
  if (first.startsWith("zh-tw") || first.startsWith("zh-hant") || first === "zh") return "TW";
  if (first.startsWith("zh")) return "TW"; // be generous — zh-CN users on a TW product likely want TWD
  return "US";
}

/** Stripe-compatible unit_amount (smallest currency unit).
 *
 * Despite being a "whole" currency in everyday use, Stripe treats TWD
 * the same as USD — amounts must be in the smallest unit (1/100 of NT$).
 * NT$750 → unit_amount = 75000  (NOT 750, which would show as NT$7.50).
 * See: https://stripe.com/docs/currencies (TWD is NOT in the zero-decimal list)
 */
export function toStripeUnitAmount(amount: number, currency: Currency): number {
  // Both TWD and USD: multiply by 100 to convert to smallest unit
  return Math.round(amount * 100);
}

/** Format a price for display. Always shows the user's currency. */
export function formatPrice(amount: number, currency: Currency): string {
  if (amount < 0) return currency === "TWD" ? "聯繫業務" : "Contact sales";
  if (amount === 0) return currency === "TWD" ? "免費" : "Free";
  return currency === "TWD"
    ? `NT$ ${amount.toLocaleString("en-US")}`
    : `US$ ${amount.toLocaleString("en-US")}`;
}

/** 2026-05-14: per-action point costs. Keep this single-source so
 *  pricing changes don't drift across the codebase. */
export const POINT_COSTS = {
  task_30s:        30,
  task_60s:        60,
  task_99s:        99,
  image_flux:      30,   // PiAPI Flux Schnell — default
  image_gpt:      100,   // OpenAI gpt-image-1 — premium
  image_imagen:    50,   // Google Imagen — middle
  image_ideogram:  50,   // PiAPI Ideogram (text-in-image)
  // video pulled per CJ direction; keep cost defined for when re-enabled
  video_clip:    1500,   // 1 PiAPI Kling 5s clip
} as const;
export type PointAction = keyof typeof POINT_COSTS;

export interface Plan {
  code: PlanCode;
  name: string;
  priceTwdMonthly: number;     // NTD per month (effective default = current sticker)
  priceTwdAnnually: number;    // NTD per year (discounted)
  /** 2026-05-12 (CJ「老用戶永遠保 900」): early-bird vs standard.
   *  priceTwdMonthly is set to the CURRENT (early-bird) price so anyone
   *  not flagged earlyBird falls through to standardPriceTwdMonthly.
   *  earlyBirdPriceTwdMonthly is what flagged users actually pay. */
  earlyBirdPriceTwdMonthly?: number;
  standardPriceTwdMonthly?: number;
  // 2026-05-14 (CJ「TWD + USD 雙幣」): USD prices for users with
  // billingCountry != 'TW'. Rounded to clean USD values; we don't track
  // FX day-to-day, so these stay fixed until manually bumped.
  priceUsdMonthly?: number;
  priceUsdAnnually?: number;
  earlyBirdPriceUsdMonthly?: number;
  standardPriceUsdMonthly?: number;
  trialDays: number;
  quota: PlanQuota;
  features: string[];          // human-readable bullets for /pricing
  highlight?: string;
  whiteLabel?: boolean;
  apiAccess?: boolean;
  prioritySupport?: boolean;
}

export const PLANS: Record<PlanCode, Plan> = {
  /** OnBrand Starter — entry-level personal plan.
   *  2026-05-19 (CJ direction「加 Starter 給個人購買者」):
   *    - 早鳥 US$25/月（永久保價）
   *    - 標準 US$75/月
   *    - 1 個品牌 · 50 次執行 / 月（points cap 5,000 ≈ 50 × 60s tasks）
   *    - 30s + 60s 任務；99s 鎖定（需升級 Solo）
   *    - 每日 LLM cost cap = $2（fair-use guard）
   */
  drop_starter: {
    code: "drop_starter",
    name: "OnBrand Starter",
    // 2026-07-15 (CJ「取消早鳥優惠，只呈現原價」): early-bird offer CLOSED for
    // new signups — standard price is the only public price. earlyBird* fields
    // are kept ONLY so existing users with the earlyBird DB flag keep their
    // grandfathered rate (永久保價 promise). Annual = standard ×10 (2 mo free).
    priceTwdMonthly:         2250,   // NT$2,250 standard
    priceTwdAnnually:       22500,   // NT$22,500 standard annual (×10, 2 months free)
    earlyBirdPriceTwdMonthly: 750,   // grandfathered only — offer closed 2026-07-15
    standardPriceTwdMonthly: 2250,
    priceUsdMonthly:          75,    // standard US$75
    priceUsdAnnually:        750,    // standard annual US$750 (×10, 2 months free)
    earlyBirdPriceUsdMonthly: 25,    // grandfathered only — offer closed 2026-07-15
    standardPriceUsdMonthly:  75,
    trialDays: 0,
    quota: {
      task_30s:   -1,  // run-gated via runsPerCycle; no per-type cap
      task_60s:   -1,
      task_99s:   -1,  // 2026-09-06：企劃解鎖。功能限制全拿掉，差異改放在通路數與爆款卡
      image_gen:  -1,  // images included in the run count
      video_gen:   0,
      brands:      1,
      fb_publish: -1,
      team_members: 2,
      multi_client: false,
      // Starter uses run-count gating (runsPerCycle), not points.
      // pointsPerCycle = -1 bypasses point check; runsPerCycle enforces the 50-run limit.
      pointsPerCycle: -1,
      pointsCycleDays: 30,
      runsPerCycle: -1,  // 2026-09-06：不再以執行數分級，改以通路數 + 爆款卡分級
      platforms: 2,
      platformSwapDays: 30,
      ownTaskCards: 3,
      viralTaskCards: false,
      products: 0,
      eventsPerCycle: 0,
    },
    features: [
      "1 個品牌 · 1 位用戶",
      "每月 50 次執行（單篇＋套組任務，每次含所有變體 + 圖）",
      "AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
      "品牌大腦定位（USP · 語氣 · 受眾）",
      "電子發票（個人 / B2B）",
      "深度研究企劃：升級 Solo 解鎖",
    ],
    highlight: "US$75／月",
  },

  /** New users get 7 days OR 1000 points (whichever runs out first).
   *  2026-05-18: dual-limit trial — time cap prevents indefinite squatting;
   *  points cap prevents account-farm abuse (new account = same 1000 pts,
   *  no bonus from re-registering). pointsCycleDays=365 means points do NOT
   *  refill within the 7-day trial window — use them up and you must upgrade.
   *  1000 pts ≈ 16× 60s tasks, or 10× 99s tasks, or ~10 Flux images. */
  trial: {
    code: "trial",
    name: "7 天免費試用",
    priceTwdMonthly: 0,
    priceTwdAnnually: 0,
    trialDays: 7,
    quota: {
      // 2026-05-14: legacy per-task quotas kept for back-compat but
      // gating is now point-based. -1 = no per-task cap; only points apply.
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: -1,
      video_gen: 0,                // video still hard-disabled
      brands: 1,
      fb_publish: -1,
      team_members: 1,
      multi_client: false,
      // 2026-05-18: 1000 pts one-time (cycleDays=365 → no refill in trial window)
      pointsPerCycle: 1000,
      pointsCycleDays: 365,
      runsPerCycle: -1,   // trial: no run cap, gated by points instead
      platforms: 2,
      platformSwapDays: 0,
      ownTaskCards: 1,
      viralTaskCards: false,
      products: 0,
      eventsPerCycle: 0,
    },
    features: [
      "1000 點試用額度（不重置，用完即停）",
      "全任務模板（≈10–16 篇文案或 10 張圖）",
      "7 天時間上限（先到先停）",
      "Email / LINE 客服",
      "免綁信用卡",
    ],
  },

  /** OnBrand Solo — for one founder, one brand.
   *  2026-05-14 (CJ pricing pivot):
   *    - 早鳥 US$100/月（永久保價、現在 13 個 grandfathered 用戶用 lockedPriceTwdMonthly=900 鎖在舊價）
   *    - 標準 US$300/月
   *    - 1 個品牌 · 無限文案 + 無限圖 · 影片另計（roadmap）
   *    - Fair-use: 內部每日 LLM cost cap = $5（UI 不顯示）
   *    - 改名 / 換品牌：聯繫客服（admin tool reset）
   */
  drop_pro: {
    code: "drop_pro",
    name: "OnBrand Solo",
    // 2026-07-15 (CJ): early-bird offer closed — see drop_starter note.
    priceTwdMonthly: 9000,                 // NT$9,000 standard monthly
    priceTwdAnnually: 90000,               // NT$90,000 standard annual (×10, 2 months free)
    earlyBirdPriceTwdMonthly: 3000,        // grandfathered only — offer closed 2026-07-15
    standardPriceTwdMonthly: 9000,
    // 2026-05-14 (CJ Solo pivot): USD is the canonical price.
    priceUsdMonthly: 300,                  // standard US$300
    priceUsdAnnually: 3000,                // standard annual US$3,000 (×10, 2 months free)
    earlyBirdPriceUsdMonthly: 100,         // grandfathered only — offer closed 2026-07-15
    standardPriceUsdMonthly: 300,
    trialDays: 0,
    quota: {
      // 2026-05-14: legacy per-task quotas removed (-1).
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: -1,
      video_gen: 0,                // 影片暫時下架（roadmap 加購包）
      brands: 1,                   // ← Solo = 1 個品牌
      fb_publish: -1,
      // 2026-09-06：專業版 5 席。理由是審核工作流 —— 產出的人與放行的人
      // 必須分開，5 席對應行銷／廣告／成效／中階主管（審核）／負責人。
      team_members: 5,
      multi_client: false,
      // 2026-05-14 (CJ「無限文案 + 無限圖」): pointsPerCycle = -1 means
      // points gating is bypassed. Daily LLM cost cap (preflightCostCheck
      // → $5/day) is the real fair-use guard for abuse cases.
      pointsPerCycle: -1,
      pointsCycleDays: 30,
      runsPerCycle: -1,   // Solo: unlimited runs
      platforms: 5,
      platformSwapDays: 30,
      ownTaskCards: 10,
      viralTaskCards: true,
      products: 10,
      eventsPerCycle: 1,
    },
    features: [
      "1 個品牌 · 1 位用戶",
      "無限文案（單篇 / 套組 / 企劃全任務模板）",
      "無限 AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
      "電子發票",
      "影片：roadmap 加購包",
      "改名 / 換品牌：聯繫客服",
    ],
    highlight: "US$300／月",
  },

  /** OnBrand Studio — for solo brand owners managing 2-3 brands.
   *  2026-05-14 (CJ pricing pivot — replaces old drop_team Team plan):
   *    - 早鳥 US$250/月
   *    - 標準 US$750/月
   *    - 最多 3 個品牌（self-serve 切換、不用聯繫客服）
   *    - 1 位用戶（5 user seats 是 Q3+ roadmap）
   *    - Fair-use: 內部每日 LLM cost cap = $15
   */
  drop_team: {
    code: "drop_team",
    name: "OnBrand Studio",
    priceTwdMonthly: 22500,                 // standard (US$750 @ 30)
    priceTwdAnnually: 225000,
    earlyBirdPriceTwdMonthly: 7500,         // early-bird (US$250 @ 30)
    standardPriceTwdMonthly: 22500,
    priceUsdMonthly: 750,                   // standard US$750
    priceUsdAnnually: 7500,                 // 10× monthly
    earlyBirdPriceUsdMonthly: 250,          // early-bird US$250
    standardPriceUsdMonthly: 750,
    trialDays: 0,
    quota: {
      task_30s: -1, task_60s: -1, task_99s: -1, image_gen: -1,
      video_gen: 0,                // 影片暫時下架
      brands: 3,                   // ← Studio = 最多 3 個品牌
      fb_publish: -1,
      team_members: 1,             // 5 user seats 是 Q3+ roadmap
      multi_client: true,
      pointsPerCycle: -1,          // 無限文案 + 無限圖（fair-use daily $15 cap）
      pointsCycleDays: 30,
      runsPerCycle: -1,            // Studio: unlimited runs
      platforms: -1,
      platformSwapDays: 0,
      ownTaskCards: -1,
      viralTaskCards: true,
      products: -1,
      eventsPerCycle: -1,
    },
    features: [
      "最多 3 個品牌（自助切換）",
      "每個品牌都是 Solo 規格（無限文案 + 圖）",
      "FB / IG 直接發布 + 排程（無限）",
      "跨品牌切換、跨品牌數據比較",
      "電子發票（B2B）",
      "1 位用戶（多 user seats 是 roadmap）",
    ],
    highlight: "適合 Solo 多品牌主 / 內部工作室",
    prioritySupport: false,
  },

  /** OnBrand Agency — unlimited users, white label, API access. */
  drop_agency: {
    code: "drop_agency",
    name: "OnBrand Agency · 代理商",
    priceTwdMonthly: 14990,
    priceTwdAnnually: 149900,
    priceUsdMonthly: 469,
    priceUsdAnnually: 4690,
    trialDays: 0,
    quota: {
      task_30s: -1, task_60s: -1, task_99s: -1, image_gen: -1,
      video_gen: 150,
      brands: -1,
      fb_publish: -1,
      team_members: -1,
      multi_client: true,
      // Agency plan = 50,000 pts/month (~17× solo, 3× team)
      pointsPerCycle: 50000,
      pointsCycleDays: 30,
      runsPerCycle: -1,
      platforms: -1,
      platformSwapDays: 0,
      ownTaskCards: -1,
      viralTaskCards: true,
      products: -1,
      eventsPerCycle: -1,
    },
    features: [
      "無限用戶 · 無限品牌",
      "White Label（換 logo + 公司名）",
      "API 存取（接你自己的 workflow）",
      "優先客服 + 1 對 1 onboarding",
      "OnBrand Team 全部功能",
    ],
    whiteLabel: true,
    apiAccess: true,
    prioritySupport: true,
  },

  /** Enterprise — quote-based, contact sales. */
  enterprise: {
    code: "enterprise",
    name: "企業版",
    priceTwdMonthly: -1,
    priceTwdAnnually: -1,
    trialDays: 0,
    quota: {
      task_30s: -1, task_60s: -1, task_99s: -1, image_gen: -1, video_gen: -1,
      brands: -1, fb_publish: -1, team_members: -1, multi_client: true,
      // Enterprise = unlimited points (-1 == bypass check)
      pointsPerCycle: -1,
      pointsCycleDays: 30,
      runsPerCycle: -1,
      platforms: -1,
      platformSwapDays: 0,
      ownTaskCards: -1,
      viralTaskCards: true,
      products: -1,
      eventsPerCycle: -1,
    },
    features: [
      "無限額度",
      "客製品牌風格庫 + LoRA",
      "SLA 服務承諾",
      "專屬客戶成功經理",
      "On-prem 部署選項",
    ],
    whiteLabel: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

export function getPlan(code: PlanCode | string): Plan {
  return PLANS[code as PlanCode] ?? PLANS.trial;
}

/**
 * 2026-05-12 — resolve the EFFECTIVE monthly price for a specific user.
 * Hierarchy (high → low):
 *   1. users.lockedPriceTwdMonthly — explicit override (custom deals)
 *   2. earlyBird flag → plan.earlyBirdPriceTwdMonthly
 *   3. plan.priceTwdMonthly (standard sticker)
 */
/**
 * 2026-05-14 (CJ「美金為準，每天匯率動」): USD is the single source of
 * truth. TWD prices are derived by multiplying USD × the caller-supplied
 * `usdToTwd` rate (fetched daily from open.er-api.com). The TWD fields
 * still on the Plan objects are LEGACY — only used as a fallback for
 * lockedPriceTwdMonthly grandfathered users.
 */
export function getEffectivePrice(
  plan: Plan,
  userFlags: {
    earlyBird?: number | boolean;
    lockedPriceTwdMonthly?: number | null;
    currency?: Currency;
    /** Live USD→TWD rate. Caller fetches via fx.getUsdToTwd(). */
    usdToTwd: number;
  },
): { monthly: number; annually: number; isEarlyBird: boolean; isLocked: boolean; currency: Currency; usdToTwd: number } {
  const currency: Currency = userFlags.currency ?? "USD";
  const rate = userFlags.usdToTwd;

  // 1. Locked custom price (always stored in TWD — legacy grandfathered deals)
  const locked = userFlags.lockedPriceTwdMonthly;
  if (typeof locked === "number" && locked > 0) {
    if (currency === "USD") {
      const usd = Math.round((locked / rate) * 100) / 100;
      return { monthly: usd, annually: Math.round(usd * 11 * 100) / 100, isEarlyBird: false, isLocked: true, currency, usdToTwd: rate };
    }
    return { monthly: locked, annually: locked * 11, isEarlyBird: false, isLocked: true, currency, usdToTwd: rate };
  }

  // 2. Pick the right USD anchor (early-bird vs standard)
  const isEarlyBird = Boolean(userFlags.earlyBird);
  const usdMonthly = isEarlyBird && plan.earlyBirdPriceUsdMonthly && plan.earlyBirdPriceUsdMonthly > 0
    ? plan.earlyBirdPriceUsdMonthly
    : (plan.priceUsdMonthly ?? 0);
  // Annual = 11× monthly (1 month free / ~8% saving).
  // Starter is an exception: its annual is exactly 12× ($25×12=$300, no saving).
  const isStarter = plan.code === "drop_starter";
  const annualMultiplier = isStarter ? 12 : 11;
  const usdAnnually = isEarlyBird && plan.earlyBirdPriceUsdMonthly && plan.earlyBirdPriceUsdMonthly > 0
    ? plan.earlyBirdPriceUsdMonthly * annualMultiplier
    : (plan.priceUsdAnnually ?? usdMonthly * annualMultiplier);

  // 3. Return in requested currency
  if (currency === "USD") {
    return { monthly: usdMonthly, annually: usdAnnually, isEarlyBird, isLocked: false, currency, usdToTwd: rate };
  }

  // TWD: use hardcoded plan prices — not exchange-rate derived — so the number
  // never fluctuates day-to-day. Annual = monthly × 10 (2 months free) for both plans.
  const twdMonthly = isEarlyBird && plan.earlyBirdPriceTwdMonthly && plan.earlyBirdPriceTwdMonthly > 0
    ? plan.earlyBirdPriceTwdMonthly
    : (plan.priceTwdMonthly ?? Math.round(usdMonthly * rate));
  // 2026-07-15: priceTwdAnnually now holds the STANDARD annual (offer closed).
  // Grandfathered early-bird users derive annual from their locked monthly ×10
  // (same 2-months-free rule; matches the old 7,500 / 30,000 values exactly).
  const twdAnnually = isEarlyBird && plan.earlyBirdPriceTwdMonthly && plan.earlyBirdPriceTwdMonthly > 0
    ? plan.earlyBirdPriceTwdMonthly * 10
    : (plan.priceTwdAnnually && plan.priceTwdAnnually > 0 ? plan.priceTwdAnnually : twdMonthly * 10);
  return {
    monthly:  twdMonthly,
    annually: twdAnnually,
    isEarlyBird,
    isLocked: false,
    currency,
    usdToTwd: rate,
  };
}

/**
 * Should new sign-ups today get the early-bird flag?
 * Controlled by env ONBRAND_PROMO_ACTIVE.
 *
 * 2026-07-29 (bug found — pricing page showed NT$2,250 standard while
 * Stripe checkout charged NT$750 early-bird): the offer was declared
 * closed on 2026-07-15 ("取消早鳥優惠，只呈現原價" — see PLANS comments),
 * but this default was left at ACTIVE, and ONBRAND_PROMO_ACTIVE was never
 * set on the VM. Every signup for 14 days kept getting grandfathered.
 * Defaults to INACTIVE now — fail closed, matching the already-decided
 * pricing. Flip the env var back on if CJ ever reopens the promo.
 */
export function isPromoActiveForNewSignups(): boolean {
  const v = (process.env.ONBRAND_PROMO_ACTIVE ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Format NTD for display: 990 → 'NT$ 990' */
export function formatTwd(amount: number): string {
  if (amount < 0) return "聯繫業務";
  if (amount === 0) return "免費";
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

/** Format quota number: -1 → '無限', else integer with thousand sep */
export function formatQuota(n: number): string {
  if (n < 0) return "無限";
  return n.toLocaleString("zh-TW");
}

export const SUPPORT_EMAIL = "sowork@sowork.ai";
export const SUPPORT_LINE_AT = "@sowork";  // placeholder; CJ to register
export const PARENT_DOMAIN = "https://www.sowork.ai";
export const PRODUCT_DOMAIN = "https://onbrand.sowork.ai";
export const COMPANY_NAME = "摘星社群行銷顧問股份有限公司";
export const COMPANY_TAX_ID = "—";  // CJ to fill 統一編號

/**
 * 2026-09-06 —— 加購方案。**兩者都必須綁 drop_pro（NT$9,000/月）訂閱。**
 *
 * 綁定不是為了多賣，是為了讓導入費站得住：策略顧問導入的交付成本約
 * NT$81,000（8 張客製卡 12hr ＋ SKILL 整理 6hr ＋ 品牌大腦 4hr ＋
 * 產品策略 5hr = 27hr × 3,000），售價 80,000 單看是打平。綁上訂閱之後，
 * 導入當月打平、之後每月淨賺約 8,000 —— 一次性費用不進 ARR，價值要落在月費。
 */
export const ADDONS = {
  strategy_onboarding: {
    id: "strategy_onboarding",
    labelZh: "策略顧問導入",
    labelEn: "Strategy Onboarding",
    oneTimeTwd: 80000,
    monthlyTwd: 0,
    requiresPlan: "drop_pro" as PlanCode,
    /** 含 8 張客製任務卡；第 9 張起單張加購。 */
    includedCustomCards: 8,
    extraCardTwd: 25000,
    scopeZh: [
      "內部 AI 寫文 SKILL 盤點與整理",
      "客製任務卡建置 8 張（來源＝客戶自有方法論）",
      "品牌大腦建置",
      "產品策略建置",
    ],
  },
  ecom_reporting: {
    id: "ecom_reporting",
    labelZh: "電商營運報告建置",
    labelEn: "E-commerce Ops Reporting",
    oneTimeTwd: 48000,
    monthlyTwd: 25000,
    requiresPlan: "drop_pro" as PlanCode,
    /** 建置範圍：1 品牌 / 1 市場 / 20 品項內。 */
    scope: { brands: 1, markets: 1, skus: 20 },
  },
} as const;
export type AddonId = keyof typeof ADDONS;

/**
 * 電商營運報告的品項級距加購。超過 200 品項或多商店 → 專案報價（回 null）。
 */
export const ECOM_SKU_TIERS = [
  { maxSkus: 20,  oneTimeTwd: 0,     monthlyTwd: 0 },
  { maxSkus: 50,  oneTimeTwd: 8000,  monthlyTwd: 5000 },
  { maxSkus: 100, oneTimeTwd: 12000, monthlyTwd: 10000 },
  { maxSkus: 200, oneTimeTwd: 18000, monthlyTwd: 15000 },
] as const;

/** 依品項數算加購。回 null 代表落在「專案報價」區間。 */
export function ecomSkuSurcharge(skus: number): { oneTimeTwd: number; monthlyTwd: number } | null {
  for (const t of ECOM_SKU_TIERS) {
    if (skus <= t.maxSkus) return { oneTimeTwd: t.oneTimeTwd, monthlyTwd: t.monthlyTwd };
  }
  return null;
}

/** 這個加購能不能賣給這個方案的用戶。 */
export function addonAvailableFor(addon: AddonId, plan: PlanCode): boolean {
  return ADDONS[addon].requiresPlan === plan || plan === "enterprise";
}
