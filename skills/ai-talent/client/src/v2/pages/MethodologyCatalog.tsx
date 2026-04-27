/**
 * MethodologyCatalog — Pure HeroUI rewrite.
 *
 * Three tabs (HeroUI Tabs):
 *   - 方法論小組 (kind=squad)   → Card with Divider, no avatar
 *   - Agents (kind=agent)        → Cover Card (avatar / icon prominent)
 *   - 技能 (kind=skill)          → compact pressable list cards
 *
 * Filters (above tabs):
 *   - search (HeroUI Input)
 *   - layer dropdown (HeroUI Dropdown — L1..L6)
 *
 * Stats banner uses <EntityStats variant="row" />.
 *
 * All data flows through entity.listForHome(kinds=[...]) — single source.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import CreateMethodologyModal from "../components/methodology/CreateMethodologyModal";
import { EntityStats } from "../components/EntityStats";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardFooter, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Input, Skeleton, Spinner, Tab, Tabs,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faPlus, faSparkles, faCrown,
  faUsers, faRobot, faCubes, faCircleInfo,
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

export default function MethodologyCatalog() {
  const navigate = useNavigate();
  const { brandId } = useOutletContext<ShellOutletCtx>();

  const [activeKind, setActiveKind] = useState<Kind>("squad");
  const [searchQ, setSearchQ] = useState("");
  const [layerFilter, setLayerFilter] = useState<string>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pull all three kinds in parallel from a single endpoint
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: [], isLoading: false };

  const allEntities: any[] = entityQuery.data ?? [];

  // Filter by active tab + layer + search
  const filtered = useMemo(() => {
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

  // Counts per kind for tab labels
  const counts = useMemo(() => {
    const c = { squad: 0, agent: 0, skill: 0 } as Record<Kind, number>;
    for (const e of allEntities) c[e.kind as Kind] = (c[e.kind as Kind] ?? 0) + 1;
    return c;
  }, [allEntities]);

  const layerLabel = LAYER_OPTIONS.find((o) => o.value === layerFilter)?.label ?? "全部層級";

  return (
    <main className="pb-16">
      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative bg-content1 border-b border-divider">
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <Button
            variant="bordered"
            radius="full"
            startContent={<FontAwesomeIcon icon={faSparkles} />}
            onPress={() => setDrawerOpen(true)}
          >
            先睹為快
          </Button>
          <Button
            color="primary"
            radius="full"
            startContent={<FontAwesomeIcon icon={faPlus} />}
            onPress={() => setDrawerOpen(true)}
          >
            從網路新增任務範本
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-10">
          <h1 className="text-center text-5xl font-semibold tracking-tight">任務範本</h1>
          <p className="mt-3 text-center text-medium text-default-500">
            預先策劃的方法論小組、AI Agent、可組合技能 — 全部即點即用
          </p>

          <div className="mt-8 max-w-[680px] mx-auto">
            <Input
              size="lg"
              radius="full"
              variant="bordered"
              value={searchQ}
              onValueChange={setSearchQ}
              placeholder="搜尋數百個任務範本"
              isClearable
              onClear={() => setSearchQ("")}
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
            />
          </div>
        </div>
      </section>

      {/* ─── Live entity stats banner ───────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-8">
        <EntityStats variant="row" />
      </section>

      {/* ─── Tabs + Filters ─────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
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
                    <Chip size="sm" variant="flat" className="h-5 min-h-5">
                      {counts[t.id] ?? 0}
                    </Chip>
                  </div>
                }
              />
            ))}
          </Tabs>

          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                size="sm"
                variant="bordered"
                radius="full"
                endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny" />}
              >
                {layerLabel}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="層級篩選"
              selectionMode="single"
              selectedKeys={new Set([layerFilter])}
              onAction={(k) => setLayerFilter(String(k))}
            >
              {LAYER_OPTIONS.map((o) => <DropdownItem key={o.value}>{o.label}</DropdownItem>)}
            </DropdownMenu>
          </Dropdown>
        </div>

        <p className="text-tiny text-default-500 mb-5">
          {KIND_TABS.find((t) => t.id === activeKind)?.description}
        </p>

        {/* ─── Loading / Empty / Grid ───────────────────────────── */}
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

        {!entityQuery.isLoading && filtered.length === 0 && (
          <Card shadow="none" className="border-2 border-dashed border-divider">
            <CardBody className="py-16 items-center text-center gap-3">
              <FontAwesomeIcon icon={faCircleInfo} className="text-3xl text-default-300" />
              <p className="text-medium font-medium">沒有符合的{KIND_TABS.find((t) => t.id === activeKind)?.label}</p>
              <p className="text-small text-default-500">
                試試其他層級、清除搜尋，或從網路新增一個。
              </p>
            </CardBody>
          </Card>
        )}

        {!entityQuery.isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((e: any) => (
              <EntityCard
                key={`${e.kind}-${e.id ?? e.slug}`}
                entity={e}
                onPreview={() => {
                  if (e.kind === "squad") navigate(`/templates/${e.slug}`);
                  else navigate(`/templates/${e.slug}`);  // future: agents/skills detail page
                }}
              />
            ))}
          </div>
        )}
      </section>

      <CreateMethodologyModal
        open={drawerOpen}
        initialSource="recommended"
        onClose={() => setDrawerOpen(false)}
        onCreated={(slug) => {
          setDrawerOpen(false);
          navigate(`/templates/${slug}`);
        }}
      />
    </main>
  );
}

