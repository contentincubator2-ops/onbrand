/**
 * RightPanel.tsx — Perplexity / Claude Code 風格右側面板
 * Tab 1「流程」：帶 Agent 頭像的執行時間軸，每步驟顯示狀態顏色
 * Tab 2「知識庫」：品牌知識快覽
 * Tab 3「成果」：artifact 卡片列表
 */
import React, { useState } from 'react';
import ArtifactPreview, { type ArtifactPreviewProps } from './ArtifactPreview';
import { trpc } from '../../lib/trpc';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  label: string;
  agentName?: string;
  agentTitle?: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  eta?: string;
  summary?: string;
}

export interface KnowledgeItem {
  key: string;
  value: string;
}

export interface PanelArtifact {
  id: string;
  filename: string;
  type: 'doc' | 'sheet' | 'ppt' | 'image' | 'code' | 'other';
  content?: string;
  url?: string;
  agentName?: string;
  skill?: string;
  thumbnail?: string;
  createdAt?: number;
}

interface Props {
  workflowSteps?: WorkflowStep[];
  knowledgeItems?: KnowledgeItem[];
  artifacts?: PanelArtifact[];
  brandId?: number;
  missionId?: number | null;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    ring:  'rgba(156,163,175,0.3)',
    bg:    '#F3F4F6',
    text:  '#6B7280',
    dot:   '#D1D5DB',
    line:  '#E5E7EB',
    label: '#9CA3AF',
  },
  running: {
    ring:  'rgba(59,130,246,0.25)',
    bg:    '#EFF6FF',
    text:  '#1D4ED8',
    dot:   '#3B82F6',
    line:  '#93C5FD',
    label: '#1E40AF',
  },
  done: {
    ring:  'rgba(16,185,129,0.2)',
    bg:    '#ECFDF5',
    text:  '#065F46',
    dot:   '#10B981',
    line:  '#6EE7B7',
    label: '#374151',
  },
  error: {
    ring:  'rgba(239,68,68,0.2)',
    bg:    '#FEF2F2',
    text:  '#991B1B',
    dot:   '#EF4444',
    line:  '#FCA5A5',
    label: '#DC2626',
  },
  skipped: {
    ring:  'rgba(156,163,175,0.2)',
    bg:    '#F9FAFB',
    text:  '#9CA3AF',
    dot:   '#D1D5DB',
    line:  '#E5E7EB',
    label: '#9CA3AF',
  },
};

