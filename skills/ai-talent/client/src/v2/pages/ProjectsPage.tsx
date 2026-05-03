/**
 * ProjectsPage — Canva /projects pixel-faithful redesign.
 *
 * Layout:
 *   ┌────────────────────┬──────────────────────────────────────┐
 *   │ Left rail 240px    │  Main column (flex-1, scrollable)    │
 *   │ - sub-nav          │  - filter bar (擁有者▾ 類型▾ sort)    │
 *   │ - 已加星號標籤     │  - 最近的項目 (横向scroll)           │
 *   │ - 資料夾           │  - 資料夾 grid                       │
 *   │ - 品牌             │  - 設計 grid / list                  │
 *   └────────────────────┴──────────────────────────────────────┘
 *
 * Canva-faithful: raw divs + inline styles (no HeroUI layout wrappers).
 * Color tokens from index.css :root.
 */
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
import ProjectSyncModal, { type SyncSource } from "../components/projects/ProjectSyncModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Skeleton, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faPlus,
  faArrowDownWideShort, faArrowUpWideShort,
  faTableCells, faList, faStar, faEllipsis, faBookmark,
  faCloudArrowUp, faGlobe, faWandMagicSparkles, faFolderOpen,
  faRocket, faShareNodes, faCloudArrowDown,
  faBolt, faCalendarDays,
  faArrowUpRightFromSquare, faCircleInfo, faCopy, faFolderTree,
  faDownload, faWifi, faShareAlt, faLink, faTrash,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faYoutube, faGoogleDrive, faMicrosoft, faDropbox,
} from "@fortawesome/free-brands-svg-icons";

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

/* ── Navigation items (Canva-faithful order) ── */
const SUB_NAV: Array<{ id: SubNavKey; label: string; icon: any }> = [
  { id: "all",     label: "所有專案",   icon: faFolderOpen     },
  { id: "mine",    label: "你的專案",   icon: faRocket         },
  { id: "shared",  label: "與你分享",   icon: faShareNodes     },
  { id: "offline", label: "可離線使用", icon: faCloudArrowDown },
];

