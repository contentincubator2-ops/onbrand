/**
 * QuickTasksPage — 30 秒產出 · 多 Agent 分工合作管線
 *
 * 視覺敘事：
 *   Stage 1（並行）: 偵察兵同時掃情報   → 卡片同時亮
 *   Stage 2（並行）: 草稿手寫初稿        → 卡片同時亮
 *   Stage N（最後）: Orchestrator 收尾   → 黑底主編卡，倒數收齊一份交付
 *
 * 設計：
 *   - 編輯級黑白：白底 + 黑字 + 紫 #5B3CC8 強調
 *   - 自由輸入框 → 路由到 task
 *   - Tile 編號 01-10
 *   - RunPanel 是大頁，左 brief / 右 stage 軌道
 *   - 每個 stage 一條橫向卡片群，stage 之間有 ↓ 箭頭
 *   - Orchestrator stage 卡片黑底白字，副標「最終交付」
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";

/* ─────────────────────────── Types ─────────────────────────────────────── */

type TaskField = {
  key: string;
  label: string;
  kind: "text" | "longtext" | "url" | "select" | "number";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  default?: string | number;
};

type AgentTone = "research" | "write" | "analyze" | "craft" | "orchestrate";

type AgentMeta = {
  id: string;
  name: string;
  role: string;
  skill: string;
  avatar: string;
  tone: AgentTone;
  provider: string;
};

type StageMeta = {
  id: string;
  label: string;
  description: string;
  isOrchestrator: boolean;
  agents: AgentMeta[];
};

type TaskMeta = {
  id: string;
  label: string;
  squadName: string;
  squadTagline: string;
  etaSeconds: number;
  finalKind: "text" | "swot" | "persona-card" | "swatches" | "name-cards" | "rich-text";
  fields: TaskField[];
  stages: StageMeta[];
};

const TONE_COLOR: Record<AgentTone, string> = {
  research: "#2EA4A0",     // teal
  analyze:  "#3D6BCC",     // indigo
  write:    "#E07AAE",     // rose
  craft:    "#E8A23B",     // amber
  orchestrate: "#5B3CC8",  // brand purple
};
const TONE_LABEL: Record<AgentTone, string> = {
  research: "RESEARCH",
  analyze: "ANALYZE",
  write: "WRITE",
  craft: "CRAFT",
  orchestrate: "ORCHESTRATE",
};

/**
 * PortraitAvatar — Agentforce-style cartoon portrait inside tone-colored ring.
 * Uses DiceBear avataaars (no API key, free, deterministic per seed).
 */
