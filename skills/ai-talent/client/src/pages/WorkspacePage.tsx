/**
 * WorkspacePage.tsx — Sprint 2
 * Three-column workspace layout: Left (MissionContext) | Center (Chat/Execution) | Right (Team/Artifacts/Review)
 *
 * Sprint 2 wiring:
 * - mission.getActive tRPC query loads real mission data from DB
 * - mission.create mutation for new missions
 * - Top bar shows active mission title with loading spinner
 * - MissionContextRail receives live DB data
 * - Collapsible left/right rails
 */
import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import MissionContextRail, { type MissionContext, type TaskUnit } from "../components/chat/MissionContextRail";
import ArtifactReviewPanel, { type TeamMember, type Artifact, type ReviewItem } from "../components/chat/ArtifactReviewPanel";

// ---- Workspace types ----
const WORKSPACES = [
  { id: 'facebook', label: 'Facebook', icon: 'f',  color: 'bg-blue-500' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in', color: 'bg-sky-600' },
  { id: 'youtube',  label: 'YouTube',  icon: 'yt', color: 'bg-red-500' },
  { id: 'pr',       label: 'PR',       icon: 'pr', color: 'bg-emerald-500' },
  { id: 'event',    label: 'Event',    icon: 'ev', color: 'bg-amber-500' },
  { id: 'instore',  label: 'In-store', icon: 'is', color: 'bg-violet-500' },
] as const;

type WorkspaceId = typeof WORKSPACES[number]['id'];

// ---- Component ----
export default function WorkspacePage() {
  // Workspace selector
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('facebook');
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Brand from existing trpc
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const brands = brandsQuery.data ?? [];
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  // Set default brand
  useEffect(() => {
    if (brands.length > 0 && !activeBrandId) {
      const def = brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brands, activeBrandId]);

  // ---- Sprint 2: Live mission data from DB ----
  const activeMissionQuery = trpc.mission.getActive.useQuery(
    { workspace: activeWorkspace, brandId: activeBrand?.id },
    { enabled: !!activeBrand, refetchOnWindowFocus: false }
  );
  const activeMissionData = activeMissionQuery.data ?? null;

  // Transform DB mission into MissionContext shape for the rail
  const mission: MissionContext | null = activeMissionData
    ? {
        workspace: activeMissionData.workspace,
        objective: activeMissionData.objective ?? "",
        audience: activeMissionData.audience ?? "",
        offer: activeMissionData.offer ?? "",
        successMetrics: activeMissionData.successMetrics ?? "",
        constraints: activeMissionData.constraints ?? "",
        methodology: activeMissionData.methodology ?? "",
        taskUnits: (activeMissionData.taskUnits ?? []).map((u: any) => ({
          id: u.id,
          label: u.label,
          status: u.status ?? "not_started",
        })),
      }
    : null;

  // Create mission mutation
  const utils = trpc.useUtils();
  const createMission = trpc.mission.create.useMutation({
    onSuccess: () => {
      utils.mission.getActive.invalidate({ workspace: activeWorkspace });
    },
  });

  // Right panel state (static for now, will wire in Sprint 3)
  const [team] = useState<TeamMember[]>([]);
  const [artifacts] = useState<Artifact[]>([]);
  const [reviews] = useState<ReviewItem[]>([]);

  const currentWorkspace = WORKSPACES.find(w => w.id === activeWorkspace)!;

  // Close workspace menu on click outside
  useEffect(() => {
    if (!showWorkspaceMenu) return;
    const handler = () => setShowWorkspaceMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showWorkspaceMenu]);

  // Handler: create a new mission for current workspace
  const handleNewMission = () => {
    if (!activeBrand) return;
    const title = prompt("輸入新任務名稱：");
    if (!title?.trim()) return;
    createMission.mutate({
      workspace: activeWorkspace,
      brandId: activeBrand.id,
      title: title.trim(),
    });
  };

  return (
    <div className="flex h-full bg-white dark:bg-[#212121] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ===== LEFT RAIL ===== */}
      {!leftCollapsed && (
        <MissionContextRail
          brand={activeBrand ? { name: activeBrand.name, id: activeBrand.id } : null}
          mission={mission}
          workspaceName={currentWorkspace.label}
          onEditMission={handleNewMission}
        />
      )}

      {/* ===== CENTER: Top bar + Chat ===== */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#212121]">
          {/* Left section: collapse + workspace selector */}
          <div className="flex items-center gap-2">
            {/* Toggle left rail */}
            <button
              onClick={() => setLeftCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
              title={leftCollapsed ? "展開左欄" : "收起左欄"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {leftCollapsed ? (
                  <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 9 17 12 14 15"/></>
                ) : (
                  <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 15 11 12 14 9"/></>
                )}
              </svg>
            </button>

            {/* Workspace selector */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowWorkspaceMenu(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
              >
                <span className={`w-5 h-5 rounded ${currentWorkspace.color} text-white flex items-center justify-center text-[10px] font-bold`}>
                  {currentWorkspace.icon}
                </span>
                {currentWorkspace.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showWorkspaceMenu && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">切換 Workspace</p>
                  </div>
                  {WORKSPACES.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => { setActiveWorkspace(ws.id); setShowWorkspaceMenu(false); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        activeWorkspace === ws.id
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded ${ws.color} text-white flex items-center justify-center text-[10px] font-bold`}>
                        {ws.icon}
                      </span>
                      {ws.label}
                      {activeWorkspace === ws.id && (
                        <svg className="ml-auto w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-neutral-300 dark:text-neutral-700">|</span>

            {/* Mission title or placeholder */}
            <span className="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[200px]">
              {activeMissionData ? activeMissionData.title : 'Mission workspace'}
            </span>
            {activeMissionQuery.isLoading && (
              <span className="w-3 h-3 border border-neutral-300 border-t-indigo-400 rounded-full animate-spin" />
            )}
          </div>

          {/* Right: brand switcher + new mission + collapse right */}
          <div className="flex items-center gap-2">
            {/* New mission button */}
            <button
              onClick={handleNewMission}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
              title="建立新任務"
            >
              + 新任務
            </button>

            {activeBrand && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-400">
                <div className="w-4 h-4 rounded-full bg-neutral-800 dark:bg-neutral-200 shrink-0" />
                <span className="max-w-[140px] truncate">{activeBrand.name}</span>
              </div>
            )}

            {/* Toggle right rail */}
            <button
              onClick={() => setRightCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
              title={rightCollapsed ? "展開右欄" : "收起右欄"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {rightCollapsed ? (
                  <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="10 15 7 12 10 9"/></>
                ) : (
                  <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="10 9 13 12 10 15"/></>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden">
          <ChatPage />
        </div>
      </div>

      {/* ===== RIGHT RAIL ===== */}
      {!rightCollapsed && (
        <ArtifactReviewPanel
          team={team}
          artifacts={artifacts}
          reviews={reviews}
        />
      )}
    </div>
  );
}
