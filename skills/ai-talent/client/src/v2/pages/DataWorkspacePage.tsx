/**
 * DataWorkspacePage — private preview for OnBrand data modes.
 *
 * The top-left ShellLayout mode switcher chooses Content / Performance / Market.
 * This page intentionally has NO inner icon rail: the main left rail already
 * changes functions based on the selected mode.
 */
import React from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  Activity, BarChart3, Database, Globe2, LineChart, Megaphone,
  MousePointerClick, Search, ShoppingBag, Sparkles, Target, TrendingUp,
} from "lucide-react";

const ALLOWED_EMAIL = "sowork@sowork.tw";

type Mode = "performance" | "market";

type Source = {
  id: string;
  label: string;
  short: string;
  icon: React.ReactNode;
  color: string;
  desc: string;
};

type AgentRef = {
  id: number;
  name: string;
  title: string;
};

type TaskCard = {
  title: string;
  agent: AgentRef;
  skill: string;
  data: string;
  output: string;
};

type Evidence = {
  label: string;
  source: string;
  url?: string;
  note: string;
};

type MarketBlock = {
  headline: string;
  summary: string;
  metrics: Array<{ label: string; value: string; note: string }>;
  bullets: string[];
  evidence: Evidence[];
};

type PageDesign = {
  hypothesis: string;
  actions: string[];
  blocks: MarketBlock[];
};

const AGENTS = {
  marketPm: { id: 180159, name: "Claire Hsu", title: "Social Media Brand Strategist" },
  seo: { id: 25, name: "Kevin Lee", title: "SEO Strategist (E-commerce)" },
  content: { id: 60021, name: "Tina Ji", title: "FB/IG Social Copywriter" },
  social: { id: 227632, name: "劉淑芬", title: "KOL Strategy Director — IG × 科技" },
  threads: { id: 229385, name: "林志明", title: "Threads Content Specialist — 科技" },
  ecommerceVisual: { id: 210021, name: "Iris Wu", title: "E-commerce Visual Designer" },
  qa: { id: 210207, name: "Chun-Hao Chen", title: "Senior Social Media Editor" },
};

const performanceSources: Source[] = [
  { id: "overview", label: "整合總覽", short: "總覽", icon: <BarChart3 size={18} />, color: "#111827", desc: "跨平台預算、成效、異常與老闆版摘要" },
  { id: "meta", label: "Meta", short: "Meta", icon: <Megaphone size={18} />, color: "#1877F2", desc: "Facebook / Instagram 廣告活動、受眾與素材" },
  { id: "google", label: "Google", short: "GAds", icon: <Search size={18} />, color: "#4285F4", desc: "Search / Display / PMax / YouTube Ads" },
  { id: "shopline", label: "Shopline", short: "Shop", icon: <ShoppingBag size={18} />, color: "#00A870", desc: "商品銷售、轉換漏斗、客單價與回購" },
  { id: "ga", label: "GA / 官網", short: "GA", icon: <MousePointerClick size={18} />, color: "#F59E0B", desc: "流量來源、Landing page、路徑與轉換問題" },
  { id: "attribution", label: "整合歸因", short: "歸因", icon: <Target size={18} />, color: "#7C3AED", desc: "跨平台比較、預算重分配與 Campaign ROI" },
];

const marketSources: Source[] = [
  { id: "overview", label: "市場總覽", short: "總覽", icon: <TrendingUp size={18} />, color: "#111827", desc: "從 Iris Girls 資料與公開來源定義競品、需求與機會" },
  { id: "listening", label: "輿情監測", short: "輿情", icon: <Activity size={18} />, color: "#DC2626", desc: "把討論切成價格、版型、甜美風格、通路信任四類訊號" },
  { id: "keywords", label: "關鍵字分析", short: "KW", icon: <Search size={18} />, color: "#2563EB", desc: "產品資料 → 品類詞 / 風格詞 / 場景詞 / 高意圖詞" },
  { id: "geo", label: "GEO / SEO", short: "GEO", icon: <Globe2 size={18} />, color: "#059669", desc: "AI 搜尋與一般搜尋需要引用的品牌證據缺口" },
  { id: "competitors", label: "競品情報", short: "競品", icon: <Database size={18} />, color: "#9333EA", desc: "以定位、商品、官方頁與可搜尋語境定義競品集合" },
  { id: "opportunity", label: "機會診斷", short: "機會", icon: <Sparkles size={18} />, color: "#EA580C", desc: "把市場情報轉成內容、SEO、廣告與商品頁任務" },
];