function PortraitAvatar({
  name, tone, size, glow = false, pulse = false, dim = false,
}: {
  name: string;
  tone: AgentTone;
  size: number;
  glow?: boolean;     // delivered state — outer accent ring
  pulse?: boolean;    // working state — animate ring
  dim?: boolean;      // queued state — dim
}) {
  const ringColor = TONE_COLOR[tone];
  const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&radius=50&backgroundColor=ffffff,f5f5f5,fef9e7,e8f5e9`;
  const ringWidth = Math.max(2, Math.round(size * 0.08));
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size, height: size, flexShrink: 0,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {pulse && (
        <span
          aria-hidden
          className="animate-ping"
          style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: ringColor, opacity: 0.4,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          display: "block",
          width: size, height: size,
          borderRadius: "50%",
          border: `${ringWidth}px solid ${ringColor}`,
          background: "#F2F2F2",
          overflow: "hidden",
          boxShadow: glow ? `0 0 0 2px white, 0 0 0 4px ${ACCENT}` : undefined,
        }}
      >
        <img
          src={url}
          alt={name}
          width={size - ringWidth * 2}
          height={size - ringWidth * 2}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
          loading="lazy"
        />
      </span>
    </span>
  );
}

type AgentResult = {
  taskId: string;
  stageId: string;
  stageLabel: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentSkill: string;
  agentAvatar: string;
  agentTone: AgentTone;
  output: string;
  structured: any | null;
  provider: string;
  model: string;
  fellBack: boolean;
  tookMs: number;
  brandInjected: boolean;
};

type AgentState =
  | { status: "queued" }
  | { status: "working"; startedAt: number }
  | { status: "delivered"; result: AgentResult }
  | { status: "failed"; error: string };

const PROVIDER_LABEL: Record<string, string> = {
  openai: "GPT", google: "Gemini", qwen: "Qwen", zhipu: "GLM",
  cohere: "Cohere", perplexity: "Perplexity", forge: "Forge",
};

const ACCENT = "#5B3CC8";
const HAIR = "#E5E5E5";
const INK = "#0E0E10";

/* ───────────────────────── Page ────────────────────────────────────────── */

export default function QuickTasksPage() {
  const tasksQuery = (trpc as any).quickTask?.list?.useQuery?.(undefined, {
    refetchOnWindowFocus: false,
  }) ?? { data: [], isLoading: false };

  const tasks: TaskMeta[] = (tasksQuery.data as any[]) ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<Record<string, string | number>>({});
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId]
  );

  return (
    <main className="bg-white pb-24" style={{ color: INK }}>
      {/* HERO */}
      <section className="border-b" style={{ borderColor: HAIR }}>
        <div className="max-w-[1200px] mx-auto px-8 pt-20 pb-12">
          <div className="font-display text-[0.6rem] tracking-[0.32em] uppercase" style={{ color: "#888" }}>
            QUICK · 30s DELIVERY
          </div>
          <h1 className="mt-3 font-display text-[3.4rem] leading-[1.02] tracking-[-0.025em]">
            30 秒產出
          </h1>
          <p className="mt-4 text-[1rem] leading-relaxed" style={{ color: "#444", maxWidth: 680 }}>
            每件任務都是一個已經分工好的 Squad — 研究員、寫手、主編各司其職。
            <br />
            按 Squad 內建 workflow 接力完成，最後 orchestrator 收尾，交一份可用的稿。
          </p>

          <FreeInputBar
            onRoute={(taskId, inputs) => { setPrefilled(inputs); setActiveId(taskId); }}
            disabled={tasksQuery.isLoading}
          />
        </div>
      </section>

      {/* TILE MENU */}
      <section className="max-w-[1200px] mx-auto px-8 mt-14">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-[1.5rem] tracking-[-0.015em]">所有任務</h2>
          <span className="text-[0.72rem] tracking-[0.2em] uppercase" style={{ color: "#888" }}>
            {tasks.length} TASKS · 全部 &lt; 30s
          </span>
        </div>

        {tasksQuery.isLoading && (
          <div className="text-[0.82rem] py-12" style={{ color: "#888" }}>載入任務目錄…</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: HAIR }}>
          {tasks.map((t, i) => {
            const totalAgents = t.stages.reduce((n, s) => n + s.agents.length, 0);
            return (
              <button
                key={t.id}
                onClick={() => { setPrefilled({}); setActiveId(t.id); }}
                className="group text-left bg-white p-6 hover:bg-[#FAFAFA] transition relative"
              >
                <div className="flex items-start justify-between">
                  <div className="font-display text-[2rem] tracking-[-0.02em]" style={{ color: ACCENT }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="text-[0.66rem] tracking-[0.22em] uppercase" style={{ color: "#888" }}>
                    ~ {t.etaSeconds}s
                  </div>
                </div>
                <div className="mt-4 text-[1.05rem] font-medium tracking-[-0.005em]">
                  {t.squadName}
                </div>
                <div className="mt-1 text-[0.78rem]" style={{ color: "#666" }}>
                  {t.squadTagline}
                </div>

                {/* Member avatars stack */}
                <div className="mt-4 flex items-center gap-1.5">
                  {t.stages.flatMap((s) => s.agents).map((a) => (
                    <span key={a.id} title={`${a.name} · ${a.role}`}>
                      <PortraitAvatar name={a.name} tone={a.tone} size={32} />
                    </span>
                  ))}
                  <span className="ml-1 text-[0.7rem]" style={{ color: "#999" }}>
                    {totalAgents} 位
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-1.5 text-[0.7rem] tracking-[0.16em] uppercase opacity-0 group-hover:opacity-100 transition" style={{ color: ACCENT }}>
                  派出 agent <span aria-hidden>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {activeTask && (
        <RunPanel task={activeTask} prefilled={prefilled} onClose={() => setActiveId(null)} />
      )}
    </main>
  );
}

/* ─────────────────────────── Free input ────────────────────────────────── */

function FreeInputBar({
  onRoute, disabled,
}: {
  onRoute: (taskId: string, inputs: Record<string, string | number>) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const routeMut = (trpc as any).quickTask?.route?.useMutation?.();

  const submit = async () => {
    if (!text.trim() || busy || !routeMut) return;
    setBusy(true); setHint(null);
    try {
      const r = await routeMut.mutateAsync({ text: text.trim() });
      if (!r.taskId || r.confidence < 0.4) {
        setHint("沒有完全匹配的任務 — 請從下方選一件，或換個說法。");
      } else {
        onRoute(r.taskId, r.inputs ?? {});
        setText("");
      }
    } catch (e: any) {
      setHint(`路由失敗：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10">
      <div
        className="flex items-center gap-3 bg-white px-5 py-4 transition focus-within:shadow-[0_0_0_2px_rgba(91,60,200,0.18)]"
        style={{ border: `1px solid ${INK}` }}
      >
        <span aria-hidden style={{ color: ACCENT }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          disabled={disabled || busy}
          placeholder="例：幫 NIKE 寫 5 個 IG hook，主題是夏季新鞋"
          className="flex-1 outline-none text-[1.02rem] placeholder:text-[#9A9A9A] disabled:opacity-50 bg-transparent"
        />
        <button
          onClick={submit}
          disabled={disabled || busy || !text.trim()}
          className="px-5 py-2 text-[0.74rem] tracking-[0.2em] uppercase transition disabled:opacity-40"
          style={{ background: INK, color: "white" }}
        >
          {busy ? "路由中…" : "派 Agent"}
        </button>
      </div>
      {hint && <div className="mt-2 text-[0.78rem]" style={{ color: "#888" }}>{hint}</div>}
      <div className="mt-2 text-[0.7rem] tracking-[0.16em] uppercase" style={{ color: "#AAA" }}>
        AUTO-MATCH · 你的品牌大腦會自動帶入
      </div>
    </div>
  );
}

