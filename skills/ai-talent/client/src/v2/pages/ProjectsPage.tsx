/**
 * ProjectsPage — Canva /projects clone (full-bleed, 3-column).
 *
 * Layout (no max-w container — extends edge to edge):
 *   ┌──────────────────┬──────────────────────────────┬─────────────────────────┐
 *   │ Left rail 240px  │  Middle column (flex-1)      │ Right floating panel    │
 *   │ - sub-nav        │  - search + filter chips     │ 360px, sticky, elevated │
 *   │ - 已加星號標籤   │  - 最近的項目 (横向scroll)   │ - active preview /      │
 *   │ - 資料夾         │  - 資料夾                    │   featured project /    │
 *   │ - brand stripe   │  - 設計 grid                 │   quick actions card    │
 *   └──────────────────┴──────────────────────────────┴─────────────────────────┘
 *
 * Pure HeroUI tokens, no hex pins.
 */
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
import ProjectSyncModal, { type SyncSource } from "../components/projects/ProjectSyncModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, ButtonGroup, Card, CardBody, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownSection, DropdownItem,
  Input, Skeleton, Spinner, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faPlus, faArrowDownWideShort,
  faArrowUpWideShort, faTableCells, faList, faStar, faEllipsis, faBookmark,
  faFolder, faCloudArrowUp, faGlobe, faCrown, faWandMagicSparkles, faFolderOpen,
  faRocket, faClockRotateLeft, faShareNodes, faCloudArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faYoutube, faGoogleDrive, faMicrosoft, faDropbox,
} from "@fortawesome/free-brands-svg-icons";

interface MissionRow {
  id: number;
  title: string;
  description?: string | null;
  workspace?: string | null;
  squadSlug?: string | null;
  squadName?: string | null;
  squadLayer?: string | null;
  brandId?: number | null;
  brandName?: string | null;
  status?: string | null;
  updatedAt?: string;
}

type SubNavKey = "all" | "mine" | "shared" | "offline";

const SUB_NAV: Array<{ id: SubNavKey; label: string; icon: any }> = [
  { id: "all",     label: "所有專案",   icon: faFolderOpen        },
  { id: "mine",    label: "你的專案",   icon: faRocket            },
  { id: "shared",  label: "與你分享",   icon: faShareNodes        },
  { id: "offline", label: "可離線使用", icon: faCloudArrowDown    },
];

