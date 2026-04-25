/**
 * MethodologyCatalog — v2 D3.
 *
 * Lists every squad as a rack-card MethodologyCard, with three filter
 * dimensions:
 *   - layer (L1–L6)
 *   - source (seeded / ingested / forked / mine)
 *   - "+ 從網路新增" opens IngestDrawer (LLM-extract a methodology
 *     from any URL → preview → commit as a new squad).
 *
 * Click a card → /methodology/:slug detail page.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import LayerLegend from "../components/methodology/LayerLegend";
import IngestDrawer from "../components/methodology/IngestDrawer";
import type { MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type SourceFilter = "all" | "seeded" | "ingested" | "forked" | "mine";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const merged = useMemo(() => {
    if (sourceFilter === "mine") return mine;
    let pool = squads;
    if (sourceFilter !== "all") pool = pool.filter((s) => (s.source ?? "seeded") === sourceFilter);
    return pool;
  }, [squads, mine, sourceFilter]);

  const filtered = useMemo(() => {
    if (!layerFilter) return merged;
    return merged.filter((s) =>
      ((s.tier || s.strategyLayer || "") as string).toUpperCase().includes(layerFilter)
    );
  }, [merged, layerFilter]);

  return (
    <main className="max-w-[1280px] mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
            METHODOLOGY CATALOG
          </div>
          <h1 className="mt-1 font-display text-[2.4rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
            方法論型錄
          </h1>
          <div className="mt-2 text-[0.86rem] text-mos-muted max-w-[520px]">
            每張卡片都是已配好 squad、可立即套用的方法論。可以從網路抽取新方法論，或在任務裡調整後 fork 成自己的版本。
          </div>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition"
        >
          + 從網路新增
        </button>
      </div>

      {/* Filter rows */}
      <div className="space-y-3 mb-6">
        <FilterRow label="來源">
          {(
            [
              ["all", "全部"],
              ["seeded", "預設"],
              ["ingested", "已收錄"],
              ["forked", "Fork"],
              ["mine", "我的方法論"],
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
        </FilterRow>

        <FilterRow label="策略層">
          <LayerLegend active={layerFilter} onPick={setLayerFilter} />
        </FilterRow>
      </div>

      {squadsQuery.isLoading && sourceFilter !== "mine" && (
        <div className="text-[0.82rem] text-mos-muted">載入方法論中…</div>
      )}
      {sourceFilter === "mine" && mineQuery.isLoading && (
        <div className="text-[0.82rem] text-mos-muted">載入我的方法論中…</div>
      )}

      {!squadsQuery.isLoading && filtered.length === 0 && (
        <div className="text-[0.82rem] text-mos-muted py-10">沒有符合的方法論。</div>
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
              onCtaClick={() => navigate(`/methodology/${s.slug}`)}
              onClick={() => navigate(`/methodology/${s.slug}`)}
            />
          );
        })}
      </div>

      {/* ─── Ingest drawer ──────────────────────────────────────────── */}
      <IngestDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={(slug) => {
          // Refresh both lists so the new card surfaces in "我的方法論".
          utils?.methodology?.listMine?.invalidate?.();
          (squadsQuery as any).refetch?.();
          // Jump straight to the detail page of the new methodology.
          navigate(`/methodology/${slug}`);
        }}
      />
    </main>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft w-12 shrink-0">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
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
        "px-3 py-1.5 text-[0.7rem] tracking-[0.18em] uppercase transition",
        active
          ? "bg-mos-ink text-white"
          : "border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
