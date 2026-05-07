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
import { useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Skeleton, Tabs, Tab,
  Input, Select, SelectItem, CheckboxGroup, Checkbox,
} from "@heroui/react";
import SegmentEditor from "../components/positioning/SegmentEditor";
import ThinkingOverlay from "../components/positioning/ThinkingOverlay";
import PipelineRunner, { type PipelineState } from "../components/positioning/PipelineRunner";
import SpeedCard from "../components/positioning/SpeedCard";
import PromptLibrary from "../components/positioning/PromptLibrary";
import BrandAssetEditor, { type AssetKey } from "../components/positioning/BrandAssetEditor";
import AddEntityModal, { type AddEntityTab } from "../components/AddEntityModal";
import { SCOPE_SEGMENTS, type SegmentSpec } from "../lib/positioningSchema";
import { pipelineFor, type PipelineStepSpec } from "../lib/positioningPipeline";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown, faPlus, faCloudArrowUp, faShapes,
  faPalette, faFont, faQuoteLeft, faBullseye, faUsers,
  faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved,
  faFolderOpen, faUserPlus, faCrown,
  faBookOpen, faTableList, faRobot, faTrademark, faBox, faCalendarDay,
  faRocket, faBullhorn,
  faWandSparkles, faEllipsis, faCircleInfo,
  faMagnifyingGlass, faGear, faCheck, faUserCircle,
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