const SYNC_SOURCES: Array<{ id: SyncSource; label: string; hint: string; icon: any }> = [
  { id: "facebook",     label: "Facebook 粉絲團", hint: "抓貼文、圖片、影片",   icon: faFacebook    },
  { id: "instagram",    label: "Instagram 帳號",  hint: "抓圖文、限動",         icon: faInstagram   },
  { id: "youtube",      label: "YouTube 頻道",    hint: "抓影片清單、縮圖",     icon: faYoutube     },
  { id: "website",      label: "官網 / 部落格",   hint: "抓品牌素材、文章",     icon: faGlobe       },
  { id: "google-drive", label: "Google Drive",    hint: "同步整個資料夾",       icon: faGoogleDrive },
  { id: "onedrive",     label: "OneDrive",        hint: "同步整個資料夾",       icon: faMicrosoft   },
  { id: "dropbox",      label: "Dropbox",         hint: "同步整個資料夾",       icon: faDropbox     },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : null;
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

  const [searchQ, setSearchQ] = useState("");
  const [subNav, setSubNav] = useState<SubNavKey>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [createSource, setCreateSource] = useState<SourceId | null>(null);
  const [syncSource, setSyncSource] = useState<SyncSource | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { if (m.workspace) set.add(m.workspace.toLowerCase()); });
    return [
      { value: "all", label: "全部類型" },
      ...Array.from(set).sort().map((v) => ({ value: v, label: v })),
    ];
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => {
      const lk = (m.squadLayer ?? "").toString().slice(0, 2);
      if (lk) set.add(lk);
    });
    return [
      { value: "all", label: "全部類別" },
      ...Array.from(set).sort().map((v) => ({ value: v, label: `${v} 策略層` })),
    ];
  }, [rows]);

  const ownerOptions = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((m) => {
      if (m.brandName && m.brandId != null) set.set(String(m.brandId), m.brandName);
    });
    return [
      { value: "all", label: "全部擁有者" },
      ...Array.from(set.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const dateOptions = [
    { value: "all",    label: "全部時間" },
    { value: "today",  label: "今天" },
    { value: "week",   label: "本週" },
    { value: "month",  label: "本月" },
    { value: "year",   label: "今年" },
  ];

  const filtered = useMemo(() => {
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
    if (typeFilter !== "all") r = r.filter((m) => (m.workspace ?? "").toLowerCase() === typeFilter);
    if (categoryFilter !== "all") r = r.filter((m) => (m.squadLayer ?? "").toString().slice(0, 2) === categoryFilter);
    if (ownerFilter !== "all") r = r.filter((m) => String(m.brandId) === ownerFilter);
    if (dateFilter !== "all") {
      const cutoff: Record<string, number> = { today: 86_400_000, week: 86_400_000 * 7, month: 86_400_000 * 30, year: 86_400_000 * 365 };
      const ms = cutoff[dateFilter];
      if (ms) {
        const now = Date.now();
        r = r.filter((m) => m.updatedAt && (now - new Date(m.updatedAt).getTime() <= ms));
      }
    }
    return [...r].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortDesc ? tb - ta : ta - tb;
    });
  }, [rows, searchQ, typeFilter, categoryFilter, ownerFilter, dateFilter, sortDesc, subNav]);

  const recent = useMemo(() => filtered.slice(0, 12), [filtered]);
  const all = filtered;
  const active = useMemo(() => all.find((m) => m.id === activeId) ?? all[0] ?? null, [all, activeId]);

  useEffect(() => {
    if (!activeId && all[0]) setActiveId(all[0].id);
  }, [all, activeId]);

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const labelFor = (opts: Array<{ value: string; label: string }>, v: string) =>
    opts.find((o) => o.value === v)?.label ?? "";

  return (
    <main className="flex flex-col h-full min-h-screen bg-content1">
      {/* ─── Top header strip ─────────────────────────────────────── */}
      <header className="px-6 pt-5 pb-3 border-b border-divider">
        <div className="flex items-center gap-3">
          <Chip variant="flat" size="sm" className="uppercase tracking-wider">PROJECTS</Chip>
          <h1 className="text-3xl font-semibold tracking-tight">所有專案</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="bordered"
              radius="full"
              size="sm"
              onPress={() => navigate("/templates")}
              startContent={<FontAwesomeIcon icon={faWandMagicSparkles} />}
            >
              先看看任務範本
            </Button>
            <Button
              color="primary"
              radius="full"
              size="sm"
              onPress={() => setCreateSource("recommended")}
              startContent={<FontAwesomeIcon icon={faCrown} />}
            >
              開始建立
            </Button>
            <CreateMenu
              onNewMission={() => navigate("/templates")}
              onSyncSource={(s) => setSyncSource(s as SyncSource)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="w-full max-w-[420px]">
            <Input
              size="sm"
              radius="full"
              variant="bordered"
              value={searchQ}
              onValueChange={setSearchQ}
              placeholder="搜尋你的內容"
              isClearable
              onClear={() => setSearchQ("")}
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
            />
          </div>
          <FilterDropdown
            label={typeFilter === "all" ? "類型" : `類型：${labelFor(typeOptions, typeFilter)}`}
            options={typeOptions} value={typeFilter} onSelect={setTypeFilter}
          />
          <FilterDropdown
            label={categoryFilter === "all" ? "類別" : `類別：${labelFor(categoryOptions, categoryFilter)}`}
            options={categoryOptions} value={categoryFilter} onSelect={setCategoryFilter}
          />
          <FilterDropdown
            label={ownerFilter === "all" ? "擁有者" : `擁有者：${labelFor(ownerOptions, ownerFilter)}`}
            options={ownerOptions} value={ownerFilter} onSelect={setOwnerFilter}
          />
          <FilterDropdown
            label={dateFilter === "all" ? "已修改日期" : `修改：${labelFor(dateOptions, dateFilter)}`}
            options={dateOptions} value={dateFilter} onSelect={setDateFilter}
          />

          <div className="ml-auto flex items-center gap-2">
            <Tooltip content={sortDesc ? "新到舊" : "舊到新"}>
              <Button
                size="sm" variant="light" radius="full"
                onPress={() => setSortDesc((v) => !v)}
                startContent={<FontAwesomeIcon icon={sortDesc ? faArrowDownWideShort : faArrowUpWideShort} />}
              >
                {sortDesc ? "新到舊" : "舊到新"}
              </Button>
            </Tooltip>
            <ButtonGroup variant="flat" size="sm" radius="full">
              <Tooltip content="格狀檢視">
                <Button isIconOnly
                  color={viewMode === "grid" ? "primary" : "default"}
                  variant={viewMode === "grid" ? "solid" : "flat"}
                  onPress={() => setViewMode("grid")} aria-label="格狀檢視"
                ><FontAwesomeIcon icon={faTableCells} /></Button>
              </Tooltip>
              <Tooltip content="清單檢視">
                <Button isIconOnly
                  color={viewMode === "list" ? "primary" : "default"}
                  variant={viewMode === "list" ? "solid" : "flat"}
                  onPress={() => setViewMode("list")} aria-label="清單檢視"
                ><FontAwesomeIcon icon={faList} /></Button>
              </Tooltip>
            </ButtonGroup>
          </div>
        </div>
      </header>

      {/* ─── 3-column body ────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT RAIL */}
        <aside className="w-[240px] shrink-0 border-r border-divider px-4 py-6 overflow-y-auto">
          <nav className="flex flex-col gap-1">
            {SUB_NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSubNav(n.id)}
                className={[
                  "flex items-center gap-3 px-3 h-10 rounded-medium text-small transition text-left",
                  subNav === n.id
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-default-700 hover:bg-default-100",
                ].join(" ")}
              >
                <FontAwesomeIcon icon={n.icon} className="w-4" />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>

          <Divider className="my-4" />

          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-tiny font-medium uppercase tracking-wider text-default-500">已加星號標籤</span>
            <Button isIconOnly size="sm" variant="light" aria-label="新增標籤">
              <FontAwesomeIcon icon={faPlus} className="text-tiny" />
            </Button>
          </div>
          <p className="px-3 text-tiny text-default-400 leading-snug">
            點擊任一專案的星號圖示，即可從這裡輕鬆找到。
          </p>

          <Divider className="my-4" />

          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-tiny font-medium uppercase tracking-wider text-default-500">資料夾</span>
            <Button isIconOnly size="sm" variant="light" aria-label="新增資料夾">
              <FontAwesomeIcon icon={faPlus} className="text-tiny" />
            </Button>
          </div>
          <div className="flex flex-col gap-0.5">
            <RailFolderRow icon={faCloudArrowUp} label="上傳" />
            <RailFolderRow icon={faStar} label="已加星號" />
          </div>

          <Divider className="my-4" />

          <div className="px-3 mb-2">
            <span className="text-tiny font-medium uppercase tracking-wider text-default-500">品牌</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {brands.slice(0, 6).map((b: any) => (
              <button
                key={b.id}
                onClick={() => setOwnerFilter(String(b.id))}
                className={[
                  "flex items-center gap-2 px-3 h-9 rounded-medium text-small transition text-left",
                  ownerFilter === String(b.id) ? "bg-default-100 font-medium" : "text-default-700 hover:bg-default-100",
                ].join(" ")}
              >
                <Avatar size="sm" name={b.name} className="w-5 h-5 text-tiny" />
                <span className="truncate">{b.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* MIDDLE COLUMN */}
        <section className="flex-1 min-w-0 overflow-y-auto px-8 py-6">
          {isLoading && (
            <div className="flex items-center gap-3 text-small text-default-500">
              <Spinner size="sm" /> 載入專案中…
            </div>
          )}

          {!isLoading && all.length === 0 && (
            <Card shadow="none" className="border-2 border-dashed border-divider">
              <CardBody className="py-16 items-center text-center gap-3">
                <FontAwesomeIcon icon={faFolderOpen} className="text-4xl text-default-300" />
                <p className="text-medium font-medium">還沒有專案</p>
                <p className="text-small text-default-500">
                  從首頁選個任務範本，或從網路萃取一個全新的任務範本開始。
                </p>
                <Button color="primary" radius="full" className="mt-2" onPress={() => setCreateSource("recommended")}>
                  建立第一個專案
                </Button>
              </CardBody>
            </Card>
          )}

          {!isLoading && recent.length > 0 && (
            <div className="mb-10">
              <SectionHeader title="最近的項目" subtitle={`${recent.length} 個`} />
              <div className="-mx-1 overflow-x-auto">
                <div className="flex gap-3 px-1 pb-2">
                  {recent.map((m) => (
                    <div key={m.id} className="w-[200px] shrink-0">
                      <MissionThumb
                        mission={m}
                        active={m.id === active?.id}
                        onClick={() => setActiveId(m.id)}
                        onOpen={() => goToMission(m)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mb-10">
            <SectionHeader title="資料夾" subtitle="2 個" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <FolderTile icon={faCloudArrowUp} label="上傳" hint="尚未有資料" />
              <FolderTile icon={faStar} label="已加星號" hint="尚未有資料" />
            </div>
          </div>

          {!isLoading && all.length > 0 && (
            <div>
              <SectionHeader title="設計" subtitle={`${all.length} 個`} />
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {all.map((m) => (
                    <MissionThumb
                      key={m.id}
                      mission={m}
                      active={m.id === active?.id}
                      onClick={() => setActiveId(m.id)}
                      onOpen={() => goToMission(m)}
                    />
                  ))}
                </div>
              ) : (
                <Card shadow="none" className="border border-divider overflow-hidden">
                  <div className="flex flex-col divide-y divide-divider">
                    {all.map((m) => (
                      <MissionListRow key={m.id} mission={m} onClick={() => goToMission(m)} />
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <Card key={i} shadow="none" className="overflow-hidden">
                  <Skeleton className="w-full" style={{ aspectRatio: "5 / 4" }} />
                  <CardBody className="p-3 gap-1.5">
                    <Skeleton className="h-3 w-4/5 rounded" />
                    <Skeleton className="h-2 w-2/5 rounded" />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* RIGHT FLOATING PANEL */}
        <aside className="hidden xl:block w-[360px] shrink-0 px-5 py-6 overflow-y-auto">
          <div className="sticky top-4 flex flex-col gap-4">
            {active ? (
              <PreviewCard mission={active} onOpen={() => goToMission(active)} />
            ) : (
              <EmptyPreviewCard onCreate={() => setCreateSource("recommended")} />
            )}
            <QuickActionsCard
              onNewMission={() => navigate("/templates")}
              onSync={(s) => setSyncSource(s)}
            />
          </div>
        </aside>
      </div>

      <ProjectSyncModal
        open={syncSource !== null}
        source={syncSource}
        brandId={brandId}
        onClose={() => setSyncSource(null)}
      />

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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-large font-semibold tracking-tight">{title}</h2>
        {subtitle && <span className="text-tiny text-default-400">{subtitle}</span>}
      </div>
      <Button size="sm" variant="light">查看全部 →</Button>
    </div>
  );
}

/* ─────────────────────────── Rail folder row ────────────────────────── */

function RailFolderRow({ icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex items-center gap-2 px-3 h-9 rounded-medium text-small text-default-700 hover:bg-default-100 transition text-left">
      <FontAwesomeIcon icon={icon} className="w-4 text-default-500" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ─────────────────────────── Folder tile ────────────────────────────── */

function FolderTile({ icon, label, hint }: { icon: any; label: string; hint: string }) {
  return (
    <Card isPressable isHoverable shadow="sm" className="overflow-hidden">
      <div
        className="relative w-full flex items-center justify-center bg-default-100"
        style={{ aspectRatio: "5 / 3" }}
      >
        <FontAwesomeIcon icon={icon} className="text-4xl text-default-500" />
      </div>
      <CardBody className="p-3 gap-0.5">
        <p className="text-small font-medium leading-snug">{label}</p>
        <p className="text-tiny text-default-400">{hint}</p>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Mission thumb ──────────────────────────── */

function MissionThumb({
  mission, active, onClick, onOpen,
}: {
  mission: MissionRow;
  active?: boolean;
  onClick: () => void;
  onOpen: () => void;
}) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const isLayerKnown = layerStr in LAYER_TOKENS;
  const lk = (isLayerKnown ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);

  return (
    <div className="group relative">
      <Card
        isPressable
        isHoverable
        onPress={onClick}
        onDoubleClick={onOpen}
        shadow="sm"
        className={[
          "overflow-hidden w-full transition",
          active ? "ring-2 ring-primary ring-offset-2 ring-offset-content1" : "",
        ].join(" ")}
      >
        <div className="relative w-full overflow-hidden bg-default-100" style={{ aspectRatio: "5 / 4" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={70} />
          </div>
          {isLayerKnown && (
            <Chip size="sm" variant="flat" className="absolute top-2 left-2 bg-content1/95 backdrop-blur-sm">
              {lk}
            </Chip>
          )}
        </div>
        <CardBody className="p-3 gap-1">
          <p className="text-small font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {mission.title}
          </p>
          <p className="text-tiny text-default-500 truncate">{updatedTxt}</p>
        </CardBody>
      </Card>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Tooltip content="收藏">
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="收藏" onClick={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faBookmark} />
          </Button>
        </Tooltip>
        <Tooltip content="更多">
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="更多" onClick={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faEllipsis} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function MissionListRow({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const ws = (mission.workspace ?? "").toLowerCase();
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
          <Chip size="sm" variant="flat">{lk}</Chip>
          {ws && <span className="capitalize">{ws}</span>}
          <span>·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────── Right preview card ─────────────────────── */

function PreviewCard({ mission, onOpen }: { mission: MissionRow; onOpen: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const isLayerKnown = layerStr in LAYER_TOKENS;
  const lk = (isLayerKnown ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];

  return (
    <Card shadow="none" className="overflow-hidden border border-divider">
      <CardHeader className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="flat">{lk}</Chip>
          <Chip size="sm" variant="flat">預覽</Chip>
        </div>
        <Button isIconOnly size="sm" variant="light" aria-label="更多">
          <FontAwesomeIcon icon={faEllipsis} />
        </Button>
      </CardHeader>
      <div className="relative w-full bg-default-100" style={{ aspectRatio: "16 / 11" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={120} />
        </div>
      </div>
      <CardBody className="px-4 py-4 gap-2">
        <p className="text-medium font-semibold leading-snug">{mission.title}</p>
        {mission.description && (
          <p className="text-small text-default-500 line-clamp-3">{mission.description}</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-tiny text-default-500">
          <FontAwesomeIcon icon={faClockRotateLeft} />
          <span>{formatRelative(mission.updatedAt)}</span>
          {mission.brandName && (<><span>·</span><span className="truncate">{mission.brandName}</span></>)}
        </div>
        <div className="mt-3 flex gap-2">
          <Button color="primary" radius="full" className="flex-1" onPress={onOpen}>
            開啟任務
          </Button>
          <Tooltip content="收藏">
            <Button isIconOnly variant="flat" radius="full" aria-label="收藏">
              <FontAwesomeIcon icon={faBookmark} />
            </Button>
          </Tooltip>
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyPreviewCard({ onCreate }: { onCreate: () => void }) {
  return (
    <Card shadow="lg" className="overflow-hidden border border-divider">
      <CardBody className="py-10 px-5 items-center text-center gap-3">
        <FontAwesomeIcon icon={faRocket} className="text-3xl text-primary" />
        <p className="text-medium font-semibold">挑一個任務開始</p>
        <p className="text-tiny text-default-500">點擊左側專案以在此預覽，或建立新任務。</p>
        <Button color="primary" radius="full" className="mt-1" onPress={onCreate}>
          建立任務
        </Button>
      </CardBody>
    </Card>
  );
}

function QuickActionsCard({
  onNewMission, onSync,
}: {
  onNewMission: () => void;
  onSync: (s: SyncSource) => void;
}) {
  return (
    <Card shadow="sm" className="border border-divider">
      <CardHeader className="px-4 pt-4 pb-1 text-tiny font-medium uppercase tracking-wider text-default-500">
        快速動作
      </CardHeader>
      <CardBody className="px-3 pt-1 pb-3 gap-1">
        <ActionRow icon={faWandMagicSparkles} label="從任務範本建立" onPress={onNewMission} />
        <Divider className="my-1" />
        {SYNC_SOURCES.slice(0, 4).map((s) => (
          <ActionRow key={s.id} icon={s.icon} label={s.label} hint={s.hint} onPress={() => onSync(s.id)} />
        ))}
      </CardBody>
    </Card>
  );
}

function ActionRow({
  icon, label, hint, onPress,
}: { icon: any; label: string; hint?: string; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="flex items-center gap-3 px-2 h-11 rounded-medium hover:bg-default-100 transition text-left"
    >
      <span className="w-8 h-8 rounded-medium bg-default-100 flex items-center justify-center shrink-0">
        <FontAwesomeIcon icon={icon} className="text-default-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium truncate">{label}</p>
        {hint && <p className="text-tiny text-default-400 truncate">{hint}</p>}
      </div>
    </button>
  );
}

/* ─────────────────────────── Filter dropdown ───────────────────────── */

function FilterDropdown({
  label, options, value, onSelect,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (v: string) => void;
}) {
  const chevron = <FontAwesomeIcon icon={faChevronDown} className="text-tiny" />;
  return (
    <Dropdown placement="bottom-start">
      <DropdownTrigger>
        <Button size="sm" radius="full" variant="bordered" endContent={chevron}>
          {label}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={label}
        selectionMode="single"
        selectedKeys={new Set([value])}
        onAction={(k) => onSelect(String(k))}
      >
        {options.map((o) => (
          <DropdownItem key={o.value}>{o.label}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

/* ─────────────────────────── Create menu ───────────────────────────── */

function CreateMenu({
  onNewMission, onSyncSource,
}: {
  onNewMission: () => void;
  onSyncSource: (s: SyncSource) => void;
}) {
  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly variant="flat" radius="full" aria-label="新增項目">
          <FontAwesomeIcon icon={faPlus} />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="新增項目"
        onAction={(key) => {
          const k = String(key);
          if (k === "new-mission") onNewMission();
          else if (k.startsWith("sync:")) onSyncSource(k.replace("sync:", "") as SyncSource);
        }}
      >
        <DropdownSection title="新增項目">
          <DropdownItem key="new-folder" description="把任務分類（如客戶、季度）" isDisabled>
            新增資料夾（即將推出）
          </DropdownItem>
          <DropdownItem key="new-mission" description="從任務範本型錄建立任務">
            新任務
          </DropdownItem>
        </DropdownSection>

        <DropdownSection title="上傳">
          <DropdownItem key="upload-file" description="品牌素材、參考檔、簡報、圖片" isDisabled>
            上傳檔案（即將推出）
          </DropdownItem>
          <DropdownItem key="upload-folder" description="批次上傳整個資料夾" isDisabled>
            上傳資料夾（即將推出）
          </DropdownItem>
        </DropdownSection>

        <DropdownSection title="從雲端 / 網路同步">
          {SYNC_SOURCES.map((s) => (
            <DropdownItem
              key={`sync:${s.id}`}
              description={s.hint}
              startContent={<FontAwesomeIcon icon={s.icon} className="text-medium w-5" />}
            >
              {s.label}
            </DropdownItem>
          ))}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}

/* ─────────────────────────── Helpers ────────────────────────────────── */

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