/* ─────────────────────────── Run panel ─────────────────────────────────── */

function RunPanel({
  task, prefilled, onClose,
}: { task: TaskMeta; prefilled: Record<string, string | number>; onClose: () => void }) {
  const [inputs, setInputs] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of task.fields) if (f.default !== undefined) init[f.key] = f.default;
    return { ...init, ...prefilled };
  });

  // states keyed by `${stageId}:${agentId}`
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [hasRun, setHasRun] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState<number>(-1);

  const runMut = (trpc as any).quickTask.runAgent.useMutation();

  const requiredOk = task.fields
    .filter((f) => f.required)
    .every((f) => {
      const v = inputs[f.key];
      return v !== undefined && String(v).trim().length > 0;
    });

  const k = (stageId: string, agentId: string) => `${stageId}:${agentId}`;

  const finalAgent = useMemo(() => {
    const last = task.stages[task.stages.length - 1];
    return last?.agents[last.agents.length - 1] ?? null;
  }, [task]);
  const finalState = finalAgent
    ? agentStates[k(task.stages[task.stages.length - 1].id, finalAgent.id)]
    : undefined;

  const runAll = async () => {
    setHasRun(true);
    // Reset
    const fresh: Record<string, AgentState> = {};
    for (const s of task.stages) for (const a of s.agents) fresh[k(s.id, a.id)] = { status: "queued" };
    setAgentStates(fresh);

    const prior: Array<{ stageLabel: string; agentName: string; agentRole: string; output: string }> = [];

    for (let si = 0; si < task.stages.length; si++) {
      const stage = task.stages[si];
      setActiveStageIdx(si);

      // Mark all this stage's agents working (staggered visual)
      stage.agents.forEach((a, idx) => {
        setTimeout(() => {
          setAgentStates((prev) => ({
            ...prev,
            [k(stage.id, a.id)]: { status: "working", startedAt: Date.now() },
          }));
        }, idx * 100);
      });

      // Fire all in parallel, await all
      const results = await Promise.all(
        stage.agents.map(async (a) => {
          try {
            const r = await runMut.mutateAsync({
              taskId: task.id,
              stageId: stage.id,
              agentId: a.id,
              inputs,
              prior: prior.slice(), // pass copy of accumulated prior
            });
            setAgentStates((prev) => ({ ...prev, [k(stage.id, a.id)]: { status: "delivered", result: r } }));
            return { ok: true as const, r };
          } catch (e: any) {
            setAgentStates((prev) => ({
              ...prev,
              [k(stage.id, a.id)]: { status: "failed", error: String(e?.message ?? e) },
            }));
            return { ok: false as const, error: String(e?.message ?? e), agentName: a.name };
          }
        })
      );

      // Add successful outputs to prior for next stage
      for (const item of results) {
        if (item.ok) {
          prior.push({
            stageLabel: stage.label,
            agentName: item.r.agentName,
            agentRole: item.r.agentRole,
            output: item.r.output,
          });
        }
      }

      // If ALL agents in this stage failed, stop the pipeline
      if (results.every((x) => !x.ok)) {
        setActiveStageIdx(-1);
        return;
      }
    }
    setActiveStageIdx(-1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white w-[min(1200px,96vw)] my-8 self-start"
        onClick={(e) => e.stopPropagation()}
        style={{ border: `1px solid ${INK}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: INK }}>
          <div className="flex items-center gap-5">
            {/* Squad member avatars stacked */}
            <div className="flex -space-x-2">
              {task.stages.flatMap((s) => s.agents).slice(0, 5).map((a) => (
                <PortraitAvatar key={a.id} name={a.name} tone={a.tone} size={42} />
              ))}
            </div>
            <div>
              <div className="text-[0.62rem] tracking-[0.28em] uppercase" style={{ color: "#888" }}>
                SQUAD · ~ {task.etaSeconds}s · {task.stages.length} 階段接力
              </div>
              <div className="font-display text-[1.4rem] tracking-[-0.015em] mt-0.5">{task.squadName}</div>
              <div className="text-[0.78rem]" style={{ color: "#666" }}>{task.squadTagline}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-[1.4rem] hover:opacity-60 transition" aria-label="關閉">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr]">
          {/* BRIEF */}
          <div className="p-8 border-r space-y-5" style={{ borderColor: HAIR }}>
            <div className="text-[0.66rem] tracking-[0.24em] uppercase" style={{ color: "#888" }}>BRIEF</div>
            {task.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={inputs[f.key]}
                onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))} />
            ))}
            <button
              onClick={runAll}
              disabled={!requiredOk || activeStageIdx >= 0}
              className="w-full mt-3 py-3 text-[0.78rem] tracking-[0.22em] uppercase disabled:opacity-40 transition"
              style={{ background: INK, color: "white" }}
            >
              {activeStageIdx >= 0 ? "管線執行中…" : hasRun ? "重新派出" : `派出管線（${task.stages.length} 階段）`}
            </button>

            <div className="text-[0.7rem] tracking-[0.14em] uppercase pt-2" style={{ color: "#AAA" }}>管線概覽</div>
            <ol className="space-y-2 text-[0.78rem]">
              {task.stages.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="font-display tabular-nums shrink-0" style={{ color: s.isOrchestrator ? INK : "#999" }}>
                    0{i + 1}
                  </span>
                  <div>
                    <div className="font-medium" style={{ color: s.isOrchestrator ? INK : "#444" }}>
                      {s.label}
                      {s.isOrchestrator && (
                        <span className="ml-2 text-[0.6rem] tracking-[0.18em] uppercase px-1.5 py-0.5 align-middle"
                              style={{ background: INK, color: "white" }}>
                          ORCHESTRATOR
                        </span>
                      )}
                    </div>
                    <div className="text-[0.74rem]" style={{ color: "#999" }}>{s.description}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* PIPELINE */}
          <div className="p-8 bg-[#FAFAFA] min-h-[520px]">
            {!hasRun && (
              <div className="h-full min-h-[460px] flex items-center justify-center text-center">
                <div>
                  <div className="text-[0.7rem] tracking-[0.22em] uppercase" style={{ color: "#888" }}>READY</div>
                  <div className="mt-3 font-display text-[1.5rem] tracking-[-0.015em]">
                    {task.stages.length} 階段管線已就位
                  </div>
                  <div className="mt-2 text-[0.85rem]" style={{ color: "#666", maxWidth: 420 }}>
                    填好左邊的 brief，點「派出管線」<br />
                    每個階段的 agent 會同時動工，前一階段交棒給下一階段
                  </div>
                </div>
              </div>
            )}

            {hasRun && (
              <div className="space-y-0">
                {task.stages.map((stage, si) => (
                  <React.Fragment key={stage.id}>
                    <StageBlock
                      stage={stage}
                      stageIdx={si}
                      states={agentStates}
                      isActive={activeStageIdx === si}
                      kFn={k}
                      finalKind={task.finalKind}
                    />
                    {si < task.stages.length - 1 && <Handoff />}
                  </React.Fragment>
                ))}

                {/* Final deliverable */}
                {finalState?.status === "delivered" && "result" in finalState && (
                  <FinalDeliverable result={finalState.result} finalKind={task.finalKind} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Stage block ───────────────────────────────── */

function StageBlock({
  stage, stageIdx, states, isActive, kFn, finalKind,
}: {
  stage: StageMeta;
  stageIdx: number;
  states: Record<string, AgentState>;
  isActive: boolean;
  kFn: (sId: string, aId: string) => string;
  finalKind: TaskMeta["finalKind"];
}) {
  const isOrch = stage.isOrchestrator;

  return (
    <section
      className="p-5 transition"
      style={{
        background: isOrch ? INK : "white",
        color: isOrch ? "white" : INK,
        border: `1px solid ${isOrch ? INK : HAIR}`,
        boxShadow: isActive ? `0 0 0 2px ${ACCENT}` : "none",
      }}
    >
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="font-display text-[1.6rem] tabular-nums tracking-tight"
            style={{ color: isOrch ? "white" : ACCENT }}
          >
            0{stageIdx + 1}
          </div>
          <div>
            <div className="text-[0.62rem] tracking-[0.24em] uppercase opacity-70">
              {isOrch ? "ORCHESTRATOR · 收尾" : `STAGE ${stageIdx + 1} · 並行`}
            </div>
            <div className="font-display text-[1.15rem] tracking-[-0.01em]">{stage.label}</div>
          </div>
        </div>
        <div className="text-[0.72rem] opacity-70">{stage.description}</div>
      </header>

      <div className={`grid gap-3 ${stage.agents.length > 1 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
        {stage.agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            state={states[kFn(stage.id, a.id)]}
            onDark={isOrch}
            isOrchestrator={isOrch}
            finalKind={finalKind}
          />
        ))}
      </div>
    </section>
  );
}

function Handoff() {
  return (
    <div className="flex items-center justify-center py-3">
      <div className="flex items-center gap-2">
        <div className="w-px h-5" style={{ background: "#CCC" }} />
        <div className="text-[0.62rem] tracking-[0.28em] uppercase" style={{ color: "#999" }}>HANDOFF</div>
        <div className="w-px h-5" style={{ background: "#CCC" }} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Agent card ────────────────────────────────── */

function AgentCard({
  agent, state, onDark, isOrchestrator, finalKind,
}: {
  agent: AgentMeta;
  state: AgentState | undefined;
  onDark: boolean;
  isOrchestrator: boolean;
  finalKind: TaskMeta["finalKind"];
}) {
  const status = state?.status ?? "queued";
  const elapsed = useElapsed(status === "working" ? (state as any).startedAt : null);

  const cardBg = onDark ? "#1B1B1F" : "white";
  const cardBorder = onDark ? "#2C2C32" : (status === "delivered" ? INK : HAIR);
  const subText = onDark ? "rgba(255,255,255,0.55)" : "#888";
  const mainText = onDark ? "white" : INK;

  const tone = agent.tone;
  const toneColor = TONE_COLOR[tone];
  const isWorking = status === "working";

  return (
    <article
      className="transition flex"
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        opacity: status === "queued" ? 0.6 : 1,
      }}
    >
      {/* Avatar column */}
      <div
        className="shrink-0 flex flex-col items-center justify-start pt-4 pb-3 px-3"
        style={{
          background: onDark ? "#15151A" : "#FAFAFA",
          borderRight: `1px solid ${onDark ? "#2C2C32" : HAIR}`,
        }}
      >
        <div className="relative">
          <PortraitAvatar
            name={agent.name}
            tone={tone}
            size={64}
            pulse={isWorking}
            glow={status === "delivered"}
            dim={status === "queued"}
          />
          {/* Status dot in corner */}
          <span
            className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center"
            style={{
              width: 18, height: 18, borderRadius: "50%",
              background: cardBg,
              border: `2px solid ${cardBg}`,
            }}
          >
            <StatusGlyph status={status} onDark={onDark} />
          </span>
        </div>
        <div className="mt-2 text-[0.6rem] tracking-[0.18em] uppercase" style={{ color: toneColor, fontWeight: 600 }}>
          {TONE_LABEL[tone]}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: onDark ? "#2C2C32" : HAIR }}>
          <div>
            <div className="text-[0.92rem] font-medium tracking-[-0.005em]" style={{ color: mainText }}>{agent.name}</div>
            <div className="text-[0.74rem]" style={{ color: subText }}>{agent.role} · {agent.skill}</div>
          </div>
          <div className="text-right shrink-0 ml-3">
            <div className="text-[0.68rem] tabular-nums" style={{ color: subText }}>
              {status === "queued" && <span>queued</span>}
              {status === "working" && (
                <span className="font-medium" style={{ color: toneColor }}>
                  {(elapsed / 1000).toFixed(1)}s
                </span>
              )}
              {status === "delivered" && state && "result" in state && (
                <>
                  {(state.result.tookMs / 1000).toFixed(1)}s · {PROVIDER_LABEL[state.result.provider] ?? state.result.provider}
                  {state.result.fellBack && <span style={{ color: "#FFB347" }}> ↺</span>}
                </>
              )}
              {status === "failed" && "failed"}
            </div>
          </div>
        </header>

        <div className="px-4 py-3">
          {status === "queued" && (
            <div className="text-[0.78rem]" style={{ color: subText }}>等待 {agent.role} 上工…</div>
          )}
          {status === "working" && (
            <div>
              <div className="text-[0.74rem] mb-2" style={{ color: toneColor, fontWeight: 500 }}>
                {agent.name} 正在{verbForTone(tone)}…
              </div>
              <WorkingShimmer onDark={onDark} />
            </div>
          )}
          {status === "failed" && state && "error" in state && (
            <div className="text-[0.78rem]" style={{ color: "#FF7777" }}>
              {state.error.length > 180 ? state.error.slice(0, 180) + "…" : state.error}
            </div>
          )}
          {status === "delivered" && state && "result" in state && (
            <div>
              {!isOrchestrator ? (
                <pre className="whitespace-pre-wrap text-[0.82rem] leading-[1.55] font-sans" style={{ color: mainText }}>
                  {truncate(state.result.output, 240)}
                </pre>
              ) : (
                <div className="text-[0.82rem]" style={{ color: subText }}>
                  ✓ 收尾完成 — 完整交付見下方紫框
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function verbForTone(t: AgentTone): string {
  if (t === "research") return "翻資料";
  if (t === "analyze") return "分析";
  if (t === "write") return "動筆寫稿";
  if (t === "craft") return "上手雕琢";
  return "整合收尾";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function StatusGlyph({ status, onDark }: { status: AgentState["status"]; onDark: boolean }) {
  if (status === "queued")
    return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: onDark ? "#444" : "#DDD" }} />;
  if (status === "working")
    return <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: onDark ? "white" : INK }} />;
  if (status === "delivered")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.4" fill={ACCENT} />
        <path d="M4 7.2l2.2 2L10 5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#C44" }} />;
}

