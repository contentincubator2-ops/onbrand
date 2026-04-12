/**
 * ArtifactReviewPanel.tsx — 右側任務指揮中心
 * Tab 順序：SOP → 產出 → 知識庫
 * 底部常駐：審核佇列
 */
import { useState, useRef } from "react";
import { trpc } from "../../lib/trpc";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: number;
  name: string;
  title: string;
  layer: 'strategy' | 'execution' | 'training';
  status: 'active' | 'waiting' | 'complete' | 'standby';
  owns: string;
  aiModel?: string;
}

export interface Artifact {
  id: string;
  type: string;
  label: string;
  version: number;
  content: string;
  createdAt: number;
  pinned?: boolean;
}

export interface ReviewItem {
  id: string;
  label: string;
  status: 'waiting_user' | 'ready' | 'approved' | 'rejected' | 'blocked';
  dependsOn?: string;
}

interface Props {
  team?: TeamMember[];
  artifacts?: Artifact[];
  reviews?: ReviewItem[];
  agentsLoading?: boolean;
  missionId?: number | null;
  onApproveReview?: (id: string) => void;
  onRejectReview?: (id: string) => void;
  onPinArtifact?: (id: string) => void;
  onExportArtifact?: (id: string) => void;
}

type Tab = 'sop' | 'outputs' | 'knowledge';

// ─── Platform Preview ────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘', instagram: '📷', linkedin: '💼', youtube: '▶️',
  google_ads: '🔍', email: '📧', ppt: '📊', doc: '📄',
  script: '🎬', other: '📝',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn',
  youtube: 'YouTube', google_ads: 'Google Ads', email: 'Email/EDM',
  ppt: 'Slides', doc: 'Document', script: '影片腳本', other: '其他',
};

