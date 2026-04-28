/**
 * BoardroomPage — 比稿（邀比稿）3-col live orchestra layout.
 *
 * Replaces the previous 3-step wizard (input → pick → see pitches)
 * with a single page that mirrors /picker:
 *
 *   ┌── LEFT 320px ──┬── CENTER (flex) ────┬── RIGHT 360px ──┐
 *   │ Brief column   │ Pitches gallery     │ Candidates list │
 *   │ • brand chip   │ • empty state, OR   │ • 12 candidate  │
 *   │ • brief textarea│  each pitch as a   │   cards         │
 *   │ • find consultant│ Card with 4-col   │ • match score    │
 *   │ • progress chip │  pitch grid + chat │ • TaskChip       │
 *   │ • 邀比稿 CTA   │ • streaming live   │ • multi-select   │
 *   └────────────────┴──────────────────────┴─────────────────┘
 *
 * Pitches stream in: each selected agent fires its own pitch mutation
 * in parallel; cards render as each resolves so user sees progress
 * instead of waiting for the whole batch.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Alert, Avatar, Badge, Breadcrumbs, BreadcrumbItem, Button, Card, CardBody,
  CardHeader, Chip, Divider, Input, Progress, ScrollShadow, Skeleton, Spinner,
  Textarea, Tooltip, User,
} from "@heroui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentAvatar } from "../components/AgentAvatar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faBookOpen, faBrain, faCheck, faCircleCheck, faComments,
  faGavel, faMagnifyingGlass, faPaperPlane, faPenToSquare, faRotateRight,
  faTriangleExclamation, faUserGroup, faWandMagicSparkles, faChartSimple,
  faRocket,
} from "@fortawesome/free-solid-svg-icons";

type Candidate = {
  agentId: number;
  name: string;
  title: string;
  bio: string | null;
  primarySkill: string | null;
  aiModel: string;
  providerBucket: string;
  squadId: number | null;
  squadSlug: string | null;
  squadName: string | null;
  squadMethodology: string | null;
  squadStrategyLayer: string | null;
  matchScore: number;
  matchReasons: string[];
};

type Pitch = Candidate & {
  proposal: string;
  provider: string;
  model: string;
  error: string | null;
};

type PitchState = { status: "queued" | "working" | "delivered" | "failed"; pitch?: Pitch };

type ChipColor = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
const PROVIDER_COLOR: Record<string, ChipColor> = {
  "azure-foundry": "primary", anthropic: "warning", qwen: "default",
  zhipu: "primary", perplexity: "success", forge: "secondary",
  openai: "success", gemini: "primary", google: "primary", cohere: "danger",
};

function ProviderChip({ provider, model }: { provider: string; model: string }) {
  return (
    <Chip
      size="sm" variant="flat"
      color={PROVIDER_COLOR[provider] ?? "default"}
      classNames={{ content: "text-tiny" }}
    >
      {provider}{model ? ` · ${model}` : ""}
    </Chip>
  );
}

// Avatar src = agents.avatarUrl when present, else undefined so HeroUI
// Avatar falls back to initial letter (per design system — no DiceBear).
const agentAvatar = (a: { avatarUrl?: string | null; name?: string | null }) =>
  a.avatarUrl ?? undefined;

// parsePitch removed (PR8) — LLM output rarely matches the 4-heading
// schema we tried to enforce; it was producing **1. ... **2. ...** style
// numbered bold lists that left half the grid empty + text overflow.
// We now render the full proposal as markdown, letting ReactMarkdown +
// prose styles handle headings / lists / bold naturally.

/* ─── Page ─────────────────────────────────────────────────────────── */

