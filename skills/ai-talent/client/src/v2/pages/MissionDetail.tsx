/**
 * MissionDetail — v2 D2.
 *
 * Three zones:
 *   Left  — task brief (read-only mission row)
 *   Mid   — applied methodology: editable step list with status pills,
 *           "套用任務範本" CTA when none applied, sticky ForkPromptBar
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
import { accentForIndex, LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";

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

  const onApplyMethodology = () => navigate("/templates");

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
    return <div className="px-8 py-10 text-default-500">載入中…</div>;
  }
  if (!m) {
    return (
      <div className="px-8 py-10">
        <div className="text-default-500">找不到任務。</div>
        <Link to="/" className="mt-4 inline-block text-foreground underline underline-offset-4">
          ← 回任務牆
        </Link>
      </div>
    );
  }

  const accent = accentForIndex(Number(sq?.id ?? id));

  return (
    <main className="px-8 py-10 grid grid-cols-12 gap-6 pb-32">
      {/* ── LEFT: Brief ───────────────────────────────────────────────── */}
      <section className="col-span-4 space-y-4">
        <button
          onClick={() => navigate("/")}
          className="text-tiny tracking-[0.18em] uppercase text-default-500 hover:text-foreground"
        >
          ← 任務牆
        </button>
        <div>
          <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
            MISSION
          </div>
          <h1 className="mt-1 font-semibold text-2xl leading-[1.1] text-foreground tracking-[-0.02em]">
            {m.title}
          </h1>
          <div className="mt-2 text-tiny tracking-[0.14em] text-default-500">
            {m.workspace?.toUpperCase() ?? "WORKSPACE"} · {m.status === "completed" ? "已完成" : "進行中"}
          </div>
        </div>

        {m.description && (
          <div className="border border-divider bg-white p-5">
            <div className="text-tiny tracking-[0.22em] uppercase text-default-400 mb-2">
              任務需求
            </div>
            <div className="text-small leading-relaxed text-foreground whitespace-pre-wrap">
              {m.description}
            </div>
          </div>
        )}

        {(m.objective || m.audience || m.successMetrics) && (
          <div className="border border-divider bg-white p-5 space-y-3 text-small">
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
          <div className="text-small text-default-500">載入任務範本…</div>
        )}

        {sq && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-tiny tracking-[0.22em] uppercase text-default-400">
                  APPLIED METHODOLOGY · {(sq.source ?? "seeded").toUpperCase()}
                </div>
                <h2 className="mt-1 font-semibold text-xl text-foreground tracking-[-0.015em]">
                  {sq.name}
                </h2>
                {sq.methodology?.author && (
                  <div className="text-tiny text-default-500">
                    {sq.methodology.author}
                    {sq.methodology.year ? ` · ${sq.methodology.year}` : ""}
                  </div>
                )}
              </div>
              <button
                onClick={onApplyMethodology}
                className="px-3 py-1.5 text-tiny tracking-[0.16em] uppercase border border-divider text-default-500 hover:text-foreground hover:border-foreground transition"
              >
                換任務範本
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
                className="w-full border border-dashed border-divider bg-white py-3 text-tiny tracking-[0.16em] uppercase text-default-500 hover:text-foreground hover:border-foreground transition"
              >
                + 新增步驟
              </button>
            </div>

            <button
              onClick={() => setChatOpen(true)}
              className="mt-4 w-full py-3 bg-foreground text-white text-tiny tracking-[0.18em] uppercase hover:bg-foreground/90 transition"
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
            layer={sq.strategyLayer ?? sq.tier ?? null}
            seed={sq.slug ?? sq.id ?? id}
            heroImageUrl={sq.heroImageUrl ?? null}
            title={sq.name ?? sq.slug}
            author={sq.methodology?.author ? `${sq.methodology.author}${sq.methodology?.year ? " · " + sq.methodology.year : ""}` : null}
            source={sq.source ?? "seeded"}
            steps={draft.slice(0, 4).map((s, idx) => ({
              name: s.name,
              desc: s.requiredSkill ?? s.outputType ?? "",
              glyph: `0${idx + 1}`,
            }))}
            leadName={sq.lead?.name ?? "Squad Lead"}
            ctaLabel="預覽"
            onCtaClick={() => navigate(`/templates/${sq.slug}`)}
          />
        ) : (
          <div className="w-[320px] h-[460px] border border-dashed border-divider bg-white flex items-center justify-center text-tiny text-default-400">
            尚未套用任務範本
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
          className="fixed bottom-6 right-6 z-30 px-5 py-3 bg-foreground text-white text-tiny tracking-[0.2em] uppercase shadow-lift hover:bg-foreground/90 transition"
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
      <div className="text-tiny tracking-[0.22em] uppercase text-default-400 mb-0.5">
        {label}
      </div>
      <div className="text-small text-foreground whitespace-pre-wrap">{children}</div>
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
    <div className="border border-divider bg-white p-7">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-tiny tracking-[0.28em] uppercase text-default-400 mb-1">
            AI · METHODOLOGY MATCH
          </div>
          <h2 className="font-semibold text-xl text-foreground tracking-[-0.015em]">
            為這個任務挑了這幾個任務範本
          </h2>
          <p className="mt-1 text-small text-default-500 max-w-[420px]">
            按你的任務說明排序。點「套用」一鍵接管步驟，不滿意可以再換。
          </p>
        </div>
        <button
          onClick={onBrowseManually}
          className="text-tiny tracking-[0.18em] uppercase border border-divider px-3 py-1.5 text-default-500 hover:text-foreground hover:border-foreground transition"
        >
          自己挑 →
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-divider bg-content2/50 h-[78px] animate-pulse" />
          ))}
          <div className="text-tiny text-default-500 text-center mt-3">AI 配對中…</div>
        </div>
      )}

      {err && !isLoading && (
        <div className="text-small text-red-600 whitespace-pre-wrap">
          推薦失敗：{err}
        </div>
      )}

      {recs && recs.length === 0 && !isLoading && (
        <div className="text-small text-default-500">
          AI 沒挑出推薦（型錄可能空的）。你可以
          <button
            onClick={onBrowseManually}
            className="ml-1 underline underline-offset-4 text-foreground"
          >
            自己挑一個
          </button>
          。
        </div>
      )}

      {recs && recs.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {recs.map((r: any, i: number) => (
            <RecTile
              key={r.slug}
              rec={r}
              index={i}
              picking={picking === r.slug}
              disabled={!!picking}
              onPick={() => handlePick(r.slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Canva-style recommendation tile ───────────────────────────────────
//
// Big pastel block with the methodology hero image on the right and
// title/rationale on the left, mirroring the "簡報 / 海報 / 履歷" pattern
// from Canva's template gallery. Layer drives the tint colour.
function RecTile({
  rec,
  index,
  picking,
  disabled,
  onPick,
}: {
  rec: any;
  index: number;
  picking: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const lk = resolveLayer(rec.strategyLayer ?? rec.tier ?? null);
  const tone = LAYER_TOKENS[lk];
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className="group relative flex items-stretch overflow-hidden rounded-md border border-divider text-left transition hover:shadow-lift disabled:opacity-50 disabled:cursor-wait"
      style={{ background: `linear-gradient(135deg, ${tone.bg}1F 0%, ${tone.bg}0A 100%)` }}
    >
      {/* Left: copy */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ background: tone.bg }}
            aria-hidden
          />
          <span className="font-semibold text-tiny tracking-[0.06em] text-foreground">
            {lk}
          </span>
          <span className="text-tiny tracking-[0.04em] text-default-400">
            ・{tone.label}
          </span>
        </div>
        <div className="font-semibold text-medium leading-tight text-foreground line-clamp-2">
          {rec.name}
        </div>
        {rec.author && (
          <div className="mt-0.5 text-tiny tracking-[0.04em] text-default-500 truncate">
            {rec.author}
          </div>
        )}
        {rec.rationale && (
          <div className="mt-2 text-tiny text-foreground leading-snug line-clamp-3">
            {rec.rationale}
          </div>
        )}
        <div
          className="mt-3 inline-flex items-center gap-1 text-tiny tracking-[0.18em] uppercase font-medium"
          style={{ color: tone.bg }}
        >
          {picking ? "套用中…" : "套用"} →
        </div>
      </div>
      {/* Right: hero illustration */}
      <div
        className="relative shrink-0 w-[40%] min-w-[120px] max-w-[180px]"
        style={{ background: tone.bg + "22" }}
      >
        {rec.heroImageUrl ? (
          <img
            src={rec.heroImageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph
              seed={rec.slug ?? rec.id ?? index}
              layer={lk}
              size={84}
            />
          </div>
        )}
      </div>
      {/* corner number — Canva-y order tag */}
      <span
        className="absolute top-2 left-2 font-semibold text-tiny tracking-[0.26em] uppercase text-default-400/80"
        aria-hidden
      >
        0{index + 1}
      </span>
    </button>
  );
}
