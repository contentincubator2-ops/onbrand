/**
 * ShellLayout — Canva-faithful sidebar.
 *
 * Collapsed (70px): toggle icon at top, icon+12px label nav, bell+avatar at bottom.
 * Expanded (280px): toggle at top-left, SoWork wordmark, full-width nav rows,
 *   right-side panel showing starred brands + recent missions (Canva pattern).
 */
import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import ScopeBar, { useScopeState, type ScopeState } from "./ScopeBar";
import { Avatar, Button, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse, faFolderOpen, faTableCells, faUserGroup, faWandMagicSparkles,
  faMicrophone, faBookBookmark, faEllipsis, faBell,
  faChevronLeft, faChevronRight, faPlus, faRightFromBracket,
  faGear, faClock, faTrash, faXmark, faCheckDouble,
} from "@fortawesome/free-solid-svg-icons";

const COLLAPSED_W = 70;
const EXPANDED_W  = 280;

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
  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <div className="min-h-screen" style={{ background: "rgb(252,251,254)" }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        onNavigate={(to) => navigate(to)}
        scope={scope}
        setScope={setScope}
        onLogout={handleLogout}
        brands={brands}
        brandId={brandId}
        notifOpen={notifOpen}
        onNotifToggle={() => setNotifOpen((v) => !v)}
      />

      {/* Notification drawer — slides in from sidebar edge */}
      <NotifPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        offsetLeft={sidebarWidth}
      />
      {/* Backdrop — closes panel on outside click */}
      {notifOpen && (
        <div
          onClick={() => setNotifOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 38, background: "rgba(0,0,0,0.08)" }}
        />
      )}

      <div style={{ paddingLeft: sidebarWidth, transition: "padding-left 0.2s ease" }}>
        <Outlet context={{ brandId, setBrandId, brands, scope, setScope }} />
      </div>
    </div>
  );
}

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

/* ─────────────────────────── Sidebar ─────────────────────────── */

