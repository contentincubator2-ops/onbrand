/**
 * BrandsPage — Canva Brand Kit clone v2 (full-bleed layout).
 *
 * Layout matches Canva exactly:
 *   - Top: thin pastel header strip with 品牌工具組 chip + brand name
 *   - Left rail (260px, fixed width, no max-w): sub-nav links + brand
 *     switcher dropdown
 *   - Right: full-bleed grid of large pastel asset tiles (4 cols on
 *     desktop, each ~4:3 aspect)
 *
 * Each tile is a HeroUI Card isPressable with a unique pastel-100 bg,
 * a giant FA icon as the visual centerpiece, and a label below.
 *
 * No max-width container anywhere — extends to viewport edges.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Skeleton, Tabs, Tab,
} from "@heroui/react";
import SegmentEditor from "../components/positioning/SegmentEditor";
import ThinkingOverlay from "../components/positioning/ThinkingOverlay";
import PipelineRunner, { type PipelineState } from "../components/positioning/PipelineRunner";
import SpeedCard from "../components/positioning/SpeedCard";
import PromptLibrary from "../components/positioning/PromptLibrary";
import BrandAssetEditor, { type AssetKey } from "../components/positioning/BrandAssetEditor";
import { SCOPE_SEGMENTS, type SegmentSpec } from "../lib/positioningSchema";
import { pipelineFor, type PipelineStepSpec } from "../lib/positioningPipeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown, faPlus, faCloudArrowUp, faShapes,
  faPalette, faFont, faQuoteLeft, faBullseye, faUsers,
  faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved,
  faFolderOpen, faUserPlus, faCrown,
  faBookOpen, faTableList, faRobot, faTrademark, faBox, faCalendarDay,
} from "@fortawesome/free-solid-svg-icons";

// Sub-nav id format:
//   "asset:<key>"   — non-positioning brand assets (準則 / 標誌 / etc.)
//   "seg:<segment>" — one positioning segment (driven by positioningSchema)
//   "card" / "prompts" / "all"
type SectionId = string;

interface SubNavItem { id: SectionId; label: string; badge?: string; group?: string; }

// Brand has positioning segments + visual/asset entries.
// Per CJ: 圖像/圖示/圖表/品牌範本/準則/照片/所有資產 all removed.
const BRAND_ASSET_SUBNAV: SubNavItem[] = [
  { id: "asset:logo",   label: "標誌",     group: "visuals" },
  { id: "asset:colors", label: "顏色",     group: "visuals" },
  { id: "asset:fonts",  label: "字型",     group: "visuals" },
];

// Tile colors (HeroUI semantic-100 backgrounds + matching tone)
type Tone = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
interface Tile {
  id: SectionId;
  label: string;
  icon: any;
  tone: Tone;
  count?: number;
  ready: boolean;
}

export default function BrandsPage() {
  const { brandId, setBrandId, brands, scope } = useOutletContext<ShellOutletCtx>();

  // Resolve scope mode — choose-one rule from ScopeBar.
  const scopeMode: "brand" | "product" | "event" | "none" =
    scope?.eventId ? "event"
    : scope?.productId ? "product"
    : scope?.brandId ? "brand"
    : (brandId ? "brand" : "none"); // legacy fallback

  // Pull product/event details when those scopes are active
  const productQuery = (trpc as any).product?.get?.useQuery
    ? (trpc as any).product.get.useQuery(
        { id: scope?.productId ?? 0 },
        { enabled: scopeMode === "product" && !!scope?.productId, refetchOnWindowFocus: false }
      )
    : { data: null };
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery(
        { id: scope?.eventId ?? 0 },
        { enabled: scopeMode === "event" && !!scope?.eventId, refetchOnWindowFocus: false }
      )
    : { data: null };
  // scope.options is the canonical brand list (filtered by userId, same
  // as ScopeBar). Legacy `brands` from listByMember can lag — use this
  // when resolving the active brand name.
  const scopeOptionsQuery = (trpc as any).scope?.options?.useQuery
    ? (trpc as any).scope.options.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null };
  const scopeBrands = ((scopeOptionsQuery.data as any)?.brands as any[]) ?? brands;

  // Build sub-nav from positioning schema + brand-only asset list.
  // Each segment becomes its own sub-nav entry (id = "seg:<segmentId>"),
  // alongside 速查卡 / AI 指令庫 / brand assets (brand only).
  const segments = scopeMode === "none" ? [] : SCOPE_SEGMENTS[scopeMode];
  const SUBNAV: SubNavItem[] = useMemo(() => {
    const items: SubNavItem[] = [];
    items.push({ id: "card",    label: "速查卡",     group: "doc" });
    items.push({ id: "prompts", label: "AI 指令庫",  group: "doc" });
    for (const s of segments) {
      items.push({
        id: `seg:${s.id}`,
        label: `${s.num} ${s.title}`,
        group: "segments",
      });
    }
    if (scopeMode === "brand") {
      for (const a of BRAND_ASSET_SUBNAV) {
        items.push(a);
      }
    }
    return items;
  }, [scopeMode, segments]);

  // Default to 速查卡 for all scopes (CJ: 預設為速查卡頁籤).
  const defaultSection: SectionId = "card";
  const [section, setSection] = useState<SectionId>(defaultSection);
  // Reset section when scope mode changes
  React.useEffect(() => {
    setSection(defaultSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode]);

  const currentBrand = useMemo(
    () => scopeBrands.find((b: any) => b.id === (scope?.brandId ?? brandId)) ?? null,
    [scopeBrands, scope?.brandId, brandId]
  );
  const scopeName =
    scopeMode === "product" ? ((productQuery.data as any)?.name ?? "（請於右上選擇產品）")
    : scopeMode === "event" ? ((eventQuery.data as any)?.name ?? "（請於右上選擇活動）")
    : (currentBrand?.name ?? "（請於右上選擇品牌）");
  const scopeIcon =
    scopeMode === "product" ? faBox
    : scopeMode === "event" ? faCalendarDay
    : faTrademark;
  const scopeEyebrow =
    scopeMode === "product" ? "PRODUCT"
    : scopeMode === "event" ? "EVENT"
    : "BRAND";
  const brandName = currentBrand?.name ?? "我的品牌";
  const brandInitial = brandName.charAt(0).toUpperCase();

  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const brainEntries: Record<string, any[]> =
    ((brainQuery.data as any)?.entries as Record<string, any[]>) ?? {};
  const cnt = (cat: string) => brainEntries[cat]?.length ?? 0;

  // Brand asset tiles (visuals — non-positioning).
  // Per CJ: only logo / colors / fonts remain.
  const TILES: Tile[] = [
    { id: "asset:logo",   label: "標誌", icon: faPenNib,  tone: "default", ready: true },
    { id: "asset:colors", label: "顏色", icon: faPalette, tone: "default", ready: true },
    { id: "asset:fonts",  label: "字型", icon: faFont,    tone: "default", ready: true },
  ];

  const visibleTiles = TILES.filter((t) => t.id === section);

  const onTileClick = (t: Tile) => setSection(t.id);

  // ── Pipeline (research mode) — scope-aware (brand 14 steps / product 5) ─
  const pipelineSteps: PipelineStepSpec[] = pipelineFor(scopeMode);

  // Persist pipeline state per (kind, id) so page refresh resumes mid-run.
  const pipelineKey = scopeMode !== "none" && (scope?.brandId ?? scope?.productId ?? scope?.eventId)
    ? `sowork.pipeline.${scopeMode}.${scope?.brandId ?? scope?.productId ?? scope?.eventId}`
    : null;
  const [pipeline, setPipeline] = useState<PipelineState>(() => {
    if (!pipelineKey) return { status: "idle", cursor: 0, completed: [] };
    try {
      const raw = localStorage.getItem(pipelineKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // Auto-resume if previous run was paused; running runs become paused
        // (user must hit ▶ continue to actually fire) so we don't surprise
        // them with an LLM call on cold load.
        if (saved && (saved.status === "running" || saved.status === "paused")) {
          return { status: "paused", cursor: saved.cursor ?? 0, completed: saved.completed ?? [] };
        }
      }
    } catch { /* ignore */ }
    return { status: "idle", cursor: 0, completed: [] };
  });
  React.useEffect(() => {
    if (!pipelineKey) return;
    try {
      if (pipeline.status === "done" || pipeline.status === "idle") {
        localStorage.removeItem(pipelineKey);
      } else {
        localStorage.setItem(pipelineKey, JSON.stringify(pipeline));
      }
    } catch { /* ignore */ }
  }, [pipelineKey, pipeline]);
  // Reset pipeline state when scope changes (user picks a different brand)
  const lastKeyRef = React.useRef<string | null>(pipelineKey);
  React.useEffect(() => {
    if (lastKeyRef.current === pipelineKey) return;
    lastKeyRef.current = pipelineKey;
    if (!pipelineKey) {
      setPipeline({ status: "idle", cursor: 0, completed: [] });
      return;
    }
    try {
      const raw = localStorage.getItem(pipelineKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.status === "running" || saved?.status === "paused") {
          setPipeline({ status: "paused", cursor: saved.cursor ?? 0, completed: saved.completed ?? [] });
          return;
        }
      }
    } catch { /* ignore */ }
    setPipeline({ status: "idle", cursor: 0, completed: [] });
  }, [pipelineKey]);

  const targetId =
    scopeMode === "brand" ? (scope?.brandId ?? brandId)
    : scopeMode === "product" ? scope?.productId
    : scopeMode === "event" ? scope?.eventId
    : null;

  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;

  // Phase 6 — call pipeline.runStep tRPC, server hits OpenClaw gateway
  // (web_search) until budget met, persists conclusion + sources scoped
  // to the active id, returns { thinking, conclusion, sources }. Client
  // shows the returned thinking via ThinkingOverlay typewriter, then
  // advances. Mock fallback remains if mutation isn't available yet.
  const runStepMutation = (trpc as any).pipeline?.runStep?.useMutation
    ? (trpc as any).pipeline.runStep.useMutation({
        // Invalidate as soon as the server has written; the segment editor's
        // draft will refresh while the typewriter is still animating, so by
        // the time it finishes the user sees the fields already populated.
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;
  const [liveThinking, setLiveThinking] = useState<string | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState<"loading" | "typing" | "writing">("loading");
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);

  React.useEffect(() => {
    if (pipeline.status !== "running") return;
    const step = pipelineSteps[pipeline.cursor];
    if (!step) {
      setPipeline((p) => ({ ...p, status: "done" }));
      setLiveThinking(null);
      return;
    }
    // Auto-jump sub-nav to this step's target segment.
    setSection(step.segmentTarget);
    setLiveThinking(null); // clear previous

    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      utils?.scope?.active?.invalidate?.();
      // If single-segment auto-fill: halt after this step.
      if (autoFillStopAt !== null && pipeline.cursor === autoFillStopAt) {
        setPipeline((p) => ({
          ...p,
          status: "done",
          completed: [...p.completed, step.id],
        }));
        setAutoFillStopAt(null);
        setLiveThinking(null);
        return;
      }
      setPipeline((p) => ({
        ...p,
        cursor: p.cursor + 1,
        completed: [...p.completed, step.id],
      }));
      setLiveThinking(null);
    };

    const runReal = async () => {
      if (!targetId || scopeMode === "none" || !runStepMutation) return null;
      try {
        const res = await runStepMutation.mutateAsync({
          kind: scopeMode as "brand" | "product" | "event",
          id: targetId,
          stepId: step.id,
          segmentId: step.segmentId,
          agent: step.agent,
          title: step.title,
          budget: step.researchBudget,
          systemHint: step.promptTemplate, // CJ-spec prompt per step
          schemaHint: step.mockConclusion, // canonical JSON shape for this segment
        });
        return res?.thinking ?? null;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pipeline] runStep failed, falling back to mock:", e);
        return null;
      }
    };

    (async () => {
      // Three-phase UX: loading (LLM 20-60s) → typing (typewriter on real
      // reasoning) → writing (fields populate). User had no feedback during
      // the LLM wait so the system felt frozen.
      setThinkingStartedAt(Date.now());
      setThinkingPhase("loading");
      setLiveThinking(""); // overlay shows loading state, no text yet

      const realThinking = await runReal();
      if (cancelled) return;

      const text = realThinking ?? step.mockThinking ?? "";
      // Switch to typing phase with the REAL reasoning text
      setThinkingPhase("typing");
      setLiveThinking(text);

      const cps = 35;
      const typingMs = (text.length / cps) * 1000;
      setTimeout(() => {
        if (cancelled) return;
        // Brief "writing to fields" moment, then fade and advance
        setThinkingPhase("writing");
        setTimeout(() => {
          if (cancelled) return;
          setLiveThinking(null); // hide overlay → reveal populated fields
          setTimeout(() => {
            if (cancelled) return;
            advance();
          }, 2200);
        }, 800);
      }, typingMs + 200);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.status, pipeline.cursor]);

  const startPipeline = () => setPipeline({ status: "running", cursor: 0, completed: [] });
  const pausePipeline  = () => setPipeline((p) => ({ ...p, status: "paused" }));
  const resumePipeline = () => setPipeline((p) => ({ ...p, status: "running" }));
  const skipPipeline   = () => {
    const step = pipelineSteps[pipeline.cursor];
    if (!step) return;
    setPipeline((p) => ({
      ...p,
      cursor: p.cursor + 1,
      completed: [...p.completed, step.id],
    }));
  };
  const stopPipeline = () => setPipeline({ status: "idle", cursor: 0, completed: [] });

  // "自動填寫" — single-segment auto-fill. Track a stop-cursor so the
  // runner halts after the requested segment finishes (vs the full
  // Wizard which runs all 14 steps).
  const [autoFillStopAt, setAutoFillStopAt] = useState<number | null>(null);
  const runSegmentAutoFill = (segmentId: string) => {
    if (scopeMode === "none" || pipelineSteps.length === 0) return;
    const targetIdx = pipelineSteps.findIndex((s) => s.segmentId === segmentId);
    if (targetIdx < 0) return;
    setAutoFillStopAt(targetIdx);
    setPipeline({
      status: "running",
      cursor: targetIdx,
      completed: pipelineSteps.slice(0, targetIdx).map((s) => s.id),
    });
  };

  const pipelineThinking =
    pipeline.status === "running" && pipelineSteps[pipeline.cursor] && liveThinking !== null
      ? {
          segmentTarget: pipelineSteps[pipeline.cursor]!.segmentTarget,
          text: liveThinking,
          phase: thinkingPhase,
          startedAt: thinkingStartedAt,
          stepNum: pipeline.cursor + 1,
          stepTotal: pipelineSteps.length,
          stepTitle: pipelineSteps[pipeline.cursor]!.title,
        }
      : null;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* ─── Top header — scope-aware (brand / product / event) ─────── */}
      <header className="px-8 py-10 border-b border-divider bg-content1">
        <Chip
          color="default"
          variant="flat"
          size="sm"
          className="uppercase tracking-wider mb-2"
          startContent={<FontAwesomeIcon icon={scopeIcon} className="ml-1" />}
        >
          {scopeEyebrow}
        </Chip>
        <h1 className="text-3xl font-semibold tracking-tight">{scopeName}</h1>
        <p className="text-small text-default-500 mt-1">
          請於右上 ScopeBar 切換 品牌 / 產品 / 活動
        </p>
      </header>

      {/* ─── Body: full-bleed left rail + grid ─────────────────── */}
      <div className="flex-1 flex">
        {/* Left rail — full-bleed, fixed 240px, NO max-w-anything */}
        <aside className="w-[240px] shrink-0 border-r border-divider bg-content1 flex flex-col">
          {/* Top: 你的方案 + 邀請使用者 */}
          <div className="p-4 space-y-2 border-b border-divider">
            <Button
              fullWidth
              radius="lg"
              variant="bordered"
              startContent={<FontAwesomeIcon icon={faCrown} />}
              className="justify-start"
            >
              你的方案
            </Button>
            <Button
              fullWidth
              radius="lg"
              variant="bordered"
              startContent={<FontAwesomeIcon icon={faUserPlus} />}
              className="justify-start"
            >
              邀請使用者
            </Button>
          </div>

          {/* 所有品牌範本 link */}
          <Button
            fullWidth
            variant="light"
            radius="none"
            className="justify-start px-4 h-11"
          >
            所有品牌範本
          </Button>

          {/* Scope read-only chip (single source of truth = ScopeBar) */}
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 px-3 h-12 rounded-lg border border-divider bg-default-50">
              <Avatar
                name={(scopeName.charAt(0) || "?").toUpperCase()}
                size="sm"
                radius="md"
                classNames={{ base: "shrink-0 bg-default-100 text-default-600", name: "text-tiny font-bold" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-tiny text-default-400 uppercase tracking-wider">{scopeEyebrow}</p>
                <p className="text-small font-medium truncate">{scopeName}</p>
              </div>
            </div>
          </div>

          {/* Sub-nav */}
          <nav className="px-3 py-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
            {SUBNAV.map((s) => {
              const active = section === s.id;
              const isAll = s.id === "all";
              return (
                <Button
                  key={s.id}
                  fullWidth
                  size="sm"
                  variant={active ? "flat" : "light"}
                  color={active ? "primary" : "default"}
                  radius="lg"
                  className="justify-between h-9 text-small"
                  onPress={() => setSection(s.id)}
                  endContent={
                    <span className="flex items-center gap-1.5">
                      {s.badge && <Chip size="sm" color="primary" variant="flat" className="h-4 text-tiny">{s.badge}</Chip>}
                      {isAll && <FontAwesomeIcon icon={faPlus} className="text-tiny text-default-400" />}
                    </span>
                  }
                >
                  <span className="text-left flex-1">{s.label}</span>
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Right: scope-aware content pane */}
        <div className="flex-1 min-w-0 px-6 py-6 overflow-y-auto flex flex-col gap-4">
          {scopeMode !== "none" && pipelineSteps.length > 0 && (
            <PipelineRunner
              steps={pipelineSteps}
              state={pipeline}
              title={
                scopeMode === "product" ? "產品定位分析"
                : scopeMode === "event" ? "活動定位分析"
                : "品牌定位分析"
              }
              onStart={startPipeline}
              onPause={pausePipeline}
              onResume={resumePipeline}
              onSkip={skipPipeline}
              onStop={stopPipeline}
            />
          )}
          {section.startsWith("asset:") && scopeMode === "brand" && (scope?.brandId ?? brandId) ? (
            <BrandAssetPanel
              assetKey={section.slice("asset:".length) as AssetKey}
              brandId={(scope?.brandId ?? brandId)!}
            />
          ) : section === "card" || section === "prompts" || section.startsWith("seg:") ? (
            <PositioningPanel
              section={section}
              scopeMode={scopeMode}
              scopeName={scopeName}
              scopeBrandId={scope?.brandId ?? null}
              scopeProductId={scope?.productId ?? null}
              scopeEventId={scope?.eventId ?? null}
              pipelineThinking={
                pipelineThinking && pipelineThinking.segmentTarget === section
                  ? pipelineThinking
                  : null
              }
              onAutoFill={runSegmentAutoFill}
            />
          ) : visibleTiles.length === 0 ? (
            <Card shadow="none" className="border-2 border-dashed border-divider">
              <CardBody className="py-16 items-center text-center gap-3">
                <FontAwesomeIcon icon={faShapes} className="text-3xl text-default-300" />
                <p className="text-medium font-medium">這個區塊還沒有資產</p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleTiles.map((t) => (
                <BrandAssetTile key={t.id} tile={t} onClick={() => onTileClick(t)} />
              ))}

            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ─────────────────────────── PositioningPanel ───────────────────────── */
// Renders the 完整定位書 / 速查卡 / AI 指令庫 sub-views for the active scope.
// Reads positioning JSON from the appropriate router (brand / product / event)
// and persists edits via mutation; segment list comes from positioningSchema.

interface PipelineThinking {
  segmentTarget: string;
  text: string;
  phase: "loading" | "typing" | "writing";
  startedAt: number | null;
  stepNum: number;
  stepTotal: number;
  stepTitle: string;
}

function PositioningPanel({
  section, scopeMode, scopeName,
  scopeBrandId, scopeProductId, scopeEventId,
  pipelineThinking, onAutoFill,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event" | "none";
  scopeName: string;
  scopeBrandId: number | null;
  scopeProductId: number | null;
  scopeEventId: number | null;
  pipelineThinking?: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
}) {
  if (scopeMode === "none") {
    return (
      <Card shadow="none" className="border-2 border-dashed border-divider">
        <CardBody className="py-16 items-center text-center gap-3">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-300" />
          <p className="text-medium font-medium">尚未選擇 scope</p>
          <p className="text-small text-default-500 max-w-[320px]">
            請於右上 ScopeBar 選擇品牌 / 產品 / 活動，才能編輯定位內容。
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <PositioningEditor
      section={section}
      scopeMode={scopeMode}
      scopeName={scopeName}
      brandId={scopeBrandId}
      productId={scopeProductId}
      eventId={scopeEventId}
      pipelineThinking={pipelineThinking ?? null}
      onAutoFill={onAutoFill}
    />
  );
}

function PositioningEditor({
  section, scopeMode, scopeName, brandId, productId, eventId, pipelineThinking, onAutoFill,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
  pipelineThinking: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
}) {
  const segments: SegmentSpec[] = SCOPE_SEGMENTS[scopeMode] ?? [];
  const segmentId = section.startsWith("seg:") ? section.slice(4) : null;
  const activeSegment = segmentId ? segments.find((s) => s.id === segmentId) ?? null : null;

  // Read scope.active to get the merged positioning data for the chosen scope.
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId, eventId },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const dbPositioning =
    (scopeActive.data as any)?.[scopeMode]?.positioning ?? null;
  const targetId =
    scopeMode === "brand" ? brandId
    : scopeMode === "product" ? productId
    : eventId;

  // Local working copy + debounced persist via scope.savePositioning.
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => {
    if (dbPositioning && typeof dbPositioning === "object") setDraft(dbPositioning);
  }, [dbPositioning]);

  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => {
          setSaveState("saved");
          utils?.scope?.active?.invalidate?.();
        },
        onError: () => setSaveState("error"),
      })
    : null;

  const dirtyRef = React.useRef(false);
  const timerRef = React.useRef<any>(null);
  const onDraftChange = (next: Record<string, any>) => {
    setDraft(next);
    dirtyRef.current = true;
    if (!targetId || !saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveMutation.mutate({ kind: scopeMode, id: targetId, positioning: next });
      dirtyRef.current = false;
    }, 800);
  };

  if (section === "card") {
    return (
      <SpeedCardView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
    );
  }
  if (section === "prompts") {
    return (
      <PromptLibraryView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
    );
  }

  // section === "seg:xxx" — render ONE segment editor
  if (!activeSegment) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-12 items-center text-center gap-2">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-300" />
          <p className="text-medium font-medium">找不到段落</p>
          <p className="text-small text-default-500">請於左側選擇要編輯的定位書段落。</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1 flex-row items-center justify-between flex-wrap">
          <div>
            <p className="text-tiny text-default-500 uppercase tracking-wider">
              {scopeMode.toUpperCase()} · {activeSegment.num} {activeSegment.title}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{scopeName}</h2>
          </div>
          <SaveIndicator state={saveState} hasTarget={!!targetId} />
        </CardBody>
      </Card>
      {pipelineThinking && (
        <ThinkingOverlay
          text={pipelineThinking.text}
          phase={pipelineThinking.phase}
          startedAt={pipelineThinking.startedAt ?? undefined}
          stepNum={pipelineThinking.stepNum}
          stepTotal={pipelineThinking.stepTotal}
          stepTitle={pipelineThinking.stepTitle}
        />
      )}
      <SegmentEditor
        spec={activeSegment}
        value={draft[activeSegment.id] ?? null}
        onChange={(next) => onDraftChange({ ...draft, [activeSegment.id]: next })}
        onRunAgent={() => onAutoFill?.(activeSegment.id)}
        research={(draft._research as any)?.[activeSegment.id] ?? null}
        wizardMeta={(draft._wizardMeta as any)?.[activeSegment.id] ?? null}
      />
    </div>
  );
}

/* ─────────────────────────── BrandAssetPanel ───────────────────────── */
// Manual-fill panel for non-positioning brand assets (logo/colors/fonts/...).
// Reads scope.active.brand.positioning._assets[assetKey], writes via
// scope.savePositioning with debounced (800ms) auto-save.
function BrandAssetPanel({ assetKey, brandId }: { assetKey: AssetKey; brandId: number }) {
  const utils = (trpc as any).useUtils?.() ?? null;
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId: null, eventId: null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null };
  const positioning = (scopeActive.data as any)?.brand?.positioning ?? {};
  const initialValue = (positioning._assets as any)?.[assetKey] ?? null;

  const [draft, setDraft] = useState<any>(initialValue);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => { setDraft(initialValue); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(initialValue)]);

  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => { setSaveState("saved"); utils?.scope?.active?.invalidate?.(); },
        onError: () => setSaveState("error"),
      })
    : null;

  const timerRef = React.useRef<any>(null);
  const onChange = (next: any) => {
    setDraft(next);
    if (!saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const nextAssets = { ...(positioning._assets ?? {}), [assetKey]: next };
      const nextPositioning = { ...positioning, _assets: nextAssets };
      saveMutation.mutate({ kind: "brand", id: brandId, positioning: nextPositioning });
    }, 800);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-3 flex-row items-center justify-between flex-wrap">
          <p className="text-small text-default-500">
            這個區塊由你手動填寫；改動會在 800ms 後自動儲存到 brand.positioning._assets
          </p>
          <SaveIndicator state={saveState} hasTarget={true} />
        </CardBody>
      </Card>
      <BrandAssetEditor assetKey={assetKey} value={draft} onChange={onChange} />
    </div>
  );
}

