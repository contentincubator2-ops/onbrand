/**
 * DataWorkspacePage — 成效層（/performance）。
 *
 * 2026-09-08：市場數據層（/market-intel、輿情四頁、關鍵字、GEO、競品、機會）
 * 整層移除 —— 價目表上沒有這一層（CJ「不在價目表上了，就應該消除」）。
 * 這頁從「兩種模式共用一頁」變成只剩成效；原本 sowork@sowork.tw 的
 * email 守門也一併拿掉：成效層 9/7 起就對所有帳號開放（ShellLayout 的
 * 模式切換器如此），但這裡還留著舊守門，等於所有人點進來都看到
 * 「只開放 sowork@sowork.tw」—— 這次一起修。
 *
 * 畫面本身是示意版：PerformanceDashboard 用 perfMockData 的模擬資料並強制
 * 顯示「⚠ 模擬資料」橫幅；總覽最上方的 ConnectionsPanel 誠實顯示三個
 * 資料來源的串接狀態；真資料在導入（電商營運報告加購）時接。
 */
import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { tr, useLang } from "../../../lib/i18n";
import { CampaignIcon, ChartIcon, ClickIcon, PerformanceIcon, SearchIcon, ShopIcon, TargetIcon, TextIcon } from "../../platform/components/icons";
import PerformanceDashboard from "../components/PerformanceDashboard";
import ConnectionsPanel from "../components/ConnectionsPanel";
import { setMockBrandSeed } from "../../platform/lib/perfMockData";
import FanpageMonthlyReport from "../components/FanpageMonthlyReport";
import LensWorkspace from "../components/LensWorkspace";
import CampaignPerformance from "../components/CampaignPerformance";
import AddonRequestModal from "../../platform/components/AddonRequestModal";

type Source = {
  id: string;
  label: string;
  short: string;
  icon: React.ReactNode;
  desc: string;
};

type AgentRef = { id: number; name: string; title: string };

type TaskCard = {
  title: string;
  agent: AgentRef;
  skill: string;
  data: string;
  output: string;
};

const INK = "#171717";

const AGENTS = {
  strategist: { id: 180159, name: "Claire Hsu", title: "Social Media Brand Strategist" },
  seo: { id: 25, name: "Kevin Lee", title: "SEO Strategist (E-commerce)" },
  content: { id: 60021, name: "Tina Ji", title: "FB/IG Social Copywriter" },
  social: { id: 227632, get name() { return tr("Shu-Fen Liu", "劉淑芬"); }, get title() { return tr("KOL Strategy Director — IG × Tech", "KOL Strategy Director — IG × 科技"); } },
  ecommerceVisual: { id: 210021, name: "Iris Wu", title: "E-commerce Visual Designer" },
  qa: { id: 210207, name: "Chun-Hao Chen", title: "Senior Social Media Editor" },
};

