/**
 * MethodologyCatalog — Canva-style 範本 page.
 *
 * Mirrors Canva's templates page layout:
 *   1. Pastel gradient hero (green → purple → pink) with centered title
 *   2. Big rounded search bar
 *   3. 3 quick filter pills (品牌策略 / 內容行銷 / 商業驗證)
 *   4. "探索任務範本" section — horizontal-scroll pastel category cards
 *      (one per strategy layer L1–L6)
 *   5. "為你推薦" section — actual squad grid filtered by category
 *
 * Click a card → /templates/:slug detail page.
 */
import React, { useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import CreateMethodologyModal from "../components/methodology/CreateMethodologyModal";
import type { MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type SourceFilter = "all" | "seeded" | "ingested" | "forked" | "mine";

type LayerCard = {
  layer: MosLayer;
  label: string;
  hint: string;
  bg: string;        // pastel bg
  glyph: string;     // emoji-like illustration
  glyphBg: string;   // illustration tile bg
};

const LAYER_CARDS: LayerCard[] = [
  { layer: "L1", label: "品牌策略",   hint: "定位、原型、敘事",        bg: "#FCE7DD", glyph: "🎯", glyphBg: "#F5C9B0" },
  { layer: "L2", label: "產品策略",   hint: "JTBD、價值主張、上市",     bg: "#E4DCF5", glyph: "📦", glyphBg: "#C7B7EA" },
  { layer: "L3", label: "受眾策略",   hint: "STP、Persona、分眾",       bg: "#DEF1EE", glyph: "👥", glyphBg: "#A8D9D2" },
  { layer: "L4", label: "通路策略",   hint: "FB / IG / YT / LinkedIn",  bg: "#FCE0EA", glyph: "📣", glyphBg: "#F0B5C8" },
  { layer: "L5", label: "活動策略",   hint: "上市、Launch、Event",      bg: "#FAF1D9", glyph: "🎪", glyphBg: "#EAD89A" },
  { layer: "L6", label: "商業驗證",   hint: "監測、稽核、校準",         bg: "#DCEAF7", glyph: "📈", glyphBg: "#A8C8E8" },
];

type QuickPill = { id: string; label: string; glyph: string; bg: string; layers: MosLayer[] };
const QUICK_PILLS: QuickPill[] = [
  { id: "brand",   label: "品牌策略", glyph: "🎯", bg: "#F5C9B0", layers: ["L1"] },
  { id: "content", label: "內容行銷", glyph: "📣", bg: "#F0B5C8", layers: ["L4", "L5"] },
  { id: "validate",label: "商業驗證", glyph: "📈", bg: "#A8C8E8", layers: ["L6"] },
];

export default function MethodologyCatalog() {
  const navigate = useNavigate();
  const { brandId } = useOutletContext<ShellOutletCtx>();
  const utils = trpc.useUtils?.() ?? (trpc as any).useContext?.();

  const squadsQuery = (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [], isLoading: false, refetch: () => {} };

  const mineQuery = (trpc as any).methodology.listMine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const squads: any[] = (squadsQuery.data as any[]) ?? [];
  const mine: any[] = (mineQuery.data as any[]) ?? [];

  const [layerFilter, setLayerFilter] = useState<MosLayer | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [searchQ, setSearchQ] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const exploreRef = useRef<HTMLDivElement>(null);

  const merged = useMemo(() => {
    if (sourceFilter === "mine") return mine;
    let pool = squads;
    if (sourceFilter !== "all") pool = pool.filter((s) => (s.source ?? "seeded") === sourceFilter);
    return pool;
  }, [squads, mine, sourceFilter]);

  const filtered = useMemo(() => {
    let pool = merged;
    if (layerFilter) {
      pool = pool.filter((s) => {
        const layerStr = String(s.strategyLayer ?? s.strategy_layer ?? "").toUpperCase();
        return layerStr.includes(layerFilter);
      });
    }
    const q = searchQ.trim().toLowerCase();
    if (q) {
      pool = pool.filter((s) => {
        const hay = `${s.name ?? ""} ${s.slug ?? ""} ${s.description ?? ""} ${s.methodology?.author ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return pool;
  }, [merged, layerFilter, searchQ]);

  const onPickLayer = (l: MosLayer) => {
    setLayerFilter((curr) => (curr === l ? null : l));
    setTimeout(() => {
      const el = document.getElementById("recommended-section");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const onScrollExplore = (dir: 1 | -1) => {
    exploreRef.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  };

  return (
    <main className="pb-16">
      {/* ─── HERO (Canva-style pastel gradient) ─────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #C8E8DA 0%, #DDD5F2 45%, #F5D5E2 100%)",
        }}
      >
        {/* CTAs top-right */}
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[0.78rem] bg-white/90 hover:bg-white border border-divider rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <span aria-hidden style={{ color: "#5B3CC8" }}>✦</span>
            <span className="text-foreground">先睹為快</span>
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.78rem] text-white rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            style={{ background: "#5B3CC8" }}
          >
            <span aria-hidden>👑</span>
            <span>+ 從網路新增任務範本</span>
          </button>
        </div>

        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-14">
          {/* Big title */}
          <h1 className="text-center font-semibold text-[3.2rem] leading-[1.05] text-foreground tracking-[-0.02em]">
            任務範本
          </h1>

          {/* Search bar */}
          <div className="mt-8 max-w-[680px] mx-auto">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-default-500"
                fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜尋數百個任務範本"
                className="w-full pl-14 pr-5 py-[14px] text-[0.92rem] bg-white rounded-full border border-[#5B3CC8]/30 focus:outline-none focus:border-[#5B3CC8] focus:ring-2 focus:ring-[#5B3CC8]/15 transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              />
            </div>
          </div>

          {/* Quick filter pills */}
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            {QUICK_PILLS.map((p) => {
              const active = p.layers.length === 1 && layerFilter === p.layers[0];
              return (
                <button
                  key={p.id}
                  onClick={() => onPickLayer(p.layers[0])}
                  className={[
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full transition border",
                    active
                      ? "bg-foreground text-white border-foreground shadow-[0_2px_6px_rgba(0,0,0,0.10)]"
                      : "bg-white/95 hover:bg-white text-foreground border-white/0 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)]",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[0.7rem]"
                    style={{ background: p.bg }}
                  >
                    {p.glyph}
                  </span>
                  <span className="text-[0.84rem]">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── EXPLORE — pastel category cards ────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-12">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-semibold text-[1.5rem] text-foreground tracking-[-0.015em]">
            探索任務範本
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onScrollExplore(-1)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-divider bg-white hover:border-foreground transition"
              aria-label="向左捲動"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button
              onClick={() => onScrollExplore(1)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-divider bg-white hover:border-foreground transition"
              aria-label="向右捲動"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>

        <div
          ref={exploreRef}
          className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x scrollbar-thin"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {LAYER_CARDS.map((c) => {
            const active = layerFilter === c.layer;
            return (
              <button
                key={c.layer}
                onClick={() => onPickLayer(c.layer)}
                className={[
                  "shrink-0 snap-start relative rounded-2xl text-left transition overflow-hidden",
                  "w-[260px] h-[120px] flex items-center justify-between px-5 py-4",
                  active
                    ? "ring-2 ring-foreground shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
                    : "hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]",
                ].join(" ")}
                style={{ background: c.bg }}
              >
                <div>
                  <div className="text-[0.58rem] tracking-[0.28em] uppercase text-default-400">
                    {c.layer}
                  </div>
                  <div className="mt-1 font-semibold text-[1.1rem] text-foreground tracking-[-0.01em]">
                    {c.label}
                  </div>
                  <div className="mt-1 text-[0.7rem] text-default-500">
                    {c.hint}
                  </div>
                </div>
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-[1.8rem]"
                  style={{ background: c.glyphBg }}
                  aria-hidden
                >
                  {c.glyph}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── RECOMMENDED grid ───────────────────────────────────────────── */}
      <section id="recommended-section" className="max-w-[1280px] mx-auto px-8 mt-14">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-semibold text-[1.5rem] text-foreground tracking-[-0.015em]">
              {layerFilter
                ? `${LAYER_CARDS.find((c) => c.layer === layerFilter)?.label} · 任務範本`
                : "為你推薦的任務範本"}
            </h2>
            <div className="mt-1 text-[0.78rem] text-default-500">
              每張卡片都是已配好 squad、可立即套用的任務範本。
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                ["all", "全部"],
                ["seeded", "預設"],
                ["ingested", "已收錄"],
                ["forked", "Fork"],
                ["mine", "我的"],
              ] as Array<[SourceFilter, string]>
            ).map(([val, label]) => (
              <FilterChip
                key={val}
                active={sourceFilter === val}
                onClick={() => setSourceFilter(val)}
              >
                {label}
              </FilterChip>
            ))}
            {layerFilter && (
              <button
                onClick={() => setLayerFilter(null)}
                className="ml-1 px-3 py-1.5 text-[0.7rem] tracking-[0.16em] uppercase text-default-500 hover:text-foreground"
              >
                清除分類 ✕
              </button>
            )}
          </div>
        </div>

        {squadsQuery.isLoading && sourceFilter !== "mine" && (
          <div className="text-[0.82rem] text-default-500 py-10">載入任務範本中…</div>
        )}
        {sourceFilter === "mine" && mineQuery.isLoading && (
          <div className="text-[0.82rem] text-default-500 py-10">載入我的任務範本中…</div>
        )}

        {!squadsQuery.isLoading && filtered.length === 0 && (
          <div className="text-[0.82rem] text-default-500 py-10">沒有符合的任務範本。</div>
        )}

        <div className="flex flex-wrap gap-6">
          {filtered.map((s, i) => {
            const lead = s.lead?.name ?? s.leadName ?? "Squad Lead";
            const stepObjs = Array.isArray(s.steps) ? s.steps : [];
            const stepRows = stepObjs.slice(0, 4).map((st: any, idx: number) => ({
              name: st.name ?? `Step ${idx + 1}`,
              desc: st.requiredSkill ?? st.outputType ?? "",
              glyph: `0${idx + 1}`,
            }));
            const author = s.methodology?.author
              ? `${s.methodology.author}${s.methodology?.year ? " · " + s.methodology.year : ""}`
              : s.ingestSourceUrl
              ? (() => { try { return new URL(s.ingestSourceUrl).hostname; } catch { return null; } })()
              : null;

            return (
              <MethodologyCard
                key={s.id ?? s.slug ?? i}
                layer={s.strategyLayer ?? s.tier ?? null}
                seed={s.slug ?? s.id ?? i}
                heroImageUrl={s.heroImageUrl ?? null}
                title={s.name ?? s.slug}
                author={author}
                source={s.source ?? "seeded"}
                steps={stepRows}
                leadName={lead}
                ctaLabel="套用"
                onCtaClick={() => navigate(`/templates/${s.slug}`)}
                onClick={() => navigate(`/templates/${s.slug}`)}
              />
            );
          })}
        </div>
      </section>

      {/* ─── Create methodology modal ───────────────────────────────────── */}
      <CreateMethodologyModal
        open={drawerOpen}
        initialSource="recommended"
        onClose={() => setDrawerOpen(false)}
        onCreated={(slug) => {
          utils?.methodology?.listMine?.invalidate?.();
          (squadsQuery as any).refetch?.();
          navigate(`/templates/${slug}`);
        }}
      />
    </main>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 text-[0.7rem] tracking-[0.18em] uppercase rounded-full transition",
        active
          ? "bg-foreground text-white"
          : "border border-divider text-default-500 hover:text-foreground hover:border-foreground bg-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