function Sidebar({
  collapsed, onToggle, currentPath, onNavigate, scope, setScope, onLogout, brands, brandId,
  notifOpen, onNotifToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  onNavigate: (to: string) => void;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onLogout: () => void;
  brands: any[];
  brandId: number | null;
  notifOpen: boolean;
  onNotifToggle: () => void;
}) {
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const avatarRef = React.useRef<HTMLDivElement>(null);

  // Recent missions for expanded panel
  const recentQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const recentMissions: any[] = ((recentQuery.data as any[]) ?? []).slice(0, 6);

  React.useEffect(() => {
    if (!avatarOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [avatarOpen]);

  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-white border-r border-default-100"
      style={{ width, transition: "width 0.2s ease", overflow: "hidden" }}
    >
      {/* ── Top row: toggle + wordmark ── */}
      <div className="h-14 flex items-center shrink-0 px-3 gap-2">
        {/* Toggle button — always visible, top-left */}
        <Tooltip content={collapsed ? "展開側邊欄" : "收合側邊欄"} placement="right">
          <button
            onClick={onToggle}
            aria-label="切換側邊欄"
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none", background: "none",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              transition: "background-color 0.1s linear, color 0.1s linear",
              fontSize: 14, color: "#9ca3af",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#374151"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; }}
          >
            <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
          </button>
        </Tooltip>

        {/* Wordmark — only when expanded */}
        {!collapsed && (
          <span
            className="font-bold text-base tracking-tight whitespace-nowrap"
            style={{ color: "#F97316", letterSpacing: "-0.02em" }}
          >
            SoWork
          </span>
        )}
      </div>

      {/* ── 建立 button ── */}
      <div className="shrink-0 px-3 pb-3">
        {collapsed ? (
          <Tooltip content="建立任務" placement="right">
            <button
              onClick={() => onNavigate("/")}
              aria-label="建立任務"
              style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: "#F97316", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto", fontSize: 18, flexShrink: 0,
                transition: "background-color 0.1s linear, box-shadow 0.1s linear, transform 0.07s",
                boxShadow: "0 2px 8px rgba(249,115,22,0.35)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
              onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => onNavigate("/")}
            style={{
              width: "100%", height: 44, borderRadius: 12, border: "none",
              background: "#F97316", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              transition: "background-color 0.1s linear, box-shadow 0.1s linear, transform 0.07s",
              boxShadow: "0 2px 8px rgba(249,115,22,0.30)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
            onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
          >
            <FontAwesomeIcon icon={faPlus} />
            建立任務
          </button>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto" style={{ paddingInline: collapsed ? 3 : 8 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.matchPrefix
            ? currentPath.startsWith(item.matchPrefix)
            : (item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to));
          return (
            <SidebarNavLink
              key={item.to}
              item={item}
              active={isActive}
              collapsed={collapsed}
              onClick={() => onNavigate(item.to)}
            />
          );
        })}

        {/* ── Expanded panel: starred brands + recent missions ── */}
        {!collapsed && (
          <>
            {/* Starred brands */}
            {brands.length > 0 && (
              <div className="mt-4 mb-2">
                <div className="flex items-center justify-between px-2 mb-1">
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    已加星號的品牌
                  </span>
                  <button style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, cursor: "pointer", padding: "0 2px" }}>
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                </div>
                {brands.slice(0, 4).map((b: any) => (
                  <button
                    key={b.id}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 8px", borderRadius: 8, border: "none", background: "none",
                      cursor: "pointer", textAlign: "left",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 6, background: "#f3f4f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#6b7280", flexShrink: 0,
                    }}>
                      {(b.name ?? "B").slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent missions */}
            {recentMissions.length > 0 && (
              <div className="mt-3 mb-2">
                <div className="flex items-center px-2 mb-1 gap-1.5">
                  <FontAwesomeIcon icon={faClock} style={{ fontSize: 10, color: "#9ca3af" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    近期任務
                  </span>
                </div>
                {recentMissions.map((m: any) => (
                  <button
                    key={m.id}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 8px", borderRadius: 8, border: "none", background: "none",
                      cursor: "pointer", textAlign: "left",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 6, background: "#fff7ed",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#F97316", flexShrink: 0,
                    }}>
                      {(m.title ?? "M").slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.title}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => onNavigate("/")}
                  style={{
                    width: "100%", textAlign: "center", padding: "6px 8px", border: "none",
                    background: "none", fontSize: 12, color: "#F97316", cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  查看全部
                </button>
              </div>
            )}
          </>
        )}

        {/* Show-more */}
        {collapsed ? (
          <Tooltip content="顯示更多" placement="right">
            <button
              aria-label="顯示更多"
              style={{
                width: 64, height: 36, margin: "2px auto 0", display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "none", border: "none", color: "#9ca3af",
                transition: "color 0.1s linear",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#374151")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
            >
              <FontAwesomeIcon icon={faEllipsis} />
            </button>
          </Tooltip>
        ) : (
          <button
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "6px 8px", borderRadius: 8, border: "none", background: "none",
              cursor: "pointer", color: "#6b7280", fontSize: 14,
              transition: "background-color 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FontAwesomeIcon icon={faEllipsis} />
            </span>
            顯示更多
          </button>
        )}
      </nav>

      {/* ── Bottom: trash (expanded only) + bell + avatar ── */}
      <div className="shrink-0 pb-3 flex flex-col items-center gap-1" style={{ paddingInline: collapsed ? 8 : 12 }}>
        {/* Trash — expanded only, like Canva */}
        {!collapsed && (
          <button
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "6px 8px", borderRadius: 8, border: "none", background: "none",
              cursor: "pointer", color: "#6b7280", fontSize: 14,
              transition: "background-color 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FontAwesomeIcon icon={faTrash} style={{ fontSize: 15 }} />
            </span>
            垃圾桶
          </button>
        )}

        {/* Bell — with unread badge + active state */}
        <Tooltip content="通知" placement="right">
          <button
            aria-label="通知"
            onClick={onNotifToggle}
            style={{
              position: "relative",
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: notifOpen ? "#fff7ed" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.1s linear, background-color 0.1s linear",
              fontSize: 16,
              color: notifOpen ? "#F97316" : "#9ca3af",
              alignSelf: collapsed ? "center" : "flex-start",
              cursor: "pointer",
            }}
            onMouseEnter={e => {
              if (!notifOpen) { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#374151"; }
            }}
            onMouseLeave={e => {
              if (!notifOpen) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; }
            }}
          >
            <FontAwesomeIcon icon={faBell} />
            {/* Unread badge */}
            <span style={{
              position: "absolute", top: 2, right: 2,
              minWidth: 16, height: 16, borderRadius: 8,
              background: "#ef4444", color: "#fff",
              fontSize: 9, fontWeight: 700, lineHeight: "16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px", border: "1.5px solid white",
              pointerEvents: "none",
            }}>
              9+
            </span>
          </button>
        </Tooltip>

        {/* Avatar */}
        <div ref={avatarRef} className="relative w-full flex" style={{ justifyContent: collapsed ? "center" : "flex-start" }}>
          <button
            aria-label="帳號與品牌切換"
            onClick={() => setAvatarOpen((v) => !v)}
            style={{
              width: 40, height: 40, borderRadius: "50%", border: "none",
              background: "none", padding: 0, cursor: "pointer",
            }}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
          >
            <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold text-sm" }} />
          </button>

          {/* Popup panel */}
          {avatarOpen && (
            <div
              className="absolute bottom-full mb-2 w-80 rounded-2xl border border-divider bg-content1 shadow-xl z-50"
              style={{ left: collapsed ? "calc(100% + 8px)" : 0, animation: "slideInUp 0.15s ease-out" }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
                <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold" }} />
                <div className="min-w-0">
                  <p className="text-small font-semibold truncate">SoWork</p>
                  <p className="text-tiny text-default-500 truncate">sowork@sowork.tw</p>
                </div>
              </div>
              <div className="px-4 py-3 border-b border-divider">
                <p className="text-tiny font-semibold text-default-500 uppercase tracking-wider mb-2">工作範圍</p>
                <ScopeBar scope={scope} setScope={setScope} />
              </div>
              <div className="p-2">
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-small text-default-600 hover:bg-default-100 transition-colors text-left"
                  style={{ transition: "background-color 0.1s linear" }}
                >
                  <FontAwesomeIcon icon={faGear} className="text-default-400 w-4" />
                  設定
                </button>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-small text-default-600 hover:bg-default-100 transition-colors text-left"
                  style={{ transition: "background-color 0.1s linear" }}
                >
                  <FontAwesomeIcon icon={faRightFromBracket} className="text-default-400 w-4" />
                  從所有帳號登出
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────── Notification panel ─────────────────── */

const MOCK_NOTIFS = [
  {
    id: 1, unread: true,
    avatar: "L", avatarColor: "#7c3aed",
    title: "Laila Chu 在任務「品牌月曆」撰寫了評論。",
    excerpt: "社群日活動時間這串文字想要變色強調",
    time: "3月31日 下午6:45",
    from: "Laila Chu",
    fromCount: 2,
  },
  {
    id: 2, unread: true,
    avatar: "Y", avatarColor: "#059669",
    title: "「yirenyan」解決了有關「Facebook 廣告文案」的評論。",
    excerpt: "@SoWork 圖片上的英文字幕可以去除嗎",
    time: "1月22日 上午10:26",
    from: "yirenyan",
    fromCount: 1,
  },
  {
    id: 3, unread: false,
    avatar: "簡", avatarColor: "#0891b2",
    title: "簡維德 在任務「GO Tour DM」撰寫了評論。",
    excerpt: "建議這兩隻皮卡丘的外框用更明顯的顏色替代白色，避免過稿來回",
    time: "4天前",
    from: "簡維德",
    fromCount: 1,
  },
];

function NotifPanel({ open, onClose, offsetLeft }: { open: boolean; onClose: () => void; offsetLeft: number }) {
  const [readAll, setReadAll] = React.useState(false);

  return (
    <div
      style={{
        position: "fixed",
        top: 0, bottom: 0,
        left: offsetLeft,
        width: 380,
        background: "#fff",
        boxShadow: "4px 0 24px rgba(0,0,0,0.10)",
        zIndex: 39,
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-110%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        borderRight: "1px solid #f3f4f6",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>通知</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setReadAll(true)}
            title="將全部標示為已讀"
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
              borderRadius: 8, border: "none", background: "none",
              fontSize: 12, color: "#6b7280", cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faCheckDouble} style={{ fontSize: 11 }} />
            將全部標示為已讀
          </button>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", border: "none", background: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#9ca3af", cursor: "pointer", fontSize: 14,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {MOCK_NOTIFS.map((n) => {
          const isUnread = n.unread && !readAll;
          return (
            <div
              key={n.id}
              style={{
                display: "flex", gap: 12, padding: "12px 16px",
                background: isUnread ? "rgba(249,115,22,0.04)" : "transparent",
                borderBottom: "1px solid #f9fafb",
                cursor: "pointer", transition: "background 0.1s",
                position: "relative",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isUnread ? "rgba(249,115,22,0.08)" : "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = isUnread ? "rgba(249,115,22,0.04)" : "transparent")}
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: n.avatarColor,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 14, fontWeight: 700,
              }}>
                {n.avatar}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#111827", lineHeight: 1.45, marginBottom: 4 }}>
                  {n.title}
                </p>
                <div style={{
                  fontSize: 12, color: "#6b7280", background: "#f9fafb",
                  borderRadius: 6, padding: "4px 8px", marginBottom: 6,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {n.excerpt}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9ca3af" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                  <span>{n.time}</span>
                </div>
                <button style={{
                  marginTop: 4, fontSize: 12, fontWeight: 500, color: "#F97316",
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                }}>
                  來自「{n.from}」的 {n.fromCount} 個更新
                </button>
              </div>

              {/* Unread dot */}
              {isUnread && (
                <span style={{
                  position: "absolute", top: 14, right: 14,
                  width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Nav link ─────────────────────────── */

function SidebarNavLink({
  item, active, collapsed, onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        aria-label={item.label}
        style={{
          width: 64, height: 52, margin: "2px auto 0",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: active ? "#F97316" : "#9ca3af",
          transition: "color 0.1s linear",
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
        {/* Canva-style rounded-rect active/hover pill behind icon+label */}
        <span className="nav-pill" style={{
          position: "absolute",
          inset: "4px 6px",
          borderRadius: 10,
          background: active ? "rgba(249,115,22,0.10)" : "transparent",
          transition: "background 0.1s linear",
          pointerEvents: "none",
        }} />
        <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1, position: "relative" }}>
          {item.icon}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.2, fontWeight: active ? 600 : 500, textAlign: "center", position: "relative" }}>
          {item.label}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 8px", borderRadius: 8, border: "none",
        background: active ? "rgba(249,115,22,0.10)" : "none",
        cursor: "pointer", textAlign: "left",
        color: active ? "#F97316" : "#374151",
        fontWeight: active ? 600 : 400, fontSize: 14,
        transition: "background-color 0.1s linear, color 0.1s linear",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f3f4f6"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
    >
      <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}
