/**
 * StudioPage — Canva-style methodology workspace (画面 3).
 *
 * Three-pane layout:
 *   [ BrandContextRail ]  [ Main (stepper + StepCard + OptionCards) ]  [ AgentChatPanel ]
 *
 * Step navigation via top progress bar; each step card shows the primary
 * recommended option plus evidence; approving a step transitions decision.status
 * to "approved" and unlocks the next step.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import StepProgressBar from "../components/StepProgressBar";
import OptionCard from "../components/OptionCard";
import BrandContextRail from "../components/BrandContextRail";
import AgentChatPanel from "../components/AgentChatPanel";
import type { MosAccent } from "../primitives/tokens";
import { trpc } from "../../lib/trpc";

interface LocationState {
  squadSlug?: string;
  squadId?: number;
  accent?: MosAccent;
  decisionType?: string;
  label?: string;
  triageSessionId?: number;
}

export default function StudioPage() {
  const { brandId, sessionId } = useParams<{ brandId: string; sessionId: string }>();
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state as LocationState | null) ?? null;

  // The :sessionId URL segment can be:
  //   - "new" (legacy — no squad info, only state has it)
  //   - a numeric squadId
  //   - a squad slug (canonical going forward — survives reload + sharing)
  const sidIsNumeric = !!sessionId && /^\d+$/.test(sessionId);
  const sidIsSlug = !!sessionId && !sidIsNumeric && sessionId !== "new";

  const accent: MosAccent = state?.accent ?? "red";
  const squadId = state?.squadId ?? (sidIsNumeric ? Number(sessionId) : undefined);
  const squadSlug = state?.squadSlug ?? (sidIsSlug ? sessionId : undefined);
  const brandIdNum = Number(brandId);

  const brandQuery = trpc.brand.get.useQuery(
    { id: brandIdNum },
    { enabled: !!brandIdNum, refetchOnWindowFocus: false }
  );
  const squadsQuery = trpc.squad.listByBrand.useQuery(
    { brandId: brandIdNum },
    { enabled: !!brandIdNum, refetchOnWindowFocus: false }
  );
  const squad = useMemo(() => {
    const all = (squadsQuery.data as any[]) ?? [];
    return all.find((s: any) => s.id === squadId || s.slug === squadSlug);
  }, [squadsQuery.data, squadId, squadSlug]);

  // Canonical squad shape — see squadTemplateRouter.listByBrand
  const steps = useMemo(() => {
    const raw = squad?.steps ?? [];
    return (Array.isArray(raw) ? raw : []).map((s: any, i: number) => ({
      order: s?.order ?? i,
      name: s?.name ?? `Step ${i + 1}`,
      agent: s?.assignedAgentName ?? s?.requiredSkill ?? "Agent",
      requiredSkill: s?.requiredSkill ?? null,
      assignedAgentId: s?.assignedAgentId ?? null,
      outputType: s?.outputType ?? null,
    }));
  }, [squad]);

  const [stepIndex, setStepIndex] = useState(0);
  const [stepDecisionIds, setStepDecisionIds] = useState<Record<number, number>>({});
  const [approvedSteps, setApprovedSteps] = useState<Set<number>>(new Set());
  const [draftPayload, setDraftPayload] = useState<Record<number, any>>({});

  const currentStep = steps[stepIndex];
  const currentDecisionId = stepDecisionIds[stepIndex] ?? null;

  const historyQuery = trpc.decision.listByBrand.useQuery(
    { brandId: brandIdNum, limit: 30 },
    { enabled: !!brandIdNum, refetchOnWindowFocus: false }
  );

  // Simulated agent draft (until squad runner is wired via SSE) — seeded with
  // fake recommendation so UI flow is testable. Replace with real agent call.
  useEffect(() => {
    if (!currentStep) return;
    if (draftPayload[stepIndex]) return;
    setDraftPayload((p) => ({
      ...p,
      [stepIndex]: {
        label: "Option A",
        payload: {
          target: "28–35 urban professionals",
          motive: "afternoon ritual",
          channels: "IG, FB",
        },
        confidence: 0.78,
        reversibility: "two-way" as const,
        rationale:
          "Based on Brand Brain + upstream positioning, this segment has highest ritual-affinity signal.",
      },
    }));
  }, [stepIndex, currentStep, draftPayload]);

  const bridge = trpc.decision.fromStep.useMutation();
  const approveMut = trpc.decision.approve.useMutation();

  const createDecisionForStep = async () => {
    if (!currentStep || !brandIdNum) return;
    const primary = draftPayload[stepIndex];
    const parent = stepIndex > 0 ? stepDecisionIds[stepIndex - 1] : undefined;
    const res = await bridge.mutateAsync({
      brandId: brandIdNum,
      squadId: squad?.id,
      decisionType:
        state?.decisionType ??
        `${squad?.slug ?? "step"}-step-${stepIndex + 1}`,
      title: currentStep.name,
      summary: `Step ${stepIndex + 1} of ${squad?.name ?? "methodology"}`,
      parentDecisionId: parent,
      primaryOption: primary
        ? {
            label: primary.label,
            payload: primary.payload,
            confidence: primary.confidence,
            reversibility: primary.reversibility,
            rationale: primary.rationale,
          }
        : undefined,
    });
    setStepDecisionIds((m) => ({ ...m, [stepIndex]: res.decisionId }));
    return res.decisionId;
  };

  useEffect(() => {
    if (!currentStep) return;
    if (stepDecisionIds[stepIndex]) return;
    createDecisionForStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, currentStep]);

  const approveCurrent = async () => {
    const did = stepDecisionIds[stepIndex];
    if (!did) return;
    await approveMut.mutateAsync({ decisionId: did });
    setApprovedSteps((s) => new Set(s).add(stepIndex));
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // final step → Publish Gate
      navigate(`/studio/${brandId}/publish`, {
        state: {
          decisionId: did,
          upstream: Object.values(stepDecisionIds),
          accent,
        },
      });
    }
  };

  if (brandQuery.isLoading || squadsQuery.isLoading) {
    return (
      <StudioLayout>
        <div className="py-24 text-center text-meta text-default-500">Loading…</div>
      </StudioLayout>
    );
  }
  if (!squad) {
    return (
      <StudioLayout>
        <div className="py-24 text-center text-meta text-default-500">
          Squad not found. Start from diagnosis.
        </div>
      </StudioLayout>
    );
  }

  const brandName = (brandQuery.data as any)?.name ?? "Brand";
  const brandBrain = (brandQuery.data as any)?.brain ?? {};

  const stepBarItems = steps.map((s: any, i: number) => ({
    name: s.name,
    status:
      approvedSteps.has(i)
        ? ("done" as const)
        : i === stepIndex
        ? ("active" as const)
        : ("pending" as const),
  }));

  const history = ((historyQuery.data as any[]) ?? []).slice(0, 6).map((d) => ({
    decisionType: d.decisionType,
    title: d.title,
    status: d.status,
  }));

  const draft = draftPayload[stepIndex];

  return (
    <StudioLayout
      hideSubNav
      back={{ to: `/studio/${brandId}/templates`, label: "Back" }}
      title={squad.name}
      actions={
        <>
          <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
            Save as Template
          </button>
          <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
            Schedule
          </button>
          <button className="px-4 py-2 text-meta uppercase tracking-[0.16em] bg-foreground text-white">
            Export PDF
          </button>
        </>
      }
    >
      <div className="flex border border-divider bg-white min-h-[640px]">
        <BrandContextRail
          brandName={brandName}
          accent={accent}
          positioning={brandBrain.positioning}
          archetype={brandBrain.archetype}
          voiceTone={brandBrain.voiceTone ?? brandBrain.voice_tone}
          audience={brandBrain.audience ?? brandBrain.audience_persona}
          history={history}
        />

        <section className="flex-1 flex flex-col">
          {/* Stepper */}
          <div className="px-8 pt-8 pb-6 border-b border-divider">
            <StepProgressBar
              steps={stepBarItems}
              accent={accent}
              onJump={(i) => {
                if (i <= stepIndex || approvedSteps.has(i - 1)) setStepIndex(i);
              }}
            />
          </div>

          {/* Step card */}
          <div className="flex-1 px-8 py-8 overflow-y-auto">
            <div className="mos-eyebrow mb-2">
              Step {String(stepIndex + 1).padStart(2, "0")} of {steps.length}
            </div>
            <h2 className="mos-display text-[1.8rem] text-foreground mb-1">
              {currentStep?.name}
            </h2>
            <div className="text-meta uppercase tracking-[0.14em] text-default-500 mb-6">
              Agent · {currentStep?.agent} · Brand Brain Injected
            </div>

            {draft ? (
              <OptionCard
                label="Option A"
                payload={draft.payload}
                confidence={draft.confidence}
                reversibility={draft.reversibility}
                rationale={draft.rationale}
                isRecommended
                accent={accent}
                onApprove={approveCurrent}
                onRevise={() =>
                  setDraftPayload((p) => ({ ...p, [stepIndex]: null as any }))
                }
                approving={approveMut.isPending}
              />
            ) : (
              <div className="border border-dashed border-divider px-6 py-16 text-center text-meta text-default-500">
                Generating draft…
              </div>
            )}

            <div className="mt-8 border-t border-divider pt-6 flex items-center justify-between">
              <button
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="text-meta uppercase tracking-[0.16em] text-default-500 disabled:opacity-30 hover:text-foreground"
              >
                ← Previous step
              </button>
              <div className="text-meta uppercase tracking-[0.16em] text-default-500">
                {approvedSteps.has(stepIndex) ? "Approved" : "Awaiting approval"}
              </div>
              <button
                disabled={stepIndex >= steps.length - 1 || !approvedSteps.has(stepIndex)}
                onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                className="text-meta uppercase tracking-[0.16em] text-default-500 disabled:opacity-30 hover:text-foreground"
              >
                Next step →
              </button>
            </div>
          </div>
        </section>

        <AgentChatPanel
          decisionId={currentDecisionId}
          agentName={currentStep?.agent ?? "Agent"}
          agentRole={currentStep?.outputType ?? "Strategy Lead"}
          accent={accent}
        />
      </div>
    </StudioLayout>
  );
}
