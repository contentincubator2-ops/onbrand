/**
 * ProjectsPage — Pure HeroUI rewrite.
 *
 * Components used (HeroUI inventory):
 *   Button, ButtonGroup, Input, Card, CardBody, CardHeader, Chip, Avatar,
 *   Tooltip, Divider, Tabs, Tab, Skeleton, Spinner,
 *   Dropdown, DropdownTrigger, DropdownMenu, DropdownSection, DropdownItem.
 *
 * Behavioral parity with the previous Canva-faithful page; styling is now
 * stock HeroUI semantic tokens (no hex pins, no inline gradients).
 */
import React, { useMemo, useState } from "react";
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
  Input, Skeleton, Spinner, Tab, Tabs, Tooltip,
} from "@heroui/react";

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

const SUB_NAV: Array<{ id: SubNavKey; label: string }> = [
  { id: "all",     label: "所有專案" },
  { id: "mine",    label: "你的專案" },
  { id: "shared",  label: "與你分享" },
  { id: "offline", label: "可離線使用" },
];

const SYNC_SOURCES: Array<{ id: SyncSource; label: string; hint: string; glyph: string }> = [
  { id: "facebook",     label: "Facebook 粉絲團", hint: "抓貼文、圖片、影片",   glyph: "f"  },
  { id: "instagram",    label: "Instagram 帳號",  hint: "抓圖文、限動",         glyph: "ig" },
  { id: "youtube",      label: "YouTube 頻道",    hint: "抓影片清單、縮圖",     glyph: "▶"  },
  { id: "website",      label: "官網 / 部落格",   hint: "抓品牌素材、文章",     glyph: "🌐" },
  { id: "google-drive", label: "Google Drive",    hint: "同步整個資料夾",       glyph: "G"  },
  { id: "onedrive",     label: "OneDrive",        hint: "同步整個資料夾",       glyph: "☁"  },
  { id: "dropbox",      label: "Dropbox",         hint: "同步整個資料夾",       glyph: "▽"  },
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

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const labelFor = (opts: Array<{ value: string; label: string }>, v: string) =>
    opts.find((o) => o.value === v)?.label ?? "";

  return (
    <main>
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="relative px-8 pt-14 pb-10 bg-content1 border-b border-divider">
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <Button
            variant="bordered"
            radius="full"
            onPress={() => navigate("/templates")}
            startContent={<span aria-hidden>✦</span>}
          >
            先看看任務範本
          </Button>
          <Button
            color="primary"
            radius="full"
            onPress={() => setCreateSource("recommended")}
            startContent={<span aria-hidden>👑</span>}
          >
            開始建立
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto">
          <Chip variant="flat" size="sm" className="uppercase tracking-wider">PROJECTS</Chip>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">所有專案</h1>

          <div className="mt-6 max-w-[720px]">
            <Input
              size="lg"
              radius="full"
              variant="bordered"
              value={searchQ}
              onValueChange={setSearchQ}
              placeholder="搜尋你的內容"
              isClearable
              onClear={() => setSearchQ("")}
              startContent={
                <svg className="w-5 h-5 text-default-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7.5" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* ─── Filter row ──────────────────────────────────────────── */}
      <section className="border-b border-divider bg-content1 sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 py-3 flex items-center gap-2 flex-wrap">
          <FilterDropdown
            label={typeFilter === "all" ? "類型" : `類型：${labelFor(typeOptions, typeFilter)}`}
            options={typeOptions}
            value={typeFilter}
            onSelect={setTypeFilter}
          />
          <FilterDropdown
            label={categoryFilter === "all" ? "類別" : `類別：${labelFor(categoryOptions, categoryFilter)}`}
            options={categoryOptions}
            value={categoryFilter}
            onSelect={setCategoryFilter}
          />
          <FilterDropdown
            label={ownerFilter === "all" ? "擁有者" : `擁有者：${labelFor(ownerOptions, ownerFilter)}`}
            options={ownerOptions}
            value={ownerFilter}
            onSelect={setOwnerFilter}
          />
          <FilterDropdown
            label={dateFilter === "all" ? "已修改日期" : `修改：${labelFor(dateOptions, dateFilter)}`}
            options={dateOptions}
            value={dateFilter}
            onSelect={setDateFilter}
          />

          <div className="ml-auto flex items-center gap-2">
            <Tooltip content={sortDesc ? "新到舊" : "舊到新"}>
              <Button
                size="sm"
                variant="light"
                radius="full"
                onPress={() => setSortDesc((v) => !v)}
                startContent={
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h13M3 12h9M3 18h5" />
                    <path d={sortDesc ? "M18 15l3 3 3-3M21 6v12" : "M18 9l3-3 3 3M21 18V6"} />
                  </svg>
                }
              >
                {sortDesc ? "新到舊" : "舊到新"}
              </Button>
            </Tooltip>

            <ButtonGroup variant="flat" size="sm" radius="full">
              <Tooltip content="格狀檢視">
                <Button
                  isIconOnly
                  color={viewMode === "grid" ? "primary" : "default"}
                  variant={viewMode === "grid" ? "solid" : "flat"}
                  onPress={() => setViewMode("grid")}
                  aria-label="格狀檢視"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                </Button>
              </Tooltip>
              <Tooltip content="清單檢視">
                <Button
                  isIconOnly
                  color={viewMode === "list" ? "primary" : "default"}
                  variant={viewMode === "list" ? "solid" : "flat"}
                  onPress={() => setViewMode("list")}
                  aria-label="清單檢視"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M3 12h18M3 18h18"/>
                  </svg>
                </Button>
              </Tooltip>
            </ButtonGroup>

            <CreateMenu
              onNewMission={() => navigate("/templates")}
              onSyncSource={(s) => setSyncSource(s as SyncSource)}
            />
          </div>
        </div>
      </section>

      {/* ─── Body ─────────────────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 py-8 flex gap-8">
        {/* Left rail — vertical Tabs */}
        <aside className="w-[220px] shrink-0">
          <Tabs
            aria-label="專案分類"
            isVertical
            variant="light"
            color="primary"
            selectedKey={subNav}
            onSelectionChange={(k) => setSubNav(k as SubNavKey)}
            classNames={{ tabList: "gap-1 w-full", tab: "justify-start h-10" }}
          >
            {SUB_NAV.map((n) => <Tab key={n.id} title={n.label} />)}
          </Tabs>

          <Card shadow="sm" className="mt-6">
            <CardBody className="gap-2">
              <span className="text-2xl">⭐</span>
              <p className="text-tiny text-default-500 leading-snug">
                點擊任一專案的星號圖示，即可從這裡輕鬆找到。
              </p>
            </CardBody>
          </Card>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {isLoading && (
            <div className="flex items-center gap-3 text-small text-default-500">
              <Spinner size="sm" /> 載入專案中…
            </div>
          )}

          {!isLoading && all.length === 0 && (
            <Card shadow="none" className="border-2 border-dashed border-divider">
              <CardBody className="py-16 items-center text-center gap-3">
                <span className="text-4xl">📁</span>
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

          {/* 最近的項目 */}
          {!isLoading && recent.length > 0 && (
            <div className="mb-10">
              <SectionHeader title="最近的項目" subtitle={`${recent.length} 個`} />
              <div className="-mx-1 overflow-x-auto">
                <div className="flex gap-3 px-1 pb-2">
                  {recent.map((m) => (
                    <div key={m.id} className="w-[200px] shrink-0">
                      <MissionThumb mission={m} onClick={() => goToMission(m)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 資料夾 */}
          <div className="mb-10">
            <SectionHeader title="資料夾" subtitle="2 個" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <FolderTile glyph="☁" label="上傳" hint="尚未有資料" />
              <FolderTile glyph="⭐" label="已加星號" hint="尚未有資料" />
            </div>
          </div>

          {/* 設計 */}
          {!isLoading && all.length > 0 && (
            <div>
              <SectionHeader title="設計" subtitle={`${all.length} 個`} />
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {all.map((m) => (
                    <MissionThumb key={m.id} mission={m} onClick={() => goToMission(m)} />
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mt-6">
              {Array.from({ length: 12 }).map((_, i) => (
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
        </div>
      </section>

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

/* ─────────────────────────── Folder tile ─────────────────────────── */

function FolderTile({ glyph, label, hint }: { glyph: string; label: string; hint: string }) {
  return (
    <Card isPressable isHoverable shadow="sm" className="overflow-hidden">
      <div
        className="relative w-full flex items-center justify-center bg-default-100"
        style={{ aspectRatio: "5 / 3" }}
      >
        <span className="text-4xl text-default-500">{glyph}</span>
      </div>
      <CardBody className="p-3 gap-0.5">
        <p className="text-small font-medium leading-snug">{label}</p>
        <p className="text-tiny text-default-400">{hint}</p>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
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
        shadow="sm"
        className="overflow-hidden w-full"
      >
        <div className="relative w-full overflow-hidden bg-default-100" style={{ aspectRatio: "5 / 4" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={70} />
          </div>
          {isLayerKnown && (
            <Chip size="sm" color={tone.heroColor} variant="solid" className="absolute top-2 left-2">
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

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <Tooltip content="收藏">
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="收藏" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip content="更多">
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="更多" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
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
          <Chip size="sm" color={tone.heroColor} variant="flat">{lk}</Chip>
          {ws && <span className="capitalize">{ws}</span>}
          <span>·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
    </Card>
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
  const chevron = (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
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
        <Button isIconOnly color="primary" radius="full" aria-label="新增項目">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
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
          <DropdownItem
            key="new-folder"
            description="把任務分類（如客戶、季度）"
            isDisabled
          >
            新增資料夾（即將推出）
          </DropdownItem>
          <DropdownItem
            key="new-mission"
            description="從任務範本型錄建立任務"
          >
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
              startContent={
                <Avatar
                  name={s.glyph}
                  size="sm"
                  className="w-6 h-6 text-tiny"
                  classNames={{ name: "text-tiny font-bold" }}
                />
              }
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
