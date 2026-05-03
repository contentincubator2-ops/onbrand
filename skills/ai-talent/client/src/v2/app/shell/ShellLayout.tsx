/**
 * ShellLayout — Canva-style left sidebar + top utility bar.
 *
 * Layout:
 *   ┌──┬───────────────────────────────────────┐
 *   │  │  top utility bar (logo · brand · 登出) │
 *   │SB├───────────────────────────────────────┤
 *   │  │  page outlet (hero / lists / grids)   │
 *   │  │                                       │
 *   └──┴───────────────────────────────────────┘
 *
 * Sidebar mirrors Canva's left rail: a top "+ 建立" CTA followed by a
 * stack of icon+label nav cells (首頁 / 專案 / 任務範本 / 品牌 / AI / 顯示更多).
 * Active cell shows a subtle left accent bar and tinted background.
 *
 * The sidebar is collapsible — click the chevron at top-left to toggle
 * between 72px (icon-only) and 200px (icon + label) modes. State
 * persists in localStorage. Below 1024px viewport the sidebar collapses
 * automatically.
 */
import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import BrandSwitcher from "./BrandSwitcher";
import ScopeBar, { useScopeState, type ScopeState } from "./ScopeBar";
import { Avatar, Button, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse, faFolderOpen, faTableCells, faUserGroup, faWandMagicSparkles,
  faMicrophone, faBookBookmark, faEllipsis,
  faChevronLeft, faChevronRight, faPlus, faBars, faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";

export default function ShellLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
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

  // ScopeBar (top-right) — brand × product × event choose-one. Replaces the
  // legacy BrandSwitcher per CJ direction 2026-04-28.
  const [scope, setScope] = useScopeState();
  // Keep legacy brandId state in sync with scope.brandId so existing pages
  // that read ShellOutletCtx.brandId still work without refactor.
  React.useEffect(() => {
    if (scope.brandId && scope.brandId !== brandId) setBrandId(scope.brandId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.brandId]);

  // Sidebar collapsed state — default true (70 px icon+label stacked)
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      const v = localStorage.getItem("sowork.sidebarCollapsed");
      return v === null ? true : v === "1"; // default collapsed
    }
    catch { return true; }
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem("sowork.sidebarCollapsed", nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  const sidebarWidth = collapsed ? 70 : 200;

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Left sidebar (fixed) ─────────────────────────────────── */}
      <Sidebar
        width={sidebarWidth}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        currentPath={loc.pathname}
        onNavigate={(to) => navigate(to)}
      />

      {/* ─── Right column (top bar + outlet) ──────────────────────── */}
      <div style={{ paddingLeft: sidebarWidth }} className="transition-[padding] duration-200">
        <header className="border-b border-divider bg-content1 sticky top-0 z-30">
          <div className="px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tooltip content="切換側邊欄">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={toggleCollapsed}
                  aria-label="切換側邊欄"
                  className="lg:hidden"
                >
                  <FontAwesomeIcon icon={faBars} />
                </Button>
              </Tooltip>
              <Button
                size="sm"
                variant="light"
                onPress={() => navigate("/")}
              >
                SOWORK · Marketing OS
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <ScopeBar scope={scope} setScope={setScope} />
              <Button
                size="sm"
                variant="light"
                startContent={<FontAwesomeIcon icon={faRightFromBracket} />}
                onPress={async () => {
                  try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); }
                  catch {}
                  window.location.href = "/auth/login";
                }}
              >
                登出
              </Button>
            </div>
          </div>
        </header>

        <Outlet context={{ brandId, setBrandId, brands, scope, setScope }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Sidebar ─────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  /** Inline SVG icon. */
  icon: React.ReactNode;
  /** True if this item is the primary CTA (gets emphasized styling). */
  primary?: boolean;
  /** Match by prefix instead of exact when active. */
  matchPrefix?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/",           label: "首頁",     icon: <FontAwesomeIcon icon={faHouse} /> },
  { to: "/projects",   label: "專案",     icon: <FontAwesomeIcon icon={faFolderOpen} /> },
  { to: "/templates",  label: "任務範本", matchPrefix: "/templates", icon: <FontAwesomeIcon icon={faTableCells} /> },
  { to: "/brands",     label: "品牌",     icon: <FontAwesomeIcon icon={faUserGroup} /> },
  { to: "/ai",         label: "AI 工具",  icon: <FontAwesomeIcon icon={faWandMagicSparkles} /> },
  { to: "/boardroom",  label: "比稿",     icon: <FontAwesomeIcon icon={faMicrophone} /> },
  { to: "/playbooks",  label: "成長方案", icon: <FontAwesomeIcon icon={faBookBookmark} /> },
];

function Sidebar({
  width, collapsed, onToggle, currentPath, onNavigate,
}: {
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  currentPath: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-[width] duration-200"
      style={{ width }}
    >
      {/* Top: logo monogram */}
      <div className="h-14 flex items-center justify-center shrink-0">
        <Avatar name="SO" size="sm" radius="md" color="primary" classNames={{ name: "font-bold text-xs" }} />
      </div>

      {/* Primary CTA: + 建立 */}
      <div className={`shrink-0 ${collapsed ? "px-2 py-3" : "p-3"}`}>
        {collapsed ? (
          <button
            onClick={() => onNavigate("/")}
            aria-label="建立任務"
            style={{
              background: "#F97316",
              transition: "background-color 0.1s linear, box-shadow 0.1s linear, color 0.1s linear, transform 0.07s",
            }}
            className="mx-auto flex items-center justify-center w-10 h-10 rounded-full text-white shadow-sm hover:shadow-md active:scale-95"
            onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
            onMouseLeave={e => (e.currentTarget.style.background = "#F97316")}
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </button>
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
        {collapsed ? (
          <button
            aria-label="顯示更多"
            className="w-full mt-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-default-500 hover:bg-default-100 transition-colors"
          >
            <FontAwesomeIcon icon={faEllipsis} className="text-sm" />
            <span className="text-[9px] leading-tight">更多</span>
          </button>
        ) : (
          <Button
            variant="light"
            fullWidth
            aria-label="顯示更多"
            className="mt-1 justify-start"
            startContent={<FontAwesomeIcon icon={faEllipsis} />}
          >
            顯示更多
          </Button>
        )}
      </nav>

      {/* Bottom: collapse toggle */}
      <div className="p-2 shrink-0">
        <Tooltip content={collapsed ? "展開側邊欄" : "收合側邊欄"} placement="right">
          <Button isIconOnly size="sm" variant="light" fullWidth onPress={onToggle} aria-label="切換側邊欄">
            <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
          </Button>
        </Tooltip>
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
        className={[
          "w-full mt-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors",
          active
            ? "bg-primary-50 text-primary"
            : "text-default-500 hover:bg-default-100 hover:text-default-800",
        ].join(" ")}
      >
        <span className="text-sm leading-none">{item.icon}</span>
        <span className="text-[9px] leading-tight font-medium max-w-full px-0.5 text-center line-clamp-1">
          {item.label}
        </span>
      </button>
    );
  }

  return (
    <Button
      onPress={onClick}
      variant={active ? "flat" : "light"}
      color={active ? "primary" : "default"}
      fullWidth
      aria-label={item.label}
      className="mt-1 justify-start"
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
  /** Active scope (brand × product × event). Pages should prefer this. */
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}