function WorkingShimmer({ onDark }: { onDark: boolean }) {
  const a = onDark ? "#2A2A30" : "#EEE";
  const b = onDark ? "#3A3A42" : "#DDD";
  return (
    <div className="space-y-2">
      <div className="h-2.5 w-[68%] rounded animate-pulse" style={{ background: `linear-gradient(90deg, ${a}, ${b}, ${a})` }} />
      <div className="h-2.5 w-[92%] rounded animate-pulse" style={{ background: `linear-gradient(90deg, ${a}, ${b}, ${a})` }} />
      <div className="h-2.5 w-[40%] rounded animate-pulse" style={{ background: `linear-gradient(90deg, ${a}, ${b}, ${a})` }} />
    </div>
  );
}

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

/* ─────────────────────────── Final deliverable ─────────────────────────── */

function FinalDeliverable({
  result, finalKind,
}: { result: AgentResult; finalKind: TaskMeta["finalKind"] }) {
  return (
    <section
      className="mt-6 p-6"
      style={{ border: `2px solid ${ACCENT}`, background: "white" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <PortraitAvatar name={result.agentName} tone={result.agentTone} size={52} glow />

          <div>
            <div className="text-[0.62rem] tracking-[0.28em] uppercase" style={{ color: ACCENT }}>
              FINAL DELIVERABLE · 交付完成
            </div>
            <div className="font-display text-[1.25rem] tracking-[-0.015em]">
              {result.agentName} · {result.agentRole}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.brandInjected && (
            <span className="text-[0.62rem] tracking-[0.18em] uppercase px-2 py-0.5"
              style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>
              BRAND BRAIN
            </span>
          )}
          <CopyButton text={result.output} />
        </div>
      </div>

      <div>
        {finalKind === "swot" && result.structured && <SwotGrid data={result.structured} />}
        {finalKind === "persona-card" && result.structured && <PersonaCard data={result.structured} />}
        {finalKind === "swatches" && Array.isArray(result.structured) && <Swatches data={result.structured} />}
        {finalKind === "name-cards" && Array.isArray(result.structured) && <NameCards data={result.structured} />}
        {(finalKind === "text" || finalKind === "rich-text" ||
          (finalKind === "swot" && !result.structured) ||
          (finalKind === "persona-card" && !result.structured) ||
          (finalKind === "swatches" && !result.structured) ||
          (finalKind === "name-cards" && !result.structured)) && (
          <pre className="whitespace-pre-wrap text-[0.95rem] leading-[1.7] font-sans" style={{ color: INK }}>
            {result.output}
          </pre>
        )}
      </div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      }}
      className="text-[0.66rem] tracking-[0.18em] uppercase px-2.5 py-1 transition"
      style={{ border: `1px solid ${HAIR}`, color: copied ? ACCENT : "#888" }}
    >
      {copied ? "已複製" : "複製全文"}
    </button>
  );
}

