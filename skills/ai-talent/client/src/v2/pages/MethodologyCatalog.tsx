/**
 * MethodologyCatalog — full Canva-parity templates page (HeroUI).
 *
 * Page structure (top → bottom):
 *   1. Pastel hero — gradient, 範本 title, big rounded search, 3 quick pills
 *   2. 探索範本 — L1–L6 horizontal-scroll category tiles (pastel)
 *   3. 精選方法論小組 — 30 curated squads, horizontal scroll
 *   4. Agents — horizontal scroll
 *   5. 技能 — horizontal scroll
 *   6. 受你啟發的方法論 — fresh ingest, horizontal scroll
 *   7. 熱門精選 banners — 3 promotional CTAs
 *   8. 為你提供更多範本 — Tabs + grid (squad / agent / skill)
 *
 * Each row uses HeroUI components. Pastel tints come from HeroUI semantic
 * default-100 / primary-100 / etc., not hex pins.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSemanticSearch } from "../lib/useSemanticSearch";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import CreateMethodologyModal from "../components/methodology/CreateMethodologyModal";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import { agentAvatarUrl } from "../components/AgentAvatar";
import { TaskChip } from "../components/TaskChip";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Button, Card, CardBody, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Input, Modal, ModalBody, ModalContent, Skeleton, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faChevronLeft, faChevronRight,
  faPlus, faWandMagicSparkles, faCrown, faUsers, faRobot, faCubes, faCircleInfo,
  faBullseye, faMessage, faChartLine, faPalette, faRocket, faBriefcase,
  faVideo, faShareNodes, faStar, faArrowRight, faEllipsis, faPlay,
  faXmark, faShare, faFlag,
  faPenNib, faImage, faMicrophoneLines, faChartColumn, faChessKnight, faCode, faWandSparkles,
  faSquare, faImages, faMobileScreenButton, faFilePowerpoint, faFileLines,
  faNewspaper, faPodcast, faCalendarDay, faSquarePollVertical, faFile,
} from "@fortawesome/free-solid-svg-icons";

// Squad/skill output format → FontAwesome icon (shown on the card top-right).
// Sourced from entity.mockup.format (server-classified). Keeps the card body
// clean (name + description only).
const FORMAT_ICON: Record<string, any> = {
  feed:         faSquare,
  carousel:     faImages,
  reel:         faVideo,
  shorts:       faVideo,
  "video-card": faVideo,
  watch:        faVideo,
  "native-video": faVideo,
  story:        faMobileScreenButton,
  live:         faPodcast,
  article:      faNewspaper,
  newsletter:   faNewspaper,
  document:     faFilePowerpoint,
  poll:         faSquarePollVertical,
  event:        faCalendarDay,
  community:    faMessage,
  ad:           faBullseye,
  premiere:     faVideo,
  marketplace:  faBriefcase,
  foryou:       faVideo,
  profile:      faImage,
};
const FORMAT_LABEL: Record<string, string> = {
  feed: "貼文", carousel: "輪播", reel: "短影音", shorts: "Shorts",
  "video-card": "影片卡", watch: "影片", "native-video": "原生影片",
  story: "限時動態", live: "直播", article: "長文",
  newsletter: "電子報", document: "簡報文件", poll: "投票",
  event: "活動", community: "社群貼文", ad: "廣告",
  premiere: "首映", marketplace: "商品卡", foryou: "FYP",
  profile: "個人頁",
};
function formatIcon(fmt?: string | null) {
  if (!fmt) return null;
  return FORMAT_ICON[String(fmt).toLowerCase()] ?? faFile;
}
function formatLabel(fmt?: string | null) {
  if (!fmt) return null;
  return FORMAT_LABEL[String(fmt).toLowerCase()] ?? fmt;
}

// Skill task_type → FontAwesome icon. Per design system: skills render as
// "block / property" — a single neutral icon on bg-default-50, never a
// generated illustration (those are reserved for squads).
const SKILL_TASK_ICON: Record<string, any> = {
  text:      faPenNib,
  image:     faImage,
  video:     faVideo,
  audio:     faMicrophoneLines,
  data:      faChartColumn,
  research:  faMagnifyingGlass,
  strategy:  faChessKnight,
  code:      faCode,
  generic:   faWandSparkles,
};
function skillIcon(taskType?: string | null) {
  return SKILL_TASK_ICON[String(taskType ?? "").toLowerCase()] ?? faWandSparkles;
}

type Kind = "task" | "squad" | "agent" | "skill";

const KIND_TABS: Array<{ id: Kind; label: string; icon: any; description: string }> = [
  { id: "squad",  label: "方法論小組", icon: faUsers,  description: "預配好的 agent 編組，照工作流跑出產出" },
  { id: "agent",  label: "Agents",     icon: faRobot,  description: "個別專家角色，可放進你的 squad" },
  { id: "skill",  label: "技能",       icon: faCubes,  description: "原子能力，可被 agent 套用" },
];

const LAYER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "全部層級" },
  { value: "L1",  label: "L1・品牌策略" },
  { value: "L2",  label: "L2・產品策略" },
  { value: "L3",  label: "L3・受眾策略" },
  { value: "L4",  label: "L4・通路策略" },
  { value: "L5",  label: "L5・活動策略" },
  { value: "L6",  label: "L6・驗證校準" },
];

// Canva's "探索範本" — pastel category tiles (12 items, our equivalent of
// 簡報/海報/履歷/Instagram 貼文…). Mapped to L1–L6 + 6 thematic cuts.
type ExploreTile = {
  key: string; label: string; hint: string; icon: any;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  filter: { layer?: MosLayer; kind?: Kind; query?: string };
};
const EXPLORE_TILES: ExploreTile[] = [
  { key: "brand",     label: "品牌策略",   hint: "定位 / 原型 / 敘事",       icon: faBullseye, color: "primary",   filter: { layer: "L1" } },
  { key: "product",   label: "產品策略",   hint: "JTBD / 上市 / 價值主張",   icon: faBriefcase, color: "danger",    filter: { layer: "L2" } },
  { key: "audience",  label: "受眾策略",   hint: "STP / Persona / 分眾",     icon: faUsers,    color: "warning",   filter: { layer: "L3" } },
  { key: "channel",   label: "通路策略",   hint: "FB / IG / YT / LinkedIn",  icon: faShareNodes, color: "secondary", filter: { layer: "L4" } },
  { key: "campaign",  label: "活動策略",   hint: "Launch / Campaign / Event", icon: faRocket,   color: "success",   filter: { layer: "L5" } },
  { key: "validate",  label: "商業驗證",   hint: "監測 / 稽核 / 校準",       icon: faChartLine, color: "default",   filter: { layer: "L6" } },
  { key: "agents",    label: "Agents",     hint: "AI 角色與專家",            icon: faRobot,    color: "secondary", filter: { kind: "agent" } },
  { key: "skills",    label: "技能",       hint: "原子能力庫",               icon: faCubes,    color: "primary",   filter: { kind: "skill" } },
  { key: "video",     label: "影片",       hint: "短影音 / Reels / Shorts",  icon: faVideo,    color: "danger",    filter: { query: "video" } },
  { key: "social",    label: "社交媒體",   hint: "貼文 / 限動 / 互動",       icon: faShareNodes, color: "warning",   filter: { query: "social" } },
  { key: "creative",  label: "創意設計",   hint: "Logo / 視覺 / 排版",       icon: faPalette,  color: "secondary", filter: { query: "design" } },
  { key: "content",   label: "內容行銷",   hint: "文案 / 敘事 / SEO",        icon: faMessage,  color: "primary",   filter: { query: "content" } },
];

// 熱門精選 banner CTAs (Canva: 「打造真實故事 / 加入迪士尼 / 加入流行音樂」)
const FEATURED_BANNERS: Array<{ key: string; title: string; subtitle: string; icon: any; bgClass: string; href?: string; action?: () => void }> = [
  { key: "curated", title: "30 個精選方法論", subtitle: "親選經典 IP — Pearson、Gary V、Jeff Walker", icon: faCrown,    bgClass: "bg-gradient-to-br from-primary-100 to-primary-200" },
  { key: "ingest",  title: "從網路新增方法論", subtitle: "GitHub / Claude Skill / 網頁文章 / Notion", icon: faPlus,     bgClass: "bg-gradient-to-br from-secondary-100 to-secondary-200" },
  { key: "agents",  title: "套用 AI Agent 編組", subtitle: "把 squad、agent、skill 組成你的工作流",  icon: faRobot,    bgClass: "bg-gradient-to-br from-warning-100 to-warning-200" },
];

export default function MethodologyCatalog() {
  const navigate = useNavigate();
  const { brandId } = useOutletContext<ShellOutletCtx>();
  const [searchParams] = useSearchParams();

  const [activeKind, setActiveKind] = useState<Kind>(() => {
    const k = searchParams.get("kind");
    return (k === "agent" || k === "skill" || k === "squad") ? k as Kind : "squad";
  });
  const [searchQ, setSearchQ] = useState("");

  // When URL params change (e.g., navigated from MissionsHome tile), sync kind.
  useEffect(() => {
    const k = searchParams.get("kind");
    if (k === "agent" || k === "skill" || k === "squad") setActiveKind(k as Kind);
    const qs = searchParams.get("query");
    if (qs) setSearchQ(qs);
  }, [searchParams]);

  // Semantic search — covers squads, agents, skills simultaneously.
  // Kind maps to the active bottom-tab so results stay contextual.
  const semanticKind = (activeKind as string) === "task" ? "all" : (activeKind as string) === "all" ? "all" : activeKind as any;
  const { semanticHits, isSearching: isSemanticSearching } = useSemanticSearch(searchQ, semanticKind);
  const [layerFilter, setLayerFilter] = useState<string>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);

  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: [], isLoading: false };

  // Task catalog (CJ direction 2026-05-02) — show active + coming_soon
  // so just-built items are findable in /templates without admin gate.
  const taskCatalogQuery = (trpc as any).taskCatalog?.listForPicker?.useQuery
    ? (trpc as any).taskCatalog.listForPicker.useQuery(
        { includeComingSoon: true },
        { refetchOnWindowFocus: false, staleTime: 30_000 },
      )
    : { data: [] };
  const catalogEntities: any[] = useMemo(
    () => ((taskCatalogQuery.data as any[]) ?? []).map((t: any) => ({
      id: `task-${t.id}`,
      kind: "task",
      slug: t.slug,
      name: t.name_zh,
      description: t.description,
      strategyLayer: "L4",
      workspace: [t.workspace],
      _task: t,
    })),
    [taskCatalogQuery.data],
  );

  const allEntities: any[] = useMemo(
    () => [...catalogEntities, ...((entityQuery.data ?? []) as any[])],
    [catalogEntities, entityQuery.data],
  );

  // Counts per kind
  const counts = useMemo(() => {
    const c = { task: 0, squad: 0, agent: 0, skill: 0 } as Record<Kind, number>;
    for (const e of allEntities) c[e.kind as Kind] = (c[e.kind as Kind] ?? 0) + 1;
    return c;
  }, [allEntities]);

  // Curated subsets for horizontal-scroll rows
  // 精選 row shows only is_curated=1 squads (the 30 IPs that get hero covers).
  // Falls back to top squads if no curated entries are available.
  const curatedSquads = useMemo(() => {
    const squads = allEntities.filter((e) => e.kind === "squad");
    const curated = squads.filter((e) => e.isCurated);
    return (curated.length > 0 ? curated : squads).slice(0, 24);
  }, [allEntities]);
  const topAgents = useMemo(
    () => allEntities.filter((e) => e.kind === "agent").slice(0, 24),
    [allEntities]
  );
  const topSkills = useMemo(
    () => allEntities.filter((e) => e.kind === "skill").slice(0, 24),
    [allEntities]
  );
  const recentInspiration = useMemo(
    () => [...allEntities].sort(() => Math.random() - 0.5).slice(0, 24),
    [allEntities]
  );

  // Grid filter (bottom Tabs section)
  // Prefers server semantic hits when available; falls back to client substring.
  const gridFiltered = useMemo(() => {
    const passesFacets = (e: any) =>
      ((activeKind as string) === "all" || e.kind === activeKind) &&
      (layerFilter === "ALL" || (e.strategyLayer ?? "").toString().slice(0, 2) === layerFilter);

    const q = searchQ.trim().toLowerCase();

    if (q) {
      if (semanticHits && semanticHits.length > 0) {
        // Map semantic hits → full entity objects from allEntities (keeps all fields).
        const slugKindKey = (e: any) => `${e.kind}:${e.slug}`;
        const entityMap = new Map(allEntities.map((e) => [slugKindKey(e), e]));
        const semantic = semanticHits
          .map((h) => entityMap.get(`${h.kind}:${h.slug}`) ?? h)
          .filter(passesFacets);
        // Append client-side matches not already in semantic results as overflow
        const semanticSet = new Set(semanticHits.map((h) => `${h.kind}:${h.slug}`));
        const overflow = allEntities
          .filter((e) => !semanticSet.has(slugKindKey(e)))
          .filter(passesFacets)
          .filter((e) => {
            const hay = `${e.name ?? ""} ${e.subtitle ?? ""} ${e.description ?? ""} ${e.slug ?? ""}`.toLowerCase();
            return hay.includes(q);
          });
        return [...semantic, ...overflow];
      }
      // Client-side substring fallback (pre-result while server is in-flight)
      return allEntities.filter(passesFacets).filter((e) => {
        const hay = `${e.name ?? ""} ${e.subtitle ?? ""} ${e.description ?? ""} ${e.slug ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // No query — facet-only filter
    return allEntities.filter(passesFacets);
  }, [allEntities, activeKind, layerFilter, searchQ, semanticHits]);

  const layerLabel = LAYER_OPTIONS.find((o) => o.value === layerFilter)?.label ?? "全部層級";

  // Click a card → open Canva-style detail modal (instead of navigate).
  // The entity object from list query has all the basic fields we need;
  // squad steps come from a follow-up fetch inside the modal if applicable.
  const onPreview = (entity: any) => setSelectedEntity(entity);

  const applyExploreTile = (t: ExploreTile) => {
    if (t.filter.layer) setLayerFilter(t.filter.layer);
    if (t.filter.kind)  setActiveKind(t.filter.kind);
    if (t.filter.query) setSearchQ(t.filter.query);
    setTimeout(() => {
      document.getElementById("more-templates-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <main className="pb-16 px-8 py-10">
      {/* ─── Header (Notion-discipline) ──────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Chip size="sm" variant="flat" className="uppercase tracking-wider mb-2">
              TEMPLATES · 範本
            </Chip>
            <h1 className="text-3xl font-semibold tracking-tight">範本</h1>
            <p className="text-small text-default-500 max-w-[640px] leading-relaxed mt-2">
              方法論小組、AI agent、技能模板 — 找一個套上去，立刻開工。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="bordered" radius="full"
              startContent={<FontAwesomeIcon icon={faWandMagicSparkles} />}
              onPress={() => setDrawerOpen(true)}>
              先睹為快
            </Button>
            <Button size="sm" color="primary" radius="full"
              startContent={<FontAwesomeIcon icon={faCrown} />}
              onPress={() => setDrawerOpen(true)}>
              開始試用
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <Input
            size="md"
            radius="full"
            variant="bordered"
            value={searchQ}
            onValueChange={setSearchQ}
            placeholder="搜尋數百個範本"
            isClearable
            onClear={() => setSearchQ("")}
            startContent={
              isSemanticSearching
                ? <span className="w-4 h-4 rounded-full border-2 border-default-400 border-t-transparent animate-spin" />
                : <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />
            }
            className="max-w-[640px]"
          />
        </div>

        {/* Quick-filter chips — neutral, no hover scale */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Chip variant="flat" size="sm"
            startContent={<FontAwesomeIcon icon={faBriefcase} className="ml-1 text-default-500" />}
            className="cursor-pointer hover:bg-default-100 transition"
            onClick={() => applyExploreTile({ key: "biz", label: "", hint: "", icon: null, color: "default", filter: { layer: "L2" } })}>商務</Chip>
          <Chip variant="flat" size="sm"
            startContent={<FontAwesomeIcon icon={faVideo} className="ml-1 text-default-500" />}
            className="cursor-pointer hover:bg-default-100 transition"
            onClick={() => applyExploreTile({ key: "vid", label: "", hint: "", icon: null, color: "default", filter: { query: "video" } })}>影片</Chip>
          <Chip variant="flat" size="sm"
            startContent={<FontAwesomeIcon icon={faShareNodes} className="ml-1 text-default-500" />}
            className="cursor-pointer hover:bg-default-100 transition"
            onClick={() => applyExploreTile({ key: "soc", label: "", hint: "", icon: null, color: "default", filter: { query: "social" } })}>社交媒體</Chip>
        </div>
      </header>

      {/* ─── 探索範本 — neutral category tiles ───────────────────── */}
      <ScrollSection title="探索範本">
        {EXPLORE_TILES.map((t) => (
          <Card
            key={t.key}
            isPressable
            isHoverable
            onPress={() => applyExploreTile(t)}
            shadow="none"
            radius="md"
            className="shrink-0 w-[260px] h-[120px] border border-divider hover:bg-default-50 transition"
          >
            <CardBody className="flex flex-row items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-tiny tracking-wider uppercase text-default-500">{t.key.toUpperCase()}</p>
                <p className="text-medium font-semibold leading-tight mt-0.5">{t.label}</p>
                <p className="text-tiny text-default-500 mt-0.5">{t.hint}</p>
              </div>
              <div className="w-14 h-14 rounded-md bg-default-100 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={t.icon} className="text-2xl text-default-500" />
              </div>
            </CardBody>
          </Card>
        ))}
      </ScrollSection>

      {/* ─── 精選方法論小組 ─────────────────────────────────────── */}
      <ScrollSection
        title="精選方法論小組"
        subtitle="親選 30 個經典方法論 IP，可立即套用"
        cta="完整型錄 →"
        onCta={() => { setActiveKind("squad"); setLayerFilter("ALL"); document.getElementById("more-templates-section")?.scrollIntoView({ behavior: "smooth" }); }}
        loading={entityQuery.isLoading}
      >
        {curatedSquads.map((e: any) => (
          <div key={`sq-${e.id}`} className="shrink-0 w-[280px]">
            <LandscapeCard entity={e} onPreview={() => onPreview(e)} size="sm" aspect="5/4" />
          </div>
        ))}
      </ScrollSection>

      {/* ─── Agents (portrait 3:4 cards — Canva avatar feel) ───── */}
      <ScrollSection
        title="精選 Agents"
        subtitle="個別 AI 專家角色，可放進你的 squad"
        cta="完整型錄 →"
        onCta={() => { setActiveKind("agent"); setLayerFilter("ALL"); document.getElementById("more-templates-section")?.scrollIntoView({ behavior: "smooth" }); }}
        loading={entityQuery.isLoading}
      >
        {topAgents.map((e: any) => (
          <div key={`ag-${e.id}`} className="shrink-0 w-[200px]">
            <LandscapeCard entity={e} onPreview={() => onPreview(e)} size="sm" aspect="3/4" />
          </div>
        ))}
      </ScrollSection>

      {/* ─── 技能 ───────────────────────────────────────────────── */}
      <ScrollSection
        title="精選技能"
        subtitle="原子能力庫，可被 agent 套用"
        cta="完整型錄 →"
        onCta={() => { setActiveKind("skill"); setLayerFilter("ALL"); document.getElementById("more-templates-section")?.scrollIntoView({ behavior: "smooth" }); }}
        loading={entityQuery.isLoading}
      >
        {topSkills.map((e: any) => (
          <div key={`sk-${e.id}`} className="shrink-0 w-[260px]">
            <LandscapeCard entity={e} onPreview={() => onPreview(e)} size="sm" aspect="16/9" />
          </div>
        ))}
      </ScrollSection>

      {/* ─── 受你啟發的方法論 — Canva-style large landscape cards ── */}
      <ScrollSection
        title="受你的設計啟發"
        subtitle="隨機探索 — 可能找到沒想過的組合"
        loading={entityQuery.isLoading}
      >
        {recentInspiration.map((e: any) => (
          <div key={`in-${e.kind}-${e.id}`} className="shrink-0 w-[440px]">
            <LandscapeCard entity={e} onPreview={() => onPreview(e)} />
          </div>
        ))}
      </ScrollSection>

      {/* ─── 熱門精選 banners (3 promotional cards) ─────────── */}
      <section className="px-6 mt-10">
        <h2 className="text-xl font-semibold tracking-tight mb-3">熱門精選</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FEATURED_BANNERS.map((b) => (
            <Card
              key={b.key}
              isPressable
              isHoverable
              onPress={() => setDrawerOpen(true)}
              shadow="sm"
              className={`${b.bgClass} h-[90px]`}
            >
              <CardBody className="flex flex-row items-center justify-between gap-3 px-6">
                <div className="min-w-0">
                  <p className="text-medium font-semibold leading-tight">{b.title}</p>
                  <p className="text-small text-foreground-600 mt-1">{b.subtitle}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-content1/60 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={b.icon} className="text-xl" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── 為你提供更多範本 (Canva-style 3-col landscape grid, no tabs) ── */}
      <section id="more-templates-section" className="px-6 mt-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <h2 className="text-xl font-semibold tracking-tight">為你提供更多範本</h2>
          <div className="flex items-center gap-2">
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button size="sm" variant="bordered" radius="full" endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny" />}>
                  類型・{KIND_TABS.find((t) => t.id === activeKind)?.label}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="類型篩選"
                selectionMode="single"
                selectedKeys={new Set([activeKind])}
                onAction={(k) => setActiveKind(k as Kind)}
              >
                {KIND_TABS.map((t) => <DropdownItem key={t.id}>{t.label} ({counts[t.id] ?? 0})</DropdownItem>)}
              </DropdownMenu>
            </Dropdown>
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button size="sm" variant="bordered" radius="full" endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny" />}>
                  {layerLabel}
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="層級篩選" selectionMode="single" selectedKeys={new Set([layerFilter])} onAction={(k) => setLayerFilter(String(k))}>
                {LAYER_OPTIONS.map((o) => <DropdownItem key={o.value}>{o.label}</DropdownItem>)}
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {entityQuery.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="rounded-large w-full" style={{ aspectRatio: "16/9" }} />
            ))}
          </div>
        )}

        {!entityQuery.isLoading && gridFiltered.length === 0 && (
          <Card shadow="none" className="border-2 border-dashed border-divider">
            <CardBody className="py-16 items-center text-center gap-3">
              <FontAwesomeIcon icon={faCircleInfo} className="text-3xl text-default-300" />
              <p className="text-medium font-medium">沒有符合的{KIND_TABS.find((t) => t.id === activeKind)?.label}</p>
              <p className="text-small text-default-500">試試其他層級、清除搜尋，或從網路新增一個。</p>
            </CardBody>
          </Card>
        )}

        {!entityQuery.isLoading && gridFiltered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gridFiltered.map((e: any) => (
              <LandscapeCard key={`${e.kind}-${e.id ?? e.slug}`} entity={e} onPreview={() => onPreview(e)} />
            ))}
          </div>
        )}
      </section>

      <CreateMethodologyModal
        open={drawerOpen}
        initialSource="recommended"
        onClose={() => setDrawerOpen(false)}
        onCreated={(slug) => { setDrawerOpen(false); navigate(`/templates/${slug}`); }}
      />

      <EntityDetailModal
        entity={selectedEntity}
        relatedEntities={
          selectedEntity
            ? allEntities
                .filter((e) => e.kind === selectedEntity.kind && e.id !== selectedEntity.id)
                .filter((e) => e.strategyLayer === selectedEntity.strategyLayer)
                .slice(0, 6)
            : []
        }
        onClose={() => setSelectedEntity(null)}
        onLaunch={(slug) => { setSelectedEntity(null); navigate(`/templates/${slug}`); }}
        onSelectRelated={(e) => setSelectedEntity(e)}
      />
    </main>
  );
}

