/**
 * ProjectsPage — 專案 (v2 D5 — Canva-faithful clone)
 *
 * Reference study: Canva → Projects ("專案") page.
 *
 * Layout (top → bottom):
 *   1. Pastel gradient hero, headline "所有專案", with top-right CTAs
 *      (先睹為快 + 開始試用) — same language as MissionsHome.
 *   2. Big purple-bordered pill search bar.
 *   3. Filter chip row: 類型 / 類別 / 擁有者 / 已修改日期 (each a dropdown).
 *      Right-aligned controls: sort (新到舊), grid/list toggle, "+" create.
 *
 * Two-column body:
 *   - Left rail (220px) sub-nav:
 *       · 所有專案 (default)
 *       · 你的專案 (我建立的)
 *       · 與你分享
 *       · 可離線使用
 *     + ⭐ 收藏小卡 (tip card, Canva pattern)
 *
 *   - Main column:
 *       · 最近的項目 — horizontal scroll of MissionThumbs
 *       · 資料夾 — placeholder grid (上傳 folder)
 *       · 設計 — 6-col grid of MissionThumbs (responsive)
 *
 * The page reuses the existing `mission.listAllForUser` tRPC query, so
 * everything the user sees on Home is automatically reflected here, with
 * project-specific filters layered on top.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
import ProjectSyncModal, { type SyncSource } from "../components/projects/ProjectSyncModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

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

type SubNav = "all" | "mine" | "shared" | "offline";

const SUB_NAV: Array<{ id: SubNav; label: string; glyph: string }> = [
  { id: "all",     label: "所有專案",      glyph: "▦" },
  { id: "mine",    label: "你的專案",      glyph: "◐" },
  { id: "shared",  label: "與你分享",      glyph: "⇆" },
  { id: "offline", label: "可離線使用",    glyph: "⤓" },
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

  // ── Filter / sort state
  const [searchQ, setSearchQ] = useState("");
  const [subNav, setSubNav] = useState<SubNav>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [createSource, setCreateSource] = useState<SourceId | null>(null);
  const [syncSource, setSyncSource] = useState<SyncSource | null>(null);

  // Type filter options derived from data
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { if (m.workspace) set.add(m.workspace.toLowerCase()); });
    return [
      { value: "all", label: "全部類型" },
      ...Array.from(set).sort().map((v) => ({ value: v, label: v })),
    ];
  }, [rows]);

  // Category filter — by strategy layer
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

  // Owner filter — by brand
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
    if (typeFilter !== "all") {
      r = r.filter((m) => (m.workspace ?? "").toLowerCase() === typeFilter);
    }
    if (categoryFilter !== "all") {
      r = r.filter((m) => (m.squadLayer ?? "").toString().slice(0, 2) === categoryFilter);
    }
    if (ownerFilter !== "all") {
      r = r.filter((m) => String(m.brandId) === ownerFilter);
    }
    if (dateFilter !== "all") {
      const now = Date.now();
      const cutoff: Record<string, number> = {
        today: 86_400_000,
        week:  86_400_000 * 7,
        month: 86_400_000 * 30,
        year:  86_400_000 * 365,
      };
      const ms = cutoff[dateFilter];
      if (ms) r = r.filter((m) => m.updatedAt && (now - new Date(m.updatedAt).getTime() <= ms));
    }
    // sub-nav filters (all/mine/shared/offline are placeholders — same data)
    // future: filter by ownership when backend exposes it.

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

  return (
    <main>
      {/* ─── Pastel hero ─────────────────────────────────────────── */}
      <section
        className="relative px-8 pt-14 pb-10"
        style={{
          background:
            "linear-gradient(135deg, #EAF2FF 0%, #EFE9FB 35%, #F8E8FF 70%, #FFE9F1 100%)",
        }}
      >
        {/* Top-right CTAs */}
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <button
            onClick={() => navigate("/templates")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[0.78rem] bg-white/90 hover:bg-white border border-mos-hair rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <span aria-hidden style={{ color: "#5B3CC8" }}>✦</span>
            <span className="text-mos-ink">先看看任務範本</span>
          </button>
          <button
            onClick={() => setCreateSource("recommended")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.78rem] bg-white hover:bg-mos-ink/5 border border-mos-ink rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <span aria-hidden style={{ color: "#D4A24C" }}>👑</span>
            <span className="text-mos-ink font-medium">開始建立</span>
          </button>
        </div>

        <div className="max-w-[1280px] mx-auto">
          <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
            PROJECTS
          </div>
          <h1 className="mt-1 font-display text-[2.4rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
            所有專案
          </h1>

          {/* Search bar */}
          <div className="mt-6 max-w-[720px]">
            <div className="relative">
              <svg
                className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-mos-muted pointer-events-none"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7.5" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜尋你的內容"
                className="w-full pl-14 pr-5 py-[14px] text-[0.92rem] bg-white rounded-full border border-[#5B3CC8]/30 focus:outline-none focus:border-[#5B3CC8] focus:ring-2 focus:ring-[#5B3CC8]/15 transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Filter row ──────────────────────────────────────────── */}
      <section className="border-b border-mos-hair bg-white">
        <div className="max-w-[1280px] mx-auto px-8 py-3 flex items-center gap-2 flex-wrap">
          <FilterChip
            label={typeFilter === "all" ? "類型" : `類型：${typeFilter}`}
            options={typeOptions}
            onSelect={setTypeFilter}
          />
          <FilterChip
            label={categoryFilter === "all" ? "類別" : `類別：${categoryFilter}`}
            options={categoryOptions}
            onSelect={setCategoryFilter}
          />
          <FilterChip
            label={ownerFilter === "all" ? "擁有者" : `擁有者：${ownerOptions.find((o) => o.value === ownerFilter)?.label ?? ""}`}
            options={ownerOptions}
            onSelect={setOwnerFilter}
          />
          <FilterChip
            label={dateFilter === "all" ? "已修改日期" : `修改：${dateOptions.find((o) => o.value === dateFilter)?.label}`}
            options={dateOptions}
            onSelect={setDateFilter}
          />

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSortDesc((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.74rem] text-mos-ink hover:bg-mos-ink/5 rounded-full transition"
              title="切換排序"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h13M3 12h9M3 18h5" />
                <path d={sortDesc ? "M18 15l3 3 3-3M21 6v12" : "M18 9l3-3 3 3M21 18V6"} />
              </svg>
              {sortDesc ? "新到舊" : "舊到新"}
            </button>

            <div className="flex items-center bg-white border border-mos-hair rounded-full overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                title="格狀檢視"
                className={[
                  "w-9 h-8 inline-flex items-center justify-center transition",
                  viewMode === "grid" ? "bg-mos-ink text-white" : "text-mos-muted hover:text-mos-ink",
                ].join(" ")}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="清單檢視"
                className={[
                  "w-9 h-8 inline-flex items-center justify-center transition",
                  viewMode === "list" ? "bg-mos-ink text-white" : "text-mos-muted hover:text-mos-ink",
                ].join(" ")}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              </button>
            </div>

            <CreateMenu
              onNewFolder={() => alert("新增資料夾（即將推出）")}
              onNewMission={() => navigate("/templates")}
              onUploadFile={() => alert("上傳檔案（即將推出）")}
              onUploadFolder={() => alert("上傳資料夾（即將推出）")}
              onSyncSource={(s) => setSyncSource(s as SyncSource)}
            />
          </div>
        </div>
      </section>

      {/* ─── Body: left sub-nav + main grid ──────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 py-8 flex gap-8">
        {/* Left rail */}
        <aside className="w-[220px] shrink-0">
          <nav className="space-y-1">
            {SUB_NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSubNav(n.id)}
                className={[
                  "w-full text-left px-3 py-2 rounded-lg text-[0.86rem] flex items-center gap-2.5 transition",
                  subNav === n.id
                    ? "bg-mos-ink/[0.06] text-mos-ink font-medium"
                    : "text-mos-muted hover:bg-mos-ink/[0.03] hover:text-mos-ink",
                ].join(" ")}
              >
                <span className="w-5 text-center text-[0.95rem] text-mos-soft">{n.glyph}</span>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Star tip card */}
          <div className="mt-6 p-4 rounded-2xl border border-mos-hair bg-gradient-to-br from-[#FFF8E7] to-[#FFE9D6]">
            <div className="text-[1.4rem]">⭐</div>
            <div className="mt-1.5 text-[0.78rem] text-mos-ink leading-snug">
              點擊任一專案的星號圖示，即可從這裡輕鬆找到。
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {isLoading && (
            <div className="text-[0.82rem] text-mos-muted">載入專案中…</div>
          )}

          {!isLoading && all.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-[2.4rem] mb-3">📁</div>
              <div className="text-[0.92rem] text-mos-ink font-medium">還沒有專案</div>
              <div className="mt-1 text-[0.78rem] text-mos-muted">
                從首頁選個任務範本，或從網路萃取一個全新的任務範本開始。
              </div>
              <button
                onClick={() => setCreateSource("recommended")}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-[0.78rem] bg-mos-ink text-white hover:bg-mos-ink/90 rounded-full transition"
              >
                建立第一個專案
              </button>
            </div>
          )}

          {/* 最近的項目 */}
          {!isLoading && recent.length > 0 && (
            <div className="mb-10">
              <SectionHeader title="最近的項目" subtitle={`${recent.length} 個`} />
              <div className="-mx-1 overflow-x-auto scroll-snap-x">
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
                <div className="border border-mos-hair rounded-xl bg-white divide-y divide-mos-hair overflow-hidden">
                  {all.map((m) => (
                    <MissionListRow key={m.id} mission={m} onClick={() => goToMission(m)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Project sync modal (Pipedream-driven) */}
      <ProjectSyncModal
        open={syncSource !== null}
        source={syncSource}
        brandId={brandId}
        onClose={() => setSyncSource(null)}
      />

      {/* Create modal */}
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
        <h2 className="font-display text-[1.05rem] text-mos-ink tracking-[-0.01em]">{title}</h2>
        {subtitle && <span className="text-[0.7rem] text-mos-soft">{subtitle}</span>}
      </div>
      <button className="text-[0.72rem] text-mos-muted hover:text-mos-ink transition">查看全部 →</button>
    </div>
  );
}

/* ─────────────────────────── Folder tile ────────────────────────────── */

function FolderTile({ glyph, label, hint }: { glyph: string; label: string; hint: string }) {
  return (
    <button className="group flex flex-col text-left bg-white border border-mos-hair rounded-xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200">
      <div
        className="relative w-full flex items-center justify-center"
        style={{
          aspectRatio: "5 / 3",
          background: "linear-gradient(135deg, #F4F1FA 0%, #EFE9FB 100%)",
        }}
      >
        <div className="text-[2rem] text-mos-ink/70 group-hover:text-mos-ink transition">{glyph}</div>
      </div>
      <div className="p-3">
        <div className="text-[0.86rem] text-mos-ink font-medium leading-snug">{label}</div>
        <div className="mt-0.5 text-[0.66rem] text-mos-muted">{hint}</div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Mission thumb (duplicated from Home) ─── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className="flex flex-col text-left bg-white border border-mos-hair rounded-xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200 w-full"
      >
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "5 / 4",
            background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}14 100%)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph
              seed={mission.squadSlug ?? mission.id}
              layer={lk}
              size={70}
            />
          </div>
          {mission.squadLayer && (
            <div
              className="absolute top-2 left-2 px-1.5 py-[2px] text-[0.52rem] tracking-[0.18em] uppercase font-display text-white rounded"
              style={{ background: tone.bg }}
            >
              {lk}
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-[0.82rem] text-mos-ink font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {mission.title}
          </div>
          <div className="mt-1.5 text-[0.66rem] text-mos-muted truncate">{updatedTxt}</div>
        </div>
      </button>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <ThumbAction title="收藏" onClick={(e) => { e.stopPropagation(); }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </ThumbAction>
        <ThumbAction title="更多" onClick={(e) => { e.stopPropagation(); }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </ThumbAction>
      </div>
    </div>
  );
}

function ThumbAction({
  title, onClick, children,
}: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center bg-white/95 border border-mos-hair text-mos-ink hover:bg-white hover:border-mos-ink rounded-full shadow-sm transition"
    >
      {children}
    </button>
  );
}

function MissionListRow({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const ws = (mission.workspace ?? "").toLowerCase();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-mos-ink/[0.02] transition text-left"
    >
      <div
        className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}14 100%)` }}
      >
        <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.88rem] text-mos-ink font-medium truncate">{mission.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-mos-muted">
          <span className="font-display tracking-[0.12em] uppercase">{lk}</span>
          {ws && (<><span className="text-mos-soft">·</span><span className="capitalize">{ws}</span></>)}
          <span className="text-mos-soft">·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Filter chip ────────────────────────────── */

function FilterChip({
  label, options, onSelect,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.74rem] text-mos-ink bg-white border border-mos-hair hover:border-mos-ink rounded-full transition"
      >
        {label}
        <svg viewBox="0 0 24 24" className="w-3 h-3 text-mos-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 left-0 z-20 min-w-[180px] bg-white border border-mos-hair rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onSelect(o.value); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[0.78rem] text-mos-ink hover:bg-mos-ink/5 transition"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Create menu (Canva "+" dropdown) ─────── */

const SYNC_SOURCES: Array<{ id: SyncSource; label: string; hint: string; glyph: string; color: string }> = [
  { id: "facebook",     label: "Facebook 粉絲團", hint: "抓貼文、圖片、影片",   glyph: "f",  color: "#1877F2" },
  { id: "instagram",    label: "Instagram 帳號",  hint: "抓圖文、限動",         glyph: "ig", color: "#E4405F" },
  { id: "youtube",      label: "YouTube 頻道",    hint: "抓影片清單、縮圖",     glyph: "▶",  color: "#FF0000" },
  { id: "website",      label: "官網 / 部落格",   hint: "抓品牌素材、文章",     glyph: "🌐", color: "#525866" },
  { id: "google-drive", label: "Google Drive",    hint: "同步整個資料夾",       glyph: "G",  color: "#1A73E8" },
  { id: "onedrive",     label: "OneDrive",        hint: "同步整個資料夾",       glyph: "☁",  color: "#0078D4" },
  { id: "dropbox",      label: "Dropbox",         hint: "同步整個資料夾",       glyph: "▽",  color: "#0061FF" },
];

function CreateMenu({
  onNewFolder, onNewMission, onUploadFile, onUploadFolder, onSyncSource,
}: {
  onNewFolder: () => void;
  onNewMission: () => void;
  onUploadFile: () => void;
  onUploadFolder: () => void;
  onSyncSource: (s: SyncSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const close = () => { setOpen(false); setSyncOpen(false); };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="新增項目"
        className="w-9 h-9 inline-flex items-center justify-center bg-mos-ink text-white hover:bg-mos-ink/90 rounded-full transition"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute top-full mt-2 right-0 z-40 w-[260px] bg-white border border-mos-hair rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.10)] py-2">
            <div className="px-4 pt-1 pb-2 text-[0.62rem] tracking-[0.18em] uppercase text-mos-soft">
              新增項目
            </div>

            <MenuItem
              glyph={<FolderIcon />}
              label="新增資料夾"
              hint="把任務分類（如客戶、季度）"
              onClick={() => { close(); onNewFolder(); }}
            />
            <MenuItem
              glyph={<GridIcon />}
              label="新任務"
              hint="從任務範本型錄建立任務"
              onClick={() => { close(); onNewMission(); }}
            />

            <div className="my-1.5 mx-3 h-px bg-mos-hair" />

            <MenuItem
              glyph={<UploadIcon />}
              label="上傳檔案"
              hint="品牌素材、參考檔、簡報、圖片"
              onClick={() => { close(); onUploadFile(); }}
            />
            <MenuItem
              glyph={<FolderUploadIcon />}
              label="上傳資料夾"
              hint="批次上傳整個資料夾"
              onClick={() => { close(); onUploadFolder(); }}
            />

            <div className="my-1.5 mx-3 h-px bg-mos-hair" />

            {/* Cloud / web sync submenu */}
            <button
              onClick={() => setSyncOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-mos-ink/[0.04] transition text-left"
            >
              <span className="w-5 h-5 inline-flex items-center justify-center text-mos-ink/70"><CloudSyncIcon /></span>
              <span className="flex-1 min-w-0">
                <div className="text-[0.84rem] text-mos-ink">從雲端 / 網路同步</div>
                <div className="text-[0.66rem] text-mos-muted truncate">FB、IG、YT、官網、雲端硬碟</div>
              </span>
              <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 text-mos-soft transition-transform ${syncOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>

            {syncOpen && (
              <div className="mx-3 mt-1 mb-1 rounded-lg bg-mos-ink/[0.03] py-1">
                {SYNC_SOURCES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { close(); onSyncSource(s.id); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-white rounded-md transition text-left"
                  >
                    <span
                      className="w-5 h-5 inline-flex items-center justify-center text-white text-[0.6rem] font-bold rounded shrink-0"
                      style={{ background: s.color }}
                      aria-hidden
                    >
                      {s.glyph}
                    </span>
                    <span className="flex-1 min-w-0">
                      <div className="text-[0.78rem] text-mos-ink truncate">{s.label}</div>
                      <div className="text-[0.62rem] text-mos-muted truncate">{s.hint}</div>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  glyph, label, hint, onClick,
}: {
  glyph: React.ReactNode; label: string; hint?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-mos-ink/[0.04] transition text-left"
    >
      <span className="w-5 h-5 inline-flex items-center justify-center text-mos-ink/70">{glyph}</span>
      <span className="flex-1 min-w-0">
        <div className="text-[0.84rem] text-mos-ink">{label}</div>
        {hint && <div className="text-[0.66rem] text-mos-muted truncate">{hint}</div>}
      </span>
    </button>
  );
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>;
}
function GridIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function UploadIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>;
}
function CloudSyncIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 18a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 18"/><path d="M12 12v6M9 15l3 3 3-3"/></svg>;
}
function FolderUploadIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 11v6M9 14l3-3 3 3"/></svg>;
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
