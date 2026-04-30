/**
 * SquadLabPage — admin backend for managing + approving + simulating squads.
 *
 * CJ direction 2026-04-30:
 *   "我需要一個管理後台，可以真的測試他們運作的，看到模擬真實的環境，
 *    然後可以專門管理審核和測試 SQUAD"
 *
 * Layout: 3-pane
 *   ┌─ Sidebar (squads list) ─┬─ Main detail ─────────┐
 *   │ filter: draft/approved  │ header / crew / steps │
 *   │ search                  │ [Preview Run] [Approve]│
 *   │ squad cards             │ steps timeline w/      │
 *   │                         │ live mockup preview    │
 *   └─────────────────────────┴────────────────────────┘
 *
 * Route: /admin/squads
 */
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card, CardBody, Button, Input, Select, SelectItem, Chip, Avatar,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Tabs, Tab, ScrollShadow, Divider,
} from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { resolveAvatarUrl } from "../../lib/avatarUrl";
import {
  SquadMockup,
  type SquadMockupVariant,
} from "../../components/SquadMockups";

// Sample data lookup (matches gallery — for preview-run mode)
import {
  SAMPLE_INTAKE, SAMPLE_PILLARS, SAMPLE_CALENDAR,
  SAMPLE_BRIEFS, SAMPLE_QA,
} from "../squad-lab/sampleData";

type Status = "draft" | "approved" | "all";
type Tier = "core" | "defer" | "kill" | "all";

/* ────────────── ErrorBoundary ──────────────
 * Without this, any thrown render error in SquadDetailPane / Modal /
 * mockup components blanks the entire page (React unmounts the tree).
 * Catch + show the message so we get actionable feedback in prod
 * instead of "空白頁面".
 */
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[SquadLabPage] render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-2xl w-full">
            <div className="border border-danger-200 bg-danger-50 rounded-lg p-6">
              <p className="text-tiny text-danger uppercase tracking-wider">RENDER ERROR</p>
              <h2 className="text-medium font-semibold mt-1">Squad Lab 頁面渲染失敗</h2>
              <p className="text-small text-default-700 mt-2">
                {this.state.error.message}
              </p>
              <pre className="text-tiny bg-content1 border border-divider rounded-md p-3 mt-3 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
              <div className="flex gap-2 mt-3">
                <button
                  className="text-small px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
                  onClick={() => { this.setState({ error: null }); }}
                >
                  重試渲染
                </button>
                <button
                  className="text-small px-3 py-1.5 rounded-md border border-divider"
                  onClick={() => { window.location.href = "/"; }}
                >
                  回首頁
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

