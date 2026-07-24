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
  { id: "competitors", label: "競品情報", short: "競品", icon: <Database size={18} />, color: "#9333EA", desc: "用 social listening 儀表板檢查溫柔、自然、質感三個溝通點在競品間是否被市場認定" },
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
    { title: "形象認知監測", agent: AGENTS.social, skill: "social-listening-reporting", data: "Iris Girls / AIR SPACE / PAZZO / Mercci22 / IRIS GARDEN × 溫柔/自然/質感 query pack", output: "市場是否真的把品牌與三個宣稱連在一起" },
    { title: "競品形象雷達圖", agent: AGENTS.marketPm, skill: "opview-social-listening", data: "OpView/Meltwater mentions + sentiment + topic co-occurrence", output: "三軸聲量、情緒與佔有率比較" },
    { title: "溝通缺口轉任務", agent: AGENTS.content, skill: "source-backed-competitive-evidence", data: "官方定位 + 社群原文 + IG footprint", output: "每個弱軸對應內容、商品頁、廣告測試任務" },
  ],
  opportunity: [
    { title: "本週機會點排序", agent: AGENTS.marketPm, skill: "consulting-delivery-playbooks", data: "趨勢 + 聲量 + 競品空白", output: "P0/P1/P2 機會清單" },
    { title: "轉內容任務", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "市場洞察", output: "可直接派給內容 agent 的 task cards" },
    { title: "轉廣告測試", agent: AGENTS.social, skill: "sowork-analytics-ads-page", data: "痛點 / 受眾 / 競品空白", output: "A/B test 假設與素材方向" },
  ],
};