export default function BoardroomPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>() ?? ({} as ShellOutletCtx);
  const brandId = ctx.brandId ?? undefined;
  const currentBrand = (ctx.brands || []).find((b: any) => b?.id === ctx.brandId);
  const brandName = currentBrand?.name || "未指定品牌";

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pitchStates, setPitchStates] = useState<Map<number, PitchState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [hiringId, setHiringId] = useState<number | null>(null);

  const recommendQuery = (trpc as any).boardroom.recommendAgents.useQuery(
    { brandId, query, limit: 12 }, { enabled: false }
  );
  const pitchMut = (trpc as any).boardroom.pitch.useMutation();
  const createMission = (trpc as any).mission?.create?.useMutation?.() ?? { mutateAsync: async () => null };

  const onHire = async (c: Candidate) => {
    if (!c.squadSlug) {
      setError(`${c.name} 沒有對應的 squad（無法直接派出，可能是個人顧問）`);
      return;
    }
    setHiringId(c.agentId);
    setError(null);
    try {
      const res = await createMission.mutateAsync({
        title: `${c.squadName ?? c.name} · ${query.slice(0, 40)}`,
        description: query,
        squadSlug: c.squadSlug,
        workspace: "",
        brandId: brandId ?? undefined,
        brandName: currentBrand?.name,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      // Jump into picker workspace with mission active — orchestra produces deliverable
      navigate(`/picker?mission=${res.id}&slug=${encodeURIComponent(c.squadSlug)}`);
    } catch (e: any) {
      setError(`派出 ${c.name} 失敗：${e?.message ?? e}`);
      setHiringId(null);
    }
  };

  const recommending = recommendQuery.isFetching;
  const anyPitchInFlight = useMemo(
    () => Array.from(pitchStates.values()).some((p) => p.status === "queued" || p.status === "working"),
    [pitchStates],
  );

  const onFindAgents = async () => {
    if (query.trim().length < 2) return;
    setError(null);
    setCandidates([]);
    setSelected(new Set());
    setPitchStates(new Map());
    try {
      const r = await recommendQuery.refetch();
      const list = (r.data?.candidates as Candidate[]) ?? [];
      setCandidates(list);
      if (list.length === 0) setError("沒有找到匹配的顧問。試著改個說法。");
    } catch (e: any) {
      setError(`搜尋失敗：${e?.message ?? e}`);
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const onPitch = async () => {
    if (selected.size === 0) return;
    setError(null);
    // Init pitch states
    const init = new Map<number, PitchState>();
    for (const id of selected) init.set(id, { status: "queued" });
    setPitchStates(init);

    // Fire each in parallel; render as each resolves
    await Promise.all(Array.from(selected).map(async (id) => {
      setPitchStates((prev) => {
        const next = new Map(prev);
        next.set(id, { status: "working" });
        return next;
      });
      try {
        const result = await pitchMut.mutateAsync({ brandId, query, agentIds: [id] });
        const p: Pitch | undefined = (result.pitches as Pitch[])?.[0];
        setPitchStates((prev) => {
          const next = new Map(prev);
          if (p) next.set(id, { status: p.error ? "failed" : "delivered", pitch: p });
          else next.set(id, { status: "failed" });
          return next;
        });
      } catch (e: any) {
        setPitchStates((prev) => {
          const next = new Map(prev);
          next.set(id, { status: "failed" });
          return next;
        });
      }
    }));
  };

  const reset = () => {
    setCandidates([]);
    setSelected(new Set());
    setPitchStates(new Map());
    setError(null);
  };

  const deliveredCount = Array.from(pitchStates.values()).filter((p) => p.status === "delivered").length;
  const totalSelected = pitchStates.size;
  const progressPct = totalSelected ? (deliveredCount / totalSelected) * 100 : 0;

  return (
    <main className="h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] divide-x divide-divider">

      {/* ─── LEFT: BRIEF ─────────────────────────────────────────────── */}
      <aside className="overflow-y-auto p-5 space-y-4 bg-content1">
        <Breadcrumbs size="sm">
          <BreadcrumbItem href="/">首頁</BreadcrumbItem>
          <BreadcrumbItem>Boardroom · 比稿</BreadcrumbItem>
        </Breadcrumbs>

        <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider">
          BOARDROOM
        </Chip>
        <h1 className="font-semibold text-3xl tracking-tight leading-tight">
          邀請顧問為您比稿
        </h1>
        <p className="text-tiny text-default-500">
          說出需求 → 系統推薦 12 位候選 → 您勾選 → 顧問各自提案
        </p>

        {currentBrand && (
          <Chip
            size="md" variant="flat" color="default" radius="md"
            className="w-full h-auto py-1.5 px-2"
            startContent={<FontAwesomeIcon icon={faBrain} className="ml-1" />}
            classNames={{ content: "flex items-center gap-1.5" }}
          >
            <span className="font-medium">{brandName}</span>
            <span className="text-tiny text-default-500">brand brain 自動帶入</span>
          </Chip>
        )}

        <Divider />

        <p className="text-tiny tracking-wider uppercase text-default-500 font-medium flex items-center gap-1.5">
          <FontAwesomeIcon icon={faPenToSquare} /> 您今天想解決什麼問題
        </p>
        <Textarea
          placeholder="例：我要做新品上市的 IG 內容企劃，預算有限，30 天內要看到效果…"
          variant="bordered" radius="md"
          minRows={5} maxRows={10}
          value={query}
          onValueChange={setQuery}
          isDisabled={anyPitchInFlight}
        />

        <div className="flex flex-wrap gap-1.5">
          {[
            "新品上市的 IG 內容企劃",
            "B2B SaaS LinkedIn 內容增長",
            "電商品牌找新的市場定位",
            "品牌故事重塑",
          ].map((e) => (
            <Chip
              key={e} size="sm" variant="bordered"
              className="cursor-pointer hover:bg-default-100"
              onClick={() => setQuery(e)}
            >
              {e}
            </Chip>
          ))}
        </div>

        <Button
          color="primary" size="lg" radius="lg"
          className="w-full font-medium"
          isDisabled={query.trim().length < 2 || anyPitchInFlight}
          isLoading={recommending}
          onPress={onFindAgents}
          startContent={!recommending && <FontAwesomeIcon icon={faMagnifyingGlass} />}
        >
          {recommending ? "搜尋中…" : "找候選顧問"}
        </Button>

        {error && <Alert color="danger" variant="flat" title={error} onClose={() => setError(null)} />}

        {/* Pipeline progress (post-pitch) */}
        {totalSelected > 0 && (
          <>
            <Divider />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-tiny">
                <span className="text-default-500 uppercase tracking-wider">PIPELINE</span>
                <span className="tabular-nums text-default-700">
                  {deliveredCount} / {totalSelected}
                </span>
              </div>
              <Progress
                size="sm"
                value={progressPct}
                color={progressPct === 100 ? "success" : "secondary"}
                isIndeterminate={anyPitchInFlight && progressPct === 0}
              />
              <p className="text-tiny text-default-500">
                {anyPitchInFlight ? "顧問撰寫中…" : progressPct === 100 ? "✓ 所有提案就緒" : ""}
              </p>
            </div>
            <Button size="sm" variant="light" onPress={reset} className="w-full">
              <FontAwesomeIcon icon={faRotateRight} className="mr-1.5" /> 重新比稿
            </Button>
          </>
        )}
      </aside>

      {/* ─── CENTER: PITCHES GALLERY ─────────────────────────────────── */}
      <section className="overflow-y-auto bg-default-50">
        <div className="p-6 lg:p-10 max-w-[960px] mx-auto">
          {pitchStates.size === 0 ? (
            <EmptyStage candidatesLen={candidates.length} query={query} />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <FontAwesomeIcon icon={faGavel} className="text-secondary" />
                <h2 className="text-xl font-semibold tracking-tight">提案就位</h2>
                <Chip size="sm" variant="flat">
                  {deliveredCount} / {totalSelected} 已完成
                </Chip>
              </div>
              {Array.from(pitchStates.entries()).map(([agentId, state]) => {
                const c = candidates.find((x) => x.agentId === agentId);
                if (!c) return null;
                return (
                  <PitchCard
                    key={agentId}
                    candidate={c}
                    state={state}
                    onHire={() => onHire(c)}
                    isHiring={hiringId === c.agentId}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── RIGHT: CANDIDATES ────────────────────────────────────────── */}
      <aside className="overflow-y-auto bg-content1 flex flex-col">
        <div className="p-4 space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-tiny tracking-wider uppercase text-default-500 font-medium flex items-center gap-1.5">
              <FontAwesomeIcon icon={faUserGroup} /> CANDIDATES
            </p>
            {candidates.length > 0 && (
              <Chip size="sm" variant="flat">{candidates.length} 位</Chip>
            )}
          </div>

          {recommending && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} shadow="none" className="border border-divider">
                  <CardBody className="p-3 gap-2">
                    <div className="flex gap-2 items-center">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-2/3 rounded" />
                        <Skeleton className="h-2.5 w-4/5 rounded" />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {!recommending && candidates.length === 0 && (
            <Card shadow="none" className="border-2 border-dashed border-divider">
              <CardBody className="py-10 items-center text-center gap-2">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-3xl text-default-300" />
                <p className="text-small font-medium">尚未搜尋</p>
                <p className="text-tiny text-default-500">
                  在左側輸入需求，按下「找候選顧問」
                </p>
              </CardBody>
            </Card>
          )}

          {!recommending && candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.agentId}
                  candidate={c}
                  selected={selected.has(c.agentId)}
                  disabled={!selected.has(c.agentId) && selected.size >= 5}
                  pitched={pitchStates.has(c.agentId)}
                  pitchStatus={pitchStates.get(c.agentId)?.status}
                  onToggle={() => toggle(c.agentId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sticky pitch CTA */}
        {candidates.length > 0 && (
          <div className="sticky bottom-0 p-3 bg-content1 border-t border-divider">
            <Button
              color="default" size="lg" radius="lg"
              className="w-full font-medium"
              isDisabled={selected.size === 0 || anyPitchInFlight}
              isLoading={anyPitchInFlight}
              onPress={onPitch}
              startContent={!anyPitchInFlight && <FontAwesomeIcon icon={faPaperPlane} />}
              endContent={!anyPitchInFlight && <FontAwesomeIcon icon={faArrowRight} />}
            >
              {anyPitchInFlight
                ? `撰寫中（${deliveredCount}/${totalSelected}）`
                : `邀比稿（${selected.size} 位）`}
            </Button>
            <p className="text-tiny text-default-400 text-center mt-2">最多選 5 位 · 單筆併行撰寫</p>
          </div>
        )}
      </aside>
    </main>
  );
}

/* ─── Sub: Empty stage (pre-pitch) ─────────────────────────────────── */

function EmptyStage({ candidatesLen, query }: { candidatesLen: number; query: string }) {
  if (candidatesLen === 0) {
    return (
      <div className="h-full min-h-[480px] flex flex-col items-center justify-center text-center gap-3">
        <FontAwesomeIcon icon={faWandMagicSparkles} className="text-5xl text-default-300" />
        <p className="text-medium font-semibold">輸入需求 → 看候選顧問 → 收提案</p>
        <p className="text-tiny text-default-500 max-w-[420px]">
          12 位 AI 顧問會看您的需求 + 品牌脈絡，從不同角度提出 4 段式方案：
          看見的問題 / 我會這樣做 / 第一週交付 / 為什麼選我。
        </p>
      </div>
    );
  }
  return (
    <div className="h-full min-h-[480px] flex flex-col items-center justify-center text-center gap-3">
      <FontAwesomeIcon icon={faGavel} className="text-5xl text-default-300" />
      <p className="text-medium font-semibold">候選顧問已備齊</p>
      <p className="text-tiny text-default-500 max-w-[420px]">
        在右側勾選 1–5 位顧問，按「邀比稿」開跑。提案會即時填入這個區塊。
      </p>
      <p className="text-tiny text-default-500">您的需求：「{query}」</p>
    </div>
  );
}

/* ─── Sub: CandidateCard ──────────────────────────────────────────── */

function CandidateCard({
  candidate: c, selected, disabled, pitched, pitchStatus, onToggle,
}: {
  candidate: Candidate;
  selected: boolean;
  disabled: boolean;
  pitched: boolean;
  pitchStatus?: "queued" | "working" | "delivered" | "failed";
  onToggle: () => void;
}) {
  const statusChip = (() => {
    if (!pitched) return null;
    if (pitchStatus === "working")   return <Chip size="sm" color="default" variant="flat" startContent={<Spinner size="sm" classNames={{ wrapper: "w-3 h-3 ml-1" }} />}>撰寫中</Chip>;
    if (pitchStatus === "delivered") return <Chip size="sm" color="success" variant="flat" startContent={<FontAwesomeIcon icon={faCircleCheck} className="text-tiny ml-1" />}>已交稿</Chip>;
    if (pitchStatus === "failed")    return <Chip size="sm" color="danger" variant="flat" startContent={<FontAwesomeIcon icon={faTriangleExclamation} className="text-tiny ml-1" />}>失敗</Chip>;
    return <Chip size="sm" variant="flat">排隊中</Chip>;
  })();

  return (
    <Card
      isPressable={!pitched}
      isHoverable={!pitched}
      isDisabled={disabled || pitched}
      onPress={onToggle}
      shadow="none" radius="md"
      className={[
        "border w-full",
        selected ? "border-secondary bg-secondary-50 ring-2 ring-secondary ring-offset-1 ring-offset-content1" : "border-divider",
      ].join(" ")}
    >
      <CardBody className="p-3 gap-2 relative">
        {selected && !pitched && (
          <Badge
            content={<FontAwesomeIcon icon={faCheck} className="text-tiny" />}
            color="default" placement="top-right" shape="circle"
            className="absolute -top-1 -right-1"
          >
            <span className="w-1 h-1" />
          </Badge>
        )}
        <div className="flex items-center gap-2.5">
          <AgentAvatar
            seed={c.agentId ?? c.name}
            size={40}
            className={[
              "rounded-full ring-2 shrink-0",
              selected ? "ring-secondary" : "ring-divider",
            ].join(" ")}
          />
          <div className="min-w-0 flex-1">
            <p className="text-small font-bold truncate">{c.name}</p>
            <p className="text-tiny line-clamp-2 leading-tight text-default-500">{c.title}</p>
          </div>
        </div>
        {c.squadName && (
          <Chip
            size="sm" variant="flat" color="default"
            startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
            classNames={{ content: "truncate max-w-[200px]" }}
          >
            {c.squadName}
          </Chip>
        )}
        {c.matchReasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {c.matchReasons.slice(0, 3).map((r, i) => (
              <Chip key={i} size="sm" variant="flat" color="default" classNames={{ content: "text-tiny" }}>
                {r}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-1.5">
          <ProviderChip provider={c.providerBucket} model={c.aiModel} />
          <div className="flex items-center gap-1">
            {statusChip}
            <Tooltip content={`匹配分數：${c.matchScore}`}>
              <Chip
                size="sm" variant="bordered"
                startContent={<FontAwesomeIcon icon={faChartSimple} className="text-tiny ml-1" />}
                classNames={{ content: "text-tiny tabular-nums" }}
              >
                {c.matchScore}
              </Chip>
            </Tooltip>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─── Sub: PitchCard (center) ─────────────────────────────────────── */

function PitchCard({
  candidate: c, state, onHire, isHiring,
}: {
  candidate: Candidate;
  state: PitchState;
  onHire: () => void;
  isHiring: boolean;
}) {
  const [chatInput, setChatInput] = useState("");
  const isWorking = state.status === "queued" || state.status === "working";
  const isFailed = state.status === "failed";
  const p = state.pitch;

  return (
    <Card shadow="sm" radius="lg" className="border border-divider">
      <CardHeader className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <AgentAvatar
            seed={c.agentId ?? c.name}
            size={56}
            className="rounded-full ring-2 ring-secondary shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-medium">{c.name}</span>
              {p && <ProviderChip provider={p.provider} model={p.model} />}
            </div>
            <p className="text-tiny text-default-500">{c.title}</p>
            {c.squadName && (
              <Chip
                size="sm" variant="flat" color="default"
                startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
                className="mt-1.5 max-w-full"
                classNames={{ content: "truncate" }}
              >
                {c.squadName}
                {c.squadMethodology ? ` · ${c.squadMethodology.slice(0, 60)}` : ""}
              </Chip>
            )}
          </div>
        </div>
        {state.status === "delivered" && (
          <Chip size="sm" color="success" variant="flat"
            startContent={<FontAwesomeIcon icon={faCircleCheck} className="text-tiny ml-1" />}
          >已交稿</Chip>
        )}
      </CardHeader>
      <Divider />

      <CardBody className="px-6 py-5">
        {isWorking && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-tiny text-default-500">
              <Spinner size="sm" /> {c.name} 正在撰寫提案…
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-1/3 rounded" />
                  <Skeleton className="h-2.5 w-full rounded" />
                  <Skeleton className="h-2.5 w-[88%] rounded" />
                  <Skeleton className="h-2.5 w-[70%] rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {isFailed && (
          <Card shadow="none" className="border border-danger-200 bg-danger-50">
            <CardBody className="flex flex-row items-center gap-2 p-4 text-danger">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span className="text-small">提案失敗 · 請從右側重新挑選或改寫需求</span>
            </CardBody>
          </Card>
        )}

        {state.status === "delivered" && p && !p.error && (
          <ScrollShadow className="max-h-[600px]">
            <article
              className={[
                "prose prose-sm max-w-none",
                "prose-headings:tracking-tight prose-headings:font-semibold",
                "prose-h1:text-xl prose-h1:mt-4 prose-h1:mb-2",
                "prose-h2:text-large prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-secondary",
                "prose-h3:text-medium prose-h3:mt-4 prose-h3:mb-1.5",
                "prose-p:leading-relaxed prose-p:text-foreground prose-p:my-2",
                "prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
                "prose-strong:font-semibold prose-strong:text-foreground",
                "prose-hr:my-4 prose-hr:border-divider",
                "prose-blockquote:border-l-secondary prose-blockquote:text-default-600",
                "prose-code:text-tiny prose-code:bg-default-100 prose-code:rounded prose-code:px-1",
              ].join(" ")}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {p.proposal || ""}
              </ReactMarkdown>
            </article>
          </ScrollShadow>
        )}
      </CardBody>

      {/* Decision footer — hire this consultant + chat affordance */}
      {state.status === "delivered" && p && !p.error && (
        <>
          <Divider />
          <CardBody className="px-6 py-4 gap-3 bg-default-50/50">
            {/* Primary action — hire this consultant → picker orchestra */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium leading-tight">
                  喜歡這個方向？讓 {c.name} 開始產出
                </p>
                <p className="text-tiny text-default-500 mt-0.5">
                  將跳到 picker · {c.squadName ?? "顧問 squad"} 會逐步交付完整成品
                </p>
              </div>
              <Tooltip content={!c.squadSlug ? "此顧問沒有對應 squad" : ""} isDisabled={!!c.squadSlug}>
                <Button
                  color="primary" size="md" radius="full"
                  className="font-medium shrink-0"
                  isDisabled={!c.squadSlug}
                  isLoading={isHiring}
                  onPress={onHire}
                  startContent={!isHiring && <FontAwesomeIcon icon={faRocket} />}
                  endContent={!isHiring && <FontAwesomeIcon icon={faArrowRight} />}
                >
                  {isHiring ? "派出中…" : "選這位 · 開始產出"}
                </Button>
              </Tooltip>
            </div>
            <Divider />
            {/* Secondary — chat (placeholder) */}
            <div className="flex items-center gap-2 text-tiny text-default-500">
              <FontAwesomeIcon icon={faComments} /> 想先討論細節？對 {c.name} 留言（即將推出）
            </div>
            <div className="flex gap-2">
              <Input
                size="sm" radius="lg" variant="bordered"
                placeholder={`對 ${c.name} 提問或要求調整…`}
                value={chatInput}
                onValueChange={setChatInput}
                isDisabled
                startContent={<FontAwesomeIcon icon={faPenToSquare} className="text-tiny text-default-400" />}
              />
              <Button isIconOnly size="sm" color="default" radius="lg" isDisabled aria-label="送出">
                <FontAwesomeIcon icon={faPaperPlane} />
              </Button>
            </div>
          </CardBody>
        </>
      )}
    </Card>
  );
}

