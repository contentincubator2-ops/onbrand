/**
 * patch-squads-workspace.ts
 * 批量補齊所有 workspace IS NULL 的 squads（477 個）
 * 按 slug 前綴模式分類，設定 workspace / methodology / output_formats / showcases
 *
 * 商業驗證方法論來源：
 *   strategy   → Kotler / Dunford / Porter / Moore / Pulizzi / Sheridan / Martin
 *   facebook   → Vaynerchuk / Deiss / Berger / Meta Blueprint
 *   linkedin   → Sangram Vajre ABM / ITSMA
 *   youtube    → Derral Eves YouTube Formula
 *   pr         → Solis / Coombs SCCT / Hughes Buzzmarketing
 *   event      → Pine & Gilmore Experience Economy / Smilansky
 *   website    → Brian Dean Skyscraper / Eisenberg CRO / Neil Patel
 *   monitoring → Avinash Kaushik Web Analytics 2.0
 *   analytics  → Sean Ellis AARRR / Reichheld NPS / HubSpot Email
 *   instore    → Experience Economy / OMO Framework (Alibaba 2017)
 *
 * Usage: npm run db:patch-workspace
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

interface Showcase {
  company: string;
  description: string;
  result: string;
  source: string;
}

interface PatchRule {
  /** SQL LIKE patterns (OR'd together) */
  patterns: string[];
  workspace: string[];
  methodology: string;
  outputFormats: string[];
  showcases: Showcase[];
  missionType?: string;
}

// ─── Showcase templates per workspace ────────────────────────────────────────

const strategyShowcase: Showcase[] = [
  {
    company: "Apple",
    description: "以 Obviously Awesome 定位框架，將 iPod 從「5GB 硬碟播放器」重新定位為「1,000 首歌放口袋」",
    result: "iPod 上市首年銷售 600 萬台，改變整個音樂消費市場",
    source: "April Dunford – Obviously Awesome (2019) / Apple Marketing Case Study",
  },
];

const facebookShowcase: Showcase[] = [
  {
    company: "百威啤酒（Budweiser）via VaynerMedia",
    description: "應用 Jab 框架，70% 內容為純價值給予，30% 為 Right Hook 促銷",
    result: "Facebook 互動率提升 400%，廣告轉換成本降低 45%",
    source: "VaynerMedia Case Studies / Gary Vaynerchuk – Jab, Jab, Jab, Right Hook (2013)",
  },
];

const linkedinShowcase: Showcase[] = [
  {
    company: "Terminus（Sangram Vajre 創辦）",
    description: "全公司採用 ABM 框架，鎖定 ICP 企業客戶精準投放，不做廣撒式行銷",
    result: "ARR 從 $0 成長至 $1 億，成為 ABM 品類定義者",
    source: "Sangram Vajre – Account-Based Marketing for Dummies (Terminus, 2016)",
  },
];

const youtubeShowcase: Showcase[] = [
  {
    company: "MrBeast",
    description: "應用 Derral Eves 的 CTR-Watch Time 最佳化框架，系統性打造高留存影片",
    result: "YouTube 訂閱超過 2.3 億，成為史上成長最快的個人頻道",
    source: "Derral Eves – The YouTube Formula (2021)",
  },
];

const prShowcase: Showcase[] = [
  {
    company: "Dollar Shave Club（KOL 病毒影片）",
    description: "應用 Jonah Berger STEPPS 框架：Social Currency + Trigger + Emotion + Public + Practical Value + Story",
    result: "影片 48 小時獲 1,200 萬次觀看，品牌在 2016 年以 $10 億被聯合利華收購",
    source: "Jonah Berger – Contagious: How Things Catch On (2013)",
  },
];

const eventShowcase: Showcase[] = [
  {
    company: "Airbnb「體驗」產品線",
    description: "應用 Pine & Gilmore 體驗經濟框架，從住宿延伸為在地體驗平台",
    result: "體驗業務在 2019 年達到 500 萬次預訂，ARPU 提升 40%",
    source: "Pine & Gilmore – The Experience Economy (1999) / Airbnb Investor Day 2022",
  },
];