/* ─────────────────────────── Structured renderers ──────────────────────── */

function SwotGrid({ data }: { data: any }) {
  const cell = (title: string, items: string[], color: string) => (
    <div className="p-4" style={{ border: `1px solid ${HAIR}` }}>
      <div className="text-[0.66rem] tracking-[0.22em] uppercase" style={{ color }}>{title}</div>
      <ul className="mt-2 space-y-1.5 text-[0.85rem]">
        {(items ?? []).map((it, i) => <li key={i}>· {it}</li>)}
      </ul>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-px bg-[#EEE]">
        {cell("STRENGTHS", data.strengths ?? [], ACCENT)}
        {cell("WEAKNESSES", data.weaknesses ?? [], "#C44")}
        {cell("OPPORTUNITIES", data.opportunities ?? [], ACCENT)}
        {cell("THREATS", data.threats ?? [], "#C44")}
      </div>
      {data.advice && (
        <div className="mt-4 p-4 text-[0.86rem] leading-relaxed" style={{ background: "#F5F2FE" }}>
          <span className="text-[0.64rem] tracking-[0.22em] uppercase mr-2" style={{ color: ACCENT }}>STRATEGY</span>
          {data.advice}
        </div>
      )}
    </div>
  );
}

function PersonaCard({ data }: { data: any }) {
  const initials = String(data.name ?? "?").trim().slice(0, 2);
  return (
    <div className="grid grid-cols-[88px_1fr] gap-5">
      <div className="w-[88px] h-[88px] flex items-center justify-center font-display text-[1.6rem] tracking-tight"
        style={{ background: ACCENT, color: "white" }}>
        {initials}
      </div>
      <div>
        <div className="font-display text-[1.3rem] tracking-[-0.015em]">{data.name}</div>
        <div className="text-[0.85rem] mt-1 italic" style={{ color: "#666" }}>"{data.tagline}"</div>
        {data.demographics && (
          <div className="mt-3 text-[0.78rem] flex flex-wrap gap-x-3 gap-y-1" style={{ color: "#444" }}>
            {Object.entries(data.demographics).map(([k, v]: any) => (
              <span key={k}>{k}: <b style={{ color: INK }}>{String(v)}</b></span>
            ))}
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <PersonaList title="價值觀" items={data.values} />
          <PersonaList title="痛點" items={data.painPoints} />
        </div>
        {Array.isArray(data.platforms) && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {data.platforms.map((p: string) => (
              <span key={p} className="text-[0.7rem] px-2 py-0.5" style={{ border: `1px solid ${HAIR}` }}>{p}</span>
            ))}
          </div>
        )}
        {data.hookLine && (
          <div className="mt-3 text-[0.86rem] pt-3 border-t" style={{ borderColor: HAIR, color: ACCENT }}>
            ◆ {data.hookLine}
          </div>
        )}
      </div>
    </div>
  );
}
function PersonaList({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <div className="text-[0.64rem] tracking-[0.22em] uppercase" style={{ color: "#888" }}>{title}</div>
      <ul className="mt-1 space-y-1 text-[0.84rem]">
        {(items ?? []).map((x, i) => <li key={i}>· {x}</li>)}
      </ul>
    </div>
  );
}

function Swatches({ data }: { data: any[] }) {
  return (
    <div className="grid grid-cols-5 gap-px bg-[#EEE]">
      {data.map((c, i) => (
        <div key={i} className="bg-white">
          <div className="aspect-square w-full" style={{ background: c.hex }} />
          <div className="p-2.5 text-[0.74rem]">
            <div className="font-medium tracking-[-0.005em]">{c.name}</div>
            <div className="font-mono text-[0.7rem]" style={{ color: "#888" }}>{c.hex}</div>
            <div className="text-[0.66rem] tracking-[0.18em] uppercase mt-1" style={{ color: ACCENT }}>{c.role}</div>
            <div className="mt-1 text-[0.7rem]" style={{ color: "#666" }}>{c.usage}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NameCards({ data }: { data: any[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {data.map((n, i) => (
        <div key={i} className="p-3" style={{ border: `1px solid ${HAIR}` }}>
          <div className="font-display text-[1.3rem] tracking-[-0.015em]">{n.chinese}</div>
          <div className="text-[0.84rem] font-mono" style={{ color: ACCENT }}>{n.english}</div>
          <div className="mt-1 text-[0.78rem]" style={{ color: "#666" }}>{n.meaning}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Field input ───────────────────────────────── */

function FieldInput({
  field, value, onChange,
}: {
  field: TaskField;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  const v = value ?? "";
  const labelEl = (
    <div className="text-[0.72rem] mb-1.5" style={{ color: "#444" }}>
      {field.label}{field.required && <span style={{ color: ACCENT }}> *</span>}
    </div>
  );
  const inputCls = "w-full px-3 py-2 text-[0.88rem] bg-white outline-none transition focus:border-[#5B3CC8]";
  const baseStyle = { border: `1px solid ${HAIR}` };

  if (field.kind === "longtext")
    return (
      <label className="block">{labelEl}
        <textarea value={String(v)} onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder} rows={5} className={inputCls} style={baseStyle} />
      </label>
    );
  if (field.kind === "select")
    return (
      <label className="block">{labelEl}
        <select value={String(v)} onChange={(e) => onChange(e.target.value)} className={inputCls} style={baseStyle}>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  if (field.kind === "number")
    return (
      <label className="block">{labelEl}
        <input type="number" value={String(v)} onChange={(e) => onChange(Number(e.target.value))}
          placeholder={field.placeholder} className={inputCls} style={baseStyle} />
      </label>
    );
  return (
    <label className="block">{labelEl}
      <input type={field.kind === "url" ? "url" : "text"} value={String(v)}
        onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder}
        className={inputCls} style={baseStyle} />
    </label>
  );
}
