/**
 * squadRequirements.ts
 *
 * Per-squad requirements config — three sections:
 *
 *   identity  → minimal brand identifiers agents need to start researching
 *               (brand name, website URL, CMS type, event date…)
 *               Users provide facts only they know; agents do all market research.
 *
 *   access    → platform OAuth / API tokens so agents can ACT on the user's behalf
 *               (Google Analytics, Facebook Ads Manager, YouTube channel…)
 *
 *   output    → where the finished work gets delivered
 *               (Google Drive folder, Email, YouTube publish, LINE share…)
 *
 * Lookup priority:
 *   1. Exact squad slug  (e.g. "benefit-based-positioning")
 *   2. Workspace key     (e.g. "strategy", "facebook")
 *   3. DEFAULT_CONFIG    (generic fallback)
 */

export type RequirementSection = "identity" | "access" | "output";

export type RequirementType =
  | "text"     // free-text input
  | "url"      // URL input (validates format)
  | "select"   // dropdown with fixed options
  | "boolean"  // yes/no toggle (platform installed/available)
  | "oauth"    // platform authorization (shows "連結帳戶" button)
  | "output";  // delivery channel (Drive, Email, YouTube, LINE…)

export interface SquadRequirement {
  id: string;
  label: string;
  type: RequirementType;
  section: RequirementSection;
  required: boolean;
  /** For type="oauth" | "output" — which platform to connect */
  provider?: string;
  /** For type="select" */
  options?: string[];
  hint?: string;
}

export interface SquadRequirementsConfig {
  requirements: SquadRequirement[];
  /**
   * Outputs map.
   * "default"         → always deliverable
   * "with_<reqId>"    → unlocked when that requirement is connected / filled
   */
  outputs: Record<string, string[]>;
}

// ─── Section display metadata ─────────────────────────────────────────────────

export const SECTION_META: Record<RequirementSection, { icon: string; title: string; sub: string }> = {
  identity: { icon: "🔍", title: "基本資訊",  sub: "讓 agents 開始研究" },
  access:   { icon: "🔑", title: "平台授權",  sub: "授權後可代你操作" },
  output:   { icon: "📤", title: "成果交付",  sub: "選擇輸出方式" },
};

// ─── Provider display labels ──────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<string, string> = {
  "google-analytics":      "Google Analytics",
  "google-drive":          "Google Drive",
  "google-search-console": "Search Console",
  "facebook-ads":          "Facebook Ads Manager",
  "youtube":               "YouTube",
  "linkedin":              "LinkedIn",
  "email":                 "Email",
  "line":                  "LINE",
  "slack":                 "Slack",
};

