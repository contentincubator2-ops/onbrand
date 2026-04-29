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

  // Sidebar collapsed state
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try { return localStorage.getItem("sowork.sidebarCollapsed") === "1"; }
    catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem("sowork.sidebarCollapsed", nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  const sidebarWidth = collapsed ? 64 : 200;

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
      className="fixed left-0 top-0 bottom-0 z-40 bg-content1 border-r border-divider flex flex-col transition-[width] duration-200"
      style={{ width }}
    >
      {/* Top: logo monogram + collapse toggle */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-divider shrink-0">
        <Avatar name="SO" size="sm" radius="md" color="primary" classNames={{ name: "font-bold" }} />
        {!collapsed && (
          <Tooltip content="收合側邊欄" placement="right">
            <Button isIconOnly size="sm" variant="light" onPress={onToggle} aria-label="收合側邊欄">
              <FontAwesomeIcon icon={faChevronLeft} />
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Primary CTA: + 建立 */}
      <div className="p-3 shrink-0">
        <Button
          color="primary"
          variant="solid"
          onPress={() => onNavigate("/")}
          isIconOnly={collapsed}
          fullWidth={!collapsed}
          aria-label="建立任務"
          startContent={!collapsed ? <FontAwesomeIcon icon={faPlus} /> : undefined}
        >
          {collapsed ? <FontAwesomeIcon icon={faPlus} /> : "建立任務"}
        </Button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
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
          <Tooltip content="顯示更多" placement="right">
            <Button isIconOnly variant="light" aria-label="顯示更多" className="mt-1">
              <FontAwesomeIcon icon={faEllipsis} />
            </Button>
          </Tooltip>
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

      {/* Bottom: collapse toggle when collapsed */}
      {collapsed && (
        <div className="p-2 border-t border-divider shrink-0">
          <Tooltip content="展開側邊欄" placement="right">
            <Button isIconOnly size="sm" variant="light" fullWidth onPress={onToggle} aria-label="展開側邊欄">
              <FontAwesomeIcon icon={faChevronRight} />
            </Button>
          </Tooltip>
        </div>
      )}
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
  const inner = collapsed ? (
    <Button
      isIconOnly
      onPress={onClick}
      variant={active ? "flat" : "light"}
      color={active ? "primary" : "default"}
      aria-label={item.label}
      className="mt-1"
    >
      {item.icon}
    </Button>
  ) : (
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

  return collapsed ? (
    <Tooltip content={item.label} placement="right">
      {inner}
    </Tooltip>
  ) : inner;
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
  /** Active scope (brand × product × event). Pages should prefer this. */
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}
