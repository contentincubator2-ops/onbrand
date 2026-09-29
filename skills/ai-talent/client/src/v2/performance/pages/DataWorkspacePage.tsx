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
import { CampaignIcon, ChartIcon, ClickIcon, PerformanceIcon, SearchIcon, ShopIcon, TargetIcon, TextIcon } from "../../platform/components/icons";
import PerformanceDashboard from "../components/PerformanceDashboard";
import ConnectionsPanel from "../components/ConnectionsPanel";
import { setMockBrandSeed } from "../components/perfMockData";
import FanpageMonthlyReport from "../components/FanpageMonthlyReport";
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
  social: { id: 227632, name: "劉淑芬", title: "KOL Strategy Director — IG × 科技" },
  ecommerceVisual: { id: 210021, name: "Iris Wu", title: "E-commerce Visual Designer" },
  qa: { id: 210207, name: "Chun-Hao Chen", title: "Senior Social Media Editor" },
};

const performanceSources: Source[] = [
  { id: "overview", label: "整合總覽", short: "總覽", icon: <ChartIcon size={18} />, desc: "跨平台預算、成效、異常與老闆視角摘要" },
  { id: "meta", label: "Meta", short: "Meta", icon: <CampaignIcon size={18} />, desc: "Facebook / Instagram 廣告活動、受眾與素材" },
  { id: "google", label: "Google", short: "GAds", icon: <SearchIcon size={18} />, desc: "Search / Display / PMax / YouTube Ads" },
  { id: "shopline", label: "SHOPLINE", short: "Shop", icon: <ShopIcon size={18} />, desc: "商品銷售、轉換漏斗、客單價與回購" },
  { id: "91app", label: "91APP", short: "91", icon: <ShopIcon size={18} />, desc: "訂單、會員分層、回購與線上門市分流" },
  { id: "ga", label: "GA / 官網", short: "GA", icon: <ClickIcon size={18} />, desc: "流量來源、Landing page、路徑與轉換" },
  { id: "attribution", label: "整合歸因", short: "歸因", icon: <TargetIcon size={18} />, desc: "跨平台比較、預算重分配與 Campaign ROI" },
  // 2026-08-13 (CJ「將這份報告設定在成效報告當中，新的任務 tray，稱為粉絲團月報」):
  // 不刻儀表板 —— 使用者上傳自己在用的月報版型，系統跨月比對出可自動填的欄位。
  { id: "fanpage_monthly", label: "粉絲團月報", short: "月報", icon: <TextIcon size={18} />, desc: "上傳你自己的月報版型，系統跨月比對後回填數據" },
];