const irisMarketDesign: Record<string, PageDesign> = {
  overview: {
    hypothesis: "這版改成真實市場數據呈現：Iris Girls 先用 OnBrand DB 定義品牌與商品，再疊 GWI 台灣消費者行為、公開社群 footprint、官方競品頁，形成可被前台直接展示的市場情報。",
    actions: ["把 GWI Brand Discovery 設成市場總覽 benchmark", "把 Instagram footprint 當競品社群量級第一層", "後續接 OpView/Meltwater 後，直接把 mentions 與 sentiment 填入同一版型"],
    blocks: [
      {
        headline: "GWI 台灣市場發現管道：搜尋與口碑仍是 Iris Girls 的主要入口",
        summary: "GWI Taiwan Q1–Q4 2025 顯示，消費者發現新品牌/產品最高的是 Search engines 44.3%，其次是親友口碑 36.1%；社群廣告 27.3%、社群推薦/留言 22.7%、KOL/名人 18.0%、AI 12.7%。這代表 Iris Girls 的市場情報頁不應只看社群聲量，也要同時看 SEO/GEO 與口碑證據。",
        metrics: [
          { label: "搜尋引擎", value: "44.3%", note: "GWI Taiwan Brand Discovery｜8.03M" },
          { label: "親友口碑", value: "36.1%", note: "GWI Taiwan｜6.55M" },
          { label: "社群廣告", value: "27.3%", note: "GWI Taiwan｜4.96M" },
        ],
        bullets: ["市場總覽頁以 GWI 作為真實 benchmark，不再用 mock 數字。", "Iris Girls 的內容機會要同時補 Search/GEO 可見度與社群口碑，而非只發貼文。", "AI discovery 已達 12.7%，所以 GEO 頁應成為正式市場情報功能。"],
        evidence: [
          { label: "GWI", source: "Taiwan Brand Discovery Q1–Q4 2025, n≈18,100", note: "Search 44.3%、WOM 36.1%、Social ads 27.3%、Social recommendations 22.7%、AI 12.7%。" },
          { label: "OnBrand DB", source: "brands#2957 + products#144–155", note: "Iris Girls 定位與 12 件商品 seed。" },
        ],
      },
      {
        headline: "台灣社群平台基準：IG 是主戰場，Threads 已值得監測",
        summary: "GWI Named Social Media Services Used：Facebook 81.1%、Instagram 63.4%、TikTok 38.0%、Threads 34.6%、X 28.0%、LinkedIn 11.1%。Iris Girls 是女裝/穿搭品牌，前台視覺應把 IG/Threads/TikTok 作為市場情報主視覺，而不是傳統後台表格。",
        metrics: [
          { label: "Instagram", value: "63.4%", note: "11.5M Taiwan users" },
          { label: "Threads", value: "34.6%", note: "6.27M Taiwan users" },
          { label: "TikTok", value: "38.0%", note: "6.89M Taiwan users" },
        ],
        bullets: ["輿情頁建議做成 channel cards：IG footprint、Threads 口碑、Dcard/PTT 議題、新聞/Blog。", "GWI 平台滲透率可做為左側 icon 功能頁的 benchmark header。"],
        evidence: [
          { label: "GWI", source: "Taiwan Social Media Usage Q1–Q4 2025", note: "Facebook 81.1%、Instagram 63.4%、TikTok 38.0%、Threads 34.6%。" },
        ],
      },
    ],
  },
  listening: {
    hypothesis: "Iris Girls 的社群量級目前明顯小於直接競品；輿情頁要以『社群 footprint 差距 + 話題桶』呈現，而不是只列正負情緒。",
    actions: ["用 IG follower/post footprint 做競品社群量級圖", "把 OpView/Meltwater mentions 接到同一頁的 Volume/Sentiment row", "先監測甜美穿搭、蝴蝶結、蕾絲、百褶裙、小香風五組 query"],
    blocks: [
      {
        headline: "公開 Instagram footprint：Iris Girls 與競品有 100x 以上量級差",
        summary: "我實際抓取 Instagram 公開 profile meta：Iris Girls @iris_girls 為 1,765 followers / 1,682 posts；AIR SPACE 385K followers、PAZZO 303K、Mercci22 223K、IRIS GARDEN 33K。這個頁面適合做成橫向 bar chart，讓使用者一眼看到品牌社群基礎差距。",
        metrics: [
          { label: "Iris Girls", value: "1.8K", note: "IG followers｜1,682 posts" },
          { label: "AIR SPACE", value: "385K", note: "IG followers｜5,518 posts" },
          { label: "PAZZO", value: "303K", note: "IG followers｜3,517 posts" },
          { label: "Mercci22", value: "223K", note: "IG followers｜679 posts" },
          { label: "IRIS GARDEN", value: "33K", note: "IG followers｜351 posts" },
        ],
        bullets: ["Iris Girls 不是沒內容，而是社群放大能力遠小於同場競品。", "競品視覺頁應把 follower、post count、品牌語氣、內容支線放在同一張對比卡。", "社群 listening 接上後，followers 是基礎量級，mentions/sentiment 是近期熱度。"],
        evidence: [
          { label: "Instagram public profile", source: "@iris_girls", url: "https://www.instagram.com/iris_girls/", note: "1,765 Followers, 6 Following, 1,682 Posts。" },
          { label: "Instagram public profile", source: "@airspacetaiwan", url: "https://www.instagram.com/airspacetaiwan/", note: "385K Followers, 16 Following, 5,518 Posts。" },
          { label: "Instagram public profile", source: "@pazzo", url: "https://www.instagram.com/pazzo/", note: "303K Followers, 8 Following, 3,517 Posts。" },
          { label: "Instagram public profile", source: "@mercci22", url: "https://www.instagram.com/mercci22/", note: "223K Followers, 3 Following, 679 Posts。" },
          { label: "Instagram public profile", source: "@irisgarden2023", url: "https://www.instagram.com/irisgarden2023/", note: "33K Followers, 3 Following, 351 Posts。" },
        ],
      },
    ],
  },
  keywords: {
    hypothesis: "關鍵字頁應把 Iris Girls 商品資料直接轉成市場需求 clusters，再用 GWI 發現管道判斷 SEO/社群/廣告優先順序。",
    actions: ["建立 5 個 SEO 集合頁：蝴蝶結上衣、蕾絲上衣、甜美洋裝、百褶裙、小香風上衣", "每個集合頁接一組 IG/Reels 素材測試", "用 Search 44.3% 作為 SEO/GEO 優先級依據"],
    blocks: [
      {
        headline: "從 products#144–155 抽出的真實 keyword seed",
        summary: "Iris Girls 商品資料包含：水晶鑽蝴蝶上衣、初戀花園洋裝、月光蕾絲百褶裙、香檸珍珠上衣、霧藍緞帶洋裝、摩卡雪紡百褶裙、荷葉邊雪紡上衣、天空藍蕾絲拼接上衣、小香風條紋上衣、可可色休閒短裙、絲巾領 POLO 衫、花間綻放六片裙。這些不是腦補，是 DB 商品 seed。",
        metrics: [
          { label: "商品 seed", value: "12", note: "OnBrand products#144–155" },
          { label: "品類 clusters", value: "5", note: "上衣/洋裝/裙/POLO/外搭" },
          { label: "搜尋優先依據", value: "44.3%", note: "GWI Search discovery" },
        ],
        bullets: ["優先做『風格 × 單品』，不要先搶泛『女裝』。", "高意圖頁：蝴蝶結上衣、甜美洋裝、蕾絲上衣、百褶裙、小香風上衣。", "每個 keyword cluster 都能回接內容執行模式，派給 FB/IG/Blog agents。"],
        evidence: [
          { label: "OnBrand DB", source: "products#144–155", note: "商品名稱提供 keyword seed。" },
          { label: "GWI", source: "Taiwan Brand Discovery", note: "Search engines 44.3%，Brand/product websites 25.0%。" },
        ],
      },
    ],
  },
  geo: {
    hypothesis: "GEO 頁要呈現『AI/搜尋可引用證據』，目前 Iris Girls 的內部定位完整，但公開可引用內容弱於大型競品。",
    actions: ["把 brands#2957 定位轉成公開品牌介紹與 FAQ", "新增『甜美女裝品牌怎麼選』比較頁", "每個商品集合頁加入材質、版型、場合、保養、退換貨 FAQ"],
    blocks: [
      {
        headline: "GWI 顯示 AI discovery 已是 12.7%，但 Iris Girls 缺公開 proof points",
        summary: "GWI Taiwan Brand Discovery 中 AI（例如 ChatGPT）為 12.7%，約 2.28M。GEO 頁不應只是 SEO 排名，而要列出：AI 會引用什麼、缺什麼、要補哪個頁面。AIR SPACE、PAZZO、Mercci22 的官網 description 都有可被引用的定位文字；Iris Girls 目前需要把內部定位轉成公開頁。",
        metrics: [
          { label: "AI discovery", value: "12.7%", note: "GWI Taiwan｜2.28M" },
          { label: "Search discovery", value: "44.3%", note: "GWI Taiwan｜8.03M" },
          { label: "Brand website", value: "25.0%", note: "GWI Taiwan｜4.53M" },
        ],
        bullets: ["GEO 視覺應用：左邊 answer-readiness score，右邊 evidence gaps。", "Iris Girls 可先補三種內容：品牌故事、競品比較、甜美穿搭 FAQ。", "AI/搜尋都需要可引用文字，不是只有漂亮商品圖。"],
        evidence: [
          { label: "GWI", source: "Taiwan Brand Discovery", note: "AI 12.7%、Search 44.3%、Brand/product websites 25.0%。" },
          { label: "AIR SPACE official", source: "official meta", url: "https://www.airspaceonline.com/tw/zh-hant/", note: "平價時尚、女孩穿搭語境清楚。" },
          { label: "PAZZO official", source: "official meta", url: "https://www.pazzo.com.tw", note: "生活好感衣著、質地、幸福感、新生活哲學。" },
          { label: "Mercci22 official", source: "official meta", url: "https://www.mercci22.com", note: "多元質感穿搭、流行趨勢、支線與品牌 IP。" },
        ],
      },
    ],
  },
  competitors: {
    hypothesis: "競品情報改成 social listening 儀表板：不是只比粉絲數，而是用 Iris Girls 想溝通的『溫柔、自然、質感』三個形象詞，監測市場是否真的把這些詞跟 Iris Girls 連在一起，並比較 AIR SPACE、PAZZO、Mercci22、IRIS GARDEN 的認知佔位。",
    actions: ["建立三個形象 query pack：溫柔 / 自然 / 質感", "每個競品同時看 co-mention、sentiment、代表原文與來源平台", "把未被市場認定的溝通點轉成內容與商品頁補強任務"],
    blocks: [
      {
        headline: "Social listening 競品儀表板：三個宣稱點不是品牌自己說了算",
        summary: "新版競品頁會用社群聆聽儀表板檢查：當市場討論 Iris Girls 與競品時，是否自然出現『溫柔、自然、質感』這三個形象。Iris Girls 若想主張溫柔、自然、質感，就不能只看官方定位文字；要看 Dcard、Threads、IG caption/comment、PTT、新聞/Blog 中，這些詞是否與品牌或商品一起被提到。",
        metrics: [
          { label: "溫柔", value: "Image axis 01", note: "query: 溫柔/柔和/氣質/柔美/舒服" },
          { label: "自然", value: "Image axis 02", note: "query: 自然/日常/不刻意/清新/舒服穿" },
          { label: "質感", value: "Image axis 03", note: "query: 質感/材質/剪裁/不廉價/精緻" },
        ],
        bullets: ["判斷方式：品牌詞 × 形象詞的共同出現量，不是單看品牌自己官網文案。", "每個競品要同時看 mentions、sentiment、source mix、代表原文，才知道市場認不認。", "若 Iris Girls 在『質感』低於 PAZZO/Mercci22，就代表商品頁與素材要補材質、剪裁、實穿證據。"],
        evidence: [
          { label: "Monitoring design", source: "social-listening-reporting + OpView/Meltwater dashboard pattern", note: "以形象詞 co-mention、情緒、來源分布、熱門原文作為競品比較欄位。" },
          { label: "Brand claim seed", source: "brands#2957 Iris Girls", note: "Iris Girls 目前要溝通的核心形象：溫柔、自然、質感。" },
          { label: "Competitor set", source: "IRIS / AIR SPACE / PAZZO / Mercci22 / IRIS GARDEN", note: "由商品定位、女裝場景、官方頁與社群 footprint 定義。" },
        ],
      },
      {
        headline: "競品三軸認知看板：誰更像『溫柔』、誰更像『自然』、誰更像『質感』",
        summary: "頁面視覺改成 social listening dashboard：橫向比較五個品牌在三個形象軸上的市場認知。初版先放 query pack 與資料源狀態；一旦接上 OpView/Meltwater export，就把每格填入 mentions、正負情緒、代表原文與來源平台，直接看 Iris Girls 的宣稱是否被市場承認。",
        metrics: [
          { label: "Iris Girls", value: "待監測", note: "主張：溫柔 / 自然 / 質感；需驗證市場是否 co-mention" },
          { label: "PAZZO", value: "質感/日常", note: "官方語境：生活好感衣著、質地、幸福感" },
          { label: "AIR SPACE", value: "女孩/平價", note: "官方語境：平價時尚、女孩穿搭" },
          { label: "Mercci22", value: "質感/多元", note: "官方語境：多元質感穿搭、流行趨勢" },
          { label: "IRIS GARDEN", value: "自然/清新", note: "官方語境：韓系清新服飾" },
        ],
        bullets: ["PAZZO、Mercci22 會是『質感』軸的主要競爭者。", "AIR SPACE 在『女孩感/流行/價格親和』很強，會稀釋 Iris Girls 的甜美主張。", "IRIS GARDEN 可作為『自然/清新』軸的對照組。", "Iris Girls 要贏，不能只喊三個詞；要補真實穿搭情境與材質證據，讓社群原文開始使用這些詞。"],
        evidence: [
          { label: "PAZZO official", source: "official meta", url: "https://www.pazzo.com.tw", note: "生活好感衣著、質地、幸福感、新生活哲學。" },
          { label: "AIR SPACE official", source: "official meta", url: "https://www.airspaceonline.com/tw/zh-hant/", note: "平價時尚、女孩穿搭語境清楚。" },
          { label: "Mercci22 official", source: "official meta", url: "https://www.mercci22.com", note: "多元質感穿搭、流行趨勢、支線與品牌 IP。" },
          { label: "IRIS GARDEN official", source: "official site / @irisgarden2023", url: "https://www.irisgarden.com.tw", note: "韓系清新服飾；IG 33K followers。" },
        ],
      },
      {
        headline: "前台要呈現的 social listening 欄位",
        summary: "每一個競品 × 溝通點都應呈現四個欄位：①聲量/佔有率，②正負情緒，③代表原文，④來源平台。這樣 PM 可以直接判斷：Iris Girls 的『溫柔』是市場已認定、還是只是品牌想講；『自然』是否被 IRIS GARDEN 佔走；『質感』是否被 PAZZO/Mercci22 佔走。",
        metrics: [
          { label: "Volume", value: "mentions", note: "品牌詞 × 形象詞共同命中" },
          { label: "Sentiment", value: "+ / -", note: "同一軸上的正負評與疑慮" },
          { label: "Evidence", value: "原文", note: "每格至少保留 3 則代表貼文/留言" },
        ],
        bullets: ["看板上方：三軸雷達圖，快速看 Iris Girls 是否符合自己宣稱。", "中段：競品矩陣，五品牌 × 三形象詞。", "右側：代表原文與下一步內容任務，避免只剩抽象分數。"],
        evidence: [
          { label: "OpView fields", source: "Trend / Sentiment / Source / PopularArticle", note: "可填入總聲量、情緒、來源分布、熱門文章與命中原文。" },
          { label: "Meltwater fields", source: "Volume / Sentiment / Source mix / Top posts", note: "若 OpView topic pool 不可用，可用 Meltwater dashboard-only 讀數補同版型。" },
          { label: "Frontend source status", source: "connector-pending", note: "目前前台已改成 social-listening 儀表板版型；live mentions 接入後欄位會直接更新。" },
        ],
      },
    ],
  },

  opportunity: {
    hypothesis: "市場機會頁要把真實數據轉成可派工任務：Search/GEO 補證據、IG 補社群量級、商品 seed 補集合頁。",
    actions: ["P0：甜美但不幼稚 SEO/IG campaign", "P1：Iris Girls vs AIR SPACE/PAZZO/Mercci22 比較頁", "P2：IRIS 熟齡客跨線 Iris Girls 的 LINE/FB 再行銷"],
    blocks: [
      {
        headline: "三個可直接進內容工作區的機會",
        summary: "真實數據指出：搜尋是第一品牌發現入口（44.3%）、IG 是主要視覺社群（63.4% 使用率），但 Iris Girls IG 量級只有 1.8K followers，遠低於競品。因此機會不是再做空泛甜美定位，而是把甜美拆成可搜尋、可比較、可社群放大的任務。",
        metrics: [
          { label: "P0", value: "甜美但不幼稚", note: "解決少女感疑慮，放大溫柔自信" },
          { label: "P1", value: "競品比較頁", note: "承接 Search/GEO 高意圖入口" },
          { label: "P2", value: "IG 擴量", note: "從 1.8K 對標 33K/223K/303K/385K" },
        ],
        bullets: ["內容任務：『30+ 也能穿的甜美上衣』FB/IG 三版。", "SEO 任務：『甜美女裝品牌怎麼選？Iris Girls / AIR SPACE / PAZZO 差異』。", "商品頁任務：蝴蝶結上衣、蕾絲上衣、百褶裙補版型/材質/場合 FAQ。"],
        evidence: [
          { label: "GWI", source: "Taiwan Brand Discovery + Social Usage", note: "Search 44.3%、Instagram 63.4%、AI 12.7%。" },
          { label: "Instagram public profile", source: "@iris_girls vs competitors", note: "Iris Girls 1.8K；AIR SPACE 385K；PAZZO 303K；Mercci22 223K；IRIS GARDEN 33K。" },
          { label: "OnBrand DB", source: "brands#2957 + products#144–155", note: "商品 seed 可直接生成內容任務。" },
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
