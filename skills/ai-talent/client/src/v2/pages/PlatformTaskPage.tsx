/**
 * PlatformTaskPage — platform-first navigation (2026-05-26).
 *
 * Route: /tasks/:platform  (platform = fb | ig | li | yt | tt | email | pr)
 *
 * Replaces the old 30s/60s/99s tier pages as the primary entry point.
 * Users pick the *platform* in the sidebar, then filter by complexity via
 * tabs inside this page:
 *   全部  |  一篇內容 · 30s  |  內容套組 · 60s  |  完整活動 · 99s
 *
 * Speed badges appear on every card so the timing expectation is clear
 * without requiring users to navigate tiers before seeing tasks.
 */
import React, { useMemo, useState, useEffect } from "react";
import { Navigate, useParams, useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { showToastGlobal } from "../../components/ui/Toast";
import { matchTaskWithSynonyms } from "../lib/taskSearchSynonyms";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { buildContextChips, resolveDerive } from "../lib/taskContextResolver";
import {
  Avatar, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalFooter, ModalHeader, Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faPaperPlane, faXmark, faMagnifyingGlass,
  faEnvelope, faBullhorn, faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";
import RunningAgentCarousel from "../components/quickTask/RunningAgentCarousel";

// ── Platform route mapping ───────────────────────────────────────────────────
// URL param → internal platform filter key (matches task.platform from listFB)
const ROUTE_TO_PLATFORM: Record<string, string> = {
  fb:    "facebook",
  ig:    "instagram",
  li:    "linkedin",
  yt:    "youtube",
  tt:    "tiktok",
  email: "email",
  pr:    "pr",
};

interface PlatformMeta {
  label: string;
  labelZh: string;
  icon: any;
  bg: string;
  heroZh: string;
  heroEn: string;
  subZh: string;
  subEn: string;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  facebook: {
    label: "Facebook", labelZh: "Facebook", icon: faFacebookF, bg: "#1877F2",
    heroZh: "讓每篇 Facebook 貼文，都有爆款的骨架",
    heroEn: "Every post built on a viral framework — not blank-page guessing",
    subZh: "Clio 獲獎敘事公式 × 品牌定位鎖定，自然引發互動",
    subEn: "Award-winning narrative structures, locked to your brand voice",
  },
  instagram: {
    label: "Instagram", labelZh: "Instagram", icon: faInstagram, bg: "#E4405F",
    heroZh: "文案 × 視覺指令同步產出，不再是漂亮圖片配隨便文字",
    heroEn: "Caption and visual brief generated together — not pasted separately",
    subZh: "文案代理人 + 圖片指導代理人協作，輸出比競品深一層",
    subEn: "Caption agent + image director agent working in sync",
  },
  linkedin: {
    label: "LinkedIn", labelZh: "LinkedIn", icon: faLinkedinIn, bg: "#0A66C2",
    heroZh: "不只是發文，是在 LinkedIn 建立你的專業話語權",
    heroEn: "Thought leadership that generates real business — not just impressions",
    subZh: "PR Strategist 代理人以記者邏輯構建你的觀點",
    subEn: "PR Strategist agent thinks in journalist psychology and B2B conversion",
  },
  youtube: {
    label: "YouTube", labelZh: "YouTube", icon: faYoutube, bg: "#FF0000",
    heroZh: "標題、章節、縮圖文案、結尾鉤子 — YouTube 影片完整佈局",
    heroEn: "Title · chapters · thumbnail brief · end hook — all in one run",
    subZh: "Strategist 規劃敘事弧，再由文案代理人完成每一段腳本",
    subEn: "Strategist maps the narrative arc; writer handles every segment",
  },
  tiktok: {
    label: "TikTok", labelZh: "TikTok", icon: faTiktok, bg: "#EE1D52",
    heroZh: "前 3 秒留人，後 60 秒轉化 — TikTok 腳本不靠靈感",
    heroEn: "Hook in 3 seconds, convert in 60 — scripts built for retention",
    subZh: "TikTok 專屬代理人以角色弧度 × 未解懸念設計驅動完播率",
    subEn: "TikTok-specialized agent that thinks in character arcs and unresolved tension",
  },
  email: {
    label: "Newsletter", labelZh: "電子報", icon: faEnvelope, bg: "#7B5BC8",
    heroZh: "每封電子報都是品牌聲音的延伸，不是隨機發文",
    heroEn: "Every newsletter sounds exactly like you — not like a template",
    subZh: "品牌定位鎖定主旨行、開場鉤子與 CTA，完整結構一次產出",
    subEn: "Brand voice locks the subject line, opener, and CTA — zero drift",
  },
  pr: {
    label: "PR", labelZh: "新聞稿", icon: faBullhorn, bg: "#475569",
    heroZh: "讓媒體真正想報導你 — 不是寫稿，是設計新聞角度",
    heroEn: "Designed to be covered — not written to fill a checklist",
    subZh: "PR Strategist 代理人以記者視角找到新聞價值，再產出完整稿件",
    subEn: "PR Strategist agent finds the news angle before writing a single word",
  },
};

// ── Shared utilities ─────────────────────────────────────────────────────────
const CARD_PALETTES = [
  { from: "#fde68a", to: "#fbbf24" },
  { from: "#a5f3fc", to: "#22d3ee" },
  { from: "#c4b5fd", to: "#8b5cf6" },
  { from: "#bbf7d0", to: "#34d399" },
  { from: "#fecaca", to: "#f87171" },
  { from: "#fed7aa", to: "#fb923c" },
  { from: "#bfdbfe", to: "#60a5fa" },
  { from: "#f5d0fe", to: "#c084fc" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

function tierAccent(tier: string | undefined | null): string {
  if (tier === "60s") return "#7c3aed";
  if (tier === "99s") return "#f59e0b";
  return "#00b4bc";
}

function tierLabel(tier: string | undefined | null, lang: string): string {
  if (tier === "60s") return lang === "en" ? "60s" : "60 秒";
  if (tier === "99s") return lang === "en" ? "99s" : "99 秒";
  return lang === "en" ? "30s" : "30 秒";
}

// Tasks that should hold the modal open until image is done
const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

function synthesizeStages(elapsedMs: number, tier: string, lang: string): any[] {
  const L = (zh: string, en: string) => (lang === "en" ? en : zh);
  const t = elapsedMs;
  const isResearch = tier === "99s";
  const isProd = tier === "60s" || tier === "99s";
  const scoutEnd = isResearch ? 12000 : 0;
  const preEnd = scoutEnd + 3000;
  const stratEnd = preEnd + 9000;
  const capStart = preEnd;
  const capEnd = capStart + 25000;
  const genEnd = capEnd + 10000;
  const extrasEnd = capEnd + 14000;
  const qaEnd = extrasEnd + 8000;
  const mk = (key: string, label: string, start: number, end: number) => ({
    key, label, startedAt: start,
    completedAt: t > end ? end : undefined,
    status: t < start ? "pending" : t > end ? "done" : "running",
  });
  const stages: any[] = [];
  if (isResearch) stages.push(mk("scout", L("🔬 Scout 爬取真實爆款數據", "🔬 Scout pulls real viral data"), 0, scoutEnd));
  stages.push(mk("pre", L("URL / persona / brand load", "URL / persona / brand load"), scoutEnd, preEnd));
  if (isProd) stages.push(mk("strategist", L("Strategist 規劃敘事弧", "Strategist maps the narrative arc"), preEnd, stratEnd));
  stages.push(mk("caption", L("文案寫手 撰寫版本", "Caption writer drafts variants"), capStart, capEnd));
  stages.push(mk("brief", L("視覺指導寫風格指示", "Image director writes the visual brief"), capStart, capEnd));
  stages.push(mk("gen", L("Flux 生圖", "Flux paints the image"), capEnd, genEnd));
  if (isProd) {
    stages.push(mk("extras", L("留言模板 / 發文時段 / 跟進", "Reply templates · timing · follow-up"), capEnd, extrasEnd));
    stages.push(mk("qa", L("Jordan Hayes 審核", "Jordan Hayes reviews"), extrasEnd, qaEnd));
  }
  return stages;
}

// ── Tier tab config ──────────────────────────────────────────────────────────
type ActiveTier = "all" | "30s" | "60s" | "99s";

interface TierTab {
  id: ActiveTier;
  labelZh: string;
  labelEn: string;
  accent: string;
}

const TIER_TABS: TierTab[] = [
  { id: "all",  labelZh: "全部",           labelEn: "All",            accent: "#171717" },
  { id: "30s",  labelZh: "一篇內容 · 30s", labelEn: "Single · 30s",   accent: "#00b4bc" },
  { id: "60s",  labelZh: "內容套組 · 60s", labelEn: "Pack · 60s",     accent: "#7c3aed" },
  { id: "99s",  labelZh: "完整活動 · 99s", labelEn: "Campaign · 99s", accent: "#f59e0b" },
];

// ── FBTaskCard type (same as QuickTask30sPage) ───────────────────────────────
interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s" | "99s";
  postType: string;
  platform?: string;
  label: string;
  label_en?: string | null;
  label_zh?: string | null;
  contextSources?: string[] | null;
  description: string;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea"; derive?: any } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  team?: Array<{ id: number; name: string; title: string; avatarUrl: string | null }>;
  squad_slug?: string;
  methodology?: string;
}

// ── Error boundary ───────────────────────────────────────────────────────────
class PlatformPageErrorBoundary extends React.Component<
  { children: React.ReactNode; platform: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 32 }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: "#dc2626", textTransform: "uppercase" }}>
              /tasks/{this.props.platform} render error
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>頁面載入失敗</h2>
            <p style={{ marginTop: 8 }}>{e.message}</p>
            <button
              style={{ marginTop: 12, padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              重試渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
function PlatformTaskPageInner() {
  const { platform: routeParam = "fb" } = useParams<{ platform: string }>();
  const platform = ROUTE_TO_PLATFORM[routeParam] ?? "facebook";
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.facebook;

  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);

  // Onboarding redirect when no brands
  const brandsLoaded = (ctx as any)?.brandsLoaded === true;
  const brandsList = (ctx?.brands as any[]) ?? [];
  const needsOnboardingRedirect = brandsLoaded && brandsList.length === 0;

  // Brand data
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery(
        { id: brandId ?? 0 },
        { enabled: !!brandId, refetchInterval: 30_000, refetchOnWindowFocus: false },
      )
    : { data: null };

  // 2026-05-26 fix: was hardcoded productId/eventId: null → always fetched
  // brand-only positioning even when a product/event scope was active.
  // Now passes the real scope ids so context chips show the correct entity.
  const scopeActiveQuery = (trpc as any).scope?.active?.useQuery?.(
    {
      brandId:   brandId ?? 0,
      productId: ctx?.scope?.productId ?? null,
      eventId:   ctx?.scope?.eventId   ?? null,
    },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  const brandAssetsForCheck: Record<string, any> =
    ((scopeActiveQuery?.data as any)?.brand?.positioning?._assets ?? {}) as Record<string, any>;

  const textAssetsEmpty = useMemo(() => {
    const b: any = brandQuery?.data ?? {};
    const brandSetUp =
      (typeof b.tagline === "string" && b.tagline.trim()) ||
      (typeof b.positioningSummary === "string" && b.positioningSummary.trim()) ||
      b.positioningStatus === "completed";
    if (brandSetUp) return false;
    const v = (assetKey: string): boolean => {
      const a = brandAssetsForCheck[assetKey];
      if (!a) return true;
      if (typeof a.text === "string" && a.text.trim()) return false;
      if (Array.isArray(a.items) && a.items.some((x: any) => typeof x === "string" && x.trim())) return false;
      if (Array.isArray(a.pairs) && a.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim())) return false;
      return true;
    };
    return v("voice") && v("voice_principles") && v("preferred_terms") && v("banned_words");
  }, [brandAssetsForCheck, brandQuery?.data]);

  // Tier tab state
  const [activeTier, setActiveTier] = useState<ActiveTier>("all");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Task modal state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [imageAgentMeta, setImageAgentMeta] = useState<any | null>(null);
  const [orchestraStages, setOrchestraStages] = useState<any[] | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Countdown
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  // Brand context for modal chips.
  // When product/event scope is active, overlay their positioning on top of
  // the brand's so context chips reflect the selected product/event, not
  // the parent brand. Use product/event name as the display name.
  //
  // 2026-05-27 v2 (CJ「根治勝選通 modal 仍出現 SoWork」): two-level fix:
  //
  // A) Real-content check: `Object.keys(pos).length > 0` is insufficient because
  //    the auto-trigger writes `positioning._interim = {...}` which makes the check
  //    true even though no real segment data exists yet. We now check for non-"_"
  //    keys with actual string/array content (mirrors BrandsPage hasAnyPositioningContent).
  //
  // B) Interim overlay: if a product/event has only interim data (no real segments),
  //    use the interim sub-object as the overlay source — NOT the whole positioning
  //    object which would just merge brand+_interim and still expose brand chips.
  //
  // C) Hard isolation: if product/event scope is active but NOTHING exists yet,
  //    use {} so chips render as "尚未填寫" — never fall back to brand positioning.
  const brandCtx = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (!data?.brand) return null;
    const basePositioning    = data.brand.positioning    ?? {};
    const productPositioning = (data.product?.positioning ?? {}) as Record<string, any>;
    const eventPositioning   = (data.event?.positioning   ?? {}) as Record<string, any>;
    const productScopeActive = !!(ctx?.scope?.productId);
    const eventScopeActive   = !!(ctx?.scope?.eventId);

    /** Does a positioning object have real (non-internal) segment data? */
    const posHasReal = (pos: Record<string, any>): boolean =>
      Object.keys(pos).filter(k => !k.startsWith("_")).some(k => {
        const v = pos[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv) && (fv as any[]).length > 0)
        );
      });

    const productHasReal    = posHasReal(productPositioning);
    const productInterim    = productPositioning._interim as Record<string, any> | undefined ?? {};
    const productHasInterim = Object.keys(productInterim).length > 0;
    const eventHasReal      = posHasReal(eventPositioning);
    const eventInterim      = eventPositioning._interim as Record<string, any> | undefined ?? {};
    const eventHasInterim   = Object.keys(eventInterim).length > 0;

    // Overlay priority:
    //   1. Product real segments → merge on base (full override)
    //   2. Product interim only  → merge interim sub-object on base
    //   3. Event real segments   → merge on base
    //   4. Event interim only    → merge interim sub-object on base
    //   5. product/event scope active but truly empty → {} (no brand fallback)
    //   6. Brand scope           → brand positioning as-is
    const overlayPositioning =
      productHasReal    ? { ...basePositioning, ...productPositioning }
      : productHasInterim ? { ...basePositioning, ...productInterim }
      : eventHasReal    ? { ...basePositioning, ...eventPositioning }
      : eventHasInterim ? { ...basePositioning, ...eventInterim }
      : (productScopeActive || eventScopeActive)
        ? {}
        : basePositioning;

    const displayName =
      data.product?.name ?? data.event?.name ?? data.brand?.name ?? null;
    return {
      brand:   { ...data.brand, name: displayName, positioning: overlayPositioning },
      product: data.product ?? null,
      event:   data.event   ?? null,
    };
  }, [scopeActiveQuery?.data, ctx?.scope?.productId, ctx?.scope?.eventId]);

  // Auto-trigger interim positioning for product/event scope with no positioning.
  // Mirrors BrandsPage auto-trigger so users don't need to visit BrandsPage first.
  // Phase: fires once per (kind, entityId) and is reset on scope change.
  const _autoPosTaskRef = React.useRef<string | null>(null);
  const autoRunInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();
  const autoStartJobMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  const trpcUtils = (trpc as any).useUtils?.() ?? null;
  useEffect(() => {
    const productId = ctx?.scope?.productId ?? null;
    const eventId   = ctx?.scope?.eventId   ?? null;
    if (!productId && !eventId) return; // Brand scope — BrandsPage handles it
    const kind: "product" | "event" = productId ? "product" : "event";
    const entityId = (productId ?? eventId) as number;
    const key = `${kind}:${entityId}`;
    if (_autoPosTaskRef.current === key) return; // Already fired
    const data: any = scopeActiveQuery?.data;
    if (!data) return; // Query not yet loaded
    const entityPositioning = kind === "product"
      ? (data.product?.positioning ?? {})
      : (data.event?.positioning   ?? {});
    // Check for real content (ignore _interim / _meta internal keys)
    const hasContent = Object.keys(entityPositioning)
      .filter(k => !k.startsWith("_"))
      .some(k => {
        const v = entityPositioning[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv)      && (fv as any[]).length > 0)
        );
      });
    if (hasContent) return; // Already has positioning — nothing to do
    if (!autoRunInterimMut?.mutate || !autoStartJobMut?.mutate) return;
    _autoPosTaskRef.current = key;
    (async () => {
      // 1. Fire full pipeline fire-and-forget (background, takes minutes)
      try { autoStartJobMut.mutate({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 2. Run interim (≤12s) — writes _interim positioning used by content tasks
      try { await autoRunInterimMut.mutateAsync?.({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 3. Refresh scope.active so chips pick up the new interim data
      trpcUtils?.scope?.active?.invalidate?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.scope?.productId, ctx?.scope?.eventId, scopeActiveQuery?.data]);

  // Polish input
  const polishInputMut = (trpc as any).quickTask?.polishInput?.useMutation();
  const [polishing, setPolishing] = useState(false);
  const [polishErr, setPolishErr] = useState<string | null>(null);

  const handlePolish = async () => {
    if (!activeTask || !primaryAnswer.trim() || !polishInputMut?.mutateAsync) return;
    setPolishErr(null);
    setPolishing(true);
    try {
      const r = await polishInputMut.mutateAsync({
        taskId: activeTask.id,
        text: primaryAnswer,
        taskLabel: typeof activeTask.label === "string" ? activeTask.label : undefined,
        primaryQuestion: activeTask.primary_question ?? undefined,
        brandId: brandId ?? undefined,
      });
      if (r?.ok && r.polished) setPrimaryAnswer(r.polished);
      else setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } catch {
      setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } finally {
      setPolishing(false);
    }
  };

  // Task data
  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];

  // Mutations
  const runOrchestraMut    = (trpc as any).quickTask?.runOrchestra?.useMutation();
  const runOrchestra60Mut  = (trpc as any).quickTask?.runOrchestra60?.useMutation();
  const runOrchestra99Mut  = (trpc as any).quickTask?.runOrchestra99?.useMutation();
  const runSquadAutoMut    = (trpc as any).quickTask?.runSquadAuto?.useMutation();
  const holdUtils          = (trpc as any).useUtils?.() ?? null;

  // ?rerun=<outputId> support
  const rerunId = Number(searchParams.get("rerun") ?? "0");
  const rerunQuery = (trpc as any).output?.getById?.useQuery
    ? (trpc as any).output.getById.useQuery(
        { id: rerunId },
        { enabled: rerunId > 0, staleTime: 60_000 },
      )
    : { data: null };
  useEffect(() => {
    if (!rerunId || !rerunQuery.data || allTasks.length === 0) return;
    const r = rerunQuery.data;
    const taskId = r.mission?.taskId;
    if (!taskId) return;
    const task = allTasks.find((x: FBTaskCard) => x.id === taskId);
    if (!task) return;
    const inputs = (r.metadata?.inputs ?? {}) as Record<string, string>;
    const primaryKey = (task as any).primary_input?.key ?? "topic";
    const prior = inputs[primaryKey] ?? Object.values(inputs)[0] ?? "";
    setActiveTask(task);
    setPrimaryAnswer(typeof prior === "string" ? prior : "");
    const next = new URLSearchParams(searchParams);
    next.delete("rerun");
    setSearchParams(next, { replace: true });
  }, [rerunId, rerunQuery.data, allTasks]);

  // ?topic=<text> prefill
  useEffect(() => {
    const topic = searchParams.get("topic");
    if (!topic) return;
    setPrimaryAnswer((prev) => prev || topic);
    const next = new URLSearchParams(searchParams);
    next.delete("topic");
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  // ── Platform inference (matches QuickTask30sPage logic) ──────────────────
  const inferPlatform = (task: FBTaskCard): string =>
    task.platform ??
    (task.id?.startsWith("ig-") ? "instagram"
      : task.id?.startsWith("yt-") ? "youtube"
      : task.id?.startsWith("tt-") ? "tiktok"
      : task.id?.startsWith("li-") ? "linkedin"
      : task.id?.startsWith("em-") ? "email"
      : task.id?.startsWith("pr-") ? "pr"
      : task.id?.startsWith("br-") ? "brand"
      : task.id?.startsWith("rs-") ? "audience"
      : "facebook");

  // ── Filtered task list ────────────────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    let list = allTasks.filter((task) => inferPlatform(task) === platform);
    if (activeTier !== "all") {
      list = list.filter((task) => task.tier === activeTier);
    }
    if (searchQuery.trim()) {
      list = list.filter((task) =>
        matchTaskWithSynonyms({
          query: searchQuery,
          label: task.label,
          description: task.description ?? "",
          agentName: task.agent?.name,
          skillSlug: task.skill_slug ?? undefined,
        }),
      );
    }
    return list;
  }, [allTasks, platform, activeTier, searchQuery]);

  const totalForPlatform = useMemo(
    () => allTasks.filter((task) => inferPlatform(task) === platform).length,
    [allTasks, platform],
  );

  // ── Open / close task modal ───────────────────────────────────────────────
  const openTask = (task: FBTaskCard) => {
    if ((task as any).isMediaTask && (task as any).ctaPath) {
      navigate((task as any).ctaPath);
      return;
    }
    setActiveTask(task);
    let prefill = "";
    const derive = (task as any).primary_input?.derive;
    if (derive && brandCtx) {
      const r = resolveDerive(brandCtx, derive);
      if (r && (derive.mode === "auto" || derive.mode === "confirm")) prefill = r.text;
    }
    setPrimaryAnswer(prefill);
    setErrorMsg(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  const closeTask = () => {
    setActiveTask(null);
    setRunning(false);
    setCountdownStart(null);
    setOrchestraStages(null);
  };

  // ── Determine effective tier for running (tab || task.tier) ──────────────
  const effectiveTier = (task: FBTaskCard): "30s" | "60s" | "99s" => {
    if (activeTier !== "all") return activeTier;
    const t = task.tier as any;
    if (t === "60s" || t === "99s" || t === "30s") return t;
    return "30s";
  };

  // ── handleRun (same logic as QuickTask30sPage, tier = effectiveTier) ─────
  const handleRun = async () => {
    if (!activeTask) return;
    const tier = effectiveTier(activeTask);
    const primaryRequired = (activeTask.inputs?.[0] as any)?.required !== false;
    const hasDerive = !!(activeTask.primary_input as any)?.derive
      || !!(activeTask.contextSources && activeTask.contextSources.length > 0);
    if (!primaryAnswer.trim() && activeTask.primary_input?.key && primaryRequired && !hasDerive) {
      setErrorMsg(lang === "en" ? "Answer the question first, then we'll make it." : "請先回答這個問題再生成");
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setCountdownStart(Date.now());

    try {
      // Squad tasks (99s campaign workflows)
      if (activeTask.kind === "squad" && (activeTask as any).squad_slug) {
        if (runSquadAutoMut) {
          const r = await runSquadAutoMut.mutateAsync({
            squadSlug: (activeTask as any).squad_slug,
            topic: primaryAnswer || activeTask.label,
            brandId: brandId ?? undefined,
          });
          if ((r as any).outputId) {
            closeTask();
            navigate(`/run/${(r as any).outputId}`);
            return;
          }
          setErrorMsg(lang === "en"
            ? "Squad ran but the output ID didn't come back. Try again or contact support."
            : "Squad 執行成功但 outputId 未回傳，請重試或回報。");
          return;
        }
        setErrorMsg(lang === "en" ? "Squad auto-run isn't available right now." : "Squad 自動執行 mutation 暫不可用");
        return;
      }

      // Orchestra path (30s / 60s / 99s)
      const inputKey = activeTask.primary_input?.key ?? "topic";
      const tierMut =
        tier === "60s" ? runOrchestra60Mut :
        tier === "99s" ? runOrchestra99Mut :
        runOrchestraMut;

      if (tierMut) {
        const r = await tierMut.mutateAsync({
          taskId: activeTask.id,
          inputs: { [inputKey]: primaryAnswer },
          brandId: brandId ?? undefined,
          productId: ctx?.scope?.productId ?? null,
          eventId: ctx?.scope?.eventId ?? null,
        });

        if ((r as any).outputId) {
          const oid = (r as any).outputId;
          // Hold-for-images: wait for full post before navigating
          if ((tier === "60s" || HOLD_FOR_IMAGES.has(activeTask.id)) && holdUtils?.output?.getById?.fetch) {
            const deadline = Date.now() + 95_000;
            while (Date.now() < deadline) {
              await new Promise((res) => setTimeout(res, 3000));
              try {
                const o: any = await holdUtils.output.getById.fetch({ id: oid });
                if (o?.progress && o.progress !== "caption_ready") break;
              } catch { /* transient */ }
            }
          }
          closeTask();
          navigate(`/run/${oid}`);
          return;
        }

        const hasErrors = r.errors && r.errors.length > 0;
        const hasAnyCaption = (r.variants ?? []).some((v: any) => (v?.caption ?? "").trim().length > 0);
        const errorPreview = hasErrors ? r.errors.slice(0, 2).join(" · ").slice(0, 200) : "";
        setErrorMsg(
          hasErrors && !hasAnyCaption
            ? (lang === "en"
                ? `The AI specialist failed to write any content. Try a different task. Detail: ${errorPreview}`
                : `這位 AI 專家目前無法產出文案，請改試其他任務。詳情：${errorPreview}`)
            : hasErrors
            ? (lang === "en"
                ? "AI is a bit busy — hit Make it again."
                : "AI 暫時忙不過來，再按一次「立即產出」就好。")
            : (lang === "en"
                ? "Captions wrote OK but persistence failed — please contact support."
                : `文案寫出來了但沒存進資料庫（task: ${activeTask.id}），請聯絡客服。`)
        );
        return;
      }

      setErrorMsg(lang === "en"
        ? "This task isn't ready yet."
        : "這個任務還在開發中，請改試其他任務。");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      setCountdownStart(null);
    }
  };

  // ── Progress / countdown ──────────────────────────────────────────────────
  const activeTierForProgress = activeTask ? effectiveTier(activeTask) : "30s";
  const expectedSec =
    activeTierForProgress === "60s" ? 90 :
    activeTask && HOLD_FOR_IMAGES.has(activeTask.id) ? 90 :
    activeTierForProgress === "99s" ? 100 : 30;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  // Render-time onboarding redirect (must be after all hooks)
  if (needsOnboardingRedirect) return <Navigate to="/brands" replace />;

  // Redirect unknown platform params
  if (!ROUTE_TO_PLATFORM[routeParam]) return <Navigate to="/tasks/fb" replace />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ─── HERO ──────────────────────────────────────────────────────── */}
      <div className="relative pt-24 pb-6 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">

          {/* Platform eyebrow */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
              style={{ background: meta.bg }}
            >
              <FontAwesomeIcon icon={meta.icon} className="text-sm" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-default-500">
              {lang === "en" ? meta.label : meta.labelZh}
            </p>
          </div>

          {/* Hero title — plain color (no gradient-text; gradient clip is unreliable cross-browser) */}
          <h1
            className="font-bold tracking-tight leading-tight mb-2"
            style={{
              fontSize: "clamp(1.45rem, 2.8vw, 2rem)",
              color: "#0f0f0e",
            }}
          >
            {lang === "en" ? meta.heroEn : meta.heroZh}
          </h1>

          {/* Platform sub-headline — differentiation copy */}
          <p
            className="mb-3 text-default-500"
            style={{ fontSize: 14, lineHeight: 1.65, maxWidth: 580 }}
          >
            <span style={{ color: meta.bg, fontWeight: 600 }}>▸ </span>
            {lang === "en" ? meta.subEn : meta.subZh}
            {brandId && (
              <span style={{ fontStyle: "italic", color: "#9ca3af" }}>
                {lang === "en"
                  ? ` · Using ${brandName ?? "your brand"}'s positioning`
                  : ` · 以 ${brandName ?? "你的品牌"} 定位為骨架`}
              </span>
            )}
          </p>

          {/* Search */}
          <div className="w-full mb-5" style={{ maxWidth: 740 }}>
            <Input
              size="lg"
              radius="lg"
              variant="flat"
              placeholder={lang === "en" ? "Search tasks or keywords…" : "搜尋任務或關鍵字…"}
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              onClear={() => setSearchQuery("")}
              startContent={
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 16 }} />
              }
              classNames={{
                base: "overflow-hidden rounded-[18px]",
                inputWrapper: "h-14 bg-white shadow-md border border-default-100 rounded-[18px] data-[focus=true]:shadow-lg",
                input: "text-medium",
              }}
            />
          </div>

          {/* ── Tier tabs ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {TIER_TABS.map((tab) => {
              const active = activeTier === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTier(tab.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={
                    active
                      ? {
                          background: tab.accent,
                          color: "white",
                          boxShadow: `0 2px 12px ${tab.accent}55`,
                        }
                      : {
                          background: "white",
                          color: "#525252",
                          border: "1px solid #E5E5E5",
                        }
                  }
                >
                  {tab.id !== "all" && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: active ? "rgba(255,255,255,0.7)" : tab.accent }}
                    />
                  )}
                  {lang === "en" ? tab.labelEn : tab.labelZh}
                </button>
              );
            })}
          </div>

          {/* Task count micro-label */}
          <div className="mt-3 text-tiny text-default-400">
            {lang === "en"
              ? `${visibleTasks.length} of ${totalForPlatform} tasks`
              : `${visibleTasks.length} / ${totalForPlatform} 個任務`}
            {brandName && (
              <span className="ml-2">
                · {lang === "en" ? "Brand:" : "品牌腦："}<span className="font-medium text-default-600">{brandName}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Task grid ─────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-20">
        {totalForPlatform === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faBolt} className="text-3xl mb-2 text-default-300" />
              <p className="font-semibold mb-1">
                {lang === "en" ? `${meta.label} tasks loading…` : `${meta.labelZh} 任務準備中`}
              </p>
            </CardBody>
          </Card>
        ) : visibleTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
              <p>
                {searchQuery.trim()
                  ? (lang === "en" ? `No tasks match "${searchQuery}"` : `沒有匹配 "${searchQuery}" 的任務`)
                  : (lang === "en" ? "No tasks in this tier yet — coming soon." : "這個層級還沒有任務，即將上線")}
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  {lang === "en" ? "Tasks" : "精選任務"}
                </h2>
                <p className="text-tiny text-default-400 mt-0.5">
                  {lang === "en" ? "Tap to make — answer one quick question first." : "按下即產出，先回答 1 個關鍵問題"}
                </p>
              </div>
              <Chip size="sm" variant="flat" color="secondary">
                {lang === "en" ? `${visibleTasks.length} tasks` : `${visibleTasks.length} 件`}
              </Chip>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleTasks.map((task, idx) => {
                const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                const agentName = task.agent?.name ?? "AI Agent";
                const avatarSrc = task.agent?.avatarUrl || dicebear(agentName);
                const taskTier = task.tier as string;
                const accent = tierAccent(taskTier);

                return (
                  <button
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                    style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                  >
                    {/* Card top — gradient bg + agent avatar centered (matches QuickTask30sPage) */}
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
                      {/* Speed badge — top right */}
                      <span
                        className="absolute top-2 right-2 text-tiny font-bold px-2 py-0.5 rounded-full text-white shadow-sm tabular-nums"
                        style={{ background: accent, fontSize: 9, letterSpacing: "0.06em" }}
                      >
                        {taskTier === "99s" ? "99s" : taskTier}
                      </span>
                      {/* Platform icon — top left */}
                      <div
                        className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: meta.bg }}
                      >
                        <FontAwesomeIcon icon={meta.icon} className="text-white" style={{ fontSize: 9 }} />
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      <p className="text-small font-semibold leading-tight line-clamp-2">
                        {lang === "en" ? (task.label_en ?? task.label) : task.label}
                      </p>
                      <p className="text-tiny text-default-500 line-clamp-2">{task.description}</p>
                      {(task as any).methodology && (
                        <span className="text-[10px] text-default-400 italic">📚 {(task as any).methodology}</span>
                      )}
                      <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                        <Avatar src={avatarSrc} size="sm" className="w-5 h-5" />
                        <span className="text-tiny font-medium text-default-700 truncate">{agentName}</span>
                      </div>
                      {/* 60s team stack */}
                      {(task as any).team && (task as any).team.length > 1 && (
                        <div className="flex items-center gap-1.5 -mt-1">
                          <div className="flex -space-x-2">
                            {((task as any).team as Array<{ id: number; name: string; avatarUrl: string | null }>)
                              .slice(0, 4)
                              .map((m) => (
                                <Avatar key={m.id} src={m.avatarUrl || dicebear(m.name)} size="sm" className="w-5 h-5 ring-1 ring-white" title={m.name} />
                              ))}
                          </div>
                          <span className="text-[10px] text-default-500">
                            {lang === "en" ? `${(task as any).team.length} collaborators` : `${(task as any).team.length} 位協作`}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Task modal (intake + running countdown) ───────────────────── */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="2xl"
        scrollBehavior="inside"
        backdrop="blur"
        classNames={{
          base: "max-h-[90vh]",
          body: "py-3 px-4",
          footer: "border-t border-default-100 bg-white py-2 px-4",
          header: "py-2 px-3 bg-white border-b border-default-100",
          closeButton: "text-default-400 hover:bg-default-100",
        }}
      >
        <ModalContent>
          {activeTask && (
            <>
              <ModalHeader className="flex flex-col items-stretch gap-0 py-2 px-3 border-b border-default-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-default-800 truncate font-medium">
                      {lang === "en"
                        ? (activeTask.label_en ?? activeTask.label)
                        : (activeTask.label_zh ?? activeTask.label)}
                      {activeTask.agent && (
                        <span className="text-default-500 ml-2 font-normal">· {activeTask.agent.name}</span>
                      )}
                    </p>
                  </div>
                  {/* Tier badge in modal header */}
                  <span
                    className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full text-white shadow-sm shrink-0"
                    style={{ background: tierAccent(effectiveTier(activeTask)) }}
                  >
                    {effectiveTier(activeTask)}
                  </span>
                </div>
              </ModalHeader>

              <ModalBody>
                {/* Brand assets empty hint */}
                {textAssetsEmpty && brandId && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">💡</span>
                    <div className="flex-1 leading-relaxed">
                      {lang === "en" ? (
                        <>
                          <span className="font-medium">This brand's word assets are empty.</span>
                          {" "}Pop into{" "}
                          <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                            Brand → Words
                          </a>
                          {" "}and click Auto-fill. Output will be far more on-brand.
                        </>
                      ) : (
                        <>
                          <span className="font-medium">這個品牌的「文字」資產還是空的。</span>
                          {" "}先到{" "}
                          <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                            品牌 → 文字
                          </a>
                          {" "}按「自動填寫」，AI 產出會明顯貼合品牌語氣。
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Context chips */}
                {(() => {
                  // 2026-05-27 (CJ「modal chip 仍抓 SoWork」): scope-aware DEFAULT_SOURCES.
                  // Product uses segment ids: core / audience / value / competition / strategy / marketing.
                  // Brand uses: goldenCircle / audience / voice / differentiation / values / tagline.
                  // When product/event scope is active, use the correct paths so chips read
                  // from the product's own positioning segments, not the brand's.
                  const isProductScope = !!(brandCtx?.product);
                  const isEventScope   = !!(brandCtx?.event);
                  const BRAND_SOURCES = [
                    "brand.name",
                    "brand.positioning.audience.primary",
                    "brand.positioning.voice.archetypes",
                    "brand.positioning.voice.tone",
                    "brand.positioning.voice.forbidden",
                    "brand.positioning.goldenCircle.why",
                  ];
                  const PRODUCT_SOURCES = [
                    "brand.name",                                   // displayName = product name
                    "brand.positioning.audience.primary",           // product.audience.primary
                    "brand.positioning.core.coreStatement",         // product.core.coreStatement
                    "brand.positioning.marketing.tone",             // product.marketing.tone
                    "brand.positioning.competition.uniqueUsp",      // product.competition.uniqueUsp
                    "brand.positioning.value.userFeeling",          // product.value.userFeeling
                  ];
                  const EVENT_SOURCES = [
                    "brand.name",                                   // displayName = event name
                    "brand.positioning.audience.primary",           // event.audience.primary
                    "brand.positioning.smp.statement",              // event.smp.statement
                    "brand.positioning.messaging.coreMessage",      // event.messaging.coreMessage
                    "brand.positioning.strategy.approach",          // event.strategy.approach
                  ];
                  const DEFAULT_SOURCES =
                    isProductScope ? PRODUCT_SOURCES :
                    isEventScope   ? EVENT_SOURCES   :
                    BRAND_SOURCES;
                  const sources = (activeTask.contextSources && activeTask.contextSources.length > 0)
                    ? activeTask.contextSources
                    : DEFAULT_SOURCES;
                  const chips = brandCtx ? buildContextChips(brandCtx, sources) : [];
                  const anyContent = chips.some((c: any) => c.hasContent);
                  if (!anyContent) return null;
                  return (
                    <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: "#FAFAF9", border: "1px solid #171717" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: "#525252", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6 }}>
                        {(() => {
                          // Use product/event name when scope is active;
                          // fall back to parent brand name for brand scope.
                          const entityName = brandCtx?.brand?.name ?? brandName ?? (lang === "en" ? "your brand" : "你的品牌");
                          return lang === "en"
                            ? `Context · pulling these from ${entityName} for this task`
                            : `Context · 我會用 ${entityName} 的這些資料來跑這個任務`;
                        })()}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.filter((c: any) => c.hasContent).map((c: any, i: number) => (
                          <span key={i} title={c.source} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "#171717", color: "#FFFFFF", fontWeight: 500 }}>
                            {c.label}
                          </span>
                        ))}
                        {chips.filter((c: any) => !c.hasContent).slice(0, 3).map((c: any, i: number) => (
                          <span key={`m${i}`} title={c.source} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "transparent", color: "#A3A3A3", border: "1px dashed #D4D4D4" }}>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Primary question input */}
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
                    {polishInputMut && !running && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          color="secondary"
                          isLoading={polishing}
                          isDisabled={polishing || !primaryAnswer.trim()}
                          onPress={handlePolish}
                          startContent={!polishing && <FontAwesomeIcon icon={faWandMagicSparkles} />}
                        >
                          {polishing
                            ? (lang === "en" ? "Polishing…" : "潤稿中…")
                            : (lang === "en" ? "AI polish my brief" : "✨ AI 潤稿")}
                        </Button>
                        <span className="text-tiny text-default-400">
                          {lang === "en"
                            ? "Tidies your input — facts kept, never invented."
                            : "幫你整理輸入（保留事實、不會捏造）"}
                        </span>
                      </div>
                    )}
                    {polishErr && <p className="text-tiny text-danger-500">{polishErr}</p>}
                  </div>
                )}

                {/* Running carousel */}
                {running && (() => {
                  const tier = effectiveTier(activeTask);
                  const stagesNow = orchestraStages && orchestraStages.length > 0
                    ? orchestraStages
                    : synthesizeStages(tickMs, tier, lang);
                  const elapsedText =
                    (tier === "60s" || tier === "99s")
                      ? `${(tickMs / 1000).toFixed(0)}s · ${lang === "en" ? "researching → writing → rendering" : "策略 → 文案 → 出圖中"}`
                      : `${(tickMs / 1000).toFixed(1)}s / ${expectedSec}s`;
                  const accent = tierAccent(tier);
                  const agentRoster: Array<{ id?: number; name: string; title?: string; avatarUrl?: string | null; role?: string }> = [];
                  const cap = agentMeta ?? activeTask.agent;
                  if (cap) agentRoster.push({ id: cap.id, name: cap.name, title: cap.title, avatarUrl: cap.avatarUrl, role: lang === "en" ? "Writing caption" : "撰寫文案" });
                  if (imageAgentMeta) agentRoster.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: lang === "en" ? "Visual direction" : "視覺方向" });
                  return (
                    <RunningAgentCarousel
                      agents={agentRoster.length > 0 ? agentRoster : [{ name: "Agent", role: lang === "en" ? "Working" : "處理中" }]}
                      stages={stagesNow}
                      accentColor={accent}
                      progressPct={progressPct}
                      elapsedText={elapsedText}
                    />
                  );
                })()}

                {/* Error message */}
                {errorMsg && (
                  <Card className="bg-warning-50 border border-warning-200 mt-4">
                    <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                  </Card>
                )}
              </ModalBody>

              <ModalFooter>
                <Button variant="light" onPress={closeTask} startContent={<FontAwesomeIcon icon={faXmark} />}>
                  {t("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleRun}
                  isLoading={running}
                  isDisabled={running}
                  startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                >
                  {running ? t("qt_run_busy") : t("qt_run_btn")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

export default function PlatformTaskPage() {
  const { platform = "fb" } = useParams<{ platform: string }>();
  return (
    <PlatformPageErrorBoundary platform={platform}>
      <PlatformTaskPageInner />
    </PlatformPageErrorBoundary>
  );
}