const performanceTasks: Record<string, TaskCard[]> = {
  overview: [
    { title: "本週成效摘要", agent: AGENTS.marketPm, skill: "ecommerce-analytics-dashboard", data: "Meta / Google / GA / Shopline", output: "老闆版一頁摘要 + 3 個優先行動" },
    { title: "預算花費 vs 成果", agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "Spend / ROAS / CPA / CVR", output: "預算效率排序與異常提醒" },
    { title: "最該處理的 3 件事", agent: AGENTS.qa, skill: "timeseries-proportional-scaling", data: "7/14/30 日趨勢", output: "今天可執行的修正清單" },
  ],
  meta: [
    { title: "活動成效診斷", agent: AGENTS.social, skill: "meta-ads-google-sheets-sync", data: "Campaign / Ad set / Ad", output: "高低效活動與原因判讀" },
    { title: "受眾疲乏偵測", agent: AGENTS.marketPm, skill: "ecommerce-analytics-dashboard", data: "Frequency / CTR / CPM", output: "疲乏受眾與排除/拓展建議" },
    { title: "素材勝負分析", agent: AGENTS.ecommerceVisual, skill: "sowork-analytics-ads-page", data: "Thumbstop / CTR / CVR", output: "保留、重剪、停用素材清單" },
    { title: "下一週預算建議", agent: AGENTS.seo, skill: "ai-saas-pricing", data: "Spend / Result / ROAS", output: "預算移轉比例與風險說明" },
  ],
  google: [
    { title: "關鍵字成效分析", agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "Keyword / Query / CPA", output: "加碼、否定、拆組建議" },
    { title: "PMax / Display 診斷", agent: AGENTS.marketPm, skill: "sowork-analytics-ads-page", data: "Asset group / Placement", output: "資產群與版位調整建議" },
    { title: "搜尋意圖洞察", agent: AGENTS.seo, skill: "taiwan-solo-founder-market-research", data: "Search terms", output: "轉換型 vs 探索型需求分類" },
  ],
  shopline: [
    { title: "商品銷售排行", agent: AGENTS.ecommerceVisual, skill: "shopline-api-integration", data: "Orders / SKU / Revenue", output: "主推商品與滯銷商品清單" },
    { title: "轉換漏斗", agent: AGENTS.seo, skill: "ecommerce-analytics-dashboard", data: "Session → Cart → Checkout → Purchase", output: "漏斗流失點與修正任務" },
    { title: "回購與客單價", agent: AGENTS.marketPm, skill: "amazon-marketplace-sales-enrichment", data: "AOV / Repeat / Cohort", output: "加購、組合、回購策略" },
  ],
  ga: [
    { title: "流量來源分析", agent: AGENTS.seo, skill: "google-workspace", data: "Source / Medium / Campaign", output: "有效流量與假流量分流" },
    { title: "Landing Page 表現", agent: AGENTS.qa, skill: "browser-frontend-testing-without-ssh", data: "Landing / Bounce / CVR", output: "頁面問題與 A/B 測試建議" },
    { title: "使用者路徑", agent: AGENTS.marketPm, skill: "ecommerce-analytics-dashboard", data: "Path / Events", output: "高轉換路徑與流失節點" },
  ],
  attribution: [
    { title: "跨平台成效比較", agent: AGENTS.marketPm, skill: "ecommerce-analytics-dashboard", data: "Meta + Google + GA + Shopline", output: "平台效率矩陣" },
    { title: "預算重新分配", agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "CPA / ROAS / Margin", output: "下週預算配置表" },
    { title: "Campaign ROI 報告", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "Cost / Revenue / Assisted conversion", output: "可貼給老闆的一頁報告" },
  ],
};