// ─── Default fallback ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SquadRequirementsConfig = {
  requirements: [
    // identity
    { id: "brand_name",  label: "品牌名稱",  type: "text",   section: "identity", required: true },
    { id: "website_url", label: "官網 URL",  type: "url",    section: "identity", required: false, hint: "agents 自動爬取分析" },
    // access
    { id: "ga4_access",  label: "Google Analytics", type: "oauth", section: "access", required: false, provider: "google-analytics" },
    // output
    { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive",   hint: "報告存入指定資料夾" },
    { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email",          hint: "輸入收件地址" },
  ],
  outputs: {
    default:          ["策略建議書", "執行計劃", "成效追蹤框架"],
    with_ga4_access:  ["流量診斷報告", "轉換漏斗分析"],
    with_out_gdrive:  ["可編輯 Google Slides"],
    with_out_email:   ["PDF 報告 Email 寄送"],
  },
};

// ─── Per-squad / per-workspace config ────────────────────────────────────────

export const SQUAD_REQUIREMENTS_MAP: Record<string, SquadRequirementsConfig> = {

  // ── SoWork 品牌定位 Squad ──────────────────────────────────────────────────
  "sowork-brand-positioning": {
    requirements: [
      // identity — agents will research audience, competitors, perception themselves
      { id: "brand_name",  label: "品牌名稱",  type: "text", section: "identity", required: true },
      { id: "brand_url",   label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取後做定位一致性診斷" },
      // access
      { id: "ga4_access",  label: "Google Analytics",  type: "oauth", section: "access", required: false, provider: "google-analytics" },
      { id: "fb_business", label: "Facebook Business", type: "oauth", section: "access", required: false, provider: "facebook-ads" },
      // output
      { id: "out_gdrive",  label: "Google Drive",  type: "output", section: "output", required: false, provider: "google-drive", hint: "報告與簡報存入 Drive" },
      { id: "out_email",   label: "Email 報告",    type: "output", section: "output", required: false, provider: "email" },
      { id: "out_youtube", label: "YouTube 發布",  type: "output", section: "output", required: false, provider: "youtube",       hint: "品牌定位 Video Manifesto" },
    ],
    outputs: {
      default:           ["品牌定位報告", "競品分析地圖", "差異化策略建議", "定位聲明草稿"],
      with_ga4_access:   ["官網流量診斷", "SEO 關鍵字建議"],
      with_fb_business:  ["受眾洞察報告", "Facebook 定位建議"],
      with_out_gdrive:   ["可編輯 Google Slides 簡報"],
      with_out_youtube:  ["Video Manifesto 腳本 + 自動上傳"],
      with_out_email:    ["PDF 報告 Email 寄送"],
    },
  },

  // ── Benefit-Based Positioning ─────────────────────────────────────────────
  "benefit-based-positioning": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取產品頁提取核心效益主張" },
      { id: "fb_business", label: "Facebook Business", type: "oauth", section: "access", required: false, provider: "facebook-ads",   hint: "用於效益共鳴度受眾測試" },
      { id: "out_gdrive",  label: "Google Drive",  type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",    type: "output", section: "output", required: false, provider: "email" },
      { id: "out_youtube", label: "YouTube 發布",  type: "output", section: "output", required: false, provider: "youtube",       hint: "效益敘事 Video Manifesto" },
    ],
    outputs: {
      default:           ["效益層級地圖", "情感 vs 功能效益分類", "訊息主軸建議", "定位聲明草稿"],
      with_fb_business:  ["效益共鳴受眾測試報告", "A/B 訊息測試計劃"],
      with_out_gdrive:   ["效益定位 Slides（可編輯）"],
      with_out_youtube:  ["效益敘事腳本 + 自動上傳"],
      with_out_email:    ["定位報告 PDF 寄送"],
    },
  },

  // ── Differentiation Positioning (April Dunford Method) ───────────────────
  "differentiation-positioning": {
    requirements: [
      { id: "brand_name",       label: "品牌名稱",             type: "text", section: "identity", required: true },
      { id: "website_url",      label: "官網 URL",             type: "url",  section: "identity", required: false, hint: "agents 爬取提取差異點" },
      { id: "competitor_urls",  label: "競品官網（逗號分隔）",  type: "text", section: "identity", required: false, hint: "例：competitor-a.com, competitor-b.com" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:               ["競爭替代品分析", "獨特特性清單", "差異化定位聲明", "Battlecard 草稿", "Win/Loss 分析框架"],
      with_competitor_urls:  ["詳細競品爬取比較報告"],
      with_out_gdrive:       ["差異化策略簡報（可編輯）"],
      with_out_email:        ["策略報告 PDF 寄送"],
    },
  },

  // ── Value Proposition Mapping ─────────────────────────────────────────────
  "value-proposition-mapping": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取產品功能與客戶評論" },
      { id: "ga4_access",  label: "Google Analytics", type: "oauth", section: "access", required: false, provider: "google-analytics", hint: "驗證價值主張與流量的相關性" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:          ["4-維度定位聲明", "ICP 痛點×效益矩陣", "Value Map Canvas", "GTM 訊息框架"],
      with_ga4_access:  ["著陸頁價值主張效能報告", "轉換優化建議"],
      with_out_gdrive:  ["Value Map Canvas Slides（可編輯）"],
      with_out_email:   ["報告 PDF 寄送"],
    },
  },

  // ── Segmentation-Based Positioning ───────────────────────────────────────
  "segmentation-based-positioning": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取客戶評論做分群分析" },
      { id: "fb_business", label: "Facebook Business", type: "oauth", section: "access", required: false, provider: "facebook-ads", hint: "取得受眾人口統計數據" },
      { id: "ga4_access",  label: "Google Analytics",  type: "oauth", section: "access", required: false, provider: "google-analytics" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:          ["分群分析報告", "ICP A/B/C/D 評分模型", "合成 Persona（3-5 個）", "各分群定位聲明"],
      with_fb_business: ["真實受眾人口統計驗證", "各分群 Facebook 受眾設定建議"],
      with_ga4_access:  ["各分群行為路徑分析"],
      with_out_gdrive:  ["Persona 卡片 + 分群報告（Google Drive）"],
      with_out_email:   ["分群策略報告 PDF 寄送"],
    },
  },

  // ── Competitive Perceptual Mapping ────────────────────────────────────────
  "competitive-perceptual-mapping": {
    requirements: [
      { id: "brand_name",      label: "品牌名稱",               type: "text", section: "identity", required: true },
      { id: "website_url",     label: "官網 URL",               type: "url",  section: "identity", required: false, hint: "agents 爬取定位關鍵字" },
      { id: "competitor_names",label: "競品名稱（逗號分隔）",    type: "text", section: "identity", required: false, hint: "例：品牌A, 品牌B, 品牌C" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive", hint: "知覺圖可繼續在 Slides 中編輯" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:                ["2D 知覺定位圖", "市場空白識別", "競品情報摘要", "重新定位策略建議"],
      with_competitor_names:  ["詳細競品監控報告（octolens）", "市場佔位變化追蹤"],
      with_out_gdrive:        ["互動式知覺圖 Google Slides"],
      with_out_email:         ["競品報告 PDF 寄送"],
    },
  },

  // ── Category Design（品類設計）────────────────────────────────────────────
  "category-design-positioning": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱",          type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",           type: "url",  section: "identity", required: false, hint: "agents 爬取現有定位語言做品類診斷" },
      { id: "industry",    label: "所在產業 / 市場",   type: "text", section: "identity", required: false, hint: "例：B2B SaaS CRM、能量飲料、健身科技" },
      { id: "out_gdrive",  label: "Google Drive",      type: "output", section: "output", required: false, provider: "google-drive", hint: "品類藍圖與 POV 文件存入 Drive" },
      { id: "out_email",   label: "Email 報告",         type: "output", section: "output", required: false, provider: "email" },
      { id: "out_youtube", label: "YouTube 發布",       type: "output", section: "output", required: false, provider: "youtube",       hint: "思想領袖影音內容" },
    ],
    outputs: {
      default:           ["品類 POV 文件", "品類藍圖", "競品重框架地圖", "思想領袖內容計劃"],
      with_industry:     ["產業品類現況深度分析"],
      with_out_gdrive:   ["品類藍圖 Google Slides（可編輯）"],
      with_out_youtube:  ["思想領袖影音腳本 + 自動上傳"],
      with_out_email:    ["品類策略報告 PDF 寄送"],
    },
  },

  // ── Mind Positioning（心智佔位）— Ries & Trout ───────────────────────────
  "mind-positioning": {
    requirements: [
      { id: "brand_name",       label: "品牌名稱",           type: "text", section: "identity", required: true },
      { id: "website_url",      label: "官網 URL",           type: "url",  section: "identity", required: false, hint: "agents 爬取品牌現有定位訊息" },
      { id: "competitor_names", label: "主要競品（逗號分隔）",type: "text", section: "identity", required: false, hint: "例：品牌A, 品牌B — agents 分析其心智位置" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:                ["心智梯子地圖", "核心屬性選擇報告", "競品重定位策略", "定位聲明草稿"],
      with_competitor_names:  ["詳細競品心智位置分析（octolens）"],
      with_out_gdrive:        ["心智定位策略簡報（可編輯）"],
      with_out_email:         ["定位策略報告 PDF 寄送"],
    },
  },

  // ── JTBD Positioning（任務導向定位）──────────────────────────────────────
  "jtbd-positioning": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取產品頁提取 Job 線索" },
      { id: "ga4_access",  label: "Google Analytics",  type: "oauth", section: "access", required: false, provider: "google-analytics", hint: "驗證 Job 與行為路徑的相關性" },
      { id: "fb_business", label: "Facebook Business", type: "oauth", section: "access", required: false, provider: "facebook-ads",     hint: "取得受眾行為觸發點數據" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:          ["Job Map", "Switch Interview 分析", "任務型競爭替代品地圖", "JTBD 定位聲明", "任務驅動訊息框架"],
      with_ga4_access:  ["行為路徑 Job 驗證報告"],
      with_fb_business: ["受眾 Job 觸發點廣告建議"],
      with_out_gdrive:  ["JTBD 策略文件（Google Drive）"],
      with_out_email:   ["報告 PDF 寄送"],
    },
  },

  // ── Purpose-Driven Positioning（目的導向定位）────────────────────────────
  "purpose-driven-positioning": {
    requirements: [
      { id: "brand_name",   label: "品牌名稱",          type: "text", section: "identity", required: true },
      { id: "website_url",  label: "官網 URL",           type: "url",  section: "identity", required: false, hint: "agents 爬取現有 About / CSR 頁面做真實性稽核" },
      { id: "brand_cause",  label: "品牌在意的社會議題", type: "text", section: "identity", required: false, hint: "例：環境永續、女性賦權、弱勢教育 — 填入後 agents 做真實性驗證" },
      { id: "out_gdrive",   label: "Google Drive",      type: "output", section: "output", required: false, provider: "google-drive",  hint: "Manifesto + 策略文件存入 Drive" },
      { id: "out_email",    label: "Email 報告",         type: "output", section: "output", required: false, provider: "email" },
      { id: "out_youtube",  label: "YouTube 發布",       type: "output", section: "output", required: false, provider: "youtube",       hint: "品牌 Manifesto 影片腳本" },
      { id: "out_line",     label: "LINE 分享",           type: "output", section: "output", required: false, provider: "line",          hint: "運動感召快速分享" },
    ],
    outputs: {
      default:           ["使命真實性稽核報告", "Purpose 聲明（三層架構）", "Manifesto 草稿", "全通路 Purpose 整合手冊"],
      with_brand_cause:  ["社會議題共鳴度分析", "同類 Purpose 品牌競品研究"],
      with_out_gdrive:   ["Brand Manifesto Google Slides"],
      with_out_youtube:  ["Manifesto 影片腳本 + 自動上傳"],
      with_out_line:     ["LINE 運動感召分享貼文"],
      with_out_email:    ["品牌使命報告 PDF 寄送"],
    },
  },

  // ── Brand Archetype Positioning（品牌原型定位）───────────────────────────
  "brand-archetype-positioning": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取品牌現有溝通素材做原型診斷" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive", hint: "品牌聲音指南 + 視覺方向存入 Drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:         ["品牌人格現況診斷", "原型選擇理由書", "品牌聲音指南（用詞庫 + 語調）", "視覺體驗方向", "全通路原型一致性手冊"],
      with_out_gdrive: ["品牌指南 Google Slides（可直接使用）"],
      with_out_email:  ["品牌原型報告 PDF 寄送"],
    },
  },

  // ── Website Rebuild ────────────────────────────────────────────────────────
  "tw-website-rebuild": {
    requirements: [
      { id: "website_url", label: "官網 URL",  type: "url",    section: "identity", required: true },
      { id: "cms_type",    label: "CMS 平台",  type: "select", section: "identity", required: true,
        options: ["WordPress", "Webflow", "Wix", "Shopify", "自建", "其他"] },
      { id: "ga4_access",  label: "Google Analytics",  type: "oauth", section: "access", required: false, provider: "google-analytics" },
      { id: "sc_access",   label: "Search Console",    type: "oauth", section: "access", required: false, provider: "google-search-console" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:        ["頁面架構建議", "文案重寫", "UX 改善清單"],
      with_ga4_access:["流量診斷報告", "頁面優化優先序"],
      with_sc_access: ["SEO 差距分析", "關鍵字排名機會"],
      with_out_gdrive:["設計稿 Wireframe（Figma 匯出到 Drive）"],
      with_out_email: ["改版建議 PDF 寄送"],
    },
  },

  // ── Workspace: strategy ────────────────────────────────────────────────────
  "strategy": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱", type: "text", section: "identity", required: true },
      { id: "website_url", label: "官網 URL",  type: "url",  section: "identity", required: false, hint: "agents 爬取做現況診斷" },
      { id: "ga4_access",  label: "Google Analytics", type: "oauth", section: "access", required: false, provider: "google-analytics" },
      { id: "out_gdrive",  label: "Google Drive", type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",   type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:          ["策略規劃書", "GTM 執行計劃", "KPI 追蹤框架"],
      with_ga4_access:  ["現況診斷報告", "成長機會分析"],
      with_out_gdrive:  ["策略簡報 Google Slides"],
      with_out_email:   ["報告 PDF 寄送"],
    },
  },

  // ── Workspace: facebook ────────────────────────────────────────────────────
  "facebook": {
    requirements: [
      { id: "brand_name",      label: "品牌名稱",          type: "text",    section: "identity", required: true },
      { id: "fb_page_url",     label: "Facebook 粉絲頁 URL", type: "url",   section: "identity", required: false, hint: "agents 爬取粉絲頁表現" },
      { id: "fb_ads",          label: "Facebook Ads Manager", type: "oauth", section: "access",  required: false, provider: "facebook-ads" },
      { id: "pixel_installed", label: "Meta Pixel 已安裝",   type: "boolean", section: "access", required: false },
      { id: "out_gdrive",  label: "Google Drive",  type: "output", section: "output", required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",    type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:              ["廣告素材策略", "受眾定向建議", "投放計劃"],
      with_fb_ads:          ["帳戶效能診斷", "受眾洞察報告"],
      with_pixel_installed: ["再行銷受眾設計", "轉換優化策略"],
      with_out_gdrive:      ["素材包存入 Google Drive"],
      with_out_email:       ["投放報告 PDF 寄送"],
    },
  },

  // ── Workspace: linkedin ────────────────────────────────────────────────────
  "linkedin": {
    requirements: [
      { id: "brand_name",   label: "品牌名稱",           type: "text", section: "identity", required: true },
      { id: "linkedin_url", label: "LinkedIn 公司頁 URL", type: "url",  section: "identity", required: false },
      { id: "li_admin",     label: "LinkedIn 頁面授權",  type: "oauth", section: "access",  required: false, provider: "linkedin", hint: "授權後可自動排程發文" },
      { id: "out_gdrive",  label: "Google Drive",     type: "output", section: "output", required: false, provider: "google-drive", hint: "內容日曆存為 Google Sheets" },
      { id: "out_email",   label: "Email 報告",        type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:       ["LinkedIn 內容日曆", "貼文主題策略", "個人品牌優化建議"],
      with_li_admin: ["自動排程發文", "Analytics 月報"],
      with_out_gdrive:["內容日曆 Google Sheets"],
      with_out_email: ["月報 PDF 寄送"],
    },
  },

  // ── Workspace: youtube ────────────────────────────────────────────────────
  "youtube": {
    requirements: [
      { id: "channel_url",  label: "YouTube 頻道 URL", type: "url",    section: "identity", required: false, hint: "agents 分析頻道現況" },
      { id: "content_type", label: "影片類型",          type: "select", section: "identity", required: true,
        options: ["教學 / How-to", "品牌故事", "產品展示", "Vlog", "訪談", "其他"] },
      { id: "yt_channel",  label: "YouTube 頻道授權",  type: "oauth",  section: "access",  required: false, provider: "youtube", hint: "授權後可自動上傳影片" },
      { id: "out_gdrive",  label: "Google Drive",     type: "output", section: "output", required: false, provider: "google-drive", hint: "腳本 + 縮圖存入 Drive" },
      { id: "out_email",   label: "Email 報告",        type: "output", section: "output", required: false, provider: "email" },
    ],
    outputs: {
      default:          ["頻道策略建議", "內容日曆", "SEO 關鍵字清單"],
      with_yt_channel:  ["影片自動上傳排程", "Analytics 分析報告"],
      with_out_gdrive:  ["腳本 + 縮圖資料夾（Google Drive）"],
      with_out_email:   ["月報 PDF 寄送"],
    },
  },

  // ── Workspace: pr ─────────────────────────────────────────────────────────
  "pr": {
    requirements: [
      { id: "brand_name",  label: "品牌名稱",            type: "text", section: "identity", required: true },
      { id: "news_angle",  label: "新聞議題 / 里程碑",    type: "text", section: "identity", required: true, hint: "例：完成 A 輪募資、發布新產品線" },
      { id: "embargo_date",label: "解禁日期",             type: "text", section: "identity", required: false, hint: "例：2026-05-01 10:00 台北時間" },
      { id: "out_email",   label: "Email 新聞稿",        type: "output", section: "output", required: false, provider: "email",   hint: "直接寄送媒體聯絡人" },
      { id: "out_gdrive",  label: "Google Drive",       type: "output", section: "output", required: false, provider: "google-drive", hint: "媒體資料包（圖片 + 文件）" },
      { id: "out_line",    label: "LINE 傳送",            type: "output", section: "output", required: false, provider: "line",    hint: "傳送給記者聯絡人" },
    ],
    outputs: {
      default:        ["新聞稿草稿", "媒體名單建議", "發稿時程規劃"],
      with_out_email: ["新聞稿直接寄送媒體"],
      with_out_gdrive:["媒體資料包（圖片 + 文件 Drive）"],
      with_out_line:  ["LINE 快速分享版本"],
    },
  },

  // ── Workspace: event ─────────────────────────────────────────────────────
  "event": {
    requirements: [
      { id: "event_date",      label: "活動日期",   type: "text",   section: "identity", required: true,  hint: "例：2026-06-15" },
      { id: "venue",           label: "活動地點",   type: "text",   section: "identity", required: false },
      { id: "event_goal",      label: "活動目標",   type: "text",   section: "identity", required: true,  hint: "例：品牌發表、客戶聚會、招募活動" },
      { id: "expected_guests", label: "預計人數",   type: "select", section: "identity", required: true,
        options: ["< 50 人", "50-200 人", "200-500 人", "> 500 人"] },
      { id: "out_gdrive",  label: "Google Drive",  type: "output", section: "output", required: false, provider: "google-drive", hint: "企劃書 + Sheets 存入 Drive" },
      { id: "out_email",   label: "Email 邀請函",  type: "output", section: "output", required: false, provider: "email" },
      { id: "out_line",    label: "LINE 活動分享", type: "output", section: "output", required: false, provider: "line" },
    ],
    outputs: {
      default:        ["活動企劃書", "流程時程表", "宣傳策略", "供應商清單建議"],
      with_out_gdrive:["活動企劃 Google Slides + Sheets"],
      with_out_email: ["電子邀請函設計"],
      with_out_line:  ["LINE 活動通知貼文"],
    },
  },

  // ── Workspace: website ────────────────────────────────────────────────────
  "website": {
    requirements: [
      { id: "website_url", label: "官網 URL",         type: "url",   section: "identity", required: true },
      { id: "ga4_access",  label: "Google Analytics", type: "oauth", section: "access",   required: false, provider: "google-analytics" },
      { id: "sc_access",   label: "Search Console",   type: "oauth", section: "access",   required: false, provider: "google-search-console" },
      { id: "out_gdrive",  label: "Google Drive",     type: "output", section: "output",  required: false, provider: "google-drive" },
      { id: "out_email",   label: "Email 報告",        type: "output", section: "output",  required: false, provider: "email" },
    ],
    outputs: {
      default:         ["SEO 策略建議", "關鍵字地圖", "內容優化清單"],
      with_ga4_access: ["流量診斷報告", "頁面效能分析"],
      with_sc_access:  ["關鍵字排名追蹤", "索引問題診斷"],
      with_out_gdrive: ["SEO 報告 Google Sheets"],
      with_out_email:  ["月報 PDF 寄送"],
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

// ─── Layer 2: auto-extractor from conversation text ──────────────────────────
// Used by Squad Lead to auto-fill identity requirements from conversation.
// Only applied to "identity" section text/url fields.

const URL_RE = /https?:\/\/[^\s"'<>）]+/i;

/**
 * Attempt to extract identity requirement values from assistant conversation text.
 * Ignores oauth/output fields (those require user action, not text parsing).
 */
export function extractRequirementsFromText(
  text: string,
  requirements: SquadRequirement[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const req of requirements) {
    // Only auto-extract identity section items
    if (req.section !== "identity") continue;

    if (req.type === "url") {
      const m = URL_RE.exec(text);
      if (m) result[req.id] = m[0];
      continue;
    }
    if (req.type === "boolean") {
      const label = req.label.replace(/[()（）]/g, "").trim();
      const labelRe = new RegExp(label + "[：:]*\\s*(是|有|yes|1|否|沒有|no|0)", "i");
      const m = labelRe.exec(text);
      if (m && m[1]) result[req.id] = /是|有|yes|1/i.test(m[1]) ? "是" : "否";
      continue;
    }
    if (req.type === "select" && req.options) {
      for (const opt of req.options) {
        if (text.includes(opt)) { result[req.id] = opt; break; }
      }
      continue;
    }
    if (req.type === "text") {
      const label = req.label.replace(/[（）()]/g, "").trim();
      const textRe = new RegExp(label + "[：:是為]\\s*([^\\n，,。？！]{4,60})", "i");
      const m = textRe.exec(text);
      if (m && m[1]) result[req.id] = m[1].trim();
    }
  }

  return result;
}
