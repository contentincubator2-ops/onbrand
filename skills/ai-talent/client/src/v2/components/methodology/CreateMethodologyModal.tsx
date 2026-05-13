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
import { useLang } from "../../../lib/i18n";
import {
  Modal, ModalContent, ModalHeader, ModalBody,
  Button, Input, Textarea, Card, CardBody, Chip,
} from "@heroui/react";

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

const GROUP_LABELS_EN: Record<SourceDef["group"], string> = {
  recommended: "",
  web:         "From the web",
  tools:       "From code / tools",
  files:       "From a file",
  manual:      "Manual",
};

// zh → en lookups for source label/blurb/placeholder/hint
const ZH_EN_MM: Record<string, string> = {
  "新增任務範本": "Add task template",
  "為你推薦": "Recommended for you",
  "依你的品牌與最近任務，推薦最常用的任務範本來源。": "Based on your brand and recent missions, we recommend popular template sources.",
  "網頁 / 文章": "Web / Article",
  "貼上 Wikipedia、Medium、Substack、部落格、研究機構公開網址，系統閱讀後抽取任務範本。": "Paste a Wikipedia, Medium, Substack, blog, or research site URL — we read it and extract the template.",
  "YouTube 影片": "YouTube video",
  "貼上 YouTube 影片連結，系統會閱讀字幕（CC）並萃取出影片中的任務範本主軸。": "Paste a YouTube link — we read captions (CC) and extract the template.",
  "目前僅支援有 CC 字幕的影片。系統會嘗試讀取頁面 metadata + transcript。": "Currently only videos with CC captions. We read page metadata + transcript.",
  "書籍": "Book",
  "輸入書名 + 作者，或直接貼上 Goodreads / Amazon / 出版社頁面 URL。系統會找書中提到的核心任務範本。": "Enter title + author, or paste a Goodreads / Amazon / publisher URL — we find the core template inside the book.",
  "如果是還沒上 Goodreads 的書，可改貼出版社 / 作者官網的書籍介紹頁。": "If the book isn't on Goodreads, paste the publisher or author site instead.",
  "貼上單集 Podcast 頁面 URL（Spotify / Apple Podcast / 各家官網），系統讀取節目逐字稿。": "Paste a single-episode podcast URL (Spotify, Apple Podcasts, etc.) — we read the transcript.",
  "若該集沒有公開逐字稿，建議改用 YouTube 的同一集連結（多數 podcast 也上 YouTube）。": "If no public transcript, paste the YouTube link for the same episode (most podcasts also upload there).",
  "競爭者案例": "Competitor case",
  "貼上競爭品牌的案例頁、品牌故事頁、產品著陸頁，系統倒推他們在用的任務範本。": "Paste a competitor's case page, brand story, or landing page — we reverse-engineer the template they use.",
  "適合用來分析市場領導者的定位邏輯，再 fork 成你自己的版本。": "Great for studying a market leader's positioning, then forking your own version.",
  "貼上 GitHub repo / 子資料夾 / README 連結，系統抓 README 與 manifest 結構化成任務範本。": "Paste a GitHub repo / subfolder / README URL — we read the README and manifest to build the template.",
  "Private repo 請改用 raw README 連結或上傳檔案。": "For private repos, use a raw README link or upload the file.",
  "上傳或貼上 Anthropic Claude Skill 的 SKILL.md，系統依 skill 規範解析成 squad。": "Upload or paste an Anthropic Claude Skill's SKILL.md — we parse it into a squad.",
  "貼上 SKILL.md 全文……": "Paste the full SKILL.md…",
  "Claude Skill 的標準化結構（name / description / steps）會被直接 1:1 對應到 squad workflow。": "Claude Skill's standard structure (name / description / steps) maps 1:1 to the squad workflow.",
  "貼上你建立的 Custom GPT 的指令 / 描述 / Knowledge 摘要，系統轉換成任務範本。": "Paste your Custom GPT's instructions / description / knowledge summary — we turn it into a template.",
  "貼上 GPT 的 System Prompt 或匯出 JSON……": "Paste the GPT system prompt or exported JSON…",
  "也可貼上 GPT Store 的公開 GPT 連結，系統會嘗試讀取 metadata。": "You can also paste a public GPT Store link — we'll try to read its metadata.",
  "Notion 頁面": "Notion page",
  "貼上公開分享的 Notion 頁面連結，系統讀取頁面內容萃取任務範本。": "Paste a public Notion page URL — we read it and extract the template.",
  "頁面必須是公開分享狀態（右上角 Share → Publish to web）。": "The page must be publicly shared (top-right Share → Publish to web).",
  "上傳檔案": "Upload file",
  "上傳 SOP、操作手冊、任務範本草稿、skill 文件（.md / .txt / .json / .pdf）。": "Upload SOPs, manuals, template drafts, or skill files (.md / .txt / .json / .pdf).",
  "支援 .md / .txt / .json / .markdown / .pdf。檔案上傳後在本地預覽，後端萃取下一輪上線。": "Supports .md / .txt / .json / .markdown / .pdf. Local preview only — backend extraction ships next round.",
  "從零開始": "Start from scratch",
  "建立空白任務範本，自訂步驟、所需技能、產出。適合內部獨家流程。": "Create a blank template — customize steps, skills, and outputs. Great for in-house flows.",
};

