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
    <div className="min-h-screen bg-mos-paper">
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
        <header className="border-b border-mos-hair bg-white sticky top-0 z-30">
          <div className="px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleCollapsed}
                className="lg:hidden p-1.5 text-mos-muted hover:text-mos-ink rounded transition"
                title="切換側邊欄"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
              <button
                onClick={() => navigate("/")}
                className="font-display text-[0.7rem] tracking-[0.24em] uppercase text-mos-ink hover:text-mos-teal-ink transition"
              >
                SOWORK · Marketing OS
              </button>
            </div>

            <div className="flex items-center gap-3">
              <BrandSwitcher
                brands={brands}
                selectedId={brandId}
                onSelect={setBrandId}
              />
              <button
                onClick={async () => {
                  try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); }
                  catch {}
                  window.location.href = "/auth/login";
                }}
                className="text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink"
              >
                登出
              </button>
            </div>
          </div>
        </header>

        <Outlet context={{ brandId, setBrandId, brands }} />
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
  {
    to: "/",
    label: "首頁",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    to: "/projects",
    label: "專案",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
    ),
  },
  {
    to: "/templates",
    label: "任務範本",
    matchPrefix: "/templates",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 14h6" />
      </svg>
    ),
  },
  {
    to: "/brands",
    label: "品牌",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    to: "/ai",
    label: "AI 工具",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
      </svg>
    ),
  },
  {
    to: "/boardroom",
    label: "比稿",
    icon: (
      // 麥克風 — 邀比稿的舞台符號
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
        <path d="M8 21h8" />
      </svg>
    ),
  },
  {
    to: "/playbooks",
    label: "成長方案",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5v14l8-4 8 4V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
        <path d="M9 9h6" />
      </svg>
    ),
  },
  {
    to: "/media",
    label: "媒體中心",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M7 10v4M11 9v6M15 10v4M19 11v2" />
      </svg>
    ),
  },
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
      className="fixed left-0 top-0 bottom-0 z-40 bg-white border-r border-mos-hair flex flex-col transition-[width] duration-200"
      style={{ width }}
    >
      {/* Top: logo monogram + collapse toggle */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-mos-hair shrink-0">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-mos-ink text-white font-display text-[0.84rem] tracking-[0.04em]">
          SO
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 text-mos-muted hover:text-mos-ink rounded transition"
            title="收合側邊欄"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Primary CTA: + 建立 */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => onNavigate("/")}
          className={[
            "w-full flex items-center gap-2 rounded-lg transition",
            "bg-[#5B3CC8] hover:bg-[#4A2FB0] text-white font-medium",
            collapsed ? "h-10 justify-center px-0" : "h-10 px-3 justify-start",
          ].join(" ")}
          title="建立任務"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && <span className="text-[0.82rem]">建立任務</span>}
        </button>
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

        {/* Show-more (collapsed shows ⋯, expanded shows full label) */}
        <button
          className={[
            "w-full flex items-center gap-3 rounded-lg transition mt-1",
            "text-mos-muted hover:text-mos-ink hover:bg-mos-ink/[0.04]",
            collapsed ? "h-12 justify-center px-0 flex-col gap-1" : "h-10 px-3",
          ].join(" ")}
          title="顯示更多"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
          {collapsed ? (
            <span className="text-[0.58rem] leading-none">更多</span>
          ) : (
            <span className="text-[0.82rem]">顯示更多</span>
          )}
        </button>
      </nav>

      {/* Bottom: collapse toggle when collapsed */}
      {collapsed && (
        <div className="p-2 border-t border-mos-hair shrink-0">
          <button
            onClick={onToggle}
            className="w-full h-9 flex items-center justify-center text-mos-muted hover:text-mos-ink rounded-lg transition"
            title="展開側邊欄"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
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
  return (
    <button
      onClick={onClick}
      className={[
        "relative w-full flex rounded-lg transition mt-1",
        active
          ? "bg-mos-ink/[0.06] text-mos-ink"
          : "text-mos-muted hover:text-mos-ink hover:bg-mos-ink/[0.04]",
        collapsed ? "h-12 flex-col items-center justify-center gap-1 px-0" : "h-10 items-center gap-3 px-3",
      ].join(" ")}
      title={item.label}
    >
      {active && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
          style={{ background: "#5B3CC8" }}
          aria-hidden
        />
      )}
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
        {item.icon}
      </span>
      {collapsed ? (
        <span className="text-[0.58rem] leading-none">{item.label}</span>
      ) : (
        <span className="text-[0.82rem]">{item.label}</span>
      )}
    </button>
  );
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
}
