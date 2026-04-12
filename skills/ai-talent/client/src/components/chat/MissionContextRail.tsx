/**
 * MissionContextRail.tsx — 三欄佈局版
 * 品牌切換 → 工作區列表（含任務） → 對話清單 → 底部工具列
 */
import React, { useState } from 'react';

export interface MissionContext {
  workspace: string;
  objective: string;
  audience: string;
  offer: string;
  successMetrics: string;
  constraints: string;
  methodology: string;
}

export interface AgentEntry {
  id: number;
  name: string;
  specialty: string;
  workspace: string;
  layer: 'execution' | 'strategy';
  status: 'idle' | 'running' | 'review' | 'done';
  aiModel?: string;
}

export interface TaskUnit {
  id: string;
  label: string;
  status: 'not_started' | 'running' | 'needs_input' | 'ready_review' | 'approved';
}

export interface MissionItem {
  id: number;
  title: string;
  workspace: string;
  status: string;
  updatedAt: string | Date;
}

export interface ConversationItem {
  conversationTitle: string | null;
  latestAt: string;
}

export interface WorkspaceItem {
  id: string;
  label: string;
  icon: string;
  layer: string;
}

interface Props {
  brand: { name: string; id: number } | null;
  brands?: { id: number; name: string; isDefault?: boolean }[];
  onBrandChange?: (id: number) => void;
  onCreateBrand?: () => void;
  mission?: MissionContext | null;
  taskUnits?: TaskUnit[];
  workspaceName?: string;
  onEditMission?: () => void;
  // Workspace layer (NEW)
  workspaces?: WorkspaceItem[];
  activeWorkspace?: string;
  onWorkspaceChange?: (id: string) => void;
  missionsPerWorkspace?: Record<string, { id: number; title: string; status: string }[]>;
  // Mission layer
  missions?: MissionItem[];
  activeMissionId?: number | null;
  onMissionChange?: (id: number) => void;
  onNewMission?: () => void;
  // Conversation layer
  conversations?: ConversationItem[];
  activeConversationId?: string | null;
  onConversationChange?: (title: string) => void;
  onNewConversation?: () => void;
  // Workspace management
  onNewWorkspace?: (label: string) => void;
  onDeleteWorkspace?: (wsKey: string) => void;
  // Bottom toolbar
  onDarkToggle?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-2" />;
}

