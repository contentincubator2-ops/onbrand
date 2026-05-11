/**
 * ProjectsPage — simplified path A (CJ 2026-05-07).
 *
 * Replaces the previous Canva-faithful clone (sub-nav / 4 filter pills /
 * sync sources / 12-item card menu / Designs+Images+Videos sections /
 * grid+list view toggle / brand folders) with ONE clean page:
 *
 *   1 hero + 1 search bar
 *   ── 最近活動 ──  (12 most recent missions across all brands)
 *   ── 按品牌 ──   (one chip per brand with mission count)
 *   1 「+ 新任務」 button bottom-right
 *
 * Data: every task run from /30s, /60s, /100s, /theater now writes to
 * mission_outputs via recordTaskRun, so this page actually reflects the
 * user's work.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Skeleton } from "@heroui/react";
import { Search, Plus, Folder, Clock, Trash2, Copy, Info } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faYoutube, faTiktok, faLinkedin, faThreads } from "@fortawesome/free-brands-svg-icons";
import { faGlobe, faNewspaper, faEnvelope, faPenNib } from "@fortawesome/free-solid-svg-icons";
import CreateMissionModal from "../components/CreateMissionModal";

interface MissionRow {
  id: number;
  title?: string | null;
  description?: string | null;
  workspace?: string | null;
  brandId?: number | null;
  brandName?: string | null;
  status?: string | null;
  updatedAt?: string;
  thumbnailUrl?: string | null;
}

const WORKSPACE_ICONS: Record<string, any> = {
  facebook: faFacebook, instagram: faInstagram, youtube: faYoutube,
  tiktok: faTiktok, linkedin: faLinkedin, threads: faThreads,
  email: faEnvelope, press: faNewspaper, brand: faPenNib, audience: faPenNib,
  website: faGlobe, theater: faPenNib,
};

const WORKSPACE_TONE: Record<string, string> = {
  facebook: "#1877F2", instagram: "#E1306C", youtube: "#FF0000",
  tiktok: "#000000", linkedin: "#0A66C2", threads: "#000000",
  email: "#0EA5E9", press: "#64748B", brand: "#7C3AED", audience: "#7C3AED",
  website: "#10B981", theater: "#F97316",
};

function formatRelative(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return "剛剛";
  if (mins < 60)   return `${mins} 分鐘前`;
  if (hours < 24)  return `${hours} 小時前`;
  if (days === 1)  return "1 天前";
  if (days < 30)   return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

function brandColor(seed: string): string {
  const palette = ["#6366F1","#EC4899","#F97316","#10B981","#3B82F6","#8B5CF6","#EF4444","#14B8A6"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length]!;
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>();
  const shellBrands = ctx?.brands ?? [];
  const shellBrandId = ctx?.brandId ?? null;
  // 2026-05-11 (CJ「選了 product/event 也要 filter projects」): scope filter.
  const shellProductId = (ctx as any)?.scope?.productId ?? null;
  const shellEventId = (ctx as any)?.scope?.eventId ?? null;

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery?.(
    undefined,
    { refetchOnWindowFocus: false, refetchInterval: 15_000 },
  );
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: shellBrands?.[0]?.id ?? 0 },
    { enabled: !allQuery && !!shellBrands?.[0]?.id, refetchOnWindowFocus: false },
  );

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    return (fallbackQuery.data as MissionRow[]) ?? [];
  }, [allQuery?.data, fallbackQuery.data]);

  const [search, setSearch] = useState("");
  // 2026-05-11 (CJ「切換品牌應該全局切換」): default filter follows the
  // shell's active brand. If shell brand is set, filter to it on mount.
  const [activeBrandId, setActiveBrandId] = useState<number | "all">(
    shellBrandId ?? "all",
  );
  // Sync filter when user switches brand in the top bar.
  useEffect(() => {
    if (shellBrandId !== null && shellBrandId !== activeBrandId) {
      setActiveBrandId(shellBrandId);
    }
    // Intentionally don't run when activeBrandId changes locally (user
    // can still manually pick 'all' or another brand within ProjectsPage
    // without it getting overridden until shell brand changes again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellBrandId]);
  const [createOpen, setCreateOpen] = useState(false);

  // Filter
  const filtered = useMemo(() => {
    let r = rows;
    if (activeBrandId !== "all") r = r.filter((m) => m.brandId === activeBrandId);
    // 2026-05-11 (CJ): when shell scope has product/event, narrow projects too
    if (shellProductId) {
      r = r.filter((m) => (m as any).scopeProductId === shellProductId);
    }
    if (shellEventId) {
      r = r.filter((m) => (m as any).scopeEventId === shellEventId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((m) =>
        (m.title ?? "").toLowerCase().includes(q) ||
        (m.brandName ?? "").toLowerCase().includes(q) ||
        (m.workspace ?? "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, activeBrandId, search, shellProductId, shellEventId]);

  // Brand chips with counts
  const brandsWithCount = useMemo(() => {
    const counts = new Map<number, number>();
    rows.forEach((m) => {
      if (m.brandId) counts.set(m.brandId, (counts.get(m.brandId) ?? 0) + 1);
    });
    return (shellBrands as any[])
      .map((b) => ({ id: b.id, name: b.name as string, count: counts.get(b.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [rows, shellBrands]);

  const recent = filtered.slice(0, 18);

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const isLoading = !!allQuery && allQuery.isLoading;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* ─── Hero (matches /30s / /brands rhythm) ─────────────────── */}
      <div className="relative pt-10 pb-5 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-default-400 mb-3">
            SoWork · PROJECTS
          </p>
          <h1
            className="font-semibold tracking-tight leading-none mb-3"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            專案
          </h1>
          <p className="text-small text-default-500 mb-5">
            你做過的內容都在這 — 30s / 60s / 99s / 企劃台 的產出自動進入專案。
          </p>

          {/* Single search bar */}
          <div className="w-full" style={{ maxWidth: 720 }}>
            <div className="flex items-center gap-3 px-5 bg-white rounded-[20px] border border-default-100 shadow-md" style={{ height: 56 }}>
              <Search size={18} className="text-default-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋專案 / 品牌 / 平台…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-default-400 hover:text-default-700 text-sm shrink-0">
                  清除
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Brand filter chips ─────────────────────────────────────── */}
      {brandsWithCount.length > 0 && (
        <div className="max-w-[1100px] mx-auto px-6 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveBrandId("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                activeBrandId === "all"
                  ? "bg-default-900 text-white border-default-900"
                  : "bg-white text-default-700 border-default-200 hover:border-default-400"
              }`}
            >
              全部 · {rows.length}
            </button>
            {brandsWithCount.filter((b) => b.count > 0).map((b) => {
              const active = activeBrandId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBrandId(b.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                    active
                      ? "bg-default-900 text-white border-default-900"
                      : "bg-white text-default-700 border-default-200 hover:border-default-400"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: brandColor(b.name) }} />
                  {b.name} · {b.count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Recent activity ─────────────────────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-default-500" />
            <h2 className="text-sm font-semibold text-default-700">
              {activeBrandId === "all" ? "最近活動" : "活動"}
              <span className="text-default-400 font-normal ml-2">{filtered.length} 個</span>
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="rounded-xl" style={{ height: 140 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            search={search}
            onClear={() => { setSearch(""); setActiveBrandId("all"); }}
            onCreate={() => setCreateOpen(true)}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {recent.map((m) => (
              <ProjectCard key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Bottom-right FAB ────────────────────────────────────────── */}
      <button
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-2 px-5 py-3 rounded-full text-white font-semibold shadow-lg transition hover:translate-y-[-1px]"
        style={{
          background: "linear-gradient(135deg, #7C3AED, #6366F1)",
          boxShadow: "0 8px 24px rgba(99,102,241,0.45)",
          zIndex: 40,
        }}
      >
        <Plus size={16} />
        新任務
      </button>

      <CreateMissionModal open={createOpen} initialWorkspace="all" onClose={() => setCreateOpen(false)} />
    </div>
  );
}

/* ─────────────────────── ProjectCard ─────────────────────── */
function ProjectCard({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ws = (mission.workspace ?? "other").toLowerCase();
  const icon = WORKSPACE_ICONS[ws] ?? faPenNib;
  const tone = WORKSPACE_TONE[ws] ?? "#64748B";

  return (
    <div
      className="group relative rounded-xl bg-white border border-default-100 hover:shadow-md hover:border-default-300 transition overflow-hidden cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail (or coloured fallback) */}
      <div
        className="relative aspect-[4/3] flex items-center justify-center overflow-hidden"
        style={{ background: mission.thumbnailUrl ? "#F4F4F5" : `${tone}14` }}
      >
        {mission.thumbnailUrl ? (
          <img
            src={mission.thumbnailUrl}
            alt={mission.title ?? "project"}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <FontAwesomeIcon icon={icon} style={{ color: tone, fontSize: 36, opacity: 0.55 }} />
        )}
        {/* Workspace tag */}
        <span
          className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/95 shadow-sm"
          style={{ color: tone }}
        >
          <FontAwesomeIcon icon={icon} className="text-[9px]" />
          {ws}
        </span>
      </div>

      {/* Body */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-default-900 mb-0.5 line-clamp-1" title={mission.title ?? ""}>
          {mission.title || "（未命名）"}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-default-500">
          <span className="truncate">{mission.brandName ?? "（未指定品牌）"}</span>
          <span className="shrink-0">{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>

      {/* 3-dot kebab — minimal menu (CJ 2026-05-07: 12 → 3 items) */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/0 group-hover:bg-white shadow-sm hover:shadow flex items-center justify-center text-default-500 transition opacity-0 group-hover:opacity-100"
        title="動作選單"
      >
        ⋯
      </button>
      {menuOpen && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="fixed inset-0 z-40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-9 right-2 z-50 bg-white rounded-lg border border-default-200 shadow-lg py-1 w-36"
          >
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClick(); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2">
              <Info size={11} /> 查看詳細
            </button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2 text-default-600">
              <Copy size={11} /> 建立複本
            </button>
            <div className="border-t border-default-100 my-1" />
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-danger-50 flex items-center gap-2 text-danger">
              <Trash2 size={11} /> 移到垃圾桶
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── EmptyState ─────────────────────── */
function EmptyState({ search, onClear, onCreate }: { search: string; onClear: () => void; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Folder size={56} className="text-default-300 mb-4" strokeWidth={1.2} />
      {search ? (
        <>
          <p className="text-default-700 font-medium mb-1">找不到符合「{search}」的專案</p>
          <p className="text-tiny text-default-500 mb-4">試試別的關鍵字，或清除搜尋條件</p>
          <button onClick={onClear} className="text-xs text-violet-600 hover:underline">清除搜尋</button>
        </>
      ) : (
        <>
          <p className="text-default-700 font-medium mb-1">還沒有任何專案</p>
          <p className="text-tiny text-default-500 mb-4">
            到 30s / 60s / 99s / 企劃台 跑任務，產出會自動進來。<br />
            或直接建立新任務：
          </p>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium"
            style={{ background: "linear-gradient(135deg, #7C3AED, #6366F1)" }}
          >
            <Plus size={14} /> 新任務
          </button>
        </>
      )}
    </div>
  );
}
