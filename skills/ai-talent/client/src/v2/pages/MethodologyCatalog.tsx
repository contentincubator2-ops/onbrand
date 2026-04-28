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
import React, { useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import CreateMethodologyModal from "../components/methodology/CreateMethodologyModal";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
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
} from "@fortawesome/free-solid-svg-icons";

type Kind = "squad" | "agent" | "skill";

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

  const [activeKind, setActiveKind] = useState<Kind>("squad");
  const [searchQ, setSearchQ] = useState("");
  const [layerFilter, setLayerFilter] = useState<string>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);

  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: [], isLoading: false };

  const allEntities: any[] = entityQuery.data ?? [];

  // Counts per kind
  const counts = useMemo(() => {
    const c = { squad: 0, agent: 0, skill: 0 } as Record<Kind, number>;
    for (const e of allEntities) c[e.kind as Kind] = (c[e.kind as Kind] ?? 0) + 1;
    return c;
  }, [allEntities]);

  // Curated subsets for horizontal-scroll rows
  const curatedSquads = useMemo(
    () => allEntities.filter((e) => e.kind === "squad").slice(0, 24),
    [allEntities]
  );
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
  const gridFiltered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return allEntities
      .filter((e) => e.kind === activeKind)
      .filter((e) => layerFilter === "ALL" ? true : e.strategyLayer === layerFilter)
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.name ?? ""} ${e.subtitle ?? ""} ${e.description ?? ""} ${e.slug ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [allEntities, activeKind, layerFilter, searchQ]);

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
    <main className="pb-16">
      {/* ─── Hero (very light pastel — Canva-faithful) ──────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(210 60% 96%) 0%, hsl(280 50% 96%) 50%, hsl(340 60% 96%) 100%)",
        }}
      >
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <Button variant="bordered" radius="full" startContent={<FontAwesomeIcon icon={faWandMagicSparkles} />} onPress={() => setDrawerOpen(true)}>
            先睹為快
          </Button>
          <Button color="primary" radius="full" startContent={<FontAwesomeIcon icon={faCrown} />} onPress={() => setDrawerOpen(true)}>
            開始試用 NT$0 元
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto px-6 pt-14 pb-10">
          <h1 className="text-center text-5xl md:text-6xl font-semibold tracking-tight text-foreground">範本</h1>

          <div className="mt-6 max-w-[720px] mx-auto">
            <Input
              size="lg"
              radius="full"
              variant="bordered"
              value={searchQ}
              onValueChange={setSearchQ}
              placeholder="搜尋數百個範本"
              isClearable
              onClear={() => setSearchQ("")}
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
            />
          </div>

          {/* 3 quick filter pills (Canva: 商務 / 影片 / 社交媒體) */}
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Chip variant="flat" startContent={<FontAwesomeIcon icon={faBriefcase} className="ml-1" />} size="lg" className="cursor-pointer hover:scale-105 transition" onClick={() => applyExploreTile({ key: "biz", label: "", hint: "", icon: null, color: "default", filter: { layer: "L2" } })}>商務</Chip>
            <Chip variant="flat" startContent={<FontAwesomeIcon icon={faVideo} className="ml-1" />} size="lg" className="cursor-pointer hover:scale-105 transition" onClick={() => applyExploreTile({ key: "vid", label: "", hint: "", icon: null, color: "default", filter: { query: "video" } })}>影片</Chip>
            <Chip variant="flat" startContent={<FontAwesomeIcon icon={faShareNodes} className="ml-1" />} size="lg" className="cursor-pointer hover:scale-105 transition" onClick={() => applyExploreTile({ key: "soc", label: "", hint: "", icon: null, color: "default", filter: { query: "social" } })}>社交媒體</Chip>
          </div>
        </div>
      </section>

      {/* ─── 探索範本 — pastel category tiles ───────────────────── */}
      <ScrollSection title="探索範本">
        {EXPLORE_TILES.map((t) => (
          <Card
            key={t.key}
            isPressable
            isHoverable
            onPress={() => applyExploreTile(t)}
            shadow="sm"
            className={`shrink-0 w-[260px] h-[120px] bg-${t.color}-100`}
          >
            <CardBody className="flex flex-row items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-tiny tracking-wider uppercase text-default-500">{t.key.toUpperCase()}</p>
                <p className="text-medium font-semibold leading-tight mt-0.5">{t.label}</p>
                <p className="text-tiny text-default-500 mt-0.5">{t.hint}</p>
              </div>
              <div className={`w-14 h-14 rounded-xl bg-${t.color}-200 flex items-center justify-center shrink-0`}>
                <FontAwesomeIcon icon={t.icon} className="text-2xl" />
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
  const heroColor = tone?.heroColor ?? "default";
  const coverImageUrl: string | undefined = entity.coverImageUrl ?? entity.heroImageUrl;
  const kindLabel = entity.kind === "squad" ? "小組" : entity.kind === "agent" ? "Agent" : "技能";
  const ctaLabel  = entity.kind === "squad" ? "啟動小組" : entity.kind === "agent" ? "套用 Agent" : "套用技能";
  const titleSize = size === "sm" ? "text-small" : size === "lg" ? "text-large" : "text-medium";
  const subtitleSize = size === "sm" ? "text-tiny" : "text-tiny";
  const glyphSize = size === "sm" ? 80 : size === "lg" ? 160 : 120;

  return (
    <Card
      isPressable
      isHoverable
      onPress={() => onPreview(entity)}
      shadow="sm"
      radius="lg"
      className="w-full h-full overflow-hidden group"
    >
      {/* Visual area — image if available, else gradient + glyph */}
      <div className={`relative w-full bg-${heroColor}-100 overflow-hidden`} style={{ aspectRatio: aspect }}>
        {coverImageUrl ? (
          <img src={coverImageUrl} alt={entity.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph seed={entity.slug ?? entity.id} layer={layerKey} size={glyphSize} />
          </div>
        )}

        {/* Top-left layer chip — always visible */}
        <Chip
          size="sm"
          color={heroColor}
          variant="solid"
          className="absolute top-2.5 left-2.5 shadow-sm pointer-events-none"
        >
          {layerKey}・{tone?.label}
        </Chip>

        {/* Top-right kind chip — hides on hover so action buttons can take its spot */}
        <Chip
          size="sm"
          variant="flat"
          className="absolute top-2.5 right-2.5 bg-content1/80 backdrop-blur-md transition-opacity duration-150 group-hover:opacity-0 pointer-events-none"
        >
          {kindLabel}
        </Chip>

        {/* Hover overlay (dark gradient + actions) */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          {/* Center primary action — Canva pattern */}
          <Button
            color="primary"
            radius="full"
            size={size === "sm" ? "sm" : "md"}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto shadow-lg"
            startContent={<FontAwesomeIcon icon={faPlay} />}
            onPress={(ev: any) => { ev?.stopPropagation?.(); onPreview(entity); }}
          >
            {ctaLabel}
          </Button>

          {/* Top-right star (favourite) + more menu */}
          <div className="absolute top-2.5 right-2.5 flex gap-1.5 pointer-events-auto">
            <Tooltip content="收藏" placement="bottom">
              <Button
                isIconOnly
                size="sm"
                radius="full"
                variant="flat"
                className="bg-content1/90 backdrop-blur-md"
                aria-label="收藏"
                onClick={(e) => { e.stopPropagation(); /* TODO: bookmark */ }}
              >
                <FontAwesomeIcon icon={faStar} />
              </Button>
            </Tooltip>
            <Tooltip content="更多" placement="bottom">
              <Button
                isIconOnly
                size="sm"
                radius="full"
                variant="flat"
                className="bg-content1/90 backdrop-blur-md"
                aria-label="更多"
                onClick={(e) => { e.stopPropagation(); /* TODO: more menu */ }}
              >
                <FontAwesomeIcon icon={faEllipsis} />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      <CardBody className="px-3 py-2.5 gap-1">
        <p className={`${titleSize} font-semibold leading-tight line-clamp-1`}>{entity.name}</p>
        {entity.subtitle && (
          <p className={`${subtitleSize} text-default-500 line-clamp-1`}>{entity.subtitle}</p>
        )}
        <TaskChip entity={entity} kind={entity.kind === "agent" ? "agent" : entity.kind === "skill" ? "skill" : "squad"} size="sm" className="self-start mt-0.5" />
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
                className={`relative w-full bg-${heroColor}-100 rounded-large overflow-hidden`}
                style={{ aspectRatio: "4/3" }}
              >
                {coverImageUrl ? (
                  <img src={coverImageUrl} alt={entity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <MethodologyGlyph seed={entity.slug ?? entity.id} layer={layerKey} size={240} />
                  </div>
                )}
                <Chip size="sm" color={heroColor} variant="solid" className="absolute top-3 left-3 shadow-sm">
                  {layerKey}・{tone?.label}
                </Chip>
                <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md">
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
                      const rTone = LAYER_TOKENS[(r.strategyLayer ?? "L1") as MosLayer];
                      const rColor = rTone?.heroColor ?? "default";
                      return (
                        <Card
                          key={`rel-${r.kind}-${r.id}`}
                          isPressable
                          isHoverable
                          onPress={() => onSelectRelated(r)}
                          shadow="none"
                          radius="md"
                          className="overflow-hidden border border-divider"
                        >
                          <div className={`relative w-full bg-${rColor}-100`} style={{ aspectRatio: "4/3" }}>
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