function SquadLabPageInner() {
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("squad")) || null;
  const [status, setStatus] = React.useState<Status>("draft");
  const [tier,   setTier]   = React.useState<Tier>("all");
  const [search, setSearch] = React.useState("");

  const utils = (trpc as any).useUtils?.() ?? null;

  const listQuery = (trpc as any).squad?.listForAdmin?.useQuery
    ? (trpc as any).squad.listForAdmin.useQuery(
        { status, tier, search: search.trim() || undefined },
        { refetchOnWindowFocus: false },
      )
    : { data: [], isLoading: false };
  const squads: any[] = (listQuery.data as any[]) ?? [];

  const detailQuery = (trpc as any).squad?.getForAdmin?.useQuery
    ? (trpc as any).squad.getForAdmin.useQuery(
        { id: selectedId ?? 0 },
        { enabled: !!selectedId, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };
  const squad = detailQuery.data as any;

  const approveMutation = (trpc as any).squad?.approve?.useMutation?.({
    onSuccess: () => {
      utils?.squad?.listForAdmin?.invalidate?.();
      utils?.squad?.getForAdmin?.invalidate?.();
    },
  }) ?? null;

  const rejectMutation = (trpc as any).squad?.reject?.useMutation?.({
    onSuccess: () => {
      utils?.squad?.listForAdmin?.invalidate?.();
      utils?.squad?.getForAdmin?.invalidate?.();
    },
  }) ?? null;

  const selectSquad = (id: number) => {
    const next = new URLSearchParams(params);
    next.set("squad", String(id));
    setParams(next, { replace: true });
  };

  const [previewOpen, setPreviewOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="h-12 border-b border-divider flex items-center px-4 gap-3 bg-content1 shrink-0">
        <span className="text-tiny text-default-500 uppercase tracking-wider">ADMIN</span>
        <span className="text-medium font-semibold">Squad Lab</span>
        <span className="text-tiny text-default-500">— 審核 / 測試 / 模擬 squad 運作</span>
        <span className="ml-auto text-tiny text-default-500">
          {squads.length} squads ({status === "draft" ? "draft" : status === "approved" ? "approved" : "all"})
        </span>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="w-[360px] border-r border-divider flex flex-col min-h-0 bg-content1">
          <div className="p-3 flex flex-col gap-2 border-b border-divider">
            <div className="flex gap-2">
              <Select
                size="sm" radius="md" variant="bordered"
                aria-label="status filter"
                selectedKeys={new Set([status])}
                onSelectionChange={(keys) => setStatus(Array.from(keys as Set<string>)[0] as Status)}
                classNames={{ trigger: "h-8" }}
              >
                <SelectItem key="draft">Draft</SelectItem>
                <SelectItem key="approved">Approved</SelectItem>
                <SelectItem key="all">All</SelectItem>
              </Select>
              <Select
                size="sm" radius="md" variant="bordered"
                aria-label="tier filter"
                selectedKeys={new Set([tier])}
                onSelectionChange={(keys) => setTier(Array.from(keys as Set<string>)[0] as Tier)}
                classNames={{ trigger: "h-8" }}
              >
                <SelectItem key="all">All tiers</SelectItem>
                <SelectItem key="core">Core</SelectItem>
                <SelectItem key="defer">Defer</SelectItem>
                <SelectItem key="kill">Kill</SelectItem>
              </Select>
            </div>
            <Input
              size="sm" radius="md" variant="bordered"
              placeholder="搜尋名稱 / slug / methodology"
              value={search}
              onValueChange={setSearch}
            />
          </div>
          <ScrollShadow className="flex-1 overflow-y-auto">
            <div className="p-2 flex flex-col gap-1">
              {listQuery.isLoading && <p className="text-tiny text-default-500 p-2">載入中…</p>}
              {!listQuery.isLoading && squads.length === 0 && (
                <p className="text-tiny text-default-500 p-2">無符合條件的 squad</p>
              )}
              {squads.map((s) => (
                <SquadListCard
                  key={s.id}
                  squad={s}
                  active={s.id === selectedId}
                  onClick={() => selectSquad(s.id)}
                />
              ))}
            </div>
          </ScrollShadow>
        </aside>

        {/* ── Main detail ──────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-default-50">
          {!selectedId && (
            <div className="h-full flex items-center justify-center text-center p-10">
              <div className="max-w-[420px]">
                <div className="text-5xl mb-4">🧪</div>
                <h2 className="text-medium font-semibold mb-2">選一個 squad 開始</h2>
                <p className="text-small text-default-500 leading-relaxed">
                  左側列表選一個草稿 squad → 看 7 個 step 的 mockup → 按 Preview Run 模擬一次 → 滿意按 Approve 上前台。
                </p>
              </div>
            </div>
          )}
          {selectedId && detailQuery.isLoading && (
            <p className="text-tiny text-default-500 p-6">載入 squad 細節中…</p>
          )}
          {selectedId && squad && (
            <SquadDetailPane
              squad={squad}
              onApprove={async (note) => {
                if (!approveMutation) return;
                await approveMutation.mutateAsync({ id: squad.id, note });
              }}
              onReject={async (reason) => {
                if (!rejectMutation) return;
                await rejectMutation.mutateAsync({ id: squad.id, reason });
              }}
              onPreviewRun={() => setPreviewOpen(true)}
              busyApprove={approveMutation?.isPending}
              busyReject={rejectMutation?.isPending}
            />
          )}
        </main>
      </div>

      {/* Preview-run modal */}
      <SquadPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        squad={squad}
      />
    </div>
  );
}

export default function SquadLabPage() {
  return (
    <PageErrorBoundary>
      <SquadLabPageInner />
    </PageErrorBoundary>
  );
}

