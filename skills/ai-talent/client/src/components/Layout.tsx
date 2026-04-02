import { NavLink } from "react-router-dom";
import { getUserId } from "../lib/utils";

const navItems = [
  { to: "/",          label: "Dashboard",   icon: "🏠" },
  { to: "/brand",     label: "品牌分析",     icon: "🎯" },
  { to: "/campaigns", label: "Campaigns",   icon: "📣" },
  { to: "/credits",   label: "Credits",     icon: "💳" },
  { to: "/settings",  label: "設定",         icon: "⚙️" },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const userId = getUserId();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white tracking-wide">
            SoWork <span className="text-indigo-400">Enterprise</span>
          </h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 truncate">User ID</p>
          <p className="text-xs text-gray-300 font-mono truncate">{userId}</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
