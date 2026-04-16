/**
 * taskSquads.ts
 *
 * Static mapping: workspace → 6 squad options.
 * Each SquadOption has slug, name, lead title, tagline,
 * 4 methodology phases, and 4 agent members.
 */

export interface MethodologyStep {
  phase: string;
  description: string;
}

export interface AgentMember {
  name: string;
  title: string;
  skill: string;
  aiModel: string;
}

export interface SquadOption {
  squadSlug: string;
  name: string;
  leadTitle: string;
  tagline: string;
  steps: MethodologyStep[];
  members: AgentMember[];
}

// ─── Strategy workspace squads ────────────────────────────────────────────────

const SOWORK_BRANDING: SquadOption = {
  squadSlug: "sowork-branding",
  name: "SoWork 品牌策略",
  leadTitle: "首席品牌策略師",
  tagline: "深度品牌審計，建立長期市場差異化定位",
  steps: [
    { phase: "品牌審計", description: "現有品牌資產盤點、競品比對矩陣" },
    { phase: "差異化定位", description: "藍海機會識別、核心 USP 框架" },
    { phase: "品牌表達", description: "訊息架構撰寫、視覺語言建議" },
    { phase: "落地計劃", description: "90 天執行藍圖、KPI 設定" },
  ],
  members: [
    { name: "品牌審計師", title: "資深品牌資產分析師", skill: "Brand Audit", aiModel: "Claude 3.5 Sonnet" },
    { name: "定位策略師", title: "市場差異化顧問", skill: "Positioning", aiModel: "GPT-4o" },
    { name: "品牌文案師", title: "核心訊息撰寫師", skill: "Brand Copywriting", aiModel: "Claude 3.5 Sonnet" },
    { name: "視覺語言顧問", title: "品牌視覺策略師", skill: "Visual Strategy", aiModel: "Gemini 1.5 Pro" },
  ],
};

const TW_B2B_SAAS_GTM: SquadOption = {
  squadSlug: "tw-b2b-saas-gtm",
  name: "B2B SaaS GTM",
  leadTitle: "GTM 策略師",
  tagline: "數據驅動的 B2B 進入市場策略，加速產品採用",
  steps: [
    { phase: "ICP 定義", description: "理想客戶輪廓、痛點深度訪談" },
    { phase: "市場定位", description: "競爭格局分析、差異化價值主張" },
    { phase: "GTM 訊息", description: "核心訊息撰寫、頻道策略設計" },
    { phase: "執行計劃", description: "時程規劃、試點驗證與迭代" },
  ],
  members: [
    { name: "ICP 研究員", title: "理想客戶輪廓分析師", skill: "Customer Research", aiModel: "GPT-4o" },
    { name: "競品情報師", title: "競爭格局分析專家", skill: "Competitive Intel", aiModel: "Perplexity" },
    { name: "GTM 文案師", title: "B2B 訊息策略師", skill: "B2B Copywriting", aiModel: "Claude 3.5 Sonnet" },
    { name: "頻道策略師", title: "多頻道觸達規劃師", skill: "Channel Strategy", aiModel: "GPT-4o" },
  ],
};

const MKT_ANALYTICS: SquadOption = {
  squadSlug: "mkt-analytics-attribution",
  name: "數據洞察分析",
  leadTitle: "行銷數據科學家",
  tagline: "以量化洞察驅動策略決策，消除行銷盲點",
  steps: [
    { phase: "數據架構", description: "追蹤設置、核心指標定義" },
    { phase: "受眾分析", description: "行為分群、消費路徑還原" },
    { phase: "洞察報告", description: "關鍵發現萃取、機會識別" },
    { phase: "優化建議", description: "數據驅動行動計劃、A/B 測試設計" },
  ],
  members: [
    { name: "追蹤架構師", title: "GA4 / Pixel 設置專家", skill: "Analytics Setup", aiModel: "GPT-4o" },
    { name: "行為分析師", title: "用戶路徑還原專家", skill: "Behavioral Analysis", aiModel: "Claude 3.5 Sonnet" },
    { name: "歸因模型師", title: "多觸點歸因分析師", skill: "Attribution Modeling", aiModel: "Gemini 1.5 Pro" },
    { name: "A/B 測試師", title: "實驗設計與解讀專家", skill: "Experimentation", aiModel: "GPT-4o" },
  ],
};

