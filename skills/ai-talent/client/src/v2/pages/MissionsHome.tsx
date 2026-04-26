/**
 * MissionsHome — 任務牆 (v2 D4 — Canva-faithful, monochrome)
 *
 * Reference study: Canva home (2024–2026).
 *   ─ Pastel airy gradient hero, large display headline
 *   ─ Pill search bar with subtle purple accent
 *   ─ Quick-start row: small circular tiles, NEUTRAL (no colored icons),
 *     subtle dark glyph on white bg, hover reveals layer tint
 *   ─ Section header "為你推薦的範本" with horizontal scroll of preview cards
 *   ─ Section header "最近的項目" with filter chips, dense 6-col thumb grid
 *   ─ Generous whitespace, soft shadows, 8–12px radii throughout
 *
 * The previous version used solid-color circles with emoji which felt
 * cheap. This version is monochrome by default — restraint is the point.
 * Color appears only contextually (layer chips, hover tints, hero
 * gradient) to keep the interface feeling like an agency tool, not a
 * meme generator.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
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
  /** Short monogram or unicode glyph — stays monochrome on white. */
  glyph: string;
  label: string;
  /** Layer hint for hover tint only. */
  layer?: MosLayer;
  badge?: string;
  missionTitle: string;
  missionDesc: string;
  squadSlug?: string;
  workspace?: string;
  isMore?: boolean;
}

