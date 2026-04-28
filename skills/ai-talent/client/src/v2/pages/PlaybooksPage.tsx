/**
 * PlaybooksPage — 成長方案 / Growth Playbooks (HeroUI v2 migration)
 *
 * Canva Brand Hub parity: tiles → Card+Image, badges → Chip, drawer → Drawer,
 * phase roadmap → Accordion, KPI pills → Chip(bordered), pitch/outcome → Snippet,
 * apply CTA → Button(isLoading), error → Alert, scroll body → ScrollShadow,
 * filter → Tabs, loading → Skeleton/Spinner, separators → Divider.
 *
 * Hex `data.color` is kept ONLY for the cover hero gradient artwork; all other
 * states use HeroUI semantic tokens via `colorOf(badge)`.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Accordion, AccordionItem, Alert, Breadcrumbs, BreadcrumbItem,
  Button, Card, CardBody, CardFooter, Chip, Divider, Drawer, DrawerBody,
  DrawerContent, DrawerFooter, DrawerHeader, Dropdown, DropdownItem,
  DropdownMenu, DropdownTrigger, Input, ScrollShadow, Skeleton,
  Snippet, Spinner, Tab, Tabs, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare, faCheck, faUsers, faBroadcastTower,
  faBullseye, faClock, faSackDollar, faPeopleGroup, faXmark,
  faMagnifyingGlass, faArrowUpWideShort, faFolderOpen, faChevronDown,
} from "@fortawesome/free-solid-svg-icons";

type PlaybookSummary = {
  id: string;
  title: string;
  badge: string;
  hook: string;
  problem: string;
  audience: string;
  duration: string;
  budget: string;
  color: string;
  emoji: string;
  pitch: string;
  phaseCount: number;
  squadCount: number;
  personaCount: number;
  channelCount: number;
};

const BADGE_COPY: Record<string, string> = {
  GROWTH: "成長", BRAND: "品牌", REVIVAL: "復活",
  B2B: "B2B", CRISIS: "危機", VIRAL: "病毒",
};

type ChipColor = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
const colorOf = (badge: string): ChipColor => {
  switch (badge) {
    case "GROWTH":  return "success";
    case "BRAND":   return "secondary";
    case "REVIVAL": return "warning";
    case "B2B":     return "primary";
    case "CRISIS":  return "danger";
    case "VIRAL":   return "secondary";
    default:        return "default";
  }
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all",     label: "全部"   },
  { id: "GROWTH",  label: "成長"   },
  { id: "BRAND",   label: "品牌"   },
  { id: "REVIVAL", label: "復活"   },
  { id: "B2B",     label: "B2B"    },
  { id: "CRISIS",  label: "危機"   },
  { id: "VIRAL",   label: "病毒"   },
];

export default function PlaybooksPage() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const listQuery = (trpc as any).playbook.list.useQuery();
  const playbooks: PlaybookSummary[] = listQuery.data ?? [];

  const [filter, setFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState<string>("");
  const [sort, setSort] = useState<"recommended" | "duration" | "budget">("recommended");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Counts per badge for tab labels
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: playbooks.length };
    for (const p of playbooks) m[p.badge] = (m[p.badge] ?? 0) + 1;
    return m;
  }, [playbooks]);

  const filtered = useMemo(() => {
    let r = filter === "all" ? playbooks : playbooks.filter((p) => p.badge === filter);
    const q = searchQ.trim().toLowerCase();
    if (q) {
      r = r.filter((p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.hook ?? "").toLowerCase().includes(q) ||
        (p.problem ?? "").toLowerCase().includes(q) ||
        (p.audience ?? "").toLowerCase().includes(q)
      );
    }
    if (sort === "duration") {
      r = [...r].sort((a, b) => (a.phaseCount ?? 0) - (b.phaseCount ?? 0));
    } else if (sort === "budget") {
      // Lexicographic on budget string is good enough — schema is consistent (e.g. "10–30 萬").
      r = [...r].sort((a, b) => (a.budget ?? "").localeCompare(b.budget ?? ""));
    }
    return r;
  }, [playbooks, filter, searchQ, sort]);

  const SORT_LABEL: Record<typeof sort, string> = {
    recommended: "推薦排序",
    duration: "依期間",
    budget: "依預算",
  };

  return (
    <div className="px-8 py-10 max-w-[1280px] mx-auto">
      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="mb-6">
        <Breadcrumbs size="sm" className="mb-3">
          <BreadcrumbItem href="/">首頁</BreadcrumbItem>
          <BreadcrumbItem>成長方案</BreadcrumbItem>
        </Breadcrumbs>

        <Chip size="sm" variant="flat" color="secondary" className="uppercase tracking-wider mb-2">
          PLAYBOOKS · 成長方案
        </Chip>
        <h1 className="font-semibold text-3xl leading-tight text-foreground mb-3">
          挑一個劇本，90 天讓品牌變成下一個案例
        </h1>
        <p className="text-default-500 text-small max-w-[640px] leading-relaxed">
          每個方案都是 SoWork 策展團隊把 squad（任務範本）、顧問團、媒體通路、
          KPI 串好的「可賣包」。背後是真實案例與可驗證的階段方法。
          選一個，按下「套用」，剩下交給流程。
          {currentBrand && (
            <> — 將套用到 <Chip size="sm" variant="flat" color="secondary">{currentBrand.name}</Chip></>
          )}
        </p>
      </div>

      {/* ── Filter row: tabs (with counts) + search + sort ─────── */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <Tabs
          aria-label="方案類別"
          selectedKey={filter}
          onSelectionChange={(k) => setFilter(String(k))}
          variant="underlined"
          color="primary"
        >
          {FILTERS.map((f) => (
            <Tab
              key={f.id}
              title={
                <span className="flex items-center gap-1.5">
                  {f.label}
                  {(counts[f.id] ?? 0) > 0 && (
                    <span className="text-tiny text-default-400 tabular-nums">
                      {counts[f.id]}
                    </span>
                  )}
                </span>
              }
            />
          ))}
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Input
            size="sm"
            radius="full"
            variant="bordered"
            value={searchQ}
            onValueChange={setSearchQ}
            placeholder="搜尋方案…"
            isClearable
            onClear={() => setSearchQ("")}
            startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 text-tiny" />}
            className="w-[220px]"
          />
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                size="sm" radius="full" variant="bordered"
                startContent={<FontAwesomeIcon icon={faArrowUpWideShort} className="text-tiny" />}
                endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny" />}
              >
                {SORT_LABEL[sort]}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="排序"
              selectionMode="single"
              selectedKeys={new Set([sort])}
              onAction={(k) => setSort(String(k) as typeof sort)}
            >
              <DropdownItem key="recommended">推薦排序</DropdownItem>
              <DropdownItem key="duration">依期間</DropdownItem>
              <DropdownItem key="budget">依預算</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────── */}
      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} shadow="sm" radius="lg" className="aspect-[5/6]">
              <Skeleton className="h-32 w-full rounded-none" />
              <CardBody className="gap-2">
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-3/5 rounded" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card shadow="none" className="border-2 border-dashed border-divider">
          <CardBody className="py-16 items-center text-center gap-3">
            <FontAwesomeIcon icon={faFolderOpen} className="text-4xl text-default-300" />
            <p className="text-medium font-medium">
              {searchQ ? `沒有找到符合「${searchQ}」的方案` : "這個分類目前沒有方案"}
            </p>
            <p className="text-small text-default-500">換個關鍵字、或選擇其他類別</p>
            {(searchQ || filter !== "all") && (
              <Button
                size="sm" variant="light"
                onPress={() => { setSearchQ(""); setFilter("all"); }}
              >
                清除篩選
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <PlaybookCard key={p.id} playbook={p} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}

      {/* ── Detail drawer ─────────────────────────────────── */}
      <PlaybookDetail
        id={selectedId}
        onClose={() => setSelectedId(null)}
        brandId={brandId}
        brandName={currentBrand?.name ?? null}
        onApplied={(_missionId, nextSteps) => {
          setSelectedId(null);
          if (nextSteps?.[0]?.href) navigate(nextSteps[0].href);
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PlaybookCard — HeroUI Card+Chip
// ──────────────────────────────────────────────────────────

function PlaybookCard({
  playbook, onClick,
}: { playbook: PlaybookSummary; onClick: () => void }) {
  const cc = colorOf(playbook.badge);
  return (
    <Card
      isPressable
      isHoverable
      onPress={onClick}
      shadow="sm"
      radius="lg"
      className="aspect-[5/6] overflow-hidden group"
    >
      {/* Hero band — keeps brand color gradient as artwork */}
      <div
        className="h-32 relative shrink-0"
        style={{ background: `linear-gradient(135deg, ${playbook.color} 0%, ${playbook.color}CC 100%)` }}
      >
        <Chip
          size="sm"
          variant="solid"
          className="absolute top-3 left-3 bg-black/25 text-white uppercase tracking-wider"
        >
          {BADGE_COPY[playbook.badge] ?? playbook.badge}
        </Chip>
        <div className="absolute right-4 bottom-2 text-5xl leading-none drop-shadow-md">
          {playbook.emoji}
        </div>
        {/* Hover quick-preview — appears on card hover (group). pointer-events-none
            so the parent isPressable still receives the click. */}
        <span
          aria-hidden
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-sm"
        >
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-tiny" style={{ color: playbook.color }} />
        </span>
      </div>

      <CardBody className="gap-2 px-5 pt-4 pb-2">
        <p className="font-semibold text-medium leading-snug">{playbook.title}</p>
        <p className="text-tiny text-default-500 leading-relaxed line-clamp-2">{playbook.hook}</p>
      </CardBody>

      <CardFooter className="px-5 pt-2 pb-4 flex-col items-start gap-2">
        <div className="flex items-center gap-2 text-tiny text-default-500">
          <FontAwesomeIcon icon={faClock} className="opacity-60" />
          <span>{playbook.duration}</span>
          <Divider orientation="vertical" className="h-3" />
          <FontAwesomeIcon icon={faSackDollar} className="opacity-60" />
          <span>{playbook.budget}</span>
        </div>
        <Divider />
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip size="sm" variant="flat" color={cc} startContent={<FontAwesomeIcon icon={faPeopleGroup} className="text-tiny ml-1" />}>
            {playbook.squadCount} squad
          </Chip>
          <Chip size="sm" variant="flat" startContent={<FontAwesomeIcon icon={faUsers} className="text-tiny ml-1" />}>
            {playbook.personaCount} 顧問
          </Chip>
          <Chip size="sm" variant="flat" startContent={<FontAwesomeIcon icon={faBroadcastTower} className="text-tiny ml-1" />}>
            {playbook.channelCount} 通路
          </Chip>
        </div>
      </CardFooter>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────
// PlaybookDetail — HeroUI Drawer
// ──────────────────────────────────────────────────────────

function PlaybookDetail({
  id, onClose, brandId, brandName, onApplied,
}: {
  id: string | null;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
  onApplied: (missionId: number | null, nextSteps: any[]) => void;
}) {
  const detailQuery = (trpc as any).playbook.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id }
  );
  const applyMut = (trpc as any).playbook.activate.useMutation();
  const data = detailQuery.data;

  const [applyError, setApplyError] = useState<string | null>(null);
  const applying = applyMut.isPending ?? applyMut.isLoading ?? false;

  const handleApply = async () => {
    if (!brandId || !id) {
      setApplyError("請先在右上角選擇品牌");
      return;
    }
    setApplyError(null);
    try {
      const r = await applyMut.mutateAsync({ playbookId: id, brandId });
      onApplied(r.missionId ?? null, r.nextSteps ?? []);
    } catch (e: any) {
      setApplyError(String(e?.message ?? e));
    }
  };

  const cc = data ? colorOf(data.badge) : "default";

  return (
    <Drawer
      isOpen={!!id}
      onClose={onClose}
      size="2xl"
      placement="right"
      backdrop="blur"
      hideCloseButton
    >
      <DrawerContent>
        {detailQuery.isLoading || !data ? (
          <DrawerBody className="items-center justify-center">
            <Spinner label="載入方案中…" />
          </DrawerBody>
        ) : (
          <>
            <DrawerHeader
              className="flex flex-col gap-3 px-8 pt-6 pb-5 relative"
              style={{ background: `linear-gradient(135deg, ${data.color}18 0%, ${data.color}06 100%)` }}
            >
              <Button
                isIconOnly
                size="sm"
                variant="light"
                radius="full"
                onPress={onClose}
                aria-label="關閉"
                className="absolute top-4 right-4"
              >
                <FontAwesomeIcon icon={faXmark} />
              </Button>

              <Breadcrumbs size="sm">
                <BreadcrumbItem href="/">首頁</BreadcrumbItem>
                <BreadcrumbItem onPress={onClose}>成長方案</BreadcrumbItem>
                <BreadcrumbItem>{data.title}</BreadcrumbItem>
              </Breadcrumbs>

              <div className="flex items-start gap-4">
                <div className="text-5xl leading-none">{data.emoji}</div>
                <div className="flex-1 min-w-0">
                  <Chip size="sm" color={cc} variant="flat" className="uppercase tracking-wider mb-1">
                    {BADGE_COPY[data.badge] ?? data.badge} · 成長方案
                  </Chip>
                  <h2 className="font-semibold text-2xl leading-tight mb-2">{data.title}</h2>
                  <p className="text-default-600 text-small leading-relaxed">{data.hook}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-2">
                <MetaCard icon={faClock}     label="期間" value={data.duration} />
                <MetaCard icon={faSackDollar} label="預算" value={data.budget} />
                <MetaCard icon={faBullseye}   label="適合" value={data.audience} small />
              </div>
            </DrawerHeader>

            <DrawerBody className="p-0">
              <Tabs
                aria-label="方案細節"
                variant="underlined"
                color="primary"
                fullWidth
                classNames={{
                  tabList: "px-6 pt-1 border-b border-divider gap-4",
                  panel: "p-0 h-full overflow-hidden",
                }}
              >
                {/* ── Tab 1: Overview ───────────────────────────────── */}
                <Tab key="overview" title="總覽">
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6 space-y-7">
                      <Section title="這個方案在解什麼痛">
                        <p className="text-foreground text-small leading-relaxed whitespace-pre-line">
                          {data.problem}
                        </p>
                      </Section>

                      <Section title="方案組合">
                        <Snippet
                          hideSymbol
                          variant="flat"
                          color={cc}
                          className="mb-4 w-full"
                          classNames={{ pre: "whitespace-pre-wrap text-small" }}
                        >
                          {data.pitch}
                        </Snippet>
                        <div className="grid grid-cols-3 gap-3">
                          <BundleCard label="任務範本" count={data.bundle.squadSlugs.length} detail={data.bundle.squadSlugs.join(" · ")} />
                          <BundleCard label="顧問"     count={data.bundle.personaIds.length} detail={data.bundle.personaIds.join(" · ")} />
                          <BundleCard label="媒體通路" count={data.bundle.channelIds.length} detail={data.bundle.channelIds.join(" · ")} />
                        </div>
                      </Section>
                    </div>
                  </ScrollShadow>
                </Tab>

                {/* ── Tab 2: Roadmap ────────────────────────────────── */}
                <Tab key="roadmap" title={`Roadmap · ${data.phases.length}`}>
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6">
                      <Accordion
                        variant="bordered"
                        selectionMode="multiple"
                        defaultExpandedKeys={data.phases.length ? ["0"] : []}
                      >
                        {data.phases.map((ph: any, idx: number) => (
                          <AccordionItem
                            key={String(idx)}
                            aria-label={ph.name}
                            startContent={<Chip size="sm" color={cc} variant="flat">{ph.week}</Chip>}
                            title={<span className="font-semibold text-small">{ph.name}</span>}
                            subtitle={<span className="text-tiny text-default-500">{ph.tasks.length} 項任務 · {ph.deliverables.length} 項產出</span>}
                          >
                            <ul className="text-small space-y-1.5 mb-3 pl-1">
                              {ph.tasks.map((t: string, i: number) => (
                                <li key={i} className="flex gap-2">
                                  <FontAwesomeIcon icon={faCheck} className="text-tiny mt-1 text-success" />
                                  <span className="flex-1">{t}</span>
                                </li>
                              ))}
                            </ul>
                            <Divider className="my-2" />
                            <div className="text-tiny text-default-500">
                              <span className="font-medium text-default-600">產出：</span>
                              {ph.deliverables.map((d: string, i: number) => (
                                <Chip key={i} size="sm" variant="flat" className="ml-1 my-0.5">{d}</Chip>
                              ))}
                            </div>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  </ScrollShadow>
                </Tab>

                {/* ── Tab 3: Case ───────────────────────────────────── */}
                <Tab key="case" title="成功案例">
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6">
                      <Card shadow="none" className="border border-divider" style={{ background: `${data.color}08` }}>
                        <CardBody className="gap-3 p-5">
                          <div className="flex items-center gap-2">
                            <Chip size="sm" variant="flat">{data.successCase.industry}</Chip>
                            <Chip size="sm" variant="flat">{data.successCase.scope}</Chip>
                          </div>
                          <p className="font-semibold text-medium" style={{ color: data.color }}>
                            {data.successCase.brand}
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <BeforeAfter label="Before" text={data.successCase.before} />
                            <BeforeAfter label="After"  text={data.successCase.after} highlight={data.color} />
                          </div>
                          <Divider />
                          <p className="text-tiny uppercase tracking-wider text-default-500">關鍵動作</p>
                          <ul className="text-small space-y-1.5">
                            {data.successCase.keyMoves.map((m: string, i: number) => (
                              <li key={i} className="flex gap-2">
                                <FontAwesomeIcon icon={faCheck} className="text-tiny mt-1" style={{ color: data.color }} />
                                <span className="flex-1">{m}</span>
                              </li>
                            ))}
                          </ul>
                          <Divider />
                          <Snippet
                            hideSymbol
                            variant="flat"
                            color={cc}
                            classNames={{ pre: "whitespace-pre-wrap text-small font-medium" }}
                          >
                            {data.successCase.outcome}
                          </Snippet>
                        </CardBody>
                      </Card>
                    </div>
                  </ScrollShadow>
                </Tab>

                {/* ── Tab 4: KPIs ───────────────────────────────────── */}
                <Tab key="kpis" title={`預期 KPI · ${data.kpis.length}`}>
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6">
                      <p className="text-tiny tracking-wider uppercase text-default-500 mb-3">
                        90 天內可驗證的成效指標
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {data.kpis.map((k: string, i: number) => (
                          <Chip key={i} size="md" variant="bordered" color={cc}>{k}</Chip>
                        ))}
                      </div>
                    </div>
                  </ScrollShadow>
                </Tab>
              </Tabs>
            </DrawerBody>

            <DrawerFooter className="flex-col items-stretch gap-2 border-t border-divider px-8 py-4">
              {applyError && (
                <Alert color="danger" variant="flat" title={applyError} onClose={() => setApplyError(null)} />
              )}
              {!brandId && !applyError && (
                <Alert color="warning" variant="flat" title="請先在左上角選擇品牌再套用" />
              )}
              <Tooltip content={!brandId ? "請先選擇品牌" : ""} isDisabled={!!brandId}>
                <Button
                  color="primary"
                  size="lg"
                  radius="lg"
                  className="w-full font-medium"
                  isLoading={applying}
                  isDisabled={!brandId}
                  onPress={handleApply}
                  endContent={!applying && <FontAwesomeIcon icon={faArrowUpRightFromSquare} />}
                  style={{ background: brandId ? data.color : undefined }}
                >
                  {applying
                    ? "套用中…"
                    : brandName
                    ? `套用此方案到 ${brandName}`
                    : "套用此方案"}
                </Button>
              </Tooltip>
              <p className="text-tiny text-default-500 text-center">
                套用後會建立任務、自動推薦 squad、預先呼叫顧問團
              </p>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ──────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-tiny tracking-wider uppercase text-default-500 mb-3 font-medium">
        {title}
      </h3>
      {children}
    </div>
  );
}

function MetaCard({
  icon, label, value, small = false,
}: { icon: any; label: string; value: string; small?: boolean }) {
  return (
    <Card shadow="none" className="border border-divider/60 bg-content1/60 backdrop-blur-sm">
      <CardBody className="p-2.5 gap-1">
        <div className="flex items-center gap-1.5 text-tiny uppercase tracking-wider text-default-500">
          <FontAwesomeIcon icon={icon} />
          <span>{label}</span>
        </div>
        <p className={small ? "text-tiny font-medium leading-snug" : "text-small font-medium"}>
          {value}
        </p>
      </CardBody>
    </Card>
  );
}

function BundleCard({
  label, count, detail,
}: { label: string; count: number; detail: string }) {
  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-3 gap-1">
        <p className="text-tiny uppercase tracking-wider text-default-500">{label}</p>
        <p className="font-semibold text-2xl leading-none">{count}</p>
        <p className="text-tiny text-default-500 line-clamp-2 leading-snug">{detail}</p>
      </CardBody>
    </Card>
  );
}

function BeforeAfter({
  label, text, highlight,
}: { label: string; text: string; highlight?: string }) {
  return (
    <div>
      <p className="text-tiny uppercase tracking-wider text-default-500 mb-1">{label}</p>
      <p
        className="text-small leading-relaxed"
        style={highlight ? { color: highlight, fontWeight: 500 } : undefined}
      >
        {text}
      </p>
    </div>
  );
}
