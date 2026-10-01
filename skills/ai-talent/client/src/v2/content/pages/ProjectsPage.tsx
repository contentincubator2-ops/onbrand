/**
 * ProjectsPage — 執行過的產出，一次執行一張卡。
 *
 * 2026-10-02 (CJ「難以按照平台、做到哪裡、自己常用的任務，看執行過的專案」)：
 *   · 篩選改成 平台／進度／任務卡（常用置頂）／產品／時間＋搜尋＋排序，
 *     篩選、計數、分頁都在伺服器（mission.listProjects → projectFilters）。
 *     舊版只拿最近 60 筆、畫 18 張，更早的產出怎麼篩都找不到。
 *   · 條件寫在網址（?platform=&stage=&task=…），重新整理不丟、其他頁可直接連進來。
 *   · 拿掉：品牌 chips（全站品牌切換已決定品牌）、族群（策略工作台 9/30 已刪，永遠空）、
 *     頂部產品／活動 scope（useScopeState 已不管 p/e）。
 *   · 多次執行仍各一張卡，每張可單獨刪除（output.delete，只封存這一次的產出）。
 *     舊版刪除打的是 mission.delete，會把同一張任務卡的所有執行一起刪掉。
 */
import { useEffect, useMemo, useState } from "react";
import { showToastGlobal } from "../../../components/ui/Toast";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { Skeleton } from "@heroui/react";
import { CopyIcon, DeleteIcon, EditIcon, FolderIcon, InfoIcon, SearchIcon } from "../../platform/components/icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faTiktok, faThreads, faLine } from "@fortawesome/free-brands-svg-icons";
import { faGlobe, faEnvelope, faPenNib } from "@fortawesome/free-solid-svg-icons";
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";

type Lang = "zh-TW" | "en";
type Stage = "generating" | "failed" | "draft" | "planned" | "scheduled" | "published";
type Period = "7d" | "30d" | "older";

interface ProjectRow {
  id: number;            // mission_outputs.id — 一次執行
  missionId: number;     // missions.id — 同一品牌×通路×任務卡
  title: string | null;
  workspace: string | null;
  platform: string;
  stage: Stage;
  brandId: number | null;
  brandName: string | null;
  createdAt: string;
  taskId: string | null;
  taskLabel: string | null;
  productName: string | null;
  thumbnailUrl?: string | null;
}

const PLATFORM_META: Record<string, { icon: any; zh: string; en: string }> = {
  facebook:  { icon: faFacebook,  zh: "Facebook", en: "Facebook" },
  instagram: { icon: faInstagram, zh: "Instagram", en: "Instagram" },
  threads:   { icon: faThreads,   zh: "Threads",  en: "Threads" },
  line:      { icon: faLine,      zh: "LINE",     en: "LINE" },
  tiktok:    { icon: faTiktok,    zh: "TikTok",   en: "TikTok" },
  email:     { icon: faEnvelope,  zh: "電子報",    en: "Newsletter" },
  website:   { icon: faGlobe,     zh: "官網",      en: "Website" },
  other:     { icon: faPenNib,    zh: "其他",      en: "Other" },
};

const STAGE_LABEL: Record<Stage, { zh: string; en: string }> = {
  generating: { zh: "生成中",     en: "Generating" },
  failed:     { zh: "失敗",       en: "Failed" },
  draft:      { zh: "草稿",       en: "Draft" },
  planned:    { zh: "已排入企劃", en: "In weekly plan" },
  scheduled:  { zh: "已排程",     en: "Scheduled" },
  published:  { zh: "已發布",     en: "Published" },
};

const PERIOD_LABEL: Record<Period, { zh: string; en: string }> = {
  "7d":  { zh: "近 7 天",  en: "Last 7 days" },
  "30d": { zh: "8–30 天", en: "8–30 days" },
  older: { zh: "更早",     en: "Older" },
};

/** 任務卡面：用過次數前幾名直接擺成 chip，其餘收進下拉。 */
const TOP_TASKS = 3;
const PAGE_SIZE = 24;

