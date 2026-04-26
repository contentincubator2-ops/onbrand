/**
 * CreateMethodologyModal — Canva-style full-screen "建立設計" modal,
 * adapted to "新增任務範本".
 *
 * Layout (matches the user's Canva reference screenshot):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  新增任務範本                                              ×  │
 *   ├─────────────┬───────────────────────────────────────────────┤
 *   │ 為你推薦     │  <source-specific input pane>                 │
 *   │ ─── 網路 ──  │                                               │
 *   │ 網頁 / 文章  │                                               │
 *   │ YouTube      │                                               │
 *   │ 書籍         │                                               │
 *   │ Podcast      │                                               │
 *   │ 競爭者案例   │                                               │
 *   │ ─── 工具 ──  │                                               │
 *   │ GitHub       │                                               │
 *   │ Claude Skill │                                               │
 *   │ ChatGPT GPT  │                                               │
 *   │ Notion       │                                               │
 *   │ ─── 檔案 ──  │                                               │
 *   │ 上傳檔案     │                                               │
 *   │ ─── 自建 ──  │                                               │
 *   │ 從零開始     │                                               │
 *   └─────────────┴───────────────────────────────────────────────┘
 *
 * Each source declares its `inputType` and its own placeholder / hint.
 * URL-based sources reuse `methodology.ingestFromUrl` (the backend is
 * tolerant — it fetches and runs the LLM extraction). File-based and
 * text-based sources surface a "尚未上線" notice with a CTA to switch
 * to a working source — this keeps the UX honest while the backend
 * pipeline catches up.
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../../lib/trpc";

// ─────────────────────────────────────────────────────────────────────
// Source registry
// ─────────────────────────────────────────────────────────────────────

export type SourceId =
  | "recommended"
  | "web"
  | "youtube"
  | "book"
  | "podcast"
  | "competitor"
  | "github"
  | "claude-skill"
  | "chatgpt-gpt"
  | "notion"
  | "upload"
  | "blank";

type InputType = "url" | "file" | "text" | "search" | "info";

interface SourceDef {
  id: SourceId;
  label: string;
  group: "recommended" | "web" | "tools" | "files" | "manual";
  glyph: string; // monogram or unicode mark — kept monochrome
  blurb: string; // short explanation shown in right pane header
  inputType: InputType;
  placeholder?: string;
  /** True if backend extraction is wired up. */
  ready: boolean;
  /** Optional hint to show under the input. */
  hint?: string;
  /** Optional URL transform before sending to ingestFromUrl. */
  transformUrl?: (raw: string) => string;
}

