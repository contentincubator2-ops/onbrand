/**
 * IngestDrawer — "從網路新增方法論" overlay (D3).
 *
 * Three-state machine:
 *   "url"      — paste URL form
 *   "extract"  — show LLM-extraction progress (polls getIngestJob)
 *   "review"   — render extracted methodology as a live MethodologyCard
 *                preview + editable fields, "確認新增" commits via
 *                methodology.finalizeIngest
 *
 * On finalize: closes drawer, calls onCreated(squadSlug) so the
 * catalog can refresh and the new card surfaces immediately.
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../../lib/trpc";
import MethodologyCard from "./MethodologyCard";
import { accentForIndex } from "../../../studio/primitives/tokens";

type Phase = "url" | "extract" | "review" | "saving" | "error";
export type IngestTab = "url" | "upload" | "github";

interface ExtractedMethodology {
  name: string;
  author?: string;
  year?: string;
  description?: string;
  primarySkill?: string;
  steps: Array<{
    name: string;
    description?: string;
    requiredSkill?: string;
    outputType?: string;
  }>;
}

export default function IngestDrawer({
  open,
  onClose,
  onCreated,
  initialTab = "url",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
  /** Which input mode to land on when the drawer opens. */
  initialTab?: IngestTab;
}) {
  const [tab, setTab] = useState<IngestTab>(initialTab);
  const [phase, setPhase] = useState<Phase>("url");
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ExtractedMethodology | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const ingestMutation = (trpc as any).methodology.ingestFromUrl.useMutation();
  const finalizeMutation = (trpc as any).methodology.finalizeIngest.useMutation();

  const jobQuery = (trpc as any).methodology.getIngestJob.useQuery(
    { jobId: jobId ?? 0 },
    {
      enabled: !!jobId && phase === "extract",
      refetchInterval: 1500,
    }
  );

  useEffect(() => {
    if (!jobQuery.data) return;
    if (jobQuery.data.status === "reviewing" && jobQuery.data.extracted) {
      setDraft(jobQuery.data.extracted);
      setPhase("review");
    } else if (jobQuery.data.status === "failed") {
      setError(jobQuery.data.errorMsg ?? "extraction failed");
      setPhase("error");
    }
  }, [jobQuery.data]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase("url"); setUrl(""); setJobId(null); setDraft(null); setError(null);
      setTab(initialTab);
      setPickedFile(null); setFilePreview("");
    }
  }, [open, initialTab]);

  const readFileAsText = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setFilePreview(String(reader.result ?? "").slice(0, 600));
    reader.readAsText(f);
    setPickedFile(f);
  };

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) readFileAsText(f);
  };

  const startIngest = async () => {
    if (!url.trim()) return;
    setError(null);
    setPhase("extract");
    try {
      const r = await ingestMutation.mutateAsync({ url: url.trim() });
      setJobId(r.jobId);
    } catch (e: any) {
      setError(e?.message ?? "ingest failed");
      setPhase("error");
    }
  };

  const finalize = async () => {
    if (!draft || !jobId) return;
    setPhase("saving");
    try {
      const r = await finalizeMutation.mutateAsync({
        jobId,
        methodology: {
          name: draft.name,
          author: draft.author,
          year: draft.year,
          description: draft.description,
          primarySkill: draft.primarySkill,
          steps: draft.steps.map((s) => ({
            name: s.name,
            description: s.description,
            requiredSkill: s.requiredSkill,
            outputType: s.outputType,
          })),
        },
      });
      onCreated(r.slug);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "finalize failed");
      setPhase("error");
    }
  };

  const accent = useMemo(() => accentForIndex(jobId ?? 0), [jobId]);
  const previewSteps = (draft?.steps ?? []).slice(0, 4).map((s, i) => ({
    name: s.name,
    desc: s.requiredSkill ?? s.outputType ?? "",
    glyph: `0${i + 1}`,
  }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-mos-ink/40"
        onClick={phase === "extract" || phase === "saving" ? undefined : onClose}
      />

      {/* Drawer */}
      <div className="w-full max-w-[680px] bg-mos-paper border-l border-mos-hair overflow-y-auto">
        <div className="flex items-center justify-between px-7 py-5 border-b border-mos-hair bg-white sticky top-0 z-10">
          <div>
            <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
              METHODOLOGY · INGEST
            </div>
            <h2 className="font-display text-[1.4rem] text-mos-ink tracking-[-0.015em]">
              從網路新增方法論
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "extract" || phase === "saving"}
            className="text-[0.7rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink disabled:opacity-40"
          >
            關閉 ×
          </button>
        </div>

        <div className="px-7 py-6">
          {/* ── Tab strip (only on input phase) ───────────────────── */}
          {phase === "url" && (
            <div className="flex items-center gap-1 mb-5 border-b border-mos-hair">
              {([
                ["url",    "🔗 從 URL"],
                ["upload", "📁 上傳檔案"],
                ["github", "🐙 GitHub"],
              ] as Array<[IngestTab, string]>).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTab(val)}
                  className={[
                    "px-4 py-2.5 text-[0.78rem] tracking-[0.04em] transition -mb-px border-b-2",
                    tab === val
                      ? "border-mos-ink text-mos-ink"
                      : "border-transparent text-mos-muted hover:text-mos-ink",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── URL tab ───────────────────────────────────────────── */}
          {phase === "url" && tab === "url" && (
            <div className="space-y-4">
              <p className="text-[0.86rem] text-mos-body">
                貼上書籍頁、Wikipedia、Medium、SubStack、文件公開網址 — 系統會抽取 → 結構化 → 變成一張可立即套用的方法論卡片。
              </p>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") startIngest(); }}
                placeholder="https://en.wikipedia.org/wiki/Jobs_to_be_done"
                className="w-full bg-white border border-mos-hair px-4 py-3 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
              />
              <button
                onClick={startIngest}
                disabled={!url.trim()}
                className="w-full py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-50"
              >
                開始抽取 →
              </button>
            </div>
          )}

          {/* ── Upload tab ────────────────────────────────────────── */}
          {phase === "url" && tab === "upload" && (
            <div className="space-y-4">
              <p className="text-[0.86rem] text-mos-body">
                上傳 skill 文件、SOP、操作手冊或方法論草稿（<code className="text-[0.78rem] bg-mos-paper px-1">.md</code> / <code className="text-[0.78rem] bg-mos-paper px-1">.txt</code> / <code className="text-[0.78rem] bg-mos-paper px-1">.json</code>），系統會抽取成可立即套用的 squad。
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onFileDrop}
                className={[
                  "border-2 border-dashed transition px-6 py-12 text-center",
                  isDragging
                    ? "border-mos-ink bg-mos-paper"
                    : "border-mos-hair bg-white hover:border-mos-ink/50",
                ].join(" ")}
              >
                <div className="text-[2.4rem] leading-none mb-3" aria-hidden>☁</div>
                <div className="text-[0.92rem] text-mos-ink mb-1">
                  將你的內容拖放至此
                </div>
                <div className="text-[0.78rem] text-mos-muted mb-5">
                  或選擇檔案上傳
                </div>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".md,.txt,.json,.markdown"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFileAsText(f);
                    }}
                  />
                  <span className="cursor-pointer inline-block px-5 py-2.5 text-[0.74rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition">
                    上傳檔案
                  </span>
                </label>
                {pickedFile && (
                  <div className="mt-5 text-left bg-mos-paper border border-mos-hair px-4 py-3">
                    <div className="text-[0.7rem] tracking-[0.18em] uppercase text-mos-soft">
                      已選取
                    </div>
                    <div className="text-[0.86rem] text-mos-ink mt-0.5">
                      {pickedFile.name}{" "}
                      <span className="text-mos-muted text-[0.78rem]">
                        ({Math.round(pickedFile.size / 1024)} KB)
                      </span>
                    </div>
                    {filePreview && (
                      <pre className="mt-2 text-[0.72rem] text-mos-muted whitespace-pre-wrap line-clamp-4 max-h-20 overflow-hidden">
                        {filePreview}
                      </pre>
                    )}
                  </div>
                )}
              </div>
              {pickedFile && (
                <div className="border border-mos-hair bg-mos-paper px-4 py-3 text-[0.78rem] text-mos-muted">
                  💡 檔案上傳的後端萃取目前尚未上線。先用 <button onClick={() => setTab("github")} className="underline text-mos-ink">GitHub</button> 或 <button onClick={() => setTab("url")} className="underline text-mos-ink">URL</button> 模式建立方法論，檔案上傳會在下一輪接通。
                </div>
              )}
            </div>
          )}

          {/* ── GitHub tab ────────────────────────────────────────── */}
          {phase === "url" && tab === "github" && (
            <div className="space-y-4">
              <p className="text-[0.86rem] text-mos-body">
                貼上 GitHub repo / README / skill 資料夾的公開網址，系統會閱讀 README 與 manifest，抽取成方法論。
              </p>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") startIngest(); }}
                placeholder="https://github.com/anthropics/claude-skills/tree/main/marketing-os"
                className="w-full bg-white border border-mos-hair px-4 py-3 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
              />
              <div className="text-[0.74rem] text-mos-muted">
                支援格式：repo 首頁、單檔 README、子資料夾連結。Private repo 請改用 URL 模式貼 raw README。
              </div>
              <button
                onClick={startIngest}
                disabled={!url.trim()}
                className="w-full py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-50"
              >
                從 GitHub 抽取 →
              </button>
            </div>
          )}

          {/* ── Extract phase ─────────────────────────────────────── */}
          {phase === "extract" && (
            <div className="space-y-4">
              <div className="border border-mos-hair bg-white p-6">
                <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
                  STATUS
                </div>
                <div className="mt-1 font-display text-[1.4rem] text-mos-ink">
                  抽取中…
                </div>
                <div className="mt-2 text-[0.82rem] text-mos-muted">
                  系統正在閱讀 {new URL(url).hostname}，從中找出方法論名稱、作者、步驟、所需技能。
                </div>
                <div className="mt-4 h-1 bg-mos-hair overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: "40%",
                      background: "linear-gradient(90deg, #1A9B8E, #1E7FD4)",
                      animation: "ingestPulse 1.4s ease-in-out infinite",
                    }}
                  />
                </div>
              </div>
              <style>{`
                @keyframes ingestPulse {
                  0%   { transform: translateX(-30%); }
                  100% { transform: translateX(180%); }
                }
              `}</style>
            </div>
          )}

          {/* ── Review phase ──────────────────────────────────────── */}
          {phase === "review" && draft && (
            <div className="space-y-6">
              {/* Preview card */}
              <div className="flex justify-center">
                <MethodologyCard
                  layer={(draft as any).strategyLayer ?? (draft as any).tier ?? null}
                  seed={`ingest-${jobId ?? draft.name}`}
                  title={draft.name}
                  author={
                    draft.author
                      ? `${draft.author}${draft.year ? " · " + draft.year : ""}`
                      : (() => { try { return new URL(url).hostname; } catch { return null; } })()
                  }
                  source="ingested"
                  steps={previewSteps}
                  leadName={draft.author ?? "TBD"}
                  ctaLabel="預覽"
                  onCtaClick={() => {}}
                />
              </div>

              {/* Editable fields */}
              <div className="space-y-3">
                <DraftField label="名稱" required>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
                  />
                </DraftField>
                <div className="grid grid-cols-2 gap-3">
                  <DraftField label="作者">
                    <input
                      value={draft.author ?? ""}
                      onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                      className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] focus:outline-none focus:border-mos-ink"
                    />
                  </DraftField>
                  <DraftField label="年份">
                    <input
                      value={draft.year ?? ""}
                      onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                      className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] focus:outline-none focus:border-mos-ink"
                    />
                  </DraftField>
                </div>
                <DraftField label="說明">
                  <textarea
                    value={draft.description ?? ""}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    rows={3}
                    className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] text-mos-body focus:outline-none focus:border-mos-ink"
                  />
                </DraftField>
                <DraftField label={`步驟 (${draft.steps.length})`}>
                  <div className="space-y-2">
                    {draft.steps.map((s, i) => (
                      <div key={i} className="border border-mos-hair bg-white p-3">
                        <input
                          value={s.name}
                          onChange={(e) => {
                            const next = [...draft.steps];
                            next[i] = { ...next[i], name: e.target.value };
                            setDraft({ ...draft, steps: next });
                          }}
                          className="w-full text-[0.88rem] font-display text-mos-ink focus:outline-none"
                        />
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input
                            placeholder="所需技能"
                            value={s.requiredSkill ?? ""}
                            onChange={(e) => {
                              const next = [...draft.steps];
                              next[i] = { ...next[i], requiredSkill: e.target.value };
                              setDraft({ ...draft, steps: next });
                            }}
                            className="text-[0.78rem] text-mos-muted border-b border-mos-hair focus:outline-none focus:border-mos-ink"
                          />
                          <input
                            placeholder="產出"
                            value={s.outputType ?? ""}
                            onChange={(e) => {
                              const next = [...draft.steps];
                              next[i] = { ...next[i], outputType: e.target.value };
                              setDraft({ ...draft, steps: next });
                            }}
                            className="text-[0.78rem] text-mos-muted border-b border-mos-hair focus:outline-none focus:border-mos-ink"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </DraftField>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-mos-hair">
                <button
                  onClick={() => setPhase("url")}
                  className="px-4 py-2.5 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink transition"
                >
                  ← 換 URL
                </button>
                <button
                  onClick={finalize}
                  className="flex-1 py-2.5 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
                >
                  確認新增方法論 →
                </button>
              </div>
            </div>
          )}

          {/* ── Saving ────────────────────────────────────────────── */}
          {phase === "saving" && (
            <div className="text-[0.86rem] text-mos-muted py-10 text-center">
              寫入資料庫中…
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────── */}
          {phase === "error" && (
            <div className="border border-mos-red bg-white p-5">
              <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-red">
                ERROR
              </div>
              <div className="mt-1 text-[0.86rem] text-mos-body">{error}</div>
              <button
                onClick={() => { setPhase("url"); setError(null); setJobId(null); }}
                className="mt-4 px-4 py-2 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition"
              >
                重試
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftField({
  label, children, required,
}: {
  label: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[0.62rem] tracking-[0.22em] uppercase text-mos-soft mb-1">
        {label}{required && <span className="text-mos-red ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}
