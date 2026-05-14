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
 * Heavy-use cost @ 80% caps: ~$13 USD ≈ NTD 400, vs NTD 990 revenue → 60% margin.
 */

// 2026-05-11 — multi-tier for $1M ARR strategy. Solo / Team / Agency
// split (CJ「Team / Agency 方案是 $1M 真正的槓桿」).
export type PlanCode = "trial" | "drop_pro" | "drop_team" | "drop_agency" | "enterprise";

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
   *  (pointsPerCycle and pointsCycleDays=7); paid plans refresh monthly. */
  pointsPerCycle: number;
  pointsCycleDays: number;   // 7 for trial, 30 for monthly subs
}

/** 2026-05-14: top-up packs (加購點數). Volume discount — bigger pack
 *  = better per-point rate. Same point unit as plan allocation; topup
 *  points NEVER expire (vs monthly refill which resets balance). */
// 2026-05-14 (CJ「美金為準，每天匯率動」): USD is the only source of truth.
// TWD amounts are derived at runtime from the live FX rate
// (server/_core/fx.ts → getUsdToTwd). usdPerPoint is implied:
// small=$0.010/pt, medium=$0.008/pt (20% off), large=$0.007/pt (30% off).
export const TOPUP_PACKS = {
  small:  { id: "small",  points: 1000,  usdAmount: 10, usdPerPoint: 0.0100, discountPct: 0,  labelZh: "小份",  labelEn: "Small" },
  medium: { id: "medium", points: 5000,  usdAmount: 40, usdPerPoint: 0.0080, discountPct: 20, labelZh: "中份",  labelEn: "Medium" },
  large:  { id: "large",  points: 10000, usdAmount: 70, usdPerPoint: 0.0070, discountPct: 30, labelZh: "大份",  labelEn: "Large" },
} as const;
export type TopupPackId = keyof typeof TOPUP_PACKS;

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

/** Stripe-compatible unit_amount. TWD is zero-decimal; USD needs cents. */
export function toStripeUnitAmount(amount: number, currency: Currency): number {
  return currency === "TWD" ? Math.round(amount) : Math.round(amount * 100);
}