// Event-specific subnav additions (CJ direction 2026-04-29):
// - settings page lets user edit metadata (brand / name / period /
//   productIds) post-creation — previously only set at create time.
// - 視覺資產 deferred to a later round (event posters / videos go through
//   MediaGenFlow per the visual-step rule, not stored as static assets).
const EVENT_SETTINGS_SUBNAV: SubNavItem[] = [
  { id: "settings", label: "設定（品牌 / 期間 / 產品）", group: "settings" },
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
  const { brandId, setBrandId, brands, scope, setScope } = useOutletContext<ShellOutletCtx>();

  // Add entity modal (新增品牌 / 產品 / 活動)
  const [addModal, setAddModal] = useState<{ open: boolean; tab: AddEntityTab }>({ open: false, tab: "brand" });

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
    if (scopeMode === "event") {
      for (const a of EVENT_SETTINGS_SUBNAV) {
        items.push(a);
      }
    }
    return items;
  }, [scopeMode, segments]);

  // ── Navigation ────────────────────────────────────────────────────────────
  // `cat` URL param (set by ShellLayout sidebar) drives the large category.
  // `section` (page-level aside) drives the sub-item within that category.
  const [searchParams] = useSearchParams();
  const urlCat = searchParams.get("cat") ?? "positioning";
  const category: "positioning" | "visual" | "settings" =
    urlCat === "visual" ? "visual" : urlCat === "settings" ? "settings" : "positioning";

  const defaultSection: SectionId = category === "visual" ? "asset:all" : category === "settings" ? "settings" : "pos:home";
  const [section, setSection] = useState<SectionId>(defaultSection);
  const derivedCategory = category; // alias for content-area conditions

  // When category changes via URL, reset section to a sensible default
  const prevCatRef = React.useRef(category);
  React.useEffect(() => {
    if (prevCatRef.current !== category) {
      prevCatRef.current = category;
      if (category === "visual")        setSection("asset:all");
      else if (category === "settings") setSection("settings");
      else                              setSection("pos:home");
    }
  }, [category]);

  // (brand dropdown moved to ShellLayout sidebar)

  // Reset to positioning grid when scope changes
  React.useEffect(() => {
    setSection("pos:home");
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

  // (tiles and onTileClick replaced by category === "visual" inline rendering)

  // ── Pipeline (research mode) — scope-aware (brand 14 / product 5 / event 11) ─
  const pipelineSteps: PipelineStepSpec[] = pipelineFor(scopeMode);

  // Read positioning at top level (deduped by React Query — same key as
  // PositioningEditor's query). Used to surface SMP value in the
  // checkpoint card without requiring user to click into the SMP segment.
  const topScopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId: scope?.brandId, productId: scope?.productId, eventId: scope?.eventId },
        { enabled: scopeMode !== "none", refetchOnWindowFocus: false, staleTime: 30_000 },
      )
    : { data: null };
  const topPositioning = (topScopeActive.data as any)?.[scopeMode]?.positioning ?? null;
  const smpData = topPositioning?.smp ?? null;

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
      // SMP checkpoint gate (event scope only). Server marks the segment
      // with _wizardMeta.smp.requiresUserApproval=true after writing; we
      // pause here so user must press 繼續 before steps 7-11 fire.
      if (scopeMode === "event" && step.segmentId === "smp") {
        setPipeline((p) => ({
          ...p,
          status: "paused",
          completed: [...p.completed, step.id],
        }));
        setSmpCheckpointActive(true);
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
        // Track empty conclusion as a failure even if the request succeeded —
        // 2026-04-29 CJ caught: product step 3-5 silently empty after step 2.
        // Likely cause: LLM JSON parse failed mid-pipeline, server returns
        // empty conclusion, advance ran, segment stayed blank, no error UI.
        if (!res?.conclusion || Object.keys(res.conclusion).length === 0) {
          setFailedStepIds((s) => Array.from(new Set([...s, step.id])));
          // eslint-disable-next-line no-console
          console.warn(`[pipeline] step ${step.id} (${step.segmentId}) returned empty conclusion — segment will be blank. Run "重跑此步" to retry.`);
        }
        return res?.thinking ?? null;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[pipeline] runStep failed, falling back to mock:", e);
        setFailedStepIds((s) => Array.from(new Set([...s, step.id])));
        return null;
      }
    };

    (async () => {
      // Three-phase UX: loading → typing → writing. CJ caught timing bug:
      // pipeline advanced before fields visibly populated. Extended the
      // "fields visible" hold to 5s + double-invalidate to force refetch.
      setThinkingStartedAt(Date.now());
      setThinkingPhase("loading");
      setLiveThinking("");

      const realThinking = await runReal();
      if (cancelled) return;
      // Force a refetch right after server write so the draft/query is
      // already updated by the time typing finishes.
      utils?.scope?.active?.invalidate?.();

      const text = realThinking ?? step.mockThinking ?? "";
      setThinkingPhase("typing");
      setLiveThinking(text);

      const cps = 35;
      const typingMs = (text.length / cps) * 1000;
      setTimeout(() => {
        if (cancelled) return;
        setThinkingPhase("writing");
        // Re-invalidate at the writing handoff so any in-flight render gets
        // the latest server state before the overlay fades.
        utils?.scope?.active?.invalidate?.();
        setTimeout(() => {
          if (cancelled) return;
          setLiveThinking(null); // hide overlay → fields visible
          // Long hold so user actually reads the populated fields
          // (CJ feedback: 跳太快). 5 seconds gives query refetch + render
          // time + reading time for the average user.
          setTimeout(() => {
            if (cancelled) return;
            advance();
          }, 5000);
        }, 1500);
      }, typingMs + 300);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.status, pipeline.cursor]);

  const startPipeline = () => {
    setFailedStepIds([]); // reset error trail on fresh start
    setSmpCheckpointActive(false); // clear stale SMP gate
    setPipeline({ status: "running", cursor: 0, completed: [] });
  };
  // SMP checkpoint resume — fired when user presses 繼續 on the gate card.
  // Resume = clear gate flag + advance cursor + flip pipeline back to running.
  const resumeAfterSmp = () => {
    setSmpCheckpointActive(false);
    setPipeline((p) => ({
      ...p,
      status: "running",
      cursor: p.cursor + 1,
    }));
  };
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
  // Tracks which step ids failed (LLM error or empty conclusion). Surfaces
  // as a banner so user can spot which segments need rerun. Cleared on
  // pipeline restart.
  const [failedStepIds, setFailedStepIds] = useState<number[]>([]);
  // SMP checkpoint state — when event scope's SMP step completes, server
  // marks _wizardMeta.smp.requiresUserApproval=true. We pause the runner
  // here and surface a confirmation card; user clicks 繼續 to resume.
  // Per CJ direction 2026-04-29: SMP is the campaign's highest principle,
  // user must commit before steps 7-11 (messaging/creative/...) fire.
  const [smpCheckpointActive, setSmpCheckpointActive] = useState(false);
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
      {/* ─── Hero header — 首頁同款三層漸層 ── */}
      <section
        className="relative px-8 pt-10 pb-8 overflow-hidden"
        style={{
          boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
          backgroundImage: [
            "linear-gradient(to bottom, transparent 65%, rgb(252,251,254) 100%)",
            "linear-gradient(rgba(255,255,255,0.96), rgba(255,255,255,0.96))",
            "linear-gradient(135deg, #00b4bc 0%, #8b5cf6 60%, #4c1d95 100%)",
          ].join(", "),
        }}
      >
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Eyebrow */}
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(99,102,241,0.7)" }}>
            SoWork · {scopeEyebrow}
          </p>

          {/* Brand icon */}
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 12,
            boxShadow: "0 4px 16px rgba(124,58,237,0.30)",
          }}>
            <FontAwesomeIcon icon={scopeIcon} style={{ color: "white", fontSize: 20 }} />
          </div>

          {/* Main title — gradient text, 首頁同款 */}
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              margin: 0,
            }}
          >
            {scopeName}
          </h1>
        </div>
      </section>

      {/* ─── Body: full-bleed left rail + grid ─────────────────── */}
      <div className="flex-1 flex">
        {/* ── Brand left rail — sub-nav only (你的方案/品牌選擇器 已移至收放側邊欄) ── */}
        <aside style={{
          width: 200, flexShrink: 0,
          borderRight: "1px solid #E4E3E1",
          background: "white",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {/* Sub-nav — items for the active category (set by ShellLayout sidebar via ?cat=) */}
          <nav style={{ flex: 1, padding: "6px 8px 16px", display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: "#A8A29E",
              letterSpacing: "0.10em", textTransform: "uppercase",
              padding: "4px 4px 6px", margin: 0,
            }}>
              {category === "visual" ? "視覺資產" : category === "settings" ? "設定" : (
                scopeMode === "product" ? "產品定位" : scopeMode === "event" ? "活動定位" : "品牌定位"
              )}
            </p>

            {/* 品牌定位 sub-items */}
            {category === "positioning" && [
              { id: "card",    label: "速查卡"    },
              { id: "prompts", label: "AI 指令庫" },
              ...segments.map(s => ({ id: `seg:${s.id}`, label: `${s.num} ${s.title}` })),
            ].map(item => {
              const active = section === item.id;
              return (
                <button key={item.id} onClick={() => setSection(item.id)} style={{
                  width: "100%", display: "flex", alignItems: "center",
                  padding: "5px 10px", borderRadius: 8,
                  background: active ? "rgba(163,112,252,0.15)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(163,112,252,0.15)" : "none"; }}
                >
                  {item.label}
                </button>
              );
            })}

            {/* 視覺資產 sub-items */}
            {category === "visual" && [
              { id: "asset:all",        label: "所有資產"               },
              { id: "asset:guidelines", label: "準則"                   },
              { id: "asset:templates",  label: "品牌範本", badge: "最新" },
              { id: "asset:logo",       label: "標誌"                   },
              { id: "asset:colors",     label: "顏色"                   },
              { id: "asset:fonts",      label: "字型"                   },
              { id: "asset:voice",      label: "品牌口吻"               },
              { id: "asset:photos",     label: "照片"                   },
              { id: "asset:images",     label: "圖像"                   },
              { id: "asset:icons",      label: "圖示"                   },
              { id: "asset:charts",     label: "圖表"                   },
            ].map(item => (
              <VisualNavItem
                key={item.id}
                id={item.id}
                label={item.label}
                badge={(item as any).badge}
                active={section === item.id}
                onClick={() => setSection(item.id)}
              />
            ))}

            {/* 設定 sub-items (event only) */}
            {category === "settings" && scopeMode === "event" && (() => {
              const active = section === "settings";
              return (
                <button onClick={() => setSection("settings")} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 10px", borderRadius: 8,
                  background: active ? "rgba(163,112,252,0.15)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
                  textAlign: "left", transition: "background 0.12s",
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F4F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(163,112,252,0.15)" : "none"; }}
                >
                  <FontAwesomeIcon icon={faGear} style={{ fontSize: 11, color: active ? "rgb(74,46,126)" : "#A8A29E" }} />
                  設定
                </button>
              );
            })()}
          </nav>
        </aside>

        {/* Right: scope-aware content pane — driven by `section` (sidebar handles all nav) */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col" style={{ minWidth: 0 }}>
          {/* ── 品牌 / 產品 / 活動定位 ── */}
          {derivedCategory === "positioning" && (
            <>
              {/* ── 定位 card grid (pos:home) ── */}
              {section === "pos:home" ? (
                <PositioningGrid
                  scopeMode={scopeMode}
                  segments={segments}
                  onSelect={setSection}
                />
              ) : (
              /* ── 選了具體 section → 原本的內容 ── */
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <button onClick={() => setSection("pos:home")} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "#78716C", background: "none", border: "none",
                  cursor: "pointer", padding: 0, marginBottom: 4,
                }}>
                  ← 品牌定位總覽
                </button>
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
                {smpCheckpointActive && (
                  <div className="mt-2 rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon icon={faWandSparkles} className="text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-semibold text-primary-800">🛑 SMP Checkpoint — 請確認單一核心命題</p>
                        <p className="text-tiny text-default-600 mt-1">SMP 是這次活動的最高創意準則，後面 5 個 step 都會圍繞它展開。先確認再繼續。</p>
                        {smpData?.singleMindedProposition && (
                          <div className="mt-2 p-2 rounded bg-white border border-divider">
                            <p className="text-small font-medium text-foreground">「{smpData.singleMindedProposition}」</p>
                            {smpData.rationale && <p className="text-tiny text-default-500 mt-1 leading-relaxed">{smpData.rationale}</p>}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <button className="px-3 py-1 rounded-md bg-primary text-white text-tiny font-medium hover:opacity-90" onClick={resumeAfterSmp}>▶ 繼續（跑 step 7-11）</button>
                          <button className="px-3 py-1 rounded-md border border-divider text-tiny hover:bg-default-50" onClick={() => setSection("seg:smp")}>編輯 SMP</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {failedStepIds.length > 0 && (
                  <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-tiny text-warning-800">
                    ⚠ 以下 step 沒寫入內容，建議到對應頁籤重跑：{" "}
                    {failedStepIds.map(id => { const s = pipelineSteps.find(x => x.id === id); return s ? `Step ${id} · ${s.segmentId}` : `Step ${id}`; }).join("、")}
                    <button className="ml-2 underline" onClick={() => setFailedStepIds([])}>關閉</button>
                  </div>
                )}
                <PositioningPanel
                  section={section}
                  scopeMode={scopeMode}
                  scopeName={scopeName}
                  scopeBrandId={scope?.brandId ?? null}
                  scopeProductId={scope?.productId ?? null}
                  scopeEventId={scope?.eventId ?? null}
                  pipelineThinking={pipelineThinking && pipelineThinking.segmentTarget === section ? pipelineThinking : null}
                  onAutoFill={runSegmentAutoFill}
                />
              </div>
              )}  {/* end section !== pos:home */}
            </>
          )}

          {/* ── 視覺資產 ── */}
          {derivedCategory === "visual" && scopeMode === "brand" && (
            <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 32, position: "relative" }}>

              {/* ── 若選了具體資產類別，顯示其編輯器 ── */}
              {(() => {
                const VALID_ASSET_KEYS: AssetKey[] = ["logo", "colors", "fonts", "photos", "guidelines", "templates"];
                const assetKey = section.slice("asset:".length) as AssetKey;
                const activeBrandId = scope?.brandId ?? brandId;
                if (VALID_ASSET_KEYS.includes(assetKey) && activeBrandId) {
                  return (
                    <div>
                      {/* Back to grid */}
                      <button onClick={() => setSection("asset:all")} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 12, color: "#78716C", background: "none", border: "none",
                        cursor: "pointer", marginBottom: 16, padding: 0,
                      }}>
                        ← 所有資產
                      </button>
                      <BrandAssetPanel assetKey={assetKey} brandId={activeBrandId} />
                    </div>
                  );
                }

                /* ── 預設：所有資產卡片 grid ── */
                const ASSET_GROUPS: Array<{
                  label: string;
                  items: Array<{ id: string; label: string; icon: any; bg: string; }>;
                }> = [
                  {
                    label: "基礎資產",
                    items: [
                      { id: "asset:logo",       label: "標誌",   icon: faPenNib,    bg: "#FFF7ED" },
                      { id: "asset:colors",     label: "顏色",   icon: faPalette,   bg: "#F5F3FF" },
                      { id: "asset:fonts",      label: "字型",   icon: faFont,      bg: "#EFF6FF" },
                      { id: "asset:guidelines", label: "準則",   icon: faShieldHalved, bg: "#F0FDF4" },
                    ],
                  },
                  {
                    label: "品牌個性",
                    items: [
                      { id: "asset:voice",      label: "品牌口吻", icon: faQuoteLeft, bg: "#FFF0F6" },
                      { id: "asset:templates",  label: "品牌範本", icon: faFolderOpen, bg: "#FFFBEB" },
                      { id: "asset:photos",     label: "照片",     icon: faImages,    bg: "#F0F9FF" },
                    ],
                  },
                  {
                    label: "視覺素材",
                    items: [
                      { id: "asset:images",  label: "圖像", icon: faImage,    bg: "#FFF7ED" },
                      { id: "asset:icons",   label: "圖示", icon: faIcons,    bg: "#F5F3FF" },
                      { id: "asset:charts",  label: "圖表", icon: faChartPie, bg: "#ECFDF5" },
                    ],
                  },
                ];

                return (
                  <>
                    {ASSET_GROUPS.map((group, gi) => (
                      <div key={gi}>
                        {/* 分組標題 — 細線 + 灰色小標籤 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: "#A8A29E",
                            letterSpacing: "0.10em", textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}>{group.label}</span>
                          <div style={{ flex: 1, height: 1, background: "#F0EFED" }} />
                          <button style={{
                            fontSize: 12, color: "#6366F1", background: "none", border: "none",
                            cursor: "pointer", whiteSpace: "nowrap", padding: 0,
                            fontWeight: 500,
                          }}>
                            顯示更多
                          </button>
                        </div>

                        {/* 4-col card grid */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 14,
                          marginBottom: 4,
                        }}>
                          {group.items.map(item => (
                            <AssetCard
                              key={item.id}
                              label={item.label}
                              icon={item.icon}
                              bg={item.bg}
                              onClick={() => setSection(item.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* ⑥ 紫色浮動 + 按鈕 → 開啟新增 entity modal（品牌 / 產品 / 活動） */}
                    <button
                      title="新增品牌 / 產品 / 活動"
                      onClick={() => setAddModal({ open: true, tab: scopeMode === "brand" ? "product" : scopeMode === "product" ? "event" : "brand" })}
                      style={{
                        position: "fixed", bottom: 32, right: 32, zIndex: 50,
                        width: 52, height: 52, borderRadius: "50%",
                        background: "linear-gradient(135deg, #7C3AED, #6366F1)",
                        border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontSize: 22,
                        boxShadow: "0 6px 20px rgba(99,102,241,0.45)",
                        transition: "transform 0.18s, box-shadow 0.18s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = "scale(1.08)";
                        e.currentTarget.style.boxShadow = "0 10px 28px rgba(99,102,241,0.55)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.45)";
                      }}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </button>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── 設定（活動限定）── */}
          {derivedCategory === "settings" && scopeMode === "event" && scope?.eventId && (
            <div style={{ padding: "24px" }}>
              <EventSettingsPanel eventId={scope.eventId} brands={scopeBrands} />
            </div>
          )}

          {/* ── 設定（品牌 — 含 FB 自動抓 logo）── */}
          {derivedCategory === "settings" && scopeMode === "brand" && (scope?.brandId ?? brandId) && (
            <div style={{ padding: "24px" }}>
              <BrandLogoSettings
                brandId={(scope?.brandId ?? brandId) as number}
                brandName={currentBrand?.name ?? null}
              />
            </div>
          )}
        </div>
      </div>

      {/* Page-level always-visible 「+ 新增」FAB — clicks open the unified
          modal with a sensible default tab based on current scope. */}
      <button
        onClick={() => setAddModal({ open: true, tab: scopeMode === "brand" ? "product" : scopeMode === "product" ? "event" : "brand" })}
        title="新增 品牌 / 產品 / 活動"
        style={{
          position: "fixed", bottom: 32, right: 32, zIndex: 60,
          padding: "12px 20px", borderRadius: 999,
          background: "linear-gradient(135deg, #7C3AED, #6366F1)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          color: "white", fontSize: 14, fontWeight: 600,
          boxShadow: "0 6px 20px rgba(99,102,241,0.45)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 10px 28px rgba(99,102,241,0.55)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.45)"; }}
      >
        <FontAwesomeIcon icon={faPlus} />
        <span>新增</span>
      </button>

      {/* AddEntityModal — shared dialog for 品牌 / 產品 / 活動 */}
      <AddEntityModal
        isOpen={addModal.open}
        initialTab={addModal.tab}
        defaultBrandId={(scope?.brandId ?? brandId) ?? null}
        onClose={() => setAddModal({ open: false, tab: addModal.tab })}
        onCreated={(kind, id) => {
          if (kind === "brand") { setBrandId(id); setScope({ brandId: id, productId: null, eventId: null }); }
          else if (kind === "product") setScope({ brandId: scope?.brandId ?? brandId ?? null, productId: id, eventId: null });
          else if (kind === "event") setScope({ brandId: scope?.brandId ?? brandId ?? null, productId: scope?.productId ?? null, eventId: id });
        }}
      />
    </main>
  );
}

/* ─────────────────────────── PositioningGrid ───────────────────────── */
// 品牌定位的 card grid — 速查卡/指令庫 + segments 分組顯示
function PositioningGrid({
  scopeMode, segments, onSelect,
}: {
  scopeMode: "brand" | "product" | "event" | "none";
  segments: import("../lib/positioningSchema").SegmentSpec[];
  onSelect: (section: string) => void;
}) {
  // Derive groups from segment num prefix
  const groupedSegs = React.useMemo(() => {
    const map = new Map<string, { label: string; segs: typeof segments }>();
    for (const s of segments) {
      const prefix = s.num.split(".")[0]!;
      // label by prefix convention
      const label =
        prefix === "1" ? "品牌識別"
        : prefix === "2" ? "品牌背景"
        : prefix === "3" ? "目標受眾"
        : prefix === "4" ? "市場分析"
        : prefix === "5" ? "競爭策略"
        : prefix === "6" ? "行銷策略"
        : prefix === "7" ? "市場趨勢"
        : prefix === "8" ? "品牌個性"
        : `第 ${prefix} 章`;
      if (!map.has(label)) map.set(label, { label, segs: [] });
      map.get(label)!.segs.push(s);
    }
    return Array.from(map.values());
  }, [segments]);

  // Icon map per segment id
  const ICONS: Record<string, any> = {
    goldenCircle: faBullseye, tagline: faPenNib, taglineScore: faChartPie,
    origin: faBookOpen, values: faShieldHalved,
    audience: faUsers, competition: faTableList,
    differentiation: faRocket, trends: faBullhorn, voice: faQuoteLeft,
    // product / event fallbacks
    core: faBullseye, positioning: faBullseye, smp: faWandSparkles,
  };
  const BG_CYCLE = ["#FFF7ED","#F5F3FF","#EFF6FF","#F0FDF4","#FFF0F6","#FFFBEB","#F0F9FF","#ECFDF5"];

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 32 }}>
      {/* ── 工具群組 ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            品牌工具
          </span>
          <div style={{ flex: 1, height: 1, background: "#F0EFED" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <AssetCard label="速查卡"   icon={faTableList} bg="#FFF7ED" onClick={() => onSelect("card")} />
          <AssetCard label="AI 指令庫" icon={faRobot}     bg="#F5F3FF" onClick={() => onSelect("prompts")} />
        </div>
      </div>

      {/* ── Segment groups ── */}
      {groupedSegs.map((group, gi) => (
        <div key={group.label}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#A8A29E", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              {group.label}
            </span>
            <div style={{ flex: 1, height: 1, background: "#F0EFED" }} />
            {group.segs.length > 4 && (
              <button style={{ fontSize: 12, color: "#6366F1", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", padding: 0, fontWeight: 500 }}>
                顯示更多
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {group.segs.map((s, si) => (
              <AssetCard
                key={s.id}
                label={`${s.num} ${s.title}`}
                icon={ICONS[s.id] ?? faBookOpen}
                bg={BG_CYCLE[(gi * 4 + si) % BG_CYCLE.length]!}
                onClick={() => onSelect(`seg:${s.id}`)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ⑥ 紫色浮動 + 按鈕 */}
      <button title="新增" style={{
        position: "fixed", bottom: 32, right: 32, zIndex: 50,
        width: 52, height: 52, borderRadius: "50%",
        background: "linear-gradient(135deg, #7C3AED, #6366F1)",
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "white", fontSize: 22,
        boxShadow: "0 6px 20px rgba(99,102,241,0.45)",
        transition: "transform 0.18s, box-shadow 0.18s",
      }}
        onMouseEnter={e => { e.currentTarget.style.transform="scale(1.08)"; e.currentTarget.style.boxShadow="0 10px 28px rgba(99,102,241,0.55)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(99,102,241,0.45)"; }}
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}

/* ─────────────────────────── AssetCard ─────────────────────────── */
// ③ 4-col 資產卡片：hover scale(1.02) + shadow 加深
function AssetCard({ label, icon, bg, onClick }: {
  label: string; icon: any; bg: string; onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "28px 16px", borderRadius: 12,
        background: bg, border: "1px solid rgba(0,0,0,0.06)",
        cursor: "pointer", width: "100%",
        transform: hovered ? "scale(1.02)" : "scale(1)",
        boxShadow: hovered
          ? "0 8px 24px rgba(0,0,0,0.13)"
          : "0 1px 4px rgba(0,0,0,0.06)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 28, color: "#6B7280", opacity: 0.85 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</span>
    </button>
  );
}

/* ─────────────────────────── VisualNavItem ─────────────────────────── */
// Sidebar item for visual assets — shows hover-reveal + button, purple badge for 最新.
function VisualNavItem({ id, label, badge, active, onClick }: {
  id: string; label: string; badge?: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        padding: "4px 12px", borderRadius: 8,
        background: active ? "rgba(163,112,252,0.15)" : hovered ? "#F5F4F2" : "none",
        border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? "rgb(74,46,126)" : "rgb(15,16,21)",
        textAlign: "left", transition: "background 0.12s",
        gap: 6,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
          background: "rgba(163,112,252,0.20)", color: "rgb(74,46,126)",
          flexShrink: 0,
        }}>{badge}</span>
      )}
      {hovered && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: "rgba(163,112,252,0.20)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "rgb(74,46,126)", fontWeight: 700,
        }}>+</span>
      )}
    </button>
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

/* ─────────────────────── Event Settings Panel ───────────────────────
 * CJ direction 2026-04-29: post-creation event editing — brand picker,
 * name, period, linked productIds (m:n via event_products). All metadata
 * that previously could only be set at create time. Lives as the
 * "settings" sub-nav entry under event scope.
 */
function EventSettingsPanel({
  eventId, brands,
}: { eventId: number; brands: any[] }) {
  const utils = (trpc as any).useUtils?.() ?? null;
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery({ id: eventId }, { refetchOnWindowFocus: false })
    : { data: null, isLoading: false };
  const event = eventQuery.data as any;

  const [name, setName] = React.useState("");
  const [brandId, setBrandId] = React.useState<number | null>(null);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt]     = React.useState("");
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Hydrate from server data once it arrives.
  React.useEffect(() => {
    if (!event) return;
    setName(event.name ?? "");
    setBrandId(event.brandId ?? null);
    const fmt = (d: any): string => {
      if (!d) return "";
      try {
        const s = String(d);
        return s.split("T")[0] ?? s;
      } catch { return ""; }
    };
    setStartAt(fmt(event.startAt));
    setEndAt(fmt(event.endAt));
    setProductIds(Array.isArray(event.productIds) ? event.productIds : []);
  }, [event]);

  // Candidate products from the picked brand (so user can re-link if
  // brand changes). Same query the create-modal uses.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const candidateProducts: any[] = (productsQuery.data as any[]) ?? [];

  const upsert = (trpc as any).event?.upsert?.useMutation?.() ?? null;

  const onSave = async () => {
    if (!upsert) { setErr("event.upsert not available"); return; }
    if (!name.trim()) { setErr("名稱不能為空"); return; }
    if (!brandId) { setErr("必須綁定品牌"); return; }
    setErr(null);
    try {
      await upsert.mutateAsync({
        id: eventId,
        brandId,
        slug: event?.slug ?? "",
        name: name.trim(),
        startAt: startAt || undefined,
        endAt: endAt || undefined,
        productIds, // replace full set per upsert contract
      });
      setSavedAt(new Date().toLocaleTimeString());
      utils?.event?.get?.invalidate?.();
      utils?.scope?.options?.invalidate?.();
      utils?.scope?.active?.invalidate?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  if (eventQuery.isLoading) {
    return <p className="text-small text-default-500">載入中…</p>;
  }
  if (!event) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-16 items-center text-center">
          <p className="text-medium font-medium">找不到此活動</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1">
          <p className="text-tiny text-default-500 uppercase tracking-wider">EVENT · 設定</p>
          <h2 className="text-xl font-semibold tracking-tight">{event.name}</h2>
          <p className="text-small text-default-500">
            slug: <code className="text-tiny">{event.slug}</code>
          </p>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-5 gap-4">
          <Input
            label="活動名稱（必填）"
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            value={name}
            onValueChange={setName}
            isRequired
          />
          <Select
            label="所屬品牌（必選）"
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            selectedKeys={brandId ? new Set([String(brandId)]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0];
              setBrandId(k ? Number(k) : null);
            }}
            isRequired
          >
            {brands.map((b: any) => (
              <SelectItem key={String(b.id)}>{b.name}</SelectItem>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="開始日期" labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={startAt} onValueChange={setStartAt}
            />
            <Input
              label="結束日期" labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={endAt} onValueChange={setEndAt}
            />
          </div>
          <div>
            <p className="text-small font-medium mb-1">關聯產品（可多選）</p>
            <p className="text-tiny text-default-500 mb-2">
              選 0 個 = 品牌層級活動；2+ 個 = 跨產品活動。改變綁定的品牌後產品清單會更新。
            </p>
            {candidateProducts.length === 0 ? (
              <p className="text-tiny text-default-500">此品牌尚無產品。</p>
            ) : (
              <CheckboxGroup
                value={productIds.map(String)}
                onValueChange={(vals) => setProductIds((vals as string[]).map((v) => Number(v)))}
                classNames={{ wrapper: "gap-1.5" }}
              >
                {candidateProducts.map((p: any) => (
                  <Checkbox key={p.id} value={String(p.id)} size="sm">
                    <span className="text-small">{p.name}</span>
                  </Checkbox>
                ))}
              </CheckboxGroup>
            )}
          </div>
          {err && <p className="text-tiny text-danger">{err}</p>}
          <div className="flex items-center gap-3">
            <Button
              color="primary" size="sm"
              isLoading={upsert?.isPending ?? false}
              onPress={onSave}
            >
              儲存
            </Button>
            {savedAt && <span className="text-tiny text-success">已儲存 · {savedAt}</span>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────── BrandLogoSettings ─────────────────── */
/**
 * Brand logo block (2026-05-05): preview current logoUrl + 一鍵抓 FB 粉專
 * 大頭貼 + 換一張. Used in BrandsPage settings tab.
 */
function BrandLogoSettings({ brandId, brandName }: { brandId: number; brandName: string | null }) {
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery({ id: brandId }, { refetchOnWindowFocus: false })
    : { data: null, refetch: () => {} };
  const logoUrl: string | null = (brandQuery.data as any)?.logoUrl ?? null;

  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const fetchMut = (trpc as any).brand?.fetchFacebookAvatar?.useMutation();

  const submit = async () => {
    if (!handle.trim()) { setErr("請輸入 FB 粉專網址或 handle"); return; }
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const r = await fetchMut.mutateAsync({ brandId, handleOrUrl: handle.trim() });
      setOkMsg(`已抓取 (${r.bytes.toLocaleString()} bytes)`);
      setHandle("");
      await brandQuery.refetch?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div>
        <h3 className="text-medium font-semibold">品牌 logo / 頭像</h3>
        <p className="text-tiny text-default-500 mt-1">
          mockup 顯示用的「{brandName ?? "品牌"}」頭像。可以從 FB 粉專自動抓，或之後手動上傳。
        </p>
      </div>

      <div className="flex items-center gap-4 border border-default-200 rounded-medium p-4 bg-default-50">
        <Avatar
          src={logoUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(brandName ?? "brand")}`}
          size="lg"
          className="w-20 h-20"
        />
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium">
            {logoUrl ? "目前 logo" : "尚未設定 logo（顯示 dicebear 預設圖）"}
          </p>
          {logoUrl && (
            <p className="text-tiny text-default-400 truncate">{logoUrl}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border border-default-200 rounded-medium p-4">
        <p className="text-small font-medium">
          {logoUrl ? "換一張（從 FB 粉專重抓）" : "從 FB 粉專自動抓"}
        </p>
        <p className="text-tiny text-default-500">
          貼粉專網址或純 handle。粉專必須是公開的。會覆蓋現有 logo。
        </p>
        <Input
          size="sm"
          placeholder="https://www.facebook.com/桂冠營養研究室"
          value={handle}
          onValueChange={setHandle}
          isDisabled={busy}
        />
        <div className="flex items-center gap-2">
          <Button color="primary" size="sm" onPress={submit} isLoading={busy}>
            {logoUrl ? "重新抓取" : "抓取 logo"}
          </Button>
          {okMsg && <span className="text-tiny text-success-600">✓ {okMsg}</span>}
          {err && <span className="text-tiny text-danger-600">{err}</span>}
        </div>
      </div>
    </div>
  );
}