const QUICK_TILES: QuickTile[] = [
  { glyph: "f",   label: "Facebook",   layer: "L4",
    missionTitle: "Facebook 月度經營計畫",
    missionDesc: "為品牌規劃下一個月的 Facebook 內容主軸、貼文節奏與互動策略。",
    workspace: "facebook" },
  { glyph: "IG",  label: "Instagram",  layer: "L4",
    missionTitle: "Instagram 圖文系列企劃",
    missionDesc: "規劃 Instagram 連續貼文系列：視覺主題、文案結構、Hashtag、限動延伸。",
    workspace: "instagram" },
  { glyph: "in",  label: "LinkedIn",   layer: "L4",
    missionTitle: "LinkedIn 個人品牌經營",
    missionDesc: "以創辦人視角產出 B2B 思想領袖內容，建立信任與商機。",
    workspace: "linkedin" },
  { glyph: "▶",   label: "YouTube",    layer: "L4",
    missionTitle: "YouTube 頻道內容企劃",
    missionDesc: "規劃 YouTube 頻道主題、長影片企劃與短影音延伸。",
    workspace: "youtube" },
  { glyph: "品",  label: "品牌定位",   layer: "L1", badge: "推薦",
    missionTitle: "品牌定位重塑（12 原型）",
    missionDesc: "用 Carol Pearson 12 原型方法論梳理品牌個性與市場立足點。",
    squadSlug: "brand-archetype-positioning",
    workspace: "brand-positioning" },
  { glyph: "新",  label: "新品上市",   layer: "L5",
    missionTitle: "新品上市發表計畫",
    missionDesc: "依 Jeff Walker Product Launch Formula，規劃 4 階段發表節奏。",
    squadSlug: "plf-launch-formula",
    workspace: "campaign" },
  { glyph: "眾",  label: "受眾分析",   layer: "L3",
    missionTitle: "受眾洞察與分群",
    missionDesc: "用 STP 與 Persona Canvas 產出可操作的受眾分群與訊息切入。",
    workspace: "audience" },
  { glyph: "PR",  label: "公關",       layer: "L4",
    missionTitle: "公關媒體曝光計畫",
    missionDesc: "規劃 PR 故事框架、新聞稿節奏與媒體名單。",
    workspace: "pr" },
  { glyph: "✉",   label: "電子報",     layer: "L4",
    missionTitle: "電子報內容規劃",
    missionDesc: "建立電子報主題曲線、開信率優化與訂閱者分眾。",
    workspace: "email" },
  { glyph: "+",   label: "自訂任務",
    missionTitle: "",
    missionDesc: "" },
  { glyph: "···", label: "顯示更多",
    missionTitle: "",
    missionDesc: "",
    isMore: true },
];

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : null;
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  // Featured methodologies — fetched via squadTemplate.listByBrand and
  // truncated. Falls back gracefully if no brandId.
  const squadsQuery = (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

  // ── Featured templates: pick 8 strong squads, prefer L1/L5 + has steps
  const featured = useMemo(() => {
    const all = (squadsQuery.data as any[]) ?? [];
    const hasSteps = all.filter((s) => Array.isArray(s.steps) && s.steps.length > 0);
    const pool = hasSteps.length >= 8 ? hasSteps : all;
    const layerOrder = ["L1", "L5", "L3", "L2", "L4", "L6"];
    return [...pool]
      .sort((a, b) => {
        const la = (a.strategyLayer ?? "L9").slice(0, 2);
        const lb = (b.strategyLayer ?? "L9").slice(0, 2);
        return layerOrder.indexOf(la) - layerOrder.indexOf(lb);
      })
      .slice(0, 12);
  }, [squadsQuery.data]);

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
    if (t.isMore) { navigate("/methodology"); return; }
    if (!t.missionTitle) { setShowCustom(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
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
    if (!customTitle.trim()) { setError("請輸入任務標題"); return; }
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

  const startFromSquad = async (sq: any) => {
    setError(null);
    setCreatingTpl(`sq-${sq.slug}`);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || "";
      const res = await createMission.mutateAsync({
        title: `${sq.name ?? sq.slug}`,
        description: sq.description ?? undefined,
        squadSlug: sq.slug,
        workspace: ws,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/${ws || "_"}/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
      setCreatingTpl(null);
    }
  };

  return (
    <main>
      {/* ─── Pastel hero ──────────────────────────────────────────── */}
      <section
        className="px-8 pt-16 pb-12"
        style={{
          background:
            "linear-gradient(135deg, #EAF2FF 0%, #EFE9FB 35%, #F8E8FF 70%, #FFE9F1 100%)",
        }}
      >
        <div className="max-w-[1280px] mx-auto">
          <h1 className="text-center font-display text-[2.6rem] leading-[1.08] tracking-[-0.02em] text-mos-ink">
            你今天要做什麼<span style={{ color: "#5B3CC8" }}>任務</span>？
          </h1>
          <p className="mt-3 text-center text-[0.92rem] text-mos-muted max-w-[560px] mx-auto">
            選一個快速開始 — 我們會自動幫你填入任務說明、套用方法論與 squad。
          </p>

          {/* Search bar */}
          <div className="mt-8 max-w-[680px] mx-auto">
            <div className="relative">
              <svg
                className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-mos-muted pointer-events-none"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7.5" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜尋方法論、任務模板與最近的項目"
                className="w-full pl-14 pr-5 py-[14px] text-[0.92rem] bg-white rounded-full border border-[#5B3CC8]/30 focus:outline-none focus:border-[#5B3CC8] focus:ring-2 focus:ring-[#5B3CC8]/15 transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              />
            </div>
          </div>

          {/* Monochrome quick-start tiles */}
          <div className="mt-10 flex items-start justify-center gap-2 flex-wrap">
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

      {/* ─── Body sections ──────────────────────────────────────── */}
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
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-[0.82rem] text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Featured methodologies — horizontal scroll */}
        {featured.length > 0 && (
          <>
            <SectionHeader
              title="為你推薦的方法論"
              cta="完整型錄 →"
              onCtaClick={() => navigate("/methodology")}
            />
            <div className="-mx-2 mb-12 overflow-x-auto pb-2">
              <div className="flex gap-4 px-2" style={{ minWidth: "min-content" }}>
                {featured.map((sq: any) => (
                  <FeaturedSquadTile
                    key={sq.id ?? sq.slug}
                    squad={sq}
                    busy={creatingTpl === `sq-${sq.slug}`}
                    disabled={!!creatingTpl}
                    onClick={() => startFromSquad(sq)}
                    onPreview={() => navigate(`/methodology/${sq.slug}`)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Recent missions */}
        <SectionHeader
          title="最近的項目"
          cta={searchQ ? "" : "全部任務 →"}
          onCtaClick={() => {/* future: navigate to all-missions */}}
        />
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ThumbSkeleton key={i} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="border border-dashed border-mos-hair bg-white py-12 px-10 text-center text-[0.86rem] text-mos-muted rounded-lg">
            {searchQ ? `沒有找到「${searchQ}」相關的項目。` : "還沒有任務 — 從上方挑一個快速開始。"}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {filteredRows.map((m) => (
              <MissionThumb key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────── Section header ─────────────────────────── */

function SectionHeader({
  title, cta, onCtaClick,
}: { title: string; cta?: string; onCtaClick?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-display text-[1.32rem] text-mos-ink tracking-[-0.01em]">{title}</h2>
      {cta && (
        <button
          onClick={onCtaClick}
          className="text-[0.74rem] tracking-[0.06em] text-mos-muted hover:text-mos-ink transition"
        >
          {cta}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────── Quick-start circle (monochrome) ───────── */

function CircleTile({
  tile, busy, disabled, onClick,
}: {
  tile: QuickTile;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = tile.layer ? LAYER_TOKENS[tile.layer] : null;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex flex-col items-center gap-2",
        "w-[78px] py-2 px-1 rounded-lg transition",
        disabled && !busy ? "opacity-40 pointer-events-none" : "",
      ].join(" ")}
    >
      <div className="relative">
        <div
          className={[
            "w-[52px] h-[52px] rounded-full flex items-center justify-center",
            "bg-white border border-mos-hair text-mos-ink",
            "transition-all duration-200",
            "group-hover:border-mos-ink group-hover:scale-105 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
            busy ? "ring-2 ring-mos-ink ring-offset-2" : "",
          ].join(" ")}
          style={{
            // hover tint via inline so we can use layer color subtly
            ["--hoverBg" as any]: tone ? tone.bgTint : "#F4F4F4",
          }}
        >
          <span
            className="font-display text-[0.95rem] tracking-[-0.02em]"
            style={{
              fontFeatureSettings: '"ss01"',
              letterSpacing: tile.glyph.length > 1 ? "0.02em" : "0",
            }}
          >
            {tile.glyph}
          </span>
        </div>
        {tile.badge && (
          <span
            className="absolute -top-1 -right-1 px-1.5 py-[1px] text-[0.5rem] tracking-[0.04em] text-white rounded-full"
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

/* ─────────────────────────── Featured squad tile ───────────────────── */

function FeaturedSquadTile({
  squad, busy, disabled, onClick, onPreview,
}: {
  squad: any;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  onPreview: () => void;
}) {
  const lk = ((squad.strategyLayer ?? "L1").toString().slice(0, 2)) as MosLayer;
  const tone = LAYER_TOKENS[lk in LAYER_TOKENS ? lk : "L1"];
  const author =
    squad.methodology?.author
      ? `${squad.methodology.author}${squad.methodology?.year ? " · " + squad.methodology.year : ""}`
      : null;
  const stepCount =
    Array.isArray(squad.steps) ? squad.steps.length : (squad.stepCount ?? 0);

  return (
    <div className="w-[240px] shrink-0 group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={[
          "relative w-full bg-white border border-mos-hair rounded-xl overflow-hidden",
          "transition-all duration-200 text-left",
          "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:border-mos-ink/50",
          disabled && !busy ? "opacity-40 pointer-events-none" : "",
        ].join(" ")}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "5 / 3" }}
        >
          {squad.heroImageUrl ? (
            <img src={squad.heroImageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}1A 100%)`,
              }}
            >
              <MethodologyGlyph
                seed={squad.slug ?? squad.id ?? squad.name}
                layer={lk}
                size={92}
              />
            </div>
          )}
          <div
            className="absolute top-2 left-2 px-1.5 py-[2px] text-[0.52rem] tracking-[0.18em] uppercase font-display text-white rounded"
            style={{ background: tone.bg }}
          >
            {lk} · {tone.shortLabel}
          </div>
          {busy && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="text-[0.7rem] tracking-[0.16em] uppercase text-mos-ink">建立中…</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-[0.86rem] text-mos-ink font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {squad.name ?? squad.slug}
          </div>
          {author && (
            <div className="mt-1 text-[0.66rem] text-mos-muted line-clamp-1">
              {author}
            </div>
          )}
          <div className="mt-2 text-[0.62rem] text-mos-soft tracking-[0.06em]">
            {stepCount} steps
          </div>
        </div>
      </button>
      <button
        onClick={onPreview}
        disabled={disabled}
        className="mt-1.5 w-full text-[0.66rem] text-mos-muted hover:text-mos-ink transition py-1"
      >
        預覽方法論 →
      </button>
    </div>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left bg-white border border-mos-hair rounded-xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200"
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "4 / 3",
          background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}14 100%)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <MethodologyGlyph
            seed={mission.squadSlug ?? mission.id}
            layer={lk}
            size={64}
          />
        </div>
        {mission.squadLayer && (
          <div
            className="absolute top-2 left-2 px-1.5 py-[2px] text-[0.52rem] tracking-[0.18em] uppercase font-display text-white rounded"
            style={{ background: tone.bg }}
          >
            {lk}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-[0.82rem] text-mos-ink font-medium leading-snug line-clamp-2 min-h-[2.4em]">
          {mission.title}
        </div>
        <div className="mt-1 text-[0.65rem] text-mos-muted line-clamp-1">
          {updatedTxt}
        </div>
      </div>
    </button>
  );
}

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
    <div className="bg-white border border-mos-hair rounded-xl overflow-hidden animate-pulse">
      <div className="w-full bg-mos-hair/40" style={{ aspectRatio: "4 / 3" }} />
      <div className="p-3 space-y-1.5">
        <div className="h-3 w-4/5 bg-mos-hair/50 rounded" />
        <div className="h-2 w-2/5 bg-mos-hair/40 rounded" />
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
    <div className="mb-8 border border-mos-ink bg-white p-6 rounded-xl shadow-card">
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
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded-lg"
        />
      </label>
      <label className="block mt-4">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務說明（選填）</span>
        <textarea
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink rounded-lg"
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
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
        >
          {busy ? "建立中…" : "建立任務 →"}
        </button>
      </div>
    </div>
  );
}
