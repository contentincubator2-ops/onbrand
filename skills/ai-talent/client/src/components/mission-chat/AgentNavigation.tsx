/**
 * AgentNavigation — Left sidebar: agent list + module switcher.
 * Orange theme, search filter, status badges.
 */
import { useState } from "react";

export interface Agent {
  id: number;
  name: string;
  title: string;
  avatar: string;
  status: "online" | "busy" | "offline";
  specialty?: string;
}

const MODULES = [
  { id: "brand",   label: "品牌定位", icon: "🎯" },
  { id: "content", label: "內容生成", icon: "✍️" },
  { id: "market",  label: "市場分析", icon: "📊" },
  { id: "report",  label: "數據報告", icon: "📈" },
];

const STATUS_BADGE: Record<Agent["status"], { dot: string; label: string }> = {
  online:  { dot: "bg-emerald-400", label: "線上" },
  busy:    { dot: "bg-amber-400",   label: "忙碌" },
  offline: { dot: "bg-gray-400",    label: "離線" },
};

interface Props {
  agents: Agent[];
  activeId: number;
  onSelect: (id: number) => void;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

export default function AgentNavigation({ agents, activeId, onSelect, activeModule, onModuleChange }: Props) {
  const [query, setQuery] = useState("");

  const filtered = agents.filter(a =>
    a.name.includes(query) || a.title.includes(query) || (a.specialty ?? "").includes(query)
  );

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-700">
        <span className="text-[#FF6B35] font-bold text-lg tracking-tight">SoWork</span>
        <span className="text-gray-400 text-lg font-light"> Enterprise</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜尋 Agent…"
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-[#FF6B35]/60 focus:ring-1 focus:ring-[#FF6B35]/30 transition"
        />
      </div>

      {/* Agent List */}
      <p className="px-4 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Agents</p>
      <ul className="flex-1 overflow-y-auto px-2 space-y-0.5 min-h-0">
        {filtered.map(a => {
          const badge = STATUS_BADGE[a.status];
          const active = a.id === activeId;
          return (
            <li key={a.id}>
              <button
                onClick={() => onSelect(a.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  active ? "bg-[#FF6B35]/10 text-[#FF6B35]" : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                }`}
              >
                <span className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                  active ? "bg-[#FF6B35] text-white" : "bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300"
                }`}>
                  {a.avatar}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${badge.dot}`} title={badge.label} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{a.name}</p>
                  <p className="text-xs text-gray-400 leading-tight truncate">{a.title}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Module Switcher */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">功能模塊</p>
        <div className="grid grid-cols-2 gap-1.5">
          {MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => onModuleChange(m.id)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeModule === m.id
                  ? "bg-[#FF6B35] text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-[#FF6B35]/10 hover:text-[#FF6B35]"
              }`}
            >
              <span>{m.icon}</span>
              <span className="truncate">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