/* ─────────────── Sub: Squad list card ─────────────── */
function SquadListCard({ squad, active, onClick }: { squad: any; active: boolean; onClick: () => void }) {
  return (
    <Card
      isPressable
      shadow="none"
      onPress={onClick}
      className={`w-full text-left ${active ? "border-primary bg-primary-50" : "border-divider"} border`}
    >
      <CardBody className="p-3 gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-small font-medium leading-tight truncate">{squad.name}</p>
          {squad.is_approved
            ? <Chip size="sm" variant="flat" color="success" className="h-4 text-tiny">已核准</Chip>
            : <Chip size="sm" variant="flat" color="warning" className="h-4 text-tiny">draft</Chip>}
        </div>
        <p className="text-tiny text-default-500 truncate"><code>{squad.slug}</code></p>
        <div className="flex items-center gap-1.5 text-tiny text-default-500">
          <span>{squad.tier}</span>
          <span>·</span>
          <span>{squad.strategy_layer ?? "—"}</span>
          <span>·</span>
          <span>{squad.step_count ?? 0} steps</span>
          <span>·</span>
          <span>{squad.agent_count ?? 0} agents</span>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────── Sub: Squad detail pane ─────────────── */
function SquadDetailPane({
  squad, onApprove, onReject, onPreviewRun, busyApprove, busyReject,
}: {
  squad: any;
  onApprove: (note?: string) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onPreviewRun: () => void;
  busyApprove?: boolean;
  busyReject?: boolean;
}) {
  const agents: any[] = Array.isArray(squad.agents) ? squad.agents : [];
  const steps:  any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const agentMap: Record<number, any> = squad.agentMap ?? {};

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-5 gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-tiny text-default-500 uppercase tracking-wider">SQUAD #{squad.id}</p>
              <h2 className="text-xl font-semibold tracking-tight">{squad.name}</h2>
              <p className="text-small text-default-500 mt-1">
                <code className="text-tiny">{squad.slug}</code>
                {squad.methodology && <> · {squad.methodology}</>}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              {squad.is_approved
                ? <Chip size="sm" variant="flat" color="success">已核准 · {String(squad.approved_at ?? "").split("T")[0]}</Chip>
                : <Chip size="sm" variant="flat" color="warning">Draft (is_approved=0)</Chip>}
              <Chip size="sm" variant="flat">{squad.tier}</Chip>
              <Chip size="sm" variant="flat">{squad.strategy_layer ?? "—"}</Chip>
            </div>
          </div>

          {squad.description && (
            <p className="text-small text-default-700 leading-relaxed mt-2">{squad.description}</p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button color="primary" size="sm" onPress={onPreviewRun}>
              ▶ Preview Run（模擬執行）
            </Button>
            {!squad.is_approved && (
              <Button
                color="success"
                size="sm"
                isLoading={!!busyApprove}
                onPress={() => onApprove()}
              >
                ✓ Approve（上前台）
              </Button>
            )}
            {squad.is_approved && (
              <Button
                color="warning"
                size="sm"
                variant="bordered"
                isLoading={!!busyReject}
                onPress={() => onReject()}
              >
                ↩ Revoke（取消核准）
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Crew */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-4">
          <p className="text-tiny text-default-500 uppercase tracking-wider mb-2">CREW · {agents.length} 人</p>
          <div className="flex items-center gap-2 flex-wrap">
            {agents.map((m, i) => {
              const a = agentMap[Number(m.id)] ?? {};
              const src = resolveAvatarUrl(a.avatarUrl ?? null, 64);
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-divider bg-content1">
                  <Avatar size="sm" src={src ?? undefined} name={a.englishName ?? a.name ?? m.name} showFallback />
                  <div className="min-w-0">
                    <p className="text-tiny font-semibold flex items-center gap-1 truncate">
                      {a.englishName ?? a.name ?? m.name}
                      {m.is_lead && <Chip size="sm" variant="flat" color="primary" className="h-4 text-tiny">Lead</Chip>}
                    </p>
                    <p className="text-tiny text-default-500 truncate">
                      {a.title ?? m.role} · {a.aiModel ?? "n/a"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Steps timeline */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-4 gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-tiny text-default-500 uppercase tracking-wider">STEPS · {steps.length} 步</p>
            <span className="text-tiny text-default-500">每 step 7 attributes governance</span>
          </div>
          <div className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <StepRow key={i} step={s} agentMap={agentMap} />
            ))}
            {steps.length === 0 && (
              <p className="text-tiny text-default-500">這個 squad 還沒有 step（草稿初建狀態）</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Raw JSON viewer */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-4 gap-2">
          <Tabs aria-label="raw" size="sm" variant="underlined">
            <Tab key="steps" title="Raw steps JSON">
              <pre className="text-tiny bg-default-50 border border-divider rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto">
                {JSON.stringify(steps, null, 2)}
              </pre>
            </Tab>
            <Tab key="agents" title="Raw agents JSON">
              <pre className="text-tiny bg-default-50 border border-divider rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto">
                {JSON.stringify(agents, null, 2)}
              </pre>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
}

function StepRow({ step, agentMap }: { step: any; agentMap: Record<number, any> }) {
  const a = step.assignedAgentId ? agentMap[Number(step.assignedAgentId)] : null;
  const src = resolveAvatarUrl(a?.avatarUrl ?? null, 64);
  return (
    <div className="flex items-start gap-3 p-2 rounded-md border border-divider bg-content1">
      <span className="text-tiny font-bold tabular-nums w-6 text-default-500 mt-0.5">
        {step.order ?? "—"}
      </span>
      <Avatar size="sm" src={src ?? undefined} name={a?.englishName ?? a?.name ?? step.assignedAgentName} showFallback />
      <div className="flex-1 min-w-0">
        <p className="text-small font-medium truncate">{step.name}</p>
        <p className="text-tiny text-default-500 line-clamp-2">{step.description}</p>
        <div className="flex items-center gap-1 flex-wrap mt-1">
          {step.outputKind && <Chip size="sm" variant="flat" className="h-4 text-tiny">{step.outputKind}</Chip>}
          {step.mockupVariant && <Chip size="sm" variant="flat" color="primary" className="h-4 text-tiny">{step.mockupVariant}</Chip>}
          {step.aiModel && <Chip size="sm" variant="flat" className="h-4 text-tiny">{step.aiModel}</Chip>}
          {step.dataRequirements?.minUrls > 0 && (
            <Chip size="sm" variant="flat" color="default" className="h-4 text-tiny">
              {step.dataRequirements.minUrls} URLs
            </Chip>
          )}
          {step.userInputFields?.length > 0 && (
            <Chip size="sm" variant="flat" color="warning" className="h-4 text-tiny">
              👤 {step.userInputFields.length} 個用戶欄位
            </Chip>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Sub: Preview run modal ─────────────── */
function SquadPreviewModal({
  open, onClose, squad,
}: { open: boolean; onClose: () => void; squad: any }) {
  // Hooks must run unconditionally — early-return below.
  const steps: any[] = squad && Array.isArray(squad.steps) ? squad.steps : [];
  const [stepIdx, setStepIdx] = React.useState(0);
  // Per-step live result cache: stepIdx → { mockupData, rawText, parsed, durationMs, ok }
  const [liveResults, setLiveResults] = React.useState<Record<number, any>>({});
  // Scope picker for runtime context — supports brand / product / event
  // (CJ correction 2026-04-30: not just brand)
  const [scopeKind, setScopeKind] = React.useState<"brand" | "product" | "event">("brand");
  const [scopeId, setScopeId] = React.useState<number | null>(null);
  // Mode: 'mock' (sample data) vs 'live' (real LLM)
  const [mode, setMode] = React.useState<"mock" | "live">("mock");

  React.useEffect(() => {
    if (open) {
      setStepIdx(0);
      setLiveResults({});
      setMode("mock");
    }
  }, [open]);

  // scope.options returns { brands, products, events } — same source as ScopeBar
  const scopeOptionsQuery = (trpc as any).scope?.options?.useQuery
    ? (trpc as any).scope.options.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null };
  const opts = scopeOptionsQuery.data as { brands: any[]; products: any[]; events: any[] } | null;
  const scopeChoices = (() => {
    if (!opts) return [] as any[];
    if (scopeKind === "brand") return opts.brands ?? [];
    if (scopeKind === "product") return opts.products ?? [];
    if (scopeKind === "event") return opts.events ?? [];
    return [];
  })();

  const runLive = (trpc as any).squad?.runStepLive?.useMutation?.() ?? null;

  if (!squad) return null;
  const step = steps[stepIdx];

  // Sample-data picker by mockupVariant — uses the same fixtures as gallery.
  const sampleFor = (variant: string): any => {
    switch (variant) {
      case "IntakeFormMockup":   return SAMPLE_INTAKE;
      case "PillarTableMockup":  return SAMPLE_PILLARS;
      case "CalendarGridMockup": return SAMPLE_CALENDAR;
      case "FBPostBriefMockup":  return { briefs: SAMPLE_BRIEFS };
      case "QAReportMockup":     return SAMPLE_QA;
      case "ResearchPanelMockup":
        // Empty initial state — research output only meaningful from live run
        return { budget: { minUrls: 8, minChars: 12000 } };
      default: return null;
    }
  };

  // For live mode, gather upstream outputs (live results from prior steps)
  const upstreamForStep = (idx: number): Record<string, any> => {
    const out: Record<string, any> = {};
    for (let i = 0; i < idx; i++) {
      if (liveResults[i]?.parsed) out[`step${i}`] = liveResults[i].parsed;
    }
    return out;
  };

  const onRunLive = async (idx: number) => {
    if (!runLive) return;
    setMode("live");
    try {
      const res = await runLive.mutateAsync({
        squadId: squad.id,
        stepIndex: idx,
        scopeKind,
        scopeId: scopeId ?? undefined,
        userInput: liveResults[1]?.parsed ?? undefined, // step 1 = user checkpoint
        upstreamOutputs: upstreamForStep(idx),
      });
      setLiveResults((prev) => ({ ...prev, [idx]: res }));
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      // Friendlier message for known failure modes
      const friendly = raw.includes("Unexpected token") || raw.includes("<html>")
        ? "後端連線中斷或超時 — 通常是 LLM 回應太久被代理層 502。請重試，或在 server log 看 callLLM attempts。"
        : raw;
      setLiveResults((prev) => ({ ...prev, [idx]: { ok: false, error: friendly, rawError: raw } }));
    }
  };

  // Use the centralized dispatcher — it handles null data with a graceful
  // empty state, so we never crash on missing live mockupData.
  const renderMockup = (variant: SquadMockupVariant | string, data: any, isActive: boolean) => {
    if (!variant) {
      return <p className="text-tiny text-default-500 p-4">⚠ 此 step 沒指定 mockupVariant</p>;
    }
    return <SquadMockup variant={variant as SquadMockupVariant} data={data} readOnly isActive={isActive} />;
  };

  const live = liveResults[stepIdx];
  // Live mode: ONLY show live mockupData (never fall back to sample, so
  // user can't confuse mock vs real). If LLM didn't return parseable
  // data, show empty mockup + the raw output debug section.
  const dataForRender = mode === "live"
    ? (live?.mockupData ?? null)
    : sampleFor(step?.mockupVariant ?? "");

  return (
    <Modal isOpen={open} onClose={onClose} size="5xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <p className="text-tiny text-default-500 uppercase tracking-wider">PREVIEW RUN</p>
          <h2 className="text-medium font-semibold">{squad.name}</h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {/* Scope picker — kind + id */}
            <div className="flex items-center gap-2">
              <span className="text-tiny text-default-500">綁定 scope（live 必選）:</span>
              <Select
                size="sm"
                aria-label="scope kind"
                selectedKeys={new Set([scopeKind])}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys as Set<string>)[0] as "brand" | "product" | "event";
                  setScopeKind(k);
                  setScopeId(null);
                }}
                className="min-w-[110px]"
              >
                <SelectItem key="brand">品牌</SelectItem>
                <SelectItem key="product">產品</SelectItem>
                <SelectItem key="event">活動</SelectItem>
              </Select>
              <Select
                size="sm"
                aria-label="scope target"
                placeholder={scopeChoices.length === 0 ? `沒有${scopeKind === "brand" ? "品牌" : scopeKind === "product" ? "產品" : "活動"}` : `選一個${scopeKind === "brand" ? "品牌" : scopeKind === "product" ? "產品" : "活動"}`}
                selectedKeys={scopeId ? new Set([String(scopeId)]) : new Set()}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys as Set<string>)[0];
                  setScopeId(k ? Number(k) : null);
                }}
                className="min-w-[220px]"
                isDisabled={scopeChoices.length === 0}
              >
                {scopeChoices.map((c: any) => (
                  <SelectItem key={String(c.id)}>{c.name}</SelectItem>
                ))}
              </Select>
            </div>
            <Chip size="sm" variant="flat" color={mode === "live" ? "success" : "default"}>
              {mode === "live" ? "🔴 LIVE 真實 LLM" : "⚪ MOCK 樣本資料"}
            </Chip>
          </div>
        </ModalHeader>
        <ModalBody className="gap-3">
          {/* Step navigator */}
          <div className="flex items-center gap-1 flex-wrap pb-2 border-b border-divider">
            {steps.map((s, i) => {
              const r = liveResults[i];
              return (
                <Button
                  key={i}
                  size="sm"
                  variant={i === stepIdx ? "solid" : "bordered"}
                  color={i === stepIdx ? "primary" : "default"}
                  onPress={() => setStepIdx(i)}
                  className="text-tiny"
                  startContent={
                    r?.ok === true ? <span className="text-success">●</span>
                    : r?.ok === false ? <span className="text-danger">●</span>
                    : null
                  }
                >
                  {s.order ?? i} · {(s.name ?? "").slice(0, 16)}
                </Button>
              );
            })}
          </div>

          {/* Step detail + Run Live button */}
          {step && (
            <>
              <div className="flex items-start gap-3 px-1">
                <div className="flex-1 min-w-0">
                  <p className="text-small font-semibold">{step.name}</p>
                  <p className="text-tiny text-default-500">{step.description}</p>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {step.outputKind && <Chip size="sm" variant="flat" className="h-4 text-tiny">{step.outputKind}</Chip>}
                    {step.aiModel && step.aiModel !== "n/a" && <Chip size="sm" variant="flat" className="h-4 text-tiny">{step.aiModel}</Chip>}
                    {step.aiModel === "n/a" && <Chip size="sm" variant="flat" color="warning" className="h-4 text-tiny">UI Step（無 LLM）</Chip>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Button
                    size="sm"
                    color="success"
                    isLoading={runLive?.isPending}
                    isDisabled={!scopeId || step.aiModel === "n/a"}
                    onPress={() => onRunLive(stepIdx)}
                  >
                    🔴 Run Live（真實 LLM）
                  </Button>
                  {!scopeId && (
                    <span className="text-tiny text-warning">先選 scope</span>
                  )}
                  {step.aiModel === "n/a" && (
                    <span className="text-tiny text-default-500">UI step 不打 LLM</span>
                  )}
                </div>
              </div>
              <Divider />

              {/* Result errors */}
              {live?.ok === false && (
                <Card shadow="none" className="border border-danger-200 bg-danger-50">
                  <CardBody className="p-3">
                    <p className="text-small font-medium text-danger">✗ Live 執行失敗</p>
                    <p className="text-tiny text-danger-700 mt-1">{live.error}</p>
                  </CardBody>
                </Card>
              )}

              {/* Live execution metadata */}
              {live?.ok === true && (
                <Card shadow="none" className="border border-success-200 bg-success-50">
                  <CardBody className="p-2 px-3 flex-row items-center gap-3">
                    <Chip size="sm" variant="flat" color="success">✓ Live 完成</Chip>
                    {live.durationMs != null && (
                      <span className="text-tiny text-default-700">耗時 {(live.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    {live.note && <span className="text-tiny text-default-700">· {live.note}</span>}
                    {live.parsed == null && live.rawText && (
                      <span className="text-tiny text-warning">⚠ JSON 解析失敗，僅顯示 raw 內容</span>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* Mockup rendering */}
              {renderMockup(step.mockupVariant ?? "", dataForRender, mode === "live" && runLive?.isPending === true)}

              {/* Raw output (live mode) */}
              {mode === "live" && live?.rawText && (
                <details className="px-1">
                  <summary className="text-tiny text-default-500 cursor-pointer">View raw LLM output</summary>
                  <pre className="text-tiny bg-default-50 border border-divider rounded-md p-3 mt-2 overflow-x-auto max-h-[260px] overflow-y-auto whitespace-pre-wrap">
                    {live.rawText}
                  </pre>
                </details>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter className="flex items-center justify-between">
          <p className="text-tiny text-default-500">
            Step {stepIdx + 1} / {steps.length}
            {Object.keys(liveResults).length > 0 && (
              <> · 已 live: {Object.keys(liveResults).length}</>
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="light" onPress={onClose}>關閉</Button>
            <Button size="sm" variant="bordered" onPress={() => setStepIdx(Math.max(0, stepIdx - 1))} isDisabled={stepIdx === 0}>
              ← 上一步
            </Button>
            <Button size="sm" color="primary" onPress={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))} isDisabled={stepIdx >= steps.length - 1}>
              下一步 →
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
