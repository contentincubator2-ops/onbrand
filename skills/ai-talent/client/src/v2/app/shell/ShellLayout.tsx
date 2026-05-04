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
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import ScopeBar, { useScopeState, type ScopeState } from "./ScopeBar";
import { Avatar, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse, faFolderOpen, faTableCells, faUserGroup, faWandMagicSparkles, faRocket,
  faMicrophone, faBookBookmark, faEllipsis, faBell,
  faPlus, faRightFromBracket,
  faGear, faClock, faTrash, faXmark, faCheckDouble, faTableColumns,
  faChevronRight, faCheck, faBuilding, faBoxOpen, faCalendarDays,
  faCircleHalfStroke, faCircleInfo, faBorderAll, faDisplay, faBriefcase,
  faStar, faImage, faUser, faPaintBrush, faFont, faMagnifyingGlass,
  faTrademark, faChevronDown, faCrown,
} from "@fortawesome/free-solid-svg-icons";

const ICON_W  = 70;   // icon bar — never changes
const PANEL_W = 210;  // slide panel width

/* ─────────────────────────── Nav items ─────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",          label: "首頁",     icon: <FontAwesomeIcon icon={faHouse} /> },
  { to: "/projects",  label: "專案",     icon: <FontAwesomeIcon icon={faFolderOpen} /> },
  { to: "/templates", label: "範本",     matchPrefix: "/templates", icon: <FontAwesomeIcon icon={faTableCells} /> },
  { to: "/brands",    label: "品牌",     icon: <FontAwesomeIcon icon={faUserGroup} /> },
  { to: "/quicktask", label: "快派",     icon: <FontAwesomeIcon icon={faWandMagicSparkles} /> },
  { to: "/boardroom", label: "比稿",     icon: <FontAwesomeIcon icon={faMicrophone} /> },
  { to: "/playbooks", label: "案例",     icon: <FontAwesomeIcon icon={faBookBookmark} /> },
];

/* ─────────────────────────── Root layout ─────────────────────────── */