const marketTasks: Record<string, TaskCard[]> = {
  overview: [
    { title: "Iris Girls 市場機會摘要", agent: AGENTS.marketPm, skill: "market-intel", data: "brands#2957 + products#144-155 + 公開官網證據", output: "競品集合、需求地圖、P0 機會" },
    { title: "競品與趨勢快報", agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "IRIS / AIR SPACE / PAZZO / Mercci22 / IRIS GARDEN", output: "每個競品的定位與可攻空白" },
    { title: "內容題材建議", agent: AGENTS.content, skill: "social-listening-reporting", data: "甜美穿搭、蝴蝶結、蕾絲、百褶裙、韓系清新", output: "可轉成 FB/IG/SEO 的任務" },
  ],
  listening: [
    { title: "輿情主題分流", agent: AGENTS.social, skill: "social-listening-reporting", data: "公開搜尋 snippet + 女裝社群常見決策語境", output: "價格、版型、質感、場合四大討論軸" },
    { title: "社群原話需求萃取", agent: AGENTS.threads, skill: "social-listening-excel-summary", data: "Dcard/PTT/Threads search targets", output: "要補抓的原話欄位與內容角度" },
    { title: "危機與機會分流", agent: AGENTS.qa, skill: "news-alert-triage", data: "退換貨、尺寸、色差、材質敏感詞", output: "回應 / 放大 / 觀察分級" },
  ],
  keywords: [
    { title: "關鍵字需求分群", agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "Iris Girls 商品名 + 競品 meta description", output: "品類詞、風格詞、場景詞、品牌比較詞" },
    { title: "內容缺口分析", agent: AGENTS.seo, skill: "website-design-cloning", data: "官方頁 / SERP / FAQ 可見內容", output: "應補文章、FAQ、商品集合頁" },
    { title: "高意圖詞優先級", agent: AGENTS.marketPm, skill: "taiwan-solo-founder-market-research", data: "甜美洋裝 / 蕾絲上衣 / 小香風 / 百褶裙", output: "先做哪些詞、接哪個商品頁" },
  ],
  geo: [
    { title: "AI 搜尋可見度檢查", agent: AGENTS.seo, skill: "official-public-source-research", data: "官網可引用文字 + 競品可引用文字", output: "Iris Girls 缺少可被 AI 引用的品牌證據" },
    { title: "答案引擎內容包", agent: AGENTS.content, skill: "data-backed-market-research-reports", data: "FAQ / schema / proof points", output: "甜美女裝推薦答案可引用段落" },
    { title: "競品引用比較", agent: AGENTS.marketPm, skill: "source-backed-competitive-evidence", data: "官方頁標題與描述", output: "誰更容易被搜尋與 AI 推薦" },
  ],
  competitors: [
    { title: "競品集合定義", agent: AGENTS.marketPm, skill: "source-backed-competitive-evidence", data: "品牌定位 + 產品 + 官方公開頁", output: "直接 / 間接 / 風格競品分層" },
    { title: "競品訊息地圖", agent: AGENTS.seo, skill: "branding-3-layer", data: "官網 meta / 商品線 / 價值主張", output: "訊息空白與我方切入點" },
    { title: "案例靈感庫", agent: AGENTS.ecommerceVisual, skill: "market-intel", data: "creative_cases + competitor pages", output: "可借鏡 campaign pattern" },
  ],
  opportunity: [
    { title: "本週機會點排序", agent: AGENTS.marketPm, skill: "consulting-delivery-playbooks", data: "趨勢 + 聲量 + 競品空白", output: "P0/P1/P2 機會清單" },
    { title: "轉內容任務", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "市場洞察", output: "可直接派給內容 agent 的 task cards" },
    { title: "轉廣告測試", agent: AGENTS.social, skill: "sowork-analytics-ads-page", data: "痛點 / 受眾 / 競品空白", output: "A/B test 假設與素材方向" },
  ],
};