/* ─────────────────────────── ScrollSection (horizontal carousel) ────────── */

function ScrollSection({
  title, subtitle, cta, onCta, loading, children,
}: {
  title: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 700, behavior: "smooth" });

  return (
    <section className="mt-8">
      <div className="px-6 flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-small text-default-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cta && (
            <Button size="sm" variant="light" onPress={onCta}>{cta}</Button>
          )}
          <Tooltip content="向左">
            <Button isIconOnly size="sm" radius="full" variant="bordered" aria-label="向左" onPress={() => scroll(-1)}>
              <FontAwesomeIcon icon={faChevronLeft} />
            </Button>
          </Tooltip>
          <Tooltip content="向右">
            <Button isIconOnly size="sm" radius="full" variant="bordered" aria-label="向右" onPress={() => scroll(1)}>
              <FontAwesomeIcon icon={faChevronRight} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto px-6 pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="shrink-0 w-[260px] h-[160px] rounded-large" />
          ))}
        </div>
      ) : (
        <div ref={ref} className="flex gap-3 overflow-x-auto px-6 pb-2 snap-x" style={{ scrollSnapType: "x mandatory" }}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── LandscapeCard (Canva-style cover) ─────────
 *
 * Used in the bottom 3-col grid. Mirrors Canva's "為你提供更多範本":
 *   - 16:9 visual area dominates the card
 *   - Layer chip overlay top-left
 *   - Hover reveals "使用此範本" CTA + ⭐ favourite (planned for batch 2)
 *   - For now the visual area is a tinted gradient + the entity initial
 *     as a giant glyph. When Path B image-gen runs, image slots in here.
 * ─────────────────────────────────────────────────────────────────── */

/**
 * LandscapeCard — Notion-discipline card.
 *
 * Per design system rules (memory: project_design_system.md):
 *  - shadow="none", border-divider, radius=md
 *  - hover: bg-default-50 (no scale, no big shadow)
 *  - hero area: neutral bg-default-50, glyph in default-500 (no
 *    color-coded gradient, no kind-specific tint)
 *  - layer chip: secondary flat (single accent), L# distinguishes
 *  - kind chip: default flat (no decorative color)
 *  - hover overlay: subtle dark fade + neutral action buttons (no
 *    colorful "primary" CTA on every card)
 */
function LandscapeCard({
  entity, onPreview, aspect = "16/9", size = "md",
}: {
  entity: any;
  onPreview: (e: any) => void;
  aspect?: string;
  size?: "sm" | "md" | "lg";
}) {
  const layerKey = (entity.strategyLayer ?? "L1") as MosLayer;
  const tone = LAYER_TOKENS[layerKey];
  const coverImageUrl: string | undefined = entity.coverImageUrl ?? entity.heroImageUrl;
  const kindLabel = entity.kind === "squad" ? "小組" : entity.kind === "agent" ? "Agent" : "技能";
  const titleSize = size === "sm" ? "text-small" : size === "lg" ? "text-large" : "text-medium";
  const subtitleSize = "text-tiny";
  const glyphSize = size === "sm" ? 64 : size === "lg" ? 120 : 90;

  return (
    <Card
      isPressable
      isHoverable
      onPress={() => onPreview(entity)}
      shadow="none"
      radius="md"
      className="w-full h-full overflow-hidden group border border-divider hover:bg-default-50 transition"
    >
      {/* Hero area — neutral. Image if available, else mono glyph. */}
      <div
        className="relative w-full bg-default-50 overflow-hidden border-b border-divider"
        style={{ aspectRatio: aspect }}
      >
        {entity.kind === "skill" ? (
          // Skill hero — Stripe/Linear-style: big skill name as the visual,
          // small task-type icon in the corner. Uses zh-TW name if available.
          <div className="absolute inset-0 flex items-end p-4 bg-default-50">
            <p className={`font-semibold tracking-tight leading-[1.05] line-clamp-3 break-words pr-8 ${
              size === "sm" ? "text-xl" : size === "lg" ? "text-3xl" : "text-2xl"
            } text-default-700`}>
              {entity.name}
            </p>
            <FontAwesomeIcon
              icon={skillIcon(entity.taskType)}
              className="absolute bottom-3 right-3 text-default-400"
              style={{ fontSize: size === "sm" ? 20 : size === "lg" ? 32 : 24 }}
            />
          </div>
        ) : entity.kind === "agent" ? (
          // Agent hero — full-bleed notionists avatar
          <img
            src={coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "")}
            alt={entity.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "");
              if (img.src !== fb) img.src = fb;
            }}
          />
        ) : coverImageUrl ? (
          <img src={coverImageUrl} alt={entity.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-70">
            <MethodologyGlyph seed={entity.slug ?? entity.id} layer={layerKey} size={glyphSize} />
          </div>
        )}

        {/* Top-left layer chip — always default/secondary, never colorful */}
        <Chip
          size="sm"
          variant="flat"
          className="absolute top-2.5 left-2.5 bg-content1/95 backdrop-blur-sm pointer-events-none"
        >
          {layerKey}・{tone?.label}
        </Chip>

        {/* Top-right kind chip — neutral */}
        <Chip
          size="sm"
          variant="flat"
          className="absolute top-2.5 right-2.5 bg-content1/95 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-0 pointer-events-none"
        >
          {kindLabel}
        </Chip>

        {/* Hover overlay — subtle, neutral icon actions. No colorful CTA. */}
        <div className="absolute inset-0 bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="absolute top-2.5 right-2.5 flex gap-1.5 pointer-events-auto">
            <Tooltip content="收藏" placement="bottom">
              <Button
                isIconOnly size="sm" radius="full" variant="flat"
                className="bg-content1/95 backdrop-blur-sm"
                aria-label="收藏"
                onClick={(e) => { e.stopPropagation(); /* TODO: bookmark */ }}
              >
                <FontAwesomeIcon icon={faStar} className="text-default-600" />
              </Button>
            </Tooltip>
            <Tooltip content="更多" placement="bottom">
              <Button
                isIconOnly size="sm" radius="full" variant="flat"
                className="bg-content1/95 backdrop-blur-sm"
                aria-label="更多"
                onClick={(e) => { e.stopPropagation(); /* TODO: more menu */ }}
              >
                <FontAwesomeIcon icon={faEllipsis} className="text-default-600" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      <CardBody className="px-3 py-2.5 gap-1">
        {entity.kind === "skill" ? (
          // Skill body — name lives in the hero band; body shows meta + desc.
          <>
            {entity.subtitle && (
              <p className="text-tiny text-default-500 uppercase tracking-wider truncate">
                {entity.subtitle}
              </p>
            )}
            {entity.description && (
              <p className={`${subtitleSize} text-default-500 leading-relaxed line-clamp-2`}>
                {entity.description}
              </p>
            )}
          </>
        ) : (
          <>
            {/* Row 1 — name (left) + format icon (right) */}
            <div className="flex items-center justify-between gap-2">
              <p className={`${titleSize} font-semibold leading-tight line-clamp-1 flex-1 min-w-0`}>
                {entity.name}
              </p>
              {entity.mockup?.format && formatIcon(entity.mockup.format) && (
                <Tooltip content={formatLabel(entity.mockup.format)} placement="top">
                  <FontAwesomeIcon
                    icon={formatIcon(entity.mockup.format)!}
                    className="text-default-400 shrink-0"
                  />
                </Tooltip>
              )}
            </div>
            {/* Row 2 — description (clamp 2) */}
            {entity.description && (
              <p className={`${subtitleSize} text-default-500 leading-relaxed line-clamp-2`}>
                {entity.description}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── EntityDetailModal (Canva-style) ─────────
 * Two-column modal:
 *   Left  (3/5):  large preview area with glyph + chip overlays,
 *                 then "更多類似的方法論" related-entity strip
 *   Right (2/5):  layer chip + kind chip, title, subtitle, description,
 *                 recommended_models stats (from classifier),
 *                 primary CTA + ⭐ + ⋯
 *
 * Pure HeroUI: Modal + ModalContent + ModalBody. The modal opens over
 * the catalog (catalog stays mounted, no route change), matching Canva.
 * ─────────────────────────────────────────────────────────────────── */

function EntityDetailModal({
  entity, relatedEntities, onClose, onLaunch, onSelectRelated,
}: {
  entity: any | null;
  relatedEntities: any[];
  onClose: () => void;
  onLaunch: (slug: string) => void;
  onSelectRelated: (e: any) => void;
}) {
  const open = !!entity;
  const layerKey = (entity?.strategyLayer ?? "L1") as MosLayer;
  const tone = entity ? LAYER_TOKENS[layerKey] : null;
  const heroColor = tone?.heroColor ?? "default";
  const coverImageUrl: string | undefined = entity?.coverImageUrl ?? entity?.heroImageUrl;
  const kindLabel = entity?.kind === "squad" ? "方法論小組"
                  : entity?.kind === "agent" ? "Agent"
                  : entity?.kind === "skill" ? "技能" : "";
  const ctaLabel  = entity?.kind === "squad" ? "啟動此小組"
                  : entity?.kind === "agent" ? "套用此 Agent"
                  : entity?.kind === "skill" ? "套用此技能" : "使用此範本";
  const recommendedModels: string[] = (() => {
    const stats = entity?.stats;
    if (Array.isArray(stats)) return stats.map((s: any) => s.label).filter(Boolean);
    return [];
  })();

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
      hideCloseButton={false}
      classNames={{
        base: "max-w-[1100px] max-h-[88vh]",
        backdrop: "bg-foreground/40 backdrop-blur-sm",
      }}
    >
      <ModalContent>
        {entity && (
          <ModalBody className="p-0 grid grid-cols-1 md:grid-cols-12 gap-0">
            {/* ─── Left: large preview + related ──────────────────────── */}
            <div className="md:col-span-7 p-6 md:p-8 border-b md:border-b-0 md:border-r border-divider overflow-y-auto">
              {/* Big visual */}
              <div
                className="relative w-full bg-default-50 border border-divider rounded-large overflow-hidden"
                style={{ aspectRatio: "4/3" }}
              >
                {entity.kind === "skill" ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={skillIcon(entity.taskType)}
                      className="text-default-400"
                      style={{ fontSize: 160 }}
                    />
                  </div>
                ) : entity.kind === "agent" ? (
                  // Modal hero — full-bleed notionists avatar
                  <img
                    src={coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "")}
                    alt={entity.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget;
                      const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "");
                      if (img.src !== fb) img.src = fb;
                    }}
                  />
                ) : coverImageUrl ? (
                  <img src={coverImageUrl} alt={entity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <MethodologyGlyph seed={entity.slug ?? entity.id} layer={layerKey} size={240} />
                  </div>
                )}
                <Chip size="sm" variant="flat" className="absolute top-3 left-3 bg-content1/95 backdrop-blur-sm">
                  {layerKey}・{tone?.label}
                </Chip>
                <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/95 backdrop-blur-sm">
                  {kindLabel}
                </Chip>
              </div>

              {/* Related (更多類似的方法論) */}
              {relatedEntities.length > 0 && (
                <div className="mt-6">
                  <p className="text-medium font-semibold mb-3">
                    更多類似的{kindLabel}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {relatedEntities.map((r) => {
                      return (
                        <Card
                          key={`rel-${r.kind}-${r.id}`}
                          isPressable
                          isHoverable
                          onPress={() => onSelectRelated(r)}
                          shadow="none"
                          radius="md"
                          className="overflow-hidden border border-divider hover:bg-default-50 transition"
                        >
                          <div className="relative w-full bg-default-50 border-b border-divider" style={{ aspectRatio: "4/3" }}>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <MethodologyGlyph seed={r.slug ?? r.id} layer={(r.strategyLayer ?? "L1") as MosLayer} size={64} />
                            </div>
                          </div>
                          <CardBody className="p-2">
                            <p className="text-tiny font-medium leading-tight line-clamp-2">{r.name}</p>
                          </CardBody>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Right: title + meta + CTA ───────────────────────────── */}
            <div className="md:col-span-5 p-6 md:p-8 flex flex-col gap-4 overflow-y-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip size="sm" color={heroColor} variant="flat">
                  {layerKey}・{tone?.label}
                </Chip>
                <Chip size="sm" variant="flat">{kindLabel}</Chip>
                {entity.kind === "squad" && (
                  <Chip size="sm" color="warning" variant="flat" startContent={<FontAwesomeIcon icon={faCrown} className="ml-1 text-tiny" />}>
                    精選
                  </Chip>
                )}
              </div>

              <div>
                <h2 className="text-3xl font-semibold tracking-tight leading-tight">{entity.name}</h2>
                {entity.subtitle && (
                  <p className="mt-2 text-small text-default-500">{entity.subtitle}</p>
                )}
              </div>

              {entity.description && (
                <p className="text-small text-foreground leading-relaxed whitespace-pre-wrap">
                  {entity.description}
                </p>
              )}

              <Divider />

              {/* Recommended models from classifier */}
              {recommendedModels.length > 0 && (
                <div>
                  <p className="text-tiny font-semibold uppercase tracking-wider text-default-500 mb-2">
                    建議搭配的 AI 模型
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recommendedModels.map((m, i) => (
                      <Chip key={i} size="sm" variant="flat" color={i === 0 ? "primary" : "default"} className="capitalize">
                        {i === 0 && "★ "}{m}
                      </Chip>
                    ))}
                  </div>
                  <p className="text-tiny text-default-400 mt-1.5">
                    執行時可隨意切換 model；★ 為 LLM 評分後最匹配的選擇
                  </p>
                </div>
              )}

              {/* Footer CTA row */}
              <div className="mt-auto flex items-center gap-2 pt-2">
                <Button
                  color="primary"
                  radius="full"
                  size="lg"
                  fullWidth
                  startContent={<FontAwesomeIcon icon={faRocket} />}
                  onPress={() => onLaunch(entity.slug)}
                >
                  {ctaLabel}
                </Button>
                <Tooltip content="收藏">
                  <Button isIconOnly radius="full" variant="bordered" size="lg" aria-label="收藏">
                    <FontAwesomeIcon icon={faStar} />
                  </Button>
                </Tooltip>
                <Dropdown placement="top-end">
                  <DropdownTrigger>
                    <Button isIconOnly radius="full" variant="bordered" size="lg" aria-label="更多">
                      <FontAwesomeIcon icon={faEllipsis} />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="更多操作">
                    <DropdownItem key="share" startContent={<FontAwesomeIcon icon={faShare} />}>分享</DropdownItem>
                    <DropdownItem key="report" startContent={<FontAwesomeIcon icon={faFlag} />} className="text-danger" color="danger">檢舉</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
          </ModalBody>
        )}
      </ModalContent>
    </Modal>
  );
}

