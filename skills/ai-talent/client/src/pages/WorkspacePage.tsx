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
 * - Sprint 4: workspace.list/create/delete persisted to DB per user
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import MissionContextRail, { type MissionContext, type AgentEntry } from "../components/chat/MissionContextRail";
import ArtifactReviewPanel, { type TeamMember, type Artifact, type ReviewItem } from "../components/chat/ArtifactReviewPanel";

type WorkspaceItem = { id: string; label: string; layer: 'execution' | 'strategy' };

/** Infer layer from wsKey */
function inferLayer(wsKey: string): 'execution' | 'strategy' {
  const strategyKeys = ['pr', 'seo', 'event', 'strategy', 'brand'];
  return strategyKeys.some(k => wsKey.includes(k)) ? 'strategy' : 'execution';
}

export default function WorkspacePage() {
  const [activeWorkspace, setActiveWorkspace] = useState<string>('facebook');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [missionModalOpen, setMissionModalOpen] = useState(false);
  const [createBrandModalOpen, setCreateBrandModalOpen] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandForm, setBrandForm] = useState({
    name: '', website: '', targetAudience: '', competitors: '', targetMarket: 'Taiwan', contentLanguage: 'zh-TW'
  });
  const [missionForm, setMissionForm] = useState({
    title: '',
    objective: '',
    audience: '',
    offer: '',
    successMetrics: '',
    methodology: '',
    constraints: '',
  });

  // ── Workspace tRPC queries ─────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const workspaceListQuery = trpc.workspace.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const workspaces: WorkspaceItem[] = (workspaceListQuery.data ?? []).map((w) => ({
    id: w.wsKey,
    label: w.label,
    layer: inferLayer(w.wsKey),
  }));

  // Set initial active workspace once data loads
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.find(w => w.id === activeWorkspace)) {
      setActiveWorkspace(workspaces[0].id);
    }
  }, [workspaceListQuery.data]);

  const createWorkspaceMutation = trpc.workspace.create.useMutation({
    onSuccess: () => {
      utils.workspace.list.invalidate();
    },
  });

  const deleteWorkspaceMutation = trpc.workspace.delete.useMutation({
    onSuccess: () => {
      utils.workspace.list.invalidate();
    },
  });

  // ── Brand ──────────────────────────────────────────────────────────────────
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false, staleTime: 0 });
  const brands = brandsQuery.data ?? [];
  const createBrandMutation = trpc.brand.create.useMutation({
    onSuccess: async (data: any) => {
      setCreateBrandModalOpen(false);
      setBrandForm({ name: '', website: '', targetAudience: '', competitors: '', targetMarket: 'Taiwan', contentLanguage: 'zh-TW' });
      setCreatingBrand(false);
      await utils.brand.list.invalidate();
      setActiveBrandId(data.id);
    },
    onError: () => setCreatingBrand(false),
  });
  const deleteBrandMutation = trpc.brand.delete.useMutation({
    onSuccess: () => {
      brandsQuery.refetch();
      setActiveBrandId(null);
    },
  });
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
    { enabled: !!activeWorkspace, refetchOnWindowFocus: false }
  );
  const activeMissionData = activeMissionQuery.data ?? null;

  // ── Mission list + activeMissionId ────────────────────────────────────────
  const [activeMissionId, setActiveMissionId] = useState<number | null>(null);
  const missionsListQuery = trpc.mission.list.useQuery(
    { workspace: activeWorkspace, brandId: activeBrand?.id },
    { enabled: !!activeWorkspace, refetchOnWindowFocus: false }
  );
  const missionsList = missionsListQuery.data ?? [];

  // Build missionsPerWorkspace: only active workspace has data loaded (lazy pattern)
  const missionsPerWorkspace: Record<string, { id: number; title: string; status: string }[]> = {};
  for (const ws of workspaces) {
    missionsPerWorkspace[ws.id] = ws.id === activeWorkspace
      ? missionsList.map((m: any) => ({ id: m.id, title: m.title, status: m.status ?? 'draft' }))
      : [];
  }

  // Conversations under active mission
  const conversationsQuery = trpc.conversation.listConversations.useQuery(
    { missionId: activeMissionId! },
    { enabled: !!activeMissionId, refetchOnWindowFocus: false }
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const mission: MissionContext | null = activeMissionData ? {
    workspace: activeMissionData.workspace,
    objective: activeMissionData.objective ?? "",
    audience: activeMissionData.audience ?? "",
    offer: activeMissionData.offer ?? "",
    successMetrics: activeMissionData.successMetrics ?? "",
    constraints: activeMissionData.constraints ?? "",
    methodology: activeMissionData.methodology ?? "",
  } : null;

  const createMission = trpc.mission.create.useMutation({
    onSuccess: () => {
      utils.mission.getActive.invalidate({ workspace: activeWorkspace, brandId: activeBrand?.id ?? undefined });
    },
  });

  // ── Sprint 3: Live agents → Team panel + Left rail ──────────────────────────
  const currentWorkspace = workspaces.find(w => w.id === activeWorkspace) ?? workspaces[0] ?? { id: activeWorkspace, label: activeWorkspace, layer: 'execution' as const };
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

  const handleNewMission = () => {
    setMissionForm({ title: '', objective: '', audience: '', offer: '', successMetrics: '', methodology: '', constraints: '' });
    setMissionModalOpen(true);
  };

  const handleMissionSubmit = async () => {
    if (!activeBrand || !missionForm.title.trim()) return;
    createMission.mutate({
      workspace: activeWorkspace,
      brandId: activeBrand.id,
      title: missionForm.title.trim(),
      objective: missionForm.objective,
      audience: missionForm.audience,
      offer: missionForm.offer,
      successMetrics: missionForm.successMetrics,
      methodology: missionForm.methodology,
      constraints: missionForm.constraints,
    });
    setMissionModalOpen(false);
  };

  // ── Workspace handlers (DB-backed) ────────────────────────────────────────
  const handleNewWorkspace = (label: string) => {
    createWorkspaceMutation.mutate({ label });
  };

  const handleDeleteWorkspace = (wsKey: string) => {
    deleteWorkspaceMutation.mutate({ wsKey });
    // If active workspace is deleted, switch to first remaining
    if (activeWorkspace === wsKey) {
      const remaining = workspaces.filter(w => w.id !== wsKey);
      if (remaining.length > 0) {
        setActiveWorkspace(remaining[0].id);
      }
    }
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
          brands={brands.map((b: any) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))}
          onBrandChange={(id) => setActiveBrandId(id)}
          onCreateBrand={() => setCreateBrandModalOpen(true)}
          onDeleteBrand={(id) => deleteBrandMutation.mutate({ id })}
          mission={mission}
          workspaceName={currentWorkspace.label}
          onEditMission={handleNewMission}
          taskUnits={taskUnits as any}
          workspaces={workspaces.map(ws => ({ id: ws.id, label: ws.label, icon: '', layer: ws.layer }))}
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={(id) => setActiveWorkspace(id)}
          onNewWorkspace={handleNewWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          missionsPerWorkspace={missionsPerWorkspace}
          missions={missionsList.map((m: any) => ({ id: m.id, title: m.title, workspace: m.workspace, status: m.status, updatedAt: m.updatedAt }))}
          activeMissionId={activeMissionId}
          onMissionChange={(id) => setActiveMissionId(id)}
          onNewMission={handleNewMission}
          conversations={conversationsQuery.data ?? []}
          activeConversationId={activeConversationId}
          onConversationChange={(title) => setActiveConversationId(title)}
          onNewConversation={() => setActiveConversationId(null)}
          onDarkToggle={() => window.dispatchEvent(new Event("toggle-dark"))}
          onSettings={() => window.location.href = "/settings"}
          onLogout={() => { localStorage.removeItem("authToken"); window.location.href = "/login"; }}
        />
      )}

      {/* CENTER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar — Breadcrumb style */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            {/* ≡ Toggle left rail */}
            <button
              onClick={() => setLeftCollapsed(c => !c)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              title={leftCollapsed ? '展開左欄' : '收起左欄'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            {/* Breadcrumb: 品牌 › 工作區 › 任務 */}
            <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
              <span className="font-semibold text-neutral-800 dark:text-neutral-100 shrink-0 truncate max-w-[80px]">
                {activeBrand?.name ?? '—'}
              </span>
              <span className="text-neutral-400 shrink-0">›</span>
              <span className="text-neutral-500 shrink-0 truncate max-w-[80px]">
                {currentWorkspace?.label ?? '—'}
              </span>
              <span className="text-neutral-400 shrink-0">›</span>
              <span className="text-neutral-400 shrink-0 truncate max-w-[120px]">
                {activeMissionData?.title ?? '選擇任務'}
              </span>
              {activeMissionQuery.isLoading && (
                <span className="w-3 h-3 border border-[#D1D5DB] border-t-gray-600 rounded-full animate-spin shrink-0" />
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* AI Search — hidden on mobile */}
            <button
              onClick={openSearch}
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
              title="AI 搜尋 Agent / Squad"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              AI 搜尋
            </button>
            {/* + 新任務 — always visible */}
            <button
              onClick={handleNewMission}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
            >
              + 新任務
            </button>
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
          <ChatPage initialBrandId={activeBrand?.id} activeMissionId={activeMissionId} preselectedAgent={selectedAgent} onClearAgent={() => setSelectedAgent(null)} />
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

      {/* Mission Create Modal */}
      {missionModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setMissionModalOpen(false); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg sm:mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-800">+ 新任務</h2>
              <button onClick={() => setMissionModalOpen(false)} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {[
                { key: 'title', label: '任務名稱 *', placeholder: '例：Q2 品牌上市活動' },
                { key: 'objective', label: '目標 Objective', placeholder: '這個任務要達成什麼？' },
                { key: 'audience', label: '受眾 Audience', placeholder: '目標受眾是誰？' },
                { key: 'offer', label: '提案 / 產品 Offer', placeholder: '主打什麼產品或服務？' },
                { key: 'successMetrics', label: 'KPI / 成功指標', placeholder: '例：ROAS 3x, 新客 500人' },
                { key: 'methodology', label: '方法論 Methodology', placeholder: '例：Brand Positioning v2' },
                { key: 'constraints', label: '限制條件 Constraints', placeholder: '例：預算 $50K, 只能用中文' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(missionForm as any)[key]}
                    onChange={(e) => setMissionForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3">
              <button onClick={() => setMissionModalOpen(false)} className="px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50 rounded-lg">取消</button>
              <button
                onClick={handleMissionSubmit}
                disabled={!missionForm.title.trim() || createMission.isPending}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                {createMission.isPending ? '建立中...' : '建立任務'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── 新建品牌 Modal ─────────────────────────────────────── */}
      {createBrandModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCreateBrandModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-neutral-800 mb-0.5">新建品牌</h3>
            <p className="text-xs text-neutral-400 mb-5">填寫基本資料即可開始，完整品牌定位進行中將有 AI 團隊幫你完成</p>
            <div className="space-y-3">
              {[{ label: '品牌名稱 *', key: 'name', placeholder: '例：SoWork AI', required: true },
                { label: '官網網址', key: 'website', placeholder: 'https://sowork.ai' },
                { label: '目標消費者', key: 'targetAudience', placeholder: '例：25-35 歲行銷人員、中小企業主' },
                { label: '主要競爭者', key: 'competitors', placeholder: '例：HubSpot, Marketo（逗號分隔）' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">{f.label}</label>
                  <input
                    autoFocus={f.key === 'name'}
                    type="text"
                    value={(brandForm as any)[f.key]}
                    onChange={e => setBrandForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">目標市場</label>
                  <select value={brandForm.targetMarket} onChange={e => setBrandForm(p => ({ ...p, targetMarket: e.target.value }))}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-white">
                    <option value="Taiwan">台灣</option>
                    <option value="HongKong">香港</option>
                    <option value="Singapore">新加坡</option>
                    <option value="China">中國</option>
                    <option value="USA">美國</option>
                    <option value="Global">全球</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">使用語言</label>
                  <select value={brandForm.contentLanguage} onChange={e => setBrandForm(p => ({ ...p, contentLanguage: e.target.value }))}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-white">
                    <option value="zh-TW">繁體中文</option>
                    <option value="zh-CN">簡體中文</option>
                    <option value="en">英文</option>
                    <option value="ja">日文</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setCreateBrandModalOpen(false); setBrandForm({ name: '', website: '', targetAudience: '', competitors: '', targetMarket: 'Taiwan', contentLanguage: 'zh-TW' }); }}
                className="flex-1 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-500 hover:bg-neutral-50">取消</button>
              <button
                onClick={() => {
                  if (!brandForm.name.trim()) return;
                  setCreatingBrand(true);
                  createBrandMutation.mutate({
                    name: brandForm.name.trim(),
                    website: brandForm.website || undefined,
                    targetAudience: brandForm.targetAudience || undefined,
                    competitors: brandForm.competitors || undefined,
                    targetMarket: brandForm.targetMarket,
                    contentLanguage: brandForm.contentLanguage,
                  });
                }}
                disabled={!brandForm.name.trim() || creatingBrand}
                className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {creatingBrand ? '建立中...' : '建立品牌'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
