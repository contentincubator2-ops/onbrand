/**
 * HomePage — 登入後首頁，取代「直接跳 /theater」的舊行為。
 *
 * 2026-09-13（FDE 定位落地，CJ「新的接觸點類別，應該就是我們目前的『平台』」
 * 之後的重整第一步）：一頁看到三層——策略層現況、內容與部署（接觸點覆蓋率）、
 * 成效層（早期預覽）——再往下是接觸點清單、本週建議、最近動態。取代原本
 * 「登入就直接進七日發布台」，讓使用者先看到「你的品牌部署到哪裡了」，
 * 而不是被丟進某一個內容通路。
 *
 * 成效層的數字沿用成效工作台同一份 perfMockData（模擬數據，不重算一次）；
 * 接觸點清單與策略層現況（定位狀態、策略提醒則數）走新的
 * touchpoints.homeSummary（見 server/platform/routers/touchpointsRouter.ts）。
 *
 * 「你的團隊」這個新頁面還沒建（見 3,010 人設池指派可視化，尚待範圍確認），
 * 這裡先不放連結，避免死連結。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn, faXTwitter,
} from "@fortawesome/free-brands-svg-icons";
import {
  faEnvelope, faBullhorn, faGlobe, faComments, faBell, faFolderOpen, faLayerGroup,
  faCheck, faWandMagicSparkles, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { useScopeState } from "../../app/shell/ScopeBar";
import { aggregate, roas, setMockBrandSeed } from "../../performance/components/perfMockData";

const TOUCHPOINT_ICON: Record<string, any> = {
  facebook: faFacebookF, instagram: faInstagram, linkedin: faLinkedinIn,
  youtube: faYoutube, tiktok: faTiktok, x: faXTwitter,
  email: faEnvelope, pr: faBullhorn, website: faGlobe, "brand-agent": faComments,
};
const TOUCHPOINT_ROUTE: Record<string, string> = {
  facebook: "/tasks/fb", instagram: "/tasks/ig", linkedin: "/tasks/li",
  youtube: "/tasks/yt", tiktok: "/tasks/tt", x: "/tasks/x",
  email: "/tasks/email", pr: "/tasks/pr", website: "/tasks/web",
};

const INK = "#171717";

export default function HomePage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const en = lang === "en";
  const [scope] = useScopeState();
  const brandId = scope.brandId;

  const summaryQ = (trpc as any).touchpoints.homeSummary.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, staleTime: 30_000 },
  );
  const notifQ = (trpc as any).notifications.list.useQuery(
    { limit: 3, lang: en ? "en" : "zh-TW" },
    { staleTime: 30_000 },
  );
  const festivalQ = (trpc as any).festival.upcoming.useQuery(
    { windowDays: 21, limit: 2, region: summaryQ.data?.coverage?.targetCountry || "TW" },
    { staleTime: 60_000 },
  );

  React.useEffect(() => { setMockBrandSeed(brandId); }, [brandId]);
  const mockRoas = roas(aggregate({}));

  if (!brandId) {
    return (
      <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>
        {en ? "Pick a brand to see your deployment overview." : "先選一個品牌，才能看到部署總覽。"}
      </div>
    );
  }

  const coverage = summaryQ.data?.coverage;
  const positioningLocked = summaryQ.data?.positioningStatus === "completed";
  const alertsNew = summaryQ.data?.strategyAlertsNewCount ?? 0;
  const touchpoints = coverage?.touchpoints ?? [];
  const connectedCount = coverage?.connectedCount ?? 0;
  const totalCount = coverage?.totalCount ?? 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1.5rem 3rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{en ? "Home" : "首頁"}</h1>
        <button
          onClick={() => navigate("/theater")}
          style={{ fontSize: 13, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}
        >
          <FontAwesomeIcon icon={faBell} style={{ marginRight: 6, color: "#9ca3af" }} />
          {en ? "Notifications" : "通知"}
        </button>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
        {en ? "Three layers" : "三層總覽"}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <LayerCard
          badge={en ? "Strategy" : "策略層"} badgeColor="#2563eb"
          headline={positioningLocked ? (en ? "Positioning locked" : "定位已鎖定") : (en ? "Positioning in progress" : "定位進行中")}
          subline={en ? `Strategy monitor: ${alertsNew} new alert(s)` : `策略監測：${alertsNew} 則新提醒`}
          cta={en ? "Strategy workbench" : "策略工作台"} onClick={() => navigate("/brands")}
        />
        <LayerCard
          badge={en ? "Content & deploy" : "內容與部署"} badgeColor="#059669"
          headline={en ? `${totalCount} touchpoints` : `${totalCount} 個接觸點`}
          subline={en ? `${connectedCount} auto-deployed · ${totalCount - connectedCount} manual` : `${connectedCount} 已自動部署 · ${totalCount - connectedCount} 手動貼上`}
          cta={en ? "Scheduling & deploy" : "排程與部署"} onClick={() => navigate("/theater")}
        />
        <LayerCard
          badge={en ? "Performance · early preview" : "成效層 · 早期預覽"} badgeColor="#b45309"
          headline={en ? `Simulated ROAS ${mockRoas.toFixed(2)}x` : `模擬 ROAS ${mockRoas.toFixed(2)}x`}
          subline={en ? "Real connections: priority access on Professional" : "真實串接：專業方案優先體驗"}
          cta={en ? "Performance workspace" : "成效工作台"} onClick={() => navigate("/performance")}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: 0 }}>
          {en ? "Touchpoint overview" : "接觸點總覽"}
        </p>
        {coverage && (coverage.industry || coverage.targetCountry) && (
          <div style={{ display: "flex", gap: 6 }}>
            {coverage.industry && <Tag>{coverage.industry}</Tag>}
            {coverage.targetCountry && <Tag>{en ? `${coverage.targetCountry} market` : `${coverage.targetCountry} 市場`}</Tag>}
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
        {en ? "Touchpoints recommended for your industry and target market." : "依你的產業與目標市場推薦的接觸點組合。"}
      </p>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
        {touchpoints.map((t: any, i: number) => (
          <div
            key={t.id}
            onClick={() => TOUCHPOINT_ROUTE[t.id] && navigate(TOUCHPOINT_ROUTE[t.id])}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: i < touchpoints.length - 1 ? "1px solid #f3f4f6" : "none",
              cursor: TOUCHPOINT_ROUTE[t.id] ? "pointer" : "default",
            }}
          >
            <FontAwesomeIcon icon={TOUCHPOINT_ICON[t.id]} style={{ fontSize: 15, color: "#9ca3af", width: 18 }} />
            <span style={{ fontSize: 13, flex: 1 }}>{en ? t.labelEn : t.label}</span>
            <span style={{
              fontSize: 12, padding: "2px 10px", borderRadius: 6,
              background: t.deployStatus === "connected" ? "#ecfdf5" : "#fffbeb",
              color: t.deployStatus === "connected" ? "#059669" : "#b45309",
            }}>
              {t.deployStatus === "connected" ? (en ? "Connected" : "已串接") : (en ? "Manual" : "手動貼上")}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: "1.5rem" }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
            {en ? "This week" : "本週建議"}
          </p>
          {(festivalQ.data ?? []).length === 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#9ca3af" }}>
              {en ? "No suggestions right now." : "目前沒有建議。"}
            </div>
          ) : (festivalQ.data ?? []).map((f: any) => (
            <div key={f.slug} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <p style={{ fontSize: 13, margin: "0 0 6px" }}>
                {en ? `${f.name_en ?? f.name_zh} in ${f.daysAway} day(s)` : `${f.name_zh}還有 ${f.daysAway} 天`}
                {f.contentHint ? ` — ${f.contentHint}` : ""}
              </p>
              <button onClick={() => navigate("/theater")} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
                {en ? "Act on it" : "採用建議"} ↗
              </button>
            </div>
          ))}
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>
            {en ? "Recent activity" : "最近動態"}
          </p>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "4px 0" }}>
            {(notifQ.data?.items ?? notifQ.data ?? []).length === 0 ? (
              <div style={{ padding: "8px 14px", fontSize: 13, color: "#9ca3af" }}>{en ? "Nothing yet." : "還沒有動態。"}</div>
            ) : (notifQ.data?.items ?? notifQ.data ?? []).slice(0, 3).map((n: any) => (
              <div key={n.id} onClick={() => n.navUrl && navigate(n.navUrl)} style={{ display: "flex", gap: 8, padding: "8px 14px", fontSize: 13, color: "#6b7280", cursor: n.navUrl ? "pointer" : "default" }}>
                <FontAwesomeIcon icon={n.kind === "task_complete" ? faCheck : n.kind === "card_published" ? faWandMagicSparkles : n.kind === "strategy_alert" ? faTriangleExclamation : faBell} style={{ fontSize: 13, marginTop: 2, color: "#9ca3af" }} />
                <span>{n.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => navigate("/projects")} style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
          <FontAwesomeIcon icon={faFolderOpen} style={{ marginRight: 6, color: "#9ca3af" }} />
          {en ? "History" : "歷史紀錄"}
        </button>
        <button onClick={() => navigate("/tasks/fb")} style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
          <FontAwesomeIcon icon={faLayerGroup} style={{ marginRight: 6, color: "#9ca3af" }} />
          {en ? "Advanced: browse task cards" : "進階：自己挑任務卡"}
        </button>
        <span
          onClick={() => navigate("/changelog")}
          style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto", cursor: "pointer" }}
        >
          {en ? "Changelog" : "更新日誌"}
        </span>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 6, background: "#f3f4f6", color: "#6b7280" }}>
      {children}
    </span>
  );
}

function LayerCard(props: {
  badge: string; badgeColor: string; headline: string; subline: string; cta: string; onClick: () => void;
}) {
  return (
    <div style={{ background: "#f9fafb", borderRadius: 12, padding: "1rem" }}>
      <span style={{
        display: "inline-block", fontSize: 12, padding: "2px 8px", borderRadius: 6, marginBottom: 8,
        background: `${props.badgeColor}1a`, color: props.badgeColor,
      }}>
        {props.badge}
      </span>
      <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", color: INK }}>{props.headline}</p>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>{props.subline}</p>
      <span onClick={props.onClick} style={{ fontSize: 12, color: props.badgeColor, cursor: "pointer" }}>
        {props.cta} →
      </span>
    </div>
  );
}