function trMM(s: string | undefined, lang: string): string {
  if (!s) return s ?? "";
  if (lang !== "en") return s;
  return ZH_EN_MM[s] ?? s;
}

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
  const { lang } = useLang();
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

  const isBusy = phase === "extract" || phase === "saving";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="5xl"
      radius="lg"
      scrollBehavior="inside"
      isDismissable={!isBusy}
      hideCloseButton={false}
      classNames={{
        base: "max-w-[1200px] max-h-[88vh]",
        backdrop: "bg-foreground/30 backdrop-blur-sm",
      }}
    >
      <ModalContent>
        <ModalHeader className="px-8 py-5 border-b border-divider">
          <h2 className="font-semibold text-2xl text-foreground tracking-[-0.015em]">
            {lang === "en" ? "Add task template" : "新增任務範本"}
          </h2>
        </ModalHeader>
        <ModalBody className="p-0 flex flex-row min-h-0">
          {/* Left nav */}
          <aside className="w-[260px] shrink-0 border-r border-divider overflow-y-auto py-4">
            {GROUPED_SOURCES.map((g) => (
              <div key={g.key} className="mb-3">
                {GROUP_LABELS[g.key] && (
                  <div className="px-6 py-1.5 text-tiny tracking-[0.24em] uppercase text-default-400">
                    {lang === "en" ? GROUP_LABELS_EN[g.key] : GROUP_LABELS[g.key]}
                  </div>
                )}
                {g.items.map((s) => (
                  <Button
                    key={s.id}
                    onPress={() => setActiveId(s.id)}
                    variant="light"
                    radius="none"
                    fullWidth
                    disableRipple
                    className={[
                      "h-auto justify-start gap-3 px-6 py-2.5 min-w-0",
                      activeId === s.id
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-foreground data-[hover=true]:bg-foreground/[0.03] data-[hover=true]:text-foreground",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "w-7 h-7 rounded-md flex items-center justify-center text-small shrink-0",
                        activeId === s.id ? "bg-white border border-foreground" : "bg-background",
                      ].join(" ")}
                    >
                      {s.glyph}
                    </span>
                    <span className="text-small">{trMM(s.label, lang)}</span>
                    {!s.ready && (
                      <Chip
                        size="sm"
                        radius="sm"
                        variant="bordered"
                        className="ml-auto text-tiny tracking-[0.12em] uppercase text-default-400 border-divider"
                      >
                        Beta
                      </Chip>
                    )}
                  </Button>
                ))}
              </div>
            ))}
          </aside>

          {/* Right pane */}
          <section className="flex-1 overflow-y-auto p-8">
            {/* Header for active source */}
            <div className="mb-6">
              <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
                {(lang === "en" ? GROUP_LABELS_EN[active.group] : GROUP_LABELS[active.group]) || "INGEST"}
              </div>
              <h3 className="mt-1 font-semibold text-xl text-foreground tracking-[-0.015em]">
                {trMM(active.label, lang)}
              </h3>
              <p className="mt-2 text-small text-foreground max-w-[640px]">
                {trMM(active.blurb, lang)}
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
              <div className="text-small text-default-500 py-12 text-center">
                {lang === "en" ? "Writing to database…" : "寫入資料庫中…"}
              </div>
            )}

            {phase === "error" && (
              <Card shadow="none" className="border border-danger max-w-[640px]">
                <CardBody className="p-5 gap-2">
                  <h4 className="text-small font-semibold uppercase tracking-wider text-danger">
                    Error
                  </h4>
                  <p className="text-small">{error}</p>
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={() => { setPhase("input"); setError(null); setJobId(null); }}
                    className="mt-2 self-start"
                  >
                    {lang === "en" ? "Retry" : "重試"}
                  </Button>
                </CardBody>
              </Card>
            )}
          </section>
        </ModalBody>
      </ModalContent>
    </Modal>
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
  const { lang } = useLang();
  // ── Recommended landing ───────────────────────────────────────────
  if (source.id === "recommended") {
    return (
      <div className="space-y-4 max-w-[640px]">
        <RecoTile
          label={lang === "en" ? "From a YouTube video" : "從 YouTube 影片"}
          desc={lang === "en" ? "Paste one video link — template ready in 30 seconds." : "貼上 1 條影片連結，30 秒生成任務範本。"}
          onClick={() => onSwitchSource("youtube")}
        />
        <RecoTile
          label={lang === "en" ? "From a GitHub repo" : "從 GitHub repo"}
          desc={lang === "en" ? "Paste a README — auto-structured into a squad." : "貼上 README，自動結構化為 squad。"}
          onClick={() => onSwitchSource("github")}
        />
        <RecoTile
          label={lang === "en" ? "From a web article" : "從網頁文章"}
          desc={lang === "en" ? "Wikipedia / Medium / Substack all work." : "Wikipedia / Medium / Substack 都行。"}
          onClick={() => onSwitchSource("web")}
        />
        <RecoTile
          label={lang === "en" ? "Start from scratch" : "從零開始"}
          desc={lang === "en" ? "Customize steps and build your own template." : "自訂步驟，建立你的獨家任務範本。"}
          onClick={() => onSwitchSource("blank")}
        />
      </div>
    );
  }

  // ── Blank (manual) ────────────────────────────────────────────────
  if (source.id === "blank") {
    return (
      <div className="max-w-[640px] space-y-4">
        <div className="text-small text-foreground">
          {lang === "en" ? "Open a blank template card in the catalog, then customize steps in the editor." : "先在型錄裡開一張空白任務範本卡片，再進入編輯器自訂步驟。"}
        </div>
        <Button
          color="primary"
          onPress={() => { onClose(); window.location.assign("/templates?new=blank"); }}
          endContent={<span aria-hidden>→</span>}
        >
          {lang === "en" ? "Create blank template" : "建立空白任務範本"}
        </Button>
      </div>
    );
  }

  // ── URL input ─────────────────────────────────────────────────────
  if (source.inputType === "url") {
    return (
      <div className="max-w-[640px] space-y-4">
        <Input
          value={url}
          onValueChange={setUrl}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmitUrl(); }}
          placeholder={trMM(source.placeholder, lang)}
          variant="bordered"
        />
        {source.hint && (
          <p className="text-small text-default-500">{trMM(source.hint, lang)}</p>
        )}
        <Button
          color="primary"
          fullWidth
          onPress={onSubmitUrl}
          isDisabled={!url.trim()}
          endContent={<span aria-hidden>→</span>}
        >
          {lang === "en" ? "Start extraction" : "開始抽取"}
        </Button>
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
            isDragging ? "border-foreground bg-background" : "border-divider bg-white hover:border-foreground/50",
          ].join(" ")}
        >
          <div className="text-3xl leading-none mb-3" aria-hidden>☁</div>
          <div className="text-medium text-foreground mb-1">{lang === "en" ? "Drop your content here" : "將你的內容拖放至此"}</div>
          <div className="text-small text-default-500 mb-5">{lang === "en" ? "or pick a file to upload" : "或選擇檔案上傳"}</div>
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
            <span className="inline-block px-5 py-2.5 text-tiny tracking-[0.18em] uppercase border border-foreground text-foreground hover:bg-foreground hover:text-white transition rounded">
              {lang === "en" ? "Upload file" : "上傳檔案"}
            </span>
          </label>
        </div>
        {pickedFile && (
          <div className="border border-divider bg-background px-4 py-3 rounded">
            <div className="text-tiny tracking-[0.18em] uppercase text-default-400">{lang === "en" ? "Selected" : "已選取"}</div>
            <div className="text-small text-foreground mt-0.5">
              {pickedFile.name}{" "}
              <span className="text-default-500 text-small">({Math.round(pickedFile.size / 1024)} KB)</span>
            </div>
            {filePreview && (
              <pre className="mt-2 text-tiny text-default-500 whitespace-pre-wrap max-h-24 overflow-hidden">
                {filePreview}
              </pre>
            )}
          </div>
        )}
        {!source.ready && (
          <div className="border border-divider bg-background px-4 py-3 rounded text-small text-default-500">
            💡 {lang === "en" ? "File upload extraction ships next round. For now, please use" : "檔案上傳的後端萃取將於下一輪上線。在這之前，請改用"}{" "}
            <Button size="sm" variant="light" radius="sm" onPress={() => onSwitchSource("github")} className="h-auto min-w-0 px-1 underline text-foreground">GitHub</Button>
            {" "}{lang === "en" ? "or" : "或"}{" "}
            <Button size="sm" variant="light" radius="sm" onPress={() => onSwitchSource("web")} className="h-auto min-w-0 px-1 underline text-foreground">{lang === "en" ? "Web" : "網頁"}</Button>
            {" "}{lang === "en" ? "to build the template." : "模式建立任務範本。"}
          </div>
        )}
      </div>
    );
  }

  // ── Text paste ────────────────────────────────────────────────────
  if (source.inputType === "text") {
    return (
      <div className="max-w-[720px] space-y-4">
        <Textarea
          value={text}
          onValueChange={setText}
          placeholder={trMM(source.placeholder, lang)}
          minRows={14}
          variant="bordered"
          classNames={{ input: "font-mono" }}
        />
        {source.hint && (
          <p className="text-small text-default-500">{trMM(source.hint, lang)}</p>
        )}
        {!source.ready && (
          <div className="border border-divider bg-background px-4 py-3 rounded text-small text-default-500">
            💡 {lang === "en" ? "Text paste extraction ships next round. For now, use" : "文字貼上的後端萃取將於下一輪上線。先用"}{" "}
            <Button size="sm" variant="light" radius="sm" onPress={() => onSwitchSource("github")} className="h-auto min-w-0 px-1 underline text-foreground">GitHub</Button>
            {" "}{lang === "en" ? "or" : "或"}{" "}
            <Button size="sm" variant="light" radius="sm" onPress={() => onSwitchSource("web")} className="h-auto min-w-0 px-1 underline text-foreground">{lang === "en" ? "Web" : "網頁"}</Button>
            {" "}{lang === "en" ? "to extract the same content." : "抽取相同內容。"}
          </div>
        )}
        <Button color="primary" fullWidth isDisabled>
          {lang === "en" ? "Start extraction (coming soon)" : "開始抽取（敬請期待）"}
        </Button>
      </div>
    );
  }

  return null;
}