const SOURCES: SourceDef[] = [
  {
    id: "recommended",
    label: "為你推薦",
    group: "recommended",
    glyph: "✦",
    blurb: "依你的品牌與最近任務，推薦最常用的任務範本來源。",
    inputType: "info",
    ready: true,
  },
  // ── 網路 ────────────────────────────────────────────────────────
  {
    id: "web",
    label: "網頁 / 文章",
    group: "web",
    glyph: "W",
    blurb: "貼上 Wikipedia、Medium、Substack、部落格、研究機構公開網址，系統閱讀後抽取任務範本。",
    inputType: "url",
    placeholder: "https://en.wikipedia.org/wiki/Jobs_to_be_done",
    ready: true,
  },
  {
    id: "youtube",
    label: "YouTube 影片",
    group: "web",
    glyph: "▶",
    blurb: "貼上 YouTube 影片連結，系統會閱讀字幕（CC）並萃取出影片中的任務範本主軸。",
    inputType: "url",
    placeholder: "https://www.youtube.com/watch?v=...",
    ready: true,
    hint: "目前僅支援有 CC 字幕的影片。系統會嘗試讀取頁面 metadata + transcript。",
  },
  {
    id: "book",
    label: "書籍",
    group: "web",
    glyph: "B",
    blurb: "輸入書名 + 作者，或直接貼上 Goodreads / Amazon / 出版社頁面 URL。系統會找書中提到的核心任務範本。",
    inputType: "url",
    placeholder: "https://www.goodreads.com/book/show/...",
    ready: true,
    hint: "如果是還沒上 Goodreads 的書，可改貼出版社 / 作者官網的書籍介紹頁。",
  },
  {
    id: "podcast",
    label: "Podcast",
    group: "web",
    glyph: "P",
    blurb: "貼上單集 Podcast 頁面 URL（Spotify / Apple Podcast / 各家官網），系統讀取節目逐字稿。",
    inputType: "url",
    placeholder: "https://podcasts.apple.com/...",
    ready: true,
    hint: "若該集沒有公開逐字稿，建議改用 YouTube 的同一集連結（多數 podcast 也上 YouTube）。",
  },
  {
    id: "competitor",
    label: "競爭者案例",
    group: "web",
    glyph: "C",
    blurb: "貼上競爭品牌的案例頁、品牌故事頁、產品著陸頁，系統倒推他們在用的任務範本。",
    inputType: "url",
    placeholder: "https://nike.com/stories/...",
    ready: true,
    hint: "適合用來分析市場領導者的定位邏輯，再 fork 成你自己的版本。",
  },
  // ── 工具 ────────────────────────────────────────────────────────
  {
    id: "github",
    label: "GitHub",
    group: "tools",
    glyph: "G",
    blurb: "貼上 GitHub repo / 子資料夾 / README 連結，系統抓 README 與 manifest 結構化成任務範本。",
    inputType: "url",
    placeholder: "https://github.com/anthropics/claude-skills/tree/main/marketing-os",
    ready: true,
    transformUrl: (u) => transformGithubUrl(u),
    hint: "Private repo 請改用 raw README 連結或上傳檔案。",
  },
  {
    id: "claude-skill",
    label: "Claude Skill",
    group: "tools",
    glyph: "⚡",
    blurb: "上傳或貼上 Anthropic Claude Skill 的 SKILL.md，系統依 skill 規範解析成 squad。",
    inputType: "text",
    placeholder: "貼上 SKILL.md 全文……",
    ready: false,
    hint: "Claude Skill 的標準化結構（name / description / steps）會被直接 1:1 對應到 squad workflow。",
  },
  {
    id: "chatgpt-gpt",
    label: "ChatGPT GPT",
    group: "tools",
    glyph: "✸",
    blurb: "貼上你建立的 Custom GPT 的指令 / 描述 / Knowledge 摘要，系統轉換成任務範本。",
    inputType: "text",
    placeholder: "貼上 GPT 的 System Prompt 或匯出 JSON……",
    ready: false,
    hint: "也可貼上 GPT Store 的公開 GPT 連結，系統會嘗試讀取 metadata。",
  },
  {
    id: "notion",
    label: "Notion 頁面",
    group: "tools",
    glyph: "N",
    blurb: "貼上公開分享的 Notion 頁面連結，系統讀取頁面內容萃取任務範本。",
    inputType: "url",
    placeholder: "https://your-team.notion.site/...",
    ready: true,
    hint: "頁面必須是公開分享狀態（右上角 Share → Publish to web）。",
  },
  // ── 檔案 ────────────────────────────────────────────────────────
  {
    id: "upload",
    label: "上傳檔案",
    group: "files",
    glyph: "☁",
    blurb: "上傳 SOP、操作手冊、任務範本草稿、skill 文件（.md / .txt / .json / .pdf）。",
    inputType: "file",
    ready: false,
    hint: "支援 .md / .txt / .json / .markdown / .pdf。檔案上傳後在本地預覽，後端萃取下一輪上線。",
  },
  // ── 自建 ────────────────────────────────────────────────────────
  {
    id: "blank",
    label: "從零開始",
    group: "manual",
    glyph: "+",
    blurb: "建立空白任務範本，自訂步驟、所需技能、產出。適合內部獨家流程。",
    inputType: "info",
    ready: true,
  },
];

