/**
 * MissionsHome — 任務牆 (v2 D3 — Canva-style home)
 *
 * Visual reference: Canva home screen
 *   ┌── pastel gradient hero ──────────────────────────────┐
 *   │            你今天要做什麼任務？                       │
 *   │       [ 🔍 搜尋模板、方法論與任務            ]        │
 *   │   ◯  ◯  ◯  ◯  ◯  ◯  ◯  ◯  ◯  ◯ (circular tiles)    │
 *   └──────────────────────────────────────────────────────┘
 *      最近的任務                       [filters]
 *      [thumb][thumb][thumb][thumb][thumb][thumb]   ← 6-col grid
 *
 * Each circular tile = a "start a mission with X" shortcut. Click → AI
 * pre-fills mission title/desc/squad → navigates to MissionDetail.
 *
 * Recent missions render as compact thumbnail tiles (~210px wide), 6 per
 * row, with platform icon + title + last-edited timestamp — matching
 * Canva's "最近的項目" grid density.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

interface MissionRow {
  id: number;
  title: string;
  description?: string | null;
  workspace?: string | null;
  methodology?: string | null;
  squadSlug?: string | null;
  squadName?: string | null;
  squadLayer?: string | null;
  squadStepCount?: number | null;
  brandId?: number | null;
  status?: string | null;
  brandName?: string | null;
  updatedAt?: string;
}

interface QuickTile {
  emoji: string;
  /** Solid colour ring around the icon — the bold Canva look. */
  color: string;
  label: string;
  /** Show "新功能" badge on the icon. */
  badge?: string;
  /** Pre-filled mission title — what shows up in the user's mission wall. */
  missionTitle: string;
  missionDesc: string;
  squadSlug?: string;
  workspace?: string;
  /** "more" tile uses a different click handler. */
  isMore?: boolean;
}