/* ─────────────────────────── EntityCard ──────────────────────────── */

function EntityCard({ entity, onPreview }: { entity: any; onPreview: () => void }) {
  const layerKey = entity.strategyLayer as MosLayer;
  const tone = LAYER_TOKENS[layerKey];

  // Three layouts based on kind
  if (entity.kind === "squad") {
    return (
      <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full">
        <CardHeader className="flex items-center justify-between gap-3">
          <h3 className="text-medium font-semibold leading-tight line-clamp-1">{entity.name}</h3>
          <Chip size="sm" color={tone?.heroColor ?? "default"} variant="flat" className="shrink-0">
            {layerKey}・{tone?.label}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="gap-1.5">
          {entity.subtitle && (
            <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">
              {entity.subtitle}
            </p>
          )}
          <p className="text-small text-default-700 line-clamp-3 leading-snug">
            {entity.description || "尚無描述。"}
          </p>
        </CardBody>
        {Array.isArray(entity.stats) && entity.stats.length > 0 && (
          <>
            <Divider />
            <CardFooter className="gap-4 text-tiny text-default-500">
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
    // Agent: cover-style with prominent avatar
    return (
      <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full">
        <CardBody className="items-center text-center gap-2 pt-6">
          <Avatar
            name={entity.initial}
            color={tone?.heroColor ?? "default"}
            size="lg"
            radius="full"
            className="mb-2"
          />
          <h3 className="text-medium font-semibold leading-tight line-clamp-1">{entity.name}</h3>
          {entity.subtitle && (
            <p className="text-tiny text-default-500 line-clamp-1">{entity.subtitle}</p>
          )}
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

  // skill: compact list-style card
  return (
    <Card isPressable isHoverable onPress={onPreview} shadow="sm" className="w-full">
      <CardBody className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-small font-semibold leading-tight line-clamp-2">{entity.name}</h3>
          <Chip size="sm" color={tone?.heroColor ?? "default"} variant="flat" className="shrink-0">
            {layerKey}
          </Chip>
        </div>
        {entity.subtitle && (
          <p className="text-tiny text-default-400">{entity.subtitle}</p>
        )}
        <p className="text-tiny text-default-500 line-clamp-2 mt-1 leading-snug">
          {entity.description || "—"}
        </p>
        {Array.isArray(entity.stats) && entity.stats.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entity.stats.map((s: any, i: number) => (
              <Chip key={i} size="sm" variant="flat" className="text-tiny">{s.label}</Chip>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