/* ── Context-menu items on each card ── */
const CARD_MENU_ITEMS = [
  { key: "run-once",    icon: faBolt,                label: "立即自主執行",     accent: "#F97316", dividerAfter: false },
  { key: "run-sched",   icon: faCalendarDays,        label: "排程自主執行",     accent: "#F97316", dividerAfter: true  },
  { key: "open-tab",    icon: faArrowUpRightFromSquare, label: "在新索引標籤中開啟", accent: null,  dividerAfter: false },
  { key: "info",        icon: faCircleInfo,          label: "詳細資訊",         accent: null,      dividerAfter: false },
  { key: "duplicate",   icon: faCopy,                label: "建立複本",         accent: null,      dividerAfter: false },
  { key: "star",        icon: faStar,                label: "加入星號",         accent: null,      dividerAfter: false },
  { key: "move",        icon: faFolderTree,          label: "移動",             accent: null,      dividerAfter: false },
  { key: "download",    icon: faDownload,            label: "下載",             accent: null,      dividerAfter: false },
  { key: "offline",     icon: faWifi,                label: "設為可離線存取",   accent: null,      badge: "新功能",     dividerAfter: false },
  { key: "share",       icon: faShareAlt,            label: "分享",             accent: null,      dividerAfter: false },
  { key: "copy-link",   icon: faLink,                label: "複製連結",         accent: null,      dividerAfter: true  },
  { key: "trash",       icon: faTrash,               label: "移至垃圾桶",       accent: "#EF4444", dividerAfter: false },
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
  if (mins < 1)   return "剛剛";
  if (mins < 60)  return `${mins} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days === 1) return "1 天前編輯";
  if (days < 30)  return `${days} 天前編輯`;
  return new Date(dateStr).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
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

  /* UI state */
  const [subNav,        setSubNav]        = useState<SubNavKey>("all");
  const [ownerFilter,   setOwnerFilter]   = useState<string>("all");
  const [typeFilter,    setTypeFilter]    = useState<string>("all");
  const [categoryFilter,setCategoryFilter] = useState<string>("all");
  const [dateFilter,    setDateFilter]    = useState<string>("all");
  const [sortMode,      setSortMode]      = useState<"recent" | "asc" | "desc">("recent");
  const [viewMode,      setViewMode]      = useState<"grid" | "list">("grid");
  const [ownerSearch,   setOwnerSearch]   = useState("");
  const [ownerOpen,     setOwnerOpen]     = useState(false);
  const [typeOpen,      setTypeOpen]      = useState(false);
  const [categoryOpen,  setCategoryOpen]  = useState(false);
  const [dateOpen,      setDateOpen]      = useState(false);
  const [foldersOpen,   setFoldersOpen]   = useState(true);
  const [designsOpen,   setDesignsOpen]   = useState(true);
  const [createSource,  setCreateSource]  = useState<SourceId | null>(null);
  const [syncSource,    setSyncSource]    = useState<SyncSource | null>(null);

  /* Owner options */
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((m) => { if (m.brandName && m.brandId != null) map.set(String(m.brandId), m.brandName); });
    return [
      { value: "all",   label: "任何擁有者" },
      { value: "mine",  label: "我的專案"   },
      { value: "shared",label: "與我分享"   },
      ...Array.from(map.entries()).map(([v, l]) => ({ value: v, label: l })),
    ];
  }, [rows]);

  /* Type options */
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { if (m.workspace) set.add(m.workspace.toLowerCase()); });
    return [
      { value: "all", label: "任何類型" },
      ...Array.from(set).sort().map((v) => ({ value: v, label: v })),
    ];
  }, [rows]);

  /* Category options (strategy layer) */
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => { const l = (m.squadLayer ?? "").toString().slice(0,2); if (l) set.add(l); });
    return [
      { value: "all", label: "任何類別" },
      ...Array.from(set).sort().map(v => ({ value: v, label: `${v} 策略層` })),
    ];
  }, [rows]);

  /* Date options */
  const dateOptions = [
    { value: "all",   label: "任何日期" },
    { value: "today", label: "今天"     },
    { value: "week",  label: "本週"     },
    { value: "month", label: "本月"     },
    { value: "year",  label: "今年"     },
  ];

  /* Filtered + sorted rows */
  const filtered = useMemo(() => {
    let r = rows;
    if (ownerFilter !== "all" && ownerFilter !== "mine" && ownerFilter !== "shared") {
      r = r.filter((m) => String(m.brandId) === ownerFilter);
    }
    if (typeFilter !== "all") {
      r = r.filter((m) => (m.workspace ?? "").toLowerCase() === typeFilter);
    }
    if (categoryFilter !== "all") {
      r = r.filter((m) => (m.squadLayer ?? "").toString().slice(0,2) === categoryFilter);
    }
    if (dateFilter !== "all") {
      const ms: Record<string,number> = { today: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
      const cutoff = ms[dateFilter];
      if (cutoff) r = r.filter(m => m.updatedAt && (Date.now() - new Date(m.updatedAt).getTime()) <= cutoff);
    }
    return [...r].sort((a, b) => {
      if (sortMode === "asc") return (a.title ?? "").localeCompare(b.title ?? "", "zh-TW");
      if (sortMode === "desc") return (b.title ?? "").localeCompare(a.title ?? "", "zh-TW");
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
  }, [rows, ownerFilter, typeFilter, categoryFilter, dateFilter, sortMode]);

  const recent = useMemo(() => filtered.slice(0, 12), [filtered]);

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  /* Labels */
  const navLabel      = SUB_NAV.find(n => n.id === subNav)?.label ?? "所有專案";
  const ownerLabel    = ownerFilter    === "all" ? "擁有者"   : (ownerOptions.find(o=>o.value===ownerFilter)?.label ?? "擁有者");
  const typeLabel     = typeFilter     === "all" ? "類型"     : (typeOptions.find(o=>o.value===typeFilter)?.label    ?? "類型");
  const categoryLabel = categoryFilter === "all" ? "類別"     : (categoryOptions.find(o=>o.value===categoryFilter)?.label ?? "類別");
  const dateLabel     = dateFilter     === "all" ? "已修改日期" : (dateOptions.find(o=>o.value===dateFilter)?.label ?? "已修改日期");

  const closeAllPills = () => { setOwnerOpen(false); setTypeOpen(false); setCategoryOpen(false); setDateOpen(false); };

  return (
    <div style={{
      display: "flex", height: "100%", minHeight: "100vh", overflow: "hidden",
      background: "rgb(252,251,254)", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>

      {/* ════════════════════════ LEFT RAIL ════════════════════════ */}
      <aside style={{
        width: 240, flexShrink: 0,
        borderRight: "1px solid #E4E3E1",
        overflowY: "auto", padding: "20px 0 24px",
        display: "flex", flexDirection: "column", gap: 0,
      }}>

        {/* Main nav */}
        <nav style={{ padding: "0 8px", marginBottom: 4 }}>
          {SUB_NAV.map(n => {
            const active = subNav === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setSubNav(n.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8, border: "none",
                  textAlign: "left", cursor: "pointer",
                  background: active ? "#EEF2FF" : "transparent",
                  transition: "background 0.1s",
                  marginBottom: 1,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? "#EEF2FF" : "transparent"; }}
              >
                <FontAwesomeIcon
                  icon={n.icon}
                  style={{ fontSize: 14, width: 16, flexShrink: 0, color: active ? "#4F46E5" : "#6B7280" }}
                />
                <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 400, color: active ? "#4338CA" : "#374151" }}>
                  {n.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div style={{ height: 1, background: "#E4E3E1", margin: "8px 0" }} />

        {/* 已加星號標籤 */}
        <div style={{ padding: "0 20px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF" }}>
              已加星號標籤
            </span>
            <button style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>
            點擊任一專案的星號圖示，即可從這裡輕鬆找到。
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#E4E3E1", margin: "8px 0" }} />

        {/* 資料夾 */}
        <div style={{ padding: "0 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF" }}>
              資料夾
            </span>
            <button style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          {[
            { icon: faCloudArrowUp, label: "上傳"    },
            { icon: faStar,         label: "已加星號" },
          ].map(f => (
            <button key={f.label} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8, border: "none",
              textAlign: "left", cursor: "pointer", background: "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <FontAwesomeIcon icon={f.icon} style={{ fontSize: 13, width: 16, color: "#6B7280" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#E4E3E1", margin: "8px 0" }} />

        {/* 品牌 */}
        <div style={{ padding: "0 20px 4px" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF" }}>
            品牌
          </span>
        </div>
        <div style={{ padding: "0 8px" }}>
          {brands.slice(0, 6).map((b: any) => (
            <button
              key={b.id}
              onClick={() => setOwnerFilter(String(b.id))}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "7px 12px", borderRadius: 8, border: "none",
                textAlign: "left", cursor: "pointer",
                background: ownerFilter === String(b.id) ? "rgba(0,0,0,0.05)" : "transparent",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
              onMouseLeave={e => { e.currentTarget.style.background = ownerFilter === String(b.id) ? "rgba(0,0,0,0.05)" : "transparent"; }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: stringToColor(b.name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "#fff",
              }}>
                {(b.name ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.name}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ════════════════════════ MAIN COLUMN ════════════════════════ */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Hero zone: gradient bg + large title + search + filter pills ── */}
        <div style={{
          flexShrink: 0,
          background: "linear-gradient(160deg, #EDE9FE 0%, #E0E7FF 40%, #F0F9FF 100%)",
          padding: "36px 40px 24px",
          textAlign: "center",
        }}>
          {/* Large centered title */}
          <h1 style={{
            fontSize: 36, fontWeight: 700, color: "#1A1A18",
            margin: "0 0 20px", letterSpacing: "-0.03em",
          }}>
            {navLabel}
          </h1>

          {/* Full-width search bar */}
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

          {/* Filter pills row — centered below search */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, marginTop: 12, flexWrap: "wrap",
          }}>
            {/* 類型▾ */}
            <PillDropdown label={typeLabel} active={typeFilter !== "all"} open={typeOpen}
              onToggle={() => { setTypeOpen(v => !v); closeAllPills(); setTypeOpen(true); }}
              onClose={() => setTypeOpen(false)}>
              <div style={{ padding: "4px 4px 8px" }}>
                {typeOptions.map(o => (
                  <DropdownRow key={o.value} label={o.label} active={typeFilter === o.value}
                    onClick={() => { setTypeFilter(o.value); setTypeOpen(false); }} />
                ))}
              </div>
            </PillDropdown>

            {/* 類別▾ */}
            <PillDropdown label={categoryLabel} active={categoryFilter !== "all"} open={categoryOpen}
              onToggle={() => { closeAllPills(); setCategoryOpen(v => !v); }}
              onClose={() => setCategoryOpen(false)}>
              <div style={{ padding: "4px 4px 8px" }}>
                {categoryOptions.map(o => (
                  <DropdownRow key={o.value} label={o.label} active={categoryFilter === o.value}
                    onClick={() => { setCategoryFilter(o.value); setCategoryOpen(false); }} />
                ))}
              </div>
            </PillDropdown>

            {/* 擁有者▾ */}
            <PillDropdown label={ownerLabel} active={ownerFilter !== "all"} open={ownerOpen}
              onToggle={() => { closeAllPills(); setOwnerOpen(v => !v); }}
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

            {/* 已修改日期▾ */}
            <PillDropdown label={dateLabel} active={dateFilter !== "all"} open={dateOpen}
              onToggle={() => { closeAllPills(); setDateOpen(v => !v); }}
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

        {/* ── Scrollable content area ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 40px 40px", background: "white" }}>

          {/* Sort / view controls — right-aligned, above sections */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            gap: 8, padding: "16px 0 8px",
          }}>
            <button
              onClick={() => setSortMode(m => m === "recent" ? "asc" : m === "asc" ? "desc" : "recent")}
              title="排序"
              style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
                background: "white", cursor: "pointer", color: "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}
            >
              <FontAwesomeIcon icon={sortMode === "desc" ? faArrowUpWideShort : faArrowDownWideShort} />
            </button>
            <button
              onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}
              title="切換檢視"
              style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
                background: "white", cursor: "pointer", color: "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}
            >
              <FontAwesomeIcon icon={viewMode === "grid" ? faList : faTableCells} />
            </button>
            <button
              onClick={() => setCreateSource("recommended")}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #E4E3E1",
                background: "white", cursor: "pointer", color: "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 300,
              }}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
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
              <button onClick={() => setCreateSource("recommended")} style={{
                marginTop: 8, padding: "9px 20px", borderRadius: 20,
                background: "#1A1A18", color: "white", border: "none",
                cursor: "pointer", fontSize: 14, fontWeight: 600,
              }}>建立第一個專案</button>
            </div>
          )}

          {/* 最近的項目 */}
          {!isLoading && recent.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A18", margin: "0 0 12px" }}>最近的項目</p>
              <div style={{ overflowX: "auto", scrollbarWidth: "none", marginLeft: -4, paddingLeft: 4, display: "flex", gap: 12, paddingBottom: 4 }}>
                {recent.map(m => (
                  <div key={m.id} style={{ width: 178, flexShrink: 0 }}>
                    <MissionCard mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ▼ 資料夾 — collapsible, list layout */}
          {!isLoading && (
            <section style={{ marginBottom: 20 }}>
              <button
                onClick={() => setFoldersOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 15, fontWeight: 700, color: "#1A1A18",
                  padding: "0 0 12px",
                }}
              >
                <span style={{
                  display: "inline-block", fontSize: 10, transition: "transform 0.2s",
                  transform: foldersOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}>▼</span>
                資料夾
              </button>
              {foldersOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <FolderListRow icon={faCloudArrowUp} label="上傳"    hint="—"     />
                  <FolderListRow icon={faStar}         label="已加星號" hint="—"     />
                </div>
              )}
            </section>
          )}

          {/* ▼ 設計 — collapsible */}
          {!isLoading && filtered.length > 0 && (
            <section>
              <button
                onClick={() => setDesignsOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 15, fontWeight: 700, color: "#1A1A18",
                  padding: "0 0 12px",
                }}
              >
                <span style={{
                  display: "inline-block", fontSize: 10, transition: "transform 0.2s",
                  transform: designsOpen ? "rotate(0deg)" : "rotate(-90deg)",
                }}>▼</span>
                設計
              </button>
              {designsOpen && (
                viewMode === "grid" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
                    {filtered.map(m => (
                      <MissionCard key={m.id} mission={m} onClick={() => goToMission(m)} onOpen={() => goToMission(m)} />
                    ))}
                  </div>
                ) : (
                  <MissionListTable missions={filtered} onOpen={goToMission} />
                )
              )}
            </section>
          )}
        </div>
      </main>

      {/* Modals */}
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
        onCreated={(slug) => { setCreateSource(null); navigate(`/templates/${slug}`); }}
      />
    </div>
  );
}

/* ──────────────────────── Section header ──────────────────────────── */
function SectionHeader({
  title, count, onViewAll, showViewAll = true,
}: { title: string; count: number; onViewAll?: () => void; showViewAll?: boolean }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A18", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: "#9B9990" }}>{count} 個</span>
      </div>
      {showViewAll && (
        <button
          onClick={onViewAll}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            fontSize: 13, fontWeight: 500, color: hov ? "#1A1A18" : "#6B6A66",
            background: "none", border: "none", cursor: "pointer",
            transition: "color 0.1s",
          }}
        >
          查看全部 →
        </button>
      )}
    </div>
  );
}

/* ──────────────────────── Folder tile ─────────────────────────────── */
function FolderTile({ icon, label, hint }: { icon: any; label: string; hint: string }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 8, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${hov ? "#C8C7C3" : "#E4E3E1"}`,
        transition: "border-color 0.15s",
        boxShadow: hov ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div style={{
        width: "100%", aspectRatio: "4/3",
        background: hov ? "#EEECE9" : "#F5F4F2",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
      }}>
        <FontAwesomeIcon icon={icon} style={{ fontSize: 32, color: "#9B9990" }} />
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", margin: "0 0 2px" }}>{label}</p>
        <p style={{ fontSize: 12, color: "#9B9990", margin: 0 }}>{hint}</p>
      </div>
    </div>
  );
}

