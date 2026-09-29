/**
 * HomePage — 登入後首頁，取代「直接跳 /theater」的舊行為。
 *
 * 2026-09-14（CJ「沒有將策略落實到內容層乃至於串接到成效層的感覺…我想像中，
 * 是從上到下分為三個部分」）：v1 是三張並排的彙總卡片，感覺不出因果關係。
 * 改成上下相連的三個 mission tray——策略層→內容層→成效層用箭頭連著，每一層
 * 列的是「已完成 vs 還缺什麼」的缺口清單，不是抽象的彙總數字：
 *   策略層：品牌定位是否完成、哪些產品定位還沒補齊、最新的策略提醒本文
 *   內容層：每個接觸點的工作流是已建立還是手動貼上
 *   成效層：哪些接觸點已經串接、看得到成效（早期預覽）
 *
 * 2026-09-15（CJ「這一頁還要從長計議…先改到一個簡單版本，策略層逐步修改」）：
 * 拿掉了競爭者比對這個篩選鏡頭——需要爬蟲精度才準的「這個通路對方有沒有
 * 活躍」查不到什麼有用的東西，CJ 判斷現階段做不出可靠版本，先回到單純呈現
 * 「我們自己的策略→內容接觸點現況」。競爭者比對的後端
 * （server/strategy/core/competitorSnapshot.ts + competitorRouter.ts）保留在
 * repo 裡沒有刪，已經寫好也測試過，只是先不接進這一頁；之後若有更可靠的
 * 研究方法（例如先解析出對方社群帳號再做針對性查詢）可以直接接回來。
 *
 * 成效層的數字沿用成效工作台同一份 perfMockData（模擬數據，不重算一次）。
 * 「你的團隊」這個新頁面還沒建，這裡先不放連結，避免死連結。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebook, faInstagram, faTiktok,
} from "@fortawesome/free-brands-svg-icons";
import {
  faEnvelope, faGlobe, faComments, faBell, faFolderOpen, faLayerGroup, faCheck, faWandMagicSparkles, faTriangleExclamation, faCircleCheck, faArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { useScopeState } from "../../app/shell/ScopeBar";
import { aggregate, roas, setMockBrandSeed } from "../../performance/components/perfMockData";

// 2026-09-29（CJ）：內容通路只剩 FB／IG／TikTok／電子報／官網，LinkedIn／YouTube／X／新聞稿拿掉。
const TOUCHPOINT_ICON: Record<string, any> = {
  facebook: faFacebook, instagram: faInstagram, tiktok: faTiktok,
  email: faEnvelope, website: faGlobe, "brand-agent": faComments,
};
const TOUCHPOINT_ROUTE: Record<string, string> = {
  facebook: "/tasks/fb", instagram: "/tasks/ig", tiktok: "/tasks/tt",
  email: "/tasks/email", website: "/tasks/web",
};

const LAYER_COLORS = { strategy: "#2563eb", content: "#059669", performance: "#b45309" };

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
  const products: Array<{ id: number; name: string; hasPositioning: boolean }> = summaryQ.data?.products ?? [];
  const missingProducts = products.filter((p) => !p.hasPositioning);
  const strategyAlerts: Array<{ id: number; title: string; summary: string }> = summaryQ.data?.strategyAlerts ?? [];
  const touchpoints = coverage?.touchpoints ?? [];

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "1.5rem 1.5rem 3rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{en ? "Deployment workflow" : "策略落地工作流"}</h1>
        <button
          onClick={() => navigate("/theater")}
          style={{ fontSize: 13, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}
        >
          <FontAwesomeIcon icon={faBell} style={{ marginRight: 6, color: "#9ca3af" }} />
          {en ? "Notifications" : "通知"}
        </button>
      </div>

      {/* ── 策略層 ─────────────────────────────────────────────────────── */}
      <TrayHeader badge={en ? "Strategy" : "策略層"} color={LAYER_COLORS.strategy} caption={en ? "How complete is this brand's strategy" : "這個品牌的策略齊備度"} />
      <Tray>
        <TrayRow
          icon={positioningLocked ? faCircleCheck : faTriangleExclamation}
          iconColor={positioningLocked ? "#059669" : "#b45309"}
          label={en ? "Brand positioning" : "品牌定位"}
          status={positioningLocked ? (en ? "Done" : "已完成") : (en ? "Incomplete" : "尚未完成")}
          statusColor={positioningLocked ? "#059669" : "#b45309"}
          onClick={() => navigate("/brands")}
        />
        {missingProducts.map((p) => (
          <TrayRow
            key={p.id}
            icon={faTriangleExclamation} iconColor="#b45309"
            label={en ? `Product positioning: ${p.name}` : `產品定位：${p.name}`}
            status={en ? "Incomplete" : "尚未補齊"} statusColor="#b45309"
            cta={en ? "Complete it" : "去補齊"}
            onClick={() => navigate(`/brands/edit?p=${p.id}`)}
          />
        ))}
        {strategyAlerts.map((a) => (
          <TrayRow key={a.id} icon={faBell} iconColor="#2563eb" label={a.title} status={en ? "New" : "新提醒"} statusColor="#2563eb" onClick={() => navigate("/brands")} />
        ))}
      </Tray>

      <ArrowDown />

      {/* ── 內容層 ─────────────────────────────────────────────────────── */}
      <TrayHeader badge={en ? "Content" : "內容層"} color={LAYER_COLORS.content} caption={en ? "Strategy landed as a workflow at each touchpoint" : "策略落地到每個接觸點的工作流"} />
      <Tray>
        {touchpoints.map((t: any) => (
          <TrayRow
            key={t.id}
            faIcon={TOUCHPOINT_ICON[t.id]}
            label={en ? t.labelEn : t.label}
            status={t.deployStatus === "connected" ? (en ? "Auto-deployed" : "已自動部署") : (en ? "Manual copy-paste" : "手動貼上")}
            statusColor={t.deployStatus === "connected" ? "#059669" : "#9ca3af"}
            cta={en ? "Open workflow" : "打開工作流"}
            onClick={() => TOUCHPOINT_ROUTE[t.id] && navigate(TOUCHPOINT_ROUTE[t.id])}
          />
        ))}
      </Tray>

      <ArrowDown />

      {/* ── 成效層 ─────────────────────────────────────────────────────── */}
      <TrayHeader badge={en ? "Performance · early preview" : "成效層 · 早期預覽"} color={LAYER_COLORS.performance} caption={en ? "Which touchpoints you can already see performance for" : "哪些接觸點已經串接、看得到成效"} />
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
        {en ? `Simulated ROAS ${mockRoas.toFixed(2)}x — real connections get priority access on Professional.` : `模擬 ROAS ${mockRoas.toFixed(2)}x——真實串接：專業方案優先體驗。`}
      </p>
      <Tray>
        {touchpoints.filter((t: any) => t.deployMethod !== "embed-widget").map((t: any) => (
          <TrayRow
            key={t.id}
            faIcon={TOUCHPOINT_ICON[t.id]}
            label={en ? t.labelEn : t.label}
            status={t.deployStatus === "connected" ? (en ? "Connected — data visible" : "已串接，看得到成效") : (en ? "Not connected yet" : "尚未串接")}
            statusColor={t.deployStatus === "connected" ? "#059669" : "#9ca3af"}
            onClick={() => navigate("/performance")}
          />
        ))}
      </Tray>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, margin: "1.5rem 0" }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>{en ? "This week" : "本週建議"}</p>
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
          <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>{en ? "Recent activity" : "最近動態"}</p>
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
        <span onClick={() => navigate("/changelog")} style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto", cursor: "pointer" }}>
          {en ? "Changelog" : "更新日誌"}
        </span>
      </div>
    </div>
  );
}