const MKT_CONTENT_ENGINE: SquadOption = {
  squadSlug: "mkt-content-engine",
  name: "內容策略引擎",
  leadTitle: "內容策略長",
  tagline: "打造品牌聲音，實現內容資產規模化",
  steps: [
    { phase: "聲音定義", description: "品牌語調、溝通風格指南" },
    { phase: "故事框架", description: "核心敘事、內容支柱架構" },
    { phase: "內容產製", description: "多格式創作、SEO 關鍵字整合" },
    { phase: "發佈策略", description: "內容行事曆、平台分發優化" },
  ],
  members: [
    { name: "語調設計師", title: "品牌聲音與風格顧問", skill: "Brand Voice", aiModel: "Claude 3.5 Sonnet" },
    { name: "故事架構師", title: "核心敘事框架設計師", skill: "Storytelling", aiModel: "Claude 3.5 Sonnet" },
    { name: "多格式編輯", title: "跨平台內容產製師", skill: "Content Production", aiModel: "GPT-4o" },
    { name: "SEO 整合師", title: "關鍵字與內容融合專家", skill: "SEO Content", aiModel: "Gemini 1.5 Pro" },
  ],
};

const TW_MARKET_INTEL: SquadOption = {
  squadSlug: "tw-market-intel",
  name: "台灣市場情報",
  leadTitle: "台灣市場策略顧問",
  tagline: "深度本地洞察，精準定位台灣消費者",
  steps: [
    { phase: "市場掃描", description: "在地競爭格局、消費趨勢分析" },
    { phase: "受眾研究", description: "台灣消費者行為、文化痛點洞察" },
    { phase: "機會識別", description: "市場空白發現、最佳進入時機" },
    { phase: "本地策略", description: "在地化執行計劃、合作資源盤點" },
  ],
  members: [
    { name: "市場掃描師", title: "台灣競爭格局分析師", skill: "Market Research", aiModel: "Perplexity" },
    { name: "消費者研究員", title: "台灣用戶行為洞察師", skill: "Consumer Insights", aiModel: "GPT-4o" },
    { name: "趨勢分析師", title: "本地消費趨勢預測師", skill: "Trend Analysis", aiModel: "Gemini 1.5 Pro" },
    { name: "在地化顧問", title: "台灣文化脈絡專家", skill: "Localization", aiModel: "Claude 3.5 Sonnet" },
  ],
};

const MKT_POSITIONING: SquadOption = {
  squadSlug: "mkt-positioning",
  name: "市場定位專家",
  leadTitle: "定位策略師",
  tagline: "建立清晰品牌定位，贏得目標受眾心智佔有率",
  steps: [
    { phase: "定位診斷", description: "當前定位評估、認知差距分析" },
    { phase: "目標定位", description: "差異化方向確立、核心 USP 提煉" },
    { phase: "訊息架構", description: "品牌主張、支撐論點撰寫" },
    { phase: "驗證精煉", description: "受眾測試、定位迭代調整" },
  ],
  members: [
    { name: "定位診斷師", title: "現有認知差距分析師", skill: "Positioning Audit", aiModel: "GPT-4o" },
    { name: "USP 提煉師", title: "核心差異化價值師", skill: "Value Proposition", aiModel: "Claude 3.5 Sonnet" },
    { name: "訊息架構師", title: "品牌主張撰寫師", skill: "Messaging", aiModel: "Claude 3.5 Sonnet" },
    { name: "受眾測試師", title: "定位驗證與迭代師", skill: "User Testing", aiModel: "Gemini 1.5 Pro" },
  ],
};

