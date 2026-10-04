/**
 * 左側 70px 圖示列、導覽連結與帳號彈窗。
 */
import { type ScopeState } from "../../platform/components/ScopeBar";
import { useLang } from "../../../lib/i18n";
import { trpc } from "../../../lib/trpc";
import React from "react";
import { type BrandMemoryData, buildMemoryView } from "../../strategy/components/brain/memoryModel";
import { defaultWeek } from "../../content/lib/plannerWeek";
import { isStrategyPreviewEmail } from "../../platform/lib/shellContext";
import { faBrain, faChartLine, faChevronDown, faCheck, faPlus, faBell, faGear, faShareNodes, faBriefcase, faLanguage, faUsers, faCircleInfo, faRightFromBracket, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { ICON } from "../../platform/components/icons";
import { Tooltip, Avatar } from "@heroui/react";
import OnBrandLogo from "../../platform/components/OnBrandLogo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import NavItemPicker from "./NavItemPicker";
import { useCustomChannels, type ChannelPresetLite } from "../../content/lib/customChannels";
import { showToastGlobal } from "../../platform/components/Toast";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchAuthMe } from "../../../lib/authMe";
import PricingInfoModal from "../../platform/components/PricingInfoModal";
import { CHANNEL_TO_TASK_ROUTE, navCatalog, buildNavItems, NavItem } from "./nav";
import { ICON_W, SOWORK_ORANGE_TEXT, SOWORK_ORANGE, useIsMobile, SectionLabel, Divider, PopupRow } from "./shellShared";

