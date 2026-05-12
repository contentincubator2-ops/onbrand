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
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useLang } from "../../lib/i18n";
import {
  faWandMagicSparkles, faArrowLeft, faCircleCheck, faCircleXmark,
  faPlay, faRotateRight, faPaperPlane, faClipboard, faClipboardCheck,
  faRocket, faMagnifyingGlass, faChartColumn, faPenNib, faPalette, faClock,
  faBullseye, faBolt, faCopy,
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
  const { lang } = useLang();
  const { brands, brandId, scope } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  // Atomic task modal state
  const runAtomicMutation: any = (trpc as any).taskCatalog?.runAtomic?.useMutation?.()
    ?? { mutateAsync: async () => { throw new Error("taskCatalog.runAtomic not available"); } };
  const [atomicResult, setAtomicResult] = useState<any | null>(null);
  const [atomicError, setAtomicError] = useState<string | null>(null);

  const runAtomic = async (t: any) => {
    setAtomicError(null);
    setAtomicResult({ pending: true, task: t });
    try {
      const res = await runAtomicMutation.mutateAsync({
        taskId: t.id,
        scopeBrandId:   scope?.brandId   ?? brandId ?? null,
        scopeProductId: scope?.productId ?? null,
        scopeEventId:   scope?.eventId   ?? null,
        userInput: "",
      });
      setAtomicResult({ pending: false, task: t, ...res });
    } catch (e: any) {
      setAtomicError(e?.message ?? String(e));
      setAtomicResult({ pending: false, task: t, ok: false });
    }
  };

  const tasksQuery = (trpc as any).quickTask?.list?.useQuery?.(undefined, {
    refetchOnWindowFocus: false,
  }) ?? { data: [], isLoading: false };

  const tasks: TaskMeta[] = (tasksQuery.data as any[]) ?? [];

  // Task catalog (CJ direction 2026-05-02) — surface active + coming_soon
  // so just-built tasks are findable. Catalog tasks deep-link into
  // /picker for the full intake + scope flow.
  const taskCatalogQuery = (trpc as any).taskCatalog?.listForPicker?.useQuery
    ? (trpc as any).taskCatalog.listForPicker.useQuery(
        { includeComingSoon: true },
        { refetchOnWindowFocus: false },
      )
    : { data: [] };
  const catalogTasks: any[] = (taskCatalogQuery.data as any[]) ?? [];
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

  // ── Category tabs for filtering catalog tasks
  const CATALOG_TABS = lang === "en" ? [
    { key: "all",      label: "For you" },
    { key: "文案",     label: "Copywriting" },
    { key: "分析",     label: "Market analysis" },
    { key: "社群",     label: "Social" },
    { key: "活動",     label: "Campaigns" },
    { key: "電商",     label: "E-commerce" },
    { key: "影音",     label: "Video scripts" },
  ] as const : [
    { key: "all",      label: "為你推薦" },
    { key: "文案",     label: "文案創作" },
    { key: "分析",     label: "市場分析" },
    { key: "社群",     label: "社群行銷" },
    { key: "活動",     label: "活動企劃" },
    { key: "電商",     label: "電商行銷" },
    { key: "影音",     label: "影音腳本" },
  ] as const;
  const [catalogTab, setCatalogTab] = useState<string>("all");
  const [catalogSearch, setCatalogSearch] = useState("");

  return (
    <main className="bg-background pb-24">

      {/* ══ HERO — mirrors MissionsHome gradient hero ═══════════════════════ */}
      <section
        className="relative px-8 pt-12 pb-10 overflow-hidden"
        style={{
          backgroundImage: [
            "linear-gradient(to bottom, transparent 65%, rgb(252,251,254) 100%)",
            "linear-gradient(rgba(255,255,255,0.96), rgba(255,255,255,0.96))",
            "linear-gradient(135deg, #00b4bc 0%, #8b5cf6 60%, #4c1d95 100%)",
          ].join(", "),
          boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
        }}
      >
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-default-400 mb-3">
            SoWork · Marketing OS
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {lang === "en" ? "One tap. Done in 30s." : "一鍵產出，30 秒交稿"}
          </h1>
          <p className="mt-2 text-small text-default-500 max-w-lg">
            {lang === "en"
              ? "Behind every task is an Agent Squad — tap once, they hand off to each other. No forms."
              : "每件任務背後是一組分工好的 Agent Squad — 按下即自動接力完成，不需填表單。"}
          </p>
          {currentBrand && (
            <div className="mt-3 flex items-center gap-2 text-tiny text-default-500">
              <Avatar name={currentBrand.name} size="sm" radius="full" className="shrink-0" />
              <span>{lang === "en" ? "Brand brain: " : "品牌腦："}<strong className="text-default-700">{currentBrand.name}</strong>{lang === "en" ? " · positioning, TA, voice auto-loaded" : "・已自動帶入定位 TA 語氣"}</span>
            </div>
          )}

          {/* ── Search bar ── */}
          <div className="w-full mt-6" style={{ maxWidth: 640 }}>
            <div style={{
              borderRadius: 20,
              boxShadow: "rgba(139,92,246,0.18) 0 0 0 3px, rgba(0,0,0,0.06) 0 8px 32px",
              background: "white",
            }}>
              <Input
                size="lg"
                radius="full"
                variant="flat"
                value={catalogSearch}
                onValueChange={setCatalogSearch}
                isClearable
                onClear={() => setCatalogSearch("")}
                placeholder={lang === "en" ? "Search tasks, features…" : "搜尋任務、功能…"}
                classNames={{
                  inputWrapper: "h-14 bg-white border-none shadow-none rounded-full",
                }}
                startContent={
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 16 }} />
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══ CATEGORY TABS (Canva-style pill row) ════════════════════════════ */}
      <div className="px-8 pt-5 pb-2 border-b border-divider overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {CATALOG_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCatalogTab(tab.key)}
              className="shrink-0 px-4 py-1.5 rounded-full text-small font-medium transition"
              style={{
                background: catalogTab === tab.key ? "#7c3aed" : "transparent",
                color:      catalogTab === tab.key ? "white"    : "#6b7280",
                border:     catalogTab === tab.key ? "none"     : "1px solid #e5e7eb",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* INLINE RUN VIEW or CATALOG */}
      {activeTask ? (
        <section ref={runRef} className="px-8 pt-8">
          <Button
            variant="bordered"
            size="sm"
            radius="sm"
            onPress={() => setActiveId(null)}
            startContent={<FontAwesomeIcon icon={faArrowLeft} />}
          >
            {lang === "en" ? "Back to tasks" : "回任務牆"}
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
        <section className="px-8 mt-8">
          {/* ── Atomic tasks — Canva horizontal-scroll card row ── */}
          {(() => {
            const atomicTasks = catalogTasks.filter((t: any) => {
              // Must be atomic AND have a bound agent — otherwise runAtomic will 500
              if (t.impl_kind !== "atomic") return false;
              if (!t.agent_id && !t.agent_name) return false; // no bound agent
              if (catalogSearch) {
                const q = catalogSearch.toLowerCase();
                return (t.name_zh ?? "").toLowerCase().includes(q) ||
                       (t.description ?? "").toLowerCase().includes(q);
              }
              if (catalogTab !== "all") {
                const haystack = ((t.workspace ?? "") + " " + (t.description ?? "") + " " + (t.name_zh ?? "")).toLowerCase();
                return haystack.includes(catalogTab);
              }
              return true;
            });
            if (atomicTasks.length === 0) return null;

            // Cycle through Canva-style gradient palettes per card
            const CARD_PALETTES = [
              { from: "#fde68a", to: "#fbbf24", text: "#92400e" }, // amber
              { from: "#a5f3fc", to: "#22d3ee", text: "#164e63" }, // cyan
              { from: "#c4b5fd", to: "#8b5cf6", text: "#4c1d95" }, // purple
              { from: "#bbf7d0", to: "#34d399", text: "#064e3b" }, // green
              { from: "#fecaca", to: "#f87171", text: "#7f1d1d" }, // red
              { from: "#fed7aa", to: "#fb923c", text: "#7c2d12" }, // orange
              { from: "#bfdbfe", to: "#60a5fa", text: "#1e3a8a" }, // blue
              { from: "#f5d0fe", to: "#c084fc", text: "#581c87" }, // pink
            ];

            return (
              <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-lg tracking-tight">{lang === "en" ? "Featured tasks" : "精選任務"}</h2>
                    <p className="text-tiny text-default-400 mt-0.5">{lang === "en" ? "Tap to ship — no forms" : "按下即產出，不需填寫表單"}</p>
                  </div>
                  <Chip size="sm" variant="flat" color="secondary">{lang === "en" ? `${atomicTasks.length} items` : `${atomicTasks.length} 件`}</Chip>
                </div>

                {/* Canva-style horizontal scroll row */}
                <div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: "none" }}>
                  {atomicTasks.map((t: any, idx: number) => {
                    const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                    return (
                      <button
                        key={`task-${t.id}`}
                        onClick={() => void runAtomic(t)}
                        className="shrink-0 flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                        style={{ width: 220, border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                      >
                        {/* Preview area — gradient */}
                        <div
                          className="flex items-center justify-center"
                          style={{
                            height: 120,
                            background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)`,
                            position: "relative",
                          }}
                        >
                          <span style={{ fontSize: 40 }}>⚡</span>
                          <span
                            className="absolute top-2 right-2 text-tiny font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,0.8)", color: pal.text }}
                          >
                            {lang === "en" ? "Instant" : "即時"}
                          </span>
                        </div>
                        {/* Card info */}
                        <div className="p-3 flex flex-col gap-1 flex-1">
                          <p className="text-small font-semibold leading-tight line-clamp-2" style={{ color: "#111" }}>
                            {lang === "en" ? (t.name_en ?? t.name_zh) : t.name_zh}
                          </p>
                          <p className="text-tiny text-default-500 line-clamp-2">{t.description}</p>
                          <p className="text-tiny mt-auto pt-1" style={{ color: pal.to, fontWeight: 600 }}>
                            {lang === "en" ? "Ship it →" : "立即產出 →"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Squads — Canva "收藏" style collection cards ── */}
          {tasks.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-lg tracking-tight">{lang === "en" ? "Squad jobs" : "Squad 作業"}</h2>
                  <p className="text-tiny text-default-400 mt-0.5">{lang === "en" ? "Multi-agent relay, deeper output" : "多 Agent 接力，深度產出"}</p>
                </div>
                <Chip size="sm" variant="flat">{lang === "en" ? `${tasks.length} squads` : `${tasks.length} 組`}</Chip>
              </div>
              {tasksQuery.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} shadow="none" className="border border-divider p-5 gap-3">
                      <Skeleton className="h-5 w-3/5 rounded" />
                      <Skeleton className="h-3 w-4/5 rounded" />
                      <Skeleton className="h-8 w-32 rounded mt-2" />
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          )}
        </section>
      )}

      {/* Atomic task result modal */}
      <AtomicResultModal
        isOpen={!!atomicResult}
        onClose={() => { setAtomicResult(null); setAtomicError(null); }}
        result={atomicResult}
        error={atomicError}
      />
    </main>
  );
}

/* ─────────────────────────── Atomic Result Modal ─────────────────────── */

function AtomicResultModal({
  isOpen, onClose, result, error,
}: {
  isOpen: boolean;
  onClose: () => void;
  result: any | null;
  error: string | null;
}) {
  const { lang } = useLang();
  const [editBuffer, setEditBuffer] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (result?.pending) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [result?.pending]);

  React.useEffect(() => {
    if (result?.output) setEditBuffer(result.output);
  }, [result?.output]);

  if (!result) return null;
  const t = result.task ?? {};

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Chip size="sm" variant="flat" color="secondary" className="uppercase">⚡ Atomic</Chip>
            <h2 className="text-medium font-semibold">{lang === "en" ? (t.name_en ?? t.name_zh) : t.name_zh}</h2>
          </div>
          {result.agent && (
            <p className="text-tiny text-default-500">
              {lang === "en"
                ? `Delivered by ${result.agent.name} (${result.agent.title ?? ""})`
                : `由 ${result.agent.name}（${result.agent.title ?? ""}）交付`}
              {result.durationMs != null && ` · ${(result.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </ModalHeader>
        <ModalBody className="gap-3">
          {result.pending ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Spinner size="lg" color="secondary" />
              <p className="text-small text-default-500">{lang === "en" ? "Agent working on it…" : "agent 產出中…"}</p>
              <div className="flex items-center gap-1 text-tiny text-default-400">
                <FontAwesomeIcon icon={faClock} />
                <span>{elapsed}s</span>
              </div>
              <Progress
                size="sm"
                isIndeterminate
                color="secondary"
                className="w-48"
                aria-label="loading"
              />
            </div>
          ) : error ? (
            <Card shadow="none" className="border border-danger-200 bg-danger-50">
              <CardBody className="p-3">
                <p className="text-small font-medium text-danger">{lang === "en" ? "✗ Run failed" : "✗ 執行失敗"}</p>
                <p className="text-tiny text-danger-700 mt-1">{error}</p>
              </CardBody>
            </Card>
          ) : (
            <>
              <Textarea
                size="sm"
                variant="bordered"
                value={editBuffer}
                onValueChange={setEditBuffer}
                minRows={10}
                maxRows={24}
                classNames={{ input: "text-small leading-relaxed font-sans whitespace-pre-wrap" }}
              />
              <div className="flex gap-2 items-center">
                <Button
                  size="sm"
                  variant="flat"
                  color="secondary"
                  onPress={() => navigator.clipboard.writeText(editBuffer)}
                  startContent={<FontAwesomeIcon icon={faCopy} />}
                >
                  {lang === "en" ? "Copy to clipboard" : "複製到剪貼簿"}
                </Button>
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>{lang === "en" ? "Close" : "關閉"}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ─────────────────────────── Squad tile ─────────────────────────────── */

function SquadTile({
  task, index: _index, onPress,
}: { task: TaskMeta; index: number; onPress: () => void }) {
  const { lang } = useLang();
  const allAgents = useMemo(() => task.stages.flatMap((s) => s.agents), [task]);
  return (
    <Card
      isPressable
      isHoverable
      onPress={onPress}
      shadow="none"
      className="border border-divider hover:bg-default-50 transition"
    >
      <CardBody className="px-5 pt-5 pb-3 gap-1">
        {/* Row 1 — name (left) + eta meta (right) */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-medium font-semibold leading-tight line-clamp-1 flex-1 min-w-0">
            {task.squadName}
          </h3>
          <Chip
            size="sm" variant="flat" color="default"
            className="shrink-0"
            startContent={<FontAwesomeIcon icon={faClock} className="text-tiny ml-1" />}
          >
            ~ {task.etaSeconds}s
          </Chip>
        </div>
        {/* Row 2 — description (clamp 2) */}
        <p className="text-small text-default-500 line-clamp-2 leading-relaxed">
          {task.squadTagline}
        </p>
      </CardBody>
      <CardFooter className="px-5 pb-4 pt-0 flex items-center gap-2">
        <AvatarGroup max={5} size="sm" isBordered>
          {allAgents.map((a) => (
            <Tooltip key={a.id} content={
              <User
                name={a.name}
                description={`${a.role} · ${TONE_LABEL[a.tone]}`}
                avatarProps={{ name: a.name, size: "sm" }}
              />
            }>
              <Avatar name={a.name} size="sm" isBordered />
            </Tooltip>
          ))}
        </AvatarGroup>
        <span className="ml-1 text-tiny text-default-400">{lang === "en" ? `${allAgents.length} agents` : `${allAgents.length} 位`}</span>
        <Chip
          size="sm" variant="flat" color="primary"
          className="ml-auto"
          startContent={<FontAwesomeIcon icon={faRocket} className="text-tiny ml-1" />}
        >
          {lang === "en" ? "Deploy" : "派出"}
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
  const { lang } = useLang();
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
        setHint(lang === "en" ? "No exact match — pick one below or rephrase." : "沒有完全匹配的任務 — 請從下方選一件，或換個說法。");
      } else {
        onRoute(r.taskId, r.inputs ?? {});
        setText("");
      }
    } catch (e: any) {
      setHint(lang === "en" ? `Routing failed: ${e?.message ?? e}` : `路由失敗：${e?.message ?? e}`);
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
        placeholder={lang === "en" ? "e.g. write 5 IG hooks for NIKE about summer kicks" : "例：幫 NIKE 寫 5 個 IG hook，主題是夏季新鞋"}
        startContent={<FontAwesomeIcon icon={faWandMagicSparkles} style={{ color: ACCENT }} />}
        endContent={
          <Button
            color="primary" radius="sm" size="md"
            isDisabled={disabled || busy || !text.trim()}
            isLoading={busy}
            onPress={submit}
            endContent={!busy && <FontAwesomeIcon icon={faPaperPlane} />}
          >
            {busy ? (lang === "en" ? "Routing" : "路由中") : (lang === "en" ? "Send Agent" : "派 Agent")}
          </Button>
        }
      />
      {hint && (
        <p className="mt-2 text-tiny text-default-500">{hint}</p>
      )}
      <p className="mt-2 text-tiny tracking-wider uppercase text-default-400">
        {lang === "en" ? "AUTO-MATCH · your brand brain loads in" : "AUTO-MATCH · 你的品牌大腦會自動帶入"}
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
  const { lang } = useLang();
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
              <Chip size="sm" variant="flat">{lang === "en" ? `${task.stages.length} stage relay` : `${task.stages.length} 階段接力`}</Chip>
              {currentBrand && (
                <Chip size="sm" color="default" variant="flat">
                  {lang === "en" ? `${currentBrand.name}'s brand brain loaded` : `已自動帶入 ${currentBrand.name} 的 brand brain`}
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
              <span className="text-default-500 text-tiny ml-2">{lang === "en" ? "auto-loaded from shell" : "已從 shell 自動帶入"}</span>
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
            {running
              ? (lang === "en" ? "Pipeline running…" : "管線執行中…")
              : hasRun
                ? (lang === "en" ? "Run again" : "重新派出")
                : (lang === "en" ? `Run pipeline (${task.stages.length} stages)` : `派出管線（${task.stages.length} 階段）`)}
          </Button>

          <Divider />

          <p className="text-tiny tracking-wider uppercase text-default-400">{lang === "en" ? "Pipeline overview" : "管線概覽"}</p>
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
  const { lang } = useLang();
  return (
    <div className="h-full min-h-[460px] flex items-center justify-center text-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" color="default" label={null as any} />
        <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider">READY</Chip>
        <p className="font-semibold text-2xl tracking-tight">{lang === "en" ? `${stages}-stage pipeline ready` : `${stages} 階段管線已就位`}</p>
        <p className="text-small text-default-500 max-w-[420px]">
          {lang === "en" ? (
            <>Fill in the brief on the left, hit "Run pipeline"<br />Agents work in parallel per stage, then hand off to the next</>
          ) : (
            <>填好左邊的 brief，點「派出管線」<br />每個階段的 agent 會同時動工，前一階段交棒給下一階段</>
          )}
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
  const { lang } = useLang();
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
              {isOrch ? (lang === "en" ? "ORCHESTRATOR · wrap up" : "ORCHESTRATOR · 收尾") : (lang === "en" ? `STAGE ${stageIdx + 1} · parallel` : `STAGE ${stageIdx + 1} · 並行`)}
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
  const { lang } = useLang();
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
              {lang === "en" ? `Waiting for ${agent.role}…` : `等待 ${agent.role} 上工…`}
            </p>
          )}
          {status === "working" && (
            <div className="space-y-2">
              <p className="text-tiny font-medium" style={{ color: toneColor }}>
                {lang === "en" ? `${agent.name} is ${verbForTone(tone, lang)}…` : `${agent.name} 正在${verbForTone(tone, lang)}…`}
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
                {lang === "en" ? "✓ Wrap-up done — see the full delivery in the purple box below" : "✓ 收尾完成 — 完整交付見下方紫框"}
              </p>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

function verbForTone(t: AgentTone, lang: "en" | "zh-TW" = "zh-TW"): string {
  if (lang === "en") {
    if (t === "research") return "digging through data";
    if (t === "analyze") return "analyzing";
    if (t === "write") return "writing";
    if (t === "craft") return "polishing";
    return "wrapping up";
  }
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
  const { lang } = useLang();
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
              {lang === "en" ? "FINAL DELIVERABLE · ready" : "FINAL DELIVERABLE · 交付完成"}
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
  const { lang } = useLang();
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
      {copied ? (lang === "en" ? "Copied" : "已複製") : (lang === "en" ? "Copy all" : "複製全文")}
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
  const { lang } = useLang();
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
          <PersonaList title={lang === "en" ? "Values" : "價值觀"} items={data.values} />
          <PersonaList title={lang === "en" ? "Pain points" : "痛點"}   items={data.painPoints} />
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