const irisMarketDesign: Record<string, PageDesign> = {
  overview: {
    hypothesis: "Iris Girls 的市場位置不是泛女裝，而是「專櫃信任 × 甜美符號 × 價格親和」的年輕女裝。競品應從甜美/韓系/生活感/平價時尚四個替代情境定義。",
    actions: ["建立 Iris Girls vs 4 類競品的商品集合頁", "補上甜美穿搭 FAQ 與場合頁，提升 GEO 可引用性", "用蝴蝶結、蕾絲、百褶裙做 3 組內容測試"],
    blocks: [
      {
        headline: "從 OnBrand 資料定義品牌邊界",
        summary: "資料庫中 Iris Girls 品牌定位指向心理年齡 25–35、甜美色系、蝴蝶緞帶、專櫃質感與價格親和；產品資料集中在上衣、洋裝、百褶裙、蕾絲、小香風與緞帶語彙。",
        metrics: [
          { label: "品牌資料", value: "brands#2957", note: "定位、受眾、語氣已完成" },
          { label: "商品樣本", value: "12 件", note: "products#144–155，皆有圖片；多數有深度定位" },
          { label: "核心語彙", value: "6 組", note: "甜美、蝴蝶結、蕾絲、百褶裙、小香風、韓系清新" },
        ],
        bullets: ["不是用單一品類找競品，而是用「穿搭情境 + 風格符號 + 價格帶」找替代選擇。", "IRIS 主線是同集團升級/熟齡參照；AIR SPACE / PAZZO / Mercci22 是流量與搜尋替代；IRIS GARDEN 是韓系清新風格替代。"],
        evidence: [
          { label: "DB brand", source: "brands#2957 Iris Girls", note: "甜美自信、專櫃質感、蝴蝶緞帶、心理年齡 25–35。" },
          { label: "DB products", source: "products#144–155", note: "水晶鑽蝴蝶上衣、初戀花園洋裝、月光蕾絲百褶裙、小香風條紋上衣等。" },
        ],
      },
    ],
  },
  listening: {
    hypothesis: "輿情頁要先呈現可執行的監測框架：甜美風格不是單一聲量，而是價格、版型、材質、場合與通路信任的組合討論。",
    actions: ["建立 Dcard/PTT/Threads query：甜美女裝 + 蕾絲/蝴蝶結/百褶裙", "把評論分成價格敏感、尺寸版型、甜美接受度、通路信任", "將負評詞接回商品頁 FAQ"],
    blocks: [
      {
        headline: "四類輿情桶：先讓前台知道 agent 正在看什麼",
        summary: "目前未接付費 OpView/Meltwater 匯出，因此此頁先放 OnBrand agent 可執行的分類與公開搜尋源；接上匯出後，這些桶會直接填入聲量、情緒與原話。",
        metrics: [
          { label: "監測桶", value: "4", note: "價格 / 版型 / 甜美符號 / 通路信任" },
          { label: "高風險詞", value: "5", note: "色差、材質、尺寸、退換貨、顯胖" },
          { label: "機會詞", value: "6", note: "初戀感、約會、上班甜美、法式、韓系、蝴蝶結" },
        ],
        bullets: ["輿情不只顯示聲量，還要直接告訴內容 agent：哪個疑慮要回應、哪個情緒可放大。", "Iris Girls 的甜美語彙容易被喜歡者視為溫柔自信，也可能被猶豫者視為太少女；此差異需在文案中處理。"],
        evidence: [
          { label: "Skill", source: "social-listening-reporting", note: "把社群討論轉成短摘要、情緒與品牌建議。" },
          { label: "Data target", source: "Dcard / PTT / Threads / News search", note: "接入後以 query bucket 填入真實原文、聲量與情緒。" },
        ],
      },
    ],
  },
  keywords: {
    hypothesis: "Iris Girls 應先搶「風格 + 單品」詞，而不是泛『女裝』大詞；商品名已提供足夠的 SEO seed。",
    actions: ["建立 5 個商品集合頁：蝴蝶結上衣、蕾絲上衣、甜美洋裝、百褶裙、小香風上衣", "每頁補場合 FAQ：約會/上班/聚會/春夏", "把品牌詞與競品比較詞分開投放與監測"],
    blocks: [
      {
        headline: "從商品資料抽出的 keyword map",
        summary: "產品名稱中的水晶鑽、蝴蝶、初戀花園、月光蕾絲、緞帶、百褶、小香風、POLO 等詞，可轉成 SEO 集合頁與廣告 ad group。",
        metrics: [
          { label: "品類詞", value: "4", note: "上衣、洋裝、裙、POLO" },
          { label: "風格詞", value: "5", note: "甜美、蕾絲、蝴蝶結、小香風、韓系" },
          { label: "場景詞", value: "4", note: "約會、上班、聚會、春夏" },
        ],
        bullets: ["優先級：蝴蝶結上衣 > 甜美洋裝 > 蕾絲上衣 > 百褶裙 > 小香風上衣。", "每個 keyword cluster 都要顯示 Agent / Skill / Data source，讓使用者知道不是憑空生成。"],
        evidence: [
          { label: "DB products", source: "Iris Girls products#144–155", note: "商品名稱直接提供 keyword seed。" },
          { label: "Official competitor meta", source: "AIR SPACE / PAZZO / Mercci22 官網描述", note: "用競品公開描述判斷搜尋語境與差異化。" },
        ],
      },
    ],
  },
  geo: {
    hypothesis: "目前 Iris Girls 的可引用資料弱於大型競品；要讓 AI 搜尋推薦，需要補『我是誰、適合誰、和 PAZZO/AIR SPACE 差在哪』的公開證據。",
    actions: ["新增 Iris Girls 品牌故事/FAQ/比較頁", "每個商品集合頁加入材質、版型、場合、保養與退換貨 FAQ", "建立可被 AI 摘要的一段式品牌介紹"],
    blocks: [
      {
        headline: "GEO 缺口：可被答案引擎引用的文字不足",
        summary: "大型競品官網有明確 meta description；Iris Girls 的內部定位已完整，但需要轉成前台可抓取、可引用、可比較的公開文字。",
        metrics: [
          { label: "引用準備度", value: "中低", note: "內部定位完整；公開結構化內容不足" },
          { label: "需補頁型", value: "3", note: "品牌故事、FAQ、競品比較" },
          { label: "答案模板", value: "1", note: "甜美女裝推薦時的品牌介紹段落" },
        ],
        bullets: ["GEO 頁面不只顯示排名，而要列出 AI 引用需要的 proof points。", "建議前台直接呈現『AI 會引用什麼 / 缺什麼 / 要補哪頁』。"],
        evidence: [
          { label: "AIR SPACE", source: "official meta", url: "https://www.airspaceonline.com/tw/zh-hant/", note: "公開描述含女孩、靈魂、平價時尚等可引用語句。" },
          { label: "PAZZO", source: "official meta", url: "https://www.pazzo.com.tw", note: "公開描述含生活好感衣著、質地、幸福感、新生活哲學。" },
          { label: "Mercci22", source: "official meta", url: "https://www.mercci22.com", note: "公開描述含多元質感穿搭、支線與品牌 IP。" },
        ],
      },
    ],
  },
  competitors: {
    hypothesis: "競品不是只列相似品牌，而要標示『為什麼被納入』：同集團升級、風格替代、價格替代、生活感替代、韓系替代。",
    actions: ["把競品表做成可點擊 evidence cards", "每個競品補上官方 URL、定位摘要、Iris Girls 可攻空白", "後續接 social listening 後補聲量與情緒"],
    blocks: [
      {
        headline: "Iris Girls 初版競品集合",
        summary: "本次以 Iris Girls 的內部定位與商品 seed，搭配官方公開頁，先建立可驗證的競品集合。",
        metrics: [
          { label: "直接/近似競品", value: "4", note: "AIR SPACE、PAZZO、Mercci22、IRIS GARDEN" },
          { label: "內部參照", value: "1", note: "IRIS 主線：熟齡/專櫃/優雅升級" },
          { label: "證據類型", value: "官方頁 + DB", note: "避免未驗證社群聲量冒充事實" },
        ],
        bullets: ["AIR SPACE：平價時尚與女孩情緒語境，是流量/價格替代。", "PAZZO：生活好感與基本質感，是日常衣著替代。", "Mercci22：多元質感穿搭與支線操作，是社群/風格廣度替代。", "IRIS GARDEN：韓系清新，是風格近似替代。"],
        evidence: [
          { label: "IRIS", source: "official site", url: "https://www.iris.com.tw", note: "春日法國鄉間、鳶尾花、細緻工藝、女性迷人氣質。" },
          { label: "AIR SPACE", source: "official site", url: "https://www.airspaceonline.com/tw/zh-hant/", note: "平價時尚與女孩穿搭語境。" },
          { label: "PAZZO", source: "official site", url: "https://www.pazzo.com.tw", note: "生活好感衣著、基本質感與自在生活。" },
          { label: "Mercci22", source: "official site", url: "https://www.mercci22.com", note: "多元質感穿搭、WOW/ME/NO.22 等支線。" },
          { label: "IRIS GARDEN", source: "official site", url: "https://www.irisgarden.com.tw", note: "韓系清新服飾。" },
        ],
      },
    ],
  },
  opportunity: {
    hypothesis: "Iris Girls 的機會不是再喊甜美，而是把甜美拆成可購買的場合：上班不幼稚、約會不刻意、聚會有細節、熟齡保有青春感。",
    actions: ["P0：建立『甜美但不幼稚』系列內容與商品集合頁", "P1：做 PAZZO/AIR SPACE 比較式 SEO/廣告素材", "P2：把 IRIS 熟齡客跨線 Iris Girls 的情境做 LINE/FB 再行銷"],
    blocks: [
      {
        headline: "三個可立即派工的市場機會",
        summary: "把市場情報轉成 content workspace 的任務卡：每個任務都標 agent、skill、data source，並可回到 FB/IG/Blog 產出。",
        metrics: [
          { label: "P0", value: "甜美但不幼稚", note: "解決少女感疑慮，放大溫柔自信" },
          { label: "P1", value: "競品比較頁", note: "承接高意圖搜尋與 GEO 引用" },
          { label: "P2", value: "熟齡跨線", note: "用 IRIS 既有信任帶 Iris Girls" },
        ],
        bullets: ["內容任務：『30+ 也能穿的甜美上衣』FB/IG 三版。", "SEO 任務：『甜美女裝品牌怎麼選？Iris Girls / AIR SPACE / PAZZO 差異』。", "商品頁任務：蝴蝶結上衣與蕾絲上衣補版型、材質、場合 FAQ。"],
        evidence: [
          { label: "DB audience", source: "brands#2957 audience_secondary", note: "40–55 熟齡女性因信任 IRIS、追求青春感而跨線選購。" },
          { label: "DB products", source: "products#144–155", note: "已有足夠單品 seed 可做內容與集合頁。" },
        ],
      },
    ],
  },
};

