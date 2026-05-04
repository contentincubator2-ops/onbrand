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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import { inferMockupVariant, getVariantsForPlatform, inferStepKind, aggregateMockupFields, type MockupVariant } from "../lib/inferMockup";
import { searchAndRankSquads } from "../lib/searchSquads";
import { useSemanticSearch } from "../lib/useSemanticSearch";
import { IntakeChat } from "../components/IntakeChat";
import { BriefPanel, LAYER_TAB_IDS } from "../components/BriefPanel";
import { getOutputTypeMeta } from "../lib/outputTypes";
import { useMissionStream, buildSlotMapFromProgress } from "../lib/useMissionStream";
import { PlatformMockup } from "../components/PlatformMockup";
import { DocMockup } from "../components/PlatformMockup/doc";
import { CalendarGridMockup } from "../components/SquadMockups/calendar";
import MediaGenFlow from "../components/media/MediaGenFlow";
import ImageSlotFlow from "../components/media/ImageSlotFlow";
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

type RailKind = "global" | "layer" | "connections" | "brief";
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

// Section labels shown above each group in the icon rail
const RAIL_SECTION_LABELS: Partial<Record<RailKind, string>> = {
  brief: "詳情",
  connections: "連結",
};

// Icon map for brief tab items — uses icons already imported in PickerWorkspace
const BRIEF_TAB_ICONS: Record<string, any> = {
  _summary:    faClipboardCheck,
  brand:       faPalette,
  competitors: faChessKnight,
  audience:    faUsers,
  product:     faBox,
  pricing:     faMoneyBillWave,
  channel:     faHashtag,
  content:     faImage,
  campaign:    faCalendarDays,
  metrics:     faChartLine,
  audit:       faRankingStar,
  persona:     faUserTie,
};

const RAIL_TOP: RailItem[] = [
  { key: "templates", label: "範本", icon: faTableCells, kind: "global" },
];

const RAIL_BOTTOM: RailItem[] = [
  { key: "brand",   label: "品牌", icon: faPalette,        kind: "connections" },
  { key: "members", label: "成員", icon: faUserGroup,      kind: "connections" },
  { key: "recent",  label: "我的", icon: faClockRotateLeft, kind: "connections" },
  { key: "upload",  label: "上傳", icon: faUpload,         kind: "connections" },
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
  linkedin:  ["linkedin", "linkedin-post"],
  youtube:   ["youtube", "yt", "shorts", "yt-shorts"],
  pr:        ["pr", "public-relations", "media-relations", "press"],
  email:     ["email", "edm", "newsletter", "mailer"],
};

/** Word-boundary-aware alias test: alias "fb" should match "fb" or "fb-page"
 *  but NOT "afb" or embedded substrings.  We split the haystack on
 *  non-alphanumeric chars so short tokens ("ig", "yt", "fb") only match
 *  standalone tokens, not parts of longer words like "analytics". */