function formatConvDate(dt: string | Date): string {
  try {
    const d = new Date(dt);
    return d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MissionContextRail({
  brand,
  brands = [],
  onBrandChange,
  mission,
  taskUnits,
  workspaceName,
  onEditMission,
  workspaces = [],
  activeWorkspace,
  onWorkspaceChange,
  missionsPerWorkspace = {},
  missions = [],
  activeMissionId,
  onMissionChange,
  onNewMission,
  conversations = [],
  activeConversationId,
  onConversationChange,
  onNewConversation,
  onNewWorkspace,
  onDeleteWorkspace,
  onDarkToggle,
  onSettings,
  onLogout,
}: Props) {
  const [newWsInput, setNewWsInput] = useState<string | null>(null); // null=hidden, ''=editing
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  // Track which workspaces are expanded; default: activeWorkspace is expanded
  const [expandedWs, setExpandedWs] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (activeWorkspace) init[activeWorkspace] = true;
    return init;
  });

  // When activeWorkspace changes from outside, auto-expand it
  React.useEffect(() => {
    if (activeWorkspace) {
      setExpandedWs(prev => ({ ...prev, [activeWorkspace]: true }));
    }
  }, [activeWorkspace]);

  const toggleWs = (wsId: string) => {
    setExpandedWs(prev => ({ ...prev, [wsId]: !prev[wsId] }));
    onWorkspaceChange?.(wsId);
  };

  return (
    <aside
      className="w-[240px] shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-[#1a1a1a] flex flex-col overflow-hidden"
      style={{ position: 'sticky', top: 0, height: '100vh' }}
    >
      {/* ══ LAYER 1: Brand ══ */}
      <div className="px-3 pt-3 pb-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setBrandMenuOpen(o => !o)}
            className="flex items-center gap-2 w-full text-left rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 px-2 py-1.5 transition-colors group"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
              {brand ? brand.name.charAt(0) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest font-semibold text-neutral-400">品牌 Brand</p>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate leading-tight">
                {brand?.name ?? '選擇品牌'}
              </p>
            </div>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {brandMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">切換品牌</p>
              </div>
              {brands.map((b) => (
                <button key={b.id}
                  onClick={() => { onBrandChange?.(b.id); setBrandMenuOpen(false); }}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    brand?.id === b.id ? 'bg-amber-50 text-amber-800 font-medium' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-600">{b.name.charAt(0)}</div>
                  <span className="truncate">{b.name}</span>
                  {b.isDefault && <span className="ml-auto text-xs text-neutral-400">預設</span>}
                  {brand?.id === b.id && <svg className="ml-auto w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
              {/* 新建品牌 */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 mt-1 pt-1">
                <button
                  onClick={() => { setBrandMenuOpen(false); onCreateBrand?.(); }}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50 transition-colors font-medium"
                >
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600">+</div>
                  <span>新建品牌</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ LAYER 2: Workspaces + Tasks (scrollable) ══ */}
      <div className="flex-1 overflow-y-auto">
        {/* Workspace section — no section label */}
        <div className="pt-2" />

        {workspaces.length === 0 ? (
          <p className="text-xs text-center text-neutral-400 py-4">尚無工作區</p>
        ) : (
          <div className="px-2 space-y-0.5">
            {workspaces.map((ws) => {
              const isExpanded = !!expandedWs[ws.id];
              const isActive = activeWorkspace === ws.id;
              const wsMissions = missionsPerWorkspace[ws.id] ?? [];

              return (
                <div key={ws.id}>
                  {/* Workspace row */}
                  <div className="group relative flex items-center">
                    <button
                      onClick={() => toggleWs(ws.id)}
                      className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      {/* Expand caret */}
                      <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`shrink-0 transition-transform text-neutral-400 ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <span className="flex-1 text-left truncate">{ws.label}</span>
                      {/* Mission count badge */}
                      {wsMissions.length > 0 && (
                        <span className="text-[10px] font-semibold text-neutral-400 bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded-full shrink-0">
                          {wsMissions.length}
                        </span>
                      )}
                    </button>
                    {/* Delete workspace button - visible on hover */}
                    {onDeleteWorkspace && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(ws.id); }}
                        className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-neutral-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title={`Delete: ${ws.label}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Expanded: mission list + new button */}
                  {isExpanded && (
                    <div className="ml-5 mt-0.5 space-y-0.5">
                      {wsMissions.length === 0 ? (
                        <p className="text-[11px] text-neutral-400 py-1 px-2">尚無任務</p>
                      ) : (
                        wsMissions.map((m) => (
                          <div key={m.id} className="group/mission relative flex items-center">
                            <button
                              onClick={() => onMissionChange?.(m.id)}
                              className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                activeMissionId === m.id
                                  ? 'bg-amber-200 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200 font-medium'
                                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                m.status === 'active' ? 'bg-green-400' : 'bg-neutral-300'
                              }`} />
                              <span className="truncate flex-1">{m.title}</span>
                            </button>
                            {/* Delete mission button - visible on hover */}
                            <button
                              className="absolute right-1 opacity-0 group-hover/mission:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded text-neutral-300 hover:text-red-400"
                              title="刪除任務"
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                      {/* + New task icon-only button */}
                      <button
                        onClick={onNewMission}
                        title="新增任務"
                        className="w-6 h-6 ml-2 flex items-center justify-center rounded text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          {/* ＋ 新增工作區 */}
          {newWsInput === null ? (
            <button
              onClick={() => setNewWsInput('')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors rounded-lg mt-0.5"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              新增工作區
            </button>
          ) : (
            <div className="px-2 py-1.5 flex gap-1">
              <input
                autoFocus
                type="text"
                value={newWsInput}
                onChange={e => setNewWsInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newWsInput.trim()) {
                    onNewWorkspace?.(newWsInput.trim());
                    setNewWsInput(null);
                  } else if (e.key === 'Escape') {
                    setNewWsInput(null);
                  }
                }}
                placeholder="工作區名稱"
                className="flex-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 outline-none focus:border-amber-400 bg-white dark:bg-neutral-900"
              />
              <button
                onClick={() => { if (newWsInput.trim()) { onNewWorkspace?.(newWsInput.trim()); setNewWsInput(null); } }}
                className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600"
              >✓</button>
              <button onClick={() => setNewWsInput(null)} className="text-xs px-2 py-1 text-neutral-400 hover:text-neutral-600">✕</button>
            </div>
          )}
          </div>
        )}

        <Divider />

        {/* ══ LAYER 3: Conversations (only when a mission is selected) ══ */}
        {activeMissionId && (
          <>
            <div className="px-3 pt-1 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">對話</span>
              <button
                onClick={onNewConversation}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 transition-colors"
                title="新對話"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>

            <div className="px-2 pb-2">
              {conversations.length === 0 ? (
                <button
                  onClick={onNewConversation}
                  className="w-full text-xs text-center py-3 text-neutral-400 hover:text-amber-600 transition-colors"
                >
                  + 開始新對話
                </button>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((c, idx) => {
                    const rawTitle = c.conversationTitle ?? `對話 ${idx + 1}`;
                    const displayTitle = rawTitle.slice(0, 20);
                    const dateStr = formatConvDate(c.latestAt);
                    const isActive = activeConversationId === rawTitle;
                    return (
                      <button
                        key={idx}
                        onClick={() => onConversationChange?.(rawTitle)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span className="text-[10px] text-neutral-400 shrink-0">{dateStr}</span>
                        <span className="text-xs truncate flex-1">{displayTitle}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ Bottom Toolbar (Settings / Dark / Logout) ══ */}
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 px-3 py-2 flex items-center justify-between">
        <button
          onClick={onSettings}
          className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors px-1 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="設定"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          設定
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={onDarkToggle}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="切換深色模式"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>

          <button
            onClick={onLogout}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-500 transition-colors"
            title="登出"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