// ─── Agent Avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({
  name, status, size = 28,
}: { name?: string; status: WorkflowStep['status']; size?: number }) {
  const cfg = STATUS_CONFIG[status];
  const initial = name ? name.charAt(0) : '·';
  const isRunning = status === 'running';
  const isDone = status === 'done';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: cfg.bg,
      border: `1.5px solid ${cfg.dot}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: cfg.text,
      flexShrink: 0,
      boxShadow: isRunning ? `0 0 0 3px ${cfg.ring}` : 'none',
      position: 'relative',
      transition: 'box-shadow 0.3s',
    }}>
      {isDone ? (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none"
          stroke={cfg.dot} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <span>{initial}</span>
      )}
      {/* Pulse ring for running */}
      {isRunning && (
        <span style={{
          position: 'absolute', inset: -4,
          borderRadius: '50%', border: '1.5px solid #3B82F6',
          animation: 'pulseRing 1.6s ease-out infinite',
          opacity: 0,
        }} />
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconFlow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const IconBrain = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

const IconFile = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'flow' | 'knowledge' | 'artifacts';

export default function RightPanel({
  workflowSteps = [],
  knowledgeItems = [],
  artifacts = [],
  brandId,
  missionId,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('flow');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Load brand knowledge
  const brandQuery = trpc.brand.get.useQuery(
    { id: brandId! },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );
  const brandData = brandQuery.data as any;

  const knowledgeList: KnowledgeItem[] = [
    ...(brandData ? [
      brandData.name           && { key: '品牌名稱', value: brandData.name },
      brandData.website        && { key: '官網',     value: brandData.website },
      brandData.targetAudience && { key: '目標受眾', value: brandData.targetAudience },
      brandData.competitors    && { key: '競爭對手', value: brandData.competitors },
      brandData.targetMarket   && { key: '目標市場', value: brandData.targetMarket },
      brandData.contentLanguage && { key: '內容語言', value: brandData.contentLanguage },
    ].filter(Boolean) as KnowledgeItem[] : []),
    ...knowledgeItems,
  ];

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'flow',      label: '流程',  icon: <IconFlow />,  count: workflowSteps.length || undefined },
    { id: 'knowledge', label: '知識庫', icon: <IconBrain />, count: knowledgeList.length || undefined },
    { id: 'artifacts', label: '成果',  icon: <IconFile />,  count: artifacts.length || undefined },
  ];

  // Counts
  const doneCount    = workflowSteps.filter(s => s.status === 'done').length;
  const runningCount = workflowSteps.filter(s => s.status === 'running').length;
  const totalCount   = workflowSteps.length;

  return (
    <aside style={{
      width: 272,
      minWidth: 272,
      background: '#FAFAF9',
      borderLeft: '1px solid #EBEBEA',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <style>{`
        @keyframes pulseRing {
          0%   { transform: scale(0.95); opacity: 0.6; }
          70%  { transform: scale(1.15); opacity: 0; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Panel header ── */}
      <div style={{
        padding: '14px 16px 0',
        flexShrink: 0,
      }}>
        {/* Progress summary (only shown when steps exist) */}
        {totalCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12,
            padding: '8px 10px',
            background: runningCount > 0 ? '#EFF6FF' : doneCount === totalCount ? '#ECFDF5' : '#F9FAFB',
            borderRadius: 8,
            border: `1px solid ${runningCount > 0 ? '#BFDBFE' : doneCount === totalCount ? '#BBF7D0' : '#E5E7EB'}`,
          }}>
            {/* Mini step dots */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {workflowSteps.slice(0, 8).map((s, i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: s.status === 'done' ? '#10B981'
                    : s.status === 'running' ? '#3B82F6'
                    : s.status === 'error' ? '#EF4444'
                    : '#D1D5DB',
                  flexShrink: 0,
                }} />
              ))}
              {workflowSteps.length > 8 && (
                <span style={{ fontSize: 9, color: '#9CA3AF' }}>+{workflowSteps.length - 8}</span>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 500, marginLeft: 2,
              color: runningCount > 0 ? '#1D4ED8' : doneCount === totalCount ? '#065F46' : '#374151',
            }}>
              {runningCount > 0
                ? `執行中 · ${doneCount}/${totalCount} 完成`
                : doneCount === totalCount && totalCount > 0
                ? `✓ 全部完成 (${totalCount} 步驟)`
                : `${doneCount}/${totalCount} 完成`}
            </span>
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '7px 4px',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#1A1A18' : '#9CA3AF',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  borderBottom: isActive ? '2px solid #1A1A18' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  position: 'relative',
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.6 }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    background: isActive ? '#1A1A18' : '#E5E7EB',
                    color: isActive ? '#FFFFFF' : '#6B7280',
                    borderRadius: 10, padding: '1px 5px',
                    lineHeight: 1.4,
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Tab bottom line */}
        <div style={{ height: 1, background: '#EBEBEA', marginTop: -1 }} />
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>

        {/* ── Tab 1: 流程 ── */}
        {activeTab === 'flow' && (
          <div>
            {workflowSteps.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 20px', color: '#9CA3AF',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconFlow />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>尚無任務流程</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5 }}>
                  發送任務後，Agent 執行步驟<br/>將在此處即時顯示
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {workflowSteps.map((step, i) => {
                  const cfg = STATUS_CONFIG[step.status];
                  const isLast = i === workflowSteps.length - 1;
                  const isExpanded = expandedStep === step.id;
                  const hasMore = !!step.summary;
                  return (
                    <div key={step.id} style={{ display: 'flex', gap: 10, marginBottom: isLast ? 0 : 0 }}>
                      {/* Timeline spine */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        width: 28, flexShrink: 0,
                      }}>
                        <AgentAvatar name={step.agentName} status={step.status} size={26} />
                        {!isLast && (
                          <div style={{
                            width: 1.5, flex: 1,
                            background: `linear-gradient(to bottom, ${cfg.dot}80, ${STATUS_CONFIG[workflowSteps[i+1].status].dot}40)`,
                            minHeight: 18,
                            marginTop: 3, marginBottom: 3,
                          }} />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{
                        flex: 1, paddingBottom: isLast ? 0 : 10,
                        minWidth: 0,
                      }}>
                        {/* Step header */}
                        <div
                          style={{
                            display: 'flex', alignItems: 'flex-start',
                            justifyContent: 'space-between', gap: 4,
                            cursor: hasMore ? 'pointer' : 'default',
                            paddingTop: 2,
                          }}
                          onClick={() => hasMore && setExpandedStep(isExpanded ? null : step.id)}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: 11.5, fontWeight: step.status === 'running' ? 600 : 500,
                              color: cfg.label, lineHeight: 1.3,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {step.label}
                            </div>
                            {step.agentName && (
                              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                                {step.agentName}
                                {step.agentTitle && ` · ${step.agentTitle}`}
                              </div>
                            )}
                          </div>

                          {/* Status badge */}
                          <div style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
                            marginTop: 2,
                          }}>
                            {step.status === 'running' && (
                              <span style={{
                                fontSize: 9, color: '#1D4ED8', background: '#DBEAFE',
                                borderRadius: 4, padding: '1px 5px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 2,
                              }}>
                                <span style={{
                                  width: 4, height: 4, borderRadius: '50%',
                                  background: '#3B82F6', display: 'inline-block',
                                  animation: 'pulse 1s infinite',
                                }} />
                                執行中
                              </span>
                            )}
                            {step.status === 'done' && hasMore && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Expanded summary */}
                        {isExpanded && step.summary && (
                          <div style={{
                            marginTop: 6,
                            padding: '8px 10px',
                            background: '#F8FAFC',
                            borderRadius: 6,
                            border: '1px solid #E2E8F0',
                            fontSize: 11, color: '#475569', lineHeight: 1.5,
                            animation: 'slideDown 0.15s ease',
                          }}>
                            {step.summary.slice(0, 200)}{step.summary.length > 200 ? '…' : ''}
                          </div>
                        )}

                        {/* ETA */}
                        {step.eta && step.status !== 'done' && (
                          <div style={{ fontSize: 9.5, color: '#9CA3AF', marginTop: 2 }}>
                            預計 {step.eta}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: 知識庫 ── */}
        {activeTab === 'knowledge' && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#9CA3AF',
              marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              品牌知識
            </div>
            {knowledgeList.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 20px', color: '#9CA3AF',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconBrain />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>尚無品牌知識</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>選擇品牌後自動載入</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {knowledgeList.map((item, i) => (
                  <div key={i} style={{
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    padding: '8px 10px',
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{
                      fontSize: 9.5, color: '#9CA3AF',
                      marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}>
                      {item.key}
                    </div>
                    <div style={{
                      fontSize: 12, color: '#374151',
                      lineHeight: 1.5, wordBreak: 'break-word',
                    }}>
                      {item.value.length > 100
                        ? item.value.slice(0, 100) + '…'
                        : item.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: 成果 ── */}
        {activeTab === 'artifacts' && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#9CA3AF',
              marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              任務成果
            </div>
            {artifacts.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 20px', color: '#9CA3AF',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconFile />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>尚無成果</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Squad 完成後自動歸檔</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {artifacts.map(a => (
                  <ArtifactPreview
                    key={a.id}
                    id={a.id}
                    filename={a.filename}
                    type={a.type}
                    content={a.content}
                    url={a.url}
                    agentName={a.agentName}
                    skill={a.skill}
                    thumbnail={a.thumbnail}
                    createdAt={a.createdAt}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
