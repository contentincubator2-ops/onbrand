/**
 * Layout.tsx — 精簡版
 *
 * 移除左側 56px icon rail。
 * Settings / Dark mode / Logout 功能已移至 MissionContextRail 底部工具列。
 */
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

export default function Layout() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("theme") === "dark" ||
    (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [dark]);

  // Expose dark toggle globally so MissionContextRail can call it via window event
  useEffect(() => {
    const handler = () => setDark(d => !d);
    window.addEventListener("toggle-dark", handler);
    return () => window.removeEventListener("toggle-dark", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: dark ? '#111827' : '#FFFFFF' }}>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