function SaveIndicator({ state, hasTarget }: { state: "idle" | "saving" | "saved" | "error"; hasTarget: boolean }) {
  if (!hasTarget) {
    return (
      <Chip size="sm" variant="flat" color="warning" className="shrink-0">
        未綁定 ID — 編輯不會儲存
      </Chip>
    );
  }
  if (state === "saving") return <Chip size="sm" variant="flat" color="default" className="shrink-0">儲存中…</Chip>;
  if (state === "saved")  return <Chip size="sm" variant="flat" color="success" className="shrink-0">已儲存</Chip>;
  if (state === "error")  return <Chip size="sm" variant="flat" color="danger"  className="shrink-0">儲存失敗</Chip>;
  return null;
}

function SpeedCardView({ scopeMode, data, scopeName }: { scopeMode: string; data: any; scopeName: string }) {
  return (
    <SpeedCard
      scopeMode={scopeMode as "brand" | "product" | "event"}
      scopeName={scopeName}
      data={data}
    />
  );
}

function PromptLibraryView({ scopeMode, data, scopeName }: { scopeMode: string; data: any; scopeName: string }) {
  return (
    <PromptLibrary
      scopeMode={scopeMode as "brand" | "product" | "event"}
      scopeName={scopeName}
      data={data}
    />
  );
}

/* ─────────────────────────── BrandAssetTile ─────────────────────────── */

function BrandAssetTile({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  return (
    <Card
      isPressable
      isHoverable
      onPress={onClick}
      shadow="sm"
      radius="lg"
      className={`overflow-hidden bg-${tile.tone}-100`}
    >
      <CardBody className="aspect-[4/3] items-center justify-center relative p-0">
        <FontAwesomeIcon
          icon={tile.icon}
          className={`text-7xl text-${tile.tone}-600/70`}
        />
        {tile.count != null && tile.count > 0 && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md">
            {tile.count}
          </Chip>
        )}
        {!tile.ready && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md text-default-500">
            即將推出
          </Chip>
        )}
      </CardBody>
      <div className="px-4 py-3 bg-content1">
        <p className="text-small font-medium text-foreground">{tile.label}</p>
      </div>
    </Card>
  );
}
