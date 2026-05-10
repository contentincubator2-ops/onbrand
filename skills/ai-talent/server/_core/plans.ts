/**
 * Drop Pro plan config — single tier, monthly fixed.
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

export type PlanCode = "trial" | "drop_pro" | "enterprise";

export interface PlanQuota {
  /** -1 means unlimited */
  task_30s: number;
  task_60s: number;
  task_99s: number;
  image_gen: number;
  video_gen: number;
  brands: number;
  fb_publish: number;
}

export interface Plan {
  code: PlanCode;
  name: string;
  priceTwdMonthly: number;     // NTD per month
  priceTwdAnnually: number;    // NTD per year (discounted)
  trialDays: number;
  quota: PlanQuota;
  features: string[];          // human-readable bullets for /pricing
}

export const PLANS: Record<PlanCode, Plan> = {
  /** New users get 7 days of full-feature access without a credit card. */
  trial: {
    code: "trial",
    name: "7 天免費試用",
    priceTwdMonthly: 0,
    priceTwdAnnually: 0,
    trialDays: 7,
    quota: {
      task_30s: -1,        // unlimited (cheap)
      task_60s: 50,
      task_99s: 20,
      image_gen: 150,
      video_gen: 10,
      brands: 5,
      fb_publish: -1,
    },
    features: [
      "所有 90+ 任務模板",
      "完整 7 天內容企劃台",
      "Email / LINE 客服",
      "免綁信用卡",
    ],
  },

  /** Paying tier — same quota as trial. After day 7, payment kicks in. */
  drop_pro: {
    code: "drop_pro",
    name: "Drop Pro",
    priceTwdMonthly: 990,
    priceTwdAnnually: 9900,    // = 12 months × 825 NTD (省一個月 = 17%)
    trialDays: 0,
    quota: {
      task_30s: -1,
      task_60s: 50,
      task_99s: 20,
      image_gen: 150,
      video_gen: 10,
      brands: 5,
      fb_publish: -1,
    },
    features: [
      "所有 90+ 任務模板",
      "完整 7 天內容企劃台",
      "5 個品牌資產管理",
      "圖片 + 影片 AI 生成",
      "FB 直接發布（無限）",
      "Email / LINE 客服",
      "電子發票",
    ],
  },

  /** Enterprise — quote-based, contact sales. */
  enterprise: {
    code: "enterprise",
    name: "企業版",
    priceTwdMonthly: -1,       // contact sales
    priceTwdAnnually: -1,
    trialDays: 0,
    quota: {
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: -1,
      video_gen: -1,
      brands: -1,
      fb_publish: -1,
    },
    features: [
      "無限額度",
      "團隊成員",
      "SLA 服務承諾",
      "客製品牌風格庫",
      "專屬客戶成功經理",
    ],
  },
};

export function getPlan(code: PlanCode | string): Plan {
  return PLANS[code as PlanCode] ?? PLANS.trial;
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

export const SUPPORT_EMAIL = "drop@sowork.ai";
export const SUPPORT_LINE_AT = "@sowork";  // placeholder; CJ to register
export const PARENT_DOMAIN = "https://www.sowork.ai";
export const PRODUCT_DOMAIN = "https://drop.sowork.ai";
export const COMPANY_NAME = "摘星社群行銷顧問股份有限公司";
export const COMPANY_TAX_ID = "—";  // CJ to fill 統一編號
