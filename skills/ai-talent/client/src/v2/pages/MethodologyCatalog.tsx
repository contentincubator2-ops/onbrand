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
import { EntityStats } from "../components/EntityStats";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardFooter, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Input, Skeleton, Tab, Tabs, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faChevronLeft, faChevronRight,
  faPlus, faWandMagicSparkles, faCrown, faUsers, faRobot, faCubes, faCircleInfo,
  faBullseye, faMessage, faChartLine, faPalette, faRocket, faBriefcase,
  faVideo, faShareNodes, faStar, faArrowRight,
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

  const onPreview = (slug: string) => navigate(`/templates/${slug}`);

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
      {/* ─── Hero (pastel gradient) ─────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-success-100 via-secondary-100 to-danger-100">
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <Button variant="bordered" radius="full" startContent={<FontAwesomeIcon icon={faWandMagicSparkles} />} onPress={() => setDrawerOpen(true)}>
            先睹為快
          </Button>
          <Button color="primary" radius="full" startContent={<FontAwesomeIcon icon={faCrown} />} onPress={() => setDrawerOpen(true)}>
            開始試用 NT$0 元
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-14">
          <h1 className="text-center text-5xl md:text-6xl font-semibold tracking-tight text-foreground">範本</h1>

          <div className="mt-8 max-w-[680px] mx-auto">
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

      {/* ─── Live entity stats banner ───────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-8">
        <EntityStats variant="row" />
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
            <EntityCard entity={e} onPreview={() => onPreview(e.slug)} />
          </div>
        ))}
      </ScrollSection>

      {/* ─── Agents ─────────────────────────────────────────────── */}
      <ScrollSection
        title="精選 Agents"
        subtitle="個別 AI 專家角色，可放進你的 squad"
        cta="完整型錄 →"
        onCta={() => { setActiveKind("agent"); setLayerFilter("ALL"); document.getElementById("more-templates-section")?.scrollIntoView({ behavior: "smooth" }); }}
        loading={entityQuery.isLoading}
      >
        {topAgents.map((e: any) => (
          <div key={`ag-${e.id}`} className="shrink-0 w-[240px]">
            <EntityCard entity={e} onPreview={() => onPreview(e.slug)} />
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
            <EntityCard entity={e} onPreview={() => onPreview(e.slug)} />
          </div>
        ))}
      </ScrollSection>

      {/* ─── 受你啟發的方法論 (random shuffle for discovery) ──── */}
      <ScrollSection
        title="受你的設計啟發"
        subtitle="隨機探索 — 可能找到沒想過的組合"
        loading={entityQuery.isLoading}
      >
        {recentInspiration.map((e: any) => (
          <div key={`in-${e.kind}-${e.id}`} className="shrink-0 w-[280px]">
            <EntityCard entity={e} onPreview={() => onPreview(e.slug)} />
          </div>
        ))}
      </ScrollSection>

      {/* ─── 熱門精選 banners (3 promotional cards) ─────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-12">
        <h2 className="text-2xl font-semibold tracking-tight mb-4">熱門精選</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURED_BANNERS.map((b) => (
            <Card
              key={b.key}
              isPressable
              isHoverable
              onPress={() => setDrawerOpen(true)}
              shadow="sm"
              className={`${b.bgClass} h-[120px]`}
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

      {/* ─── 為你提供更多範本 (Tabs + Grid) ──────────────────── */}
      <section id="more-templates-section" className="max-w-[1280px] mx-auto px-8 mt-12">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">為你提供更多範本</h2>
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

        <Tabs
          aria-label="實體類型"
          color="primary"
          variant="underlined"
          selectedKey={activeKind}
          onSelectionChange={(k) => setActiveKind(k as Kind)}
          classNames={{ tabList: "gap-6 px-0" }}
        >
          {KIND_TABS.map((t) => (
            <Tab
              key={t.id}
              title={
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={t.icon} />
                  <span>{t.label}</span>
                  <Chip size="sm" variant="flat" className="h-5 min-h-5">{counts[t.id] ?? 0}</Chip>
                </div>
              }
            />
          ))}
        </Tabs>

        <p className="text-tiny text-default-500 mb-5 mt-2">
          {KIND_TABS.find((t) => t.id === activeKind)?.description}
        </p>

        {entityQuery.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} shadow="sm">
                <CardBody className="gap-2">
                  <Skeleton className="h-6 w-3/5 rounded" />
                  <Skeleton className="h-3 w-2/5 rounded" />
                  <Skeleton className="h-12 w-full rounded mt-2" />
                </CardBody>
              </Card>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {gridFiltered.map((e: any) => (
              <EntityCard key={`${e.kind}-${e.id ?? e.slug}`} entity={e} onPreview={() => onPreview(e.slug)} />
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
    <section className="max-w-[1280px] mx-auto px-8 mt-12">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-small text-default-500 mt-1">{subtitle}</p>}
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
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="shrink-0 w-[260px] h-[160px] rounded-large" />
          ))}
        </div>
      ) : (
        <div ref={ref} className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x" style={{ scrollSnapType: "x mandatory" }}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── EntityCard (3 layouts) ──────────────────── */

function EntityCard({ entity, onPreview }: { entity: any; onPreview: () => void }) {
  const layerKey = entity.strategyLayer as MosLayer;
  const tone = LAYER_TOKENS[layerKey];

  if (entity.kind === "squad") {
    return (
      <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full h-full">
        <CardHeader className="flex items-center justify-between gap-3">
          <h3 className="text-medium font-semibold leading-tight line-clamp-1">{entity.name}</h3>
          <Chip size="sm" color={tone?.heroColor ?? "default"} variant="flat" className="shrink-0">
            {layerKey}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="gap-1.5">
          {entity.subtitle && (
            <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">{entity.subtitle}</p>
          )}
          <p className="text-small text-default-700 line-clamp-3 leading-snug">
            {entity.description || "尚無描述。"}
          </p>
        </CardBody>
        {Array.isArray(entity.stats) && entity.stats.length > 0 && (
          <>
            <Divider />
            <CardFooter className="gap-3 text-tiny text-default-500">
              {entity.stats.map((s: any, i: number) => (
                <span key={i}><b className="text-default-700">{s.value}</b> {s.label}</span>
              ))}
            </CardFooter>
          </>
        )}
      </Card>
    );
  }

  if (entity.kind === "agent") {
    return (
      <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full h-full">
        <CardBody className="items-center text-center gap-2 pt-6">
          <Avatar name={entity.initial} color={tone?.heroColor ?? "default"} size="lg" radius="full" className="mb-2" />
          <h3 className="text-medium font-semibold leading-tight line-clamp-1">{entity.name}</h3>
          {entity.subtitle && <p className="text-tiny text-default-500 line-clamp-1">{entity.subtitle}</p>}
          <Chip size="sm" color={tone?.heroColor ?? "default"} variant="flat" className="mt-1">
            {layerKey}・{tone?.label}
          </Chip>
        </CardBody>
        <Divider />
        <CardFooter className="text-tiny text-default-500">
          <p className="line-clamp-2 leading-snug">{entity.description || "—"}</p>
        </CardFooter>
      </Card>
    );
  }

  // skill
  return (
    <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full h-full">
      <CardBody className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-small font-semibold leading-tight line-clamp-2">{entity.name}</h3>
          <Chip size="sm" color={tone?.heroColor ?? "default"} variant="flat" className="shrink-0">{layerKey}</Chip>
        </div>
        {entity.subtitle && <p className="text-tiny text-default-400">{entity.subtitle}</p>}
        <p className="text-tiny text-default-500 line-clamp-2 mt-1 leading-snug">{entity.description || "—"}</p>
      </CardBody>
    </Card>
  );
}
