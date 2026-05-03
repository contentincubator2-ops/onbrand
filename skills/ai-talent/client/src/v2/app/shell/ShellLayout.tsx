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
  faHouse, faFolderOpen, faTableCells, faUserGroup, faWandMagicSparkles,
  faMicrophone, faBookBookmark, faEllipsis, faBell,
  faPlus, faRightFromBracket,
  faGear, faClock, faTrash, faXmark, faCheckDouble, faTableColumns,
  faChevronRight, faCheck, faBuilding, faBoxOpen, faCalendarDays,
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
  { to: "/templates", label: "任務範本", matchPrefix: "/templates", icon: <FontAwesomeIcon icon={faTableCells} /> },
  { to: "/brands",    label: "品牌",     icon: <FontAwesomeIcon icon={faUserGroup} /> },
  { to: "/quicktask", label: "快派",     icon: <FontAwesomeIcon icon={faWandMagicSparkles} /> },
  { to: "/boardroom", label: "比稿",     icon: <FontAwesomeIcon icon={faMicrophone} /> },
  { to: "/playbooks", label: "成長方案", icon: <FontAwesomeIcon icon={faBookBookmark} /> },
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
      />

      {/* Layer 2: Slide panel — 210px, left:70px, slides in/out */}
      <SlidePanel
        open={!collapsed}
        onClose={toggleCollapsed}
        brands={brands}
        brandId={brandId}
        onNavigate={(to) => navigate(to)}
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
  scope, setScope, onLogout, notifOpen, onNotifToggle,
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
      <nav style={{ flex: 1, overflowY: "auto", padding: "0 3px" }}>
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

