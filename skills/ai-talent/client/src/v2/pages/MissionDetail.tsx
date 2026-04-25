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
          <div className="border border-dashed border-mos-hair bg-white p-10 text-center">
            <div className="text-[0.66rem] tracking-[0.22em] uppercase text-mos-soft mb-2">
              METHODOLOGY · NONE
            </div>
            <h2 className="font-display text-[1.4rem] text-mos-ink mb-2">
              這個任務還沒套用方法論
            </h2>
            <p className="text-[0.86rem] text-mos-muted mb-5">
              從型錄選一張方法論卡片，squad 會自動接管步驟。
            </p>
            <button
              onClick={onApplyMethodology}
              className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition"
            >
              套用方法論 →
            </button>
          </div>
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
