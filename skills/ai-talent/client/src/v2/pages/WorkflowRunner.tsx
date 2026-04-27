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
  /** Picker callback after delete — clears activeMissionId + URL. */
  onMissionDeleted?: () => void;
  /** Picker callback after duplicate — switches to the new mission. */
  onMissionDuplicated?: (newMissionId: number) => void;
}

export default function WorkflowRunner({
  missionId, squad, lang, onMissionDeleted, onMissionDuplicated,
}: WorkflowRunnerProps) {
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
  const stepUndo = (trpc.squad as any).stepUndo?.useMutation
    ? (trpc.squad as any).stepUndo.useMutation()
    : { mutateAsync: async () => ({ ok: false }), isPending: false };

  // Autosave indicator: pulse "✓ 已儲存" briefly after every successful mutation.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (stepExecute.isSuccess || stepUndo.isSuccess) setSavedAt(Date.now());
  }, [stepExecute.isSuccess, stepUndo.isSuccess]);

  // ── Mission row (for File menu rename/title display) ──────────────────
  const missionQuery = (trpc as any).mission?.getById?.useQuery
    ? (trpc as any).mission.getById.useQuery({ id: missionId }, { refetchOnWindowFocus: false })
    : { data: null, refetch: () => {} };
  const missionTitle = (missionQuery.data as any)?.title ?? "";

  // ── File-menu mutations ───────────────────────────────────────────────
  const missionUpdate = (trpc as any).mission?.update?.useMutation?.() ?? { mutateAsync: async () => null };
  const missionDuplicate = (trpc as any).mission?.duplicate?.useMutation?.() ?? { mutateAsync: async () => null };
  const missionDelete = (trpc as any).mission?.delete?.useMutation?.() ?? { mutateAsync: async () => null };

  // ── Mary Allen drawer ─────────────────────────────────────────────────
  const askMary = (trpc.squad as any).askMary?.useMutation
    ? (trpc.squad as any).askMary.useMutation()
    : { mutateAsync: async () => ({ answer: "" }), isPending: false };
  const [maryOpen, setMaryOpen] = useState(false);
  const [maryQ, setMaryQ] = useState("");
  const [maryHistory, setMaryHistory] = useState<{ q: string; a: string }[]>([]);

  // ── Analytics modal ───────────────────────────────────────────────────
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const analyticsQuery = (trpc.squad as any).missionAnalytics?.useQuery
    ? (trpc.squad as any).missionAnalytics.useQuery(
        { missionId },
        { enabled: analyticsOpen, refetchOnWindowFocus: false },
      )
    : { data: null };

  // ── Presentation mode ─────────────────────────────────────────────────
  const [presentOpen, setPresentOpen] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);

  // ── File menu open state ──────────────────────────────────────────────
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fileMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [fileMenuOpen]);

  const handleRename = async () => {
    setFileMenuOpen(false);
    const next = window.prompt("新的任務名稱", missionTitle);
    if (!next || next === missionTitle) return;
    await missionUpdate.mutateAsync({ id: missionId, title: next });
    missionQuery.refetch?.();
  };
  const handleDuplicate = async () => {
    setFileMenuOpen(false);
    const res = await missionDuplicate.mutateAsync({ id: missionId });
    if (res?.id) onMissionDuplicated?.(Number(res.id));
  };
  const handleDelete = async () => {
    setFileMenuOpen(false);
    if (!window.confirm("確定要刪除這個任務？所有步驟產出都會一起被刪除，無法復原。")) return;
    await missionDelete.mutateAsync({ id: missionId });
    onMissionDeleted?.();
  };
  const handleExport = () => {
    setFileMenuOpen(false);
    window.alert("匯出 PDF 即將推出 — 我們會把每一步的成果合成一份提案書。");
  };
  const handleAskMary = async () => {
    if (!maryQ.trim()) return;
    const q = maryQ;
    setMaryQ("");
    setMaryHistory((h) => [...h, { q, a: "…" }]);
    const res: any = await askMary.mutateAsync({ missionId, question: q });
    setMaryHistory((h) => {
      const copy = [...h];
      copy[copy.length - 1] = { q, a: String(res?.answer ?? "(沒有回應)") };
      return copy;
    });
  };

  // Build a quick lookup: stepOrder → progress row
  const byOrder = useMemo(() => {
    const map = new Map<number, any>();
    for (const r of (progressQuery.data ?? []) as any[]) {
      map.set(r.stepOrder, r);
    }
    return map;
  }, [progressQuery.data]);

  // Slides for presentation = confirmed steps in order
  const slides = useMemo(() => {
    return steps
      .map((s: any, i: number) => {
        const ord = Number(s.order ?? 0) || (i + 1);
        const p = byOrder.get(ord);
        return { ord, name: pickLocaleText(s.name, lang) || `Step ${ord}`, output: p?.agentOutput ?? "", agentName: p?.agentName ?? "", status: p?.status ?? "pending" };
      })
      .filter((s) => s.status === "confirmed" || s.status === "drafted");
  }, [steps, byOrder, lang]);

  useEffect(() => {
    if (!presentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setPresentIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPresentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        setPresentOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [presentOpen, slides.length]);

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

  const handleUndo = async () => {
    if (!viewStep) return;
    const ord = Number(viewStep.order ?? viewOrder) || viewOrder;
    const res = await stepUndo.mutateAsync({ missionId, stepOrder: ord });
    if ((res as any)?.ok) progressQuery.refetch?.();
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
      <div className="px-6 py-3 border-b border-mos-hair bg-white flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[0.72rem] text-mos-muted truncate">
            {missionTitle ? `${missionTitle} · ` : `Mission #${missionId} · `}{squadName}
          </div>
          <div className="font-display text-[1.0rem] text-mos-ink truncate">
            {viewStep ? (pickLocaleText(viewStep.name, lang) || `Step ${viewOrder}`) : "—"}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {savedAt && <SavedBadge ts={savedAt} />}

          {/* File menu (Canva 檔案) */}
          <div ref={fileMenuRef} className="relative">
            <button
              onClick={() => setFileMenuOpen((v) => !v)}
              title="檔案：重新命名 / 複製 / 匯出 / 刪除"
              className="px-2.5 py-1 text-[0.74rem] text-mos-ink hover:bg-mos-ink/5 rounded transition inline-flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>檔案</span>
              <span className="text-mos-muted text-[0.68rem]">▾</span>
            </button>
            {fileMenuOpen && (
              <div className="absolute right-0 top-[110%] z-40 min-w-[220px] bg-white border border-mos-hair rounded-md shadow-lg py-1">
                <FileMenuItem onClick={handleRename}>重新命名</FileMenuItem>
                <FileMenuItem onClick={handleDuplicate}>複製為新任務</FileMenuItem>
                <FileMenuItem onClick={handleExport}>匯出 PDF<span className="text-mos-muted text-[0.7rem] ml-2">即將推出</span></FileMenuItem>
                <div className="border-t border-mos-hair my-1" />
                <FileMenuItem onClick={handleDelete} danger>刪除任務</FileMenuItem>
              </div>
            )}
          </div>

          {/* Analytics (Canva 分析) */}
          <button
            onClick={() => setAnalyticsOpen(true)}
            title="分析：步驟耗時、AI 用量"
            className="px-2.5 py-1 text-[0.74rem] text-mos-ink hover:bg-mos-ink/5 rounded transition inline-flex items-center gap-1"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </svg>
            <span>分析</span>
          </button>

          {/* Presentation mode (Canva 展示簡報) */}
          <button
            onClick={() => { setPresentIndex(0); setPresentOpen(true); }}
            disabled={slides.length === 0}
            title="進入簡報模式：全螢幕一頁一個 step 結果"
            className="px-2.5 py-1 text-[0.74rem] text-white rounded transition inline-flex items-center gap-1 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #5B3CC8, #7C4DFF)" }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" stroke="none">
              <path d="M5 3v18l15-9z" />
            </svg>
            <span>簡報</span>
          </button>

          <div className="text-[0.72rem] text-mos-muted">
            {viewOrder} / {totalSteps}
          </div>
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
            isUndoing={stepUndo.isPending}
            unlocked={isStepUnlocked(viewOrder)}
            onAnswerAndRun={handleAnswerAndRun}
            onConfirm={handleConfirm}
            onRegenerate={handleRegenerate}
            onUndo={handleUndo}
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
          const stepName = pickLocaleText(s.name, lang) || `Step ${ord}`;
          const previewText = (p?.agentOutput ?? "").slice(0, 200);
          return (
            <div key={ord} className="relative group shrink-0">
              <button
                disabled={!reachable}
                onClick={() => setViewOrder(ord)}
                title={stepName}
                className={[
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.72rem] border transition max-w-[180px]",
                  isActive
                    ? "bg-mos-ink text-white border-mos-ink"
                    : status === "confirmed"
                      ? "bg-white text-mos-ink border-mos-ink/40 hover:border-mos-ink"
                      : reachable
                        ? "bg-white text-mos-ink border-mos-hair hover:border-mos-ink"
                        : "bg-white text-mos-muted border-mos-hair opacity-50 cursor-not-allowed",
                ].join(" ")}
              >
                <span className="font-mono shrink-0">{dot}</span>
                <span className="shrink-0 opacity-70">{ord}</span>
                <span className="truncate">{stepName}</span>
              </button>
              {/* Hover preview — shows the first 200 chars of this step's output */}
              {previewText && (
                <div className="invisible group-hover:visible absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 w-[280px] p-3 bg-mos-ink text-white rounded-md shadow-xl text-[0.74rem] leading-relaxed whitespace-pre-wrap pointer-events-none">
                  <div className="text-[0.66rem] text-white/60 mb-1 tracking-wider uppercase">Step {ord} · {stepName}</div>
                  <div className="line-clamp-6">{previewText}</div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-mos-ink" />
                </div>
              )}
            </div>
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

      {/* ── Floating "問 Mary Allen" ─────────────────────────────────── */}
      {!presentOpen && (
        <button
          onClick={() => setMaryOpen((v) => !v)}
          title="問 Mary Allen — SoWork 品牌策略召集人"
          className="absolute bottom-20 right-6 z-40 px-4 h-12 rounded-full text-white shadow-lg hover:scale-105 transition flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, #5B3CC8, #EA580C)" }}
        >
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[0.86rem] font-bold">M</span>
          <span className="text-[0.82rem] font-semibold">問 Mary Allen</span>
        </button>
      )}
      {maryOpen && (
        <MaryDrawer
          history={maryHistory}
          q={maryQ}
          setQ={setMaryQ}
          isPending={askMary.isPending}
          onClose={() => setMaryOpen(false)}
          onAsk={handleAskMary}
        />
      )}

      {/* ── Analytics modal ──────────────────────────────────────────── */}
      {analyticsOpen && (
        <AnalyticsModal
          data={analyticsQuery.data}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}

      {/* ── Presentation mode overlay ────────────────────────────────── */}
      {presentOpen && slides.length > 0 && (
        <PresentationOverlay
          slides={slides}
          index={presentIndex}
          onIndex={setPresentIndex}
          onClose={() => setPresentOpen(false)}
          missionTitle={missionTitle || squadName}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── FileMenuItem ─────────────────────────── */

function FileMenuItem({
  children, onClick, danger,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2 text-[0.78rem] hover:bg-mos-paper transition flex items-center",
        danger ? "text-red-600 hover:bg-red-50" : "text-mos-body",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── MaryDrawer ─────────────────────────── */
// Right-side drawer for the floating Mary Allen helper. Q&A history is
// kept in client state only (refresh wipes it). Mary fetches mission
// context fresh on every call via `squad.askMary`.

function MaryDrawer({
  history, q, setQ, isPending, onClose, onAsk,
}: {
  history: { q: string; a: string }[];
  q: string;
  setQ: (s: string) => void;
  isPending: boolean;
  onClose: () => void;
  onAsk: () => void;
}) {
  return (
    <div className="absolute top-0 right-0 bottom-0 z-40 w-[400px] bg-white border-l border-mos-hair shadow-2xl flex flex-col animate-[slideIn_0.2s_ease]">
      <div className="px-4 py-3 border-b border-mos-hair flex items-center justify-between bg-gradient-to-r from-[#5B3CC8] to-[#EA580C] text-white">
        <div>
          <div className="font-semibold text-[0.92rem]">Mary Allen</div>
          <div className="text-[0.66rem] opacity-80">SoWork 品牌策略召集人</div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded hover:bg-white/15 transition">
          <svg viewBox="0 0 24 24" className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 && (
          <div className="text-center text-mos-muted text-[0.84rem] py-8">
            <div className="text-[2rem] mb-2">M</div>
            <div className="font-medium mb-1 text-mos-ink">嗨，我是 Mary。</div>
            <div className="leading-relaxed">關於這個任務，你可以問我任何事 — 「這一步為什麼這樣寫」「幫我重點摘要目前進度」「下一步該怎麼接」。</div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-mos-paper rounded-lg px-3 py-2 text-[0.84rem] text-mos-ink">{m.q}</div>
            <div className="text-[0.86rem] text-mos-body whitespace-pre-wrap leading-relaxed">{m.a}</div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-mos-hair">
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onAsk();
            }
          }}
          placeholder="問 Mary…（⌘ + Enter 送出）"
          rows={3}
          className="w-full px-3 py-2 text-[0.84rem] bg-mos-cream border border-mos-hair rounded-lg focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 resize-none"
        />
        <button
          onClick={onAsk}
          disabled={isPending || !q.trim()}
          className="w-full mt-2 py-2 text-white text-[0.84rem] font-semibold rounded-full disabled:opacity-50 transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #5B3CC8, #EA580C)" }}
        >
          {isPending ? "Mary 思考中…" : "問 Mary"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── AnalyticsModal ─────────────────────────── */

function AnalyticsModal({ data, onClose }: { data: any; onClose: () => void }) {
  const totalSteps = Number(data?.totalSteps ?? 0);
  const counts = (data?.counts ?? {}) as Record<string, number>;
  const steps = (data?.steps ?? []) as any[];
  const totalChars = steps.reduce((sum, s) => sum + Number(s.outputLen ?? 0), 0);
  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[640px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-mos-hair flex items-center justify-between">
          <div className="font-display text-[1.0rem] text-mos-ink">任務分析</div>
          <button onClick={onClose} className="text-mos-muted hover:text-mos-ink">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 grid grid-cols-3 gap-3 border-b border-mos-hair">
          <Stat label="步驟總數" value={String(totalSteps)} />
          <Stat label="已確認" value={String(counts.confirmed ?? 0)} />
          <Stat label="累計字數" value={totalChars > 0 ? `${(totalChars / 1000).toFixed(1)}k` : "0"} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[0.76rem] text-mos-muted mb-2 tracking-[0.12em] uppercase">每步詳情</div>
          {steps.length === 0 ? (
            <div className="text-mos-muted text-[0.84rem] text-center py-8">還沒有任何步驟產出。</div>
          ) : (
            <table className="w-full text-[0.82rem]">
              <thead className="text-[0.7rem] text-mos-muted uppercase tracking-wider">
                <tr>
                  <th className="text-left py-1.5">#</th>
                  <th className="text-left py-1.5">狀態</th>
                  <th className="text-left py-1.5">AI 專員</th>
                  <th className="text-right py-1.5">產出字數</th>
                  <th className="text-right py-1.5">最後更新</th>
                </tr>
              </thead>
              <tbody className="text-mos-body">
                {steps.map((s) => (
                  <tr key={s.stepOrder} className="border-t border-mos-hair">
                    <td className="py-2">{s.stepOrder}</td>
                    <td className="py-2">{statusBadge(s.status)}</td>
                    <td className="py-2 truncate max-w-[160px]">{s.agentName || "—"}</td>
                    <td className="py-2 text-right">{s.outputLen}</td>
                    <td className="py-2 text-right text-mos-muted text-[0.72rem]">
                      {s.updatedAt ? new Date(s.updatedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 text-[0.7rem] text-mos-muted">
            Token 計費 / 各 step 耗時統計即將推出。
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mos-paper rounded p-3 text-center">
      <div className="font-display text-[1.4rem] text-mos-ink">{value}</div>
      <div className="text-[0.7rem] text-mos-muted mt-0.5">{label}</div>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "待執行", cls: "bg-mos-paper text-mos-muted" },
    asking:    { label: "提問中", cls: "bg-amber-100 text-amber-700" },
    drafted:   { label: "草稿",   cls: "bg-blue-100 text-blue-700" },
    confirmed: { label: "已確認", cls: "bg-emerald-100 text-emerald-700" },
  };
  const m = map[s] ?? { label: s, cls: "bg-mos-paper text-mos-muted" };
  return <span className={`inline-block px-2 py-0.5 rounded text-[0.7rem] ${m.cls}`}>{m.label}</span>;
}

/* ─────────────────────────── PresentationOverlay ─────────────────────────── */

function PresentationOverlay({
  slides, index, onIndex, onClose, missionTitle,
}: {
  slides: { ord: number; name: string; output: string; agentName: string; status: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  missionTitle: string;
}) {
  const slide = slides[Math.min(index, slides.length - 1)];
  return (
    <div className="absolute inset-0 z-50 bg-mos-ink text-white flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-white/10">
        <div className="text-[0.74rem] tracking-[0.18em] uppercase text-white/60">{missionTitle}</div>
        <div className="flex items-center gap-4">
          <div className="text-[0.78rem] text-white/70">{index + 1} / {slides.length}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white" title="退出 (Esc)">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Slide body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-12 py-10 max-w-[960px] w-full mx-auto">
        <div className="text-[0.82rem] tracking-[0.18em] uppercase text-white/50 mb-3">
          Step {slide.ord} · {slide.agentName}
        </div>
        <h1 className="font-display text-[2.2rem] leading-tight mb-6">
          {slide.name}
        </h1>
        <div className="text-[1.05rem] leading-[1.85] whitespace-pre-wrap text-white/90">
          {slide.output || "(這一步還沒有產出)"}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between gap-3">
        <button
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[0.82rem] disabled:opacity-30 transition"
        >
          ← 上一頁
        </button>
        <div className="flex-1 flex items-center gap-1.5 justify-center overflow-x-auto">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndex(i)}
              className={[
                "h-1.5 rounded-full transition",
                i === index ? "bg-white w-8" : "bg-white/30 w-3 hover:bg-white/50",
              ].join(" ")}
            />
          ))}
        </div>
        <button
          onClick={() => onIndex(Math.min(slides.length - 1, index + 1))}
          disabled={index >= slides.length - 1}
          className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[0.82rem] disabled:opacity-30 transition"
        >
          下一頁 →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── SavedBadge ─────────────────────────── */
// Tiny "已自動儲存 N 秒前" indicator that pulses after every successful
// stepExecute / stepUndo. Mirrors Notion's autosave UX.

function SavedBadge({ ts }: { ts: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  const label = sec < 5 ? "剛剛已儲存" : sec < 60 ? `${sec} 秒前已儲存` : `${Math.floor(sec / 60)} 分前已儲存`;
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] text-emerald-600">
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
      {label}
    </span>
  );
}

/* ─────────────────────────── StepCanvas ─────────────────────────── */

function StepCanvas({
  step, progress, tone, inputDraft, setInputDraft,
  isPending, isUndoing, unlocked,
  onAnswerAndRun, onConfirm, onRegenerate, onUndo,
}: {
  step: any;
  progress: any | undefined;
  tone: any;
  inputDraft: string;
  setInputDraft: (s: string) => void;
  isPending: boolean;
  isUndoing: boolean;
  unlocked: boolean;
  onAnswerAndRun: () => void;
  onConfirm: () => void;
  onRegenerate: () => void;
  onUndo: () => void;
}) {
  const status: StepStatus = progress?.status ?? "pending";
  const agentName = progress?.agentName ?? step.assignedAgentName ?? "AI 專員";
  const out = progress?.agentOutput ?? "";
  const historyCount: number = Number(progress?.historyCount ?? 0);

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
            {historyCount > 0 && (
              <button
                onClick={onUndo}
                disabled={isPending || isUndoing}
                title={`回到上一版（共 ${historyCount} 個歷史版本）`}
                className="shrink-0 px-3 py-2.5 text-[0.86rem] text-mos-muted hover:text-mos-ink bg-white border border-mos-hair hover:border-mos-ink rounded-full transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" />
                  <path d="M3 13a9 9 0 1 0 3-7L3 9" />
                </svg>
                <span>上一版</span>
              </button>
            )}
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
