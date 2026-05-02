/**
 * PickerWorkspace — Canva-style "open in new tab" picker.
 *
 * Reference study: Canva home → click "Presentation" tile → opens a new
 * tab with: left icon rail, middle squad-thumbnail panel with search +
 * AI-generate input, right canvas area. Click a squad → detail panel
 * shows workflow step previews + a primary "套用 / 啟動小組" CTA.
 *
 * Routing
 *   /picker?workspace=facebook       → pre-filter to FB squads
 *   /picker?layer=L1                 → pre-filter to L1 squads
 *   /picker?title=Facebook 月度經營  → seed mission title for launch
 *   /picker?source=upload            → open ingest modal on mount
 *
 * Layout (Canva-faithful)
 *   ┌──┬───────────────┬────────────────────────────────────┐
 *   │  │ search + pills │                                    │
 *   │ι │ squad thumbs   │   canvas placeholder OR squad      │
 *   │  │ (vertical)     │   detail panel (steps grid)        │
 *   └──┴───────────────┴────────────────────────────────────┘
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import { inferMockupVariant, getVariantsForPlatform, inferStepKind, aggregateMockupFields, type MockupVariant } from "../lib/inferMockup";
import { searchAndRankSquads } from "../lib/searchSquads";
import { PlatformMockup } from "../components/PlatformMockup";
import { DocMockup } from "../components/PlatformMockup/doc";
import { CalendarGridMockup } from "../components/SquadMockups/calendar";
import MediaGenFlow from "../components/media/MediaGenFlow";
import { TaskChip } from "../components/TaskChip";
import { AgentAvatar } from "../components/AgentAvatar";
import BrandSwitcher from "../app/shell/BrandSwitcher";
import ScopeBar, { useScopeState } from "../app/shell/ScopeBar";
import {
  Alert, Avatar, AvatarGroup, Badge, Breadcrumbs, BreadcrumbItem,
  Button, Card, CardBody, CardHeader, Chip, Divider, Input,
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Progress, ScrollShadow, Skeleton, Spinner, Tab, Tabs, Textarea,
  Tooltip, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket, faPaperPlane, faRotateRight, faBullseye, faPenToSquare,
  faBrain, faUserGroup, faGavel, faMagnifyingGlass, faChartColumn,
  faPenNib, faPalette, faBolt, faCircleCheck, faCircle, faLayerGroup,
  faMobileScreen, faImages, faNewspaper, faVideo, faPodcast, faBookOpen,
  faHeart, faComment, faShareNodes, faBookmark, faPlay,
  // Rail / channel / SVG-replacement icons (PR5b)
  faTableCells, faTableCellsLarge, faClockRotateLeft, faUpload,
  faMicrophone, faChessKnight, faMasksTheater, faBox,
  faMoneyBillWave, faGrip, faUser, faRoute, faObjectGroup, faTableColumns,
  faCalendarDays, faFolderOpen, faBullhorn, faCircleNodes, faHashtag,
  faUserTie, faAddressBook, faHeading, faImage, faClosedCaptioning,
  faEnvelopeOpenText, faChartLine, faDiagramProject, faTriangleExclamation,
  faChartArea, faClipboardCheck, faBell, faRankingStar,
  faArrowLeft, faExpand, faCompress, faChevronLeft, faChevronRight,
  faEnvelope, faCopy, faFilter, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  faInstagram, faFacebook, faLinkedin, faYoutube,
} from "@fortawesome/free-brands-svg-icons";

/* ─────────────────────────── Icon rail ─────────────────────────── */
//
// Layer-aware rail (decision 2026-04-27): the leftmost icon column is split
// into THREE bands. The middle band swaps based on the active squad's
// strategy layer (L1–L6) — for L4 it further specialises by channel
// (FB/IG/LI/YT/PR). Top and bottom bands stay constant so users always
// have a way back to "範本" and to global tools like 品牌 / 我的 / 上傳.
//
//   ┌────┐
//   │ ▣  │ 範本           ← top band (always present)
//   ├────┤
//   │ ✎  │ 訪談稿         ← middle band — varies per layer
//   │ ⚔  │ 競品比對
//   │ ◈  │ 原型卡
//   │ ⊞  │ SWOT
//   ├────┤
//   │ ◐  │ 品牌           ← bottom band (always present)
//   │ ◔  │ 我的
//   │ ↑  │ 上傳
//   └────┘
//
// Items in the layer band open a typed "asset drawer" in the middle column
// (replacing the squad list temporarily). Drawers ship as placeholders for
// now — content gets populated as the underlying tables land in later
// sprints. Clicking 範本 returns to the squad list.

type RailKind = "global" | "layer";
type RailItem = {
  key: string;
  label: string;
  icon: any;       // FA icon
  kind: RailKind;
  /** When kind="layer", which asset drawer to open in middle column */
  drawer?: string;
};

// Note: FA icons imported below in a single block, used as `icon` field
// (was previously hand-typed unicode glyphs — replaced 2026-04-28).

const RAIL_TOP: RailItem[] = [
  { key: "templates", label: "範本", icon: faTableCells, kind: "global" },
];

const RAIL_BOTTOM: RailItem[] = [
  { key: "brand",   label: "品牌", icon: faPalette,        kind: "global" },
  { key: "members", label: "成員", icon: faUserGroup,      kind: "global" },
  { key: "recent",  label: "我的", icon: faClockRotateLeft, kind: "global" },
  { key: "upload",  label: "上傳", icon: faUpload,         kind: "global" },
];

/** Per-layer middle-band rail items. Keys for L4 use `L4-${channel}` format. */
const LAYER_RAIL: Record<string, RailItem[]> = {
  L1: [
    { key: "interviews",  label: "訪談稿",  icon: faMicrophone,       kind: "layer", drawer: "interviews" },
    { key: "competitors", label: "競品",    icon: faChessKnight,      kind: "layer", drawer: "competitors" },
    { key: "archetypes",  label: "原型卡",  icon: faMasksTheater,     kind: "layer", drawer: "archetypes" },
    { key: "swot",        label: "SWOT",   icon: faTableCellsLarge,   kind: "layer", drawer: "swot" },
  ],
  L2: [
    { key: "products",    label: "產品卡",  icon: faBox,              kind: "layer", drawer: "products" },
    { key: "vp-canvas",   label: "VP",      icon: faTableColumns,     kind: "layer", drawer: "vp-canvas" },
    { key: "pricing",     label: "定價",    icon: faMoneyBillWave,    kind: "layer", drawer: "pricing" },
    { key: "fab",         label: "FAB",     icon: faGrip,             kind: "layer", drawer: "fab" },
  ],
  L3: [
    { key: "personas",    label: "Persona", icon: faUser,             kind: "layer", drawer: "personas" },
    { key: "icp",         label: "ICP",     icon: faBullseye,         kind: "layer", drawer: "icp" },
    { key: "journey",     label: "旅程圖",  icon: faRoute,             kind: "layer", drawer: "journey" },
    { key: "segments",    label: "區隔",    icon: faObjectGroup,      kind: "layer", drawer: "segments" },
  ],
  L4: [
    { key: "calendar",    label: "行事曆",  icon: faCalendarDays,     kind: "layer", drawer: "calendar" },
    { key: "assets",      label: "素材庫",  icon: faFolderOpen,       kind: "layer", drawer: "assets" },
    { key: "history",     label: "歷史",    icon: faClockRotateLeft,  kind: "layer", drawer: "history" },
  ],
  "L4-facebook": [
    { key: "fb-history",  label: "貼文",    icon: faNewspaper,        kind: "layer", drawer: "fb-history" },
    { key: "fb-assets",   label: "素材庫",  icon: faImages,           kind: "layer", drawer: "fb-assets" },
    { key: "fb-calendar", label: "行事曆",  icon: faCalendarDays,     kind: "layer", drawer: "fb-calendar" },
    { key: "fb-ads",      label: "廣告組",  icon: faBullhorn,         kind: "layer", drawer: "fb-ads" },
  ],
  "L4-instagram": [
    { key: "ig-reels",    label: "Reels",   icon: faVideo,            kind: "layer", drawer: "ig-reels" },
    { key: "ig-stories",  label: "限動",    icon: faCircleNodes,      kind: "layer", drawer: "ig-stories" },
    { key: "ig-tags",     label: "Hashtag", icon: faHashtag,          kind: "layer", drawer: "ig-tags" },
    { key: "ig-calendar", label: "行事曆",  icon: faCalendarDays,     kind: "layer", drawer: "ig-calendar" },
  ],
  "L4-linkedin": [
    { key: "li-history",  label: "貼文",    icon: faNewspaper,        kind: "layer", drawer: "li-history" },
    { key: "li-personal", label: "個人品牌", icon: faUserTie,         kind: "layer", drawer: "li-personal" },
    { key: "li-leads",    label: "Lead 表",  icon: faAddressBook,     kind: "layer", drawer: "li-leads" },
    { key: "li-calendar", label: "行事曆",  icon: faCalendarDays,     kind: "layer", drawer: "li-calendar" },
  ],
  "L4-youtube": [
    { key: "yt-videos",   label: "影片庫",   icon: faVideo,           kind: "layer", drawer: "yt-videos" },
    { key: "yt-titles",   label: "標題 A/B", icon: faHeading,         kind: "layer", drawer: "yt-titles" },
    { key: "yt-thumbs",   label: "縮圖",     icon: faImage,           kind: "layer", drawer: "yt-thumbs" },
    { key: "yt-captions", label: "字幕",     icon: faClosedCaptioning, kind: "layer", drawer: "yt-captions" },
  ],
  "L4-pr": [
    { key: "pr-media",    label: "媒體",    icon: faNewspaper,        kind: "layer", drawer: "pr-media" },
    { key: "pr-press",    label: "新聞稿",  icon: faPenToSquare,       kind: "layer", drawer: "pr-press" },
    { key: "pr-kol",      label: "KOL",     icon: faUserGroup,        kind: "layer", drawer: "pr-kol" },
    { key: "pr-pitches",  label: "Pitch",   icon: faEnvelopeOpenText, kind: "layer", drawer: "pr-pitches" },
  ],
  L5: [
    { key: "kpis",        label: "KPI",     icon: faChartLine,         kind: "layer", drawer: "kpis" },
    { key: "budget",      label: "預算",    icon: faMoneyBillWave,    kind: "layer", drawer: "budget" },
    { key: "gantt",       label: "甘特圖",  icon: faDiagramProject,   kind: "layer", drawer: "gantt" },
    { key: "risks",       label: "風險",    icon: faTriangleExclamation, kind: "layer", drawer: "risks" },
  ],
  L6: [
    { key: "monitor",     label: "監測",    icon: faChartArea,         kind: "layer", drawer: "monitor" },
    { key: "audits",      label: "Audit",   icon: faClipboardCheck,    kind: "layer", drawer: "audits" },
    { key: "incidents",   label: "事件",    icon: faBell,              kind: "layer", drawer: "incidents" },
    { key: "benchmarks",  label: "對標",    icon: faRankingStar,       kind: "layer", drawer: "benchmarks" },
  ],
};

/**
 * Resolve which rail items to render given the active layer + channel.
 * Falls back to global-only rail when no layer context is set yet
 * (e.g. landing on the picker without a squad selected).
 */
function resolveRailItems(layer: MosLayer | null, channel: string | null): RailItem[] {
  let middle: RailItem[] = [];
  if (layer === "L4" && channel && LAYER_RAIL[`L4-${channel}`]) {
    middle = LAYER_RAIL[`L4-${channel}`];
  } else if (layer && LAYER_RAIL[layer]) {
    middle = LAYER_RAIL[layer];
  }
  return [...RAIL_TOP, ...middle, ...RAIL_BOTTOM];
}

const CHANNEL_OPTIONS: Array<{ key: string; label: string; icon: any }> = [
  { key: "facebook",  label: "Facebook",  icon: faFacebook    },
  { key: "instagram", label: "Instagram", icon: faInstagram   },
  { key: "linkedin",  label: "LinkedIn",  icon: faLinkedin    },
  { key: "youtube",   label: "YouTube",   icon: faYoutube     },
  { key: "pr",        label: "公關",      icon: faNewspaper   },
  { key: "email",     label: "電子報",    icon: faEnvelope    },
];

/**
 * Channel match aliases — squads tag themselves with various spellings.
 * Tests against squad.workspace[] (string[]), squad.tags[], slug, and name.
 */
const CHANNEL_ALIASES: Record<string, string[]> = {
  facebook:  ["facebook", "fb", "meta-fb", "fb-page", "fb-ads"],
  instagram: ["instagram", "ig", "ig-reels", "ig-feed"],
  linkedin:  ["linkedin", "li", "linkedin-post"],
  youtube:   ["youtube", "yt", "shorts", "yt-shorts"],
  pr:        ["pr", "public-relations", "media-relations", "press"],
  email:     ["email", "edm", "newsletter", "mailer"],
};

