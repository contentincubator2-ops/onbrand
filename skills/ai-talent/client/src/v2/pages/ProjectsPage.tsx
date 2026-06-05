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
import { showToastGlobal } from "../../components/ui/Toast";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Skeleton } from "@heroui/react";
import { Search, Plus, Folder, Clock, Trash2, Copy, Info, Pencil } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faYoutube, faTiktok, faLinkedin, faThreads } from "@fortawesome/free-brands-svg-icons";
import { faGlobe, faNewspaper, faEnvelope, faPenNib } from "@fortawesome/free-solid-svg-icons";

interface MissionRow {
  id: number;            // mission_outputs.id (output row) — NOT the mission PK
  missionId?: number;    // the real missions.id — use for mission.* mutations
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

function formatRelative(dateStr: string | undefined, lang: "zh-TW" | "en"): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const isEn = lang === "en";
  if (mins < 1)    return isEn ? "Just now" : "剛剛";
  if (mins < 60)   return isEn ? `${mins}m ago` : `${mins} 分鐘前`;
  if (hours < 24)  return isEn ? `${hours}h ago` : `${hours} 小時前`;
  if (days === 1)  return isEn ? "1 day ago" : "1 天前";
  if (days < 30)   return isEn ? `${days} days ago` : `${days} 天前`;
  return new Date(dateStr).toLocaleDateString(isEn ? "en-US" : "zh-TW", { month: "short", day: "numeric" });
}