export function IconBar({
  collapsed, onToggle, currentPath, activeCat, onNavigate,
  scope, setScope, onLogout, notifOpen, onNotifToggle, notifUnread, onOpenSupport, brands, userEmail,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  /** Current `cat` query param — the 策略 rail's entries share one pathname
   *  and are distinguished only by this. */
  activeCat?: string | null;
  onNavigate: (to: string) => void;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onLogout: () => void;
  notifUnread?: number;
  notifOpen: boolean;
  onNotifToggle: () => void;
  onOpenSupport?: () => void;
  brands: any[];
  userEmail?: string | null;
}) {
  const { lang, setLang } = useLang();
  const isEn = lang === "en";
  // 2026-08-29 (CJ「每個品牌，只出現他的定位、任務，不會出現他用不到的」):
  // 這個品牌若有客製任務包，側邊欄只留包裡宣告的頻道。沒有包就回 null，
  // buildNavItems 整段跳過。
  const packNavQuery = (trpc as any).quickTask?.brandNav?.useQuery
    ? (trpc as any).quickTask.brandNav.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false, staleTime: 300_000 },
      )
    : { data: null };
  const allowedTaskRoutes = React.useMemo<Set<string> | null>(() => {
    const channels = (packNavQuery.data as any)?.channels;
    if (!Array.isArray(channels) || channels.length === 0) return null;
    const routes = channels
      .map((c: any) => CHANNEL_TO_TASK_ROUTE[c.key])
      .filter(Boolean) as string[];
    return routes.length > 0 ? new Set(routes) : null;
  }, [packNavQuery.data]);
  // 2026-09-27（CJ「除了專案、行事曆、活動，所有 mission tray 變成使用者自己加入」）：
  // 這個品牌自己加的通路與工具。沒設定過＝預設 Facebook＋Instagram；任務包品牌若包裡
  // 沒有 FB/IG，預設改成包裡的前兩個，不讓側欄上段一開始就是空的。
  const navPrefsQ = (trpc as any).navPrefs?.get?.useQuery(
    { brandId: scope.brandId ?? 0 },
    { enabled: !!scope.brandId, refetchOnWindowFocus: false, staleTime: 300_000 },
  ) ?? { data: null };
  const utils = (trpc as any).useUtils?.();
  // 2026-10-04：用戶自己加的 mission tray（蝦皮、momo、網紅合作…或自訂）。
  const { channels: customChannels, refetch: refetchCustomChannels } = useCustomChannels(scope.brandId ?? null);
  const catalog = React.useMemo(() => navCatalog(lang, allowedTaskRoutes, customChannels), [lang, allowedTaskRoutes, customChannels]);
  const userNavItems = React.useMemo<string[]>(() => {
    const d = navPrefsQ.data as { items: string[]; isDefault: boolean } | null | undefined;
    if (!d) return [];
    const allowed = d.items.filter((id) => catalog.some((c) => c.id === id));
    if (d.isDefault && allowed.length === 0) return catalog.filter((c) => c.kind === "channel").slice(0, 2).map((c) => c.id!);
    return allowed;
  }, [navPrefsQ.data, catalog]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const saveNav = (trpc as any).navPrefs?.save?.useMutation?.({
    onSuccess: () => { try { utils?.navPrefs?.get?.invalidate?.(); } catch { /* noop */ } setPickerOpen(false); },
  });
  // 2026-10-04：「＋」裡的平台範本（蝦皮、momo、露天、SHOPLINE…）與自訂 tray。範本是 server 給的資料。
  const presetsQ = (trpc as any).customChannel.presets.useQuery(undefined, { enabled: pickerOpen, refetchOnWindowFocus: false, staleTime: Infinity });
  const createChannel = (trpc as any).customChannel.create.useMutation();
  const removeChannel = (trpc as any).customChannel.remove.useMutation();
  const onCreateChannel = async (input: { preset?: string; name?: string }): Promise<string | null> => {
    if (!scope.brandId) return null;
    try {
      const r = await createChannel.mutateAsync({ brandId: scope.brandId, ...input });
      await refetchCustomChannels();
      return (r?.channel?.id as string) ?? null;
    } catch (e: any) {
      showToastGlobal(e?.message ?? (isEn ? "Couldn't add it" : "新增失敗"));
      return null;
    }
  };
  const renameChannel = (trpc as any).customChannel.rename.useMutation();
  const onRenameChannel = async (id: string, name: string) => {
    if (!scope.brandId || !name.trim()) return;
    try {
      await renameChannel.mutateAsync({ brandId: scope.brandId, id, name: name.trim() });
      await refetchCustomChannels();
    } catch (e: any) {
      showToastGlobal(e?.message ?? (isEn ? "Couldn't rename it" : "改名失敗"));
    }
  };
  const onRemoveChannel = async (id: string) => {
    if (!scope.brandId) return;
    try {
      await removeChannel.mutateAsync({ brandId: scope.brandId, id });
      await refetchCustomChannels();
      try { utils?.navPrefs?.get?.invalidate?.(); } catch { /* noop */ }
    } catch (e: any) {
      showToastGlobal(e?.message ?? (isEn ? "Couldn't remove it" : "刪除失敗"));
    }
  };
  const brandName = (brands ?? []).find((b: any) => b?.id === scope.brandId)?.name ?? null;
  // 2026-09-30（CJ「超出記憶容量時，這邊會提醒用戶」）：在策略層任何一頁，記憶空間的
  // rail 圖示都會亮狀態點——用戶在別頁把內容填爆時，不用點進去就看得到。
  const onStrategyRail = currentPath?.startsWith("/brands") ?? false;
  // 算法跟「記憶」頁同一份（buildMemoryView）：任何一個產品／活動的寫作超載都算。
  const memoryQ = (trpc as any).brandKnowledge?.memory?.useQuery(
    { brandId: scope.brandId ?? 0 },
    { enabled: !!scope.brandId && onStrategyRail, refetchOnWindowFocus: true, staleTime: 60_000 },
  ) ?? { data: null };
  const memoryAlert = React.useMemo<"near" | "over" | undefined>(() => {
    const d = memoryQ.data as BrandMemoryData | null | undefined;
    if (!d || !scope.brandId) return undefined;
    const level = buildMemoryView(d, scope.brandId, false).level;
    return level === "ok" ? undefined : level;
  }, [memoryQ.data, scope.brandId]);
  // 2026-09-30（CJ「萃取好以後請用戶回來確認（法規 mission tray 會跳出通知）」）：有法規的審查重點
  // 萃取好、等確認時，「法規」圖示亮點。萃取在背景跑，所以每 20 秒問一次（只在策略層）。
  const regReviewQ = (trpc as any).brandRegulation.reviewCount.useQuery(
    { brandId: scope.brandId ?? 0 },
    { enabled: !!scope.brandId && onStrategyRail, refetchInterval: 20_000, refetchOnWindowFocus: true },
  );
  const regulationAlert: "review" | undefined = (regReviewQ.data?.count ?? 0) > 0 ? "review" : undefined;
  const NAV_ITEMS = React.useMemo(
    () => buildNavItems(lang, userEmail, currentPath, allowedTaskRoutes, userNavItems, customChannels)
      .map((it) => (it.catKey === "brain" && memoryAlert ? { ...it, alert: memoryAlert }
        : it.catKey === "regulations" && regulationAlert ? { ...it, alert: regulationAlert } : it)),
    [lang, userEmail, currentPath, allowedTaskRoutes, userNavItems, customChannels, memoryAlert, regulationAlert],
  );
  // 2026-09-30（CJ 參考 Tesla「電量」）：本週企劃的進度與各平台待寫篇數，真資料來自 planner.railStatus。
  // 週次用跟 PlannerPage 同一個 defaultWeek()；換頁就重抓（寫完一篇回來數字要跟著變）。
  const onContentRail = NAV_ITEMS.some((it) => it.group);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const railWeek = React.useMemo(() => defaultWeek(), [currentPath]);
  const railStatusQ = trpc.planner.railStatus.useQuery(
    { brandId: scope.brandId ?? 0, weekStart: railWeek },
    { enabled: !!scope.brandId && onContentRail, refetchOnWindowFocus: true, refetchInterval: 60_000, staleTime: 15_000 },
  );
  React.useEffect(() => {
    if (scope.brandId && onContentRail) railStatusQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);
  const railStatus = onContentRail ? railStatusQ.data : undefined;
  // 2026-09-30（CJ「策略監測有新的資料的時候…也會在品牌 mission tray 跳出通知」）：
  // 策略層 rail 的「品牌」圖示角落顯示未讀情報數。跟左下角通知、定位頁 chip 同一支查詢。
  const monitorUnreadQ = (trpc as any).strategyMonitor.unreadSummary.useQuery(
    { brandId: scope.brandId ?? 0 },
    { enabled: !!scope.brandId && onStrategyRail, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000, staleTime: 30_000 },
  );
  const monitorUnread = onStrategyRail ? Number(monitorUnreadQ.data?.count ?? 0) : 0;
  const isStrategyPreview = isStrategyPreviewEmail(userEmail);
  // 2026-08-20: 策略 added as a first-class workspace mode. 2026-09-08 市場
  // removed with the market-data layer (not on the price list). Order follows
  // how the work flows — decide the strategy, produce the content, read the results.
  const activeWorkspaceMode: "strategy" | "content" | "performance" =
    currentPath.startsWith("/performance")
      ? "performance"
      : currentPath.startsWith("/brands")
        ? "strategy"
        : "content";
  // 2026-09-07 (CJ「隱藏市場數據層，但用模擬數據為每個品牌製作成效層」)；
  // 2026-09-08 市場數據層整層移除。
  //   成效 —— 開放給所有帳號。畫面是標了「⚠ 模擬資料」的示意版，附三張
  //           資料來源卡片誠實顯示串接狀態；真資料屆時在導入時接。
  //   策略 —— 照舊給 isStrategyPreview；內容一律有。
  const modeOptions = [
    ...(isStrategyPreview ? [{ id: "strategy" as const, label: isEn ? "Strategy" : "策略", icon: faBrain, to: "/brands", tip: isEn ? "Strategy — brand brain" : "策略 — 品牌大腦" }] : []),
    // 2026-10-02（CJ「按下內容層後，預設出現改成本週企劃頁面」）：原本落在 /tasks/fb。
    { id: "content" as const, label: isEn ? "Content" : "內容", icon: ICON.content, to: "/planner", tip: isEn ? "Content production" : "內容產出" },
    { id: "performance" as const, label: isEn ? "Results" : "成效", icon: faChartLine, to: "/performance/overview", tip: isEn ? "Performance (sample data until connected)" : "成效數據（串接前為示意資料）" },
  ];
  // 成效對所有人開放之後，切換器至少有 2 項，一律顯示。
  const showModeSwitcher = true;
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const avatarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!avatarOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node))
        setAvatarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [avatarOpen]);

  // 2026-08-20: workspace switcher as a dropdown, matching the dev-branch
  // design — a static small capsule doesn't communicate that 策略 exists as
  // a 4th (or 2nd) mode. A dropdown hides the other options, so the trigger
  // carries a periodic nudge — without it the control reads as a static
  // label and users never learn it's switchable.
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const modeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!modeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node))
        setModeMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModeMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modeMenuOpen]);

  return (
    <aside
      className="sowork-icon-bar"
      style={{
        position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 40,
        width: ICON_W,
        background: "#fff",
        borderRight: "1px solid #f3f4f6",
        display: "flex", flexDirection: "column",
        overflow: "visible",   /* let edge chevron poke out */
      }}
    >
      {/* 2026-05-14: edge chevron removed — no expand panel anymore. */}
      {/* 2026-05-14 (CJ「Logo 點擊 → /?b=XXX 空白」 follow-up): land users
          on /30s directly. The previous '/' → '/brands' → '/brands/edit'
          redirect chain had several failure modes (Rules-of-Hooks bug,
          scope race conditions). /30s is the actual entry point users
          use 90% of the time, and it works without a redirect chain. */}
      <div style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <Tooltip content={isEn ? "onBrand Studio · home" : "onBrand Studio · 回首頁"} placement="right">
          <span>
            <OnBrandLogo
              glyphOnly
              size={32}
              onClick={() => onNavigate("/planner")}
              style={{ padding: 4, borderRadius: 8 }}
            />
          </span>
        </Tooltip>
        {/* 2026-06-07 (CJ「全站加 BETA 標」): tiny BETA badge anchored to
            the logo. Tooltip explains we're actively iterating. Visible on
            every page in this layout, no per-page work needed. */}
        <Tooltip
          content={isEn ? "Beta" : "Beta 測試中"}
          placement="right"
        >
          <span style={{
            position: "absolute",
            top: 4, right: 4,
            fontSize: 8, fontWeight: 800, letterSpacing: "0.08em",
            color: "#fff", background: "#18181b",
            padding: "1.5px 4px", borderRadius: 3,
            lineHeight: 1, cursor: "default",
            boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          }}>
            BETA
          </span>
        </Tooltip>
      </div>

      {showModeSwitcher && (
        <div
          ref={modeRef}
          style={{
            flexShrink: 0, position: "relative",
            padding: "0 3px 10px",
            borderBottom: "1px solid #f1f5f9",
            marginBottom: 8,
          }}
        >
          {/* The nudge: a slow 4s chevron bob + a one-off ring on the trigger.
              Deliberately low-frequency — a constant animation next to the
              nav would be noise. Honours prefers-reduced-motion. */}
          <style>{`
            @keyframes swNudge {
              0%, 82%, 100% { transform: translateY(0); }
              88%           { transform: translateY(2.5px); }
              94%           { transform: translateY(0); }
            }
            @keyframes swRing {
              0%, 82%, 100% { box-shadow: 0 0 0 0 rgba(24,24,27,0); }
              88%           { box-shadow: 0 0 0 4px rgba(24,24,27,0.18); }
            }
            .sw-trigger { animation: swRing 4s ease-in-out infinite; }
            .sw-chevron { animation: swNudge 4s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .sw-trigger, .sw-chevron { animation: none; }
            }
          `}</style>
          {(() => {
            const cur = modeOptions.find((m) => m.id === activeWorkspaceMode) ?? modeOptions[0]!;
            return (
              <button
                className={modeMenuOpen ? undefined : "sw-trigger"}
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                aria-label={isEn ? "Switch workspace" : "切換工作區"}
                onClick={() => setModeMenuOpen((v) => !v)}
                style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1,
                  width: "100%", height: 50,
                  border: "none", borderRadius: 12,
                  background: "#18181b", color: "#fff",
                  cursor: "pointer", transition: "filter 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.07)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                <FontAwesomeIcon icon={cur.icon} style={{ fontSize: 15 }} />
                <span style={{ display: "flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.02em" }}>{cur.label}</span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={modeMenuOpen ? undefined : "sw-chevron"}
                    style={{ fontSize: 7 }}
                  />
                </span>
              </button>
            );
          })()}

          {modeMenuOpen && (
            <div
              role="menu"
              style={{
                // Opens to the RIGHT of the rail — a 70px-wide menu couldn't
                // show full labels, which is the whole point of the dropdown.
                position: "absolute", left: "100%", top: 0, marginLeft: 8,
                width: 172, background: "#fff", borderRadius: 12,
                border: "1px solid #e5e7eb",
                boxShadow: "0 12px 32px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.04)",
                padding: 6, zIndex: 60,
              }}
            >
              {modeOptions.map((opt) => {
                const active = activeWorkspaceMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    role="menuitem"
                    onClick={() => { setModeMenuOpen(false); onNavigate(opt.to); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "9px 10px",
                      border: "none", borderRadius: 8, textAlign: "left",
                      background: active ? "#f4f4f5" : "transparent",
                      color: active ? "#18181b" : "#374151",
                      cursor: "pointer", transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <FontAwesomeIcon icon={opt.icon} style={{ fontSize: 14, width: 16 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 800 : 600 }}>{opt.label}</span>
                    {active && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12 }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2026-05-14: toggle button removed — sidebar is always fixed at
          70px now. Tier history, project filters etc. moved into
          in-page tiles (RecentRunsTile). */}

      {/* Brand pill moved out of IconBar — now floats top-left of viewport
          as horizontal hierarchy bar (BrandHierarchyPill in main layout) */}

      {/* Nav icons */}
      {/* 2026-08-20: overflowY was "hidden" — fine for the platform-tasks
          rail, but the 策略 rail has 7 items and would silently clip the
          last ones on short viewports with no way to reach them. "auto"
          keeps every item reachable; scrollbarWidth:none hides the bar so
          the 70px rail stays visually clean. */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 3px", scrollbarWidth: "none" }}>
        {(() => {
          const renderItem = (item: NavItem) => {
          const meter = item.to === "/planner" && railStatus ? { done: railStatus.written, total: railStatus.total } : undefined;
          const isBrandItem = item.catKey === "positioning" && monitorUnread > 0;
          const badge = isBrandItem ? monitorUnread : item.id ? railStatus?.pendingByNav?.[item.id] : undefined;
          const badgeTip = isBrandItem ? (isEn ? `${monitorUnread} new strategy alert${monitorUnread === 1 ? "" : "s"}` : `策略監測有 ${monitorUnread} 則新情報`) : undefined;
          // 2026-05-12 (CJ「按了連結還是顯示為品牌區」): pick the MOST SPECIFIC
          // matching item. If another nav item has a longer matching prefix,
          // this one yields. e.g. on /brands/settings, the 連結 item (prefix
          // /brands/settings) wins over the 品牌 item (prefix /brands).
          const myPrefix = item.matchPrefix ?? item.to;
          // 策略 rail: every entry shares the /brands/edit pathname, so prefix
          // matching would light all of them at once. Those items opt out via
          // catKey and match on the `cat` param instead. Falls back to
          // "positioning" because /brands/edit with no cat renders 定位.
          const isCatItem = !!item.catKey;
          const myMatches = isCatItem
            ? currentPath.startsWith("/brands") && (activeCat ?? "positioning") === item.catKey
            : item.to === "/" ? currentPath === "/"
              : currentPath.startsWith(myPrefix) || (item.alsoMatch ?? []).some((p) => currentPath.startsWith(p));
          let beatenByMoreSpecific = false;
          if (myMatches && !isCatItem) {
            for (const other of NAV_ITEMS) {
              if (other.to === item.to) continue;
              const otherPrefix = other.matchPrefix ?? other.to;
              if (otherPrefix === "/") continue;
              if (currentPath.startsWith(otherPrefix) && otherPrefix.length > myPrefix.length) {
                beatenByMoreSpecific = true;
                break;
              }
            }
          }
          const isActive = myMatches && !beatenByMoreSpecific;
          return <IconNavLink key={item.to} item={item} active={isActive} meter={meter} badge={badge} badgeTip={badgeTip} en={isEn} onClick={() => onNavigate(item.to)} />;
          };
          // 2026-09-30：內容層 rail 分三段——最上本週企劃；中段是這個品牌自己加的平台（＋ 在最後）；下段固定靈感、專案、活動。
          // 策略層、成效層的 rail 沒有 group，照舊整排渲染。
          const isContentRail = NAV_ITEMS.some((it) => it.group);
          if (!isContentRail) return NAV_ITEMS.map(renderItem);
          const topGroup = NAV_ITEMS.filter((it) => it.group === "top");
          const userGroup = NAV_ITEMS.filter((it) => it.group === "user");
          const fixedGroup = NAV_ITEMS.filter((it) => it.group === "fixed");
          // 2026-09-30（CJ 參考 Tesla）：三段各自一塊淺灰圓角底，取代分隔線。
          const zone: React.CSSProperties = { background: "#F4F4F3", borderRadius: 14, padding: "3px 0", margin: "0 2px 6px" };
          return (
            <>
              <div style={zone}>{topGroup.map(renderItem)}</div>
              <div style={zone}>
              {userGroup.map(renderItem)}
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label={isEn ? "Add channels" : "加入通路"}
                title={isEn ? "Add or remove channels and tools" : "加入或移除通路與工具"}
                style={{
                  width: 40, height: 28, margin: "4px auto", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1.5px dashed #D4D4D4", borderRadius: 10, background: "none", color: "#9ca3af", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#171717"; e.currentTarget.style.color = "#171717"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#D4D4D4"; e.currentTarget.style.color = "#9ca3af"; }}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
              </div>
              <div style={zone}>
              {fixedGroup.map(renderItem)}
              </div>
            </>
          );
        })()}

        {/* 2026-05-12 (CJ「顯示更多拿掉」): sidebar expand-toggle removed.
            The expanded panel content (plan card / invite users / brand
            tree) was a power-user surface that confused solo users. They
            can still reach those via: BrandSwitcherButton (top-left pill)
            → /brands list, S-menu → 帳號設定 / 方案 / Workspace, etc. */}
      </nav>
      <NavItemPicker
        open={pickerOpen}
        en={isEn}
        brandName={brandName}
        catalog={catalog.map((c) => ({ id: c.id!, label: c.label, tooltip: c.tooltip, icon: c.icon, kind: c.kind, custom: customChannels.some((cc) => cc.id === c.id) }))}
        presets={(presetsQ.data as ChannelPresetLite[] | null) ?? []}
        createdPresets={customChannels.map((c) => c.preset).filter(Boolean) as string[]}
        onCreateChannel={onCreateChannel}
        onRemoveChannel={onRemoveChannel}
        onRenameChannel={onRenameChannel}
        selected={userNavItems}
        saving={saveNav?.isPending}
        onClose={() => setPickerOpen(false)}
        onSave={(ids) => { if (scope.brandId) saveNav?.mutate?.({ brandId: scope.brandId, items: ids }); }}
      />

      {/* Bottom: lang toggle + bell + avatar */}
      <div style={{ flexShrink: 0, paddingBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>

        {/* ── Language toggle — always visible ── */}
        <Tooltip content={isEn ? "Switch to 繁體中文" : "Switch to English"} placement="right">
          <button
            onClick={() => setLang(isEn ? "zh-TW" : "en")}
            aria-label={isEn ? "Switch language" : "切換語言"}
            style={{
              width: 48, height: 22, borderRadius: 11,
              border: "1.5px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              padding: 0, overflow: "hidden",
              transition: "border-color 0.15s, background 0.15s",
              position: "relative",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#18181b";
              e.currentTarget.style.background = "#f4f4f5";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.background = "#f9fafb";
            }}
          >
            {/* Sliding active indicator */}
            <span style={{
              position: "absolute",
              left: isEn ? "auto" : 2,
              right: isEn ? 2 : "auto",
              top: 2, width: 20, height: 16, borderRadius: 8,
              background: "#18181b",
              transition: "left 0.18s, right 0.18s",
              zIndex: 0,
            }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.02em", color: isEn ? "#9ca3af" : "#fff", zIndex: 1, width: 22, textAlign: "center", position: "relative" }}>中</span>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.02em", color: isEn ? "#fff" : "#9ca3af", zIndex: 1, width: 22, textAlign: "center", position: "relative" }}>EN</span>
          </button>
        </Tooltip>

        {/* Bell with badge */}
        <Tooltip content={isEn ? "Notifications" : "通知"} placement="right">
          <button
            onClick={onNotifToggle}
            aria-label={isEn ? "Notifications" : "通知"}
            style={{
              position: "relative", width: 36, height: 36, borderRadius: "50%", border: "none",
              background: notifOpen ? "#f4f4f5" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: notifOpen ? "#18181b" : "#9ca3af", cursor: "pointer",
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={e => {
              if (!notifOpen) { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#374151"; }
            }}
            onMouseLeave={e => {
              if (!notifOpen) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; }
            }}
          >
            <FontAwesomeIcon icon={faBell} />
            {(notifUnread ?? 0) > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
                background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px", border: "1.5px solid white", pointerEvents: "none",
              }}>{(notifUnread ?? 0) > 9 ? "9+" : String(notifUnread)}</span>
            )}
          </button>
        </Tooltip>

        {/* Avatar — opens AccountPopup */}
        <div ref={avatarRef} style={{ position: "relative" }}>
          <button
            onClick={() => setAvatarOpen((v) => !v)}
            aria-label={isEn ? "Account" : "帳號"}
            style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "none", padding: 0, cursor: "pointer" }}
          >
            <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold text-sm" }} />
          </button>
          {avatarOpen && (
            <>
              <div onClick={() => setAvatarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
              <AccountPopup
                scope={scope}
                setScope={setScope}
                onLogout={onLogout}
                onClose={() => setAvatarOpen(false)}
                onOpenSupport={onOpenSupport}
                brands={brands}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

export function IconNavLink({ item, active, onClick, meter, badge, badgeTip, en }: {
  item: NavItem; active: boolean; onClick: () => void;
  meter?: { done: number; total: number }; badge?: number; en?: boolean;
  /** 數字的意思不是「這週待寫篇數」時（例如品牌圖示上的未讀情報數），用這句當說明。 */
  badgeTip?: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [tooltipTop, setTooltipTop] = React.useState(0);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const short = item.short ?? item.label;
  const tip = meter
    ? `${item.label}${en ? ` · ${meter.done} of ${meter.total} written` : `・已寫 ${meter.done}／排定 ${meter.total} 篇`}`
    : badge
      ? badgeTip ? `${item.label}・${badgeTip}` : `${item.label}${en ? ` · ${badge} to write this week` : `・這週還有 ${badge} 篇沒寫`}`
      : item.label;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        aria-label={tip}
        style={{
          width: "100%", padding: "3px 0", margin: 0,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          background: "none", border: "none", cursor: "pointer",
          color: active ? SOWORK_ORANGE_TEXT : "#6b7280",
        }}
        onMouseEnter={() => {
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipTop(rect.top + rect.height / 2);
          }
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{
          width: 40, height: 32, borderRadius: 10, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
          background: active ? SOWORK_ORANGE : hovered ? "rgba(0,0,0,0.06)" : "transparent",
          color: active ? "#fff" : "#27272a",
          transition: "background 0.12s, color 0.12s",
        }}>
          {item.icon}
          {item.alert && (
            <span aria-label={item.alert === "over" ? "full" : item.alert === "review" ? "ready to confirm" : "almost full"} style={{
              position: "absolute", top: -2, right: -3, width: 8, height: 8, borderRadius: 999,
              background: item.alert === "over" ? "#dc2626" : item.alert === "review" ? "#F37E4A" : "#d97706", boxShadow: "0 0 0 2px #fff",
            }} />
          )}
          {!!badge && badge > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8,
              background: "#fff", border: "1px solid #D4D4D4", color: "#18181b",
              fontSize: 10, fontWeight: 600, lineHeight: "14px", textAlign: "center",
            }}>{badge > 99 ? "99+" : badge}</span>
          )}
        </span>
        <span style={{
          fontSize: 11, lineHeight: "13px", fontWeight: active ? 600 : 500, maxWidth: 60,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{short}</span>
        {meter && (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ width: 36, height: 3, borderRadius: 2, background: "#E4E4E7", overflow: "hidden" }}>
              <span style={{
                display: "block", height: 3, borderRadius: 2, background: "#18181b",
                width: meter.total > 0 ? `${Math.round((meter.done / meter.total) * 100)}%` : 0,
              }} />
            </span>
            <span style={{ fontSize: 10, lineHeight: "12px", color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
              {meter.total > 0 ? `${meter.done}/${meter.total}` : (en ? "Empty" : "未排")}
            </span>
          </span>
        )}
      </button>
      {/* Hover tooltip — rendered via portal so it escapes any overflow:hidden container */}
      {hovered && createPortal(
        <div style={{
          position: "fixed",
          left: ICON_W + 10,
          top: tooltipTop,
          transform: "translateY(-50%)",
          background: "#1f2937",
          color: "white",
          fontSize: 12,
          fontWeight: 500,
          padding: "5px 12px",
          borderRadius: 7,
          pointerEvents: "none",
          zIndex: 9999,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          letterSpacing: "0.01em",
        }}>
          {tip}
        </div>,
        document.body
      )}
    </>
  );
}

export function AccountPopup({ onLogout, onClose, onOpenSupport }: {
  onLogout: () => void;
  onClose: () => void;
  onOpenSupport?: () => void;
  scope?: ScopeState;
  setScope?: (s: ScopeState) => void;
  brands?: any[];
}) {
  // 2026-05-08 (CJ): all menu items previously had `action: () => {}` —
  // dead buttons. Wired to real handlers / external links / coming-soon
  // toasts so trial users don't hit silent no-ops.
  const navigate = useNavigate();
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const isMobile = useIsMobile();
  // 2026-05-12 Phase 0 i18n: language toggle in S-menu
  const { lang, setLang } = useLang();

  // 2026-05-08: real user info via REST /api/auth/me (auth uses Express,
  // not trpc — same endpoint RequireAuthV2 hits).
  const [me, setMe] = React.useState<{ name?: string; email?: string } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await fetchAuthMe();
        if (!d || cancelled) return;
        if (!cancelled) setMe(d?.user ?? null);
      } catch {/* silent */}
    })();
    return () => { cancelled = true; };
  }, []);
  const userName = me?.name ?? (lang === "en" ? "User" : "使用者");
  const userEmail = me?.email ?? "—";
  const isEn = lang === "en";

  // Real wallet balance for the menu badge
  const balanceQuery = (trpc as any).credits?.getBalance?.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const totalCredits = (balanceQuery?.data as any)?.totalAvailable ?? null;

  // 2026-09-07 待審數量，給「審核佇列」那一項的紅點。沒有它主管不知道有東西
  // 在等——審核工作流的整個價值就是有人會看到。
  const pendingReviewQ = (trpc as any).review?.pendingCount?.useQuery
    ? (trpc as any).review.pendingCount.useQuery(undefined, { refetchInterval: 60_000 })
    : { data: 0 };
  const pendingReviews = Number((pendingReviewQ as any)?.data ?? 0);

  // 2026-05-12 (CJ「通盤檢查每個 S 按鈕選項都要有地方去」):
  // 全部 7 項本來有 4 個是死按鈕（即將推出 toast / modal）。重整後每個都有
  // 真實的地方去，並補上「連結社群帳號」「我的成就」「客服」三個原本沒入口
  // 的功能。
  const menuItems = [
    {
      icon: faGear, label: isEn ? "Account settings" : "帳號設定", arrow: true, badge: null, danger: false,
      // 真實的帳號設定頁（電子郵件 / 密碼 / 訂閱 / 統編 / 帳號刪除）
      action: () => { navigate("/settings/account"); onClose(); },
    },
    {
      icon: faShareNodes, label: isEn ? "Brand & social connections" : "品牌與社群連結", arrow: true, badge: null, danger: false,
      // 連結社群帳號（FB OAuth / IG / LinkedIn）住在每個品牌的 publish tab。
      // 從這裡去品牌管理頁（grid），點任何品牌 → 設定 → 發布即可連結。
      action: () => { navigate("/brands?all=1"); onClose(); },
    },
    {
      icon: faBriefcase, label: isEn ? "Plans & pricing" : "方案和定價", arrow: true, badge: null, danger: false,
      // 已有 /pricing 路由（4 個 tier），不再開 modal。
      action: () => { navigate("/pricing"); onClose(); },
    },
    {
      // 2026-05-12 Phase 0 i18n: language toggle. Tapping flips between
      // zh-TW and en (no separate dropdown — keeps S-menu compact).
      icon: faLanguage,
      label: lang === "en" ? "Language · English" : "語系 · 繁體中文",
      arrow: true, badge: null, danger: false,
      action: () => { setLang(lang === "en" ? "zh-TW" : "en"); },
    },
    // 2026-05-12 (CJ「先移除 agency 邀請團隊的設計」) 曾移除此項，當時註明
    // 「re-add this entry when agency tier launches」。2026-09-06 專業版 5 席
    // 上線＝那個時機：審核工作流要求產出者與放行者分開，管理者必須有地方
    // 把人加進來。
    {
      icon: faUsers, label: isEn ? "Team & permissions" : "成員與權限", arrow: true, badge: null, danger: false,
      action: () => { navigate("/settings/workspace"); onClose(); },
    },
    {
      // 2026-09-07：審核佇列本來只能從某一則產出頁的送審列點進去，主管找不到。
      icon: ICON.review, label: isEn ? "Review queue" : "審核佇列", arrow: true,
      badge: pendingReviews > 0 ? String(pendingReviews) : null, danger: false,
      action: () => { navigate("/review"); onClose(); },
    },
    {
      icon: faCircleInfo, label: isEn ? "Contact support" : "聯絡客服", arrow: false, badge: null, danger: false,
      // 2026-05-14 (CJ「聯絡客服點擊無反應」): open the Mia support drawer
      // instead of opening the user's mail client. Mailto kept as a
      // fallback if the drawer prop isn't wired (defensive).
      action: () => {
        onClose();
        if (onOpenSupport) {
          onOpenSupport();
        } else {
          window.location.href = "mailto:sowork@sowork.ai?subject=onBrand%20Studio%20%E6%94%AF%E6%8F%B4";
        }
      },
    },
    {
      icon: faRightFromBracket, label: isEn ? "Log out" : "登出", arrow: false, badge: null, danger: true,
      action: onLogout,
    },
  ];

  return (
    <div style={{
      position: "fixed", left: ICON_W + 8, bottom: 12, zIndex: 50,
      display: "flex", alignItems: "flex-end", gap: 8,
    }}>
      {/* Pricing modal mounted at root so it overlays everything */}
      <PricingInfoModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />

      {/* ── Main card ── */}
      <div style={{
        // Mobile: 360px from x=78 overflows a 375px screen.
        width: isMobile ? "calc(100vw - 90px)" : 360,
        maxWidth: "calc(100vw - 90px)",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        animation: "notifPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
        transformOrigin: "bottom left",
      }}>

        {/* ① 帳號 — 2026-05-08: real user data from /api/auth/me, no
            sub-panel toggle (was fake hardcoded list of accounts). */}
        <div style={{ padding: "8px 8px 4px" }}>
          <SectionLabel>{isEn ? "Account" : "帳號"}</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px" }}>
            <Avatar
              name={userName.slice(0, 1).toUpperCase()}
              size="md" radius="full" color="primary"
              classNames={{ name: "font-bold" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userName}
              </p>
              <p style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        <Divider />

        {/* ② Credits 餘額 — real wallet data; clicking opens 方案和定價 */}
        {totalCredits != null && (
          <>
            <div style={{ padding: "4px 8px" }}>
              <SectionLabel>{isEn ? "Credits" : "點數"}</SectionLabel>
              <PopupRow onClick={() => setPricingOpen(true)}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: "#171717",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff",
                }}>
                  <FontAwesomeIcon icon={faBriefcase} style={{ fontSize: 14 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                    {Number(totalCredits).toLocaleString()} credits
                  </p>
                </div>
                <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 12, color: "#9ca3af" }} />
              </PopupRow>
            </div>
            <Divider />
          </>
        )}

        {/* ③ Menu */}
        <div style={{ padding: "4px 8px 8px" }}>
          {menuItems.map(item => (
            <PopupRow key={item.label} onClick={item.action}>
              <span style={{ width: 22, display: "flex", justifyContent: "center", color: item.danger ? "#ef4444" : "#6b7280", fontSize: 15 }}>
                <FontAwesomeIcon icon={item.icon} />
              </span>
              <span style={{ flex: 1, fontSize: 14, color: item.danger ? "#ef4444" : "#111827", fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
                {item.label}
                {item.badge && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: "#18181b",
                    background: "#f4f4f5", borderRadius: 4, padding: "1px 5px",
                  }}>{item.badge}</span>
                )}
              </span>
              {item.arrow && <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 12, color: "#9ca3af" }} />}
            </PopupRow>
          ))}
        </div>
      </div>

      {/* 2026-05-08: removed sub-panel (was fake hardcoded account/team
          lists). Real account info now lives directly in the main card. */}
    </div>
  );
}
