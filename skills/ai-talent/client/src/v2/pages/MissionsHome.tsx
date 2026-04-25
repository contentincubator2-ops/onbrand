/**
 * MissionsHome — 任務牆 (v2 D1)
 *
 * Main entry. Lists all missions for the user as MethodologyCards.
 * Falls back to per-brand listing if mission.listAllForUser hasn't
 * been deployed yet.
 */
import React, { useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import { accentForIndex } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

interface MissionRow {
  id: number;
  title: string;
  description?: string | null;
  workspace?: string | null;
  methodology?: string | null;
  squadSlug?: string | null;
  brandId?: number | null;
  status?: string | null;
  brandName?: string | null;
  updatedAt?: string;
}

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, {
        refetchOnWindowFocus: false,
      })
    : null;

  // Fallback: per-brand listing if listAllForUser missing
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

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const goNew = () => navigate("/methodology");

  return (
    <main className="max-w-[1280px] mx-auto px-8 py-10">
      {/* Page hero */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
            MISSION WALL
          </div>
          <h1 className="mt-1 font-display text-[2.4rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
            任務牆
          </h1>
          <div className="mt-2 text-[0.86rem] text-mos-muted max-w-[520px]">
            選一張卡片繼續推進工作。每張卡片就是一個被 squad 接管的任務 — 點「進入」開始執行，或從方法論型錄套用新方法論。
          </div>
        </div>
        <button
          onClick={goNew}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
        >
          套用新方法論 →
        </button>
      </div>

      {isLoading && (
        <div className="text-[0.82rem] text-mos-muted">載入任務中…</div>
      )}

      {!isLoading && rows.length === 0 && <EmptyState onStart={goNew} />}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {rows.map((m, i) => {
            const accent = accentForIndex(i);
            const methodologyLabel = (m.methodology || "").trim();
            const brandTag = (m.brandName ?? "SOWORK").toUpperCase().slice(0, 14);
            const wsLabel = m.workspace ? m.workspace.toUpperCase() : "WORKSPACE";
            const statusLabel = m.status === "completed" ? "已完成" : "進行中";

            return (
              <MethodologyCard
                key={m.id}
                accent={accent}
                variantIndex={i}
                monogram={brandTag}
                category={`${wsLabel} · ${statusLabel}`}
                title={m.title}
                author={
                  methodologyLabel
                    ? `方法論 · ${methodologyLabel}`
                    : m.squadSlug
                    ? `Squad · ${m.squadSlug}`
                    : "尚未挑選方法論"
                }
                steps={
                  m.description
                    ? [
                        { name: "任務需求", desc: m.description.slice(0, 60), glyph: "01" },
                        { name: "方法論套用", desc: methodologyLabel || "尚未挑選", glyph: "02" },
                        { name: "Squad 執行", desc: m.squadSlug || "待派工", glyph: "03" },
                        { name: "成果交付", desc: "等待產出", glyph: "04" },
                      ]
                    : []
                }
                leadName={m.brandName ?? "Squad Lead"}
                leadAvatar={(m.brandName ?? "S")[0].toUpperCase()}
                footerMeta={
                  m.updatedAt
                    ? `更新 · ${new Date(m.updatedAt).toLocaleDateString("zh-TW")}`
                    : undefined
                }
                ctaLabel="進入"
                onCtaClick={() => goToMission(m)}
                onClick={() => goToMission(m)}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="border border-dashed border-mos-hair bg-white py-20 px-10 flex flex-col items-center text-center">
      <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
        TASK WALL · EMPTY
      </div>
      <h2 className="mt-2 font-display text-[1.6rem] text-mos-ink tracking-[-0.015em]">
        還沒有任務
      </h2>
      <p className="mt-2 text-[0.86rem] text-mos-muted max-w-[420px]">
        從一張方法論卡片開始 — 我們會幫你配對最合適的 squad，引導你逐步完成。
      </p>
      <button
        onClick={onStart}
        className="mt-6 px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
      >
        瀏覽方法論型錄 →
      </button>
    </div>
  );
}
