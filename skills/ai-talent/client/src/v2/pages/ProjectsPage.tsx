/**
 * ProjectsPage — Canva /projects full pixel-faithful rebuild (v3)
 *
 * Sections:
 *   LEFT RAIL  : upgrade CTA · invite · 4 sub-nav · starred · brand · trash
 *   MAIN       : gradient hero · sort+view+add controls · 最近項目 · ▼資料夾 · >設計 · >影像 · >影片
 */
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMissionModal from "../components/CreateMissionModal";
import ProjectSyncModal, { type SyncSource } from "../components/projects/ProjectSyncModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faChevronRight, faChevronLeft, faPlus,
  faArrowDownWideShort, faArrowUpWideShort,
  faTableCells, faList, faStar, faEllipsis, faBookmark,
  faCloudArrowUp, faGlobe, faWandMagicSparkles, faFolderOpen, faFolder,
  faRocket, faShareNodes, faCloudArrowDown,
  faBolt, faCalendarDays, faLock,
  faArrowUpRightFromSquare, faCircleInfo, faCopy, faFolderTree,
  faDownload, faWifi, faShareAlt, faLink, faTrash,
  faFileImport, faFolderPlus, faImage, faVideo, faGraduationCap,
  faCrown,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faYoutube, faGoogleDrive, faMicrosoft, faDropbox,
} from "@fortawesome/free-brands-svg-icons";

