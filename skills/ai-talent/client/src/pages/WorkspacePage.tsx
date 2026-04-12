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
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import MissionContextRail, { type MissionContext, type AgentEntry } from "../components/chat/MissionContextRail";
import ArtifactReviewPanel, { type TeamMember, type Artifact, type ReviewItem } from "../components/chat/ArtifactReviewPanel";

// ---- Workspace config with layer mapping ----
const WORKSPACES = [
  { id: 'facebook', label: 'Facebook', icon: 'f',  color: 'bg-gray-600',    layer: 'execution' as const },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in', color: 'bg-gray-600',     layer: 'execution' as const },
  { id: 'youtube',  label: 'YouTube',  icon: 'yt', color: 'bg-gray-600',     layer: 'execution' as const },
  { id: 'pr',       label: 'PR',       icon: 'pr', color: 'bg-gray-600', layer: 'strategy' as const },
  { id: 'event',    label: 'Event',    icon: 'ev', color: 'bg-gray-600',   layer: 'strategy' as const },
  { id: 'instore',  label: 'In-store', icon: 'is', color: 'bg-gray-600',  layer: 'strategy' as const },
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

  // Task Units - Sprint 4
  const [taskUnits] = useState<{ id: string; label: string; status: string }[]>([
    { id: '1', label: '簡報確認', status: 'approved' },
    { id: '2', label: '受眾定義', status: 'approved' },
    { id: '3', label: '角度探索', status: 'running' },
    { id: '4', label: '文案撰寫', status: 'not_started' },
    { id: '5', label: '創意提案', status: 'not_started' },
    { id: '6', label: '審核確認', status: 'not_started' },
    { id: '7', label: '匯出成果', status: 'not_started' },
  ]);

  // Artifacts — Sprint 5: Load from task.listRecent
  const recentTasksQuery = trpc.task.listRecent.useQuery(
    { limit: 10 },
    { refetchOnWindowFocus: false, refetchInterval: 30000 }
  );

  const artifacts: Artifact[] = (recentTasksQuery.data ?? [])
    .filter((t: any) => t.status === 'completed' && t.result)
    .map((t: any) => ({
      id: String(t.id),
      type: 'other' as const,
      label: t.title ?? '任務產出',
      version: 1,
      content: (() => {
        try {
          const r = t.result ?? t.description ?? '';
          // Try to extract publishable_content from JSON
          const parsed = JSON.parse(r);
          return (parsed.publishable_content ?? r).slice(0, 500);
        } catch {
          return (t.result ?? '').slice(0, 500);
        }
      })(),
      createdAt: new Date(t.createdAt).getTime(),
      pinned: false,
    }));

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


  // ── AI Vector Search ──────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<'agents' | 'squads'>('agents');
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<{ id: number; name: string; title?: string; type: 'agent' | 'squad' } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (query: string, tab: 'agents' | 'squads') => {
    if (!query.trim()) return;
    setSearching(true);
    setLastQuery(query);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(tab === 'agents' ? '/api/agents/search' : '/api/squads/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({ query, limit: 12 }),
      });
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchInput, searchTab);
  };

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#FFFFFF', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* LEFT RAIL */}
      {!leftCollapsed && (
        <MissionContextRail
          brand={activeBrand ? { name: activeBrand.name, id: activeBrand.id } : null}
          mission={mission}
          workspaceName={currentWorkspace.label}
          onEditMission={handleNewMission}
          taskUnits={taskUnits as any}
        />
      )}

      {/* CENTER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar — Claude warm style */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            {/* Toggle left rail */}
            <button
              onClick={() => setLeftCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-[#3d3530] hover:border-[#c9a96e] hover:bg-gray-100 transition-colors"
              >
                <span className={`w-5 h-5 rounded ${currentWorkspace.color} text-white flex items-center justify-center text-[10px] font-bold`}>
                  {currentWorkspace.icon}
                </span>
                {currentWorkspace.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              {showWorkspaceMenu && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-[#fdfcfa] border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">切換 Workspace</p>
                  </div>
                  {WORKSPACES.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => { setActiveWorkspace(ws.id); setShowWorkspaceMenu(false); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        activeWorkspace === ws.id
                          ? 'bg-[#fdf3e3] text-[#92622a] font-medium'
                          : 'text-[#5a4f47] hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded ${ws.color} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>{ws.icon}</span>
                      {ws.label}
                      {activeWorkspace === ws.id && (
                        <svg className="ml-auto w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-[#D1D5DB]">|</span>
            <span className="text-xs text-gray-400 truncate max-w-[200px]">
              {activeMissionData ? activeMissionData.title : '任務工作區'}
            </span>
            {activeMissionQuery.isLoading && (
              <span className="w-3 h-3 border border-[#D1D5DB] border-t-gray-600 rounded-full animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* AI Search */}
            <button
              onClick={openSearch}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
              title="AI 搜尋 Agent / Squad"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              AI 搜尋
            </button>
            <button
              onClick={openSearch}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            >
              🔍 AI 搜尋
            </button>
            <button
              onClick={handleNewMission}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-[#D1D5DB] text-gray-400 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              + 新任務
            </button>
            {activeBrand && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-[#5a4f47] bg-white">
                <div className="w-4 h-4 rounded-full bg-[#3d3530] shrink-0" />
                <span className="max-w-[140px] truncate">{activeBrand.name}</span>
              </div>
            )}
            {/* Toggle right rail */}
            <button
              onClick={() => setRightCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
          <ChatPage initialBrandId={activeBrand?.id} preselectedAgent={selectedAgent} onClearAgent={() => setSelectedAgent(null)} />
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
      {/* ── AI Search Modal ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-100">
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs shrink-0">
                <button type="button" onClick={() => setSearchTab('agents')}
                  className={`px-3 py-1.5 font-medium transition-colors ${searchTab === 'agents' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  🤖 Agent
                </button>
                <button type="button" onClick={() => setSearchTab('squads')}
                  className={`px-3 py-1.5 font-medium transition-colors ${searchTab === 'squads' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  👥 Squad
                </button>
              </div>
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={searchTab === 'agents' ? '例如：電商 SEO 策略師、品牌定位顧問…' : '例如：美妝品牌行銷團隊、B2B SaaS 成長組…'}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"
                />
                <button type="submit" disabled={searching || !searchInput.trim()}
                  className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors shrink-0">
                  {searching ? '搜尋中…' : '搜尋'}
                </button>
              </form>
              <button onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm px-1">✕</button>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto">
              {searching ? (
                <div className="text-center py-8 text-gray-400 text-sm">⟳ AI 向量搜尋中…</div>
              ) : searchResults.length === 0 && lastQuery ? (
                <div className="text-center py-8 text-gray-400 text-sm">沒有找到相關結果</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <div className="text-3xl mb-2">🔍</div>
                  輸入任務需求，AI 幫你找最適合的 {searchTab === 'agents' ? 'Agent' : 'Squad'}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-3">「{lastQuery}」找到 {searchResults.length} 個結果</p>
                  <div className="grid grid-cols-2 gap-2">
                    {searchResults.map((r: any) => (
                      <div key={r.id}
                        className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-100 hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedAgent({ id: r.id, name: r.name, title: r.title ?? r.name_en, type: searchTab === 'agents' ? 'agent' : 'squad' });
                          setSearchOpen(false);
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                          style={{ background: searchTab === 'agents' ? '#fff3e0' : '#e3f2fd', color: searchTab === 'agents' ? '#c9823a' : '#1976d2' }}
                        >
                          {searchTab === 'agents' ? (r.name?.slice(0, 1) ?? '?') : '👥'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                          <p className="text-xs text-gray-500 truncate">{r.title ?? r.name_en}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${Math.round(r.score * 100) >= 60 ? 'bg-emerald-100 text-emerald-700' : Math.round(r.score * 100) >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                              {Math.round(r.score * 100)}% match
                            </span>
                            {r.member_count && <span className="text-xs text-gray-400">{r.member_count} 人</span>}
                            {r.pricePerTask > 0 && <span className="text-xs text-gray-400">${r.pricePerTask}/任務</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

}