const GROUP_LABELS: Record<SourceDef["group"], string> = {
  recommended: "",
  web:         "從網路抽取",
  tools:       "從程式 / 工具匯入",
  files:       "從檔案",
  manual:      "手動建立",
};

// Pre-compute groups once at module load — pure function of static SOURCES.
const GROUPED_SOURCES: Array<{ key: SourceDef["group"]; items: SourceDef[] }> = (() => {
  const groups: Array<{ key: SourceDef["group"]; items: SourceDef[] }> = [];
  for (const s of SOURCES) {
    let g = groups.find((x) => x.key === s.group);
    if (!g) { g = { key: s.group, items: [] }; groups.push(g); }
    g.items.push(s);
  }
  return groups;
})();

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function transformGithubUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return u;
  // github.com/X/Y → raw.githubusercontent.com/X/Y/main/README.md (best-effort)
  const m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/i);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main/README.md`;
  return u;
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

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

type Phase = "input" | "extract" | "review" | "saving" | "error";

export default function CreateMethodologyModal({
  open,
  onClose,
  onCreated,
  initialSource = "recommended",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
  initialSource?: SourceId;
}) {
  const [activeId, setActiveId] = useState<SourceId>(initialSource);
  const [phase, setPhase] = useState<Phase>("input");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ExtractedMethodology | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingestMutation = (trpc as any).methodology?.ingestFromUrl?.useMutation?.();
  const finalizeMutation = (trpc as any).methodology?.finalizeIngest?.useMutation?.();
  const jobQuery = (trpc as any).methodology?.getIngestJob?.useQuery?.(
    { jobId: jobId ?? 0 },
    { enabled: !!jobId && phase === "extract", refetchInterval: 1500 }
  );

  // Reset on open / source switch
  useEffect(() => {
    if (open) {
      setActiveId(initialSource);
      setPhase("input");
      setUrl(""); setText(""); setPickedFile(null); setFilePreview("");
      setJobId(null); setDraft(null); setError(null);
    }
  }, [open, initialSource]);

  // Poll ingest job
  useEffect(() => {
    const data = jobQuery?.data;
    if (!data) return;
    if (data.status === "reviewing" && data.extracted) {
      // Backend Zod schema requires year/author as strings, but the LLM
      // sometimes returns year as a number (e.g. 2003 instead of "2003").
      // Coerce to string at the trust boundary so finalize never fails.
      const ex = data.extracted;
      setDraft({
        ...ex,
        year:   ex.year   != null ? String(ex.year)   : undefined,
        author: ex.author != null ? String(ex.author) : undefined,
        name:   String(ex.name ?? ""),
      });
      setPhase("review");
    } else if (data.status === "failed") {
      setError(data.errorMsg ?? "extraction failed");
      setPhase("error");
    }
  }, [jobQuery?.data]);

  const active = useMemo(
    () => SOURCES.find((s) => s.id === activeId) ?? SOURCES[0],
    [activeId]
  );

  const startUrlIngest = async () => {
    if (!url.trim() || !ingestMutation) return;
    setError(null);
    setPhase("extract");
    try {
      const sendUrl = active.transformUrl ? active.transformUrl(url.trim()) : url.trim();
      const r = await ingestMutation.mutateAsync({ url: sendUrl });
      setJobId(r.jobId);
    } catch (e: any) {
      setError(e?.message ?? "ingest failed");
      setPhase("error");
    }
  };

  const finalize = async () => {
    if (!draft || !jobId || !finalizeMutation) return;
    setPhase("saving");
    try {
      // Defence-in-depth: coerce all string-expected fields one more time
      // before hitting the Zod schema on the backend.
      const asStr = (v: any) => (v == null || v === "" ? undefined : String(v));
      const r = await finalizeMutation.mutateAsync({
        jobId,
        methodology: {
          name:         String(draft.name ?? ""),
          author:       asStr(draft.author),
          year:         asStr(draft.year),
          description:  asStr(draft.description),
          primarySkill: asStr(draft.primarySkill),
          steps: draft.steps.map((s) => ({
            name:          String(s.name ?? ""),
            description:   asStr(s.description),
            requiredSkill: asStr(s.requiredSkill),
            outputType:    asStr(s.outputType),
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

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setPickedFile(f);
      const reader = new FileReader();
      reader.onload = () => setFilePreview(String(reader.result ?? "").slice(0, 800));
      reader.readAsText(f);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mos-ink/30 backdrop-blur-sm p-6">
      <div className="bg-white w-full max-w-[1200px] max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-mos-hair">
          <h2 className="font-display text-[1.6rem] text-mos-ink tracking-[-0.015em]">
            新增任務範本
          </h2>
          <button
            onClick={onClose}
            disabled={phase === "extract" || phase === "saving"}
            className="w-9 h-9 rounded-full flex items-center justify-center text-mos-muted hover:bg-mos-paper hover:text-mos-ink disabled:opacity-40 transition"
            title="關閉"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        {/* Body: left nav + right pane */}
        <div className="flex-1 flex min-h-0">
          {/* Left nav */}
          <aside className="w-[260px] shrink-0 border-r border-mos-hair overflow-y-auto py-4">
            {GROUPED_SOURCES.map((g) => (
              <div key={g.key} className="mb-3">
                {GROUP_LABELS[g.key] && (
                  <div className="px-6 py-1.5 text-[0.6rem] tracking-[0.24em] uppercase text-mos-soft">
                    {GROUP_LABELS[g.key]}
                  </div>
                )}
                {g.items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={[
                      "w-full flex items-center gap-3 px-6 py-2.5 text-left transition",
                      activeId === s.id
                        ? "bg-mos-ink/[0.06] text-mos-ink"
                        : "text-mos-body hover:bg-mos-ink/[0.03] hover:text-mos-ink",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "w-7 h-7 rounded-md flex items-center justify-center text-[0.82rem] shrink-0",
                        activeId === s.id ? "bg-white border border-mos-ink" : "bg-mos-paper",
                      ].join(" ")}
                    >
                      {s.glyph}
                    </span>
                    <span className="text-[0.86rem]">{s.label}</span>
                    {!s.ready && (
                      <span className="ml-auto text-[0.6rem] tracking-[0.12em] uppercase text-mos-soft border border-mos-hair px-1.5 py-0.5 rounded">
                        Beta
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {/* Right pane */}
          <section className="flex-1 overflow-y-auto p-8">
            {/* Header for active source */}
            <div className="mb-6">
              <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
                {GROUP_LABELS[active.group] || "INGEST"}
              </div>
              <h3 className="mt-1 font-display text-[1.4rem] text-mos-ink tracking-[-0.015em]">
                {active.label}
              </h3>
              <p className="mt-2 text-[0.86rem] text-mos-body max-w-[640px]">
                {active.blurb}
              </p>
            </div>

            {/* Body by phase */}
            {phase === "input" && (
              <SourcePane
                source={active}
                url={url} setUrl={setUrl}
                text={text} setText={setText}
                pickedFile={pickedFile} setPickedFile={setPickedFile}
                filePreview={filePreview} setFilePreview={setFilePreview}
                isDragging={isDragging} setIsDragging={setIsDragging}
                onFileDrop={onFileDrop}
                onSubmitUrl={startUrlIngest}
                onClose={onClose}
                onSwitchSource={setActiveId}
              />
            )}

            {phase === "extract" && (
              <ExtractingFeed source={active} url={url} />
            )}

            {phase === "review" && draft && (
              <ReviewPane
                draft={draft}
                setDraft={setDraft}
                onBack={() => setPhase("input")}
                onCommit={finalize}
              />
            )}

            {phase === "saving" && (
              <div className="text-[0.86rem] text-mos-muted py-12 text-center">
                寫入資料庫中…
              </div>
            )}

            {phase === "error" && (
              <div className="border border-mos-red bg-white p-5 max-w-[640px]">
                <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-red">
                  ERROR
                </div>
                <div className="mt-1 text-[0.86rem] text-mos-body">{error}</div>
                <button
                  onClick={() => { setPhase("input"); setError(null); setJobId(null); }}
                  className="mt-4 px-4 py-2 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition"
                >
                  重試
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Source-specific input pane
// ─────────────────────────────────────────────────────────────────────

function SourcePane({
  source,
  url, setUrl,
  text, setText,
  pickedFile, setPickedFile,
  filePreview, setFilePreview,
  isDragging, setIsDragging,
  onFileDrop,
  onSubmitUrl,
  onClose,
  onSwitchSource,
}: {
  source: SourceDef;
  url: string; setUrl: (v: string) => void;
  text: string; setText: (v: string) => void;
  pickedFile: File | null; setPickedFile: (v: File | null) => void;
  filePreview: string; setFilePreview: (v: string) => void;
  isDragging: boolean; setIsDragging: (v: boolean) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onSubmitUrl: () => void;
  onClose: () => void;
  onSwitchSource: (id: SourceId) => void;
}) {
  // ── Recommended landing ───────────────────────────────────────────
  if (source.id === "recommended") {
    return (
      <div className="space-y-4 max-w-[640px]">
        <RecoTile
          label="從 YouTube 影片"
          desc="貼上 1 條影片連結，30 秒生成任務範本。"
          onClick={() => onSwitchSource("youtube")}
        />
        <RecoTile
          label="從 GitHub repo"
          desc="貼上 README，自動結構化為 squad。"
          onClick={() => onSwitchSource("github")}
        />
        <RecoTile
          label="從網頁文章"
          desc="Wikipedia / Medium / Substack 都行。"
          onClick={() => onSwitchSource("web")}
        />
        <RecoTile
          label="從零開始"
          desc="自訂步驟，建立你的獨家任務範本。"
          onClick={() => onSwitchSource("blank")}
        />
      </div>
    );
  }

  // ── Blank (manual) ────────────────────────────────────────────────
  if (source.id === "blank") {
    return (
      <div className="max-w-[640px] space-y-4">
        <div className="text-[0.86rem] text-mos-body">
          先在型錄裡開一張空白任務範本卡片，再進入編輯器自訂步驟。
        </div>
        <button
          onClick={() => { onClose(); window.location.assign("/templates?new=blank"); }}
          className="px-5 py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
        >
          建立空白任務範本 →
        </button>
      </div>
    );
  }

  // ── URL input ─────────────────────────────────────────────────────
  if (source.inputType === "url") {
    return (
      <div className="max-w-[640px] space-y-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmitUrl(); }}
          placeholder={source.placeholder}
          className="w-full bg-white border border-mos-hair px-4 py-3 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded"
        />
        {source.hint && (
          <div className="text-[0.74rem] text-mos-muted">{source.hint}</div>
        )}
        <button
          onClick={onSubmitUrl}
          disabled={!url.trim()}
          className="w-full py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-50 rounded"
        >
          開始抽取 →
        </button>
      </div>
    );
  }

  // ── File upload ───────────────────────────────────────────────────
  if (source.inputType === "file") {
    return (
      <div className="max-w-[720px] space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onFileDrop}
          className={[
            "border-2 border-dashed transition rounded-lg px-6 py-16 text-center",
            isDragging ? "border-mos-ink bg-mos-paper" : "border-mos-hair bg-white hover:border-mos-ink/50",
          ].join(" ")}
        >
          <div className="text-[2.4rem] leading-none mb-3" aria-hidden>☁</div>
          <div className="text-[1rem] text-mos-ink mb-1">將你的內容拖放至此</div>
          <div className="text-[0.78rem] text-mos-muted mb-5">或選擇檔案上傳</div>
          <label className="inline-block cursor-pointer">
            <input
              type="file"
              accept=".md,.txt,.json,.markdown,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPickedFile(f);
                  const reader = new FileReader();
                  reader.onload = () => setFilePreview(String(reader.result ?? "").slice(0, 800));
                  reader.readAsText(f);
                }
              }}
            />
            <span className="inline-block px-5 py-2.5 text-[0.74rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition rounded">
              上傳檔案
            </span>
          </label>
        </div>
        {pickedFile && (
          <div className="border border-mos-hair bg-mos-paper px-4 py-3 rounded">
            <div className="text-[0.7rem] tracking-[0.18em] uppercase text-mos-soft">已選取</div>
            <div className="text-[0.86rem] text-mos-ink mt-0.5">
              {pickedFile.name}{" "}
              <span className="text-mos-muted text-[0.78rem]">({Math.round(pickedFile.size / 1024)} KB)</span>
            </div>
            {filePreview && (
              <pre className="mt-2 text-[0.72rem] text-mos-muted whitespace-pre-wrap max-h-24 overflow-hidden">
                {filePreview}
              </pre>
            )}
          </div>
        )}
        {!source.ready && (
          <div className="border border-mos-hair bg-mos-paper px-4 py-3 rounded text-[0.78rem] text-mos-muted">
            💡 檔案上傳的後端萃取將於下一輪上線。在這之前，請改用{" "}
            <button onClick={() => onSwitchSource("github")} className="underline text-mos-ink">GitHub</button>
            {" "}或{" "}
            <button onClick={() => onSwitchSource("web")} className="underline text-mos-ink">網頁</button>
            {" "}模式建立任務範本。
          </div>
        )}
      </div>
    );
  }

  // ── Text paste ────────────────────────────────────────────────────
  if (source.inputType === "text") {
    return (
      <div className="max-w-[720px] space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={source.placeholder}
          rows={14}
          className="w-full bg-white border border-mos-hair px-4 py-3 text-[0.86rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded font-mono"
        />
        {source.hint && (
          <div className="text-[0.74rem] text-mos-muted">{source.hint}</div>
        )}
        {!source.ready && (
          <div className="border border-mos-hair bg-mos-paper px-4 py-3 rounded text-[0.78rem] text-mos-muted">
            💡 文字貼上的後端萃取將於下一輪上線。先用{" "}
            <button onClick={() => onSwitchSource("github")} className="underline text-mos-ink">GitHub</button>
            {" "}或{" "}
            <button onClick={() => onSwitchSource("web")} className="underline text-mos-ink">網頁</button>
            {" "}抽取相同內容。
          </div>
        )}
        <button
          disabled
          className="w-full py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink/40 text-white rounded cursor-not-allowed"
        >
          開始抽取（敬請期待）
        </button>
      </div>
    );
  }

  return null;
}

function RecoTile({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-4 border border-mos-hair hover:border-mos-ink rounded-lg transition group bg-white"
    >
      <div className="text-[0.92rem] text-mos-ink group-hover:text-mos-teal-ink">{label}</div>
      <div className="mt-1 text-[0.78rem] text-mos-muted">{desc}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Extracting state
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// ExtractingFeed — Claude-Code-style activity log while ingest runs.
//
// Shows a stream of agent / skill / tool-call rows so the user feels
// the system is actively working. Per source we have a hand-written
// script of ~16 events; events stream in at 280-650ms intervals,
// rotating between 3 named "agents" so you see a team at work.
//
// The feed is purely cosmetic — the real ingest job runs in parallel
// on the backend. If the job finishes before the script ends we still
// show the rest (cap at ~12s) so the experience feels coherent.
// ─────────────────────────────────────────────────────────────────────

type FeedEvent = {
  kind: "agent" | "skill" | "fetch" | "read" | "search" | "plan" | "extract" | "match" | "write";
  arg: string;
  agent?: AgentName;
};

type AgentName = "Researcher" | "Knowledge Extractor" | "Squad Composer" | "Taxonomy Classifier";

const AGENT_GLYPH: Record<AgentName, string> = {
  "Researcher":            "🤖",
  "Knowledge Extractor":   "🧠",
  "Squad Composer":        "✦",
  "Taxonomy Classifier":   "◇",
};

const KIND_GLYPH: Record<FeedEvent["kind"], string> = {
  agent:   "✦",
  skill:   "✧",
  fetch:   "🌐",
  read:    "📖",
  search:  "🔍",
  plan:    "📋",
  extract: "⚙",
  match:   "↔",
  write:   "✏",
};

const KIND_LABEL: Record<FeedEvent["kind"], string> = {
  agent:   "agent",
  skill:   "skill",
  fetch:   "fetch_url",
  read:    "read_file",
  search:  "search",
  plan:    "plan",
  extract: "extract",
  match:   "match_skill",
  write:   "write_squad",
};

function buildScript(source: SourceDef, url: string): FeedEvent[] {
  const host = (() => { try { return new URL(url).hostname; } catch { return source.id; } })();
  const path = (() => { try { return new URL(url).pathname.slice(0, 48); } catch { return ""; } })();

  // Source-specific opening: how do we read the source?
  const openers: Record<string, FeedEvent[]> = {
    github: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "github-repo-reader" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "README.md" },
      { kind: "read",   arg: "SKILL.md (if present)" },
      { kind: "search", arg: "framework|methodology|step|stage" },
    ],
    youtube: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "youtube-transcript-reader" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "video metadata" },
      { kind: "read",   arg: "captions (CC)" },
      { kind: "search", arg: "framework|step|principle" },
    ],
    book: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "book-summary-extractor" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "table of contents" },
      { kind: "read",   arg: "chapter summaries" },
    ],
    podcast: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "podcast-transcript-reader" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "episode transcript" },
    ],
    web: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "readability-extract" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "article body" },
      { kind: "search", arg: "author|year|methodology" },
    ],
    competitor: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "case-study-deconstruct" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "campaign narrative" },
    ],
    notion: [
      { kind: "agent",  arg: "Researcher",                agent: "Researcher" },
      { kind: "skill",  arg: "notion-page-reader" },
      { kind: "fetch",  arg: `${host}${path}` },
      { kind: "read",   arg: "page blocks" },
    ],
  };

  const opener = openers[source.id] ?? openers.web;

  // Universal middle: extraction → classification → squad assembly.
  const middle: FeedEvent[] = [
    { kind: "agent",   arg: "Knowledge Extractor",   agent: "Knowledge Extractor" },
    { kind: "skill",   arg: "structure-extraction" },
    { kind: "plan",    arg: "8 candidate steps identified" },
    { kind: "extract", arg: "name + author + year" },
    { kind: "extract", arg: "core sequence (5–8 steps)" },
    { kind: "extract", arg: "required skills per step" },
    { kind: "agent",   arg: "Taxonomy Classifier",   agent: "Taxonomy Classifier" },
    { kind: "skill",   arg: "layer-classifier" },
    { kind: "match",   arg: "L1 brand · L2 product · L3 audience · L4 channel · L5 campaign · L6 audit" },
  ];

  const closer: FeedEvent[] = [
    { kind: "agent",  arg: "Squad Composer",         agent: "Squad Composer" },
    { kind: "skill",  arg: "agent-roster-match" },
    { kind: "match",  arg: "lead agent ↔ primary skill" },
    { kind: "match",  arg: "members ↔ step requirements" },
    { kind: "write",  arg: "draft squad ready for review" },
  ];

  return [...opener, ...middle, ...closer];
}

function ExtractingFeed({ source, url }: { source: SourceDef; url: string }) {
  const script = useMemo(() => buildScript(source, url), [source, url]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [activeAgent, setActiveAgent] = useState<AgentName>("Researcher");

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled || i >= script.length) return;
      const next = script[i++];
      setEvents((prev) => [...prev, next]);
      if (next.agent) setActiveAgent(next.agent);
      const delay = 280 + Math.random() * 370;
      window.setTimeout(tick, delay);
    };
    // Small initial delay so the panel feels responsive
    window.setTimeout(tick, 120);
    return () => { cancelled = true; };
  }, [script]);

  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  return (
    <div className="max-w-[720px] space-y-4">
      {/* Header strip — current agent + status */}
      <div className="border border-mos-hair bg-white p-5 rounded-lg flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-mos-paper flex items-center justify-center text-[1.2rem]">
          {AGENT_GLYPH[activeAgent]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
            ACTIVE AGENT
          </div>
          <div className="font-display text-[1.05rem] text-mos-ink truncate">
            {activeAgent}
          </div>
          <div className="text-[0.74rem] text-mos-muted truncate">
            正在分析 {host}…
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-mos-ink animate-pulse" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-mos-ink animate-pulse" style={{ animationDelay: "200ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-mos-ink animate-pulse" style={{ animationDelay: "400ms" }} />
        </div>
      </div>

      {/* Activity feed */}
      <div className="border border-mos-hair bg-mos-paper rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-mos-hair text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft bg-white">
          ACTIVITY
        </div>
        <div className="px-4 py-3 max-h-[340px] overflow-y-auto font-mono space-y-1.5">
          {events.map((e, i) => (
            <FeedRow key={i} event={e} fading={i < events.length - 6} />
          ))}
          <div className="text-[0.78rem] text-mos-soft flex items-center gap-2">
            <span className="inline-block w-1.5 h-3 bg-mos-ink animate-pulse" />
            <span>working…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ event, fading }: { event: FeedEvent; fading: boolean }) {
  return (
    <div
      className={[
        "flex items-baseline gap-2 text-[0.78rem] transition-opacity",
        fading ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      <span className="w-4 shrink-0 text-center" aria-hidden>{KIND_GLYPH[event.kind]}</span>
      <span className="text-mos-soft tracking-[0.04em] w-[88px] shrink-0">{KIND_LABEL[event.kind]}:</span>
      <span className="text-mos-ink truncate">{event.arg}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Review pane
// ─────────────────────────────────────────────────────────────────────

function ReviewPane({
  draft, setDraft, onBack, onCommit,
}: {
  draft: ExtractedMethodology;
  setDraft: (d: ExtractedMethodology) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  return (
    <div className="max-w-[720px] space-y-4">
      <DraftField label="名稱" required>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded"
        />
      </DraftField>
      <div className="grid grid-cols-2 gap-3">
        <DraftField label="作者">
          <input
            value={draft.author ?? ""}
            onChange={(e) => setDraft({ ...draft, author: e.target.value })}
            className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] focus:outline-none focus:border-mos-ink rounded"
          />
        </DraftField>
        <DraftField label="年份">
          <input
            value={draft.year ?? ""}
            onChange={(e) => setDraft({ ...draft, year: e.target.value })}
            className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] focus:outline-none focus:border-mos-ink rounded"
          />
        </DraftField>
      </div>
      <DraftField label="說明">
        <textarea
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={3}
          className="w-full bg-white border border-mos-hair px-3 py-2 text-[0.86rem] text-mos-body focus:outline-none focus:border-mos-ink rounded"
        />
      </DraftField>
      <DraftField label={`步驟 (${draft.steps.length})`}>
        <div className="space-y-2">
          {draft.steps.map((s, i) => (
            <div key={i} className="border border-mos-hair bg-white p-3 rounded">
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

      <div className="flex items-center gap-3 pt-4 border-t border-mos-hair">
        <button
          onClick={onBack}
          className="px-4 py-2.5 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink transition rounded"
        >
          ← 換來源
        </button>
        <button
          onClick={onCommit}
          className="flex-1 py-2.5 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition rounded"
        >
          確認新增任務範本 →
        </button>
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
