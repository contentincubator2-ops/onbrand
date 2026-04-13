/**
 * WorkspacePage.tsx — Perplexity 風格三欄佈局
 * 左：Sidebar(232px) | 中：ChatPage | 右：RightPanel(288px)
 *
 * 保留所有原有 tRPC / API 邏輯，只重構 UI 層。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../lib/trpc";
import ChatPage from "./ChatPage";
import Sidebar, {
  type SidebarBrand,
  type SidebarWorkspace,
  type SidebarAgent,
  type SidebarConversation,
  type SidebarMission,
} from "../components/chat/Sidebar";
import RightPanel, {
  type WorkflowStep,
  type PanelArtifact,
} from "../components/chat/RightPanel";
import type { MissionContext } from "../components/chat/MissionContextRail";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type WorkspaceItem = { id: string; label: string; layer: 'execution' | 'strategy' };

function inferLayer(wsKey: string): 'execution' | 'strategy' {
  const strategyKeys = ['pr', 'seo', 'event', 'strategy', 'brand'];
  return strategyKeys.some(k => wsKey.includes(k)) ? 'strategy' : 'execution';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [activeWorkspace, setActiveWorkspace] = useState<string>('facebook');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<'chat' | 'tasks' | 'reports' | 'knowledge'>('chat');

  // Mission modal
  const [missionModalOpen, setMissionModalOpen] = useState(false);
  const [missionForm, setMissionForm] = useState({
    title: '', objective: '', audience: '', offer: '',
    successMetrics: '', methodology: '', constraints: '',
  });

  // Brand modal
  const [createBrandModalOpen, setCreateBrandModalOpen] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandForm, setBrandForm] = useState({
    name: '', website: '', targetAudience: '', competitors: '',
    targetMarket: 'Taiwan', contentLanguage: 'zh-TW',
  });

  const utils = trpc.useUtils();

  // ── Workspaces ──────────────────────────────────────────────────────────────
  const workspaceListQuery = trpc.workspace.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const workspaces: WorkspaceItem[] = (workspaceListQuery.data ?? []).map((w: any) => ({
    id: w.wsKey, label: w.label, layer: inferLayer(w.wsKey),
  }));

  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.find(w => w.id === activeWorkspace)) {
      setActiveWorkspace(workspaces[0].id);
    }
  }, [workspaceListQuery.data]);

  const createWorkspaceMutation = trpc.workspace.create.useMutation({ onSuccess: () => utils.workspace.list.invalidate() });
  const deleteWorkspaceMutation = trpc.workspace.delete.useMutation({ onSuccess: () => utils.workspace.list.invalidate() });

  // ── Brands ──────────────────────────────────────────────────────────────────
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false, staleTime: 0 });
  const brands = brandsQuery.data ?? [];
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  useEffect(() => {
    if (brands.length > 0 && !activeBrandId) {
      const def = brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brands, activeBrandId]);

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
    onSuccess: () => { brandsQuery.refetch(); setActiveBrandId(null); },
  });

  // ── Missions ────────────────────────────────────────────────────────────────
  const activeMissionQuery = trpc.mission.getActive.useQuery(
    { workspace: activeWorkspace, brandId: activeBrand?.id },
    { enabled: !!activeWorkspace, refetchOnWindowFocus: false }
  );
  const activeMissionData = activeMissionQuery.data ?? null;

  const [activeMissionId, setActiveMissionId] = useState<number | null>(null);

  const missionsListQuery = trpc.mission.list.useQuery(
    { workspace: activeWorkspace, brandId: activeBrand?.id },
    { enabled: !!activeWorkspace, refetchOnWindowFocus: false }
  );

  const allMissionsQuery = trpc.mission.listByBrand.useQuery(
    { brandId: activeBrand?.id ?? 0 },
    { enabled: !!activeBrand?.id, refetchOnWindowFocus: false, staleTime: 0 }
  );
  const allMissions = allMissionsQuery.data ?? [];

  const missionsPerWorkspace: Record<string, { id: number; title: string; status: string }[]> = {};
  for (const ws of workspaces) {
    missionsPerWorkspace[ws.id] = allMissions
      .filter((m: any) => m.workspace === ws.id)
      .map((m: any) => ({ id: m.id, title: m.title, status: m.status ?? 'draft' }));
  }

  const conversationsQuery = trpc.conversation.listConversations.useQuery(
    { missionId: activeMissionId! },
    { enabled: !!activeMissionId, refetchOnWindowFocus: false }
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const createMission = trpc.mission.create.useMutation({
    onSuccess: () => {
      utils.mission.getActive.invalidate({ workspace: activeWorkspace, brandId: activeBrand?.id ?? undefined });
      utils.mission.listByBrand.invalidate({ brandId: activeBrand?.id ?? 0 });
    },
  });

  // ── Agents ──────────────────────────────────────────────────────────────────
  const currentWorkspace = workspaces.find(w => w.id === activeWorkspace) ?? workspaces[0] ?? { id: activeWorkspace, label: activeWorkspace, layer: 'execution' as const };
  const agentsQuery = trpc.agent.list.useQuery(
    { layer: currentWorkspace.layer, workspace: activeWorkspace, limit: 20 },
    { refetchOnWindowFocus: false }
  );

  const sidebarAgents: SidebarAgent[] = (agentsQuery.data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    specialty: a.specialty ?? a.role ?? currentWorkspace.label + ' Agent',
    skill: a.skill ?? a.specialty,
    status: 'idle' as const,
    aiModel: a.aiModel,
  }));

  // ── Task units (workflow steps for RightPanel) ───────────────────────────────
  const [taskUnits] = useState<WorkflowStep[]>([
    { id: '1', label: '簡報確認', status: 'done' },
    { id: '2', label: '受眾定義', status: 'done' },
    { id: '3', label: '角度探索', status: 'running' },
    { id: '4', label: '文案撰寫', status: 'pending' },
    { id: '5', label: '創意提案', status: 'pending' },
    { id: '6', label: '審核確認', status: 'pending' },
    { id: '7', label: '匯出成果', status: 'pending' },
  ]);

  // ── Artifacts for RightPanel ─────────────────────────────────────────────────
  const recentTasksQuery = trpc.task.listRecent.useQuery(
    { limit: 10 },
    { refetchOnWindowFocus: false, refetchInterval: 30000 }
  );
  const panelArtifacts: PanelArtifact[] = (recentTasksQuery.data ?? [])
    .filter((t: any) => t.status === 'completed' && t.result)
    .map((t: any) => ({
      id: String(t.id),
      filename: (t.title ?? '任務產出') + '.md',
      type: 'doc' as const,
      content: (() => {
        try {
          const r = t.result ?? '';
          const parsed = JSON.parse(r);
          return (parsed.publishable_content ?? r).slice(0, 800);
        } catch { return (t.result ?? '').slice(0, 800); }
      })(),
      createdAt: new Date(t.createdAt).getTime(),
      agentName: t.agentName,
      skill: t.skill,
    }));

  // ── AI Search ────────────────────────────────────────────────────────────────
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
        headers: { 'Content-Type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ query, limit: 12 }),
      });
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch { setSearchResults([]); } finally { setSearching(false); }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); runSearch(searchInput, searchTab); };
  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 80); };

  // ── Mission handlers ─────────────────────────────────────────────────────────
  const handleNewMission = () => {
    setMissionForm({ title: '', objective: '', audience: '', offer: '', successMetrics: '', methodology: '', constraints: '' });
    setMissionModalOpen(true);
  };
  const handleMissionSubmit = async () => {
    if (!activeBrand || !missionForm.title.trim()) return;
    createMission.mutate({
      workspace: activeWorkspace, brandId: activeBrand.id,
      title: missionForm.title.trim(),
      objective: missionForm.objective, audience: missionForm.audience,
      offer: missionForm.offer, successMetrics: missionForm.successMetrics,
      methodology: missionForm.methodology, constraints: missionForm.constraints,
    });
    setMissionModalOpen(false);
  };

  const handleNewWorkspace = (label: string) => createWorkspaceMutation.mutate({ label });
  const handleDeleteWorkspace = (wsKey: string) => {
    deleteWorkspaceMutation.mutate({ wsKey });
    if (activeWorkspace === wsKey) {
      const remaining = workspaces.filter(w => w.id !== wsKey);
      if (remaining.length > 0) setActiveWorkspace(remaining[0].id);
    }
  };

  const userEmail = (() => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return undefined;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.email ?? payload.sub;
    } catch { return undefined; }
  })();

  // ── Sidebar props ─────────────────────────────────────────────────────────────
  const sidebarWorkspaces: SidebarWorkspace[] = workspaces.map(ws => ({
    id: ws.id,
    label: ws.label,
    status: 'idle' as const,
  }));

  const sidebarConversations: SidebarConversation[] = (conversationsQuery.data ?? []).map((c: any) => ({
    conversationTitle: c.conversationTitle,
    latestAt: c.latestAt,
  }));

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: '#FAFAF9',
    }}>
      {/* LEFT SIDEBAR */}
      {!leftCollapsed && (
        <Sidebar
          brand={activeBrand ? { name: activeBrand.name, id: activeBrand.id } : null}
          brands={brands.map((b: any) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))}
          onBrandChange={(id) => setActiveBrandId(id)}
          onCreateBrand={() => setCreateBrandModalOpen(true)}
          onDeleteBrand={(id) => deleteBrandMutation.mutate({ id })}
          activeNav={activeNav}
          onNavChange={setActiveNav}
          workspaces={sidebarWorkspaces}
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={(id) => setActiveWorkspace(id)}
          onNewWorkspace={handleNewWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          missionsPerWorkspace={missionsPerWorkspace}
          activeMissionId={activeMissionId}
          onMissionChange={(id) => setActiveMissionId(id)}
          onNewMission={handleNewMission}
          conversations={sidebarConversations}
          activeConversationId={activeConversationId}
          onConversationChange={(title) => setActiveConversationId(title)}
          onNewConversation={() => setActiveConversationId(null)}
          agents={sidebarAgents}
          agentsLoading={agentsQuery.isLoading}
          userEmail={userEmail}
          onSettings={() => window.location.href = '/settings'}
          onLogout={() => { localStorage.removeItem('authToken'); window.location.href = '/login'; }}
        />
      )}

      {/* CENTER: Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 44,
          borderBottom: '1px solid #1E1E1E',
          background: '#FFFFFF',
          flexShrink: 0,
        }}>
          {/* Left side: toggle + breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button
              onClick={() => setLeftCollapsed(c => !c)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: 4, display: 'flex', alignItems: 'center' }}
              title={leftCollapsed ? '展開左欄' : '收起左欄'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            {/* Breadcrumb */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: '#1C1917', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                {activeBrand?.name ?? '—'}
              </span>
              <span style={{ color: '#C4C0BA' }}>›</span>
              <span style={{ color: '#78716C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                {currentWorkspace?.label ?? '—'}
              </span>
              <span style={{ color: '#C4C0BA' }}>›</span>
              <span style={{ color: '#A8A29E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                {activeMissionData?.title ?? '選擇任務'}
              </span>
            </nav>
          </div>

          {/* Right side: search + new mission + right panel toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={openSearch}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid #E7E5E4', background: 'none',
                color: '#A8A29E', cursor: 'pointer',
              }}
              title="AI 搜尋 Agent / Squad"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              搜尋
            </button>
            <button
              onClick={handleNewMission}
              style={{
                fontSize: 10, padding: '4px 10px', borderRadius: 6,
                background: '#F97316', color: '#0F0E0D',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}
            >
              + 任務
            </button>
            <button
              onClick={() => setRightCollapsed(c => !c)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: 4, display: 'flex', alignItems: 'center' }}
              title={rightCollapsed ? '展開右欄' : '收起右欄'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatPage
            key={`${activeMissionId ?? "no-mission"}-${activeBrandId ?? "no-brand"}`}
            initialBrandId={activeBrand?.id}
            activeMissionId={activeMissionId}
            preselectedAgent={selectedAgent}
            onClearAgent={() => setSelectedAgent(null)}
          />
        </div>
      </div>

      {/* RIGHT PANEL */}
      {!rightCollapsed && (
        <RightPanel
          workflowSteps={taskUnits}
          artifacts={panelArtifacts}
          brandId={activeBrand?.id}
          missionId={activeMissionId}
        />
      )}

      {/* ── Mission Create Modal ── */}
      {missionModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMissionModalOpen(false); }}
        >
          <div style={{
            background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: 12,
            width: '90%', maxWidth: 480, overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #252525', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1C1917' }}>+ 新任務</h2>
              <button onClick={() => setMissionModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
              {[
                { key: 'title', label: '任務名稱 *', placeholder: '例：Q2 品牌上市活動' },
                { key: 'objective', label: '目標', placeholder: '這個任務要達成什麼？' },
                { key: 'audience', label: '受眾', placeholder: '目標受眾是誰？' },
                { key: 'offer', label: '提案 / 產品', placeholder: '主打什麼產品或服務？' },
                { key: 'successMetrics', label: 'KPI', placeholder: '例：ROAS 3x, 新客 500人' },
                { key: 'methodology', label: '方法論', placeholder: '例：Brand Positioning v2' },
                { key: 'constraints', label: '限制條件', placeholder: '例：預算 $50K' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 10, color: '#A8A29E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                  <input
                    type="text"
                    value={(missionForm as any)[key]}
                    onChange={(e) => setMissionForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: '100%', fontSize: 12, padding: '7px 10px',
                      background: '#111', border: '1px solid #E7E5E4', borderRadius: 6,
                      color: '#1C1917', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #252525', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setMissionModalOpen(false)}
                style={{ padding: '7px 16px', fontSize: 12, color: '#A8A29E', background: 'none', border: '1px solid #E7E5E4', borderRadius: 6, cursor: 'pointer' }}>
                取消
              </button>
              <button
                onClick={handleMissionSubmit}
                disabled={!missionForm.title.trim() || createMission.isPending}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600,
                  background: '#F97316', color: '#0F0E0D',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  opacity: (!missionForm.title.trim() || createMission.isPending) ? 0.5 : 1,
                }}
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
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            style={{ width: '90%', maxWidth: 580, background: '#FFFFFF', borderRadius: 12, border: '1px solid #E7E5E4', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #252525' }}>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #E7E5E4' }}>
                {(['agents', 'squads'] as const).map(t => (
                  <button key={t} onClick={() => setSearchTab(t)}
                    style={{
                      padding: '5px 12px', fontSize: 10, fontWeight: 500,
                      background: searchTab === t ? '#F97316' : 'none',
                      color: searchTab === t ? '#0D0D0D' : '#555',
                      border: 'none', cursor: 'pointer',
                    }}>
                    {t === 'agents' ? '🤖 Agent' : '👥 Squad'}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSearchSubmit} style={{ flex: 1, display: 'flex', gap: 6 }}>
                <input
                  ref={searchInputRef}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={searchTab === 'agents' ? '例：電商 SEO 策略師…' : '例：美妝品牌行銷團隊…'}
                  style={{
                    flex: 1, fontSize: 11, padding: '6px 10px',
                    background: '#111', border: '1px solid #E7E5E4', borderRadius: 6,
                    color: '#1C1917', outline: 'none',
                  }}
                />
                <button type="submit" disabled={searching || !searchInput.trim()}
                  style={{
                    padding: '6px 12px', fontSize: 11, fontWeight: 600,
                    background: '#F97316', color: '#0F0E0D',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    opacity: (searching || !searchInput.trim()) ? 0.5 : 1,
                  }}>
                  {searching ? '搜尋中…' : '搜尋'}
                </button>
              </form>
              <button onClick={() => setSearchOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E' }}>✕</button>
            </div>
            <div style={{ padding: '12px 16px', maxHeight: 360, overflowY: 'auto' }}>
              {searching ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#A8A29E', fontSize: 11 }}>AI 向量搜尋中…</div>
              ) : searchResults.length === 0 && lastQuery ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#A8A29E', fontSize: 11 }}>沒有找到相關結果</div>
              ) : searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#A8A29E', fontSize: 11 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                  輸入任務需求，AI 幫你找最適合的 {searchTab === 'agents' ? 'Agent' : 'Squad'}
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 10, color: '#A8A29E', marginBottom: 10 }}>「{lastQuery}」找到 {searchResults.length} 個結果</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {searchResults.map((r: any) => (
                      <div
                        key={r.id}
                        onClick={() => { setSelectedAgent({ id: r.id, name: r.name, title: r.title ?? r.name_en, type: searchTab === 'agents' ? 'agent' : 'squad' }); setSearchOpen(false); }}
                        style={{
                          display: 'flex', gap: 8, padding: '10px', borderRadius: 8,
                          border: '1px solid #E7E5E4', cursor: 'pointer',
                          background: '#FAFAF9',
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: '#FFF7ED', color: '#F97316',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {r.name?.charAt(0) ?? '?'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                          <div style={{ fontSize: 9, color: '#A8A29E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title ?? r.name_en}</div>
                          <span style={{
                            display: 'inline-block', marginTop: 3, fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            background: Math.round(r.score*100) >= 60 ? '#1DBEAA15' : '#33330A',
                            color: Math.round(r.score*100) >= 60 ? '#F97316' : '#888',
                          }}>
                            {Math.round(r.score*100)}% match
                          </span>
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

      {/* ── 新建品牌 Modal ── */}
      {createBrandModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setCreateBrandModalOpen(false)}
        >
          <div
            style={{ background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1C1917' }}>新建品牌</h3>
            <p style={{ margin: '0 0 16px', fontSize: 10, color: '#A8A29E' }}>填寫基本資料即可開始</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: '品牌名稱 *', key: 'name', placeholder: '例：SoWork AI' },
                { label: '官網網址', key: 'website', placeholder: 'https://sowork.ai' },
                { label: '目標消費者', key: 'targetAudience', placeholder: '例：25-35 歲行銷人員' },
                { label: '主要競爭者', key: 'competitors', placeholder: '例：HubSpot, Marketo' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 10, color: '#A8A29E', marginBottom: 3 }}>{f.label}</label>
                  <input
                    type="text"
                    value={(brandForm as any)[f.key]}
                    onChange={e => setBrandForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{
                      width: '100%', fontSize: 12, padding: '6px 10px',
                      background: '#111', border: '1px solid #E7E5E4', borderRadius: 6,
                      color: '#1C1917', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setCreateBrandModalOpen(false); setBrandForm({ name: '', website: '', targetAudience: '', competitors: '', targetMarket: 'Taiwan', contentLanguage: 'zh-TW' }); }}
                style={{ flex: 1, padding: '8px', fontSize: 12, background: 'none', border: '1px solid #E7E5E4', borderRadius: 6, color: '#A8A29E', cursor: 'pointer' }}
              >
                取消
              </button>
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
                style={{
                  flex: 1, padding: '8px', fontSize: 12, fontWeight: 600,
                  background: '#F97316', color: '#0F0E0D',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  opacity: (!brandForm.name.trim() || creatingBrand) ? 0.5 : 1,
                }}
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