function SlidePanel({
  open, onClose, brands, brandId, onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  brands: any[];
  brandId: number | null;
  onNavigate: (to: string) => void;
}) {
  // Recent missions
  const recentQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const recentMissions: any[] = ((recentQuery.data as any[]) ?? []).slice(0, 6);

  return (
    <div
      style={{
        position: "fixed", left: ICON_W, top: 0, bottom: 0, zIndex: 29,
        width: PANEL_W,
        background: "#fff",
        borderRight: "1px solid #f3f4f6",
        boxShadow: open ? "4px 0 20px rgba(0,0,0,0.08)" : "none",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : `translateX(-${PANEL_W + 4}px)`,
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s",
        overflow: "hidden",
      }}
    >
      {/* Header: wordmark */}
      <div style={{
        height: 56, display: "flex", alignItems: "center", padding: "0 16px",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#F97316", letterSpacing: "-0.03em" }}>
          SoWork
        </span>
      </div>

      {/* 建立 full-width button */}
      <div style={{ padding: "0 12px 12px", flexShrink: 0 }}>
        <button
          onClick={() => onNavigate("/")}
          style={{
            width: "100%", height: 40, borderRadius: 10, border: "none",
            background: "#F97316", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontSize: 14, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(249,115,22,0.30)",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
          onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
        >
          <FontAwesomeIcon icon={faPlus} />
          建立任務
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>

        {/* Starred brands */}
        {brands.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 6px" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                已加星號的品牌
              </span>
              <button style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
            {brands.slice(0, 6).map((b: any) => (
              <PanelRow
                key={b.id}
                initial={(b.name ?? "B").slice(0, 1).toUpperCase()}
                initialBg="#f3f4f6"
                initialColor="#6b7280"
                label={b.name}
                onClick={() => {}}
              />
            ))}
          </div>
        )}

        {/* Recent missions */}
        {recentMissions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px 6px" }}>
              <FontAwesomeIcon icon={faClock} style={{ fontSize: 10, color: "#9ca3af" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                近期任務
              </span>
            </div>
            {recentMissions.map((m: any) => (
              <PanelRow
                key={m.id}
                initial={(m.title ?? "M").slice(0, 1).toUpperCase()}
                initialBg="#fff7ed"
                initialColor="#F97316"
                label={m.title}
                onClick={() => {}}
              />
            ))}
            <button
              onClick={() => onNavigate("/")}
              style={{
                width: "100%", textAlign: "center", padding: "6px 8px", border: "none",
                background: "none", fontSize: 12, color: "#F97316", cursor: "pointer", fontWeight: 500,
              }}
            >
              查看全部
            </button>
          </div>
        )}

        {/* More */}
        <button style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "7px 8px", borderRadius: 8, border: "none", background: "none",
          fontSize: 14, color: "#6b7280", cursor: "pointer", transition: "background 0.1s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FontAwesomeIcon icon={faEllipsis} />
          </span>
          顯示更多
        </button>
      </div>

      {/* Bottom: trash */}
      <div style={{ flexShrink: 0, padding: "8px 8px 16px" }}>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "7px 8px", borderRadius: 8, border: "none", background: "none",
          fontSize: 14, color: "#6b7280", cursor: "pointer", transition: "background 0.1s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FontAwesomeIcon icon={faTrash} style={{ fontSize: 14 }} />
          </span>
          垃圾桶
        </button>
      </div>
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
   Account popup (S button) — Canva-style with sub-panels
══════════════════════════════════════════════════════════════════ */

type SubPanel = "account" | "brand" | "product" | "event" | null;

// Stub data — replace with real tRPC queries when available
const STUB_BRANDS   = [{ id: 1, name: "SoWork 品牌" }, { id: 2, name: "Pokémon GO" }];
const STUB_PRODUCTS = [{ id: 1, name: "Marketing OS" }, { id: 2, name: "AI Agent 方案" }];
const STUB_EVENTS   = [{ id: 1, name: "2025 Q2 發布會" }, { id: 2, name: "染色球派對" }];

function AccountPopup({ scope, setScope, onLogout, onClose }: {
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const [subPanel, setSubPanel] = React.useState<SubPanel>(null);

  const currentBrand   = STUB_BRANDS.find(b => b.id === scope.brandId)?.name ?? "選擇品牌";
  const currentProduct = scope.productId ? STUB_PRODUCTS.find(p => p.id === scope.productId)?.name ?? "選擇產品" : "選擇產品";
  const currentEvent   = scope.eventId   ? STUB_EVENTS.find(e => e.id === scope.eventId)?.name   ?? "選擇活動" : "選擇活動";

  return (
    <div style={{
      position: "fixed",
      left: ICON_W + 8,
      bottom: 12,
      zIndex: 50,
      display: "flex",
      alignItems: "flex-end",
      gap: 6,
    }}>
      {/* ── Main card ── */}
      <div style={{
        width: 320,
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fff",
        boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        animation: "notifPopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards",
        transformOrigin: "bottom left",
      }}>

        {/* ① Account row */}
        <div style={{ padding: "6px 6px 4px" }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 10px 4px" }}>帳號</p>
          <MenuRow
            icon={<Avatar name="S" size="sm" radius="full" color="primary" classNames={{ name: "font-bold text-xs" }} />}
            label="SoWork"
            sub="sowork@sowork.tw"
            active={subPanel === "account"}
            hasArrow
            onClick={() => setSubPanel(v => v === "account" ? null : "account")}
          />
        </div>

        <div style={{ height: 1, background: "#f3f4f6", margin: "0 0" }} />

        {/* ② 工作範圍 — brand / product / event */}
        <div style={{ padding: "4px 6px" }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 10px 4px" }}>工作範圍</p>

          <MenuRow
            icon={<span style={{ width: 32, height: 32, borderRadius: 8, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", color: "#F97316", fontSize: 14 }}><FontAwesomeIcon icon={faBuilding} /></span>}
            label="品牌"
            sub={currentBrand}
            active={subPanel === "brand"}
            hasArrow
            onClick={() => setSubPanel(v => v === "brand" ? null : "brand")}
          />
          <MenuRow
            icon={<span style={{ width: 32, height: 32, borderRadius: 8, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", fontSize: 14 }}><FontAwesomeIcon icon={faBoxOpen} /></span>}
            label="產品"
            sub={currentProduct}
            active={subPanel === "product"}
            hasArrow
            onClick={() => setSubPanel(v => v === "product" ? null : "product")}
          />
          <MenuRow
            icon={<span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", fontSize: 14 }}><FontAwesomeIcon icon={faCalendarDays} /></span>}
            label="活動"
            sub={currentEvent}
            active={subPanel === "event"}
            hasArrow
            onClick={() => setSubPanel(v => v === "event" ? null : "event")}
          />
        </div>

        <div style={{ height: 1, background: "#f3f4f6" }} />

        {/* ③ Actions */}
        <div style={{ padding: "4px 6px 6px" }}>
          <MenuRow icon={<FAIcon icon={faGear} />}            label="設定"           onClick={() => {}} />
          <MenuRow icon={<FAIcon icon={faRightFromBracket} />} label="從所有帳號登出" onClick={onLogout} danger />
        </div>
      </div>

      {/* ── Sub-panel (slides in to the right) ── */}
      {subPanel && (
        <div style={{
          width: 280,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
          overflow: "hidden",
          animation: "notifPopIn 0.15s cubic-bezier(0.34,1.56,0.64,1) forwards",
          transformOrigin: "bottom left",
          maxHeight: 400,
          display: "flex", flexDirection: "column",
        }}>
          {subPanel === "account" && <AccountSubPanel onClose={() => setSubPanel(null)} />}
          {subPanel === "brand"   && (
            <ScopeSubPanel
              title="切換品牌"
              items={STUB_BRANDS}
              selectedId={scope.brandId ?? null}
              onSelect={(id) => { setScope({ ...scope, brandId: id }); setSubPanel(null); }}
              color="#F97316"
              onClose={() => setSubPanel(null)}
            />
          )}
          {subPanel === "product" && (
            <ScopeSubPanel
              title="切換產品"
              items={STUB_PRODUCTS}
              selectedId={scope.productId ?? null}
              onSelect={(id) => { setScope({ ...scope, productId: id }); setSubPanel(null); }}
              color="#16a34a"
              onClose={() => setSubPanel(null)}
            />
          )}
          {subPanel === "event" && (
            <ScopeSubPanel
              title="切換活動"
              items={STUB_EVENTS}
              selectedId={scope.eventId ?? null}
              onSelect={(id) => { setScope({ ...scope, eventId: id }); setSubPanel(null); }}
              color="#2563eb"
              onClose={() => setSubPanel(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* helper: icon button */
function FAIcon({ icon }: { icon: any }) {
  return (
    <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 15 }}>
      <FontAwesomeIcon icon={icon} />
    </span>
  );
}

/* reusable menu row */
function MenuRow({ icon, label, sub, active, hasArrow, onClick, danger }: {
  icon: React.ReactNode; label: string; sub?: string;
  active?: boolean; hasArrow?: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "7px 10px", borderRadius: 10, border: "none", textAlign: "left", cursor: "pointer",
      background: active ? "#fff7ed" : "none",
      transition: "background 0.1s",
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? "#fff7ed" : "none"; }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: danger ? "#ef4444" : "#111827", lineHeight: 1.3 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
      </div>
      {hasArrow && <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }} />}
    </button>
  );
}

/* account sub-panel (switch account) */
function AccountSubPanel({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #f3f4f6" }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>切換帳號</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {[
          { name: "SoWork", email: "sowork@sowork.tw", active: true, color: "#7c3aed" },
          { name: "C.J. Wang", email: "biomba.cj@gmail.com", active: false, color: "#0891b2" },
        ].map((acc) => (
          <button key={acc.email} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", transition: "background 0.1s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: acc.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {acc.name.slice(0, 1)}
            </span>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{acc.name}</p>
              <p style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email}</p>
            </div>
            {acc.active && <FontAwesomeIcon icon={faCheck} style={{ color: "#F97316", fontSize: 13 }} />}
          </button>
        ))}
        <button style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#374151", transition: "background 0.1s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 16 }}>+</span>
          新增其他帳號
        </button>
      </div>
    </>
  );
}

/* scope sub-panel (brand / product / event) */
function ScopeSubPanel({ title, items, selectedId, onSelect, color, onClose }: {
  title: string; items: { id: number; name: string }[];
  selectedId: number | null; onSelect: (id: number) => void; color: string; onClose: () => void;
}) {
  return (
    <>
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #f3f4f6" }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{title}</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {items.map((item) => (
          <button key={item.id} onClick={() => onSelect(item.id)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", transition: "background 0.1s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>
              {item.name.slice(0, 1)}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: "#111827", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
            {selectedId === item.id && <FontAwesomeIcon icon={faCheck} style={{ color, fontSize: 13 }} />}
          </button>
        ))}
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
