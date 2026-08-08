/**
 * DataWorkspacePage — private preview for OnBrand data modes.
 *
 * The top-left ShellLayout mode switcher chooses Content / Performance / Market.
 * This page intentionally has NO inner icon rail: the main left rail already
 * changes functions based on the selected mode.
 */
import React from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, BarChart3, Database, ExternalLink, Globe2, LineChart, Megaphone,
  MousePointerClick, Play, Search, ShoppingBag, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { trpc } from "../../lib/trpc";

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

// 2026-07-25 (CJ「輿情監測比較像教學，缺乏實際數據」): taskKey present =
// wired to a real live-search call (marketIntelRouter.runListeningTask).
// Only the 3 listening cards have one — everything else stays exactly as
// the hand-curated Iris Girls demo designed it.
type TaskCard = {
  title: string;
  agent: AgentRef;
  skill: string;
  data: string;
  output: string;
  taskKey?: "listening.topic_buckets" | "listening.verbatims" | "listening.crisis_scan";
};

interface LiveRunResult {
  ok: boolean;
  generatedAt?: string;
  query?: string;
  items?: Array<{ title: string; source: string; excerpt: string; url?: string; sourceType?: string; publishedAt?: string }>;
  message?: string;
}

// OpView-style source buckets (label + chip color), mirrors listeningScopes.ts.
const SOURCE_TYPE_META: Record<string, { label: string; color: string }> = {
  news:    { label: "新聞",     color: "#DC2626" },
  fanpage: { label: "粉絲團",   color: "#1877F2" },
  blog:    { label: "部落格",   color: "#059669" },
  forum:   { label: "討論區",   color: "#EA580C" },
  threads: { label: "Threads",  color: "#111827" },
  youtube: { label: "YouTube",  color: "#FF0000" },
  web:     { label: "網站",     color: "#6b7280" },
};
const sourceMeta = (t?: string) => SOURCE_TYPE_META[t ?? "web"] ?? SOURCE_TYPE_META.web;