function useCurrentUserEmail() {
  const [email, setEmail] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { method: "POST", credentials: "include" });
        const d = r.ok ? await r.json() : null;
        if (!cancelled) setEmail(String(d?.user?.email ?? "").toLowerCase());
      } catch {
        if (!cancelled) setEmail("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { email, loading };
}

function AgentLine({ agent }: { agent: AgentRef }) {
  return <>{agent.name} <span style={{ color: "#9ca3af" }}>#{agent.id}</span><br /><span style={{ color: "#9ca3af" }}>{agent.title}</span></>;
}

export default function DataWorkspacePage() {
  const loc = useLocation();
  const { sourceId } = useParams<{ sourceId?: string }>();
  const mode: Mode = loc.pathname.startsWith("/market-intel") ? "market" : "performance";
  const { email, loading } = useCurrentUserEmail();
  const sources = mode === "performance" ? performanceSources : marketSources;
  const tasksBySource = mode === "performance" ? performanceTasks : marketTasks;
  const validSourceIds = React.useMemo(() => new Set(sources.map(s => s.id)), [sources]);
  const activeSource = sourceId && validSourceIds.has(sourceId) ? sourceId : "overview";

  if (loading) {
    return <div style={{ padding: 28, color: "#9ca3af", fontSize: 13 }}>載入資料工作區…</div>;
  }
  if (email !== ALLOWED_EMAIL) {
    return (
      <div style={{ maxWidth: 520, margin: "90px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", letterSpacing: "0.16em", textTransform: "uppercase" }}>Private Preview</div>
        <h1 style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: "#111827" }}>此功能目前只開放 sowork@sowork.tw</h1>
        <p style={{ marginTop: 8, fontSize: 14, color: "#6b7280", lineHeight: 1.7 }}>這是 OnBrand 的成效儀表板 / 市場情報預覽區，不會出現在其他帳號的左側選單。</p>
      </div>
    );
  }

  const active = sources.find(s => s.id === activeSource) ?? sources[0];
  const cards = tasksBySource[active.id] ?? [];
  const isPerformance = mode === "performance";
  const marketPage = !isPerformance ? irisMarketDesign[active.id] ?? irisMarketDesign.overview : null;

  return (
    <div style={{ padding: "20px 24px 80px", maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9ca3af" }}>
            {isPerformance ? "Performance Agents" : "Market Intelligence Agents · Iris Girls Demo"}
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 850, color: "#111827" }}>
            {isPerformance ? "成效儀表板" : `Iris Girls｜${active.label}`}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280", maxWidth: 760 }}>
            {isPerformance ? "左側平台列已切換成 Meta、Google、GA、Shopline 等成效資料源。" : active.desc}
          </p>
        </div>
        {!isPerformance && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: "10px 12px", background: "#fff", minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase" }}>Source Brand</div>
            <div style={{ fontSize: 14, fontWeight: 850, color: "#111827", marginTop: 3 }}>Iris Girls · brands#2957</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>products#144–155 · public web checked</div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
        <main style={{ minWidth: 0 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "linear-gradient(135deg,#fff 0%,#fafafa 100%)", padding: 22, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 16, background: active.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{active.icon}</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: "#111827" }}>{active.label}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{marketPage?.hypothesis ?? active.desc}</p>
              </div>
            </div>
          </div>

          {marketPage && (
            <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
              {marketPage.blocks.map((block) => (
                <section key={block.headline} style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: active.color }}>Live Market Brief</div>
                      <h3 style={{ margin: "6px 0", fontSize: 20, color: "#111827" }}>{block.headline}</h3>
                      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.7 }}>{block.summary}</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
                    {block.metrics.map((m) => (
                      <div key={m.label} style={{ borderRadius: 18, background: "#f9fafb", padding: 14 }}>
                        <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 800 }}>{m.label}</div>
                        <div style={{ fontSize: 22, color: "#111827", fontWeight: 900, marginTop: 4 }}>{m.value}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.4 }}>{m.note}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 8 }}>Agent interpretation</div>
                      {block.bullets.map((b) => <p key={b} style={{ margin: "7px 0", fontSize: 13, color: "#374151", lineHeight: 1.55 }}>• {b}</p>)}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 8 }}>Evidence / data source</div>
                      {block.evidence.map((e) => (
                        <div key={`${e.label}-${e.source}`} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: active.color }}>{e.label} · {e.source}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>{e.note}</div>
                          {e.url && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{e.url}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {cards.map((task) => (
              <article key={task.title} style={{ border: "1px solid #e5e7eb", borderRadius: 22, background: "#fff", padding: 18, minHeight: 230, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: active.color, background: `${active.color}12`, padding: "4px 8px", borderRadius: 999 }}>AGENT TASK</span>
                  <LineChart size={16} color="#9ca3af" />
                </div>
                <h3 style={{ margin: "14px 0 8px", fontSize: 17, lineHeight: 1.3, fontWeight: 850, color: "#111827" }}>{task.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Agent：</b><AgentLine agent={task.agent} /></p>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Skill：</b>{task.skill}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Data：</b>{task.data}</p>
                <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 13, fontWeight: 700, color: "#111827" }}>{task.output}</div>
              </article>
            ))}
          </div>
        </main>

        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18, position: "sticky", top: 84 }}>
          <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ca3af" }}>Evidence Panel</div>
          <h3 style={{ margin: "8px 0 10px", fontSize: 18, fontWeight: 850, color: "#111827" }}>{isPerformance ? "資料串接狀態" : "本頁採用資料"}</h3>
          {(isPerformance
            ? ["Meta Ads API / 報表匯入", "Google Ads / GA4", "Shopline Open API", "跨平台整合歸因表"]
            : ["brands#2957 Iris Girls positioning", "products#144–155 product seeds", "official public pages: IRIS / AIR SPACE / PAZZO / Mercci22 / IRIS GARDEN", "skills: market-intel / social-listening-reporting / source-backed-competitive-evidence / official-public-source-research"]
          ).map((x) => (
            <div key={x} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13, color: "#374151", lineHeight: 1.45 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: active.color, marginTop: 6, flex: "0 0 auto" }} /> {x}
            </div>
          ))}
          {marketPage && (
            <div style={{ marginTop: 16, borderRadius: 16, background: "#f9fafb", padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>下一步行動</div>
              {marketPage.actions.map((a) => <p key={a} style={{ margin: "7px 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>• {a}</p>)}
            </div>
          )}
          {isPerformance && (
            <div style={{ marginTop: 16, borderRadius: 16, background: "#f9fafb", padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>下一步</div>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>接上 Meta、Google、GA、Shopline connector 後，這裡會從實際後台數據更新。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
