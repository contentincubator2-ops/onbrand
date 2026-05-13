/**
 * DeliverableBlock.tsx — Squad 交付物顯示區塊
 * 依 deliverable_level 顯示對應 UI：
 *   Level 1：直接產出即用（複製/下載/發布）
 *   Level 2：半成品到外部工具（Canva/Google Slides/影片）
 *   Level 3：定稿入庫（確認定稿按鈕 + 二次確認）
 */
import React, { useState } from 'react';
import { useLang } from '../../lib/i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeliverableTool = 'none' | 'canva' | 'google_slides' | 'google_doc' | 'openclaw_video';

export interface DeliverableItem {
  id: number;
  title?: string;
  content?: string;
  outputType?: string;
  deliverableLevel: 1 | 2 | 3;
  deliverableTool?: DeliverableTool;
  toolEditUrl?: string;
  toolUrlExpiresAt?: string;  // ISO date string
  finalizedStatus?: 'draft' | 'finalized';
  finalizedAt?: string;
  videoUrl?: string;         // Level 2 影片 URL
  previewHtml?: string;
}

interface DeliverableBlockProps {
  items: DeliverableItem[];
  onCopy?: (content: string) => void;
  onDownload?: (item: DeliverableItem) => void;
  onFinalize?: (id: number) => Promise<void>;
  onRegenerateUrl?: (id: number) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLevelLabel(level: number, lang: string): string {
  if (lang === 'en') {
    return level === 1 ? 'Level 1 · Ready to ship'
      : level === 2 ? 'Level 2 · Edit then use'
      : 'Level 3 · Finalize to library';
  }
  return level === 1 ? 'Level 1 · 直接即用'
    : level === 2 ? 'Level 2 · 編輯後使用'
    : 'Level 3 · 定稿入庫';
}

const LEVEL_COLOR: Record<number, string> = {
  1: '#34D399',
  2: '#F59E0B',
  3: '#818CF8',
};

const TOOL_ICON: Record<DeliverableTool, string> = {
  none: '',
  canva: '🎨',
  google_slides: '📊',
  google_doc: '📄',
  openclaw_video: '🎬',
};

function getToolName(tool: DeliverableTool, lang: string): string {
  if (tool === 'openclaw_video') return lang === 'en' ? 'Video' : '影片';
  return tool === 'canva' ? 'Canva'
    : tool === 'google_slides' ? 'Google Slides'
    : tool === 'google_doc' ? 'Google Doc'
    : '';
}

function isUrlExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function daysUntilExpiry(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
  const { lang } = useLang();
  return (
    <span style={{
      fontSize: 9,
      padding: '2px 7px',
      borderRadius: 4,
      background: LEVEL_COLOR[level] + '18',
      color: LEVEL_COLOR[level],
      border: `1px solid ${LEVEL_COLOR[level]}30`,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>
      {getLevelLabel(level, lang)}
    </span>
  );
}

function UrlExpiryWarning({ expiresAt, onRegenerate }: {
  expiresAt?: string;
  onRegenerate?: () => void;
}) {
  const { lang } = useLang();
  if (!expiresAt) return null;
  const days = daysUntilExpiry(expiresAt);
  const expired = isUrlExpired(expiresAt);

  if (!expired && (days === null || days > 7)) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      background: expired ? '#EF444415' : '#F59E0B15',
      border: `1px solid ${expired ? '#EF444430' : '#F59E0B30'}`,
      borderRadius: 6,
      marginTop: 8,
    }}>
      <span style={{ fontSize: 11, color: expired ? '#EF4444' : '#F59E0B' }}>
        {expired
          ? (lang === 'en' ? '⚠️ Edit link expired' : '⚠️ 編輯連結已過期')
          : (lang === 'en' ? `⏰ Edit link expires in ${days} day${days === 1 ? '' : 's'}` : `⏰ 編輯連結將於 ${days} 天後到期`)}
      </span>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '2px 8px',
            background: 'none',
            border: `1px solid ${expired ? '#EF4444' : '#F59E0B'}`,
            borderRadius: 4,
            color: expired ? '#EF4444' : '#F59E0B',
            cursor: 'pointer',
          }}
        >
          🔄 {lang === 'en' ? 'Regenerate' : '重新生成'}
        </button>
      )}
    </div>
  );
}

