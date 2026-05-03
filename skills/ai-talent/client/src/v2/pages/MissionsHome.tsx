/**
 * MissionsHome — 任務牆 (v2 D4 — Canva-faithful, monochrome)
 *
 * Reference study: Canva home (2024–2026).
 *   ─ Pastel airy gradient hero, large display headline
 *   ─ Pill search bar with subtle purple accent
 *   ─ Quick-start row: small circular tiles, NEUTRAL (no colored icons),
 *     subtle dark glyph on white bg, hover reveals layer tint
 *   ─ Section header "為你推薦的範本" with horizontal scroll of preview cards
 *   ─ Section header "最近的項目" with filter chips, dense 6-col thumb grid
 *   ─ Generous whitespace, soft shadows, 8–12px radii throughout
 *
 * The previous version used solid-color circles with emoji which felt
 * cheap. This version is monochrome by default — restraint is the point.
 * Color appears only contextually (layer chips, hover tints, hero
 * gradient) to keep the interface feeling like an agency tool, not a
 * meme generator.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import { searchAndRankSquads } from "../lib/searchSquads";
import { useSemanticSearch } from "../lib/useSemanticSearch";
import { SquadEntityCard } from "../components/SquadEntityCard";
import { EntityStats } from "../components/EntityStats";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import { TaskChip } from "../components/TaskChip";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Badge, Button, Input, Textarea, Tooltip, Chip, Card, CardBody, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faArrowDownWideShort, faArrowUpWideShort,
  faTableCells, faList, faBookmark, faEllipsis,
  faArrowRight, faWandSparkles,
  faBullseye, faBullhorn, faRocket, faUsers, faNewspaper, faEnvelope, faPlus, faCloudArrowUp,
  faF, // generic fallback letter icon
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faLinkedinIn, faYoutube,
} from "@fortawesome/free-brands-svg-icons";

interface MissionRow {
  id: number;
  title: string;
  description?: string | null;
  workspace?: string | null;
  methodology?: string | null;
  squadSlug?: string | null;
  squadName?: string | null;
  squadLayer?: string | null;
  squadStepCount?: number | null;
  brandId?: number | null;
  status?: string | null;
  brandName?: string | null;
  updatedAt?: string;
}

interface QuickTile {
  icon: any;
  label: string;
  layer?: MosLayer;
  badge?: string;
  missionTitle: string;
  missionDesc: string;
  squadSlug?: string;
  agentSlug?: string;
  workspace?: string;
  kind?: "squad" | "agent" | "skill";
  isMore?: boolean;
  opensIngest?: SourceId;
  /** Vivid circle bg color for the icon (Canva-style) */
  iconBg?: string;
}

