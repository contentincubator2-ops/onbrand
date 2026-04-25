/**
 * ShellLayout — top brand bar + center stage.
 *
 * Replaces the legacy three-column AppShell. No left rail of brands,
 * no right panel of tools. Brand context lives in a switcher in the
 * top-right; tools/agents are surfaced by the page itself (Mission
 * Detail right panel etc.).
 */
import React from "react";
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import BrandSwitcher from "./BrandSwitcher";

export default function ShellLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const brandsQuery = trpc.brand.listByMember.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const brands = (brandsQuery.data as any[]) ?? [];

  // Selected brand persists in localStorage (legacy convention)
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

  const navTab = (to: string, label: string) => (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        [
          "px-3 py-1.5 text-[0.74rem] tracking-[0.18em] uppercase transition",
          isActive
            ? "text-mos-ink border-b-2 border-mos-ink"
            : "text-mos-muted hover:text-mos-ink border-b-2 border-transparent",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-mos-paper">
      {/* ─── Top brand bar ─────────────────────────────────────── */}
      <header className="border-b border-mos-hair bg-white sticky top-0 z-40">
        <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="font-display text-[0.74rem] tracking-[0.28em] uppercase text-mos-ink hover:text-mos-teal-ink transition"
          >
            SOWORK · Marketing OS
          </button>

          <nav className="flex items-center gap-1">
            {navTab("/", "任務牆")}
            {navTab("/methodology", "方法論型錄")}
          </nav>

          <div className="flex items-center gap-3">
            <BrandSwitcher
              brands={brands}
              selectedId={brandId}
              onSelect={setBrandId}
            />
            <button
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch {}
                window.location.href = "/auth/login";
              }}
              className="text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      {/* ─── Center stage ──────────────────────────────────────── */}
      <Outlet context={{ brandId, setBrandId, brands }} />
    </div>
  );
}

export interface ShellOutletCtx {
  brandId: number | null;
  setBrandId: (id: number | null) => void;
  brands: any[];
}
