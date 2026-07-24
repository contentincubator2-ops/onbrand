/**
 * DataWorkspacePage — sowork@sowork.tw gated agent workspace for
 * performance analytics + market intelligence modes.
 *
 * Goal: keep the current content-execution mental model (left source rail,
 * center agent task cards, right evidence/context panel), but switch the work
 * from content generation to data diagnosis.
 */
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

type TaskCard = {
  title: string;
  agent: string;
  skill: string;
  data: string;
  output: string;
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
  { id: "overview", label: "市場總覽", short: "總覽", icon: <TrendingUp size={18} />, color: "#111827", desc: "趨勢、競品、受眾訊號與機會點" },
  { id: "listening", label: "輿情監測", short: "輿情", icon: <Activity size={18} />, color: "#DC2626", desc: "聲量、情緒、議題脈絡、社群原話" },
  { id: "keywords", label: "關鍵字分析", short: "KW", icon: <Search size={18} />, color: "#2563EB", desc: "搜尋需求、關鍵字群、內容缺口" },
  { id: "geo", label: "GEO / SEO", short: "GEO", icon: <Globe2 size={18} />, color: "#059669", desc: "AI 搜尋可見度、SERP、品牌被引用機會" },
  { id: "competitors", label: "競品情報", short: "競品", icon: <Database size={18} />, color: "#9333EA", desc: "競品新聞、活動、定位與訊息空白" },
  { id: "opportunity", label: "機會診斷", short: "機會", icon: <Sparkles size={18} />, color: "#EA580C", desc: "可立即轉成內容、廣告、PR 的市場切角" },
];

const performanceTasks: Record<string, TaskCard[]> = {
  overview: [
    { title: "本週成效摘要", agent: "Performance PM", skill: "ecommerce-analytics-dashboard", data: "Meta / Google / GA / Shopline", output: "老闆版一頁摘要 + 3 個優先行動" },
    { title: "預算花費 vs 成果", agent: "Media Analyst", skill: "sowork-analytics-ads-page", data: "Spend / ROAS / CPA / CVR", output: "預算效率排序與異常提醒" },
    { title: "最該處理的 3 件事", agent: "Growth Strategist", skill: "timeseries-proportional-scaling", data: "7/14/30 日趨勢", output: "今天可執行的修正清單" },
  ],
  meta: [
    { title: "活動成效診斷", agent: "Meta Ads Analyst", skill: "meta-ads-google-sheets-sync", data: "Campaign / Ad set / Ad", output: "高低效活動與原因判讀" },
    { title: "受眾疲乏偵測", agent: "Audience Analyst", skill: "ecommerce-analytics-dashboard", data: "Frequency / CTR / CPM", output: "疲乏受眾與排除/拓展建議" },
    { title: "素材勝負分析", agent: "Creative Analyst", skill: "sowork-analytics-ads-page", data: "Thumbstop / CTR / CVR", output: "保留、重剪、停用素材清單" },
    { title: "下一週預算建議", agent: "Media Planner", skill: "ai-saas-pricing", data: "Spend / Result / ROAS", output: "預算移轉比例與風險說明" },
  ],
  google: [
    { title: "關鍵字成效分析", agent: "Search Ads Analyst", skill: "source-backed-competitive-evidence", data: "Keyword / Query / CPA", output: "加碼、否定、拆組建議" },
    { title: "PMax / Display 診斷", agent: "Google Ads Planner", skill: "sowork-analytics-ads-page", data: "Asset group / Placement", output: "資產群與版位調整建議" },
    { title: "搜尋意圖洞察", agent: "Intent Analyst", skill: "taiwan-solo-founder-market-research", data: "Search terms", output: "轉換型 vs 探索型需求分類" },
  ],
  shopline: [
    { title: "商品銷售排行", agent: "Commerce Analyst", skill: "shopline-api-integration", data: "Orders / SKU / Revenue", output: "主推商品與滯銷商品清單" },
    { title: "轉換漏斗", agent: "Funnel Analyst", skill: "ecommerce-analytics-dashboard", data: "Session → Cart → Checkout → Purchase", output: "漏斗流失點與修正任務" },
    { title: "回購與客單價", agent: "CRM Analyst", skill: "amazon-marketplace-sales-enrichment", data: "AOV / Repeat / Cohort", output: "加購、組合、回購策略" },
  ],
  ga: [
    { title: "流量來源分析", agent: "GA Analyst", skill: "google-workspace", data: "Source / Medium / Campaign", output: "有效流量與假流量分流" },
    { title: "Landing Page 表現", agent: "CRO Analyst", skill: "browser-frontend-testing-without-ssh", data: "Landing / Bounce / CVR", output: "頁面問題與 A/B 測試建議" },
    { title: "使用者路徑", agent: "Journey Analyst", skill: "ecommerce-analytics-dashboard", data: "Path / Events", output: "高轉換路徑與流失節點" },
  ],
  attribution: [
    { title: "跨平台成效比較", agent: "Attribution Analyst", skill: "ecommerce-analytics-dashboard", data: "Meta + Google + GA + Shopline", output: "平台效率矩陣" },
    { title: "預算重新分配", agent: "Budget Strategist", skill: "sowork-analytics-ads-page", data: "CPA / ROAS / Margin", output: "下週預算配置表" },
    { title: "Campaign ROI 報告", agent: "Executive Reporter", skill: "client-facing-chinese-content-writing", data: "Cost / Revenue / Assisted conversion", output: "可貼給老闆的一頁報告" },
  ],
};