const QUICK_TILES: QuickTile[] = [
  // ── Facebook × 2 ─────────────────────────────────────────────────────
  {
    icon: faFacebookF, label: "FB 月行事曆", layer: "L4",
    kind: "squad", badge: "推薦", iconBg: "#1877F2",
    missionTitle: "Facebook 月內容行事曆",
    missionDesc: "以 Joe Pulizzi 內容支柱框架，規劃下個月的 Facebook 貼文主題、節奏與互動策略。",
    squadSlug: "fb-monthly-calendar-pulizzi", workspace: "facebook",
  },
  {
    icon: faFacebookF, label: "FB 文案師", layer: "L4",
    kind: "agent", iconBg: "#1877F2",
    missionTitle: "Facebook 廣告文案師",
    missionDesc: "由 AI 文案師依品牌語氣產出 Facebook 廣告標題、貼文與 CTA。",
    agentSlug: "fb-brief-writer", workspace: "facebook",
  },
  // ── Instagram × 2 ────────────────────────────────────────────────────
  {
    icon: faInstagram, label: "IG 月行事曆", layer: "L4",
    kind: "squad", iconBg: "#E1306C",
    missionTitle: "Instagram 月行事曆規劃",
    missionDesc: "依 Pulizzi 內容支柱框架，規劃 Instagram 月度貼文主題、Hashtag 策略與限動延伸。",
    squadSlug: "ig-monthly-calendar-pulizzi", workspace: "instagram",
  },
  {
    icon: faInstagram, label: "IG 視覺指南", layer: "L4",
    kind: "skill", iconBg: "#E1306C",
    missionTitle: "Instagram 視覺貼文技能",
    missionDesc: "掌握 IG 版面設計原則：色彩一致性、圖文比例、輪播架構與視覺鉤子。",
    workspace: "instagram",
  },
  // ── LinkedIn × 1 ─────────────────────────────────────────────────────
  {
    icon: faLinkedinIn, label: "LI 月行事曆", layer: "L4",
    kind: "squad", iconBg: "#0A66C2",
    missionTitle: "LinkedIn 月行事曆規劃",
    missionDesc: "依 Pulizzi 內容支柱框架，規劃 LinkedIn 個人品牌與 B2B 思想領袖月度貼文。",
    squadSlug: "li-monthly-calendar-pulizzi", workspace: "linkedin",
  },
  // ── YouTube × 2 ──────────────────────────────────────────────────────
  {
    icon: faYoutube, label: "YT 說故事腳本", layer: "L4",
    kind: "squad", iconBg: "#FF0000",
    missionTitle: "YouTube 說故事影片腳本",
    missionDesc: "用故事弧線框架（Hook→衝突→解法→CTA）撰寫讓觀眾看完的 YouTube 影片腳本。",
    squadSlug: "yt-video-script-storytelling", workspace: "youtube",
  },
  {
    icon: faYoutube, label: "YT 視覺導演", layer: "L4",
    kind: "agent", iconBg: "#FF0000",
    missionTitle: "YouTube 縮圖視覺導演",
    missionDesc: "由 AI 視覺導演提出 YouTube 縮圖設計方向、色彩對比與視覺吸睛策略。",
    agentSlug: "fb-visual-director", workspace: "youtube",
  },
  // ── L1 品牌策略 × 1 ──────────────────────────────────────────────────
  {
    icon: faBullseye, label: "品牌原型定位", layer: "L1",
    kind: "skill", iconBg: "#7C3AED",
    missionTitle: "品牌原型定位技能",
    missionDesc: "用 Carol Pearson 12 原型框架梳理品牌性格、溝通語氣與市場差異化立足點。",
    agentSlug: "brand-archetype-positioning", workspace: "brand-positioning",
  },
  // ── 工具列 ────────────────────────────────────────────────────────────
  { icon: faPlus,         label: "自訂任務", missionTitle: "", missionDesc: "", iconBg: "#6B7280" },
  { icon: faCloudArrowUp, label: "上傳",     missionTitle: "", missionDesc: "", opensIngest: "upload", iconBg: "#059669" },
  { icon: faEllipsis,     label: "顯示更多", missionTitle: "", missionDesc: "", isMore: true, iconBg: "#9CA3AF" },
];

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : null;
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  // Featured entities (squad + agent + skill) via the unified endpoint.
  // Falls back to the legacy squad endpoint if entity router isn't deployed yet.
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false }
      )
    : null;
  const squadsQuery = !entityQuery && (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

  // ── Filters
  const [selectedLayer, setSelectedLayer] = useState<MosLayer | "ALL">("ALL");
  // 類型 (entity kind): squad / agent / skill — drives the dropdown
  const [kindFilter, setKindFilter] = useState<"all" | "task" | "squad" | "agent" | "skill">("all");

  // Task catalog (CJ direction 2026-05-02) — show BOTH active + coming_soon
  // so just-built tasks are visible without an admin gate.
  const taskCatalogQuery = (trpc as any).taskCatalog?.listForPicker?.useQuery
    ? (trpc as any).taskCatalog.listForPicker.useQuery(
        { includeComingSoon: true },
        { refetchOnWindowFocus: false },
      )
    : { data: [] };

  // Recently added — for the 🆕 banner rail
  const recentTasksQuery = (trpc as any).taskCatalog?.listRecent?.useQuery
    ? (trpc as any).taskCatalog.listRecent.useQuery({ limit: 30 }, { refetchOnWindowFocus: false })
    : { data: [] };
  const recentTasks: any[] = (recentTasksQuery.data as any[]) ?? [];
  const catalogEntities: any[] = useMemo(
    () => ((taskCatalogQuery.data as any[]) ?? []).map((t: any) => ({
      // Shape into the same envelope MissionsHome expects (kind+name+slug+strategyLayer)
      id: `task-${t.id}`,
      kind: "task",
      slug: t.slug,
      name: t.name_zh,
      description: t.description,
      strategyLayer: "L4",                 // tasks live at channel-execution layer
      workspace: [t.workspace],
      // Forward catalog-specific fields so cards can render impl_kind / bypassable
      _task: t,
    })),
    [taskCatalogQuery.data],
  );

  // Unified entity list (preferred path) — already comes pre-shaped from server.
  // Legacy squad list (fallback) — coerce to a near-compatible shape.
  const allEntities = useMemo<any[]>(() => {
    const baseEntities: any[] = entityQuery?.data
      ? (entityQuery.data as any[])
      : ((squadsQuery.data as any[]) ?? [])
          .filter((s) => Array.isArray(s.steps) && s.steps.length > 0)
          .map((s) => ({ ...s, kind: "squad" }));
    // Catalog tasks first — they're the curated front-door
    return [...catalogEntities, ...baseEntities];
  }, [entityQuery?.data, squadsQuery.data, catalogEntities]);

  // Counts per layer (drives LayerNav badges)
  const layerCounts = useMemo(() => {
    const filtered = kindFilter === "all" ? allEntities : allEntities.filter((s) => s.kind === kindFilter);
    const c: Record<string, number> = { ALL: filtered.length, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
    for (const s of filtered) {
      const k = (s.strategyLayer ?? "").toString().slice(0, 2);
      if (k in c) c[k]++;
    }
    return c;
  }, [allEntities, kindFilter]);

  // Counts per kind (drives 類型 dropdown labels)
  const kindCounts = useMemo(() => {
    const c = { task: 0, squad: 0, agent: 0, skill: 0 } as Record<string, number>;
    for (const e of allEntities) {
      const k = String(e.kind ?? "squad");
      if (k in c) c[k]++;
    }
    return c;
  }, [allEntities]);

  const [searchQ, setSearchQ] = useState("");

  // Session 3 — server-side semantic search across squads + agents + skills.
  const semanticKind = kindFilter === "all" ? "all" : kindFilter as any;
  const { semanticHits, isSearching: isSemanticSearching } = useSemanticSearch(searchQ, semanticKind);

  // Featured: semantic hits → keyword fallback → facet-only
  const featured = useMemo(() => {
    const layerOrder = ["L1", "L2", "L3", "L4", "L5", "L6"];
    const q = searchQ.trim();
    const passesFacets = (s: any) =>
      (kindFilter === "all" || s.kind === kindFilter) &&
      (selectedLayer === "ALL" || (s.strategyLayer ?? "").toString().slice(0, 2) === selectedLayer);

    if (q) {
      if (semanticHits && semanticHits.length > 0) {
        const slugKindKey = (e: any) => `${e.kind}:${e.slug}`;
        const entityMap = new Map(allEntities.map((e) => [slugKindKey(e), e]));
        const semantic = semanticHits
          .map((h) => entityMap.get(`${h.kind}:${h.slug}`) ?? h)
          .filter(passesFacets);
        const semanticSet = new Set(semanticHits.map((h) => `${h.kind}:${h.slug}`));
        const overflow = searchAndRankSquads(
          allEntities.filter((e) => !semanticSet.has(slugKindKey(e))).filter(passesFacets),
          q
        ).hits.map((h) => h.squad);
        return [...semantic, ...overflow].slice(0, 24);
      }
      // Client-side keyword fallback (pre-result while server in-flight)
      const result = searchAndRankSquads(allEntities, q);
      return result.hits.map((h) => h.squad).filter(passesFacets).slice(0, 24);
    }

    // No query — facet-only, sorted by layer
    return [...allEntities.filter(passesFacets)]
      .sort((a, b) => {
        const la = (a.strategyLayer ?? "L9").slice(0, 2);
        const lb = (b.strategyLayer ?? "L9").slice(0, 2);
        return layerOrder.indexOf(la) - layerOrder.indexOf(lb);
      })
      .slice(0, selectedLayer === "ALL" ? 12 : 24);
  }, [allEntities, kindFilter, selectedLayer, searchQ, semanticHits]);
  const [ownerFilter, setOwnerFilter] = useState<"mine" | "all">("mine");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter((m) =>
        (m.title ?? "").toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        (m.squadName ?? "").toLowerCase().includes(q) ||
        (m.workspace ?? "").toLowerCase().includes(q)
      );
    }
    r = [...r].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortDesc ? tb - ta : ta - tb;
    });
    return r;
  }, [rows, searchQ, sortDesc]);

  // Type (kind) dropdown options
  const kindOptions = useMemo(() => ([
    { value: "all",   label: `任何類型 (${allEntities.length})` },
    { value: "task",  label: `任務範本 (${kindCounts.task ?? 0})` },
    { value: "squad", label: `小組 (${kindCounts.squad ?? 0})` },
    { value: "agent", label: `Agent (${kindCounts.agent ?? 0})` },
    { value: "skill", label: `純技能 (${kindCounts.skill ?? 0})` },
  ]), [allEntities.length, kindCounts]);
  const kindLabelMap: Record<string, string> = {
    all:   "類型",
    task:  "任務範本",
    squad: "小組",
    agent: "Agent",
    skill: "純技能",
  };

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const createMission = trpc.mission.create.useMutation();
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingTpl, setCreatingTpl] = useState<string | null>(null);
  const [createSource, setCreateSource] = useState<SourceId | null>(null);

  const startFromTile = async (t: QuickTile) => {
    if (t.isMore) { navigate("/templates"); return; }
    if (t.opensIngest) { setCreateSource(t.opensIngest); return; }
    if (!t.missionTitle) { setShowCustom(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }

    // Agent / Skill tiles → open templates catalog (filtered by kind + workspace).
    // Route is /templates (MethodologyCatalog), NOT /methodology which doesn't exist.
    if (t.kind === "agent" || t.kind === "skill") {
      const qs = new URLSearchParams();
      qs.set("kind", t.kind);
      if (t.workspace) qs.set("workspace", t.workspace);
      if (t.agentSlug) qs.set("slug", t.agentSlug);
      navigate(`/templates?${qs.toString()}`);
      return;
    }

    // ── Squad tiles (default): open Picker workspace in a new tab.
    // The picker is pre-filtered by workspace (channel) or layer, lets the
    // user browse methodology squads + preview steps, then click 啟動 to
    // create the mission and land in /m/:id.
    const qs = new URLSearchParams();
    if (t.workspace) qs.set("workspace", t.workspace);
    if (t.layer) qs.set("layer", t.layer);
    qs.set("title", t.missionTitle);
    if (t.squadSlug) qs.set("slug", t.squadSlug);
    window.open(`/picker?${qs.toString()}`, "_blank", "noopener");
  };

  const submitCustom = async () => {
    setError(null);
    if (!customTitle.trim()) { setError("請輸入任務標題"); return; }
    try {
      const res = await createMission.mutateAsync({
        title: customTitle.trim(),
        description: customDesc.trim() || undefined,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/_/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
    }
  };

  const startFromSquad = async (sq: any) => {
    setError(null);
    setCreatingTpl(`sq-${sq.slug}`);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || "";
      const res = await createMission.mutateAsync({
        title: `${sq.name ?? sq.slug}`,
        description: sq.description ?? undefined,
        squadSlug: sq.slug,
        workspace: ws,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/${ws || "_"}/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
      setCreatingTpl(null);
    }
  };

  return (
    <main>
      {/* ─── Hero ─── */}
      <section
        className="relative px-8 pt-12 pb-10 overflow-hidden"
        style={{
          boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
          backgroundImage: [
            /* fade to page bg at bottom */
            "linear-gradient(to bottom, transparent 65%, rgb(252,251,254) 100%)",
            /* white wash — raise to 0.96 to desaturate (Canva is very pastel) */
            "linear-gradient(rgba(255,255,255,0.96), rgba(255,255,255,0.96))",
            /* base hue: softer teal → soft purple */
            "linear-gradient(135deg, #00b4bc 0%, #8b5cf6 60%, #4c1d95 100%)",
          ].join(", "),
        }}
      >
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Top-right: single ghost capsule only (Canva pattern) */}
          <div className="absolute top-0 right-0">
            <button
              onClick={() => navigate("/templates")}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                border: "1px solid rgba(139,92,246,0.35)",
                color: "#7c3aed",
                background: "rgba(255,255,255,0.55)",
                backdropFilter: "blur(4px)",
                transition: "background 0.1s linear",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.55)"; }}
            >
              ✦ 先睹為快
            </button>
          </div>

          {/* Headline — 32px, centered */}
          <div className="mb-6 w-full">
            <p className="text-xs font-semibold uppercase tracking-widest text-default-400 mb-3">
              SoWork · Marketing OS
            </p>
            <h1
              className="font-semibold tracking-tight leading-tight text-center"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              今天，想將哪個策略付諸實現？
            </h1>
            <div className="mt-3 text-small text-default-500">
              <EntityStats variant="inline" />
            </div>
          </div>

          {/* Search bar — 800px max, 64px tall, orange glow (Canva spec) */}
          <div
            className="w-full"
            style={{
              maxWidth: 800,
              borderRadius: 20,
              boxShadow: [
                "rgba(249,115,22,0.15) 6px 3px 12px 0px",
                "rgba(234,88,12,0.15) -6px -3px 12px 0px",
              ].join(", "),
            }}
          >
            <div style={{ background: "white", borderRadius: 20, boxShadow: "rgb(255,220,180) 0px 6px 20px -4px" }}>
              <Input
                size="lg"
                radius="none"
                variant="flat"
                value={searchQ}
                onValueChange={setSearchQ}
                isClearable
                onClear={() => setSearchQ("")}
                placeholder="搜尋方法論、任務、最近的工作"
                classNames={{
                  base: "rounded-[20px] overflow-hidden",
                  inputWrapper: [
                    "h-16 bg-white border-none shadow-none rounded-[20px]",
                    "data-[focus=true]:shadow-none",
                  ].join(" "),
                }}
                startContent={
                  isSemanticSearching
                    ? <span className="w-4 h-4 rounded-full border-2 border-default-400 border-t-transparent animate-spin shrink-0" />
                    : <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 18 }} />
                }
              />
            </div>
          </div>

          {/* Quick-start tiles — single horizontal scroll row (Canva-style) */}
          <div className="mt-6 w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-start gap-2 w-max mx-auto px-2">
            {QUICK_TILES.map((t) => (
              <CircleTile
                key={t.label}
                tile={t}
                busy={creatingTpl === t.label}
                disabled={!!creatingTpl}
                onClick={() => startFromTile(t)}
              />
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* ─── 最近的項目 (Canva-style primary section) ─────────────────── */}
      <section className="px-8 py-8 border-b border-divider">
        {showCustom && (
          <CustomMissionForm
            title={customTitle}
            desc={customDesc}
            onTitleChange={setCustomTitle}
            onDescChange={setCustomDesc}
            onSubmit={submitCustom}
            onCancel={() => { setShowCustom(false); setError(null); }}
            busy={createMission.isPending}
            error={error}
          />
        )}
        {error && !showCustom && (
          <Card shadow="none" className="mb-4 border border-danger">
            <CardBody className="text-small text-danger">{error}</CardBody>
          </Card>
        )}

        {/* Section header with inline controls */}
        <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">
            最近的項目
            {!isLoading && filteredRows.length > 0 && (
              <span className="ml-2 text-small font-normal text-default-400">({filteredRows.length})</span>
            )}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip
              label={ownerFilter === "mine" ? "擁有者・我的" : "擁有者・全部"}
              options={[
                { value: "mine", label: "我的" },
                { value: "all", label: "全部" },
              ]}
              onSelect={(v) => setOwnerFilter(v as "mine" | "all")}
            />
            <FilterChip
              label={sortDesc ? "已修改日期・新→舊" : "已修改日期・舊→新"}
              options={[
                { value: "desc", label: "新→舊" },
                { value: "asc", label: "舊→新" },
              ]}
              onSelect={(v) => setSortDesc(v === "desc")}
            />
            <IconButton
              title={viewMode === "grid" ? "切換為列表" : "切換為網格"}
              onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
            >
              <FontAwesomeIcon icon={viewMode === "grid" ? faList : faTableCells} />
            </IconButton>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ThumbSkeleton key={i} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-default-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faPlus} className="text-2xl text-default-400" />
            </div>
            <div>
              <p className="text-medium font-semibold text-default-600">
                {searchQ ? `沒有找到「${searchQ}」的項目` : "還沒有任何任務"}
              </p>
              <p className="text-small text-default-400 mt-1">
                {searchQ ? "試試其他關鍵字" : "從上方挑一個快速開始範本，或點「立即開新任務」"}
              </p>
            </div>
            {!searchQ && (
              <Button size="sm" color="primary" onPress={() => setCreateSource("recommended")}>
                建立第一個任務
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {filteredRows.map((m) => (
              <MissionThumb key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        ) : (
          <Card shadow="none" className="border border-divider overflow-hidden">
            <div className="flex flex-col divide-y divide-divider">
              {filteredRows.map((m) => (
                <MissionListRow key={m.id} mission={m} onClick={() => goToMission(m)} />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ─── 探索任務範本 (system catalog — secondary) ──────────────── */}
      {recentTasks.length > 0 && (
        <section className="px-8 pt-8 pb-4 border-b border-divider bg-default-50/40">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <h2 className="text-medium font-semibold flex items-center gap-2">
              探索任務範本
              <Chip size="sm" variant="flat" color="default">{recentTasks.length}</Chip>
            </h2>
            <Button size="sm" variant="light" onPress={() => navigate("/templates")} endContent={<FontAwesomeIcon icon={faArrowRight} />}>
              查看全部
            </Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollSnapType: "x mandatory" }}>
            {recentTasks.map((t: any) => {
              const isComingSoon = t.status === "coming_soon";
              const isSquad = t.impl_kind === "squad";
              const canRun = isSquad ? !!t.squad_slug : !!t.agent_id;
              return (
                <Card
                  key={t.id}
                  isPressable={canRun}
                  shadow="none"
                  radius="lg"
                  className={`shrink-0 w-[260px] border border-divider bg-content1 ${canRun ? "" : "opacity-60"}`}
                  style={{ scrollSnapAlign: "start" }}
                  onPress={!canRun ? undefined : () => {
                    if (isSquad && t.squad_slug) {
                      navigate(`/picker?workspace=${t.workspace}&slug=${t.squad_slug}`);
                    } else if (!isSquad && t.agent_id) {
                      navigate(`/picker?workspace=${t.workspace}&task=${t.slug}`);
                    }
                  }}
                >
                  <CardBody className="p-3 gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-small font-semibold flex-1 min-w-0 line-clamp-1">{t.name_zh}</span>
                      <Chip size="sm" variant="flat" color={isComingSoon ? "warning" : "success"} className="h-4 text-tiny">
                        {isComingSoon ? "設計中" : "上線"}
                      </Chip>
                    </div>
                    <Chip size="sm" variant="flat" className="h-4 text-tiny self-start">{t.workspace}</Chip>
                    <p className="text-tiny text-default-500 line-clamp-2 min-h-[2.4em] mt-1">{t.description}</p>
                    <p className={`text-tiny mt-1 ${canRun ? "text-primary" : "text-default-400"}`}>
                      {canRun ? "點擊開啟 →" : "尚未綁定"}
                    </p>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Create-methodology modal (Canva-style source picker) ── */}
      <CreateMethodologyModal
        open={createSource !== null}
        initialSource={createSource ?? "recommended"}
        onClose={() => setCreateSource(null)}
        onCreated={(slug) => {
          setCreateSource(null);
          navigate(`/templates/${slug}`);
        }}
      />
    </main>
  );
}

/* ─────────────────────────── Section header ─────────────────────────── */

function SectionHeader({
  title, cta, onCtaClick,
}: { title: string; cta?: string; onCtaClick?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {cta && (
        <Button size="sm" variant="light" onPress={onCtaClick}>
          {cta}
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────── Layer nav (L1–L6 chips) ──────────────── */

function LayerNav({
  selected, counts, onSelect,
}: {
  selected: MosLayer | "ALL";
  counts: Record<string, number>;
  onSelect: (l: MosLayer | "ALL") => void;
}) {
  const layers: Array<MosLayer | "ALL"> = ["ALL", "L1", "L2", "L3", "L4", "L5", "L6"];
  return (
    <div className="-mt-2 mb-5 flex items-center gap-1.5 flex-wrap">
      {layers.map((l) => {
        const isAll = l === "ALL";
        const tone = isAll ? null : LAYER_TOKENS[l as MosLayer];
        const active = selected === l;
        return (
          <Button
            key={l}
            size="sm"
            variant={active ? "solid" : "bordered"}
            color={isAll ? "default" : tone!.heroColor}
            onPress={() => onSelect(l)}
            endContent={
              <span className="text-tiny tabular-nums opacity-70">
                {counts[l] ?? 0}
              </span>
            }
          >
            {isAll ? "全部" : `${l} · ${tone!.label}`}
          </Button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Quick-start circle (monochrome) ───────── */

function CircleTile({
  tile, busy, disabled, onClick,
}: {
  tile: QuickTile;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 w-[80px] py-2 px-1 min-w-0 group select-none"
      style={{ background: "none", border: "none", cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <Badge
        content={tile.badge}
        color="primary"
        isInvisible={!tile.badge}
        placement="top-right"
        size="sm"
      >
        <span
          className="flex items-center justify-center w-12 h-12 rounded-full text-white transition-transform duration-100 group-hover:scale-105 group-active:scale-95"
          style={{ background: tile.iconBg ?? "#9CA3AF", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
        >
          {busy
            ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <FontAwesomeIcon icon={tile.icon} className="text-base" />
          }
        </span>
      </Badge>
      <span className="text-[11px] leading-tight text-center text-default-600 line-clamp-2 font-medium">
        {tile.label}
      </span>
    </button>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const isLayerKnown = layerStr in LAYER_TOKENS;
  const lk = (isLayerKnown ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  const wsIcon = WS_ICON[ws] ?? null;
  const stepCount = mission.squadStepCount ?? 0;

  // Hero visual — platform icon on brand-color bg when workspace is known,
  // otherwise first letter of squad/mission name on a neutral bg.
  const heroLabel = mission.squadName ?? mission.title ?? "";
  const heroLetter = heroLabel.trim().slice(0, 1).toUpperCase() || "M";

  return (
    <div className="group relative">
      <Card
        isPressable
        isHoverable
        onPress={onClick}
        shadow="sm"
        className="flex flex-col text-left overflow-hidden w-full"
      >
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "5 / 4",
            background: wsIcon ? wsIcon.bg : "#e4e4e7",
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {wsIcon ? (
              <FontAwesomeIcon
                icon={wsIcon.icon}
                style={{ color: wsIcon.fg, opacity: 0.18, fontSize: 88 }}
              />
            ) : (
              <span
                className="font-bold select-none"
                style={{ fontSize: 72, color: "#a1a1aa", lineHeight: 1 }}
              >
                {heroLetter}
              </span>
            )}
          </div>
          {/* Centred icon (full-opacity, smaller) on top of the faded bg icon */}
          {wsIcon && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="flex items-center justify-center rounded-2xl shadow-lg"
                style={{
                  width: 64, height: 64,
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <FontAwesomeIcon
                  icon={wsIcon.icon}
                  style={{ color: "#ffffff", fontSize: 30 }}
                />
              </div>
            </div>
          )}
          {/* ⑥ badges — hidden by default, fade in on hover */}
          {isLayerKnown && (
            <span className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/40 text-white">
              {lk}
            </span>
          )}
          {stepCount > 0 && (
            <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/40 text-white">
              {stepCount} 步
            </span>
          )}
        </div>
        <CardBody className="p-3 gap-1">
          <p className="text-small font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {mission.title}
          </p>
          <TaskChip
            entity={{
              workspace: mission.workspace,
              name: mission.squadName,
              slug: mission.squadSlug,
            }}
            kind="squad"
            size="sm"
            className="self-start"
          />
          {mission.squadName && (
            <p className="text-tiny text-warning truncate">
              {mission.squadName}
            </p>
          )}
          <div className="flex items-center gap-1.5 text-tiny text-default-500">
            {wsBadge && (
              <Avatar
                name={wsBadge.glyph}
                size="sm"
                className="w-4 h-4 text-tiny shrink-0"
                style={{ background: wsBadge.color, color: "white" }}
              />
            )}
            <span className="truncate">{updatedTxt}</span>
          </div>
        </CardBody>
      </Card>
      {/* Hover action — bookmark + ⋯ menu (Canva pattern) */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <ThumbAction title="收藏" onClick={(e) => { e.stopPropagation(); /* TODO: bookmark */ }}>
          <FontAwesomeIcon icon={faBookmark} />
        </ThumbAction>
        <ThumbAction title="更多" onClick={(e) => { e.stopPropagation(); /* TODO: menu */ }}>
          <FontAwesomeIcon icon={faEllipsis} />
        </ThumbAction>
      </div>
    </div>
  );
}

function ThumbAction({
  title, onClick, children,
}: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <Tooltip content={title}>
      <Button
        isIconOnly
        size="sm"
        radius="full"
        variant="flat"
        onClick={onClick}
        aria-label={title}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function MissionListRow({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  return (
    <Card
      isPressable
      onPress={onClick}
      shadow="none"
      radius="none"
      className="flex flex-row items-center gap-4 px-4 py-3 bg-transparent data-[hover=true]:bg-default-100 transition text-left w-full"
    >
      <div className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden bg-default-100">
        <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-small font-medium truncate">{mission.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-tiny text-default-500">
          <Chip size="sm" color={tone.heroColor} variant="flat">{lk}</Chip>
          {wsBadge && <span className="capitalize">{ws}</span>}
          <span>·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
      {wsBadge && (
        <Avatar
          name={wsBadge.glyph}
          size="sm"
          className="shrink-0 w-5 h-5 text-tiny"
          style={{ background: wsBadge.color, color: "white" }}
        />
      )}
    </Card>
  );
}

const WORKSPACE_BADGE: Record<string, { glyph: string; color: string }> = {
  facebook:  { glyph: "f",  color: "#1877F2" },
  instagram: { glyph: "ig", color: "#E4405F" },
  linkedin:  { glyph: "in", color: "#0A66C2" },
  youtube:   { glyph: "▶",  color: "#FF0000" },
  pr:        { glyph: "PR", color: "#525866" },
  email:     { glyph: "@",  color: "#7B5BC8" },
  audience:  { glyph: "眾", color: "#E07B0F" },
  campaign:  { glyph: "→",  color: "#1A9B8E" },
  "brand-positioning": { glyph: "品", color: "#5B3CC8" },
};

/** Platform / workspace FA icon + brand colour for MissionThumb hero area. */
const WS_ICON: Record<string, { icon: any; bg: string; fg: string }> = {
  facebook:           { icon: faFacebookF,  bg: "#1877F2", fg: "#ffffff" },
  instagram:          { icon: faInstagram,  bg: "#E4405F", fg: "#ffffff" },
  linkedin:           { icon: faLinkedinIn, bg: "#0A66C2", fg: "#ffffff" },
  youtube:            { icon: faYoutube,    bg: "#FF0000", fg: "#ffffff" },
  pr:                 { icon: faBullhorn,   bg: "#525866", fg: "#ffffff" },
  email:              { icon: faEnvelope,   bg: "#7B5BC8", fg: "#ffffff" },
  audience:           { icon: faUsers,      bg: "#E07B0F", fg: "#ffffff" },
  campaign:           { icon: faBullseye,   bg: "#1A9B8E", fg: "#ffffff" },
  "brand-positioning":{ icon: faRocket,     bg: "#5B3CC8", fg: "#ffffff" },
};

/* ─────────────────────────── Filter chip + Icon button ─────────────── */

function FilterChip({
  label, options, onClick, onSelect,
}: {
  label: string;
  options?: Array<{ value: string; label: string }>;
  onClick?: () => void;
  onSelect?: (v: string) => void;
}) {
  const chevron = <FontAwesomeIcon icon={faChevronDown} className="text-tiny" />;

  if (!options) {
    return (
      <Button size="sm" radius="full" variant="bordered" onPress={onClick} endContent={chevron}>
        {label}
      </Button>
    );
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button size="sm" radius="full" variant="bordered" endContent={chevron} className="capitalize">
          {label}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={label}
        onAction={(key) => onSelect?.(String(key))}
      >
        {options.map((o) => (
          <DropdownItem key={o.value} className="capitalize">{o.label}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

function IconButton({
  title, onClick, children,
}: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={title}>
      <Button isIconOnly size="sm" radius="full" variant="bordered" onPress={onClick} aria-label={title}>
        {children}
      </Button>
    </Tooltip>
  );
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛編輯";
  if (min < 60) return `${min} 分鐘前編輯`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前編輯`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前編輯`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前編輯`;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });
}

/* ─────────────────────────── Skeleton + Custom form ─────────────── */

function ThumbSkeleton() {
  return (
    <Card shadow="none" className="overflow-hidden">
      <Skeleton className="w-full" style={{ aspectRatio: "4 / 3" }} />
      <CardBody className="p-3 gap-1.5">
        <Skeleton className="h-3 w-4/5 rounded" />
        <Skeleton className="h-2 w-2/5 rounded" />
      </CardBody>
    </Card>
  );
}

function CustomMissionForm({
  title, desc, onTitleChange, onDescChange, onSubmit, onCancel, busy, error,
}: {
  title: string;
  desc: string;
  onTitleChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card shadow="sm" className="mb-8">
      <CardBody className="p-6 gap-4">
        <h3 className="text-small font-semibold text-default-500 uppercase tracking-wider">
          自訂任務
        </h3>
        <Input
          autoFocus
          label="任務標題"
          labelPlacement="outside"
          value={title}
          onValueChange={onTitleChange}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
          placeholder="例如：4 月 SoWork 自有 FB 經營"
          variant="bordered"
        />
        <Textarea
          label="任務說明（選填）"
          labelPlacement="outside"
          value={desc}
          onValueChange={onDescChange}
          minRows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。"
          variant="bordered"
        />
        {error && (
          <p className="text-small text-danger whitespace-pre-wrap">{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="light" onPress={onCancel} isDisabled={busy}>
            取消
          </Button>
          <Button
            color="primary"
            onPress={onSubmit}
            isDisabled={busy || !title.trim()}
            isLoading={busy}
          >
            {busy ? "建立中…" : "建立任務"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
