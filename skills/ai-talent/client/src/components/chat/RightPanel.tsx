/**
 * RightPanel.tsx — Perplexity 風格右側面板（288px）
 * Tab 1「流程」：垂直 workflow DAG，每步驟顯示狀態顏色
 * Tab 2「知識庫」：品牌知識快覽
 * Tab 3「成果」：artifact 卡片列表，每張有 thumbnail + agent名 + skill名
 */
import React, { useState } from 'react';
import ArtifactPreview, { type ArtifactPreviewProps } from './ArtifactPreview';
import { trpc } from '../../lib/trpc';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  label: string;
  agentName?: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  eta?: string;
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

// ─── Step colors ─────────────────────────────────────────────────────────────

const STEP_COLORS: Record<WorkflowStep['status'], { dot: string; label: string; line: string }> = {
  pending: { dot: '#333', label: '#555', line: '#252525' },
  running: { dot: '#F59E0B', label: '#E8E8E8', line: '#F59E0B50' },
  done:    { dot: '#F97316', label: '#E8E8E8', line: '#F9731650' },
  error:   { dot: '#EF4444', label: '#EF4444', line: '#EF444450' },
  skipped: { dot: '#555', label: '#555', line: '#1E1E1E' },
};

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

  // Load brand knowledge from tRPC if brandId provided
  const brandQuery = trpc.brand.get.useQuery(
    { id: brandId! },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );
  const brandData = brandQuery.data as any;

  // Merge passed knowledge items with brand data
  const knowledgeList: KnowledgeItem[] = [
    ...(brandData ? [
      brandData.name && { key: '品牌', value: brandData.name },
      brandData.website && { key: '官網', value: brandData.website },
      brandData.targetAudience && { key: '目標受眾', value: brandData.targetAudience },
      brandData.competitors && { key: '競爭者', value: brandData.competitors },
      brandData.targetMarket && { key: '目標市場', value: brandData.targetMarket },
      brandData.contentLanguage && { key: '內容語言', value: brandData.contentLanguage },
    ].filter(Boolean) as KnowledgeItem[] : []),
    ...knowledgeItems,
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'flow', label: '流程' },
    { id: 'knowledge', label: '知識庫' },
    { id: 'artifacts', label: '成果' },
  ];

  return (
    <aside style={{
      width: 288,
      minWidth: 288,
      background: '#1C1917',
      borderLeft: '1px solid #292524',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #292524',
        flexShrink: 0,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontSize: 11,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#F97316' : '#555',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #1DBEAA' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>

        {/* ── Tab 1: 流程 ── */}
        {activeTab === 'flow' && (
          <div>
            {workflowSteps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 11 }}>
                尚無任務流程
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {workflowSteps.map((step, i) => {
                  const colors = STEP_COLORS[step.status];
                  const isLast = i === workflowSteps.length - 1;
                  return (
                    <div key={step.id} style={{ display: 'flex', gap: 10, marginBottom: isLast ? 0 : 4 }}>
                      {/* Line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: colors.dot,
                          border: step.status === 'running' ? `2px solid ${colors.dot}` : 'none',
                          flexShrink: 0,
                          marginTop: 3,
                          boxShadow: step.status === 'running' ? `0 0 6px ${colors.dot}` : 'none',
                        }} />
                        {!isLast && (
                          <div style={{
                            width: 1.5,
                            flex: 1,
                            background: colors.line,
                            minHeight: 20,
                            marginTop: 2,
                          }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: colors.label, fontWeight: step.status === 'running' ? 600 : 400 }}>
                            {step.label}
                          </span>
                          {step.status === 'running' && (
                            <div style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: '#F59E0B',
                              animation: 'pulse 1s infinite',
                            }} />
                          )}
                          {step.status === 'done' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1DBEAA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </div>
                        {step.agentName && (
                          <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>{step.agentName}</div>
                        )}
                        {step.eta && step.status !== 'done' && (
                          <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>預計 {step.eta}</div>
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
            <div style={{ fontSize: 10, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              品牌知識
            </div>
            {knowledgeList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 11 }}>
                尚無品牌知識
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {knowledgeList.map((item, i) => (
                  <div key={i} style={{
                    background: '#211F1C',
                    border: '1px solid #292524',
                    borderRadius: 6,
                    padding: '7px 10px',
                  }}>
                    <div style={{ fontSize: 9, color: '#555', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {item.key}
                    </div>
                    <div style={{ fontSize: 11, color: '#C8C8C8', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {item.value}
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
            <div style={{ fontSize: 10, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              任務成果
            </div>
            {artifacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 11 }}>
                尚無成果
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