function PlatformPreview({ platform, content, title }: { platform: string; content: string; title?: string }) {
  if (platform === 'facebook') return (
    <div style={{ fontFamily: 'Helvetica,Arial,sans-serif', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#fff', fontSize: 14 }}>
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>B</div>
        <div><div style={{ fontWeight: 600, fontSize: 13 }}>品牌頁面</div><div style={{ fontSize: 11, color: '#65676b' }}>剛剛 · 🌐</div></div>
      </div>
      <div style={{ padding: '0 12px 12px', fontSize: 14, lineHeight: 1.6, color: '#1c1e21', whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );

  if (platform === 'instagram') return (
    <div style={{ fontFamily: '-apple-system,sans-serif', border: '1px solid #dbdbdb', borderRadius: 4, background: '#fff', fontSize: 14 }}>
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>brand_account</span>
      </div>
      <div style={{ background: '#f5f5f5', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 12 }}>圖片區域</div>
      <div style={{ padding: '10px 12px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}><strong>brand_account</strong> {content}</div>
    </div>
  );

  if (platform === 'linkedin') return (
    <div style={{ fontFamily: '-apple-system,sans-serif', border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', padding: 14, fontSize: 14 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#0077B5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, flexShrink: 0 }}>B</div>
        <div><div style={{ fontWeight: 600, fontSize: 13 }}>品牌名稱</div><div style={{ fontSize: 11, color: '#666' }}>行銷 · 1分鐘前</div></div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );

  if (platform === 'google_ads') return (
    <div style={{ fontFamily: 'Arial,sans-serif', border: '1px solid #ddd', borderRadius: 4, padding: 12, background: '#fff', fontSize: 13 }}>
      <div style={{ fontSize: 11, color: '#006621', marginBottom: 2 }}>廣告 · www.example.com</div>
      <div style={{ fontSize: 17, color: '#1a0dab', marginBottom: 4 }}>{title || '廣告標題'}</div>
      <div style={{ color: '#545454', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );

  if (platform === 'email') return (
    <div style={{ fontFamily: 'Arial,sans-serif', border: '1px solid #ddd', background: '#fff', fontSize: 13 }}>
      <div style={{ background: '#f5f5f5', padding: '8px 12px', borderBottom: '1px solid #ddd', color: '#666' }}>主旨：{title || '（無主旨）'}</div>
      <div style={{ padding: '16px 12px', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );

  return <div style={{ background: '#f9f9f9', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#333' }}>{content}</div>;
}

// ─── SOP Tab ─────────────────────────────────────────────────────────────────

function SopTab({ missionId }: { missionId?: number | null }) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const sopQuery = (trpc as any).sop.list.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false }
  );
  const createSop = (trpc as any).sop.create.useMutation({ onSuccess: () => sopQuery.refetch() });
  const deleteSop = (trpc as any).sop.delete.useMutation({ onSuccess: () => sopQuery.refetch() });

  if (!missionId) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
      <div className="text-3xl">📋</div>
      <p className="text-xs text-neutral-400">選擇任務後可管理 SOP</p>
    </div>
  );

  const sops = sopQuery.data ?? [];

  const handleImport = async () => {
    if (!importText.trim() || !importTitle.trim()) return;
    setSaving(true);
    const lines = importText.split('\n').filter((l: string) => l.trim());
    const steps = lines.map((line: string, i: number) => ({
      stepOrder: i + 1,
      stepType: 'sequential' as const,
      label: line.replace(/^[\d\.\-\*\s]+/, '').trim() || line,
    }));
    await createSop.mutateAsync({
      missionId: missionId!,
      title: importTitle,
      sourceType: 'imported',
      importSource: 'text',
      steps,
    });
    setImportText('');
    setImportTitle('');
    setShowImport(false);
    setSaving(false);
  };

  return (
    <div className="py-3 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setShowImport(v => !v)}
          className="flex-1 text-xs py-2 px-3 rounded-lg border border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors"
        >
          {showImport ? '✕ 取消' : '+ 導入 / 建立 SOP'}
        </button>
      </div>

      {showImport && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <input
            type="text"
            value={importTitle}
            onChange={e => setImportTitle(e.target.value)}
            placeholder="SOP 名稱（必填）"
            className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 bg-white"
          />
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder={"貼上你的 SOP 步驟，每行一個步驟：\n1. 確認品牌語調\n2. 研究受眾\n3. 撰寫初稿..."}
            rows={6}
            className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 bg-white resize-none font-mono"
          />
          <button
            onClick={handleImport}
            disabled={!importText.trim() || !importTitle.trim() || saving}
            className="w-full text-xs py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors font-medium"
          >
            {saving ? '儲存中...' : '儲存 SOP'}
          </button>
        </div>
      )}

      {sopQuery.isLoading ? (
        <div className="text-xs text-center text-neutral-400 py-4">載入中...</div>
      ) : sops.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-2xl mb-2">📋</div>
          <p className="text-xs text-neutral-400">尚無 SOP</p>
          <p className="text-xs text-neutral-300 mt-1">對話結束後可儲存執行流程</p>
        </div>
      ) : (
        sops.map((sop: any) => (
          <div key={sop.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-sm font-semibold text-neutral-800">{sop.title}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  v{sop.version} · {sop.sourceType === 'imported' ? '導入' : sop.sourceType === 'auto_learned' ? 'AI 學習' : '手動建立'}
                  {sop.isGlobal ? ' · 🌐 品牌層' : ''}
                </p>
              </div>
              <button
                onClick={() => deleteSop.mutate({ id: sop.id })}
                className="text-neutral-300 hover:text-red-400 text-xs shrink-0"
                title="刪除"
              >✕</button>
            </div>

            {sop.steps?.length > 0 && (
              <div className="space-y-1 mb-2">
                {sop.steps.map((step: any) => (
                  <div key={step.id} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {step.stepOrder}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-neutral-700">{step.label}</p>
                      {step.agentSlug && <p className="text-[10px] text-neutral-400">{step.agentSlug}</p>}
                    </div>
                    {step.stepType === 'parallel' && (
                      <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0">並行</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <span className="text-[10px] px-2 py-1 rounded-lg bg-neutral-100 text-neutral-500">
                {sop.steps?.length ?? 0} 個步驟
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Outputs Tab ──────────────────────────────────────────────────────────────

function OutputsTab({ missionId }: { missionId?: number | null }) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewId, setPreviewId] = useState<number | null>(null);

  const outputsQuery = (trpc as any).output.list.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false, refetchInterval: 15000 }
  );
  const updateStatus = (trpc as any).output.updateStatus.useMutation({ onSuccess: () => outputsQuery.refetch() });
  const batchUpdate = (trpc as any).output.batchUpdateStatus.useMutation({ onSuccess: () => { outputsQuery.refetch(); setSelectedIds(new Set()); } });

  if (!missionId) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
      <div className="text-3xl">📦</div>
      <p className="text-xs text-neutral-400">選擇任務後查看產出</p>
    </div>
  );

  const outputs = outputsQuery.data ?? [];
  const filtered = activeFilter === 'all' ? outputs : outputs.filter((o: any) => o.status === activeFilter);
  const isBatchMode = filtered.length > 4;

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-neutral-100 text-neutral-500',
    pending_review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    scheduled: 'bg-blue-100 text-blue-700',
    published: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-neutral-100 text-neutral-400',
  };
  const STATUS_LABELS: Record<string, string> = {
    draft: '草稿', pending_review: '待審', approved: '已批准',
    scheduled: '已排程', published: '已發布', archived: '已歸檔',
  };

  const previewOutput = outputs.find((o: any) => o.id === previewId);

  return (
    <div className="py-3 space-y-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {['all','draft','pending_review','approved','published'].map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${activeFilter === f ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
            {f === 'all' ? `全部 (${outputs.length})` : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {isBatchMode && (
        <div className="flex items-center gap-2 px-1">
          <input type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map((o: any) => o.id)) : new Set())}
            className="w-3 h-3"
          />
          <span className="text-xs text-neutral-500">全選 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
          {selectedIds.size > 0 && (
            <div className="flex gap-1 ml-auto">
              <button onClick={() => batchUpdate.mutate({ ids: [...selectedIds], status: 'pending_review' })}
                className="text-[10px] px-2 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600">送審</button>
              <button onClick={() => batchUpdate.mutate({ ids: [...selectedIds], status: 'approved' })}
                className="text-[10px] px-2 py-1 rounded bg-green-500 text-white hover:bg-green-600">批准</button>
            </div>
          )}
        </div>
      )}

      {previewOutput && (
        <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-100">
            <span className="text-xs font-semibold text-amber-700">
              {PLATFORM_ICONS[(previewOutput as any).platform]} 平台預覽
            </span>
            <button onClick={() => setPreviewId(null)} className="text-amber-400 hover:text-amber-600 text-xs">✕</button>
          </div>
          <div className="p-3 overflow-auto max-h-64">
            <PlatformPreview
              platform={(previewOutput as any).platform}
              content={(previewOutput as any).content}
              title={(previewOutput as any).title ?? undefined}
            />
          </div>
        </div>
      )}

      {outputsQuery.isLoading ? (
        <div className="text-xs text-center text-neutral-400 py-4">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-2xl mb-2">📦</div>
          <p className="text-xs text-neutral-400">尚無{activeFilter === 'all' ? '' : STATUS_LABELS[activeFilter]}產出</p>
          <p className="text-xs text-neutral-300 mt-1">對話中確認內容後自動歸檔</p>
        </div>
      ) : (
        filtered.map((output: any) => (
          <div key={output.id} className={`rounded-xl border bg-white p-3 ${selectedIds.has(output.id) ? 'border-amber-300 bg-amber-50/30' : 'border-neutral-200'}`}>
            <div className="flex items-start gap-2">
              {isBatchMode && (
                <input type="checkbox" checked={selectedIds.has(output.id)}
                  onChange={e => {
                    const next = new Set(selectedIds);
                    e.target.checked ? next.add(output.id) : next.delete(output.id);
                    setSelectedIds(next);
                  }}
                  className="w-3 h-3 mt-1 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm">{PLATFORM_ICONS[output.platform]}</span>
                  <p className="text-xs font-semibold text-neutral-800 truncate flex-1">
                    {output.title || `${PLATFORM_LABELS[output.platform]} 產出`}
                  </p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[output.status]}`}>
                    {STATUS_LABELS[output.status]}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{output.content?.slice(0, 100)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-neutral-400">v{output.version}</span>
                  {output.isUrgent ? <span className="text-[10px] text-red-500 font-medium">🔴 緊急</span> : null}
                  <div className="flex gap-1 ml-auto">
                    <button onClick={() => setPreviewId(previewId === output.id ? null : output.id)}
                      className="text-[10px] text-amber-600 hover:text-amber-800 font-medium">預覽</button>
                    {output.status === 'draft' && (
                      <button onClick={() => updateStatus.mutate({ id: output.id, status: 'pending_review' })}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">送審</button>
                    )}
                    {output.status === 'pending_review' && (
                      <button onClick={() => updateStatus.mutate({ id: output.id, status: 'approved' })}
                        className="text-[10px] text-green-600 hover:text-green-800 font-medium">批准</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab({ missionId }: { missionId?: number | null }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filesQuery = (trpc as any).knowledge.list.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false }
  );
  const registerFile = (trpc as any).knowledge.register.useMutation({ onSuccess: () => filesQuery.refetch() });
  const deleteFile = (trpc as any).knowledge.delete.useMutation({ onSuccess: () => filesQuery.refetch() });
  const updateSettings = (trpc as any).knowledge.updateSettings.useMutation({ onSuccess: () => filesQuery.refetch() });

  if (!missionId) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
      <div className="text-3xl">📚</div>
      <p className="text-xs text-neutral-400">選擇任務後管理知識庫</p>
    </div>
  );

  const files = filesQuery.data ?? [];

  const FILE_ICONS: Record<string, string> = {
    pdf: '📄', docx: '📝', xlsx: '📊', csv: '📊', txt: '📃', url: '🔗', other: '📁',
  };

  const EMBED_STATUS: Record<string, { cls: string; label: string }> = {
    pending:    { cls: 'text-neutral-400', label: '待處理' },
    processing: { cls: 'text-blue-500', label: '向量化中...' },
    completed:  { cls: 'text-green-600', label: '可用' },
    failed:     { cls: 'text-red-500', label: '失敗' },
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !missionId) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('missionId', String(missionId));

      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        await registerFile.mutateAsync({
          missionId,
          filename: data.filename || file.name,
          originalName: file.name,
          fileType: file.name.endsWith('.pdf') ? 'pdf' :
                    file.name.endsWith('.docx') ? 'docx' :
                    file.name.endsWith('.xlsx') || file.name.endsWith('.csv') ? 'xlsx' :
                    file.name.endsWith('.txt') ? 'txt' : 'other',
          fileUrl: data.fileUrl || '',
          fileSize: file.size,
        });
      } else {
        await registerFile.mutateAsync({
          missionId,
          filename: file.name,
          originalName: file.name,
          fileType: 'other',
          fileUrl: `pending:${file.name}`,
          fileSize: file.size,
        });
      }
    } catch {
      await registerFile.mutateAsync({
        missionId,
        filename: file.name,
        originalName: file.name,
        fileType: 'other',
        fileUrl: `pending:${file.name}`,
        fileSize: file.size,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="py-3 space-y-2">
      <div
        className="border-2 border-dashed border-neutral-200 rounded-xl p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-2xl mb-1">{uploading ? '⏳' : '📎'}</div>
        <p className="text-xs text-neutral-500 font-medium">{uploading ? '上傳中...' : '點擊上傳文件'}</p>
        <p className="text-[10px] text-neutral-300 mt-1">PDF / DOCX / XLSX / CSV / TXT</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.csv,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {filesQuery.isLoading ? (
        <div className="text-xs text-center text-neutral-400 py-4">載入中...</div>
      ) : files.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-neutral-400">尚無文件</p>
          <p className="text-[10px] text-neutral-300 mt-1">上傳文件後 AI 可在對話中引用</p>
        </div>
      ) : (
        files.map((file: any) => {
          const embedSt = EMBED_STATUS[file.embeddingStatus] ?? EMBED_STATUS.pending;
          return (
            <div key={file.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="text-lg shrink-0">{FILE_ICONS[file.fileType]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-800 truncate">{file.originalName || file.filename}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium ${embedSt.cls}`}>{embedSt.label}</span>
                    {file.fileSize && <span className="text-[10px] text-neutral-400">{(file.fileSize / 1024).toFixed(0)}KB</span>}
                    {file.usageCount > 0 && <span className="text-[10px] text-neutral-400">用過 {file.usageCount} 次</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={!!file.autoInject}
                        onChange={e => updateSettings.mutate({ id: file.id, autoInject: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <span className="text-[10px] text-neutral-500">自動帶入對話</span>
                    </label>
                    <button
                      onClick={() => { if (window.confirm(`刪除「${file.originalName}」？`)) deleteFile.mutate({ id: file.id }); }}
                      className="ml-auto text-[10px] text-neutral-300 hover:text-red-400"
                    >刪除</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Review Queue (bottom) ────────────────────────────────────────────────────

function ReviewQueue({ missionId }: { missionId?: number | null }) {
  const [expanded, setExpanded] = useState(false);

  const pendingCount = (trpc as any).review.pendingCount.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false, refetchInterval: 30000 }
  );
  const reviewList = (trpc as any).review.list.useQuery(
    { missionId: missionId!, status: 'pending' },
    { enabled: !!missionId && expanded, refetchOnWindowFocus: false }
  );
  const approve = (trpc as any).review.approve.useMutation({
    onSuccess: () => { reviewList.refetch(); pendingCount.refetch(); }
  });
  const requestRevision = (trpc as any).review.requestRevision.useMutation({
    onSuccess: () => { reviewList.refetch(); pendingCount.refetch(); }
  });

  if (!missionId) return null;
  const count = pendingCount.data ?? 0;

  return (
    <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800">
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors ${
          count > 0 ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100' : 'text-neutral-400 hover:bg-neutral-50'
        }`}
      >
        <div className="flex items-center gap-2">
          {count > 0 ? '⚠️' : '✓'}
          <span>待審核</span>
          {count > 0 && (
            <span className="bg-yellow-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        <span className="text-[10px] text-neutral-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 max-h-48 overflow-y-auto">
          {reviewList.isLoading ? (
            <p className="text-xs text-neutral-400 py-2">載入中...</p>
          ) : (reviewList.data ?? []).length === 0 ? (
            <p className="text-xs text-neutral-400 py-2">無待審項目</p>
          ) : (
            (reviewList.data ?? []).map((item: any) => (
              <div key={item.id} className="rounded-lg border border-yellow-200 bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-neutral-700 flex-1 truncate">產出 #{item.outputId}</p>
                  <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full shrink-0">
                    {item.reviewType === 'external' ? '外部審核' : item.reviewType === 'client' ? '客戶審核' : '內部審核'}
                  </span>
                </div>
                {item.isUrgent ? <p className="text-[10px] text-red-500 mt-1">🔴 緊急</p> : null}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => approve.mutate({ id: item.id })}
                    className="flex-1 text-[10px] py-1 rounded bg-green-500 text-white hover:bg-green-600 font-medium">批准</button>
                  <button onClick={() => { const note = window.prompt('退回原因：'); if (note) requestRevision.mutate({ id: item.id, note }); }}
                    className="flex-1 text-[10px] py-1 rounded border border-neutral-200 text-neutral-500 hover:bg-neutral-50">退回</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mission Status Bar ───────────────────────────────────────────────────────

function MissionStatusBar({ missionId }: { missionId?: number | null }) {
  const missionQuery = (trpc as any).mission.getById.useQuery(
    { id: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false }
  );
  const outputCount = (trpc as any).output.list.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false, refetchInterval: 30000 }
  );
  const pendingReview = (trpc as any).review.pendingCount.useQuery(
    { missionId: missionId! },
    { enabled: !!missionId, refetchOnWindowFocus: false, refetchInterval: 30000 }
  );

  if (!missionId || !missionQuery.data) return null;
  const mission = missionQuery.data as any;

  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate">{mission.title}</p>
      <div className="flex items-center gap-3 mt-1">
        <span className="flex items-center gap-1 text-[10px] text-neutral-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
          進行中
        </span>
        <span className="text-[10px] text-neutral-400">產出 {outputCount.data?.length ?? 0} 件</span>
        {(pendingReview.data ?? 0) > 0 && (
          <span className="text-[10px] text-yellow-600 font-medium">待審 {pendingReview.data}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function ArtifactReviewPanel({
  team = [],
  artifacts = [],
  reviews = [],
  agentsLoading,
  missionId,
  onApproveReview,
  onRejectReview,
  onPinArtifact,
  onExportArtifact,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('sop');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'sop', label: 'SOP', icon: '📋' },
    { key: 'outputs', label: '產出', icon: '📦' },
    { key: 'knowledge', label: '知識庫', icon: '📚' },
  ];

  return (
    <aside className="w-[320px] shrink-0 h-full flex flex-col border-l border-neutral-200 dark:border-neutral-800 bg-[#faf9f7] dark:bg-[#1e1e1e] overflow-hidden">
      {/* Mission Status Bar */}
      <MissionStatusBar missionId={missionId} />

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${
              activeTab === tab.key
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>{tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 dark:bg-amber-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3">
        {activeTab === 'sop' && <SopTab missionId={missionId} />}
        {activeTab === 'outputs' && <OutputsTab missionId={missionId} />}
        {activeTab === 'knowledge' && <KnowledgeTab missionId={missionId} />}
      </div>

      {/* Review Queue - bottom */}
      <ReviewQueue missionId={missionId} />
    </aside>
  );
}
