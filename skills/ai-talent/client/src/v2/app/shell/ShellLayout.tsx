/**
 * ShellLayout — Canva-faithful two-layer sidebar.
 *
 * ARCHITECTURE (matches Canva exactly):
 *   Layer 1 — IconBar  (70px, always fixed, icons never move)
 *   Layer 2 — SlidePanel (210px, slides in/out from left:70px)
 *
 * Content area paddingLeft = 70px always (collapsed) or 280px (expanded).
 */
import React from "react";
import { createPortal } from "react-dom";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useScopeState, type ScopeState } from "./ScopeBar";
import AddEntityModal, { type AddEntityTab } from "../../components/AddEntityModal";
import PositioningNotificationCenter from "../../components/PositioningNotificationCenter";
import ScopeSwitchOverlay from "../../components/ScopeSwitchOverlay";
import PricingInfoModal from "../../components/PricingInfoModal";
import TrialCountdownBar from "../../components/TrialCountdownBar";
import WorkspacePill from "../../components/WorkspacePill";
import AchievementUnlockWatcher from "../../components/AchievementUnlockWatcher";
// 2026-05-11 (CJ「節慶日曆 + 自動提醒」)
import SupportDrawer from "../../components/SupportDrawer";
// 2026-06-12 (CJ「Mia 細緻化 + 不要自動跳出」): unread-nudge state lives in
// sessionStorage; this hook surfaces the count for the avatar badge and
// the drain function for the drawer.
import { useUnreadNudges, fireNudge } from "../../components/mia/miaNudges";
import type { QueuedNudge } from "../../components/mia/miaNudges";
import OnBrandLogo from "../../components/OnBrandLogo";
import { showToastGlobal } from "../../../components/ui/Toast";
import { useLang } from "../../../lib/i18n";
import { Avatar, Tooltip } from "@heroui/react";
import { Brain as LucideBrain } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse, faFolderOpen, faUserGroup, faBrain, faWandMagicSparkles, faRocket,
  faMicrophone, faBookBookmark, faEllipsis, faBell, faChessKnight,
  faPlus, faRightFromBracket, faLayerGroup,
  faGear, faClock, faTrash, faXmark, faCheckDouble, faTableColumns,
  faChevronRight, faCheck, faBuilding, faBoxOpen, faCalendarDays,
  faCircleHalfStroke, faCircleInfo, faBorderAll, faDisplay, faBriefcase,
  faShareNodes, faTrophy, faUsers, faLanguage,
  faUser, faPaintBrush, faFont, faMagnifyingGlass,
  faTrademark, faChevronDown, faCrown,
  faEnvelope, faBullhorn, faChartLine, faDatabase,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";

const ICON_W  = 70;   // icon bar — never changes
const PANEL_W = 210;  // slide panel width

// 2026-05-16 (CJ「進行手機版」): the shell had ZERO mobile breakpoints —
// pages were fine, the frame wasn't. Single source of truth for "is
// this a phone-width viewport" so the hardcoded-px fixed elements
// (brand pill / notif panel / trial bar) stop overflowing on ≤640px.
function useIsMobile(maxWidth = 640): boolean {
  const [m, setM] = React.useState(
    typeof window !== "undefined" && window.innerWidth <= maxWidth,
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [maxWidth]);
  return m;
}

/* ─────────────────────────── Nav items ─────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix?: string;
  /** When set, renders as tier-style nav: bold tierBadge replacing icon
   *  + plain subtitle. CJ direction 2026-05-10「30s 取代現有 icon，快寫
   *  在第二列」 */
  tierBadge?: string;
  /** 2026-05-11 — hover tooltip explaining when this tier is for.
   *  Reviewer:「30s / 60s / 99s 的差異我看不清楚」. */
  tooltip?: string;
  /** 2026-08-20 — 策略 rail only. Those entries all live on /brands/edit and
   *  differ only by the `cat` query param, but active-state matching runs on
   *  pathname alone, so every one of them would light up at once. When set,
   *  the item is active iff the current `cat` equals this value. */
  catKey?: string;
}

// 2026-08-20: preview-gate emails for the 策略 (Strategy) workspace — 品牌
// 大腦's tile strip promoted to a left-rail workspace. Kept separate from
// `isPrivate` below (still sowork@sowork.tw-only) because that flag also
// gates the market-intel / performance preview rails, which haven't been
// vetted for accounts outside the sowork.tw team.
// 2026-08-21 (CJ「媽爹講故事的左方 mission rail 也要改成這樣，有個切換按鈕，
// 可以切換策略和內容」): marketing@momdadstory.com added. 名單內的帳號拿到的
// 切換器正好是「策略 + 內容」兩格 —— 市場 / 成效仍留在 isPrivate（sowork.tw）
// 底下，那兩個工作區的頁面本身也還擋著非 sowork.tw 帳號。
const STRATEGY_PREVIEW_EMAILS = [
  "sowork@sowork.tw",
  "vmdirisfamily@gmail.com",
  "marketing@momdadstory.com",
];
// Exported so BrandsPage.tsx's in-page tile strip (hidden once the left rail
// already lists the same 7 sections) can gate on the exact same check —
// two independently-maintained copies of this list is how a user ends up
// with either two switchers or none.
export function isStrategyPreviewEmail(email?: string | null): boolean {
  return STRATEGY_PREVIEW_EMAILS.includes(String(email ?? "").toLowerCase());
}