/** Resolve a top-up pack's amount in the caller's currency at the live rate. */
export function topupAmountIn(
  pack: { usdAmount: number; usdPerPoint: number },
  currency: Currency,
  usdToTwd: number,
): { amount: number; perPoint: number } {
  if (currency === "USD") return { amount: pack.usdAmount, perPoint: pack.usdPerPoint };
  return {
    amount: Math.round(pack.usdAmount * usdToTwd),
    perPoint: Math.round(pack.usdPerPoint * usdToTwd * 100) / 100,
  };
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
  /** New users get 7 days of full-feature access without a credit card.
   *  2026-05-12: trial quotas reduced + video stripped (matches the new
   *  OnBrand 個人 plan minus 1/3 — generous enough to evaluate, tight
   *  enough that they upgrade.) */
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
      // Trial = 300 points (= ~3× 99s tasks or 10× 30s tasks)
      pointsPerCycle: 300,
      pointsCycleDays: 7,
    },
    features: [
      "30s / 60s / 99s 任務模板（額度有限）",
      "30 張 AI 圖預覽試用",
      "7 天完整內容企劃台",
      "Email / LINE 客服",
      "免綁信用卡",
    ],
  },

  /** OnBrand 個人 — Solo plan. 1 user, single workspace.
   *  2026-05-12 (CJ pricing decision):
   *    - 早鳥價 NT$ 900/月 (現價)
   *    - 標準價 NT$ 1,500/月 (之後)
   *    - 影片功能不穩，先從方案抽掉
   *    - 加購包之後上線（文字 + 圖像，不含影片）
   */
  drop_pro: {
    code: "drop_pro",
    name: "OnBrand 個人",
    priceTwdMonthly: 1500,                 // 標準價（新用戶看到的）
    priceTwdAnnually: 15000,               // 標準年費
    earlyBirdPriceTwdMonthly: 900,         // 早鳥永久價（grandfathered 用戶）
    standardPriceTwdMonthly: 1500,         // 同 priceTwdMonthly，明示語意
    // 2026-05-14 (CJ「美金為準」): USD = primary; TWD derives from it at NT$30/USD.
    priceUsdMonthly: 50,                   // standard USD (= NT$1500 @ 30)
    priceUsdAnnually: 500,                 // 10× monthly
    earlyBirdPriceUsdMonthly: 30,          // early-bird USD (= NT$900 @ 30)
    standardPriceUsdMonthly: 50,
    trialDays: 0,
    quota: {
      // 2026-05-14: legacy per-task quotas removed (-1). Gating is
      // now purely point-based — see pointsPerCycle below.
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: -1,
      video_gen: 0,                // 2026-05-12: 影片暫時下架
      brands: 1,
      fb_publish: -1,
      team_members: 1,
      multi_client: false,
      // Solo plan = 3,000 points / month
      //   = 100× 30s tasks, or 50× 60s, or 30× 99s, or 100× Flux images
      //   = ~10× the trial allocation
      // Worst-case cost (all 99s @ NT$15): NT$ 450 → 50% margin vs NT$900
      pointsPerCycle: 3000,
      pointsCycleDays: 30,
    },
    features: [
      "1 位用戶 · 1 個品牌",
      "30s / 60s / 99s 全部任務模板",
      "150 張 AI 圖（Flux / GPT Image-1 / Imagen）",
      "FB 直接發布 + 排程（無限）",
      "電子發票",
      "影片功能優化中（之後開放加購）",
    ],
    highlight: "早鳥 NT$ 900／正常 NT$ 1,500",
  },

  /** OnBrand Team — 5 users, multi-client workspace, monthly client reports. */
  drop_team: {
    code: "drop_team",
    name: "OnBrand Team · 小團隊",
    priceTwdMonthly: 4990,
    priceTwdAnnually: 49900,    // 12 × 4158 NTD (省 17%)
    priceUsdMonthly: 156,
    priceUsdAnnually: 1560,
    trialDays: 0,
    quota: {
      task_30s: -1, task_60s: -1, task_99s: -1, image_gen: -1,
      video_gen: 40,
      brands: 20,
      fb_publish: -1,
      team_members: 5,
      multi_client: true,
      // Team plan = 15,000 pts/month (5× solo)
      pointsPerCycle: 15000,
      pointsCycleDays: 30,
    },
    features: [
      "5 位用戶 · 20 個品牌",
      "多客戶 workspace（一個帳號管多個客戶）",
      "邀請客戶看自己品牌（viewer 角色）",
      "月度客戶工作報表",
      "OnBrand Pro 全部功能",
    ],
    highlight: "最適合 Agency",
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
      return { monthly: usd, annually: Math.round(usd * 10 * 100) / 100, isEarlyBird: false, isLocked: true, currency, usdToTwd: rate };
    }
    return { monthly: locked, annually: locked * 10, isEarlyBird: false, isLocked: true, currency, usdToTwd: rate };
  }

  // 2. Pick the right USD anchor (early-bird vs standard)
  const isEarlyBird = Boolean(userFlags.earlyBird);
  const usdMonthly = isEarlyBird && plan.earlyBirdPriceUsdMonthly && plan.earlyBirdPriceUsdMonthly > 0
    ? plan.earlyBirdPriceUsdMonthly
    : (plan.priceUsdMonthly ?? 0);
  // Annual = 10× monthly (saves 17%; matches existing UI copy)
  const usdAnnually = isEarlyBird && plan.earlyBirdPriceUsdMonthly && plan.earlyBirdPriceUsdMonthly > 0
    ? plan.earlyBirdPriceUsdMonthly * 10
    : (plan.priceUsdAnnually ?? usdMonthly * 10);

  // 3. Return in requested currency
  if (currency === "USD") {
    return { monthly: usdMonthly, annually: usdAnnually, isEarlyBird, isLocked: false, currency, usdToTwd: rate };
  }
  return {
    monthly:  Math.round(usdMonthly  * rate),
    annually: Math.round(usdAnnually * rate),
    isEarlyBird,
    isLocked: false,
    currency,
    usdToTwd: rate,
  };
}

/**
 * Should new sign-ups today get the early-bird flag?
 * Controlled by env ONBRAND_PROMO_ACTIVE. Defaults to true (i.e. promo
 * active) until CJ flips it off.
 */
export function isPromoActiveForNewSignups(): boolean {
  const v = (process.env.ONBRAND_PROMO_ACTIVE ?? "1").toLowerCase();
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

export const SUPPORT_EMAIL = "sowork@sowork.tw";
export const SUPPORT_LINE_AT = "@sowork";  // placeholder; CJ to register
export const PARENT_DOMAIN = "https://www.sowork.ai";
export const PRODUCT_DOMAIN = "https://onbrand.sowork.ai";
export const COMPANY_NAME = "摘星社群行銷顧問股份有限公司";
export const COMPANY_TAX_ID = "—";  // CJ to fill 統一編號
