/**
 * TheaterPage — 內容企劃台 v2 (CJ direction 2026-05-07).
 *
 * Layout (top → bottom):
 *   1. Top bar — platform multi-select + 加入重要日子 + 開始按鈕
 *   2. 大腦區 (sticky) — 1 line-art portrait frame + speech bubble
 *      typewriter. Single speaker, slides L→R between handoffs.
 *   3. Day-by-day waterfall — 1 row per day × N selected platforms.
 *      Each cell = mockup with caption (typed) + image (lazy gen).
 *
 * Generation pacing (per CJ "max 2 captions concurrent, images 1 by 1"):
 *   captionQueue concurrency = 2
 *   imageQueue   concurrency = 1
 *   image fires only after caption done; visual cascade by date order.
 *
 * Phase 1 (this commit): pure-frontend skeleton with mocked stage progression
 * so CJ can verify the brain bar animation + cast handoff feel before we
 * wire the real `runCalendar` backend (next commit).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Button, Spinner } from "@heroui/react";
import { PlatformMockup } from "../components/PlatformMockup";
import {
  Sparkles,
  Calendar as CalendarIcon,
  Plus,
  Play,
  X,
  Check,
  RefreshCw,
  Copy,
  Pencil,
  Flag,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebook,
  faInstagram,
  faYoutube,
  faThreads,
  faLine,
  faBloggerB,
} from "@fortawesome/free-brands-svg-icons";

/** 2026-05-10 (CJ「icon 要該社群平台 or NOTION B&W」): map iconKey to
 *  the actual platform brand glyph. Renderer always paints in neutral
 *  text color so platform shape is recognizable but palette stays B&W. */
const PLATFORM_ICON_MAP: Record<string, any> = {
  facebook:  faFacebook,
  instagram: faInstagram,
  youtube:   faYoutube,
  threads:   faThreads,
  line:      faLine,
  blog:      faBloggerB,
};
function PlatformIcon({ platformKey, className }: { platformKey: string; className?: string }) {
  const icon = PLATFORM_ICON_MAP[platformKey];
  if (!icon) return null;
  return <FontAwesomeIcon icon={icon} className={className ?? "text-neutral-700"} />;
}
import {
  THEATER_CAST,
  PLATFORM_META,
  getChief,
  getQA,
  getPlatformLead,
  getPlatformWriter,
  getPlatformImage,
  castIds,
  type CastMember,
  type TheaterPlatform,
} from "../config/theaterCast";

// ─── Types ────────────────────────────────────────────────────────────────

interface ImportantDate {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

// Phase 3b — 素材 (產品 / 照片)
interface ProductMaterial {
  id: string;
  name: string;
  usp: string;
  launchDate?: string; // YYYY-MM-DD
  photoUrl?: string;
}
interface PhotoMaterial {
  id: string;
  url: string;
  tag: "product" | "scene" | "person" | "lifestyle";
  note?: string;
}

interface CellState {
  status: "idle" | "queued" | "writing" | "qa" | "imaging" | "done" | "failed";
  /** Phase 2: per-platform structured fields (IG hashtags, YT chapters,
   *  LINE subject, Threads thread chain, Blog h2 list, etc). Mockup pulls
   *  what it knows; missing keys render with default skeleton. */
  structured?: Record<string, any>;
  caption?: string;
  imageUrl?: string | null;
  startedAt?: number;
  doneAt?: number;
}

type CellKey = string; // `${platform}::${date}`
const cellKey = (p: TheaterPlatform, d: string) => `${p}::${d}` as CellKey;

interface BrainStation {
  member: CastMember;
  thought: string;
  durationMs: number;
}

// ─── Brain bar component ──────────────────────────────────────────────────

function BrainBar({
  member,
  thought,
  avatarUrl,
}: {
  member: CastMember;
  thought: string;
  avatarUrl: string | null;
}) {
  // Typewriter effect for thought
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(thought.slice(0, i));
      if (i >= thought.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [thought]);

  // 2026-05-10 (CJ B&W): brain bar uses neutral palette regardless of
  // platform. Was tinting bg + shadow with brand color.
  const accent = "#171717"; // neutral-900
  const roleLabel = {
    chief:  "總策畫",
    lead:   member.platform ? `${PLATFORM_META[member.platform].label} Lead` : "Lead",
    writer: member.platform ? `${PLATFORM_META[member.platform].label} 文案` : "Writer",
    image:  member.platform ? `${PLATFORM_META[member.platform].label} 視覺` : "Visual",
    qa:     "QA 總編",
  }[member.role];

  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-neutral-200 backdrop-blur-md"
      style={{ background: `${accent}08` }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-5">
        {/* line-art portrait frame */}
        <div className="flex-shrink-0 relative">
          <div
            className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}66`,
            }}
          >
            <Avatar
              src={avatarUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(member.name)}`}
              size="lg"
              className="w-16 h-16"
              radius="md"
            />
          </div>
          <div
            className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-bold text-white rounded-md"
            style={{ background: accent, border: "1.5px solid #111" }}
          >
            {roleLabel}
          </div>
        </div>

