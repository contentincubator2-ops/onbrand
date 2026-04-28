/**
 * BrandsPage — Canva Brand Kit clone v2 (full-bleed layout).
 *
 * Layout matches Canva exactly:
 *   - Top: thin pastel header strip with 品牌工具組 chip + brand name
 *   - Left rail (260px, fixed width, no max-w): sub-nav links + brand
 *     switcher dropdown
 *   - Right: full-bleed grid of large pastel asset tiles (4 cols on
 *     desktop, each ~4:3 aspect)
 *
 * Each tile is a HeroUI Card isPressable with a unique pastel-100 bg,
 * a giant FA icon as the visual centerpiece, and a label below.
 *
 * No max-width container anywhere — extends to viewport edges.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Skeleton,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown, faPlus, faCloudArrowUp, faShapes,
  faPalette, faFont, faQuoteLeft, faBullseye, faUsers,
  faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved,
  faFolderOpen, faUserPlus, faCrown,
  faBookOpen, faTableList, faRobot, faTrademark, faBox, faCalendarDay,
} from "@fortawesome/free-solid-svg-icons";

type SectionId =
  | "all" | "guidelines" | "templates"
  | "logo" | "colors" | "fonts" | "voice"
  | "positioning" | "audience" | "competitor"
  | "photos" | "images" | "icons" | "charts"
  // shared across scopes
  | "doc" | "card" | "prompts";

interface SubNavItem { id: SectionId; label: string; badge?: string; }

// Scope-aware sub-nav: same scaffold, different items per scope.
// Per CJ direction 2026-04-28: brand assets stay where they are; product
// and event get a slimmer 3-section view (定位書 / 速查卡 / AI 指令庫).
const SUBNAV_BRAND: SubNavItem[] = [
  { id: "all",         label: "所有資產" },
  { id: "doc",         label: "完整定位書" },
  { id: "card",        label: "速查卡" },
  { id: "prompts",     label: "AI 指令庫" },
  { id: "guidelines",  label: "準則" },
  { id: "templates",   label: "品牌範本", badge: "最新" },
  { id: "logo",        label: "標誌" },
  { id: "colors",      label: "顏色" },
  { id: "fonts",       label: "字型" },
  { id: "voice",       label: "品牌口吻" },
  { id: "positioning", label: "品牌定位" },
  { id: "audience",    label: "目標受眾" },
  { id: "competitor",  label: "競品洞察" },
  { id: "photos",      label: "照片" },
  { id: "images",      label: "圖像" },
  { id: "icons",       label: "圖示" },
  { id: "charts",      label: "圖表" },
];
const SUBNAV_PRODUCT: SubNavItem[] = [
  { id: "doc",      label: "完整定位書" },
  { id: "card",     label: "速查卡" },
  { id: "prompts",  label: "AI 指令庫" },
];
const SUBNAV_EVENT: SubNavItem[] = [
  { id: "doc",      label: "完整定位書" },
  { id: "card",     label: "速查卡" },
  { id: "prompts",  label: "AI 指令庫" },
];

// Tile colors (HeroUI semantic-100 backgrounds + matching tone)
type Tone = "primary" | "secondary" | "success" | "warning" | "danger" | "default";
interface Tile {
  id: SectionId;
  label: string;
  icon: any;
  tone: Tone;
  count?: number;
  ready: boolean;
}

export default function BrandsPage() {
  const { brandId, setBrandId, brands, scope } = useOutletContext<ShellOutletCtx>();

  // Resolve scope mode — choose-one rule from ScopeBar.
  const scopeMode: "brand" | "product" | "event" | "none" =
    scope?.eventId ? "event"
    : scope?.productId ? "product"
    : scope?.brandId ? "brand"
    : (brandId ? "brand" : "none"); // legacy fallback

  // Pull product/event details when those scopes are active
  const productQuery = (trpc as any).product?.get?.useQuery
    ? (trpc as any).product.get.useQuery(
        { id: scope?.productId ?? 0 },
        { enabled: scopeMode === "product" && !!scope?.productId, refetchOnWindowFocus: false }
      )
    : { data: null };
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery(
        { id: scope?.eventId ?? 0 },
        { enabled: scopeMode === "event" && !!scope?.eventId, refetchOnWindowFocus: false }
      )
    : { data: null };

  const SUBNAV: SubNavItem[] =
    scopeMode === "product" ? SUBNAV_PRODUCT
    : scopeMode === "event" ? SUBNAV_EVENT
    : SUBNAV_BRAND;
  const defaultSection: SectionId = scopeMode === "brand" ? "all" : "doc";
  const [section, setSection] = useState<SectionId>(defaultSection);
  // Reset section when scope mode changes (avoid stale "logo" while on product)
  React.useEffect(() => {
    setSection(scopeMode === "brand" ? "all" : "doc");
  }, [scopeMode]);

  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === (scope?.brandId ?? brandId)) ?? brands[0] ?? null,
    [brands, scope?.brandId, brandId]
  );
  const scopeName =
    scopeMode === "product" ? ((productQuery.data as any)?.name ?? "（請於右上選擇產品）")
    : scopeMode === "event" ? ((eventQuery.data as any)?.name ?? "（請於右上選擇活動）")
    : (currentBrand?.name ?? "（請於右上選擇品牌）");
  const scopeIcon =
    scopeMode === "product" ? faBox
    : scopeMode === "event" ? faCalendarDay
    : faTrademark;
  const scopeEyebrow =
    scopeMode === "product" ? "PRODUCT"
    : scopeMode === "event" ? "EVENT"
    : "BRAND";
  const brandName = currentBrand?.name ?? "我的品牌";
  const brandInitial = brandName.charAt(0).toUpperCase();

  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const brainEntries: Record<string, any[]> =
    ((brainQuery.data as any)?.entries as Record<string, any[]>) ?? {};
  const cnt = (cat: string) => brainEntries[cat]?.length ?? 0;

  const TILES: Tile[] = [
    { id: "templates",   label: "品牌範本", icon: faFolderOpen,    tone: "warning",   ready: false },
    { id: "logo",        label: "標誌",     icon: faPenNib,        tone: "secondary", ready: false },
    { id: "colors",      label: "顏色",     icon: faPalette,       tone: "danger",    ready: false },
    { id: "fonts",       label: "字型",     icon: faFont,          tone: "success",   ready: false },
    { id: "voice",       label: "品牌口吻", icon: faQuoteLeft,     tone: "secondary", ready: true, count: cnt("voice") },
    { id: "photos",      label: "照片",     icon: faImages,        tone: "success",   ready: false },
    { id: "images",      label: "圖像",     icon: faImage,         tone: "warning",   ready: false },
    { id: "icons",       label: "圖示",     icon: faIcons,         tone: "secondary", ready: false },
    { id: "charts",      label: "圖表",     icon: faChartPie,      tone: "danger",    ready: false },
    { id: "positioning", label: "品牌定位", icon: faBullseye,      tone: "primary",   ready: true, count: cnt("positioning") },
    { id: "audience",    label: "目標受眾", icon: faUsers,         tone: "warning",   ready: true, count: cnt("audience") },
    { id: "competitor",  label: "競品洞察", icon: faShieldHalved,  tone: "danger",    ready: true, count: cnt("competitors") },
  ];

  const visibleTiles =
    section === "all" ? TILES : TILES.filter((t) => t.id === section);

  const onTileClick = (t: Tile) => setSection(t.id);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* ─── Top header — scope-aware (brand / product / event) ─────── */}
      <header className="px-8 py-10 border-b border-divider bg-content1">
        <Chip
          color="default"
          variant="flat"
          size="sm"
          className="uppercase tracking-wider mb-2"
          startContent={<FontAwesomeIcon icon={scopeIcon} className="ml-1" />}
        >
          {scopeEyebrow}
        </Chip>
        <h1 className="text-3xl font-semibold tracking-tight">{scopeName}</h1>
        <p className="text-small text-default-500 mt-1">
          請於右上 ScopeBar 切換 品牌 / 產品 / 活動
        </p>
      </header>

      {/* ─── Body: full-bleed left rail + grid ─────────────────── */}
      <div className="flex-1 flex">
        {/* Left rail — full-bleed, fixed 240px, NO max-w-anything */}
        <aside className="w-[240px] shrink-0 border-r border-divider bg-content1 flex flex-col">
          {/* Top: 你的方案 + 邀請使用者 */}
          <div className="p-4 space-y-2 border-b border-divider">
            <Button
              fullWidth
              radius="lg"
              variant="bordered"
              startContent={<FontAwesomeIcon icon={faCrown} />}
              className="justify-start"
            >
              你的方案
            </Button>
            <Button
              fullWidth
              radius="lg"
              variant="bordered"
              startContent={<FontAwesomeIcon icon={faUserPlus} />}
              className="justify-start"
            >
              邀請使用者
            </Button>
          </div>

          {/* 所有品牌範本 link */}
          <Button
            fullWidth
            variant="light"
            radius="none"
            className="justify-start px-4 h-11"
          >
            所有品牌範本
          </Button>

          {/* Scope read-only chip (single source of truth = ScopeBar) */}
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 px-3 h-12 rounded-lg border border-divider bg-default-50">
              <Avatar
                name={(scopeName.charAt(0) || "?").toUpperCase()}
                size="sm"
                radius="md"
                classNames={{ base: "shrink-0 bg-default-100 text-default-600", name: "text-tiny font-bold" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-tiny text-default-400 uppercase tracking-wider">{scopeEyebrow}</p>
                <p className="text-small font-medium truncate">{scopeName}</p>
              </div>
            </div>
          </div>

          {/* Sub-nav */}
          <nav className="px-3 py-2 flex flex-col gap-0.5 flex-1 overflow-y-auto">
            {SUBNAV.map((s) => {
              const active = section === s.id;
              const isAll = s.id === "all";
              return (
                <Button
                  key={s.id}
                  fullWidth
                  size="sm"
                  variant={active ? "flat" : "light"}
                  color={active ? "primary" : "default"}
                  radius="lg"
                  className="justify-between h-9 text-small"
                  onPress={() => setSection(s.id)}
                  endContent={
                    <span className="flex items-center gap-1.5">
                      {s.badge && <Chip size="sm" color="primary" variant="flat" className="h-4 text-tiny">{s.badge}</Chip>}
                      {isAll && <FontAwesomeIcon icon={faPlus} className="text-tiny text-default-400" />}
                    </span>
                  }
                >
                  <span className="text-left flex-1">{s.label}</span>
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Right: scope-aware content pane */}
        <div className="flex-1 min-w-0 px-6 py-6 overflow-y-auto">
          {section === "doc" || section === "card" || section === "prompts" ? (
            <PositioningPanel
              section={section}
              scopeMode={scopeMode}
              scopeName={scopeName}
            />
          ) : visibleTiles.length === 0 ? (
            <Card shadow="none" className="border-2 border-dashed border-divider">
              <CardBody className="py-16 items-center text-center gap-3">
                <FontAwesomeIcon icon={faShapes} className="text-3xl text-default-300" />
                <p className="text-medium font-medium">這個區塊還沒有資產</p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleTiles.map((t) => (
                <BrandAssetTile key={t.id} tile={t} onClick={() => onTileClick(t)} />
              ))}

              {/* 新增類別 — last empty tile */}
              {section === "all" && (
                <Card
                  isPressable
                  isHoverable
                  shadow="none"
                  radius="lg"
                  className="border-2 border-dashed border-divider"
                >
                  <CardBody className="aspect-[4/3] items-center justify-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-default-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faPlus} className="text-2xl text-default-500" />
                    </div>
                    <p className="text-small text-default-500">新增類別</p>
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ─────────────────────────── PositioningPanel ───────────────────────── */
// Phase 4 placeholder — Phase 5 will fill these with the actual 8/6/3-section
// forms + speed-card view + AI prompt library.

function PositioningPanel({
  section, scopeMode, scopeName,
}: {
  section: "doc" | "card" | "prompts";
  scopeMode: "brand" | "product" | "event" | "none";
  scopeName: string;
}) {
  const titleMap = { doc: "完整定位書", card: "速查卡", prompts: "AI 指令庫" } as const;
  const iconMap = { doc: faBookOpen, card: faTableList, prompts: faRobot } as const;
  const sectionCount =
    scopeMode === "brand" ? { doc: 8, card: 3, prompts: 6 }
    : scopeMode === "product" ? { doc: 6, card: 2, prompts: 6 }
    : scopeMode === "event" ? { doc: 3, card: 1, prompts: 6 }
    : { doc: 0, card: 0, prompts: 0 };

  if (scopeMode === "none") {
    return (
      <Card shadow="none" className="border-2 border-dashed border-divider">
        <CardBody className="py-16 items-center text-center gap-3">
          <FontAwesomeIcon icon={iconMap[section]} className="text-3xl text-default-300" />
          <p className="text-medium font-medium">{titleMap[section]}</p>
          <p className="text-small text-default-500 max-w-[320px]">
            請於右上 ScopeBar 選擇品牌 / 產品 / 活動，才能編輯定位內容。
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-default-100 border border-divider flex items-center justify-center">
            <FontAwesomeIcon icon={iconMap[section]} className="text-default-600" />
          </div>
          <div>
            <p className="text-tiny text-default-500 uppercase tracking-wider">
              {scopeMode === "product" ? "PRODUCT" : scopeMode === "event" ? "EVENT" : "BRAND"} · {titleMap[section]}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{scopeName}</h2>
          </div>
        </div>
        <Divider />
        <div className="text-small text-default-500 leading-relaxed space-y-2">
          <p>
            這個區塊將呈現 {scopeMode === "brand" ? "品牌" : scopeMode === "product" ? "產品" : "活動"}
            的 {titleMap[section]}（{sectionCount[section]} 個段落）。
          </p>
          <p>
            每個段落支援：手動填寫 ｜ 由推薦 agent 自動填寫。下一個 phase 會接 form components。
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────── BrandAssetTile ─────────────────────────── */

function BrandAssetTile({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  return (
    <Card
      isPressable
      isHoverable
      onPress={onClick}
      shadow="sm"
      radius="lg"
      className={`overflow-hidden bg-${tile.tone}-100`}
    >
      <CardBody className="aspect-[4/3] items-center justify-center relative p-0">
        <FontAwesomeIcon
          icon={tile.icon}
          className={`text-7xl text-${tile.tone}-600/70`}
        />
        {tile.count != null && tile.count > 0 && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md">
            {tile.count}
          </Chip>
        )}
        {!tile.ready && (
          <Chip size="sm" variant="flat" className="absolute top-3 right-3 bg-content1/80 backdrop-blur-md text-default-500">
            即將推出
          </Chip>
        )}
      </CardBody>
      <div className="px-4 py-3 bg-content1">
        <p className="text-small font-medium text-foreground">{tile.label}</p>
      </div>
    </Card>
  );
}
