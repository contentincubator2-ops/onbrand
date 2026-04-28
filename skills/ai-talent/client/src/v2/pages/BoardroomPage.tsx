/**
 * BoardroomPage — 「比稿（邀比稿）」三步流程 (HeroUI v2 migration)
 *
 *   STEP 1  用戶輸入需求 (concern / brief)
 *   STEP 2  系統推薦 12 位候選 agent，用戶勾選 1–5 位
 *   STEP 3  被選中的 agent 各自比稿（4 段格式）
 *
 * Full-bleed Canva-style layout, all HeroUI primitives. Uses User /
 * Avatar (with DiceBear src) instead of custom PortraitAvatar to
 * showcase HeroUI's avatar variety.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Badge, Breadcrumbs, BreadcrumbItem, Button, Card, CardBody,
  CardHeader, Chip, Divider, ScrollShadow, Skeleton, Spinner, Textarea,
  Tooltip, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft, faArrowRight, faBookOpen, faCheck, faGavel,
  faMagnifyingGlass, faPaperPlane, faRotateRight, faTriangleExclamation,
  faUserGroup, faWandMagicSparkles,
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

type ChipColor = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
const PROVIDER_COLOR: Record<string, ChipColor> = {
  "azure-foundry": "primary",
  anthropic: "warning",
  qwen: "default",
  zhipu: "primary",
  perplexity: "success",
  forge: "secondary",
  openai: "success",
  gemini: "primary",
  google: "primary",
  cohere: "danger",
};

function ProviderChip({ provider, model }: { provider: string; model: string }) {
  return (
    <Chip
      size="sm"
      variant="flat"
      color={PROVIDER_COLOR[provider] ?? "default"}
      classNames={{ content: "text-tiny" }}
    >
      {provider}{model ? ` · ${model}` : ""}
    </Chip>
  );
}

const dicebear = (name: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || "anon")}`;

function parsePitch(md: string): { problem: string; steps: string; deliverables: string; differentiator: string } {
  if (!md) return { problem: "", steps: "", deliverables: "", differentiator: "" };
  const sections = md.split(/^##\s+/m).slice(1);
  const out = { problem: "", steps: "", deliverables: "", differentiator: "" };
  for (const s of sections) {
    const [head, ...body] = s.split("\n");
    const text = body.join("\n").trim();
    const h = (head || "").trim();
    if (h.includes("看見") || h.includes("問題") || h.includes("診斷")) out.problem = text;
    else if (h.includes("這樣做") || h.includes("步驟")) out.steps = text;
    else if (h.includes("交付") || h.includes("第一週")) out.deliverables = text;
    else if (h.includes("為什麼選我") || h.includes("選我") || h.includes("獨特")) out.differentiator = text;
  }
  return out;
}

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function BoardroomPage() {
  const ctx = useOutletContext<ShellOutletCtx>() ?? ({} as ShellOutletCtx);
  const brandId = ctx.brandId ?? undefined;
  const currentBrand = (ctx.brands || []).find((b: any) => b?.id === ctx.brandId);
  const brandName = currentBrand?.name || "未指定品牌";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);

  const recommendMutation = (trpc as any).boardroom.recommendAgents.useQuery(
    { brandId, query, limit: 12 },
    { enabled: false }
  );
  const pitchMutation = (trpc as any).boardroom.pitch.useMutation();

  const onFindAgents = async () => {
    if (query.trim().length < 2) return;
    const r = await recommendMutation.refetch();
    setCandidates((r.data?.candidates as Candidate[]) ?? []);
    setSelected(new Set());
    setStep(2);
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
    const result = await pitchMutation.mutateAsync({
      brandId, query, agentIds: Array.from(selected),
    });
    setPitches((result.pitches as Pitch[]) ?? []);
    setStep(3);
  };

  const reset = () => {
    setStep(1);
    setSelected(new Set());
    setCandidates([]);
    setPitches([]);
  };

  return (
    <main className="px-8 py-8 pb-24">
      {/* Header */}
      <Breadcrumbs size="sm" className="mb-3">
        <BreadcrumbItem href="/">首頁</BreadcrumbItem>
        <BreadcrumbItem>顧問團 Boardroom</BreadcrumbItem>
      </Breadcrumbs>

      <Chip size="sm" variant="flat" color="secondary" className="uppercase tracking-wider mb-2">
        BOARDROOM · 比稿（邀比稿）
      </Chip>
      <h1 className="font-semibold text-3xl tracking-tight mb-1">
        {brandName} · 邀請顧問為您比稿
      </h1>
      <p className="text-small text-default-500">
        說出您的需求 → 系統推薦候選顧問 → 您勾選 → 顧問各自提案，您當評審
      </p>

      <div className="my-8">
        <StepIndicator step={step} />
      </div>

      {step === 1 && (
        <Step1Input
          query={query} setQuery={setQuery}
          onFindAgents={onFindAgents}
          loading={recommendMutation.isFetching}
        />
      )}
      {step === 2 && (
        <Step2Candidates
          candidates={candidates}
          selected={selected} toggle={toggle}
          onBack={() => setStep(1)} onPitch={onPitch}
          pitching={pitchMutation.isPending}
          loading={recommendMutation.isFetching}
          query={query}
        />
      )}
      {step === 3 && <Step3Pitches pitches={pitches} onReset={reset} query={query} />}
    </main>
  );
}

