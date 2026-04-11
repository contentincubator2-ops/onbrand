/**
 * Layout.tsx — Sprint 3 Claude warm shell
 *
 * Minimal icon rail (56px) with warm neutral palette.
 * Claude design: #faf9f7 bg, amber accents (#c9823a), refined spacing.
 */
import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export default function Layout() {
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
    <div className="flex h-screen overflow-hidden" style={{ background: dark ? '#1a1918' : '#faf9f7' }}>
      {/* ===== Thin icon rail — Claude warm ===== */}
      <aside className="shrink-0 flex flex-col items-center justify-between w-14 py-3"
        style={{
          borderRight: `1px solid ${dark ? '#2d2b28' : '#e8e5e0'}`,
          background: dark ? '#1f1e1c' : '#f5f2ed',
        }}
      >
        {/* Top: Logo */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
            style={{ background: '#c9823a' }}
            title="SoWork Home"
          >
            <span className="text-white text-sm font-bold">S</span>
          </button>
        </div>

        {/* Bottom: utility icons */}
        <div className="flex flex-col items-center gap-2">
          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: dark ? '#9b8fa0' : '#9b8fa0' }}
            onMouseEnter={e => { e.currentTarget.style.color = dark ? '#e8e5e0' : '#5a4f47'; e.currentTarget.style.background = dark ? '#2d2b28' : '#ece8e2'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9b8fa0'; e.currentTarget.style.background = 'transparent'; }}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Dark mode */}
          <button
            onClick={() => setDark(d => !d)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: '#9b8fa0' }}
            onMouseEnter={e => { e.currentTarget.style.color = dark ? '#e8e5e0' : '#5a4f47'; e.currentTarget.style.background = dark ? '#2d2b28' : '#ece8e2'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9b8fa0'; e.currentTarget.style.background = 'transparent'; }}
            title={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: '#9b8fa0' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#c9523a'; e.currentTarget.style.background = dark ? '#2d2020' : '#fdf0ed'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9b8fa0'; e.currentTarget.style.background = 'transparent'; }}
            title="Logout"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ===== Main content: WorkspacePage renders here ===== */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
