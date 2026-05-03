/**
 * ShellLayout — Canva-style 70px icon-only sidebar, no top header.
 *
 * Brand/product/event scope picker moved from top header → bottom
 * avatar popup (Canva pattern: account menu at bottom-left).
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
  faChevronLeft, faChevronRight, faPlus, faBars, faRightFromBracket,
  faGear,
} from "@fortawesome/free-solid-svg-icons";

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

  // Sidebar always 70px — clear any old expanded localStorage state
  React.useEffect(() => {
    try { localStorage.removeItem("sowork.sidebarCollapsed"); } catch {}
  }, []);
  const collapsed = true;
  const toggleCollapsed = () => {};

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    window.location.href = "/auth/login";
  };

  const sidebarWidth = 70;

  return (
    <div className="min-h-screen" style={{ background: "rgb(252,251,254)" }}>
      <Sidebar
        width={sidebarWidth}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        onNavigate={(to) => navigate(to)}
        scope={scope}
        setScope={setScope}
        onLogout={handleLogout}
      />

      {/* Content area — no top header */}
      <div style={{ paddingLeft: sidebarWidth }} className="transition-[padding] duration-200">
        <Outlet context={{ brandId, setBrandId, brands, scope, setScope }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Sidebar ─────────────────────────── */

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

function Sidebar({
  width, collapsed, onToggle, currentPath, onNavigate, scope, setScope, onLogout,
}: {
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  onNavigate: (to: string) => void;
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onLogout: () => void;
}) {
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const avatarRef = React.useRef<HTMLDivElement>(null);

  // Close popup on outside click
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

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-[width] duration-200"
      style={{ width }}
    >
      {/* Top: SO logo */}
      <div className="h-14 flex items-center justify-center shrink-0">
        <Avatar name="SO" size="sm" radius="md" color="primary" classNames={{ name: "font-bold text-xs" }} />
      </div>

      {/* CTA: + 建立 */}
      <div className={`shrink-0 ${collapsed ? "px-2 py-3" : "p-3"}`}>
        {collapsed ? (
          <Tooltip content="建立任務" placement="right">
            <button
              onClick={() => onNavigate("/")}
              aria-label="建立任務"
              style={{
                background: "#F97316",
                transition: "background-color 0.1s linear, box-shadow 0.1s linear, color 0.1s linear, transform 0.07s",
              }}
              className="mx-auto flex items-center justify-center w-7 h-7 rounded-full text-white shadow-sm hover:shadow-md active:scale-95"
              onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
              onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
            >
              <FontAwesomeIcon icon={faPlus} className="text-base" />
            </button>
          </Tooltip>
        ) : (
          <Button
            variant="solid"
            onPress={() => onNavigate("/")}
            fullWidth
            aria-label="建立任務"
            startContent={<FontAwesomeIcon icon={faPlus} />}
            style={{ background: "#F97316", color: "#fff", transition: "background-color 0.1s linear, box-shadow 0.1s linear, color 0.1s linear, transform 0.07s" }}
          >
            建立任務
          </Button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto pb-3" style={{ paddingInline: collapsed ? "6px" : "8px" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.matchPrefix
            ? currentPath.startsWith(item.matchPrefix)
            : currentPath === item.to ||
              (item.to === "/" && currentPath === "/") ||
              (item.to !== "/" && currentPath.startsWith(item.to));
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

        {/* Show-more */}
        <Tooltip content="顯示更多" placement="right">
          {collapsed ? (
            <button
              aria-label="顯示更多"
              style={{ transition: "color 0.1s linear" }}
              className="w-full mt-1 flex items-center justify-center py-2.5 rounded-xl text-default-400 hover:text-default-700"
            >
              <FontAwesomeIcon icon={faEllipsis} className="text-sm" />
            </button>
          ) : (
            <Button variant="light" fullWidth aria-label="顯示更多" className="mt-1 justify-start" startContent={<FontAwesomeIcon icon={faEllipsis} />}>
              顯示更多
            </Button>
          )}
        </Tooltip>
      </nav>

      {/* ─── Bottom: collapse toggle + bell + avatar popup ─── */}
      <div className={`shrink-0 pb-3 flex flex-col items-center gap-1 ${collapsed ? "px-2" : "px-3"}`}>
        {/* Collapse toggle — 36×36px */}
        <Tooltip content={collapsed ? "展開側邊欄" : "收合側邊欄"} placement="right">
          <button
            onClick={onToggle}
            aria-label="切換側邊欄"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none", background: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.1s linear, background-color 0.1s linear",
              fontSize: 12,
            }}
            className="text-default-400 hover:text-default-700 hover:bg-default-100"
          >
            <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
          </button>
        </Tooltip>

        {/* Notification bell — 36×36px hit area (Canva spec) */}
        <Tooltip content="通知" placement="right">
          <button
            aria-label="通知"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none", background: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.1s linear, background-color 0.1s linear",
              fontSize: 16,
            }}
            className="text-default-400 hover:text-default-700 hover:bg-default-100"
          >
            <FontAwesomeIcon icon={faBell} />
          </button>
        </Tooltip>

        {/* Avatar — 40×40px (Canva spec) */}
        <div ref={avatarRef} className="relative mt-1 w-full flex justify-center">
          <button
            aria-label="帳號與品牌切換"
            onClick={() => setAvatarOpen((v) => !v)}
            style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "none", padding: 0 }}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
          >
            <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold text-sm" }} />
          </button>

          {/* Popup panel */}
          {avatarOpen && (
            <div
              className="absolute bottom-full left-full mb-2 ml-2 w-80 rounded-2xl border border-divider bg-content1 shadow-xl z-50"
              style={{ animation: "slideInUp 0.15s ease-out" }}
            >
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
                <Avatar name="S" size="md" radius="full" color="primary" classNames={{ name: "font-bold" }} />
                <div className="min-w-0">
                  <p className="text-small font-semibold truncate">SoWork</p>
                  <p className="text-tiny text-default-500 truncate">sowork@sowork.tw</p>
                </div>
              </div>

              {/* Scope picker (brand / product / event) */}
              <div className="px-4 py-3 border-b border-divider">
                <p className="text-tiny font-semibold text-default-500 uppercase tracking-wider mb-2">工作範圍</p>
                <ScopeBar scope={scope} setScope={setScope} />
              </div>

              {/* Actions */}
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
          transition: "color 0.1s linear, transform 0.07s",
          width: 64,
          height: 52,
          background: "none",
          border: "none",
          padding: 0,
          margin: "2px auto 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          color: active ? "#F97316" : undefined,
        }}
        className={active ? "" : "text-default-400 hover:text-default-700"}
      >
        {/* 24×24 icon box — matches Canva's SVG slot */}
        <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1 }}>
          {item.icon}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1.2, fontWeight: 500, textAlign: "center" }}>
          {item.label}
        </span>
      </button>
    );
  }

  return (
    <Button
      onPress={onClick}
      variant="light"
      fullWidth
      aria-label={item.label}
      className={`mt-1 justify-start transition-colors duration-100 ${active ? "text-[#F97316] font-semibold" : ""}`}
      style={{ background: "rgba(0,0,0,0)" }}
      startContent={item.icon}
    >
      {item.label}
    </Button>
  );
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}