export default function ShellLayout() {
  const navigate = useNavigate();
  const loc = useLocation();

  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false });
  const brands = (brandsQuery.data as any[]) ?? [];

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

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    window.location.href = "/auth/login";
  };

  const [notifOpen, setNotifOpen] = React.useState(false);
  // Content area always offset by ICON_W; panel slides on top without pushing content
  const contentLeft = collapsed ? ICON_W : ICON_W + PANEL_W;

  return (
    <div className="min-h-screen" style={{ background: "rgb(252,251,254)" }}>

      {/* Layer 1: Icon bar — ALWAYS 70px, NEVER moves */}
      <IconBar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        onNavigate={(to) => navigate(to)}
        scope={scope}
        setScope={setScope}
        onLogout={handleLogout}
        notifOpen={notifOpen}
        onNotifToggle={() => setNotifOpen((v) => !v)}
        brands={brands}
      />

      {/* Layer 2: Slide panel — 210px, left:70px, slides in/out */}
      <SlidePanel
        open={!collapsed}
        onClose={toggleCollapsed}
        brands={brands}
        brandId={brandId}
        onNavigate={(to) => navigate(to)}
        currentPath={loc.pathname}
      />

      {/* Backdrop for slide panel */}
      {!collapsed && (
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

      {/* Global scope bar — fixed top-right, always visible */}
      <GlobalScopeBar scope={scope} setScope={setScope} brands={brands} />

      {/* Main content */}
      <div style={{ paddingLeft: contentLeft, transition: "padding-left 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
        <Outlet context={{ brandId, setBrandId, brands, scope, setScope }} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LAYER 1 — Icon bar (70px, always fixed, icons NEVER move)
══════════════════════════════════════════════════════════════════ */

function IconBar({
  collapsed, onToggle, currentPath, onNavigate,
  scope, setScope, onLogout, notifOpen, onNotifToggle, brands,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  onNavigate: (to: string) => void;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onLogout: () => void;
  notifOpen: boolean;
  onNotifToggle: () => void;
  brands: any[];
}) {
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

  return (
    <aside
      style={{
        position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 40,
        width: ICON_W,
        background: "#fff",
        borderRight: "1px solid #f3f4f6",
        display: "flex", flexDirection: "column",
        overflow: "hidden",   /* prevent any horizontal scrollbar from appearing */
      }}
    >
      {/* Toggle — topmost, always at same position */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Tooltip content={collapsed ? "展開側邊欄" : "收合側邊欄"} placement="right">
          <button
            onClick={onToggle}
            aria-label="切換側邊欄"
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none", background: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "#9ca3af", cursor: "pointer",
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#374151"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; }}
          >
            <FontAwesomeIcon icon={faTableColumns} />
          </button>
        </Tooltip>
      </div>

      {/* 建立 circle */}
      <div style={{ padding: "0 13px 12px", flexShrink: 0 }}>
        <Tooltip content="建立任務" placement="right">
          <button
            onClick={() => onNavigate("/")}
            aria-label="建立任務"
            style={{
              width: 44, height: 44, borderRadius: "50%", border: "none",
              background: "#F97316", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto", fontSize: 18, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(249,115,22,0.35)",
              transition: "background 0.1s, transform 0.07s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
            onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </Tooltip>
      </div>

      {/* Nav icons */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 3px" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.matchPrefix
            ? currentPath.startsWith(item.matchPrefix)
            : (item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to));
          return <IconNavLink key={item.to} item={item} active={isActive} onClick={() => onNavigate(item.to)} />;
        })}

        {/* More */}
        <Tooltip content="顯示更多" placement="right">
          <button
            aria-label="顯示更多"
            onClick={onToggle}
            style={{
              width: 64, height: 44, margin: "2px auto 0", display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              background: "none", border: "none", color: "#9ca3af", cursor: "pointer",
              transition: "color 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#374151")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
          >
            <FontAwesomeIcon icon={faEllipsis} style={{ fontSize: 16 }} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>顯示更多</span>
          </button>
        </Tooltip>
      </nav>

      {/* Bottom: bell + avatar */}
      <div style={{ flexShrink: 0, paddingBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {/* Bell with badge */}
        <Tooltip content="通知" placement="right">
          <button
            onClick={onNotifToggle}
            aria-label="通知"
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
            <span style={{
              position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
              background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px", border: "1.5px solid white", pointerEvents: "none",
            }}>9+</span>
          </button>
        </Tooltip>

        {/* Avatar — opens AccountPopup */}
        <div ref={avatarRef} style={{ position: "relative" }}>
          <button
            onClick={() => setAvatarOpen((v) => !v)}
            aria-label="帳號"
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

function IconNavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      style={{
        width: 64, height: 52, margin: "2px auto 0",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        background: "none", border: "none", padding: 0, cursor: "pointer",
        color: active ? "#F97316" : "#9ca3af",
        transition: "color 0.1s",
        position: "relative",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.color = "#374151";
          const pill = e.currentTarget.querySelector(".nav-pill") as HTMLElement | null;
          if (pill) pill.style.background = "rgba(0,0,0,0.05)";
        }
      }}
      onMouseLeave={e => {
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
      <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, position: "relative" }}>
        {item.icon}
      </span>
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, textAlign: "center", position: "relative" }}>
        {item.label}
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LAYER 2 — Slide panel (210px, left:70px, slides in/out)
══════════════════════════════════════════════════════════════════ */

/* ── Shared top buttons: 你的方案 + 邀請使用者 ── */
function PlanInviteButtons({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
      {[
        { icon: faCrown, label: "你的方案",   to: "/settings/plan" },
        { icon: faUserGroup, label: "邀請使用者", to: "/settings/team" },
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
  return (
    <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        已標記星號的內容
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
      background: active ? "#EDE9FE" : "transparent",
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
        垃圾桶
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SlidePanel — Canva-faithful per-page sidebar content
══════════════════════════════════════════════════════════════════ */
function SlidePanel({
  open, onClose, brands, brandId, onNavigate, currentPath,
}: {
  open: boolean;
  onClose: () => void;
  brands: any[];
  brandId: number | null;
  onNavigate: (to: string) => void;
  currentPath: string;
}) {
  const isHome      = currentPath === "/";
  const isProjects  = currentPath.startsWith("/projects");
  const isTemplates = currentPath.startsWith("/templates");
  const isBrands    = currentPath.startsWith("/brands");

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
                點擊品牌的星號圖示，即可從這裡快速找到。
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
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em" }}>近期設計</span>
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
                }}>查看全部</button>
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
              { id: "all",     label: "所有專案",   icon: faFolderOpen  },
              { id: "mine",    label: "你的專案",   icon: faRocket      },
              { id: "shared",  label: "與你分享",   icon: faUserGroup   },
              { id: "offline", label: "可離線使用", icon: faCheckDouble },
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

      {/* ── 範本 panel (Screenshot 3) ── */}
      {isTemplates && (
        <>
          <PlanInviteButtons onNavigate={onNavigate} />
          <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />
          <nav style={{ padding: "8px 6px", flex: 1 }}>
            {([
              { id: "templates", label: "範本",         icon: faTableCells,   to: "/templates"           },
              { id: "photos",    label: "照片",         icon: faImage,        to: "/templates?kind=photo" },
              { id: "images",    label: "圖像",         icon: faPaintBrush,   to: "/templates?kind=image" },
              { id: "creators",  label: "創作者",       icon: faUser,         to: "/templates?kind=agent" },
              { id: "starred",   label: "已標記星號的內容", icon: faStar,       to: "/templates?kind=skill" },
            ]).map(n => {
              const active =
                n.id === "templates"
                  ? currentPath === "/templates" && !searchParams.get("kind")
                  : searchParams.get("kind") === n.id.replace("photos","photo").replace("images","image").replace("creators","agent").replace("starred","skill");
              return (
                <NavRow key={n.id} icon={n.icon} label={n.label} active={active} onClick={() => onNavigate(n.to)} />
              );
            })}
          </nav>
        </>
      )}

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
            所有品牌範本
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
                品牌工具組
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
                    placeholder="搜尋品牌工具組"
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
                          onClick={() => { onNavigate("/brands"); setBrandDropOpen(false); }}
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
                    <p style={{ padding: "10px 14px", fontSize: 12, color: "#A8A29E" }}>找不到品牌</p>
                  )}
                </div>
                {/* Actions */}
                <div style={{ borderTop: "1px solid #F0EFED", padding: "5px 0" }}>
                  {[
                    { icon: faPlus,     label: "建立新的品牌工具組" },
                    { icon: faPlus,     label: "建立個人品牌工具組" },
                    { icon: faGear,     label: "品牌控制" },
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
            }}>分類</p>
            {([
              { cat: "positioning", label: "品牌定位", icon: faBookBookmark },
              { cat: "visual",      label: "視覺資產", icon: faPaintBrush   },
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

      {/* ── Other pages — generic home-style panel ── */}
      {!isHome && !isProjects && !isTemplates && !isBrands && (
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
  const ref = React.useRef<HTMLDivElement>(null);

  // Load products + events based on selected brand
  const productsQuery = (trpc as any).product?.listByBrand?.useQuery
    ? (trpc as any).product.listByBrand.useQuery(
        { brandId: scope.brandId ?? 0 },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const eventsQuery = (trpc as any).event?.listByBrand?.useQuery
    ? (trpc as any).event.listByBrand.useQuery(
        { brandId: scope.brandId ?? 0 },
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
            選擇品牌
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
              { key: "brand" as const,   label: "品牌",   color: "#F97316", icon: faBuilding },
              { key: "product" as const, label: "產品",   color: "#16a34a", icon: faBoxOpen },
              { key: "event" as const,   label: "活動",   color: "#2563eb", icon: faCalendarDays },
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
                emptyText="尚無品牌 — 請先到「品牌」頁建立"
                onSelect={(id) => {
                  setScope({ brandId: id, productId: null, eventId: null });
                  setOpen(false);
                }}
              />
            )}
            {activeTab === "product" && (
              !scope.brandId
                ? <p style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>請先選擇品牌</p>
                : <ScopeList
                    items={products}
                    selectedId={scope.productId}
                    color="#16a34a"
                    emptyText="此品牌尚無產品"
                    onSelect={(id) => { setScope({ ...scope, productId: id }); setOpen(false); }}
                    onClear={scope.productId ? () => setScope({ ...scope, productId: null, eventId: null }) : undefined}
                  />
            )}
            {activeTab === "event" && (
              !scope.brandId
                ? <p style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>請先選擇品牌</p>
                : <ScopeList
                    items={events}
                    selectedId={scope.eventId}
                    color="#2563eb"
                    emptyText="此品牌尚無活動"
                    onSelect={(id) => { setScope({ ...scope, eventId: id }); setOpen(false); }}
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
  return (
    <>
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>切換團隊</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        <PopupRow onClick={() => {}}>
          <span style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #F97316 0%, #ea580c 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 800,
          }}>S的</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>SoWork 的團隊</p>
            <p style={{ fontSize: 11, color: "#9ca3af" }}>團隊版</p>
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
          <span style={{ fontSize: 13, color: "#374151" }}>建立或加入團隊</span>
        </PopupRow>
      </div>
    </>
  );
}

function ScopeList({ items, selectedId, color, emptyText, onSelect, onClear }: {
  items: any[]; selectedId: number | null; color: string;
  emptyText: string; onSelect: (id: number) => void; onClear?: () => void;
}) {
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
          ✕ 清除選擇
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

function AccountPopup({ onLogout, onClose }: {
  onLogout: () => void;
  onClose: () => void;
  scope?: ScopeState;
  setScope?: (s: ScopeState) => void;
  brands?: any[];
}) {
  const [subPanel, setSubPanel] = React.useState<"account" | "team" | null>(null);

  // Menu rows — mirrors Canva exactly
  const menuItems = [
    { icon: faGear,             label: "設定",              arrow: false, badge: null,    danger: false, action: () => {} },
    { icon: faCircleHalfStroke, label: "主題",              arrow: true,  badge: null,    danger: false, action: () => {} },
    { icon: faCircleInfo,       label: "說明和資源",         arrow: true,  badge: null,    danger: false, action: () => {} },
    { icon: faBorderAll,        label: "進階工具",           arrow: true,  badge: "測試版", danger: false, action: () => {} },
    { icon: faBriefcase,        label: "方案和定價",         arrow: false, badge: null,    danger: false, action: () => {} },
    { icon: faDisplay,          label: "取得 SoWork 應用程式", arrow: false, badge: null,  danger: false, action: () => {} },
    { icon: faRightFromBracket, label: "從所有帳號登出",     arrow: false, badge: null,    danger: true,  action: onLogout },
  ];

  return (
    <div style={{
      position: "fixed", left: ICON_W + 8, bottom: 12, zIndex: 50,
      display: "flex", alignItems: "flex-end", gap: 8,
    }}>
      {/* ── Main card ── */}
      <div style={{
        width: 360,
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        animation: "notifPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
        transformOrigin: "bottom left",
      }}>

        {/* ① 帳號 */}
        <div style={{ padding: "8px 8px 4px" }}>
          <SectionLabel>帳號</SectionLabel>
          <PopupRow
            onClick={() => setSubPanel(v => v === "account" ? null : "account")}
            active={subPanel === "account"}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold" }} />
              <span style={{
                position: "absolute", bottom: -2, right: -2,
                width: 18, height: 18, borderRadius: "50%",
                background: "#f3f4f6", border: "1.5px solid #fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#6b7280",
              }}>📷</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>SoWork</p>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>sowork@sowork.tw</p>
            </div>
            <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11, color: "#9ca3af" }} />
          </PopupRow>
        </div>

        <Divider />

        {/* ② 團隊 — mirrors Canva "Team" section */}
        <div style={{ padding: "4px 8px" }}>
          <SectionLabel>團隊</SectionLabel>
          <PopupRow
            onClick={() => setSubPanel(v => v === "team" ? null : "team")}
            active={subPanel === "team"}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, #F97316 0%, #ea580c 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 15, fontWeight: 800,
            }}>S的</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>SoWork 的團隊</p>
              <p style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                團隊版
                <span style={{ fontSize: 10 }}>•</span>
                <FontAwesomeIcon icon={faUserGroup} style={{ fontSize: 10 }} />
                5
              </p>
            </div>
            <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11, color: "#9ca3af" }} />
          </PopupRow>
        </div>

        <Divider />

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

      {/* ── Sub-panel ── */}
      {subPanel && (
        <div style={{
          width: 300, borderRadius: 16, border: "1px solid #e5e7eb", background: "#fff",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
          overflow: "hidden", maxHeight: 500, display: "flex", flexDirection: "column",
          animation: "notifPopIn 0.15s cubic-bezier(0.34,1.56,0.64,1) forwards",
          transformOrigin: "bottom left",
        }}>
          {subPanel === "account" && <AccountSubPanel />}
          {subPanel === "team"    && <TeamSubPanel />}
        </div>
      )}
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
  const accounts = [
    { name: "SoWork", email: "sowork@sowork.tw", active: true, color: "#7c3aed" },
    { name: "C.J. Wang", email: "biomba.cj@gmail.com", active: false, color: "#0891b2" },
  ];
  return (
    <>
      <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>切換帳號</p>
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
          <span style={{ fontSize: 13, color: "#374151" }}>新增其他帳號</span>
        </PopupRow>
      </div>
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════
   Notification panel
══════════════════════════════════════════════════════════════════ */

const MOCK_NOTIFS = [
  {
    id: 1, unread: true, avatar: "L", avatarColor: "#7c3aed",
    title: "Laila Chu 在任務「品牌月曆」撰寫了評論。",
    excerpt: "社群日活動時間這串文字想要變色強調",
    time: "3月31日 下午6:45", from: "Laila Chu", fromCount: 2,
  },
  {
    id: 2, unread: true, avatar: "Y", avatarColor: "#059669",
    title: "「yirenyan」解決了有關「Facebook 廣告文案」的評論。",
    excerpt: "@SoWork 圖片上的英文字幕可以去除嗎",
    time: "1月22日 上午10:26", from: "yirenyan", fromCount: 1,
  },
  {
    id: 3, unread: false, avatar: "簡", avatarColor: "#0891b2",
    title: "簡維德 在任務「GO Tour DM」撰寫了評論。",
    excerpt: "建議這兩隻皮卡丘的外框用更明顯的顏色替代白色",
    time: "4天前", from: "簡維德", fromCount: 1,
  },
];

function NotifPanel({ onClose }: { onClose: () => void }) {
  const [readAll, setReadAll] = React.useState(false);
  return (
    <div style={{
      /* Floating card — positioned to the right of the icon bar, bottom-anchored near bell */
      position: "fixed",
      left: ICON_W + 8,
      bottom: 60,          /* just above the bell button */
      width: 380,
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
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>通知</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setReadAll(true)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
            borderRadius: 8, border: "none", background: "none", fontSize: 12, color: "#6b7280", cursor: "pointer",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faCheckDouble} style={{ fontSize: 11 }} />
            將全部標示為已讀
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
        {MOCK_NOTIFS.map((n) => {
          const isUnread = n.unread && !readAll;
          return (
            <div key={n.id} style={{
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
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700,
              }}>{n.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#111827", lineHeight: 1.45, marginBottom: 4 }}>{n.title}</p>
                <div style={{
                  fontSize: 12, color: "#6b7280", background: "#f9fafb", borderRadius: 6,
                  padding: "4px 8px", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{n.excerpt}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9ca3af" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                  <span>{n.time}</span>
                </div>
                <button style={{ marginTop: 4, fontSize: 12, fontWeight: 500, color: "#F97316", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  來自「{n.from}」的 {n.fromCount} 個更新
                </button>
              </div>
              {isUnread && <span style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Exports
══════════════════════════════════════════════════════════════════ */

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}
