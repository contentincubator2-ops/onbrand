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
}

export interface Plan {
  code: PlanCode;
  name: string;
  priceTwdMonthly: number;     // NTD per month
  priceTwdAnnually: number;    // NTD per year (discounted)
  trialDays: number;
  quota: PlanQuota;
  features: string[];          // human-readable bullets for /pricing
  /** Tier highlight on /pricing (e.g., 「最受歡迎」). */
  highlight?: string;
  /** 2026-05-11 — white-label / API / priority support flags. */
  whiteLabel?: boolean;
  apiAccess?: boolean;
  prioritySupport?: boolean;
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
      task_30s: -1,
      task_60s: 50,
      task_99s: 20,
      image_gen: 150,
      video_gen: 10,
      brands: 5,
      fb_publish: -1,
      team_members: 1,
      multi_client: false,
    },
    features: [
      "所有 90+ 任務模板",
      "完整 7 天內容企劃台",
      "Email / LINE 客服",
      "免綁信用卡",
    ],
  },

  /** Drop Pro — Solo plan. 1 user, single workspace. */
  drop_pro: {
    code: "drop_pro",
    name: "Drop Pro · 個人",
    priceTwdMonthly: 990,
    priceTwdAnnually: 9900,
    trialDays: 0,
    quota: {
      task_30s: -1,
      task_60s: 50,
      task_99s: 20,
      image_gen: 150,
      video_gen: 10,
      brands: 5,
      fb_publish: -1,
      team_members: 1,
      multi_client: false,
    },
    features: [
      "1 位用戶 · 5 個品牌",
      "所有 90+ 任務模板",
      "FB 直接發布 + 排程（無限）",
      "圖片 + 影片 AI 生成",
      "電子發票",
    ],
  },

  /** Drop Team — 5 users, multi-client workspace, monthly client reports. */
  drop_team: {
    code: "drop_team",
    name: "Drop Team · 小團隊",
    priceTwdMonthly: 4990,
    priceTwdAnnually: 49900,    // 12 × 4158 NTD (省 17%)
    trialDays: 0,
    quota: {
      task_30s: -1,
      task_60s: 250,
      task_99s: 100,
      image_gen: 600,
      video_gen: 40,
      brands: 20,
      fb_publish: -1,
      team_members: 5,
      multi_client: true,
    },
    features: [
      "5 位用戶 · 20 個品牌",
      "多客戶 workspace（一個帳號管多個客戶）",
      "邀請客戶看自己品牌（viewer 角色）",
      "月度客戶工作報表",
      "Drop Pro 全部功能",
    ],
    highlight: "最適合 Agency",
    prioritySupport: false,
  },

  /** Drop Agency — unlimited users, white label, API access. */
  drop_agency: {
    code: "drop_agency",
    name: "Drop Agency · 代理商",
    priceTwdMonthly: 14990,
    priceTwdAnnually: 149900,
    trialDays: 0,
    quota: {
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: 2000,
      video_gen: 150,
      brands: -1,
      fb_publish: -1,
      team_members: -1,
      multi_client: true,
    },
    features: [
      "無限用戶 · 無限品牌",
      "White Label（換 logo + 公司名）",
      "API 存取（接你自己的 workflow）",
      "優先客服 + 1 對 1 onboarding",
      "Drop Team 全部功能",
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
      task_30s: -1,
      task_60s: -1,
      task_99s: -1,
      image_gen: -1,
      video_gen: -1,
      brands: -1,
      fb_publish: -1,
      team_members: -1,
      multi_client: true,
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
export const PRODUCT_DOMAIN = "https://drop.sowork.ai";
export const COMPANY_NAME = "摘星社群行銷顧問股份有限公司";
export const COMPANY_TAX_ID = "—";  // CJ to fill 統一編號
