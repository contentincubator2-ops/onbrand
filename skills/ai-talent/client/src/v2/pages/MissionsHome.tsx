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
import MissionCard from "../components/mission/MissionCard";
import LayerLegend from "../components/methodology/LayerLegend";
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

  const goPickMethodology = () => navigate("/methodology");

  // Inline mission create — no methodology required upfront.
  // User can apply one later from MissionDetail.
  const createMission = trpc.mission.create.useMutation();
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  const submitCreate = async () => {
    setCreateError(null);
    if (!title.trim()) {
      setCreateError("請輸入任務標題");
      return;
    }
    try {
      const res = await createMission.mutateAsync({
        title: title.trim(),
        description: desc.trim() || undefined,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) {
        setCreateError("後端沒有回傳 mission id");
        return;
      }
      // Refresh list, reset form, navigate
      await allQuery?.refetch?.();
      await fallbackQuery?.refetch?.();
      setShowForm(false);
      setTitle("");
      setDesc("");
      navigate(brandId ? `/b/${brandId}/_/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[MissionsHome] mission.create failed:", e);
      setCreateError(`建立任務失敗：${e?.message ?? String(e)}`);
    }
  };

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
            選一張卡片繼續推進工作。每張卡片就是一個被 squad 接管的任務 — 點「進入」開始執行，或新建任務、或從方法論型錄套用方法論。
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
          >
            {showForm ? "× 取消" : "+ 新建任務"}
          </button>
          <button
            onClick={goPickMethodology}
            className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition"
          >
            從方法論開始 →
          </button>
        </div>
      </div>

      {showForm && (
        <CreateMissionForm
          title={title}
          desc={desc}
          onTitleChange={setTitle}
          onDescChange={setDesc}
          onSubmit={submitCreate}
          onCancel={() => { setShowForm(false); setCreateError(null); }}
          busy={createMission.isPending}
          error={createError}
        />
      )}

      {isLoading && (
        <div className="text-[0.82rem] text-mos-muted">載入任務中…</div>
      )}

      {!isLoading && rows.length === 0 && !showForm && (
        <EmptyState
          onCreate={() => setShowForm(true)}
          onPickMethodology={goPickMethodology}
        />
      )}

      {rows.length > 0 && (
        <>
          <LayerLegend className="mb-6" />
          <div className="flex flex-wrap gap-6">
            {rows.map((m) => (
              <MissionCard
                key={m.id}
                title={m.title}
                brief={m.description ?? null}
                brandName={m.brandName ?? null}
                workspace={m.workspace ?? null}
                status={m.status ?? "active"}
                methodologySlug={m.squadSlug ?? null}
                methodologyName={m.squadName ?? m.methodology ?? m.squadSlug ?? null}
                methodologyLayer={m.squadLayer ?? null}
                stepCount={m.squadStepCount ?? null}
                lastUpdated={m.updatedAt ?? null}
                onClick={() => goToMission(m)}
                onCtaClick={() => goToMission(m)}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function EmptyState({
  onCreate,
  onPickMethodology,
}: {
  onCreate: () => void;
  onPickMethodology: () => void;
}) {
  return (
    <div className="border border-dashed border-mos-hair bg-white py-20 px-10 flex flex-col items-center text-center">
      <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
        TASK WALL · EMPTY
      </div>
      <h2 className="mt-2 font-display text-[1.6rem] text-mos-ink tracking-[-0.015em]">
        還沒有任務
      </h2>
      <p className="mt-2 text-[0.86rem] text-mos-muted max-w-[460px]">
        直接寫下你想完成的事，立刻建立任務。也可以先到方法論型錄挑一個工作流再開始。
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={onCreate}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
        >
          + 新建任務
        </button>
        <button
          onClick={onPickMethodology}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase border border-mos-ink text-mos-ink hover:bg-mos-ink hover:text-white transition"
        >
          從方法論開始 →
        </button>
      </div>
    </div>
  );
}

function CreateMissionForm({
  title,
  desc,
  onTitleChange,
  onDescChange,
  onSubmit,
  onCancel,
  busy,
  error,
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
    <div className="mb-8 border border-mos-hair bg-white p-6">
      <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft mb-3">
        NEW MISSION
      </div>
      <label className="block">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務標題</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          placeholder="例如：4 月 SoWork 自有 FB 經營"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
        />
      </label>
      <label className="block mt-4">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務說明（選填）</span>
        <textarea
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。可以晚點再補。"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
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
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "建立中…" : "建立任務 →"}
        </button>
      </div>
    </div>
  );
}
