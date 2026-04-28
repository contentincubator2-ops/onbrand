/**
 * QuickTasksPage — Live Agent Orchestra (HeroUI v2 migration)
 *
 * Not Magic Studio — this is "看著一群 agent 接力工作" 的舞台：
 *   1. 頂部自由輸入 → 自動 route 到 squad
 *   2. 任務牆：squad tile grid，編號 + 成員頭像
 *   3. 點選後 inline run panel：左 brief / 右 pipeline，stage 並行 → handoff →
 *      orchestrator 黑卡收尾 → 紫框 final deliverable → 複製全文
 *
 * v2 polish steals from v0 / Lovable / Bolt：overall progress bar，stage
 * counter chip，soft glow on active stage，Spinner-driven working state，
 * Snippet for copyable output。
 *
 * 視覺敘事保留（DiceBear avatar / tone color ring / dark orchestrator card），
 * 但所有按鈕、卡片、輸入、徽章、shimmer 全部改 HeroUI 元件。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, AvatarGroup, Badge, Button, Card, CardBody, CardHeader, CardFooter,
  Chip, Divider, Input, Textarea, Select, SelectItem, NumberInput,
  Progress, ScrollShadow, Skeleton, Snippet, Spinner, Tooltip, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWandMagicSparkles, faArrowLeft, faCircleCheck, faCircleXmark,
  faPlay, faRotateRight, faPaperPlane, faClipboard, faClipboardCheck,
  faRocket, faMagnifyingGlass, faChartColumn, faPenNib, faPalette,
  faBullseye, faBolt,
} from "@fortawesome/free-solid-svg-icons";

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
  research: "#2EA4A0",
  analyze:  "#3D6BCC",
  write:    "#E07AAE",
  craft:    "#E8A23B",
  orchestrate: "#5B3CC8",
};
const TONE_LABEL: Record<AgentTone, string> = {
  research: "RESEARCH", analyze: "ANALYZE", write: "WRITE",
  craft: "CRAFT", orchestrate: "ORCHESTRATE",
};
const TONE_ICON: Record<AgentTone, any> = {
  research: faMagnifyingGlass, analyze: faChartColumn, write: faPenNib,
  craft: faPalette, orchestrate: faBolt,
};

const PROVIDER_LABEL: Record<string, string> = {
  openai: "GPT", google: "Gemini", qwen: "Qwen", zhipu: "GLM",
  cohere: "Cohere", perplexity: "Perplexity", forge: "Forge",
};

const ACCENT = "#5B3CC8";

/* ─────────────────── Portrait avatar (initial fallback) ──────────────── */
// Page-local fictional agents have no avatarUrl, so we show HeroUI's
// initial-letter Avatar (per design system — no DiceBear). The tone-color
// ring is preserved as a functional cue for orchestrate/write/craft/research.

function PortraitAvatar({
  name, tone, size, glow = false, pulse = false, dim = false,
}: {
  name: string; tone: AgentTone; size: number;
  glow?: boolean; pulse?: boolean; dim?: boolean;
}) {
  const ringColor = TONE_COLOR[tone];
  const ringWidth = Math.max(2, Math.round(size * 0.08));
  const inner = size - ringWidth * 2;
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0, opacity: dim ? 0.5 : 1 }}>
      {pulse && (
        <span aria-hidden className="animate-ping"
          style={{ position: "absolute", inset: 0, borderRadius: "50%", background: ringColor, opacity: 0.4 }} />
      )}
      <span style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: "50%",
        border: `${ringWidth}px solid ${ringColor}`, background: "#F2F2F2", overflow: "hidden",
        boxShadow: glow ? `0 0 0 2px white, 0 0 0 4px ${ACCENT}` : undefined,
      }}>
        <span style={{
          width: inner, height: inner, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "white", color: "#666",
          fontSize: Math.max(10, Math.round(inner * 0.42)),
          fontWeight: 600,
        }}>
          {(name?.trim()?.charAt(0) || "?").toUpperCase()}
        </span>
      </span>
    </span>
  );
}