const performanceSources: Source[] = [
  { id: "overview", get label() { return tr("Overview", "整合總覽"); }, get short() { return tr("Overview", "總覽"); }, icon: <ChartIcon size={18} />, get desc() { return tr("Cross-platform budget, performance, anomalies and an executive summary", "跨平台預算、成效、異常與老闆視角摘要"); } },
  { id: "meta", label: "Meta", short: "Meta", icon: <CampaignIcon size={18} />, get desc() { return tr("Facebook / Instagram ad campaigns, audiences and creatives", "Facebook / Instagram 廣告活動、受眾與素材"); } },
  { id: "google", label: "Google", short: "GAds", icon: <SearchIcon size={18} />, desc: "Search / Display / PMax / YouTube Ads" },
  { id: "shopline", label: "SHOPLINE", short: "Shop", icon: <ShopIcon size={18} />, get desc() { return tr("Product sales, conversion funnel, AOV and repeat purchase", "商品銷售、轉換漏斗、客單價與回購"); } },
  { id: "91app", label: "91APP", short: "91", icon: <ShopIcon size={18} />, get desc() { return tr("Orders, member tiers, repeat purchase and online/offline store split", "訂單、會員分層、回購與線上門市分流"); } },
  { id: "ga", get label() { return tr("GA / Website", "GA / 官網"); }, short: "GA", icon: <ClickIcon size={18} />, get desc() { return tr("Traffic sources, landing pages, paths and conversion", "流量來源、Landing page、路徑與轉換"); } },
  { id: "attribution", get label() { return tr("Attribution", "整合歸因"); }, get short() { return tr("Attribution", "歸因"); }, icon: <TargetIcon size={18} />, get desc() { return tr("Cross-platform comparison, budget reallocation and campaign ROI", "跨平台比較、預算重分配與 Campaign ROI"); } },
  // 2026-08-13 (CJ「將這份報告設定在成效報告當中，新的任務 tray，稱為粉絲團月報」):
  // 不刻儀表板 —— 使用者上傳自己在用的月報版型，系統跨月比對出可自動填的欄位。
  { id: "fanpage_monthly", get label() { return tr("Fan page monthly report", "粉絲團月報"); }, get short() { return tr("Monthly", "月報"); }, icon: <TextIcon size={18} />, get desc() { return tr("Upload your own monthly report template; the system compares across months and backfills the data", "上傳你自己的月報版型，系統跨月比對後回填數據"); } },
  // 2026-09-30（CJ「讓真實的成效，引導到成效層，建立一個活動 mission tray」）：活動企劃的
  // 目標 vs 真的發出去的貼文。不是從這裡發的、或發文時間改了，都在這裡對照。
  { id: "campaign", get label() { return tr("Campaigns", "活動"); }, get short() { return tr("Campaigns", "活動"); }, icon: <CampaignIcon size={18} />, get desc() { return tr("Each goal of the campaign plan, compared with the posts actually published", "活動企劃的每一段目標，對照真的發出去的貼文"); } },
];