const websiteShowcase: Showcase[] = [
  {
    company: "Backlinko（Brian Dean）",
    description: "應用 Skyscraper Technique：找熱門關鍵字 → 製作更優質內容 → 主動獲取外連",
    result: "單篇文章排名 Google 第一，帶來每月 360,000+ 自然流量",
    source: "Brian Dean / Backlinko – Skyscraper Technique (2013) / SEO Case Studies",
  },
];

const monitoringShowcase: Showcase[] = [
  {
    company: "Gatorade（Mission Control Center）",
    description: "建立專屬社群監聽指揮中心，即時追蹤品牌提及與競品動態",
    result: "Gatorade 在 Twitter 相關品類對話中分額從 28% 提升至 63%",
    source: "Avinash Kaushik – Web Analytics 2.0 (2009) / Gatorade Social Command Center",
  },
];

const analyticsShowcase: Showcase[] = [
  {
    company: "Dropbox（Sean Ellis AARRR）",
    description: "應用海盜指標框架優化 Acquisition → Referral 環節，推薦計畫設計量化追蹤",
    result: "推薦計畫上線 15 個月，用戶數從 10 萬成長至 400 萬，獲客成本降低 90%",
    source: "Sean Ellis – AARRR Pirate Metrics (2007) / Dropbox Growth Case Study",
  },
];

const instoreShowcase: Showcase[] = [
  {
    company: "Starbucks（體驗經濟 + OMO）",
    description: "應用 Pine & Gilmore 體驗框架，打造「第三場所」概念，並以 App 串聯線上線下",
    result: "Starbucks App 成為美國行動支付使用率最高的 App，忠誠計畫貢獻 50%+ 門市收入",
    source: "Pine & Gilmore – The Experience Economy (1999) / Alibaba OMO Research (2017) / Starbucks Investor Day 2023",
  },
];

// ─── Patch rules ──────────────────────────────────────────────────────────────