// 2026-05-26 (CJ「左欄改成平台優先」): replace tier-first nav (30s/60s/99s)
// with platform icons. Users pick the *platform* first; speed is shown as
// a badge on each task card inside the platform page.
// Brand Strategy + Research Analysis removed per CJ direction; Brand Brain kept.
function buildNavItems(lang: "zh-TW" | "en", userEmail?: string | null, currentPath?: string): NavItem[] {
  const en = lang === "en";
  const isPrivate = String(userEmail ?? "").toLowerCase() === "sowork@sowork.tw";
  const isStrategyPreview = isStrategyPreviewEmail(userEmail);

  // In data modes, the main left rail switches meaning. The top-left mode
  // switcher chooses the workspace; this rail only shows functions inside it.
  if (isPrivate && currentPath?.startsWith("/market-intel")) {
    return [
      { to: "/market-intel/overview", label: en ? "Overview" : "總覽", icon: <FontAwesomeIcon icon={faChartLine} />, matchPrefix: "/market-intel/overview", tooltip: en ? "Market overview" : "市場總覽" },
      { to: "/market-intel/listening", label: en ? "Listening" : "輿情", icon: <FontAwesomeIcon icon={faBullhorn} />, matchPrefix: "/market-intel/listening", tooltip: en ? "Social listening" : "輿情監測" },
      { to: "/market-intel/keywords", label: en ? "Keywords" : "關鍵字", icon: <FontAwesomeIcon icon={faMagnifyingGlass} />, matchPrefix: "/market-intel/keywords", tooltip: en ? "Keyword analysis" : "關鍵字分析" },
      { to: "/market-intel/geo", label: "GEO", icon: <FontAwesomeIcon icon={faTrademark} />, matchPrefix: "/market-intel/geo", tooltip: en ? "GEO / SEO visibility" : "GEO / SEO 可見度" },
      { to: "/market-intel/competitors", label: en ? "Competitors" : "競品", icon: <FontAwesomeIcon icon={faDatabase} />, matchPrefix: "/market-intel/competitors", tooltip: en ? "Competitor intelligence" : "競品情報" },
      { to: "/market-intel/opportunity", label: en ? "Opportunity" : "機會", icon: <FontAwesomeIcon icon={faBrain} />, matchPrefix: "/market-intel/opportunity", tooltip: en ? "Opportunity diagnosis" : "機會診斷" },
    ];
  }

  // 2026-08-20 (CJ「參考 DEV 環境，將品牌大腦獨立成一個策略區」): 品牌大腦's
  // own tile strip (定位 / 產品 / 活動 / 文字 / 視覺 / 工具 / 基本資料) is
  // promoted to the left rail as the 策略 workspace. Same sections, same
  // `cat` param, same page — only the entry point moves, so BrandsPage
  // itself needs no change and every existing deep link still works.
  //
  // Brand/product/event scope ids are injected by the nav click handler, so
  // these `to` values deliberately carry only `cat`.
  if (isStrategyPreview && currentPath?.startsWith("/brands")) {
    // Ordered by what the entry IS, not alphabetically: the first three are
    // the three positioning SCOPES — 品牌 / 產品 / 活動 — i.e. "which thing
    // am I positioning". Everything after is brand-level ASSET that supports
    // whichever scope is active.
    return [
      { to: "/brands/edit?cat=positioning", catKey: "positioning", label: en ? "Brand" : "品牌", icon: <FontAwesomeIcon icon={faBrain} />,
        tooltip: en ? "Brand positioning — the locked constitution" : "品牌定位 — 鎖定的品牌憲法" },
      { to: "/brands/edit?cat=products", catKey: "products", label: en ? "Products" : "產品", icon: <FontAwesomeIcon icon={faBoxOpen} />,
        tooltip: en ? "Product cards & positioning" : "產品卡片與定位" },
      { to: "/brands/edit?cat=events", catKey: "events", label: en ? "Campaigns" : "活動", icon: <FontAwesomeIcon icon={faCalendarDays} />,
        tooltip: en ? "Campaign cards & positioning" : "活動卡片與定位" },
      { to: "/brands/edit?cat=copy", catKey: "copy", label: en ? "Copy" : "文字", icon: <FontAwesomeIcon icon={faFont} />,
        tooltip: en ? "Voice, terms, CTA and hook libraries" : "語氣 / 用詞 / CTA / 鉤子庫" },
      { to: "/brands/edit?cat=visual", catKey: "visual", label: en ? "Visual" : "視覺", icon: <FontAwesomeIcon icon={faPaintBrush} />,
        tooltip: en ? "Logo / palette / fonts" : "Logo / 色票 / 字型" },
      { to: "/brands/edit?cat=tools", catKey: "tools", label: en ? "Tools" : "工具", icon: <FontAwesomeIcon icon={faBookBookmark} />,
        tooltip: en ? "Knowledge base / AI prompt library" : "知識庫 / AI 指令庫" },
      { to: "/brands/edit?cat=info", catKey: "info", label: en ? "Info" : "基本資料", icon: <FontAwesomeIcon icon={faCircleInfo} />,
        tooltip: en ? "Name / industry / market" : "名稱 / 產業 / 市場" },
    ];
  }

  if (isPrivate && currentPath?.startsWith("/performance")) {
    return [
      { to: "/performance/overview", label: en ? "Overview" : "總覽", icon: <FontAwesomeIcon icon={faChartLine} />, matchPrefix: "/performance/overview", tooltip: en ? "Cross-platform overview" : "跨平台總覽" },
      { to: "/performance/meta", label: "Meta", icon: <FontAwesomeIcon icon={faFacebookF} />, matchPrefix: "/performance/meta", tooltip: "Meta Ads" },
      { to: "/performance/google", label: "Google", icon: <FontAwesomeIcon icon={faMagnifyingGlass} />, matchPrefix: "/performance/google", tooltip: "Google Ads" },
      { to: "/performance/shopline", label: "SHOPLINE", icon: <FontAwesomeIcon icon={faFolderOpen} />, matchPrefix: "/performance/shopline", tooltip: "SHOPLINE / Ecommerce" },
      { to: "/performance/91app", label: "91APP", icon: <FontAwesomeIcon icon={faFolderOpen} />, matchPrefix: "/performance/91app", tooltip: "91APP / Ecommerce" },
      { to: "/performance/ga", label: "GA", icon: <FontAwesomeIcon icon={faChartLine} />, matchPrefix: "/performance/ga", tooltip: "GA / Website" },
      { to: "/performance/attribution", label: en ? "Attribution" : "歸因", icon: <FontAwesomeIcon icon={faDatabase} />, matchPrefix: "/performance/attribution", tooltip: en ? "Attribution" : "整合歸因" },
    ];
  }

  return [
    // ── Platform tier (primary content creation entry points) ──────────────
    { to: "/tasks/fb",    label: "Facebook",  icon: <FontAwesomeIcon icon={faFacebookF} />,  matchPrefix: "/tasks/fb",
      tooltip: en ? "Facebook posts, ads, stories, live copy" : "Facebook 貼文 / 廣告 / 限時 / 直播文案" },
    { to: "/tasks/ig",    label: "Instagram", icon: <FontAwesomeIcon icon={faInstagram} />,  matchPrefix: "/tasks/ig",
      tooltip: en ? "Instagram captions, Reels, carousel, Stories" : "IG 貼文 / Reels / 輪播 / 限時動態" },
    { to: "/tasks/li",    label: "LinkedIn",  icon: <FontAwesomeIcon icon={faLinkedinIn} />, matchPrefix: "/tasks/li",
      tooltip: en ? "LinkedIn posts, newsletters, thought leadership" : "LinkedIn 貼文 / 電子報 / 思想領袖文章" },
    { to: "/tasks/yt",    label: "YouTube",   icon: <FontAwesomeIcon icon={faYoutube} />,    matchPrefix: "/tasks/yt",
      tooltip: en ? "YouTube titles, descriptions, Shorts scripts" : "YouTube 標題 / SEO 說明 / Shorts 腳本" },
    { to: "/tasks/tt",    label: "TikTok",    icon: <FontAwesomeIcon icon={faTiktok} />,     matchPrefix: "/tasks/tt",
      tooltip: en ? "TikTok hooks, scripts, hashtags, bio" : "TikTok 開場鉤子 / 腳本 / 主題標籤" },
    { to: "/tasks/email", label: en ? "Email" : "電子報", icon: <FontAwesomeIcon icon={faEnvelope} />, matchPrefix: "/tasks/email",
      tooltip: en ? "Email newsletters, welcome series, promo emails" : "電子報 / 歡迎信 / 促銷郵件序列" },
    { to: "/tasks/pr",    label: en ? "PR" : "新聞稿",   icon: <FontAwesomeIcon icon={faBullhorn} />, matchPrefix: "/tasks/pr",
      tooltip: en ? "Press releases, media pitch, CEO quotes, fact sheets" : "新聞稿 / 媒體提案 / CEO 聲明 / 資料頁" },
    // ── Workspace & tools ──────────────────────────────────────────────────
    { to: "/projects",  label: en ? "Projects" : "專案",     icon: <FontAwesomeIcon icon={faFolderOpen} /> },
    { to: "/calendar",  label: en ? "Calendar" : "日曆",     icon: <FontAwesomeIcon icon={faCalendarDays} />,
      tooltip: en ? "Calendar view — all scheduled and published posts" : "月曆視圖 — 已排程 + 已發布內容" },
    { to: "/theater",   label: en ? "7-Day Publisher" : "七日發布台",   icon: <FontAwesomeIcon icon={faBookBookmark} /> },
    // 品牌大腦 — keep per CJ direction (no Brand Strategy / Research in nav).
    // 2026-08-20: for the 策略 preview it moved OUT of this rail and became
    // the 策略 workspace (its sections are now rail entries there), so
    // keeping it here too would be a duplicate entry point. Everyone else
    // has no mode switcher, so for them it must stay — removing it outright
    // would strand 品牌大腦 with no way in.
    ...(isStrategyPreview ? [] : [
      { to: "/brands", label: en ? "Brand Brain" : "品牌大腦", icon: <FontAwesomeIcon icon={faBrain} /> },
    ]),
    // 2026-05-30 (CJ「移除連結頁」): "連結" sidebar item removed entirely.
    // Social profile URLs now live in 基本資料 tab; OAuth connections in 平台授權 tab.
    // Both reachable via Brand Brain → settings gear → respective tab.
  ];
}

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
    window.location.href = "/auth/login";
  };

  const [notifOpen, setNotifOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { method: "POST", credentials: "include" });
        const d = r.ok ? await r.json() : null;
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
  const notifCountQ = (trpc as any).notifications?.list?.useQuery?.(
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
    <div className="min-h-screen" style={{ background: "rgb(252,251,254)" }}>

      {/* Layer 1: Icon bar — ALWAYS 70px, NEVER moves */}
      <IconBar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        activeCat={new URLSearchParams(loc.search).get("cat")}
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
          if (to.startsWith("/brands/edit?cat=")) {
            const cat = to.split("cat=")[1]!;
            const bid = scope.brandId ?? brands[0]?.id;
            const currentParams = new URLSearchParams(loc.search);
            const pid = currentParams.get("p");
            const eid = currentParams.get("e");
            const qs: string[] = [];
            if (bid) {
              qs.push(`b=${bid}`);
              if (pid) qs.push(`p=${pid}`);
              if (eid) qs.push(`e=${eid}`);
            }
            qs.push(`cat=${cat}`);
            navigate(`/brands/edit?${qs.join("&")}`);
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
        {/* 2026-05-10 trial countdown bar + achievement watcher (no UI) */}
        <TrialCountdownBar />
        {/* 2026-05-12 workspace switcher pill — disabled with agency invite
            UI per CJ「先移除 agency 邀請團隊的設計」. Re-enable when team/agency
            tier launches.
        <div className="flex justify-end px-4 pt-2">
          <WorkspacePill />
        </div>
        */}
        <AchievementUnlockWatcher />
        {/* FestivalGlobalNudge removed 2026-06-15 — CJ: banner is distracting
            and the /99s deep-link route returns 404. Festival prep handled
            through normal task picker instead. */}
        <RouteErrorBoundary>
          <Outlet context={{ brandId, setBrandId, brands, brandsLoaded, scope, setScope, userEmail: currentUserEmail }} />
        </RouteErrorBoundary>
        {/* 2026-05-10 global footer w/ legal links — shows on every authenticated page */}
        <footer className="mt-12 pt-6 pb-8 border-t border-neutral-200 text-center text-[11px] text-neutral-400 space-x-3">
          <a href="/terms" className="hover:text-neutral-700">{t("footer_terms")}</a>
          <a href="/privacy" className="hover:text-neutral-700">{t("footer_privacy")}</a>
          <a href="/refund" className="hover:text-neutral-700">{t("footer_refund")}</a>
          <a href="/pricing" className="hover:text-neutral-700">{t("footer_pricing")}</a>
          <a href="/settings/account" className="hover:text-neutral-700">{t("footer_account")}</a>
          <a href="/achievements" className="hover:text-neutral-700">{lang === "en" ? "Achievements" : "成就"}</a>
          <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-700">sowork@sowork.ai</a>
          <span>·</span>
          <span>{lang === "en" ? "© SoWork" : "© SoWork 摘星社群行銷顧問"}</span>
        </footer>
      </div>

      {/* 2026-05-13 (CJ「實作 Layer 2: Mia chat drawer」): Notion-style
          avatar opens an in-page chat drawer (SupportDrawer). Mia is an
          LLM-backed customer success agent with session context. If she
          can't help, "我要找真人 →" inside the drawer opens a ticket. */}
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
          boxShadow: "0 8px 24px rgba(124,58,237,0.28), 0 2px 6px rgba(0,0,0,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid rgba(124,58,237,0.18)",
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
          e.currentTarget.style.boxShadow = "0 12px 32px rgba(124,58,237,0.42), 0 4px 10px rgba(0,0,0,0.10)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(124,58,237,0.28), 0 2px 6px rgba(0,0,0,0.08)";
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
              fontSize: 11, fontWeight: 900, lineHeight: "18px",
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
      <SupportDrawer
        open={supportOpen}
        onClose={() => { setSupportOpen(false); setDrainedNudges([]); }}
        scope={scope}
        pendingNudges={drainedNudges}
        onNudgesConsumed={() => setDrainedNudges([])}
      />

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

function IconBar({
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
  const NAV_ITEMS = React.useMemo(() => buildNavItems(lang, userEmail, currentPath), [lang, userEmail, currentPath]);
  const isPrivatePreview = String(userEmail ?? "").toLowerCase() === "sowork@sowork.tw";
  const isStrategyPreview = isStrategyPreviewEmail(userEmail);
  // 2026-08-20: 策略 added as a first-class workspace mode alongside the
  // existing market/content/performance ones. Order follows how the work
  // actually flows — understand the market, decide the strategy, produce
  // the content, read the results.
  const activeWorkspaceMode: "market" | "strategy" | "content" | "performance" =
    currentPath.startsWith("/performance")
      ? "performance"
      : currentPath.startsWith("/market-intel")
        ? "market"
        : currentPath.startsWith("/brands")
          ? "strategy"
          : "content";
  // market/performance stay gated to the sowork.tw preview group (unchanged
  // from before); 策略 additionally opens to isStrategyPreview accounts;
  // 內容 is always available. Dropdown reads fine at 2 items
  // (isStrategyPreview-only accounts) or 4 (sowork.tw).
  const modeOptions = [
    ...(isPrivatePreview ? [{ id: "market" as const, label: isEn ? "Market" : "市場", icon: faMagnifyingGlass, to: "/market-intel/overview", tip: isEn ? "Market intelligence" : "市場情報" }] : []),
    ...(isStrategyPreview ? [{ id: "strategy" as const, label: isEn ? "Strategy" : "策略", icon: faBrain, to: "/brands", tip: isEn ? "Strategy — brand brain" : "策略 — 品牌大腦" }] : []),
    { id: "content" as const, label: isEn ? "Content" : "內容", icon: faWandMagicSparkles, to: "/tasks/fb", tip: isEn ? "Content production" : "內容產出" },
    ...(isPrivatePreview ? [{ id: "performance" as const, label: isEn ? "Results" : "成效", icon: faChartLine, to: "/performance/overview", tip: isEn ? "Performance" : "成效數據" }] : []),
  ];
  const showModeSwitcher = isPrivatePreview || isStrategyPreview;
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
        <Tooltip content={isEn ? "OnBrand AI · home" : "OnBrand AI · 回首頁"} placement="right">
          <span>
            <OnBrandLogo
              glyphOnly
              size={32}
              onClick={() => onNavigate("/tasks/fb")}
              style={{ padding: 4, borderRadius: 8 }}
            />
          </span>
        </Tooltip>
        {/* 2026-06-07 (CJ「全站加 BETA 標」): tiny BETA badge anchored to
            the logo. Tooltip explains we're actively iterating. Visible on
            every page in this layout, no per-page work needed. */}
        <Tooltip
          content={isEn
            ? "We're in beta — features are evolving fast. Feedback welcome via the chat bubble."
            : "我們在 Beta 階段，每天都在優化功能。歡迎透過右下角客服回饋。"}
          placement="right"
        >
          <span style={{
            position: "absolute",
            top: 4, right: 4,
            fontSize: 8, fontWeight: 800, letterSpacing: "0.08em",
            color: "#fff", background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
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
              0%, 82%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
              88%           { box-shadow: 0 0 0 4px rgba(249,115,22,0.18); }
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
                  background: "#F97316", color: "#fff",
                  cursor: "pointer", transition: "filter 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.07)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                <FontAwesomeIcon icon={cur.icon} style={{ fontSize: 15 }} />
                <span style={{ display: "flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.02em" }}>{cur.label}</span>
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
                      background: active ? "#FFF7ED" : "transparent",
                      color: active ? "#C2410C" : "#374151",
                      cursor: "pointer", transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <FontAwesomeIcon icon={opt.icon} style={{ fontSize: 14, width: 16 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 800 : 600 }}>{opt.label}</span>
                    {active && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} />}
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
        {NAV_ITEMS.map((item) => {
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
            : item.to === "/" ? currentPath === "/" : currentPath.startsWith(myPrefix);
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
          return <IconNavLink key={item.to} item={item} active={isActive} onClick={() => onNavigate(item.to)} />;
        })}

        {/* 2026-05-12 (CJ「顯示更多拿掉」): sidebar expand-toggle removed.
            The expanded panel content (plan card / invite users / brand
            tree) was a power-user surface that confused solo users. They
            can still reach those via: BrandSwitcherButton (top-left pill)
            → /brands list, S-menu → 帳號設定 / 方案 / Workspace, etc. */}
      </nav>

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
              e.currentTarget.style.borderColor = "#F97316";
              e.currentTarget.style.background = "#fff7ed";
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
              background: "#F97316",
              transition: "left 0.18s, right 0.18s",
              zIndex: 0,
            }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.02em", color: isEn ? "#9ca3af" : "#fff", zIndex: 1, width: 22, textAlign: "center", position: "relative" }}>中</span>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.02em", color: isEn ? "#fff" : "#9ca3af", zIndex: 1, width: 22, textAlign: "center", position: "relative" }}>EN</span>
          </button>
        </Tooltip>

        {/* Bell with badge */}
        <Tooltip content={isEn ? "Notifications" : "通知"} placement="right">
          <button
            onClick={onNotifToggle}
            aria-label={isEn ? "Notifications" : "通知"}
            style={{
              position: "relative", width: 36, height: 36, borderRadius: "50%", border: "none",
              background: notifOpen ? "#fff7ed" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: notifOpen ? "#F97316" : "#9ca3af", cursor: "pointer",
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
                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
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

/* ── Icon nav link (collapsed icon+label) ── */

/** Hash brand name → deterministic HSL color. Each brand gets a unique
 *  signature color used as the pill background; first-letter stays white.
 *  Uses HSL with controlled lightness/saturation so colors stay readable. */
function brandColor(name: string): { bg: string; bgGradient: string; light: string } {
  if (!name) return { bg: "#7c3aed", bgGradient: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", light: "rgba(124,58,237,0.10)" };
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  const hue = hash % 360;
  // Slight per-name variance to avoid all brands being same saturation
  const sat = 55 + ((hash >> 8) % 20); // 55-75%
  const light = 42 + ((hash >> 16) % 8); // 42-50% — readable on white text
  const bg = `hsl(${hue}, ${sat}%, ${light}%)`;
  const bgDark = `hsl(${hue}, ${sat}%, ${Math.max(28, light - 14)}%)`;
  return {
    bg,
    bgGradient: `linear-gradient(135deg, ${bg} 0%, ${bgDark} 100%)`,
    light: `hsla(${hue}, ${sat}%, ${light}%, 0.10)`,
  };
}

/* ─────────────── Brand Hierarchy Pill (fixed top-left) ───────────────
   Always-expanded horizontal pill showing the active brand → product →
   event hierarchy. Click any segment to open a hierarchical dropdown
   for switching or adding. Replaces the old cramped circle button.

   Layout: positioned absolute at top-left of viewport, width 280px,
   height 44px. Pushes IconBar's first child down via top padding.
*/
function BrandHierarchyPill({
  brands, scope, setScope, onNavigate,
}: {
  brands: any[];
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onNavigate: (to: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [addModal, setAddModal] = React.useState<{ open: boolean; tab: AddEntityTab }>({ open: false, tab: "brand" });
  const { lang } = useLang();
  const isEn = lang === "en";
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Load product / event lists scoped to current brand.
  // NOTE: server exposes `list` (not `listByBrand`) — both accept {brandId}.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const eventsQuery = (trpc as any).event?.list?.useQuery
    ? (trpc as any).event.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const products = (productsQuery.data as any[]) ?? [];
  const events = (eventsQuery.data as any[]) ?? [];

  const activeBrand = brands.find((b: any) => b.id === scope.brandId) ?? null;
  const activeProduct = products.find((p: any) => p.id === scope.productId) ?? null;
  const activeEvent = events.find((e: any) => e.id === scope.eventId) ?? null;

  // Display priority: event > product > brand (most specific scope wins as label)
  const displayName =
    activeEvent?.name ?? activeProduct?.name ?? activeBrand?.name ?? (isEn ? "Pick a brand" : "選擇品牌");
  const displayInitial = (activeBrand?.name ?? "?").charAt(0);
  const activeBrandColor = activeBrand ? brandColor(activeBrand.name) : brandColor("");
  const isMobile = useIsMobile();

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        // 2026-05-14 (CJ「品牌大腦放右上方」): moved from left to right anchor.
        // Sidebar is collapsed icon-only (ICON_W=70px) and doesn't overlap
        // the right side, so no shift tracking needed.
        right: 12,
        top: 10,
        zIndex: 50,
        // Mobile: a fixed 280px pill spans 78% of a 375px screen and
        // covers every page header. Cap to the space left of the 70px
        // rail with a hard max so it never overflows.
        width: isMobile ? "min(220px, calc(100vw - 90px))" : 280,
        transition: "right 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── Pill trigger button ── */}
      {/* Empty state (no brand selected): orange dashed CTA */}
      {/* Active state: Notion-style subtle white pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 8,
          border: activeBrand
            ? (open ? "1px solid #d4d4d4" : "1px solid #e5e7eb")
            : "1.5px dashed #F97316",
          background: activeBrand ? "#fff" : (open ? "#fff7ed" : "#fff"),
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px 0 8px",
          cursor: "pointer",
          boxShadow: activeBrand
            ? (open ? "0 4px 12px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.04)")
            : "0 1px 4px rgba(249,115,22,0.12)",
          transition: "border-color 0.12s, box-shadow 0.12s, background 0.12s",
        }}
        onMouseEnter={e => {
          if (!activeBrand) e.currentTarget.style.background = "#fff7ed";
        }}
        onMouseLeave={e => {
          if (!activeBrand) e.currentTarget.style.background = open ? "#fff7ed" : "#fff";
        }}
      >
        {/* Icon: brand logo / initial / brain / + */}
        <span style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: activeBrand
            ? (activeBrand.logoUrl ? "#fafafa" : brandColor(activeBrand.name).bgGradient)
            : "rgba(249,115,22,0.12)",
          border: activeBrand ? "none" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          color: activeBrand ? "#fff" : "#F97316",
          fontSize: activeBrand ? 11 : 14,
          fontWeight: 700,
        }}>
          {activeBrand?.logoUrl ? (
            <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : activeBrand ? (
            <span>{activeBrand.name.charAt(0).toUpperCase()}</span>
          ) : (
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
          )}
        </span>
        {/* Label */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
          {(activeProduct || activeEvent) && (
            <span style={{
              fontSize: 9, color: "#9ca3af", letterSpacing: "0.3px",
              maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {activeBrand?.name}{activeProduct ? ` › ${activeProduct.name}` : ""}
            </span>
          )}
          <span style={{
            fontSize: 13,
            color: activeBrand ? "#1f2937" : "#F97316",
            fontWeight: activeBrand ? 700 : 600,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </span>
        </div>
        {/* Dropdown chevron */}
        <FontAwesomeIcon
          icon={faChevronDown}
          style={{
            fontSize: 11,
            color: activeBrand ? "#9ca3af" : "#F97316",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {/* Hierarchical popover: Brain summary → Brand → Product → Event */}
      {open && (
        <div
          style={{
            marginTop: 6,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.04)",
            padding: 6,
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {/* 2026-05-14 (CJ「品牌大腦」): brain summary panel at top.
              Positioning is locked (read-only) + accumulated reference
              material counts. No "AI learned X" copy — positioning never
              auto-updates from user behaviour; only user-curated entries
              and AI usage stats are surfaced. */}
          {activeBrand && (
            <BrainSummaryPanel
              brandId={activeBrand.id}
              brandName={activeBrand.name}
              isEn={isEn}
              onClose={() => setOpen(false)}
              onNavigate={onNavigate}
            />
          )}

          {/* ── When no brands: full-width primary CTA at top ── */}
          {brands.length === 0 && (
            <div style={{ padding: "8px 8px 4px" }}>
              <button
                onClick={() => { setAddModal({ open: true, tab: "brand" }); setOpen(false); }}
                style={{
                  width: "100%", padding: "11px 14px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #F97316, #ea580c)",
                  border: "none", cursor: "pointer", color: "#fff",
                  fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 2px 8px rgba(249,115,22,0.30)",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                <FontAwesomeIcon icon={faPlus} />
                {isEn ? "Add your first brand" : "新增你的第一個品牌"}
              </button>
              <p style={{ fontSize: 11, color: "#9ca3af", padding: "8px 4px 0", lineHeight: 1.5 }}>
                {isEn
                  ? "Add a brand to unlock all AI marketing tools."
                  : "新增品牌後，所有 AI 行銷工具將解鎖。"}
              </p>
            </div>
          )}

          {/* BRAND section */}
          {brands.length > 0 && (
          <p style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.5px", padding: "6px 10px 4px", textTransform: "uppercase" }}>
            {isEn ? "Switch brand" : "切換品牌"}
          </p>
          )}
          {brands.length > 0 && brands.map((b: any) => {
            const isActive = b.id === scope.brandId;
            const bColor = brandColor(b.name);
            return (
              <button
                key={b.id}
                onClick={() => {
                  setScope({ brandId: b.id, productId: null, eventId: null });
                  setOpen(false);
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", border: "none", borderRadius: 6,
                  background: isActive ? bColor.light : "transparent",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: bColor.bgGradient,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, overflow: "hidden",
                }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (b.name?.charAt(0) ?? "?")}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </span>
                {isActive && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 10, color: bColor.bg }} />}
              </button>
            );
          })}

          {/* 2026-06-19 Phase 2: product/event pickers removed from the global
              switcher. Brand is the only global scope now; a specific product /
              event is chosen per-task in the task modal, or edited via the
              brand-list page cards (which deep-link to /brands/edit?b=&p= / &e=). */}

          {/* Add new — opens unified modal instead of navigating */}
          {brands.length > 0 && (
          <>
          <div style={{ borderTop: "1px solid #f3f4f6", margin: "6px 0 4px" }} />
          {/* 2026-07-07 (CJ「沒有清楚路徑到『所有品牌』頁」): explicit link to
              the brand-management grid so it's reachable from the always-visible
              top-right pill, not just the editor breadcrumb / settings menu. */}
          <div style={{ borderTop: "1px solid #f3f4f6", margin: "6px 0 4px" }} />
          <div style={{ padding: "0 8px 4px" }}>
            <button
              onClick={() => { onNavigate("/brands?all=1"); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", border: "none", borderRadius: 7,
                background: "transparent", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 12 }}>
                <FontAwesomeIcon icon={faLayerGroup} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#374151" }}>
                {isEn ? "See all brands →" : "查看所有品牌 →"}
              </span>
            </button>
          </div>
          {/* New brand — dashed outline CTA (prominent but not primary) */}
          <div style={{ padding: "4px 8px" }}>
            <button
              onClick={() => { setAddModal({ open: true, tab: "brand" }); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", border: "1.5px dashed #e5e7eb", borderRadius: 7,
                background: "transparent", cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#7C3AED";
                e.currentTarget.style.background = "rgba(124,58,237,0.04)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: "rgba(124,58,237,0.10)", color: "#7C3AED",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
              }}>
                <FontAwesomeIcon icon={faPlus} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#7C3AED" }}>
                {isEn ? "New brand" : "新增品牌"}
              </span>
            </button>
          </div>
          {/* New product / event — smaller secondary row */}
          {([
            { tab: "product" as const, label: isEn ? "New product" : "新增產品",  icon: faBoxOpen,       accent: "#059669" },
            { tab: "event"   as const, label: isEn ? "New event" : "新增活動",    icon: faCalendarDays,  accent: "#F97316" },
          ]).map((opt) => (
            <button
              key={opt.tab}
              onClick={() => { setAddModal({ open: true, tab: opt.tab }); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "5px 18px", border: "none", borderRadius: 6,
                background: "transparent", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: opt.accent, fontSize: 10 }}>
                <FontAwesomeIcon icon={opt.icon} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>{opt.label}</span>
            </button>
          ))}
          </>
          )}
        </div>
      )}
      {/* AddEntityModal — fires on bottom button click; defaults brand for product/event */}
      <AddEntityModal
        isOpen={addModal.open}
        initialTab={addModal.tab}
        defaultBrandId={scope.brandId ?? null}
        onClose={() => setAddModal({ open: false, tab: addModal.tab })}
        onCreated={(kind, id) => {
          if (kind === "brand") setScope({ brandId: id, productId: null, eventId: null });
          else if (kind === "product") setScope({ brandId: scope.brandId ?? null, productId: id, eventId: null });
          else if (kind === "event") setScope({ brandId: scope.brandId ?? null, productId: scope.productId ?? null, eventId: id });
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BrainSummaryPanel — top section of the BrandHierarchyPill dropdown
   ══════════════════════════════════════════════════════════════════
   2026-05-14 (CJ「品牌大腦」):
   Shows the "what's in this brand brain" narrative above the brand
   switcher. Three sub-sections matching the locked-vs-curated mental
   model:
     1. 鎖定憲法 — positioning summary, marked read-only with lock icon.
        Customer service is the only way to change.
     2. 你加進來的 — knowledge / preferred terms / banned terms counts.
        User-curated material, user-controlled.
     3. AI 引用 — usage stats from past 7 days (placeholder copy until
        instrumentation lands; for now reads from output count).
   Uses brand.getBrainSummary if available, falls back to existing brand.get.
   ══════════════════════════════════════════════════════════════════ */
function BrainSummaryPanel({
  brandId, brandName, isEn, onClose, onNavigate,
}: {
  brandId: number;
  brandName: string;
  isEn: boolean;
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  const summaryQ = (trpc as any).brand?.getBrainSummary?.useQuery
    ? (trpc as any).brand.getBrainSummary.useQuery(
        { brandId },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
      )
    : { data: null, isLoading: false };
  const s: any = summaryQ?.data ?? null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ padding: "8px 10px 6px" }}>
      <p style={{
        fontSize: 9, fontWeight: 700, color: "#525252",
        letterSpacing: "0.22em", textTransform: "uppercase",
        marginBottom: 6,
      }}>{title}</p>
      {children}
    </div>
  );

  const Row = ({ label, value, dim }: { label: string; value: string; dim?: boolean }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      fontSize: 12, color: dim ? "#9ca3af" : "#374151", padding: "2px 0",
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: dim ? "#9ca3af" : "#171717" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 4, marginBottom: 4 }}>
      {/* Heading */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 10px 6px",
      }}>
        <LucideBrain size={15} strokeWidth={1.5} color="#171717" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#171717" }}>
          {isEn ? "Brand Brain" : "品牌大腦"} · {brandName}
        </span>
      </div>

      {/* 1. 鎖定憲法 */}
      <Section title={isEn ? "01 · Locked Positioning" : "01 · 鎖定憲法"}>
        <Row
          label={isEn ? "Positioning" : "品牌定位"}
          value={
            s?.positioning?.completedSections != null
              ? `${s.positioning.completedSections}/${s.positioning.totalSections ?? 10} ${s.positioning.isLocked ? "🔒" : ""}`
              : "—"
          }
        />
        {!s?.positioning?.isLocked && (
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
            {isEn
              ? "Not locked yet — complete the positioning flow to lock your brand identity."
              : `尚未鎖定 · 完成 ${s?.positioning?.totalSections ?? 10} 步定位後會自動鎖定`}
          </p>
        )}
      </Section>

      {/* 2. 你加進來的 */}
      <Section title={isEn ? "02 · Your References" : "02 · 你加進來的"}>
        <Row label={isEn ? "Knowledge" : "知識條目"} value={String(s?.knowledge?.count ?? 0)} />
        <Row label={isEn ? "Preferred terms" : "偏好詞"} value={String(s?.preferences?.preferredCount ?? 0)} />
        <Row label={isEn ? "Banned terms" : "禁用詞"} value={String(s?.preferences?.bannedCount ?? 0)} />
        <Row
          label={isEn ? "Visual identity" : "視覺識別"}
          value={s?.visual?.hasLogo ? "✓" : "—"}
          dim={!s?.visual?.hasLogo}
        />
        <Row
          label={isEn ? "Platform binding" : "平台連結"}
          value={
            [s?.connections?.fb && "FB", s?.connections?.ig && "IG"]
              .filter(Boolean).join(" / ") || "—"
          }
          dim={!s?.connections?.fb && !s?.connections?.ig}
        />
      </Section>

      {/* 3. AI 引用 */}
      <Section title={isEn ? "03 · AI Usage (this week)" : "03 · AI 本週引用"}>
        <Row
          label={isEn ? "Outputs produced" : "本週產出"}
          value={String(s?.outputs?.last7DaysCount ?? 0)}
        />
        <Row
          label={isEn ? "Total outputs" : "歷史總產出"}
          value={String(s?.outputs?.totalCount ?? 0)}
        />
        {/* Term-use instrumentation lands in a follow-up — see ROADMAP. */}
      </Section>

      {/* CTA */}
      <div style={{ padding: "4px 10px 8px" }}>
        <button
          onClick={() => {
            onNavigate(`/brands/edit?b=${brandId}`);
            onClose();
          }}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 6,
            border: "1px solid #171717", background: "#171717", color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#262626"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#171717"; }}
        >
          {isEn ? "Open full brain →" : "完整品牌大腦 →"}
        </button>
      </div>
    </div>
  );
}

function BrandSwitcherButton({
  brands, activeBrandId, sidebarCollapsed, onPickBrand, onAddBrand,
}: {
  brands: any[];
  activeBrandId: number | null;
  sidebarCollapsed: boolean;
  onPickBrand: (id: number) => void;
  onAddBrand: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { lang } = useLang();
  const isEn = lang === "en";
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeBrand = brands.find((b: any) => b.id === activeBrandId);
  const initial = activeBrand?.name?.charAt(0) ?? "?";
  const pickBrandLabel = isEn ? "Pick a brand" : "選擇品牌";
  const truncatedName = activeBrand?.name && activeBrand.name.length > 8
    ? activeBrand.name.slice(0, 7) + "…"
    : activeBrand?.name ?? pickBrandLabel;

  return (
    <div ref={ref} style={{ padding: "0 8px 12px", flexShrink: 0, position: "relative" }}>
      <Tooltip content={activeBrand ? (isEn ? `Brand: ${activeBrand.name} (click to switch)` : `品牌：${activeBrand.name}（點擊切換）`) : pickBrandLabel} placement="right">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={isEn ? "Switch brand" : "切換品牌"}
          style={{
            width: "100%", minHeight: 48, borderRadius: 10,
            border: open ? "2px solid #7c3aed" : "1px solid rgba(124,58,237,0.2)",
            background: activeBrand ? "rgba(124,58,237,0.06)" : "rgba(156,163,175,0.08)",
            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
            cursor: "pointer",
            transition: "background 0.1s, border-color 0.1s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(124,58,237,0.10)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = activeBrand ? "rgba(124,58,237,0.06)" : "rgba(156,163,175,0.08)"; }}
        >
          {/* Logo / initial circle */}
          <span style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: activeBrand
              ? "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
              : "linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%)",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800,
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(124,58,237,0.3)",
          }}>
            {activeBrand?.logoUrl ? (
              <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : initial}
          </span>
          {/* Show brand name when sidebar collapsed (icon-only mode hides text) — keep tiny label below logo */}
          {sidebarCollapsed ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
              <span style={{ fontSize: 9, color: "#7c3aed", fontWeight: 700, letterSpacing: "0.5px" }}>{isEn ? "BRAND" : "品牌"}</span>
              <span style={{ fontSize: 11, color: "#1f2937", fontWeight: 600, maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {truncatedName}
              </span>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, display: "block", letterSpacing: "0.5px" }}>{isEn ? "BRAND" : "品牌"}</span>
              <span style={{ fontSize: 13, color: "#1f2937", fontWeight: 700, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeBrand?.name ?? pickBrandLabel}
              </span>
            </div>
          )}
          <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10, color: "#9ca3af", transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }} />
        </button>
      </Tooltip>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: 0,
            zIndex: 50,
            width: 240,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 10px 28px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.04)",
            padding: 6,
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.5px", padding: "6px 10px 4px", textTransform: "uppercase" }}>{isEn ? "Switch brand" : "切換品牌"}</p>
          {brands.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af", padding: "8px 10px" }}>{isEn ? "No brands yet" : "還沒建立品牌"}</p>
          )}
          {brands.map((b: any) => {
            const isActive = b.id === activeBrandId;
            const bInit = b.name?.charAt(0) ?? "?";
            return (
              <button
                key={b.id}
                onClick={() => { onPickBrand(b.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", border: "none", borderRadius: 8,
                  background: isActive ? "rgba(124,58,237,0.08)" : "transparent",
                  cursor: "pointer", textAlign: "left",
                  transition: "background 0.08s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "#171717", // 2026-05-11 (CJ「4A B&W」): was purple gradient
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, overflow: "hidden",
                }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : bInit}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: isActive ? 700 : 500, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </span>
                {isActive && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11, color: "#7c3aed" }} />}
              </button>
            );
          })}
          <div style={{ borderTop: "1px solid #f3f4f6", margin: "6px 0 4px" }} />
          <button
            onClick={() => { onAddBrand(); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", border: "none", borderRadius: 8,
              background: "transparent", cursor: "pointer", textAlign: "left",
              transition: "background 0.08s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: "#f3f4f6", color: "#6b7280",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13,
            }}>
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{isEn ? "Add / manage brands" : "新增品牌 / 管理"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function IconNavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const [tooltipTop, setTooltipTop] = React.useState(0);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        aria-label={item.label}
        style={{
          width: 64, height: 44, margin: "1px auto 0",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: active ? "#F97316" : "#9ca3af",
          transition: "color 0.1s",
          position: "relative",
        }}
        onMouseEnter={e => {
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipTop(rect.top + rect.height / 2);
          }
          setHovered(true);
          if (!active) {
            e.currentTarget.style.color = "#374151";
            const pill = e.currentTarget.querySelector(".nav-pill") as HTMLElement | null;
            if (pill) pill.style.background = "rgba(0,0,0,0.05)";
          }
        }}
        onMouseLeave={e => {
          setHovered(false);
          if (!active) {
            e.currentTarget.style.color = "#9ca3af";
            const pill = e.currentTarget.querySelector(".nav-pill") as HTMLElement | null;
            if (pill) pill.style.background = "transparent";
          }
        }}
      >
        {/* Active/hover pill */}
        <span className="nav-pill" style={{
          position: "absolute", inset: "4px 6px", borderRadius: 10, pointerEvents: "none",
          background: active ? "rgba(249,115,22,0.10)" : "transparent",
          transition: "background 0.1s",
        }} />
        {/* 2026-05-10: tier items render the seconds badge AS the icon.
            2026-05-14 (CJ「收合後 30s/60s/99s 識別度低」): rendered as a
            coloured rounded chip (not bare text) so it reads as a button
            and the tier number stands out. */}
        {item.tierBadge ? (
          <span style={{
            width: 30, height: 22, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em",
            position: "relative",
            color: active ? "white" : "#7C3AED",
            background: active ? "rgb(249,115,22)" : "rgba(124,58,237,0.10)",
            border: active ? "none" : "1px solid rgba(124,58,237,0.20)",
            transition: "background 0.12s, color 0.12s",
          }}>
            {item.tierBadge}
          </span>
        ) : (
          <span style={{
            width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, position: "relative",
          }}>
            {item.icon}
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
          {item.label}
        </div>,
        document.body
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LAYER 2 — Slide panel (210px, left:70px, slides in/out)
══════════════════════════════════════════════════════════════════ */

/* ── Shared top buttons: 你的方案 + 邀請使用者 ── */
function PlanInviteButtons({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  return (
    <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
      {[
        { icon: faCrown, label: isEn ? "Your plan" : "你的方案",   to: "/settings/plan" },
        { icon: faUserGroup, label: isEn ? "Invite people" : "邀請使用者", to: "/settings/team" },
      ].map(({ icon, label, to }) => (
        <button key={label} onClick={() => onNavigate(to)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px", borderRadius: 8,
          border: "1px solid #E9E8E6", background: "white",
          cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151",
          transition: "background 0.1s", textAlign: "left",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#F9F8F6"}
          onMouseLeave={e => e.currentTarget.style.background = "white"}
        >
          <FontAwesomeIcon icon={icon} style={{ fontSize: 12, width: 14, color: "#78716C" }} />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── Starred items section header ── */
function StarredHeader() {
  const { lang } = useLang();
  return (
    <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {lang === "en" ? "Starred items" : "已標記星號的內容"}
      </span>
      <button style={{ width: 18, height: 18, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", color: "#A8A29E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}

/* ── Slim nav row (icon + label, active highlight) ── */
function NavRow({ icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", borderRadius: 8, border: "none",
      background: active ? "#F4F4F5" : "transparent", // 2026-05-11 (B&W): was lavender
      cursor: "pointer", textAlign: "left", transition: "background 0.1s", marginBottom: 1,
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "#EDE9FE" : "transparent"; }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 13, width: 15, flexShrink: 0, color: active ? "#4F46E5" : "#6B7280" }} />
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#4338CA" : "#374151", flex: 1 }}>
        {label}
      </span>
    </button>
  );
}

/* ── Trash button ── */
function TrashButton({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { lang } = useLang();
  return (
    <div style={{ flexShrink: 0, padding: "6px 10px 14px", borderTop: "1px solid #f3f4f6" }}>
      <button onClick={() => onNavigate("/trash")} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 8, border: "none", background: "none",
        fontSize: 13, color: "#6b7280", cursor: "pointer", transition: "background 0.1s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
      >
        <FontAwesomeIcon icon={faTrash} style={{ fontSize: 13, width: 15 }} />
        {lang === "en" ? "Trash" : "垃圾桶"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SlidePanel — Canva-faithful per-page sidebar content
══════════════════════════════════════════════════════════════════ */
function SlidePanel({
  open, onClose, brands, brandId, setBrandId, scope, setScope, onNavigate, currentPath,
}: {
  open: boolean;
  onClose: () => void;
  brands: any[];
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onNavigate: (to: string) => void;
  currentPath: string;
}) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const isHome      = currentPath === "/";
  const isProjects  = currentPath.startsWith("/projects");
  // isTemplates retired 2026-05-14 — /templates route deleted.
  const isBrands    = currentPath.startsWith("/brands");
  // 2026-05-09 (CJ direction): on tier pages (/30s /60s /99s) AND
  // /run/:outputId, the sidebar shows the brand's recent task runs
  // in this tier. Click a row → /run/:outputId.
  // 2026-05-17: 100s→99s rename is internal now. /100s still redirects
  // to /99s but match the legacy token too in case a stale path lands
  // here; normalize "100s"→"99s" (the value the DB stores) before query.
  const tierMatch = currentPath.match(/^\/(30s|60s|99s|100s)\b/);
  const runMatch = currentPath.match(/^\/run\/(\d+)/);
  const isTier = !!tierMatch;
  const isRun = !!runMatch;
  const rawTier = tierMatch?.[1];
  const currentTier = (rawTier === "100s" ? "99s" : rawTier) as ("30s"|"60s"|"99s"|undefined);

  // For /run/:id pages, fetch the run to get its tier (so sidebar shows
  // the same tier's history). Cheap — already cached if user came from
  // RunPage navigation.
  const runOutputId = runMatch ? Number(runMatch[1]) : null;
  const runQuery = (trpc as any).output?.getById?.useQuery
    ? (trpc as any).output.getById.useQuery(
        { id: runOutputId ?? 0 },
        { enabled: isRun && !!runOutputId, staleTime: 60_000 },
      )
    : { data: null };
  const inferredTier = runQuery.data?.mission?.tier as ("30s"|"60s"|"99s"|undefined);
  const inferredBrandId = runQuery.data?.mission?.brandId ?? null;

  // Effective context: tier page uses URL tier + shell brand;
  // run page uses run's tier + run's brand
  const effTier = currentTier ?? inferredTier;
  const effBrandId = isRun ? inferredBrandId : brandId;
  const showTierHistory = (isTier || isRun) && !!effTier;

  const recentRunsQuery = (trpc as any).output?.recent?.useQuery
    ? (trpc as any).output.recent.useQuery(
        { brandId: effBrandId, tier: effTier, limit: 25 },
        { enabled: showTierHistory && effBrandId != null, staleTime: 30_000 },
      )
    : { data: [] };
  const recentRuns: any[] = (recentRunsQuery.data as any[]) ?? [];

  // URL-based sub-nav detection
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const activeSubNav = searchParams.get("sub") ?? "all";

  // Recent missions (used by Home + Projects)
  const recentQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const recentMissions: any[] = ((recentQuery.data as any[]) ?? []).slice(0, 6);

  // Brand dropdown state (used by Brands panel)
  const [brandDropOpen, setBrandDropOpen] = React.useState(false);
  const [brandSearch, setBrandSearch] = React.useState("");
  const activeBrand = brands.find((b: any) => b.id === brandId);

  return (
    <div style={{
      position: "fixed", left: ICON_W, top: 0, bottom: 0, zIndex: 29,
      width: PANEL_W,
      background: "#fff",
      borderRight: "1px solid #f3f4f6",
      boxShadow: open ? "4px 0 20px rgba(0,0,0,0.08)" : "none",
      display: "flex", flexDirection: "column",
      transform: open ? "translateX(0)" : `translateX(-${PANEL_W + 4}px)`,
      transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s",
      overflow: "hidden",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {/* Wordmark header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 16px", flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#F97316", letterSpacing: "-0.03em" }}>SoWork</span>
      </div>

      {/* ── 首頁 panel (Screenshot 1) ── */}
      {isHome && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <StarredHeader />
          {/* Starred brands */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {brands.length === 0 && (
              <p style={{ fontSize: 11.5, color: "#A8A29E", padding: "4px 8px 8px", lineHeight: 1.5 }}>
                {isEn ? "Star a brand to pin it here for quick access." : "點擊品牌的星號圖示，即可從這裡快速找到。"}
              </p>
            )}
            {brands.slice(0, 6).map((b: any) => (
              <PanelRow key={b.id}
                initial={(b.name ?? "B").slice(0, 1).toUpperCase()}
                initialBg="#EEF2FF" initialColor="#4F46E5"
                label={b.name} onClick={() => onNavigate("/brands")} />
            ))}
            {/* 近期設計 */}
            {recentMissions.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 8px 6px" }}>
                  <FontAwesomeIcon icon={faClock} style={{ fontSize: 10, color: "#A8A29E" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em" }}>{isEn ? "Recent designs" : "近期設計"}</span>
                </div>
                {recentMissions.map((m: any) => (
                  <PanelRow key={m.id}
                    initial={(m.title ?? "M").slice(0, 1).toUpperCase()}
                    initialBg="#FFF7ED" initialColor="#F97316"
                    label={m.title}
                    onClick={() => {
                      const url = m.brandId ? `/b/${m.brandId}/${m.workspace || "_"}/m/${m.id}` : `/m/${m.id}`;
                      onNavigate(url);
                    }} />
                ))}
                <button onClick={() => onNavigate("/")} style={{
                  width: "100%", textAlign: "center", padding: "6px 8px", border: "none",
                  background: "none", fontSize: 12, color: "#F97316", cursor: "pointer", fontWeight: 600,
                }}>{isEn ? "See all" : "查看全部"}</button>
              </>
            )}
          </div>
          <TrashButton onNavigate={onNavigate} />
        </>
      )}

      {/* ── 專案 panel (Screenshot 2) ── */}
      {isProjects && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <nav style={{ padding: "8px 6px", flexShrink: 0 }}>
            {([
              { id: "all",     label: isEn ? "All projects" : "所有專案",   icon: faFolderOpen  },
              { id: "mine",    label: isEn ? "Yours" : "你的專案",   icon: faRocket      },
              { id: "shared",  label: isEn ? "Shared with you" : "與你分享",   icon: faUserGroup   },
              { id: "offline", label: isEn ? "Offline" : "可離線使用", icon: faCheckDouble },
            ] as const).map(n => (
              <NavRow key={n.id} icon={n.icon} label={n.label}
                active={activeSubNav === n.id}
                onClick={() => onNavigate(`/projects?sub=${n.id}`)} />
            ))}
          </nav>
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <StarredHeader />
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {brands.slice(0, 6).map((b: any) => (
              <PanelRow key={b.id}
                initial={(b.name ?? "B").slice(0, 1).toUpperCase()}
                initialBg="#EEF2FF" initialColor="#4F46E5"
                label={b.name} onClick={() => onNavigate("/brands")} />
            ))}
          </div>
          <TrashButton onNavigate={onNavigate} />
        </>
      )}

      {/* 範本 panel retired 2026-05-14 — /templates route removed. */}

      {/* ── 品牌 panel (Screenshots 4 & 5) ── */}
      {isBrands && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />

          {/* 所有品牌範本 */}
          <button style={{
            display: "flex", alignItems: "center", padding: "9px 14px",
            fontSize: 13, fontWeight: 500, color: "#374151",
            background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%",
            transition: "background 0.1s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#F5F4F2"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            {isEn ? "All brand templates" : "所有品牌範本"}
          </button>

          {/* 品牌工具組 dropdown trigger */}
          <div style={{ padding: "0 10px 4px", position: "relative" }}>
            <button
              onClick={() => { setBrandDropOpen(v => !v); setBrandSearch(""); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 8,
                background: brandDropOpen ? "#EDE9FE" : "#F5F4F2",
                border: brandDropOpen ? "1.5px solid #6366F1" : "1.5px solid transparent",
                cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A18",
                transition: "all 0.15s", textAlign: "left",
              }}
            >
              {/* Swatch */}
              <div style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                background: "linear-gradient(135deg, #7C3AED, #6366F1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "white", fontSize: 9, fontWeight: 700 }}>
                  {((activeBrand?.name ?? "B") as string).slice(0,1).toUpperCase()}
                </span>
              </div>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isEn ? "Brand kit" : "品牌工具組"}
              </span>
              <FontAwesomeIcon icon={faChevronDown} style={{
                fontSize: 9, color: "#78716C",
                transform: brandDropOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }} />
            </button>

            {/* Dropdown panel */}
            {brandDropOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 10, right: 10,
                background: "white", borderRadius: 10,
                border: "1px solid #E4E3E1",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                zIndex: 200, overflow: "hidden",
              }}>
                {/* Search */}
                <div style={{ padding: "8px 10px", borderBottom: "1px solid #F0EFED", position: "relative" }}>
                  <FontAwesomeIcon icon={faMagnifyingGlass} style={{
                    position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)",
                    color: "#A8A29E", fontSize: 11, pointerEvents: "none",
                  }} />
                  <input
                    autoFocus
                    value={brandSearch}
                    onChange={e => setBrandSearch(e.target.value)}
                    placeholder={isEn ? "Search brand kits" : "搜尋品牌工具組"}
                    style={{
                      width: "100%", padding: "5px 6px 5px 22px",
                      borderRadius: 6, border: "1px solid #E4E3E1",
                      fontSize: 12, color: "#1A1A18", outline: "none",
                      background: "#FAFAF9", boxSizing: "border-box",
                    }}
                  />
                </div>
                {/* Brand list */}
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {brands
                    .filter((b: any) => !brandSearch || b.name?.toLowerCase().includes(brandSearch.toLowerCase()))
                    .map((b: any) => {
                      const isActive = b.id === brandId;
                      return (
                        <button key={b.id}
                          onClick={() => {
                            setBrandId(b.id);
                            setScope({ ...scope, brandId: b.id, productId: null, eventId: null });
                            setBrandDropOpen(false);
                            onNavigate("/brands");
                          }}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 10px", background: isActive ? "#EDE9FE" : "none",
                            border: "none", cursor: "pointer", textAlign: "left",
                            transition: "background 0.12s", fontSize: 12,
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F5F4F2"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                            background: "linear-gradient(135deg, #7C3AED, #6366F1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ color: "white", fontSize: 9, fontWeight: 700 }}>
                              {(b.name?.charAt(0) || "B").toUpperCase()}
                            </span>
                          </div>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1A1A18", fontWeight: isActive ? 600 : 400 }}>
                            {b.name}
                          </span>
                          {isActive && <FontAwesomeIcon icon={faCheck} style={{ color: "#6366F1", fontSize: 10 }} />}
                        </button>
                      );
                    })}
                  {brands.filter((b: any) => !brandSearch || b.name?.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && (
                    <p style={{ padding: "10px 14px", fontSize: 12, color: "#A8A29E" }}>{isEn ? "No brands match" : "找不到品牌"}</p>
                  )}
                </div>
                {/* Actions */}
                <div style={{ borderTop: "1px solid #F0EFED", padding: "5px 0" }}>
                  {[
                    { icon: faPlus,     label: isEn ? "New brand kit" : "建立新的品牌工具組" },
                    { icon: faPlus,     label: isEn ? "New personal brand kit" : "建立個人品牌工具組" },
                    { icon: faGear,     label: isEn ? "Brand controls" : "品牌控制" },
                  ].map(({ icon, label }) => (
                    <button key={label} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 12px", background: "none", border: "none",
                      cursor: "pointer", fontSize: 12, color: "#57534E", textAlign: "left",
                      transition: "background 0.12s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F5F4F2"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <FontAwesomeIcon icon={icon} style={{ fontSize: 10, width: 11 }} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 大分類 nav — 品牌定位 / 視覺資產 / 設定 */}
          <nav style={{ flex: 1, overflowY: "auto", padding: "6px 8px 8px" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: "#A8A29E",
              letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "4px 6px 6px", margin: 0,
            }}>{isEn ? "Categories" : "分類"}</p>
            {([
              { cat: "positioning", label: isEn ? "Positioning" : "定位", icon: faBookBookmark },
              { cat: "copy",        label: isEn ? "Copy" : "文字", icon: faFont         },
              { cat: "visual",      label: isEn ? "Visual" : "視覺", icon: faPaintBrush   },
            ] as Array<{ cat: string; label: string; icon: any }>).map(n => {
              const active = (searchParams.get("cat") ?? "positioning") === n.cat;
              return (
                <button key={n.cat}
                  onClick={() => onNavigate(`/brands?cat=${n.cat}`)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 10px", borderRadius: 8,
                    background: active ? "rgba(163,112,252,0.15)" : "none",
                    border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? "rgb(74,46,126)" : "#374151",
                    textAlign: "left", transition: "background 0.12s", marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(163,112,252,0.15)" : "none"; }}
                >
                  <FontAwesomeIcon icon={n.icon} style={{ fontSize: 12, width: 14, color: active ? "rgb(74,46,126)" : "#9CA3AF" }} />
                  {n.label}
                </button>
              );
            })}
          </nav>
        </>
      )}

      {/* ── Tier + Run pages — recent task runs for current brand × tier ──
          2026-05-09 (CJ direction): "側邊欄沿用收合側邊欄，展示內容換成
          隸屬該主題於該功能的歷史任務，點選後就會到該頁面"
          Triggers on /30s, /60s, /100s, AND /run/:outputId (which infers
          tier from the run itself). */}
      {showTierHistory && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          {/* Header showing current tier + brand context */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px 6px" }}>
            <FontAwesomeIcon icon={faClock} style={{ fontSize: 10, color: "#A8A29E" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isEn ? `${effTier} history` : `${effTier} 歷史任務`}
            </span>
          </div>
          {effBrandId == null ? (
            <p style={{ fontSize: 11.5, color: "#A8A29E", padding: "4px 14px 8px", lineHeight: 1.5 }}>
              {isEn ? `Pick a brand to see its ${effTier} runs.` : `選擇品牌後顯示這個品牌在 ${effTier} 跑過的任務。`}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: "#A8A29E", padding: "0 14px 6px", lineHeight: 1.4 }}>
              {brands.find((b: any) => b.id === effBrandId)?.name ?? runQuery.data?.brand?.name ?? (isEn ? "Current brand" : "目前品牌")} · {effTier}
            </p>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {recentRunsQuery.isLoading ? (
              <p style={{ fontSize: 11, color: "#A8A29E", padding: "8px 14px", textAlign: "center" }}>{isEn ? "Loading…" : "讀取中…"}</p>
            ) : recentRuns.length === 0 && effBrandId != null ? (
              <p style={{ fontSize: 11.5, color: "#A8A29E", padding: "4px 14px 8px", lineHeight: 1.6 }}>
                {isEn ? (
                  <>No {effTier} runs for this brand yet.<br/>Your first one will land here.</>
                ) : (
                  <>這個品牌還沒有 {effTier} 任務紀錄。<br/>跑第一個任務後會出現在這裡。</>
                )}
              </p>
            ) : (
              recentRuns.map((r: any) => {
                const isCurrent = isRun && r.id === runOutputId;
                return (
                  <PanelRow key={r.id}
                    initial={(r.title ?? r.taskId ?? "T").slice(0, 1).toUpperCase()}
                    initialBg={isCurrent ? "#EDE9FE" : "#FFF7ED"}
                    initialColor={isCurrent ? "#6366F1" : "#F97316"}
                    label={r.title || r.taskId || (isEn ? "(Untitled)" : "(無標題)")}
                    onClick={() => onNavigate(`/run/${r.id}`)} />
                );
              })
            )}
          </div>
          <TrashButton onNavigate={onNavigate} />
        </>
      )}

      {/* ── Other pages — generic home-style panel ── */}
      {!isHome && !isProjects && !isBrands && !showTierHistory && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
            {brands.slice(0, 6).map((b: any) => (
              <PanelRow key={b.id}
                initial={(b.name ?? "B").slice(0, 1).toUpperCase()}
                initialBg="#EEF2FF" initialColor="#4F46E5"
                label={b.name} onClick={() => onNavigate("/brands")} />
            ))}
          </div>
          <TrashButton onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}

function PanelRow({ initial, initialBg, initialColor, label, onClick }: {
  initial: string; initialBg: string; initialColor: string; label: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "6px 8px", borderRadius: 8, border: "none", background: "none",
      cursor: "pointer", textAlign: "left", transition: "background 0.1s",
    }}
      onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 6, background: initialBg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color: initialColor,
      }}>
        {initial}
      </span>
      <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Global scope bar — fixed top-right, always visible across all pages
══════════════════════════════════════════════════════════════════ */

function GlobalScopeBar({ scope, setScope, brands }: {
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  brands: any[];
}) {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"brand" | "product" | "event">("brand");
  const { lang } = useLang();
  const isEn = lang === "en";
  const ref = React.useRef<HTMLDivElement>(null);

  // Load products + events based on selected brand
  // NOTE: product.list / event.list are the correct endpoints (no listByBrand variant exists)
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const eventsQuery = (trpc as any).event?.list?.useQuery
    ? (trpc as any).event.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };

  const products: any[] = (productsQuery.data as any[]) ?? [];
  const events:   any[] = (eventsQuery.data   as any[]) ?? [];

  const currentBrand   = brands.find(b => b.id === scope.brandId);
  const currentProduct = products.find(p => p.id === scope.productId);
  const currentEvent   = events.find(e => e.id === scope.eventId);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Breadcrumb segments
  const segments = [
    currentBrand   ? { label: currentBrand.name,   key: "brand"   as const, color: "#F97316" } : null,
    currentProduct ? { label: currentProduct.name,  key: "product" as const, color: "#16a34a" } : null,
    currentEvent   ? { label: currentEvent.name,    key: "event"   as const, color: "#2563eb" } : null,
  ].filter(Boolean) as { label: string; key: "brand" | "product" | "event"; color: string }[];

  return (
    <div ref={ref} style={{ position: "fixed", top: 12, right: 16, zIndex: 35 }}>
      {/* ── Trigger pill ── */}
      <button
        onClick={() => { setOpen(v => !v); setActiveTab("brand"); }}
        style={{
          display: "flex", alignItems: "center", gap: 0,
          height: 36, borderRadius: 18,
          border: open ? "1.5px solid rgba(249,115,22,0.4)" : "1.5px solid rgba(0,0,0,0.09)",
          background: open ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          boxShadow: open
            ? "0 4px 20px rgba(249,115,22,0.15), 0 1px 4px rgba(0,0,0,0.06)"
            : "0 2px 8px rgba(0,0,0,0.06)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          overflow: "hidden",
          padding: 0,
        }}
      >
        {segments.length === 0 ? (
          /* No scope selected — invite user to pick */
          <span style={{ padding: "0 14px", fontSize: 12, fontWeight: 500, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
            <FontAwesomeIcon icon={faBuilding} style={{ fontSize: 11 }} />
            {isEn ? "Pick a brand" : "選擇品牌"}
            <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 9, opacity: 0.5, transform: "rotate(90deg)" }} />
          </span>
        ) : (
          segments.map((seg, i) => (
            <React.Fragment key={seg.key}>
              {i > 0 && (
                <span style={{ fontSize: 10, color: "#d1d5db", padding: "0 2px", userSelect: "none" }}>›</span>
              )}
              <span
                onClick={(e) => { e.stopPropagation(); setActiveTab(seg.key); setOpen(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: i === 0 ? "0 10px 0 10px" : "0 10px",
                  height: "100%",
                  fontSize: 12, fontWeight: i === 0 ? 700 : 500,
                  color: i === 0 ? seg.color : "#374151",
                  transition: "background 0.1s",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {i === 0 && (
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, background: seg.color,
                    color: "#fff", fontSize: 9, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {seg.label.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span style={{ maxWidth: i === 0 ? 120 : 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {seg.label}
                </span>
              </span>
            </React.Fragment>
          ))
        )}
        {/* Chevron */}
        <span style={{ padding: "0 10px 0 4px", display: "flex", alignItems: "center" }}>
          <FontAwesomeIcon icon={faChevronRight} style={{
            fontSize: 9, color: "#9ca3af",
            transform: open ? "rotate(90deg)" : "rotate(90deg)",
            transition: "transform 0.15s",
            ...(open ? { transform: "rotate(-90deg)" } : {}),
          }} />
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 340, borderRadius: 16,
          background: "#fff", border: "1px solid #e5e7eb",
          boxShadow: "0 12px 48px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
          overflow: "hidden", zIndex: 36,
          animation: "slideDown 0.15s ease-out",
        }}>
          {/* Tab header */}
          <div style={{ display: "flex", borderBottom: "1px solid #f3f4f6", padding: "0 6px" }}>
            {([
              { key: "brand" as const,   label: isEn ? "Brand" : "品牌",   color: "#F97316", icon: faBuilding },
              { key: "product" as const, label: isEn ? "Product" : "產品",   color: "#16a34a", icon: faBoxOpen },
              { key: "event" as const,   label: isEn ? "Event" : "活動",   color: "#2563eb", icon: faCalendarDays },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                flex: 1, padding: "10px 4px 8px", border: "none", background: "none", cursor: "pointer",
                fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                color: activeTab === tab.key ? tab.color : "#9ca3af",
                borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : "2px solid transparent",
                transition: "color 0.1s, border-color 0.1s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                <FontAwesomeIcon icon={tab.icon} style={{ fontSize: 11 }} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "6px" }}>
            {activeTab === "brand" && (
              <ScopeList
                items={brands}
                selectedId={scope.brandId}
                color="#F97316"
                emptyText={isEn ? "No brands yet — add one on the Brands page" : "尚無品牌 — 請先到「品牌」頁建立"}
                onSelect={(id) => {
                  setScope({ brandId: id, productId: null, eventId: null });
                  setOpen(false);
                }}
              />
            )}
            {activeTab === "product" && (
              !scope.brandId
                ? <p style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>{isEn ? "Pick a brand first" : "請先選擇品牌"}</p>
                : <ScopeList
                    items={products}
                    selectedId={scope.productId}
                    color="#16a34a"
                    emptyText={isEn ? "No products for this brand" : "此品牌尚無產品"}
                    onSelect={(id) => { setScope({ ...scope, productId: id }); setOpen(false); }}
                    onClear={scope.productId ? () => setScope({ ...scope, productId: null, eventId: null }) : undefined}
                  />
            )}
            {activeTab === "event" && (
              !scope.brandId
                ? <p style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>{isEn ? "Pick a brand first" : "請先選擇品牌"}</p>
                : <ScopeList
                    items={events}
                    selectedId={scope.eventId}
                    color="#2563eb"
                    emptyText={isEn ? "No events for this brand" : "此品牌尚無活動"}
                    onSelect={(id) => {
                      // 修：選 event 自動帶入該 event 的 brand（之前只更新 eventId
                      // 不動 brandId，造成 brand stale 不會跟著事件切換）
                      const ev = events.find((x: any) => x.id === id);
                      const evBrandId = ev?.brandId ?? scope.brandId;
                      setScope({ brandId: evBrandId, productId: scope.productId, eventId: id });
                      setOpen(false);
                    }}
                    onClear={scope.eventId ? () => setScope({ ...scope, eventId: null }) : undefined}
                  />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamSubPanel() {
  const { lang } = useLang();
  const isEn = lang === "en";
  return (
    <>
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{isEn ? "Switch team" : "切換團隊"}</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        <PopupRow onClick={() => {}}>
          <span style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #F97316 0%, #ea580c 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 800,
          }}>{isEn ? "S" : "S的"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{isEn ? "SoWork's team" : "SoWork 的團隊"}</p>
            <p style={{ fontSize: 11, color: "#9ca3af" }}>{isEn ? "Team plan" : "團隊版"}</p>
          </div>
          <FontAwesomeIcon icon={faCheck} style={{ color: "#F97316", fontSize: 14 }} />
        </PopupRow>
        <PopupRow onClick={() => {}}>
          <span style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "#f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#6b7280", fontSize: 18,
          }}>+</span>
          <span style={{ fontSize: 13, color: "#374151" }}>{isEn ? "Create or join a team" : "建立或加入團隊"}</span>
        </PopupRow>
      </div>
    </>
  );
}

function ScopeList({ items, selectedId, color, emptyText, onSelect, onClear }: {
  items: any[]; selectedId: number | null; color: string;
  emptyText: string; onSelect: (id: number) => void; onClear?: () => void;
}) {
  const { lang } = useLang();
  if (items.length === 0) {
    return <p style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>{emptyText}</p>;
  }
  return (
    <>
      {onClear && (
        <button onClick={onClear} style={{
          width: "100%", padding: "7px 10px", borderRadius: 8, border: "none", background: "none",
          fontSize: 12, color: "#9ca3af", cursor: "pointer", textAlign: "left", transition: "background 0.1s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          {lang === "en" ? "✕ Clear selection" : "✕ 清除選擇"}
        </button>
      )}
      {items.map((item: any) => (
        <button key={item.id} onClick={() => onSelect(item.id)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 10, border: "none", textAlign: "left", cursor: "pointer",
          background: selectedId === item.id ? `${color}12` : "none",
          transition: "background 0.1s",
        }}
          onMouseEnter={e => { if (selectedId !== item.id) e.currentTarget.style.background = "#f9fafb"; }}
          onMouseLeave={e => { e.currentTarget.style.background = selectedId === item.id ? `${color}12` : "none"; }}
        >
          <span style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: selectedId === item.id ? color : "#f3f4f6",
            color: selectedId === item.id ? "#fff" : "#6b7280",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, transition: "background 0.15s, color 0.15s",
          }}>
            {(item.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name}
            </p>
            {item.description && (
              <p style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.description}
              </p>
            )}
          </div>
          {selectedId === item.id && (
            <FontAwesomeIcon icon={faCheck} style={{ color, fontSize: 13, flexShrink: 0 }} />
          )}
        </button>
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Account popup (S button) — Canva-style with sub-panels
══════════════════════════════════════════════════════════════════ */

function AccountPopup({ onLogout, onClose, onOpenSupport }: {
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
        const r = await fetch("/api/auth/me", { method: "POST", credentials: "include" });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setMe(d?.user ?? null);
      } catch {/* silent */}
    })();
    return () => { cancelled = true; };
  }, []);
  const userName = me?.name ?? (lang === "en" ? "User" : "使用者");
  const userEmail = me?.email ?? "—";
  const isEn = lang === "en";

  // Real wallet balance for the menu badge
  const balanceQuery = (trpc as any).credits?.getBalance?.useQuery?.(undefined, {
    refetchOnWindowFocus: false,
  });
  const totalCredits = (balanceQuery?.data as any)?.totalAvailable ?? null;

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
      icon: faTrophy, label: isEn ? "Achievements" : "我的成就", arrow: true, badge: null, danger: false,
      // /achievements 已存在，原本 S 選單沒入口
      action: () => { navigate("/achievements"); onClose(); },
    },
    {
      // 2026-05-12 Phase 0 i18n: language toggle. Tapping flips between
      // zh-TW and en (no separate dropdown — keeps S-menu compact).
      icon: faLanguage,
      label: lang === "en" ? "Language · English" : "語系 · 繁體中文",
      arrow: true, badge: null, danger: false,
      action: () => { setLang(lang === "en" ? "zh-TW" : "en"); },
    },
    // 2026-05-12 (CJ「先移除 agency 邀請團隊的設計」): Team/Workspace entry
    // removed from S-menu. /settings/workspace route still exists for direct
    // access; re-add this entry when agency tier launches.
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
          window.location.href = "mailto:sowork@sowork.ai?subject=OnBrand%20%E5%B0%8D%E7%89%88%20%E6%94%AF%E6%8F%B4";
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
                  background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff",
                }}>
                  <FontAwesomeIcon icon={faBriefcase} style={{ fontSize: 14 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                    {Number(totalCredits).toLocaleString()} credits
                  </p>
                  <p style={{ fontSize: 12, color: "#9ca3af" }}>{isEn ? "Tap to see plans" : "點此看方案"}</p>
                </div>
                <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11, color: "#9ca3af" }} />
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
                    fontSize: 10, fontWeight: 600, color: "#7c3aed",
                    background: "#ede9fe", borderRadius: 4, padding: "1px 5px",
                  }}>{item.badge}</span>
                )}
              </span>
              {item.arrow && <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11, color: "#9ca3af" }} />}
            </PopupRow>
          ))}
        </div>
      </div>

      {/* 2026-05-08: removed sub-panel (was fake hardcoded account/team
          lists). Real account info now lives directly in the main card. */}
    </div>
  );
}

/* ── Shared sub-components ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", padding: "4px 8px 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />;
}

function PopupRow({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12,
      padding: "8px 8px", borderRadius: 10, border: "none", textAlign: "left", cursor: "pointer",
      background: active ? "#fff7ed" : "none", transition: "background 0.1s",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "#fff7ed" : "none"; }}
    >
      {children}
    </button>
  );
}

function AccountSubPanel() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const accounts = [
    { name: "SoWork", email: "sowork@sowork.ai", active: true, color: "#7c3aed" },
    { name: "C.J. Wang", email: "biomba.cj@gmail.com", active: false, color: "#0891b2" },
  ];
  return (
    <>
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{isEn ? "Switch account" : "切換帳號"}</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {accounts.map(acc => (
          <PopupRow key={acc.email} onClick={() => {}}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: acc.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {acc.name.slice(0, 1)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{acc.name}</p>
              <p style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email}</p>
            </div>
            {acc.active && <FontAwesomeIcon icon={faCheck} style={{ color: "#F97316", fontSize: 14 }} />}
          </PopupRow>
        ))}
        <PopupRow onClick={() => {}}>
          <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 18 }}>+</span>
          <span style={{ fontSize: 13, color: "#374151" }}>{isEn ? "Add another account" : "新增其他帳號"}</span>
        </PopupRow>
      </div>
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════
   Notification panel
══════════════════════════════════════════════════════════════════ */

// 2026-05-13 (CJ「實作左下方通知」): mocks replaced by real notification
// feed from notifications.list (positioning jobs + task runs + festivals).
// Kept this stub returning [] so any straggling reference doesn't crash —
// the real renderer uses trpc query directly.
function getMockNotifs(_isEn: boolean): Array<any> { return []; }

const NOTIF_LAST_SEEN_KEY = "sowork.notifications.lastSeenAt";
function readLastSeen(): string | null {
  try { return localStorage.getItem(NOTIF_LAST_SEEN_KEY); } catch { return null; }
}
function writeLastSeen(iso: string) {
  try { localStorage.setItem(NOTIF_LAST_SEEN_KEY, iso); } catch {/* no-op */}
}

function NotifPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";
  const isMobile = useIsMobile();
  // 2026-05-13: localStorage-driven read state. Server is stateless; client
  // sends current lastSeenAt so server can mark items above it as unread.
  const [lastSeen, setLastSeen] = React.useState<string | null>(() => readLastSeen());
  const utils = (trpc as any).useUtils?.() ?? null;
  const feedQ = (trpc as any).notifications?.list?.useQuery?.(
    { limit: 20, lastSeenIso: lastSeen ?? undefined, lang },
    { refetchOnWindowFocus: false, refetchInterval: 60_000 },
  );
  const markAllMut = (trpc as any).notifications?.markAllRead?.useMutation?.({
    onSuccess: (r: any) => {
      if (r?.lastSeenAtIso) {
        writeLastSeen(r.lastSeenAtIso);
        setLastSeen(r.lastSeenAtIso);
      }
      utils?.notifications?.list?.invalidate?.();
    },
  });
  const items: Array<any> = feedQ?.data?.items ?? [];
  const handleItemClick = (item: any) => {
    if (item.navUrl) navigate(item.navUrl);
    onClose();
  };
  return (
    <div style={{
      /* Floating card — positioned to the right of the icon bar, bottom-anchored near bell */
      position: "fixed",
      left: ICON_W + 8,
      bottom: 60,          /* just above the bell button */
      // Mobile: 380px from x=78 clips ~83px off a 375px screen (action
      // buttons lost). Fit the gap between rail and right edge.
      width: isMobile ? "calc(100vw - 86px)" : 380,
      maxHeight: "calc(100vh - 80px)",
      background: "#fff",
      borderRadius: 16,
      border: "1px solid #e5e7eb",
      boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
      zIndex: 45,
      display: "flex", flexDirection: "column",
      /* Animate: scale up from bottom-left (near bell), fade in */
      animation: "notifPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
      transformOrigin: "bottom left",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{isEn ? "Notifications" : "通知"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => markAllMut?.mutate?.({})} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
            borderRadius: 8, border: "none", background: "none", fontSize: 12, color: "#6b7280", cursor: "pointer",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faCheckDouble} style={{ fontSize: 11 }} />
            {isEn ? "Mark all read" : "將全部標示為已讀"}
          </button>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", background: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#9ca3af", cursor: "pointer", fontSize: 14,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0", minHeight: 0 }}>
        {feedQ?.isLoading && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            {isEn ? "Loading…" : "載入中…"}
          </div>
        )}
        {!feedQ?.isLoading && items.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
            {isEn
              ? "No notifications yet. Finish a task or apply brand positioning to get started."
              : "目前還沒有通知。跑一個任務或套用品牌定位就會出現。"}
          </div>
        )}
        {items.map((n) => {
          const isUnread = !!n.unread;
          return (
            <div key={n.id}
              onClick={() => handleItemClick(n)}
              style={{
                display: "flex", gap: 12, padding: "12px 16px",
                background: isUnread ? "rgba(249,115,22,0.04)" : "transparent",
                borderBottom: "1px solid #f9fafb", cursor: "pointer", position: "relative",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isUnread ? "rgba(249,115,22,0.08)" : "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = isUnread ? "rgba(249,115,22,0.04)" : "transparent")}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: n.avatarColor,
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 700,
              }}>{n.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#111827", lineHeight: 1.45, marginBottom: 4, fontWeight: isUnread ? 600 : 400 }}>{n.title}</p>
                {n.excerpt && (
                  <div style={{
                    fontSize: 12, color: "#6b7280", background: "#f9fafb", borderRadius: 6,
                    padding: "4px 8px", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{n.excerpt}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9ca3af" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isUnread ? "#ef4444" : "#d1d5db", flexShrink: 0 }} />
                  <span>{n.relativeTime}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
function isChunkLoadError(err: Error): boolean {
  const text = (err.message ?? "") + " " + (err.stack ?? "");
  return /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk|error loading dynamically imported module/i.test(text);
}
function autoReloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem("_chunk_reload_at") ?? 0);
    if (Date.now() - last > 15_000) {
      sessionStorage.setItem("_chunk_reload_at", String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch { /* sessionStorage blocked */ }
  return false;
}

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; resetKey: number }
> {
  state = { error: null as Error | null, resetKey: 0 };
  static getDerivedStateFromError(error: Error) { return { error, resetKey: 0 }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Stale-chunk auto-recovery: hard-reload once on deployment-induced 404.
    if (isChunkLoadError(error) && autoReloadOnce()) return;
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary] route render error:", error, info);
    try {
      const firstLine = String(error?.message ?? "").split("\n")[0] ?? "route render error";
      // 2026-05-16: /trpc (not /api/trpc) + batch wire format — see
      // main.tsx note. Was 404ing → no route errors ever logged.
      fetch("/trpc/ops.logError?batch=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          "0": {
            level: "error",
            source: "frontend.route",
            route: window.location.pathname + window.location.search,
            message: firstLine.slice(0, 500),
            stack: typeof error?.stack === "string" ? error.stack.slice(0, 4000) : undefined,
            fingerprint: `route:${firstLine}`.slice(0, 64), // zod max 64 + VARCHAR(64)
            meta: {
              componentStack: info?.componentStack?.slice(0, 1000),
            },
          },
        }),
      }).catch(() => {});
    } catch {}
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>頁面載入失敗</p>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: "#0f172a" }}>
              這個頁面目前無法顯示
            </h2>
            <p style={{ marginTop: 6, color: "#475569", fontSize: 13, lineHeight: 1.6 }}>
              側邊欄還能用 — 試著切到別的功能，或按下方「重試」再渲染一次。
              <br />
              {this.state.error.message}
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                onClick={() => this.setState({ error: null, resetKey: this.state.resetKey + 1 })}
              >
                重試
              </button>
              <button
                style={{ padding: "6px 12px", background: "white", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                onClick={() => window.location.assign("/theater")}
              >
                回到首頁
              </button>
              <a
                href={`mailto:sowork@sowork.ai?subject=${encodeURIComponent("OnBrand 頁面錯誤 " + window.location.pathname)}&body=${encodeURIComponent("錯誤訊息：\n" + (this.state.error?.message ?? "") + "\n\n頁面：" + window.location.href)}`}
                style={{ fontSize: 12, color: "#3b82f6", textDecoration: "underline", marginLeft: "auto", alignSelf: "center" }}
              >
                聯絡客服
              </a>
            </div>
          </div>
        </div>
      );
    }
    // resetKey re-mounts children on retry so any stuck state clears.
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

/* ══════════════════════════════════════════════════════════════════
   Exports
══════════════════════════════════════════════════════════════════ */

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  brandsLoaded: boolean;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  /** 2026-08-20 (Codex review, PR #119): the shell's own resolved
   *  `/api/auth/me` email — child pages that need the strategy-preview
   *  gate must read THIS instead of firing their own independent fetch.
   *  Two separate requests can disagree (one fails transiently while the
   *  other succeeds), leaving the rail and the in-page controls out of
   *  sync with no way to recover short of a reload. Null while the
   *  shell's own fetch hasn't resolved yet. */
  userEmail: string | null;
}
