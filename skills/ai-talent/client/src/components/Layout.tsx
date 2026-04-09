import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

const navSections = [
  {
    title: "WORKSPACE",
    items: [
      {
        to: "/",
        label: "Mission Dashboard",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
        ),
      },
      {
        to: "/chat",
        label: "AI Chat",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        ),
      },
    ],
  },
  {
    title: "A2A ORCHESTRATION",
    items: [
      {
        to: "/campaigns",
        label: "Campaigns",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        ),
      },
      {
        to: "/brand-analysis",
        label: "Brand Analysis",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
        ),
      },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      {
        to: "/credits",
        label: "Credits & Billing",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        ),
      },
      {
        to: "/settings",
        label: "Settings",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        ),
      },
    ],
  },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const [dark, setDark] = useState(() =>
    localStorage.getItem("theme") === "dark" ||
    (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [dark]);

  const logout = () => { localStorage.removeItem("authToken"); navigate("/login"); };

  return (
    <div className="flex h-screen bg-white dark:bg-neutral-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 transition-all duration-200"
        style={{ width: collapsed ? 56 : 240 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-neutral-200 dark:border-neutral-800" style={{ minHeight: 56 }}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">S</span>
              </div>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 tracking-tight">SoWork Enterprise</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navSections.map(section => (
            <div key={section.title} className="mb-4">
              {!collapsed && (
                <p className="px-4 pb-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5 px-2">
                {section.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium border border-orange-200 dark:border-orange-800/50"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
                      }`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 pb-3 border-t border-neutral-200 dark:border-neutral-800 pt-2 space-y-1">
          <button
            onClick={() => setDark(d => !d)}
            className="flex items-center gap-3 px-2 py-2 w-full rounded-lg text-sm text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
            title={dark ? "Light mode" : "Dark mode"}
          >
            <span className="shrink-0">
              {dark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </span>
            {!collapsed && <span>{dark ? "Light" : "Dark"}</span>}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-2 py-2 w-full rounded-lg text-sm text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors"
            title="Logout"
          >
            <span className="shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
