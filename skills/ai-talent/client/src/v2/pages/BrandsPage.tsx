/**
 * BrandsPage — Canva Brand Kit clone (full HeroUI rewrite).
 *
 * Page structure (top → bottom):
 *   1. Pastel hero with brand selector + 同步資產 CTA
 *   2. Promo banner (建立品牌準則 CTA)
 *   3. Vertical Tabs (left rail) + main content (right)
 *   4. Main content has multiple "asset sections":
 *        - 標誌 (logos)         — 4 cols, square cards, empty state
 *        - 顏色 (colors)        — palette row of swatch chips
 *        - 字型 (fonts)         — typography sample cards
 *        - 品牌口吻 (voice)     — text card backed by brandBrain
 *        - 品牌定位 (positioning)
 *        - 目標受眾 (audience)
 *        - 競品洞察 (competitors)
 *        - 照片 / 圖像 / 圖示 / 圖表 (placeholders)
 *
 * Each section: HeroUI section header + 新增 Button (right) + grid of
 * items OR empty-state Card. Tabs control which section(s) render.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Avatar, Button, Card, CardBody, CardFooter, CardHeader, Chip, Divider,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Skeleton, Tab, Tabs, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown, faPlus, faCloudArrowUp, faCrown, faWandMagicSparkles,
  faShapes, faPalette, faFont, faQuoteLeft, faBullseye, faUsers,
  faChartLine, faImage, faIcons, faChartPie, faImages, faPenNib, faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";

type SectionId =
  | "all" | "logo" | "colors" | "fonts" | "voice"
  | "positioning" | "audience" | "competitor"
  | "photos" | "images" | "icons" | "charts";

const SUBNAV: Array<{ id: SectionId; label: string; icon: any }> = [
  { id: "all",         label: "所有資產", icon: faShapes },
  { id: "logo",        label: "標誌",     icon: faPenNib },
  { id: "colors",      label: "顏色",     icon: faPalette },
  { id: "fonts",       label: "字型",     icon: faFont },
  { id: "voice",       label: "品牌口吻", icon: faQuoteLeft },
  { id: "positioning", label: "品牌定位", icon: faBullseye },
  { id: "audience",    label: "目標受眾", icon: faUsers },
  { id: "competitor",  label: "競品洞察", icon: faShieldHalved },
  { id: "photos",      label: "照片",     icon: faImages },
  { id: "images",      label: "圖像",     icon: faImage },
  { id: "icons",       label: "圖示",     icon: faIcons },
  { id: "charts",      label: "圖表",     icon: faChartPie },
];

export default function BrandsPage() {
  const { brandId, setBrandId, brands } = useOutletContext<ShellOutletCtx>();
  const [section, setSection] = useState<SectionId>("all");

  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? brands[0] ?? null,
    [brands, brandId]
  );
  const brandName = currentBrand?.name ?? "我的品牌";

  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const brainEntries: Record<string, any[]> =
    ((brainQuery.data as any)?.entries as Record<string, any[]>) ?? {};
  const brainList = (cat: string) => brainEntries[cat] ?? [];
  const brainCount = (cat: string) => (brainEntries[cat]?.length ?? 0);

  const showAll = section === "all";
  const showSection = (id: SectionId) => showAll || section === id;

  return (
    <main className="pb-16">
      {/* ─── Hero ────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(170 40% 90%) 0%, hsl(260 50% 92%) 50%, hsl(340 60% 92%) 100%)",
        }}
      >
        <div className="absolute top-5 right-6 z-10">
          <Button
            color="primary"
            radius="full"
            startContent={<FontAwesomeIcon icon={faCloudArrowUp} />}
          >
            同步品牌資產
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto px-6 pt-16 pb-12">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Avatar
              name={brandName.charAt(0).toUpperCase()}
              size="md"
              radius="md"
              color="primary"
              classNames={{ name: "font-bold" }}
            />
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              {brandName} 品牌工具組
            </h1>
            {brands.length > 1 && (
              <Dropdown placement="bottom">
                <DropdownTrigger>
                  <Button size="sm" variant="bordered" radius="full" endContent={<FontAwesomeIcon icon={faChevronDown} className="text-tiny" />}>
                    切換品牌
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
            )}
          </div>
        </div>
      </section>

      {/* ─── Promo banner ────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-6 mt-8">
        <Card shadow="sm" className="bg-gradient-to-r from-secondary-100 to-primary-100">
          <CardBody className="flex flex-row items-center justify-between gap-4 px-7 py-6">
            <div className="max-w-[520px]">
              <h2 className="text-xl font-semibold tracking-tight">讓你的品牌在不同設計間都生動無比</h2>
              <p className="mt-2 text-small text-foreground leading-relaxed">
                在品牌工具組內備妥資產與準則，Marketing OS 會自動把它們餵給每位 agent，維持一致的品牌形象。
              </p>
              <Button
                className="mt-4"
                color="primary"
                radius="full"
                startContent={<FontAwesomeIcon icon={faCrown} />}
                onPress={() => setSection("positioning")}
              >
                建立品牌準則
              </Button>
            </div>
            <div className="hidden md:flex w-[260px] h-[120px] rounded-large items-center justify-center bg-gradient-to-br from-success-400 via-secondary-500 to-danger-400">
              <span className="text-6xl font-semibold text-white">Aa</span>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ─── Body: vertical Tabs + asset sections ───────────── */}
      <section className="max-w-[1280px] mx-auto px-6 mt-10 flex gap-8">
        <aside className="w-[200px] shrink-0">
          <Tabs
            aria-label="品牌資產分類"
            isVertical
            variant="light"
            color="primary"
            selectedKey={section}
            onSelectionChange={(k) => setSection(k as SectionId)}
            classNames={{ tabList: "gap-1 w-full", tab: "justify-start h-10" }}
          >
            {SUBNAV.map((s) => (
              <Tab
                key={s.id}
                title={
                  <div className="flex items-center gap-2 text-small">
                    <FontAwesomeIcon icon={s.icon} className="text-tiny w-4" />
                    <span>{s.label}</span>
                  </div>
                }
              />
            ))}
          </Tabs>
        </aside>

        <div className="flex-1 min-w-0 space-y-10">
          {/* 標誌 */}
          {showSection("logo") && (
            <AssetSection title="標誌" hint="主標、副標、icon 版、白底版" addLabel="上傳標誌">
              <EmptyTile icon={faPenNib} label="尚未上傳標誌" />
            </AssetSection>
          )}

          {/* 顏色 */}
          {showSection("colors") && (
            <AssetSection title="顏色" hint="主色、副色、強調色 — 影響每張素材的色調" addLabel="新增色票">
              <Card shadow="none" className="border-2 border-dashed border-divider">
                <CardBody className="py-10 items-center text-center gap-3">
                  <FontAwesomeIcon icon={faPalette} className="text-3xl text-default-300" />
                  <p className="text-small text-default-500">尚未設定品牌色票 — 新增後會被同步給每位 agent</p>
                </CardBody>
              </Card>
            </AssetSection>
          )}

          {/* 字型 */}
          {showSection("fonts") && (
            <AssetSection title="字型" hint="標題字、內文字、輔助字" addLabel="新增字型">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { role: "標題", family: "Noto Sans TC", weight: "700" },
                  { role: "內文", family: "Noto Sans TC", weight: "400" },
                ].map((f) => (
                  <Card key={f.role} shadow="sm">
                    <CardBody className="px-5 py-4">
                      <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">{f.role}</p>
                      <p className="text-3xl font-semibold mt-1" style={{ fontFamily: f.family, fontWeight: f.weight as any }}>
                        AaBbCc 你好
                      </p>
                      <p className="text-tiny text-default-400 mt-1">{f.family} · {f.weight}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </AssetSection>
          )}

          {/* 品牌口吻 */}
          {showSection("voice") && (
            <BrainSection
              title="品牌口吻"
              hint="agent 寫文案時的調性"
              items={brainList("voice")}
              loading={brainQuery.isLoading}
              addLabel="新增口吻準則"
              icon={faQuoteLeft}
            />
          )}

          {/* 品牌定位 */}
          {showSection("positioning") && (
            <BrainSection
              title="品牌定位"
              hint="原型、核心價值、差異化"
              items={brainList("positioning")}
              loading={brainQuery.isLoading}
              addLabel="新增定位"
              icon={faBullseye}
            />
          )}

          {/* 目標受眾 */}
          {showSection("audience") && (
            <BrainSection
              title="目標受眾"
              hint="STP / Persona / 痛點"
              items={brainList("audience")}
              loading={brainQuery.isLoading}
              addLabel="新增 persona"
              icon={faUsers}
            />
          )}

          {/* 競品洞察 */}
          {showSection("competitor") && (
            <BrainSection
              title="競品洞察"
              hint="對手定位、優勢、缺口"
              items={brainList("competitors")}
              loading={brainQuery.isLoading}
              addLabel="新增競品"
              icon={faShieldHalved}
            />
          )}

          {/* 照片 / 圖像 / 圖示 / 圖表 — placeholders */}
          {showSection("photos") && (
            <AssetSection title="照片" hint="品牌實景與人像" addLabel="上傳照片">
              <EmptyTile icon={faImages} label="尚未上傳照片" />
            </AssetSection>
          )}
          {showSection("images") && (
            <AssetSection title="圖像" hint="插畫、illustration" addLabel="上傳圖像">
              <EmptyTile icon={faImage} label="尚未上傳圖像" />
            </AssetSection>
          )}
          {showSection("icons") && (
            <AssetSection title="圖示" hint="品牌圖示集" addLabel="上傳圖示">
              <EmptyTile icon={faIcons} label="尚未上傳圖示" />
            </AssetSection>
          )}
          {showSection("charts") && (
            <AssetSection title="圖表" hint="品牌圖表樣式" addLabel="上傳圖表">
              <EmptyTile icon={faChartPie} label="尚未上傳圖表" />
            </AssetSection>
          )}
        </div>
      </section>
    </main>
  );
}

