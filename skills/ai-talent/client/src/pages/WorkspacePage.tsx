/**
 * WorkspacePage.tsx — Sprint 3
 * Three-column workspace layout: Left (MissionContext) | Center (Chat/Execution) | Right (Team/Artifacts/Review)
 *
 * Sprint 3 wiring:
 * - agent.list tRPC query loads real agents from DB → Team tab + Left rail
 * - Workspace-to-layer mapping: facebook/linkedin/youtube → execution, pr/event/instore → strategy
 * - Claude-style design: warm neutrals (#faf9f7 bg), amber accents (#c9823a), refined spacing
 * - ArtifactReviewPanel receives live agent data as team members
 * - MissionContextRail receives agents + agentsLoading for left rail roster
 */
import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import MissionContextRail, { type MissionContext, type AgentEntry } from "../components/chat/MissionContextRail";
import ArtifactReviewPanel, { type TeamMember, type Artifact, type ReviewItem } from "../components/chat/ArtifactReviewPanel";

// ---- Workspace config with layer mapping ----
const WORKSPACES = [
  { id: 'facebook', label: 'Facebook', icon: 'f',  color: 'bg-blue-500',    layer: 'execution' as const },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in', color: 'bg-sky-600',     layer: 'execution' as const },
  { id: 'youtube',  label: 'YouTube',  icon: 'yt', color: 'bg-red-500',     layer: 'execution' as const },
  { id: 'pr',       label: 'PR',       icon: 'pr', color: 'bg-emerald-500', layer: 'strategy' as const },
  { id: 'event',    label: 'Event',    icon: 'ev', color: 'bg-amber-500',   layer: 'strategy' as const },
  { id: 'instore',  label: 'In-store', icon: 'is', color: 'bg-violet-500',  layer: 'strategy' as const },
] as const;

type WorkspaceId = typeof WORKSPACES[number]['id'];