/* ── Shared action helpers ── */
function showToast(msg: string, variant: "default" | "success" | "warn" = "default") {
  const el = document.createElement("div");
  el.textContent = msg;
  const bg = variant === "success" ? "#059669" : variant === "warn" ? "#D97706" : "#1A1A18";
  el.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
    background:${bg};color:white;padding:10px 22px;border-radius:10px;
    font-size:13px;font-weight:500;z-index:99999;white-space:nowrap;
    box-shadow:0 4px 16px rgba(0,0,0,0.22);font-family:Inter,sans-serif;
    pointer-events:none;opacity:1;transition:opacity 0.3s;`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 2000);
}
function getMissionUrl(m: { id: number; brandId?: number | null; workspace?: string | null }) {
  return m.brandId ? `/b/${m.brandId}/${m.workspace || "_"}/m/${m.id}` : `/m/${m.id}`;
}

/* ── Types ── */
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
  thumbnailUrl?: string | null;
  squadMockupImages?: string[];
}
type SubNavKey = "all" | "mine" | "shared" | "offline";

/* ── Navigation ── */
const SUB_NAV: Array<{ id: SubNavKey; label: string; icon: any }> = [
  { id: "all",     label: "所有專案",   icon: faFolderOpen     },
  { id: "mine",    label: "你的專案",   icon: faRocket         },
  { id: "shared",  label: "與你分享",   icon: faShareNodes     },
  { id: "offline", label: "可離線使用", icon: faCloudArrowDown },
];

/* ── Add-item menu
 *  Canva label → SoWork action mapping:
 *  新增資料夾  → navigate /brands (品牌即資料夾)
 *  新課程      → CreateMissionModal workspace="content" (長內容任務)
 *  設計        → CreateMissionModal workspace="all" (主要任務建立入口)
 *  上傳檔案    → ProjectSyncModal (sync / upload)
 *  上傳資料夾  → ProjectSyncModal (sync folder)
 *  匯入        → ProjectSyncModal social/import sources
 * ── */
const ADD_ITEM_OPTIONS = [
  { key: "folder",        icon: faFolderPlus,    label: "新增品牌資料夾", dividerAfter: false },
  { key: "course",        icon: faGraduationCap, label: "長內容任務",     dividerAfter: false },
  { key: "design",        icon: faTableCells,    label: "新任務",         dividerAfter: true  },
  { key: "upload-file",   icon: faCloudArrowUp,  label: "上傳檔案",       dividerAfter: false },
  { key: "upload-folder", icon: faFolder,        label: "上傳資料夾",     dividerAfter: false },
  { key: "import",        icon: faFileImport,    label: "匯入社群素材",   dividerAfter: false, arrow: true },
] as const;

/* ── Card context menu ── */
const CARD_MENU_ITEMS = [
  { key: "run-once",  icon: faBolt,                   label: "立即自主執行",       accent: "#F97316", dividerAfter: false },
  { key: "run-sched", icon: faCalendarDays,            label: "排程自主執行",       accent: "#F97316", dividerAfter: true  },
  { key: "open-tab",  icon: faArrowUpRightFromSquare,  label: "在新索引標籤中開啟", accent: null,      dividerAfter: false },
  { key: "info",      icon: faCircleInfo,              label: "詳細資訊",           accent: null,      dividerAfter: false },
  { key: "duplicate", icon: faCopy,                    label: "建立複本",           accent: null,      dividerAfter: false },
  { key: "star",      icon: faStar,                    label: "加入星號",           accent: null,      dividerAfter: false },
  { key: "move",      icon: faFolderTree,              label: "移動",               accent: null,      dividerAfter: false },
  { key: "download",  icon: faDownload,                label: "下載",               accent: null,      dividerAfter: false },
  { key: "offline",   icon: faWifi,                    label: "設為可離線存取",     accent: null,      badge: "新功能", dividerAfter: false },
  { key: "share",     icon: faShareAlt,                label: "分享",               accent: null,      dividerAfter: false },
  { key: "copy-link", icon: faLink,                    label: "複製連結",           accent: null,      dividerAfter: true  },
  { key: "trash",     icon: faTrash,                   label: "移至垃圾桶",         accent: "#EF4444", dividerAfter: false },
] as const;

const SYNC_SOURCES: Array<{ id: SyncSource; label: string; hint: string; icon: any }> = [
  { id: "facebook",     label: "Facebook 粉絲團", hint: "抓貼文、圖片、影片", icon: faFacebook    },
  { id: "instagram",    label: "Instagram 帳號",  hint: "抓圖文、限動",       icon: faInstagram   },
  { id: "youtube",      label: "YouTube 頻道",    hint: "抓影片清單、縮圖",   icon: faYoutube     },
  { id: "website",      label: "官網 / 部落格",   hint: "抓品牌素材、文章",   icon: faGlobe       },
  { id: "google-drive", label: "Google Drive",    hint: "同步整個資料夾",     icon: faGoogleDrive },
  { id: "onedrive",     label: "OneDrive",        hint: "同步整個資料夾",     icon: faMicrosoft   },
  { id: "dropbox",      label: "Dropbox",         hint: "同步整個資料夾",     icon: faDropbox     },
];

/* ── Helpers ── */
function formatRelative(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)    return "剛剛";
  if (mins < 60)   return `${mins} 分鐘前編輯`;
  if (hours < 24)  return `${hours} 小時前編輯`;
  if (days === 1)  return "1 天前編輯";
  if (days < 30)   return `${days} 天前編輯`;
  return new Date(dateStr).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

function stringToColor(s: string): string {
  const palette = ["#6366F1","#EC4899","#F97316","#10B981","#3B82F6","#8B5CF6","#EF4444","#14B8A6"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE COMPONENT
══════════════════════════════════════════════════════════════════════ */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  /* Data */
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

  /* Sub-nav from URL (managed by SlidePanel) */
  const [searchParams]    = useSearchParams();
  const subNav            = (searchParams.get("sub") ?? "all") as SubNavKey;

  /* UI state */
  const [ownerFilter,     setOwnerFilter]     = useState<string>("all");
  const [typeFilter,      setTypeFilter]      = useState<string>("all");
  const [categoryFilter,  setCategoryFilter]  = useState<string>("all");
  const [dateFilter,      setDateFilter]      = useState<string>("all");
  const [sortMode,        setSortMode]        = useState<"recent" | "asc" | "desc">("recent");
  const [viewMode,        setViewMode]        = useState<"grid" | "list">("grid");
  const [ownerSearch,     setOwnerSearch]     = useState("");
  const [ownerOpen,       setOwnerOpen]       = useState(false);
  const [typeOpen,        setTypeOpen]        = useState(false);
  const [categoryOpen,    setCategoryOpen]    = useState(false);
  const [dateOpen,        setDateOpen]        = useState(false);
  const [sortOpen,        setSortOpen]        = useState(false);
  const [addOpen,         setAddOpen]         = useState(false);
  const [foldersOpen,     setFoldersOpen]     = useState(true);
  const [designsOpen,     setDesignsOpen]     = useState(false);
  const [imagesOpen,      setImagesOpen]      = useState(false);
  const [videosOpen,      setVideosOpen]      = useState(false);
  const [missionModalOpen,      setMissionModalOpen]      = useState(false);
  const [missionModalWorkspace, setMissionModalWorkspace] = useState("all");
  const [syncSource,      setSyncSource]      = useState<SyncSource | null>(null);

  /* Option lists */
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((m) => { if (m.brandName && m.brandId != null) map.set(String(m.brandId), m.brandName); });
    return [
      { value: "all",    label: "任何擁有者" },
      { value: "mine",   label: "我的專案"   },
      { value: "shared", label: "與我分享"   },
      ...Array.from(map.entries()).map(([v, l]) => ({ value: v, label: l })),
    ];
  }, [rows]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { if (m.workspace) set.add(m.workspace.toLowerCase()); });
    return [
      { value: "all", label: "任何類型" },
      ...Array.from(set).sort().map((v) => ({ value: v, label: v })),
    ];
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { const l = (m.squadLayer ?? "").toString().slice(0, 2); if (l) set.add(l); });
    return [
      { value: "all", label: "任何類別" },
      ...Array.from(set).sort().map(v => ({ value: v, label: `${v} 策略層` })),
    ];
  }, [rows]);

  const dateOptions = [
    { value: "all",   label: "任何日期" },
    { value: "today", label: "今天"     },
    { value: "week",  label: "本週"     },
    { value: "month", label: "本月"     },
    { value: "year",  label: "今年"     },
  ];

  const sortOptions = [
    { value: "recent", label: "最近使用" },
    { value: "asc",    label: "名稱 A → Z" },
    { value: "desc",   label: "名稱 Z → A" },
  ];

  /* Filtered + sorted missions */
  const filtered = useMemo(() => {
    let r = rows;
    if (ownerFilter !== "all" && ownerFilter !== "mine" && ownerFilter !== "shared")
      r = r.filter((m) => String(m.brandId) === ownerFilter);
    if (typeFilter !== "all")
      r = r.filter((m) => (m.workspace ?? "").toLowerCase() === typeFilter);
    if (categoryFilter !== "all")
      r = r.filter((m) => (m.squadLayer ?? "").toString().slice(0, 2) === categoryFilter);
    if (dateFilter !== "all") {
      const ms: Record<string, number> = { today: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
      const cutoff = ms[dateFilter];
      if (cutoff) r = r.filter(m => m.updatedAt && (Date.now() - new Date(m.updatedAt).getTime()) <= cutoff);
    }
    return [...r].sort((a, b) => {
      if (sortMode === "asc")  return (a.title ?? "").localeCompare(b.title ?? "", "zh-TW");
      if (sortMode === "desc") return (b.title ?? "").localeCompare(a.title ?? "", "zh-TW");
      return (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
    });
  }, [rows, ownerFilter, typeFilter, categoryFilter, dateFilter, sortMode]);

  /* Grouped missions by workspace type */
  const designMissions = useMemo(() => filtered.filter(m => !["image","video"].includes((m.workspace ?? "").toLowerCase())), [filtered]);
  const imageMissions  = useMemo(() => filtered.filter(m => (m.workspace ?? "").toLowerCase() === "image"),  [filtered]);
  const videoMissions  = useMemo(() => filtered.filter(m => (m.workspace ?? "").toLowerCase() === "video"),  [filtered]);
  const recent         = useMemo(() => filtered.slice(0, 12), [filtered]);

  /* Brand-based "folders" */
  const brandFolders = useMemo(() =>
    brands.slice(0, 12).map((b: any) => ({
      id:    b.id,
      name:  b.name,
      color: stringToColor(b.name ?? ""),
      count: rows.filter(m => m.brandId === b.id).length,
    })),
    [brands, rows]
  );

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  /* Labels */
  const navLabel      = SUB_NAV.find(n => n.id === subNav)?.label ?? "所有專案";
  const ownerLabel    = ownerFilter    === "all" ? "擁有者"     : (ownerOptions.find(o => o.value === ownerFilter)?.label    ?? "擁有者");
  const typeLabel     = typeFilter     === "all" ? "類型"       : (typeOptions.find(o => o.value === typeFilter)?.label      ?? "類型");
  const categoryLabel = categoryFilter === "all" ? "類別"       : (categoryOptions.find(o => o.value === categoryFilter)?.label ?? "類別");
  const dateLabel     = dateFilter     === "all" ? "已修改日期" : (dateOptions.find(o => o.value === dateFilter)?.label      ?? "已修改日期");
  const sortLabel     = sortOptions.find(o => o.value === sortMode)?.label ?? "最近使用";

  const closeAllPills = () => { setOwnerOpen(false); setTypeOpen(false); setCategoryOpen(false); setDateOpen(false); };

  return (
    <div style={{
      height: "100%", minHeight: "100vh",
      background: "#FAFAFA", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>

      {/* ════════════════════ MAIN COLUMN ════════════════════ */}
      <main style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "100vh", overflow: "hidden" }}>

        {/* Hero zone */}
        <div style={{
          flexShrink: 0,
          background: "linear-gradient(160deg, #EDE9FE 0%, #E0E7FF 40%, #F0F9FF 100%)",
          padding: "36px 40px 24px",
          textAlign: "center",
        }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: "#1A1A18", margin: "0 0 20px", letterSpacing: "-0.03em" }}>
            {navLabel}
          </h1>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "white", borderRadius: 28,
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            padding: "0 18px", height: 48, maxWidth: 680, margin: "0 auto",
          }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#9CA3AF", fontSize: 15, flexShrink: 0 }} />
            <input
              placeholder="搜尋所有內容"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#1A1A18", background: "transparent" }}
            />
          </div>
          {/* Filter pills */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <PillDropdown label={typeLabel} active={typeFilter !== "all"} open={typeOpen}
              onToggle={() => { const wasOpen = typeOpen; closeAllPills(); setTypeOpen(!wasOpen); }}
              onClose={() => setTypeOpen(false)}>
              <div style={{ padding: "4px 4px 8px" }}>
                {typeOptions.map(o => (
                  <DropdownRow key={o.value} label={o.label} active={typeFilter === o.value}
                    onClick={() => { setTypeFilter(o.value); setTypeOpen(false); }} />
                ))}
              </div>
            </PillDropdown>

            <PillDropdown label={categoryLabel} active={categoryFilter !== "all"} open={categoryOpen}
              onToggle={() => { const was = categoryOpen; closeAllPills(); setCategoryOpen(!was); }}
              onClose={() => setCategoryOpen(false)}>
              <div style={{ padding: "4px 4px 8px" }}>
                {categoryOptions.map(o => (
                  <DropdownRow key={o.value} label={o.label} active={categoryFilter === o.value}
                    onClick={() => { setCategoryFilter(o.value); setCategoryOpen(false); }} />
                ))}
              </div>
            </PillDropdown>

            <PillDropdown label={ownerLabel} active={ownerFilter !== "all"} open={ownerOpen}
              onToggle={() => { const was = ownerOpen; closeAllPills(); setOwnerOpen(!was); }}
              onClose={() => setOwnerOpen(false)}>
              <div style={{ padding: "8px 12px 4px" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  border: "1px solid #E4E3E1", borderRadius: 8,
                  padding: "6px 10px", background: "#F9F8F6",
                }}>
                  <FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#9CA3AF", fontSize: 11 }} />
                  <input
                    value={ownerSearch}
                    onChange={e => setOwnerSearch(e.target.value)}
                    placeholder="搜尋擁有者"
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, flex: 1 }}
                  />
                </div>
              </div>
              <div style={{ padding: "4px 4px 8px" }}>
                {ownerOptions.filter(o => !ownerSearch || o.label.toLowerCase().includes(ownerSearch.toLowerCase())).map(o => (
                  <DropdownRow key={o.value} label={o.label} active={ownerFilter === o.value}
                    onClick={() => { setOwnerFilter(o.value); setOwnerOpen(false); setOwnerSearch(""); }} />
                ))}
              </div>
            </PillDropdown>

            <PillDropdown label={dateLabel} active={dateFilter !== "all"} open={dateOpen}
              onToggle={() => { const was = dateOpen; closeAllPills(); setDateOpen(!was); }}
              onClose={() => setDateOpen(false)}>
              <div style={{ padding: "4px 4px 8px" }}>
                {dateOptions.map(o => (
                  <DropdownRow key={o.value} label={o.label} active={dateFilter === o.value}
                    onClick={() => { setDateFilter(o.value); setDateOpen(false); }} />
                ))}
              </div>
            </PillDropdown>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", background: "white" }}>
          <div style={{ padding: "0 40px 60px" }}>

            {/* Controls bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "16px 0 8px" }}>
              {/* Sort dropdown */}
              <SortDropdown
                open={sortOpen}
                onToggle={() => setSortOpen(v => !v)}
                onClose={() => setSortOpen(false)}
                value={sortMode}
                onChange={(v) => { setSortMode(v as any); setSortOpen(false); }}
                options={sortOptions}
              />
              {/* View toggle */}
              <button
                onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}
                title="切換檢視"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
                  background: "white", cursor: "pointer", color: "#6B7280",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#F9F8F6"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                <FontAwesomeIcon icon={viewMode === "grid" ? faList : faTableCells} />
              </button>
              {/* + Add button */}
              <AddItemDropdown
                open={addOpen}
                onToggle={() => setAddOpen(v => !v)}
                onClose={() => setAddOpen(false)}
                onNewMission={(ws) => { setAddOpen(false); setMissionModalWorkspace(ws); setMissionModalOpen(true); }}
                onNewFolder={() => { setAddOpen(false); navigate("/brands"); }}
                onUploadFile={() => { setAddOpen(false); setSyncSource("google-drive"); }}
                onUploadFolder={() => { setAddOpen(false); setSyncSource("google-drive"); }}
                onImport={() => { setAddOpen(false); setSyncSource("facebook"); }}
              />
            </div>

            {/* Loading skeleton */}
            {isLoading && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, paddingTop: 8 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 8, overflow: "hidden" }}>
                    <Skeleton style={{ width: "100%", aspectRatio: "4/3", display: "block" }} />
                    <div style={{ padding: "8px 2px" }}>
                      <Skeleton style={{ height: 12, width: "80%", borderRadius: 6, marginBottom: 6 }} />
                      <Skeleton style={{ height: 10, width: "50%", borderRadius: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && filtered.length === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "80px 24px", textAlign: "center", gap: 12,
                border: "2px dashed #E4E3E1", borderRadius: 12, marginTop: 8,
              }}>
                <FontAwesomeIcon icon={faFolderOpen} style={{ fontSize: 40, color: "#C8C7C3" }} />
                <p style={{ fontSize: 16, fontWeight: 600, color: "#1A1A18", margin: 0 }}>還沒有專案</p>
                <p style={{ fontSize: 14, color: "#6B6A66", margin: 0 }}>從首頁選個任務範本開始。</p>
                <button onClick={() => { setMissionModalWorkspace("all"); setMissionModalOpen(true); }} style={{
                  marginTop: 8, padding: "9px 20px", borderRadius: 20,
                  background: "#1A1A18", color: "white", border: "none",
                  cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}>建立第一個專案</button>
              </div>
            )}

            {/* ── 最近的項目 ── */}
            {!isLoading && recent.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A18", margin: "0 0 14px" }}>最近的項目</p>
                <div style={{
                  overflowX: "auto", scrollbarWidth: "none",
                  display: "flex", gap: 12, paddingBottom: 4,
                }}>
                  {recent.map(m => (
                    <div key={m.id} style={{ width: 180, flexShrink: 0 }}>
                      <MissionCard mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} brands={brands} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── 資料夾 ── */}
            {!isLoading && (
              <section style={{ marginBottom: 28 }}>
                <SectionToggle
                  open={foldersOpen}
                  onToggle={() => setFoldersOpen(v => !v)}
                  label="資料夾"
                  count={brandFolders.length + 1}
                />
                {foldersOpen && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 2,
                  }}>
                    {/* Static upload folder */}
                    <FolderRow icon={faCloudArrowUp} label="上傳" count={null} color="#9CA3AF"
                      onClick={() => setSyncSource("google-drive")} />
                    {brandFolders.map(f => (
                      <FolderRow key={f.id} label={f.name} count={f.count} color={f.color}
                        onClick={() => setOwnerFilter(String(f.id))} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── 設計 ── */}
            {!isLoading && (
              <section style={{ marginBottom: 8 }}>
                <SectionToggle
                  open={designsOpen}
                  onToggle={() => setDesignsOpen(v => !v)}
                  label="設計"
                  count={designMissions.length}
                />
                {designsOpen && designMissions.length > 0 && (
                  viewMode === "grid" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, paddingTop: 4 }}>
                      {designMissions.map(m => (
                        <MissionCard key={m.id} mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} brands={brands} />
                      ))}
                    </div>
                  ) : (
                    <MissionListTable missions={designMissions} onOpen={goToMission} />
                  )
                )}
                {designsOpen && designMissions.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9CA3AF", padding: "8px 0" }}>尚無設計</p>
                )}
              </section>
            )}

            {/* ── 影像 ── */}
            {!isLoading && (
              <section style={{ marginBottom: 8 }}>
                <SectionToggle
                  open={imagesOpen}
                  onToggle={() => setImagesOpen(v => !v)}
                  label="影像"
                  count={imageMissions.length}
                />
                {imagesOpen && imageMissions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, paddingTop: 4 }}>
                    {imageMissions.map(m => (
                      <MissionCard key={m.id} mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} brands={brands} />
                    ))}
                  </div>
                )}
                {imagesOpen && imageMissions.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9CA3AF", padding: "8px 0" }}>尚無影像</p>
                )}
              </section>
            )}

            {/* ── 影片 ── */}
            {!isLoading && (
              <section style={{ marginBottom: 8 }}>
                <SectionToggle
                  open={videosOpen}
                  onToggle={() => setVideosOpen(v => !v)}
                  label="影片"
                  count={videoMissions.length}
                />
                {videosOpen && videoMissions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, paddingTop: 4 }}>
                    {videoMissions.map(m => (
                      <MissionCard key={m.id} mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} brands={brands} />
                    ))}
                  </div>
                )}
                {videosOpen && videoMissions.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9CA3AF", padding: "8px 0" }}>尚無影片</p>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <ProjectSyncModal
        open={syncSource !== null}
        source={syncSource}
        brandId={brandId}
        onClose={() => setSyncSource(null)}
      />
      <CreateMissionModal
        open={missionModalOpen}
        initialWorkspace={missionModalWorkspace}
        onClose={() => setMissionModalOpen(false)}
      />
    </div>
  );
}

/* ──────────────────────── SectionToggle ───────────────────────────── */
function SectionToggle({ open, onToggle, label, count }: {
  open: boolean; onToggle: () => void; label: string; count: number;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "none", border: "none", cursor: "pointer",
        padding: "6px 0 14px", width: "100%", textAlign: "left",
      }}
    >
      <FontAwesomeIcon
        icon={open ? faChevronDown : faChevronRight}
        style={{
          fontSize: 11, color: "#6B7280", width: 12, flexShrink: 0,
          transition: "transform 0.15s",
        }}
      />
      <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A18" }}>{label}</span>
      {count > 0 && (
        <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>{count} 個</span>
      )}
    </button>
  );
}

/* ──────────────────────── AddItemDropdown ──────────────────────────── */
function AddItemDropdown({ open, onToggle, onClose, onNewMission, onNewFolder, onUploadFile, onUploadFolder, onImport }: {
  open: boolean; onToggle: () => void; onClose: () => void;
  onNewMission: (ws: string) => void; onNewFolder: () => void;
  onUploadFile: () => void; onUploadFolder: () => void; onImport: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  const handleClick = (key: string) => {
    if (key === "design") { onNewMission("all"); }
    else if (key === "course") { onNewMission("content"); }
    else if (key === "folder") { onNewFolder(); }
    else if (key === "upload-file") { onUploadFile(); }
    else if (key === "upload-folder") { onUploadFolder(); }
    else if (key === "import") { onImport(); }
    else onClose();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
          background: open ? "#F0F0EE" : "white", cursor: "pointer", color: "#1A1A18",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          transition: "background 0.1s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#F5F4F2"}
        onMouseLeave={e => { e.currentTarget.style.background = open ? "#F0F0EE" : "white"; }}
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
          background: "white", borderRadius: 12, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.07)", padding: "8px 0",
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", padding: "4px 14px 6px", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            新增項目
          </p>
          {ADD_ITEM_OPTIONS.map(opt => (
            <React.Fragment key={opt.key}>
              <button
                onClick={() => handleClick(opt.key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", border: "none", background: "transparent",
                  textAlign: "left", cursor: "pointer", fontSize: 13.5, color: "#1A1A18",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <FontAwesomeIcon icon={opt.icon} style={{ width: 16, color: "#6B7280" }} />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {"arrow" in opt && opt.arrow && (
                  <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 10, color: "#9CA3AF" }} />
                )}
              </button>
              {opt.dividerAfter && <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── SortDropdown ─────────────────────────────── */
function SortDropdown({ open, onToggle, onClose, value, onChange, options }: {
  open: boolean; onToggle: () => void; onClose: () => void;
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        title="排序"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
          background: "white", cursor: "pointer", color: "#6B7280",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          transition: "background 0.1s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#F5F4F2"}
        onMouseLeave={e => e.currentTarget.style.background = "white"}
      >
        <FontAwesomeIcon icon={value === "desc" ? faArrowUpWideShort : faArrowDownWideShort} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
          background: "white", borderRadius: 12, minWidth: 180,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)", border: "1px solid rgba(0,0,0,0.07)",
          padding: "6px 0",
        }}>
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", border: "none",
                background: o.value === value ? "rgba(99,102,241,0.06)" : "transparent",
                textAlign: "left", cursor: "pointer", fontSize: 13.5,
                color: o.value === value ? "#4F46E5" : "#1A1A18",
                fontWeight: o.value === value ? 600 : 400,
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? "rgba(99,102,241,0.06)" : "transparent"; }}
            >
              {o.value === value && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4F46E5", flexShrink: 0 }} />}
              {o.value !== value && <div style={{ width: 6, flexShrink: 0 }} />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── FolderRow ─────────────────────────────────── */
function FolderRow({ icon, label, count, color, onClick }: {
  icon?: any; label: string; count: number | null; color: string; onClick?: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 8, cursor: "pointer",
        background: hov ? "#F5F4F2" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 40, height: 40, borderRadius: 6, flexShrink: 0,
        background: hov ? "#EEECE9" : "#F2F1EF",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s", overflow: "hidden",
        border: "1px solid #E9E8E6",
      }}>
        {icon ? (
          <FontAwesomeIcon icon={icon} style={{ fontSize: 16, color: "#9CA3AF" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%", background: color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "white",
          }}>
            {label.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1A1A18", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <FontAwesomeIcon icon={faLock} style={{ fontSize: 9, color: "#9CA3AF" }} />
          <span style={{ fontSize: 11.5, color: "#9CA3AF" }}>
            隱藏{count !== null ? `　· ${count} 個項目` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── MissionCard ──────────────────────────────── */
function MissionCard({ mission, onClick, onOpen, brands }: {
  mission: MissionRow; onClick: () => void; onOpen: () => void; brands: any[];
}) {
  const navigate  = useNavigate();
  const [hovered,  setHovered]  = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [starred,  setStarred]  = React.useState(false);
  const [imgIdx,   setImgIdx]   = React.useState(0);
  const menuRef  = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const missionUrl = getMissionUrl(mission);

  const handleMenuItemClick = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    switch (key) {
      case "run-once":     navigate(missionUrl + "?run=1"); break;
      case "run-sched":    navigate(missionUrl + "?tab=schedule"); break;
      case "open-tab":     window.open(window.location.origin + missionUrl, "_blank"); break;
      case "info":         navigate(missionUrl); break;
      case "duplicate":    showToast("建立複本功能即將上線"); break;
      case "star":         setStarred(v => !v); showToast(starred ? "已取消星號標記" : "已加入星號標記", "success"); break;
      case "move":         showToast("移動功能即將上線"); break;
      case "download":     showToast("下載功能即將上線"); break;
      case "offline":      showToast("離線功能即將上線"); break;
      case "share":        showToast("分享功能即將上線"); break;
      case "copy-link":
        navigator.clipboard.writeText(window.location.origin + missionUrl)
          .then(() => showToast("連結已複製", "success"))
          .catch(() => showToast("複製失敗", "warn"));
        break;
      case "trash":        showToast("已移至垃圾桶", "warn"); break;
    }
  };

  const updatedTxt = formatRelative(mission.updatedAt);
  const layerStr   = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk         = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;

  /* Images */
  const thumbnailUrl      = mission.thumbnailUrl ?? null;
  const squadMockupImages = Array.isArray(mission.squadMockupImages) ? mission.squadMockupImages : [];
  const allImages         = thumbnailUrl
    ? [thumbnailUrl, ...squadMockupImages.filter(u => u !== thumbnailUrl)]
    : squadMockupImages;
  const hasImages = allImages.length > 0;

  /* Slideshow */
  React.useEffect(() => {
    if (hovered && allImages.length > 1) {
      timerRef.current = setInterval(() => setImgIdx(i => (i + 1) % allImages.length), 1400);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (!hovered) setImgIdx(0);
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [hovered, allImages.length]);

  /* Close menu on outside click */
  React.useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  /* Brand avatar for this mission */
  const brandColor = stringToColor(mission.brandName ?? "S");
  const brandLetter = ((mission.brandName ?? "S") as string).slice(0, 1).toUpperCase();

  return (
    <div
      style={{
        cursor: "pointer", position: "relative",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "transform 0.15s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onOpen}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "4/3",
        borderRadius: 8, overflow: "hidden",
        background: "#F2F1EF",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.14)" : "0 1px 4px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s ease",
      }}>
        {/* Images or fallback glyph */}
        {hasImages ? (
          <>
            {allImages.map((url, i) => (
              <div key={url} style={{
                position: "absolute", inset: 0,
                backgroundImage: `url(${url})`,
                backgroundSize: "cover", backgroundPosition: "center",
                opacity: i === imgIdx ? 1 : 0,
                transition: "opacity 0.4s ease-in-out",
              }} />
            ))}
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={52} />
          </div>
        )}

        {/* Dark overlay on hover */}
        <div style={{
          position: "absolute", inset: 0,
          background: hovered || menuOpen ? "rgba(0,0,0,0.10)" : "transparent",
          transition: "background 0.15s", pointerEvents: "none",
        }} />

        {/* 隱藏 badge (top-left) */}
        <div style={{
          position: "absolute", top: 7, left: 7,
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(255,255,255,0.88)", borderRadius: 6,
          padding: "2px 6px", backdropFilter: "blur(4px)",
          pointerEvents: "none",
        }}>
          <FontAwesomeIcon icon={faLock} style={{ fontSize: 9, color: "#6B7280" }} />
          <span style={{ fontSize: 10.5, color: "#374151", fontWeight: 500 }}>隱藏</span>
        </div>

        {/* Dot indicators */}
        {allImages.length > 1 && hovered && (
          <div style={{
            position: "absolute", bottom: 6, left: 0, right: 0,
            display: "flex", justifyContent: "center", gap: 4, pointerEvents: "none",
          }}>
            {allImages.map((_, i) => (
              <div key={i} style={{
                width: i === imgIdx ? 14 : 5, height: 5, borderRadius: 3,
                background: i === imgIdx ? "white" : "rgba(255,255,255,0.5)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
        )}

        {/* Checkbox */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          opacity: hovered || menuOpen ? 1 : 0, transition: "opacity 0.15s",
          pointerEvents: hovered || menuOpen ? "auto" : "none",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 18, height: 18, borderRadius: 4,
            border: "2px solid rgba(255,255,255,0.85)",
            background: "rgba(255,255,255,0.18)", cursor: "pointer",
          }} />
        </div>

        {/* ⭐ + ⋯ */}
        <div style={{
          position: "absolute", top: 6, right: 6, display: "flex", gap: 4,
          opacity: hovered || menuOpen ? 1 : 0, transition: "opacity 0.15s",
          pointerEvents: hovered || menuOpen ? "auto" : "none",
        }}>
          <HoverBtn icon={faStar} title={starred ? "取消星號" : "加入星號"} active={starred}
            onClick={e => { e.stopPropagation(); setStarred(v => !v); showToast(starred ? "已取消星號標記" : "已加入星號標記", "success"); }} />
          <HoverBtn icon={faEllipsis} title="更多選項" active={menuOpen}
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          />
        </div>
      </div>

      {/* Text + avatar */}
      <div style={{ padding: "8px 2px 2px" }}>
        <p style={{
          fontSize: 13.5, fontWeight: 600, color: "#1A1A18", lineHeight: 1.35, margin: 0,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {mission.title}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
            background: brandColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 700, color: "white",
          }}>
            {brandLetter}
          </div>
          <p style={{ fontSize: 11.5, color: "#6B6A66", margin: 0 }}>{updatedTxt}</p>
        </div>
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: 44, right: 0, zIndex: 200,
            background: "white", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
            minWidth: 200, padding: "6px 0", border: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          {CARD_MENU_ITEMS.map(item => (
            <React.Fragment key={item.key}>
              <button
                onClick={e => handleMenuItemClick(item.key, e)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", border: "none", background: "transparent",
                  textAlign: "left", cursor: "pointer", fontSize: 13,
                  color: item.accent ?? "#1A1A18",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <FontAwesomeIcon icon={item.icon} style={{ width: 14, color: item.accent ?? "#6B7280" }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {"badge" in item && item.badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                    background: "#ECFDF5", color: "#059669",
                  }}>{item.badge}</span>
                )}
              </button>
              {item.dividerAfter && <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── HoverBtn ─────────────────────────────────── */
function HoverBtn({ icon, title, active, onClick }: {
  icon: any; title: string; active?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: active || hov ? "#f3f4f6" : "white",
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: "#374151",
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
      }}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

/* ──────────────────────── MissionListTable ─────────────────────────── */
function MissionListTable({ missions, onOpen }: { missions: MissionRow[]; onOpen: (m: MissionRow) => void }) {
  return (
    <div style={{ border: "1px solid #E4E3E1", borderRadius: 10, overflow: "hidden" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
        padding: "10px 16px", borderBottom: "1px solid #E4E3E1", background: "#F9F8F6",
      }}>
        {["名稱", "擁有者", "類型", "最近一次編輯"].map(col => (
          <span key={col} style={{ fontSize: 11.5, fontWeight: 600, color: "#9B9990", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {col}
          </span>
        ))}
      </div>
      {missions.map((m, idx) => (
        <MissionCardRow key={m.id} mission={m} isLast={idx === missions.length - 1} onClick={() => onOpen(m)} />
      ))}
    </div>
  );
}

/* ──────────────────────── MissionCardRow ───────────────────────────── */
function MissionCardRow({ mission, isLast, onClick }: {
  mission: MissionRow; isLast: boolean; onClick: () => void;
}) {
  const navigate  = useNavigate();
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [starred, setStarred]   = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const missionUrl = getMissionUrl(mission);

  const handleRowMenuClick = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    switch (key) {
      case "run-once":   navigate(missionUrl + "?run=1"); break;
      case "run-sched":  navigate(missionUrl + "?tab=schedule"); break;
      case "open-tab":   window.open(window.location.origin + missionUrl, "_blank"); break;
      case "info":       navigate(missionUrl); break;
      case "duplicate":  showToast("建立複本功能即將上線"); break;
      case "star":       setStarred(v => !v); showToast(starred ? "已取消星號標記" : "已加入星號標記", "success"); break;
      case "move":       showToast("移動功能即將上線"); break;
      case "download":   showToast("下載功能即將上線"); break;
      case "offline":    showToast("離線功能即將上線"); break;
      case "share":      showToast("分享功能即將上線"); break;
      case "copy-link":
        navigator.clipboard.writeText(window.location.origin + missionUrl)
          .then(() => showToast("連結已複製", "success"))
          .catch(() => showToast("複製失敗", "warn"));
        break;
      case "trash":      showToast("已移至垃圾桶", "warn"); break;
    }
  };

  React.useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
        alignItems: "center", padding: "11px 16px",
        background: hov ? "#F9F8F6" : "white",
        borderBottom: isLast ? "none" : "1px solid #F3F2F0",
        cursor: "pointer", position: "relative", transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
          background: "#F2F1EF", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {mission.thumbnailUrl ? (
            <div style={{ width: "100%", height: "100%", backgroundImage: `url(${mission.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={22} />
          )}
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "#1A1A18", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mission.title}
        </span>
      </div>
      <span style={{ fontSize: 13, color: "#6B6A66" }}>{mission.brandName ?? "—"}</span>
      <span style={{ fontSize: 13, color: "#6B6A66", textTransform: "capitalize" }}>{mission.workspace ?? "—"}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "#6B6A66" }}>{formatRelative(mission.updatedAt)}</span>
        {hov && (
          <div style={{ display: "flex", gap: 4, position: "relative" }} onClick={e => e.stopPropagation()}>
            <RowBtn icon={faStar}     title={starred ? "取消星號" : "加入星號"}
              onClick={e => { e.stopPropagation(); setStarred(v => !v); showToast(starred ? "已取消星號標記" : "已加入星號標記", "success"); }} />
            <RowBtn icon={faBookmark} title="複製連結"
              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(window.location.origin + missionUrl).then(() => showToast("連結已複製", "success")).catch(() => showToast("複製失敗", "warn")); }} />
            <RowBtn icon={faEllipsis} title="更多" onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }} />
            {menuOpen && (
              <div ref={menuRef} style={{
                position: "absolute", top: 32, right: 0, zIndex: 200,
                background: "white", borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                minWidth: 200, padding: "6px 0", border: "1px solid rgba(0,0,0,0.07)",
              }}>
                {CARD_MENU_ITEMS.map(item => (
                  <React.Fragment key={item.key}>
                    <button
                      onClick={e => handleRowMenuClick(item.key, e)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 14px", border: "none", background: "transparent",
                        textAlign: "left", cursor: "pointer", fontSize: 13, color: item.accent ?? "#1A1A18",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <FontAwesomeIcon icon={item.icon} style={{ width: 14, color: item.accent ?? "#6B7280" }} />
                      <span>{item.label}</span>
                    </button>
                    {item.dividerAfter && <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RowBtn({ icon, title, onClick }: { icon: any; title: string; onClick?: (e: React.MouseEvent) => void }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
        background: hov ? "#EEECE9" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "#6B7280", transition: "background 0.1s",
      }}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

/* ──────────────────────── PillDropdown ─────────────────────────────── */
function PillDropdown({ label, active, open, onToggle, onClose, children }: {
  label: string; active: boolean; open: boolean;
  onToggle: () => void; onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 20, cursor: "pointer",
          border: active ? "1.5px solid #7C3AED" : "1.5px solid rgba(255,255,255,0.6)",
          background: active ? "#F5F3FF" : "rgba(255,255,255,0.7)",
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? "#7C3AED" : "#374151",
          backdropFilter: "blur(4px)",
          transition: "all 0.1s",
        }}
      >
        {label}
        <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
          background: "white", borderRadius: 12, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.07)",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", border: "none", background: hov ? "rgba(0,0,0,0.04)" : "transparent",
        textAlign: "left", cursor: "pointer", fontSize: 13,
        color: active ? "#7C3AED" : "#374151", fontWeight: active ? 600 : 400,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#7C3AED" : "transparent", flexShrink: 0 }} />
      {label}
    </button>
  );
}

/* ──────────────────────── Utilities ────────────────────────────────── */
export { };
