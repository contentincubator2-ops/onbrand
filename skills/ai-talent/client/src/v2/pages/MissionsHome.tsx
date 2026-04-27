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
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
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
  /** Open CreateMethodologyModal instead of creating a mission. */
  opensIngest?: SourceId;
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
    missionDesc: "用 Carol Pearson 12 原型任務範本梳理品牌個性與市場立足點。",
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
  { glyph: "☁",   label: "上傳",
    missionTitle: "",
    missionDesc: "",
    opensIngest: "upload" },
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

  // ── Layer filter for featured strip
  const [selectedLayer, setSelectedLayer] = useState<MosLayer | "ALL">("ALL");

  const allSquads = useMemo(
    () => ((squadsQuery.data as any[]) ?? []).filter((s) => Array.isArray(s.steps) && s.steps.length > 0),
    [squadsQuery.data],
  );

  // Count squads per layer (for nav badges)
  const layerCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: allSquads.length, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
    for (const s of allSquads) {
      const k = (s.strategyLayer ?? "").toString().slice(0, 2);
      if (k in c) c[k]++;
    }
    return c;
  }, [allSquads]);

  // Featured: filter by selected layer, then sort, then slice
  const featured = useMemo(() => {
    const layerOrder = ["L1", "L2", "L3", "L4", "L5", "L6"];
    const filtered =
      selectedLayer === "ALL"
        ? allSquads
        : allSquads.filter((s) => (s.strategyLayer ?? "").toString().slice(0, 2) === selectedLayer);
    return [...filtered]
      .sort((a, b) => {
        const la = (a.strategyLayer ?? "L9").slice(0, 2);
        const lb = (b.strategyLayer ?? "L9").slice(0, 2);
        return layerOrder.indexOf(la) - layerOrder.indexOf(lb);
      })
      .slice(0, selectedLayer === "ALL" ? 12 : 24);
  }, [allSquads, selectedLayer]);

  const [searchQ, setSearchQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"mine" | "all">("mine");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter((m) =>
        (m.title ?? "").toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        (m.squadName ?? "").toLowerCase().includes(q) ||
        (m.workspace ?? "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      r = r.filter((m) => (m.workspace ?? "").toLowerCase() === typeFilter);
    }
    r = [...r].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortDesc ? tb - ta : ta - tb;
    });
    return r;
  }, [rows, searchQ, typeFilter, sortDesc]);

  // Build the type filter dropdown options from actual data
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { if (m.workspace) set.add(m.workspace.toLowerCase()); });
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

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
  const [createSource, setCreateSource] = useState<SourceId | null>(null);

  const startFromTile = async (t: QuickTile) => {
    if (t.isMore) { navigate("/templates"); return; }
    if (t.opensIngest) { setCreateSource(t.opensIngest); return; }
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
      {/* ─── Cream hero (SoWork Monocle palette) ──────────────────── */}
      <section
        className="relative px-8 pt-16 pb-12 border-b border-mos-hair"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, #FFF7ED 0%, #FAF9F6 45%, #F5F1E8 100%)",
        }}
      >
        {/* Top-right CTAs */}
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <button
            onClick={() => navigate("/templates")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[0.78rem] bg-white hover:bg-mos-cream-dark border border-mos-hair hover:border-mos-ink rounded-sm transition"
          >
            <span aria-hidden className="text-mos-orange">✦</span>
            <span className="text-mos-ink">瀏覽方法論型錄</span>
          </button>
          <button
            onClick={() => setCreateSource("recommended")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.78rem] bg-mos-orange hover:bg-mos-orange-hover text-white rounded-sm transition"
          >
            <span aria-hidden>→</span>
            <span className="font-medium">立即開新任務</span>
          </button>
        </div>

        <div className="max-w-[1280px] mx-auto">
          <div className="text-center">
            <div className="inline-block font-display text-[0.7rem] tracking-[0.32em] uppercase text-mos-orange mb-4">
              SoWork · Marketing OS
            </div>
            <h1 className="font-display text-[2.4rem] leading-[1.1] tracking-[-0.025em] text-mos-ink">
              今天，把哪一個<span className="text-mos-orange">方法論</span>變成成果？
            </h1>
            <p className="mt-3 text-[0.92rem] text-mos-muted max-w-[560px] mx-auto leading-relaxed">
              100+ 行銷方法論小組，按 6 層策略分工。挑一層、選一個、開工。
            </p>
          </div>

          {/* Search bar */}
          <div className="mt-7 max-w-[680px] mx-auto">
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
                placeholder="搜尋方法論、任務、最近的工作"
                className="w-full pl-14 pr-5 py-[14px] text-[0.92rem] bg-white rounded-sm border border-mos-hair focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 transition"
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

        {/* Featured methodologies — layer nav + horizontal scroll */}
        {allSquads.length > 0 && (
          <>
            <SectionHeader
              title={
                selectedLayer === "ALL"
                  ? "為你推薦的方法論小組"
                  : `${selectedLayer} · ${LAYER_TOKENS[selectedLayer].label} · ${layerCounts[selectedLayer]} 個方法論`
              }
              cta="完整型錄 →"
              onCtaClick={() => navigate("/templates")}
            />

            {/* L1–L6 layer chip nav */}
            <LayerNav
              selected={selectedLayer}
              counts={layerCounts}
              onSelect={setSelectedLayer}
            />

            {featured.length > 0 ? (
              <div className="-mx-2 mb-12 overflow-x-auto pb-2">
                <div className="flex gap-4 px-2" style={{ minWidth: "min-content" }}>
                  {featured.map((sq: any) => (
                    <FeaturedSquadTile
                      key={sq.id ?? sq.slug}
                      squad={sq}
                      busy={creatingTpl === `sq-${sq.slug}`}
                      disabled={!!creatingTpl}
                      onClick={() => startFromSquad(sq)}
                      onPreview={() => navigate(`/templates/${sq.slug}`)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-12 border border-dashed border-mos-hair bg-white py-10 px-6 text-center text-[0.84rem] text-mos-muted rounded-sm">
                這一層暫時沒有方法論小組。試試其他層級。
              </div>
            )}
          </>
        )}

        {/* Recent missions — header + filter chips */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="font-display text-[1.32rem] text-mos-ink tracking-[-0.01em]">
            最近的任務
          </h2>
          <div className="flex items-center gap-2">
            <FilterChip
              label={ownerFilter === "mine" ? "擁有者" : "全部"}
              onClick={() => setOwnerFilter((v) => (v === "mine" ? "all" : "mine"))}
            />
            <FilterChip
              label={typeFilter === "all" ? "任何類型" : typeFilter}
              options={typeOptions.map((t) => ({
                value: t,
                label: t === "all" ? "任何類型" : t,
              }))}
              onSelect={(v) => setTypeFilter(v)}
            />
            <IconButton
              title={sortDesc ? "新→舊" : "舊→新"}
              onClick={() => setSortDesc((v) => !v)}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4v16M7 4l-3 3M7 4l3 3" />
                <path d="M17 20V4M17 20l-3-3M17 20l3-3" style={{ opacity: sortDesc ? 1 : 0.4 }} />
              </svg>
            </IconButton>
            <IconButton
              title={viewMode === "grid" ? "切換為列表" : "切換為網格"}
              onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
            >
              {viewMode === "grid" ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="7" rx="1" />
                  <rect x="13" y="4" width="7" height="7" rx="1" />
                  <rect x="4" y="13" width="7" height="7" rx="1" />
                  <rect x="13" y="13" width="7" height="7" rx="1" />
                </svg>
              )}
            </IconButton>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ThumbSkeleton key={i} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="border border-dashed border-mos-hair bg-white py-12 px-10 text-center text-[0.86rem] text-mos-muted rounded-lg">
            {searchQ ? `沒有找到「${searchQ}」相關的項目。` : "還沒有任務 — 從上方挑一個快速開始。"}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {filteredRows.map((m) => (
              <MissionThumb key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-mos-hair border border-mos-hair rounded-lg overflow-hidden bg-white">
            {filteredRows.map((m) => (
              <MissionListRow key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        )}
      </section>

      {/* ─── Create-methodology modal (Canva-style source picker) ── */}
      <CreateMethodologyModal
        open={createSource !== null}
        initialSource={createSource ?? "recommended"}
        onClose={() => setCreateSource(null)}
        onCreated={(slug) => {
          setCreateSource(null);
          navigate(`/templates/${slug}`);
        }}
      />
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

/* ─────────────────────────── Layer nav (L1–L6 chips) ──────────────── */

function LayerNav({
  selected, counts, onSelect,
}: {
  selected: MosLayer | "ALL";
  counts: Record<string, number>;
  onSelect: (l: MosLayer | "ALL") => void;
}) {
  const layers: Array<MosLayer | "ALL"> = ["ALL", "L1", "L2", "L3", "L4", "L5", "L6"];
  return (
    <div className="-mt-2 mb-5 flex items-center gap-1.5 flex-wrap">
      {layers.map((l) => {
        const isAll = l === "ALL";
        const tone = isAll ? null : LAYER_TOKENS[l as MosLayer];
        const active = selected === l;
        return (
          <button
            key={l}
            onClick={() => onSelect(l)}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border transition",
              "text-[0.74rem]",
              active
                ? "bg-mos-ink text-white border-mos-ink"
                : "bg-white text-mos-ink border-mos-hair hover:border-mos-ink",
            ].join(" ")}
          >
            {!isAll && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: active ? "#fff" : tone!.bg }}
              />
            )}
            <span className="font-display tracking-[0.04em]">
              {isAll ? "全部" : `${l} · ${tone!.label}`}
            </span>
            <span
              className={[
                "ml-0.5 text-[0.66rem] tabular-nums",
                active ? "text-white/70" : "text-mos-muted",
              ].join(" ")}
            >
              {counts[l] ?? 0}
            </span>
          </button>
        );
      })}
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
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];

  // Block 1: 方法論 — graceful fallback chain (no "尚未設定")
  //   1. methodology.author (best — explicit author from JSON)
  //   2. format methodology slug as Title Case ("obviously-awesome" → "Obviously Awesome")
  //   3. lead 名稱 as last resort
  const formatSlug = (s: string) =>
    s.replace(/[-_]+/g, " ")
     .split(" ")
     .filter(Boolean)
     .map((w) => /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
     .join(" ");
  const methodologyText = (() => {
    if (squad.methodology?.author) {
      const yr = squad.methodology?.year ? ` · ${squad.methodology.year}` : "";
      return `${squad.methodology.author}${yr}`;
    }
    const summary = squad.methodology?.summary;
    if (typeof summary === "string" && summary.trim()) {
      // summary is usually the slug (e.g. "obviously-awesome")
      return formatSlug(summary.trim());
    }
    if (squad.lead?.name) return `領隊 · ${squad.lead.name}`;
    return null;
  })();

  // Block 2: 描述 — squad.description, or fallback to step count + member count
  const stepCount =
    Array.isArray(squad.steps) ? squad.steps.length : (squad.stepCount ?? 0);
  const memberCount =
    Array.isArray(squad.members) ? squad.members.length : 0;
  const descriptionText = (() => {
    if (squad.description && String(squad.description).trim()) return squad.description;
    const parts: string[] = [];
    if (stepCount) parts.push(`${stepCount} 個工作步驟`);
    if (memberCount) parts.push(`${memberCount} 位成員`);
    return parts.length ? parts.join("、") : null;
  })();

  const nameStr = (squad.name ?? squad.slug ?? "?").toString();
  const initial = nameStr.charAt(0).toUpperCase();

  return (
    <div className="w-[300px] shrink-0">
      <div
        onClick={disabled ? undefined : onClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) onClick(); }}
        className={[
          "relative overflow-hidden rounded-lg bg-white cursor-pointer",
          "border border-mos-ink hover:shadow-lg transition-shadow",
          disabled && !busy ? "opacity-40 pointer-events-none" : "",
        ].join(" ")}
      >
        {/* 卡片頂部 */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* 實體圖標 */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
                style={{ background: tone.bg }}
              >
                {initial}
              </div>

              {/* 實體名稱 + 層級 badge */}
              <div className="min-w-0">
                <h3 className="font-semibold text-base leading-tight line-clamp-1 text-mos-ink">
                  {nameStr}
                </h3>
                <span
                  className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[0.62rem] font-semibold tracking-[0.06em] text-white"
                  style={{ background: tone.bg }}
                >
                  {lk}・{tone.label}
                </span>
              </div>
            </div>

            {/* 預覽按鈕（v2 原本是刪除位） */}
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              disabled={disabled}
              aria-label="預覽工作流"
              className="text-gray-400 hover:text-mos-orange p-1 -mr-1 -mt-1 shrink-0 inline-flex items-center justify-center rounded hover:bg-gray-50 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>

          {/* 內容區塊（v2 風：白底 + 細黑邊） */}
          <div className="space-y-3">
            {/* 方法論 */}
            <div className="p-3 rounded-md border border-mos-ink bg-white">
              <div className="text-[0.7rem] font-semibold text-mos-muted mb-1">
                方法論
              </div>
              <div className="text-sm text-mos-ink line-clamp-1">
                {methodologyText ?? "—"}
              </div>
            </div>

            {/* 描述 */}
            <div className="p-3 rounded-md border border-mos-ink bg-white">
              <div className="text-[0.7rem] font-semibold text-mos-muted mb-1">
                描述
              </div>
              <div className="text-sm text-mos-ink line-clamp-3 leading-snug">
                {descriptionText ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {busy && (
          <div className="absolute inset-0 bg-white/85 flex items-center justify-center pointer-events-none">
            <span className="text-[0.7rem] tracking-[0.16em] uppercase text-mos-ink">建立中…</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const isLayerKnown = layerStr in LAYER_TOKENS;
  const lk = (isLayerKnown ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  const stepCount = mission.squadStepCount ?? 0;

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className="flex flex-col text-left bg-white border border-mos-hair rounded-sm overflow-hidden hover:border-mos-ink hover:-translate-y-0.5 transition-all duration-200 w-full"
      >
        {/* Layer color band (top edge) */}
        {isLayerKnown && (
          <div className="h-1 w-full" style={{ background: tone.bg }} />
        )}
        <div
          className="relative w-full overflow-hidden border-b border-mos-hair"
          style={{
            aspectRatio: "5 / 4",
            background: `linear-gradient(135deg, ${tone.bgTint} 0%, #FAF9F6 100%)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph
              seed={mission.squadSlug ?? mission.id}
              layer={lk}
              size={70}
            />
          </div>
          {isLayerKnown && (
            <div
              className="absolute top-2 left-2 px-1.5 py-[2px] text-[0.6rem] tracking-[0.06em] font-display text-white rounded-sm"
              style={{ background: tone.bg }}
            >
              {lk}・{tone.label}
            </div>
          )}
          {stepCount > 0 && (
            <div className="absolute top-2 right-2 px-1.5 py-[2px] text-[0.56rem] tabular-nums tracking-[0.04em] bg-white/85 text-mos-ink border border-mos-hair rounded-sm">
              {stepCount} 步
            </div>
          )}
        </div>
        <div className="p-3 bg-mos-cream">
          <div className="text-[0.84rem] text-mos-ink font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {mission.title}
          </div>
          {mission.squadName && (
            <div className="mt-1 text-[0.64rem] text-mos-orange truncate tracking-[0.02em]">
              {mission.squadName}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 text-[0.64rem] text-mos-muted">
            {wsBadge && (
              <span
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[0.5rem] font-bold shrink-0"
                style={{ background: wsBadge.color }}
                aria-label={ws}
              >
                {wsBadge.glyph}
              </span>
            )}
            <span className="truncate">{updatedTxt}</span>
          </div>
        </div>
      </button>
      {/* Hover action — bookmark + ⋯ menu (Canva pattern) */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <ThumbAction title="收藏" onClick={(e) => { e.stopPropagation(); /* TODO: bookmark */ }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </ThumbAction>
        <ThumbAction title="更多" onClick={(e) => { e.stopPropagation(); /* TODO: menu */ }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </ThumbAction>
      </div>
    </div>
  );
}

function ThumbAction({
  title, onClick, children,
}: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center bg-white/95 border border-mos-hair text-mos-ink hover:bg-white hover:border-mos-ink rounded-full shadow-sm transition"
    >
      {children}
    </button>
  );
}

function MissionListRow({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 hover:bg-mos-ink/[0.02] transition text-left"
    >
      <div
        className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}14 100%)` }}
      >
        <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.88rem] text-mos-ink font-medium truncate">{mission.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-mos-muted">
          <span className="font-display tracking-[0.12em] uppercase">{lk}</span>
          {wsBadge && (
            <>
              <span className="text-mos-soft">·</span>
              <span className="capitalize">{ws}</span>
            </>
          )}
          <span className="text-mos-soft">·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
      {wsBadge && (
        <span
          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[0.6rem] font-bold"
          style={{ background: wsBadge.color }}
        >
          {wsBadge.glyph}
        </span>
      )}
    </button>
  );
}

const WORKSPACE_BADGE: Record<string, { glyph: string; color: string }> = {
  facebook:  { glyph: "f",  color: "#1877F2" },
  instagram: { glyph: "ig", color: "#E4405F" },
  linkedin:  { glyph: "in", color: "#0A66C2" },
  youtube:   { glyph: "▶",  color: "#FF0000" },
  pr:        { glyph: "PR", color: "#525866" },
  email:     { glyph: "@",  color: "#7B5BC8" },
  audience:  { glyph: "眾", color: "#E07B0F" },
  campaign:  { glyph: "→",  color: "#1A9B8E" },
  "brand-positioning": { glyph: "品", color: "#5B3CC8" },
};

/* ─────────────────────────── Filter chip + Icon button ─────────────── */

function FilterChip({
  label, options, onClick, onSelect,
}: {
  label: string;
  options?: Array<{ value: string; label: string }>;
  onClick?: () => void;
  onSelect?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDropdown = !!options;

  if (!isDropdown) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.74rem] text-mos-ink bg-white border border-mos-hair hover:border-mos-ink rounded-full transition"
      >
        {label}
        <svg viewBox="0 0 24 24" className="w-3 h-3 text-mos-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.74rem] text-mos-ink bg-white border border-mos-hair hover:border-mos-ink rounded-full transition capitalize"
      >
        {label}
        <svg viewBox="0 0 24 24" className="w-3 h-3 text-mos-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 right-0 z-20 min-w-[160px] bg-white border border-mos-hair rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1">
            {options!.map((o) => (
              <button
                key={o.value}
                onClick={() => { onSelect?.(o.value); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[0.78rem] text-mos-ink hover:bg-mos-ink/5 transition capitalize"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  title, onClick, children,
}: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-9 h-9 inline-flex items-center justify-center bg-white border border-mos-hair hover:border-mos-ink text-mos-ink rounded-full transition"
    >
      {children}
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
