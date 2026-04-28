/**
 * PlaybooksPage — 成長方案 sourced from squads with named methodology.
 *
 * Per CJ request: drop the 6 hardcoded curated playbooks and surface
 * every squad whose methodology has a named author (= "has 成功案例").
 * Each card carries: 任務名 (taskLabel), squad 名, squad 描述,
 * agent 人數, 方法論作者 (acts as 成功案例 byline).
 *
 * Backend: trpc.playbook.listFromSquads (added 2026-04-28).
 * Card click → drawer with description, member list, step roadmap,
 * methodology byline.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Alert, Avatar, AvatarGroup, Breadcrumbs, BreadcrumbItem, Button, Card,
  CardBody, CardFooter, Chip, Divider, Drawer, DrawerBody, DrawerContent,
  DrawerFooter, DrawerHeader, Dropdown, DropdownItem, DropdownMenu,
  DropdownTrigger, Input, ScrollShadow, Skeleton, Snippet, Spinner, Tab,
  Tabs, Tooltip, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare, faCheck, faUsers, faBookOpen, faClock,
  faXmark, faMagnifyingGlass, faArrowUpWideShort, faFolderOpen,
  faChevronDown, faRocket, faLayerGroup, faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { AgentAvatar } from "../components/AgentAvatar";
import { TaskChip } from "../components/TaskChip";

interface MemberPreview {
  id: number | null;
  name: string | null;
  role: string | null;
  primarySkill: string | null;
}

interface Showcase {
  title?: string;
  description?: string;
  result?: string;
}

interface SquadPlaybook {
  id: string;
  slug: string;
  taskLabel: string | null;
  taskLabelEn: string | null;
  name: string;
  description: string | null;
  memberCount: number;
  stepCount: number;
  strategyLayer: string | null;
  methodology: {
    slug: string | null;
    author: string | null;
    year: number | null;
    summary: string | null;
  } | null;
  showcases: Showcase[];
  workspace: string[];
  tags: string[];
  mockup?: { platform: string; format: string };
  memberPreview: MemberPreview[];
}

const LAYER_LABEL: Record<string, string> = {
  L1: "策略", L2: "產品", L3: "受眾",
  L4: "通路", L5: "規劃", L6: "監測",
};

const LAYER_COLOR: Record<string, "primary" | "secondary" | "success" | "warning" | "danger" | "default"> = {
  L1: "primary",
  L2: "warning",
  L3: "secondary",
  L4: "success",
  L5: "danger",
  L6: "default",
};

const layerKey = (raw: string | null): string => {
  if (!raw) return "L1";
  return raw.slice(0, 2);
};

export default function PlaybooksPage() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const listQuery = (trpc as any).playbook.listFromSquads.useQuery();
  const playbooks: SquadPlaybook[] = listQuery.data ?? [];

  const [layerFilter, setLayerFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState<string>("");
  const [sort, setSort] = useState<"recommended" | "members" | "steps">("recommended");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: playbooks.length };
    for (const p of playbooks) {
      const l = layerKey(p.strategyLayer);
      m[l] = (m[l] ?? 0) + 1;
    }
    return m;
  }, [playbooks]);

  const filtered = useMemo(() => {
    let r = layerFilter === "all" ? playbooks : playbooks.filter((p) => layerKey(p.strategyLayer) === layerFilter);
    const q = searchQ.trim().toLowerCase();
    if (q) {
      r = r.filter((p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.taskLabel ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.methodology?.author ?? "").toLowerCase().includes(q)
      );
    }
    if (sort === "members") {
      r = [...r].sort((a, b) => b.memberCount - a.memberCount);
    } else if (sort === "steps") {
      r = [...r].sort((a, b) => b.stepCount - a.stepCount);
    }
    return r;
  }, [playbooks, layerFilter, searchQ, sort]);

  const SORT_LABEL: Record<typeof sort, string> = {
    recommended: "推薦排序",
    members: "依顧問人數",
    steps: "依步驟數",
  };

  const FILTERS: Array<{ id: string; label: string }> = [
    { id: "all", label: "全部" },
    { id: "L1",  label: "L1 策略" },
    { id: "L2",  label: "L2 產品" },
    { id: "L3",  label: "L3 受眾" },
    { id: "L4",  label: "L4 通路" },
    { id: "L5",  label: "L5 規劃" },
    { id: "L6",  label: "L6 監測" },
  ];

  return (
    <div className="px-8 py-10 max-w-[1280px] mx-auto">
      {/* ── Hero ──────────────────────────────────────────── */}
      <div className="mb-6">
        <Breadcrumbs size="sm" className="mb-3">
          <BreadcrumbItem href="/">首頁</BreadcrumbItem>
          <BreadcrumbItem>成長方案</BreadcrumbItem>
        </Breadcrumbs>

        <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider mb-2">
          PLAYBOOKS · 成長方案
        </Chip>
        <h1 className="font-semibold text-3xl leading-tight text-foreground mb-3">
          挑一個有真實案例的方法論，套用到品牌
        </h1>
        <p className="text-default-500 text-small max-w-[640px] leading-relaxed">
          每個方案都對應一個有作者背景的方法論小組（squad），由真實顧問
          + 多階段工作流組成。選一個 → 直接派出。
          {currentBrand && (
            <> — 將套用到 <Chip size="sm" variant="flat" color="default">{currentBrand.name}</Chip></>
          )}
        </p>
      </div>

      {/* ── Filter row ─────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <Tabs
          aria-label="策略層"
          selectedKey={layerFilter}
          onSelectionChange={(k) => setLayerFilter(String(k))}
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
            size="sm" radius="full" variant="bordered"
            value={searchQ} onValueChange={setSearchQ}
            placeholder="搜尋方法論…" isClearable onClear={() => setSearchQ("")}
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
              <DropdownItem key="members">依顧問人數</DropdownItem>
              <DropdownItem key="steps">依步驟數</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {/* ── Grid / states ──────────────────────────────────── */}
      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} shadow="sm" radius="lg">
              <CardBody className="gap-2 p-5">
                <Skeleton className="h-4 w-3/5 rounded" />
                <Skeleton className="h-5 w-4/5 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[88%] rounded" />
                <Skeleton className="h-8 w-32 rounded mt-2" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card shadow="none" className="border-2 border-dashed border-divider">
          <CardBody className="py-16 items-center text-center gap-3">
            <FontAwesomeIcon icon={faFolderOpen} className="text-4xl text-default-300" />
            <p className="text-medium font-medium">
              {playbooks.length === 0
                ? "還沒有 squad 配上真實案例"
                : searchQ
                  ? `沒有找到符合「${searchQ}」的方案`
                  : "這個策略層目前沒有方案"}
            </p>
            <p className="text-small text-default-500 max-w-[480px]">
              {playbooks.length === 0
                ? "這個頁面只展示有真實成功案例的 squad。為 squad 的 showcases JSON 加上第 2 筆以上的真實案例（baseline 自動填的不算），就會出現在這裡。"
                : "換個關鍵字、或選擇其他類別"}
            </p>
            {(searchQ || layerFilter !== "all") && playbooks.length > 0 && (
              <Button size="sm" variant="light" onPress={() => { setSearchQ(""); setLayerFilter("all"); }}>
                清除篩選
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <PlaybookCard key={p.id} playbook={p} onClick={() => setSelectedSlug(p.slug)} />
          ))}
        </div>
      )}

      {/* ── Detail drawer ──────────────────────────────────── */}
      <PlaybookDetail
        squad={filtered.find((p) => p.slug === selectedSlug) ?? playbooks.find((p) => p.slug === selectedSlug) ?? null}
        onClose={() => setSelectedSlug(null)}
        brandId={brandId}
        brandName={currentBrand?.name ?? null}
        onLaunched={(missionId) => {
          setSelectedSlug(null);
          navigate(`/picker?mission=${missionId}`);
        }}
      />
    </div>
  );
}

