/**
 * MethodologyCatalog — Canva-faithful templates page (pure inline-CSS).
 *
 * Data sources (fixed from entity.listForHome which was unreliable):
 *   1. trpc.taskCatalog.listCategoriesForPicker — NEW clean categorized tasks
 *   2. trpc.squad.listForFront                  — methodology squads (typed, reliable)
 *   3. (trpc as any).entity.listForHome          — agents+skills fallback
 *
 * Page structure:
 *   1. Gradient hero — search + quick pills
 *   2. 探索類別 — horizontal-scroll category tiles (from task_category)
 *   3. Per-category task rows — one horizontal strip per workspace
 *   4. 方法論小組 — squad horizontal scroll
 *   5. 為你提供更多 — 3-col grid, filterable by workspace
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronLeft, faChevronRight,
  faPlus, faCrown, faRocket, faBriefcase,
  faVideo, faShareNodes, faStar, faEllipsis,
  faPenNib, faImage, faMicrophoneLines, faChartColumn, faChessKnight, faCode, faWandSparkles,
  faSquare, faImages, faMobileScreenButton, faFilePowerpoint,
  faNewspaper, faPodcast, faCalendarDay, faSquarePollVertical, faFile,
  faBullseye, faUsers, faRobot, faCubes, faMessage, faPalette, faChartLine,
  faChevronDown, faXmark, faCheck, faCircleInfo, faPlay, faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import { agentAvatarUrl } from "../components/AgentAvatar";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

// ── Workspace color map ──────────────────────────────────────────────────────
const WS_COLOR: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  design:     { bg: "#EEF2FF", text: "#4F46E5", icon: faPalette,    label: "設計" },
  image:      { bg: "#FDF4FF", text: "#9333EA", icon: faImage,       label: "影像" },
  video:      { bg: "#FFF7ED", text: "#EA580C", icon: faVideo,       label: "影片" },
  content:    { bg: "#ECFDF5", text: "#059669", icon: faPenNib,      label: "內容" },
  social:     { bg: "#FFF1F2", text: "#E11D48", icon: faShareNodes,  label: "社群" },
  strategy:   { bg: "#EFF6FF", text: "#2563EB", icon: faChessKnight, label: "策略" },
  ads:        { bg: "#FFFBEB", text: "#D97706", icon: faBullseye,    label: "廣告" },
  analytics:  { bg: "#F0FDF4", text: "#16A34A", icon: faChartColumn, label: "數據" },
  all:        { bg: "#F5F5F4", text: "#57534E", icon: faCubes,       label: "全部" },
};

function wsColor(ws?: string | null) {
  return WS_COLOR[String(ws ?? "").toLowerCase()] ?? WS_COLOR.all;
}

// ── Task/squad icon maps ──────────────────────────────────────────────────────
const FORMAT_ICON: Record<string, any> = {
  feed: faSquare, carousel: faImages, reel: faVideo, shorts: faVideo,
  "video-card": faVideo, watch: faVideo, story: faMobileScreenButton,
  live: faPodcast, article: faNewspaper, newsletter: faNewspaper,
  document: faFilePowerpoint, poll: faSquarePollVertical, event: faCalendarDay,
  community: faMessage, ad: faBullseye, profile: faImage,
};

// Layer colors (matching LAYER_TOKENS)
const LAYER_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  L1: { bg: "#EEF2FF", text: "#4F46E5", label: "品牌策略" },
  L2: { bg: "#FFF1F2", text: "#E11D48", label: "產品策略" },
  L3: { bg: "#FFFBEB", text: "#D97706", label: "受眾策略" },
  L4: { bg: "#F5F3FF", text: "#7C3AED", label: "通路策略" },
  L5: { bg: "#F0FDF4", text: "#16A34A", label: "活動策略" },
  L6: { bg: "#F5F5F4", text: "#57534E", label: "驗證校準" },
};
function layerColor(layer?: string | null) {
  const k = String(layer ?? "L1").slice(0, 2).toUpperCase();
  return LAYER_COLOR[k] ?? LAYER_COLOR.L1;
}

// ── Toast helper ─────────────────────────────────────────────────────────────
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

// ── Workspace labels for filter pills ────────────────────────────────────────
const WS_PILLS = [
  { key: "all",      label: "全部" },
  { key: "design",   label: "設計" },
  { key: "image",    label: "影像" },
  { key: "video",    label: "影片" },
  { key: "content",  label: "內容" },
  { key: "social",   label: "社群" },
  { key: "strategy", label: "策略" },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function MethodologyCatalog() {
  const navigate = useNavigate();
  const { brandId } = useOutletContext<ShellOutletCtx>();
  const [searchParams] = useSearchParams();

  const [searchQ, setSearchQ]   = useState(() => searchParams.get("query") ?? "");
  const [wsFilter, setWsFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // ── Data: task categories (primary — the new clean structure) ─────────────
  const catQuery = (trpc as any).taskCatalog?.listCategoriesForPicker?.useQuery
    ? (trpc as any).taskCatalog.listCategoriesForPicker.useQuery(
        undefined,
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: [], isLoading: false };

  // ── Data: flat task list (for grid + search) ──────────────────────────────
  const flatQuery = (trpc as any).taskCatalog?.listForPicker?.useQuery
    ? (trpc as any).taskCatalog.listForPicker.useQuery(
        { includeComingSoon: true },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: [], isLoading: false };

  // ── Data: squads (typed — reliable) ──────────────────────────────────────
  const squadQuery = trpc.squad.listForFront.useQuery(
    undefined,
    { refetchOnWindowFocus: false, staleTime: 30_000 }
  );

  // ── Data: agents+skills from entity router (best-effort) ─────────────────
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const categories: any[]  = useMemo(() => (catQuery.data as any[]) ?? [], [catQuery.data]);
  const flatTasks: any[]   = useMemo(() => (flatQuery.data as any[]) ?? [], [flatQuery.data]);
  const squads: any[]      = useMemo(() => (squadQuery.data as any[]) ?? [], [squadQuery.data]);
  const agents: any[]      = useMemo(() => ((entityQuery.data as any[]) ?? []).filter((e: any) => e.kind === "agent"), [entityQuery.data]);

  const isLoading = catQuery.isLoading || squadQuery.isLoading;

  // ── Derived: unique workspaces from categories ───────────────────────────
  const availableWorkspaces = useMemo(() => {
    const ws = new Set<string>();
    for (const c of categories) if (c.workspace) ws.add(String(c.workspace).toLowerCase());
    return Array.from(ws);
  }, [categories]);

  // ── Derived: filtered flat tasks for the bottom grid ─────────────────────
  const gridTasks = useMemo(() => {
    let items = flatTasks;
    if (wsFilter !== "all") items = items.filter((t: any) => String(t.workspace ?? "").toLowerCase() === wsFilter);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      items = items.filter((t: any) =>
        `${t.name_zh ?? ""} ${t.name_en ?? ""} ${t.description ?? ""} ${t.methodology_label ?? ""}`.toLowerCase().includes(q)
      );
    }
    return items;
  }, [flatTasks, wsFilter, searchQ]);

  // ── Derived: filtered squads for the grid ─────────────────────────────────
  const gridSquads = useMemo(() => {
    if (!searchQ.trim()) return squads;
    const q = searchQ.trim().toLowerCase();
    return squads.filter((s: any) => `${s.name ?? ""} ${s.description ?? ""}`.toLowerCase().includes(q));
  }, [squads, searchQ]);

  // ── Selected task detail modal ─────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  const totalCount = flatTasks.length + squads.length;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF9", paddingBottom: 64 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "48px 40px 56px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background circles */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 300, height: 300,
          borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -40, left: "40%", width: 200, height: 200,
          borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none",
        }} />

        <div style={{ maxWidth: 900, position: "relative", zIndex: 1 }}>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            TEMPLATES · 範本庫
          </p>
          <h1 style={{ color: "white", fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            什麼都可以做
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 16, margin: "0 0 28px", lineHeight: 1.6 }}>
            {totalCount > 0 ? `${totalCount} 個範本` : "載入中…"} — 找一個套上去，立刻開工
          </p>

          {/* Search bar */}
          <div style={{ position: "relative", maxWidth: 600 }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              color: "#9CA3AF", fontSize: 16, zIndex: 1,
            }} />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋範本、工作流、方法論…"
              style={{
                width: "100%", padding: "14px 44px 14px 48px", borderRadius: 50,
                border: "none", fontSize: 15, outline: "none",
                background: "white", color: "#1A1A18", boxSizing: "border-box",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ("")}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "#E5E5E3", border: "none", borderRadius: "50%",
                  width: 22, height: 22, cursor: "pointer", color: "#57534E",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          {/* Quick pills */}
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "社群貼文", ws: "social" },
              { label: "影片腳本", ws: "video" },
              { label: "設計文案", ws: "design" },
              { label: "內容策略", ws: "content" },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => { setWsFilter(p.ws); setSearchQ(""); }}
                style={{
                  padding: "6px 14px", borderRadius: 50,
                  background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
                  color: "white", fontSize: 13, cursor: "pointer", fontWeight: 500,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 40px" }}>

        {/* ── 探索類別 tiles ───────────────────────────────────────────── */}
        {!isLoading && categories.length > 0 && (
          <HScrollSection title="探索類別" subtitle={`${categories.length} 個工作類別`} mt={32}>
            {/* "全部" tile */}
            <CategoryTile
              label="全部範本"
              hint={`${totalCount} 個範本`}
              icon={faCubes}
              bg="#F5F5F4"
              textColor="#57534E"
              active={wsFilter === "all"}
              onClick={() => setWsFilter("all")}
            />
            {categories.map((c: any) => {
              const wc = wsColor(c.workspace);
              return (
                <CategoryTile
                  key={c.id}
                  label={c.name_zh ?? c.name_en ?? c.slug}
                  hint={`${(c.methods ?? []).length} 個範本`}
                  icon={wc.icon}
                  bg={wc.bg}
                  textColor={wc.text}
                  active={wsFilter === String(c.workspace ?? "").toLowerCase()}
                  onClick={() => {
                    setWsFilter(String(c.workspace ?? "").toLowerCase());
                    setTimeout(() => document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }), 80);
                  }}
                />
              );
            })}
          </HScrollSection>
        )}

        {/* Skeleton tiles while loading */}
        {isLoading && (
          <HScrollSection title="探索類別" mt={32}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                flexShrink: 0, width: 160, height: 90, borderRadius: 12,
                background: "#F0F0EE", animation: "pulse 1.5s ease-in-out infinite",
              }} />
            ))}
          </HScrollSection>
        )}

        {/* ── Per-category task strips ──────────────────────────────────── */}
        {!isLoading && (wsFilter === "all" ? categories : categories.filter((c: any) => String(c.workspace ?? "").toLowerCase() === wsFilter))
          .filter((c: any) => (c.methods ?? []).length > 0)
          .map((c: any) => {
            const wc = wsColor(c.workspace);
            return (
              <HScrollSection
                key={c.id}
                title={c.name_zh ?? c.name_en ?? c.slug}
                subtitle={c.description ?? ""}
                accentColor={wc.text}
                cta="查看全部 →"
                onCta={() => { setWsFilter(String(c.workspace ?? "").toLowerCase()); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
                mt={28}
              >
                {(c.methods ?? []).map((t: any) => (
                  <TaskCard key={t.id} task={t} wsColor={wc} onSelect={() => setSelectedTask(t)} />
                ))}
              </HScrollSection>
            );
          })
        }

        {/* ── 方法論小組 ─────────────────────────────────────────────────── */}
        {squads.length > 0 && (wsFilter === "all" || wsFilter === "strategy") && (
          <HScrollSection
            title="方法論小組"
            subtitle="預配好的 agent 編組，照工作流跑出產出"
            accentColor="#4F46E5"
            cta="查看全部 →"
            onCta={() => document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" })}
            mt={28}
          >
            {squads.slice(0, 24).map((s: any) => (
              <SquadCard key={s.id} squad={s} onClick={() => showToast("方法論小組詳情即將開放", "default")} />
            ))}
          </HScrollSection>
        )}

        {/* ── Workspace filter bar ──────────────────────────────────────── */}
        <div id="grid-section" style={{ marginTop: 40, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A18", letterSpacing: "-0.01em", margin: 0 }}>
              為你提供更多範本
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#A8A29E" }}>
                {wsFilter === "all" ? `共 ${gridTasks.length + (searchQ ? gridSquads.length : 0)} 個` : `${gridTasks.length} 個`}
              </span>
              {/* View mode toggle */}
              <button onClick={() => setViewMode("grid")} style={{
                padding: "5px 10px", borderRadius: 6, border: `1px solid ${viewMode === "grid" ? "#6366F1" : "#E4E3E1"}`,
                background: viewMode === "grid" ? "#EEF2FF" : "white", color: viewMode === "grid" ? "#6366F1" : "#57534E",
                cursor: "pointer", fontSize: 12,
              }}>⊞</button>
              <button onClick={() => setViewMode("list")} style={{
                padding: "5px 10px", borderRadius: 6, border: `1px solid ${viewMode === "list" ? "#6366F1" : "#E4E3E1"}`,
                background: viewMode === "list" ? "#EEF2FF" : "white", color: viewMode === "list" ? "#6366F1" : "#57534E",
                cursor: "pointer", fontSize: 12,
              }}>☰</button>
            </div>
          </div>

          {/* Workspace pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WS_PILLS.filter(p => p.key === "all" || availableWorkspaces.includes(p.key)).map(p => (
              <button
                key={p.key}
                onClick={() => setWsFilter(p.key)}
                style={{
                  padding: "6px 14px", borderRadius: 50, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${wsFilter === p.key ? "#6366F1" : "#E4E3E1"}`,
                  background: wsFilter === p.key ? "#EEF2FF" : "white",
                  color: wsFilter === p.key ? "#4F46E5" : "#57534E",
                  fontWeight: wsFilter === p.key ? 600 : 400,
                  transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grid ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                height: 180, borderRadius: 12, background: "#F0F0EE",
                animation: "pulse 1.5s ease-in-out infinite",
              }} />
            ))}
          </div>
        )}

        {!isLoading && gridTasks.length === 0 && squads.length === 0 && (
          <div style={{
            padding: "60px 24px", textAlign: "center",
            border: "2px dashed #E4E3E1", borderRadius: 16,
          }}>
            <FontAwesomeIcon icon={faCircleInfo} style={{ fontSize: 36, color: "#D1D0CE", marginBottom: 16 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#57534E", margin: "0 0 8px" }}>找不到範本</p>
            <p style={{ fontSize: 14, color: "#A8A29E", margin: 0 }}>試試清除篩選或更換搜尋關鍵字</p>
            {wsFilter !== "all" && (
              <button
                onClick={() => setWsFilter("all")}
                style={{
                  marginTop: 16, padding: "8px 20px", borderRadius: 8,
                  background: "#6366F1", color: "white", border: "none",
                  cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
              >
                顯示全部
              </button>
            )}
          </div>
        )}

        {!isLoading && gridTasks.length > 0 && viewMode === "grid" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {gridTasks.map((t: any) => (
              <TaskGridCard key={t.id} task={t} onSelect={() => setSelectedTask(t)} />
            ))}
            {/* Show squads in grid when searching */}
            {searchQ.trim() && gridSquads.map((s: any) => (
              <SquadGridCard key={`sq-${s.id}`} squad={s} />
            ))}
          </div>
        )}

        {!isLoading && gridTasks.length > 0 && viewMode === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gridTasks.map((t: any) => (
              <TaskListRow key={t.id} task={t} onSelect={() => setSelectedTask(t)} />
            ))}
          </div>
        )}

        {/* Show squads when no tasks match but squads do */}
        {!isLoading && gridTasks.length === 0 && gridSquads.length > 0 && searchQ.trim() && (
          <>
            <p style={{ fontSize: 14, color: "#A8A29E", margin: "0 0 12px" }}>方法論小組符合搜尋：</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {gridSquads.map((s: any) => (
                <SquadGridCard key={s.id} squad={s} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Task detail modal ──────────────────────────────────────────── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onLaunch={(t: any) => {
            setSelectedTask(null);
            if (t.squad_slug) {
              const qs = new URLSearchParams({ slug: t.squad_slug });
              window.open(`/picker?${qs}`, "_blank", "noopener");
            } else {
              showToast("即將開放直接啟動", "default");
            }
          }}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}

/* ─── HScrollSection ──────────────────────────────────────────────────────── */
function HScrollSection({
  title, subtitle, accentColor, cta, onCta, mt = 24, children,
}: {
  title: string; subtitle?: string; accentColor?: string;
  cta?: string; onCta?: () => void; mt?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 680, behavior: "smooth" });

  return (
    <section style={{ marginTop: mt }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div>
          <h2 style={{
            fontSize: 18, fontWeight: 700, color: accentColor ?? "#1A1A18",
            letterSpacing: "-0.01em", margin: 0,
          }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 13, color: "#A8A29E", margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {cta && (
            <button onClick={onCta} style={{
              background: "none", border: "none", color: accentColor ?? "#6366F1",
              fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 8px",
            }}>{cta}</button>
          )}
          <button onClick={() => scroll(-1)} style={{
            width: 28, height: 28, borderRadius: "50%", border: "1px solid #E4E3E1",
            background: "white", cursor: "pointer", color: "#57534E",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
          }}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button onClick={() => scroll(1)} style={{
            width: 28, height: 28, borderRadius: "50%", border: "1px solid #E4E3E1",
            background: "white", cursor: "pointer", color: "#57534E",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
          }}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>
      <div ref={ref} style={{
        display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8,
        scrollbarWidth: "none",
      }}>
        {children}
      </div>
    </section>
  );
}

/* ─── CategoryTile ────────────────────────────────────────────────────────── */
function CategoryTile({ label, hint, icon, bg, textColor, active, onClick }: {
  label: string; hint: string; icon: any;
  bg: string; textColor: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, width: 160, height: 90, borderRadius: 12, padding: "14px 16px",
        background: active ? textColor : bg,
        border: `1.5px solid ${active ? textColor : "transparent"}`,
        cursor: "pointer", textAlign: "left",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        transition: "all 0.15s", boxSizing: "border-box",
        boxShadow: active ? `0 4px 16px ${textColor}33` : "none",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 18, color: active ? "rgba(255,255,255,0.9)" : textColor }} />
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: active ? "white" : "#1A1A18", margin: 0, lineHeight: 1.2 }}>{label}</p>
        <p style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.7)" : "#A8A29E", margin: "2px 0 0" }}>{hint}</p>
      </div>
    </button>
  );
}

/* ─── TaskCard (horizontal scroll) ───────────────────────────────────────── */
function TaskCard({ task, wsColor: wc, onSelect }: { task: any; wsColor: typeof WS_COLOR[string]; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const statusBadge = task.status === "coming_soon" ? "即將推出" : null;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, width: 220, borderRadius: 12,
        background: "white", border: "1px solid #E4E3E1", cursor: "pointer",
        transition: "all 0.2s", overflow: "hidden",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Color bar top */}
      <div style={{ height: 6, background: wc.text }} />
      <div style={{ padding: "12px 14px 14px" }}>
        {/* Workspace chip */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 20, background: wc.bg,
          fontSize: 11, color: wc.text, fontWeight: 600, marginBottom: 8,
        }}>
          <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 9 }} />
          {wc.label}
        </div>

        {statusBadge && (
          <span style={{
            display: "inline-block", padding: "1px 6px", borderRadius: 4,
            background: "#FEF3C7", color: "#D97706", fontSize: 10, fontWeight: 600,
            marginLeft: 6,
          }}>{statusBadge}</span>
        )}

        <p style={{
          fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px",
          lineHeight: 1.3,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {task.name_zh ?? task.name_en ?? task.slug}
        </p>
        {task.description && (
          <p style={{
            fontSize: 12, color: "#A8A29E", margin: 0, lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {task.description}
          </p>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          {task.squad_name ? (
            <span style={{ fontSize: 11, color: "#A8A29E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
              <FontAwesomeIcon icon={faUsers} style={{ marginRight: 4 }} />
              {task.squad_name}
            </span>
          ) : task.agent_name ? (
            <span style={{ fontSize: 11, color: "#A8A29E" }}>
              <FontAwesomeIcon icon={faRobot} style={{ marginRight: 4 }} />
              {task.agent_name}
            </span>
          ) : <span />}
          {task.estimated_minutes && (
            <span style={{ fontSize: 11, color: "#A8A29E" }}>~{task.estimated_minutes}min</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── TaskGridCard (3-col grid) ──────────────────────────────────────────── */
function TaskGridCard({ task, onSelect }: { task: any; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const wc = wsColor(task.workspace);
  const statusBadge = task.status === "coming_soon" ? "即將推出" : null;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "white", borderRadius: 12, border: "1px solid #E4E3E1",
        overflow: "hidden", cursor: "pointer", transition: "all 0.2s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Hero area */}
      <div style={{
        height: 100, background: wc.bg, display: "flex",
        alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 36, color: wc.text, opacity: 0.5 }} />
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "white", borderRadius: 6, padding: "3px 8px",
          fontSize: 11, fontWeight: 600, color: wc.text,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 9 }} />
          {wc.label}
        </div>
        {statusBadge && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            background: "#FEF3C7", borderRadius: 6, padding: "3px 8px",
            fontSize: 11, fontWeight: 600, color: "#D97706",
          }}>{statusBadge}</div>
        )}
        {hovered && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: wc.text, color: "white", borderRadius: 20,
              padding: "7px 18px", fontSize: 13, fontWeight: 600,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}>
              使用此範本
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p style={{
          fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px",
          lineHeight: 1.3,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {task.name_zh ?? task.name_en ?? task.slug}
        </p>
        {task.description && (
          <p style={{
            fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {task.description}
          </p>
        )}
        {(task.squad_name || task.agent_name) && (
          <p style={{ fontSize: 11, color: "#A8A29E", margin: "8px 0 0" }}>
            {task.squad_name ? (
              <><FontAwesomeIcon icon={faUsers} style={{ marginRight: 4 }} />{task.squad_name}</>
            ) : (
              <><FontAwesomeIcon icon={faRobot} style={{ marginRight: 4 }} />{task.agent_name}</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── TaskListRow ─────────────────────────────────────────────────────────── */
function TaskListRow({ task, onSelect }: { task: any; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const wc = wsColor(task.workspace);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
        borderRadius: 10, background: hovered ? "#FAFAF9" : "white",
        border: "1px solid #E4E3E1", cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 8, background: wc.bg, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 16, color: wc.text }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: 0, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
          {task.name_zh ?? task.name_en}
        </p>
        {task.description && (
          <p style={{ fontSize: 12, color: "#A8A29E", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.description}
          </p>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{
          padding: "3px 10px", borderRadius: 20, background: wc.bg,
          fontSize: 12, color: wc.text, fontWeight: 600,
        }}>{wc.label}</span>
        {task.estimated_minutes && (
          <span style={{ fontSize: 12, color: "#A8A29E" }}>~{task.estimated_minutes}min</span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onSelect(); }}
          style={{
            padding: "5px 14px", borderRadius: 6, background: wc.text, color: "white",
            border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          使用
        </button>
      </div>
    </div>
  );
}

/* ─── SquadCard (horizontal scroll) ─────────────────────────────────────── */
function SquadCard({ squad, onClick }: { squad: any; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const layer = String(squad.strategy_layer ?? "L1").slice(0, 2).toUpperCase();
  const lc = layerColor(layer);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, width: 240, borderRadius: 12,
        background: "white", border: "1px solid #E4E3E1", cursor: "pointer",
        overflow: "hidden", transition: "all 0.2s",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Hero */}
      <div style={{
        height: 110, background: lc.bg, display: "flex",
        alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <MethodologyGlyph
          seed={squad.slug ?? String(squad.id)}
          layer={(layer as MosLayer) ?? "L1"}
          size={80}
        />
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "white", borderRadius: 6, padding: "3px 8px",
          fontSize: 11, fontWeight: 600, color: lc.text,
        }}>{layer}</div>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p style={{
          fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px",
          lineHeight: 1.3, overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {squad.name}
        </p>
        {squad.description && (
          <p style={{
            fontSize: 12, color: "#A8A29E", margin: 0, lineHeight: 1.4,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {squad.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── SquadGridCard ──────────────────────────────────────────────────────── */
function SquadGridCard({ squad }: { squad: any }) {
  const [hovered, setHovered] = useState(false);
  const layer = String(squad.strategy_layer ?? "L1").slice(0, 2).toUpperCase();
  const lc = layerColor(layer);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "white", borderRadius: 12, border: "1px solid #E4E3E1",
        overflow: "hidden", cursor: "pointer", transition: "all 0.2s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        height: 100, background: lc.bg, display: "flex",
        alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <MethodologyGlyph seed={squad.slug ?? String(squad.id)} layer={(layer as MosLayer) ?? "L1"} size={64} />
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "white", borderRadius: 6, padding: "3px 8px",
          fontSize: 11, fontWeight: 600, color: lc.text,
        }}>{layer}・方法論小組</div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px" }}>{squad.name}</p>
        {squad.description && (
          <p style={{ fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {squad.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── TaskDetailModal ─────────────────────────────────────────────────────── */
function TaskDetailModal({ task, onClose, onLaunch }: {
  task: any; onClose: () => void; onLaunch: (t: any) => void;
}) {
  const wc = wsColor(task.workspace);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9000, padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 20, width: "100%", maxWidth: 600,
          maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div style={{ height: 120, background: wc.bg, position: "relative", borderRadius: "20px 20px 0 0" }}>
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 48, color: wc.text, opacity: 0.4 }} />
          </div>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12,
              background: "white", border: "none", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer", color: "#57534E",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div style={{ padding: "24px 28px 28px" }}>
          {/* Badge row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <span style={{
              padding: "4px 10px", borderRadius: 20, background: wc.bg,
              fontSize: 12, fontWeight: 600, color: wc.text,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <FontAwesomeIcon icon={wc.icon} style={{ fontSize: 10 }} />
              {wc.label}
            </span>
            {task.status === "coming_soon" && (
              <span style={{ padding: "4px 10px", borderRadius: 20, background: "#FEF3C7", fontSize: 12, fontWeight: 600, color: "#D97706" }}>
                即將推出
              </span>
            )}
            {task.impl_kind && (
              <span style={{ padding: "4px 10px", borderRadius: 20, background: "#F5F5F4", fontSize: 12, color: "#57534E" }}>
                {task.impl_kind}
              </span>
            )}
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A18", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            {task.name_zh ?? task.name_en}
          </h2>

          {task.methodology_label && (
            <p style={{ fontSize: 14, color: "#6366F1", fontWeight: 600, margin: "0 0 12px" }}>
              {task.methodology_label}
            </p>
          )}

          {task.description && (
            <p style={{ fontSize: 14, color: "#57534E", lineHeight: 1.6, margin: "0 0 20px" }}>
              {task.description}
            </p>
          )}

          {/* Meta */}
          <div style={{ display: "flex", gap: 20, padding: "16px 0", borderTop: "1px solid #F0F0EE", borderBottom: "1px solid #F0F0EE", marginBottom: 20 }}>
            {task.squad_name && (
              <div>
                <p style={{ fontSize: 11, color: "#A8A29E", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>方法論小組</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: 0 }}>
                  <FontAwesomeIcon icon={faUsers} style={{ marginRight: 6, color: "#6366F1" }} />
                  {task.squad_name}
                </p>
              </div>
            )}
            {task.agent_name && (
              <div>
                <p style={{ fontSize: 11, color: "#A8A29E", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>執行 Agent</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: 0 }}>
                  <FontAwesomeIcon icon={faRobot} style={{ marginRight: 6, color: "#7C3AED" }} />
                  {task.agent_name}
                </p>
              </div>
            )}
            {task.estimated_minutes && (
              <div>
                <p style={{ fontSize: 11, color: "#A8A29E", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>預估時間</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: 0 }}>~{task.estimated_minutes} 分鐘</p>
              </div>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={() => onLaunch(task)}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white", border: "none", fontSize: 16, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}
          >
            <FontAwesomeIcon icon={faRocket} />
            使用此範本
          </button>
        </div>
      </div>
    </div>
  );
}