export default function WorkspacePage() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('facebook');
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ── Brand ──────────────────────────────────────────────────────────────────
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const brands = brandsQuery.data ?? [];
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  useEffect(() => {
    if (brands.length > 0 && !activeBrandId) {
      const def = brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brands, activeBrandId]);

  // ── Sprint 2: Mission data ─────────────────────────────────────────────────
  const activeMissionQuery = trpc.mission.getActive.useQuery(
    { workspace: activeWorkspace, brandId: activeBrand?.id },
    { enabled: !!activeBrand, refetchOnWindowFocus: false }
  );
  const activeMissionData = activeMissionQuery.data ?? null;

  const mission: MissionContext | null = activeMissionData ? {
    workspace: activeMissionData.workspace,
    objective: activeMissionData.objective ?? "",
    audience: activeMissionData.audience ?? "",
    offer: activeMissionData.offer ?? "",
    successMetrics: activeMissionData.successMetrics ?? "",
    constraints: activeMissionData.constraints ?? "",
    methodology: activeMissionData.methodology ?? "",
  } : null;

  const utils = trpc.useUtils();
  const createMission = trpc.mission.create.useMutation({
    onSuccess: () => utils.mission.getActive.invalidate({ workspace: activeWorkspace }),
  });

  // ── Sprint 3: Live agents → Team panel + Left rail ──────────────────────────
  const currentWorkspace = WORKSPACES.find(w => w.id === activeWorkspace)!;
  const agentsQuery = trpc.agent.list.useQuery(
    { layer: currentWorkspace.layer, workspace: activeWorkspace, limit: 20 },
    { refetchOnWindowFocus: false }
  );

  // Map for right panel (TeamMember[])
  const team: TeamMember[] = (agentsQuery.data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    title: a.specialty ?? a.role ?? currentWorkspace.label + ' Agent',
    layer: (a.layer ?? currentWorkspace.layer) as TeamMember['layer'],
    status: 'standby' as const,
        aiModel: a.aiModel,
    owns: currentWorkspace.label,
  }));

  // Map for left rail (AgentEntry[])
  const leftAgents: AgentEntry[] = (agentsQuery.data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    specialty: a.specialty ?? a.role ?? currentWorkspace.label + ' Agent',
    workspace: activeWorkspace,
    layer: (a.layer ?? currentWorkspace.layer) as AgentEntry['layer'],
    status: 'idle' as const,
        aiModel: a.aiModel,
  }));

  // Artifacts & Reviews — Sprint 4
  const [artifacts] = useState<Artifact[]>([]);
  const [reviews] = useState<ReviewItem[]>([]);

  // Close workspace menu on outside click
  useEffect(() => {
    if (!showWorkspaceMenu) return;
    const handler = () => setShowWorkspaceMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showWorkspaceMenu]);

  const handleNewMission = () => {
    if (!activeBrand) return;
    const title = prompt("輸入新任務名稱：");
    if (!title?.trim()) return;
    createMission.mutate({ workspace: activeWorkspace, brandId: activeBrand.id, title: title.trim() });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#faf9f7', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* LEFT RAIL */}
      {!leftCollapsed && (
        <MissionContextRail
          brand={activeBrand ? { name: activeBrand.name, id: activeBrand.id } : null}
          mission={mission}
          agents={leftAgents}
          agentsLoading={agentsQuery.isLoading}
          workspaceName={currentWorkspace.label}
          onEditMission={handleNewMission}
        />
      )}

      {/* CENTER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar — Claude warm style */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#e8e5e0] bg-[#faf9f7]">
          <div className="flex items-center gap-2">
            {/* Toggle left rail */}
            <button
              onClick={() => setLeftCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#9b8fa0] hover:text-[#6b5f70] hover:bg-[#f0ece8] transition-colors"
              title={leftCollapsed ? '展開左欄' : '收起左欄'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {leftCollapsed
                  ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 9 17 12 14 15"/></>
                  : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 15 11 12 14 9"/></>
                }
              </svg>
            </button>

            {/* Workspace selector */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowWorkspaceMenu(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e0dbd5] text-sm font-medium text-[#3d3530] hover:border-[#c9a96e] hover:bg-[#fdf6ed] transition-colors"
              >
                <span className={`w-5 h-5 rounded ${currentWorkspace.color} text-white flex items-center justify-center text-[10px] font-bold`}>
                  {currentWorkspace.icon}
                </span>
                {currentWorkspace.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              {showWorkspaceMenu && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-[#fdfcfa] border border-[#e0dbd5] rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-[#f0ece8]">
                    <p className="text-[10px] font-semibold text-[#9b8fa0] uppercase tracking-wider">切換 Workspace</p>
                  </div>
                  {WORKSPACES.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => { setActiveWorkspace(ws.id); setShowWorkspaceMenu(false); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        activeWorkspace === ws.id
                          ? 'bg-[#fdf3e3] text-[#92622a] font-medium'
                          : 'text-[#5a4f47] hover:bg-[#f5f1ec]'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded ${ws.color} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>{ws.icon}</span>
                      {ws.label}
                      {activeWorkspace === ws.id && (
                        <svg className="ml-auto w-4 h-4 text-[#c9823a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-[#d4cdc6]">|</span>
            <span className="text-xs text-[#9b8fa0] truncate max-w-[200px]">
              {activeMissionData ? activeMissionData.title : 'Mission workspace'}
            </span>
            {activeMissionQuery.isLoading && (
              <span className="w-3 h-3 border border-[#d4cdc6] border-t-[#c9823a] rounded-full animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNewMission}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-[#d4cdc6] text-[#9b8fa0] hover:border-[#c9823a] hover:text-[#c9823a] hover:bg-[#fdf6ed] transition-colors"
            >
              + 新任務
            </button>
            {activeBrand && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e0dbd5] text-sm text-[#5a4f47] bg-white">
                <div className="w-4 h-4 rounded-full bg-[#3d3530] shrink-0" />
                <span className="max-w-[140px] truncate">{activeBrand.name}</span>
              </div>
            )}
            {/* Toggle right rail */}
            <button
              onClick={() => setRightCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[#9b8fa0] hover:text-[#6b5f70] hover:bg-[#f0ece8] transition-colors"
              title={rightCollapsed ? '展開右欄' : '收起右欄'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {rightCollapsed
                  ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="10 15 7 12 10 9"/></>
                  : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="10 9 13 12 10 15"/></>
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <ChatPage />
        </div>
      </div>

      {/* RIGHT RAIL */}
      {!rightCollapsed && (
        <ArtifactReviewPanel
          team={team}
          artifacts={artifacts}
          reviews={reviews}
          agentsLoading={agentsQuery.isLoading}
        />
      )}
    </div>
  );
}