function aliasMatchesHaystack(aliases: string[], haystack: string): boolean {
  const tokens = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
  return aliases.some((a) => {
    // If alias contains a hyphen it's a compound token — check as substring
    // of the full haystack (e.g. "ig-reels" lives as one token in wsArr).
    if (a.includes("-")) return haystack.includes(a);
    return tokens.has(a);
  });
}

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

  // Session 3 — server-side semantic search (debounced, 350 ms).
  // When the server returns hits, they override the client-side ranking.
  // Client-side searchAndRankSquads() still runs as immediate pre-result.
  const { semanticHits, isSearching: isSemanticSearching } = useSemanticSearch(q, "squad");

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
      if (!aliasMatchesHaystack(aliases, channelHaystack)) return false;
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
        if (!aliasMatchesHaystack(aliases, String(t.workspace ?? "").toLowerCase())) return false;
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

  // Client-side keyword ranking (runs immediately, acts as pre-result while
  // server semantic search is in flight, and as fallback when server returns 0 hits).
  const searchResult = useMemo(() => searchAndRankSquads(allSquads, q), [allSquads, q]);
  const bestMatchSlugs = useMemo(
    () => new Set(searchResult.hits.filter((h) => h.isBestMatch).map((h) => h.squad.slug)),
    [searchResult],
  );

  const filtered = useMemo(() => {
    const ql = q.trim();
    if (!ql) {
      // No query — facet-only filter, original order
      return allSquads.filter(passesFacets);
    }

    // Session 3: prefer server semantic hits when available.
    // Map semantic hit slugs back to full squad objects from allSquads so
    // we get the complete squad shape (steps, workspace, etc.).
    if (semanticHits && semanticHits.length > 0) {
      const slugSet = new Map(semanticHits.map((h) => [h.slug, true]));
      const squadMap = new Map(allSquads.map((s) => [s.slug, s]));
      const semantic = semanticHits
        .map((h) => squadMap.get(h.slug) ?? null)
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .filter(passesFacets);
      // Append any client-side hits NOT already in semantic results as overflow
      const overflow = searchResult.hits
        .map((h) => h.squad)
        .filter((s) => !slugSet.has(s.slug))
        .filter(passesFacets);
      return [...semantic, ...overflow];
    }

    // Fall back to client-side keyword ranking
    return searchResult.hits.map((h) => h.squad).filter(passesFacets);
  }, [allSquads, q, semanticHits, searchResult, layerFilter, channelFilter]);

  const selectedSquad = useMemo(
    () => filtered.find((s) => s.slug === selectedSlug)
      ?? allSquads.find((s) => s.slug === selectedSlug)
      ?? null,
    [filtered, allSquads, selectedSlug],
  );

  // Compute primaryOutputKind from selectedSquad for SquadIntakeSidebar
  const primaryOutputKind_outer: "calendar" | "pillar" | "research" | "qa" | "doc" | "post" = useMemo(() => {
    const stepsArr: any[] = Array.isArray(selectedSquad?.steps) ? selectedSquad.steps : [];
    const allVariants: string[] = stepsArr.map((s: any) => s.mockupVariant ?? "").filter(Boolean);
    if (allVariants.some((v: string) => v.includes("Calendar"))) return "calendar";
    if (allVariants.some((v: string) => v.includes("Pillar")))   return "pillar";
    if (allVariants.some((v: string) => v.includes("Research"))) return "research";
    if (allVariants.every((v: string) => v.includes("QA") || v.includes("Intake"))) return "qa";
    return "post";
  }, [selectedSquad]);

  // ── Auto-select first squad when filter changes & nothing chosen
  useEffect(() => {
    if (!selectedSlug && filtered.length > 0) {
      setSelectedSlug(filtered[0].slug);
    }
  }, [filtered, selectedSlug]);

  // ── Auto-switch to brief 摘要 tab when a squad is selected ──────────
  // When user clicks a squad card, jump them to the 摘要 brief tab.
  // Going back (← 所有方法論) clears selectedSlug and resets.
  useEffect(() => {
    if (selectedSlug) {
      setActiveRailKey("brief__summary");
    }
  }, [selectedSlug]);

  // ── Mission creation ────────────────────────────────────────────────
  const createMission = trpc.mission.create.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming intake preview text (from IntakeChat.onPreviewChunk)
  const [previewText, setPreviewText] = useState("");

  const launchSquad = async (sq: any, intakeSummary?: string) => {
    setError(null);
    setBusy(true);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || channelFilter || "";

      // Build description: intake summary (from chat) + user brief + per-step agent notes.
      const baseDesc = intakeSummary?.trim() || missionBrief.trim() || safeLocalizedText(sq.description, lang) || "";
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
    if (activeMissionId && selectedSquad) {
      const squadName = pickLocaleText(selectedSquad.name, lang) || selectedSquad.slug;
      return `任務執行中 — ${squadName}`;
    }
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
          aliasMatchesHaystack(aliases, String(w).toLowerCase())
        )) return key;
      }
    }
    return null;
  }, [channelFilter, selectedSquad]);

  /** Currently visible rail items — simplified:
   *  範本 | 摘要 (when squad selected) | 品牌 · 成員 · 我的 · 上傳
   *  Layer-specific drawers (頻道/素材/行事曆…) removed per CJ 2026-05-04:
   *  all brief info lives in the single 摘要 panel. */
  const railItems = useMemo(() => {
    const topItems: RailItem[]        = RAIL_TOP;  // 範本
    const briefItems: RailItem[]      = selectedSquad ? [{
      key:   "brief__summary",
      label: "摘要",
      icon:  faClipboardCheck,
      kind:  "brief" as RailKind,
    }] : [];
    const connectionItems: RailItem[] = RAIL_BOTTOM; // 品牌 · 成員 · 我的 · 上傳
    return [...topItems, ...briefItems, ...connectionItems];
  }, [selectedSquad]);

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
          <Tooltip content="新增品牌 / 產品 / 活動" placement="bottom" radius="sm">
            <Button
              size="sm" variant="flat" radius="full" isIconOnly
              className="text-default-400 hover:text-foreground h-7 w-7 min-w-7"
              onPress={() => window.location.href = "/settings/brands"}
              aria-label="新增品牌"
            >
              <span className="text-sm font-bold">＋</span>
            </Button>
          </Tooltip>
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
            const isNewSection = !prev || prev.kind !== it.kind;
            const sectionLabel = isNewSection ? RAIL_SECTION_LABELS[it.kind] : undefined;
            return (
              <React.Fragment key={it.key}>
                {isNewSection && !!prev && (
                  <div className="mx-3 mt-2 mb-0.5 border-t border-divider/60" />
                )}
                {sectionLabel && (
                  <p className="text-[9px] font-semibold text-default-400 uppercase tracking-widest text-center mt-1 mb-0.5 leading-none">
                    {sectionLabel}
                  </p>
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
          ) : activeRailKey.startsWith("brief_") && selectedSquad ? (
            <BriefPanel
              layer={String(selectedSquad.strategy_layer ?? selectedSquad.strategyLayer ?? "L1").slice(0, 2)}
              squadSlug={selectedSquad.slug}
              squadName={selectedSquad.name}
              brandId={brandId}
              brandName={brands.find((b: any) => b.id === brandId)?.name ?? null}
              productName={scope.productId ? brands.find((b: any) => b.id === brandId)?.name ?? null : null}
              eventName={null}
              activeTabId={activeRailKey.slice(6) /* strip "brief_" */}
              onTabChange={(tabId) => setActiveRailKey(`brief_${tabId}`)}
              onLaunch={(briefValues) => {
                const summary = Object.entries(briefValues)
                  .filter(([, v]) => v.trim())
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n");
                launchSquad(selectedSquad, summary);
              }}
              onBack={() => { setSelectedSlug(null); setActiveRailKey("templates"); setPreviewText(""); }}
            />
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
              startContent={
                isSemanticSearching
                  ? <span className="w-3 h-3 rounded-full border-2 border-default-400 border-t-transparent animate-spin ml-1" />
                  : <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />
              }
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
                lang={lang}
                workspace={effectiveChannel}
                brandName={brands.find((b: any) => b.id === brandId)?.name ?? null}
                missionId={activeMissionId}
                intakePreviewText={previewText}
                onMissionEnd={() => {
                  setActiveMissionId(null);
                  setPreviewText("");
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
        <h3 className="text-[11px] font-semibold text-default-400 uppercase tracking-widest">{title}</h3>
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
  const canRun = isSquad ? !!task.squad_id : !!task.agent_id;
  const disabled = !canRun;
  const desc = (task.description ?? "").slice(0, 60);
  return (
    <Card
      isPressable={!disabled}
      shadow="none"
      radius="md"
      onPress={!disabled ? onClick : undefined}
      className={[
        "w-full text-left border transition",
        active ? "border-foreground bg-content2 shadow-sm" : "border-default-200 hover:border-default-400",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <CardBody className="p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-small font-semibold text-foreground line-clamp-1">{task.name_zh}</div>
            {desc && <div className="text-tiny text-default-400 line-clamp-1 mt-0.5">{desc}</div>}
          </div>
          <div className="flex gap-1 shrink-0">
            <Chip size="sm" variant="flat"
              color={isComingSoon ? "warning" : "success"}
              className="h-4 text-tiny">
              {isComingSoon ? "設計中" : "上線"}
            </Chip>
            <Chip size="sm" variant="flat"
              color={isSquad ? "primary" : "secondary"}
              className="h-4 text-tiny">
              {isSquad ? "squad" : "atomic"}
            </Chip>
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
  const author = squad.methodology?.author;
  const desc = (pickLocaleText(squad.description, lang) ?? "").slice(0, 60);

  return (
    <Card
      isPressable
      isHoverable
      shadow="none"
      radius="md"
      onPress={onClick}
      className={[
        "w-full border transition",
        active
          ? "border-foreground shadow-sm bg-content2"
          : "border-default-200 hover:border-default-400",
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
          <div className="text-tiny text-default-400 line-clamp-1 mt-0.5">
            {author ?? tone.label}{desc ? ` — ${desc}` : ""}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────── Sub: SquadIntakeSidebar ────────────────────────
 * Shows in the 380px middle column when a squad is selected.
 * Contains the intake form + sticky launch footer.
 */

// Platform auth configs — what authorization each platform needs
const PLATFORM_AUTH: Record<string, {
  label: string; icon: any; fieldLabel: string;
  placeholder: string; helpText: string; btnLabel: string;
}> = {
  facebook:  {
    label: "Facebook 粉絲團",
    icon: faFacebook,
    fieldLabel: "粉絲團名稱或 Page ID",
    placeholder: "例如：@YourBrand 或 123456789",
    helpText: "Agent 需要讀取粉絲團的過往貼文與互動數據，才能產出量身定制的內容行事曆。",
    btnLabel: "授權 Facebook 粉絲團 →",
  },
  instagram: {
    label: "Instagram 帳號",
    icon: faInstagram,
    fieldLabel: "IG 帳號名稱",
    placeholder: "例如：@yourbrand",
    helpText: "Agent 需要讀取 IG 帳號的貼文歷史與互動率，才能優化內容策略。",
    btnLabel: "授權 Instagram 帳號 →",
  },
  linkedin:  {
    label: "LinkedIn 帳號",
    icon: faLinkedin,
    fieldLabel: "LinkedIn 個人或公司頁面 URL",
    placeholder: "https://www.linkedin.com/in/yourname",
    helpText: "Agent 需要分析你的 LinkedIn 現有貼文風格，才能維持一致的專業語氣。",
    btnLabel: "授權 LinkedIn 帳號 →",
  },
  youtube:   {
    label: "YouTube 頻道",
    icon: faYoutube,
    fieldLabel: "頻道名稱或 URL",
    placeholder: "https://www.youtube.com/@yourchannel",
    helpText: "Agent 需要讀取頻道數據與影片庫，才能規劃最優化的內容排程。",
    btnLabel: "授權 YouTube 頻道 →",
  },
};

function SquadIntakeSidebar({
  squad, lang, workspace,
  missionTitle, setMissionTitle,
  missionBrief, setMissionBrief,
  brandName, busy, error,
  missionId, onLaunch, onBack, primaryOutputKind,
}: {
  squad: any;
  lang: "zh-TW" | "en";
  workspace: string | null;
  missionTitle: string;
  setMissionTitle: (s: string) => void;
  missionBrief: string;
  setMissionBrief: (s: string) => void;
  brandName: string | null;
  busy: boolean;
  error: string | null;
  missionId: number | null;
  onLaunch: () => void;
  onBack: () => void;
  primaryOutputKind: "calendar" | "pillar" | "research" | "qa" | "doc" | "post";
}) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const author = squad.methodology?.author;
  const year = squad.methodology?.year;
  const members: any[] = Array.isArray(squad.members) ? squad.members : [];
  const wsKey = workspace ?? (Array.isArray(squad.workspace) ? squad.workspace[0] : squad.workspace) ?? null;
  const wsMeta = wsKey ? WORKSPACE_META[wsKey] : null;
  const platformAuth = wsKey ? PLATFORM_AUTH[wsKey] : null;

  // Platform authorization local state
  const [platformHandle, setPlatformHandle] = useState<string>("");
  const [platformAuthorized, setPlatformAuthorized] = useState<boolean>(false);
  const [platformAccountId, setPlatformAccountId] = useState<string>("");
  const [platformAuthBusy, setPlatformAuthBusy] = useState<boolean>(false);
  const [platformAuthError, setPlatformAuthError] = useState<string | null>(null);

  const getConnectToken = trpc.platformConnect.getConnectToken.useMutation();

  async function handlePlatformAuth() {
    if (!wsKey || !platformAuth) return;
    setPlatformAuthBusy(true);
    setPlatformAuthError(null);
    try {
      const { token, appSlug, expiresAt, env } = await getConnectToken.mutateAsync({
        platform: wsKey as "facebook" | "instagram" | "linkedin" | "youtube",
      });
      // Dynamically import Pipedream SDK (browser-specific entry) to keep bundle small
      const { PipedreamClient } = await import("@pipedream/sdk/browser");
      const pd = new PipedreamClient({
        projectEnvironment: env as "production" | "development",
        externalUserId: `sowork-user`,
        tokenCallback: async () => ({ token, expiresAt: new Date(expiresAt || Date.now() + 300_000), connectLinkUrl: "" }),
      });
      const accountId = await new Promise<string>((resolve, reject) => {
        pd.connectAccount({
          app: appSlug,
          onSuccess: (res) => resolve(res.id),
          onError: (err) => reject(new Error(String(err))),
          onClose: ({ successful }) => {
            if (!successful) reject(new Error("視窗已關閉"));
          },
        });
      });
      setPlatformAccountId(accountId);
      setPlatformHandle(accountId);
      setPlatformAuthorized(true);
      setPlatformAuthBusy(false);
    } catch (e: any) {
      setPlatformAuthError(e?.message ?? "無法取得授權憑證，請稍後再試");
      setPlatformAuthBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-default-200">
        <button
          className="flex items-center gap-1.5 text-tiny text-default-400 hover:text-foreground transition mb-3"
          onClick={onBack}
        >
          ← 所有方法論
        </button>
        <h2 className="font-semibold text-[15px] leading-snug tracking-tight">{name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {wsMeta && (
            <Chip size="sm" variant="flat" color="default"
              startContent={<FontAwesomeIcon icon={wsMeta.icon} className="text-tiny ml-1" />}>
              {wsMeta.label}
            </Chip>
          )}
          <Chip size="sm" variant="flat"
            style={{ background: `${tone.bg}1A`, color: tone.bg }}
            startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}>
            {lk}
          </Chip>
          {(author || year) && (
            <Chip size="sm" variant="flat"
              startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}>
              {author ?? "—"}{year ? ` · ${year}` : ""}
            </Chip>
          )}
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        <Input
          label="任務名稱 *"
          labelPlacement="outside"
          variant="bordered" radius="md" size="sm"
          placeholder="幫這次任務取個名字"
          value={missionTitle}
          onValueChange={setMissionTitle}
          isRequired
          isReadOnly={!!missionId}
          startContent={<FontAwesomeIcon icon={faBullseye} className="text-tiny text-default-400" />}
        />

        {primaryOutputKind === "calendar" && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" size="sm" variant="bordered" radius="md"
              label="開始日期" labelPlacement="outside"
              isReadOnly={!!missionId} />
            <Input type="date" size="sm" variant="bordered" radius="md"
              label="結束日期" labelPlacement="outside"
              isReadOnly={!!missionId} />
          </div>
        )}

        <Textarea
          label="說明 / 重點（可選）"
          labelPlacement="outside"
          variant="bordered" radius="md" size="sm"
          placeholder="這次想做什麼、給誰、為什麼？"
          minRows={3} maxRows={5}
          value={missionBrief}
          onValueChange={setMissionBrief}
          isReadOnly={!!missionId}
        />

        <Divider />

        {/* 內容來源 */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-default-400 uppercase tracking-widest">內容來源</p>
          {brandName ? (
            <div className="flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-xl border-l-4 border-success bg-success-50/40">
              <FontAwesomeIcon icon={faBrain} className="text-success text-sm shrink-0" />
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

        {/* Platform authorization — shown when squad has a known platform workspace */}
        {platformAuth && (
          <>
            <Divider />
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-semibold text-default-400 uppercase tracking-widest">平台授權</p>
                {!platformAuthorized && (
                  <Chip size="sm" variant="flat" color="warning" className="text-tiny">必填</Chip>
                )}
              </div>
              <p className="text-tiny text-default-500 leading-relaxed">{platformAuth.helpText}</p>
              {platformAuthorized ? (
                <div className="flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-xl border-l-4 border-primary bg-primary-50/30">
                  <FontAwesomeIcon icon={platformAuth.icon} className="text-primary text-sm shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-semibold truncate">{platformHandle || platformAuth.label}</p>
                    <p className="text-tiny text-default-400">已授權，Agent 可讀取數據</p>
                  </div>
                  <Button size="sm" variant="light" color="danger" className="text-tiny shrink-0 h-6 px-2"
                    onPress={() => { setPlatformAuthorized(false); setPlatformHandle(""); }}>
                    移除
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    size="sm" variant="bordered" radius="md"
                    label={platformAuth.fieldLabel}
                    labelPlacement="outside"
                    placeholder={platformAuth.placeholder}
                    value={platformHandle}
                    onValueChange={setPlatformHandle}
                    isReadOnly={!!missionId}
                    startContent={<FontAwesomeIcon icon={platformAuth.icon} className="text-default-400 text-tiny" />}
                  />
                  <Button
                    size="sm" variant="bordered" radius="md"
                    color="primary" className="w-full text-tiny"
                    isDisabled={!!missionId || platformAuthBusy}
                    isLoading={platformAuthBusy}
                    onPress={handlePlatformAuth}
                    startContent={!platformAuthBusy && <FontAwesomeIcon icon={platformAuth.icon} />}
                  >
                    {platformAuthBusy ? "等待授權中…" : platformAuth.btnLabel}
                  </Button>
                  {platformAuthError && (
                    <p className="text-tiny text-danger text-center">{platformAuthError}</p>
                  )}
                  <p className="text-tiny text-default-400 text-center">
                    或跳過（Agent 將使用品牌資料推導，不讀取平台數據）
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* 小組成員 */}
        {members.length > 0 && (
          <>
            <Divider />
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-default-400 uppercase tracking-widest">小組成員</p>
              <div className="space-y-1.5">
                {members.slice(0, 5).map((m: any, i: number) => (
                  <div key={m.id ?? i} className="flex items-center gap-2">
                    <AgentAvatar seed={m.id ?? m.name ?? `m${i}`} role={m.role ?? m.name ?? ""} size={24} className="rounded-full shrink-0" />
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
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 px-4 py-3 border-t border-default-200 space-y-2">
        {error && <Alert color="danger" variant="flat" title={error} />}
        {!missionId ? (
          <Button
            color="primary" size="lg" radius="lg"
            className="w-full font-semibold"
            isLoading={busy}
            isDisabled={!missionTitle.trim() && !name}
            onPress={onLaunch}
            startContent={!busy && <FontAwesomeIcon icon={faRocket} />}
          >
            {busy ? "啟動中…" : "派出小組 →"}
          </Button>
        ) : (
          <div className="space-y-1.5">
            <Progress size="sm" value={100} color="primary" aria-label="任務進行中" isIndeterminate />
            <p className="text-tiny text-default-500 text-center">任務進行中</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Sub: FeedbackPanel ─────────────────────────────
 * Right 280px panel: Squad Lead consultation chat with model selector.
 * User can pick which LLM powers the Squad Lead — same pattern as image gen.
 */

type ChatMsg = { role: "user" | "assistant"; text: string; ts: string; model?: string };

/** Models available for Squad Lead chat */
const SL_MODELS: Array<{ id: string; label: string; description: string; badge?: string; provider?: string }> = [
  { id: "auto",               label: "Auto",           description: "自動選擇最佳模型",                        badge: "推薦" },
  { id: "hermes",             label: "Hermes",         description: "你訓練的 Agent，帶完整人設 + 1,879 skills", badge: "本地", provider: "hermes" },
  { id: "claude-sonnet-4-6",  label: "Claude Sonnet",  description: "策略分析最強，適合深度諮詢" },
  { id: "gpt-5.4-mini",       label: "GPT-5.4 mini",   description: "快速回覆，適合即時問答" },
  { id: "Kimi-K2.5",          label: "Kimi K2.5",      description: "繁中最佳，理解品牌語境" },
  { id: "DeepSeek-V3.2",      label: "DeepSeek V3",    description: "邏輯推理強，適合競品分析" },
  { id: "qwen-plus",          label: "Qwen Plus",      description: "阿里雲，中文語境優化" },
];

function FeedbackPanel({
  missionId, steps, progressByOrd, activeStepOrder, stepExecute, squadName,
}: {
  missionId: number | null;
  steps: any[];
  progressByOrd: Map<number, any>;
  activeStepOrder: number;
  stepExecute: any;
  squadName?: string;
}) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const callModel = trpc.squadLead.chat.useMutation();

  const confirmedCount = Array.from(progressByOrd.values()).filter((p: any) => p?.status === "confirmed").length;
  const currentStep = steps[activeStepOrder - 1];

  const activeModelMeta = SL_MODELS.find((m) => m.id === selectedModel) ?? SL_MODELS[0];

  // Greeting shown on first open
  const greeting = useMemo(() => {
    const lead = squadName ? `我是「${squadName}」的 Squad Lead` : "我是你的 Squad Lead";
    return `👋 ${lead}。任務進行中有任何問題，或想調整策略方向，直接告訴我。`;
  }, [squadName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, isThinking]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const ts = new Date().toLocaleTimeString("zh-TW");
    setMsgs((prev) => [...prev, { role: "user", text, ts }]);
    setIsThinking(true);

    try {
      const stepCtx = currentStep
        ? `目前執行到：Step ${activeStepOrder} — ${currentStep.name ?? currentStep.title ?? "未知步驟"}。`
        : "";
      const progressCtx = steps.length
        ? `整體進度：${confirmedCount}/${steps.length} 步驟完成。`
        : "";

      // Hermes gets the full session context — all steps, all progress, entire chat history
      const isHermes = selectedModel === "hermes";
      const systemPrompt = isHermes
        ? [
            `## 當前任務 Session`,
            squadName ? `小組名稱：${squadName}` : "",
            stepCtx,
            progressCtx,
            steps.length ? `\n## 所有步驟\n${steps.map((s: any, i: number) => {
              const ord = i + 1;
              const prog = progressByOrd.get(ord);
              const status = prog?.status ?? "pending";
              return `  Step ${ord}: ${s.name ?? s.title ?? "未命名"} [${status}]`;
            }).join("\n")}` : "",
            msgs.length ? `\n## 對話紀錄（最近 ${Math.min(msgs.length, 10)} 則）\n${msgs.slice(-10).map((m) => `${m.role === "user" ? "用戶" : "你"}: ${m.text}`).join("\n")}` : "",
          ].filter(Boolean).join("\n")
        : `你是一位行銷小組的 Squad Lead，負責回答使用者關於目前任務的任何問題。${stepCtx}${progressCtx}請用繁體中文，簡潔、專業地回覆。`;

      const modelToUse = selectedModel === "auto" ? undefined : selectedModel;
      const providerToUse = isHermes ? "hermes" : undefined;

      let reply = "";
      const result = await callModel.mutateAsync({
        message: text,
        system: systemPrompt,
        model: modelToUse,
        provider: providerToUse,
        messages: isHermes
          // Hermes already has full history in system prompt — send only current turn
          ? []
          : msgs.map((m) => ({ role: m.role, content: m.text })),
      });
      reply = result?.content ?? result?.text ?? "收到，我正在處理你的問題。";
      setMsgs((prev) => [...prev, {
        role: "assistant",
        text: reply,
        ts: new Date().toLocaleTimeString("zh-TW"),
        model: activeModelMeta.label,
      }]);
    } catch {
      setMsgs((prev) => [...prev, {
        role: "assistant",
        text: "抱歉，目前無法連線，請稍後再試。",
        ts: new Date().toLocaleTimeString("zh-TW"),
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <aside className="flex flex-col h-full border-l border-default-200 bg-content1">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2.5 border-b border-default-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-tiny font-bold shrink-0">
            SL
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-small leading-tight">Squad Lead</p>
            <p className="text-tiny text-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              在線
            </p>
          </div>
          {/* Model selector trigger */}
          <Tooltip content="切換 AI 模型" placement="left" size="sm">
            <button
              onClick={() => setShowModelPicker((v) => !v)}
              className={[
                "shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all border",
                showModelPicker
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-default-100 text-default-500 border-transparent hover:border-default-300",
              ].join(" ")}
            >
              <FontAwesomeIcon icon={faBrain} className="text-[9px]" />
              {activeModelMeta.label}
            </button>
          </Tooltip>
        </div>

        {/* Model picker panel */}
        {showModelPicker && (
          <div className="mt-2 border border-default-200 rounded-xl overflow-hidden bg-background shadow-sm">
            <div className="px-3 py-1.5 border-b border-default-100">
              <p className="text-[10px] text-default-400 font-medium uppercase tracking-wider">選擇 AI 模型</p>
            </div>
            <div className="divide-y divide-default-100">
              {SL_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                  className={[
                    "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors",
                    selectedModel === m.id ? "bg-primary/5" : "hover:bg-default-50",
                  ].join(" ")}
                >
                  <div className={[
                    "w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
                    selectedModel === m.id ? "border-primary bg-primary" : "border-default-300",
                  ].join(" ")}>
                    {selectedModel === m.id && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-tiny font-medium text-foreground">{m.label}</span>
                      {m.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{m.badge}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-default-400 leading-tight mt-0.5">{m.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {/* Greeting bubble */}
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shrink-0 mt-0.5" style={{ fontSize: 9 }}>
            SL
          </div>
          <div className="bg-default-100 rounded-xl rounded-tl-sm px-3 py-2 max-w-[200px]">
            <p className="text-tiny text-foreground leading-relaxed">{greeting}</p>
          </div>
        </div>

        {msgs.map((m, i) => (
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-primary rounded-xl rounded-tr-sm px-3 py-2 max-w-[200px]">
                <p className="text-tiny text-white leading-relaxed">{m.text}</p>
                <p className="text-[10px] text-white/50 mt-0.5 text-right">{m.ts}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shrink-0 mt-0.5" style={{ fontSize: 9 }}>
                SL
              </div>
              <div className="bg-default-100 rounded-xl rounded-tl-sm px-3 py-2 max-w-[200px]">
                <p className="text-tiny text-foreground leading-relaxed whitespace-pre-wrap">{m.text}</p>
                <div className="flex items-center justify-between mt-1 gap-1">
                  {m.model && (
                    <span className="text-[9px] text-default-300">{m.model}</span>
                  )}
                  <p className="text-[10px] text-default-400 ml-auto">{m.ts}</p>
                </div>
              </div>
            </div>
          )
        ))}

        {isThinking && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shrink-0 mt-0.5" style={{ fontSize: 9 }}>
              SL
            </div>
            <div className="bg-default-100 rounded-xl rounded-tl-sm px-3 py-2">
              <div className="flex gap-1 items-center">
                {[0,1,2].map((idx) => (
                  <span key={idx} className="w-1.5 h-1.5 rounded-full bg-default-400 animate-bounce"
                    style={{ animationDelay: `${idx * 0.15}s` }} />
                ))}
                <span className="text-[10px] text-default-400 ml-1">{activeModelMeta.label}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 pb-3 pt-2 border-t border-default-200">
        <Textarea
          variant="bordered" radius="lg" size="sm"
          placeholder="問 Squad Lead 任何問題…"
          minRows={2} maxRows={4}
          value={input}
          onValueChange={setInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
          }}
          classNames={{ inputWrapper: "border-default-200" }}
        />
        <Button
          size="sm" radius="full" color="primary" className="w-full mt-2"
          isDisabled={!input.trim() || isThinking}
          isLoading={isThinking}
          onPress={sendMessage}
        >
          <FontAwesomeIcon icon={faPaperPlane} className="mr-1.5" />
          發送
        </Button>
      </div>
    </aside>
  );
}

/* ─────────────────────── Sub: 2-col Detail panel ────────────────────────
 * Intake is now in the middle column (SquadIntakeSidebar).
 * This panel = center preview + right FeedbackPanel.
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
  squad, lang,
  workspace, brandName,
  missionId, intakePreviewText, onMissionEnd,
}: {
  squad: any;
  lang: "zh-TW" | "en";
  workspace: string | null;
  brandName: string | null;
  missionId: number | null;
  intakePreviewText?: string;
  onMissionEnd: () => void;
}) {
  // ── Active scope (brand × product × event) — same hook ShellLayout uses,
  // backed by localStorage. Lets stepExecute carry the right context so
  // agents read event positioning, not just brand. (CJ correction 2026-04-30)
  const [scope] = useScopeState();
  // ── Live progress polling (post-launch) ──────────────────────────────
  // CJ direction 2026-05-02: drop poll frequency from 2s → 10s. The
  // user only needs to know "agents are passing the baton", not see
  // every render frame. 5× backend load reduction (was 7000 reqs/s
  // worst case at 14k users; now 1400). User-triggered actions
  // (confirm / redo / edit) still call refetch() explicitly so the
  // immediate feedback loop is preserved.
  // Polling now at 60s — SSE stream handles real-time updates during active execution.
  // refetch() is still called explicitly after each step completes.
  const progressQuery: any = (trpc.squad as any).stepGetProgress?.useQuery
    ? (trpc.squad as any).stepGetProgress.useQuery(
        { missionId: missionId ?? 0 },
        { enabled: !!missionId, refetchInterval: missionId ? 60_000 : false, refetchOnWindowFocus: false },
      )
    : { data: null, refetch: () => Promise.resolve({}) };
  const stepExecute: any = (trpc.squad as any).stepExecute?.useMutation
    ? (trpc.squad as any).stepExecute.useMutation()
    : { mutateAsync: async () => null, isPending: false };

  // SSE streaming hook — replaces stepExecute for mode="run"
  const { sseSlotMap, activeSlotKey: _activeSlotKey, stepStatus, isStreaming: isStepStreaming, streamError, startStep } = useMissionStream({
    onStepDone: (_ord, _output) => {
      // Refresh polling state after step completes so confirm/redo buttons appear
      progressQuery.refetch?.();
    },
    onProgress: () => progressQuery.refetch?.(),
  });

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
  // Mission fully complete when all steps are confirmed
  const allStepsConfirmed = stepsArr.length > 0 && stepsArr.every((_: any, i: number) => {
    const p = progressByOrd.get(i + 1);
    return p?.status === "confirmed" || p?.status === "skipped";
  });

  // Session 6: build DB-backed slot map from completed step progress,
  // then merge SSE live slots on top (SSE wins for the active slot).
  const dbSlotMap = useMemo(
    () => buildSlotMapFromProgress(stepsArr, progressByOrd),
    [stepsArr, progressByOrd],
  );
  const fullSlotMap = useMemo(
    () => ({ ...dbSlotMap, ...sseSlotMap }),
    [dbSlotMap, sseSlotMap],
  );
  const activeStepOrder: number = useMemo(() => {
    for (let i = 0; i < stepsArr.length; i++) {
      const ord = i + 1;
      const p = progressByOrd.get(ord);
      const s = p?.status ?? "pending";
      if (s !== "confirmed" && s !== "skipped") return ord;
    }
    return stepsArr.length; // all done
  }, [stepsArr, progressByOrd]);

  // User can manually click any step chip to view its output
  const [viewingStepOrder, setViewingStepOrder] = useState<number | null>(null);
  // Auto-reset viewingStep when activeStepOrder advances (new step becomes active)
  useEffect(() => { setViewingStepOrder(null); }, [activeStepOrder]);
  // The step order actually rendered in the canvas = user selection OR auto-active

  // ── Auto-run all: executes every step sequentially, auto-confirming each ──
  const [autoRunning, setAutoRunning] = useState(false);
  const autoRunRef = useRef(false);
  // Track which version the user has selected for each step (stepOrder → versionIndex)
  const [selectedVersions, setSelectedVersions] = useState<Record<number, number>>({});

  const handleAutoRunAll = async () => {
    if (!missionId || autoRunning || isStepStreaming) return;
    setAutoRunning(true);
    autoRunRef.current = true;

    for (let i = 0; i < stepsArr.length; i++) {
      if (!autoRunRef.current) break;
      const ord = i + 1;
      const prog = progressByOrd.get(ord);
      const status = prog?.status ?? "pending";
      if (status === "confirmed" || status === "skipped") continue;

      // Run the step via SSE
      startStep({
        missionId,
        squadSlug: squad.slug,
        stepOrder: ord,
        step: stepsArr[i],
        scopeBrandId:   scope.brandId   ?? null,
        scopeProductId: scope.productId ?? null,
        scopeEventId:   scope.eventId   ?? null,
      });

      // Poll until drafted or confirmed
      await new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
          const fresh = await progressQuery.refetch?.();
          const freshSteps: any[] = fresh?.data?.steps ?? fresh?.data ?? [];
          const stepProg = freshSteps.find((p: any) => Number(p.stepOrder ?? p.step_order) === ord);
          if (stepProg?.status === "drafted" || stepProg?.status === "confirmed") {
            clearInterval(interval);
            resolve();
          }
        }, 3000);
      });

      if (!autoRunRef.current) break;

      // Auto-confirm
      await stepExecuteWithScope.mutateAsync({
        missionId, squadSlug: squad.slug, stepOrder: ord, mode: "confirm", userInput: "",
      }).catch(() => {});
      await progressQuery.refetch?.();
    }

    autoRunRef.current = false;
    setAutoRunning(false);
  };

  const handleSkipStep = async (ord: number) => {
    if (!missionId || isStepStreaming) return;
    await stepExecuteWithScope.mutateAsync({
      missionId, squadSlug: squad.slug, stepOrder: ord, mode: "skip", userInput: "",
    }).catch(() => {});
    await progressQuery.refetch?.();
  };
  const displayStepOrder = viewingStepOrder ?? activeStepOrder;

  // ── Step-execution error surfacing ────────────────────────────────────
  // Previously the auto-trigger swallowed errors with `.catch(() => {})`,
  // which meant if the LLM call failed (e.g. all providers down) the launch
  // appeared to "hang" — mission row was created, but no draft ever appeared
  // and the user got zero feedback. Now we capture the message into local
  // state and render an Alert so failures are visible + retryable.
  const [autoTriggered, setAutoTriggered] = useState(false);

  // Reset auto-trigger flag whenever the mission changes
  useEffect(() => {
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
    // Use SSE streaming instead of blocking stepExecute mutation
    startStep({
      missionId,
      squadSlug: squad.slug,
      stepOrder: 1,
      step: stepsArr[0],
      scopeBrandId:   scope.brandId   ?? null,
      scopeProductId: scope.productId ?? null,
      scopeEventId:   scope.eventId   ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const description = safeLocalizedText(squad.description, lang);
  const steps: any[] = Array.isArray(squad.steps) ? squad.steps : [];

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
  const primaryOutputKind: "calendar" | "pillar" | "research" | "qa" | "doc" | "post" = useMemo(() => {
    const allVariants: string[] = stepsArr
      .map((s: any) => s.mockupVariant ?? "")
      .filter(Boolean);
    if (allVariants.some((v: string) => v.includes("Calendar"))) return "calendar";
    if (allVariants.some((v: string) => v.includes("Pillar")))   return "pillar";
    if (allVariants.some((v: string) => v.includes("Research"))) return "research";
    if (allVariants.every((v: string) => v.includes("QA") || v.includes("Intake"))) return "qa";
    // Detect doc/strategic squads: majority of steps are strategic kind
    const strategicCount = stepsArr.filter((s: any) => {
      const k = inferStepKind(s);
      return k === "strategic" || k === "intake" || k === "qa";
    }).length;
    if (strategicCount > stepsArr.length / 2) return "doc";
    // Also detect by squad/step name keywords
    const squadNameHay = [
      pickLocaleText(squad.name ?? squad.slug, lang),
      ...(stepsArr.map((s: any) => s.name ?? s.title ?? "")),
    ].join(" ").toLowerCase();
    const docKeywords = ["報告", "report", "audit", "分析", "analysis", "研究", "research", "策略", "strategy", "月度", "monthly", "週報", "週期"];
    if (docKeywords.some(kw => squadNameHay.includes(kw))) return "doc";
    return "post";
  }, [stepsArr, squad, lang]);

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
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-x divide-default-200">

      {/* ─── CENTER: PREVIEW ─────────────────────────────────────────── */}
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
               : primaryOutputKind === "doc"      ? "📄 策略文件輸出"
               : "📋 報告輸出"}
            </Chip>
          </div>
        )}

        {/* ── Step progress indicator (SSE-driven, visible while mission running) ── */}
        {missionId && stepsArr.length > 0 && (
          <div className="shrink-0 border-b border-default-100 bg-content1 px-3 py-2">
            {/* Auto-run controls */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-tiny text-default-400 font-medium">
                {stepsArr.filter((_: any, i: number) => {
                  const p = progressByOrd.get(i + 1);
                  return p?.status === "confirmed" || p?.status === "skipped";
                }).length} / {stepsArr.length} 完成
              </span>
              <div className="flex items-center gap-1.5">
                {autoRunning && (
                  <Button size="sm" variant="light" radius="full" className="text-tiny h-6 px-2 text-danger"
                    onPress={() => { autoRunRef.current = false; setAutoRunning(false); }}>
                    ⏹ 停止
                  </Button>
                )}
                <Button
                  size="sm" variant="flat" radius="full" color="primary"
                  className="text-tiny h-6 px-3 font-semibold"
                  isDisabled={autoRunning || isStepStreaming || allStepsConfirmed}
                  isLoading={autoRunning}
                  onPress={handleAutoRunAll}
                >
                  {autoRunning ? "自動執行中…" : "⚡ 全部自動執行"}
                </Button>
              </div>
            </div>
            {/* Step chips — full names, horizontal scroll */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
              {stepsArr.map((s: any, i: number) => {
                const ord = i + 1;
                const prog = progressByOrd.get(ord);
                const dbStatus: string = prog?.status ?? "pending";
                const isActive = stepStatus.isRunning && stepStatus.stepOrder === ord;
                const isSkipped = dbStatus === "skipped";
                const isConfirmed = dbStatus === "confirmed";
                const isDrafted = dbStatus === "drafted";
                const isViewing = displayStepOrder === ord && !isActive;

                return (
                  <React.Fragment key={ord}>
                    {i > 0 && <span className="text-default-200 text-tiny shrink-0">→</span>}
                    <Tooltip
                      content={
                        <div className="text-tiny">
                          <div className="font-semibold mb-1">{s.name ?? s.title ?? `Step ${ord}`}</div>
                          {!isConfirmed && !isSkipped && !isActive && (
                            <button
                              className="text-warning hover:text-warning-600 font-medium"
                              onClick={(e) => { e.stopPropagation(); handleSkipStep(ord); }}
                            >
                              跳過此步驟 →
                            </button>
                          )}
                          {isSkipped && <span className="text-default-400">已跳過</span>}
                          {isConfirmed && <span className="text-success">已確認 ✓</span>}
                        </div>
                      }
                      placement="bottom" radius="sm" delay={300}
                    >
                      <div
                        role="button" tabIndex={0}
                        onClick={() => {
                          if (!missionId) return;
                          setViewingStepOrder(ord === displayStepOrder ? null : ord);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                        className={[
                          "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-tiny font-medium transition-all whitespace-nowrap",
                          !isStepStreaming ? "cursor-pointer hover:opacity-80" : "cursor-default",
                          isActive    ? "bg-primary/10 text-primary border border-primary/30"
                          : isViewing ? "bg-secondary/10 text-secondary border border-secondary/30 ring-1 ring-secondary/40"
                          : isConfirmed ? "bg-success/10 text-success border border-success/20"
                          : isDrafted   ? "bg-default-100 text-default-600 border border-default-200"
                          : isSkipped   ? "text-default-300 border border-transparent line-through"
                          : "text-default-400 border border-transparent",
                        ].join(" ")}>
                        {isActive    && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block shrink-0" />}
                        {isConfirmed && !isActive && <span className="text-success shrink-0">✓</span>}
                        {isSkipped   && <span className="text-default-300 shrink-0">–</span>}
                        <span>{s.name ?? s.title ?? `Step ${ord}`}</span>
                        {(() => {
                          const outMeta = s.outputType ? getOutputTypeMeta(s.outputType) : null;
                          if (!outMeta) return null;
                          return (
                            <span style={{ fontSize: 9, fontWeight: 700, color: outMeta.color, background: `${outMeta.color}20`, padding: "1px 5px", borderRadius: 6, flexShrink: 0 }}>
                              {outMeta.label}
                            </span>
                          );
                        })()}
                      </div>
                    </Tooltip>
                  </React.Fragment>
                );
              })}
              {(isStepStreaming || stepStatus.isRunning) && stepStatus.agentName && (
                <span className="ml-2 text-tiny text-default-400 shrink-0 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-default-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 rounded-full bg-default-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-default-400 animate-bounce [animation-delay:300ms]" />
                  {stepStatus.agentName}
                </span>
              )}
              {streamError && (
                <span className="ml-2 text-tiny text-danger shrink-0">⚠ {streamError}</span>
              )}
            </div>
          </div>
        )}

        {/* ── Mission complete banner ────────────────────────────────── */}
        {allStepsConfirmed && missionId && (
          <div className="shrink-0 mx-4 mt-4 mb-0 rounded-xl border border-success-200 bg-success-50 px-4 py-3 flex items-center gap-3">
            <span className="text-success text-lg">✓</span>
            <div className="flex-1 min-w-0">
              <p className="text-small font-semibold text-success-700">任務完成！所有步驟已確認</p>
              <p className="text-tiny text-success-600 mt-0.5">成果已自動存檔，可在首頁任務牆查看或匯出</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm" variant="flat" color="success" radius="full"
                onPress={() => {
                  // Build full markdown export from all confirmed steps
                  const lines: string[] = [`# ${name}`, "", `> ${description ?? ""}`, ""];
                  stepsArr.forEach((_s: any, i: number) => {
                    const p = progressByOrd.get(i + 1);
                    const sn = _s.name ?? _s.title ?? `Step ${i + 1}`;
                    if (p?.agentOutput ?? p?.agent_output) {
                      lines.push(`## ${i + 1}. ${sn}`, "", p.agentOutput ?? p.agent_output, "");
                    }
                  });
                  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `${name ?? "mission"}.md`; a.click();
                  URL.revokeObjectURL(url);
                }}
              >↓ 匯出 .md</Button>
              <Button
                size="sm" color="success" radius="full"
                onPress={() => { window.location.href = "/"; }}
              >查看任務牆 →</Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-start justify-center p-6 lg:p-10">
          {(() => {
            // ── Doc/strategic/research squad: show DocMockup placeholder ──────
            if ((primaryOutputKind === "doc" || primaryOutputKind === "research") && !missionId) {
              return (
                <DocMockup
                  title={pickLocaleText(squad.name, lang) || squad.slug}
                  brief={safeLocalizedText(squad.description, lang) ?? ""}
                  brandName={brandName}
                  stepName={primaryOutputKind === "research" ? "分析報告預覽" : "策略文件預覽"}
                  status="pending"
                />
              );
            }

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
            if (missionId && stepsArr[displayStepOrder - 1]) {
              const activeStep = stepsArr[displayStepOrder - 1];
              const kind = inferStepKind(activeStep);
              const prog = progressByOrd.get(displayStepOrder);

              // ── Multi-version detection ───────────────────────────────
              // When server produces { __versions__: true, items: [...] },
              // render version-picker tabs so the user can select one.
              const rawOutput = prog?.agentOutput ?? prog?.agent_output ?? "";
              let versionItems: string[] | null = null;
              if (rawOutput && rawOutput.trimStart().startsWith("{")) {
                try {
                  const parsed = JSON.parse(rawOutput);
                  if (parsed.__versions__ && Array.isArray(parsed.items) && parsed.items.length > 1) {
                    versionItems = parsed.items as string[];
                  }
                } catch { /* not JSON */ }
              }

              // ── Intake / Decision / QA steps → always DocMockup ──────
              // CJ direction 2026-05-02: "一開始 intake 的時候，都用這個格式"
              // Any step with outputKind=decision/qa_review or mockupVariant=
              // IntakeFormMockup/QAReportMockup uses the document reader layout,
              // regardless of what inferStepKind returns.
              const isIntakeStep =
                ["decision", "intake"].includes(
                  String(activeStep.outputKind ?? "").toLowerCase()
                ) || activeStep.mockupVariant === "IntakeFormMockup";
              const isResearchStep =
                (activeStep.mockupVariant ?? "").includes("Research") ||
                (activeStep.mockupVariant ?? "").includes("Report") ||
                ["text_strategic", "research", "analysis"].includes(
                  String(activeStep.outputKind ?? "").toLowerCase()
                );
              const isDocStep = isIntakeStep || isResearchStep ||
                ["qa_review", "qa"].includes(String(activeStep.outputKind ?? "").toLowerCase()) ||
                activeStep.mockupVariant === "QAReportMockup";

              // ── Multi-version: render version-picker tabs ─────────────
              if (versionItems && prog?.status === "drafted") {
                const selectedIdx = selectedVersions[displayStepOrder] ?? 0;
                const selectedBody = versionItems[selectedIdx] ?? "";
                return (
                  <div className="w-full max-w-[760px] mx-auto space-y-3">
                    {/* Version selector tabs */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-small font-medium text-default-600">選擇版本：</span>
                      {versionItems.map((_, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={selectedIdx === idx ? "solid" : "bordered"}
                          color={selectedIdx === idx ? "primary" : "default"}
                          radius="full"
                          onPress={() => setSelectedVersions(prev => ({ ...prev, [displayStepOrder]: idx }))}
                        >
                          版本 {idx + 1}
                        </Button>
                      ))}
                      <span className="text-tiny text-default-400 ml-auto">
                        共 {versionItems.length} 個版本，選一個確認後繼續
                      </span>
                    </div>
                    {/* Show selected version in DocMockup */}
                    <DocMockup
                      title={activeStep.name ?? activeStep.title ?? name}
                      brief={description ?? ""}
                      brandName={brandName}
                      stepName={`${activeStep.name ?? activeStep.title ?? `Step ${displayStepOrder}`} · 版本 ${selectedIdx + 1}`}
                      agentName={prog?.agentName ?? prog?.agent_name ?? activeStep.assignedAgentName ?? null}
                      body={selectedBody}
                      status={prog?.status ?? "pending"}
                      isEditable={true}
                      onConfirm={async (editedContent: string) => {
                        if (!missionId) return;
                        // Save selected version as the confirmed output
                        await stepExecuteWithScope.mutateAsync({
                          missionId, squadSlug: squad.slug, stepOrder: displayStepOrder,
                          mode: "confirm", userInput: editedContent,
                        });
                        const next = displayStepOrder + 1;
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
                          missionId, squadSlug: squad.slug, stepOrder: displayStepOrder,
                          mode: "run", userInput: "",
                        });
                        await progressQuery.refetch?.();
                      }}
                      isMutating={stepExecute.isPending}
                    />
                  </div>
                );
              }

              // Shared confirm/redo callbacks for all doc-style steps
              const handleDocConfirm = async (editedContent: string) => {
                if (!missionId) return;
                await stepExecuteWithScope.mutateAsync({
                  missionId, squadSlug: squad.slug, stepOrder: displayStepOrder,
                  mode: "confirm", userInput: editedContent,
                });
                const next = displayStepOrder + 1;
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
                  missionId, squadSlug: squad.slug, stepOrder: displayStepOrder,
                  mode: "run", userInput: "",
                });
                await progressQuery.refetch?.();
              };

              if (isDocStep) {
                return (
                  <DocMockup
                    title={activeStep.name ?? activeStep.title ?? name}
                    brief={description ?? ""}
                    brandName={brandName}
                    stepName={activeStep.name ?? activeStep.title ?? `Step ${displayStepOrder}`}
                    agentName={prog?.agentName ?? prog?.agent_name ?? activeStep.assignedAgentName ?? null}
                    body={prog?.agentOutput ?? prog?.agent_output ?? null}
                    status={prog?.status ?? "pending"}
                    isEditable={true}
                    onConfirm={handleDocConfirm}
                    onRedo={handleDocRedo}
                    isMutating={stepExecute.isPending}
                  />
                );
              }

              if (kind === "strategic") {
                return (
                  <DocMockup
                    title={name}
                    brief={description ?? ""}
                    brandName={brandName}
                    stepName={activeStep.name ?? activeStep.title ?? `Step ${displayStepOrder}`}
                    agentName={prog?.agentName ?? prog?.agent_name ?? activeStep.assignedAgentName ?? null}
                    body={prog?.agentOutput ?? prog?.agent_output ?? null}
                    status={prog?.status ?? "pending"}
                    isEditable={true}
                    onConfirm={handleDocConfirm}
                    onRedo={handleDocRedo}
                    isMutating={stepExecute.isPending}
                  />
                );
              }
              // ── Visual step: Session 7 — ImageSlotFlow embedded in mockup image slot
              // The 3-step flow (direction → prompt → model → generate) now lives
              // INSIDE the IGFeed image slot, not as a floating wizard in the center pane.
              // We fall through to PlatformMockup and pass imageSlotFlow as a prop.
              // content step: fall through to platform mockup
            }

            // Default: single-post PlatformMockup
            // Session 6: pass fullSlotMap (DB + SSE merged) — SlotContent handles
            // loading/filled/empty per slot. Legacy liveXxx props kept as fallback
            // for mockup variants that haven't migrated to SlotContent yet.
            const dbLive = missionId ? aggregateMockupFields(stepsArr, progressByOrd) : {};

            // Session 7: build imageSlotFlow node when active step is a visual step.
            // Rendered INSIDE the mockup image slot, not as a floating wizard.
            const activeStep = missionId ? stepsArr[displayStepOrder - 1] : null;
            const activeKind = activeStep ? inferStepKind(activeStep) : null;
            const isVisualStep = activeKind === "image" || activeKind === "video";
            const activeProg = missionId ? progressByOrd.get(displayStepOrder) : null;
            const visualBrief = activeProg
              ? (activeProg.agentOutput ?? activeProg.agent_output ?? "").toString().trim()
              : `${activeStep?.name ?? ""}\n${activeStep?.description ?? ""}`.trim();
            const preferredTags: string[] =
              (squad.preferredModelTags as string[] | null) ??
              (activeStep?.preferredModelTags as string[] | null) ??
              [];
            const imageSlotFlowNode = missionId && isVisualStep ? (
              <ImageSlotFlow
                key={`${missionId}-step${displayStepOrder}`}
                brief={visualBrief || (description ?? "")}
                brandContext={brandName ?? undefined}
                kind={activeKind as "image" | "video"}
                preferredModelTags={preferredTags}
                brandId={scope.brandId ?? null}
                onDone={async ({ url, modelId, promptEn }) => {
                  if (!missionId) return;
                  const payload = `__media_url__: ${url}\n__model__: ${modelId}\n__prompt__: ${promptEn}\n\n${visualBrief}`;
                  await stepExecuteWithScope.mutateAsync({
                    missionId, squadSlug: squad.slug,
                    stepOrder: displayStepOrder, mode: "run", userInput: payload,
                  }).catch(() => {});
                  await progressQuery.refetch?.();
                }}
              />
            ) : undefined;

            // Show streaming intake preview when agent is answering (pre-launch)
            if (!missionId && intakePreviewText) {
              return (
                <div className="w-full h-full flex flex-col items-center justify-start pt-4 px-4">
                  <div className="w-full max-w-sm rounded-2xl border border-secondary/30 bg-secondary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-secondary text-tiny font-semibold uppercase tracking-wide">
                      <span className="w-2 h-2 rounded-full bg-secondary animate-pulse inline-block" />
                      Agent 預覽草稿
                    </div>
                    <p className="text-small text-foreground leading-relaxed whitespace-pre-wrap">{intakePreviewText}</p>
                  </div>
                </div>
              );
            }
            return (
              <PlatformMockup
                variant={previewVariant}
                title={name}
                brief={description ?? ""}
                brandName={brandName}
                steps={steps}
                slotMap={missionId ? fullSlotMap : undefined}
                imageSlotFlow={imageSlotFlowNode}
                liveCaption={dbLive.caption}
                liveHashtags={dbLive.hashtags}
                liveTitle={dbLive.title}
                liveDescription={dbLive.description}
                liveImageDesc={dbLive.imageDesc}
                liveVideoDesc={dbLive.videoDesc}
                liveCta={dbLive.cta}
              />
            );
          })()}
        </div>
      </section>

      {/* ─── RIGHT: SQUAD LEAD CHAT ──────────────────────────────────── */}
      <FeedbackPanel
        missionId={missionId}
        steps={steps}
        progressByOrd={progressByOrd}
        activeStepOrder={activeStepOrder}
        stepExecute={stepExecute}
        squadName={squad ? (pickLocaleText(squad.name ?? squad.slug, lang) || squad.slug) : undefined}
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
          icon={faNewspaper}
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
  const typeIcon = (t: string) => t === "video" ? faVideo : t === "json" ? faNewspaper : faImage;

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
    { key: "voice",   label: "品牌語氣", icon: faNewspaper,
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
