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
} from "@fortawesome/free-solid-svg-icons";

type SectionId =
  | "all" | "guidelines" | "templates"
  | "logo" | "colors" | "fonts" | "voice"
  | "positioning" | "audience" | "competitor"
  | "photos" | "images" | "icons" | "charts";

interface SubNavItem { id: SectionId; label: string; badge?: string; }
const SUBNAV: SubNavItem[] = [
  { id: "all",         label: "所有資產" },
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
  const { brandId, setBrandId, brands } = useOutletContext<ShellOutletCtx>();
  const [section, setSection] = useState<SectionId>("all");

  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? brands[0] ?? null,
    [brands, brandId]
  );
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
      {/* ─── Top header — design-system canonical pattern ─────────── */}
      <header className="px-8 py-10 border-b border-divider bg-content1">
        <Chip
          color="default"
          variant="flat"
          size="sm"
          className="uppercase tracking-wider mb-2"
          startContent={<FontAwesomeIcon icon={faFolderOpen} className="ml-1" />}
        >
          品牌工具組
        </Chip>
        <h1 className="text-3xl font-semibold tracking-tight">{brandName}</h1>
        <p className="text-small text-default-500 mt-1">
          切換品牌請使用左側 sidebar
        </p>
        {/* legacy switcher kept hidden — single source of truth is ShellLayout sidebar */}
        <Dropdown placement="bottom" classNames={{ base: "hidden" }}>
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="light" radius="full" aria-label="切換品牌" className="hidden">
              <FontAwesomeIcon icon={faChevronDown} className="text-tiny" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="切換品牌"
            selectionMode="single"
            selectedKeys={brandId != null ? new Set([String(brandId)]) : new Set()}
            onAction={(k) => setBrandId(Number(k))}
          >
            {brands.map((b: any) => (
              <DropdownItem key={String(b.id)}>{b.name}</DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
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

          {/* Brand switcher dropdown — pinned section */}
          <div className="px-3 pt-2 pb-1">
            <Dropdown placement="bottom-start">
              <DropdownTrigger>
                <Button
                  fullWidth
                  variant="bordered"
                  radius="lg"
                  className="justify-between h-12"
                  startContent={
                    <Avatar
                      name={brandInitial}
                      size="sm"
                      radius="md"
                      classNames={{ base: "shrink-0 bg-default-100 text-default-600", name: "text-tiny font-bold" }}
                    />
                  }
                  endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny text-default-400" />}
                >
                  <span className="text-small truncate flex-1 text-left">品牌工具組</span>
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="切換品牌"
                selectionMode="single"
                selectedKeys={brandId != null ? new Set([String(brandId)]) : new Set()}
                onAction={(k) => setBrandId(Number(k))}
              >
                {brands.map((b: any) => (
                  <DropdownItem key={String(b.id)}>{b.name}</DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
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

        {/* Right: tile grid — full bleed */}
        <div className="flex-1 min-w-0 px-6 py-6 overflow-y-auto">
          {visibleTiles.length === 0 ? (
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
                    <div className="w-14 h-14 rounded-full bg-secondary-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faPlus} className="text-2xl text-secondary" />
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
