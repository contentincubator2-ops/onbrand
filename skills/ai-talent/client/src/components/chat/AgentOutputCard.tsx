/**
 * AgentOutputCard.tsx — Perplexity 風格 Agent 輸出卡
 * 包含：
 * - Avatar + 名字 + 職稱
 * - 任務描述
 * - skill pill + AI model pill
 * - 狀態（完成/進行中）
 * - 內文輸出
 * - Artifact 預覽區（inline）
 * - Source cards
 */
import React, { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentCardArtifact {
  id: string;
  filename: string;
  type: 'doc' | 'sheet' | 'ppt' | 'image' | 'code' | 'other';
  content?: string;
  url?: string;
}

export interface AgentCardSource {
  title: string;
  url?: string;
  snippet?: string;
}

export interface AgentOutputCardProps {
  agentId?: number;
  agentName: string;
  agentTitle?: string;
  skill?: string;
  aiModel?: string;
  taskDescription?: string;
  status?: 'running' | 'done' | 'error';
  content?: string;
  artifacts?: AgentCardArtifact[];
  sources?: AgentCardSource[];
  isStreaming?: boolean;
  children?: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avatarBg(name: string): string {
  const colors = ['rgba(249,115,22,0.08)','#7C3AED20','#F59E0B20','#3B82F620','#EC489920'];
  return colors[name.charCodeAt(0) % colors.length];
}
function avatarFg(name: string): string {
  const colors = ['#F97316','#7C3AED','#F59E0B','#3B82F6','#EC4899'];
  return colors[name.charCodeAt(0) % colors.length];
}

const TYPE_ICON: Record<string, string> = {
  doc: '📄',
  sheet: '📊',
  ppt: '📑',
  image: '🖼',
  code: '💻',
  other: '📎',
};

function ArtifactCard({ artifact }: { artifact: AgentCardArtifact }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TYPE_ICON[artifact.type] ?? '📎';

  return (
    <div style={{
      background: '#211F1C',
      border: '1px solid #252525',
      borderRadius: 8,
      overflow: 'hidden',
      marginTop: 8,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: artifact.content ? '1px solid #252525' : 'none',
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 11, color: '#E8E8E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {artifact.filename}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {artifact.content && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                fontSize: 10, padding: '2px 8px',
                border: '1px solid #333', borderRadius: 4,
                background: 'none', color: '#888', cursor: 'pointer',
              }}
            >
              {expanded ? '收起' : '展開'}
            </button>
          )}
          {artifact.url && (
            <a
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10, padding: '2px 8px',
                border: '1px solid #333', borderRadius: 4,
                background: 'none', color: '#F97316', cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              開啟 ↗
            </a>
          )}
        </div>
      </div>

      {/* Thumbnail / Preview */}
      {expanded && artifact.content && (
        <div style={{
          padding: '10px 12px',
          fontSize: 11,
          color: '#888',
          lineHeight: 1.6,
          maxHeight: 200,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          background: '#111',
        }}>
          {artifact.content.slice(0, 800)}{artifact.content.length > 800 ? '...' : ''}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentOutputCard({
  agentName,
  agentTitle,
  skill,
  aiModel,
  taskDescription,
  status = 'done',
  content,
  artifacts = [],
  sources = [],
  isStreaming,
  children,
}: AgentOutputCardProps) {
  const [contentExpanded, setContentExpanded] = useState(true);

  const statusLabel = status === 'running' ? '進行中' : status === 'done' ? '完成' : '錯誤';
  const statusColor = status === 'running' ? '#F59E0B' : status === 'done' ? '#F97316' : '#EF4444';

  return (
    <div style={{
      background: '#211F1C',
      border: '1px solid #1E1E1E',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid #1E1E1E',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: avatarBg(agentName),
          color: avatarFg(agentName),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {agentName.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + title + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E8E8E8' }}>{agentName}</span>
            {agentTitle && (
              <span style={{ fontSize: 11, color: '#555' }}>{agentTitle}</span>
            )}
            {/* Status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              marginLeft: 'auto',
            }}>
              {isStreaming && (
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#F59E0B',
                  animation: 'pulse 1s infinite',
                }} />
              )}
              <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
            </div>
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {skill && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, padding: '2px 7px',
                background: '#818CF820', color: '#F97316',
                border: '1px solid #818CF840',
                borderRadius: 4, fontWeight: 500,
              }}>
                🔧 {skill}
              </span>
            )}
            {aiModel && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, padding: '2px 7px',
                background: '#34D39915', color: '#34D399',
                border: '1px solid #34D39930',
                borderRadius: 4, fontWeight: 500,
              }}>
                ✦ {aiModel}
              </span>
            )}
          </div>

          {/* Task description */}
          {taskDescription && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
              {taskDescription}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {(content || children) && (
        <div style={{ padding: '10px 14px' }}>
          {/* Toggle */}
          {content && content.length > 300 && (
            <button
              onClick={() => setContentExpanded(e => !e)}
              style={{
                fontSize: 10, color: '#555', background: 'none',
                border: 'none', cursor: 'pointer', padding: '0 0 6px',
                display: 'block',
              }}
            >
              {contentExpanded ? '▾ 收起' : '▸ 展開'}
            </button>
          )}
          {contentExpanded && (
            <div style={{
              fontSize: 12, color: '#C8C8C8', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {isStreaming && (!content || content.length === 0) ? (
                <span style={{ color: '#555' }}>思考中...</span>
              ) : content}
              {isStreaming && content && (
                <span style={{
                  display: 'inline-block',
                  width: 2, height: 14,
                  background: '#F97316',
                  marginLeft: 2,
                  verticalAlign: 'middle',
                  animation: 'blink 0.8s steps(1) infinite',
                }} />
              )}
            </div>
          )}
          {children}
        </div>
      )}

      {/* ── Artifacts ── */}
      {artifacts.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            產出檔案
          </div>
          {artifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
        </div>
      )}

      {/* ── Sources ── */}
      {sources.length > 0 && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid #1A1A1A' }}>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            來源
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sources.slice(0, 4).map((src, i) => (
              <a
                key={i}
                href={src.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '5px 8px',
                  background: '#1C1917',
                  border: '1px solid #252525',
                  borderRadius: 6,
                  textDecoration: 'none',
                  maxWidth: 140,
                }}
              >
                <div style={{ fontSize: 10, color: '#E8E8E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src.title}
                </div>
                {src.snippet && (
                  <div style={{ fontSize: 9, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {src.snippet}
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
