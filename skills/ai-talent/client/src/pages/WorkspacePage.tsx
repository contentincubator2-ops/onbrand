/**
 * WorkspacePage.tsx
 * Three-column workspace layout: Left (MissionContext) | Center (Chat/Execution) | Right (Team/Artifacts/Review)
 * This replaces the old single-column ChatPage as the primary workspace experience.
 * 
 * The existing ChatPage logic (A2A, TeamAssembly, SSE, relay) is preserved in ChatPage.tsx.
 * This page composes the three-column shell around it and adds workspace-level state.
 */

import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import MissionContextRail, { type MissionContext, type TaskUnit } from "../components/chat/MissionContextRail";
import ArtifactReviewPanel, { type TeamMember, type Artifact, type ReviewItem } from "../components/chat/ArtifactReviewPanel";

// ---- Workspace types ----

const WORKSPACES = [
  { id: 'facebook',  label: 'Facebook',  icon: 'f' },
  { id: 'linkedin',  label: 'LinkedIn',  icon: 'in' },
  { id: 'youtube',   label: 'YouTube',   icon: 'yt' },
  { id: 'pr',        label: 'PR',        icon: 'pr' },
  { id: 'event',     label: 'Event',     icon: 'ev' },
  { id: 'instore',   label: 'In-store',  icon: 'is' },
] as const;

type WorkspaceId = typeof WORKSPACES[number]['id'];

// ---- Component ----

export default function WorkspacePage() {
  // Workspace selector
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('facebook');
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  // Brand from existing trpc
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const brands = brandsQuery.data ?? [];
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  // Set default brand
  if (brands.length > 0 && !activeBrandId) {
    const def = brands.find((b: any) => b.isDefault) ?? brands[0];
    setActiveBrandId(def.id);
  }

  // Mission context — will be populated by ChatPage callbacks in future
  const [mission, setMission] = useState<MissionContext | null>(null);

  // Right panel state — will be populated by ChatPage's TeamAssembly in future
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);

  const currentWorkspace = WORKSPACES.find(w => w.id === activeWorkspace)!;

  return (
    <div className="flex h-screen bg-white dark:bg-[#212121] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ===== LEFT RAIL ===== */}
      <MissionContextRail
        brand={activeBrand ? { name: activeBrand.name, id: activeBrand.id } : null}
        mission={mission}
      />

      {/* ===== CENTER: Top bar + Chat ===== */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#212121]">
          {/* Left: workspace selector */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowWorkspaceMenu(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:border-indigo-300 transition-colors"
              >
                <span className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                  {currentWorkspace.icon}
                </span>
                {currentWorkspace.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              {showWorkspaceMenu && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Workspaces</p>
                  </div>
                  {WORKSPACES.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => { setActiveWorkspace(ws.id); setShowWorkspaceMenu(false); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        activeWorkspace === ws.id
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                        {ws.icon}
                      </span>
                      {ws.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-neutral-300 dark:text-neutral-700">|</span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">Mission workspace</span>
          </div>

          {/* Right: brand switcher */}
          <div className="flex items-center gap-2">
            {activeBrand && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400">
                <div className="w-4 h-4 rounded-full bg-neutral-800 dark:bg-neutral-200 shrink-0" />
                <span className="max-w-[140px] truncate">{activeBrand.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Chat area — renders existing ChatPage */}
        <div className="flex-1 overflow-hidden" onClick={() => setShowWorkspaceMenu(false)}>
          <ChatPage />
        </div>
      </div>

      {/* ===== RIGHT RAIL ===== */}
      <ArtifactReviewPanel
        team={team}
        artifacts={artifacts}
        reviews={reviews}
      />
    </div>
  );
}