const performanceTasks: Record<string, TaskCard[]> = {
  overview: [
    { get title() { return tr("This week's performance summary", "本週成效摘要"); }, agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Meta / Google / GA / Shopline", get output() { return tr("One-page executive summary", "老闆視角一頁摘要"); } },
    { get title() { return tr("Budget spend vs results", "預算花費 vs 成果"); }, agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "Spend / ROAS / CPA / CVR", get output() { return tr("Budget efficiency ranking", "預算效率排行"); } },
    { get title() { return tr("Top 3 things to handle", "最該處理的 3 件事"); }, agent: AGENTS.qa, skill: "timeseries-proportional-scaling", get data() { return tr("7/14/30-day trend", "7/14/30 日趨勢"); }, get output() { return tr("Three actions you can take today", "今天可執行的三個動作"); } },
  ],
  meta: [
    { get title() { return tr("Campaign performance diagnosis", "活動成效診斷"); }, agent: AGENTS.social, skill: "meta-ads-google-sheets-sync", data: "Campaign / Ad set / Ad", get output() { return tr("List of high- and low-performing campaigns", "高低效活動清單"); } },
    { get title() { return tr("Audience fatigue detection", "受眾疲乏偵測"); }, agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Frequency / CTR / CPM", get output() { return tr("Fatigued audiences and creative-swap suggestions", "疲乏受眾與換素材建議"); } },
    { get title() { return tr("Creative win/loss analysis", "素材勝負分析"); }, agent: AGENTS.ecommerceVisual, skill: "sowork-analytics-ads-page", data: "Thumbstop / CTR / CVR", get output() { return tr("Creatives to keep and retire", "保留與淘汰素材"); } },
    { get title() { return tr("Next week's budget suggestion", "下一週預算建議"); }, agent: AGENTS.seo, skill: "ai-saas-pricing", data: "Spend / Result / ROAS", get output() { return tr("Budget shift ratios and risks", "預算移轉比例與風險"); } },
  ],
  google: [
    { get title() { return tr("Keyword performance analysis", "關鍵字成效分析"); }, agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "Keyword / Query / CPA", get output() { return tr("Scale-up and exclusion lists", "加碼與排除清單"); } },
    { get title() { return tr("PMax / Display diagnosis", "PMax / Display 診斷"); }, agent: AGENTS.strategist, skill: "sowork-analytics-ads-page", data: "Asset group / Placement", get output() { return tr("Asset group adjustment suggestions", "資產群調整建議"); } },
    { get title() { return tr("Search intent insights", "搜尋意圖洞察"); }, agent: AGENTS.seo, skill: "taiwan-solo-founder-market-research", data: "Search terms", get output() { return tr("Conversion vs exploration segments", "轉換型 vs 探索型分群"); } },
  ],
  shopline: [
    { get title() { return tr("Top-selling products", "商品銷售排行"); }, agent: AGENTS.ecommerceVisual, skill: "shopline-api-integration", data: "Orders / SKU / Revenue", get output() { return tr("Hero and slow-moving items", "主推與滯銷品項"); } },
    { get title() { return tr("Conversion funnel", "轉換漏斗"); }, agent: AGENTS.seo, skill: "ecommerce-analytics-dashboard", data: "Session → Cart → Checkout → Purchase", get output() { return tr("Drop-off stages and fixes", "流失段落與修法"); } },
    { get title() { return tr("Repeat purchase and AOV", "回購與客單價"); }, agent: AGENTS.strategist, skill: "amazon-marketplace-sales-enrichment", data: "AOV / Repeat / Cohort", get output() { return tr("Upsell and repurchase strategy", "加購與回購策略"); } },
  ],
  ga: [
    { get title() { return tr("Traffic source analysis", "流量來源分析"); }, agent: AGENTS.seo, skill: "google-workspace", data: "Source / Medium / Campaign", get output() { return tr("Real traffic vs junk traffic", "有效流量與假流量"); } },
    { get title() { return tr("Landing page performance", "Landing Page 表現"); }, agent: AGENTS.qa, skill: "browser-frontend-testing-without-ssh", data: "Landing / Bounce / CVR", get output() { return tr("Page fix priorities", "頁面修改優先序"); } },
    { get title() { return tr("User paths", "使用者路徑"); }, agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Path / Events", get output() { return tr("High-converting paths and drop-off points", "高轉換路徑與流失點"); } },
  ],
  attribution: [
    { get title() { return tr("Cross-platform performance comparison", "跨平台成效比較"); }, agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Meta + Google + GA + Shopline", get output() { return tr("Platform contribution ranking", "平台貢獻排行"); } },
    { get title() { return tr("Budget reallocation", "預算重新分配"); }, agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "CPA / ROAS / Margin", get output() { return tr("Next week's budget allocation table", "下週預算配置表"); } },
    { get title() { return tr("Campaign ROI report", "Campaign ROI 報告"); }, agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "Cost / Revenue / Assisted conversion", get output() { return tr("ROI report for the boss", "給老闆看的 ROI 報告"); } },
  ],
};

function AgentLine({ agent }: { agent: AgentRef }) {
  return <>{agent.name} <span style={{ color: "#9ca3af" }}>#{agent.id}</span><br /><span style={{ color: "#9ca3af" }}>{agent.title}</span></>;
}

/**
 * 2026-09-08（CJ「基礎方案的成效層做示意，用模擬數據吸引用戶升級」）：
 * 示意儀表板對兩級都開，但上面那條提示照方案講不同的話 ——
 *   基礎／試用 → 升級專業才能加購真實串接
 *   專業       → 直接加購電商營運報告
 *   企業       → 不顯示（真資料在導入時接）
 *
 * 2026-09-13（FDE 定位）：文案從「付費解鎖」改成「這是我們重點投資的方向，
 * 專業方案優先體驗」——跟對外敘事一致（成效數據回饋是私人預覽、募資後的
 * 主要產品投資標的，不是單純的加購功能）。
 */
function PlanNudge() {
  useLang();
  const navigate = useNavigate();
  const [addonOpen, setAddonOpen] = React.useState(false);
  const q = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false })
    : { data: null };
  const code: string | undefined = (q?.data as any)?.planCode;
  if (!code || code === "enterprise") return null;
  const isPro = code === "drop_pro";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ minWidth: 0, flex: 1, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: INK }}>{tr("This page is an early preview.", "這一頁是早期預覽版。")}</span>
        {isPro
          ? tr(" Add the E-commerce Operations Report (NT$48,000 setup + NT$25,000/month); SoWork connects your fan page, ad accounts and store back-office to real data during onboarding.", " 加購電商營運報告（NT$48,000 建置 ＋ NT$25,000／月），SoWork 在導入時接上粉專、廣告帳號與電商後台的真實資料。")
          : tr(" Everything below is simulated data, showing what you'll see once real data is connected. Real integrations are our top investment priority right now, and Pro plan users can add them first for early access.", " 下面全部是模擬數據 —— 這是接上真資料之後你會看到的樣子。真實串接是我們目前最重點的投資方向，專業方案可以優先加購搶先體驗。")}
      </div>
      {isPro ? (
        <button onClick={() => setAddonOpen(true)} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: INK, border: 0, borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
          {tr("Request add-on", "申請加購")}
        </button>
      ) : (
        <button onClick={() => navigate("/pricing")} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: INK, border: 0, borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
          {tr("Upgrade to Pro", "升級專業方案")}
        </button>
      )}
      {isPro && <AddonRequestModal isOpen={addonOpen} onClose={() => setAddonOpen(false)} />}
    </div>
  );
}