/* ─────────────────────────── PlaybookCard ─────────────────────────── */

function PlaybookCard({ playbook: p, onClick }: { playbook: SquadPlaybook; onClick: () => void }) {
  const lk = layerKey(p.strategyLayer);
  const lkColor = LAYER_COLOR[lk] ?? "default";

  return (
    <Card
      isPressable isHoverable onPress={onClick}
      shadow="sm" radius="lg"
      className="overflow-hidden group"
    >
      <CardBody className="gap-3 px-5 pt-5 pb-3">
        {/* Top row: layer + workspace + task */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip
            size="sm" variant="flat" color="default"
            startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}
          >
            {lk} · {LAYER_LABEL[lk] ?? "策略"}
          </Chip>
          {p.taskLabel && (
            <TaskChip
              entity={{ taskLabel: p.taskLabel, mockup: p.mockup, workspace: p.workspace, name: p.name }}
              kind="squad" size="sm"
            />
          )}
          {/* Hover quick-preview */}
          <span
            aria-hidden
            className="ml-auto w-7 h-7 rounded-full bg-default-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none"
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-tiny text-default-500" />
          </span>
        </div>

        {/* Squad name (most prominent) */}
        <p className="font-semibold text-medium leading-snug line-clamp-2 min-h-[2.4em]">
          {p.name}
        </p>

        {/* Squad description */}
        {p.description && (
          <p className="text-tiny text-default-500 leading-relaxed line-clamp-3 min-h-[3.6em]">
            {p.description}
          </p>
        )}
      </CardBody>

      <CardFooter className="px-5 pt-2 pb-4 flex-col items-start gap-2.5">
        {/* Lead showcase — the curator-added real case (skip baseline at idx 0
            when there are 2+; otherwise show whatever exists). */}
        {p.showcases.length > 0 && (() => {
          const lead = p.showcases.length >= 2 ? p.showcases[1] : p.showcases[0];
          return (
            <div className="w-full bg-success-50 border border-success-200 rounded-medium px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-tiny font-bold text-success-700">
                <FontAwesomeIcon icon={faTrophy} className="text-tiny" />
                <span className="truncate">{lead.title ?? "成功案例"}</span>
                {p.showcases.length > 2 && (
                  <span className="text-default-500 font-normal ml-auto">+{p.showcases.length - 2}</span>
                )}
              </div>
              {lead.result && (
                <p className="text-tiny text-success-700 font-medium leading-snug line-clamp-1">
                  {lead.result}
                </p>
              )}
              {lead.description && (
                <p className="text-tiny text-default-600 leading-snug line-clamp-2">
                  {lead.description}
                </p>
              )}
            </div>
          );
        })()}

        <Divider />

        {/* Members + steps row */}
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {p.memberPreview.length > 0 ? (
              <>
                <div className="flex items-center -space-x-2">
                  {p.memberPreview.slice(0, 4).map((m, i) => (
                    <span key={m.id ?? i} className="ring-2 ring-content1 rounded-full">
                      <AgentAvatar
                        seed={m.id ?? m.name ?? `m${i}`}
                        size={28}
                        className="rounded-full"
                      />
                    </span>
                  ))}
                </div>
                <span className="text-tiny text-default-500 ml-1">{p.memberCount} 位顧問</span>
              </>
            ) : (
              <Chip size="sm" variant="flat"
                startContent={<FontAwesomeIcon icon={faUsers} className="text-tiny ml-1" />}>
                {p.memberCount} 位顧問
              </Chip>
            )}
          </div>
          {p.stepCount > 0 && (
            <Chip size="sm" variant="flat"
              startContent={<FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" />}>
              {p.stepCount} 步驟
            </Chip>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

/* ─────────────────────────── PlaybookDetail ─────────────────────────── */

function PlaybookDetail({
  squad, onClose, brandId, brandName, onLaunched,
}: {
  squad: SquadPlaybook | null;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
  onLaunched: (missionId: number) => void;
}) {
  const createMission = (trpc as any).mission?.create?.useMutation?.() ?? { mutateAsync: async () => null };
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const onLaunch = async () => {
    if (!squad || !brandId) {
      setApplyError("請先選擇品牌");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const res = await createMission.mutateAsync({
        title: squad.taskLabel || squad.name,
        description: squad.description ?? "",
        squadSlug: squad.slug,
        workspace: squad.workspace?.[0] ?? "",
        brandId,
        brandName,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      onLaunched(Number(res.id));
    } catch (e: any) {
      setApplyError(`啟動失敗：${e?.message ?? e}`);
    } finally {
      setApplying(false);
    }
  };

  const lk = squad ? layerKey(squad.strategyLayer) : "L1";
  const lkColor = LAYER_COLOR[lk] ?? "default";

  return (
    <Drawer
      isOpen={!!squad}
      onClose={onClose}
      size="2xl"
      placement="right"
      backdrop="blur"
      hideCloseButton
    >
      <DrawerContent>
        {!squad ? (
          <DrawerBody className="items-center justify-center">
            <Spinner label="載入方案中…" />
          </DrawerBody>
        ) : (
          <>
            <DrawerHeader className="flex flex-col gap-3 px-8 pt-6 pb-5 relative bg-default-50">
              <Button
                isIconOnly size="sm" variant="light" radius="full"
                onPress={onClose} aria-label="關閉"
                className="absolute top-4 right-4"
              >
                <FontAwesomeIcon icon={faXmark} />
              </Button>

              <Breadcrumbs size="sm">
                <BreadcrumbItem href="/">首頁</BreadcrumbItem>
                <BreadcrumbItem onPress={onClose}>成長方案</BreadcrumbItem>
                <BreadcrumbItem>{squad.name}</BreadcrumbItem>
              </Breadcrumbs>

              <div className="flex items-start gap-2 flex-wrap">
                <Chip size="sm" color="default" variant="flat"
                  startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}>
                  {lk} · {LAYER_LABEL[lk] ?? "策略"}
                </Chip>
                {squad.taskLabel && (
                  <TaskChip
                    entity={{ taskLabel: squad.taskLabel, mockup: squad.mockup, workspace: squad.workspace, name: squad.name }}
                    kind="squad" size="sm"
                  />
                )}
              </div>

              <h2 className="font-semibold text-2xl leading-tight tracking-tight">{squad.name}</h2>
              {squad.description && (
                <p className="text-default-600 text-small leading-relaxed">{squad.description}</p>
              )}
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
                <Tab key="overview" title="總覽">
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6 space-y-6">
                      {/* Real showcases — skip baseline (idx 0) if there are >= 2 */}
                      {squad.showcases.length > 0 && (() => {
                        const realCases = squad.showcases.length >= 2
                          ? squad.showcases.slice(1)
                          : squad.showcases;
                        return (
                          <Section title={`成功案例 · ${realCases.length}`}>
                            <div className="space-y-3">
                              {realCases.map((sc, i) => (
                                <Card key={i} shadow="none" className="border border-success-200 bg-success-50">
                                  <CardBody className="gap-3 p-5">
                                    <div className="flex items-start gap-3">
                                      <span className="w-12 h-12 rounded-medium bg-success text-white flex items-center justify-center shrink-0">
                                        <FontAwesomeIcon icon={faTrophy} className="text-large" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-tiny tracking-wider uppercase text-success-700 font-medium">CASE STUDY</p>
                                        <p className="text-medium font-bold leading-snug">{sc.title ?? "成功案例"}</p>
                                      </div>
                                    </div>

                                    {sc.description && (
                                      <p className="text-small text-default-700 leading-relaxed whitespace-pre-line">
                                        {sc.description}
                                      </p>
                                    )}

                                    {sc.result && (
                                      <Snippet
                                        hideSymbol variant="flat" color="success"
                                        className="w-full"
                                        classNames={{ pre: "whitespace-pre-wrap text-small font-medium" }}
                                      >
                                        {sc.result}
                                      </Snippet>
                                    )}
                                  </CardBody>
                                </Card>
                              ))}
                            </div>
                          </Section>
                        );
                      })()}

                      {/* 方法論作者 (secondary context) */}
                      {squad.methodology?.author && (
                        <Section title="方法論起源">
                          <Card shadow="none" className="border border-divider">
                            <CardBody className="gap-2 p-4 flex flex-row items-center">
                              <span className="w-10 h-10 rounded-medium bg-secondary-100 flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faBookOpen} className="text-secondary" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-small font-bold">{squad.methodology.author}</p>
                                {squad.methodology.year && (
                                  <p className="text-tiny text-default-500">{squad.methodology.year}</p>
                                )}
                                {squad.methodology.summary && (
                                  <p className="text-tiny text-default-600 mt-1 line-clamp-2">
                                    {squad.methodology.summary}
                                  </p>
                                )}
                              </div>
                            </CardBody>
                          </Card>
                        </Section>
                      )}

                      <div className="grid grid-cols-3 gap-3">
                        <StatCard label="顧問" count={squad.memberCount} icon={faUsers} />
                        <StatCard label="工作步驟" count={squad.stepCount} icon={faCheck} />
                        <StatCard label="通路" count={squad.workspace.length} icon={faLayerGroup} />
                      </div>
                    </div>
                  </ScrollShadow>
                </Tab>

                <Tab key="agents" title={`顧問 · ${squad.memberCount}`}>
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6 space-y-3">
                      {squad.memberPreview.length === 0 ? (
                        <p className="text-small text-default-500">此方案尚未配置 agent。</p>
                      ) : (
                        squad.memberPreview.map((m, i) => (
                          <Card key={m.id ?? i} shadow="none" className="border border-divider">
                            <CardBody className="p-3">
                              <div className="flex items-center gap-3">
                                <AgentAvatar
                                  seed={m.id ?? m.name ?? `m${i}`}
                                  size={48}
                                  className="rounded-full ring-2 ring-default-200 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-small font-bold truncate">{m.name ?? "—"}</p>
                                  {m.role && <p className="text-tiny text-default-500 truncate">{m.role}</p>}
                                  {m.primarySkill && (
                                    <Chip size="sm" variant="flat" className="mt-1">{m.primarySkill}</Chip>
                                  )}
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        ))
                      )}
                      {squad.memberPreview.length < squad.memberCount && (
                        <p className="text-tiny text-default-500 text-center">
                          + 還有 {squad.memberCount - squad.memberPreview.length} 位 ·
                          完整名單於啟動後查看
                        </p>
                      )}
                    </div>
                  </ScrollShadow>
                </Tab>

                <Tab key="meta" title="標籤">
                  <ScrollShadow className="h-full">
                    <div className="px-8 py-6 space-y-4">
                      {squad.workspace.length > 0 && (
                        <Section title="適用通路">
                          <div className="flex flex-wrap gap-1.5">
                            {squad.workspace.map((w, i) => (
                              <Chip key={i} size="sm" variant="flat">{w}</Chip>
                            ))}
                          </div>
                        </Section>
                      )}
                      {squad.tags.length > 0 && (
                        <Section title="標籤">
                          <div className="flex flex-wrap gap-1.5">
                            {squad.tags.map((t, i) => (
                              <Chip key={i} size="sm" variant="bordered">{t}</Chip>
                            ))}
                          </div>
                        </Section>
                      )}
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
                  color="primary" size="lg" radius="lg"
                  className="w-full font-medium"
                  isLoading={applying}
                  isDisabled={!brandId}
                  onPress={onLaunch}
                  startContent={!applying && <FontAwesomeIcon icon={faRocket} />}
                  endContent={!applying && <FontAwesomeIcon icon={faArrowUpRightFromSquare} />}
                >
                  {applying ? "啟動中…" : `派出方案 · ${squad.memberCount} 位顧問接力`}
                </Button>
              </Tooltip>
              <p className="text-tiny text-default-500 text-center">
                派出後跳到 picker 工作台 · 顧問逐段交付完整成品
              </p>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

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

function StatCard({
  label, count, icon,
}: { label: string; count: number; icon: any }) {
  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-4 gap-1">
        <div className="flex items-center gap-1.5 text-tiny tracking-wider uppercase text-default-500">
          <FontAwesomeIcon icon={icon} />
          <span>{label}</span>
        </div>
        <p className="font-semibold text-2xl tabular-nums leading-none">{count}</p>
      </CardBody>
    </Card>
  );
}
