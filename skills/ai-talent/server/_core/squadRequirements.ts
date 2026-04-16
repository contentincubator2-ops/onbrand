/**
 * squadRequirements.ts
 *
 * Static per-squad requirements config.
 * Defines what data / access each squad needs, plus what it can deliver.
 *
 * Lookup priority:
 *   1. Exact squad slug  (e.g. "sowork-brand-positioning")
 *   2. Workspace key     (e.g. "strategy", "facebook")
 *   3. DEFAULT_CONFIG    (generic fallback)
 */

export interface SquadRequirement {
  id: string;
  label: string;
  type: "text" | "url" | "api" | "select" | "boolean";
  required: boolean;
  options?: string[];   // for type="select"
  hint?: string;
}

export interface SquadRequirementsConfig {
  requirements: SquadRequirement[];
  /**
   * Outputs map.
   * "default"    → always deliverable
   * "with_<reqId>" → unlocked when that requirement is filled
   */
  outputs: Record<string, string[]>;
}

// ─── Default fallback ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SquadRequirementsConfig = {
  requirements: [
    { id: "target_audience", label: "目標受眾",  type: "text",   required: true,  hint: "例：25-40 歲職場女性、對健康生活感興趣" },
    { id: "campaign_goal",   label: "任務目標",  type: "text",   required: true,  hint: "例：提升品牌知名度、增加 30% 轉換率" },
    { id: "budget_range",    label: "預算範圍",  type: "select", required: false,
      options: ["< NT$10 萬", "NT$10-50 萬", "NT$50-200 萬", "> NT$200 萬"] },
    { id: "timeline",        label: "時程需求",  type: "text",   required: false, hint: "例：4 週內、本季度末" },
  ],
  outputs: {
    default: ["策略建議書", "執行計劃", "成效追蹤框架"],
  },
};

// ─── Per-squad / per-workspace config ────────────────────────────────────────

