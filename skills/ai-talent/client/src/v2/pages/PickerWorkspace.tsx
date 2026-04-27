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
import WorkflowRunner from "./WorkflowRunner";
import BrandSwitcher from "../app/shell/BrandSwitcher";

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
        title: seedTitle || pickLocaleText(sq.name, lang) || sq.slug,
        description: safeLocalizedText(sq.description, lang) ?? undefined,
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
    <div className="fixed inset-0 flex flex-col bg-mos-cream">
      {/* ── Top header ───────────────────────────────────────────────── */}
      {!fullscreen && (
      <header className="h-12 flex items-center justify-between px-3 border-b border-mos-hair bg-white shrink-0">
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.close(); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.78rem] text-mos-ink hover:bg-mos-ink/5 rounded transition"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>返回</span>
        </button>
        <div className="font-display text-[0.92rem] text-mos-ink truncate px-4">
          {headerTitle}
        </div>
        <div className="flex items-center gap-2">
          <BrandSwitcher
            brands={brands}
            selectedId={brandId}
            onSelect={setBrandId}
          />
          <button
            onClick={() => setFullscreen(true)}
            title="進入專注模式 (F)"
            className="w-8 h-8 flex items-center justify-center text-mos-muted hover:text-mos-ink hover:bg-mos-ink/5 rounded transition"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
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
        <aside className="absolute left-0 top-0 bottom-0 w-[68px] z-30 border-r border-mos-hair bg-white flex flex-col items-stretch py-2">
          {railItems.map((it, i) => {
            const active = activeRailKey === it.key;
            // Insert separators between bands (after top, before bottom)
            const prev = railItems[i - 1];
            const showSeparatorAbove = !!prev && prev.kind !== it.kind;
            return (
              <React.Fragment key={it.key}>
                {showSeparatorAbove && (
                  <div className="mx-3 my-1 border-t border-mos-hair/60" />
                )}
                <button
                  onClick={() => {
                    setActiveRailKey(it.key);
                    if (it.key === "templates") {
                      // Returning to templates clears any locked filters that
                      // weren't from URL params, so the user sees the full
                      // catalog again. Channel/layer badges are dismissable
                      // separately via the locked-filter UI in the search row.
                    }
                  }}
                  title={it.label}
                  className={[
                    "h-14 mx-1 my-0.5 rounded flex flex-col items-center justify-center gap-0.5 transition",
                    active ? "bg-mos-ink text-white" : "text-mos-ink hover:bg-mos-ink/5",
                  ].join(" ")}
                >
                  <span className="text-[1.05rem] leading-none">{it.glyph}</span>
                  <span className="text-[0.62rem] tracking-[0.06em]">{it.label}</span>
                </button>
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
            "absolute top-0 bottom-0 z-20 border-r border-mos-hair bg-white flex flex-col min-h-0 shadow-[2px_0_8px_rgba(0,0,0,0.04)] transition-transform duration-200",
            middleCollapsed ? "-translate-x-full" : "translate-x-0",
          ].join(" ")}
          style={{ left: 68, width: 380 }}
        >
          {/* Collapse handle on the right edge — Canva-style */}
          <button
            onClick={toggleMiddle}
            title={middleCollapsed ? "展開（顯示方法論清單）" : "收合（讓出畫布空間）"}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-white border border-mos-hair rounded-r-md shadow flex items-center justify-center text-mos-muted hover:text-mos-ink hover:bg-mos-paper transition"
            style={{ boxShadow: "1px 1px 4px rgba(0,0,0,0.06)" }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={middleCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
            </svg>
          </button>
          {activeRailItem?.kind === "layer" ? (
            <LayerAssetDrawer
              item={activeRailItem}
              onBackToTemplates={() => setActiveRailKey("templates")}
            />
          ) : (
          <>
          {/* Search + AI generate */}
          <div className="p-3 border-b border-mos-hair">
            <div className="relative">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  channelFilter !== "all"
                    ? `描述你的 ${CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label ?? ""} 詳細需求…`
                    : layerFilter !== "ALL"
                      ? `描述你的 ${LAYER_TOKENS[layerFilter].label} 詳細需求…`
                      : "描述你的行銷需求或搜尋方法論…"
                }
                className="w-full pl-9 pr-9 py-2.5 text-[0.84rem] bg-mos-cream border border-mos-hair rounded-full focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 transition"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mos-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
              </svg>
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center text-mos-muted hover:text-mos-ink rounded-full hover:bg-mos-ink/5">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                disabled
                title="AI 推薦方法論（即將推出）"
                className="px-3 py-2 text-[0.78rem] bg-white border border-mos-hair text-mos-ink rounded-full hover:border-mos-ink transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <span className="text-mos-orange">✦</span> 生成
              </button>
              <button
                onClick={() => { /* search runs live; this just blurs focus */ (document.activeElement as HTMLElement)?.blur(); }}
                className="px-3 py-2 text-[0.78rem] bg-mos-orange hover:bg-mos-orange-hover text-white rounded-full transition"
              >
                搜尋
              </button>
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] bg-mos-ink text-white rounded-full">
                  {CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label
                    ?? channelFilter}
                  <button
                    onClick={() => setChannelFilter("all")}
                    aria-label="清除通路篩選"
                    className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {layerFilter !== "ALL" && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] text-white rounded-full"
                  style={{ background: LAYER_TOKENS[layerFilter].bg }}
                >
                  {layerFilter}・{LAYER_TOKENS[layerFilter].label}
                  <button
                    onClick={() => setLayerFilter("ALL")}
                    aria-label="清除圖層篩選"
                    className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Sectioned thumbnails — Canva pattern: 最近使用 / 品牌範本 / 所有結果.
              Recently-used and brand-templates sections hide while a search
              query is active so the user sees a single relevance-ranked
              "所有結果" list. */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {squadsQuery.isLoading ? (
              <div className="text-[0.84rem] text-mos-muted py-6 text-center">載入中…</div>
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
                        <div className="border border-mos-hair rounded-lg p-3 flex items-start gap-3 bg-white">
                          <div className="w-12 h-12 shrink-0 border border-mos-hair rounded flex items-center justify-center text-mos-muted text-[1.4rem]">
                            +
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[0.82rem] font-semibold text-mos-ink">
                              發佈為品牌範本
                            </div>
                            <div className="text-[0.7rem] text-mos-muted leading-snug mt-0.5">
                              完成此設計後，你可以將其變成可重複使用的範本。
                            </div>
                          </div>
                        </div>
                      )}
                    </ThumbSection>
                  );
                })()}

                {/* ── 3. 所有結果 ── */}
                <ThumbSection
                  title={q ? `搜尋結果（${filtered.length}）` : "所有結果"}
                >
                  {filtered.length === 0 ? (
                    <div className="text-[0.84rem] text-mos-muted py-6 text-center px-4">
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
          className="absolute top-0 right-0 bottom-0 z-10 bg-mos-cream flex flex-col min-h-0"
          style={{ left: fullscreen ? 0 : 68 }}
        >
          {/* Fullscreen exit + collapsed-middle restore handle (only when no header) */}
          {fullscreen && (
            <button
              onClick={() => setFullscreen(false)}
              title="退出專注模式 (Esc / F)"
              className="absolute top-3 right-3 z-40 w-9 h-9 flex items-center justify-center bg-white border border-mos-hair rounded-full shadow text-mos-muted hover:text-mos-ink hover:bg-mos-paper transition"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
              </svg>
            </button>
          )}
          {activeMissionId && selectedSquad ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-1.5 border-b border-mos-hair bg-white/50 flex items-center justify-between">
                <span className="text-[0.7rem] text-mos-muted">執行中 · 隨時可從左側切換方法論</span>
                <button
                  onClick={() => {
                    setActiveMissionId(null);
                    const next = new URLSearchParams(params);
                    next.delete("mission");
                    setParams(next, { replace: true });
                  }}
                  className="text-[0.7rem] text-mos-muted hover:text-mos-ink transition"
                >
                  返回預覽
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <WorkflowRunner
                  missionId={activeMissionId}
                  squad={selectedSquad}
                  lang={lang}
                />
              </div>
            </div>
          ) : selectedSquad ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <SquadDetailPanel
              squad={selectedSquad}
              busy={busy}
              error={error}
              onLaunch={() => launchSquad(selectedSquad)}
              lang={lang}
            />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-10">
              <div className="text-center max-w-[420px]">
                <div className="text-[3rem] mb-4 text-mos-muted">▣</div>
                <h2 className="font-display text-[1.4rem] text-mos-ink mb-2">
                  從左側挑一個方法論小組來開始
                </h2>
                <p className="text-[0.86rem] text-mos-muted leading-relaxed">
                  每個方法論都附帶完整的工作步驟與 AI 專員陣容，點擊 → 預覽 → 啟動。
                </p>
              </div>
            </div>
          )}
        </section>

        {/* "Reopen middle" tab — surfaces when middle is collapsed but
            we're not in fullscreen, so the user can pop the panel back. */}
        {!fullscreen && middleCollapsed && (
          <button
            onClick={toggleMiddle}
            title="展開方法論清單"
            className="absolute z-30 top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-mos-hair rounded-r-md shadow flex items-center justify-center text-mos-muted hover:text-mos-ink hover:bg-mos-paper transition"
            style={{ left: 68, boxShadow: "1px 1px 4px rgba(0,0,0,0.06)" }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
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
          ? "bg-mos-ink text-white border-mos-ink"
          : "bg-white text-mos-ink border-mos-hair hover:border-mos-ink",
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
        <h3 className="text-[0.78rem] font-semibold text-mos-ink">{title}</h3>
        {onCta && ctaLabel && (
          <button
            onClick={onCta}
            className="text-[0.7rem] text-mos-muted hover:text-mos-ink transition"
          >
            {ctaLabel}
          </button>
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
    <button
      onClick={onClick}
      className={[
        "rounded-md overflow-hidden border transition text-left flex flex-col",
        active ? "border-mos-ink shadow-[0_2px_8px_rgba(0,0,0,0.06)]" : "border-mos-hair hover:border-mos-ink",
      ].join(" ")}
    >
      <div
        className="aspect-[16/10] flex items-center justify-center text-white font-bold text-[1.6rem]"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-[0.74rem] text-mos-ink line-clamp-1 leading-snug">{name}</div>
      </div>
    </button>
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
    <button
      onClick={onClick}
      className={[
        "w-full text-left p-2.5 rounded-md border transition flex items-start gap-2.5",
        active ? "bg-white border-mos-ink shadow-[0_2px_8px_rgba(0,0,0,0.06)]" : "bg-white border-mos-hair hover:border-mos-ink",
      ].join(" ")}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[0.82rem] font-semibold text-mos-ink line-clamp-1">{name}</div>
        <div className="text-[0.7rem] text-mos-muted line-clamp-1 mt-0.5">
          {author ? `${author}` : tone.label} · {stepCount} 個步驟
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Sub: Detail panel ─────────────────────────── */

function SquadDetailPanel({
  squad, busy, error, onLaunch, lang,
}: {
  squad: any;
  busy: boolean;
  error: string | null;
  onLaunch: () => void;
  lang: "zh-TW" | "en";
}) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const description = safeLocalizedText(squad.description, lang);
  const author = squad.methodology?.author;
  const year = squad.methodology?.year;
  const steps: any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const memberCount = Array.isArray(squad.members) ? squad.members.length : 0;

  return (
    <div className="max-w-[820px] mx-auto px-8 py-8">
      {/* Title block (Canva-style) */}
      <h1 className="font-display text-[1.6rem] leading-tight text-mos-ink tracking-[-0.01em]">
        {name}
      </h1>
      <div className="mt-2 text-[0.84rem] text-mos-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: tone.bg }} />
          {lk}・{tone.label}
        </span>
        <span className="mx-2 text-mos-hair">|</span>
        <span>{steps.length} 個工作步驟</span>
        <span className="mx-2 text-mos-hair">|</span>
        <span>{memberCount} 位成員</span>
      </div>

      {/* Author byline */}
      {(author || year) && (
        <div className="mt-3 inline-flex items-center gap-2 text-[0.78rem] text-mos-muted">
          <span className="w-6 h-6 rounded-full bg-mos-cream-dark inline-flex items-center justify-center text-[0.62rem] font-bold text-mos-ink">
            {(author?.charAt(0) ?? "·").toUpperCase()}
          </span>
          <span>方法論：{author ?? "—"}{year ? ` · ${year}` : ""}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="mt-4 text-[0.92rem] text-mos-body leading-relaxed">
          {description}
        </p>
      )}

      {/* Primary CTA — 套用 / 啟動 */}
      <button
        onClick={onLaunch}
        disabled={busy}
        className="mt-6 w-full py-3 text-white font-semibold text-[0.92rem] transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #EA580C, #F97316)",
          borderRadius: "50px",
          border: "none",
          boxShadow: "0 2px 8px rgba(234,88,12,0.25)",
        }}
      >
        {busy ? "啟動中…" : `啟動小組（含 ${steps.length} 個工作步驟）`}
      </button>

      {error && (
        <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 text-[0.82rem] text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Step grid (Canva's "16 pages" preview) */}
      {steps.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-[1.0rem] text-mos-ink mb-3">工作步驟預覽</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {steps.map((step: any, idx: number) => (
              <StepCard key={idx} step={step} idx={idx + 1} tone={tone} />
            ))}
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-white border border-mos-hair rounded-lg p-4 hover:border-mos-ink transition">
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white text-[0.72rem] font-bold"
          style={{ background: tone.bg }}
        >
          {idx}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.86rem] font-semibold text-mos-ink line-clamp-2">{title}</div>
          {agent && (
            <div className="text-[0.72rem] text-mos-muted mt-0.5 line-clamp-1">{agent}</div>
          )}
          {(skills.length > 0 || out || tool) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[0.66rem] bg-mos-cream-dark text-mos-ink rounded">{sk}</span>
              ))}
              {out && (
                <span className="px-1.5 py-0.5 text-[0.66rem] bg-mos-ink text-white rounded">{out}</span>
              )}
              {tool && (
                <span className="px-1.5 py-0.5 text-[0.66rem] border border-mos-hair text-mos-muted rounded">{tool}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
      <div className="px-4 py-3 border-b border-mos-hair flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[0.72rem] text-mos-muted">資產 / Assets</div>
          <div className="font-display text-[1.0rem] text-mos-ink truncate">{meta.title}</div>
        </div>
        <button
          onClick={onBackToTemplates}
          className="text-[0.72rem] text-mos-muted hover:text-mos-ink transition shrink-0 ml-2"
        >
          ← 範本
        </button>
      </div>

      {/* Body — placeholder shell */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {meta.blurb && (
          <p className="text-[0.82rem] text-mos-body leading-relaxed mb-4">{meta.blurb}</p>
        )}

        {/* Empty-state card with primary action */}
        <div className="border border-dashed border-mos-hair rounded-lg p-5 text-center bg-mos-cream/40">
          <div className="text-[2rem] mb-2 text-mos-muted">{item.glyph}</div>
          <div className="text-[0.86rem] text-mos-ink font-semibold mb-1">尚未有資料</div>
          <div className="text-[0.74rem] text-mos-muted leading-snug mb-4">
            這個資產庫即將推出。目前可以先上傳檔案或從範本開始一個 mission。
          </div>
          <div className="flex gap-2 justify-center">
            <button
              disabled
              className="px-3 py-1.5 text-[0.78rem] bg-white border border-mos-hair text-mos-muted rounded-full cursor-not-allowed"
            >
              新增 +
            </button>
            <button
              onClick={onBackToTemplates}
              className="px-3 py-1.5 text-[0.78rem] bg-mos-ink text-white rounded-full hover:opacity-90 transition"
            >
              從範本開始
            </button>
          </div>
        </div>

        {/* Stub list — gives a hint of what this drawer will look like once
            real data lands. Three muted skeleton rows. */}
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded border border-mos-hair bg-white/60 px-3 flex items-center gap-3 opacity-50"
            >
              <div className="w-6 h-6 rounded bg-mos-hair/60" />
              <div className="flex-1">
                <div className="h-2.5 w-1/2 rounded bg-mos-hair/50 mb-1" />
                <div className="h-2 w-1/3 rounded bg-mos-hair/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
