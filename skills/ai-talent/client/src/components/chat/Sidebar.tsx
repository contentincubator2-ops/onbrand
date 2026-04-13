/**
 * Sidebar.tsx — Perplexity 風格左側欄（232px）
 * - 品牌切換（Logo + brand switcher）
 * - 導航（對話/任務/報告/知識庫）
 * - 工作區列表（可展開，含歷史對話清單）
 * - Agent 列表（avatar + name + skill + 狀態燈）
 * - 底部用戶資訊
 */
import React, { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SidebarBrand {
  id: number;
  name: string;
  type?: string;
  isDefault?: boolean;
}

export interface SidebarWorkspace {
  id: string;
  label: string;
  status?: 'run' | 'rev' | 'idle';
}

export interface SidebarConversation {
  conversationTitle: string | null;
  latestAt: string;
  missionId?: number;
}

export interface SidebarAgent {
  id: number;
  name: string;
  specialty: string;
  skill?: string;
  status: 'idle' | 'running' | 'review' | 'done';
  aiModel?: string;
}

export interface SidebarMission {
  id: number;
  title: string;
  workspace: string;
  status: string;
  updatedAt: string | Date;
}

interface Props {
  // Brand
  brand: { name: string; id: number; type?: string } | null;
  brands?: SidebarBrand[];
  onBrandChange?: (id: number) => void;
  onCreateBrand?: () => void;
  onDeleteBrand?: (id: number) => void;
  // Navigation
  activeNav?: 'chat' | 'tasks' | 'reports' | 'knowledge';
  onNavChange?: (nav: 'chat' | 'tasks' | 'reports' | 'knowledge') => void;
  // Workspaces
  workspaces?: SidebarWorkspace[];
  activeWorkspace?: string;
  onWorkspaceChange?: (id: string) => void;
  onNewWorkspace?: (label: string) => void;
  onDeleteWorkspace?: (id: string) => void;
  // Missions per workspace
  missionsPerWorkspace?: Record<string, { id: number; title: string; status: string }[]>;
  activeMissionId?: number | null;
  onMissionChange?: (id: number) => void;
  onNewMission?: () => void;
  // Conversations under active mission
  conversations?: SidebarConversation[];
  activeConversationId?: string | null;
  onConversationChange?: (title: string) => void;
  onNewConversation?: () => void;
  // Agents
  agents?: SidebarAgent[];
  agentsLoading?: boolean;
  // User
  userEmail?: string;
  onSettings?: () => void;
  onLogout?: () => void;
  // Tablet icon-only mode
  iconOnly?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  run: '#22C55E',
  rev: '#F59E0B',
  idle: '#555',
  running: '#22C55E',
  review: '#F59E0B',
  done: '#F97316',
};

function statusColor(s?: string): string {
  return STATUS_DOT[s ?? 'idle'] ?? '#555';
}

function agentInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#1DBEAA20', '#7C3AED20', '#F59E0B20', '#3B82F620', '#EC489920'];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}
function avatarTextColor(name: string): string {
  const colors = ['#F97316', '#7C3AED', '#F59E0B', '#3B82F6', '#EC4899'];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins}m前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h前`;
  return `${Math.floor(hrs / 24)}d前`;
}

// ─── Nav item ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: 'chat' | 'tasks' | 'reports' | 'knowledge'; label: string; icon: React.ReactNode }[] = [
  {
    id: 'chat',
    label: '對話',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'tasks',
    label: '任務',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    id: 'reports',
    label: '報告',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    id: 'knowledge',
    label: '知識庫',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Sidebar({
  brand,
  brands = [],
  onBrandChange,
  onCreateBrand,
  onDeleteBrand,
  activeNav = 'chat',
  onNavChange,
  workspaces = [],
  activeWorkspace,
  onWorkspaceChange,
  onNewWorkspace,
  onDeleteWorkspace,
  missionsPerWorkspace = {},
  activeMissionId,
  onMissionChange,
  onNewMission,
  conversations = [],
  activeConversationId,
  onConversationChange,
  onNewConversation,
  agents = [],
  agentsLoading,
  userEmail,
  onSettings,
  onLogout,
  iconOnly = false,
}: Props) {
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [newWsMode, setNewWsMode] = useState(false);
  const [newWsLabel, setNewWsLabel] = useState('');

  const toggleWs = (id: string) => {
    setExpandedWorkspaces(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNewWsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWsLabel.trim()) {
      onNewWorkspace?.(newWsLabel.trim());
      setNewWsLabel('');
      setNewWsMode(false);
    }
  };

  return (
    <aside
      style={{
        width: iconOnly ? 52 : 232,
        minWidth: iconOnly ? 52 : 232,
        background: '#FAFAF9',
        borderRight: '1px solid #E7E5E4',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* ── Brand Switcher ── */}
      <div style={{ padding: '14px 14px 0' }}>
        <button
          onClick={() => setBrandMenuOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #2C2925',
            background: '#FFFFFF',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {/* Logo */}
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'linear-gradient(135deg, #1DBEAA, #0D8A7E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 12, flexShrink: 0,
          }}>
            {brand?.name?.charAt(0)?.toUpperCase() ?? 'S'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {brand?.name ?? 'Marketing OS'}
            </div>
            <div style={{ fontSize: 10, color: '#A8A29E' }}>{brand?.type ?? 'Brand'}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Brand dropdown */}
        {brandMenuOpen && (
          <div style={{
            marginTop: 4,
            background: '#FFFFFF',
            border: '1px solid #2C2925',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 10,
          }}>
            {brands.map(b => (
              <div
                key={b.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  background: b.id === brand?.id ? '#1DBEAA15' : 'transparent',
                }}
                onClick={() => { onBrandChange?.(b.id); setBrandMenuOpen(false); }}
              >
                <span style={{ fontSize: 12, color: b.id === brand?.id ? '#F97316' : '#E8E8E8' }}>{b.name}</span>
                {b.id === brand?.id && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1DBEAA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
            ))}
            <div
              style={{ padding: '7px 10px', borderTop: '1px solid #252525', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => { onCreateBrand?.(); setBrandMenuOpen(false); }}
            >
              <span style={{ fontSize: 12, color: '#F97316' }}>+ 新增品牌</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Nav (hidden in icon-only mode) ── */}
      {!iconOnly && (<>
      <nav style={{ padding: '10px 10px 4px' }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavChange?.(item.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 6,
              border: 'none',
              background: activeNav === item.id ? '#1DBEAA15' : 'transparent',
              cursor: 'pointer',
              marginBottom: 1,
              color: activeNav === item.id ? '#F97316' : '#888',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {item.icon}
            <span style={{ fontSize: 12, fontWeight: activeNav === item.id ? 600 : 400 }}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: '#E7E5E4', margin: '2px 14px' }} />

      {/* ── Workspace list (scrollable) ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 6px' }}>
          <span style={{ fontSize: 10, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>工作區</span>
          <button
            onClick={() => setNewWsMode(m => !m)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: 2, display: 'flex', alignItems: 'center' }}
            title="新建工作區"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        {newWsMode && (
          <form onSubmit={handleNewWsSubmit} style={{ marginBottom: 6 }}>
            <input
              autoFocus
              value={newWsLabel}
              onChange={e => setNewWsLabel(e.target.value)}
              placeholder="工作區名稱"
              onBlur={() => { if (!newWsLabel.trim()) setNewWsMode(false); }}
              style={{
                width: '100%', fontSize: 11, padding: '5px 8px',
                borderRadius: 6, border: '1px solid #1DBEAA',
                background: '#FFFFFF', color: '#1C1917', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </form>
        )}

        {workspaces.map(ws => {
          const expanded = expandedWorkspaces[ws.id] ?? false;
          const missions = missionsPerWorkspace[ws.id] ?? [];
          const isActive = ws.id === activeWorkspace;

          return (
            <div key={ws.id}>
              {/* Workspace row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 6px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isActive ? '#1DBEAA10' : 'transparent',
                  marginBottom: 1,
                }}
                onClick={() => {
                  onWorkspaceChange?.(ws.id);
                  toggleWs(ws.id);
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor(ws.status ?? 'idle'),
                  flexShrink: 0,
                }} />
                {/* Chevron */}
                <span style={{ fontSize: 9, color: '#A8A29E', flexShrink: 0 }}>
                  {expanded ? '▾' : '▸'}
                </span>
                <span style={{
                  fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: isActive ? '#E8E8E8' : '#888',
                  fontWeight: isActive ? 500 : 400,
                }}>
                  {ws.label}
                </span>
              </div>

              {/* Conversation / mission list */}
              {expanded && (
                <div style={{ paddingLeft: 18, marginBottom: 4 }}>
                  {/* Missions for this workspace */}
                  {missions.length === 0 && (
                    <div style={{ fontSize: 10, color: '#C4C0BA', padding: '3px 6px' }}>尚無任務</div>
                  )}
                  {missions.map(m => {
                    const isActiveMission = m.id === activeMissionId;
                    return (
                      <div
                        key={m.id}
                        onClick={() => onMissionChange?.(m.id)}
                        style={{
                          padding: '4px 6px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          marginBottom: 1,
                          background: isActiveMission ? '#1DBEAA15' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <div style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: isActiveMission ? '#F97316' : '#333',
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 11,
                          color: isActiveMission ? '#F97316' : '#666',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          flex: 1,
                        }}>
                          {m.title}
                        </span>
                      </div>
                    );
                  })}

                  {/* Conversations under active mission */}
                  {ws.id === activeWorkspace && conversations.length > 0 && (
                    <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '1px solid #E7E5E4' }}>
                      <div style={{ fontSize: 9, color: '#C4C0BA', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>對話記錄</div>
                      {conversations.slice(0, 8).map((conv, i) => {
                        const title = conv.conversationTitle ?? `對話 ${i + 1}`;
                        const isActiveConv = title === activeConversationId;
                        return (
                          <div
                            key={i}
                            onClick={() => onConversationChange?.(title)}
                            style={{
                              padding: '3px 5px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              marginBottom: 1,
                              background: isActiveConv ? '#1DBEAA15' : 'transparent',
                            }}
                          >
                            <div style={{
                              fontSize: 10,
                              color: isActiveConv ? '#F97316' : '#666',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {title}
                            </div>
                            <div style={{ fontSize: 9, color: '#C4C0BA' }}>{timeAgo(conv.latestAt)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* New mission button */}
                  {ws.id === activeWorkspace && (
                    <button
                      onClick={onNewMission}
                      style={{
                        marginTop: 4, width: '100%', fontSize: 10, color: '#A8A29E',
                        background: 'none', border: '1px dashed #E7E5E4', borderRadius: 5,
                        padding: '3px 6px', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      + 新任務
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Agent list ── */}
        {agents.length > 0 && (
          <>
            <div style={{ height: 1, background: '#E7E5E4', margin: '8px 0' }} />
            <div style={{ padding: '4px 4px 6px' }}>
              <span style={{ fontSize: 10, color: '#A8A29E', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Agents
              </span>
            </div>
            {agentsLoading ? (
              <div style={{ padding: '4px 6px', fontSize: 10, color: '#C4C0BA' }}>載入中...</div>
            ) : (
              agents.slice(0, 6).map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 6px', borderRadius: 6, marginBottom: 2,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: avatarColor(a.name),
                    color: avatarTextColor(a.name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {agentInitial(a.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: 9, color: '#A8A29E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.skill ?? a.specialty}
                    </div>
                  </div>
                  {/* Status dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: statusColor(a.status),
                    flexShrink: 0,
                  }} />
                </div>
              ))
            )}
          </>
        )}
      </div>

      </>)}
      {/* ── Bottom: User info ── */}
      <div style={{
        borderTop: '1px solid #E7E5E4',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#FFF7ED', color: '#F97316',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {userEmail?.charAt(0)?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#78716C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userEmail ?? 'User'}
          </div>
        </div>
        <button onClick={onSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: 2 }} title="設定">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A29E', padding: 2 }} title="登出">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
