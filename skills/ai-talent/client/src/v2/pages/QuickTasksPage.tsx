/**
 * QuickTasksPage — 30 秒產出 · 多 Agent 並行調度區
 *
 * 設計原則：
 *   1. 編輯級黑白：白底 + 黑字 + #5B3CC8 紫單一強調，hairline 1px 黑線、無 emoji
 *   2. 自由輸入大對話框（學 Canva）→ 後端路由 → 自動跳到對應任務
 *   3. 10 件任務 tile，全部承諾 < 30 秒
 *   4. 跑任務時：每個 agent 一張卡片，依序從 queued → working → delivered
 *   5. 結構化任務（SWOT / Persona / 色票 / 命名）回 JSON 直接渲染成卡片
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
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

type AgentMeta = {
  id: string;
  name: string;
  role: string;
  provider: string;
};

type TaskMeta = {
  id: string;
  label: string;
  etaSeconds: number;
  outputKind:
    | "text" | "chips" | "swot" | "persona-card"
    | "swatches" | "name-cards" | "compare-2col" | "rewrite-3col";
  fields: TaskField[];
  agents: AgentMeta[];
};

type AgentResult = {
  agentId: string;
  agentName: string;
  agentRole: string;
  output: string;
  structured: any | null;
  provider: string;
  model: string;
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

  const onRoute = (taskId: string, inputs: Record<string, string | number>) => {
    setPrefilled(inputs);
    setActiveId(taskId);
  };

  return (
    <main className="bg-white pb-24" style={{ color: INK }}>
      {/* ─── HERO ─── */}
      <section className="border-b" style={{ borderColor: HAIR }}>
        <div className="max-w-[1200px] mx-auto px-8 pt-20 pb-12">
          <div className="font-display text-[0.6rem] tracking-[0.32em] uppercase" style={{ color: "#888" }}>
            QUICK · 30s DELIVERY
          </div>
          <h1 className="mt-3 font-display text-[3.4rem] leading-[1.02] tracking-[-0.025em]">
            30 秒產出
          </h1>
          <p className="mt-4 text-[1rem] leading-relaxed" style={{ color: "#444", maxWidth: 640 }}>
            告訴我們你要什麼，三個 AI 模型同時為你的品牌動筆。
            <br />
            或從下方挑一件，我們派出最對的 agent 班底。
          </p>

          {/* Free input bar */}
          <FreeInputBar onRoute={onRoute} disabled={tasksQuery.isLoading} />
        </div>
      </section>

      {/* ─── Tile menu ─── */}
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
          {tasks.map((t, i) => (
            <button
              key={t.id}
              onClick={() => { setPrefilled({}); setActiveId(t.id); }}
              className="group text-left bg-white p-6 hover:bg-[#FAFAFA] transition relative"
            >
              <div className="flex items-start justify-between">
                <div
                  className="font-display text-[2rem] tracking-[-0.02em]"
                  style={{ color: i < tasks.length ? ACCENT : INK }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[0.66rem] tracking-[0.22em] uppercase" style={{ color: "#888" }}>
                  ~ {t.etaSeconds}s
                </div>
              </div>
              <div className="mt-4 text-[1.05rem] font-medium tracking-[-0.005em]">
                {t.label}
              </div>
              <div className="mt-2 text-[0.78rem]" style={{ color: "#666" }}>
                {t.agents.length === 1
                  ? `${t.agents[0].name} 單獨交付`
                  : `${t.agents.length} 位 agent 並行 · ${t.agents.map((a) => a.name.split(" · ")[0]).join(" / ")}`}
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-[0.7rem] tracking-[0.16em] uppercase opacity-0 group-hover:opacity-100 transition" style={{ color: ACCENT }}>
                派出 agent
                <span aria-hidden>→</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Run modal ─── */}
      {activeTask && (
        <RunPanel
          task={activeTask}
          prefilled={prefilled}
          onClose={() => setActiveId(null)}
        />
      )}
    </main>
  );
}

/* ─────────────────────────── Free input bar ────────────────────────────── */

function FreeInputBar({
  onRoute,
  disabled,
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
    setBusy(true);
    setHint(null);
    try {
      const r = await routeMut.mutateAsync({ text: text.trim() });
      if (!r.taskId || r.confidence < 0.4) {
        setHint("沒有完全匹配的任務 — 請從下方選一件，或換個說法再試。");
      } else {
        // Convert string inputs to expected types (fields will coerce)
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
      {hint && (
        <div className="mt-2 text-[0.78rem]" style={{ color: "#888" }}>
          {hint}
        </div>
      )}
      <div className="mt-2 text-[0.7rem] tracking-[0.16em] uppercase" style={{ color: "#AAA" }}>
        AUTO-MATCH · 你的品牌大腦會自動帶入
      </div>
    </div>
  );
}

/* ─────────────────────────── Run panel ─────────────────────────────────── */

function RunPanel({
  task, prefilled, onClose,
}: {
  task: TaskMeta;
  prefilled: Record<string, string | number>;
  onClose: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of task.fields) {
      if (f.default !== undefined) init[f.key] = f.default;
    }
    return { ...init, ...prefilled };
  });

  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>(() => {
    const m: Record<string, AgentState> = {};
    for (const a of task.agents) m[a.id] = { status: "queued" };
    return m;
  });
  const [hasRun, setHasRun] = useState(false);

  const runMut = (trpc as any).quickTask.runAgent.useMutation();

  const requiredOk = task.fields
    .filter((f) => f.required)
    .every((f) => {
      const v = inputs[f.key];
      return v !== undefined && String(v).trim().length > 0;
    });

  const allDelivered = task.agents.every(
    (a) => agentStates[a.id]?.status === "delivered" || agentStates[a.id]?.status === "failed"
  );

  const runAll = async () => {
    setHasRun(true);
    // Reset state to queued, then immediately mark working with staggered start
    const reset: Record<string, AgentState> = {};
    for (const a of task.agents) reset[a.id] = { status: "queued" };
    setAgentStates(reset);

    // Fan out — all agents in parallel. Stagger start markers by 80ms for visual.
    task.agents.forEach((agent, idx) => {
      setTimeout(() => {
        setAgentStates((s) => ({ ...s, [agent.id]: { status: "working", startedAt: Date.now() } }));
      }, idx * 80);

      runMut
        .mutateAsync({ taskId: task.id, agentId: agent.id, inputs })
        .then((r: AgentResult) => {
          setAgentStates((s) => ({ ...s, [agent.id]: { status: "delivered", result: r } }));
        })
        .catch((e: any) => {
          setAgentStates((s) => ({
            ...s,
            [agent.id]: { status: "failed", error: String(e?.message ?? e) },
          }));
        });
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-[min(1180px,96vw)] my-8 self-start"
        onClick={(e) => e.stopPropagation()}
        style={{ border: `1px solid ${INK}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-8 py-5 border-b"
          style={{ borderColor: INK }}
        >
          <div>
            <div className="text-[0.62rem] tracking-[0.28em] uppercase" style={{ color: "#888" }}>
              QUICK TASK · ~ {task.etaSeconds}s
            </div>
            <div className="font-display text-[1.4rem] tracking-[-0.015em] mt-1">
              {task.label}
            </div>
          </div>
          <button onClick={onClose} className="text-[1.4rem] hover:opacity-60 transition" aria-label="關閉">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr]">
          {/* Form */}
          <div className="p-8 border-r space-y-5" style={{ borderColor: HAIR }}>
            <div className="text-[0.66rem] tracking-[0.24em] uppercase" style={{ color: "#888" }}>
              BRIEF
            </div>
            {task.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={inputs[f.key]}
                onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))}
              />
            ))}
            <button
              onClick={runAll}
              disabled={!requiredOk}
              className="w-full mt-3 py-3 text-[0.78rem] tracking-[0.22em] uppercase disabled:opacity-40 transition"
              style={{ background: INK, color: "white" }}
            >
              {hasRun ? "再派一輪" : `派出 ${task.agents.length} 位 agent`}
            </button>

            <div className="text-[0.7rem] tracking-[0.14em] uppercase pt-2" style={{ color: "#AAA" }}>
              AGENT 班底
            </div>
            <div className="space-y-2">
              {task.agents.map((a) => (
                <div key={a.id} className="text-[0.78rem] flex items-center gap-2" style={{ color: "#444" }}>
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: ACCENT }}
                  />
                  <span className="font-medium" style={{ color: INK }}>{a.name}</span>
                  <span style={{ color: "#999" }}>· {a.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live agent rail + outputs */}
          <div className="p-8 bg-[#FAFAFA] min-h-[480px]">
            {!hasRun && (
              <div className="h-full min-h-[400px] flex items-center justify-center text-center">
                <div>
                  <div className="text-[0.7rem] tracking-[0.22em] uppercase" style={{ color: "#888" }}>
                    READY
                  </div>
                  <div className="mt-3 font-display text-[1.5rem] tracking-[-0.015em]">
                    {task.agents.length} 位 agent 已就位
                  </div>
                  <div className="mt-2 text-[0.85rem]" style={{ color: "#666", maxWidth: 380 }}>
                    填好左邊的 brief，點「派出 agent」<br />
                    每位用不同模型同時動筆，依序回到桌上
                  </div>
                </div>
              </div>
            )}

            {hasRun && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="text-[0.66rem] tracking-[0.24em] uppercase" style={{ color: "#888" }}>
                    {allDelivered ? "ALL DELIVERED" : "AGENTS WORKING"}
                  </div>
                  <ProgressDots states={agentStates} agents={task.agents} />
                </div>

                {task.agents.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    state={agentStates[a.id]}
                    outputKind={task.outputKind}
                  />
                ))}

                {allDelivered && task.outputKind === "rewrite-3col" && (
                  <CompareGrid agents={task.agents} states={agentStates} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Agent card ────────────────────────────────── */

function ProgressDots({
  states, agents,
}: { states: Record<string, AgentState>; agents: AgentMeta[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {agents.map((a) => {
        const s = states[a.id]?.status ?? "queued";
        const color = s === "delivered" ? ACCENT : s === "failed" ? "#C44" : s === "working" ? INK : "#DDD";
        return (
          <span
            key={a.id}
            className="inline-block w-2 h-2 rounded-full transition"
            style={{ background: color }}
          />
        );
      })}
    </div>
  );
}

function AgentCard({
  agent, state, outputKind,
}: {
  agent: AgentMeta;
  state: AgentState | undefined;
  outputKind: TaskMeta["outputKind"];
}) {
  const status = state?.status ?? "queued";
  const elapsed = useElapsed(status === "working" ? (state as any).startedAt : null);

  return (
    <article
      className="bg-white transition"
      style={{
        border: `1px solid ${status === "delivered" ? INK : HAIR}`,
        opacity: status === "queued" ? 0.55 : 1,
      }}
    >
      <header
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: HAIR }}
      >
        <div className="flex items-center gap-3">
          <StatusGlyph status={status} />
          <div>
            <div className="text-[0.92rem] font-medium tracking-[-0.005em]">{agent.name}</div>
            <div className="text-[0.72rem]" style={{ color: "#888" }}>{agent.role}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[0.66rem] tracking-[0.2em] uppercase" style={{ color: "#888" }}>
            {PROVIDER_LABEL[agent.provider] ?? agent.provider}
          </div>
          <div className="text-[0.72rem] mt-0.5 tabular-nums" style={{ color: "#999" }}>
            {status === "queued" && "queued"}
            {status === "working" && `${(elapsed / 1000).toFixed(1)}s`}
            {status === "delivered" && state && "result" in state && `${(state.result.tookMs / 1000).toFixed(1)}s`}
            {status === "failed" && "failed"}
          </div>
        </div>
      </header>

      <div className="px-5 py-4">
        {status === "queued" && (
          <div className="text-[0.82rem]" style={{ color: "#AAA" }}>等待派遣…</div>
        )}
        {status === "working" && <WorkingShimmer />}
        {status === "failed" && state && "error" in state && (
          <div className="text-[0.82rem]" style={{ color: "#C44" }}>{state.error}</div>
        )}
        {status === "delivered" && state && "result" in state && (
          <OutputRenderer kind={outputKind} result={state.result} />
        )}
      </div>
      {status === "delivered" && state && "result" in state && state.result.brandInjected && (
        <div className="px-5 pb-3">
          <span
            className="inline-block text-[0.64rem] tracking-[0.18em] uppercase px-2 py-0.5"
            style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}
          >
            BRAND BRAIN INJECTED
          </span>
        </div>
      )}
    </article>
  );
}

function StatusGlyph({ status }: { status: AgentState["status"] }) {
  if (status === "queued")
    return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#DDD" }} />;
  if (status === "working")
    return (
      <span
        className="inline-block w-3 h-3 rounded-full animate-pulse"
        style={{ background: INK }}
      />
    );
  if (status === "delivered")
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.4" fill={ACCENT} />
        <path d="M4 7.2l2.2 2L10 5.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#C44" }} />;
}

function WorkingShimmer() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-[68%] rounded bg-gradient-to-r from-[#EEE] via-[#DDD] to-[#EEE] animate-pulse" />
      <div className="h-3 w-[92%] rounded bg-gradient-to-r from-[#EEE] via-[#DDD] to-[#EEE] animate-pulse" />
      <div className="h-3 w-[40%] rounded bg-gradient-to-r from-[#EEE] via-[#DDD] to-[#EEE] animate-pulse" />
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

/* ─────────────────────────── Output renderers ──────────────────────────── */

function OutputRenderer({
  kind, result,
}: { kind: TaskMeta["outputKind"]; result: AgentResult }) {
  if (kind === "swot" && result.structured) return <SwotGrid data={result.structured} />;
  if (kind === "persona-card" && result.structured) return <PersonaCard data={result.structured} />;
  if (kind === "swatches" && Array.isArray(result.structured)) return <Swatches data={result.structured} />;
  if (kind === "name-cards" && Array.isArray(result.structured)) return <NameCards data={result.structured} />;
  // text / chips / compare-2col / rewrite-3col → just show text in card
  return (
    <div className="flex items-start justify-between gap-3">
      <pre className="whitespace-pre-wrap text-[0.92rem] leading-[1.6] flex-1 font-sans" style={{ color: INK }}>
        {result.output}
      </pre>
      <CopyButton text={result.output} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      }}
      className="text-[0.66rem] tracking-[0.18em] uppercase px-2.5 py-1 transition shrink-0"
      style={{ border: `1px solid ${HAIR}`, color: copied ? ACCENT : "#888" }}
    >
      {copied ? "已複製" : "複製"}
    </button>
  );
}

function SwotGrid({ data }: { data: any }) {
  const cell = (title: string, items: string[], color: string) => (
    <div className="p-4" style={{ border: `1px solid ${HAIR}` }}>
      <div className="text-[0.66rem] tracking-[0.22em] uppercase" style={{ color }}>{title}</div>
      <ul className="mt-2 space-y-1.5 text-[0.85rem]" style={{ color: INK }}>
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
        <div className="mt-4 p-4 text-[0.86rem] leading-relaxed" style={{ background: "#F5F2FE", color: INK }}>
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
      <div
        className="w-[88px] h-[88px] flex items-center justify-center font-display text-[1.6rem] tracking-tight"
        style={{ background: ACCENT, color: "white" }}
      >
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

function CompareGrid({
  agents, states,
}: { agents: AgentMeta[]; states: Record<string, AgentState> }) {
  return (
    <div className="mt-2 pt-5 border-t" style={{ borderColor: HAIR }}>
      <div className="text-[0.66rem] tracking-[0.24em] uppercase mb-3" style={{ color: ACCENT }}>
        三派並列 · 直接比較
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#EEE]">
        {agents.map((a) => {
          const s = states[a.id];
          const text = s?.status === "delivered" && "result" in s ? s.result.output : "";
          return (
            <div key={a.id} className="bg-white p-4">
              <div className="text-[0.66rem] tracking-[0.2em] uppercase mb-2" style={{ color: "#888" }}>
                {a.name}
              </div>
              <pre className="whitespace-pre-wrap text-[0.84rem] leading-[1.55] font-sans" style={{ color: INK }}>{text}</pre>
            </div>
          );
        })}
      </div>
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
      <label className="block">
        {labelEl}
        <textarea
          value={String(v)} onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder} rows={5} className={inputCls} style={baseStyle}
        />
      </label>
    );
  if (field.kind === "select")
    return (
      <label className="block">
        {labelEl}
        <select value={String(v)} onChange={(e) => onChange(e.target.value)} className={inputCls} style={baseStyle}>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  if (field.kind === "number")
    return (
      <label className="block">
        {labelEl}
        <input type="number" value={String(v)} onChange={(e) => onChange(Number(e.target.value))}
          placeholder={field.placeholder} className={inputCls} style={baseStyle} />
      </label>
    );
  return (
    <label className="block">
      {labelEl}
      <input
        type={field.kind === "url" ? "url" : "text"}
        value={String(v)} onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder} className={inputCls} style={baseStyle}
      />
    </label>
  );
}
