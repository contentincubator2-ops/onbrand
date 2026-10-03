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
import { CATALOG_FIGURES } from "./catalogFigures";

// 2026-05-11 — multi-tier for $1M ARR strategy. Solo / Team / Agency
// split (CJ「Team / Agency 方案是 $1M 真正的槓桿」).
export type PlanCode = "trial" | "drop_starter" | "drop_pro" | "enterprise";

export interface PlanQuota {
  /** -1 means unlimited */
  task_30s: number;
  task_60s: number;
  task_99s: number;
  image_gen: number;
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
  /**
   * 2026-09-08 對照價目表：審核工作流列在「專業」的其他項目下，基礎沒有。
   * 5 席的理由就是它（產出者與放行者分開），所以 2 席的基礎方案不開。
   * reviewRouter 的 submit／approve／requestRevision 用 assertReviewAllowed 擋。
   */
  reviewWorkflow: boolean;
  /**
   * 2026-09-08 (CJ「策略監測，定義在 9000 的方案」)：為品牌與產品設監測，
   * 受眾或競爭者有變化時亮出情報並提醒回工作台調整錨點。基礎沒有 ——
   * 它是「有一組人在替你看市場」的承諾，跟策略工作台同一級。
   * strategyMonitorRouter 的 setWatch／scanNow 用 assertStrategyMonitoringAllowed 擋。
   */
  strategyMonitoring: boolean;
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

/** 2026-05-14: per-action point costs. Keep this single-source so
 *  pricing changes don't drift across the codebase. */
export const POINT_COSTS = {
  task_30s:        30,
  task_60s:        60,
  task_99s:        99,
  image_gpt:      100,   // OpenAI gpt-image-2 — the default for every image
  image_imagen:    50,   // Google Nano Banana — only when the user picks it
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
  /** onBrand Studio 基礎版 — NT$2,250／月，2 席。
   *  2026-09-06 Word 價目表：1 個品牌、12 通路選 2（每月可換）、自建卡 3 張、
   *  可用任務卡 213 張（得獎 99 ＋ 標竿 63 ＋ 平台通則 51；2026-09-21 對齊實際目錄）、成效層示意版；
   *  執行次數不限、企劃開放（兩級差在能力不在用量）。
   */
  drop_starter: {
    code: "drop_starter",
    name: "onBrand Studio 基礎版",
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
      reviewWorkflow: false,
      strategyMonitoring: false,
    },
    features: [
      "1 個品牌 · 2 席",
      `${CATALOG_FIGURES.channels} 個通路選 2（每月可更換）`,
      "品牌定位 · 自建任務卡 3 張（存入品牌任務庫）",
      "任務卡：你替品牌自建的卡（爆款結構卡屬於專業方案）",
      "執行次數不限 · 企劃任務開放",
      "排程、日曆與 FB／IG 直接發布",
      "成效層早期預覽（模擬數據）；真實串接是重點投資方向，專業方案優先加購",
      "電子發票（個人 / B2B）",
    ],
    highlight: "NT$2,250／月 · 2 席",
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
      reviewWorkflow: false,
      strategyMonitoring: false,
    },
    features: [
      "1000 點試用額度（不重置，用完即停）",
      "全任務模板（≈10–16 篇文案或 10 張圖）",
      "7 天時間上限（先到先停）",
      "Email / LINE 客服",
      "免綁信用卡",
    ],
  },

  /** onBrand Studio 專業版 — NT$9,000／月，5 席。
   *  2026-09-06 Word 價目表：1 個品牌、12 通路選 5（每月可換）、品牌＋產品 10 個
   *  ＋活動每月 1 次定位、自建卡 10 張、259 張任務卡（含爆款結構 46 張，每月更新）、
   *  審核工作流、成效層可加購。5 席是審核工作流的要求：產出者與放行者分開。
   *  2026-09-08 加：策略監測（品牌、產品與競爭者變化提醒）定義在這一級。
   *  Fair-use: 內部每日 LLM cost cap = $5（UI 不顯示）。
   */
  drop_pro: {
    code: "drop_pro",
    name: "onBrand Studio 專業版",
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
      reviewWorkflow: true,
      strategyMonitoring: true,
    },
    features: [
      "1 個品牌 · 5 席（含審核工作流）",
      `${CATALOG_FIGURES.channels} 個通路選 5（每月可更換）`,
      "品牌定位 ＋ 產品定位 10 個 ＋ 活動定位每月 1 次 · 自建任務卡 10 張",
      `每月更新的爆款結構卡 ＋ 品牌自建卡`,
      "執行次數不限 · 企劃任務開放",
      "排程、日曆與 FB／IG 直接發布 · 策略工作台",
      "策略監測：品牌、產品與競爭者有變化時提醒調整",
      "成效層早期預覽 ＋ 優先加購真實串接 · 電子發票",
    ],
    highlight: "NT$9,000／月 · 5 席",
  },


  /** Enterprise — quote-based, contact sales. */
  enterprise: {
    code: "enterprise",
    name: "企業客製版",
    priceTwdMonthly: -1,
    priceTwdAnnually: -1,
    trialDays: 0,
    quota: {
      task_30s: -1, task_60s: -1, task_99s: -1, image_gen: -1,
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
      reviewWorkflow: true,
      strategyMonitoring: true,
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
  // 2026-09-07 Studio／Agency 方案下架（CJ「沒有 studio agency 方案了」）。
  // 舊資料若還存著這兩個 code，當專業方案處理，不要掉回 trial。
  if (code === "drop_team" || code === "drop_agency") return PLANS.drop_pro;
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