export const SQUAD_REQUIREMENTS_MAP: Record<string, SquadRequirementsConfig> = {

  // ── SoWork 品牌定位 Squad ──────────────────────────────────────────────────
  "sowork-brand-positioning": {
    requirements: [
      { id: "brand_name",          label: "品牌名稱",         type: "text",    required: true  },
      { id: "brand_url",           label: "官網 URL",          type: "url",     required: false, hint: "選填：有網址可做官網與定位一致性診斷" },
      { id: "target_audience",     label: "目標受眾",          type: "text",    required: true,  hint: "例：25-40 歲職場女性、B2B SaaS 決策者" },
      { id: "competitors",         label: "主要競品（1-3 個）", type: "text",    required: false, hint: "例：UNIQLO、Zara、本土品牌 X" },
      { id: "current_positioning", label: "目前品牌定位描述",   type: "text",    required: false, hint: "你認為品牌現在在客戶心中的樣子" },
      { id: "unique_value",        label: "品牌獨特價值主張",   type: "text",    required: false, hint: "你認為品牌最大的差異點是什麼" },
    ],
    outputs: {
      default:           ["品牌定位報告", "競品分析地圖", "差異化策略建議", "定位聲明草稿"],
      with_brand_url:    ["官網與定位一致性診斷", "SEO 關鍵字建議"],
      with_competitors:  ["詳細競品對標分析", "市場缺口識別"],
    },
  },

  // ── Website Rebuild ────────────────────────────────────────────────────────
  "tw-website-rebuild": {
    requirements: [
      { id: "website_url",      label: "官網 URL",                   type: "url",     required: true  },
      { id: "ga4_access",       label: "GA4 分析存取",               type: "api",     required: false, hint: "選填：有存取可做流量診斷" },
      { id: "cms_type",         label: "CMS 類型",                   type: "select",  required: true,
        options: ["WordPress", "Webflow", "Wix", "Shopify", "自建", "其他"] },
      { id: "target_audience",  label: "目標受眾描述",               type: "text",    required: true  },
      { id: "redesign_goal",    label: "改版目標",                   type: "text",    required: true,  hint: "例：提升轉換率、強化品牌形象" },
    ],
    outputs: {
      default:    ["頁面架構建議", "文案重寫", "UX 改善清單"],
      with_ga4:   ["流量診斷報告", "頁面優化優先序", "SEO 差距分析"],
    },
  },

  // ── Workspace: strategy ────────────────────────────────────────────────────
  "strategy": {
    requirements: [
      { id: "brand_name",      label: "品牌名稱",  type: "text",   required: true  },
      { id: "target_audience", label: "目標受眾",  type: "text",   required: true,  hint: "例：B2B SaaS 決策者、25-40 歲都會女性" },
      { id: "campaign_goal",   label: "行銷目標",  type: "text",   required: true,  hint: "例：提升品牌認知、產生 MQL、衝刺季末業績" },
      { id: "budget_range",    label: "預算範圍",  type: "select", required: false,
        options: ["< NT$10 萬", "NT$10-50 萬", "NT$50-200 萬", "> NT$200 萬"] },
      { id: "timeline",        label: "時程",      type: "text",   required: false, hint: "例：本季度末、8 週" },
    ],
    outputs: {
      default: ["策略規劃書", "GTM 執行計劃", "KPI 追蹤框架"],
    },
  },

  // ── Workspace: facebook ────────────────────────────────────────────────────
  "facebook": {
    requirements: [
      { id: "fb_page_url",     label: "Facebook 粉絲頁 URL",   type: "url",     required: false, hint: "選填" },
      { id: "product_type",    label: "主打產品 / 服務",        type: "text",    required: true  },
      { id: "target_audience", label: "目標受眾",              type: "text",    required: true  },
      { id: "ad_budget",       label: "月廣告預算",            type: "select",  required: false,
        options: ["< NT$3 萬", "NT$3-10 萬", "NT$10-30 萬", "> NT$30 萬"] },
      { id: "pixel_installed", label: "Meta Pixel 已安裝",     type: "boolean", required: false },
    ],
    outputs: {
      default:         ["廣告素材策略", "受眾定向建議", "投放計劃"],
      with_pixel_installed: ["再行銷受眾設計", "轉換優化策略"],
    },
  },

  // ── Workspace: linkedin ────────────────────────────────────────────────────
  "linkedin": {
    requirements: [
      { id: "linkedin_url",    label: "LinkedIn 公司頁 URL",   type: "url",    required: false, hint: "選填" },
      { id: "target_industry", label: "目標行業 / 職稱",        type: "text",   required: true,  hint: "例：科技業 CTO、中小企業主" },
      { id: "content_goal",    label: "內容目標",              type: "text",   required: true,  hint: "例：建立思想領導力、產生 B2B 潛在客戶" },
      { id: "posting_freq",    label: "預期發文頻率",           type: "select", required: false,
        options: ["每日", "3-4 次 / 週", "每週", "每兩週"] },
    ],
    outputs: {
      default: ["LinkedIn 內容日曆", "貼文主題策略", "個人品牌優化建議"],
    },
  },

  // ── Workspace: youtube ────────────────────────────────────────────────────
  "youtube": {
    requirements: [
      { id: "channel_url",     label: "YouTube 頻道 URL",    type: "url",    required: false, hint: "選填" },
      { id: "content_type",    label: "影片內容類型",         type: "select", required: true,
        options: ["教學 / How-to", "品牌故事", "產品展示", "Vlog", "訪談", "其他"] },
      { id: "target_audience", label: "目標觀眾",             type: "text",   required: true  },
      { id: "upload_freq",     label: "上傳頻率",             type: "select", required: false,
        options: ["每日", "每週", "每兩週", "每月"] },
    ],
    outputs: {
      default: ["頻道策略建議", "內容日曆", "SEO 關鍵字清單", "縮圖設計方向"],
    },
  },

  // ── Workspace: pr ─────────────────────────────────────────────────────────
  "pr": {
    requirements: [
      { id: "news_angle",    label: "新聞角度 / 議題",        type: "text",   required: true  },
      { id: "target_media",  label: "目標媒體類型",           type: "text",   required: false, hint: "例：財經媒體、科技媒體、生活類雜誌" },
      { id: "spokesperson",  label: "發言人姓名 / 職稱",      type: "text",   required: false },
      { id: "embargo_date",  label: "解禁日期",               type: "text",   required: false, hint: "例：2026-05-01 10:00 台北時間" },
    ],
    outputs: {
      default: ["新聞稿草稿", "媒體名單建議", "發稿時程規劃"],
    },
  },

  // ── Workspace: event ─────────────────────────────────────────────────────
  "event": {
    requirements: [
      { id: "event_date",      label: "活動日期",     type: "text",    required: true  },
      { id: "venue",           label: "活動地點",     type: "text",    required: false },
      { id: "expected_guests", label: "預計人數",     type: "select",  required: true,
        options: ["< 50 人", "50-200 人", "200-500 人", "> 500 人"] },
      { id: "event_goal",      label: "活動目標",     type: "text",    required: true  },
      { id: "budget",          label: "活動預算",     type: "text",    required: false, hint: "例：NT$50 萬" },
    ],
    outputs: {
      default: ["活動企劃書", "流程時程表", "宣傳策略", "供應商清單建議"],
    },
  },

  // ── Workspace: website ────────────────────────────────────────────────────
  "website": {
    requirements: [
      { id: "website_url",     label: "官網 URL",         type: "url",    required: true  },
      { id: "seo_goal",        label: "SEO / 流量目標",   type: "text",   required: true,  hint: "例：月流量翻倍、特定關鍵字排名第一頁" },
      { id: "target_keywords", label: "核心關鍵字（3-5個）",type: "text",  required: false },
      { id: "ga4_access",      label: "GA4 存取",         type: "api",    required: false, hint: "選填：有存取可做流量診斷" },
    ],
    outputs: {
      default:  ["SEO 策略建議", "關鍵字地圖", "內容優化清單"],
      with_ga4: ["流量診斷報告", "頁面效能分析"],
    },
  },
};