function brandColor(seed: string): string {
  const palette = ["#6366F1","#EC4899","#F97316","#10B981","#3B82F6","#8B5CF6","#EF4444","#14B8A6"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length]!;
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const shellBrands = ctx?.brands ?? [];
  const shellBrandId = ctx?.brandId ?? null;
  // 2026-05-11 (CJ「選了 product/event 也要 filter projects」): scope filter.
  const shellProductId = (ctx as any)?.scope?.productId ?? null;
  const shellEventId = (ctx as any)?.scope?.eventId ?? null;

  // 2026-05-19 (CJ「任務完成沒有按儲存也要出現在專案」):
  // refetchOnWindowFocus: true → 從 /run 切回 /projects 立刻拿最新清單。
  // interval 縮到 8s (was 15s) 讓背景任務更快出現。
  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery?.(
    undefined,
    { refetchOnWindowFocus: true, refetchInterval: 8_000 },
  );
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: shellBrands?.[0]?.id ?? 0 },
    { enabled: !allQuery && !!shellBrands?.[0]?.id, refetchOnWindowFocus: true },
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
  // createOpen state removed 2026-05-14 along with CreateMissionModal.

  // Filter
  const filtered = useMemo(() => {
    let r = rows;
    // Only show missions that have an actual output run (mo.id != null).
    // Template/seed missions with no runs have id = null in the query result
    // and show nothing when clicked — exclude them entirely.
    r = r.filter((m) => !!m.id);
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
    // 2026-05-14: row.id is now mission_output.id (per-run unique); the
    // mission-detail page key lives on row.missionId. Fall back to row.id
    // for legacy callers that still ship mission rows.
    const missionId = (m as any).missionId ?? m.id;
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${missionId}`);
    else navigate(`/m/${missionId}`);
  };

  const isLoading = !!allQuery && allQuery.isLoading;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* ─── Hero (matches /30s / /brands rhythm) ─────────────────── */}
      <div className="relative pt-10 pb-5 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          {/* 2026-05-11 (CJ): canonical header template — same as /30s / /60s / /99s. */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
            PROJECTS · OUTPUTS
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
            {lang === "en" ? "Everything you've made — all in one place" : "你做過的每一篇都在這"}
          </h1>
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {lang === "en"
              ? "Every piece of content you've generated, automatically archived here"
              : "每次執行的產出，自動歸檔到這裡"}
          </p>
          <p
            className="mt-2 mb-5 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>
              {lang === "en" ? "Good for:" : "適合："}
            </span>
            {lang === "en"
              ? "Finding last week's work · Rerunning a task · Tidying drafts"
              : "找上週做過的東西 · 重跑同任務 · 整理待發內容"}
          </p>

          {/* Single search bar */}
          <div className="w-full" style={{ maxWidth: 720 }}>
            <div className="flex items-center gap-3 px-5 bg-white rounded-[20px] border border-default-100 shadow-md" style={{ height: 56 }}>
              <Search size={18} className="text-default-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "en" ? "Search projects, brands, channels…" : "搜尋專案 / 品牌 / 平台…"}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-default-400 hover:text-default-700 text-sm shrink-0">
                  {lang === "en" ? "Clear" : "清除"}
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
              {lang === "en" ? "All" : "全部"} · {rows.length}
            </button>
            {brandsWithCount
              // When a brand is active in shell, only show that brand chip
              // (hide other brands — user already knows their context).
              .filter((b) => {
                if (b.count === 0) return false;
                if (shellBrandId && shellBrandId !== b.id) return false;
                return true;
              })
              .map((b) => {
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
              {activeBrandId === "all"
                ? (lang === "en" ? "Recent" : "最近活動")
                : (lang === "en" ? "Activity" : "活動")}
              <span className="text-default-400 font-normal ml-2">
                {lang === "en" ? `${filtered.length} items` : `${filtered.length} 個`}
              </span>
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
            onCreate={() => { /* New-task entry retired; users go to /30s etc. */ }}
            lang={lang}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {recent.map((m) => (
              <ProjectCard key={m.id} mission={m} onClick={() => goToMission(m)} lang={lang} />
            ))}
          </div>
        )}
      </div>

      {/* 2026-05-14 (CJ): retired the +New FAB and CreateMissionModal.
          Users enter tasks via the sidebar /30s /60s /99s pages instead;
          /projects is now read-only history. */}
    </div>
  );
}

/* ─────────────────────── ProjectCard ─────────────────────── */
function ProjectCard({ mission, onClick, lang }: { mission: MissionRow; onClick: () => void; lang: "zh-TW" | "en" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // 2026-05-14 (CJ「專案名稱要可以編輯」): inline rename mode + optimistic UI.
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>(mission.title ?? "");
  // Optimistic title displayed while the mutation is in flight.
  // Cleared once mission.title (from refetched server data) catches up.
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  useEffect(() => {
    // Server caught up → drop the optimistic value.
    if (optimisticTitle !== null && mission.title === optimisticTitle) {
      setOptimisticTitle(null);
    }
  }, [mission.title, optimisticTitle]);
  const utils = trpc.useUtils();
  const renameMut = (trpc as any).output?.updateTitle?.useMutation
    ? (trpc as any).output.updateTitle.useMutation({
        onSuccess: () => {
          (utils as any).mission?.listAllForUser?.invalidate?.();
        },
        onError: (e: any) => {
          // Revert the optimistic value + tell the user
          setOptimisticTitle(null);
          showToastGlobal(
            (lang === "en" ? "Rename failed: " : "重新命名失敗：") + (e?.message ?? e),
          );
        },
      })
    : null;

  // 2026-05-16 (CJ「任務的四個按鍵，只有重新命名有用」→「建立複本失敗：
  // Mission not found」): 建立複本 + 移到垃圾桶 were dead; first wiring
  // passed mission.id but listAllForUser returns id=mission_outputs.id
  // and missionId=missions.id, so mission.duplicate/delete (keyed on
  // missions.id) said "Mission not found". Rename worked because it
  // targets the OUTPUT row. Use the real missions PK here.
  const realMissionId = (mission as any).missionId ?? mission.id;
  const duplicateMut = (trpc as any).mission?.duplicate?.useMutation
    ? (trpc as any).mission.duplicate.useMutation({
        onSuccess: () => {
          (utils as any).mission?.listAllForUser?.invalidate?.();
          showToastGlobal(lang === "en" ? "Duplicate created" : "已建立複本", "success");
        },
        onError: (e: any) =>
          showToastGlobal((lang === "en" ? "Duplicate failed: " : "建立複本失敗：") + (e?.message ?? e)),
      })
    : null;
  const deleteMut = (trpc as any).mission?.delete?.useMutation
    ? (trpc as any).mission.delete.useMutation({
        onSuccess: () => {
          (utils as any).mission?.listAllForUser?.invalidate?.();
          showToastGlobal(lang === "en" ? "Moved to trash" : "已移到垃圾桶", "success");
        },
        onError: (e: any) =>
          showToastGlobal((lang === "en" ? "Delete failed: " : "刪除失敗：") + (e?.message ?? e)),
      })
    : null;
  const displayTitle = optimisticTitle ?? mission.title ?? "";
  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDraftTitle(displayTitle);
    setEditing(true);
  };
  const commitEdit = () => {
    const next = draftTitle.trim();
    if (!next) { setEditing(false); return; }
    if (next === displayTitle.trim()) { setEditing(false); return; }
    setOptimisticTitle(next); // show the new name immediately
    if (renameMut) {
      renameMut.mutate({ id: mission.id, title: next.slice(0, 120) });
    } else {
      // No mutation available (e.g. type stub) — keep optimistic, no save.
      console.warn("[rename] output.updateTitle mutation not available");
    }
    setEditing(false);
  };
  const cancelEdit = (e?: React.KeyboardEvent | React.FocusEvent) => {
    e?.stopPropagation();
    setEditing(false);
    setDraftTitle(displayTitle);
  };

  const ws = (mission.workspace ?? "other").toLowerCase();
  const icon = WORKSPACE_ICONS[ws] ?? faPenNib;
  const tone = WORKSPACE_TONE[ws] ?? "#64748B";

  return (
    <div
      className="group relative rounded-xl bg-white border border-default-100 hover:shadow-md hover:border-default-300 transition overflow-hidden cursor-pointer"
      onClick={editing ? undefined : onClick}
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
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              else if (e.key === "Escape") { e.preventDefault(); cancelEdit(e); }
            }}
            onBlur={commitEdit}
            maxLength={120}
            placeholder={lang === "en" ? "Untitled" : "未命名"}
            className="w-full text-sm font-medium text-default-900 mb-0.5 px-1 py-0.5 -mx-1 -my-0.5 rounded border-2 border-primary-400 bg-white focus:outline-none focus:border-primary-600"
          />
        ) : (
          /* 2026-05-14 (CJ「按標題的地方跟點進去任務的地方一樣，無法編輯」):
             single-click title was racing with card onClick and always lost.
             Title text → still navigates (matches user expectation: "click
             the card to open it"). Rename is now an explicit pencil-icon
             button that appears on card hover — also still available via
             kebab menu's 「重新命名」. Double-click also works as a power-user
             shortcut. */
          <div className="relative flex items-start gap-1 mb-0.5">
            <h3
              className="text-sm font-medium text-default-900 line-clamp-1 flex-1 min-w-0"
              title={displayTitle}
              onDoubleClick={startEditing}
            >
              {displayTitle || (lang === "en" ? "(Untitled)" : "（未命名）")}
            </h3>
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(); }}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition w-5 h-5 rounded hover:bg-default-100 flex items-center justify-center text-default-400 hover:text-default-700"
              title={lang === "en" ? "Rename" : "重新命名"}
              aria-label={lang === "en" ? "Rename" : "重新命名"}
            >
              <Pencil size={11} />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-default-500">
          <span className="truncate">{mission.brandName ?? (lang === "en" ? "(No brand)" : "（未指定品牌）")}</span>
          <span className="shrink-0">{formatRelative(mission.updatedAt, lang)}</span>
        </div>
      </div>

      {/* 3-dot kebab — minimal menu (CJ 2026-05-07: 12 → 3 items) */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/0 group-hover:bg-white shadow-sm hover:shadow flex items-center justify-center text-default-500 transition opacity-0 group-hover:opacity-100"
        title={lang === "en" ? "Actions" : "動作選單"}
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
              <Info size={11} /> {lang === "en" ? "View details" : "查看詳細"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); startEditing(); }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2"
            >
              <Pencil size={11} /> {lang === "en" ? "Rename" : "重新命名"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation(); setMenuOpen(false);
                duplicateMut?.mutate?.({ id: realMissionId });
              }}
              disabled={duplicateMut?.isPending}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2 text-default-600 disabled:opacity-50"
            >
              <Copy size={11} /> {lang === "en" ? "Duplicate" : "建立複本"}
            </button>
            <div className="border-t border-default-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation(); setMenuOpen(false);
                const name = (optimisticTitle ?? mission.title ?? "").slice(0, 40);
                if (!window.confirm(
                  lang === "en"
                    ? `Move "${name}" to trash? This cannot be undone.`
                    : `確定把「${name}」移到垃圾桶？此動作無法復原。`
                )) return;
                deleteMut?.mutate?.({ id: realMissionId });
              }}
              disabled={deleteMut?.isPending}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-danger-50 flex items-center gap-2 text-danger disabled:opacity-50"
            >
              <Trash2 size={11} /> {lang === "en" ? "Move to trash" : "移到垃圾桶"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── EmptyState ─────────────────────── */
function EmptyState({ search, onClear, onCreate, lang }: { search: string; onClear: () => void; onCreate: () => void; lang: "zh-TW" | "en" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Folder size={56} className="text-default-300 mb-4" strokeWidth={1.2} />
      {search ? (
        <>
          <p className="text-default-700 font-medium mb-1">
            {lang === "en" ? `No projects match "${search}"` : `找不到符合「${search}」的專案`}
          </p>
          <p className="text-tiny text-default-500 mb-4">
            {lang === "en" ? "Try different words, or clear the search" : "試試別的關鍵字，或清除搜尋條件"}
          </p>
          <button onClick={onClear} className="text-xs text-violet-600 hover:underline">
            {lang === "en" ? "Clear search" : "清除搜尋"}
          </button>
        </>
      ) : (
        <>
          <p className="text-default-700 font-medium mb-1">
            {lang === "en" ? "No projects yet" : "還沒有任何專案"}
          </p>
          <p className="text-tiny text-default-500 mb-4">
            {lang === "en" ? (
              <>Run a task in 30s / 60s / 99s / 7-Day Publisher and outputs land here.<br />Or start a new project:</>
            ) : (
              <>到 30s / 60s / 99s / 七日發布台 跑任務，產出會自動進來。<br />或直接建立新任務：</>
            )}
          </p>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium"
            style={{ background: "linear-gradient(135deg, #7C3AED, #6366F1)" }}
          >
            <Plus size={14} /> {lang === "en" ? "New project" : "新任務"}
          </button>
        </>
      )}
    </div>
  );
}
