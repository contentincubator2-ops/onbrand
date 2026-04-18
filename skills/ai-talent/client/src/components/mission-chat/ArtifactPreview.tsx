/**
 * ArtifactPreview.tsx — 產出預覽元件（inline，Perplexity 風格）
 * 支援：文件、程式碼、圖片、試算表、投影片
 */
import React, { useState } from 'react';

export type ArtifactType = 'doc' | 'sheet' | 'ppt' | 'image' | 'code' | 'other';

export interface ArtifactPreviewProps {
  id: string;
  filename: string;
  type: ArtifactType;
  content?: string;
  url?: string;
  /** Agent that produced this artifact */
  agentName?: string;
  /** Skill that produced this artifact */
  skill?: string;
  thumbnail?: string;
  createdAt?: number;
  onOpen?: (id: string) => void;
  onDownload?: (id: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<ArtifactType, { icon: string; label: string; previewBg: string }> = {
  doc:   { icon: '📄', label: 'Document', previewBg: '#1A2030' },
  sheet: { icon: '📊', label: 'Spreadsheet', previewBg: '#0D2010' },
  ppt:   { icon: '📑', label: 'Presentation', previewBg: '#1A1020' },
  image: { icon: '🖼', label: 'Image', previewBg: '#101018' },
  code:  { icon: '💻', label: 'Code', previewBg: '#0D1A0D' },
  other: { icon: '📎', label: 'File', previewBg: '#1A1A1A' },
};

function getFileType(filename: string, type: ArtifactType): ArtifactType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return 'doc';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'cpp'].includes(ext)) return 'code';
  return type;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ArtifactPreview({
  id,
  filename,
  type: rawType,
  content,
  url,
  agentName,
  skill,
  thumbnail,
  createdAt,
  onOpen,
  onDownload,
}: ArtifactPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const resolvedType = getFileType(filename, rawType);
  const meta = TYPE_META[resolvedType];

  return (
    <div style={{
      background: '#161616',
      border: '1px solid #252525',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* ── Header row ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#1A1A1A',
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 500, color: '#E8E8E8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filename}
          </div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>
            {meta.label}
            {agentName && <> · {agentName}</>}
            {skill && <span style={{ color: '#1DBEAA' }}> · {skill}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {content && content.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                fontSize: 10, padding: '3px 8px',
                border: '1px solid #2A2A2A', borderRadius: 4,
                background: 'none', color: '#888', cursor: 'pointer',
              }}
            >
              {expanded ? '收起' : '預覽'}
            </button>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10, padding: '3px 8px',
                border: '1px solid #1DBEAA50', borderRadius: 4,
                color: '#1DBEAA', textDecoration: 'none', cursor: 'pointer',
              }}
              onClick={() => onOpen?.(id)}
            >
              開啟 ↗
            </a>
          )}
          {onDownload && (
            <button
              onClick={() => onDownload(id)}
              style={{
                fontSize: 10, padding: '3px 8px',
                border: '1px solid #2A2A2A', borderRadius: 4,
                background: 'none', color: '#888', cursor: 'pointer',
              }}
            >
              ↓
            </button>
          )}
        </div>
      </div>

      {/* ── Thumbnail ── */}
      {thumbnail && !expanded && (
        <div style={{
          height: 80,
          background: meta.previewBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <img
            src={thumbnail}
            alt={filename}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* ── Type-specific placeholder thumbnail ── */}
      {!thumbnail && !expanded && content && (
        <div style={{
          height: 60,
          background: meta.previewBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 12px',
          overflow: 'hidden',
        }}>
          {resolvedType === 'code' ? (
            <div style={{
              fontFamily: 'monospace', fontSize: 9, color: '#4ADE80',
              width: '100%', overflow: 'hidden',
              whiteSpace: 'pre', lineHeight: 1.6,
            }}>
              {content.slice(0, 150)}
            </div>
          ) : resolvedType === 'sheet' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, width: '100%' }}>
              {['欄A','欄B','欄C','—','—','—','—','—','—'].map((c,i) => (
                <div key={i} style={{
                  fontSize: 8, padding: '2px 4px', borderRadius: 2,
                  background: i < 3 ? '#1DBEAA20' : '#1A2A1A',
                  color: i < 3 ? '#1DBEAA' : '#555',
                  textAlign: 'center',
                }}>{c}</div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {content.slice(0, 120)}...
            </div>
          )}
        </div>
      )}

      {/* ── Expanded content ── */}
      {expanded && content && (
        <div style={{
          padding: '10px 12px',
          maxHeight: 240,
          overflowY: 'auto',
          background: meta.previewBg,
        }}>
          {resolvedType === 'code' ? (
            <pre style={{
              fontFamily: 'monospace', fontSize: 10, color: '#4ADE80',
              margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {content}
            </pre>
          ) : (
            <div style={{
              fontSize: 11, color: '#C8C8C8', lineHeight: 1.7,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {content}
            </div>
          )}
        </div>
      )}

      {/* ── Footer: created time ── */}
      {createdAt && (
        <div style={{
          padding: '4px 12px',
          fontSize: 9, color: '#444',
          borderTop: '1px solid #1E1E1E',
          textAlign: 'right',
        }}>
          {new Date(createdAt).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}