const performanceTasks: Record<string, TaskCard[]> = {
  overview: [
    { title: "本週成效摘要", agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Meta / Google / GA / Shopline", output: "老闆視角一頁摘要" },
    { title: "預算花費 vs 成果", agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "Spend / ROAS / CPA / CVR", output: "預算效率排行" },
    { title: "最該處理的 3 件事", agent: AGENTS.qa, skill: "timeseries-proportional-scaling", data: "7/14/30 日趨勢", output: "今天可執行的三個動作" },
  ],
  meta: [
    { title: "活動成效診斷", agent: AGENTS.social, skill: "meta-ads-google-sheets-sync", data: "Campaign / Ad set / Ad", output: "高低效活動清單" },
    { title: "受眾疲乏偵測", agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Frequency / CTR / CPM", output: "疲乏受眾與換素材建議" },
    { title: "素材勝負分析", agent: AGENTS.ecommerceVisual, skill: "sowork-analytics-ads-page", data: "Thumbstop / CTR / CVR", output: "保留與淘汰素材" },
    { title: "下一週預算建議", agent: AGENTS.seo, skill: "ai-saas-pricing", data: "Spend / Result / ROAS", output: "預算移轉比例與風險" },
  ],
  google: [
    { title: "關鍵字成效分析", agent: AGENTS.seo, skill: "source-backed-competitive-evidence", data: "Keyword / Query / CPA", output: "加碼與排除清單" },
    { title: "PMax / Display 診斷", agent: AGENTS.strategist, skill: "sowork-analytics-ads-page", data: "Asset group / Placement", output: "資產群調整建議" },
    { title: "搜尋意圖洞察", agent: AGENTS.seo, skill: "taiwan-solo-founder-market-research", data: "Search terms", output: "轉換型 vs 探索型分群" },
  ],
  shopline: [
    { title: "商品銷售排行", agent: AGENTS.ecommerceVisual, skill: "shopline-api-integration", data: "Orders / SKU / Revenue", output: "主推與滯銷品項" },
    { title: "轉換漏斗", agent: AGENTS.seo, skill: "ecommerce-analytics-dashboard", data: "Session → Cart → Checkout → Purchase", output: "流失段落與修法" },
    { title: "回購與客單價", agent: AGENTS.strategist, skill: "amazon-marketplace-sales-enrichment", data: "AOV / Repeat / Cohort", output: "加購與回購策略" },
  ],
  ga: [
    { title: "流量來源分析", agent: AGENTS.seo, skill: "google-workspace", data: "Source / Medium / Campaign", output: "有效流量與假流量" },
    { title: "Landing Page 表現", agent: AGENTS.qa, skill: "browser-frontend-testing-without-ssh", data: "Landing / Bounce / CVR", output: "頁面修改優先序" },
    { title: "使用者路徑", agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Path / Events", output: "高轉換路徑與流失點" },
  ],
  attribution: [
    { title: "跨平台成效比較", agent: AGENTS.strategist, skill: "ecommerce-analytics-dashboard", data: "Meta + Google + GA + Shopline", output: "平台貢獻排行" },
    { title: "預算重新分配", agent: AGENTS.seo, skill: "sowork-analytics-ads-page", data: "CPA / ROAS / Margin", output: "下週預算配置表" },
    { title: "Campaign ROI 報告", agent: AGENTS.content, skill: "client-facing-chinese-content-writing", data: "Cost / Revenue / Assisted conversion", output: "給老闆看的 ROI 報告" },
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
        <span style={{ fontWeight: 700, color: INK }}>這一頁是早期預覽版。</span>
        {isPro
          ? " 加購電商營運報告（NT$48,000 建置 ＋ NT$25,000／月），SoWork 在導入時接上粉專、廣告帳號與電商後台的真實資料。"
          : " 下面全部是模擬數據 —— 這是接上真資料之後你會看到的樣子。真實串接是我們目前最重點的投資方向，專業方案可以優先加購搶先體驗。"}
      </div>
      {isPro ? (
        <button onClick={() => setAddonOpen(true)} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: INK, border: 0, borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
          申請加購
        </button>
      ) : (
        <button onClick={() => navigate("/pricing")} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: INK, border: 0, borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
          升級專業方案
        </button>
      )}
      {isPro && <AddonRequestModal isOpen={addonOpen} onClose={() => setAddonOpen(false)} />}
    </div>
  );
}

export default function DataWorkspacePage() {
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

  return (
    <div style={{ padding: "20px 24px 80px", maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 850, color: INK }}>成效儀表板</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
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

          <PlanNudge />
          {/* 粉絲團月報有自己的流程（上傳版型 → 跨月解析 → 體檢報告），不是
              PerformanceDashboard 那種模擬儀表板，所以整頁換掉而不是疊加。 */}
          {active.id === "fanpage_monthly" && <FanpageMonthlyReport />}
          {/* 2026-09-07 資料來源卡片：總覽最上方，先讓人看到「哪些接了、哪些沒接、
              沒接的要怎麼接」，再看下面標了「⚠ 模擬資料」的示意儀表板。 */}
          {active.id === "overview" && <ConnectionsPanel brandId={brandId} />}
          {active.id !== "fanpage_monthly" && <PerformanceDashboard sourceId={active.id} />}

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
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Agent：</b><AgentLine agent={task.agent} /></p>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Skill：</b>{task.skill}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Data：</b>{task.data}</p>
                <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 13, fontWeight: 700, color: INK }}>{task.output}</div>
              </article>
            ))}
          </div>
        </main>

        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18, position: "sticky", top: 84, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ca3af" }}>Evidence Panel</div>
          <h3 style={{ margin: "8px 0 10px", fontSize: 18, fontWeight: 850, color: INK }}>資料串接狀態</h3>
          {["Meta Ads API / 報表匯入", "Google Ads / GA4", "Shopline Open API", "跨平台整合歸因表"].map((x) => (
            <div key={x} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13, color: "#374151" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: INK, marginTop: 6, flex: "0 0 auto" }} /> {x}
            </div>
          ))}
          <div style={{ marginTop: 16, borderRadius: 16, background: "#f9fafb", padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: INK, marginBottom: 6 }}>下一步</div>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              接上 Meta、Google、GA、Shopline connector 後，這裡會換成真實數據；串接屬於電商營運報告的建置範圍，由 SoWork 在導入時設定。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