const LAYER_OPTIONS: MosLayer[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

/**
 * Lightweight zh↔en synonym expander for the picker search bar.
 *
 * The squad corpus mixes Chinese names with English seed metadata
 * (methodology author, tags, outputFormats). A user typing "貼文"
 * should also match "post", "content", "social-media"; "廣告" should
 * match "ad", "ads", "advertising"; etc. We do this by looking up the
 * raw query term in a small alias map and OR-ing the expansions.
 */
const SEARCH_SYNONYMS: Array<string[]> = [
  ["貼文", "po文", "post", "posts", "content", "social-media", "social media"],
  ["文案", "copy", "copywriting", "copywrite", "ad copy"],
  ["廣告", "ad", "ads", "advertising", "paid", "paid-ads", "campaign-ads"],
  ["影片", "短影音", "影音", "video", "reels", "shorts", "tiktok"],
  ["品牌", "brand", "branding", "brand-positioning"],
  ["定位", "positioning"],
  ["上市", "發表", "上線", "發佈", "launch", "launching", "go-to-market", "gtm"],
  ["受眾", "客群", "audience", "persona", "icp", "segmentation"],
  ["公關", "媒體", "pr", "public-relations", "press", "media-relations"],
  ["電子報", "edm", "email", "newsletter", "mailer"],
  ["互動", "engagement", "engage"],
  ["故事", "說故事", "敘事", "story", "storytelling", "narrative"],
  ["分析", "research", "analysis", "audit"],
  ["策略", "strategy", "strategic"],
  ["活動", "campaign", "event"],
  ["驗證", "validation", "audit", "scorecard", "monitor"],
  ["創意", "創作", "creative"],
];

function expandSynonyms(q: string): string[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out = new Set<string>([ql]);
  for (const group of SEARCH_SYNONYMS) {
    if (group.some((g) => ql.includes(g.toLowerCase()) || g.toLowerCase().includes(ql))) {
      for (const g of group) out.add(g.toLowerCase());
    }
  }
  return [...out];
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function PickerWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { lang } = useLang();

  const initialWorkspace = params.get("workspace");
  const initialLayer = params.get("layer") as MosLayer | null;
  const seedTitle = params.get("title") ?? "";
  const initialSlug = params.get("slug");
  const initialMissionId = params.get("mission");

  // Active mission — when set, right pane shows WorkflowRunner instead of
  // SquadDetailPanel. Set on launch (or rehydrated from /picker?mission=).
  const [activeMissionId, setActiveMissionId] = useState<number | null>(
    initialMissionId ? Number(initialMissionId) : null,
  );

  // ── Scope context (brand × product × event) ────────────────────────
  // Picker lives outside ShellLayout so it doesn't get the shared context.
  // We use the same useScopeState hook that ShellLayout uses, which is
  // backed by localStorage (sowork.scope.*) — so /picker stays in sync
  // with the rest of the app without explicit prop drilling.
  const [scope, setScope] = useScopeState();
  const brandId = scope.brandId;

  const brandsQuery = (trpc as any).brand?.listByMember?.useQuery
    ? (trpc as any).brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const brands: any[] = (brandsQuery.data as any[]) ?? [];

  // Setter that ScopeBar uses internally — writes brandId only, mimics
  // legacy behavior (clear product/event when explicitly switching brand).
  const setBrandId = (id: number | null) => {
    setScope({ brandId: id, productId: null, eventId: null });
  };
  // Auto-pick first brand once list loads (only if no scope is set yet).
  useEffect(() => {
    if (!scope.brandId && !scope.productId && !scope.eventId && brands.length > 0) {
      setBrandId(brands[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands.length]);

  // ── Canva-style floating middle column ──────────────────────────────
  // Middle panel can be collapsed so the canvas reclaims that 380px.
  // Persisted across sessions.
  // Middle panel (squad list) defaults to EXPANDED — it's the template
  // gallery and should always be visible like Canva's left panel.
  // Collapse is a temporary "give me more canvas space" action only;
  // we no longer persist it across page loads so users always start with
  // the gallery visible. (CJ direction 2026-05-02: "保持有很多範本")
  const [middleCollapsed, setMiddleCollapsed] = useState<boolean>(false);
  const toggleMiddle = () => {
    setMiddleCollapsed((v) => !v);
  };

  // ── Fullscreen mode (E) ─────────────────────────────────────────────
  // Hide rail + middle entirely; canvas takes the whole stage. Toggled
  // by a button on the header and by the F / Esc keys.
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when user is typing
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFullscreen((v) => !v);
      } else if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Rail always starts on "templates" — that's the primary browsing mode.
  // The rail key here tracks WHICH rail item is active. When kind=global
  // and key=templates, the middle column shows the squad list. When
  // kind=layer, it shows the asset drawer for that layer item.
  const [activeRailKey, setActiveRailKey] = useState<string>("templates");
  const [layerFilter, setLayerFilter] = useState<MosLayer | "ALL">(
    initialLayer && LAYER_OPTIONS.includes(initialLayer) ? initialLayer : "ALL",
  );
  const [channelFilter, setChannelFilter] = useState<string>(initialWorkspace ?? "all");
  const [q, setQ] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);

  // Mission brief — local state for the new 3-col detail panel.
  const [missionTitle, setMissionTitle] = useState<string>(seedTitle);
  const [missionBrief, setMissionBrief] = useState<string>("");
  // Per-step agent notes — wired into createMission description on launch.
  const [agentNotes, setAgentNotes] = useState<Record<number, string>>({});
  // Reset notes when user picks a different squad.
  useEffect(() => { setAgentNotes({}); }, [selectedSlug]);

  // ── Data ────────────────────────────────────────────────────────────
  // Task catalog — curated front-door. CJ direction 2026-05-02:
  // include both active AND coming_soon so anything just-built is
  // findable in the picker (active = 一鍵跑, coming_soon = 預覽 / 投票).
  const taskCatalogQuery = (trpc as any).taskCatalog?.listForPicker?.useQuery
    ? (trpc as any).taskCatalog.listForPicker.useQuery(
        { includeComingSoon: true },
        { refetchOnWindowFocus: false },
      )
    : { data: [] };
  const catalogTasks: any[] = (taskCatalogQuery.data as any[]) ?? [];

  // Coming-soon tasks for the "🔮 即將推出" drawer.
  const comingSoonQuery = (trpc as any).taskCatalog?.listComingSoon?.useQuery
    ? (trpc as any).taskCatalog.listComingSoon.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const comingSoonTasks: any[] = (comingSoonQuery.data as any[]) ?? [];

  const upvoteMutation = (trpc as any).taskCatalog?.upvote?.useMutation?.({
    onSuccess: () => { comingSoonQuery.refetch?.(); },
  }) ?? null;

  const runAtomicMutation: any = (trpc as any).taskCatalog?.runAtomic?.useMutation?.()
    ?? { mutateAsync: async () => null, isPending: false };

  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [atomicResult, setAtomicResult] = useState<any | null>(null);
  const [atomicError, setAtomicError] = useState<string | null>(null);

  const squadsQuery = (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: 0 },
        { refetchOnWindowFocus: false },
      )
    : { data: [] };

  const allSquads: any[] = useMemo(
    () => ((squadsQuery.data as any[]) ?? []).filter(
      (s) => Array.isArray(s.steps) && s.steps.length > 0,
    ),
    [squadsQuery.data],
  );

  // Recent missions — drives the 最近使用的方法論 section.
  const recentMissionsQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };

  /** Build "recently used" squad list from the user's mission history. */
  const recentSquads: any[] = useMemo(() => {
    const missions = (recentMissionsQuery.data as any[]) ?? [];
    const slugOrder: string[] = [];
    const seen = new Set<string>();
    for (const m of missions) {
      const slug = m.squadSlug;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      slugOrder.push(slug);
    }
    const bySlug = new Map(allSquads.map((s) => [s.slug, s]));
    return slugOrder
      .map((sl) => bySlug.get(sl))
      .filter(Boolean);
  }, [recentMissionsQuery.data, allSquads]);

  /** Brand-saved / user-ingested squads — the 品牌範本 section.
   *  source: "ingested" or "forked" → user-created; "seeded" → built-in. */
  const brandTemplates: any[] = useMemo(
    () => allSquads.filter((s) => s.source && s.source !== "seeded"),
    [allSquads],
  );

  // ── Filter pipeline ─────────────────────────────────────────────────
  // Predicate: keeps a squad if it passes the active layer + channel
  // filters. Reused for "all results", "recently used", and
  // "brand templates" so each section honors the same scope.
  const passesFacets = (s: any): boolean => {
    if (layerFilter !== "ALL") {
      const lk = (s.strategyLayer ?? "").toString().slice(0, 2);
      if (lk !== layerFilter) return false;
    }
    if (channelFilter !== "all") {
      const aliases = CHANNEL_ALIASES[channelFilter] ?? [channelFilter];
      const wsArr = Array.isArray(s.workspace) ? s.workspace : (s.workspace ? [s.workspace] : []);
      const tagArr = Array.isArray(s.tags) ? s.tags : [];
      const channelHaystack = [
        ...wsArr,
        ...tagArr,
        s.slug,
        pickLocaleText(s.name, "en"),
        pickLocaleText(s.name, "zh-TW"),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!aliases.some((a) => channelHaystack.includes(a))) return false;
    }
    return true;
  };

  // Catalog filter — naive substring match against name/keywords/description.
  // Channel facet uses workspace field directly.
  const filteredCatalog = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return catalogTasks.filter((t: any) => {
      // Channel facet
      if (channelFilter !== "all") {
        const aliases = CHANNEL_ALIASES[channelFilter] ?? [channelFilter];
        if (!aliases.some((a) => String(t.workspace ?? "").toLowerCase().includes(a))) return false;
      }
      // Query
      if (!ql) return true;
      const hay = [
        t.name_zh, t.name_en, t.description,
        t.search_keywords, t.workspace, t.category,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(ql);
    });
  }, [catalogTasks, q, channelFilter]);

  // Click handler — route by impl_kind. squad → existing flow.
  // atomic → call taskCatalog.runAtomic with active scope, show result modal.
  const onCatalogClick = async (t: any) => {
    if (t.impl_kind === "squad" && t.squad_slug) {
      setSelectedSlug(t.squad_slug);
      return;
    }
    if (t.impl_kind === "atomic") {
      setAtomicResult({ pending: true, task: t });
      setAtomicError(null);
      try {
        const res = await runAtomicMutation.mutateAsync({
          taskId: t.id,
          scopeBrandId:   scope.brandId   ?? null,
          scopeProductId: scope.productId ?? null,
          scopeEventId:   scope.eventId   ?? null,
          userInput: "",
        });
        setAtomicResult({ pending: false, task: t, ...res });
      } catch (e: any) {
        setAtomicError(e?.message ?? String(e));
        setAtomicResult({ pending: false, task: t, ok: false });
      }
    }
  };

  // PR6 — score-based ranking using shared search lib.
  // When query is non-empty, results are score-ranked (best match first).
  // When query is empty, fall back to facet-only filter (original order).
  const searchResult = useMemo(() => searchAndRankSquads(allSquads, q), [allSquads, q]);
  const bestMatchSlugs = useMemo(
    () => new Set(searchResult.hits.filter((h) => h.isBestMatch).map((h) => h.squad.slug)),
    [searchResult],
  );
  const filtered = useMemo(() => {
    const ql = q.trim();
    if (ql) {
      // Score-ranked path — facets still apply but ranking trumps order
      return searchResult.hits.map((h) => h.squad).filter(passesFacets);
    }
    // No query — original facet-only filter, original order
    return allSquads.filter(passesFacets);
  }, [allSquads, q, searchResult, layerFilter, channelFilter]);

  const selectedSquad = useMemo(
    () => filtered.find((s) => s.slug === selectedSlug)
      ?? allSquads.find((s) => s.slug === selectedSlug)
      ?? null,
    [filtered, allSquads, selectedSlug],
  );

  // ── Auto-select first squad when filter changes & nothing chosen
  useEffect(() => {
    if (!selectedSlug && filtered.length > 0) {
      setSelectedSlug(filtered[0].slug);
    }
  }, [filtered, selectedSlug]);

  // ── Mission creation ────────────────────────────────────────────────
  const createMission = trpc.mission.create.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launchSquad = async (sq: any) => {
    setError(null);
    setBusy(true);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || channelFilter || "";

      // Build description: user brief + per-step agent notes appended as a
      // markdown section so WorkflowRunner picks them up via the existing
      // mission.description prompt path. No backend schema change needed.
      const baseDesc = missionBrief.trim() || safeLocalizedText(sq.description, lang) || "";
      const steps: any[] = Array.isArray(sq.steps) ? sq.steps : [];
      const noteLines = steps
        .map((step, i) => {
          const txt = (agentNotes[i] ?? "").trim();
          if (!txt) return null;
          const agent = step.assignedAgentName ?? step.owner ?? `Step ${i + 1}`;
          const stepName = step.name ?? step.title ?? `Step ${i + 1}`;
          return `- **${stepName}**（${agent}）：${txt}`;
        })
        .filter(Boolean);
      const description = noteLines.length
        ? `${baseDesc}\n\n## 給 agent 的備註\n${noteLines.join("\n")}`.trim()
        : (baseDesc || undefined);

      const res = await createMission.mutateAsync({
        title: missionTitle.trim() || seedTitle || pickLocaleText(sq.name, lang) || sq.slug,
        description,
        squadSlug: sq.slug,
        workspace: ws,
        brandId: brandId ?? undefined,
        brandName: brands.find((b: any) => b.id === brandId)?.name,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      // In-place launch — swap right pane to WorkflowRunner. Persist
      // mission id in URL so refresh / share-link rehydrates the runner.
      const missionId = Number(res.id);
      setActiveMissionId(missionId);
      const next = new URLSearchParams(params);
      next.set("mission", String(missionId));
      next.set("slug", sq.slug);
      setParams(next, { replace: true });
      setBusy(false);
    } catch (e: any) {
      setError(`啟動失敗：${e?.message ?? String(e)}`);
      setBusy(false);
    }
  };

  // ── Pretty channel/layer titles for header ──────────────────────────
  const headerTitle = (() => {
    if (channelFilter !== "all") {
      const c = CHANNEL_OPTIONS.find((x) => x.key === channelFilter);
      return c ? `挑選方法論 — ${c.label}` : "挑選方法論";
    }
    if (layerFilter !== "ALL") {
      return `挑選方法論 — ${layerFilter}・${LAYER_TOKENS[layerFilter].label}`;
    }
    return "挑選方法論";
  })();

  // Sync URL when filter changes (so refresh / share-link works)
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (channelFilter !== "all") next.set("workspace", channelFilter); else next.delete("workspace");
    if (layerFilter !== "ALL") next.set("layer", layerFilter); else next.delete("layer");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, layerFilter]);

  // ── Effective layer/channel for rail (layer-aware design 2026-04-27) ──
  // Priority for resolving the rail's layer band:
  //   1. Active squad's strategy_layer (highest — user has committed to one)
  //   2. layerFilter if locked (URL ?layer=L1 or pill click)
  //   3. null → rail collapses to global-only (top + bottom bands)
  // For L4 we additionally need the channel to pick the right sub-rail
  // (FB vs IG vs LI vs YT vs PR).
  const effectiveLayer: MosLayer | null = useMemo(() => {
    if (selectedSquad?.strategyLayer) {
      const lk = String(selectedSquad.strategyLayer).slice(0, 2) as MosLayer;
      if (LAYER_OPTIONS.includes(lk)) return lk;
    }
    if (layerFilter !== "ALL") return layerFilter;
    return null;
  }, [selectedSquad, layerFilter]);

  const effectiveChannel: string | null = useMemo(() => {
    if (channelFilter !== "all") return channelFilter;
    // Try to detect from squad's workspace[]
    if (selectedSquad?.workspace?.length) {
      for (const [key, aliases] of Object.entries(CHANNEL_ALIASES)) {
        if (selectedSquad.workspace.some((w: string) =>
          aliases.some((a) => String(w).toLowerCase().includes(a))
        )) return key;
      }
    }
    return null;
  }, [channelFilter, selectedSquad]);

  /** Currently visible rail items (top + layer-specific middle + bottom). */
  const railItems = useMemo(
    () => resolveRailItems(effectiveLayer, effectiveChannel),
    [effectiveLayer, effectiveChannel],
  );

  /** The rail item the user has clicked into. Drives middle column mode. */
  const activeRailItem = useMemo(
    () => railItems.find((it) => it.key === activeRailKey) ?? railItems[0],
    [railItems, activeRailKey],
  );

  // If the rail config changes (e.g. squad swap moves us to a different
  // layer) and the previously active key disappears, snap back to 範本 so
  // the middle column doesn't render an orphan empty drawer.
  useEffect(() => {
    if (!railItems.find((it) => it.key === activeRailKey)) {
      setActiveRailKey("templates");
    }
  }, [railItems, activeRailKey]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* ── Top header ───────────────────────────────────────────────── */}
      {!fullscreen && (
      <header className="h-12 flex items-center justify-between px-3 border-b border-divider bg-content1 shrink-0">
        <Button
          size="sm"
          variant="light"
          radius="sm"
          onPress={() => { if (window.history.length > 1) window.history.back(); else window.close(); }}
          startContent={<FontAwesomeIcon icon={faArrowLeft} />}
          className="text-tiny"
        >
          返回
        </Button>
        <div className="font-semibold text-small text-foreground truncate px-4">
          {headerTitle}
        </div>
        <div className="flex items-center gap-2">
          {/* Full 3-tier scope picker (brand × product × event) per CJ
              direction 2026-04-29 — replaces the brand-only switcher so
              /picker matches the global ShellLayout header. */}
          <ScopeBar scope={scope} setScope={setScope} />
          <Tooltip content="進入專注模式 (F)" placement="bottom" radius="sm">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              radius="sm"
              onPress={() => setFullscreen(true)}
              aria-label="進入專注模式"
            >
              <FontAwesomeIcon icon={faExpand} />
            </Button>
          </Tooltip>
        </div>
      </header>
      )}

      {/* ── Body: Canva-style floating layout ─────────────────────────
          The canvas (right pane) is the only **fixed** layout child —
          it always occupies the full body width minus the rail. The
          middle column is **absolutely positioned** on top of it and
          can be slide-collapsed to give the canvas all the space.
          Fullscreen mode hides BOTH rail and middle. */}
      <div className="flex-1 min-h-0 relative">
        {/* Icon rail — layer-aware. Top "範本" + layer-specific middle band
            (varies per active squad's strategy_layer) + bottom global tools.
            A thin separator between bands so the user can see the structure. */}
        {!fullscreen && (
        <aside className="absolute left-0 top-0 bottom-0 w-[68px] z-30 border-r border-divider bg-content1 flex flex-col items-stretch py-2">
          {railItems.map((it, i) => {
            const active = activeRailKey === it.key;
            const prev = railItems[i - 1];
            const showSeparatorAbove = !!prev && prev.kind !== it.kind;
            return (
              <React.Fragment key={it.key}>
                {showSeparatorAbove && (
                  <div className="mx-3 my-1 border-t border-divider/60" />
                )}
                <Tooltip content={it.label} placement="right" radius="sm" delay={150}>
                  <button
                    onClick={() => setActiveRailKey(it.key)}
                    aria-label={it.label}
                    className={[
                      "h-14 mx-1 my-0.5 rounded-medium flex flex-col items-center justify-center gap-0.5 transition",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-default-100",
                    ].join(" ")}
                  >
                    <FontAwesomeIcon icon={it.icon} className="text-medium leading-none" />
                    <span className="text-tiny tracking-[0.06em]">{it.label}</span>
                  </button>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </aside>
        )}

        {/* Middle column — squad list (default) OR asset drawer when a
            layer-specific rail item is active. Drawers ship as placeholders
            until the underlying asset tables land in later sprints.
            FLOATING (Canva-style): absolute positioned over the canvas,
            slide-collapses to expose the canvas underneath. */}
        {!fullscreen && (
        <section
          className={[
            "absolute top-0 bottom-0 z-20 border-r border-divider bg-content1 flex flex-col min-h-0 shadow-[2px_0_8px_rgba(0,0,0,0.04)] transition-transform duration-200",
            middleCollapsed ? "-translate-x-full" : "translate-x-0",
          ].join(" ")}
          style={{ left: 68, width: 380 }}
        >
          {/* Collapse handle on the right edge — Canva-style */}
          <Tooltip content={middleCollapsed ? "顯示方法論清單" : "暫時隱藏清單（讓出畫布空間）"} placement="right" radius="sm">
            <button
              onClick={toggleMiddle}
              aria-label={middleCollapsed ? "展開" : "收合"}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-content1 border border-divider rounded-r-medium shadow flex items-center justify-center text-default-500 hover:text-foreground hover:bg-content2 transition"
              style={{ boxShadow: "1px 1px 4px rgba(0,0,0,0.06)" }}
            >
              <FontAwesomeIcon icon={middleCollapsed ? faChevronRight : faChevronLeft} className="text-tiny" />
            </button>
          </Tooltip>
          {activeRailItem?.kind === "layer" ? (
            <LayerAssetDrawer
              item={activeRailItem}
              scope={scope}
              onBackToTemplates={() => setActiveRailKey("templates")}
            />
          ) : activeRailKey === "brand" ? (
            <BrandDrawer scope={scope} onBackToTemplates={() => setActiveRailKey("templates")} />
          ) : activeRailKey === "recent" ? (
            <RecentDrawer scope={scope} onBackToTemplates={() => setActiveRailKey("templates")} />
          ) : activeRailKey === "upload" ? (
            <UploadDrawer scope={scope} onBackToTemplates={() => setActiveRailKey("templates")} />
          ) : activeRailKey === "members" ? (
            <MembersDrawer onBackToTemplates={() => setActiveRailKey("templates")} />
          ) : (
          <>
          {/* Search + AI generate */}
          <div className="p-3 border-b border-divider">
            <Input
              size="sm"
              radius="full"
              variant="bordered"
              value={q}
              onValueChange={setQ}
              isClearable
              onClear={() => setQ("")}
              placeholder={
                channelFilter !== "all"
                  ? `描述你的 ${CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label ?? ""} 詳細需求…`
                  : layerFilter !== "ALL"
                    ? `描述你的 ${LAYER_TOKENS[layerFilter].label} 詳細需求…`
                    : "描述你的行銷需求或搜尋方法論…"
              }
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
              classNames={{ inputWrapper: "bg-content2", input: "text-small" }}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Tooltip content="AI 推薦方法論（即將推出）" radius="sm">
                <Button
                  size="sm"
                  radius="full"
                  variant="bordered"
                  isDisabled
                  startContent={<span className="text-primary">✦</span>}
                >
                  生成
                </Button>
              </Tooltip>
              <Button
                size="sm"
                radius="full"
                color="primary"
                onPress={() => { (document.activeElement as HTMLElement)?.blur(); }}
              >
                搜尋
              </Button>
            </div>
          </div>

          {/* Sub-filter pill rows are now driven by URL params + locked-filter
              badges below — the layer-aware left rail (2026-04-27) replaced
              the old "channels" / "layers" rail items, so these inline
              RailPill rows were removed. */}
          {/* Locked-filter badges (channel and/or layer). Each is
              dismissable so user can broaden the picker scope. */}
          {(channelFilter !== "all" || layerFilter !== "ALL") && (
            <div className="px-3 pt-2 pb-1 flex items-center flex-wrap gap-1.5">
              {channelFilter !== "all" && (
                <Chip
                  size="sm"
                  radius="full"
                  variant="solid"
                  color="default"
                  onClose={() => setChannelFilter("all")}
                  classNames={{ base: "bg-foreground text-background" }}
                >
                  {CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label ?? channelFilter}
                </Chip>
              )}
              {layerFilter !== "ALL" && (
                <Chip
                  size="sm"
                  radius="full"
                  variant="solid"
                  onClose={() => setLayerFilter("ALL")}
                  style={{ background: LAYER_TOKENS[layerFilter].bg, color: "#fff" }}
                >
                  {layerFilter}・{LAYER_TOKENS[layerFilter].label}
                </Chip>
              )}
            </div>
          )}

          {/* Sectioned thumbnails — Canva pattern: 最近使用 / 品牌範本 / 所有結果.
              Recently-used and brand-templates sections hide while a search
              query is active so the user sees a single relevance-ranked
              "所有結果" list. */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {squadsQuery.isLoading ? (
              <div className="text-small text-default-500 py-6 text-center">載入中…</div>
            ) : (
              <>
                {/* ── 0. 任務目錄 (新前門 — task_catalog active items) ── */}
                <ThumbSection
                  title={q ? `任務目錄符合（${filteredCatalog.length}）` : "任務目錄 — 精選"}
                  onCta={comingSoonTasks.length > 0 ? () => setComingSoonOpen(true) : undefined}
                  ctaLabel={comingSoonTasks.length > 0 ? `🔮 即將推出（${comingSoonTasks.length}）` : undefined}
                >
                  {filteredCatalog.length === 0 ? (
                    <div className="text-tiny text-default-500 py-3 text-center">
                      {q ? `目錄裡沒有「${q}」相關任務` : "此分類目前無啟用任務"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCatalog.map((t: any) => (
                        <CatalogTaskCard
                          key={`task-${t.id}`}
                          task={t}
                          active={t.impl_kind === "squad" && selectedSlug === t.squad_slug}
                          onClick={() => onCatalogClick(t)}
                        />
                      ))}
                    </div>
                  )}
                </ThumbSection>

                {/* ── 1. 最近使用的方法論 (hidden while searching) ── */}
                {!q && (() => {
                  const items = recentSquads.filter(passesFacets).slice(0, 4);
                  if (items.length === 0) return null;
                  return (
                    <ThumbSection
                      title="最近使用的方法論"
                      onCta={() => navigate("/")}
                      ctaLabel="查看全部"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {items.map((sq) => (
                          <SquadMiniCard
                            key={`recent-${sq.id ?? sq.slug}`}
                            squad={sq}
                            active={selectedSlug === sq.slug}
                            onClick={() => setSelectedSlug(sq.slug)}
                            lang={lang}
                          />
                        ))}
                      </div>
                    </ThumbSection>
                  );
                })()}

                {/* ── 2. 品牌範本 (hidden while searching) ── */}
                {!q && (() => {
                  const items = brandTemplates.filter(passesFacets);
                  return (
                    <ThumbSection title="品牌範本">
                      {items.length > 0 ? (
                        <div className="space-y-2">
                          {items.slice(0, 3).map((sq) => (
                            <SquadThumb
                              key={`brand-${sq.id ?? sq.slug}`}
                              squad={sq}
                              active={selectedSlug === sq.slug}
                              onClick={() => setSelectedSlug(sq.slug)}
                              lang={lang}
                            />
                          ))}
                        </div>
                      ) : (
                        <Card shadow="none" radius="lg" className="border border-divider">
                          <CardBody className="p-3 flex flex-row items-start gap-3">
                            <div className="w-12 h-12 shrink-0 border border-divider rounded-medium flex items-center justify-center text-default-400 text-xl">
                              +
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-small font-semibold text-foreground">
                                發佈為品牌範本
                              </div>
                              <div className="text-tiny text-default-500 leading-snug mt-0.5">
                                完成此設計後，你可以將其變成可重複使用的範本。
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      )}
                    </ThumbSection>
                  );
                })()}

                {/* ── 3. 所有結果 ── */}
                <ThumbSection
                  title={q ? `搜尋結果（${filtered.length}）` : "所有結果"}
                >
                  {filtered.length === 0 ? (
                    <div className="text-small text-default-500 py-6 text-center px-4">
                      {q ? `沒有找到符合「${q}」的方法論。` : "這個分類目前沒有方法論。"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((sq) => (
                        <SquadThumb
                          key={sq.id ?? sq.slug}
                          squad={sq}
                          active={selectedSlug === sq.slug}
                          onClick={() => setSelectedSlug(sq.slug)}
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </ThumbSection>
              </>
            )}
          </div>
          </>
          )}
        </section>
        )}

        {/* Right pane — canvas / detail / runner.
            Always full-width from rail to right edge; the middle column
            floats over the left edge of this. In fullscreen, it covers
            the whole body. */}
        <section
          className="absolute top-0 right-0 bottom-0 z-10 bg-background flex flex-col min-h-0"
          style={{ left: fullscreen ? 0 : (middleCollapsed ? 68 : 448) }}
        >
          {/* Fullscreen exit */}
          {fullscreen && (
            <Tooltip content="退出專注模式 (Esc / F)" placement="left" radius="sm">
              <Button
                isIconOnly
                size="sm"
                radius="full"
                variant="bordered"
                onPress={() => setFullscreen(false)}
                className="absolute top-3 right-3 z-40 bg-content1"
                aria-label="退出專注模式"
              >
                <FontAwesomeIcon icon={faCompress} />
              </Button>
            </Tooltip>
          )}
          {selectedSquad ? (
            <div className="flex-1 min-h-0">
              <SquadDetailPanel
                squad={selectedSquad}
                busy={busy}
                error={error}
                onLaunch={() => launchSquad(selectedSquad)}
                lang={lang}
                workspace={effectiveChannel}
                missionTitle={missionTitle}
                setMissionTitle={setMissionTitle}
                missionBrief={missionBrief}
                setMissionBrief={setMissionBrief}
                agentNotes={agentNotes}
                setAgentNotes={setAgentNotes}
                brandName={brands.find((b: any) => b.id === brandId)?.name ?? null}
                missionId={activeMissionId}
                onMissionEnd={() => {
                  setActiveMissionId(null);
                  const next = new URLSearchParams(params);
                  next.delete("mission");
                  setParams(next, { replace: true });
                }}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-10">
              <div className="text-center max-w-[420px]">
                <div className="text-5xl mb-4 text-default-400">▣</div>
                <h2 className="font-semibold text-xl text-foreground mb-2">
                  從左側挑一個方法論小組來開始
                </h2>
                <p className="text-small text-default-500 leading-relaxed">
                  每個方法論都附帶完整的工作步驟與 AI 專員陣容，點擊 → 預覽 → 啟動。
                </p>
              </div>
            </div>
          )}
        </section>

        {/* "Reopen middle" tab — surfaces when middle is collapsed but
            we're not in fullscreen, so the user can pop the panel back. */}
        {!fullscreen && middleCollapsed && (
          <Tooltip content="展開方法論清單" placement="right" radius="sm">
            <button
              onClick={toggleMiddle}
              aria-label="展開方法論清單"
              className="absolute z-30 top-1/2 -translate-y-1/2 w-6 h-12 bg-content1 border border-divider rounded-r-medium shadow flex items-center justify-center text-default-500 hover:text-foreground hover:bg-content2 transition"
              style={{ left: 68, boxShadow: "1px 1px 4px rgba(0,0,0,0.06)" }}
            >
              <FontAwesomeIcon icon={faChevronRight} className="text-tiny" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Coming-soon drawer — task_catalog status='coming_soon' rows */}
      <ComingSoonDrawer
        isOpen={comingSoonOpen}
        onClose={() => setComingSoonOpen(false)}
        tasks={comingSoonTasks}
        onUpvote={(id) => upvoteMutation?.mutateAsync({ id })}
      />

      {/* Atomic-task result modal */}
      <AtomicResultModal
        isOpen={!!atomicResult}
        onClose={() => { setAtomicResult(null); setAtomicError(null); }}
        result={atomicResult}
        error={atomicError}
      />
    </div>
  );
}

/* ─────────────────────────── Sub: pill ─────────────────────────── */

function RailPill({
  active, onClick, children, dot,
}: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-tiny rounded-full border transition",
        active
          ? "bg-foreground text-white border-foreground"
          : "bg-white text-foreground border-divider hover:border-foreground",
      ].join(" ")}
    >
      {dot && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: active ? "#fff" : dot }} />}
      {children}
    </button>
  );
}

/* ─────────────────────────── Sub: ThumbSection ─────────────────────────── */

function ThumbSection({
  title, children, onCta, ctaLabel,
}: {
  title: string;
  children: React.ReactNode;
  onCta?: () => void;
  ctaLabel?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h3 className="text-small font-semibold text-foreground">{title}</h3>
        {onCta && ctaLabel && (
          <Button
            size="sm"
            variant="light"
            radius="sm"
            onPress={onCta}
            className="text-tiny h-6 min-w-0 px-2 text-default-500"
          >
            {ctaLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────── Sub: CatalogTaskCard ─────────────────────────── */
/**
 * Front-door card for a curated task_catalog row.
 *
 * CJ direction 2026-05-02: surface BOTH status='active' AND 'coming_soon'
 * so just-built tasks are findable. coming_soon items are still clickable
 * (CJ wants to test) but visibly badged so users know they're preview.
 */
function CatalogTaskCard({
  task, active, onClick,
}: {
  task: any;
  active: boolean;
  onClick: () => void;
}) {
  const isSquad = task.impl_kind === "squad";
  const isComingSoon = task.status === "coming_soon";
  const boundLabel = isSquad
    ? (task.squad_name ?? (task.squad_id ? `squad #${task.squad_id}` : "（squad 未綁）"))
    : (task.agent_name ?? (task.agent_id ? `agent #${task.agent_id}` : "（agent 未綁）"));
  // Disable click ONLY when coming_soon AND has no underlying squad/agent
  // (so we can't actually run anything). Otherwise let CJ click and test.
  const canRun = isSquad ? !!task.squad_id : !!task.agent_id;
  const disabled = !canRun;
  return (
    <Card
      isPressable={!disabled}
      shadow="none"
      radius="lg"
      onPress={!disabled ? onClick : undefined}
      className={`w-full text-left ${active ? "border-primary bg-primary-50" : "border-divider"} border ${disabled ? "opacity-60" : ""}`}
    >
      <CardBody className="p-3 gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-small font-semibold truncate">{task.name_zh}</span>
              {/* Status badge — active (上線) vs coming_soon (設計中) */}
              {isComingSoon ? (
                <Chip size="sm" variant="flat" color="warning" className="h-4 text-tiny">
                  🟡 設計中
                </Chip>
              ) : (
                <Chip size="sm" variant="flat" color="success" className="h-4 text-tiny">
                  🟢 上線
                </Chip>
              )}
              <Chip size="sm" variant="flat" color={isSquad ? "primary" : "secondary"} className="h-4 text-tiny">
                {isSquad ? "squad" : "atomic"}
              </Chip>
              {task.bypassable && !isComingSoon && (
                <Chip size="sm" variant="flat" color="success" className="h-4 text-tiny">
                  一鍵跑
                </Chip>
              )}
            </div>
            {task.methodology_label && (
              <p className="text-tiny text-default-500 italic mt-0.5">方法論：{task.methodology_label}</p>
            )}
            <p className="text-tiny text-default-500 line-clamp-2 mt-0.5">{task.description}</p>
            <div className="flex items-center gap-2 mt-1 text-tiny text-default-400">
              <span>由 {boundLabel}</span>
              {task.estimated_minutes && <span>· 約 {task.estimated_minutes} 分鐘</span>}
              {disabled && <span className="text-warning">· squad/agent 尚未綁定</span>}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Sub: ComingSoonDrawer ─────────────────────────── */
/**
 * Modal showing coming_soon task_catalog items, sorted by upvotes desc.
 * "+1 我也想要" button calls upvote mutation. CJ uses the upvote count
 * as a priority signal for what to build next.
 */
function ComingSoonDrawer({
  isOpen, onClose, tasks, onUpvote,
}: {
  isOpen: boolean;
  onClose: () => void;
  tasks: any[];
  onUpvote: (id: number) => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <p className="text-tiny text-default-500 uppercase tracking-wider">即將推出</p>
          <h2 className="text-medium font-semibold">🔮 候選任務 — 投票決定下一個做哪個</h2>
          <p className="text-tiny text-default-500">
            按 +1 表示你想要這個任務。SoWork 依得票數決定建立順序。
          </p>
        </ModalHeader>
        <ModalBody className="gap-2">
          {tasks.length === 0 ? (
            <p className="text-small text-default-500 py-6 text-center">目前沒有候選任務</p>
          ) : (
            tasks.map((t: any) => (
              <Card key={t.id} shadow="none" className="border border-divider">
                <CardBody className="p-3 flex flex-row items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-small font-semibold">{t.name_zh}</span>
                      <Chip size="sm" variant="flat" className="h-4 text-tiny">{t.workspace}</Chip>
                      <Chip size="sm" variant="flat" className="h-4 text-tiny">{t.category}</Chip>
                    </div>
                    <p className="text-tiny text-default-500 mt-1">{t.description}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="bordered"
                      onPress={() => onUpvote(t.id)}
                      className="min-w-0 px-2"
                    >
                      +1 我也想要
                    </Button>
                    <span className="text-tiny text-default-400">{t.upvotes ?? 0} 票</span>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>關閉</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ─────────────────────────── Sub: AtomicResultModal ─────────────────────────── */
/**
 * Result viewer for atomic-task runs. Shows the agent's output as
 * editable text (so user can fix things on the spot before copying).
 * Atomic tasks have no DB row — this is in-memory only. Closing
 * discards.
 */
function AtomicResultModal({
  isOpen, onClose, result, error,
}: {
  isOpen: boolean;
  onClose: () => void;
  result: any | null;
  error: string | null;
}) {
  const [editBuffer, setEditBuffer] = useState("");
  React.useEffect(() => {
    if (result?.output) setEditBuffer(result.output);
  }, [result?.output]);
  if (!result) return null;
  const t = result.task ?? {};
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <p className="text-tiny text-default-500 uppercase tracking-wider">ATOMIC TASK</p>
          <h2 className="text-medium font-semibold">{t.name_zh}</h2>
          {result.agent && (
            <p className="text-tiny text-default-500">
              由 {result.agent.name}（{result.agent.title ?? ""}）交付
              {result.durationMs != null && ` · ${(result.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
        </ModalHeader>
        <ModalBody className="gap-3">
          {result.pending ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Spinner size="sm" />
              <span className="text-small text-default-500">agent 思考中…</span>
            </div>
          ) : error ? (
            <Card shadow="none" className="border border-danger-200 bg-danger-50">
              <CardBody className="p-3">
                <p className="text-small font-medium text-danger">✗ 執行失敗</p>
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
                  onPress={() => navigator.clipboard.writeText(editBuffer)}
                  startContent={<FontAwesomeIcon icon={faCopy} />}
                >
                  複製到剪貼簿
                </Button>
                {result.rawText && (
                  <details className="ml-auto">
                    <summary className="text-tiny text-default-500 cursor-pointer">View raw（含被清掉的部分）</summary>
                    <pre className="text-tiny bg-default-50 border border-divider rounded-md p-2 mt-1 max-h-[150px] overflow-auto whitespace-pre-wrap">
                      {result.rawText}
                    </pre>
                  </details>
                )}
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>關閉</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ─────────────────────────── Sub: SquadMiniCard (recent grid) ─────────────────────────── */

function SquadMiniCard({
  squad, active, onClick, lang,
}: { squad: any; active: boolean; onClick: () => void; lang: "zh-TW" | "en" }) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;

  return (
    <Card
      isPressable
      isHoverable
      shadow="none"
      radius="md"
      onPress={onClick}
      className={[
        "border transition overflow-hidden",
        active ? "border-foreground shadow-medium" : "border-divider",
      ].join(" ")}
    >
      <div
        className="aspect-[16/10] flex items-center justify-center text-white font-bold text-2xl"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <CardBody className="px-2 py-1.5 gap-1">
        <div className="text-tiny text-foreground line-clamp-1 leading-snug font-medium">{name}</div>
        <TaskChip entity={squad} kind="squad" size="sm" className="h-4" />
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Sub: SquadThumb ─────────────────────────── */

function SquadThumb({
  squad, active, onClick, lang,
}: { squad: any; active: boolean; onClick: () => void; lang: "zh-TW" | "en" }) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const stepCount = Array.isArray(squad.steps) ? squad.steps.length : 0;
  const author = squad.methodology?.author;

  return (
    <Card
      isPressable
      isHoverable
      shadow="none"
      radius="md"
      onPress={onClick}
      className={[
        "w-full border transition",
        active ? "border-foreground shadow-medium" : "border-divider",
      ].join(" ")}
    >
      <CardBody className="p-2.5 flex flex-row items-start gap-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: tone.bg }}
        >
          {(name.charAt(0) || "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-small font-semibold text-foreground line-clamp-1">{name}</div>
          <div className="text-tiny text-default-500 line-clamp-1 mt-0.5">
            {author ? `${author}` : tone.label} · {stepCount} 個步驟
          </div>
          <div className="mt-1.5">
            <TaskChip entity={squad} kind="squad" size="sm" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────── Sub: 3-col Detail panel ────────────────────────
 * PR1 — skeleton:  left brief / middle preview placeholder / right agent
 * orchestra. Mission stays unrun until user hits 派出小組; that swaps the
 * whole right pane to <WorkflowRunner /> (handled upstream).
 */

// Avatar src = agents.avatarUrl when present, else undefined → HeroUI Avatar
// renders the initial-letter fallback (no DiceBear, per design system).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _agentAvatar = (a: { avatarUrl?: string | null }) => a.avatarUrl ?? undefined;

const WORKSPACE_META: Record<string, { label: string; icon: any; brand?: any; mockup: "instagram" | "facebook" | "linkedin" | "youtube" | "generic" }> = {
  instagram: { label: "Instagram", icon: faInstagram, brand: faInstagram, mockup: "instagram" },
  facebook:  { label: "Facebook",  icon: faFacebook,  brand: faFacebook,  mockup: "facebook"  },
  linkedin:  { label: "LinkedIn",  icon: faLinkedin,  brand: faLinkedin,  mockup: "linkedin"  },
  youtube:   { label: "YouTube",   icon: faYoutube,   brand: faYoutube,   mockup: "youtube"   },
  pr:        { label: "公關",       icon: faNewspaper, mockup: "generic" },
  email:     { label: "電子報",     icon: faPodcast,   mockup: "generic" },
};

function SquadDetailPanel({
  squad, busy, error, onLaunch, lang,
  workspace, missionTitle, setMissionTitle, missionBrief, setMissionBrief,
  agentNotes, setAgentNotes, brandName,
  missionId, onMissionEnd,
}: {
  squad: any;
  busy: boolean;
  error: string | null;
  onLaunch: () => void;
  lang: "zh-TW" | "en";
  workspace: string | null;
  missionTitle: string;
  setMissionTitle: (s: string) => void;
  missionBrief: string;
  setMissionBrief: (s: string) => void;
  agentNotes: Record<number, string>;
  setAgentNotes: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  brandName: string | null;
  missionId: number | null;
  onMissionEnd: () => void;
}) {
  // ── Active scope (brand × product × event) — same hook ShellLayout uses,
  // backed by localStorage. Lets stepExecute carry the right context so
  // agents read event positioning, not just brand. (CJ correction 2026-04-30)
  const [scope] = useScopeState();
  // Right-pane baton-strip mode (CJ direction 2026-05-02): show compact
  // agent baton by default, expand a single AgentLiveCard inline only
  // when user clicks. Replaces the always-on per-step grid.
  const [expandedStepIdx, setExpandedStepIdx] = useState<number | null>(null);
  // ── Live progress polling (post-launch) ──────────────────────────────
  // CJ direction 2026-05-02: drop poll frequency from 2s → 10s. The
  // user only needs to know "agents are passing the baton", not see
  // every render frame. 5× backend load reduction (was 7000 reqs/s
  // worst case at 14k users; now 1400). User-triggered actions
  // (confirm / redo / edit) still call refetch() explicitly so the
  // immediate feedback loop is preserved.
  const progressQuery: any = (trpc.squad as any).stepGetProgress?.useQuery
    ? (trpc.squad as any).stepGetProgress.useQuery(
        { missionId: missionId ?? 0 },
        { enabled: !!missionId, refetchInterval: missionId ? 10_000 : false, refetchOnWindowFocus: false },
      )
    : { data: null, refetch: () => Promise.resolve({}) };
  const stepExecute: any = (trpc.squad as any).stepExecute?.useMutation
    ? (trpc.squad as any).stepExecute.useMutation()
    : { mutateAsync: async () => null, isPending: false };

  // Scope-injecting wrapper — every stepExecute call needs to carry the
  // active ScopeBar state so the agent reads brand + product + event
  // positioning, not just the mission's brandId. (CJ correction 2026-04-30:
  // squad was answering with generic Snorlax content because event
  // positioning never reached the prompt.)
  const stepExecuteWithScope = useMemo(() => ({
    ...stepExecute,
    mutateAsync: (args: any) =>
      stepExecute.mutateAsync({
        ...args,
        scopeBrandId:   scope.brandId   ?? null,
        scopeProductId: scope.productId ?? null,
        scopeEventId:   scope.eventId   ?? null,
      }),
  }), [stepExecute, scope.brandId, scope.productId, scope.eventId]);

  const stepProgressList: any[] =
    (progressQuery.data?.steps ?? progressQuery.data ?? []) as any[];
  const progressByOrd = useMemo(() => {
    const m = new Map<number, any>();
    for (const p of stepProgressList) m.set(Number(p.stepOrder ?? p.step_order ?? 0), p);
    return m;
  }, [stepProgressList]);

  // Active step = first step that's not 'confirmed' or 'skipped'.
  const stepsArr: any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const activeStepOrder: number = useMemo(() => {
    for (let i = 0; i < stepsArr.length; i++) {
      const ord = i + 1;
      const p = progressByOrd.get(ord);
      const s = p?.status ?? "pending";
      if (s !== "confirmed" && s !== "skipped") return ord;
    }
    return stepsArr.length; // all done
  }, [stepsArr, progressByOrd]);

  // ── Step-execution error surfacing ────────────────────────────────────
  // Previously the auto-trigger swallowed errors with `.catch(() => {})`,
  // which meant if the LLM call failed (e.g. all providers down) the launch
  // appeared to "hang" — mission row was created, but no draft ever appeared
  // and the user got zero feedback. Now we capture the message into local
  // state and render an Alert so failures are visible + retryable.
  const [stepError, setStepError] = useState<string | null>(null);
  const [autoTriggered, setAutoTriggered] = useState(false);

  // Reset error + auto-trigger flag whenever the mission changes
  useEffect(() => {
    setStepError(null);
    setAutoTriggered(false);
  }, [missionId]);

  // Auto-trigger first step if mission just launched and no progress yet.
  // Fires ONCE per missionId — depending only on `missionId` keeps this
  // effect from re-running every poll tick (which previously caused the
  // visible flicker even though the inner guard was meant to short-circuit).
  useEffect(() => {
    if (!missionId) return;
    // Skip if a row already exists (mission was launched in a previous
    // session, user reopened /picker?mission=…).
    if (stepProgressList.length > 0) return;
    if (stepExecute.isPending) return;
    if (autoTriggered) return;
    setAutoTriggered(true);
    setStepError(null);
    stepExecute
      .mutateAsync({
        missionId,
        squadSlug: squad.slug,
        stepOrder: 1,
        mode: "run",
        userInput: "",
      })
      .then(() => progressQuery.refetch?.())
      .catch((e: any) => {
        const msg = e?.message ?? String(e);
        setStepError(`第一步啟動失敗：${msg}`);
        // Don't reset autoTriggered here — let the user click 重試 to
        // retry. Auto-retrying on every poll tick caused the flicker.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const description = safeLocalizedText(squad.description, lang);
  const author = squad.methodology?.author;
  const year = squad.methodology?.year;
  const steps: any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const members: any[] = Array.isArray(squad.members) ? squad.members : [];
  const wsKey = workspace ?? (Array.isArray(squad.workspace) ? squad.workspace[0] : squad.workspace) ?? null;
  const wsMeta = wsKey ? WORKSPACE_META[wsKey] : null;

  // Inferred mockup variant — drives middle preview & badge
  const mockupVariant: MockupVariant = useMemo(
    () => inferMockupVariant(squad),
    [squad],
  );

  // Sibling variants on the same platform — populates the variant switcher Tabs
  const platformVariants = useMemo(
    () => getVariantsForPlatform(mockupVariant.platform),
    [mockupVariant.platform],
  );

  // ── Detect primary output type from squad steps ───────────────────────
  // If the squad's final meaningful step is a calendar/report/pillar table,
  // show that mockup in the center instead of a single-post PlatformMockup.
  // Priority: check last non-QA step's mockupVariant first.
  const primaryOutputKind: "calendar" | "pillar" | "research" | "qa" | "post" = useMemo(() => {
    const allVariants: string[] = stepsArr
      .map((s: any) => s.mockupVariant ?? "")
      .filter(Boolean);
    if (allVariants.some((v: string) => v.includes("Calendar"))) return "calendar";
    if (allVariants.some((v: string) => v.includes("Pillar")))   return "pillar";
    if (allVariants.some((v: string) => v.includes("Research"))) return "research";
    if (allVariants.every((v: string) => v.includes("QA") || v.includes("Intake"))) return "qa";
    return "post";
  }, [stepsArr]);

  // Left-panel tab state (Canva-style: 詳情 / 方法論)
  const [detailTab, setDetailTab] = useState<"detail" | "method">("detail");

  // Currently expanded agent card (Modal). null when closed.
  const [activeStepIdx, setActiveStepIdx] = useState<number | null>(null);

  // User-overridable preview variant (defaults to inferred)
  const [previewFormatKey, setPreviewFormatKey] = useState<string>(mockupVariant.format);
  // Reset preview to inferred whenever squad / platform changes
  useEffect(() => {
    setPreviewFormatKey(mockupVariant.format);
  }, [mockupVariant.platform, mockupVariant.format]);

  const previewVariant: MockupVariant = useMemo(
    () => platformVariants.find((v) => v.format === previewFormatKey) ?? mockupVariant,
    [platformVariants, previewFormatKey, mockupVariant],
  );

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[300px_1fr_360px] divide-x divide-divider">

      {/* ─── LEFT: CANVA-STYLE DETAILS PANEL ────────────────────────── */}
      <aside className="flex flex-col h-full bg-content1 overflow-hidden">

        {/* ── Top: back + squad identity ──────────────────────────────── */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-divider space-y-3">
          {/* Back to all methodologies — clear, always visible */}
          <button
            className="flex items-center gap-1.5 text-tiny text-default-500 hover:text-foreground transition group"
            onClick={() => window.history.back()}
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
            所有方法論
          </button>

          {/* Squad name */}
          <h2 className="font-semibold text-[15px] leading-snug tracking-tight">{name}</h2>

          {/* Platform + layer badges */}
          <div className="flex flex-wrap gap-1.5">
            {wsMeta && (
              <Chip
                size="sm" variant="flat" color="default"
                startContent={<FontAwesomeIcon icon={wsMeta.icon} className="text-tiny ml-1" />}
              >
                {wsMeta.label}
              </Chip>
            )}
            <Chip
              size="sm" variant="flat"
              style={{ background: `${tone.bg}1A`, color: tone.bg }}
              startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}
            >
              {lk}
            </Chip>
            {(author || year) && (
              <Chip
                size="sm" variant="flat"
                startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
              >
                {author ?? "—"}{year ? ` · ${year}` : ""}
              </Chip>
            )}
          </div>

          {/* Tab switcher: 詳情 / 方法論 */}
          <Tabs
            size="sm" radius="full" variant="solid"
            selectedKey={detailTab}
            onSelectionChange={(k) => setDetailTab(k as "detail" | "method")}
            classNames={{ tabList: "bg-default-100 w-full", tab: "flex-1" }}
          >
            <Tab key="detail" title="詳情" />
            <Tab key="method" title="方法論" />
          </Tabs>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {detailTab === "detail" ? (
            <>
              {/* 任務名稱 */}
              <Input
                label="任務名稱"
                labelPlacement="outside"
                variant="bordered" radius="md" size="sm"
                placeholder="幫這次任務取個名字"
                value={missionTitle}
                onValueChange={setMissionTitle}
                isRequired
                startContent={<FontAwesomeIcon icon={faBullseye} className="text-tiny text-default-400" />}
              />

              {/* 目標期間 — 月行事曆才顯示日期欄 */}
              {primaryOutputKind === "calendar" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date" size="sm" variant="bordered" radius="md"
                    label="開始日期" labelPlacement="outside"
                    isReadOnly={!!missionId}
                  />
                  <Input
                    type="date" size="sm" variant="bordered" radius="md"
                    label="結束日期" labelPlacement="outside"
                    isReadOnly={!!missionId}
                  />
                </div>
              )}

              {/* 說明 / 重點 */}
              <Textarea
                label="說明 / 重點（可選）"
                labelPlacement="outside"
                variant="bordered" radius="md" size="sm"
                placeholder="這次想做什麼、給誰、為什麼？"
                minRows={3} maxRows={6}
                value={missionBrief}
                onValueChange={setMissionBrief}
              />

              <Divider />

              {/* 品牌 / 產品 / 活動 context */}
              <div className="space-y-2">
                <p className="text-tiny font-medium text-default-500 uppercase tracking-wider">
                  內容來源
                </p>
                {brandName ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl border border-divider bg-default-50">
                    <div className="w-8 h-8 rounded-full bg-default-200 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faBrain} className="text-default-500 text-sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-small font-semibold truncate">{brandName}</p>
                      <p className="text-tiny text-default-400">品牌資料已自動帶入</p>
                    </div>
                    <Chip size="sm" color="success" variant="flat" className="shrink-0">已連結</Chip>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-default-300">
                    <FontAwesomeIcon icon={faBrain} className="text-default-300" />
                    <p className="text-tiny text-default-400">請先在上方選擇品牌 / 產品 / 活動</p>
                  </div>
                )}
              </div>

              {/* 成員預覽 */}
              {members.length > 0 && (
                <>
                  <Divider />
                  <div className="space-y-2">
                    <p className="text-tiny font-medium text-default-500 uppercase tracking-wider">
                      小組成員
                    </p>
                    <div className="space-y-1.5">
                      {members.slice(0, 5).map((m: any, i: number) => (
                        <div key={m.id ?? i} className="flex items-center gap-2">
                          <AgentAvatar seed={m.id ?? m.name ?? `m${i}`} size={24} className="rounded-full shrink-0" />
                          <span className="text-small text-default-700 truncate">{m.name ?? "—"}</span>
                          <span className="text-tiny text-default-400 ml-auto shrink-0">{m.role ?? ""}</span>
                        </div>
                      ))}
                      {members.length > 5 && (
                        <p className="text-tiny text-default-400">+{members.length - 5} 位成員</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* ── 方法論 tab ───────────────────────────────────────── */
            <>
              {description && (
                <div className="space-y-1">
                  <p className="text-tiny font-medium text-default-500 uppercase tracking-wider">說明</p>
                  <p className="text-small text-default-700 leading-relaxed">{description}</p>
                </div>
              )}
              <Divider />
              <div className="space-y-2">
                <p className="text-tiny font-medium text-default-500 uppercase tracking-wider">
                  {steps.length} 個步驟
                </p>
                {steps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-default-100 text-default-500 flex items-center justify-center text-[10px] shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-small font-medium text-default-700 leading-snug">
                        {s.name ?? s.title ?? `Step ${i + 1}`}
                      </p>
                      {s.assignedAgentName && (
                        <p className="text-tiny text-default-400 mt-0.5">{s.assignedAgentName}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="px-4 pb-2 shrink-0">
            <Alert color="danger" variant="flat" title={error} />
          </div>
        )}
      </aside>

      {/* ─── MIDDLE: PREVIEW ─────────────────────────────────────────── */}
      <section className="overflow-y-auto bg-default-50 flex flex-col">
        {/* Variant switcher — only for single-post squads with 2+ variants.
            Hidden for calendar / pillar / research output squads. */}
        {primaryOutputKind === "post" && platformVariants.length > 1 && (
          <div className="sticky top-0 z-10 bg-default-50/90 backdrop-blur-sm border-b border-divider px-4 py-2 flex items-center justify-between gap-2">
            <Tabs
              size="sm" radius="full" variant="solid" color="default"
              selectedKey={previewFormatKey}
              onSelectionChange={(k) => setPreviewFormatKey(String(k))}
              aria-label="預覽格式"
              classNames={{ tabList: "bg-content1" }}
            >
              {platformVariants.map((v) => (
                <Tab key={v.format} title={v.label.replace(/^.*?\s/, "")} />
              ))}
            </Tabs>
            {previewFormatKey !== mockupVariant.format && (
              <Tooltip content={`系統推薦：${mockupVariant.label}`}>
                <Chip
                  size="sm" variant="flat" color="default"
                  className="cursor-pointer"
                  onClick={() => setPreviewFormatKey(mockupVariant.format)}
                >
                  ⤺ 推薦：{mockupVariant.label.replace(/^.*?\s/, "")}
                </Chip>
              </Tooltip>
            )}
          </div>
        )}

        {/* Output label strip for non-post squads */}
        {primaryOutputKind !== "post" && (
          <div className="sticky top-0 z-10 bg-default-50/90 backdrop-blur-sm border-b border-divider px-4 py-2">
            <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider text-default-500">
              {primaryOutputKind === "calendar" ? "📅 月行事曆輸出"
               : primaryOutputKind === "pillar"   ? "🏛 內容支柱輸出"
               : primaryOutputKind === "research" ? "🔍 研究報告輸出"
               : "📋 報告輸出"}
            </Chip>
          </div>
        )}

        <div className="flex-1 flex items-start justify-center p-6 lg:p-10">
          {(() => {
            // ── Calendar squad: always show CalendarGridMockup ────────
            if (primaryOutputKind === "calendar") {
              // Post-launch: try to parse calendar data from confirmed steps
              const calendarStep = stepsArr.find((s: any) =>
                (s.mockupVariant ?? "").includes("Calendar")
              );
              const calStepOrder = calendarStep ? (stepsArr.indexOf(calendarStep) + 1) : null;
              const calProg = calStepOrder ? progressByOrd.get(calStepOrder) : null;
              const calOutput = calProg?.agentOutput ?? calProg?.agent_output ?? null;

              // Attempt to parse JSON calendar data from agent output
              let calData: any = undefined;
              if (calOutput) {
                try {
                  const match = String(calOutput).match(/```(?:json)?\s*([\s\S]*?)```/);
                  if (match) calData = JSON.parse(match[1]);
                } catch { /* not JSON — show empty state */ }
              }

              return (
                <div className="w-full max-w-2xl">
                  <CalendarGridMockup
                    isActive={!!missionId && !calOutput}
                    readOnly={!missionId}
                    data={calData}
                  />
                </div>
              );
            }

            // Post-launch: switch middle based on active step kind
            if (missionId && stepsArr[activeStepOrder - 1]) {
              const activeStep = stepsArr[activeStepOrder - 1];
              const kind = inferStepKind(activeStep);
              const prog = progressByOrd.get(activeStepOrder);

              // ── Intake / Decision / QA steps → always DocMockup ──────
              // CJ direction 2026-05-02: "一開始 intake 的時候，都用這個格式"
              // Any step with outputKind=decision/qa_review or mockupVariant=
              // IntakeFormMockup/QAReportMockup uses the document reader layout,
              // regardless of what inferStepKind returns.
              const isIntakeStep =
                ["decision", "intake"].includes(
                  String(activeStep.outputKind ?? "").toLowerCase()
                ) || activeStep.mockupVariant === "IntakeFormMockup";
              const isDocStep = isIntakeStep ||
                ["qa_review", "qa"].includes(String(activeStep.outputKind ?? "").toLowerCase()) ||
                activeStep.mockupVariant === "QAReportMockup";

              // Shared confirm/redo callbacks for all doc-style steps
              const handleDocConfirm = async (editedContent: string) => {
                if (!missionId) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: activeStepOrder,
                  mode: "confirm", userInput: editedContent,
                });
                const next = activeStepOrder + 1;
                if (next <= steps.length) {
                  await stepExecuteWithScope.mutateAsync({
                    missionId, squadSlug: squad.slug, stepOrder: next,
                    mode: "run", userInput: "",
                  });
                }
                await progressQuery.refetch?.();
              };
              const handleDocRedo = async () => {
                if (!missionId) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: activeStepOrder,
                  mode: "run", userInput: "",
                });
                await progressQuery.refetch?.();
              };

              if (isDocStep) {
                return (
                  <DocMockup
                    title={activeStep.name ?? activeStep.title ?? (missionTitle || name)}
                    brief={missionBrief || (description ?? "")}
                    brandName={brandName}
                    stepName={activeStep.name ?? activeStep.title ?? `Step ${activeStepOrder}`}
                    agentName={prog?.agentName ?? prog?.agent_name ?? activeStep.assignedAgentName ?? null}
                    body={prog?.agentOutput ?? prog?.agent_output ?? null}
                    status={prog?.status ?? "pending"}
                    isEditable={isIntakeStep}
                    onConfirm={handleDocConfirm}
                    onRedo={handleDocRedo}
                    isMutating={stepExecute.isPending}
                  />
                );
              }

              if (kind === "strategic") {
                return (
                  <DocMockup
                    title={missionTitle || name}
                    brief={missionBrief || (description ?? "")}
                    brandName={brandName}
                    stepName={activeStep.name ?? activeStep.title ?? `Step ${activeStepOrder}`}
                    agentName={prog?.agentName ?? prog?.agent_name ?? activeStep.assignedAgentName ?? null}
                    body={prog?.agentOutput ?? prog?.agent_output ?? null}
                    status={prog?.status ?? "pending"}
                    onConfirm={handleDocConfirm}
                    onRedo={handleDocRedo}
                    isMutating={stepExecute.isPending}
                  />
                );
              }
              // ── Visual step: 3-step MediaGenFlow inline (CJ rule 2026-04-29)
              if ((kind === "image" || kind === "video") && prog?.status !== "pending") {
                const draft: string = (prog?.agentOutput ?? prog?.agent_output ?? "").toString().trim();
                const tags: string[] =
                  (squad.preferredModelTags as string[] | null) ??
                  (activeStep.preferredModelTags as string[] | null) ??
                  (activeStep.assignedAgent?.preferredModelTags as string[] | null) ??
                  [];
                return (
                  <div className="w-full">
                    <div className="text-center mb-3">
                      <Chip size="sm" variant="flat" color="primary" className="uppercase tracking-wider">
                        {kind === "video" ? "🎬 影片素材步驟" : "🖼️ 視覺素材步驟"}
                      </Chip>
                      <p className="text-tiny text-default-500 mt-2">
                        此步驟產出的是{kind === "video" ? "影片" : "圖像"}，請依下列 3 步驟產生素材
                      </p>
                    </div>
                    <MediaGenFlow
                      open inline kind={kind}
                      initialBrief={draft || `${activeStep.name ?? ""}\n${activeStep.description ?? ""}`.trim()}
                      brandContext={brandName ?? undefined}
                      brandId={null}
                      preferredModelTags={tags}
                      onClose={() => {}}
                      onComplete={async ({ url, modelId, promptEn }) => {
                        if (!missionId) return;
                        const payload = `__media_url__: ${url}\n__model__: ${modelId}\n__prompt__: ${promptEn}\n\n${draft}`;
                        await stepExecuteWithScope.mutateAsync({
                          missionId, squadSlug: squad.slug,
                          stepOrder: activeStepOrder, mode: "run", userInput: payload,
                        }).catch(() => {});
                        await progressQuery.refetch?.();
                      }}
                    />
                  </div>
                );
              }
              // content step: fall through to platform mockup
            }

            // Default: single-post PlatformMockup
            const live = missionId ? aggregateMockupFields(stepsArr, progressByOrd) : {};
            return (
              <PlatformMockup
                variant={previewVariant}
                title={missionTitle || name}
                brief={missionBrief || (description ?? "")}
                brandName={brandName}
                steps={steps}
                liveCaption={live.caption}
                liveHashtags={live.hashtags}
                liveTitle={live.title}
                liveDescription={live.description}
                liveImageDesc={live.imageDesc}
                liveVideoDesc={live.videoDesc}
                liveCta={live.cta}
              />
            );
          })()}
        </div>
      </section>

      {/* ─── RIGHT: AGENT ORCHESTRA ──────────────────────────────────── */}
      <aside className="overflow-y-auto px-4 py-5 space-y-3 bg-content1">
        <div className="flex items-center justify-between">
          <p className="text-tiny tracking-wider uppercase text-default-500 font-medium flex items-center gap-1.5">
            <FontAwesomeIcon icon={faUserGroup} /> AGENT ORCHESTRA
          </p>
          <Chip size="sm" variant="flat">{steps.length} 階段</Chip>
        </div>

        {members.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {members.slice(0, 5).map((m: any, i: number) => (
              <Tooltip key={m.id ?? m.name ?? i} content={
                <div className="flex items-center gap-2 px-1 py-1">
                  <AgentAvatar seed={m.id ?? m.name ?? `m${i}`} size={32} className="rounded-full" />
                  <div>
                    <p className="text-small font-semibold">{m.name ?? "—"}</p>
                    <p className="text-tiny text-default-500">{m.role ?? m.primarySkill ?? ""}</p>
                  </div>
                </div>
              }>
                <span className="ring-2 ring-content1 rounded-full -mr-2 last:mr-0">
                  <AgentAvatar seed={m.id ?? m.name ?? `m${i}`} size={32} className="rounded-full" />
                </span>
              </Tooltip>
            ))}
            {members.length > 5 && (
              <span className="ml-3 text-tiny text-default-500">+{members.length - 5}</span>
            )}
            <span className="ml-1 text-tiny text-default-500">{members.length} 位成員</span>
          </div>
        )}

        <Divider />

        {/* Launch CTA (pre-mission) OR live progress (post-launch) */}
        {!missionId ? (
          <div className="space-y-2">
            <Button
              color="primary" size="lg" radius="lg"
              className="w-full font-semibold"
              isLoading={busy}
              isDisabled={!missionTitle.trim() && !pickLocaleText(squad.name, lang)}
              onPress={onLaunch}
              startContent={!busy && <FontAwesomeIcon icon={faRocket} />}
            >
              {busy ? "啟動中…" : `派出小組（${steps.length} 個步驟）`}
            </Button>
            {Object.values(agentNotes).some((n) => n.trim()) && (
              <p className="text-tiny text-secondary text-center flex items-center justify-center gap-1">
                <FontAwesomeIcon icon={faPenToSquare} className="text-tiny" />
                已寫 {Object.values(agentNotes).filter((n) => n.trim()).length} 則備註
              </p>
            )}
            <Progress size="sm" value={0} color="default" aria-label="pipeline progress" />
            <p className="text-tiny text-default-500 text-center">
              點擊上方派出 → agent 會逐段填入中央預覽
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              const confirmedCount = Array.from(progressByOrd.values()).filter((p: any) => p?.status === "confirmed").length;
              const pct = steps.length ? (confirmedCount / steps.length) * 100 : 0;
              const inFlight = stepExecute.isPending;
              const noProgressYet = stepProgressList.length === 0;
              return (
                <>
                  <div className="flex items-center justify-between text-tiny">
                    <span className="text-default-500 uppercase tracking-wider">PIPELINE</span>
                    <span className="tabular-nums text-default-700">
                      {confirmedCount} / {steps.length} 已確認
                    </span>
                  </div>
                  <Progress
                    size="sm"
                    value={pct}
                    color={pct === 100 ? "success" : "secondary"}
                    isIndeterminate={inFlight && noProgressYet}
                    aria-label="pipeline progress"
                  />
                  <p className="text-tiny text-default-500 text-center">
                    {pct === 100
                      ? "✓ 所有步驟完成"
                      : inFlight && noProgressYet
                        ? "⚙ AI 專員正在思考第一步…（首次啟動可能需要 10–30 秒）"
                        : `現在輪到：${stepsArr[activeStepOrder - 1]?.name ?? `Step ${activeStepOrder}`}`}
                  </p>
                  {stepError && (
                    <Alert
                      color="danger"
                      variant="flat"
                      title="執行卡住了"
                      description={stepError}
                      endContent={
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          isLoading={stepExecute.isPending}
                          onPress={() => {
                            if (!missionId) return;
                            setStepError(null);
                            stepExecute
                              .mutateAsync({
                                missionId,
                                squadSlug: squad.slug,
                                stepOrder: activeStepOrder,
                                mode: "run",
                                userInput: "",
                              })
                              .then(() => progressQuery.refetch?.())
                              .catch((e: any) => setStepError(`重試失敗：${e?.message ?? String(e)}`));
                          }}
                        >
                          重試
                        </Button>
                      }
                    />
                  )}
                </>
              );
            })()}
          </div>
        )}

        <Divider />

        {/* Baton strip — compact horizontal agent sequence (CJ 2026-05-02).
         *  Default state: show only the strip. Click any avatar to expand
         *  the full AgentLiveCard inline below. Cuts visual + cognitive
         *  load while still surfacing "agents are passing the baton". */}
        <AgentBatonStrip
          steps={steps}
          progressByOrd={progressByOrd}
          activeStepOrder={activeStepOrder}
          missionId={missionId}
          expandedStepIdx={expandedStepIdx}
          onClickStep={(idx) => setExpandedStepIdx(expandedStepIdx === idx ? null : idx)}
        />

        {/* Inline expansion: render AgentLiveCard ONLY for the clicked step */}
        {expandedStepIdx != null && steps[expandedStepIdx] && (() => {
          const i = expandedStepIdx;
          const step = steps[i];
          const ord = i + 1;
          const prog = progressByOrd.get(ord);
          const liveStatus = prog?.status ?? (missionId ? "pending" : "queued");
          const isActive = !!missionId && ord === activeStepOrder;
          return (
            <AgentLiveCard
              key={`expanded-${i}`}
              step={step}
              idx={ord}
              isOrchestrator={i === steps.length - 1 && steps.length > 1}
              tone={tone}
              hasNote={!!agentNotes[i]?.trim()}
              liveStatus={liveStatus}
              liveOutput={prog?.agentOutput ?? prog?.agent_output ?? null}
              liveAgentName={prog?.agentName ?? prog?.agent_name ?? null}
              isActive={isActive}
              missionId={missionId}
              squadSlug={squad.slug}
              onConfirmAndAdvance={async () => {
                if (!missionId) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: ord,
                  mode: "confirm", userInput: "",
                });
                const next = ord + 1;
                if (next <= steps.length) {
                  await stepExecuteWithScope.mutateAsync({
                    missionId, squadSlug: squad.slug, stepOrder: next,
                    mode: "run", userInput: "",
                  });
                }
                await progressQuery.refetch?.();
              }}
              onRedo={async () => {
                if (!missionId) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: ord,
                  mode: "run", userInput: "",
                });
                await progressQuery.refetch?.();
              }}
              onAsk={async (q: string) => {
                if (!missionId || !q.trim()) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: ord,
                  mode: "ask", userInput: q.trim(),
                });
                await progressQuery.refetch?.();
              }}
              isMutating={stepExecute.isPending}
              onClick={() => setActiveStepIdx(i)}
              onAfterEdit={() => { progressQuery.refetch?.(); }}
            />
          );
        })()}

        {/* Mission control footer (post-launch) */}
        {missionId && (
          <>
            <Divider />
            <div className="flex items-center justify-between">
              <Chip size="sm" variant="flat" color="success">執行中</Chip>
              <Button size="sm" variant="light" onPress={onMissionEnd}>返回預覽</Button>
            </div>
          </>
        )}
      </aside>

      {/* Agent detail modal */}
      <AgentDetailModal
        isOpen={activeStepIdx !== null}
        onClose={() => setActiveStepIdx(null)}
        step={activeStepIdx !== null ? steps[activeStepIdx] : null}
        idx={activeStepIdx !== null ? activeStepIdx + 1 : 0}
        totalSteps={steps.length}
        tone={tone}
        note={activeStepIdx !== null ? (agentNotes[activeStepIdx] ?? "") : ""}
        setNote={(v) => {
          if (activeStepIdx === null) return;
          setAgentNotes((p) => ({ ...p, [activeStepIdx]: v }));
        }}
      />
    </div>
  );
}

function seedTitleHint(squad: any, lang: "zh-TW" | "en") {
  return pickLocaleText(squad.name, lang) || squad.slug || "";
}

/* ─────────────── Sub: AgentQueueCard (PR1: queued state only) ─────────── */

function AgentQueueCard({
  step, idx, isOrchestrator, tone, hasNote, onPress,
}: {
  step: any;
  idx: number;
  isOrchestrator: boolean;
  tone: any;
  hasNote?: boolean;
  onPress?: () => void;
}) {
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const agent = step.assignedAgentName ?? step.owner ?? null;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";

  return (
    <Card
      shadow="none" radius="md"
      isPressable={!!onPress}
      isHoverable={!!onPress}
      onPress={onPress}
      className={[
        "border w-full",
        isOrchestrator ? "bg-foreground text-background border-foreground" : "border-divider",
        hasNote ? "ring-2 ring-secondary ring-offset-1 ring-offset-content1" : "",
      ].join(" ")}
    >
      <CardBody className="p-3 flex flex-row items-start gap-3">
        <div className="shrink-0 flex flex-col items-center gap-1">
          {agent ? (
            <Badge
              content={<FontAwesomeIcon icon={faCircle} className="text-tiny" />}
              color="default" placement="bottom-right" shape="circle" size="sm"
              classNames={{ badge: "bg-default-300" }}
            >
              <AgentAvatar seed={agent} size={40} className={isOrchestrator ? "rounded-full ring-2 ring-secondary" : "rounded-full ring-1 ring-divider"} />
            </Badge>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-tiny font-bold"
              style={{ background: `${tone.bg}33`, color: tone.bg }}>
              {idx}
            </div>
          )}
          <Chip size="sm" variant="flat" className={`text-tiny tabular-nums ${isOrchestrator ? "bg-white/20 text-background" : ""}`}>
            0{idx}
          </Chip>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-small font-medium truncate ${isOrchestrator ? "" : "text-foreground"}`}>{title}</p>
            {isOrchestrator && (
              <Chip size="sm" variant="solid" startContent={<FontAwesomeIcon icon={faGavel} className="text-tiny ml-1" />} className="bg-secondary text-white">
                ORCHESTRATOR
              </Chip>
            )}
          </div>
          {agent && (
            <p className={`text-tiny truncate ${isOrchestrator ? "text-white/60" : "text-default-500"}`}>
              {agent}
            </p>
          )}
          {(skills.length > 0 || out) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <Chip
                  key={i} size="sm" variant="flat"
                  classNames={{
                    base: `h-5 ${isOrchestrator ? "bg-white/15 text-white" : ""}`,
                    content: "text-tiny px-1",
                  }}
                >
                  {sk}
                </Chip>
              ))}
              {out && (
                <Chip
                  size="sm" variant="bordered"
                  classNames={{
                    base: `h-5 ${isOrchestrator ? "border-white/30 text-white" : ""}`,
                    content: "text-tiny px-1",
                  }}
                >
                  {out}
                </Chip>
              )}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <Chip
              size="sm" variant="flat"
              classNames={{
                base: isOrchestrator ? "bg-white/15 text-white" : "",
                content: "text-tiny",
              }}
            >
              queued
            </Chip>
            {hasNote && (
              <Chip
                size="sm" variant="flat" color="default"
                startContent={<FontAwesomeIcon icon={faPenToSquare} className="text-tiny ml-1" />}
                classNames={{ content: "text-tiny pr-1" }}
              >
                有備註
              </Chip>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────── Sub: AgentBatonStrip (CJ 2026-05-02) ─────────── */
/**
 * Compact horizontal sequence of agents — the "baton strip".
 *
 * Replaces the always-on AgentLiveCard grid. Each avatar shows status
 * via badge color + dot animation; current active agent is highlighted
 * with a ring. Click any avatar to expand AgentLiveCard inline below.
 *
 * Why: 14k users polling every 2s would crush the backend; the
 * per-step expanded card was overkill for 95% of use cases (user
 * just wants to know "agents are working, results are landing in
 * the middle preview"). This compresses to a single row with an
 * opt-in drill-down.
 */
function AgentBatonStrip({
  steps, progressByOrd, activeStepOrder, missionId, expandedStepIdx, onClickStep,
}: {
  steps: any[];
  progressByOrd: Map<number, any>;
  activeStepOrder: number;
  missionId: number | null;
  expandedStepIdx: number | null;
  onClickStep: (idx: number) => void;
}) {
  const STATUS_DOT: Record<string, string> = {
    confirmed: "bg-success",
    drafted:   "bg-warning",
    running:   "bg-secondary animate-pulse",
    asking:    "bg-primary animate-pulse",
    skipped:   "bg-default-300",
    pending:   "bg-default-200",
    queued:    "bg-default-200",
  };
  const STATUS_LABEL: Record<string, string> = {
    confirmed: "已確認",
    drafted:   "等審核",
    running:   "工作中",
    asking:    "詢問中",
    skipped:   "已跳過",
    pending:   "排隊中",
    queued:    "排隊中",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-tiny tracking-wider uppercase text-default-500 font-medium">
          AGENT BATON
        </p>
        <span className="text-tiny text-default-400">點頭像看細節</span>
      </div>
      <div className="flex items-center gap-0">
        {steps.map((step: any, i: number) => {
          const ord = i + 1;
          const prog = progressByOrd.get(ord);
          const status = prog?.status ?? (missionId ? "pending" : "queued");
          const isActive = !!missionId && ord === activeStepOrder;
          const isExpanded = expandedStepIdx === i;
          const seed = step.assignedAgentId ?? step.assignedAgentName ?? `step-${i}`;
          const agentName = step.assignedAgentName ?? `Step ${ord}`;
          const isLast = i === steps.length - 1;
          return (
            <React.Fragment key={i}>
              <Tooltip
                content={
                  <div className="px-1 py-1 max-w-[240px]">
                    <p className="text-small font-semibold leading-tight">
                      {ord}. {step.name ?? `Step ${ord}`}
                    </p>
                    <p className="text-tiny text-default-500 mt-0.5">
                      {agentName} · {STATUS_LABEL[status] ?? status}
                    </p>
                  </div>
                }
                placement="bottom"
              >
                <button
                  type="button"
                  onClick={() => onClickStep(i)}
                  className={[
                    "relative shrink-0 rounded-full transition-all",
                    isActive ? "ring-2 ring-primary ring-offset-1" : "",
                    isExpanded ? "ring-2 ring-secondary ring-offset-1" : "",
                  ].join(" ")}
                  aria-label={`step ${ord} ${agentName}`}
                >
                  <AgentAvatar seed={seed} size={36} className="rounded-full" />
                  {/* Status dot */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-content1 ${STATUS_DOT[status] ?? "bg-default-200"}`}
                  />
                  {/* Step number bubble */}
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-content1 border border-divider text-[9px] flex items-center justify-center font-semibold tabular-nums">
                    {ord}
                  </span>
                </button>
              </Tooltip>
              {!isLast && (
                <span
                  className={`flex-1 h-px mx-1 ${prog?.status === "confirmed" ? "bg-success" : "bg-divider"}`}
                  style={{ minWidth: 12 }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────── Sub: AgentLiveCard (PR4 — post-launch live state) ─────────── */

function AgentLiveCard({
  step, idx, isOrchestrator, tone, hasNote,
  liveStatus, liveOutput, liveAgentName, isActive,
  missionId, squadSlug,
  onConfirmAndAdvance, onRedo, onAsk, isMutating, onClick, onAfterEdit,
}: {
  step: any; idx: number; isOrchestrator: boolean; tone: any; hasNote?: boolean;
  liveStatus: string; liveOutput: string | null; liveAgentName: string | null;
  isActive: boolean;
  missionId: number | null; squadSlug: string;
  onConfirmAndAdvance: () => Promise<void>;
  onRedo: () => Promise<void>;
  onAsk: (q: string) => Promise<void>;
  isMutating: boolean;
  onClick?: () => void;
  onAfterEdit?: () => void;
}) {
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const agent = liveAgentName ?? step.assignedAgentName ?? step.owner ?? null;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";

  // Map server status → display
  const statusMeta = (() => {
    if (!missionId) return { label: "queued", color: "default" as const, icon: faCircle };
    if (liveStatus === "confirmed") return { label: "已確認", color: "success" as const, icon: faCircleCheck };
    if (liveStatus === "drafted")   return { label: "等待審查", color: "warning" as const, icon: faPenToSquare };
    if (liveStatus === "skipped")   return { label: "已跳過",   color: "default" as const, icon: faCircle };
    if (liveStatus === "running" || isMutating && isActive)
      return { label: "工作中…",  color: "secondary" as const, icon: faBolt };
    return { label: "排隊中", color: "default" as const, icon: faCircle };
  })();

  const [chatInput, setChatInput] = useState("");
  const expanded = isActive && (liveStatus === "drafted" || liveStatus === "running" || !!liveOutput);

  // Inline edit — CJ direction 2026-04-30: 「我想要逐字修改，沒地方改」
  // Click pencil → textarea + save/cancel. Save calls stepEditOutput
  // (which pushes the previous version into history so undo still works).
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");
  const editMutation: any = (trpc.squad as any).stepEditOutput?.useMutation
    ? (trpc.squad as any).stepEditOutput.useMutation()
    : { mutateAsync: async () => null, isPending: false };
  const beginEdit = () => {
    setEditBuffer(liveOutput ?? "");
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditBuffer("");
  };
  const saveEdit = async () => {
    if (!missionId) return;
    await editMutation.mutateAsync({ missionId, stepOrder: idx, output: editBuffer });
    setEditing(false);
    onAfterEdit?.();
  };

  return (
    <Card
      shadow={expanded ? "md" : "none"}
      radius="md"
      isPressable={!expanded && !!onClick}
      onPress={!expanded ? onClick : undefined}
      className={[
        "border w-full transition",
        isOrchestrator ? "bg-foreground text-background border-foreground" : "border-divider",
        hasNote ? "ring-2 ring-secondary ring-offset-1 ring-offset-content1" : "",
        expanded ? "ring-2 ring-primary ring-offset-1 ring-offset-content1" : "",
      ].join(" ")}
    >
      <CardBody className="p-3 flex flex-row items-start gap-3">
        <div className="shrink-0 flex flex-col items-center gap-1">
          {agent ? (
            <AgentAvatar
              seed={agent}
              size={40}
              className={[
                "rounded-full ring-2",
                isOrchestrator ? "ring-secondary" :
                statusMeta.color === "success" ? "ring-success" :
                statusMeta.color === "warning" ? "ring-warning" : "ring-divider",
              ].join(" ")}
            />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-tiny font-bold"
              style={{ background: `${tone.bg}33`, color: tone.bg }}>{idx}</div>
          )}
          <Chip size="sm" variant="flat" className={`text-tiny tabular-nums ${isOrchestrator ? "bg-white/20 text-background" : ""}`}>
            0{idx}
          </Chip>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-small font-medium truncate ${isOrchestrator ? "" : "text-foreground"}`}>{title}</p>
            {isOrchestrator && (
              <Chip size="sm" variant="solid" startContent={<FontAwesomeIcon icon={faGavel} className="text-tiny ml-1" />} className="bg-secondary text-white">
                ORCHESTRATOR
              </Chip>
            )}
          </div>
          {agent && (
            <p className={`text-tiny truncate ${isOrchestrator ? "text-white/60" : "text-default-500"}`}>{agent}</p>
          )}
          {(skills.length > 0 || out) && !expanded && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <Chip key={i} size="sm" variant="flat"
                  classNames={{ base: `h-5 ${isOrchestrator ? "bg-white/15 text-white" : ""}`, content: "text-tiny px-1" }}>
                  {sk}
                </Chip>
              ))}
              {out && (
                <Chip size="sm" variant="bordered"
                  classNames={{ base: `h-5 ${isOrchestrator ? "border-white/30 text-white" : ""}`, content: "text-tiny px-1" }}>
                  {out}
                </Chip>
              )}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <Chip size="sm" variant="flat" color={statusMeta.color}
              startContent={
                statusMeta.label === "工作中…"
                  ? <Spinner size="sm" classNames={{ wrapper: "w-3 h-3 ml-1" }} />
                  : <FontAwesomeIcon icon={statusMeta.icon} className="text-tiny ml-1" />
              }
              classNames={{ content: "text-tiny pr-1" }}>
              {statusMeta.label}
            </Chip>
            {hasNote && (
              <Chip size="sm" variant="flat" color="default"
                startContent={<FontAwesomeIcon icon={faPenToSquare} className="text-tiny ml-1" />}
                classNames={{ content: "text-tiny pr-1" }}>
                有備註
              </Chip>
            )}
          </div>
        </div>
      </CardBody>

      {/* Expanded chat content */}
      {expanded && (
        <>
          <Divider />
          <CardBody className="px-3 py-3 gap-3 bg-default-50/50">
            {/* Agent's output as a chat bubble */}
            {liveStatus === "running" || (!liveOutput && missionId) ? (
              <div className="flex items-start gap-2">
                <AgentAvatar seed={agent ?? `step${idx}`} size={32} className="rounded-full shrink-0" />
                <div className="flex-1 bg-content1 border border-divider rounded-2xl rounded-tl-sm px-3 py-2 space-y-1.5">
                  <p className="text-tiny text-default-500 flex items-center gap-1.5">
                    <Spinner size="sm" classNames={{ wrapper: "w-3 h-3" }} />
                    {agent ?? "agent"} 思考中…
                  </p>
                  <Skeleton className="h-2.5 w-[88%] rounded" />
                  <Skeleton className="h-2.5 w-[72%] rounded" />
                </div>
              </div>
            ) : liveOutput ? (
              <div className="flex items-start gap-2">
                <AgentAvatar seed={agent ?? `step${idx}`} size={32} className="rounded-full shrink-0" />
                <div className="flex-1 bg-content1 border border-divider rounded-2xl rounded-tl-sm px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-tiny text-default-500">{agent ?? "agent"}</p>
                    {!editing && liveOutput && (
                      <Button
                        size="sm"
                        variant="light"
                        className="h-6 min-w-0 px-2 text-tiny"
                        onPress={beginEdit}
                        startContent={<FontAwesomeIcon icon={faPenToSquare} className="text-tiny" />}
                      >
                        編輯
                      </Button>
                    )}
                  </div>
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        size="sm"
                        variant="bordered"
                        value={editBuffer}
                        onValueChange={setEditBuffer}
                        minRows={6}
                        maxRows={20}
                        classNames={{ input: "text-small leading-relaxed font-sans whitespace-pre-wrap" }}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="light" onPress={cancelEdit} isDisabled={editMutation.isPending}>
                          取消
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          onPress={saveEdit}
                          isLoading={editMutation.isPending}
                          isDisabled={editBuffer === (liveOutput ?? "")}
                        >
                          儲存修改
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ScrollShadow className="max-h-64">
                      <pre className="text-small leading-relaxed font-sans whitespace-pre-wrap">{liveOutput}</pre>
                    </ScrollShadow>
                  )}
                </div>
              </div>
            ) : null}

            {/* Chat input */}
            <div className="flex items-center gap-2">
              <Input
                size="sm" radius="lg" variant="bordered"
                placeholder={`對 ${agent ?? "這個 agent"} 留訊息…`}
                value={chatInput}
                onValueChange={setChatInput}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && chatInput.trim() && !isMutating) {
                    const q = chatInput.trim();
                    setChatInput("");
                    await onAsk(q);
                  }
                }}
                isDisabled={isMutating || liveStatus === "running"}
                startContent={<FontAwesomeIcon icon={faPenToSquare} className="text-tiny text-default-400" />}
              />
              <Button isIconOnly size="sm" color="primary" radius="lg" aria-label="送出"
                isDisabled={!chatInput.trim() || isMutating || liveStatus === "running"}
                onPress={async () => {
                  const q = chatInput.trim();
                  setChatInput("");
                  await onAsk(q);
                }}>
                <FontAwesomeIcon icon={faPaperPlane} />
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                size="sm" radius="md" color="success" className="flex-1 font-medium"
                isDisabled={liveStatus !== "drafted" || isMutating}
                isLoading={isMutating}
                onPress={onConfirmAndAdvance}
                startContent={!isMutating && <FontAwesomeIcon icon={faCircleCheck} />}
              >
                ✓ 滿意，下一步
              </Button>
              <Button
                size="sm" radius="md" variant="bordered"
                isDisabled={isMutating}
                onPress={onRedo}
                startContent={<FontAwesomeIcon icon={faRotateRight} />}
              >
                重做
              </Button>
            </div>
          </CardBody>
        </>
      )}
    </Card>
  );
}

/* ─────────────── Sub: AgentDetailModal (PR3) ─────────────── */

function AgentDetailModal({
  isOpen, onClose, step, idx, totalSteps, tone, note, setNote,
}: {
  isOpen: boolean;
  onClose: () => void;
  step: any | null;
  idx: number;
  totalSteps: number;
  tone: any;
  note: string;
  setNote: (v: string) => void;
}) {
  if (!step) return null;
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const agent = step.assignedAgentName ?? step.owner ?? null;
  const role = step.assignedAgentRole ?? step.role ?? null;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";
  const tool = step.tool ?? step.requiredTools?.[0] ?? null;
  const desc = step.description ?? null;
  const isOrchestrator = idx === totalSteps && totalSteps > 1;

  const QUICK_PROMPTS = [
    "再口語一點",
    "加 emoji",
    "縮短到 50 字",
    "更專業一些",
    "強調品牌調性",
    "加 CTA",
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-start gap-4 px-6 pt-6 pb-3">
          {agent ? (
            <AgentAvatar seed={agent} size={56} className="rounded-full ring-2 ring-secondary" />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-medium font-bold"
              style={{ background: `${tone.bg}33`, color: tone.bg }}>
              {idx}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Chip size="sm" variant="flat" className="tabular-nums">
                STEP 0{idx} / 0{totalSteps}
              </Chip>
              {isOrchestrator && (
                <Chip size="sm" variant="solid" startContent={<FontAwesomeIcon icon={faGavel} className="text-tiny ml-1" />} className="bg-foreground text-background">
                  ORCHESTRATOR
                </Chip>
              )}
            </div>
            <h2 className="font-semibold text-large tracking-tight leading-tight">{title}</h2>
            {agent && (
              <p className="text-small text-default-500 mt-0.5">
                {agent}{role ? ` · ${role}` : ""}
              </p>
            )}
          </div>
        </ModalHeader>
        <Divider />
        <ModalBody className="px-6 py-5 space-y-5">
          {desc && (
            <div>
              <p className="text-tiny tracking-wider uppercase text-default-500 font-medium mb-1.5">
                這個階段在做什麼
              </p>
              <p className="text-small text-foreground leading-relaxed whitespace-pre-line">{desc}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {skills.map((sk, i) => (
              <Chip key={i} size="sm" variant="flat">{sk}</Chip>
            ))}
            {out && <Chip size="sm" variant="bordered">輸出：{out}</Chip>}
            {tool && <Chip size="sm" variant="flat" color="default">工具：{tool}</Chip>}
          </div>

          <Divider />

          <div>
            <p className="text-tiny tracking-wider uppercase text-default-500 font-medium mb-2 flex items-center gap-1.5">
              <FontAwesomeIcon icon={faPenToSquare} /> 給 {agent ?? "這個 agent"} 的備註
            </p>
            <Textarea
              variant="bordered" radius="md"
              placeholder="例：請用更口語的口吻 / 重點放在價格優勢 / 加入 CTA「立即試用」…"
              minRows={3} maxRows={6}
              value={note}
              onValueChange={setNote}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((p) => (
                <Chip
                  key={p} size="sm" variant="bordered"
                  className="cursor-pointer hover:bg-default-100"
                  onClick={() => setNote(note ? `${note}；${p}` : p)}
                >
                  + {p}
                </Chip>
              ))}
            </div>
            <p className="text-tiny text-default-500 mt-2">
              派出小組時會把這個備註傳給該 agent，調整輸出風格。
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={() => setNote("")} isDisabled={!note}>清除備註</Button>
          <Button color="primary" onPress={onClose}>完成</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ─────────────────────────── Sub: StepCard ─────────────────────────── */

function StepCard({ step, idx, tone }: { step: any; idx: number; tone: any }) {
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";
  const agent = step.assignedAgentName ?? step.owner ?? "";
  const tool = step.tool ?? "";

  return (
    <Card shadow="none" radius="lg" className="border border-divider hover:border-foreground transition">
      <CardBody className="p-4 flex flex-row items-start gap-3">
        <div
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white text-tiny font-bold"
          style={{ background: tone.bg }}
        >
          {idx}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-small font-semibold text-foreground line-clamp-2">{title}</div>
          {agent && (
            <div className="text-tiny text-default-500 mt-0.5 line-clamp-1">{agent}</div>
          )}
          {(skills.length > 0 || out || tool) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <Chip key={i} size="sm" radius="sm" variant="flat" className="h-5 text-tiny">{sk}</Chip>
              ))}
              {out && (
                <Chip size="sm" radius="sm" variant="solid" color="default" className="h-5 text-tiny bg-foreground text-background">{out}</Chip>
              )}
              {tool && (
                <Chip size="sm" radius="sm" variant="bordered" className="h-5 text-tiny">{tool}</Chip>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Sub: LayerAssetDrawer ─────────────────────────── */
//
// Replaces the squad-list in the middle column when a layer-specific rail
// item is selected. For now this is a structured placeholder — the
// underlying asset tables (interviews, personas, kpis, ig-reels…) will
// land in subsequent sprints. The shell is here so layer-aware navigation
// is testable end-to-end and the user can see what each layer surfaces.

const DRAWER_LABELS: Record<string, { title: string; blurb: string }> = {
  interviews:  { title: "訪談稿",   blurb: "上傳訪談逐字稿，AI 自動萃取品牌洞察。" },
  competitors: { title: "競品比對", blurb: "蒐集競品定位、訊息與差異化點。" },
  archetypes:  { title: "原型卡",   blurb: "12 種品牌原型卡片庫，可拖入 mission。" },
  swot:        { title: "SWOT",     blurb: "本品牌的 SWOT 工作板。" },
  products:    { title: "產品卡",   blurb: "所有 SKU / 產品線資料卡。" },
  "vp-canvas": { title: "VP Canvas", blurb: "Osterwalder 價值主張畫布。" },
  pricing:     { title: "定價",     blurb: "各產品線定價策略與彈性。" },
  fab:         { title: "FAB",      blurb: "Features-Advantages-Benefits 拆解。" },
  personas:    { title: "Persona",  blurb: "目標客群人物誌，含痛點與動機。" },
  icp:         { title: "ICP",      blurb: "B2B 理想客戶輪廓。" },
  journey:     { title: "旅程圖",   blurb: "客戶決策歷程與觸點地圖。" },
  segments:    { title: "區隔表",   blurb: "STP / VALS / 行為區隔。" },
  calendar:    { title: "行事曆",   blurb: "本通路內容排程。" },
  assets:      { title: "素材庫",   blurb: "本通路圖文素材彙整。" },
  history:     { title: "歷史貼文", blurb: "歷史內容表現與分析。" },
  "fb-history":  { title: "FB 貼文歷史",  blurb: "歷史貼文 + 互動數據。" },
  "fb-assets":   { title: "FB 素材庫",    blurb: "圖文 / 影片素材。" },
  "fb-calendar": { title: "FB 行事曆",    blurb: "排程中與已發佈貼文。" },
  "fb-ads":      { title: "FB 廣告組",    blurb: "廣告素材 / 受眾 / 預算。" },
  "ig-reels":    { title: "Reels 庫",     blurb: "影音素材 + 表現。" },
  "ig-stories":  { title: "限時動態",     blurb: "限動企劃與素材。" },
  "ig-tags":     { title: "Hashtag 策略", blurb: "標籤組合與測試紀錄。" },
  "ig-calendar": { title: "IG 行事曆",    blurb: "排程中與已發佈內容。" },
  "li-history":  { title: "LinkedIn 貼文", blurb: "個人 / 公司貼文歷史。" },
  "li-personal": { title: "個人品牌",     blurb: "個人 LinkedIn 經營資產。" },
  "li-leads":    { title: "Lead 表",      blurb: "從 LinkedIn 搜集的潛在客戶。" },
  "li-calendar": { title: "LI 行事曆",    blurb: "排程中與已發佈貼文。" },
  "yt-videos":   { title: "影片庫",       blurb: "上傳影片 + 表現數據。" },
  "yt-titles":   { title: "標題 A/B",     blurb: "標題測試紀錄。" },
  "yt-thumbs":   { title: "縮圖",         blurb: "縮圖庫 + 點閱率。" },
  "yt-captions": { title: "字幕",         blurb: "字幕檔與多語言版本。" },
  "pr-media":    { title: "媒體名單",     blurb: "記者與媒體對接資料。" },
  "pr-press":    { title: "新聞稿",       blurb: "已發 / 草稿新聞稿。" },
  "pr-kol":      { title: "KOL 名單",     blurb: "KOL 合作池與紀錄。" },
  "pr-pitches":  { title: "Pitch 紀錄",   blurb: "Pitch 信件與回覆狀態。" },
  kpis:          { title: "KPI",          blurb: "活動目標與北極星指標。" },
  budget:        { title: "預算",         blurb: "活動預算分配與實支。" },
  gantt:         { title: "甘特圖",       blurb: "活動時程與依賴。" },
  risks:         { title: "風險表",       blurb: "已知風險與緩解計畫。" },
  monitor:       { title: "監測儀表板",   blurb: "即時品牌健康度。" },
  audits:        { title: "Audit 紀錄",   blurb: "歷次稽核紀錄與發現。" },
  incidents:     { title: "異常事件",     blurb: "監測觸發的事件紀錄。" },
  benchmarks:    { title: "對標",         blurb: "競品與產業基準。" },
};

/* ── Shared drawer shell ────────────────────────────────────────────────── */
function DrawerShell({
  icon, categoryLabel, title, onBack, children,
}: {
  icon: any;
  categoryLabel: string;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-3 border-b border-divider flex items-center gap-2">
        <Button size="sm" variant="light" radius="sm" onPress={onBack}
          className="text-tiny h-6 min-w-0 px-2 shrink-0 text-default-500 hover:text-foreground">
          ← 範本
        </Button>
        <div className="w-px h-4 bg-divider" />
        <FontAwesomeIcon icon={icon} className="text-default-400 text-tiny" />
        <div className="min-w-0 flex-1">
          <div className="text-tiny text-default-400 leading-none">{categoryLabel}</div>
          <div className="font-semibold text-small text-foreground truncate">{title}</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

/* ── Empty state helper ─────────────────────────────────────────────────── */
function DrawerEmpty({
  icon, headline, sub, cta, onCta,
}: {
  icon: any; headline: string; sub: string; cta?: string; onCta?: () => void;
}) {
  return (
    <div className="p-4">
      <Card shadow="none" radius="lg" className="border border-dashed border-divider bg-content2/30">
        <CardBody className="p-6 text-center">
          <div className="text-3xl mb-3 text-default-300"><FontAwesomeIcon icon={icon} /></div>
          <div className="text-small font-semibold mb-1">{headline}</div>
          <div className="text-tiny text-default-500 leading-snug mb-4">{sub}</div>
          {cta && onCta && (
            <Button size="sm" radius="full" color="primary" onPress={onCta}>{cta}</Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ── Scope label helper ─────────────────────────────────────────────────── */
function scopeLabel(scope: { brandId?: number | null; productId?: number | null; eventId?: number | null }, brands: any[], products: any[], events: any[]) {
  if (scope.eventId) {
    const e = events.find((x: any) => x.id === scope.eventId);
    return e ? `活動：${e.name}` : "選定活動";
  }
  if (scope.productId) {
    const p = products.find((x: any) => x.id === scope.productId);
    return p ? `產品：${p.name}` : "選定產品";
  }
  if (scope.brandId) {
    const b = brands.find((x: any) => x.id === scope.brandId);
    return b ? `品牌：${b.name}` : "選定品牌";
  }
  return "所有品牌";
}

/* ── PostsDrawer: fb/li/ig/yt history ──────────────────────────────────── */
function PostsDrawer({ item, scope, onBack }: { item: RailItem; scope: any; onBack: () => void }) {
  const meta = (item.drawer ? DRAWER_LABELS[item.drawer] : undefined) ?? { title: item.label, blurb: "" };
  const brands: any[] = (trpc as any).brand?.list?.useQuery
    ? (trpc as any).brand.list.useQuery(undefined, { staleTime: 60_000 })?.data ?? []
    : [];

  // Stub missions query — real impl would filter by scope + platform
  const STUB_POSTS = [
    { id: 1, title: "春季新品上市 — 開箱體驗", date: "2026-04-18", platform: "FB", status: "published" },
    { id: 2, title: "母親節限定優惠預告",       date: "2026-04-25", platform: "FB", status: "published" },
    { id: 3, title: "五月主打內容：品牌故事",   date: "2026-05-01", platform: "FB", status: "draft" },
  ];

  return (
    <DrawerShell icon={item.icon} categoryLabel="貼文歷史" title={meta.title} onBack={onBack}>
      <div className="p-4 space-y-3">
        {/* Scope badge */}
        <div className="flex items-center gap-1.5 text-tiny text-default-500">
          <FontAwesomeIcon icon={faFilter} className="text-tiny" />
          <span>
            {scope.eventId ? "活動貼文" : scope.productId ? "產品貼文" : scope.brandId ? "品牌貼文" : "全部貼文"}
          </span>
        </div>

        {/* Stub post cards */}
        {STUB_POSTS.map((p) => (
          <Card key={p.id} shadow="none" radius="md"
            className="border border-divider bg-content1 cursor-pointer hover:border-primary/50 hover:bg-content2 transition-colors">
            <CardBody className="px-3 py-2.5 flex flex-row items-center gap-3">
              <div className="w-9 h-9 rounded bg-default-100 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={item.icon} className="text-default-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-small font-medium truncate">{p.title}</div>
                <div className="text-tiny text-default-400">{p.date}</div>
              </div>
              <Chip size="sm" variant="flat"
                color={p.status === "published" ? "success" : "default"}
                className="shrink-0 text-tiny">
                {p.status === "published" ? "已發" : "草稿"}
              </Chip>
            </CardBody>
          </Card>
        ))}

        <DrawerEmpty
          icon={faFileLines}
          headline="連結更多貼文紀錄"
          sub="完成的 Mission 產出會自動歸檔至此。也可授權平台 OAuth 匯入現有貼文。"
          cta="從範本建立貼文"
          onCta={onBack}
        />
      </div>
    </DrawerShell>
  );
}

/* ── AssetsDrawer: fb/li/ig assets ─────────────────────────────────────── */
function AssetsDrawer({ item, scope, onBack }: { item: RailItem; scope: any; onBack: () => void }) {
  const meta = (item.drawer ? DRAWER_LABELS[item.drawer] : undefined) ?? { title: item.label, blurb: "" };
  const STUB_ASSETS = [
    { id: 1, name: "品牌 Logo 橫式.png",   type: "image", size: "240 KB", used: 12 },
    { id: 2, name: "春季主視覺 1080x1080", type: "image", size: "1.2 MB", used: 5 },
    { id: 3, name: "產品介紹影片 15s",      type: "video", size: "8.4 MB", used: 3 },
    { id: 4, name: "品牌色票 brandkit.json",type: "json",  size: "4 KB",  used: 0 },
  ];
  const typeIcon = (t: string) => t === "video" ? faVideo : t === "json" ? faFileLines : faImage;

  return (
    <DrawerShell icon={item.icon} categoryLabel="素材庫" title={meta.title} onBack={onBack}>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-tiny text-default-500">
          <FontAwesomeIcon icon={faFilter} className="text-tiny" />
          <span>{scope.eventId ? "活動素材" : scope.productId ? "產品素材" : scope.brandId ? "品牌素材" : "所有素材"}</span>
        </div>
        {STUB_ASSETS.map((a) => (
          <Card key={a.id} shadow="none" radius="md"
            className="border border-divider bg-content1 cursor-pointer hover:border-primary/50 hover:bg-content2 transition-colors">
            <CardBody className="px-3 py-2.5 flex flex-row items-center gap-3">
              <div className="w-9 h-9 rounded bg-default-100 flex items-center justify-center shrink-0 text-default-400">
                <FontAwesomeIcon icon={typeIcon(a.type)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-small font-medium truncate">{a.name}</div>
                <div className="text-tiny text-default-400">{a.size} · 使用 {a.used} 次</div>
              </div>
            </CardBody>
          </Card>
        ))}
        <Button size="sm" radius="full" variant="bordered" className="w-full text-tiny">
          上傳素材 +
        </Button>
      </div>
    </DrawerShell>
  );
}

/* ── CalendarDrawer: fb/li/ig/yt calendar ───────────────────────────────── */
function CalendarDrawer({ item, scope, onBack }: { item: RailItem; scope: any; onBack: () => void }) {
  const meta = (item.drawer ? DRAWER_LABELS[item.drawer] : undefined) ?? { title: item.label, blurb: "" };
  const STUB_SCHEDULED = [
    { id: 1, date: "2026-05-04", title: "母親節前哨 — 情感故事貼文",    status: "scheduled", pillar: "品牌溫度" },
    { id: 2, date: "2026-05-09", title: "母親節當天 — 限量組合促銷",   status: "scheduled", pillar: "產品轉換" },
    { id: 3, date: "2026-05-15", title: "週三深度文 — 選購指南",        status: "draft",     pillar: "知識教育" },
    { id: 4, date: "2026-05-18", title: "UGC 用戶故事 repost",          status: "scheduled", pillar: "社群互動" },
  ];
  const MARKET_EVENTS = [
    { date: "2026-05-09", name: "母親節", type: "holiday" },
    { date: "2026-05-04", name: "Star Wars Day", type: "trend" },
    { date: "2026-05-19", name: "519 光棍節 (TW)",  type: "trend" },
    { date: "2026-05-31", name: "台灣天氣轉夏",     type: "insight" },
  ];

  return (
    <DrawerShell icon={item.icon} categoryLabel="行事曆" title={meta.title} onBack={onBack}>
      <div className="p-4 space-y-4">
        {/* Scheduled items */}
        <div>
          <div className="text-tiny font-semibold text-default-500 uppercase tracking-wide mb-2">
            已排程（{STUB_SCHEDULED.length}）
          </div>
          <div className="space-y-2">
            {STUB_SCHEDULED.map((s) => (
              <Card key={s.id} shadow="none" radius="md"
                className="border border-divider bg-content1 cursor-pointer hover:border-primary/50 hover:bg-content2 transition-colors">
                <CardBody className="px-3 py-2 flex flex-row items-start gap-2">
                  <div className="text-tiny text-default-400 w-14 shrink-0 mt-0.5">{s.date.slice(5)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-small font-medium leading-snug truncate">{s.title}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Chip size="sm" variant="flat" color={s.status === "scheduled" ? "primary" : "default"}
                        className="text-tiny h-4">{s.status === "scheduled" ? "已排" : "草稿"}</Chip>
                      <span className="text-tiny text-default-400">{s.pillar}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        <Divider />

        {/* Market events & holidays */}
        <div>
          <div className="text-tiny font-semibold text-default-500 uppercase tracking-wide mb-2">
            市場節慶 &amp; 熱點
          </div>
          <div className="space-y-1.5">
            {MARKET_EVENTS.map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-medium hover:bg-content2 transition-colors cursor-default">
                <Chip size="sm" variant="flat"
                  color={e.type === "holiday" ? "warning" : e.type === "trend" ? "secondary" : "default"}
                  className="text-tiny shrink-0">
                  {e.date.slice(5)}
                </Chip>
                <span className="text-small text-foreground/90">{e.name}</span>
                {e.type === "trend" && (
                  <span className="ml-auto text-tiny text-default-400">熱點</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

/* ── AdsDrawer: fb-ads etc. ─────────────────────────────────────────────── */
function AdsDrawer({ item, scope, onBack }: { item: RailItem; scope: any; onBack: () => void }) {
  const meta = (item.drawer ? DRAWER_LABELS[item.drawer] : undefined) ?? { title: item.label, blurb: "" };
  return (
    <DrawerShell icon={item.icon} categoryLabel="廣告組" title={meta.title} onBack={onBack}>
      <DrawerEmpty
        icon={item.icon}
        headline="廣告組管理即將推出"
        sub="連結 Facebook / Google 廣告帳戶後，可在此檢視廣告組狀態、預算使用與受眾設定。"
        cta="返回範本"
        onCta={onBack}
      />
    </DrawerShell>
  );
}

/* ── LayerAssetDrawer: dispatcher ───────────────────────────────────────── */
function LayerAssetDrawer({
  item,
  scope,
  onBackToTemplates,
}: {
  item: RailItem;
  scope: any;
  onBackToTemplates: () => void;
}) {
  const drawer = item.drawer ?? "";

  // Route by drawer key suffix
  if (drawer.endsWith("-history") || drawer.endsWith("-posts")) {
    return <PostsDrawer item={item} scope={scope} onBack={onBackToTemplates} />;
  }
  if (drawer.endsWith("-assets") || drawer.endsWith("-reels")) {
    return <AssetsDrawer item={item} scope={scope} onBack={onBackToTemplates} />;
  }
  if (drawer.endsWith("-calendar")) {
    return <CalendarDrawer item={item} scope={scope} onBack={onBackToTemplates} />;
  }
  if (drawer.endsWith("-ads") || drawer.includes("ads")) {
    return <AdsDrawer item={item} scope={scope} onBack={onBackToTemplates} />;
  }

  // Fallback for any other layer drawers (yt-videos, pr-media, etc.)
  const meta = DRAWER_LABELS[drawer] ?? { title: item.label, blurb: "" };
  return (
    <DrawerShell icon={item.icon} categoryLabel="資產庫" title={meta.title} onBack={onBackToTemplates}>
      {meta.blurb && (
        <p className="px-4 pt-4 text-small text-default-500 leading-relaxed">{meta.blurb}</p>
      )}
      <DrawerEmpty
        icon={item.icon}
        headline="尚未有資料"
        sub="這個資產庫即將推出。目前可以先從範本開始一個 mission。"
        cta="從範本開始"
        onCta={onBackToTemplates}
      />
    </DrawerShell>
  );
}

/* ─────────────────────── BrandDrawer ───────────────────────────────────────
 * Left-rail "品牌" global tab.
 * Shows brand guidelines relevant to the current scope: voice, color, logo rules.
 */
function BrandDrawer({ scope, onBackToTemplates }: { scope: any; onBackToTemplates: () => void }) {
  const brandsQuery: any = (trpc as any).brand?.list?.useQuery
    ? (trpc as any).brand.list.useQuery(undefined, { staleTime: 60_000 })
    : { data: [], isLoading: false };
  const brands: any[] = brandsQuery.data ?? [];
  const brand = brands.find((b: any) => b.id === scope.brandId);

  const BRAND_SECTIONS = [
    { key: "voice",   label: "品牌語氣", icon: faFileLines,
      value: brand?.positioning?.brandVoice ?? brand?.positioning?.voice ?? "尚未設定" },
    { key: "colors",  label: "品牌色票", icon: faPalette,
      value: brand?.positioning?.primaryColor ? `主色：${brand.positioning.primaryColor}` : "尚未設定" },
    { key: "tagline", label: "核心主張", icon: faCircleCheck,
      value: brand?.positioning?.tagline ?? brand?.positioning?.usp ?? "尚未設定" },
    { key: "audience",label: "目標受眾", icon: faUsers,
      value: brand?.positioning?.targetAudience ?? "尚未設定" },
  ];

  return (
    <DrawerShell icon={faPalette} categoryLabel="品牌規範" title={brand?.name ?? "品牌"} onBack={onBackToTemplates}>
      <div className="p-4 space-y-3">
        {!scope.brandId ? (
          <DrawerEmpty
            icon={faPalette}
            headline="請先選擇品牌"
            sub="在上方 Scope Bar 選擇品牌後，即可查看品牌規範。"
          />
        ) : (
          <>
            {BRAND_SECTIONS.map((s) => (
              <Card key={s.key} shadow="none" radius="md" className="border border-divider bg-content1">
                <CardBody className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <FontAwesomeIcon icon={s.icon} className="text-default-400 text-tiny" />
                    <span className="text-tiny font-semibold text-default-500 uppercase tracking-wide">{s.label}</span>
                  </div>
                  <p className="text-small text-foreground/90 leading-relaxed line-clamp-3">{String(s.value)}</p>
                </CardBody>
              </Card>
            ))}
            <Button size="sm" radius="full" variant="bordered" className="w-full text-tiny">
              編輯品牌規範 →
            </Button>
          </>
        )}
      </div>
    </DrawerShell>
  );
}

/* ─────────────────────── RecentDrawer ──────────────────────────────────────
 * Left-rail "我的" global tab.
 * Shows the current user's recent missions.
 */
function RecentDrawer({ scope, onBackToTemplates }: { scope: any; onBackToTemplates: () => void }) {
  // Recent missions stub — real impl would call trpc.mission.listRecent
  const STUB_MISSIONS = [
    { id: 1, name: "5月 FB 月行事曆",        squad: "fb-monthly-calendar-pulizzi", updatedAt: "2026-05-01", status: "active" },
    { id: 2, name: "母親節活動系列貼文",      squad: "fb-event-series",              updatedAt: "2026-04-28", status: "done" },
    { id: 3, name: "Q2 LinkedIn 個人品牌",    squad: "li-thought-leadership",        updatedAt: "2026-04-20", status: "done" },
    { id: 4, name: "春季新品 IG Reel 系列",   squad: "ig-reel-series",               updatedAt: "2026-04-15", status: "done" },
  ];

  return (
    <DrawerShell icon={faClockRotateLeft} categoryLabel="我的任務" title="最近任務" onBack={onBackToTemplates}>
      <div className="p-4 space-y-2">
        {STUB_MISSIONS.map((m) => (
          <Card key={m.id} shadow="none" radius="md"
            className="border border-divider bg-content1 cursor-pointer hover:border-primary/50 hover:bg-content2 transition-colors">
            <CardBody className="px-3 py-2.5 flex flex-row items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-small font-medium truncate">{m.name}</div>
                <div className="text-tiny text-default-400 mt-0.5">{m.squad} · {m.updatedAt}</div>
              </div>
              <Chip size="sm" variant="flat"
                color={m.status === "active" ? "primary" : "success"}
                className="text-tiny shrink-0 mt-0.5">
                {m.status === "active" ? "進行中" : "完成"}
              </Chip>
            </CardBody>
          </Card>
        ))}
        <Button size="sm" radius="full" variant="bordered" className="w-full text-tiny mt-2">
          查看全部任務 →
        </Button>
      </div>
    </DrawerShell>
  );
}

/* ─────────────────────── UploadDrawer ──────────────────────────────────────
 * Left-rail "上傳" global tab.
 * Dropzone to upload brand assets into the scope's asset library.
 */
function UploadDrawer({ scope, onBackToTemplates }: { scope: any; onBackToTemplates: () => void }) {
  const [dragging, setDragging] = React.useState(false);

  return (
    <DrawerShell icon={faUpload} categoryLabel="上傳素材" title="新增素材" onBack={onBackToTemplates}>
      <div className="p-4 space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); }}
          className={[
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-divider bg-content2/30 hover:bg-content2/60",
          ].join(" ")}
        >
          <FontAwesomeIcon icon={faUpload} className="text-2xl text-default-300 mb-3" />
          <p className="text-small font-semibold text-foreground/80">拖曳檔案至此上傳</p>
          <p className="text-tiny text-default-400 mt-1">支援 PNG、JPG、MP4、PDF、JSON</p>
          <Button size="sm" radius="full" color="primary" className="mt-4">
            選擇檔案
          </Button>
        </div>

        {/* Tips */}
        <div className="space-y-1.5">
          {[
            "上傳品牌 Logo（建議 SVG 或 PNG 透明背景）",
            "上傳視覺規範 PDF 或 brandkit.json",
            "上傳過往高互動貼文截圖供 AI 參考",
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-tiny text-default-500">
              <span className="mt-0.5 text-default-300">•</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}

/* ─────────────────────── MembersDrawer ─────────────────────────────────────
 * Left-rail "成員" global tab.
 * Shows the agents that belong to the current workspace / squads —
 * Canva analogy: the "Brand" panel that shows saved colours / fonts.
 * Phase 1: agent roster from squads already loaded; invite CTA placeholder.
 */
function MembersDrawer({ onBackToTemplates }: { onBackToTemplates: () => void }) {
  // Pull agents from the squads query via context — use trpc directly
  const agentsQuery: any = (trpc.agent as any)?.list?.useQuery
    ? (trpc.agent as any).list.useQuery(undefined, { staleTime: 60_000 })
    : { data: null, isLoading: false };

  const agents: any[] = agentsQuery.data ?? [];

  // Role groupings for display
  const ROLE_ORDER = ["Squad Lead", "Researcher", "Strategist", "Writer", "Visual", "Analyst", "Reviewer"];
  const grouped = ROLE_ORDER.reduce<Record<string, any[]>>((acc, r) => {
    const matched = agents.filter((a: any) =>
      (a.primarySkill ?? a.role ?? "").toLowerCase().includes(r.toLowerCase())
    );
    if (matched.length) acc[r] = matched;
    return acc;
  }, {});
  const ungrouped = agents.filter((a: any) =>
    !ROLE_ORDER.some((r) => (a.primarySkill ?? a.role ?? "").toLowerCase().includes(r.toLowerCase()))
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-tiny text-default-500">小組成員 / Members</div>
          <div className="font-semibold text-medium text-foreground">
            {agents.length > 0 ? `${agents.length} 位 AI Agent` : "成員"}
          </div>
        </div>
        <Button
          size="sm" variant="light" radius="sm"
          onPress={onBackToTemplates}
          className="text-tiny h-6 min-w-0 px-2 shrink-0 ml-2"
        >
          ← 範本
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {agentsQuery.isLoading && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl border border-divider bg-content1/60 px-3 flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-divider/60 shrink-0" />
                <div className="flex-1">
                  <div className="h-2.5 w-2/3 rounded bg-divider/50 mb-1.5" />
                  <div className="h-2 w-1/3 rounded bg-divider/40" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!agentsQuery.isLoading && agents.length === 0 && (
          <Card shadow="none" radius="lg" className="border border-dashed border-divider bg-content2/40">
            <CardBody className="p-5 text-center">
              <div className="text-3xl mb-2 text-default-400">👥</div>
              <div className="text-small font-semibold mb-1">尚無成員</div>
              <div className="text-tiny text-default-500 leading-snug mb-4">
                AI agent 小組成員會在這裡顯示。<br />你可以在方法論中看到每個 agent 的角色分工。
              </div>
              <Button size="sm" radius="full" color="primary" onPress={onBackToTemplates}>
                從範本開始
              </Button>
            </CardBody>
          </Card>
        )}

        {/* Grouped agent list */}
        {Object.entries(grouped).map(([role, list]) => (
          <div key={role} className="space-y-1.5">
            <p className="text-[10px] font-semibold text-default-400 uppercase tracking-wider px-1">{role}</p>
            {list.map((a: any, i: number) => (
              <AgentRow key={a.id ?? i} agent={a} />
            ))}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-default-400 uppercase tracking-wider px-1">其他</p>
            {ungrouped.map((a: any, i: number) => (
              <AgentRow key={a.id ?? i} agent={a} />
            ))}
          </div>
        )}

        {/* Invite CTA — placeholder */}
        <div className="pt-2 border-t border-divider">
          <Button
            size="sm" radius="full" variant="bordered"
            className="w-full text-default-500"
            isDisabled
            startContent={<span>+</span>}
          >
            邀請成員（即將推出）
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent }: { agent: any }) {
  const name = agent.name ?? agent.displayName ?? "—";
  const role = agent.primarySkill ?? agent.role ?? "";
  const platform = agent.workspace ?? agent.platform ?? "";
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-default-100 transition cursor-default">
      <AgentAvatar seed={agent.id ?? name} size={32} className="rounded-full shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-foreground truncate">{name}</p>
        <p className="text-tiny text-default-500 truncate">{role}{platform ? ` · ${platform}` : ""}</p>
      </div>
    </div>
  );
}
