import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Compass, LayoutDashboard, PenLine, Smartphone, Users } from "lucide-react";
import { cx } from "./ui";

export const HUB_DISCLAIMER =
  "Concept demo built by SoWork OnBrand from publicly available information. Not affiliated with, sponsored or endorsed by ASUS.";

const NAV = [
  { to: "/hub", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/hub/strategy", label: "Strategy", icon: Compass },
  { to: "/hub/content", label: "Content & policy", icon: PenLine },
  { to: "/hub/reps", label: "Sales reps", icon: Users },
  { to: "/hub/performance", label: "Performance", icon: BarChart3 },
  { to: "/hub/rep-view", label: "Rep's LINE bot", icon: Smartphone },
];

export function useHubTitle(page?: string) {
  React.useEffect(() => {
    const previous = document.title;
    document.title = page ? `${page} · ExpertHub Sales Hub` : "ExpertHub Sales Hub";
    return () => {
      document.title = previous;
    };
  }, [page]);
}

export default function HubShell() {
  useHubTitle();
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-[13px] font-bold text-white">EH</div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold leading-tight">ExpertHub · Sales Hub</div>
              <div className="truncate text-[11px] text-stone-500">Equip every sales rep with a marketing team — for growth and compliance</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-stone-300 px-2 py-0.5 text-[11px] font-medium text-stone-600 sm:inline">Concept demo</span>
            <span className="text-[11px] text-stone-500">Powered by <span className="font-semibold text-stone-800">OnBrand</span></span>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-3 py-2 lg:hidden" aria-label="Sections">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px]", isActive ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")
              }
            >
              <n.icon className="h-3.5 w-3.5" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 lg:px-6">
        <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-[210px] shrink-0 flex-col py-6 lg:flex">
          <nav className="flex flex-col gap-0.5" aria-label="Sections">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px]", isActive ? "bg-stone-200/70 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100")
                }
              >
                <n.icon className="h-4 w-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-2 border-t border-stone-200 pt-4 text-[11px] leading-relaxed text-stone-500">
            <div className="font-medium text-stone-700">Three layers</div>
            <div>Strategy → what reps may say</div>
            <div>Content → how they say it, checked</div>
            <div>Performance → what it earned</div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-6">
          <Outlet />
          <footer className="mt-10 border-t border-stone-200 pt-4 text-[11px] text-stone-500">{HUB_DISCLAIMER}</footer>
        </main>
      </div>
    </div>
  );
}