const STRATEGY_SQUADS: SquadOption[] = [
  SOWORK_BRANDING,
  TW_B2B_SAAS_GTM,
  MKT_ANALYTICS,
  MKT_CONTENT_ENGINE,
  TW_MARKET_INTEL,
  MKT_POSITIONING,
];

// ─── Website workspace squads ─────────────────────────────────────────────────

const WEBSITE_SQUADS: SquadOption[] = [
  {
    squadSlug: "tw-website-rebuild",
    name: "官網重建專隊",
    leadTitle: "網站策略架構師",
    tagline: "從結構到文案全面優化，提升官網轉換效率",
    steps: [
      { phase: "現況診斷", description: "頁面架構審計、使用者流失點分析" },
      { phase: "策略規劃", description: "資訊架構重設計、轉換路徑優化" },
      { phase: "內容重寫", description: "頁面文案撰寫、CTA 優化" },
      { phase: "測試上線", description: "A/B 測試設計、效果追蹤設置" },
    ],
    members: [
      { name: "架構設計師", title: "資訊架構與流程規劃師", skill: "IA Design", aiModel: "GPT-4o" },
      { name: "網頁文案師", title: "轉換導向文案撰寫師", skill: "Web Copywriting", aiModel: "Claude 3.5 Sonnet" },
      { name: "CTA 優化師", title: "行動號召設計專家", skill: "CTA Optimization", aiModel: "GPT-4o" },
      { name: "A/B 測試師", title: "頁面效果驗證專家", skill: "Split Testing", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-seo-growth",
    name: "SEO 成長策略",
    leadTitle: "SEO 成長駭客",
    tagline: "有機流量翻倍，以搜尋意圖驅動內容策略",
    steps: [
      { phase: "關鍵字研究", description: "搜尋意圖分析、競品關鍵字差距" },
      { phase: "內容規劃", description: "主題叢集架構、內容優先排序" },
      { phase: "頁面優化", description: "On-Page SEO、內部連結策略" },
      { phase: "效果追蹤", description: "排名監控、流量成長報告" },
    ],
    members: [
      { name: "關鍵字研究師", title: "搜尋意圖分析專家", skill: "Keyword Research", aiModel: "Perplexity" },
      { name: "內容架構師", title: "主題叢集規劃師", skill: "Content Clustering", aiModel: "GPT-4o" },
      { name: "On-Page 優化師", title: "頁面 SEO 技術專家", skill: "On-Page SEO", aiModel: "Claude 3.5 Sonnet" },
      { name: "排名追蹤師", title: "流量成長監控師", skill: "SEO Analytics", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "sowork-copywriting",
    name: "SoWork 文案策略",
    leadTitle: "首席文案策略師",
    tagline: "每個字都有目的，以精準文案驅動轉換",
    steps: [
      { phase: "受眾洞察", description: "目標讀者輪廓、閱讀行為研究" },
      { phase: "訊息架構", description: "核心賣點排序、說服流程設計" },
      { phase: "文案初稿", description: "主標題、副標題、CTA 撰寫" },
      { phase: "優化測試", description: "版本測試、轉換率追蹤" },
    ],
    members: [
      { name: "讀者研究員", title: "目標受眾行為分析師", skill: "Audience Research", aiModel: "GPT-4o" },
      { name: "說服架構師", title: "心理說服流程設計師", skill: "Persuasion Design", aiModel: "Claude 3.5 Sonnet" },
      { name: "標題撰寫師", title: "主副標題創作專家", skill: "Headline Writing", aiModel: "Claude 3.5 Sonnet" },
      { name: "轉換追蹤師", title: "文案效果測試師", skill: "Copy Testing", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-ux-optimization",
    name: "UX 轉換優化",
    leadTitle: "轉換率優化顧問",
    tagline: "以使用者行為數據識別摩擦點，系統性提升 CRO",
    steps: [
      { phase: "行為分析", description: "熱圖、錄屏、滾動深度分析" },
      { phase: "痛點識別", description: "離開率高頁面診斷、阻礙點標記" },
      { phase: "改善方案", description: "UI/UX 優化建議、原型設計" },
      { phase: "驗證循環", description: "A/B 測試執行、結果解讀" },
    ],
    members: [
      { name: "熱圖分析師", title: "使用者行為視覺化專家", skill: "Heatmap Analysis", aiModel: "GPT-4o" },
      { name: "摩擦點診斷師", title: "頁面阻礙識別專家", skill: "Friction Analysis", aiModel: "Claude 3.5 Sonnet" },
      { name: "UX 原型師", title: "介面優化設計師", skill: "UX Prototyping", aiModel: "Gemini 1.5 Pro" },
      { name: "CRO 測試師", title: "轉換率實驗執行師", skill: "CRO Testing", aiModel: "GPT-4o" },
    ],
  },
  {
    squadSlug: "tw-content-strategy",
    name: "台灣內容策略",
    leadTitle: "台灣數位內容總監",
    tagline: "以本地語境與文化洞察打造高黏著度內容",
    steps: [
      { phase: "主題研究", description: "在地熱門議題、台灣受眾關注點" },
      { phase: "格式規劃", description: "內容類型組合、發佈頻率設計" },
      { phase: "內容製作", description: "文章、影片腳本、圖文素材" },
      { phase: "分發優化", description: "平台特性調整、互動率提升" },
    ],
    members: [
      { name: "在地議題師", title: "台灣熱點追蹤分析師", skill: "Local Trend Research", aiModel: "Perplexity" },
      { name: "格式規劃師", title: "內容組合策略設計師", skill: "Content Mix", aiModel: "GPT-4o" },
      { name: "本地編輯師", title: "繁體中文內容製作師", skill: "Traditional Chinese Content", aiModel: "Claude 3.5 Sonnet" },
      { name: "平台優化師", title: "台灣社群平台分發師", skill: "Platform Distribution", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-conversion-rate",
    name: "轉換漏斗優化",
    leadTitle: "漏斗策略師",
    tagline: "從曝光到購買，全漏斗轉換率系統性提升",
    steps: [
      { phase: "漏斗診斷", description: "各階段轉換率盤點、流失點識別" },
      { phase: "策略設計", description: "漏斗每層優化方案、再行銷策略" },
      { phase: "執行優化", description: "Landing Page、Email、廣告素材調整" },
      { phase: "效果測量", description: "歸因模型設置、ROI 報告" },
    ],
    members: [
      { name: "漏斗診斷師", title: "各階段流失分析師", skill: "Funnel Analysis", aiModel: "GPT-4o" },
      { name: "再行銷師", title: "流失用戶召回專家", skill: "Remarketing", aiModel: "Claude 3.5 Sonnet" },
      { name: "Landing Page 師", title: "落地頁轉換優化師", skill: "Landing Page Optimization", aiModel: "GPT-4o" },
      { name: "ROI 分析師", title: "行銷投報率計算師", skill: "ROI Attribution", aiModel: "Gemini 1.5 Pro" },
    ],
  },
];

// ─── Facebook workspace squads ────────────────────────────────────────────────

const FACEBOOK_SQUADS: SquadOption[] = [
  {
    squadSlug: "mkt-social-ads",
    name: "社群廣告專家",
    leadTitle: "付費社群廣告策略師",
    tagline: "精準受眾定向，最大化社群廣告 ROAS",
    steps: [
      { phase: "受眾策略", description: "自訂受眾建立、相似受眾擴展" },
      { phase: "廣告架構", description: "活動層級設計、預算分配策略" },
      { phase: "素材製作", description: "廣告文案撰寫、視覺設計指引" },
      { phase: "優化追蹤", description: "成效監控、出價策略調整" },
    ],
    members: [
      { name: "受眾建構師", title: "自訂受眾與 LAL 專家", skill: "Audience Building", aiModel: "GPT-4o" },
      { name: "廣告架構師", title: "活動層級設計師", skill: "Campaign Structure", aiModel: "Claude 3.5 Sonnet" },
      { name: "廣告文案師", title: "社群廣告創意撰寫師", skill: "Ad Copywriting", aiModel: "Claude 3.5 Sonnet" },
      { name: "出價優化師", title: "ROAS 最大化策略師", skill: "Bid Optimization", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "tw-ecom-full-funnel",
    name: "電商全漏斗",
    leadTitle: "電商成長策略師",
    tagline: "社群流量變現，以全漏斗策略驅動電商業績",
    steps: [
      { phase: "流量策略", description: "社群廣告組合、自然流量規劃" },
      { phase: "引流優化", description: "廣告素材測試、受眾精準化" },
      { phase: "轉換提升", description: "商品頁優化、購物車棄單追蹤" },
      { phase: "回購策略", description: "再行銷受眾、會員忠誠度計劃" },
    ],
    members: [
      { name: "流量策略師", title: "付費與自然流量整合師", skill: "Traffic Strategy", aiModel: "GPT-4o" },
      { name: "素材測試師", title: "廣告創意 A/B 測試師", skill: "Creative Testing", aiModel: "Claude 3.5 Sonnet" },
      { name: "商品頁優化師", title: "電商轉換率提升師", skill: "Product Page CRO", aiModel: "GPT-4o" },
      { name: "回購策略師", title: "顧客終身價值提升師", skill: "Retention Marketing", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-creative-strategy",
    name: "創意策略工作室",
    leadTitle: "創意策略總監",
    tagline: "洞察驅動創意，打造高互動社群素材",
    steps: [
      { phase: "創意洞察", description: "受眾行為研究、競品創意分析" },
      { phase: "概念發想", description: "創意方向提案、視覺腳本設計" },
      { phase: "素材製作", description: "文案、圖像、影片腳本產出" },
      { phase: "測試迭代", description: "素材 A/B 測試、創意優化循環" },
    ],
    members: [
      { name: "創意洞察師", title: "受眾情感共鳴研究師", skill: "Creative Research", aiModel: "GPT-4o" },
      { name: "概念發想師", title: "視覺腳本設計師", skill: "Concept Development", aiModel: "Claude 3.5 Sonnet" },
      { name: "社群素材師", title: "圖文影音創作師", skill: "Content Creation", aiModel: "Gemini 1.5 Pro" },
      { name: "創意測試師", title: "素材效果優化師", skill: "Creative Testing", aiModel: "GPT-4o" },
    ],
  },
  {
    squadSlug: "tw-community-growth",
    name: "台灣社群經營",
    leadTitle: "社群策略經理",
    tagline: "深耕台灣社群，以真實互動建立品牌忠誠度",
    steps: [
      { phase: "社群定位", description: "品牌聲音設定、互動風格指南" },
      { phase: "內容策略", description: "發文主題規劃、貼文格式設計" },
      { phase: "互動運營", description: "留言回覆策略、KOL 合作規劃" },
      { phase: "成長追蹤", description: "粉絲成長分析、互動率優化" },
    ],
    members: [
      { name: "社群聲音師", title: "品牌互動風格設計師", skill: "Community Voice", aiModel: "Claude 3.5 Sonnet" },
      { name: "貼文規劃師", title: "內容行事曆設計師", skill: "Social Planning", aiModel: "GPT-4o" },
      { name: "KOL 合作師", title: "網紅合作策略師", skill: "Influencer Marketing", aiModel: "Perplexity" },
      { name: "互動分析師", title: "社群成長追蹤師", skill: "Engagement Analytics", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-content-engine-fb",
    name: "內容策略引擎",
    leadTitle: "內容策略長",
    tagline: "規模化社群內容產出，維持穩定高品質發文節奏",
    steps: [
      { phase: "聲音定義", description: "品牌語調、溝通風格指南" },
      { phase: "故事框架", description: "核心敘事、內容支柱架構" },
      { phase: "內容產製", description: "多格式社群素材、hashtag 策略" },
      { phase: "發佈策略", description: "最佳發文時段、平台演算法優化" },
    ],
    members: [
      { name: "語調設計師", title: "品牌社群聲音顧問", skill: "Brand Voice", aiModel: "Claude 3.5 Sonnet" },
      { name: "故事架構師", title: "社群敘事框架設計師", skill: "Social Storytelling", aiModel: "Claude 3.5 Sonnet" },
      { name: "Hashtag 策略師", title: "社群標籤研究師", skill: "Hashtag Strategy", aiModel: "GPT-4o" },
      { name: "演算法優化師", title: "FB/IG 演算法專家", skill: "Algorithm Optimization", aiModel: "Gemini 1.5 Pro" },
    ],
  },
  {
    squadSlug: "mkt-analytics-attribution-fb",
    name: "數據洞察分析",
    leadTitle: "行銷數據科學家",
    tagline: "社群廣告深度解析，以歸因分析優化投放策略",
    steps: [
      { phase: "追蹤設置", description: "Pixel 設定、事件追蹤架構" },
      { phase: "受眾分析", description: "粉絲輪廓、行為模式解析" },
      { phase: "廣告歸因", description: "多觸點歸因模型、ROAS 計算" },
      { phase: "優化建議", description: "數據驅動素材調整、受眾擴展" },
    ],
    members: [
      { name: "Pixel 設置師", title: "Facebook Pixel 技術師", skill: "Pixel Setup", aiModel: "GPT-4o" },
      { name: "受眾分析師", title: "粉絲輪廓解析師", skill: "Audience Analytics", aiModel: "Claude 3.5 Sonnet" },
      { name: "歸因模型師", title: "多觸點歸因專家", skill: "Attribution Modeling", aiModel: "Gemini 1.5 Pro" },
      { name: "ROAS 優化師", title: "廣告投報率提升師", skill: "ROAS Optimization", aiModel: "GPT-4o" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Find a SquadOption by its slug across all workspace squad pools. */
export function findSquadBySlug(slug: string): SquadOption | null {
  const allPools = [STRATEGY_SQUADS, WEBSITE_SQUADS, FACEBOOK_SQUADS];
  for (const pool of allPools) {
    const found = pool.find(s => s.squadSlug === slug);
    if (found) return found;
  }
  return null;
}

// ─── Task → Squads mapping ────────────────────────────────────────────────────

export const WORKSPACE_SQUADS: Record<string, SquadOption[]> = {
  strategy: STRATEGY_SQUADS,
  website:  WEBSITE_SQUADS,
  facebook: FACEBOOK_SQUADS,
};

export const TASK_SQUADS: Record<string, SquadOption[]> = {
  // Strategy
  "品牌定位分析": STRATEGY_SQUADS,
  "目標市場研究": STRATEGY_SQUADS,
  "品牌故事撰寫": STRATEGY_SQUADS,
  "競品情報收集": STRATEGY_SQUADS,
  "成長機會識別": STRATEGY_SQUADS,
  "品牌合作提案": STRATEGY_SQUADS,

  // Website
  "首頁文案優化": WEBSITE_SQUADS,
  "SEO 內容策略": WEBSITE_SQUADS,
  "產品頁面撰寫": WEBSITE_SQUADS,
  "Landing Page 設計": WEBSITE_SQUADS,
  "使用者體驗分析": WEBSITE_SQUADS,
  "客戶評價整合": WEBSITE_SQUADS,

  // Facebook
  "廣告文案創作": FACEBOOK_SQUADS,
  "視覺素材規劃": FACEBOOK_SQUADS,
  "內容行事曆": FACEBOOK_SQUADS,
  "廣告投放策略": FACEBOOK_SQUADS,
  "受眾分析報告": FACEBOOK_SQUADS,
  "病毒式傳播企劃": FACEBOOK_SQUADS,
};
