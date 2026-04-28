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
import { inferMockupVariant, getVariantsForPlatform, type MockupVariant } from "../lib/inferMockup";
import { PlatformMockup } from "../components/PlatformMockup";
import WorkflowRunner from "./WorkflowRunner";
import BrandSwitcher from "../app/shell/BrandSwitcher";
import {
  Alert, Avatar, AvatarGroup, Badge, Breadcrumbs, BreadcrumbItem,
  Button, Card, CardBody, CardHeader, Chip, Divider, Input, Progress,
  ScrollShadow, Skeleton, Spinner, Tab, Tabs, Textarea, Tooltip, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket, faPaperPlane, faRotateRight, faBullseye, faPenToSquare,
  faBrain, faUserGroup, faGavel, faMagnifyingGlass, faChartColumn,
  faPenNib, faPalette, faBolt, faCircleCheck, faCircle, faLayerGroup,
  faMobileScreen, faImages, faNewspaper, faVideo, faPodcast, faBookOpen,
  faHeart, faComment, faShareNodes, faBookmark, faPlay,
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
  glyph: string;
  kind: RailKind;
  /** When kind="layer", which asset drawer to open in middle column */
  drawer?: string;
};

const RAIL_TOP: RailItem[] = [
  { key: "templates", label: "範本", glyph: "▣", kind: "global" },
];

const RAIL_BOTTOM: RailItem[] = [
  { key: "brand",  label: "品牌", glyph: "◐", kind: "global" },
  { key: "recent", label: "我的", glyph: "◔", kind: "global" },
  { key: "upload", label: "上傳", glyph: "↑", kind: "global" },
];

