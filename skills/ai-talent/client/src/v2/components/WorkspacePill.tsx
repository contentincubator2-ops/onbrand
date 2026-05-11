/**
 * WorkspacePill — top-bar workspace switcher.
 *
 * 2026-05-12. Shows current workspace name (the agency / team container)
 * with a dropdown to switch when the user belongs to >1 workspace.
 * Clicking the gear icon jumps to /settings/workspace.
 *
 * "Switching" = stashes activeWorkspaceId in localStorage so brand queries
 * can filter by it. Actual brand filtering happens at the consumer side;
 * this just owns the active-workspace state.
 */
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { Building2, ChevronDown, Settings } from "lucide-react";

const LS_KEY = "drop.activeWorkspaceId";

export function setActiveWorkspaceId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, String(id));
    window.dispatchEvent(new CustomEvent("drop:workspace-changed"));
  } catch {}
}

export function getActiveWorkspaceId(): number | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export default function WorkspacePill() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(getActiveWorkspaceId());
  const ref = useRef<HTMLDivElement>(null);

  const listQ = (trpc as any).tenant?.listMine?.useQuery
    ? (trpc as any).tenant.listMine.useQuery(undefined, {
        refetchOnWindowFocus: false,
        retry: false,
      })
    : { data: null };
  const workspaces = (listQ?.data ?? []) as any[];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-pick first workspace if none selected
  useEffect(() => {
    if (activeId === null && workspaces.length > 0) {
      setActiveWorkspaceId(workspaces[0].id);
      setActiveId(workspaces[0].id);
    }
  }, [workspaces, activeId]);

  if (!workspaces || workspaces.length === 0) return null;
  // hide entirely for solo users with 1 workspace — visual noise
  if (workspaces.length === 1 && !workspaces[0].whiteLabelName) return null;

  const active = workspaces.find((w: any) => w.id === activeId) ?? workspaces[0];

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:border-neutral-400 transition"
        title="切換 workspace"
      >
        <Building2 size={12} className="text-neutral-500" />
        <span className="font-medium text-neutral-700 max-w-[140px] truncate">
          {active?.whiteLabelName || active?.name}
        </span>
        {workspaces.length > 1 && <ChevronDown size={12} className="text-neutral-400" />}
      </button>
      <button
        onClick={() => navigate("/settings/workspace")}
        className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition"
        title="Workspace 設定"
      >
        <Settings size={12} />
      </button>

      {open && workspaces.length > 1 && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-white border border-neutral-200 rounded-lg shadow-lg z-50 py-1">
          {workspaces.map((w: any) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWorkspaceId(w.id);
                setActiveId(w.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-neutral-50 transition ${
                w.id === activeId ? "bg-neutral-50" : ""
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium text-neutral-800">
                  {w.whiteLabelName || w.name}
                </span>
                <span className="text-neutral-400">
                  {w.memberCount} 位成員 · {w.brandCount} 品牌
                </span>
              </div>
              {w.id === activeId && (
                <span className="text-[10px] text-emerald-600 font-medium">使用中</span>
              )}
            </button>
          ))}
          <div className="border-t border-neutral-100 mt-1 pt-1 px-3 py-2">
            <button
              onClick={() => { setOpen(false); navigate("/settings/workspace"); }}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 transition"
            >
              管理 workspace →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