type AgentResult = {
  taskId: string; stageId: string; stageLabel: string;
  agentId: string; agentName: string; agentRole: string;
  agentSkill: string; agentAvatar: string; agentTone: AgentTone;
  output: string; structured: any | null;
  provider: string; model: string; fellBack: boolean;
  tookMs: number; brandInjected: boolean;
};

type AgentState =
  | { status: "queued" }
  | { status: "working"; startedAt: number }
  | { status: "delivered"; result: AgentResult }
  | { status: "failed"; error: string };

/* ─────────────────────────── Page ───────────────────────────────────── */

export default function QuickTasksPage() {
  const { brands, brandId } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

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

  const runRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeTask && runRef.current) {
      runRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeId]);

  return (
    <main className="bg-background pb-24">
      {/* HERO */}
      <section className="border-b border-divider bg-content1">
        <div className="px-8 pt-10 pb-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider mb-2">
                QUICK · 30s DELIVERY
              </Chip>
              <h1 className="text-3xl font-semibold tracking-tight">
                30 秒產出
              </h1>
            </div>
            {currentBrand && (
              <Card shadow="none" className="border border-divider">
                <CardBody className="flex flex-row items-center gap-3 px-4 py-3">
                  <Badge content="" color="default" placement="top-right" shape="circle">
                    <Avatar name={currentBrand.name} size="sm" radius="full" />
                  </Badge>
                  <div>
                    <p className="text-tiny tracking-wider uppercase text-default-500">
                      BRAND BRAIN · 已連線
                    </p>
                    <p className="text-small font-medium">{currentBrand.name}</p>
                  </div>
                  <p className="text-tiny text-default-500 ml-2 max-w-[200px]">
                    全部 agents 自動帶入此品牌的定位、TA、語氣
                  </p>
                </CardBody>
              </Card>
            )}
          </div>

          <p className="mt-4 text-medium leading-relaxed text-default-600 max-w-[720px]">
            每件任務都是一個分工好的 Squad — 研究員、寫手、主編各司其職。
            按 Squad 內建 workflow 接力完成，最後 orchestrator 收尾，交一份可用的稿。
          </p>

          <FreeInputBar
            onRoute={(taskId, inputs) => { setPrefilled(inputs); setActiveId(taskId); }}
            disabled={tasksQuery.isLoading}
          />
        </div>
      </section>

      {/* INLINE RUN VIEW or TILE GRID */}
      {activeTask ? (
        <section ref={runRef} className="px-8 pt-8">
          <Button
            variant="bordered"
            size="sm"
            radius="sm"
            onPress={() => setActiveId(null)}
            startContent={<FontAwesomeIcon icon={faArrowLeft} />}
          >
            回任務牆
          </Button>
          <div className="mt-5">
            <RunPanel
              task={activeTask}
              prefilled={prefilled}
              currentBrand={currentBrand}
            />
          </div>
        </section>
      ) : (
        <section className="px-8 mt-14">
          <div className="flex items-end justify-between mb-6">
            <h2 className="font-semibold text-2xl tracking-tight">所有 Squads</h2>
            <Chip size="sm" variant="flat">
              {tasks.length} SQUADS · 全部 &lt; 30s
            </Chip>
          </div>

          {tasksQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} shadow="sm" className="p-6 gap-3">
                  <Skeleton className="h-8 w-12 rounded" />
                  <Skeleton className="h-5 w-3/5 rounded" />
                  <Skeleton className="h-3 w-4/5 rounded" />
                  <Skeleton className="h-8 w-32 rounded mt-2" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((t, i) => (
                <SquadTile
                  key={t.id}
                  task={t}
                  index={i}
                  onPress={() => { setPrefilled({}); setActiveId(t.id); }}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

/* ─────────────────────────── Squad tile ─────────────────────────────── */

function SquadTile({
  task, index, onPress,
}: { task: TaskMeta; index: number; onPress: () => void }) {
  const allAgents = useMemo(() => task.stages.flatMap((s) => s.agents), [task]);
  return (
    <Card isPressable isHoverable onPress={onPress} shadow="sm" className="p-1">
      <CardBody className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <span className="font-semibold text-3xl tracking-tight" style={{ color: ACCENT }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <Chip size="sm" variant="flat">~ {task.etaSeconds}s</Chip>
        </div>
        <p className="mt-3 font-medium text-medium tracking-tight">{task.squadName}</p>
        <p className="mt-1 text-tiny text-default-500 line-clamp-2">{task.squadTagline}</p>
      </CardBody>
      <CardFooter className="px-5 pb-4 pt-0 flex items-center gap-2">
        <AvatarGroup max={5} size="sm" isBordered>
          {allAgents.map((a) => (
            <Tooltip key={a.id} content={
              <User
                name={a.name}
                description={`${a.role} · ${TONE_LABEL[a.tone]}`}
                avatarProps={{
                  name: a.name,
                  size: "sm",
                  color: a.tone === "orchestrate" ? "secondary" : a.tone === "write" ? "danger" : a.tone === "craft" ? "warning" : "primary",
                }}
              />
            }>
              <Avatar
                name={a.name}
                size="sm" isBordered
                color={a.tone === "orchestrate" ? "secondary" : a.tone === "write" ? "danger" : a.tone === "craft" ? "warning" : "primary"}
              />
            </Tooltip>
          ))}
        </AvatarGroup>
        <span className="ml-1 text-tiny text-default-400">{allAgents.length} 位</span>
        <Chip
          size="sm" variant="flat" color="default"
          className="ml-auto"
          startContent={<FontAwesomeIcon icon={faRocket} className="text-tiny ml-1" />}
        >
          派出
        </Chip>
      </CardFooter>
    </Card>
  );
}

/* ─────────────────────── Free input bar ─────────────────────────────── */

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
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-10">
      <Input
        size="lg"
        radius="sm"
        variant="bordered"
        value={text}
        onValueChange={setText}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        isDisabled={disabled || busy}
        placeholder="例：幫 NIKE 寫 5 個 IG hook，主題是夏季新鞋"
        startContent={<FontAwesomeIcon icon={faWandMagicSparkles} style={{ color: ACCENT }} />}
        endContent={
          <Button
            color="primary" radius="sm" size="md"
            isDisabled={disabled || busy || !text.trim()}
            isLoading={busy}
            onPress={submit}
            endContent={!busy && <FontAwesomeIcon icon={faPaperPlane} />}
          >
            {busy ? "路由中" : "派 Agent"}
          </Button>
        }
      />
      {hint && (
        <p className="mt-2 text-tiny text-default-500">{hint}</p>
      )}
      <p className="mt-2 text-tiny tracking-wider uppercase text-default-400">
        AUTO-MATCH · 你的品牌大腦會自動帶入
      </p>
    </div>
  );
}

/* ─────────────────────────── Run panel ──────────────────────────────── */

function RunPanel({
  task, prefilled, currentBrand,
}: {
  task: TaskMeta;
  prefilled: Record<string, string | number>;
  currentBrand: { id: number; name: string } | null;
}) {
  const [inputs, setInputs] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of task.fields) if (f.default !== undefined) init[f.key] = f.default;
    if (currentBrand && !prefilled.brand) init.brand = currentBrand.name;
    return { ...init, ...prefilled };
  });

  const visibleFields = useMemo(
    () => task.fields.filter((f) => !(currentBrand && f.key === "brand")),
    [task.fields, currentBrand]
  );

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

  // overall progress: % of agents delivered
  const totalAgents = useMemo(
    () => task.stages.reduce((n, s) => n + s.agents.length, 0),
    [task]
  );
  const deliveredCount = useMemo(
    () => Object.values(agentStates).filter((s) => s.status === "delivered").length,
    [agentStates]
  );
  const progressPct = totalAgents ? (deliveredCount / totalAgents) * 100 : 0;

  const runAll = async () => {
    setHasRun(true);
    const fresh: Record<string, AgentState> = {};
    for (const s of task.stages) for (const a of s.agents) fresh[k(s.id, a.id)] = { status: "queued" };
    setAgentStates(fresh);

    const prior: Array<{ stageLabel: string; agentName: string; agentRole: string; output: string }> = [];

    for (let si = 0; si < task.stages.length; si++) {
      const stage = task.stages[si];
      setActiveStageIdx(si);

      stage.agents.forEach((a, idx) => {
        setTimeout(() => {
          setAgentStates((prev) => ({
            ...prev,
            [k(stage.id, a.id)]: { status: "working", startedAt: Date.now() },
          }));
        }, idx * 100);
      });

      const results = await Promise.all(
        stage.agents.map(async (a) => {
          try {
            const r = await runMut.mutateAsync({
              taskId: task.id, stageId: stage.id, agentId: a.id,
              inputs, prior: prior.slice(), brandId: currentBrand?.id,
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

      for (const item of results) {
        if (item.ok) {
          prior.push({
            stageLabel: stage.label,
            agentName: item.r.agentName, agentRole: item.r.agentRole,
            output: item.r.output,
          });
        }
      }

      if (results.every((x) => !x.ok)) {
        setActiveStageIdx(-1);
        return;
      }
    }
    setActiveStageIdx(-1);
  };

  const running = activeStageIdx >= 0;

  return (
    <Card shadow="sm" radius="lg" className="border border-divider overflow-hidden">
      {/* Header */}
      <CardHeader className="flex items-center justify-between px-8 py-5 border-b border-divider gap-4">
        <div className="flex items-center gap-5">
          <AvatarGroup max={5} size="md" isBordered>
            {task.stages.flatMap((s) => s.agents).slice(0, 5).map((a) => (
              <Tooltip key={a.id} content={
                <div className="px-1 py-1">
                  <p className="font-semibold text-small">{a.name}</p>
                  <p className="text-tiny text-default-500">{a.role}</p>
                  <p className="text-tiny" style={{ color: TONE_COLOR[a.tone] }}>{TONE_LABEL[a.tone]}</p>
                </div>
              }>
                <Avatar
                  name={a.name}
                  size="md" isBordered
                  color={a.tone === "orchestrate" ? "secondary" : a.tone === "write" ? "danger" : a.tone === "craft" ? "warning" : "primary"}
                />
              </Tooltip>
            ))}
          </AvatarGroup>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Chip size="sm" variant="flat">SQUAD</Chip>
              <Chip size="sm" variant="flat">~ {task.etaSeconds}s</Chip>
              <Chip size="sm" variant="flat">{task.stages.length} 階段接力</Chip>
              {currentBrand && (
                <Chip size="sm" color="default" variant="flat">
                  已自動帶入 {currentBrand.name} 的 brand brain
                </Chip>
              )}
            </div>
            <p className="font-semibold text-2xl tracking-tight mt-1.5">{task.squadName}</p>
            <p className="text-small text-default-500">{task.squadTagline}</p>
          </div>
        </div>
      </CardHeader>

      {/* Overall progress (v0/lovable polish) */}
      {hasRun && (
        <div className="px-8 py-3 border-b border-divider bg-content1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-tiny tracking-wider uppercase text-default-500">
              {running ? "PIPELINE RUNNING" : progressPct === 100 ? "PIPELINE COMPLETE" : "PIPELINE PAUSED"}
            </span>
            <span className="text-tiny tabular-nums text-default-500">
              {deliveredCount} / {totalAgents} agents · stage {Math.min(activeStageIdx + 1, task.stages.length) || task.stages.length} / {task.stages.length}
            </span>
          </div>
          <Progress
            size="sm" radius="sm" aria-label="pipeline progress"
            value={progressPct}
            color={progressPct === 100 ? "success" : "secondary"}
            isIndeterminate={running && progressPct === 0}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr]">
        {/* BRIEF */}
        <div className="p-8 border-r border-divider space-y-5">
          <p className="text-tiny tracking-wider uppercase text-default-500 font-medium">BRIEF</p>

          {currentBrand && task.fields.some((f) => f.key === "brand") && (
            <Chip
              size="md" variant="flat" color="default" radius="sm"
              className="w-full h-auto py-2 px-3"
              startContent={<span className="text-tiny tracking-wider uppercase mr-1">BRAND</span>}
            >
              <span className="font-medium">{currentBrand.name}</span>
              <span className="text-default-500 text-tiny ml-2">已從 shell 自動帶入</span>
            </Chip>
          )}

          {visibleFields.map((f) => (
            <FieldInput key={f.key} field={f} value={inputs[f.key]}
              onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))} />
          ))}

          <Button
            color="primary"
            size="lg"
            radius="sm"
            className="w-full font-medium"
            isDisabled={!requiredOk}
            isLoading={running}
            onPress={runAll}
            startContent={!running && <FontAwesomeIcon icon={hasRun ? faRotateRight : faPlay} />}
          >
            {running ? "管線執行中…" : hasRun ? "重新派出" : `派出管線（${task.stages.length} 階段）`}
          </Button>

          <Divider />

          <p className="text-tiny tracking-wider uppercase text-default-400">管線概覽</p>
          <ol className="space-y-3 text-small">
            {task.stages.map((s, i) => {
              const isActive = activeStageIdx === i;
              const isPast = activeStageIdx > i || (progressPct === 100 && !running);
              return (
                <li key={s.id} className="flex items-start gap-2">
                  <Chip
                    size="sm"
                    color={s.isOrchestrator ? "default" : isActive ? "secondary" : isPast ? "success" : "default"}
                    variant={s.isOrchestrator || isActive || isPast ? "solid" : "flat"}
                    className="tabular-nums shrink-0"
                  >
                    0{i + 1}
                  </Chip>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{s.label}</span>
                      {s.isOrchestrator && <Chip size="sm" variant="solid" className="bg-foreground text-background">ORCHESTRATOR</Chip>}
                    </div>
                    <p className="text-tiny text-default-500">{s.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* PIPELINE */}
        <div className="p-8 bg-default-50 min-h-[520px]">
          {!hasRun && <ReadyState stages={task.stages.length} />}

          {hasRun && (
            <div className="space-y-0">
              {task.stages.map((stage, si) => (
                <React.Fragment key={stage.id}>
                  <StageBlock
                    stage={stage} stageIdx={si} states={agentStates}
                    isActive={activeStageIdx === si} kFn={k}
                    finalKind={task.finalKind}
                  />
                  {si < task.stages.length - 1 && <Handoff />}
                </React.Fragment>
              ))}

              {finalState?.status === "delivered" && "result" in finalState && (
                <FinalDeliverable result={finalState.result} finalKind={task.finalKind} />
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReadyState({ stages }: { stages: number }) {
  return (
    <div className="h-full min-h-[460px] flex items-center justify-center text-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" color="default" label={null as any} />
        <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider">READY</Chip>
        <p className="font-semibold text-2xl tracking-tight">{stages} 階段管線已就位</p>
        <p className="text-small text-default-500 max-w-[420px]">
          填好左邊的 brief，點「派出管線」<br />
          每個階段的 agent 會同時動工，前一階段交棒給下一階段
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Stage block ───────────────────────────── */

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
    <Card
      shadow={isActive ? "lg" : "none"}
      radius="lg"
      className={[
        "border transition",
        isOrch ? "bg-foreground text-background border-foreground" : "border-divider",
        isActive ? "ring-2 ring-secondary ring-offset-2 ring-offset-default-50" : "",
      ].join(" ")}
    >
      <CardHeader className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-2xl tabular-nums tracking-tight"
            style={{ color: isOrch ? "white" : ACCENT }}>
            0{stageIdx + 1}
          </span>
          <div>
            <p className={`text-tiny tracking-wider uppercase ${isOrch ? "opacity-70" : "text-default-500"}`}>
              {isOrch ? "ORCHESTRATOR · 收尾" : `STAGE ${stageIdx + 1} · 並行`}
            </p>
            <p className="font-semibold text-medium tracking-tight">{stage.label}</p>
          </div>
        </div>
        <p className={`text-tiny ${isOrch ? "opacity-70" : "text-default-500"}`}>{stage.description}</p>
      </CardHeader>

      <CardBody className="px-5 pb-5 pt-0">
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
      </CardBody>
    </Card>
  );
}

function Handoff() {
  return (
    <div className="flex items-center justify-center py-3">
      <div className="flex items-center gap-3 w-full max-w-[280px]">
        <Divider className="flex-1" />
        <Chip size="sm" variant="flat" className="uppercase tracking-wider">HANDOFF</Chip>
        <Divider className="flex-1" />
      </div>
    </div>
  );
}

/* ─────────────────────────── Agent card ────────────────────────────── */

function AgentCard({
  agent, state, onDark, isOrchestrator, finalKind: _finalKind,
}: {
  agent: AgentMeta;
  state: AgentState | undefined;
  onDark: boolean;
  isOrchestrator: boolean;
  finalKind: TaskMeta["finalKind"];
}) {
  const status = state?.status ?? "queued";
  const elapsed = useElapsed(status === "working" ? (state as any).startedAt : null);

  const tone = agent.tone;
  const toneColor = TONE_COLOR[tone];
  const isWorking = status === "working";

  const statusChip = (() => {
    if (status === "queued") return <Chip size="sm" variant="flat">queued</Chip>;
    if (status === "working")
      return <Chip size="sm" color="default" variant="flat" startContent={<Spinner size="sm" color="default" classNames={{ wrapper: "w-3 h-3 ml-1" }} />}>
        {(elapsed / 1000).toFixed(1)}s
      </Chip>;
    if (status === "delivered" && state && "result" in state)
      return (
        <div className="flex items-center gap-1">
          <Chip size="sm" color="success" variant="flat" startContent={<FontAwesomeIcon icon={faCircleCheck} className="ml-1" />}>
            {(state.result.tookMs / 1000).toFixed(1)}s
          </Chip>
          <Chip size="sm" variant="bordered">{PROVIDER_LABEL[state.result.provider] ?? state.result.provider}</Chip>
          {state.result.fellBack && <Chip size="sm" color="warning" variant="flat">fallback</Chip>}
        </div>
      );
    if (status === "failed")
      return <Chip size="sm" color="danger" variant="flat" startContent={<FontAwesomeIcon icon={faCircleXmark} className="ml-1" />}>failed</Chip>;
    return null;
  })();

  return (
    <Card
      shadow="none"
      radius="md"
      className={[
        "border flex-row overflow-hidden",
        onDark ? "bg-[#1B1B1F] border-[#2C2C32]" : "bg-content1 border-divider",
        status === "queued" ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* Avatar column */}
      <div
        className={`shrink-0 flex flex-col items-center justify-start pt-4 pb-3 px-3 border-r ${
          onDark ? "bg-[#15151A] border-[#2C2C32]" : "bg-default-50 border-divider"
        }`}
      >
        <PortraitAvatar
          name={agent.name} tone={tone} size={56}
          pulse={isWorking}
          glow={status === "delivered"}
          dim={status === "queued"}
        />
        <Chip
          size="sm"
          variant="flat"
          className="mt-2 uppercase tracking-wider"
          startContent={<FontAwesomeIcon icon={TONE_ICON[tone]} className="text-tiny ml-1" style={{ color: toneColor }} />}
          style={{ color: toneColor }}
        >
          {TONE_LABEL[tone]}
        </Chip>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center justify-between px-4 py-3 border-b gap-2 ${onDark ? "border-[#2C2C32]" : "border-divider"}`}>
          <div className="min-w-0">
            <p className={`text-small font-medium truncate ${onDark ? "text-white" : ""}`}>{agent.name}</p>
            <p className={`text-tiny truncate ${onDark ? "text-white/50" : "text-default-500"}`}>
              {agent.role} · {agent.skill}
            </p>
          </div>
          <div className="shrink-0">{statusChip}</div>
        </div>

        <div className="px-4 py-3">
          {status === "queued" && (
            <p className={`text-tiny ${onDark ? "text-white/60" : "text-default-500"}`}>
              等待 {agent.role} 上工…
            </p>
          )}
          {status === "working" && (
            <div className="space-y-2">
              <p className="text-tiny font-medium" style={{ color: toneColor }}>
                {agent.name} 正在{verbForTone(tone)}…
              </p>
              <Skeleton className="h-2.5 w-[68%] rounded" />
              <Skeleton className="h-2.5 w-[92%] rounded" />
              <Skeleton className="h-2.5 w-[40%] rounded" />
            </div>
          )}
          {status === "failed" && state && "error" in state && (
            <p className="text-tiny text-danger">
              {state.error.length > 180 ? state.error.slice(0, 180) + "…" : state.error}
            </p>
          )}
          {status === "delivered" && state && "result" in state && (
            !isOrchestrator ? (
              <pre className={`whitespace-pre-wrap text-tiny leading-relaxed font-sans ${onDark ? "text-white" : ""}`}>
                {truncate(state.result.output, 240)}
              </pre>
            ) : (
              <p className={`text-tiny ${onDark ? "text-white/60" : "text-default-500"}`}>
                ✓ 收尾完成 — 完整交付見下方紫框
              </p>
            )
          )}
        </div>
      </div>
    </Card>
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
function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

/* ─────────────────────── Final deliverable ─────────────────────────── */

function FinalDeliverable({
  result, finalKind,
}: { result: AgentResult; finalKind: TaskMeta["finalKind"] }) {
  return (
    <Card
      shadow="lg" radius="lg"
      className="mt-6 border-2 border-secondary"
    >
      <CardHeader className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge content="✓" color="default" placement="bottom-right" shape="circle" size="md">
            <Avatar
              name={result.agentName}
              size="lg" isBordered color="default"
            />
          </Badge>
          <div>
            <Chip size="sm" color="default" variant="flat" className="uppercase tracking-wider">
              FINAL DELIVERABLE · 交付完成
            </Chip>
            <p className="font-semibold text-medium tracking-tight mt-1">
              {result.agentName} · {result.agentRole}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {result.brandInjected && (
            <Chip size="sm" variant="bordered" color="default" className="uppercase tracking-wider">
              BRAND BRAIN
            </Chip>
          )}
          <CopyButton text={result.output} />
        </div>
      </CardHeader>
      <Divider />
      <CardBody className="px-6 py-5">
        <ScrollShadow className="max-h-[600px]">
          {finalKind === "swot" && result.structured && <SwotGrid data={result.structured} />}
          {finalKind === "persona-card" && result.structured && <PersonaCard data={result.structured} />}
          {finalKind === "swatches" && Array.isArray(result.structured) && <Swatches data={result.structured} />}
          {finalKind === "name-cards" && Array.isArray(result.structured) && <NameCards data={result.structured} />}
          {(finalKind === "text" || finalKind === "rich-text" ||
            (finalKind === "swot" && !result.structured) ||
            (finalKind === "persona-card" && !result.structured) ||
            (finalKind === "swatches" && !result.structured) ||
            (finalKind === "name-cards" && !result.structured)) && (
            <pre className="whitespace-pre-wrap text-medium leading-relaxed font-sans">
              {result.output}
            </pre>
          )}
        </ScrollShadow>
      </CardBody>
    </Card>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm" radius="sm"
      variant={copied ? "flat" : "bordered"}
      color={copied ? "secondary" : "default"}
      onPress={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      }}
      startContent={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
    >
      {copied ? "已複製" : "複製全文"}
    </Button>
  );
}

/* ─────────────────────── Structured renderers ──────────────────────── */

function SwotGrid({ data }: { data: any }) {
  const Cell = ({ title, items, color }: { title: string; items: string[]; color: "secondary" | "danger" }) => (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-4">
        <Chip size="sm" color={color} variant="flat" className="uppercase tracking-wider mb-2">{title}</Chip>
        <ul className="space-y-1.5 text-small">
          {(items ?? []).map((it, i) => <li key={i}>· {it}</li>)}
        </ul>
      </CardBody>
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Cell title="STRENGTHS"     items={data.strengths ?? []}     color="secondary" />
        <Cell title="WEAKNESSES"    items={data.weaknesses ?? []}    color="danger" />
        <Cell title="OPPORTUNITIES" items={data.opportunities ?? []} color="secondary" />
        <Cell title="THREATS"       items={data.threats ?? []}       color="danger" />
      </div>
      {data.advice && (
        <Card shadow="none" className="bg-secondary-50 border border-secondary-200">
          <CardBody className="p-4 text-small leading-relaxed">
            <Chip size="sm" color="default" variant="flat" className="uppercase tracking-wider mr-2">STRATEGY</Chip>
            {data.advice}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function PersonaCard({ data }: { data: any }) {
  const initials = String(data.name ?? "?").trim().slice(0, 2);
  return (
    <div className="grid grid-cols-[88px_1fr] gap-5">
      <Avatar
        name={initials} size="lg" radius="md"
        className="w-[88px] h-[88px] text-2xl bg-secondary text-secondary-foreground"
      />
      <div>
        <p className="font-semibold text-xl tracking-tight">{data.name}</p>
        <p className="text-small mt-1 italic text-default-500">"{data.tagline}"</p>
        {data.demographics && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(data.demographics).map(([k, v]: any) => (
              <Chip key={k} size="sm" variant="flat">{k}: <b className="ml-1">{String(v)}</b></Chip>
            ))}
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <PersonaList title="價值觀" items={data.values} />
          <PersonaList title="痛點"   items={data.painPoints} />
        </div>
        {Array.isArray(data.platforms) && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {data.platforms.map((p: string) => (
              <Chip key={p} size="sm" variant="bordered">{p}</Chip>
            ))}
          </div>
        )}
        {data.hookLine && (
          <>
            <Divider className="my-3" />
            <p className="text-small text-secondary">◆ {data.hookLine}</p>
          </>
        )}
      </div>
    </div>
  );
}
function PersonaList({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <p className="text-tiny tracking-wider uppercase text-default-500">{title}</p>
      <ul className="mt-1 space-y-1 text-small">
        {(items ?? []).map((x, i) => <li key={i}>· {x}</li>)}
      </ul>
    </div>
  );
}

function Swatches({ data }: { data: any[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {data.map((c, i) => (
        <Card key={i} shadow="sm" radius="md" className="overflow-hidden">
          <div className="aspect-square w-full" style={{ background: c.hex }} />
          <CardBody className="p-3 gap-1">
            <p className="font-medium text-small tracking-tight">{c.name}</p>
            <Snippet
              size="sm" hideSymbol variant="flat"
              codeString={c.hex}
              classNames={{ pre: "font-mono text-tiny" }}
            >
              {c.hex}
            </Snippet>
            <Chip size="sm" color="default" variant="flat" className="uppercase tracking-wider">{c.role}</Chip>
            <p className="text-tiny text-default-500">{c.usage}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function NameCards({ data }: { data: any[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {data.map((n, i) => (
        <Card key={i} shadow="none" className="border border-divider">
          <CardBody className="p-4 gap-1">
            <p className="font-semibold text-xl tracking-tight">{n.chinese}</p>
            <p className="text-small font-mono text-secondary">{n.english}</p>
            <p className="text-tiny text-default-500 mt-1">{n.meaning}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────── Field input ────────────────────────────── */

function FieldInput({
  field, value, onChange,
}: {
  field: TaskField;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  const v = value ?? "";

  if (field.kind === "longtext")
    return (
      <Textarea
        label={field.label}
        isRequired={field.required}
        value={String(v)}
        onValueChange={onChange}
        placeholder={field.placeholder}
        minRows={4}
        variant="bordered"
        radius="sm"
      />
    );
  if (field.kind === "select")
    return (
      <Select
        label={field.label}
        isRequired={field.required}
        selectedKeys={v ? new Set([String(v)]) : new Set()}
        onSelectionChange={(keys) => {
          const arr = Array.from(keys as Set<string>);
          if (arr[0]) onChange(arr[0]);
        }}
        variant="bordered"
        radius="sm"
      >
        {(field.options ?? []).map((o) => <SelectItem key={o}>{o}</SelectItem>)}
      </Select>
    );
  if (field.kind === "number")
    return (
      <NumberInput
        label={field.label}
        isRequired={field.required}
        value={typeof v === "number" ? v : Number(v) || 0}
        onValueChange={(n) => onChange(n)}
        placeholder={field.placeholder}
        variant="bordered"
        radius="sm"
      />
    );
  return (
    <Input
      label={field.label}
      isRequired={field.required}
      type={field.kind === "url" ? "url" : "text"}
      value={String(v)}
      onValueChange={onChange}
      placeholder={field.placeholder}
      variant="bordered"
      radius="sm"
    />
  );
}
