/**
 * QuickTask30sPage — the 30 秒 tier home (2026-05-05).
 *
 * Replaces /fb beta. Mirrors QuickTasksPage visual design (Canva-style
 * gradient cards in horizontal-scroll row + tab strip), but:
 *
 *  - Data source: trpc.quickTask.listFB (not task_catalog)
 *  - Card thumbnail: bound agent's DiceBear avatar (not generic ⚡)
 *  - Click → primary-question modal → countdown + live mockup → result
 *  - Tab "30 秒" (default) + future filter for EDM / IG when those tiers ship
 */
import React, { useMemo, useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Badge, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalFooter, ModalHeader, Progress, Skeleton, Spinner,
  Tab, Tabs, Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faClipboard, faClipboardCheck, faClock, faPaperPlane,
  faRotateRight, faXmark, faStar, faChevronLeft, faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";

const CARD_PALETTES = [
  { from: "#fde68a", to: "#fbbf24", text: "#92400e" },
  { from: "#a5f3fc", to: "#22d3ee", text: "#164e63" },
  { from: "#c4b5fd", to: "#8b5cf6", text: "#4c1d95" },
  { from: "#bbf7d0", to: "#34d399", text: "#064e3b" },
  { from: "#fecaca", to: "#f87171", text: "#7f1d1d" },
  { from: "#fed7aa", to: "#fb923c", text: "#7c2d12" },
  { from: "#bfdbfe", to: "#60a5fa", text: "#1e3a8a" },
  { from: "#f5d0fe", to: "#c084fc", text: "#581c87" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s";
  postType: string;
  label: string;
  description: string;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea" } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  squad_slug?: string;
}

type Tier = "30s" | "60s" | "90s" | "case";
type Channel = "facebook" | "instagram" | "edm" | "all";

export default function QuickTask30sPage() {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);

  const [tier, setTier] = useState<Tier>("30s");
  const [channel, setChannel] = useState<Channel>("facebook");

  // Modal + run state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<any | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [fetchedUrl, setFetchedUrl] = useState<{ url: string; title: string | null; chars: number } | null>(null);

  // Countdown overlay (visual SLA — counts up to expected eta)
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];

  const tasksThisTier = useMemo(
    () => allTasks.filter((t) => t.tier === (tier === "case" ? "90s" : tier)),
    [allTasks, tier],
  );

  const runQuickMut = (trpc as any).quickTask?.runQuick?.useMutation();

  const openTask = (t: FBTaskCard) => {
    setActiveTask(t);
    setPrimaryAnswer("");
    setOutput(null);
    setErrorMsg(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  const closeTask = () => {
    setActiveTask(null);
    setRunning(false);
    setCountdownStart(null);
  };

  const handleRun = async () => {
    if (!activeTask) return;
    if (!primaryAnswer.trim() && activeTask.primary_input?.key) {
      setErrorMsg("請先回答這個問題再生成");
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setOutput(null);
    setCountdownStart(Date.now());

    try {
      if (activeTask.kind === "squad") {
        setErrorMsg("90 秒任務（深度 squad）會接到完整 squad 流程，敬請期待 Phase E。");
        return;
      }
      const inputKey = activeTask.primary_input?.key ?? "topic";
      const r = await runQuickMut.mutateAsync({
        taskId: activeTask.id,
        inputs: { [inputKey]: primaryAnswer },
        brandId: brandId ?? undefined,
      });
      setOutput(r.output);
      setLatencyMs(r.latencyMs);
      setAgentMeta(r.agent ?? null);
      setFetchedUrl(r.fetchedUrl ?? null);
      if (!r.ok) {
        setErrorMsg(`部分欄位 LLM 輸出格式有差異，UI 已盡量呈現：${(r.validationErrors ?? []).slice(0, 1).join("")}`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setCountdownStart(null);
    }
  };

  const handleCopy = () => {
    if (!output?.caption) return;
    navigator.clipboard.writeText(output.caption);
  };

  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!output) return null;
    const platform = (output.platform ?? "facebook") as any;
    const format = (output.post_type ?? "feed") as any;
    return { platform, format, label: `${platform}/${format}` };
  }, [output]);

  const expectedSec = activeTask?.tier === "30s" ? 30 : activeTask?.tier === "60s" ? 60 : 90;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  return (
    <div>
      {/* HERO */}
      <div
        style={{
          background: [
            "linear-gradient(to bottom, transparent 65%, rgb(252,251,254) 100%)",
            "linear-gradient(rgba(255,255,255,0.96), rgba(255,255,255,0.96))",
            "linear-gradient(135deg, #00b4bc 0%, #8b5cf6 60%, #4c1d95 100%)",
          ].join(","),
        }}
        className="px-6 lg:px-12 pt-16 pb-12 text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          <span style={{ background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            一鍵產出，30 秒文稿
          </span>
        </h1>
        <p className="text-default-500 text-small">
          每件任務背後是一組分工好的 Agent — 按下即自動接力完成，不需填表單。
        </p>
        <p className="text-tiny text-default-400 mt-2">
          <FontAwesomeIcon icon={faStar} className="text-warning-500 mr-1" />
          品牌腦：<span className="font-medium text-default-700">{brandName ?? "（未選）"}</span>
        </p>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 -mt-4 pb-20">
        {/* Tier tabs */}
        <Tabs
          selectedKey={tier}
          onSelectionChange={(k) => setTier(k as Tier)}
          variant="solid"
          color="primary"
          radius="full"
          size="md"
          classNames={{ tabList: "gap-2", tab: "h-10 px-4" }}
        >
          <Tab key="30s" title={<><FontAwesomeIcon icon={faBolt} className="mr-1" /> 30 秒</>} />
          <Tab key="60s" title="60 秒" />
          <Tab key="90s" title="90 秒（接既有 squad）" />
          <Tab key="case" title="成功案例" />
        </Tabs>

        {/* Channel filter chips */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Chip
            color={channel === "facebook" ? "primary" : "default"}
            variant={channel === "facebook" ? "solid" : "flat"}
            onClick={() => setChannel("facebook")}
            className="cursor-pointer"
          >Facebook</Chip>
          <Chip variant="flat" className="opacity-50 cursor-not-allowed">Instagram（敬請期待）</Chip>
          <Chip variant="flat" className="opacity-50 cursor-not-allowed">LinkedIn（敬請期待）</Chip>
          <Chip variant="flat" className="opacity-50 cursor-not-allowed">EDM（敬請期待）</Chip>
        </div>

        {/* Catalog */}
        <div className="mt-8">
          {tier === "case" ? (
            <Card><CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faStar} className="text-3xl mb-2" />
              <p>成功案例（預錄 case study gallery）正在製作中。</p>
            </CardBody></Card>
          ) : tasksThisTier.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-lg tracking-tight">精選任務</h2>
                  <p className="text-tiny text-default-400 mt-0.5">按下即產出，先回答 1 個關鍵問題</p>
                </div>
                <Chip size="sm" variant="flat" color="secondary">{tasksThisTier.length} 件</Chip>
              </div>

              {/* Card grid — agent avatar as thumbnail, gradient bg */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {tasksThisTier.map((t, idx) => {
                  const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                  const agentName = t.agent?.name ?? "AI Agent";
                  const agentTitle = t.agent?.title ?? "";
                  const avatarSrc = t.agent?.avatarUrl || dicebear(agentName);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                      style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                    >
                      {/* Top — gradient bg + agent avatar centered */}
                      <div
                        className="flex items-center justify-center relative"
                        style={{ height: 130, background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)` }}
                      >
                        <Avatar
                          src={avatarSrc}
                          size="lg"
                          isBordered
                          color="default"
                          className="w-20 h-20 ring-2 ring-white/60"
                        />
                        <span
                          className="absolute top-2 right-2 text-tiny font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.85)", color: pal.text }}
                        >
                          {t.tier}
                        </span>
                      </div>
                      {/* Card info */}
                      <div className="p-3 flex flex-col gap-1 flex-1">
                        <p className="text-small font-semibold leading-tight line-clamp-2">{t.label}</p>
                        <p className="text-tiny text-default-500 line-clamp-2">{t.description}</p>
                        <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                          <Avatar src={avatarSrc} size="sm" className="w-5 h-5" />
                          <span className="text-tiny font-medium text-default-700 truncate">{agentName}</span>
                        </div>
                        {t.skill_slug && (
                          <Chip size="sm" variant="flat" className="self-start text-[10px]">
                            {t.skill_slug}
                          </Chip>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Modal: primary question + countdown + live mockup result ─── */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="4xl"
        scrollBehavior="inside"
        backdrop="blur"
      >
        <ModalContent>
          {activeTask && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  {activeTask.agent && (
                    <Avatar
                      src={activeTask.agent.avatarUrl || dicebear(activeTask.agent.name)}
                      size="md"
                      isBordered
                      color="primary"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{activeTask.label}</p>
                    <p className="text-tiny text-default-500">
                      {activeTask.agent ? `${activeTask.agent.name} · ${activeTask.agent.title}` : activeTask.description}
                    </p>
                  </div>
                  <Chip size="sm" variant="flat" color="primary">{activeTask.tier}</Chip>
                </div>
              </ModalHeader>
              <ModalBody>
                {!output ? (
                  <>
                    {/* Primary question */}
                    {activeTask.primary_input && (
                      <div className="space-y-2">
                        <p className="text-small font-medium">{activeTask.primary_question}</p>
                        {activeTask.primary_input.type === "textarea" ? (
                          <Textarea
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            minRows={3}
                            autoFocus
                          />
                        ) : (
                          <Input
                            placeholder={activeTask.primary_input.placeholder ?? ""}
                            value={primaryAnswer}
                            onChange={(e) => setPrimaryAnswer(e.target.value)}
                            autoFocus
                          />
                        )}
                      </div>
                    )}

                    {/* Countdown progress (only while running) */}
                    {running && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-tiny">
                          <span>
                            <FontAwesomeIcon icon={faClock} className="mr-1" />
                            {(tickMs / 1000).toFixed(1)}s / {expectedSec}s
                          </span>
                          <span className="text-default-500">
                            {tickMs < expectedSec * 1000 ? "請稍候…" : `已超出預估，繼續中`}
                          </span>
                        </div>
                        <Progress
                          size="sm"
                          color={tickMs < expectedSec * 1000 ? "primary" : "warning"}
                          value={progressPct}
                        />
                        <div className="text-center pt-2">
                          <Spinner size="sm" />
                          <p className="text-tiny text-default-500 mt-1">
                            {activeTask.agent?.name ?? "Agent"} 正在寫…
                          </p>
                        </div>
                      </div>
                    )}

                    {errorMsg && (
                      <Card className="bg-warning-50 border border-warning-200 mt-4">
                        <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                      </Card>
                    )}
                  </>
                ) : (
                  /* Output: variants as swipeable mockup carousel.
                     The "main" caption is variant[0] (or the top-level caption
                     if no variants). Use chevron arrows to swipe between.
                     Style direction lives INSIDE each mockup's image slot. */
                  <OutputCarousel
                    output={output}
                    activeTask={activeTask}
                    brandName={brandName}
                    mockupVariant={mockupVariant}
                    latencyMs={latencyMs}
                    agentMeta={agentMeta}
                    fetchedUrl={fetchedUrl}
                    errorMsg={errorMsg}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                {!output ? (
                  <>
                    <Button variant="light" onPress={closeTask} startContent={<FontAwesomeIcon icon={faXmark} />}>
                      取消
                    </Button>
                    <Button
                      color="primary"
                      onPress={handleRun}
                      isLoading={running}
                      isDisabled={running || (activeTask.kind === "squad")}
                      startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                    >
                      {running ? "生成中…" : "立即產出"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="light" onPress={closeTask}>關閉</Button>
                    <Button variant="flat" onPress={() => { setOutput(null); setPrimaryAnswer(primaryAnswer); }} startContent={<FontAwesomeIcon icon={faRotateRight} />}>
                      重做
                    </Button>
                    <Button color="primary" onPress={handleCopy} startContent={<FontAwesomeIcon icon={faClipboard} />}>
                      複製全文
                    </Button>
                  </>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

/* ──────────────────────────── Output Carousel ────────────────────────────
 * Each variant becomes its own complete mockup. Left/right chevrons swap
 * between them. Style direction shows INSIDE each mockup's image slot.
 *
 * If output has 0 variants (just top-level caption), shows a single mockup.
 */
function OutputCarousel({
  output, activeTask, brandName, mockupVariant, latencyMs, agentMeta, fetchedUrl, errorMsg,
}: {
  output: any;
  activeTask: FBTaskCard;
  brandName: string | null;
  mockupVariant: MockupVariant | null;
  latencyMs: number | null;
  agentMeta: any;
  fetchedUrl: { url: string; title: string | null; chars: number } | null;
  errorMsg: string | null;
}) {
  // Build the slide list — slide 0 = main output; slides 1+ = variants
  const slides: Array<{ label: string; caption: string; hashtags?: string[] }> = useMemo(() => {
    const main = {
      label: "主版本",
      caption: output.caption ?? "",
      hashtags: output.hashtags ?? [],
    };
    const vars = (output.variants ?? []).map((v: any, i: number) => ({
      label: v.label || `版本 ${i + 2}`,
      caption: v.caption ?? "",
      hashtags: v.hashtags ?? output.hashtags ?? [],
    }));
    return [main, ...vars];
  }, [output]);

  const [idx, setIdx] = useState(0);
  const slide = slides[idx];
  const total = slides.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-tiny text-default-500 flex-wrap">
        <FontAwesomeIcon icon={faClock} />
        <span>{latencyMs != null ? `${(latencyMs / 1000).toFixed(1)}s 完成` : ""}</span>
        {agentMeta && (
          <>
            <span>·</span>
            <Avatar src={agentMeta.avatarUrl || dicebear(agentMeta.name)} size="sm" className="w-4 h-4" />
            <span>{agentMeta.name}</span>
          </>
        )}
      </div>

      {/* URL provenance — show when agent actually fetched + read a link */}
      {fetchedUrl && (
        <Card className="bg-success-50 border border-success-200">
          <CardBody className="py-2 px-3 flex flex-row items-center gap-2 text-tiny">
            <span className="text-success-700 font-semibold">✓ 已讀過你給的連結</span>
            <span className="text-default-500 truncate flex-1">
              {fetchedUrl.title ?? fetchedUrl.url}
            </span>
            <Chip size="sm" variant="flat" color="success">{fetchedUrl.chars.toLocaleString()} 字</Chip>
          </CardBody>
        </Card>
      )}

      {!slide.caption && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-small">
            ⚠️ Agent 沒有產出 caption — 試「重做」按鈕。
          </CardBody>
        </Card>
      )}

      {/* Carousel — chevrons + dots */}
      {total > 1 && (
        <div className="flex items-center justify-between bg-default-50 rounded-medium px-3 py-2">
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            isDisabled={idx === 0}
            onPress={() => setIdx(Math.max(0, idx - 1))}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </Button>
          <div className="flex items-center gap-2">
            <Chip size="sm" variant="flat" color="primary">{slide.label}</Chip>
            <span className="text-tiny text-default-500">
              {idx + 1} / {total}
            </span>
            <div className="flex gap-1 ml-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition ${
                    i === idx ? "bg-primary-500 w-4" : "bg-default-300"
                  }`}
                  aria-label={`切到版本 ${i + 1}`}
                />
              ))}
            </div>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            isDisabled={idx === total - 1}
            onPress={() => setIdx(Math.min(total - 1, idx + 1))}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </Button>
        </div>
      )}

      {/* The mockup — caption swaps per variant, image style is shared (one
          image style direction applies across all caption variants since
          they're verbal alternatives of the same post) */}
      {mockupVariant && (
        <PlatformMockup
          variant={mockupVariant}
          title={output.title ?? activeTask.label}
          brief={output.description ?? ""}
          brandName={brandName}
          liveCaption={slide.caption}
          liveTitle={output.title}
          liveDescription={output.description}
          liveCta={output.cta}
          liveHashtags={slide.hashtags}
          liveImageStyle={output.image_style_direction?.summary}
          liveVideoStyle={output.video_style_direction?.summary}
        />
      )}

      {/* Click prompt for the image area — phase E will wire to MediaGenFlow */}
      {output.image_style_direction?.summary && (
        <p className="text-tiny text-default-400 text-center">
          要實際生圖？點上方 mockup 圖片框 開啟 MediaGenFlow（即將推出）
        </p>
      )}

      {errorMsg && (
        <Card className="bg-warning-50 border border-warning-200">
          <CardBody className="text-warning-800 text-tiny">{errorMsg}</CardBody>
        </Card>
      )}
    </div>
  );
}