/* ──────────────────────── MissionCard (grid) ───────────────────────── */
function MissionCard({
  mission, onClick, onOpen,
}: {
  mission: MissionRow;
  onClick: () => void;
  onOpen: () => void;
}) {
  const [hovered,  setHovered]  = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [imgIdx,   setImgIdx]   = React.useState(0);
  const menuRef  = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const updatedTxt = formatRelative(mission.updatedAt);
  const layerStr   = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk         = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const heroLabel  = mission.squadName ?? mission.title ?? "";
  const heroLetter = heroLabel.trim().slice(0, 1).toUpperCase() || "M";

  /* Images */
  const thumbnailUrl: string | null    = mission.thumbnailUrl ?? null;
  const squadMockupImages: string[]    = Array.isArray(mission.squadMockupImages) ? mission.squadMockupImages : [];
  const allImages: string[]            = thumbnailUrl
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

  return (
    <div
      style={{ cursor: "pointer", position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onOpen}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "4/3",
        borderRadius: 8, overflow: "hidden",
        background: hovered || menuOpen ? "rgba(57,70,96,0.14)" : "rgba(64,79,109,0.06)",
        transition: "background-color 0.15s ease-in-out",
      }}>
        {/* Images or fallback */}
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
            <div style={{
              position: "absolute", inset: 0,
              background: hovered ? "rgba(0,0,0,0.10)" : "transparent",
              transition: "background 0.15s", pointerEvents: "none",
            }} />
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
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={52} />
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

        {/* ⭐ + ⋯ buttons */}
        <div style={{
          position: "absolute", top: 6, right: 6, display: "flex", gap: 4,
          opacity: hovered || menuOpen ? 1 : 0, transition: "opacity 0.15s",
          pointerEvents: hovered || menuOpen ? "auto" : "none",
        }}>
          <HoverBtn icon={faStar}     title="加入星號" onClick={e => e.stopPropagation()} />
          <HoverBtn icon={faEllipsis} title="更多選項" active={menuOpen}
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          />
        </div>
      </div>

      {/* Text */}
      <div style={{ padding: "8px 2px 2px" }}>
        <p style={{
          fontSize: 13.5, fontWeight: 600, color: "#1A1A18", lineHeight: 1.35, margin: 0,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {mission.title}
        </p>
        <p style={{ fontSize: 11.5, color: "#6B6A66", marginTop: 3 }}>{updatedTxt}</p>
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
                onClick={() => setMenuOpen(false)}
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
                  }}>
                    {item.badge}
                  </span>
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

/* ──────────────────────── HoverBtn (square white button) ──────────── */
function HoverBtn({ icon, title, active, onClick }: {
  icon: any; title: string; active?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
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

/* ──────────────────────── MissionListTable (list view) ─────────────── */
function MissionListTable({ missions, onOpen }: { missions: MissionRow[]; onOpen: (m: MissionRow) => void }) {
  return (
    <div style={{ border: "1px solid #E4E3E1", borderRadius: 10, overflow: "hidden" }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr",
        padding: "10px 16px",
        borderBottom: "1px solid #E4E3E1",
        background: "#F9F8F6",
      }}>
        {["名稱", "擁有者", "類型", "最近一次編輯"].map(col => (
          <span key={col} style={{ fontSize: 11.5, fontWeight: 600, color: "#9B9990", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {col}
          </span>
        ))}
      </div>
      {/* Rows */}
      {missions.map((m, idx) => (
        <MissionCardRow
          key={m.id}
          mission={m}
          isLast={idx === missions.length - 1}
          onClick={() => onOpen(m)}
        />
      ))}
    </div>
  );
}

/* ──────────────────────── MissionCardRow (list row) ────────────────── */
function MissionCardRow({ mission, isLast, onClick }: {
  mission: MissionRow; isLast: boolean; onClick: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;

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
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr",
        alignItems: "center",
        padding: "11px 16px",
        background: hov ? "#F9F8F6" : "white",
        borderBottom: isLast ? "none" : "1px solid #F3F2F0",
        cursor: "pointer", position: "relative",
        transition: "background 0.1s",
      }}
    >
      {/* 名稱 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
          background: "#F2F1EF", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {mission.thumbnailUrl ? (
            <div style={{
              width: "100%", height: "100%",
              backgroundImage: `url(${mission.thumbnailUrl})`,
              backgroundSize: "cover", backgroundPosition: "center",
            }} />
          ) : (
            <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={22} />
          )}
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "#1A1A18", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mission.title}
        </span>
      </div>
      {/* 擁有者 */}
      <span style={{ fontSize: 13, color: "#6B6A66" }}>{mission.brandName ?? "—"}</span>
      {/* 類型 */}
      <span style={{ fontSize: 13, color: "#6B6A66", textTransform: "capitalize" }}>
        {mission.workspace ?? "—"}
      </span>
      {/* 最近一次編輯 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "#6B6A66" }}>{formatRelative(mission.updatedAt)}</span>
        {/* Hover actions */}
        {hov && (
          <div style={{ display: "flex", gap: 4, position: "relative" }} onClick={e => e.stopPropagation()}>
            <RowBtn icon={faStar}     title="加入星號" />
            <RowBtn icon={faBookmark} title="收藏"     />
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
                      onClick={() => setMenuOpen(false)}
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
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
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

/* ──────────────────────── Pill dropdown ───────────────────────────── */
function PillDropdown({
  label, active, open, onToggle, onClose, children,
}: {
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
          border: active ? "1.5px solid #7C3AED" : "1.5px solid #E4E3E1",
          background: active ? "#F5F3FF" : "white",
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? "#7C3AED" : "#374151",
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
          animation: "slideDown 0.12s ease-out",
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
      {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C3AED", flexShrink: 0 }} />}
      {!active && <div style={{ width: 6, height: 6, flexShrink: 0 }} />}
      {label}
    </button>
  );
}

/* ──────────────────────── FolderListRow (list-layout folder row) ──── */
function FolderListRow({ icon, label, hint }: { icon: any; label: string; hint: string }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
        background: hov ? "#F5F4F2" : "transparent",
        transition: "background 0.12s",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0,
        background: hov ? "#EEECE9" : "#F2F1EF",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s",
      }}>
        <FontAwesomeIcon icon={icon} style={{ fontSize: 15, color: "#9B9990" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1A1A18", margin: 0 }}>{label}</p>
        {hint && hint !== "—" && (
          <p style={{ fontSize: 12, color: "#9B9990", margin: 0 }}>{hint}</p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── Utilities ───────────────────────────────── */
function stringToColor(s: string): string {
  const palette = ["#6366F1","#EC4899","#F97316","#10B981","#3B82F6","#8B5CF6","#EF4444","#14B8A6"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

// Legacy export aliases kept for router compatibility
export { };
