/**
 * ShellLayout — Canva-faithful two-layer sidebar.
 *
 * ARCHITECTURE (matches Canva exactly):
 *   Layer 1 — IconBar  (70px, always fixed, icons never move)
 *   Layer 2 — SlidePanel (210px, slides in/out from left:70px)
 *
 * Content area paddingLeft = 70px always (collapsed) or 280px (expanded).
 */
import { strategyRailTarget, strategyRailActiveCat } from "./strategyRail";
import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useScopeState } from "../../platform/components/ScopeBar";
import PositioningNotificationCenter from "../../platform/components/PositioningNotificationCenter";
import ScopeSwitchOverlay from "../../platform/components/ScopeSwitchOverlay";
import TrialCountdownBar from "../../platform/components/TrialCountdownBar";
// 2026-05-11 (CJ「節慶日曆 + 自動提醒」)
import SupportDrawer from "../../platform/components/SupportDrawer";
// 2026-09-23（CJ「在每一頁派一個常駐的顧問…我喜歡在右上方的位置」）：
// 跟 Mia（客服，右下角）刻意分開的第二個全域常駐入口。
import StrategyDirectorDrawer from "../../strategy/components/director/StrategyDirectorDrawer";
import StrategyMonitorNotice from "../../strategy/components/director/StrategyMonitorNotice";
// 2026-06-12 (CJ「Mia 細緻化 + 不要自動跳出」): unread-nudge state lives in
// sessionStorage; this hook surfaces the count for the avatar badge and
// the drain function for the drawer.
import { useUnreadNudges, fireNudge } from "../../platform/components/mia/miaNudges";
import type { QueuedNudge } from "../../platform/components/mia/miaNudges";
import { useLang } from "../../../lib/i18n";
import { fetchAuthMe, clearAuthMeCache } from "../../../lib/authMe";
import { ICON_W } from "./shellShared";
import { IconBar } from "./IconBar";
import { BrandHierarchyPill } from "./BrandHierarchyPill";
import { readLastSeen, NotifPanel } from "./NotifPanel";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

   // icon bar — never changes

/* ─────────────────────────── Nav items ─────────────────────────── */

/* ─────────────────────────── Root layout ─────────────────────────── */