// Time-window options for the freshness filter (資料看起來很舊 → let users scope recency).
const TIME_WINDOWS: Array<{ days: number; label: string }> = [
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 3 個月" },
  { days: 180, label: "近半年" },
  { days: 365, label: "近一年" },
];

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
  { id: "listening", label: "輿情監測", short: "輿情", icon: <Activity size={18} />, color: "#DC2626", desc: "品牌聲量、情緒風險、議題高峰、來源平台與內容機會；純競品監測保留在競品情報" },
  { id: "keywords", label: "關鍵字分析", short: "KW", icon: <Search size={18} />, color: "#2563EB", desc: "產品資料 → 品類詞 / 風格詞 / 場景詞 / 高意圖詞" },
  { id: "hot_topics", label: "AI 熱門話題", short: "話題", icon: <Sparkles size={18} />, color: "#DB2777", desc: "AI 從市場與社群訊號找熱門話題，選定產品/品牌與內容型態後，直接進入內容任務" },
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
    { title: "品牌聲量與高峰偵測", agent: AGENTS.social, skill: "media-monitoring-report-production", data: "mentions / daily trend / spike posts / platform mix", output: "本週聲量健康分數、異常高峰原因、需追蹤原文", taskKey: "listening.topic_buckets" },
    { title: "情緒與風險分流", agent: AGENTS.qa, skill: "social-listening-reporting", data: "sentiment / negative topic clusters / risk keywords", output: "正中負比例、Top 負評原因、低中高風險處理建議", taskKey: "listening.crisis_scan" },
    { title: "品牌形象認知檢查", agent: AGENTS.marketPm, skill: "source-backed-competitive-evidence", data: "品牌宣稱詞 × 社群原文 co-mention", output: "品牌想說 vs 市場實際感知的缺口與代表原文", taskKey: "listening.verbatims" },
    { title: "內容機會轉任務", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "hot questions / positive UGC / recurring objections", output: "可派工的貼文、FAQ、商品頁、短影音題目" },
  ],
  keywords: [
    { title: "關鍵字需求分群", agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "Iris Girls 商品名 + 競品 meta description", output: "品類詞、風格詞、場景詞、品牌比較詞" },
    { title: "內容缺口分析", agent: AGENTS.seo, skill: "website-design-cloning", data: "官方頁 / SERP / FAQ 可見內容", output: "應補文章、FAQ、商品集合頁" },
    { title: "高意圖詞優先級", agent: AGENTS.marketPm, skill: "taiwan-solo-founder-market-research", data: "甜美洋裝 / 蕾絲上衣 / 小香風 / 百褶裙", output: "先做哪些詞、接哪個商品頁" },
  ],

  hot_topics: [
    { title: "AI 熱門話題偵測", agent: AGENTS.marketPm, skill: "social-listening-reporting", data: "OpView / GWI / 公開社群 / 競品內容", output: "3–5 個可轉內容的熱門話題與趨勢理由" },
    { title: "話題 × 產品配對", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "熱門話題 + products#144–155 + brands#2957", output: "每個話題最適合搭配的品牌或商品" },
    { title: "一鍵轉內容任務", agent: AGENTS.qa, skill: "content-task-routing", data: "topic / entity / platform / task type", output: "帶 topic prefill 進 Facebook、Instagram、TikTok、Email 或 PR 任務" },
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
    hypothesis: "Iris Girls 近 30 天輿情以社群商品互動為主，整體聲量 164 則，負評尚未形成明顯擴散；討論高峰集中在 Facebook 直播／快閃販售與 Instagram 聯名商品內容，屬於可轉換成素材與商品頁證據的正向口碑，而非危機型聲量。",
    actions: ["優先放大高互動商品與快閃內容，轉成實穿、場合與聯名質感素材", "持續觀察 Facebook 粉絲團與 Instagram 兩個主聲量來源", "修正 IRIS / Iris Girls 品牌詞口徑，降低通路與同名商品干擾"],
    blocks: [
      {
        headline: "近 30 天聲量 164 則，討論高峰來自商品與快閃互動",
        summary: "2026/06/25–2026/07/24 期間，Iris Girls 累積 164 則相關討論，其中主文 32 則、回文 132 則。聲量最高日為 07/18（24 則），其次為 07/07（23 則）；兩波高峰皆由 Facebook 直播／快閃販售貼文與 Instagram 聯名商品內容帶動，顯示目前市場討論主要圍繞商品曝光、販售情境與穿搭互動，尚未出現危機型爆量。",
        metrics: [
          { label: "Total mentions", value: "164", note: "2026/06/25–07/24" },
          { label: "主文 / 回文", value: "32 / 132", note: "回文互動占主要聲量" },
          { label: "Peak day", value: "07/18 · 24", note: "次高 07/07 · 23" },
          { label: "聲量性質", value: "商品互動", note: "直播、快閃、聯名與穿搭內容帶動" },
        ],
        bullets: ["Iris Girls 近 30 天仍有可觀測聲量，但來源集中於社群販售與商品互動。", "07/18 與 07/07 的高峰較接近活動／商品曝光帶動，不屬於負評或危機擴散。", "品牌可把高峰貼文拆成商品賣點、場合穿搭與聯名質感三類內容素材。", "後續監測重點應放在高互動貼文是否能帶動品牌形象詞，而不只是短期販售互動。"],
        evidence: [
          { label: "Trend", source: "Iris Girls｜2026/06/25–2026/07/24", note: "總聲量 164；07/18 為 24 則，07/07 為 23 則。" },
          { label: "Volume structure", source: "主回文統計", note: "主文 32 則、回文 132 則，互動型討論占比高。" },
          { label: "Report scope", source: "OpView Insight", note: "全來源口徑；前台呈現整理後報告數據，不顯示操作流程。" },
        ],
      },
      {
        headline: "來源以社群為主：Facebook 粉絲團與 Instagram 是核心觀測場域",
        summary: "Iris Girls 近 30 天聲量有 89.0% 來自社群網站，新聞與討論區各占 5.5%。熱門網站中，Facebook 粉絲團貢獻 114 則、Instagram 25 則，明顯高於 PTT、Dcard、新聞與部落格等來源。這代表現階段輿情不是新聞外溢或論壇危機，而是社群銷售、商品展示與穿搭內容的反應監測。",
        metrics: [
          { label: "社群網站", value: "89.0%", note: "主要討論場域" },
          { label: "新聞", value: "5.5%", note: "低量外溢" },
          { label: "討論區", value: "5.5%", note: "低頻觀察" },
          { label: "FB 粉絲團", value: "114", note: "最大聲量來源" },
        ],
        bullets: ["Facebook 粉絲團是最大聲量來源，內容多與直播、快閃和販售互動相關。", "Instagram 提供第二層視覺與商品展示聲量，可作為穿搭素材與聯名內容的主要證據來源。", "PTT／Dcard／新聞聲量仍低，短期不宜把頁面重心放在危機或論壇負評。", "報告頁應以社群來源分布、熱門貼文與內容機會為主軸呈現。"],
        evidence: [
          { label: "Source mix", source: "來源分布", note: "社群網站 89.0%、新聞 5.5%、討論區 5.5%、部落格 0.0%。" },
          { label: "Top websites", source: "熱門網站", note: "Facebook粉絲團 114、Instagram 25、Facebook公開社團 4、Ptt 3、媽咪拜 3。" },
          { label: "Implication", source: "輿情判讀", note: "目前核心是社群販售與穿搭內容聲量，不是競品排行或新聞危機。" },
        ],
      },
      {
        headline: "正評 34、負評 0，口碑可轉為商品與內容素材",
        summary: "情緒面呈現正向穩定：近 30 天正評 34 則、負評 0 則，其餘多為中性商品互動。代表內容包含西西和Q米的台北民生社區 IRIS 艾莉詩女裝快閃特賣會、momo購物網的 IRIS x 專櫃香水盛夏香旅，以及 The Butters 奶油家族的穿搭貼文。這些討論可作為商品頁佐證、實穿內容與聯名素材延伸，而非僅作為聲量數字展示。",
        metrics: [
          { label: "Positive", value: "34", note: "正向討論" },
          { label: "Negative", value: "0", note: "未見負評擴散" },
          { label: "Neutral / other", value: "130", note: "多為商品互動" },
          { label: "Risk level", value: "低", note: "重點轉為放大正向素材" },
        ],
        bullets: ["現階段主要機會不是處理負評，而是把正向互動整理成可複用的商品與穿搭內容。", "快閃、聯名、穿搭貼文是最容易被轉成商品頁 proof point 的內容類型。", "IRIS / Iris Girls 名稱仍可能混入通路或同名商品討論，後續需要調整品牌詞與排除條件。", "若要讓品牌形象更清楚，下一輪應追蹤『溫柔、自然、質感』是否和 Iris Girls 共同出現。"],
        evidence: [
          { label: "Sentiment", source: "情緒統計", note: "正評 34、負評 0。" },
          { label: "Representative post", source: "Facebook粉絲團 > 西西和Q米", note: "台北民生社區 IRIS 艾莉詩女裝快閃特賣會：聲量 11、正評 8、負評 0。" },
          { label: "Representative post", source: "Instagram > momo購物網", note: "IRIS x 專櫃香水盛夏香旅：聲量 10、正評 6、負評 0。" },
          { label: "Representative post", source: "Instagram > The Butters 奶油家族", note: "穿搭商品貼文：聲量 7、正評 5、負評 0。" },
        ],
      },
    ],
  },

  hot_topics: {
    hypothesis: "AI 熱門話題頁不是單純列趨勢，而是把市場訊號直接變成內容任務入口：先判斷哪個話題正在升溫，再選品牌或商品，最後選 Facebook、Instagram、TikTok、Email 或 PR 任務，帶著完整題目進入內容產出流程。",
    actions: ["用 AI 每週整理可轉內容的熱門話題", "讓使用者在同頁完成話題、產品/品牌、內容型態三段選擇", "把選擇結果寫入 topic prefill，直接進入對應內容任務"],
    blocks: [
      {
        headline: "從熱門討論到內容任務，縮短成一個操作流程",
        summary: "這個頁籤的核心是把市場情報轉成執行。使用者不需要先讀完整報告、再自己想貼文題目；AI 會先整理近期可用話題，例如快閃特賣、香水聯名、30+ 甜美穿搭、商品實穿與品牌質感，再由使用者選擇要搭配品牌或哪一件商品，最後送到指定平台的內容任務。",
        metrics: [
          { label: "Topic source", value: "AI scan", note: "輿情、搜尋、社群與競品內容" },
          { label: "Entity", value: "品牌 / 商品", note: "Iris Girls 或 products#144–155" },
          { label: "Task type", value: "5+", note: "FB / IG / TikTok / Email / PR" },
        ],
        bullets: ["AI 先負責找到市場上值得跟的話題，使用者只需要挑選要採用哪一個。", "話題必須連到品牌或商品，避免產出與銷售無關的泛內容。", "內容任務頁會帶入已整理好的 topic prefill，降低重新輸入與 brief 失真的成本。", "同一個話題可以被轉成不同平台格式，例如 FB 貼文、IG Reels、TikTok 腳本或 EDM。"],
        evidence: [
          { label: "Listening signal", source: "Iris Girls 近 30 天輿情", note: "快閃、直播、聯名與穿搭內容是目前可轉素材的主要來源。" },
          { label: "Product seed", source: "products#144–155", note: "商品名稱可直接成為話題與內容任務的搭配對象。" },
          { label: "Workflow", source: "PlatformTaskPage topic prefill", note: "內容任務支援 ?topic= 預填，可從本頁直接帶入。" },
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

type HotTopic = {
  id: string;
  title: string;
  signal: string;
  angle: string;
  whyNow: string;
};

type HotTopicEntity = {
  id: string;
  label: string;
  kind: "brand" | "product";
  detail: string;
};

type ContentTaskRoute = {
  id: string;
  label: string;
  route: string;
  output: string;
};

const hotTopics: HotTopic[] = [
  { id: "popup", title: "快閃特賣與現場試穿", signal: "07/18 聲量高峰 24 則", angle: "把快閃現場的試穿、版型與真實互動整理成限時感內容", whyNow: "近 30 天最高峰由快閃與直播販售帶動，適合延伸成社群轉換素材。" },
  { id: "fragrance", title: "盛夏香氛聯名", signal: "Instagram 熱門文章聲量 10", angle: "把香水聯名轉成夏日穿搭情境與質感生活提案", whyNow: "聯名內容具備視覺與情境延展性，適合 IG / Reels / EDM。" },
  { id: "thirty", title: "30+ 也能穿的甜美", signal: "品牌定位：溫柔、自然、質感", angle: "降低少女感疑慮，強調成熟但保留甜美細節", whyNow: "Iris Girls 需要把甜美轉成更清楚的年齡與場合語言。" },
  { id: "bow", title: "蝴蝶結與蕾絲細節回潮", signal: "products#144–155 商品 seed", angle: "用材質、剪裁與搭配場合包裝甜美元素", whyNow: "商品資料中已具備蝴蝶結、蕾絲、百褶與小香風等可搜尋元素。" },
];

const hotTopicEntities: HotTopicEntity[] = [
  { id: "brand", label: "Iris Girls 品牌", kind: "brand", detail: "主打整體品牌形象與社群溝通" },
  { id: "p144", label: "水晶鑽蝴蝶上衣", kind: "product", detail: "適合蝴蝶結、精緻細節、場合穿搭" },
  { id: "p145", label: "初戀花園洋裝", kind: "product", detail: "適合夏日、約會、溫柔自然情境" },
  { id: "p146", label: "月光蕾絲百褶裙", kind: "product", detail: "適合蕾絲、百褶、甜美但不幼稚" },
  { id: "p148", label: "霧藍緞帶洋裝", kind: "product", detail: "適合緞帶、清新、質感穿搭" },
];

const contentTaskRoutes: ContentTaskRoute[] = [
  { id: "fb", label: "Facebook 貼文", route: "/tasks/fb", output: "社群貼文與互動 CTA" },
  { id: "ig", label: "Instagram / Reels", route: "/tasks/ig", output: "IG caption、Reels 腳本與 Hashtag" },
  { id: "tt", label: "TikTok 短影音", route: "/tasks/tt", output: "短影音 hook、分鏡與字幕" },
  { id: "email", label: "EDM / LINE 文案", route: "/tasks/email", output: "銷售信件、會員推播或 LINE 訊息" },
  { id: "pr", label: "PR / 新聞稿", route: "/tasks/pr", output: "品牌故事、活動稿與媒體素材" },
];

// 2026-08-06 (CJ「輿情數據四區塊」): the 輿情監測 view is organised by
// AUDIENCE SCOPE, widest→narrowest: 市場熱點（蹭熱度）→ 產業討論 → 自己 →
// 競爭者. Each block fires a live web-search (marketIntelRouter.runListeningTask)
// with a differently-scoped query pack; block 1 also offers a one-click
// "寫成貼文" that carries the hotspot into a content task.
type ListeningScopeKey =
  | "listening.market_hotspots" | "listening.industry_talk"
  | "listening.own_brand" | "listening.competitors";

type ListeningScope = {
  taskKey: ListeningScopeKey;
  title: string;
  purpose: string;
  color: string;
  icon: React.ReactNode;
  writeCta?: boolean;
};

const listeningScopes: ListeningScope[] = [
  { taskKey: "listening.market_hotspots", title: "市場熱點", purpose: "市場現在正在瘋什麼 — 挑一個蹭熱度，直接寫成貼文", color: "#DB2777", icon: <TrendingUp size={18} />, writeCta: true },
  { taskKey: "listening.industry_talk", title: "產業討論", purpose: "你的品類 / 產業正被怎麼討論、怎麼被比較", color: "#2563EB", icon: <Activity size={18} /> },
  { taskKey: "listening.own_brand", title: "自己", purpose: "大家怎麼談你的品牌 — 評價、心得、開箱", color: "#111827", icon: <Megaphone size={18} /> },
  { taskKey: "listening.competitors", title: "競爭者", purpose: "競爭對手的聲量與評價，以及你被拿來怎麼比", color: "#9333EA", icon: <Database size={18} /> },
];

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
  const navigate = useNavigate();
  const { sourceId } = useParams<{ sourceId?: string }>();
  const [searchParams] = useSearchParams();
  const mode: Mode = loc.pathname.startsWith("/market-intel") ? "market" : "performance";
  const { email, loading } = useCurrentUserEmail();
  const sources = mode === "performance" ? performanceSources : marketSources;
  const tasksBySource = mode === "performance" ? performanceTasks : marketTasks;
  const validSourceIds = React.useMemo(() => new Set(sources.map(s => s.id)), [sources]);
  const activeSource = sourceId && validSourceIds.has(sourceId) ? sourceId : "overview";

  // 2026-07-25 (CJ「輿情監測比較像教學，缺乏實際數據」): the 3 listening
  // task cards can now fire a real live web-search (see marketIntelRouter
  // .runListeningTask) scoped to whatever brand the URL's ?b= points at.
  // Everything else on this page (Iris Girls demo blocks) is untouched.
  const brandId = Number(searchParams.get("b") ?? 0) || null;
  const runListeningMut = (trpc as any).marketIntel?.runListeningTask?.useMutation?.() ?? null;
  const [liveResults, setLiveResults] = React.useState<Record<string, LiveRunResult>>({});
  const [runningKey, setRunningKey] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [windowDays, setWindowDays] = React.useState(30); // 輿情 freshness filter
  const [selectedHotTopicId, setSelectedHotTopicId] = React.useState(hotTopics[0].id);
  const [selectedHotEntityId, setSelectedHotEntityId] = React.useState(hotTopicEntities[0].id);
  const [selectedContentRouteId, setSelectedContentRouteId] = React.useState(contentTaskRoutes[0].id);

  const selectedHotTopic = hotTopics.find(t => t.id === selectedHotTopicId) ?? hotTopics[0];
  const selectedHotEntity = hotTopicEntities.find(e => e.id === selectedHotEntityId) ?? hotTopicEntities[0];
  const selectedContentRoute = contentTaskRoutes.find(r => r.id === selectedContentRouteId) ?? contentTaskRoutes[0];

  // 2026-08-06 (CJ「右上是小安素，表格卻還是 iris」): header must reflect the
  // actually-selected brand (?b=), not the hardcoded Iris Girls demo strings.
  const brandInfoQ = (trpc as any).brand?.get?.useQuery?.(
    brandId ? { id: brandId } : (undefined as any),
    { enabled: !!brandId },
  ) ?? { data: null };
  const activeBrandName: string = brandInfoQ?.data?.name ?? "";

  const launchHotTopicTask = () => {
    const topic = `${selectedHotTopic.title}｜${selectedHotEntity.label}：${selectedHotTopic.angle}。請產出${selectedContentRoute.label}，重點包含市場訊號（${selectedHotTopic.signal}）、品牌/商品切角、內容主軸、開場 hook、正文與 CTA。`;
    const b = brandId ?? 2957;
    navigate(`${selectedContentRoute.route}?b=${b}&topic=${encodeURIComponent(topic)}`);
  };

  const runListeningTask = async (task: TaskCard) => {
    if (!task.taskKey || !brandId || !runListeningMut) return;
    setRunningKey(task.taskKey);
    setSelectedKey(task.taskKey);
    try {
      const res: LiveRunResult = await runListeningMut.mutateAsync({ brandId, taskKey: task.taskKey, days: windowDays });
      setLiveResults((r) => ({ ...r, [task.taskKey!]: res }));
    } catch (e: any) {
      setLiveResults((r) => ({ ...r, [task.taskKey!]: { ok: false, message: e?.message ?? String(e) } }));
    } finally {
      setRunningKey(null);
    }
  };

  // 2026-08-06: fire one scope block's live search (四區塊 輿情 redesign).
  const runScope = async (taskKey: string) => {
    if (!brandId || !runListeningMut) return;
    setRunningKey(taskKey);
    setSelectedKey(taskKey);
    try {
      const res: LiveRunResult = await runListeningMut.mutateAsync({ brandId, taskKey, days: windowDays });
      setLiveResults((r) => ({ ...r, [taskKey]: res }));
    } catch (e: any) {
      setLiveResults((r) => ({ ...r, [taskKey]: { ok: false, message: e?.message ?? String(e) } }));
    } finally {
      setRunningKey(null);
    }
  };

  // Block 1「市場熱點」: carry a hotspot straight into a content task (蹭熱度).
  const writeFromHotspot = (headline: string) => {
    const topic = `蹭熱度：${headline}。請結合本品牌，把這個市場熱點寫成一篇貼文：說明為什麼現在值得跟、品牌切入角度、開場 hook、正文與 CTA。`;
    const b = brandId ?? 2957;
    navigate(`/tasks/fb?b=${b}&topic=${encodeURIComponent(topic)}`);
  };

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
            {isPerformance ? "Performance Agents" : "Market Intelligence Agents"}
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 850, color: "#111827" }}>
            {isPerformance ? "成效儀表板" : `${activeBrandName || "（尚未選擇品牌）"}｜${active.label}`}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280", maxWidth: 760 }}>
            {isPerformance ? "左側平台列已切換成 Meta、Google、GA、Shopline 等成效資料源。" : active.desc}
          </p>
        </div>
        {!isPerformance && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: "10px 12px", background: "#fff", minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase" }}>Source Brand</div>
            <div style={{ fontSize: 14, fontWeight: 850, color: "#111827", marginTop: 3 }}>{activeBrandName || "（未選品牌）"}{brandId ? ` · brands#${brandId}` : ""}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>即時公開網路資料查詢</div>
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

          {!isPerformance && active.id === "listening" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginBottom: 14 }}>
              {!brandId && (
                <div style={{ gridColumn: "1 / -1", border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 16, padding: 14, fontSize: 13, color: "#92400e" }}>
                  網址缺少 <b>?b=品牌ID</b>，四個區塊的即時查詢會停用。範例：<code>/market-intel/listening?b=2957</code>
                </div>
              )}
              {/* 時間篩選 + 來源類型圖例 (OpView 來源分布) */}
              <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", padding: "12px 14px" }}>
                <span style={{ fontSize: 12, fontWeight: 850, color: "#111827" }}>時間範圍</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TIME_WINDOWS.map((w) => {
                    const on = windowDays === w.days;
                    return (
                      <button key={w.days} onClick={() => setWindowDays(w.days)} style={{ border: `1px solid ${on ? "#111827" : "#e5e7eb"}`, background: on ? "#111827" : "#fff", color: on ? "#fff" : "#374151", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{w.label}</button>
                    );
                  })}
                </div>
                <span style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 4px" }} />
                <span style={{ fontSize: 12, fontWeight: 850, color: "#111827" }}>來源</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["news", "fanpage", "blog", "forum", "threads", "youtube"].map((t) => {
                    const m = sourceMeta(t);
                    return (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: m.color }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block" }} /> {m.label}
                      </span>
                    );
                  })}
                </div>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>時間範圍改變後，重新點各區塊的即時查詢即可套用</span>
              </div>
              {listeningScopes.map((scope) => {
                const res = liveResults[scope.taskKey];
                const running = runningKey === scope.taskKey;
                const runAt = res?.generatedAt ? new Date(res.generatedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
                return (
                  <section key={scope.taskKey} style={{ border: "1px solid #e5e7eb", borderRadius: 18, background: "#fff", overflow: "hidden", boxShadow: selectedKey === scope.taskKey ? `0 0 0 3px ${scope.color}14` : "none" }}>
                    {/* Section header — OpView/Meltwater style: identity left, action right, accent bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f1f1f0", borderLeft: `4px solid ${scope.color}` }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: scope.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{scope.icon}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 850, color: "#111827" }}>{scope.title}</h3>
                          {res?.ok && <span style={{ fontSize: 12, fontWeight: 800, color: scope.color }}>{res.items!.length} 則</span>}
                          {runAt && <span style={{ fontSize: 11, color: "#9ca3af" }}>· 擷取於 {runAt}</span>}
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{scope.purpose}</p>
                      </div>
                      <button
                        onClick={() => runScope(scope.taskKey)}
                        disabled={!brandId || running}
                        style={{ flex: "0 0 auto", border: 0, borderRadius: 999, background: brandId ? scope.color : "#e5e7eb", color: brandId ? "#fff" : "#9ca3af", padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: brandId && !running ? "pointer" : "default", whiteSpace: "nowrap" }}
                      >
                        {running ? "查詢中…" : res ? "重新查詢" : "▶ 即時查詢"}
                      </button>
                    </div>

                    {/* Mention feed — one full-width row per item, date always shown */}
                    {res?.ok ? (
                      <div>
                        {res.items!.map((item, i) => {
                          const m = sourceMeta(item.sourceType);
                          const dateStr = item.publishedAt ? String(item.publishedAt).slice(0, 10) : null;
                          return (
                            <div key={i} style={{ display: "flex", gap: 12, padding: "13px 18px", borderTop: i === 0 ? "none" : "1px solid #f4f4f3" }}>
                              {/* left: source-type chip */}
                              <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 800, color: "#fff", background: m.color, padding: "3px 8px", borderRadius: 6, height: "fit-content", marginTop: 2 }}>{m.label}</span>
                              {/* right: content */}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9ca3af", marginBottom: 3, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, color: "#6b7280" }}>{item.source}</span>
                                  <span>·</span>
                                  <span title={dateStr ? "發布時間" : "來源未提供發布時間，顯示擷取時間"}>
                                    🕓 {dateStr ? `${dateStr} 發布` : (runAt ? `${runAt} 擷取` : "時間不明")}
                                  </span>
                                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" style={{ color: scope.color, display: "inline-flex", alignItems: "center", gap: 2 }}>原文 <ExternalLink size={10} /></a>}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", lineHeight: 1.4 }}>{item.title}</div>
                                {item.excerpt && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#4b5563", lineHeight: 1.55 }}>{item.excerpt}</p>}
                                {scope.writeCta && (
                                  <button onClick={() => writeFromHotspot(item.title)} style={{ marginTop: 9, border: `1px solid ${scope.color}`, borderRadius: 999, background: `${scope.color}0f`, color: scope.color, padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✍ 寫成貼文（蹭這個熱點）</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : res && !res.ok ? (
                      <div style={{ margin: 18, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 12, padding: 12, fontSize: 12.5, color: "#991b1b", lineHeight: 1.5 }}>{res.message}</div>
                    ) : (
                      <p style={{ margin: 0, padding: "16px 18px", fontSize: 12.5, color: "#9ca3af", lineHeight: 1.5 }}>
                        {running ? "即時搜尋中…" : "點右上「即時查詢」抓取這個範圍近期的真實公開討論，每則會顯示來源類型與發布時間。"}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {marketPage && active.id !== "listening" && (
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



          {!isPerformance && active.id === "hot_topics" && (
            <section style={{ border: "1px solid #f9a8d4", borderRadius: 24, background: "linear-gradient(135deg,#fff 0%,#fdf2f8 100%)", padding: 20, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#DB2777" }}>AI Topic → Content Task</div>
                  <h3 style={{ margin: "6px 0", fontSize: 21, color: "#111827" }}>選話題、選產品，再直接進內容任務</h3>
                  <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.7 }}>AI 先整理近期可跟的市場話題；使用者選定品牌或商品，再選 Facebook、Instagram、TikTok、EDM 或 PR 任務，系統會把 brief 帶進內容產出頁。</p>
                </div>
                <button onClick={launchHotTopicTask} style={{ border: 0, borderRadius: 999, background: "#DB2777", color: "#fff", padding: "11px 16px", fontSize: 13, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>進入內容任務</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 8 }}>1. AI 找到的熱門話題</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {hotTopics.map((topic) => {
                      const selected = selectedHotTopic.id === topic.id;
                      return (
                        <button key={topic.id} onClick={() => setSelectedHotTopicId(topic.id)} style={{ textAlign: "left", border: `1px solid ${selected ? "#DB2777" : "#f3f4f6"}`, background: selected ? "#fdf2f8" : "#fff", borderRadius: 16, padding: 12, cursor: "pointer" }}>
                          <div style={{ fontSize: 13, fontWeight: 850, color: "#111827" }}>{topic.title}</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#DB2777", marginTop: 3 }}>{topic.signal}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45, marginTop: 4 }}>{topic.whyNow}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 8 }}>2. 搭配品牌或商品</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {hotTopicEntities.map((entity) => {
                      const selected = selectedHotEntity.id === entity.id;
                      return (
                        <button key={entity.id} onClick={() => setSelectedHotEntityId(entity.id)} style={{ textAlign: "left", border: `1px solid ${selected ? "#DB2777" : "#f3f4f6"}`, background: selected ? "#fdf2f8" : "#fff", borderRadius: 14, padding: 10, cursor: "pointer" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 850, color: "#111827" }}>{entity.label}</div>
                          <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.4, marginTop: 3 }}>{entity.detail}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 8 }}>3. 內容任務型態</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {contentTaskRoutes.map((route) => {
                      const selected = selectedContentRoute.id === route.id;
                      return (
                        <button key={route.id} onClick={() => setSelectedContentRouteId(route.id)} style={{ textAlign: "left", border: `1px solid ${selected ? "#DB2777" : "#f3f4f6"}`, background: selected ? "#fdf2f8" : "#fff", borderRadius: 14, padding: 10, cursor: "pointer" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 850, color: "#111827" }}>{route.label}</div>
                          <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.4, marginTop: 3 }}>{route.output}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, borderRadius: 18, background: "#fff", border: "1px solid #fce7f3", padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: "#111827", marginBottom: 6 }}>即將帶入內容任務的 brief</div>
                <p style={{ margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.6 }}>
                  {selectedHotTopic.title} × {selectedHotEntity.label} → {selectedContentRoute.label}。{selectedHotTopic.angle}；需要包含市場訊號、品牌/商品切角、開場 hook、正文與 CTA。
                </p>
              </div>
            </section>
          )}

          {active.id !== "listening" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {cards.map((task) => {
              const isWired = !!task.taskKey;
              const isRunning = runningKey === task.taskKey;
              const hasResult = task.taskKey ? !!liveResults[task.taskKey] : false;
              const isSelected = isWired && task.taskKey === selectedKey;
              return (
                <article
                  key={task.title}
                  onClick={isWired && brandId ? () => runListeningTask(task) : undefined}
                  style={{
                    border: `1px solid ${isSelected ? active.color : "#e5e7eb"}`,
                    borderRadius: 22, background: "#fff", padding: 18, minHeight: 230,
                    display: "flex", flexDirection: "column",
                    cursor: isWired && brandId ? "pointer" : "default",
                    boxShadow: isSelected ? `0 0 0 3px ${active.color}18` : "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: active.color, background: `${active.color}12`, padding: "4px 8px", borderRadius: 999 }}>AGENT TASK</span>
                    {isWired ? (
                      isRunning
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: active.color }}>查詢中…</span>
                        : <Play size={16} color={active.color} />
                    ) : (
                      <LineChart size={16} color="#9ca3af" />
                    )}
                  </div>
                  <h3 style={{ margin: "14px 0 8px", fontSize: 17, lineHeight: 1.3, fontWeight: 850, color: "#111827" }}>{task.title}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Agent：</b><AgentLine agent={task.agent} /></p>
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Skill：</b>{task.skill}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Data：</b>{task.data}</p>
                  <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 13, fontWeight: 700, color: "#111827" }}>{task.output}</div>
                  {isWired && (
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: hasResult ? "#059669" : active.color }}>
                      {isRunning ? "即時搜尋中…" : hasResult ? "✓ 已有真實結果 — 點擊重新查詢" : "▶ 點擊執行即時查詢（真實公開資料）"}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          )}
        </main>

        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18, position: "sticky", top: 84, maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ca3af" }}>Evidence Panel</div>

          {selectedKey && liveResults[selectedKey] && (
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "2px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.14em", textTransform: "uppercase", color: "#DC2626", marginTop: 10 }}>即時搜尋結果</div>
              <h3 style={{ margin: "6px 0 4px", fontSize: 16, fontWeight: 850, color: "#111827" }}>
                {cards.find((c) => c.taskKey === selectedKey)?.title}
              </h3>
              {liveResults[selectedKey].generatedAt && (
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#9ca3af" }}>
                  {new Date(liveResults[selectedKey].generatedAt!).toLocaleString("zh-TW")} · 查詢字：{liveResults[selectedKey].query}
                </p>
              )}
              {!liveResults[selectedKey].ok ? (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 12, padding: 12, fontSize: 13, color: "#991b1b" }}>
                  {liveResults[selectedKey].message}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {liveResults[selectedKey].items!.map((item, i) => (
                    <div key={i} style={{ border: "1px solid #f0f0ef", borderRadius: 14, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.4 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        {item.source}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" style={{ color: active.color, display: "inline-flex", alignItems: "center" }}>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      {item.excerpt && (
                        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#4b5563", lineHeight: 1.55 }}>{item.excerpt}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