function TrayHeader({ badge, color, caption }: { badge: string; color: string; caption: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: `${color}1a`, color }}>{badge}</span>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{caption}</span>
    </div>
  );
}

function Tray({ children }: { children: React.ReactNode }) {
  return <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>{children}</div>;
}

function ArrowDown() {
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
      <FontAwesomeIcon icon={faArrowDown} style={{ fontSize: 16, color: "#d1d5db" }} />
    </div>
  );
}

function TrayRow(props: {
  icon?: any; faIcon?: any; iconColor?: string; label: string;
  status: string; statusColor: string; cta?: string; onClick?: () => void;
}) {
  // 2026-09-14（CJ「手動貼上的按鈕，只是轉連結到任務卡列表，有點奇怪」）：
  // 狀態文字（已自動部署／手動貼上）不該同時是隱形按鈕——一個 row 只能是
  // 「純狀態、整列可點」或「狀態 + 一顆有動詞的按鈕」，不能兩者都做同一件事。
  const rowClickable = !!props.onClick && !props.cta;
  return (
    <div
      onClick={rowClickable ? props.onClick : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: "1px solid #f3f4f6", cursor: rowClickable ? "pointer" : "default",
      }}
    >
      <FontAwesomeIcon icon={props.faIcon ?? props.icon} style={{ fontSize: 15, color: props.iconColor ?? "#9ca3af", width: 18 }} />
      <span style={{ fontSize: 13, flex: 1 }}>{props.label}</span>
      {props.status && <span style={{ fontSize: 12, color: props.statusColor }}>{props.status}</span>}
      {props.cta && (
        <button onClick={props.onClick} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
          {props.cta}
        </button>
      )}
    </div>
  );
}