export default function ShellLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { t, lang } = useLang();

  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false });
  const brands = (brandsQuery.data as any[]) ?? [];
  // 2026-05-09 (CJ): expose loading state so child pages can avoid
  // premature 'no brands' redirects (was causing reload-from-anywhere
  // to bounce to /brands).
  const brandsLoaded = brandsQuery.isFetched;

  const [brandId, setBrandIdState] = React.useState<number | null>(() => {
    try { return Number(localStorage.getItem("sowork.selectedBrandId")) || null; }
    catch { return null; }
  });
  const setBrandId = (id: number | null) => {
    setBrandIdState(id);
    try {
      if (id) localStorage.setItem("sowork.selectedBrandId", String(id));
      else localStorage.removeItem("sowork.selectedBrandId");
    } catch {}
  };
  React.useEffect(() => {
    if (!brandId && brands.length > 0) setBrandId(brands[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands.length]);

  const [scope, setScope] = useScopeState();
  React.useEffect(() => {
    if (scope.brandId && scope.brandId !== brandId) setBrandId(scope.brandId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.brandId]);
  // 2026-07-20 (CJ「直接以網址列導覽 /tasks/fb?b=XXXX 時品牌情境遺失，
  // 顯示選擇品牌，需手動重選」): recover from a scope brandId that isn't in
  // this account's brand list (cross-account shared link, stale/mistyped id,
  // deleted brand). Previously the pill showed 選擇品牌 forever and every
  // brand-gated query sat dead because the auto-pick effect only fires when
  // brandId is NULL. Once the list is loaded, snap to the first valid brand
  // (updates URL + both storages via setScope).
  React.useEffect(() => {
    if (!brandsLoaded || brands.length === 0) return;
    if (scope.brandId && !brands.some((b: any) => b.id === scope.brandId)) {
      setScope({ brandId: brands[0].id, productId: null, eventId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandsLoaded, brands.length, scope.brandId]);

  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem("sowork.sidebar") !== "expanded"; }
    catch { return true; }
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sowork.sidebar", next ? "collapsed" : "expanded"); } catch {}
      return next;
    });
  };
  // 2026-05-14: '[' shortcut removed — sidebar is permanent.

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    clearAuthMeCache();
    window.location.href = "/auth/login";
  };

  const [notifOpen, setNotifOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await fetchAuthMe();
        if (!cancelled) setCurrentUserEmail(String(d?.user?.email ?? "").toLowerCase());
      } catch { if (!cancelled) setCurrentUserEmail(null); }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2026-06-12 (CJ「Mia 細緻化 + 不要自動跳出」): unread-nudge subscription.
  // - Nudges are queued in sessionStorage by fireNudge() calls from any page
  // - Avatar shows an unread badge with the count
  // - Clicking the avatar opens the drawer, which drains the queue and
  //   renders pending nudges as Mia messages
  // - Auto-open behaviour intentionally removed (see CJ direction)
  const { unreadCount: miaUnread, drain: drainMiaNudges } = useUnreadNudges();
  const [drainedNudges, setDrainedNudges] = React.useState<QueuedNudge[]>([]);

  // Legacy adapter: the old `mia:nudge` event (raw message) still works for
  // any page we haven't migrated yet — it routes through fireNudge with a
  // synthetic ad-hoc ID so the new pipeline owns rendering.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined;
      if (!detail?.message) return;
      // Synthetic id keyed on payload so the same message doesn't double-fire
      const synthId = `legacy.${detail.message.slice(0, 24).replace(/\W+/g, "_")}`;
      // We're not in the catalog, so write directly to the queue via a
      // minimal shim. We import fireNudge but it requires a catalog entry,
      // so instead push straight to sessionStorage and emit the change event.
      try {
        const key = "mia:nudge:queue";
        const existing = JSON.parse(sessionStorage.getItem(key) || "[]");
        existing.push({
          id: synthId,
          message: detail.message,
          firedAt: new Date().toISOString(),
        });
        sessionStorage.setItem(key, JSON.stringify(existing));
        window.dispatchEvent(new CustomEvent("mia:nudge:changed"));
      } catch { /* swallow */ }
    };
    window.addEventListener("mia:nudge", handler);
    return () => window.removeEventListener("mia:nudge", handler);
    // fireNudge is intentionally not deps — it's a stable module-level fn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire a one-time greeting on first login so the user understands what
  // the avatar badge means (this is itself dedupe-once-per-session).
  React.useEffect(() => {
    fireNudge("onboarding.first_login");
  }, []);
  // 2026-05-13: badge count comes from the same trpc query as the panel.
  // Polled every 60s + when the user opens/closes the panel.
  const notifLastSeen = readLastSeen();
  const notifCountQ = (trpc as any).notifications?.list?.useQuery(
    { limit: 20, lastSeenIso: notifLastSeen ?? undefined, lang },
    { refetchOnWindowFocus: false, refetchInterval: 60_000 },
  );
  const notifUnread: number = notifCountQ?.data?.unreadCount ?? 0;
  // 2026-05-14 (CJ「歷史任務當 tile 更一致」): collapsed the entire
  // expand-panel concept. Shell is now just the 70px icon bar; recent
  // runs / projects-filters / calendar-tools live as in-page tiles
  // (RecentRunsTile etc.) inside their respective pages. Eliminates
  // sidebar-open/closed visual jumps and the per-route panel-content
  // routing logic that was building up.
  const contentLeft = ICON_W;

  return (
    <div className="min-h-screen" style={{ background: "#fafafa" }}>

      {/* Layer 1: Icon bar — ALWAYS 70px, NEVER moves */}
      <IconBar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        activeCat={strategyRailActiveCat(loc.search)}
        onNavigate={(to) => {
          // 2026-08-20 策略 rail: entries carry only `?cat=`; the active
          // brand/product/event ids are injected here so the rail definition
          // stays scope-free and the ScopeBar doesn't reset on navigation.
          //
          // 2026-08-20 (Codex review, PR #118): product/event scope must be
          // read from the CURRENT URL, not from `scope` (useScopeState()) —
          // that hook's productId/eventId are always null (vestigial in its
          // returned shape; BrandsPage reads `p`/`e` directly off the URL
          // search params instead). Using `scope` here silently dropped the
          // active product/event and bounced the editor back to brand-level
          // content on every strategy-rail click.
          //
          // 2026-09-30（CJ「我按了品牌以後，反而出現活動定位」）：p／e 不再一律帶著走，
          // 規則在 strategyRail.ts（只有「文字」保留產品／活動）。
          if (to.startsWith("/brands/edit?cat=")) {
            const cat = to.split("cat=")[1]!;
            navigate(strategyRailTarget(cat, loc.search, scope.brandId ?? brands[0]?.id));
            return;
          }
          // 2026-05-16 (CJ「按下左側品牌功能時，總會先出現空白畫面」):
          // /brands (BrandsManagePage) immediately render-redirects into
          // /brands/edit when a brand is in scope — that double hop +
          // cold mount is the blank flash. When a brand is already
          // active, jump straight to the editor and skip the bounce.
          if (to === "/brands" && scope.brandId) {
            // 2026-05-27 (CJ「品牌大腦跳回 SoWork」): preserve product/event
            // scope params so the ScopeBar doesn't reset on navigation.
            let url = `/brands/edit?b=${scope.brandId}`;
            if (scope.productId) url += `&p=${scope.productId}`;
            if (scope.eventId)   url += `&e=${scope.eventId}`;
            navigate(url);
            return;
          }
          // 2026-05-30 (CJ「modal 精簡」): legacy /brands/settings opens
          // settings modal on platform-auth tab (most useful entry point).
          if (to === "/brands/settings") {
            const bid = scope.brandId ?? brands[0]?.id;
            const url = bid
              ? `/brands/edit?b=${bid}&tab=publish`
              : `/brands/edit?tab=publish`;
            navigate(url);
            return;
          }
          navigate(to);
        }}
        scope={scope}
        setScope={setScope}
        onLogout={handleLogout}
        notifOpen={notifOpen}
        onNotifToggle={() => setNotifOpen((v) => !v)}
        notifUnread={notifUnread}
        onOpenSupport={() => setSupportOpen(true)}
        brands={brands}
        userEmail={currentUserEmail}
      />

      {/* 2026-05-14: SlidePanel removed. Content lives as in-page tiles
          (RecentRunsTile etc) rather than off-canvas. SlidePanel + its
          PanelRow / NavItemRow helpers retained below for future re-use
          but not mounted. */}
      {/* Backdrop kept disabled — collapsed is now permanent */}
      {false && !collapsed && (
        <div
          onClick={toggleCollapsed}
          style={{ position: "fixed", inset: 0, zIndex: 28, background: "rgba(0,0,0,0.06)" }}
        />
      )}

      {/* Notification popup — floating card near bell */}
      {notifOpen && (
        <>
          <div
            onClick={() => setNotifOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 44 }}
          />
          <NotifPanel onClose={() => setNotifOpen(false)} />
        </>
      )}

      {/* 2026-05-14 (CJ「右上方放品牌大腦」): moved from top-left to top-right.
          Rationale: for Solo users (1 brand) the pill is rarely a switcher and
          mostly a status indicator — putting it with notifications / avatar
          (right-side "personal state" zone) is the right mental model. The
          colour-tinted letter monogram is preserved for brand identification;
          the panel below it carries the 「品牌大腦」 narrative. */}
      <BrandHierarchyPill
        brands={brands}
        scope={scope}
        setScope={setScope}
        onNavigate={(to) => navigate(to)}
      />

      {/* Main content. 2026-05-12 (CJ「header 標題與品牌 bar 重疊」): the
          fixed BrandSwitcher pill (top:10, left:12, width:260, height:44)
          floats over the top of every page. Without a top padding here,
          page content (e.g. RunPage's task title row) is overlapped by
          the pill. 64px clears the pill (10 + 44 + 10 buffer). */}
      <div style={{
        paddingLeft: contentLeft,
        paddingTop: 64,
        transition: "padding-left 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* 2026-05-10 trial countdown bar */}
        <TrialCountdownBar />
        {/* FestivalGlobalNudge removed 2026-06-15 — CJ: banner is distracting
            and the /99s deep-link route returns 404. Festival prep handled
            through normal task picker instead. */}
        <RouteErrorBoundary>
          <Outlet context={{ brandId, setBrandId, brands, brandsLoaded, scope, setScope, userEmail: currentUserEmail }} />
        </RouteErrorBoundary>
        {/* 2026-05-10 global footer w/ legal links — shows on every authenticated page */}
        <footer className="mt-12 pt-6 pb-8 border-t border-neutral-200 text-center text-[12px] text-neutral-400 space-x-3">
          <a href="/terms" className="hover:text-neutral-700">{t("footer_terms")}</a>
          <a href="/privacy" className="hover:text-neutral-700">{t("footer_privacy")}</a>
          <a href="/refund" className="hover:text-neutral-700">{t("footer_refund")}</a>
          <a href="/pricing" className="hover:text-neutral-700">{t("footer_pricing")}</a>
          <a href="/settings/account" className="hover:text-neutral-700">{t("footer_account")}</a>
          <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-700">sowork@sowork.ai</a>
          <span>·</span>
          <span>{lang === "en" ? "© SoWork" : "© SoWork 摘星社群行銷顧問"}</span>
        </footer>
      </div>

      {/* 2026-05-13 (CJ「實作 Layer 2: Mia chat drawer」): Notion-style
          avatar opens an in-page chat drawer (SupportDrawer). Mia is an
          LLM-backed customer success agent with session context. If she
          can't help, "我要找真人 →" inside the drawer opens a ticket.
          2026-09-23（CJ「隱藏起mia」，右下角讓給策略總監）：頭像先隱藏——
          不是刪掉整個客服功能，onOpenSupport 這條次要入口（設定選單裡）
          還在，支援工單後端也沒動，只是拿掉這顆最顯眼的浮動頭像，避免
          跟策略總監在同一個角落搶位置。要恢復就把 false 改回 true。 */}
      {false && (
      <button
        onClick={() => {
          // Drain the queue at open-time so pending nudges render as Mia
          // messages inside the drawer. We snapshot to local state so the
          // drawer (mounted via prop) can iterate it once.
          if (miaUnread > 0) {
            setDrainedNudges(drainMiaNudges());
          }
          setSupportOpen(true);
        }}
        aria-label={lang === "en"
          ? `Open support chat${miaUnread > 0 ? ` (${miaUnread} unread)` : ""}`
          : `打開客服對話${miaUnread > 0 ? `（${miaUnread} 則未讀）` : ""}`}
        title={lang === "en"
          ? (miaUnread > 0 ? `Mia · ${miaUnread} unread tip${miaUnread > 1 ? "s" : ""}` : "Mia · Customer Success")
          : (miaUnread > 0 ? `Mia · ${miaUnread} 則新訊息` : "Mia · 客戶成功經理")}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 50,
          width: 56, height: 56, borderRadius: "50%",
          background: "white",
          boxShadow: "0 8px 24px rgba(24,24,27,0.28), 0 2px 6px rgba(0,0,0,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid rgba(24,24,27,0.18)",
          transition: "transform 0.18s, box-shadow 0.18s",
          // 2026-07-15 (CJ「通知數字有一半被遮住」): overflow:hidden clipped
          // the unread badge (positioned at top:-5/right:-5, outside the
          // circle). Clip the avatar <img> itself instead — badge + ripple
          // must render beyond the button bounds.
          overflow: "visible",
          cursor: "pointer",
          padding: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.06)";
          e.currentTarget.style.boxShadow = "0 12px 32px rgba(24,24,27,0.42), 0 4px 10px rgba(0,0,0,0.10)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(24,24,27,0.28), 0 2px 6px rgba(0,0,0,0.08)";
        }}
      >
        <img
          src="https://api.dicebear.com/7.x/notionists/svg?seed=mia-cs-onbrand&backgroundColor=ede9fe&backgroundType=solid&radius=50"
          alt="Mia · Customer Success"
          style={{ width: "100%", height: "100%", display: "block", borderRadius: "50%" }}
        />
        {/* 2026-06-12: badge UI changes based on unread state.
            - No unread → small green "online" dot (status)
            - Unread → orange-red badge with count (action) + gentle pulse */}
        {miaUnread === 0 ? (
          <span style={{
            position: "absolute", bottom: 4, right: 4,
            width: 12, height: 12, borderRadius: "50%",
            background: "#10b981",
            border: "2px solid white",
          }} />
        ) : (
          /* 2026-06-12 Slack-style red unread:
             - Inner pill: solid red #E01E5A (Slack's exact unread red)
             - Outer halo: same red with fading expanding ring (ripple)
             - Bold white count with tabular nums
             - The whole avatar gets a subtle "wiggle" twice on new arrival
               via the miaAvatarWiggle keyframe (limited iteration count). */
          <>
            <span style={{
              position: "absolute", top: -5, right: -5,
              minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11,
              background: "#E01E5A",
              border: "2px solid white",
              color: "white",
              fontSize: 12, fontWeight: 900, lineHeight: "18px",
              fontVariantNumeric: "tabular-nums",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 3px 10px rgba(224, 30, 90, 0.5)",
              zIndex: 2,
            }}>
              {miaUnread > 9 ? "9+" : miaUnread}
            </span>
            <span aria-hidden style={{
              position: "absolute", top: -5, right: -5,
              width: 22, height: 22, borderRadius: "50%",
              border: "2px solid #E01E5A",
              animation: "miaUnreadRipple 1.8s ease-out infinite",
              zIndex: 1,
              pointerEvents: "none",
            }} />
          </>
        )}
        <style>{`
          @keyframes miaUnreadRipple {
            0%   { transform: scale(1);   opacity: 0.7; }
            70%  { transform: scale(2.2); opacity: 0;   }
            100% { transform: scale(2.2); opacity: 0;   }
          }
        `}</style>
      </button>
      )}
      <SupportDrawer
        open={supportOpen}
        onClose={() => { setSupportOpen(false); setDrainedNudges([]); }}
        scope={scope}
        pendingNudges={drainedNudges}
        onNudgesConsumed={() => setDrainedNudges([])}
      />
      <StrategyDirectorDrawer brandId={brandId} />
      {/* 2026-09-30（CJ「策略監測有新的資料的時候，可以跳出通知」）：全站每一頁都看得到。 */}
      <StrategyMonitorNotice brandId={scope.brandId ?? null} />

      {/* Bottom-left toast feed for background positioning pipeline completions */}
      <PositioningNotificationCenter />

      {/* Centred overlay shown when user switches brand / product / event */}
      <ScopeSwitchOverlay
        scopeKey={`${scope.brandId ?? 0}-${scope.productId ?? 0}-${scope.eventId ?? 0}`}
        scopeName={
          scope.eventId   ? null
          : scope.productId ? null
          : (brands.find((b: any) => b.id === scope.brandId)?.name ?? null)
        }
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LAYER 1 — Icon bar (70px, always fixed, icons NEVER move)
══════════════════════════════════════════════════════════════════ */