function FinalizeConfirmModal({ itemTitle, onConfirm, onCancel }: {
  itemTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, lang } = useLang();
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: '#1C1917',
        border: '1px solid #333',
        borderRadius: 12,
        padding: '24px',
        maxWidth: 400,
        width: '90%',
      }}>
        <div style={{ fontSize: 20, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#E8E8E8', marginBottom: 8 }}>
          {lang === 'en'
            ? `Finalize "${itemTitle || 'this document'}"?`
            : `確認定稿「${itemTitle || '此文件'}」？`}
        </div>
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 20 }}>
          {lang === 'en' ? (
            <>Once finalized, this document is saved as system knowledge and applied to all related Squad tasks.<br />You can still view it, but cannot undo.</>
          ) : (
            <>定稿後，此文件將儲存為系統知識，後續所有相關 Squad 任務將自動套用其內容。<br />定稿後仍可查看，但無法撤銷。</>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: '1px solid #444',
              borderRadius: 6,
              color: '#888',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              background: '#818CF8',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✅ {lang === 'en' ? 'Finalize' : '確認定稿'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single Deliverable Card ──────────────────────────────────────────────────

function DeliverableCard({
  item,
  onCopy,
  onDownload,
  onFinalize,
  onRegenerateUrl,
}: {
  item: DeliverableItem;
  onCopy?: (content: string) => void;
  onDownload?: (item: DeliverableItem) => void;
  onFinalize?: (id: number) => Promise<void>;
  onRegenerateUrl?: (id: number) => Promise<void>;
}) {
  const { t, lang } = useLang();
  const [showModal, setShowModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  const isFinalized = item.finalizedStatus === 'finalized';
  const tool = item.deliverableTool ?? 'none';
  const urlExpired = isUrlExpired(item.toolUrlExpiresAt);

  const handleCopy = () => {
    if (!item.content) return;
    navigator.clipboard.writeText(item.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onCopy?.(item.content);
  };

  const handleFinalize = async () => {
    setShowModal(false);
    setFinalizing(true);
    try {
      await onFinalize?.(item.id);
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <>
      <div style={{
        background: '#1C1917',
        border: '1px solid #252525',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 10,
      }}>
        {/* ── Card Header ── */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1E1E1E',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 13, color: '#E8E8E8', fontWeight: 600, flex: 1 }}>
            {tool !== 'none' && TOOL_ICON[tool]} {item.title || t('deliverable')}
          </span>
          <LevelBadge level={item.deliverableLevel} />
          {isFinalized && (
            <span style={{ fontSize: 10, color: '#34D399', background: '#34D39915', padding: '2px 7px', borderRadius: 4, border: '1px solid #34D39930' }}>
              {lang === 'en' ? 'Finalized' : '已定稿'} {item.finalizedAt ? new Date(item.finalizedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW') : ''}
            </span>
          )}
        </div>

        {/* ── Content Preview ── */}
        {item.content && (
          <div style={{ padding: '10px 14px' }}>
            <div style={{
              fontSize: 12,
              color: '#888',
              lineHeight: 1.7,
              maxHeight: contentExpanded ? 'none' : 100,
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {item.content}
            </div>
            {item.content.length > 200 && (
              <button
                onClick={() => setContentExpanded(e => !e)}
                style={{
                  fontSize: 10, color: '#555', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '4px 0 0',
                }}
              >
                {contentExpanded ? (lang === 'en' ? '▾ Collapse' : '▾ 收起') : (lang === 'en' ? '▸ Show more' : '▸ 展開全文')}
              </button>
            )}
          </div>
        )}

        {/* ── Video Preview (Level 2 影片) ── */}
        {item.videoUrl && (
          <div style={{ padding: '0 14px 10px' }}>
            <video
              src={item.videoUrl}
              controls
              style={{ width: '100%', borderRadius: 6, background: '#111' }}
            />
          </div>
        )}

        {/* ── URL Expiry Warning (Level 2) ── */}
        {item.deliverableLevel === 2 && item.toolEditUrl && (
          <div style={{ padding: '0 14px 4px' }}>
            <UrlExpiryWarning
              expiresAt={item.toolUrlExpiresAt}
              onRegenerate={onRegenerateUrl ? () => onRegenerateUrl(item.id) : undefined}
            />
          </div>
        )}

        {/* ── Finalized notice ── */}
        {isFinalized && (
          <div style={{
            padding: '6px 14px 10px',
          }}>
            <div style={{
              fontSize: 11,
              color: '#34D399',
              background: '#34D39910',
              border: '1px solid #34D39925',
              borderRadius: 6,
              padding: '6px 10px',
            }}>
              ✅ {lang === 'en' ? 'This document is finalized — all related Squad tasks will apply it automatically' : '此文件已定稿，後續所有相關 Squad 任務將自動套用此設定'}
            </div>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{
          padding: '8px 14px 12px',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          borderTop: '1px solid #1E1E1E',
        }}>

          {/* Level 1 buttons */}
          {item.deliverableLevel === 1 && (
            <>
              {item.content && (
                <ActionBtn onClick={handleCopy} color="#34D399">
                  {copied ? `✓ ${t('copied')}` : `📋 ${t('copy')}`}
                </ActionBtn>
              )}
              {onDownload && (
                <ActionBtn onClick={() => onDownload(item)} color="#34D399">
                  ⬇️ {t('download')}
                </ActionBtn>
              )}
            </>
          )}

          {/* Level 2 buttons */}
          {item.deliverableLevel === 2 && (
            <>
              {tool !== 'none' && tool !== 'openclaw_video' && item.toolEditUrl && !urlExpired && (
                <ActionBtn
                  href={item.toolEditUrl}
                  color="#F59E0B"
                >
                  ✏️ {lang === 'en' ? `Edit in ${getToolName(tool, lang)}` : `在 ${getToolName(tool, lang)} 編輯`} ↗
                </ActionBtn>
              )}
              {tool === 'openclaw_video' && item.videoUrl && (
                <ActionBtn href={item.videoUrl} color="#F59E0B">
                  ⬇️ {lang === 'en' ? 'Download video' : '下載影片'}
                </ActionBtn>
              )}
              {tool === 'openclaw_video' && onRegenerateUrl && (
                <ActionBtn onClick={() => onRegenerateUrl(item.id)} color="#888">
                  🔄 {lang === 'en' ? 'Regenerate' : '重新生成'}
                </ActionBtn>
              )}
            </>
          )}

          {/* Level 3 buttons */}
          {item.deliverableLevel === 3 && (
            <>
              {tool !== 'none' && tool !== 'openclaw_video' && item.toolEditUrl && !urlExpired && !isFinalized && (
                <ActionBtn href={item.toolEditUrl} color="#818CF8">
                  ✏️ {lang === 'en' ? 'Keep editing' : '繼續編輯'} ↗
                </ActionBtn>
              )}
              {!isFinalized && (
                <ActionBtn
                  onClick={() => setShowModal(true)}
                  color="#818CF8"
                  disabled={finalizing}
                  primary
                >
                  {finalizing ? (lang === 'en' ? 'Finalizing...' : '定稿中...') : `✅ ${lang === 'en' ? 'Finalize' : '確認定稿'}`}
                </ActionBtn>
              )}
            </>
          )}

          {/* 共用複製按鈕 (L2/L3 也可複製文字) */}
          {item.deliverableLevel > 1 && item.content && (
            <ActionBtn onClick={handleCopy} color="#555">
              {copied ? `✓ ${t('copied')}` : `📋 ${lang === 'en' ? 'Copy text' : '複製文字'}`}
            </ActionBtn>
          )}
        </div>

        {/* Level 2 說明文字 */}
        {item.deliverableLevel === 2 && !isFinalized && (
          <div style={{
            padding: '0 14px 10px',
            fontSize: 10,
            color: '#444',
          }}>
            {lang === 'en' ? 'AI finished ~70% of the design — open it to fine-tune visuals' : 'AI 已完成 70% 設計，點開後可調整視覺細節'}
          </div>
        )}
      </div>

      {/* Finalize Modal */}
      {showModal && (
        <FinalizeConfirmModal
          itemTitle={item.title}
          onConfirm={handleFinalize}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Action Button helper ─────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  href,
  color,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  color?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '5px 12px',
    borderRadius: 6,
    fontWeight: primary ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: primary ? (color ?? '#818CF8') : 'none',
    border: `1px solid ${color ?? '#444'}`,
    color: primary ? '#fff' : (color ?? '#888'),
  };

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={baseStyle}>
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} style={baseStyle}>
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliverableBlock({
  items,
  onCopy,
  onDownload,
  onFinalize,
  onRegenerateUrl,
}: DeliverableBlockProps) {
  const { t, lang } = useLang();
  if (!items || items.length === 0) return null;

  // 依 level 分組
  const byLevel: Record<number, DeliverableItem[]> = { 1: [], 2: [], 3: [] };
  items.forEach(item => {
    const l = item.deliverableLevel ?? 1;
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(item);
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 10,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 8,
      }}>
        {t('deliverable')}
      </div>

      {([1, 2, 3] as const).map(level =>
        byLevel[level]?.length > 0 ? (
          <div key={level}>
            {items.length > byLevel[level].length && (
              <div style={{
                fontSize: 9,
                color: LEVEL_COLOR[level],
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 4,
                marginTop: level > 1 ? 10 : 0,
              }}>
                {getLevelLabel(level, lang)}
              </div>
            )}
            {byLevel[level].map(item => (
              <DeliverableCard
                key={item.id}
                item={item}
                onCopy={onCopy}
                onDownload={onDownload}
                onFinalize={onFinalize}
                onRegenerateUrl={onRegenerateUrl}
              />
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