/* ─── Step indicator ─────────────────────────────────────────────────── */

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps: Array<{ n: 1 | 2 | 3; label: string; icon: any }> = [
    { n: 1, label: "輸入需求", icon: faWandMagicSparkles },
    { n: 2, label: "勾選顧問", icon: faUserGroup },
    { n: 3, label: "看比稿",   icon: faGavel },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => {
        const isActive = s.n === step;
        const isPast = s.n < step;
        return (
          <React.Fragment key={s.n}>
            <Chip
              size="md"
              radius="full"
              color={isActive ? "secondary" : isPast ? "success" : "default"}
              variant={isActive || isPast ? "solid" : "flat"}
              startContent={
                <span className="ml-1 mr-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/30 text-tiny font-bold tabular-nums">
                  {isPast ? <FontAwesomeIcon icon={faCheck} className="text-tiny" /> : s.n}
                </span>
              }
              className="font-medium"
            >
              <span className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={s.icon} className="text-tiny" />
                {s.label}
              </span>
            </Chip>
            {i < steps.length - 1 && (
              <Divider orientation="horizontal" className="w-8 bg-default-300" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── Step 1 ─────────────────────────────────────────────────────────── */

function Step1Input({
  query, setQuery, onFindAgents, loading,
}: {
  query: string;
  setQuery: (s: string) => void;
  onFindAgents: () => void;
  loading: boolean;
}) {
  const examples = [
    "我要做新品上市的 IG 內容企劃",
    "B2B SaaS 想做 LinkedIn 內容增長",
    "電商品牌想找新的市場定位",
    "想做品牌故事重塑，但不知道從哪開始",
  ];
  return (
    <Card shadow="sm" radius="lg" className="border border-divider">
      <CardBody className="p-8 gap-4">
        <Textarea
          label="您今天想解決什麼問題？"
          labelPlacement="outside"
          variant="bordered"
          radius="md"
          value={query}
          onValueChange={setQuery}
          placeholder="例：我要做新品上市的 IG 內容企劃，預算有限，想要 30 天內看到效果..."
          minRows={5}
          isRequired
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-tiny text-default-500 mr-1">快速範例：</span>
          {examples.map((e) => (
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
          color="primary" size="lg" radius="full"
          className="self-start mt-2 font-medium"
          isDisabled={query.trim().length < 2}
          isLoading={loading}
          onPress={onFindAgents}
          endContent={!loading && <FontAwesomeIcon icon={faArrowRight} />}
        >
          {loading ? "搜尋中…" : "找候選顧問"}
        </Button>
      </CardBody>
    </Card>
  );
}

/* ─── Step 2 ─────────────────────────────────────────────────────────── */

function Step2Candidates({
  candidates, selected, toggle, onBack, onPitch, pitching, loading, query,
}: {
  candidates: Candidate[];
  selected: Set<number>;
  toggle: (id: number) => void;
  onBack: () => void;
  onPitch: () => void;
  pitching: boolean;
  loading: boolean;
  query: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} shadow="sm" className="p-4 gap-3">
            <div className="flex gap-3">
              <Skeleton className="w-14 h-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/5 rounded" />
                <Skeleton className="h-2 w-full rounded" />
              </div>
            </div>
            <Skeleton className="h-3 w-2/5 rounded" />
            <Skeleton className="h-6 w-full rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card shadow="none" className="border-2 border-dashed border-divider">
        <CardBody className="py-16 items-center text-center gap-3">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-4xl text-default-300" />
          <p className="text-medium font-medium">沒有找到匹配的顧問</p>
          <p className="text-small text-default-500">請回到上一步換個說法。</p>
          <Button
            variant="bordered" radius="full" className="mt-2"
            startContent={<FontAwesomeIcon icon={faArrowLeft} />}
            onPress={onBack}
          >
            重新輸入
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-tiny text-default-500 mb-1">您的需求</p>
          <p className="text-small font-medium text-foreground line-clamp-2">「{query}」</p>
          <p className="text-tiny text-default-500 mt-1">
            系統推薦 {candidates.length} 位候選顧問，請勾選 1–5 位邀請比稿
          </p>
        </div>
        <Button
          size="sm" variant="light"
          startContent={<FontAwesomeIcon icon={faArrowLeft} />}
          onPress={onBack}
        >
          修改需求
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {candidates.map((c) => (
          <CandidateCard
            key={c.agentId}
            candidate={c}
            selected={selected.has(c.agentId)}
            disabled={!selected.has(c.agentId) && selected.size >= 5}
            onToggle={() => toggle(c.agentId)}
          />
        ))}
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-4 mt-8 flex justify-center z-10">
        <Button
          color="secondary" size="lg" radius="full"
          className="shadow-2xl font-medium px-8"
          isDisabled={selected.size === 0}
          isLoading={pitching}
          onPress={onPitch}
          endContent={!pitching && <FontAwesomeIcon icon={faArrowRight} />}
          startContent={!pitching && <FontAwesomeIcon icon={faPaperPlane} />}
        >
          {pitching
            ? "顧問撰寫中…"
            : `邀比稿（已選 ${selected.size} 位）`}
        </Button>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate: c, selected, disabled, onToggle,
}: {
  candidate: Candidate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      isPressable
      isHoverable
      isDisabled={disabled}
      onPress={onToggle}
      shadow={selected ? "md" : "sm"}
      radius="lg"
      className={[
        "border-2 transition relative",
        selected ? "border-secondary bg-secondary-50" : "border-divider",
      ].join(" ")}
    >
      {selected && (
        <Badge
          content={<FontAwesomeIcon icon={faCheck} className="text-tiny" />}
          color="secondary" placement="top-right" shape="circle" size="lg"
          className="absolute -top-1 -right-1"
        >
          <span className="w-1 h-1" />
        </Badge>
      )}
      <CardBody className="p-4 gap-3">
        <User
          name={c.name}
          description={c.title}
          avatarProps={{
            src: dicebear(c.name),
            size: "lg",
            isBordered: true,
            color: selected ? "secondary" : "default",
          }}
          classNames={{
            name: "text-small font-bold",
            description: "text-tiny line-clamp-2",
          }}
        />

        {c.squadName && (
          <Chip
            size="sm" variant="flat" color="secondary"
            startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
            classNames={{ content: "truncate max-w-[200px]" }}
          >
            {c.squadName}
          </Chip>
        )}

        {c.matchReasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {c.matchReasons.slice(0, 4).map((r, i) => (
              <Chip key={i} size="sm" variant="flat" color="warning" classNames={{ content: "text-tiny" }}>
                {r}
              </Chip>
            ))}
          </div>
        )}

        <Divider />

        <div className="flex items-center justify-between gap-2">
          <ProviderChip provider={c.providerBucket} model={c.aiModel} />
          <Tooltip content={`匹配分數：${c.matchScore}`}>
            <Chip size="sm" variant="bordered" classNames={{ content: "text-tiny tabular-nums" }}>
              ⌬ {c.matchScore}
            </Chip>
          </Tooltip>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─── Step 3 ─────────────────────────────────────────────────────────── */

function Step3Pitches({
  pitches, onReset, query,
}: { pitches: Pitch[]; onReset: () => void; query: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-tiny text-default-500 mb-1">客戶需求</p>
          <p className="text-medium font-medium text-foreground">{query}</p>
        </div>
        <Button
          variant="bordered" radius="full"
          startContent={<FontAwesomeIcon icon={faRotateRight} />}
          onPress={onReset}
        >
          重新比稿
        </Button>
      </div>

      <div className="grid gap-4">
        {pitches.map((p) => (
          <PitchCard key={p.agentId} pitch={p} />
        ))}
      </div>
    </div>
  );
}

function PitchCard({ pitch }: { pitch: Pitch }) {
  const parsed = useMemo(() => parsePitch(pitch.proposal || ""), [pitch.proposal]);

  return (
    <Card shadow="sm" radius="lg" className="border border-divider">
      <CardHeader className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 flex-wrap">
        <User
          name={
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-medium">{pitch.name}</span>
              <ProviderChip provider={pitch.provider} model={pitch.model} />
            </span>
          }
          description={
            <span className="block">
              <span className="text-tiny text-default-500">{pitch.title}</span>
              {pitch.squadName && (
                <Chip
                  size="sm" variant="flat" color="secondary"
                  startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
                  className="mt-1.5 max-w-full"
                  classNames={{ content: "truncate" }}
                >
                  {pitch.squadName}
                  {pitch.squadMethodology ? ` · ${pitch.squadMethodology.slice(0, 60)}` : ""}
                </Chip>
              )}
            </span>
          }
          avatarProps={{
            src: dicebear(pitch.name),
            size: "lg",
            isBordered: true,
            color: "secondary",
          }}
        />
      </CardHeader>
      <Divider />
      <CardBody className="px-6 py-5">
        {pitch.error ? (
          <Card shadow="none" className="border border-danger-200 bg-danger-50">
            <CardBody className="flex flex-row items-center gap-2 p-4 text-danger">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              <span className="text-small">提案失敗：{pitch.error}</span>
            </CardBody>
          </Card>
        ) : (
          <ScrollShadow className="max-h-[600px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PitchSection title="我看見的問題"   color="danger"    body={parsed.problem} />
              <PitchSection title="我會這樣做"     color="primary"   body={parsed.steps} />
              <PitchSection title="第一週可交付"   color="warning"   body={parsed.deliverables} />
              <PitchSection title="為什麼選我"     color="secondary" body={parsed.differentiator} />
            </div>
          </ScrollShadow>
        )}
      </CardBody>
    </Card>
  );
}

function PitchSection({
  title, color, body,
}: {
  title: string;
  color: "primary" | "secondary" | "warning" | "danger";
  body: string;
}) {
  const borderClass = {
    primary: "border-l-primary",
    secondary: "border-l-secondary",
    warning: "border-l-warning",
    danger: "border-l-danger",
  }[color];
  return (
    <div className={`border-l-4 ${borderClass} pl-4`}>
      <Chip size="sm" color={color} variant="flat" className="uppercase tracking-wider mb-2">
        {title}
      </Chip>
      <p className="text-small leading-relaxed whitespace-pre-wrap text-foreground">
        {body || <span className="text-default-400">（尚無內容）</span>}
      </p>
    </div>
  );
}
