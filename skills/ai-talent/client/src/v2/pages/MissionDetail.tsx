/**
 * MissionDetail — v2 D2.
 *
 * Three zones:
 *   Left  — task brief (read-only mission row)
 *   Mid   — applied methodology: editable step list with status pills,
 *           "套用方法論" CTA when none applied, sticky ForkPromptBar
 *           when steps differ from the original.
 *   Right — MethodologyCard mirroring the applied methodology
 *
 * Dirty-detection: deep-equals the editable step array against the
 * original snapshot taken at fetch time. On fork the mission swaps to
 * the new squad slug automatically.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import StepEditor, { type StepDraft } from "../components/methodology/StepEditor";
import ForkPromptBar from "../components/methodology/ForkPromptBar";
import ChatDrawer from "../components/mission/ChatDrawer";
import { accentForIndex } from "../../studio/primitives/tokens";

export default function MissionDetail() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();
  const id = Number(missionId);
  const utils = trpc.useUtils?.() ?? (trpc as any).useContext?.();

  // ── Mission ───────────────────────────────────────────────────────────
  const missionQuery = trpc.mission.getById.useQuery(
    { id },
    { enabled: !!id, refetchOnWindowFocus: false }
  );
  const m: any = missionQuery.data;

  // ── Methodology (squad) ───────────────────────────────────────────────
  const methodologyQuery = (trpc as any).methodology.getBySlugOrId.useQuery(
    { slug: m?.squadSlug ?? "" },
    { enabled: !!m?.squadSlug, refetchOnWindowFocus: false }
  );
  const sq: any = methodologyQuery.data;

  // ── Editable step state ───────────────────────────────────────────────
  const [draft, setDraft] = useState<StepDraft[]>([]);
  const [original, setOriginal] = useState<StepDraft[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (sq?.steps) {
      setDraft(JSON.parse(JSON.stringify(sq.steps)));
      setOriginal(JSON.parse(JSON.stringify(sq.steps)));
      setExpanded(null);
    }
  }, [sq?.id, sq?.slug]);

  // ── Dirty detection ───────────────────────────────────────────────────
  const dirtyCount = useMemo(() => {
    if (draft.length !== original.length) return Math.abs(draft.length - original.length);
    let n = 0;
    for (let i = 0; i < draft.length; i++) {
      if (JSON.stringify(draft[i]) !== JSON.stringify(original[i])) n++;
    }
    return n;
  }, [draft, original]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const updateMission = trpc.mission.update.useMutation();
  const forkMethodology = (trpc as any).methodology.fork.useMutation();

  const onApplyMethodology = () => navigate("/methodology");

  const onFork = async (newName: string) => {
    if (!sq) return;
    const res = await forkMethodology.mutateAsync({
      parentSquadId: sq.id,
      name: newName,
      description: sq.description ?? "",
      steps: draft.map((s) => ({
        name: s.name,
        description: s.description ?? "",
        requiredSkill: s.requiredSkill ?? undefined,
        outputType: s.outputType ?? undefined,
        assignedAgentId: s.assignedAgentId ?? null,
        prompt: s.prompt ?? undefined,
      })),
    });
    // Swap the mission to point at the new fork
    await updateMission.mutateAsync({ id, squadSlug: res.slug });
    // Refetch
    await utils?.mission?.getById?.invalidate?.({ id });
    await utils?.methodology?.getBySlugOrId?.invalidate?.();
    // Hard reload of the methodology query — user lands on the fork
    methodologyQuery.refetch();
  };

  if (missionQuery.isLoading) {
    return <div className="max-w-[1280px] mx-auto px-8 py-10 text-mos-muted">載入中…</div>;
  }
  if (!m) {
    return (
      <div className="max-w-[1280px] mx-auto px-8 py-10">
        <div className="text-mos-muted">找不到任務。</div>
        <Link to="/" className="mt-4 inline-block text-mos-ink underline underline-offset-4">
          ← 回任務牆
        </Link>
      </div>
    );
  }

  const accent = accentForIndex(Number(sq?.id ?? id));

  return (
    <main className="max-w-[1280px] mx-auto px-8 py-10 grid grid-cols-12 gap-6 pb-32">
      {/* ── LEFT: Brief ───────────────────────────────────────────────── */}
      <section className="col-span-4 space-y-4">
        <button
          onClick={() => navigate("/")}
          className="text-[0.7rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink"
        >
          ← 任務牆
        </button>
        <div>
          <div className="text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
            MISSION
          </div>
          <h1 className="mt-1 font-display text-[1.9rem] leading-[1.1] text-mos-ink tracking-[-0.02em]">
            {m.title}
          </h1>
          <div className="mt-2 text-[0.72rem] tracking-[0.14em] text-mos-muted">
            {m.workspace?.toUpperCase() ?? "WORKSPACE"} · {m.status === "completed" ? "已完成" : "進行中"}
          </div>
        </div>

        {m.description && (
          <div className="border border-mos-hair bg-white p-5">
            <div className="text-[0.62rem] tracking-[0.22em] uppercase text-mos-soft mb-2">
              任務需求
            </div>
            <div className="text-[0.88rem] leading-relaxed text-mos-body whitespace-pre-wrap">
              {m.description}
            </div>
          </div>
        )}

        {(m.objective || m.audience || m.successMetrics) && (
          <div className="border border-mos-hair bg-white p-5 space-y-3 text-[0.84rem]">
            {m.objective && <BriefRow label="目標">{m.objective}</BriefRow>}
            {m.audience && <BriefRow label="受眾">{m.audience}</BriefRow>}
            {m.successMetrics && <BriefRow label="成功指標">{m.successMetrics}</BriefRow>}
          </div>
        )}
      </section>

      {/* ── MIDDLE: Steps editor ─────────────────────────────────────── */}
      <section className="col-span-5 space-y-3">
        {!sq && !methodologyQuery.isLoading && (
          <RecommendationPanel
            missionId={id}
            onPick={async (slug) => {
              await updateMission.mutateAsync({ id, squadSlug: slug });
              await utils?.mission?.getById?.invalidate?.({ id });
              missionQuery.refetch();
            }}
            onBrowseManually={onApplyMethodology}
          />
        )}

        {methodologyQuery.isLoading && (
          <div className="text-[0.82rem] text-mos-muted">載入方法論…</div>
        )}

        {sq && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[0.66rem] tracking-[0.22em] uppercase text-mos-soft">
                  APPLIED METHODOLOGY · {(sq.source ?? "seeded").toUpperCase()}
                </div>
                <h2 className="mt-1 font-display text-[1.5rem] text-mos-ink tracking-[-0.015em]">
                  {sq.name}
                </h2>
                {sq.methodology?.author && (
                  <div className="text-[0.74rem] text-mos-muted">
                    {sq.methodology.author}
                    {sq.methodology.year ? ` · ${sq.methodology.year}` : ""}
                  </div>
                )}
              </div>
              <button
                onClick={onApplyMethodology}
                className="px-3 py-1.5 text-[0.66rem] tracking-[0.16em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink transition"
              >
                換方法論
              </button>
            </div>

            <div className="space-y-2.5">
              {draft.map((s, i) => (
                <StepEditor
                  key={i}
                  step={s}
                  index={i}
                  accent={accent}
                  expanded={expanded === i}
                  onToggle={() => setExpanded(expanded === i ? null : i)}
                  onChange={(patch) => {
                    setDraft((prev) =>
                      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
                    );
                  }}
                  onRemove={
                    draft.length > 1
                      ? () => setDraft((prev) => prev.filter((_, idx) => idx !== i))
                      : undefined
                  }
                  onMoveUp={
                    i > 0
                      ? () =>
                          setDraft((prev) => {
                            const n = [...prev];
                            [n[i - 1], n[i]] = [n[i], n[i - 1]];
                            return n.map((s, k) => ({ ...s, order: k + 1 }));
                          })
                      : undefined
                  }
                  onMoveDown={
                    i < draft.length - 1
                      ? () =>
                          setDraft((prev) => {
                            const n = [...prev];
                            [n[i], n[i + 1]] = [n[i + 1], n[i]];
                            return n.map((s, k) => ({ ...s, order: k + 1 }));
                          })
                      : undefined
                  }
                />
              ))}

              <button
                onClick={() =>
                  setDraft((prev) => [
                    ...prev,
                    {
                      order: prev.length + 1,
                      name: "新步驟",
                      description: "",
                      requiredSkill: "",
                      outputType: "",
                      assignedAgentId: null,
                      prompt: "",
                    },
                  ])
                }
                className="w-full border border-dashed border-mos-hair bg-white py-3 text-[0.74rem] tracking-[0.16em] uppercase text-mos-muted hover:text-mos-ink hover:border-mos-ink transition"
              >
                + 新增步驟
              </button>
            </div>

            <button
              onClick={() => setChatOpen(true)}
              className="mt-4 w-full py-3 bg-mos-ink text-white text-[0.74rem] tracking-[0.18em] uppercase hover:bg-mos-body transition"
              title="打開對話面板，跟 squad lead 開始這個任務"
            >
              開始對話 RUN →
            </button>
          </>
        )}
      </section>

      {/* ── RIGHT: Methodology card mirror ──────────────────────────── */}
      <aside className="col-span-3 flex justify-end">
        {sq ? (
          <MethodologyCard
            accent={accent}
            variantIndex={Number(sq.id ?? id)}
            monogram={(sq.tier || "L?").toUpperCase()}
            category={(sq.strategyLayer || "LAYER") + " · " + (sq.source ?? "seeded").toUpperCase()}
            title={sq.name ?? sq.slug}
            author={sq.methodology?.author ?? sq.slug}
            steps={draft.slice(0, 4).map((s, idx) => ({
              name: s.name,
              desc: s.requiredSkill ?? s.outputType ?? "",
              glyph: `0${idx + 1}`,
            }))}
            leadName={sq.lead?.name ?? "Squad Lead"}
            leadAvatar={(sq.lead?.name ?? "S")[0]}
            footerMeta={`${draft.length} steps`}
            ctaLabel="預覽"
            onCtaClick={() => navigate(`/methodology/${sq.slug}`)}
          />
        ) : (
          <div className="w-[320px] h-[460px] border border-dashed border-mos-hair bg-white flex items-center justify-center text-[0.74rem] text-mos-soft">
            尚未套用方法論
          </div>
        )}
      </aside>

      {/* ── Sticky fork prompt ──────────────────────────────────────── */}
      {sq && dirtyCount > 0 && (
        <ForkPromptBar
          dirtyCount={dirtyCount}
          defaultName={`${sq.name} · ${m.title}`}
          onDiscard={() => setDraft(JSON.parse(JSON.stringify(original)))}
          onFork={onFork}
        />
      )}

      {/* ── Floating chat pill ──────────────────────────────────────── */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-30 px-5 py-3 bg-mos-ink text-white text-[0.72rem] tracking-[0.2em] uppercase shadow-lift hover:bg-mos-body transition"
        >
          對話 →
        </button>
      )}

      <ChatDrawer
        missionId={id}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        squadName={sq?.name ?? null}
      />
    </main>
  );
}

function BriefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.6rem] tracking-[0.22em] uppercase text-mos-soft mb-0.5">
        {label}
      </div>
      <div className="text-[0.86rem] text-mos-body whitespace-pre-wrap">{children}</div>
    </div>
  );
}

// ── AI Methodology Recommendation Panel ────────────────────────────────
//
// Auto-fires methodology.recommend when shown, then renders the ranked
// list. Each card has one-click "套用" so user doesn't have to think
// about which methodology to pick — AI already ranked + rationalised.
//
// Product principle: AI does the work, user only confirms.
function RecommendationPanel({
  missionId,
  onPick,
  onBrowseManually,
}: {
  missionId: number;
  onPick: (slug: string) => Promise<void>;
  onBrowseManually: () => void;
}) {
  const recommendMut = (trpc as any).methodology.recommend.useMutation();
  const [recs, setRecs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [hasFired, setHasFired] = useState(false);

  // Fire once on mount
  useEffect(() => {
    if (hasFired) return;
    setHasFired(true);
    (async () => {
      try {
        const res = await recommendMut.mutateAsync({ missionId });
        setRecs(res?.recommendations ?? []);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("[RecommendationPanel] recommend failed:", e);
        setErr(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const isLoading = recommendMut.isPending || (!recs && !err);

  const handlePick = async (slug: string) => {
    if (picking) return;
    setPicking(slug);
    try {
      await onPick(slug);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[RecommendationPanel] apply failed:", e);
      setErr(`套用失敗：${e?.message ?? String(e)}`);
    } finally {
      setPicking(null);
    }
  };

  return (
    <div className="border border-mos-hair bg-white p-7">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft mb-1">
            AI · METHODOLOGY MATCH
          </div>
          <h2 className="font-display text-[1.4rem] text-mos-ink tracking-[-0.015em]">
            為這個任務挑了這幾個方法論
          </h2>
          <p className="mt-1 text-[0.78rem] text-mos-muted max-w-[420px]">
            按你的任務說明排序。點「套用」一鍵接管步驟，不滿意可以再換。
          </p>
        </div>
        <button
          onClick={onBrowseManually}
          className="text-[0.66rem] tracking-[0.18em] uppercase border border-mos-hair px-3 py-1.5 text-mos-muted hover:text-mos-ink hover:border-mos-ink transition"
        >
          自己挑 →
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-mos-hair bg-mos-cream/50 h-[78px] animate-pulse" />
          ))}
          <div className="text-[0.74rem] text-mos-muted text-center mt-3">AI 配對中…</div>
        </div>
      )}

      {err && !isLoading && (
        <div className="text-[0.78rem] text-red-600 whitespace-pre-wrap">
          推薦失敗：{err}
        </div>
      )}

      {recs && recs.length === 0 && !isLoading && (
        <div className="text-[0.82rem] text-mos-muted">
          AI 沒挑出推薦（型錄可能空的）。你可以
          <button
            onClick={onBrowseManually}
            className="ml-1 underline underline-offset-4 text-mos-ink"
          >
            自己挑一個
          </button>
          。
        </div>
      )}

      {recs && recs.length > 0 && (
        <ol className="space-y-2.5">
          {recs.map((r: any, i: number) => (
            <li
              key={r.slug}
              className="group border border-mos-hair bg-white hover:border-mos-ink transition"
            >
              <div className="flex items-stretch">
                <div className="flex flex-col items-center justify-center w-12 bg-mos-cream/60 text-mos-soft border-r border-mos-hair">
                  <span className="font-display text-[0.84rem] text-mos-ink">0{i + 1}</span>
                </div>
                <div className="flex-1 px-4 py-3.5">
                  <div className="flex items-center gap-2 text-[0.62rem] tracking-[0.18em] uppercase text-mos-soft mb-0.5">
                    <span>{r.strategyLayer ?? "LAYER"}</span>
                    <span>·</span>
                    <span>{(r.source ?? "seeded").toUpperCase()}</span>
                    {r.author && (
                      <>
                        <span>·</span>
                        <span className="normal-case tracking-normal text-mos-muted">{r.author}</span>
                      </>
                    )}
                  </div>
                  <div className="font-display text-[1rem] text-mos-ink leading-tight">
                    {r.name}
                  </div>
                  {r.rationale && (
                    <div className="mt-1 text-[0.8rem] text-mos-body leading-snug">
                      {r.rationale}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handlePick(r.slug)}
                  disabled={!!picking}
                  className="px-5 text-[0.7rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-wait"
                >
                  {picking === r.slug ? "套用中…" : "套用"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