/** Per-layer middle-band rail items. Keys for L4 use `L4-${channel}` format. */
const LAYER_RAIL: Record<string, RailItem[]> = {
  L1: [
    { key: "interviews",  label: "訪談稿",  glyph: "✎", kind: "layer", drawer: "interviews" },
    { key: "competitors", label: "競品",    glyph: "⚔", kind: "layer", drawer: "competitors" },
    { key: "archetypes",  label: "原型卡",  glyph: "◈", kind: "layer", drawer: "archetypes" },
    { key: "swot",        label: "SWOT",   glyph: "⊞", kind: "layer", drawer: "swot" },
  ],
  L2: [
    { key: "products",    label: "產品卡",  glyph: "▤", kind: "layer", drawer: "products" },
    { key: "vp-canvas",   label: "VP",      glyph: "⊕", kind: "layer", drawer: "vp-canvas" },
    { key: "pricing",     label: "定價",    glyph: "$", kind: "layer", drawer: "pricing" },
    { key: "fab",         label: "FAB",     glyph: "▦", kind: "layer", drawer: "fab" },
  ],
  L3: [
    { key: "personas",    label: "Persona", glyph: "☺", kind: "layer", drawer: "personas" },
    { key: "icp",         label: "ICP",     glyph: "◉", kind: "layer", drawer: "icp" },
    { key: "journey",     label: "旅程圖",  glyph: "↝", kind: "layer", drawer: "journey" },
    { key: "segments",    label: "區隔",    glyph: "▤", kind: "layer", drawer: "segments" },
  ],
  L4: [
    { key: "calendar",    label: "行事曆",  glyph: "▦", kind: "layer", drawer: "calendar" },
    { key: "assets",      label: "素材庫",  glyph: "▥", kind: "layer", drawer: "assets" },
    { key: "history",     label: "歷史",    glyph: "↺", kind: "layer", drawer: "history" },
  ],
  "L4-facebook": [
    { key: "fb-history",  label: "貼文",    glyph: "▦", kind: "layer", drawer: "fb-history" },
    { key: "fb-assets",   label: "素材庫",  glyph: "▥", kind: "layer", drawer: "fb-assets" },
    { key: "fb-calendar", label: "行事曆",  glyph: "📅", kind: "layer", drawer: "fb-calendar" },
    { key: "fb-ads",      label: "廣告組",  glyph: "◍", kind: "layer", drawer: "fb-ads" },
  ],
  "L4-instagram": [
    { key: "ig-reels",    label: "Reels",   glyph: "▶", kind: "layer", drawer: "ig-reels" },
    { key: "ig-stories",  label: "限動",    glyph: "○", kind: "layer", drawer: "ig-stories" },
    { key: "ig-tags",     label: "Hashtag", glyph: "#", kind: "layer", drawer: "ig-tags" },
    { key: "ig-calendar", label: "行事曆",  glyph: "📅", kind: "layer", drawer: "ig-calendar" },
  ],
  "L4-linkedin": [
    { key: "li-history",  label: "貼文",    glyph: "▦", kind: "layer", drawer: "li-history" },
    { key: "li-personal", label: "個人品牌", glyph: "◐", kind: "layer", drawer: "li-personal" },
    { key: "li-leads",    label: "Lead 表", glyph: "▤", kind: "layer", drawer: "li-leads" },
    { key: "li-calendar", label: "行事曆",  glyph: "📅", kind: "layer", drawer: "li-calendar" },
  ],
  "L4-youtube": [
    { key: "yt-videos",   label: "影片庫",  glyph: "▶", kind: "layer", drawer: "yt-videos" },
    { key: "yt-titles",   label: "標題 A/B", glyph: "Aa", kind: "layer", drawer: "yt-titles" },
    { key: "yt-thumbs",   label: "縮圖",    glyph: "▥", kind: "layer", drawer: "yt-thumbs" },
    { key: "yt-captions", label: "字幕",    glyph: "≡", kind: "layer", drawer: "yt-captions" },
  ],
  "L4-pr": [
    { key: "pr-media",    label: "媒體",    glyph: "📰", kind: "layer", drawer: "pr-media" },
    { key: "pr-press",    label: "新聞稿",  glyph: "✎", kind: "layer", drawer: "pr-press" },
    { key: "pr-kol",      label: "KOL",     glyph: "☺", kind: "layer", drawer: "pr-kol" },
    { key: "pr-pitches",  label: "Pitch",   glyph: "▤", kind: "layer", drawer: "pr-pitches" },
  ],
  L5: [
    { key: "kpis",        label: "KPI",     glyph: "◎", kind: "layer", drawer: "kpis" },
    { key: "budget",      label: "預算",    glyph: "$", kind: "layer", drawer: "budget" },
    { key: "gantt",       label: "甘特圖",  glyph: "▦", kind: "layer", drawer: "gantt" },
    { key: "risks",       label: "風險",    glyph: "⚠", kind: "layer", drawer: "risks" },
  ],
  L6: [
    { key: "monitor",     label: "監測",    glyph: "◔", kind: "layer", drawer: "monitor" },
    { key: "audits",      label: "Audit",   glyph: "✓", kind: "layer", drawer: "audits" },
    { key: "incidents",   label: "事件",    glyph: "⚠", kind: "layer", drawer: "incidents" },
    { key: "benchmarks",  label: "對標",    glyph: "≈", kind: "layer", drawer: "benchmarks" },
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

const CHANNEL_OPTIONS = [
  { key: "facebook",  label: "Facebook",  glyph: "f"  },
  { key: "instagram", label: "Instagram", glyph: "IG" },
  { key: "linkedin",  label: "LinkedIn",  glyph: "in" },
  { key: "youtube",   label: "YouTube",   glyph: "▶"  },
  { key: "pr",        label: "公關",      glyph: "PR" },
  { key: "email",     label: "電子報",    glyph: "✉"  },
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

  // ── Brand context (D) ───────────────────────────────────────────────
  // Picker lives outside ShellLayout so it doesn't get the shared context.
  // We mirror the same localStorage key the shell uses, and fetch the
  // user's brand list directly to populate the in-header BrandSwitcher.
  const brandsQuery = (trpc as any).brand?.listByMember?.useQuery
    ? (trpc as any).brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const brands: any[] = (brandsQuery.data as any[]) ?? [];
  const [brandId, setBrandIdState] = useState<number | null>(() => {
    try { return Number(localStorage.getItem("sowork.selectedBrandId")) || null; }
    catch { return null; }
  });
  const setBrandId = (id: number | null) => {
    setBrandIdState(id);
    try {
      if (id) localStorage.setItem("sowork.selectedBrandId", String(id));
      else localStorage.removeItem("sowork.selectedBrandId");
    } catch {}
  };
  // Auto-pick first brand once list loads.
  useEffect(() => {
    if (!brandId && brands.length > 0) setBrandId(brands[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands.length]);

  // ── Canva-style floating middle column ──────────────────────────────
  // Middle panel can be collapsed so the canvas reclaims that 380px.
  // Persisted across sessions.
  const [middleCollapsed, setMiddleCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sowork.picker.middleCollapsed") === "1"; }
    catch { return false; }
  });
  const toggleMiddle = () => {
    setMiddleCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem("sowork.picker.middleCollapsed", nv ? "1" : "0"); } catch {}
      return nv;
    });
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

  // ── Data ────────────────────────────────────────────────────────────
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

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return allSquads.filter((s) => {
      if (!passesFacets(s)) return false;
      // Text search — match if ANY synonym hits the expanded haystack.
      if (ql) {
        const stepText = Array.isArray(s.steps)
          ? s.steps.map((st: any) => `${st.name ?? ""} ${st.description ?? ""} ${st.outputType ?? ""}`).join(" ")
          : "";
        const memberNames = Array.isArray(s.members)
          ? s.members.map((m: any) => `${m.name ?? ""} ${m.role ?? ""} ${m.primarySkill ?? ""}`).join(" ")
          : "";
        const haystack = [
          pickLocaleText(s.name, "zh-TW"),
          pickLocaleText(s.name, "en"),
          pickLocaleText(s.description, "zh-TW"),
          pickLocaleText(s.description, "en"),
          s.slug,
          s.methodology?.author,
          s.methodology?.summary,
          typeof s.methodology === "string" ? s.methodology : "",
          (s.tags ?? []).join(" "),
          (s.useCases ?? []).join(" "),
          (s.outputFormats ?? []).join(" "),
          (s.workspace ?? []).join(" "),
          stepText,
          memberNames,
          s.lead?.name,
          s.lead?.primarySkill,
        ].filter(Boolean).join(" ").toLowerCase();
        const terms = expandSynonyms(ql);
        if (!terms.some((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }, [allSquads, layerFilter, channelFilter, q]);

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
      const res = await createMission.mutateAsync({
        title: missionTitle.trim() || seedTitle || pickLocaleText(sq.name, lang) || sq.slug,
        description: missionBrief.trim() || safeLocalizedText(sq.description, lang) || undefined,
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
          startContent={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          }
          className="text-[0.78rem]"
        >
          返回
        </Button>
        <div className="font-semibold text-[0.92rem] text-foreground truncate px-4">
          {headerTitle}
        </div>
        <div className="flex items-center gap-2">
          <BrandSwitcher
            brands={brands}
            selectedId={brandId}
            onSelect={setBrandId}
          />
          <Tooltip content="進入專注模式 (F)" placement="bottom" radius="sm">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              radius="sm"
              onPress={() => setFullscreen(true)}
              aria-label="進入專注模式"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
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
                    <span className="text-[1.05rem] leading-none">{it.glyph}</span>
                    <span className="text-[0.62rem] tracking-[0.06em]">{it.label}</span>
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
          <Tooltip content={middleCollapsed ? "展開（顯示方法論清單）" : "收合（讓出畫布空間）"} placement="right" radius="sm">
            <button
              onClick={toggleMiddle}
              aria-label={middleCollapsed ? "展開" : "收合"}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-content1 border border-divider rounded-r-medium shadow flex items-center justify-center text-default-500 hover:text-foreground hover:bg-content2 transition"
              style={{ boxShadow: "1px 1px 4px rgba(0,0,0,0.06)" }}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={middleCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
              </svg>
            </button>
          </Tooltip>
          {activeRailItem?.kind === "layer" ? (
            <LayerAssetDrawer
              item={activeRailItem}
              onBackToTemplates={() => setActiveRailKey("templates")}
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
                <svg className="w-4 h-4 text-default-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              }
              classNames={{ inputWrapper: "bg-content2", input: "text-[0.84rem]" }}
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
              <div className="text-[0.84rem] text-default-500 py-6 text-center">載入中…</div>
            ) : (
              <>
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
                            <div className="w-12 h-12 shrink-0 border border-divider rounded-medium flex items-center justify-center text-default-400 text-[1.4rem]">
                              +
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[0.82rem] font-semibold text-foreground">
                                發佈為品牌範本
                              </div>
                              <div className="text-[0.7rem] text-default-500 leading-snug mt-0.5">
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
                    <div className="text-[0.84rem] text-default-500 py-6 text-center px-4">
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
          style={{ left: fullscreen ? 0 : 68 }}
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
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
                </svg>
              </Button>
            </Tooltip>
          )}
          {activeMissionId && selectedSquad ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-1.5 border-b border-divider bg-content1/50 flex items-center justify-between">
                <span className="text-[0.7rem] text-default-500">執行中 · 隨時可從左側切換方法論</span>
                <Button
                  size="sm"
                  variant="light"
                  radius="sm"
                  onPress={() => {
                    setActiveMissionId(null);
                    const next = new URLSearchParams(params);
                    next.delete("mission");
                    setParams(next, { replace: true });
                  }}
                  className="text-[0.7rem] h-6 min-w-0 px-2"
                >
                  返回預覽
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <WorkflowRunner
                  missionId={activeMissionId}
                  squad={selectedSquad}
                  lang={lang}
                  currentBrandId={brandId}
                  currentBrandName={brands.find((b: any) => b.id === brandId)?.name ?? ""}
                  onMissionDeleted={() => {
                    setActiveMissionId(null);
                    try { localStorage.removeItem("sowork.picker.activeMissionId"); } catch {}
                    recentMissionsQuery.refetch?.();
                  }}
                  onMissionDuplicated={(newId: number) => {
                    setActiveMissionId(newId);
                    try { localStorage.setItem("sowork.picker.activeMissionId", String(newId)); } catch {}
                    recentMissionsQuery.refetch?.();
                  }}
                />
              </div>
            </div>
          ) : selectedSquad ? (
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
                brandName={brands.find((b: any) => b.id === brandId)?.name ?? null}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-10">
              <div className="text-center max-w-[420px]">
                <div className="text-[3rem] mb-4 text-default-400">▣</div>
                <h2 className="font-semibold text-[1.4rem] text-foreground mb-2">
                  從左側挑一個方法論小組來開始
                </h2>
                <p className="text-[0.86rem] text-default-500 leading-relaxed">
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
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>
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
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] rounded-full border transition",
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
        <h3 className="text-[0.78rem] font-semibold text-foreground">{title}</h3>
        {onCta && ctaLabel && (
          <Button
            size="sm"
            variant="light"
            radius="sm"
            onPress={onCta}
            className="text-[0.7rem] h-6 min-w-0 px-2 text-default-500"
          >
            {ctaLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
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
        className="aspect-[16/10] flex items-center justify-center text-white font-bold text-[1.6rem]"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <CardBody className="px-2 py-1.5">
        <div className="text-[0.74rem] text-foreground line-clamp-1 leading-snug">{name}</div>
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
          <div className="text-[0.82rem] font-semibold text-foreground line-clamp-1">{name}</div>
          <div className="text-[0.7rem] text-default-500 line-clamp-1 mt-0.5">
            {author ? `${author}` : tone.label} · {stepCount} 個步驟
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

const dicebear = (name: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || "anon")}`;

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
  workspace, missionTitle, setMissionTitle, missionBrief, setMissionBrief, brandName,
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
  brandName: string | null;
}) {
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

      {/* ─── LEFT: BRIEF ─────────────────────────────────────────────── */}
      <aside className="overflow-y-auto px-5 py-5 space-y-4 bg-content1">
        <Breadcrumbs size="sm">
          <BreadcrumbItem>挑選方法論</BreadcrumbItem>
          <BreadcrumbItem>{name}</BreadcrumbItem>
        </Breadcrumbs>

        <div className="flex flex-wrap gap-1.5">
          <Chip
            size="sm" variant="flat"
            startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}
            style={{ background: `${tone.bg}1A`, color: tone.bg }}
          >
            {lk} · {tone.label}
          </Chip>
          {wsMeta && (
            <Chip
              size="sm" variant="flat" color="secondary"
              startContent={<FontAwesomeIcon icon={wsMeta.icon} className="text-tiny ml-1" />}
            >
              {wsMeta.label}
            </Chip>
          )}
        </div>

        <div>
          <h1 className="font-semibold text-xl tracking-tight leading-tight">{name}</h1>
          {description && (
            <p className="text-tiny text-default-500 leading-relaxed mt-2 line-clamp-4">
              {description}
            </p>
          )}
        </div>

        {(author || year) && (
          <Chip
            size="sm" variant="flat"
            startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}
          >
            {author ?? "—"}{year ? ` · ${year}` : ""}
          </Chip>
        )}

        <Divider />

        <p className="text-tiny tracking-wider uppercase text-default-500 font-medium flex items-center gap-1.5">
          <FontAwesomeIcon icon={faPenToSquare} /> BRIEF
        </p>

        <Input
          label="任務標題"
          labelPlacement="outside"
          variant="bordered" radius="md" size="sm"
          placeholder="幫這個任務取個名字"
          value={missionTitle}
          onValueChange={setMissionTitle}
          isRequired
          startContent={<FontAwesomeIcon icon={faBullseye} className="text-tiny text-default-400" />}
        />

        <Textarea
          label="說明 / 重點"
          labelPlacement="outside"
          variant="bordered" radius="md"
          placeholder="這次想做什麼、給誰、為什麼？（可選）"
          minRows={4} maxRows={8}
          value={missionBrief}
          onValueChange={setMissionBrief}
        />

        {brandName && (
          <Chip
            size="md" variant="flat" color="secondary" radius="md"
            className="w-full h-auto py-1.5 px-2"
            startContent={<FontAwesomeIcon icon={faBrain} className="ml-1" />}
            classNames={{ content: "flex items-center gap-1.5" }}
          >
            <span className="font-medium">{brandName}</span>
            <span className="text-tiny text-default-500">brand brain 自動帶入</span>
          </Chip>
        )}

        <Button
          color="primary" size="lg" radius="lg"
          className="w-full font-medium"
          isLoading={busy}
          isDisabled={!missionTitle.trim() && !seedTitleHint(squad, lang)}
          onPress={onLaunch}
          startContent={!busy && <FontAwesomeIcon icon={faRocket} />}
        >
          {busy ? "啟動中…" : `派出小組（${steps.length} 個步驟）`}
        </Button>

        {error && (
          <Alert color="danger" variant="flat" title={error} />
        )}
      </aside>

      {/* ─── MIDDLE: PREVIEW ─────────────────────────────────────────── */}
      <section className="overflow-y-auto bg-default-50 flex flex-col">
        {/* Variant switcher — only when platform has 2+ variants */}
        {platformVariants.length > 1 && (
          <div className="sticky top-0 z-10 bg-default-50/90 backdrop-blur-sm border-b border-divider px-4 py-2 flex items-center justify-between gap-2">
            <Tabs
              size="sm" radius="full" variant="solid" color="secondary"
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
                  size="sm" variant="flat" color="warning"
                  className="cursor-pointer"
                  onClick={() => setPreviewFormatKey(mockupVariant.format)}
                >
                  ⤺ 推薦：{mockupVariant.label.replace(/^.*?\s/, "")}
                </Chip>
              </Tooltip>
            )}
          </div>
        )}
        <div className="flex-1 flex items-start justify-center p-6 lg:p-10">
          <PlatformMockup
            variant={previewVariant}
            title={missionTitle || name}
            brief={missionBrief || (description ?? "")}
            brandName={brandName}
          />
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
          <div className="flex items-center gap-2">
            <AvatarGroup max={5} size="sm" isBordered>
              {members.map((m: any, i: number) => (
                <Tooltip key={m.id ?? m.name ?? i} content={
                  <User
                    name={m.name ?? "—"}
                    description={m.role ?? m.primarySkill ?? ""}
                    avatarProps={{ src: dicebear(m.name ?? `m${i}`), size: "sm" }}
                  />
                }>
                  <Avatar
                    src={dicebear(m.name ?? `m${i}`)}
                    size="sm" isBordered
                  />
                </Tooltip>
              ))}
            </AvatarGroup>
            <span className="text-tiny text-default-500">{members.length} 位成員</span>
          </div>
        )}

        <Divider />

        <div className="space-y-1">
          <Progress size="sm" value={0} color="secondary" aria-label="pipeline progress" />
          <p className="text-tiny text-default-500">
            尚未派出 — 派出後 agent 會逐段填入中央預覽
          </p>
        </div>

        <Divider />

        <div className="space-y-2">
          {steps.map((step: any, i: number) => (
            <AgentQueueCard
              key={i}
              step={step}
              idx={i + 1}
              isOrchestrator={i === steps.length - 1 && steps.length > 1}
              tone={tone}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}

function seedTitleHint(squad: any, lang: "zh-TW" | "en") {
  return pickLocaleText(squad.name, lang) || squad.slug || "";
}

/* ─────────────── Sub: AgentQueueCard (PR1: queued state only) ─────────── */

function AgentQueueCard({
  step, idx, isOrchestrator, tone,
}: {
  step: any;
  idx: number;
  isOrchestrator: boolean;
  tone: any;
}) {
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const agent = step.assignedAgentName ?? step.owner ?? null;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";

  return (
    <Card
      shadow="none" radius="md"
      className={[
        "border",
        isOrchestrator ? "bg-foreground text-background border-foreground" : "border-divider",
      ].join(" ")}
    >
      <CardBody className="p-3 flex flex-row items-start gap-3">
        <div className="shrink-0 flex flex-col items-center gap-1">
          {agent ? (
            <Badge
              content={<FontAwesomeIcon icon={faCircle} className="text-[0.5rem]" />}
              color="default" placement="bottom-right" shape="circle" size="sm"
              classNames={{ badge: "bg-default-300" }}
            >
              <Avatar src={dicebear(agent)} size="md" isBordered
                color={isOrchestrator ? "secondary" : "default"} />
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
          <Chip
            size="sm" variant="flat" className="mt-1.5"
            classNames={{
              base: isOrchestrator ? "bg-white/15 text-white" : "",
              content: "text-tiny",
            }}
          >
            queued
          </Chip>
        </div>
      </CardBody>
    </Card>
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
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white text-[0.72rem] font-bold"
          style={{ background: tone.bg }}
        >
          {idx}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.86rem] font-semibold text-foreground line-clamp-2">{title}</div>
          {agent && (
            <div className="text-[0.72rem] text-default-500 mt-0.5 line-clamp-1">{agent}</div>
          )}
          {(skills.length > 0 || out || tool) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <Chip key={i} size="sm" radius="sm" variant="flat" className="h-5 text-[0.66rem]">{sk}</Chip>
              ))}
              {out && (
                <Chip size="sm" radius="sm" variant="solid" color="default" className="h-5 text-[0.66rem] bg-foreground text-background">{out}</Chip>
              )}
              {tool && (
                <Chip size="sm" radius="sm" variant="bordered" className="h-5 text-[0.66rem]">{tool}</Chip>
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

function LayerAssetDrawer({
  item,
  onBackToTemplates,
}: {
  item: RailItem;
  onBackToTemplates: () => void;
}) {
  const meta = (item.drawer ? DRAWER_LABELS[item.drawer] : undefined) ?? { title: item.label, blurb: "" };
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-divider flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[0.72rem] text-default-500">資產 / Assets</div>
          <div className="font-semibold text-[1.0rem] text-foreground truncate">{meta.title}</div>
        </div>
        <Button
          size="sm"
          variant="light"
          radius="sm"
          onPress={onBackToTemplates}
          className="text-[0.72rem] h-6 min-w-0 px-2 shrink-0 ml-2"
        >
          ← 範本
        </Button>
      </div>

      {/* Body — placeholder shell */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {meta.blurb && (
          <p className="text-[0.82rem] text-foreground/80 leading-relaxed mb-4">{meta.blurb}</p>
        )}

        {/* Empty-state card with primary action */}
        <Card shadow="none" radius="lg" className="border border-dashed border-divider bg-content2/40">
          <CardBody className="p-5 text-center">
            <div className="text-[2rem] mb-2 text-default-400">{item.glyph}</div>
            <div className="text-[0.86rem] text-foreground font-semibold mb-1">尚未有資料</div>
            <div className="text-[0.74rem] text-default-500 leading-snug mb-4">
              這個資產庫即將推出。目前可以先上傳檔案或從範本開始一個 mission。
            </div>
            <div className="flex gap-2 justify-center">
              <Button size="sm" radius="full" variant="bordered" isDisabled>新增 +</Button>
              <Button size="sm" radius="full" color="primary" onPress={onBackToTemplates}>
                從範本開始
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Stub list — gives a hint of what this drawer will look like once
            real data lands. Three muted skeleton rows. */}
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-medium border border-divider bg-content1/60 px-3 flex items-center gap-3 opacity-50"
            >
              <div className="w-6 h-6 rounded bg-divider/60" />
              <div className="flex-1">
                <div className="h-2.5 w-1/2 rounded bg-divider/50 mb-1" />
                <div className="h-2 w-1/3 rounded bg-divider/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
