/**
 * WorkflowRunner — in-place agent workflow execution (Sprint 1, 2026-04-27).
 *
 * Mounts in the right pane of PickerWorkspace AFTER a mission is launched.
 * Replaces the previous behavior of jumping to /m/:missionId.
 *
 * Layout (decision A from 2026-04-27 design call)
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Step 2/5 · 進行中           〔Agent: 品牌策略師〕   │
 *   │                                                     │
 *   │   主畫布 — 對話 / 草稿 / 成果卡                     │
 *   │                                                     │
 *   ├─────────────────────────────────────────────────────┤
 *   │ ✓1   ●2   ○3   ○4   ○5     [匯出全部] (last step)   │
 *   └─────────────────────────────────────────────────────┘
 *
 * Interaction (B3 hybrid)
 *   - Step 1 → mode="ask" → agent asks Q → user answers → mode="run" → draft
 *   - Step 2+ auto-chains: mode="run" using prev step outputs
 *   - Each draft has 確認 / 重新生成 / 編輯 actions
 *
 * URL state
 *   /picker?mission=<id>  → re-hydrate runner from mission_step_progress
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";
import { pickLocaleText } from "../../lib/localizeText";

type StepStatus = "pending" | "asking" | "drafted" | "confirmed";

interface WorkflowRunnerProps {
  missionId: number;
  squad: any;            // canonical squad shape from squadTemplateRouter.listByBrand
  lang: "zh-TW" | "en";
  onSwapSquad?: () => void;
}

export default function WorkflowRunner({ missionId, squad, lang }: WorkflowRunnerProps) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const steps: any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const totalSteps = steps.length;

  const progressQuery = (trpc.squad as any).stepGetProgress?.useQuery
    ? (trpc.squad as any).stepGetProgress.useQuery(
        { missionId },
        { refetchOnWindowFocus: false },
      )
    : { data: [], refetch: () => {} };

  const stepExecute = (trpc.squad as any).stepExecute.useMutation();

  // Build a quick lookup: stepOrder → progress row
  const byOrder = useMemo(() => {
    const map = new Map<number, any>();
    for (const r of (progressQuery.data ?? []) as any[]) {
      map.set(r.stepOrder, r);
    }
    return map;
  }, [progressQuery.data]);

  // Active step = first non-confirmed step, or last step if all done
  const activeOrder = useMemo(() => {
    for (const s of steps) {
      const ord = Number(s.order ?? 0) || (steps.indexOf(s) + 1);
      const p = byOrder.get(ord);
      if (!p || p.status !== "confirmed") return ord;
    }
    return totalSteps; // all confirmed
  }, [steps, byOrder, totalSteps]);

  const [viewOrder, setViewOrder] = useState<number>(activeOrder);
  useEffect(() => { setViewOrder(activeOrder); }, [activeOrder]);

  const viewStep = useMemo(
    () => steps.find((s: any, i: number) => Number(s.order ?? 0) === viewOrder || (i + 1) === viewOrder),
    [steps, viewOrder],
  );
  const viewProgress = byOrder.get(viewOrder);
  const allDone = totalSteps > 0
    && steps.every((s: any, i: number) => {
      const ord = Number(s.order ?? 0) || (i + 1);
      return byOrder.get(ord)?.status === "confirmed";
    });

  // ── Auto-kickoff: when no progress yet, ask the agent for clarifying Q
  useEffect(() => {
    if (progressQuery.isLoading) return;
    if (totalSteps === 0) return;
    const firstOrder = Number(steps[0]?.order ?? 1) || 1;
    const first = byOrder.get(firstOrder);
    if (!first && !stepExecute.isPending) {
      // First entry: agent asks intake question for step 1
      stepExecute.mutate(
        { missionId, squadSlug: squad.slug, stepOrder: firstOrder, mode: "ask" },
        { onSuccess: () => progressQuery.refetch?.() },
      );
    }
  }, [progressQuery.isLoading, byOrder, totalSteps]); // eslint-disable-line

  const [inputDraft, setInputDraft] = useState("");

  const handleAnswerAndRun = async () => {
    if (!viewStep) return;
    const ord = Number(viewStep.order ?? viewOrder) || viewOrder;
    await stepExecute.mutateAsync({
      missionId, squadSlug: squad.slug, stepOrder: ord,
      mode: "run", userInput: inputDraft,
    });
    setInputDraft("");
    progressQuery.refetch?.();
  };

  const handleConfirm = async () => {
    if (!viewStep) return;
    const ord = Number(viewStep.order ?? viewOrder) || viewOrder;
    await stepExecute.mutateAsync({
      missionId, squadSlug: squad.slug, stepOrder: ord, mode: "confirm",
    });
    await progressQuery.refetch?.();
    // Auto-advance: kick off next step's draft (auto-chain per B3)
    const nextStep = steps.find((s: any, i: number) => {
      const o = Number(s.order ?? 0) || (i + 1);
      return o > ord;
    });
    if (nextStep) {
      const nOrd = Number(nextStep.order ?? 0) || (steps.indexOf(nextStep) + 1);
      // Auto-run draft (no Q&A for steps 2+)
      stepExecute.mutate(
        { missionId, squadSlug: squad.slug, stepOrder: nOrd, mode: "run", userInput: "" },
        { onSuccess: () => progressQuery.refetch?.() },
      );
    }
  };

  const handleRegenerate = async () => {
    if (!viewStep) return;
    const ord = Number(viewStep.order ?? viewOrder) || viewOrder;
    await stepExecute.mutateAsync({
      missionId, squadSlug: squad.slug, stepOrder: ord,
      mode: "run", userInput: inputDraft,
    });
    progressQuery.refetch?.();
  };

  const isStepUnlocked = (ord: number): boolean => {
    if (ord === 1) return true;
    // unlocked if previous step is confirmed
    const prev = byOrder.get(ord - 1);
    return prev?.status === "confirmed";
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const squadName = pickLocaleText(squad.name, lang) || squad.slug;

  return (
    <div className="h-full flex flex-col bg-mos-cream">
      {/* Header bar */}
      <div className="px-6 py-3 border-b border-mos-hair bg-white flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[0.72rem] text-mos-muted">Mission #{missionId} · {squadName}</div>
          <div className="font-display text-[1.0rem] text-mos-ink truncate">
            {viewStep ? (viewStep.name ?? `Step ${viewOrder}`) : "—"}
          </div>
        </div>
        <div className="text-[0.72rem] text-mos-muted shrink-0">
          {viewOrder} / {totalSteps}
        </div>
      </div>

      {/* Main canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {!viewStep ? (
          <div className="text-mos-muted text-center py-10">這個小組沒有可執行的步驟。</div>
        ) : (
          <StepCanvas
            step={viewStep}
            progress={viewProgress}
            tone={tone}
            inputDraft={inputDraft}
            setInputDraft={setInputDraft}
            isPending={stepExecute.isPending}
            unlocked={isStepUnlocked(viewOrder)}
            onAnswerAndRun={handleAnswerAndRun}
            onConfirm={handleConfirm}
            onRegenerate={handleRegenerate}
          />
        )}
      </div>

      {/* Bottom timeline */}
      <div className="px-6 py-3 border-t border-mos-hair bg-white flex items-center gap-2 overflow-x-auto">
        {steps.map((s: any, i: number) => {
          const ord = Number(s.order ?? 0) || (i + 1);
          const p = byOrder.get(ord);
          const status: StepStatus = p?.status ?? "pending";
          const isActive = ord === viewOrder;
          const dot = status === "confirmed" ? "✓"
                    : status === "drafted"   ? "●"
                    : status === "asking"    ? "?"
                    :                          "○";
          const reachable = isStepUnlocked(ord) || status !== "pending";
          return (
            <button
              key={ord}
              disabled={!reachable}
              onClick={() => setViewOrder(ord)}
              title={s.name ?? `Step ${ord}`}
              className={[
                "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.72rem] border transition",
                isActive
                  ? "bg-mos-ink text-white border-mos-ink"
                  : status === "confirmed"
                    ? "bg-white text-mos-ink border-mos-ink/40 hover:border-mos-ink"
                    : reachable
                      ? "bg-white text-mos-ink border-mos-hair hover:border-mos-ink"
                      : "bg-white text-mos-muted border-mos-hair opacity-50 cursor-not-allowed",
              ].join(" ")}
            >
              <span className="font-mono">{dot}</span>
              <span>{ord}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        {allDone && (
          <button
            disabled
            title="即將推出：PDF / Notion / Slides"
            className="shrink-0 px-3 py-1.5 text-[0.78rem] bg-mos-orange text-white rounded-full hover:bg-mos-orange-hover transition disabled:opacity-60"
          >
            匯出全部成果
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── StepCanvas ─────────────────────────── */

function StepCanvas({
  step, progress, tone, inputDraft, setInputDraft,
  isPending, unlocked, onAnswerAndRun, onConfirm, onRegenerate,
}: {
  step: any;
  progress: any | undefined;
  tone: any;
  inputDraft: string;
  setInputDraft: (s: string) => void;
  isPending: boolean;
  unlocked: boolean;
  onAnswerAndRun: () => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}) {
  const status: StepStatus = progress?.status ?? "pending";
  const agentName = progress?.agentName ?? step.assignedAgentName ?? "AI 專員";
  const out = progress?.agentOutput ?? "";

  if (!unlocked) {
    return (
      <div className="border border-dashed border-mos-hair rounded-lg p-8 text-center text-mos-muted bg-white">
        <div className="text-[2rem] mb-2">○</div>
        <div className="text-[0.92rem]">先完成上一步驟才能開始這一步。</div>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Agent identity */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[0.86rem]"
          style={{ background: tone.bg }}
        >
          {(agentName.charAt(0) || "A").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-[0.92rem] font-semibold text-mos-ink">{agentName}</div>
          <div className="text-[0.7rem] text-mos-muted">
            {step.outputType ? `產出：${step.outputType}` : ""}
            {step.tools?.length ? ` · 工具：${step.tools.slice(0, 2).join(", ")}` : ""}
          </div>
        </div>
      </div>

      {/* Content area driven by status */}
      {status === "pending" && (
        <div className="bg-white border border-mos-hair rounded-lg p-6 text-mos-muted text-[0.86rem]">
          {isPending ? "正在準備這一步…" : "等待下一個指令…"}
        </div>
      )}

      {status === "asking" && (
        <div className="space-y-3">
          {/* Agent question bubble */}
          <div className="bg-white border border-mos-hair rounded-lg p-4 text-[0.92rem] text-mos-body whitespace-pre-wrap leading-relaxed">
            {progress?.agentOutput || "..."}
          </div>
          {/* User answer textarea */}
          <textarea
            value={inputDraft}
            onChange={(e) => setInputDraft(e.target.value)}
            placeholder="輸入你的回答…（可以是品牌背景、目標受眾、想達成的結果，越具體越好）"
            rows={4}
            className="w-full px-4 py-3 text-[0.86rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 transition resize-none"
          />
          <button
            onClick={onAnswerAndRun}
            disabled={isPending || !inputDraft.trim()}
            className="w-full py-2.5 text-white font-semibold text-[0.86rem] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
            style={{ background: "linear-gradient(135deg, #EA580C, #F97316)" }}
          >
            {isPending ? "生成中…" : "回答並產出本步驟"}
          </button>
        </div>
      )}

      {status === "drafted" && (
        <div className="space-y-3">
          {/* Output card */}
          <div className="bg-white border border-mos-hair rounded-lg p-5">
            <div className="text-[0.7rem] text-mos-muted mb-2 inline-flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              草稿 · 待確認
            </div>
            <div className="text-[0.9rem] text-mos-body whitespace-pre-wrap leading-relaxed">
              {out}
            </div>
          </div>
          {/* Optional refinement input */}
          <textarea
            value={inputDraft}
            onChange={(e) => setInputDraft(e.target.value)}
            placeholder="想調整方向？輸入備註後按「重新生成」（留空直接確認也可以）"
            rows={2}
            className="w-full px-4 py-2.5 text-[0.84rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 transition resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={onRegenerate}
              disabled={isPending}
              className="flex-1 py-2.5 text-[0.86rem] text-mos-ink bg-white border border-mos-hair hover:border-mos-ink rounded-full transition disabled:opacity-50"
            >
              {isPending ? "生成中…" : "重新生成"}
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex-1 py-2.5 text-white font-semibold text-[0.86rem] transition hover:opacity-90 disabled:opacity-50 rounded-full"
              style={{ background: "linear-gradient(135deg, #EA580C, #F97316)" }}
            >
              確認，繼續下一步
            </button>
          </div>
        </div>
      )}

      {status === "confirmed" && (
        <div className="space-y-3">
          <div className="bg-white border border-emerald-300 rounded-lg p-5">
            <div className="text-[0.7rem] text-emerald-700 mb-2 inline-flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              已確認
            </div>
            <div className="text-[0.9rem] text-mos-body whitespace-pre-wrap leading-relaxed">
              {out}
            </div>
          </div>
          <button
            onClick={onRegenerate}
            disabled={isPending}
            className="w-full py-2 text-[0.82rem] text-mos-muted bg-white border border-mos-hair hover:border-mos-ink hover:text-mos-ink rounded-full transition disabled:opacity-50"
          >
            重新生成這一步
          </button>
        </div>
      )}
    </div>
  );
}