export default function DataWorkspacePage() {
  useLang();
  const { sourceId } = useParams<{ sourceId?: string }>();
  const [searchParams] = useSearchParams();
  const validSourceIds = React.useMemo(() => new Set(performanceSources.map((s) => s.id)), []);
  const activeSource = sourceId && validSourceIds.has(sourceId) ? sourceId : "overview";
  const active = performanceSources.find((s) => s.id === activeSource) ?? performanceSources[0];
  const cards = performanceTasks[active.id] ?? [];

  const brandId = Number(searchParams.get("b") ?? 0) || null;
  // 2026-09-07 示意資料按品牌播種：同一品牌每次一樣，不同品牌規模不同，
  // 比值（ROAS／CPA／客單價）不變。切換品牌時重播。
  setMockBrandSeed(brandId);

  // 2026-09-29：這個 tray 有沒有真數據（perf_facts）。有 → 只看上面的視角報表；
  // 沒有 → 下面才放示意儀表板，讓人知道接上之後長什麼樣子。
  const wsQ = (trpc as any).performance?.workspace?.useQuery
    ? (trpc as any).performance.workspace.useQuery({ brandId: brandId ?? 0, tray: active.id }, { enabled: !!brandId && active.id !== "campaign", refetchOnWindowFocus: false })
    : { data: undefined };
  const hasRealData = ((wsQ.data as any)?.trayFacts ?? 0) > 0;

  return (
    <div style={{ padding: "20px 24px 80px", maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 850, color: INK }}>{tr("Performance dashboard", "成效儀表板")}</h1>
      </div>

      {/* 活動 tray 要整寬（各段卡片＋貼文對照表），不放右側的資料串接欄。 */}
      <div style={{ display: "grid", gridTemplateColumns: active.id === "campaign" ? "minmax(0, 1fr)" : "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
        <main style={{ minWidth: 0 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#FFFFFF", padding: 22, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 16, background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active.icon}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: INK }}>{active.label}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{active.desc}</p>
              </div>
            </div>
          </div>

          {/* 活動 tray 有自己的畫面（企劃 vs 實際），不疊視角報表與示意儀表板。 */}
          {active.id === "campaign" && <CampaignPerformance brandId={brandId} />}
          {/* 2026-09-29（CJ「所有成效層的 mission tray 都有最上面的三個選項」）：
              範本／我的報告／貼對話＋真數據的視角報表，每個 tray 都一樣。 */}
          {active.id !== "campaign" && <LensWorkspace brandId={brandId} tray={active.id} />}
          {active.id !== "campaign" && !hasRealData && <PlanNudge />}
          {/* 粉絲團月報有自己的流程（上傳版型 → 跨月解析 → 體檢報告），不是
              PerformanceDashboard 那種模擬儀表板，所以整頁換掉而不是疊加。 */}
          {active.id === "fanpage_monthly" && <FanpageMonthlyReport />}
          {/* 2026-09-07 資料來源卡片：總覽最上方，先讓人看到「哪些接了、哪些沒接、
              沒接的要怎麼接」，再看下面標了「⚠ 模擬資料」的示意儀表板。 */}
          {active.id === "overview" && <ConnectionsPanel brandId={brandId} />}
          {active.id !== "fanpage_monthly" && active.id !== "campaign" && !hasRealData && (
            <>
              <div style={{ margin: "4px 0 10px", fontSize: 13, color: "#6b7280" }}>{tr("Illustrative only: this is what the full dashboard for this page looks like once data is connected.", "以下為示意：接上資料後，這一頁的完整儀表板長這樣。")}</div>
              <PerformanceDashboard sourceId={active.id} />
            </>
          )}

          {/* 這一層是「接下來可以跑什麼」：每張卡說明哪個 agent、用哪個 skill、
              吃哪些資料、產出什麼。資料串接後才會變成可執行。 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {cards.map((task) => (
              <article
                key={task.title}
                style={{ border: "1px solid #e5e7eb", borderRadius: 22, background: "#fff", padding: 18, minHeight: 230, display: "flex", flexDirection: "column" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: INK, background: "#f4f4f5", padding: "4px 8px", borderRadius: 999 }}>{active.short}</span>
                  <PerformanceIcon size={16} color="#9ca3af" />
                </div>
                <h3 style={{ margin: "14px 0 8px", fontSize: 17, lineHeight: 1.3, fontWeight: 850, color: INK }}>{task.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>{tr("Agent: ", "Agent：")}</b><AgentLine agent={task.agent} /></p>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>{tr("Skill: ", "Skill：")}</b>{task.skill}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>{tr("Data: ", "Data：")}</b>{task.data}</p>
                <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 13, fontWeight: 700, color: INK }}>{task.output}</div>
              </article>
            ))}
          </div>
        </main>

        {active.id !== "campaign" && <aside style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18, position: "sticky", top: 84, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ca3af" }}>Evidence Panel</div>
          <h3 style={{ margin: "8px 0 10px", fontSize: 18, fontWeight: 850, color: INK }}>{tr("Data connection status", "資料串接狀態")}</h3>
          {[tr("Meta Ads API / report import", "Meta Ads API / 報表匯入"), "Google Ads / GA4", "Shopline Open API", tr("Cross-platform attribution table", "跨平台整合歸因表")].map((x) => (
            <div key={x} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13, color: "#374151" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: INK, marginTop: 6, flex: "0 0 auto" }} /> {x}
            </div>
          ))}
          <div style={{ marginTop: 16, borderRadius: 16, background: "#f9fafb", padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: INK, marginBottom: 6 }}>{tr("Next step", "下一步")}</div>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              {tr("Fan page posts can sync directly; for ads, GA4 and store orders, upload an export file to see the funnel. Direct API connections are part of the E-commerce Operations Report setup, configured by SoWork during onboarding.", "粉專貼文可以直接同步；廣告、GA4 與電商訂單先上傳匯出檔就能看漏斗。API 直連屬於電商營運報告的建置範圍，由 SoWork 在導入時設定。")}
            </p>
          </div>
        </aside>}
      </div>
    </div>
  );
}