const marketTasks: Record<string, TaskCard[]> = {
  overview: [
    { title: "市場機會摘要", agent: "Market PM", skill: "market-intel", data: "market_data / creative_cases", output: "本週 3 個可操作市場切角" },
    { title: "競品與趨勢快報", agent: "Competitive Scout", skill: "news-intelligence-workflows", data: "新聞 / 社群 / 搜尋", output: "競品動作與策略含意" },
    { title: "內容題材建議", agent: "Content Strategist", skill: "social-listening-reporting", data: "聲量 + 關鍵字", output: "可轉成貼文/廣告/PR 的題材" },
  ],
  listening: [
    { title: "聲量與情緒監測", agent: "Listening Analyst", skill: "opview-social-listening", data: "OpView / Meltwater / 社群資料", output: "正負聲量、議題源頭、異常提醒" },
    { title: "社群原話萃取", agent: "Insight Curator", skill: "social-listening-excel-summary", data: "Forum / FB / Threads / News", output: "可引用消費者原話與痛點" },
    { title: "危機與機會分流", agent: "Triage Agent", skill: "news-alert-triage", data: "聲量 spike / sentiment", output: "回應、放大、觀察分級" },
  ],
  keywords: [
    { title: "關鍵字需求分群", agent: "Keyword Analyst", skill: "source-backed-competitive-evidence", data: "Search / SERP / Trend", output: "品牌詞、品類詞、痛點詞分群" },
    { title: "內容缺口分析", agent: "SEO Strategist", skill: "website-design-cloning", data: "競品內容 / SERP", output: "應補文章、FAQ、Landing page" },
    { title: "高意圖詞優先級", agent: "Performance SEO", skill: "taiwan-solo-founder-market-research", data: "Volume / intent / difficulty", output: "先做哪些詞、接哪個產品頁" },
  ],
  geo: [
    { title: "AI 搜尋可見度", agent: "GEO Analyst", skill: "official-public-source-research", data: "ChatGPT / Gemini / Perplexity answers", output: "品牌是否被引用、缺哪些證據" },
    { title: "答案引擎內容包", agent: "GEO Content Planner", skill: "data-backed-market-research-reports", data: "FAQ / schema / proof points", output: "可被 AI 引用的內容結構" },
    { title: "競品引用比較", agent: "Share of Answer Analyst", skill: "source-backed-competitive-evidence", data: "AI answer snapshots", output: "誰被 AI 推薦、原因與補強" },
  ],
  competitors: [
    { title: "競品新聞雷達", agent: "News Scout", skill: "blogwatcher", data: "News / Blog / PR", output: "競品動作摘要與威脅分級" },
    { title: "競品訊息地圖", agent: "Positioning Analyst", skill: "branding-3-layer", data: "官網 / 廣告 / 社群", output: "訊息空白與我方切入點" },
    { title: "案例靈感庫", agent: "Creative Case Scout", skill: "market-intel", data: "creative_cases", output: "可借鏡 campaign pattern" },
  ],
  opportunity: [
    { title: "本週機會點排序", agent: "Strategy PM", skill: "consulting-delivery-playbooks", data: "趨勢 + 聲量 + 競品", output: "P0/P1/P2 機會清單" },
    { title: "轉內容任務", agent: "Content PM", skill: "client-facing-chinese-content-writing", data: "市場洞察", output: "可直接派給內容 agent 的 task cards" },
    { title: "轉廣告測試", agent: "Experiment Planner", skill: "sowork-analytics-ads-page", data: "痛點 / 受眾 / 競品空白", output: "A/B test 假設與素材方向" },
  ],
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

export default function DataWorkspacePage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const mode: Mode = loc.pathname.startsWith("/market-intel") ? "market" : "performance";
  const { email, loading } = useCurrentUserEmail();
  const sources = mode === "performance" ? performanceSources : marketSources;
  const tasksBySource = mode === "performance" ? performanceTasks : marketTasks;
  const [activeSource, setActiveSource] = React.useState("overview");

  React.useEffect(() => { setActiveSource("overview"); }, [mode]);

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

  return (
    <div style={{ padding: "20px 24px 80px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9ca3af" }}>
            {isPerformance ? "Performance Agents" : "Market Intelligence Agents"}
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 850, color: "#111827" }}>
            {isPerformance ? "成效儀表板" : "市場情報"}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280" }}>
            {isPerformance ? "把 Meta、Google、GA、Shopline 轉成 Agent 診斷與下一步。" : "把輿情、關鍵字、GEO、競品訊號轉成策略任務。"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, padding: 4, border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff" }}>
          <button onClick={() => navigate("/performance")} style={modeBtn(isPerformance)}>廣告成效</button>
          <button onClick={() => navigate("/market-intel")} style={modeBtn(!isPerformance)}>市場數據</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 22, background: "#fff", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {sources.map(source => {
            const active = source.id === activeSource;
            return (
              <button key={source.id} onClick={() => setActiveSource(source.id)} title={source.label} style={{
                width: "100%", height: 62, borderRadius: 16, border: active ? `1.5px solid ${source.color}` : "1px solid transparent",
                background: active ? `${source.color}12` : "transparent", color: active ? source.color : "#6b7280",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                cursor: "pointer", transition: "all 0.14s ease",
              }}>
                {source.icon}
                <span style={{ fontSize: 11, fontWeight: 750 }}>{source.short}</span>
              </button>
            );
          })}
        </aside>

        <main style={{ minWidth: 0 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "linear-gradient(135deg,#fff 0%,#fafafa 100%)", padding: 22, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 16, background: active.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{active.icon}</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: "#111827" }}>{active.label}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{active.desc}</p>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {cards.map((task) => (
              <article key={task.title} style={{ border: "1px solid #e5e7eb", borderRadius: 22, background: "#fff", padding: 18, minHeight: 210, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: active.color, background: `${active.color}12`, padding: "4px 8px", borderRadius: 999 }}>AGENT TASK</span>
                  <LineChart size={16} color="#9ca3af" />
                </div>
                <h3 style={{ margin: "14px 0 8px", fontSize: 17, lineHeight: 1.3, fontWeight: 850, color: "#111827" }}>{task.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Agent：</b>{task.agent}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Skill：</b>{task.skill}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}><b>Data：</b>{task.data}</p>
                <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 13, fontWeight: 700, color: "#111827" }}>{task.output}</div>
              </article>
            ))}
          </div>
        </main>

        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18, position: "sticky", top: 84 }}>
          <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9ca3af" }}>Evidence Panel</div>
          <h3 style={{ margin: "8px 0 10px", fontSize: 18, fontWeight: 850, color: "#111827" }}>{isPerformance ? "資料串接狀態" : "市場資料來源"}</h3>
          {(isPerformance
            ? ["Meta Ads API / 報表匯入", "Google Ads / GA4", "Shopline Open API", "跨平台整合歸因表"]
            : ["market-intel: market_data", "OpView / Meltwater 輿情", "Keyword / SERP / GEO snapshots", "creative_cases 案例庫"]
          ).map((x) => (
            <div key={x} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13, color: "#374151" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: active.color }} /> {x}
            </div>
          ))}
          <div style={{ marginTop: 16, borderRadius: 16, background: "#f9fafb", padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#111827", marginBottom: 6 }}>下一步</div>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              先用 mock / 匯入資料驗證版面；接著逐一接 Meta、Google、GA、Shopline 與市場資料 connector。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 800,
    background: active ? "#111827" : "transparent", color: active ? "#fff" : "#6b7280",
    cursor: "pointer", transition: "all 0.14s ease",
  };
}