const FILTER_KEYS = ["platform", "stage", "task", "product", "period", "q", "sort"] as const;

function formatRelative(dateStr: string | undefined, lang: Lang): string {
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

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const en = lang === "en";
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;

  const [params, setParams] = useSearchParams();
  const platform = params.get("platform");
  const stage = params.get("stage") as Stage | null;
  const taskId = params.get("task");
  const productId = Number(params.get("product")) || null;
  const period = params.get("period") as Period | null;
  const sort = params.get("sort") === "old" ? "old" : "new";
  const q = params.get("q") ?? "";

  // 搜尋框打字不要每個字都改網址＋打 API；停 300ms 再寫回。
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => { setSearchDraft(q); }, [q]);
  useEffect(() => {
    if (searchDraft.trim() === q) return;
    const t = setTimeout(() => setParam("q", searchDraft.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // 只有在有「生成中」的卡時才輪詢，背景收尾完成就會自動換成草稿。
  const [polling, setPolling] = useState(false);

  const query = trpc.mission.listProjects.useInfiniteQuery(
    {
      brandId,
      platform: platform || null,
      stage: stage || null,
      taskId: taskId || null,
      productId,
      period: period || null,
      q: q || null,
      sort,
      limit: PAGE_SIZE,
    },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchOnWindowFocus: true,
      refetchInterval: polling ? 8_000 : false,
    },
  );

  const pages = query.data?.pages ?? [];
  const items = useMemo(() => pages.flatMap((p) => p.items as ProjectRow[]), [pages]);
  const total = pages[0]?.total ?? 0;
  const facets = pages[0]?.facets;

  useEffect(() => {
    setPolling(items.some((m) => m.stage === "generating"));
  }, [items]);

  function setParam(key: (typeof FILTER_KEYS)[number], value: string | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  const toggle = (key: (typeof FILTER_KEYS)[number], value: string) =>
    setParam(key, params.get(key) === value ? null : value);

  const anyFilter = FILTER_KEYS.some((k) => k !== "sort" && params.get(k));
  const clearFilters = () => {
    setSearchDraft("");
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      FILTER_KEYS.forEach((k) => next.delete(k));
      return next;
    }, { replace: true });
  };

  const taskFacets = facets?.task ?? [];
  const topTasks = taskFacets.slice(0, TOP_TASKS);
  const moreTasks = taskFacets.slice(TOP_TASKS);
  // 選中的卡在「更多」裡時，下拉要顯示它；選中的卡被其他條件篩到 0 時仍保留選取。
  const selectedInMore = !!taskId && !topTasks.some((t) => t.key === taskId);

  const goToMission = (m: ProjectRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.missionId}`);
    else navigate(`/m/${m.missionId}`);
  };

  const isInitialLoading = query.isLoading;
  const hasAnyWork = total > 0 || anyFilter;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <div className="relative pt-10 pb-5 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          <h1
            className="font-semibold tracking-tight leading-none mb-5"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)", color: "#171717" }}
          >
            {en ? "Projects" : "專案"}
          </h1>
          <div className="w-full" style={{ maxWidth: 720 }}>
            <div className="flex items-center gap-3 px-5 bg-white rounded-[20px] border border-default-100 shadow-md" style={{ height: 56 }}>
              <SearchIcon size={18} className="text-default-400 shrink-0" />
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={en ? "Search titles, task cards, products…" : "搜尋標題 / 任務卡 / 產品…"}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {searchDraft && (
                <button onClick={() => setSearchDraft("")} className="text-default-400 hover:text-default-700 text-sm shrink-0">
                  {en ? "Clear" : "清除"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Filters ──────────────────────────────────────────────── */}
      {facets && hasAnyWork && (
        <div className="max-w-[1100px] mx-auto px-6 mb-6 flex flex-col gap-2.5">
          <FacetRow label={en ? "Channel" : "平台"}>
            {facets.platform.map((p) => {
              const meta = PLATFORM_META[p.key] ?? PLATFORM_META.other!;
              return (
                <FacetChip
                  key={p.key}
                  active={platform === p.key}
                  onClick={() => toggle("platform", p.key)}
                  text={`${en ? meta.en : meta.zh} · ${p.count}`}
                  icon={meta.icon}
                />
              );
            })}
          </FacetRow>

          <FacetRow label={en ? "Status" : "進度"}>
            {facets.stage.map((s) => (
              <FacetChip
                key={s.key}
                active={stage === s.key}
                onClick={() => toggle("stage", s.key)}
                text={`${en ? STAGE_LABEL[s.key as Stage].en : STAGE_LABEL[s.key as Stage].zh} · ${s.count}`}
                danger={s.key === "failed"}
              />
            ))}
          </FacetRow>

          {taskFacets.length > 0 && (
            <FacetRow label={en ? "Task card" : "任務卡"}>
              {topTasks.map((t) => (
                <FacetChip
                  key={t.key}
                  active={taskId === t.key}
                  onClick={() => toggle("task", t.key)}
                  text={`${shorten(t.label)} · ${t.count}`}
                  title={t.label}
                />
              ))}
              {(moreTasks.length > 0 || selectedInMore) && (
                <FacetSelect
                  active={selectedInMore}
                  value={selectedInMore ? taskId! : ""}
                  onChange={(v) => setParam("task", v || null)}
                  placeholder={en ? `More (${moreTasks.length})` : `更多（${moreTasks.length}）`}
                  options={[
                    ...(selectedInMore && !moreTasks.some((t) => t.key === taskId)
                      ? [{ value: taskId!, label: en ? "Selected card · 0" : "已選的任務卡 · 0" }]
                      : []),
                    ...moreTasks.map((t) => ({ value: t.key, label: `${t.label} · ${t.count}` })),
                  ]}
                />
              )}
            </FacetRow>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {facets.product.length > 0 && (
              <FacetSelect
                active={!!productId}
                value={productId ? String(productId) : ""}
                onChange={(v) => setParam("product", v || null)}
                placeholder={en ? "All products" : "全部產品"}
                options={facets.product.map((p) => ({ value: String(p.id), label: `${p.name} · ${p.count}` }))}
              />
            )}
            <FacetSelect
              active={!!period}
              value={period ?? ""}
              onChange={(v) => setParam("period", v || null)}
              placeholder={en ? "Any time" : "全部時間"}
              options={facets.period.map((p) => ({
                value: p.key,
                label: `${en ? PERIOD_LABEL[p.key as Period].en : PERIOD_LABEL[p.key as Period].zh} · ${p.count}`,
              }))}
            />
            <FacetSelect
              active={false}
              value={sort}
              onChange={(v) => setParam("sort", v === "old" ? "old" : null)}
              options={[
                { value: "new", label: en ? "Newest first" : "新到舊" },
                { value: "old", label: en ? "Oldest first" : "舊到新" },
              ]}
            />
            {anyFilter && (
              <button onClick={clearFilters} className="text-xs text-default-500 hover:text-default-800 hover:underline ml-1">
                {en ? "Clear filters" : "清除篩選"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Grid ─────────────────────────────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 pb-24">
        {!isInitialLoading && hasAnyWork && (
          <div className="text-[12px] text-default-500 mb-3">
            {en ? `${total} items` : `共 ${total} 個`}
          </div>
        )}

        {isInitialLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="rounded-xl" style={{ height: 140 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          anyFilter ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FolderIcon size={56} className="text-default-300 mb-4" strokeWidth={1.2} />
              <p className="text-default-700 font-medium mb-4">
                {en ? "No projects match these filters" : "沒有符合條件的專案"}
              </p>
              <button onClick={clearFilters} className="text-xs text-zinc-600 hover:underline">
                {en ? "Clear filters" : "清除篩選"}
              </button>
            </div>
          ) : (
            <IllustratedEmpty
              kind="projects"
              title={en ? "Nothing on the wall yet" : "作品牆還沒掛上任何一張"}
              action={{ label: en ? "Open your first task card" : "去開第一張任務卡", onPress: () => navigate("/tasks/fb") }}
            />
          )
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {items.map((m) => (
                <ProjectCard
                  key={m.id}
                  mission={m}
                  showBrand={brandId == null}
                  onClick={() => goToMission(m)}
                  lang={lang}
                />
              ))}
            </div>
            {query.hasNextPage && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  className="px-5 py-2 rounded-full text-xs font-medium border border-default-200 bg-white text-default-700 hover:border-default-400 disabled:opacity-50"
                >
                  {query.isFetchingNextPage
                    ? (en ? "Loading…" : "載入中…")
                    : (en ? `Load more (${total - items.length} left)` : `載入更多（還有 ${total - items.length} 個）`)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function shorten(s: string, n = 16): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ─────────────────────── ProjectCard ─────────────────────── */
function ProjectCard({ mission, showBrand, onClick, lang }: { mission: ProjectRow; showBrand: boolean; onClick: () => void; lang: Lang }) {
  const en = lang === "en";
  const [menuOpen, setMenuOpen] = useState(false);
  // 縮圖 404 退回平台色塊，不要留一個空灰框。
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => { setThumbFailed(false); }, [mission.thumbnailUrl]);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>(mission.title ?? "");
  // 改名送出到伺服器回來之間先顯示新名字。
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  useEffect(() => {
    if (optimisticTitle !== null && mission.title === optimisticTitle) setOptimisticTitle(null);
  }, [mission.title, optimisticTitle]);

  const utils = trpc.useUtils();
  const refresh = () => utils.mission.listProjects.invalidate();
  const renameMut = trpc.output.updateTitle.useMutation({
    onSuccess: refresh,
    onError: (e) => {
      setOptimisticTitle(null);
      showToastGlobal((en ? "Rename failed: " : "重新命名失敗：") + e.message);
    },
  });
  // 建立複本是 mission 層級（missions.id）；刪除是這一次執行（mission_outputs.id）。
  const duplicateMut = trpc.mission.duplicate.useMutation({
    onSuccess: () => { refresh(); showToastGlobal(en ? "Duplicate created" : "已建立複本", "success"); },
    onError: (e) => showToastGlobal((en ? "Duplicate failed: " : "建立複本失敗：") + e.message),
  });
  const deleteMut = trpc.output.delete.useMutation({
    onSuccess: () => { refresh(); showToastGlobal(en ? "Deleted" : "已刪除", "success"); },
    onError: (e) => showToastGlobal((en ? "Delete failed: " : "刪除失敗：") + e.message),
  });

  const displayTitle = optimisticTitle ?? mission.title ?? "";
  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDraftTitle(displayTitle);
    setEditing(true);
  };
  const commitEdit = () => {
    const next = draftTitle.trim();
    setEditing(false);
    if (!next || next === displayTitle.trim()) return;
    setOptimisticTitle(next);
    renameMut.mutate({ id: mission.id, title: next.slice(0, 120) });
  };
  const cancelEdit = (e?: React.KeyboardEvent) => {
    e?.stopPropagation();
    setEditing(false);
    setDraftTitle(displayTitle);
  };

  const meta = PLATFORM_META[mission.platform] ?? PLATFORM_META.other!;
  const stageText = en ? STAGE_LABEL[mission.stage].en : STAGE_LABEL[mission.stage].zh;
  const failed = mission.stage === "failed";
  const subline = [mission.taskLabel, mission.productName, showBrand ? mission.brandName : null]
    .filter(Boolean).join(" · ");

  return (
    <div
      className="group relative rounded-xl bg-white border border-default-100 hover:shadow-md hover:border-default-300 transition overflow-hidden cursor-pointer"
      onClick={editing ? undefined : onClick}
    >
      <div
        className="relative aspect-[4/3] flex items-center justify-center overflow-hidden"
        style={{ background: mission.thumbnailUrl && !thumbFailed ? "#F4F4F5" : "#18181b14" }}
      >
        {mission.thumbnailUrl && !thumbFailed ? (
          <img
            src={mission.thumbnailUrl}
            alt={mission.title ?? "project"}
            className="w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <FontAwesomeIcon icon={meta.icon} style={{ color: "#18181b", fontSize: 36, opacity: 0.55 }} />
        )}
        {/* 平台＋進度：一眼看出是哪個通路、做到哪裡。只有失敗用狀態色。 */}
        <span className="absolute top-2 left-2 flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full bg-white/95 shadow-sm text-default-800">
          <FontAwesomeIcon icon={meta.icon} className="text-[12px]" />
          {en ? meta.en : meta.zh}
          <span className="text-default-300">·</span>
          <span className={failed ? "text-danger" : "text-default-600"}>{stageText}</span>
        </span>
      </div>

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
            placeholder={en ? "Untitled" : "未命名"}
            className="w-full text-sm font-medium text-default-900 mb-0.5 px-1 py-0.5 -mx-1 -my-0.5 rounded border-2 border-primary-400 bg-white focus:outline-none focus:border-primary-600"
          />
        ) : (
          <div className="relative flex items-start gap-1 mb-0.5">
            <h3
              className="text-sm font-medium text-default-900 line-clamp-1 flex-1 min-w-0"
              title={displayTitle}
              onDoubleClick={startEditing}
            >
              {displayTitle || (en ? "(Untitled)" : "（未命名）")}
            </h3>
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(); }}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition w-5 h-5 rounded hover:bg-default-100 flex items-center justify-center text-default-400 hover:text-default-700"
              title={en ? "Rename" : "重新命名"}
              aria-label={en ? "Rename" : "重新命名"}
            >
              <EditIcon size={11} />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-[12px] text-default-500">
          <span className="truncate" title={subline}>{subline}</span>
          <span className="shrink-0">{formatRelative(mission.createdAt, lang)}</span>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/0 group-hover:bg-white shadow-sm hover:shadow flex items-center justify-center text-default-500 transition opacity-0 group-hover:opacity-100"
        title={en ? "Actions" : "動作選單"}
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
              <InfoIcon size={11} /> {en ? "View details" : "查看詳細"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); startEditing(); }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2"
            >
              <EditIcon size={11} /> {en ? "Rename" : "重新命名"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); duplicateMut.mutate({ id: mission.missionId }); }}
              disabled={duplicateMut.isPending}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-default-50 flex items-center gap-2 text-default-600 disabled:opacity-50"
            >
              <CopyIcon size={11} /> {en ? "Duplicate" : "建立複本"}
            </button>
            <div className="border-t border-default-100 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation(); setMenuOpen(false);
                const name = displayTitle.slice(0, 40);
                if (!window.confirm(
                  en
                    ? `Delete "${name}"? Only this run is removed — other runs of the same task card stay.`
                    : `確定刪除「${name}」？只會刪除這一次的產出，同一張任務卡的其他次執行不受影響。`,
                )) return;
                deleteMut.mutate({ id: mission.id });
              }}
              disabled={deleteMut.isPending}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-danger-50 flex items-center gap-2 text-danger disabled:opacity-50"
            >
              <DeleteIcon size={11} /> {en ? "Delete" : "刪除"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Filter primitives ─────────────────────────────────────────────────── */
function FacetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] font-semibold text-default-400 tracking-wider shrink-0 w-12">
        {label}
      </span>
      {children}
    </div>
  );
}

const chipClass = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
    active
      ? "bg-default-900 text-white border-default-900"
      : "bg-white text-default-700 border-default-200 hover:border-default-400"
  }`;

function FacetChip({
  active, onClick, text, title, icon, danger,
}: { active: boolean; onClick: () => void; text: string; title?: string; icon?: any; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${chipClass(active)} ${danger && !active ? "text-danger" : ""}`}
    >
      {icon && <FontAwesomeIcon icon={icon} className="text-[12px]" />}
      {text}
    </button>
  );
}

function FacetSelect({
  active, value, onChange, options, placeholder,
}: {
  active: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${chipClass(active)} appearance-none pr-7 cursor-pointer bg-no-repeat`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${active ? "%23fff" : "%2371717a"}' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundPosition: "right 10px center",
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