        {/* speech bubble (line-art) */}
        <div className="flex-1 relative">
          <div
            className="relative bg-white px-5 py-4 rounded-2xl"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}33`,
              minHeight: 72,
            }}
          >
            {/* tail pointing left to portrait */}
            <div
              className="absolute left-[-10px] top-6 w-5 h-5 bg-white"
              style={{
                borderLeft: "2px solid #111",
                borderBottom: "2px solid #111",
                transform: "rotate(45deg)",
              }}
            />
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-2">
              <span className="font-semibold text-neutral-800">{member.name}</span>
              <span>·</span>
              <span>{member.title}</span>
            </div>
            <div
              className="text-[15px] leading-relaxed text-neutral-900 font-medium"
              style={{ minHeight: 22 }}
            >
              {shown}
              <span
                className="inline-block w-[2px] h-[16px] ml-0.5 align-middle bg-neutral-900"
                style={{ animation: "blink 1s steps(2) infinite" }}
              />
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

// ─── Cell card ────────────────────────────────────────────────────────────

function PlatformCell({
  platform,
  state,
  caption,
  writerAvatar,
  imageDirAvatar,
  qaAvatar,
  brandName,
  brandLogoUrl,
  onRedo,
  onCopy,
  onEdit,
  onMarkRule,
}: {
  platform: TheaterPlatform;
  state: CellState;
  caption: string;
  writerAvatar: string | null;
  imageDirAvatar: string | null;
  qaAvatar: string | null;
  brandName: string | null;
  brandLogoUrl: string | null;
  onRedo?: () => void;
  onCopy?: () => void;
  onEdit?: (newCaption: string) => void;
  onMarkRule?: () => void;
}) {
  // Phase 3a — inline edit state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption);
  useEffect(() => { if (!editing) setDraft(caption); }, [caption, editing]);
  const meta = PLATFORM_META[platform];
  const isIdle    = state.status === "idle" || state.status === "queued";
  const isWriting = state.status === "writing";
  const isQA      = state.status === "qa";
  const isImaging = state.status === "imaging";
  const isDone    = state.status === "done";
  const hasContent = isWriting || isQA || isImaging || isDone;

  // Tiny status pill (replaces the heavy colored header strip — mockup
  // already shows the platform identity, we just need a state indicator).
  const statusLabel =
    state.status === "queued"  ? "排隊中" :
    state.status === "writing" ? "撰寫中" :
    state.status === "qa"      ? "QA 校對中" :
    state.status === "imaging" ? "生圖中" :
    state.status === "done"    ? "完成"   :
    state.status === "failed"  ? "失敗"   : "等待";

  return (
    <div className="relative flex flex-col">
      {/* status chip — floats top-right of mockup. 2026-05-10 (CJ B&W):
          neutral palette by default; only state-failed uses red. */}
      {(hasContent || state.status === "queued") && (
        <span
          className={`absolute top-2 right-2 z-10 px-2 py-0.5 text-[10px] font-medium rounded-full shadow-sm ${
            state.status === "failed"
              ? "bg-red-600 text-white"
              : state.status === "done"
              ? "bg-neutral-900 text-white"
              : "bg-white text-neutral-700 border border-neutral-300"
          }`}
        >
          {statusLabel}
        </span>
      )}

      {/* Real platform mockup — full-width, no outer frame */}
      {hasContent ? (
        <div className="relative bg-white">
          <PlatformMockup
            variant={meta.mockup as any}
            title={(state.structured as any)?.headline ?? caption.split("\n")[0]?.slice(0, 40) ?? ""}
            brief={caption}
            brandName={brandName}
            brandLogoUrl={brandLogoUrl ?? null}
            liveCaption={caption}
            // Phase 2: pass platform-specific structured fields
            liveHashtags={(state.structured as any)?.hashtags}
            liveDescription={
              (state.structured as any)?.subject ??
              (state.structured as any)?.h2?.join(" · ") ??
              undefined
            }
            liveImageUrl={state.imageUrl ?? undefined}
            liveImageStatus={state.imageUrl ? "ready" : (isImaging ? undefined : "skipped")}
          />
          {/* Per-platform structured tail (chapters / thread / h2)
              shown beneath the mockup since not all PlatformMockup
              variants support these slots natively. */}
          {(state.structured as any)?.chapters?.length > 0 && (
            <div className="mt-1.5 px-2 py-1 bg-neutral-50 rounded text-[10px] leading-relaxed">
              <p className="text-neutral-500 mb-0.5">章節時間軸</p>
              {((state.structured as any).chapters as string[]).slice(0, 5).map((c, i) => (
                <p key={i} className="text-neutral-700">{c}</p>
              ))}
            </div>
          )}
          {(state.structured as any)?.thread?.length > 1 && (
            <div className="mt-1.5 px-2 py-1 bg-neutral-50 rounded text-[10px] leading-relaxed">
              <p className="text-neutral-500 mb-0.5">續發 ({(state.structured as any).thread.length} 則)</p>
              {((state.structured as any).thread as string[]).slice(1, 4).map((t, i) => (
                <p key={i} className="text-neutral-700">{`${i + 2}. ${t.slice(0, 80)}`}</p>
              ))}
            </div>
          )}
          {isImaging && !state.imageUrl && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Avatar src={imageDirAvatar ?? undefined} size="sm" className="w-8 h-8" />
              <Spinner size="sm" />
              <p className="text-[10px] text-neutral-600">視覺指導生圖中…</p>
            </div>
          )}
          {isWriting && !caption && (
            <div className="absolute inset-0 bg-white/80 flex items-center gap-2 justify-center">
              <Avatar src={writerAvatar ?? undefined} size="sm" className="w-6 h-6" />
              <p className="text-[11px] text-neutral-600">caption writer 撰寫中…</p>
            </div>
          )}
          {isQA && (
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm">
              <Avatar src={qaAvatar ?? undefined} size="sm" className="w-5 h-5" />
              <Spinner size="sm" classNames={{ wrapper: "w-3 h-3", circle1: "border-b-amber-500", circle2: "border-b-amber-500" }} />
              <span className="text-[10px] text-amber-700 font-medium pr-1">Chun-Hao 校對中</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className="bg-neutral-50 rounded-lg flex flex-col items-center gap-2 justify-center text-center px-3"
          style={{ minHeight: 200, border: "1px dashed #d4d4d4" }}
        >
          <PlatformIcon platformKey={meta.iconKey} className="text-2xl text-neutral-400" />
          <p className="text-[10px] text-neutral-400">
            {isIdle ? `${meta.short} · 等候接棒…` : "—"}
          </p>
        </div>
      )}

      {/* Inline edit overlay (Phase 3a) — opens on dblclick of done cell */}
      {editing && (
        <div className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm rounded-lg p-3 flex flex-col gap-2 shadow-lg" style={{ border: "2px solid #6366f1" }}>
          <p className="text-[10px] text-indigo-700 font-semibold flex items-center gap-1">
            ✏️ 編輯 caption — Enter 儲存 / Esc 取消
          </p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditing(false); setDraft(caption); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                onEdit?.(draft);
                setEditing(false);
              }
            }}
            className="flex-1 w-full text-[12px] leading-relaxed px-2 py-1.5 border border-indigo-200 rounded resize-none focus:outline-none focus:border-indigo-500"
            style={{ minHeight: 140 }}
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => { setEditing(false); setDraft(caption); }}
              className="text-[10px] px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
            >
              取消
            </button>
            <button
              onClick={() => { onEdit?.(draft); setEditing(false); }}
              className="text-[10px] px-2 py-1 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium"
            >
              儲存
            </button>
          </div>
        </div>
      )}

      {/* Double-click area on the mockup body opens inline edit */}
      {isDone && caption && !editing && onEdit && (
        <div
          className="absolute inset-0 cursor-text"
          style={{ background: "transparent" }}
          onDoubleClick={() => setEditing(true)}
          title="雙擊編輯文字"
        />
      )}

      {/* Action row (only on done) */}
      {isDone && caption && !editing && (
        <div className="mt-1 px-1 py-1.5 flex items-center gap-1.5 flex-wrap">
          {onCopy && (
            <button
              onClick={onCopy}
              className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
              title="複製 caption"
            >
              <Copy size={11} strokeWidth={2} />
              複製
            </button>
          )}
          {/* 2026-05-10 (CJ feedback「Notion B&W」+「按鈕命名不清楚」):
              移除 emoji、用 lucide icons、統一 neutral 色系。
              標記要改 → 標記修改規則（明確指動作 + 套用範圍） */}
          {onEdit && (
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
              title="雙擊或按這顆鈕編輯"
            >
              <Pencil size={11} strokeWidth={2} />
              編輯
            </button>
          )}
          {onMarkRule && (
            <button
              onClick={onMarkRule}
              className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
              title="標記這篇要改的地方 — 可選擇套用到單篇 / 全品牌"
            >
              <Flag size={11} strokeWidth={2} />
              標記修改
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
              title="重新生成這一格"
            >
              <RefreshCw size={11} strokeWidth={2} />
              重新生成
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

/** localStorage key for persisting run state per brand. */
const persistKey = (brandId: number | null) =>
  brandId ? `theater:run:brand-${brandId}` : null;

interface PersistedRun {
  activePlatforms: TheaterPlatform[];
  importantDates: ImportantDate[];
  products?: ProductMaterial[];
  photos?: PhotoMaterial[];
  cells: Array<[CellKey, CellState]>;
  cellMeta: Array<[CellKey, {
    usp: string;
    importantDateName: string | null;
    brandTagline: string | null;
    brandVoice: string | null;
    weekday: string;
    date: string;
  }]>;
  savedAt: number;
}

function loadPersisted(brandId: number | null): PersistedRun | null {
  const k = persistKey(brandId);
  if (!k) return null;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // sanity check shape
    if (!parsed.cells || !Array.isArray(parsed.cells)) return null;
    return parsed as PersistedRun;
  } catch {
    return null;
  }
}

function savePersisted(brandId: number | null, data: PersistedRun) {
  const k = persistKey(brandId);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(data));
  } catch {
    // quota exceeded etc — silently drop
  }
}

export default function TheaterPage() {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const brandName = useMemo(
    () => (ctx?.brands ?? []).find((b: any) => b.id === brandId)?.name ?? null,
    [ctx?.brands, brandId],
  );

  // Hydrate from localStorage on first mount (if there's a persisted run for this brand).
  const persisted = useMemo(() => loadPersisted(brandId), [brandId]);

  // selected platforms (default: FB + IG + YT, or restored from persistence)
  const [activePlatforms, setActivePlatforms] = useState<TheaterPlatform[]>(
    persisted?.activePlatforms ?? ["facebook", "instagram", "youtube"],
  );

  // important dates user adds
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(
    persisted?.importantDates ?? [],
  );
  const [products, setProducts] = useState<ProductMaterial[]>(
    persisted?.products ?? [],
  );
  const [photos, setPhotos] = useState<PhotoMaterial[]>(
    persisted?.photos ?? [],
  );

  // Phase 3b: 加入素材 modal state
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTab, setMaterialTab] = useState<"event" | "product" | "photo">("event");
  // event tab fields (reuses newDate / newDateName below)
  // product tab fields
  const [newProductName, setNewProductName] = useState("");
  const [newProductUsp, setNewProductUsp] = useState("");
  const [newProductLaunch, setNewProductLaunch] = useState("");
  // photo tab fields
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newPhotoTag, setNewPhotoTag] = useState<"product" | "scene" | "person" | "lifestyle">("product");
  const [newPhotoNote, setNewPhotoNote] = useState("");

  const totalMaterials = importantDates.length + products.length + photos.length;
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newDateName, setNewDateName] = useState("");

  // 7 calendar days starting today
  const days = useMemo(() => {
    const out: { date: string; weekday: string; label: string; isToday: boolean }[] = [];
    const t = new Date();
    const todayIso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
      const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({
        date: iso,
        weekday: wd,
        label: `${d.getMonth() + 1}/${d.getDate()}（${wd}）`,
        isToday: iso === todayIso,
      });
    }
    return out;
  }, []);

  // Preload cast avatars
  const castQuery = trpc.agent.byIds.useQuery({ ids: castIds() }, {
    staleTime: 60 * 60_000,
  });
  // Theater backend
  const utils = trpc.useUtils();
  const generateCellMut  = trpc.theater.generateCell.useMutation();
  const generateImageMut = trpc.theater.generateImage.useMutation();
  const qaReviewMut      = trpc.theater.qaReviewCell.useMutation();
  const addBrandRuleMut  = trpc.theater.addBrandRule.useMutation();
  const avatarById = useMemo(() => {
    const m = new Map<number, string | null>();
    (castQuery.data ?? []).forEach((a) => m.set(a.id, a.avatarUrl));
    return m;
  }, [castQuery.data]);
  const avatarOf = (m: CastMember) => avatarById.get(m.id) ?? null;

  // Cell state map (+ ref mirror so async workers can read latest captions
  // without re-running the closure on every state change)
  const [cells, setCells] = useState<Map<CellKey, CellState>>(
    () => new Map(persisted?.cells ?? []),
  );
  const cellsRef = useRef<Map<CellKey, CellState>>(new Map(persisted?.cells ?? []));
  useEffect(() => { cellsRef.current = cells; }, [cells]);

  // Per-cell metadata captured at run time — needed for redo.
  // Map<CellKey, { usp, importantDateName, brandTagline, brandVoice }>
  const [cellMeta, setCellMeta] = useState<Map<CellKey, {
    usp: string;
    importantDateName: string | null;
    brandTagline: string | null;
    brandVoice: string | null;
    weekday: string;
    date: string;
    hook?: string | null;
    cta?: string | null;
    scoutPatterns?: string[];
  }>>(() => new Map(persisted?.cellMeta ?? []));

  // Persist on any state change (debounced via single effect)
  useEffect(() => {
    if (!brandId) return;
    // Skip empty initial state to avoid writing junk before first run
    if (cells.size === 0 && cellMeta.size === 0 && products.length === 0 && photos.length === 0) return;
    savePersisted(brandId, {
      activePlatforms,
      importantDates,
      products,
      photos,
      cells: Array.from(cells.entries()),
      cellMeta: Array.from(cellMeta.entries()),
      savedAt: Date.now(),
    });
  }, [brandId, activePlatforms, importantDates, products, photos, cells, cellMeta]);

  // When brand switches, hydrate from that brand's persistence (or reset).
  const lastBrandRef = useRef<number | null>(brandId);
  useEffect(() => {
    if (lastBrandRef.current === brandId) return;
    lastBrandRef.current = brandId;
    const p = loadPersisted(brandId);
    setCells(new Map(p?.cells ?? []));
    setCellMeta(new Map(p?.cellMeta ?? []));
    setActivePlatforms(p?.activePlatforms ?? ["facebook", "instagram", "youtube"]);
    setImportantDates(p?.importantDates ?? []);
    setProducts(p?.products ?? []);
    setPhotos(p?.photos ?? []);
  }, [brandId]);

  // Brain bar state
  const [running, setRunning] = useState(false);
  const [station, setStation] = useState<BrainStation | null>(null);
  // 2026-05-08 (CJ test report #2): track run start so we can show
  // elapsed + ETA. Per-cell wall is ~6-8s; total = cells × 7s.
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState<number>(Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Build the station script when run starts
  const startRun = async () => {
    if (running) return;
    if (!brandId) {
      alert("請先選擇品牌");
      return;
    }
    if (activePlatforms.length === 0) {
      alert("請至少選擇一個社群平台");
      return;
    }

    setRunning(true);
    setRunStartedAt(Date.now());

    // Reset all cells
    const fresh = new Map<CellKey, CellState>();
    for (const p of activePlatforms) {
      for (const d of days) fresh.set(cellKey(p, d.date), { status: "queued" });
    }
    setCells(fresh);

    // 0) Fetch run plan from backend (positioning → USP pool + chief opening + lead thoughts + hook/cta plans + scout)
    let runPlan: {
      usps: string[];
      chiefOpening: string;
      leadThoughts: Record<string, string>;
      hookPlan: Record<string, string>;
      ctaPlan: Record<string, string>;
      // Phase 1.5: real scouted viral patterns per platform
      scoutByPlatform: Record<string, string[]>;
      scoutIndustry: string | null;
      // Brand-level rules merged from brand_caption_rules + positioning._assets
      brandRules?: string[];
      // Per-tab lock state from /brands page
      lockState?: { positioning: boolean; copy: boolean; visual: boolean };
      positioning: { tagline: string | null; targetAudience: string | null; brandVoice: string | null } | null;
    };
    try {
      runPlan = await utils.theater.runStart.fetch({
        brandId,
        platforms: activePlatforms,
        importantDates: importantDates.map((d) => ({ date: d.date, name: d.name })),
        // Phase 1: pass dates so server can pre-allocate hook + CTA per cell
        dates: days.map((d) => d.date),
        // Phase 3b: 素材 (products + photos) so chief brief can mention them
        products: products.map((p) => ({ name: p.name, usp: p.usp, launchDate: p.launchDate })),
        photos: photos.map((ph) => ({ url: ph.url, tag: ph.tag, note: ph.note })),
      });
    } catch (e) {
      console.error("[theater] runStart failed:", e);
      setRunning(false);
      alert("無法載入品牌定位 — 請先完成品牌定位再試");
      return;
    }

    const { usps, chiefOpening, leadThoughts, hookPlan, ctaPlan, scoutByPlatform, scoutIndustry, brandRules, lockState, positioning } = runPlan;
    // Surface brand rule count + lock acknowledgment in chief station
    const brandRulesCount = brandRules?.length ?? 0;
    const lockedTabs: string[] = [];
    if (lockState?.positioning) lockedTabs.push("定位");
    if (lockState?.copy)        lockedTabs.push("文字");
    if (lockState?.visual)      lockedTabs.push("視覺");
    const brandTagline = positioning?.tagline ?? null;
    const brandVoice   = positioning?.brandVoice ?? null;

    // 1) Chief opening monologue (real LLM-generated)
    //    Append brand-rule count chip if any are active so user sees the
    //    /brands 文字 tab assets are flowing through.
    const baseChief = chiefOpening || `本週 USP 候選：${usps.join("、")}。一篇貼文 = 一個 USP。${activePlatforms.map((p) => PLATFORM_META[p].short).join("、")} 各組準備接手。`;
    const rulesLine = brandRulesCount > 0
      ? `\n（已載入 ${brandRulesCount} 條品牌文字規則 — 來自 /brands 文字 tab，所有 caption 自動套用。）`
      : "";
    const lockLine = lockedTabs.length > 0
      ? `\n📌 採用已鎖定的品牌${lockedTabs.join(" · ")} — 全平台單一真相。`
      : "";
    const stations: BrainStation[] = [
      {
        member: getChief(),
        thought: `${baseChief}${rulesLine}${lockLine}`,
        durationMs: 6500,
      },
    ];

    // 2) Per-platform leads talk strategy (real LLM output from runStart)
    //    Phase 1.5: append a one-line scout summary so the user can SEE
    //    that real research happened on each platform.
    for (const p of activePlatforms) {
      const lead = getPlatformLead(p);
      const baseThought = leadThoughts[p] || `${PLATFORM_META[p].label} 我這條線接手。`;
      const scoutCount = scoutByPlatform[p]?.length ?? 0;
      const scoutLine = scoutCount > 0
        ? `（剛掃了 ${scoutCount} 篇本週 ${PLATFORM_META[p].label} ${scoutIndustry ?? "同產業"}高互動貼文，結構參考已注入。）`
        : "";
      stations.push({
        member: lead,
        thought: `${baseThought}${scoutLine ? "\n" + scoutLine : ""}`,
        durationMs: 4500,
      });
    }

    // 3) Writers + image dirs (one short station per platform)
    for (const p of activePlatforms) {
      const w = getPlatformWriter(p);
      stations.push({
        member: w,
        thought: `我開始寫 ${PLATFORM_META[p].label} 的 caption，2 篇並行，照日期順序排。`,
        durationMs: 3500,
      });
    }
    for (const p of activePlatforms) {
      const i = getPlatformImage(p);
      stations.push({
        member: i,
        thought: `${PLATFORM_META[p].label} 的視覺我接著生，1 張 1 張穩穩來，照日期排瀑布。`,
        durationMs: 3500,
      });
    }

    // 4) QA closing
    stations.push({
      member: getQA(),
      thought: `所有篇章我會逐篇審 USP / 違禁 / 一致性，flag 問題我會標註紅色，沒問題的我放行。`,
      durationMs: 5000,
    });

    // Drive the station carousel + cell progression (real backend)
    runStations(stations, { usps, brandTagline, brandVoice, hookPlan, ctaPlan, scoutByPlatform });
  };

  const stopRun = () => {
    setRunning(false);
    setStation(null);
  };

  // ── Station playback + real backend cell pump ─────────────────────────
  const stopRef = useRef(false);
  const runStations = async (
    stations: BrainStation[],
    plan: {
      usps: string[];
      brandTagline: string | null;
      brandVoice: string | null;
      hookPlan: Record<string, string>;
      ctaPlan: Record<string, string>;
      // Phase 1.5: real scout patterns per platform
      scoutByPlatform: Record<string, string[]>;
    },
  ) => {
    if (!brandId) return;
    stopRef.current = false;

    // Build queue: by date order, all platforms per date.
    // Each task carries the USP + hook + CTA + scout assigned (Phase 1+1.5).
    type Task = {
      key: CellKey;
      platform: TheaterPlatform;
      date: string;
      weekday: string;
      usp: string;
      hook: string | null;
      cta: string | null;
      scoutPatterns: string[];
      importantDateName: string | null;
    };
    const captionTasks: Task[] = [];
    let uspCursor = 0;
    for (const d of days) {
      const matching = importantDates.find((x) => x.date === d.date);
      for (const p of activePlatforms) {
        const usp = plan.usps[uspCursor % plan.usps.length] ?? plan.usps[0]!;
        uspCursor++;
        const planKey = `${d.date}::${p}`;
        captionTasks.push({
          key: cellKey(p, d.date),
          platform: p,
          date: d.date,
          weekday: d.weekday,
          usp,
          hook: plan.hookPlan[planKey] ?? null,
          cta:  plan.ctaPlan[planKey]  ?? null,
          scoutPatterns: plan.scoutByPlatform[p] ?? [],
          importantDateName: matching ? matching.name : null,
        });
      }
    }
    let captionIdx = 0;

    // Kick off station carousel (frontend-paced, decoupled from generation)
    (async () => {
      for (const s of stations) {
        if (stopRef.current) break;
        setStation(s);
        await sleep(s.durationMs);
      }
    })();

    // Wait ~6s so chief + first lead get airtime before cells start filling.
    await sleep(6000);
    if (stopRef.current) return;

    // Caption pump — concurrency 2
    const imageQueue: Task[] = [];
    const captionWorker = async () => {
      while (captionIdx < captionTasks.length) {
        const myIdx = captionIdx++;
        const task = captionTasks[myIdx];
        if (!task) continue;
        if (stopRef.current) return;

        updateCell(task.key, { status: "writing", caption: "" });
        // Persist meta for future redo on this cell (including hook + cta
        // + scout patterns so redo reproduces full context)
        setCellMeta((prev) => {
          const next = new Map(prev);
          next.set(task.key, {
            usp: task.usp,
            importantDateName: task.importantDateName,
            brandTagline: plan.brandTagline,
            brandVoice: plan.brandVoice,
            weekday: task.weekday,
            date: task.date,
            hook: task.hook,
            cta:  task.cta,
            scoutPatterns: task.scoutPatterns,
          });
          return next;
        });
        try {
          const r = await generateCellMut.mutateAsync({
            brandId,
            platform: task.platform,
            date: task.date,
            weekday: task.weekday,
            usp: task.usp,
            importantDateName: task.importantDateName,
            brandTagline: plan.brandTagline,
            brandVoice: plan.brandVoice,
            // Phase 1: enforce hook + CTA diversity
            hook: task.hook as any,
            cta:  task.cta  as any,
            // Phase 1.5: real scouted viral patterns for this platform
            scoutPatterns: task.scoutPatterns,
            // Phase 3a: run-scope ad-hoc rules (brand-scope rules are
            // loaded server-side from DB)
            adhocRules: runRules,
            // Phase 3b: 素材 context
            products: products.map((p) => ({ name: p.name, usp: p.usp, launchDate: p.launchDate })),
            photoTags: photos.map((ph) => ph.tag),
          });
          if (stopRef.current) return;
          if (r.ok && r.caption) {
            // Show writer's raw draft + structured fields (rewrites and all — visible on purpose)
            const structured = (r as any).structured ?? {};
            updateCell(task.key, { status: "writing", caption: r.caption, structured });
            // Brief beat so user perceives the draft, then QA passes
            await sleep(450);
            if (stopRef.current) return;
            updateCell(task.key, { status: "qa", caption: r.caption, structured });
            try {
              const qa = await qaReviewMut.mutateAsync({
                draft: r.caption,
                platform: task.platform,
                hook: task.hook as any,
                cta:  task.cta  as any,
                usp:  task.usp,
              });
              if (stopRef.current) return;
              if (qa.ok && qa.caption) {
                updateCell(task.key, { status: "qa", caption: qa.caption, structured });
              }
            } catch (e) {
              console.warn("[theater] QA review failed, keeping draft:", task.key, e);
            }
            // Hand off to image queue with the (possibly QA-cleaned) caption
            imageQueue.push({ ...task });
          } else {
            updateCell(task.key, { status: "failed" });
          }
        } catch (e) {
          console.error("[theater] caption failed:", task.key, e);
          updateCell(task.key, { status: "failed" });
        }
      }
    };

    // Image pump — concurrency 1 (one at a time, by date order)
    const imageWorker = async () => {
      while (true) {
        if (stopRef.current) return;
        const task = imageQueue.shift();
        if (!task) {
          if (captionIdx >= captionTasks.length && imageQueue.length === 0) return;
          await sleep(400);
          continue;
        }
        updateCell(task.key, { status: "imaging" });
        // Pull caption from cell state (set by caption worker)
        const captionFromState = (cellsRef.current.get(task.key)?.caption) ?? "";
        if (!captionFromState) {
          updateCell(task.key, { status: "failed" });
          continue;
        }
        try {
          const r = await generateImageMut.mutateAsync({
            brandId,
            platform: task.platform,
            caption: captionFromState,
            brandTagline: plan.brandTagline,
          });
          if (stopRef.current) return;
          if (r.ok && r.imageUrl) {
            updateCell(task.key, { status: "done", imageUrl: r.imageUrl, doneAt: Date.now() });
          } else {
            // image failed → keep caption, mark as done with no image rather than failing the whole cell
            updateCell(task.key, { status: "done", imageUrl: null, doneAt: Date.now() });
          }
        } catch (e) {
          console.error("[theater] image failed:", task.key, e);
          updateCell(task.key, { status: "done", imageUrl: null, doneAt: Date.now() });
        }
      }
    };

    // Phase 2: bumped image worker pool 1 → 3. Captions still 2-wide so
    // we don't slam the LLM provider, but Flux can comfortably handle 3
    // parallel renders and cell completion velocity matters more than
    // image-by-image waterfall (CJ flagged '圖等很久' as a P1).
    await Promise.all([
      captionWorker(),
      captionWorker(),
      imageWorker(),
      imageWorker(),
      imageWorker(),
    ]);
    setRunning(false);
  };

  const updateCell = (key: CellKey, patch: Partial<CellState>) => {
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { status: "idle" };
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  // ── Per-cell redo: re-runs caption + image with stored meta ───────────
  const redoCell = async (key: CellKey, platform: TheaterPlatform) => {
    if (!brandId) return;
    const meta = cellMeta.get(key);
    if (!meta) {
      console.warn("[theater] redo: no meta for", key);
      return;
    }
    updateCell(key, { status: "writing", caption: "" });
    try {
      const r = await generateCellMut.mutateAsync({
        brandId,
        platform,
        date: meta.date,
        weekday: meta.weekday,
        usp: meta.usp,
        importantDateName: meta.importantDateName,
        brandTagline: meta.brandTagline,
        brandVoice: meta.brandVoice,
        // Phase 1: redo reuses the original hook + cta assignment
        hook: meta.hook as any,
        cta:  meta.cta  as any,
        // Phase 1.5: redo reuses the same scout patterns
        scoutPatterns: meta.scoutPatterns,
      });
      if (!r.ok || !r.caption) {
        updateCell(key, { status: "failed" });
        return;
      }
      const newStructured = (r as any).structured ?? {};
      updateCell(key, { status: "imaging", caption: r.caption, structured: newStructured });
      const img = await generateImageMut.mutateAsync({
        brandId,
        platform,
        caption: r.caption,
        brandTagline: meta.brandTagline,
      });
      updateCell(key, {
        status: "done",
        caption: r.caption,
        structured: newStructured,
        imageUrl: img.ok ? img.imageUrl : null,
        doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] redo failed:", key, e);
      updateCell(key, { status: "failed" });
    }
  };

  const copyCaption = async (key: CellKey) => {
    const cap = cells.get(key)?.caption;
    if (!cap) return;
    try {
      await navigator.clipboard.writeText(cap);
    } catch {
      // fallback: select textarea trick
      const ta = document.createElement("textarea");
      ta.value = cap;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  // ── Phase 3a: inline edit + 修改規則 modal ──────────────────────
  /** Inline edit handler — user committed new caption text directly */
  const editCellCaption = (key: CellKey, newCaption: string) => {
    if (!newCaption.trim()) return;
    updateCell(key, { caption: newCaption.trim() });
  };

  /** Run-scope rules: applied to all future cells in this run only.
   *  Persistent across cells in the run; cleared on stop / new run. */
  const [runRules, setRunRules] = useState<string[]>([]);

  /** Modal for marking a cell as needing a fix */
  const [ruleModal, setRuleModal] = useState<{ key: CellKey; platform: TheaterPlatform } | null>(null);
  const [ruleText, setRuleText] = useState("");
  const [ruleScope, setRuleScope] = useState<"post" | "run" | "brand">("post");

  const openRuleModal = (key: CellKey) => {
    const platform = key.split("::")[0] as TheaterPlatform;
    setRuleModal({ key, platform });
    setRuleText("");
    setRuleScope("post");
  };
  const closeRuleModal = () => { setRuleModal(null); setRuleText(""); };
  const submitRule = async () => {
    if (!ruleModal || !ruleText.trim()) return;
    const rule = ruleText.trim();
    const { key, platform } = ruleModal;
    if (ruleScope === "brand" && brandId) {
      // Persist to DB → all future runs for this brand will get this rule
      try {
        await addBrandRuleMut.mutateAsync({ brandId, rule, scope: "brand" });
      } catch (e) {
        console.error("[theater] addBrandRule failed:", e);
      }
    } else if (ruleScope === "run") {
      // Stash in client state for the rest of this run
      setRunRules((prev) => [...prev, rule]);
    }
    closeRuleModal();
    // Re-run this cell with the rule applied (single-post + run-scope both
    // benefit from immediate redo; brand-scope also redoes since the
    // user wants to see the fix now)
    const meta = cellMeta.get(key);
    if (!meta || !brandId) return;
    updateCell(key, { status: "writing", caption: "" });
    try {
      const adhoc = ruleScope === "post"
        ? [rule]
        : ruleScope === "run"
          ? [...runRules, rule]
          : []; // brand-scope is loaded server-side from DB, no adhoc needed
      const r = await generateCellMut.mutateAsync({
        brandId,
        platform,
        date: meta.date,
        weekday: meta.weekday,
        usp: meta.usp,
        importantDateName: meta.importantDateName,
        brandTagline: meta.brandTagline,
        brandVoice: meta.brandVoice,
        hook: meta.hook as any,
        cta:  meta.cta  as any,
        scoutPatterns: meta.scoutPatterns,
        adhocRules: adhoc,
      });
      if (!r.ok || !r.caption) {
        updateCell(key, { status: "failed" });
        return;
      }
      const structured = (r as any).structured ?? {};
      // Skip QA on rule-driven redo (user gave explicit edit; trust LLM)
      updateCell(key, { status: "imaging", caption: r.caption, structured });
      const img = await generateImageMut.mutateAsync({
        brandId, platform, caption: r.caption, brandTagline: meta.brandTagline,
      });
      updateCell(key, {
        status: "done",
        caption: r.caption,
        structured,
        imageUrl: img.ok ? img.imageUrl : null,
        doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] rule redo failed:", e);
      updateCell(key, { status: "failed" });
    }
  };

  // ── Important date add ────────────────────────────────────────────────
  const handleAddDate = () => {
    if (!newDate || !newDateName) return;
    setImportantDates((prev) => [
      ...prev,
      { id: `${newDate}-${Math.random().toString(36).slice(2, 7)}`, date: newDate, name: newDateName },
    ].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewDateName("");
    setShowAddDate(false);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Brain bar (sticky) */}
      {station ? (
        <BrainBar
          member={station.member}
          thought={station.thought}
          avatarUrl={avatarOf(station.member)}
        />
      ) : (
        <div className="sticky top-0 z-30 w-full border-b border-neutral-200 bg-white">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3">
            <Sparkles size={18} className="text-neutral-400" strokeWidth={1.5} />
            <p className="text-sm text-neutral-500">
              選好平台 + 重要日子，按「開始企劃」— Claire 會率隊上場
            </p>
          </div>
        </div>
      )}

      {/* Top bar — controls */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              內容企劃台
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              20 位 AI agents 為 {brandName ?? "（請先選品牌）"} 規劃 7 天跨平台內容
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!running && cells.size > 0 && (
              <Button
                size="sm"
                variant="light"
                onPress={() => {
                  if (!confirm("確認清空目前這個品牌的企劃結果？此動作不可還原。")) return;
                  setCells(new Map());
                  setCellMeta(new Map());
                  setStation(null);
                  const k = persistKey(brandId);
                  if (k) localStorage.removeItem(k);
                }}
                startContent={<RefreshCw size={13} strokeWidth={2} />}
              >
                清空結果
              </Button>
            )}
            {!running ? (
              <Button
                color="primary"
                onPress={startRun}
                startContent={<Play size={14} strokeWidth={2} />}
                isDisabled={!brandId}
              >
                {cells.size > 0 ? "重新企劃" : "開始企劃"}
              </Button>
            ) : (() => {
              // 2026-05-08 (CJ test report #2): live elapsed + ETA + done/total
              const total = cells.size;
              let done = 0;
              cells.forEach((c) => { if (c.status === "done" || c.status === "failed") done++; });
              const elapsedMs = runStartedAt ? tickNow - runStartedAt : 0;
              const elapsedSec = Math.floor(elapsedMs / 1000);
              // Per-cell budget ~7s; with parallelism factor 2, total ≈ ceil(total/2) * 7s
              const expectedTotalSec = Math.ceil(total / 2) * 7;
              const remainingSec = Math.max(0, expectedTotalSec - elapsedSec);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col items-end">
                    <div className="text-[11px] text-default-600 tabular-nums">
                      {done}/{total} · {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
                      {" / "}
                      ~{Math.floor(expectedTotalSec / 60)}:{String(expectedTotalSec % 60).padStart(2, "0")}
                      {remainingSec > 0 && elapsedSec < expectedTotalSec && (
                        <span className="text-default-400 ml-1">（剩 {remainingSec}s）</span>
                      )}
                    </div>
                    <div className="w-32 h-1 bg-default-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={() => { stopRef.current = true; stopRun(); }}
                    startContent={<X size={14} strokeWidth={2} />}
                  >
                    停止
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Platform multi-select */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-neutral-500 mr-2">平台：</span>
          {(Object.keys(PLATFORM_META) as TheaterPlatform[]).map((p) => {
            const meta = PLATFORM_META[p];
            const on = activePlatforms.includes(p);
            return (
              <button
                key={p}
                onClick={() =>
                  setActivePlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )
                }
                disabled={running}
                className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition border ${
                  on
                    ? "bg-neutral-900 text-white border-neutral-900 font-semibold"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400 font-medium"
                } ${running ? "opacity-70" : ""}`}
              >
                <PlatformIcon platformKey={meta.iconKey} className={on ? "text-white" : "text-neutral-700"} />
                <span>{meta.label}</span>
                {on && <Check size={12} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>

        {/* Phase 3b: 加入素材 toolbar — prominent button + summary chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button
            onClick={() => { setMaterialModalOpen(true); setMaterialTab("event"); }}
            className="px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border-2 border-indigo-200 hover:border-indigo-400 flex items-center gap-2 text-sm font-medium transition shadow-sm"
            disabled={running}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span className="flex items-center gap-1.5"><Plus size={14} strokeWidth={2.5} />加入素材</span>
            {totalMaterials > 0 && (
              <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-500 text-white font-bold">
                {totalMaterials}
              </span>
            )}
          </button>

          {/* Inline summary chips */}
          {importantDates.map((d) => (
            <span key={d.id} className="px-2.5 py-1 text-xs rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <CalendarIcon size={11} strokeWidth={2} />
              <span className="font-semibold">{d.date.slice(5)}</span>
              <span>{d.name}</span>
              <button onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))} className="text-amber-600 hover:text-amber-900">
                <X size={11} />
              </button>
            </span>
          ))}
          {products.map((p) => (
            <span key={p.id} className="px-2.5 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span className="font-semibold">{p.name}</span>
              <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} className="text-emerald-600 hover:text-emerald-900">
                <X size={11} />
              </button>
            </span>
          ))}
          {photos.map((ph) => (
            <span key={ph.id} className="px-2.5 py-1 text-xs rounded-lg bg-pink-50 text-pink-800 border border-pink-200 flex items-center gap-1.5">
              <span>{ph.tag}</span>
              <button onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== ph.id))} className="text-pink-600 hover:text-pink-900">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Pinterest-style masonry — all cells flow into a single multi-column
          stream, sorted by date then platform. Cells have varying heights
          (each platform mockup has its own natural shape) so CSS columns
          give the proper masonry packing. */}
      <div className="max-w-[1600px] mx-auto px-6 pb-16">
        {!brandId ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
            <p className="text-neutral-500 text-sm">請先在左上角選擇品牌</p>
          </div>
        ) : (
          // 2026-05-10 (CJ「5/13 整天消失」根因): 舊版 column-count masonry 把
          // (day × platform) cells flatten 後重新 pack 成 N 個 CSS column，造成
          // 5/13 cells 視覺上被插到別 column 尾巴 → 整欄看起來空白。改成 day-grid：
          // 每個 day 自己一欄，platform cells 在欄位內垂直 stack。
          <div className="grid gap-3" style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(260px, 1fr))`,
            overflowX: "auto",
          }}>
            {days.map((d) => {
              const matchingDate = importantDates.find((x) => x.date === d.date);
              return (
                <div key={d.date} className="space-y-3 min-w-0">
                  {/* Day header */}
                  <div className={`flex items-center gap-1.5 px-1 py-1.5 ${d.isToday ? "bg-neutral-900 text-white rounded-md px-2" : ""}`}>
                    <span className={`text-[11px] font-semibold ${d.isToday ? "text-white" : "text-neutral-700"}`}>
                      {d.label}
                    </span>
                    {d.isToday && (
                      <span className="text-[9px] font-bold tracking-wider bg-white text-neutral-900 px-1 py-0.5 rounded">
                        TODAY
                      </span>
                    )}
                    {matchingDate && (
                      <span className="text-[10px] text-neutral-700 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                        {matchingDate.name}
                      </span>
                    )}
                  </div>
                  {/* Platform cells stacked vertically inside this day */}
                  {activePlatforms.map((p) => {
                    const key = cellKey(p, d.date);
                    const state = cells.get(key) ?? { status: "idle" as const };
                    return (
                      <div key={key}>
                        <PlatformCell
                      platform={p}
                      state={state}
                      caption={state.caption ?? ""}
                      writerAvatar={avatarOf(getPlatformWriter(p))}
                      imageDirAvatar={avatarOf(getPlatformImage(p))}
                      qaAvatar={avatarOf(getQA())}
                      brandName={brandName}
                      brandLogoUrl={(ctx?.brands ?? []).find((b: any) => b.id === brandId)?.logoUrl ?? null}
                      onCopy={() => copyCaption(key)}
                      onRedo={() => redoCell(key, p)}
                      onEdit={(newCaption) => editCellCaption(key, newCaption)}
                      onMarkRule={() => openRuleModal(key)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Phase 3b — 加入素材 modal (3 tabs: 活動 / 產品 / 照片) */}
        {materialModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setMaterialModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
              {/* 2026-05-10 (CJ feedback「產品 tab 沒有關閉鈕」): always-visible
                  ✕ in top-right regardless of which tab is active. */}
              <button
                onClick={() => setMaterialModalOpen(false)}
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-100 transition"
                title="關閉"
              >
                <X size={18} />
              </button>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">加入素材</h3>
              <p className="text-xs text-neutral-500 mb-4">活動 / 產品 / 照片，等等開始企劃時 agents 會把這些 context 都吃進去。</p>

              {/* Tab switcher */}
              <div className="flex items-center gap-1 mb-5 border-b border-neutral-200">
                {([
                  { v: "event"   as const, label: "活動",  count: importantDates.length },
                  { v: "product" as const, label: "產品",  count: products.length },
                  { v: "photo"   as const, label: "照片",  count: photos.length },
                ]).map((t) => (
                  <button
                    key={t.v}
                    onClick={() => setMaterialTab(t.v)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                      materialTab === t.v
                        ? "border-indigo-500 text-indigo-700"
                        : "border-transparent text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {t.label} {t.count > 0 && <span className="text-xs text-neutral-400">({t.count})</span>}
                  </button>
                ))}
              </div>

              {/* Event tab */}
              {materialTab === "event" && (
                <div className="space-y-3">
                  {importantDates.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {importantDates.map((d) => (
                        <div key={d.id} className="flex items-center justify-between bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                          <span className="text-sm flex items-center gap-1.5"><CalendarIcon size={13} className="text-neutral-500" /><b>{d.date}</b> {d.name}</span>
                          <button onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))} className="text-amber-600 hover:text-amber-900">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded" />
                    <input type="text" placeholder="活動 / 檔期名稱（例：母親節限時優惠）" value={newDateName} onChange={(e) => setNewDateName(e.target.value)} className="flex-1 text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-indigo-500" />
                    <button
                      onClick={() => { handleAddDate(); }}
                      disabled={!newDate || !newDateName}
                      className="text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium disabled:opacity-40"
                    >
                      新增
                    </button>
                  </div>
                </div>
              )}

              {/* Product tab */}
              {materialTab === "product" && (
                <div className="space-y-3">
                  {products.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {products.map((p) => (
                        <div key={p.id} className="flex items-start justify-between bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                          <div className="text-sm">
                            <p><b>{p.name}</b> {p.launchDate && <span className="text-neutral-500 text-xs">· {p.launchDate} 上市</span>}</p>
                            <p className="text-xs text-neutral-600 mt-0.5">{p.usp}</p>
                          </div>
                          <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} className="text-emerald-600 hover:text-emerald-900 mt-1">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <input type="text" placeholder="產品 / 服務名稱（例：健力餐 5g）" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="w-full text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-indigo-500" />
                    <input type="text" placeholder="這個產品的 USP（一句話）" value={newProductUsp} onChange={(e) => setNewProductUsp(e.target.value)} className="w-full text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-indigo-500" />
                    <div className="flex items-center gap-2">
                      <input type="date" placeholder="上市日（可選）" value={newProductLaunch} onChange={(e) => setNewProductLaunch(e.target.value)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded" />
                      <button
                        onClick={() => {
                          if (!newProductName || !newProductUsp) return;
                          setProducts((prev) => [...prev, {
                            id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            name: newProductName.trim(),
                            usp: newProductUsp.trim(),
                            launchDate: newProductLaunch || undefined,
                          }]);
                          setNewProductName(""); setNewProductUsp(""); setNewProductLaunch("");
                        }}
                        disabled={!newProductName || !newProductUsp}
                        className="ml-auto text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium disabled:opacity-40"
                      >
                        新增
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Photo tab */}
              {materialTab === "photo" && (
                <div className="space-y-3">
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {photos.map((ph) => (
                        <div key={ph.id} className="relative group">
                          <img src={ph.url} alt={ph.note ?? ph.tag} className="w-full aspect-square object-cover rounded-lg border border-pink-200" />
                          <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/90 text-white font-medium">
                            {ph.tag}
                          </span>
                          <button onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== ph.id))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <input type="url" placeholder="照片 URL（直接貼網址 / 將來支援上傳）" value={newPhotoUrl} onChange={(e) => setNewPhotoUrl(e.target.value)} className="w-full text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-indigo-500" />
                    <div className="flex items-center gap-2">
                      <select value={newPhotoTag} onChange={(e) => setNewPhotoTag(e.target.value as any)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded">
                        <option value="product">產品實拍</option>
                        <option value="scene">場景</option>
                        <option value="person">人物</option>
                        <option value="lifestyle">情境</option>
                      </select>
                      <input type="text" placeholder="備註（可選）" value={newPhotoNote} onChange={(e) => setNewPhotoNote(e.target.value)} className="flex-1 text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-indigo-500" />
                      <button
                        onClick={() => {
                          if (!newPhotoUrl) return;
                          setPhotos((prev) => [...prev, {
                            id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            url: newPhotoUrl.trim(),
                            tag: newPhotoTag,
                            note: newPhotoNote.trim() || undefined,
                          }]);
                          setNewPhotoUrl(""); setNewPhotoNote("");
                        }}
                        disabled={!newPhotoUrl}
                        className="text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium disabled:opacity-40"
                      >
                        新增
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end mt-5 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setMaterialModalOpen(false)}
                  className="text-sm px-4 py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3a — 標記要改 modal */}
        {ruleModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={closeRuleModal}>
            <div
              className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-neutral-900 mb-1">
                標記修改規則
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                寫下這篇要改的地方（例：「不能說玩家使用經驗」、「不能有負面陳述」、「結尾不要寫『歡迎洽詢』」），等等會自動套用 + 重新生成。
              </p>
              <textarea
                autoFocus
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder="例：不能說玩家使用經驗"
                className="w-full text-sm px-3 py-2 border border-neutral-300 rounded resize-none focus:outline-none focus:border-indigo-500"
                style={{ minHeight: 80 }}
              />
              <p className="text-xs font-medium text-neutral-700 mt-4 mb-2">套用範圍</p>
              <div className="space-y-2">
                {([
                  { v: "post" as const,  label: "只改這一篇", hint: "重新生成這格 caption，套規則一次。" },
                  { v: "run"  as const,  label: "套用到本次 7 天全部",  hint: "這次企劃剩下還沒重做的格子都會吃這條規則。" },
                  { v: "brand" as const, label: "套用到本品牌所有未來企劃", hint: "存進品牌規則庫，下次按開始企劃會自動帶。" },
                ]).map((opt) => (
                  <label
                    key={opt.v}
                    className={`block p-2.5 rounded-lg border cursor-pointer transition ${
                      ruleScope === opt.v ? "border-indigo-500 bg-indigo-50" : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        checked={ruleScope === opt.v}
                        onChange={() => setRuleScope(opt.v)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{opt.label}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">{opt.hint}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={closeRuleModal}
                  className="text-sm px-4 py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                >
                  取消
                </button>
                <button
                  onClick={submitRule}
                  disabled={!ruleText.trim()}
                  className="text-sm px-4 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  套用 + 重新生成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cast roster footer */}
        <div className="mt-12 pt-6 border-t border-neutral-200">
          <p className="text-xs text-neutral-500 mb-3">演職員表（20 位 AI agents · 全員不重複）</p>
          <div className="flex flex-wrap gap-2">
            {THEATER_CAST.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg"
                title={`${m.name} — ${m.title}`}
              >
                <Avatar src={avatarOf(m) ?? undefined} size="sm" className="w-5 h-5" />
                <span className="text-[11px] text-neutral-700 font-medium">{m.name}</span>
                {m.platform && (
                  <span className="text-[9px] px-1 rounded bg-neutral-100 text-neutral-700 flex items-center gap-1">
                    <PlatformIcon platformKey={PLATFORM_META[m.platform].iconKey} className="text-neutral-700" />
                    {PLATFORM_META[m.platform].short}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