function RecoTile({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
  return (
    <Card
      isPressable
      onPress={onClick}
      shadow="none"
      radius="lg"
      className="w-full border border-divider data-[hover=true]:border-foreground bg-white"
    >
      <CardBody className="px-5 py-4 text-left">
        <div className="text-small text-foreground">{label}</div>
        <div className="mt-1 text-small text-default-500">{desc}</div>
      </CardBody>
    </Card>
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
  const { lang } = useLang();
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
      <div className="border border-divider bg-white p-5 rounded-lg flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-large">
          {AGENT_GLYPH[activeAgent]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
            ACTIVE AGENT
          </div>
          <div className="font-semibold text-medium text-foreground truncate">
            {activeAgent}
          </div>
          <div className="text-tiny text-default-500 truncate">
            {lang === "en" ? `Analyzing ${host}…` : `正在分析 ${host}…`}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" style={{ animationDelay: "200ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" style={{ animationDelay: "400ms" }} />
        </div>
      </div>

      {/* Activity feed */}
      <div className="border border-divider bg-background rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-divider text-tiny tracking-[0.28em] uppercase text-default-400 bg-white">
          ACTIVITY
        </div>
        <div className="px-4 py-3 max-h-[340px] overflow-y-auto font-mono space-y-1.5">
          {events.map((e, i) => (
            <FeedRow key={i} event={e} fading={i < events.length - 6} />
          ))}
          <div className="text-small text-default-400 flex items-center gap-2">
            <span className="inline-block w-1.5 h-3 bg-foreground animate-pulse" />
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
        "flex items-baseline gap-2 text-small transition-opacity",
        fading ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      <span className="w-4 shrink-0 text-center" aria-hidden>{KIND_GLYPH[event.kind]}</span>
      <span className="text-default-400 tracking-[0.04em] w-[88px] shrink-0">{KIND_LABEL[event.kind]}:</span>
      <span className="text-foreground truncate">{event.arg}</span>
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
  const { lang } = useLang();
  const updateStep = (i: number, patch: Partial<ExtractedMethodology["steps"][number]>) => {
    const next = [...draft.steps];
    next[i] = { ...next[i], ...patch };
    setDraft({ ...draft, steps: next });
  };
  return (
    <div className="max-w-[720px] space-y-4">
      <Input
        label={lang === "en" ? "Name" : "名稱"}
        labelPlacement="outside"
        isRequired
        variant="bordered"
        value={draft.name}
        onValueChange={(v) => setDraft({ ...draft, name: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={lang === "en" ? "Author" : "作者"}
          labelPlacement="outside"
          variant="bordered"
          value={draft.author ?? ""}
          onValueChange={(v) => setDraft({ ...draft, author: v })}
        />
        <Input
          label={lang === "en" ? "Year" : "年份"}
          labelPlacement="outside"
          variant="bordered"
          value={draft.year ?? ""}
          onValueChange={(v) => setDraft({ ...draft, year: v })}
        />
      </div>
      <Textarea
        label={lang === "en" ? "Description" : "說明"}
        labelPlacement="outside"
        variant="bordered"
        value={draft.description ?? ""}
        onValueChange={(v) => setDraft({ ...draft, description: v })}
        minRows={3}
      />
      <div>
        <p className="text-small font-medium mb-2">{lang === "en" ? "Steps" : "步驟"} ({draft.steps.length})</p>
        <div className="space-y-2">
          {draft.steps.map((s, i) => (
            <Card key={i} shadow="none" className="border border-divider">
              <CardBody className="p-3 gap-2">
                <Input
                  variant="bordered"
                  value={s.name}
                  onValueChange={(v) => updateStep(i, { name: v })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    variant="bordered"
                    size="sm"
                    placeholder={lang === "en" ? "Required skill" : "所需技能"}
                    value={s.requiredSkill ?? ""}
                    onValueChange={(v) => updateStep(i, { requiredSkill: v })}
                  />
                  <Input
                    variant="bordered"
                    size="sm"
                    placeholder={lang === "en" ? "Output" : "產出"}
                    value={s.outputType ?? ""}
                    onValueChange={(v) => updateStep(i, { outputType: v })}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-divider">
        <Button variant="bordered" onPress={onBack} startContent={<span aria-hidden>←</span>}>
          {lang === "en" ? "Change source" : "換來源"}
        </Button>
        <Button color="primary" onPress={onCommit} fullWidth endContent={<span aria-hidden>→</span>}>
          {lang === "en" ? "Confirm and add template" : "確認新增任務範本"}
        </Button>
      </div>
    </div>
  );
}