const QUICK_TILES: QuickTile[] = [
  { emoji: "📘", color: "#1877F2", label: "Facebook",
    missionTitle: "Facebook 月度經營計畫",
    missionDesc: "為品牌規劃下一個月的 Facebook 內容主軸、貼文節奏與互動策略。",
    workspace: "facebook" },
  { emoji: "📷", color: "#E4405F", label: "Instagram",
    missionTitle: "Instagram 圖文系列企劃",
    missionDesc: "規劃 Instagram 連續貼文系列：視覺主題、文案結構、Hashtag、限動延伸。",
    workspace: "instagram" },
  { emoji: "💼", color: "#0A66C2", label: "LinkedIn",
    missionTitle: "LinkedIn 個人品牌經營",
    missionDesc: "以創辦人視角產出 B2B 思想領袖內容，建立信任與商機。",
    workspace: "linkedin" },
  { emoji: "🎬", color: "#FF0000", label: "YouTube",
    missionTitle: "YouTube 頻道內容企劃",
    missionDesc: "規劃 YouTube 頻道主題、長影片企劃與短影音延伸。",
    workspace: "youtube" },
  { emoji: "🎯", color: "#5B3CC8", label: "品牌定位", badge: "推薦",
    missionTitle: "品牌定位重塑（12 原型）",
    missionDesc: "用 Carol Pearson 12 原型方法論梳理品牌個性與市場立足點。",
    squadSlug: "brand-archetype-positioning",
    workspace: "brand-positioning" },
  { emoji: "🚀", color: "#1A9B8E", label: "新品上市",
    missionTitle: "新品上市發表計畫",
    missionDesc: "依 Jeff Walker Product Launch Formula，規劃 4 階段發表節奏。",
    squadSlug: "plf-launch-formula",
    workspace: "campaign" },
  { emoji: "👥", color: "#E07B0F", label: "受眾分析",
    missionTitle: "受眾洞察與分群",
    missionDesc: "用 STP 與 Persona Canvas 產出可操作的受眾分群與訊息切入。",
    workspace: "audience" },
  { emoji: "📰", color: "#525866", label: "公關",
    missionTitle: "公關媒體曝光計畫",
    missionDesc: "規劃 PR 故事框架、新聞稿節奏與媒體名單，建立品牌社會聲量。",
    workspace: "pr" },
  { emoji: "📧", color: "#7B5BC8", label: "電子報",
    missionTitle: "電子報內容規劃",
    missionDesc: "建立電子報主題曲線、開信率優化與訂閱者分眾。",
    workspace: "email" },
  { emoji: "✏️", color: "#2D323C", label: "自訂任務",
    missionTitle: "",
    missionDesc: "" },
  { emoji: "•••", color: "#9B9B9B", label: "顯示更多",
    missionTitle: "",
    missionDesc: "",
    isMore: true },
];

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, {
        refetchOnWindowFocus: false,
      })
    : null;

  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

  const [searchQ, setSearchQ] = useState("");
  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) =>
      (m.title ?? "").toLowerCase().includes(q) ||
      (m.description ?? "").toLowerCase().includes(q) ||
      (m.squadName ?? "").toLowerCase().includes(q) ||
      (m.workspace ?? "").toLowerCase().includes(q)
    );
  }, [rows, searchQ]);

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const createMission = trpc.mission.create.useMutation();
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingTpl, setCreatingTpl] = useState<string | null>(null);

  const startFromTile = async (t: QuickTile) => {
    if (t.isMore) {
      navigate("/methodology");
      return;
    }
    if (!t.missionTitle) {
      setShowCustom(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setCreatingTpl(t.label);
    try {
      const res = await createMission.mutateAsync({
        title: t.missionTitle,
        description: t.missionDesc || undefined,
        squadSlug: t.squadSlug,
        workspace: t.workspace ?? "",
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      const ws = t.workspace || "_";
      navigate(brandId ? `/b/${brandId}/${ws}/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
      setCreatingTpl(null);
    }
  };

  const submitCustom = async () => {
    setError(null);
    if (!customTitle.trim()) {
      setError("請輸入任務標題");
      return;
    }
    try {
      const res = await createMission.mutateAsync({
        title: customTitle.trim(),
        description: customDesc.trim() || undefined,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/_/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
    }
  };

  return (
    <main>
      {/* ─── Pastel gradient hero ─────────────────────────────────── */}
      <section
        className="px-8 pt-14 pb-10"
        style={{
          background:
            "linear-gradient(135deg, #E5F1FF 0%, #EDE5FF 35%, #F8E8FF 70%, #FFE5F5 100%)",
        }}
      >
        <div className="max-w-[1280px] mx-auto">
          <h1 className="text-center font-display text-[2.6rem] leading-[1.1] tracking-[-0.02em] text-mos-ink">
            你今天要做什麼<span style={{ color: "#5B3CC8" }}>任務</span>？
          </h1>

          {/* Search bar */}
          <div className="mt-7 max-w-[760px] mx-auto">
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[1.1rem] text-mos-muted pointer-events-none">
                🔍
              </span>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜尋方法論、任務模板與最近的項目"
                className="w-full pl-14 pr-5 py-4 text-[0.95rem] bg-white rounded-full border-2 border-[#7B5BC8]/40 focus:outline-none focus:border-[#5B3CC8] transition shadow-sm"
              />
            </div>
          </div>

          {/* Circular quick-start tiles */}
          <div className="mt-10 flex items-start justify-center gap-1 flex-wrap">
            {QUICK_TILES.map((t) => (
              <CircleTile
                key={t.label}
                tile={t}
                busy={creatingTpl === t.label}
                disabled={!!creatingTpl}
                onClick={() => startFromTile(t)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Below the hero: recent missions ──────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 py-10">
        {showCustom && (
          <CustomMissionForm
            title={customTitle}
            desc={customDesc}
            onTitleChange={setCustomTitle}
            onDescChange={setCustomDesc}
            onSubmit={submitCustom}
            onCancel={() => { setShowCustom(false); setError(null); }}
            busy={createMission.isPending}
            error={error}
          />
        )}
        {error && !showCustom && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-[0.82rem] text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-[1.4rem] text-mos-ink tracking-[-0.01em]">
            最近的任務
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/methodology")}
              className="px-3.5 py-1.5 text-[0.7rem] tracking-[0.12em] text-mos-muted hover:text-mos-ink transition"
            >
              方法論型錄 →
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <ThumbSkeleton key={i} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="border border-dashed border-mos-hair bg-white py-12 px-10 text-center text-[0.86rem] text-mos-muted">
            {searchQ ? `沒有找到「${searchQ}」相關的任務。` : "還沒有任務 — 從上方挑一個快速開始。"}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            {filteredRows.map((m) => (
              <MissionThumb
                key={m.id}
                mission={m}
                onClick={() => goToMission(m)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────── Circle tile ─────────────────────────── */

function CircleTile({
  tile, busy, disabled, onClick,
}: {
  tile: QuickTile;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex flex-col items-center gap-2",
        "w-[78px] py-2 px-1 rounded-lg transition",
        disabled && !busy ? "opacity-50 pointer-events-none" : "hover:bg-white/60",
      ].join(" ")}
    >
      <div className="relative">
        <div
          className={[
            "w-12 h-12 rounded-full flex items-center justify-center text-[1.4rem]",
            "transition-transform duration-200 group-hover:scale-110",
            busy ? "ring-2 ring-mos-ink ring-offset-2" : "",
          ].join(" ")}
          style={{
            background: tile.color,
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}
        >
          <span aria-hidden style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}>
            {tile.emoji}
          </span>
        </div>
        {tile.badge && (
          <span
            className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[0.52rem] tracking-[0.04em] text-white rounded-full"
            style={{ background: "#5B3CC8" }}
          >
            {tile.badge}
          </span>
        )}
      </div>
      <span className="text-[0.7rem] text-mos-ink leading-tight text-center">
        {tile.label}
      </span>
    </button>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({
  mission, onClick,
}: {
  mission: MissionRow;
  onClick: () => void;
}) {
  const lk: MosLayer | "L1" = ((mission.squadLayer ?? "L1").toString().slice(0, 2) as MosLayer);
  const tone = LAYER_TOKENS[lk in LAYER_TOKENS ? (lk as MosLayer) : "L1"];
  const wsEmoji = WORKSPACE_EMOJI[(mission.workspace ?? "").toLowerCase()] ?? "📋";
  const updatedTxt = formatRelative(mission.updatedAt);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left bg-white border border-mos-hair rounded-lg overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* thumbnail zone */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "4 / 3",
          background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}1A 100%)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[3rem] transition-transform duration-300 group-hover:scale-110">
          <span aria-hidden>{wsEmoji}</span>
        </div>
        {mission.squadLayer && (
          <div
            className="absolute top-2 left-2 px-1.5 py-0.5 text-[0.52rem] tracking-[0.18em] uppercase font-display text-white rounded"
            style={{ background: tone.bg }}
          >
            {lk}
          </div>
        )}
      </div>
      {/* footer */}
      <div className="p-3">
        <div className="text-[0.84rem] text-mos-ink font-medium leading-snug line-clamp-2 min-h-[2.4em]">
          {mission.title}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[0.65rem] text-mos-muted">
          <span aria-hidden>{wsEmoji}</span>
          <span className="truncate">{updatedTxt}</span>
        </div>
      </div>
    </button>
  );
}

const WORKSPACE_EMOJI: Record<string, string> = {
  facebook: "📘",
  instagram: "📷",
  linkedin: "💼",
  youtube: "🎬",
  pr: "📰",
  email: "📧",
  audience: "👥",
  campaign: "🚀",
  "brand-positioning": "🎯",
  strategy: "🧭",
  "": "📋",
};

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛編輯";
  if (min < 60) return `${min} 分鐘前編輯`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前編輯`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前編輯`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前編輯`;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });
}

/* ─────────────────────────── Skeleton + Custom form ─────────────── */

function ThumbSkeleton() {
  return (
    <div className="bg-white border border-mos-hair rounded-lg overflow-hidden animate-pulse">
      <div className="w-full bg-mos-hair/40" style={{ aspectRatio: "4 / 3" }} />
      <div className="p-3 space-y-1.5">
        <div className="h-3 w-4/5 bg-mos-hair/50" />
        <div className="h-2 w-2/5 bg-mos-hair/40" />
      </div>
    </div>
  );
}

function CustomMissionForm({
  title, desc, onTitleChange, onDescChange, onSubmit, onCancel, busy, error,
}: {
  title: string;
  desc: string;
  onTitleChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="mb-8 border border-mos-ink bg-white p-6 rounded-lg shadow-card">
      <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft mb-3">
        CUSTOM MISSION · 自訂任務
      </div>
      <label className="block">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務標題</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
          placeholder="例如：4 月 SoWork 自有 FB 經營"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded"
        />
      </label>
      <label className="block mt-4">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務說明（選填）</span>
        <textarea
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded"
        />
      </label>
      {error && (
        <div className="mt-3 text-[0.78rem] text-red-600 whitespace-pre-wrap">{error}</div>
      )}
      <div className="mt-5 flex gap-3 justify-end">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink transition disabled:opacity-40"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={busy || !title.trim()}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-not-allowed rounded"
        >
          {busy ? "建立中…" : "建立任務 →"}
        </button>
      </div>
    </div>
  );
}