// ─── Lookup helper ────────────────────────────────────────────────────────────

/**
 * Return the requirements config for a given squad slug + optional workspace.
 * Priority: slug → workspace → DEFAULT_CONFIG
 */
export function getSquadRequirements(
  squadSlug?: string | null,
  workspace?: string | null,
): SquadRequirementsConfig {
  if (squadSlug && SQUAD_REQUIREMENTS_MAP[squadSlug]) {
    return SQUAD_REQUIREMENTS_MAP[squadSlug];
  }
  if (workspace && SQUAD_REQUIREMENTS_MAP[workspace]) {
    return SQUAD_REQUIREMENTS_MAP[workspace];
  }
  return DEFAULT_CONFIG;
}

// ─── Layer 2: simple regex-based extractor ───────────────────────────────────
// Used by Squad Lead intake to auto-fill requirements from conversation.

const URL_RE = /https?:\/\/[^\s"'<>）]+/i;

/**
 * Attempt to extract requirement values from a block of assistant text.
 * Returns a partial map { requirementId -> extracted_value }.
 * Only sets values that can be detected with high confidence.
 */
export function extractRequirementsFromText(
  text: string,
  requirements: SquadRequirement[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const req of requirements) {
    // URL fields — detect bare URLs
    if (req.type === "url") {
      const m = URL_RE.exec(text);
      if (m) result[req.id] = m[0];
      continue;
    }
    // Boolean fields — look for 是/有/yes or 否/沒有/no near label
    if (req.type === "boolean") {
      const label = req.label.replace(/[()（）]/g, "").trim();
      const labelRe = new RegExp(label + "[：:]*\\s*(是|有|yes|1|否|沒有|no|0)", "i");
      const m = labelRe.exec(text);
      if (m && m[1]) result[req.id] = /是|有|yes|1/i.test(m[1]) ? "是" : "否";
      continue;
    }
    // Select fields — check if any option string appears in text
    if (req.type === "select" && req.options) {
      for (const opt of req.options) {
        if (text.includes(opt)) { result[req.id] = opt; break; }
      }
      continue;
    }
    // Text fields — look for patterns like "目標受眾：<value>" or "<label>是<value>"
    const label = req.label.replace(/[（）()]/g, "").trim();
    const textRe = new RegExp(
      label + "[：:是為]\\s*([^\\n，,。？！]{4,60})",
      "i",
    );
    const m = textRe.exec(text);
    if (m && m[1]) result[req.id] = m[1].trim();
  }

  return result;
}