/* ─────────────────────────── AssetSection ─────────────────────────── */

function AssetSection({
  title, hint, addLabel, children,
}: {
  title: string;
  hint?: string;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="text-large font-semibold tracking-tight">{title}</h3>
          {hint && <p className="text-tiny text-default-500 mt-0.5">{hint}</p>}
        </div>
        {addLabel && (
          <Button
            size="sm"
            variant="bordered"
            radius="full"
            startContent={<FontAwesomeIcon icon={faPlus} />}
          >
            {addLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────── BrainSection (uses brandBrain data) ─────── */

function BrainSection({
  title, hint, items, loading, addLabel, icon,
}: {
  title: string;
  hint?: string;
  items: any[];
  loading: boolean;
  addLabel: string;
  icon: any;
}) {
  return (
    <AssetSection title={title} hint={hint} addLabel={addLabel}>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-large" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyTile icon={icon} label={`尚未設定${title}`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it: any, i: number) => (
            <Card key={it.id ?? i} shadow="sm">
              <CardHeader className="flex items-center gap-2">
                <FontAwesomeIcon icon={icon} className="text-default-500 text-tiny" />
                <p className="text-small font-medium line-clamp-1">
                  {it.title ?? it.name ?? `${title} #${i + 1}`}
                </p>
              </CardHeader>
              <Divider />
              <CardBody className="text-small text-default-700 line-clamp-4 leading-snug">
                {it.body ?? it.summary ?? it.description ?? "—"}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AssetSection>
  );
}

/* ─────────────────────────── EmptyTile ─────────────────────────── */

function EmptyTile({ icon, label }: { icon: any; label: string }) {
  return (
    <Card shadow="none" className="border-2 border-dashed border-divider">
      <CardBody className="py-12 items-center text-center gap-3">
        <FontAwesomeIcon icon={icon} className="text-3xl text-default-300" />
        <p className="text-small text-default-500">{label}</p>
        <Button size="sm" variant="bordered" radius="full" startContent={<FontAwesomeIcon icon={faPlus} />}>
          新增
        </Button>
      </CardBody>
    </Card>
  );
}