/* ── Icon nav link (collapsed icon+label) ── */

 // 橘色文字要夠深才讀得清楚

/* ══════════════════════════════════════════════════════════════════
   LAYER 2 — Slide panel (210px, left:70px, slides in/out)
══════════════════════════════════════════════════════════════════ */

/* ── Shared top buttons: 你的方案 + 邀請使用者 ── */

/* ── Starred items section header ── */

/* ── Slim nav row (icon + label, active highlight) ── */

/* ── Trash button ── */

/* ══════════════════════════════════════════════════════════════════
   SlidePanel — Canva-faithful per-page sidebar content
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   Global scope bar — fixed top-right, always visible across all pages
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   Account popup (S button) — Canva-style with sub-panels
══════════════════════════════════════════════════════════════════ */

/* ── Shared sub-components ── */

/* ══════════════════════════════════════════════════════════════════
   Notification panel
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   Route-level Error Boundary
   ══════════════════════════════════════════════════════════════════
   2026-05-14 (CJ Bug#3「跨頁面的渲染崩潰，重新整理無效」):
   The app-level AppErrorBoundary (AppV2.tsx) replaces the entire UI
   including the shell when ANY page crashes — drastic and disorienting.
   This route-level boundary wraps just the <Outlet />, so a single page
   crash shows a recoverable error card while the sidebar / brand pill /
   navigation stay intact. User can click a different sidebar item and
   continue working without a hard refresh.
   ══════════════════════════════════════════════════════════════════ */
// Detect Vite code-split chunk load failures that happen when a user has a
// stale index.html cached after a new deployment. The fix is a one-time hard
// reload: the browser will fetch the new index.html and all chunk URLs will
// resolve correctly. sessionStorage prevents infinite reload loops.

/* ══════════════════════════════════════════════════════════════════
   Exports
══════════════════════════════════════════════════════════════════ */