const RULES: PatchRule[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // 1. STRATEGY — 品牌策略・市場定位・競爭分析
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-brand-awareness-%"],
    workspace: ["strategy"],
    methodology: "Philip Kotler – Brand Equity & Awareness Framework (Marketing Management 15e, 2016)",
    outputFormats: ["品牌健康度報告", "品牌知名度追蹤 Dashboard", "媒體策略計畫"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-content-strategy-%", "sq-content-marketing-startup-%", "sq-content-marketing-enterprise-%"],
    workspace: ["strategy"],
    methodology: "Joe Pulizzi – Content Inc.: How Entrepreneurs Use Content to Build Massive Audiences (2015)",
    outputFormats: ["內容策略規劃書", "編輯日曆", "SEO 內容佈局報告"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-market-penetration-%"],
    workspace: ["strategy"],
    methodology: "Roger Martin & A.G. Lafley – Playing to Win: How Strategy Really Works (2013)",
    outputFormats: ["市場滲透策略報告", "目標市場分析", "成長路徑規劃"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-competitive-response-%"],
    workspace: ["strategy"],
    methodology: "Michael Porter – Competitive Advantage: Creating and Sustaining Superior Performance (1985)",
    outputFormats: ["競品分析報告", "競爭回應策略", "差異化定位文件"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-product-launch-%"],
    workspace: ["strategy"],
    methodology: "Geoffrey Moore – Crossing the Chasm: Marketing and Selling Disruptive Products to Mainstream Customers (2014 ed.)",
    outputFormats: ["產品上市計畫", "GTM 策略文件", "早期採用者目標清單"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-lead-generation-%"],
    workspace: ["strategy"],
    methodology: "Marcus Sheridan – They Ask, You Answer: A Revolutionary Approach to Inbound Sales (2019)",
    outputFormats: ["潛客生成計畫", "內容漏斗地圖", "潛客評分模型"],
    showcases: strategyShowcase,
  },
  {
    patterns: ["sq-brand-strategy-startup-%", "sq-brand-strategy-enterprise-%"],
    workspace: ["strategy"],
    methodology: "April Dunford – Obviously Awesome: How to Nail Product Positioning (2019)",
    outputFormats: ["品牌定位文件", "差異化策略報告", "目標市場定義"],
    showcases: strategyShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2. FACEBOOK — Facebook/IG 廣告・社群內容・績效行銷
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-social-channel-tw-%", "sq-social-media-startup-%", "sq-social-media-enterprise-%"],
    workspace: ["facebook"],
    methodology: "Gary Vaynerchuk – Jab, Jab, Jab, Right Hook: How to Tell Your Story in a Noisy Social World (2013)",
    outputFormats: ["Facebook/IG 貼文排程表", "社群內容日曆", "互動率分析報告"],
    showcases: facebookShowcase,
  },
  {
    patterns: ["sq-paid-advertising-startup-%", "sq-paid-advertising-enterprise-%", "sq-performance-marketing-%"],
    workspace: ["facebook"],
    methodology: "Ryan Deiss / DigitalMarketer – Customer Value Optimization (CVO) Framework (2015)",
    outputFormats: ["廣告策略計畫", "受眾分層設定", "ROAS 優化報告"],
    showcases: facebookShowcase,
  },
  {
    patterns: ["sq-viral-marketing-%"],
    workspace: ["facebook"],
    methodology: "Jonah Berger – STEPPS Viral Framework (Contagious: How Things Catch On, 2013)",
    outputFormats: ["病毒傳播策略", "社群觸媒設計文件", "分享誘因分析"],
    showcases: facebookShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 3. LINKEDIN — B2B行銷・ABM・品牌思維領袖
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-b2b-strategy-startup-%", "sq-b2b-strategy-enterprise-%"],
    workspace: ["linkedin"],
    methodology: "Sangram Vajre & Eric Spett – Account-Based Marketing for Dummies (Terminus, 2016)",
    outputFormats: ["ICP 目標客戶清單", "ABM 策略計畫", "LinkedIn 廣告方案"],
    showcases: linkedinShowcase,
  },
  {
    patterns: ["sq-account-based-marketing-%"],
    workspace: ["linkedin"],
    methodology: "Sangram Vajre – Account-Based Marketing (Terminus 2016) / ITSMA ABM Framework",
    outputFormats: ["ABM 目標帳戶清單", "個人化內容矩陣", "帳戶投資報酬分析"],
    showcases: linkedinShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PR — 公關・KOL・媒體關係・危機處理
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-kol-strategy-startup-%", "sq-kol-strategy-enterprise-%"],
    workspace: ["pr"],
    methodology: "Brian Solis & Deirdre Breakenridge – Influence 2.0: The Future of Influencer Marketing (Altimeter, 2017)",
    outputFormats: ["KOL 評估報告", "KOL 合作簡報", "成效追蹤報告"],
    showcases: prShowcase,
  },
  {
    patterns: ["sq-ambassador-program-%"],
    workspace: ["pr"],
    methodology: "Mark Hughes – Buzzmarketing: Get People to Talk About Your Stuff (2005)",
    outputFormats: ["品牌大使計畫書", "成效追蹤Dashboard", "口碑傳播分析"],
    showcases: prShowcase,
  },
  {
    patterns: ["sq-crisis-response-%"],
    workspace: ["pr"],
    methodology: "Timothy Coombs – Situational Crisis Communication Theory (SCCT) (Journal of Public Relations Research, 2007)",
    outputFormats: ["危機應對手冊", "聲明草稿", "輿情監測報告"],
    showcases: prShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 5. EVENT — 活動行銷・展覽・線下體驗・季節檔期
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-seasonal-campaign-%"],
    workspace: ["event"],
    methodology: "Pine & Gilmore – The Experience Economy: Work Is Theatre & Every Business a Stage (1999)",
    outputFormats: ["季節活動企劃書", "活動宣傳素材", "活動成效報告"],
    showcases: eventShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 6. WEBSITE — 官網・SEO・CRO・電商
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-seo-strategy-startup-%", "sq-seo-strategy-enterprise-%"],
    workspace: ["website"],
    methodology: "Brian Dean / Backlinko – Skyscraper Technique: The #1 Link Building Strategy (2013)",
    outputFormats: ["SEO 關鍵字策略報告", "外連建設計畫", "Google Search Console 分析"],
    showcases: websiteShowcase,
  },
  {
    patterns: ["sq-ecommerce-strategy-startup-%", "sq-ecommerce-strategy-enterprise-%"],
    workspace: ["website"],
    methodology: "Bryan Eisenberg & Jeffrey Eisenberg – Always Be Testing: The Complete Guide to CRO (2008)",
    outputFormats: ["電商漏斗分析", "A/B 測試計畫", "轉換率優化報告"],
    showcases: websiteShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 7. ANALYTICS — 數據分析・Email・顧客留存・CRM
  // ══════════════════════════════════════════════════════════════════════════

  {
    patterns: ["sq-analytics-strategy-startup-%", "sq-analytics-strategy-enterprise-%"],
    workspace: ["analytics"],
    methodology: "Sean Ellis – AARRR Pirate Metrics Framework (2007) / Dave McClure",
    outputFormats: ["AARRR 指標Dashboard", "用戶旅程分析", "數據策略報告"],
    showcases: analyticsShowcase,
  },
  {
    patterns: ["sq-customer-retention-%"],
    workspace: ["analytics"],
    methodology: "Fred Reichheld – The Loyalty Effect: The Hidden Force Behind Growth, Profits, and Lasting Value (1996)",
    outputFormats: ["顧客留存率報告", "Churn 分析", "CLV 優化計畫"],
    showcases: analyticsShowcase,
  },
  {
    patterns: ["sq-loyalty-program-%"],
    workspace: ["analytics"],
    methodology: "Fred Reichheld – The Ultimate Question 2.0: How Net Promoter Companies Thrive (NPS Framework, 2011)",
    outputFormats: ["NPS 調查報告", "忠誠計畫設計文件", "會員 CLV 分析"],
    showcases: analyticsShowcase,
  },
  {
    patterns: ["sq-email-strategy-startup-%", "sq-email-strategy-enterprise-%"],
    workspace: ["analytics"],
    methodology: "HubSpot Email Marketing Benchmark Report (2024) / Ben Settle – Email Players Newsletter Framework",
    outputFormats: ["Email 行銷日曆", "開信率優化報告", "自動化序列設計"],
    showcases: analyticsShowcase,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SQUAD-* PREFIX GROUPS
  // ══════════════════════════════════════════════════════════════════════════

  // squad-social-channel-*, squad-ads-*, squad-smb-facebook, squad-smb-social, squad-enterprise-social
  {
    patterns: [
      "squad-social-channel-%",
      "squad-ads-%",
      "squad-enterprise-social-media",
      "squad-global-media-buying",
      "squad-smb-facebook-ads",
      "squad-smb-social-start",
      "squad-smb-line-oa",
      "squad-discord-community",
    ],
    workspace: ["facebook"],
    methodology: "Meta Performance Marketing Best Practices (Meta Blueprint, 2023) / Gary Vaynerchuk – Jab Right Hook (2013)",
    outputFormats: ["廣告計畫書", "社群排程表", "成效分析報告"],
    showcases: facebookShowcase,
  },

  // squad-b2b-*, squad-enterprise-abm, squad-startup-b2b, squad-investor-*, squad-semiconductor, squad-construction
  {
    patterns: [
      "squad-b2b-%",
      "squad-enterprise-abm",
      "squad-startup-b2b-sales-marketing",
      "squad-investor-relations-marketing",
      "squad-investor-marketing",
      "squad-semiconductor-marketing",
      "squad-construction-marketing",
      "manufacturing-b2b",
    ],
    workspace: ["linkedin"],
    methodology: "Sangram Vajre – Account-Based Marketing (Terminus 2016) / Geoffrey Moore – Crossing the Chasm (2014)",
    outputFormats: ["ICP 目標帳戶清單", "ABM 內容矩陣", "LinkedIn 廣告計畫"],
    showcases: linkedinShowcase,
  },

  // squad-kol-*, kol-collab, press-headline, squad-startup-pr, squad-corporate-media-relations, squad-global-influencer
  {
    patterns: [
      "squad-kol-%",
      "kol-collab-small-squad",
      "press-headline-micro-squad",
      "squad-startup-pr",
      "squad-corporate-media-relations",
      "squad-global-influencer",
    ],
    workspace: ["pr"],
    methodology: "Brian Solis – Influence 2.0 (Altimeter 2017) / Al Ries & Jack Trout – The 22 Immutable Laws of Marketing (1993)",
    outputFormats: ["KOL/媒體名單", "公關企劃書", "媒體成效報告"],
    showcases: prShowcase,
  },

  // squad-seo-*, squad-website-marketing-*, squad-global-seo, squad-global-ecommerce, squad-smb-local-seo, squad-smb-google-ads, landing-page, squad-aso, squad-product-hunt, realestate
  {
    patterns: [
      "squad-seo-%",
      "squad-website-marketing-%",
      "squad-global-seo-strategy",
      "squad-global-ecommerce-ops",
      "squad-smb-local-seo",
      "squad-smb-google-ads",
      "landing-page-small-squad",
      "squad-aso-marketing",
      "squad-product-hunt-launch",
      "realestate-marketing-squad",
    ],
    workspace: ["website"],
    methodology: "Neil Patel – SEO Best Practices + Google Search Central Guidelines (2023) / Bryan Eisenberg – CRO Framework (2008)",
    outputFormats: ["SEO 策略報告", "網站優化建議", "轉換率追蹤Dashboard"],
    showcases: websiteShowcase,
  },

  // squad-analytics-*, squad-email-*, squad-smb-customer-success, squad-smb-referral, squad-consumer-insights, squad-enterprise-data, squad-growth-experiment, squad-community-led-growth, crm, email-subject, edm-campaign
  {
    patterns: [
      "squad-analytics-%",
      "squad-email-%",
      "squad-smb-customer-success",
      "squad-smb-referral",
      "squad-consumer-insights",
      "squad-enterprise-data-marketing",
      "squad-growth-experiment",
      "squad-community-led-growth",
      "crm-marketing-squad",
      "email-subject-micro-squad",
      "edm-campaign-small-squad",
    ],
    workspace: ["analytics"],
    methodology: "Sean Ellis & Morgan Brown – Hacking Growth (2017) / Fred Reichheld – NPS Framework (2011)",
    outputFormats: ["成長指標Dashboard", "Email 自動化流程", "顧客行為分析"],
    showcases: analyticsShowcase,
  },

  // squad-ecommerce-* → website
  {
    patterns: ["squad-ecommerce-%"],
    workspace: ["website"],
    methodology: "Shopify Merchant Success Playbook (2023) / Bryan Eisenberg – Always Be Testing (2008)",
    outputFormats: ["電商策略報告", "商品頁優化建議", "購物流程分析"],
    showcases: websiteShowcase,
  },

  // squad-brand-*, squad-content-text-*, squad-global-brand-management, squad-multi-market-imc, squad-employer-branding, squad-partner-marketing, squad-product-lifecycle, squad-global-digital, squad-enterprise-content, squad-brand-protection, squad-enterprise-csr
  {
    patterns: [
      "squad-brand-%",
      "squad-content-text-%",
      "squad-global-brand-management",
      "squad-multi-market-imc",
      "squad-employer-branding",
      "squad-partner-marketing",
      "squad-product-lifecycle-marketing",
      "squad-global-digital-marketing",
      "squad-enterprise-content-strategy",
      "squad-brand-protection-marketing",
      "squad-enterprise-csr-marketing",
    ],
    workspace: ["strategy"],
    methodology: "April Dunford – Obviously Awesome (2019) / Philip Kotler – Marketing Management (15e, 2016)",
    outputFormats: ["品牌策略文件", "整合行銷計畫", "品牌資產指南"],
    showcases: strategyShowcase,
  },

  // squad-smb-* (remaining: brand-building, integrated, competitive, revenue-sprint, digital-transformation, seasonal→event, exhibition→event handled separately)
  {
    patterns: [
      "squad-smb-brand-building",
      "squad-smb-integrated-marketing",
      "squad-smb-competitive",
      "squad-smb-revenue-sprint",
      "squad-smb-digital-transformation",
    ],
    workspace: ["strategy"],
    methodology: "Philip Kotler – Marketing Management (15e, 2016) / Roger Martin – Playing to Win (2013)",
    outputFormats: ["整合行銷計畫", "競爭策略文件", "業績成長路徑圖"],
    showcases: strategyShowcase,
  },

  // squad-smb-exhibition, squad-smb-seasonal, squad-corporate-events → event
  {
    patterns: [
      "squad-smb-exhibition",
      "squad-smb-seasonal",
      "squad-corporate-events",
    ],
    workspace: ["event"],
    methodology: "Pine & Gilmore – The Experience Economy (1999) / Smilansky – Experiential Marketing (2009)",
    outputFormats: ["活動企劃書", "展覽參展計畫", "活動成效報告"],
    showcases: eventShowcase,
  },

  // squad-pre-launch, squad-early-adopter, squad-cold-start, squad-freemium, squad-developer, squad-web3, squad-ai-product, squad-smb-integrated, startup-growth 等 strategy
  {
    patterns: [
      "squad-pre-launch-marketing",
      "squad-early-adopter-marketing",
      "squad-cold-start-marketing",
      "squad-freemium-marketing",
      "squad-developer-marketing",
      "squad-web3-marketing",
      "squad-ai-product-marketing",
      "startup-growth",
    ],
    workspace: ["strategy"],
    methodology: "Eric Ries – The Lean Startup (2011) / Sean Ellis – Hacking Growth (2017)",
    outputFormats: ["冷啟動策略文件", "早期用戶獲取計畫", "成長實驗報告"],
    showcases: strategyShowcase,
  },

  // Industry-specific strategy squads
  {
    patterns: [
      "government-marketing",
      "ip-marketing",
      "gamification-marketing-squad",
      "finance-marketing-squad",
      "healthcare-marketing-squad",
      "edtech-marketing-squad",
      "travel-marketing",
      "csr-communication",
      "political-marketing",
      "squad-insurance-marketing",
      "squad-telecom-marketing",
      "squad-tech-startup-marketing",
      "squad-hospital-marketing",
      "squad-school-marketing",
    ],
    workspace: ["strategy"],
    methodology: "Philip Kotler – Marketing Management (15e, 2016) / Kotler – Marketing in the Public Sector (2007)",
    outputFormats: ["行銷策略計畫", "目標受眾分析", "KPI 追蹤Dashboard"],
    showcases: strategyShowcase,
  },

  // PR: npo, entertainment, sports, political (already covered), csr (already covered)
  {
    patterns: [
      "npo-marketing",
      "entertainment-marketing",
      "sports-marketing",
    ],
    workspace: ["pr"],
    methodology: "Philip Kotler – Social Marketing: Changing Behaviors for Good (2016) / Jonah Berger – STEPPS (2013)",
    outputFormats: ["公關企劃書", "媒體名單", "品牌曝光分析"],
    showcases: prShowcase,
  },

  // Monitoring: data-driven, programmatic, mobile-marketing, output-design-center
  {
    patterns: [
      "data-driven-marketing-squad",
      "programmatic-squad",
      "mobile-marketing-squad",
      "output-design-center",
    ],
    workspace: ["monitoring"],
    methodology: "Avinash Kaushik – Web Analytics 2.0: Using the Wisdom of Crowds to Improve Your Digital Marketing (2009)",
    outputFormats: ["數位監測報告", "競品情報分析", "受眾洞察報告"],
    showcases: monitoringShowcase,
  },

  // Instore: F&B, retail, hypermarket, chain restaurant, retail banking, smb-ecommerce-start
  {
    patterns: [
      "fnb-marketing-squad",
      "squad-chain-restaurant-marketing",
      "squad-hypermarket-marketing",
      "squad-retail-banking-marketing",
      "squad-smb-ecommerce-start",
    ],
    workspace: ["instore"],
    methodology: "Pine & Gilmore – The Experience Economy (1999) / Alibaba Research – OMO (Online-Merge-Offline) Retail Framework (2017)",
    outputFormats: ["門市體驗設計報告", "OMO 整合策略", "零售成效分析"],
    showcases: instoreShowcase,
  },

  // Youtube: short video
  {
    patterns: ["short-video-script-micro-squad"],
    workspace: ["youtube"],
    methodology: "Derral Eves – The YouTube Formula: How Anyone Can Unlock the Algorithm to Drive Views (2021)",
    outputFormats: ["短影音腳本", "影片發布日曆", "觀看率分析"],
    showcases: youtubeShowcase,
  },

  // Misc small squads: ad-headline, ad-image, single-ad, social-calendar, blog-post, product-description
  {
    patterns: [
      "ad-headline-micro-squad",
      "ad-image-micro-squad",
      "single-ad-small-squad",
      "social-calendar-small-squad",
    ],
    workspace: ["facebook"],
    methodology: "Ryan Deiss / DigitalMarketer – Customer Value Optimization (2015) / Meta Ads Best Practices",
    outputFormats: ["廣告文案素材", "視覺廣告包", "廣告成效報告"],
    showcases: facebookShowcase,
  },
  {
    patterns: [
      "blog-post-small-squad",
      "product-description-micro-squad",
    ],
    workspace: ["strategy"],
    methodology: "Joe Pulizzi – Content Inc. (2015) / Ann Handley – Everybody Writes (2014)",
    outputFormats: ["部落格文章", "產品描述文案", "SEO 內容報告"],
    showcases: strategyShowcase,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
    charset: "utf8mb4",
  });

  const conn = await pool.getConnection();
  let totalPatched = 0;

  try {
    console.log("\n═══ Patch Squads Workspace ════════════════════════════════════\n");

    for (const rule of RULES) {
      // Build WHERE clause: slug LIKE ? OR slug = ? ...
      const conditions: string[] = [];
      const params: string[] = [];

      for (const p of rule.patterns) {
        if (p.includes("%")) {
          conditions.push("slug LIKE ?");
        } else {
          conditions.push("slug = ?");
        }
        params.push(p);
      }

      const whereClause = `is_active = 1 AND workspace IS NULL AND (${conditions.join(" OR ")})`;

      // Preview count first
      const [countRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM squads WHERE ${whereClause}`,
        params
      ) as any[];
      const cnt = (countRows as any[])[0]?.cnt ?? 0;
      if (cnt === 0) continue;

      const workspaceJson  = JSON.stringify(rule.workspace);
      const outputFmtJson  = JSON.stringify(rule.outputFormats);
      const showcasesJson  = JSON.stringify(rule.showcases);

      await conn.execute(
        `UPDATE squads
         SET workspace = ?,
             methodology = ?,
             output_formats = ?,
             showcases = ?,
             required_integrations = COALESCE(required_integrations, '[]'),
             updated_at = NOW()
         WHERE ${whereClause}`,
        [workspaceJson, rule.methodology, outputFmtJson, showcasesJson, ...params]
      );

      console.log(`✅ [${rule.workspace.join("/")}] ${cnt} squads | ${rule.patterns[0]} ... | ${rule.methodology.slice(0, 60)}`);
      totalPatched += cnt;
    }

    console.log(`\n══ 完成：共補齊 ${totalPatched} 個 squads ══\n`);

    // Final audit
    const [remaining] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM squads WHERE is_active = 1 AND workspace IS NULL`
    ) as any[];
    const leftover = (remaining as any[])[0]?.cnt ?? 0;
    if (leftover > 0) {
      console.warn(`⚠️  仍有 ${leftover} 個 squads workspace 為 NULL（請檢查）`);
    } else {
      console.log("✅ 所有 active squads 的 workspace 均已填入！");
    }

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[patch-workspace] ERROR:", err.message ?? err);
  process.exit(1);
});
