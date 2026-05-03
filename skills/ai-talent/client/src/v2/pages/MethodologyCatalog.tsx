/**
 * MethodologyCatalog — 範本目錄（Canva 風格，純 inline-CSS）
 *
 * 正確的資料模型（修正版）：
 *   範本頁面 = 展示平台目錄（用戶使用「之前」）
 *     - Squads   → trpc.squad.listForFront({ includeUnapproved: true })
 *                  繞過 is_approved gate，CJ 可以看到所有 active squads
 *     - Agents   → entity.listForHome (kind="agent")
 *     - Skills   → entity.listForHome (kind="skill")
 *
 *   專案頁面 = 展示用戶的 Mission（用戶使用「之後」）
 *     → ProjectsPage / MissionsHome（不在本頁面）
 *
 * 絕對不放 task_catalog：那是 mission 執行步驟，不是範本目錄。
 *
 * 頁面結構：
 *   1. 漸層 Hero — 搜尋 + 快速篩選 pills
 *   2. 探索類別 — L1–L6 + Agent + Skill 橫向捲動 tiles
 *   3. 精選 Squads — 橫向捲動
 *   4. Agents — 橫向捲動
 *   5. Skills — 橫向捲動
 *   6. 為你提供更多 — 3-col 網格，可按類型 + 層級篩選
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronLeft, faChevronRight,
  faCrown, faRocket, faStar, faEllipsis,
  faUsers, faRobot, faCubes, faChevronDown, faXmark,
  faCircleInfo, faBullseye, faMessage, faPalette,
  faChartLine, faShareNodes, faVideo, faBriefcase,
  faPenNib, faImage, faMicrophoneLines, faChartColumn,
  faChessKnight, faCode, faWandSparkles,
} from "@fortawesome/free-solid-svg-icons";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import { agentAvatarUrl } from "../components/AgentAvatar";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

// ── Layer palette ────────────────────────────────────────────────────────────
const LAYER: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  L1: { bg: "#EEF2FF", text: "#4F46E5", label: "品牌策略", icon: faBullseye  },
  L2: { bg: "#FFF1F2", text: "#E11D48", label: "產品策略", icon: faBriefcase },
  L3: { bg: "#FFFBEB", text: "#D97706", label: "受眾策略", icon: faUsers     },
  L4: { bg: "#F5F3FF", text: "#7C3AED", label: "通路策略", icon: faShareNodes},
  L5: { bg: "#F0FDF4", text: "#16A34A", label: "活動策略", icon: faRocket    },
  L6: { bg: "#F5F5F4", text: "#57534E", label: "驗證校準", icon: faChartLine },
};
function layerInfo(raw?: string | null) {
  const k = String(raw ?? "L1").toUpperCase().match(/L([1-6])/)?.[0] ?? "L1";
  return LAYER[k] ?? LAYER.L1;
}

// ── Skill task_type icon ─────────────────────────────────────────────────────
const SKILL_ICON: Record<string, any> = {
  text: faPenNib, image: faImage, video: faVideo,
  audio: faMicrophoneLines, data: faChartColumn,
  research: faMagnifyingGlass, strategy: faChessKnight,
  code: faCode, generic: faWandSparkles,
};
function skillIcon(t?: string | null) {
  return SKILL_ICON[String(t ?? "").toLowerCase()] ?? faWandSparkles;
}

// ── Kind tabs ────────────────────────────────────────────────────────────────
type Kind = "squad" | "agent" | "skill";
const KIND_TABS: Array<{ id: Kind; label: string; icon: any }> = [
  { id: "squad", label: "方法論小組", icon: faUsers  },
  { id: "agent", label: "Agents",     icon: faRobot  },
  { id: "skill", label: "技能",       icon: faCubes  },
];

// ── Category tiles (Canva-style "探索範本") ──────────────────────────────────
const EXPLORE_TILES = [
  { key: "L1", label: "品牌策略",  hint: "定位 / 原型 / 敘事",       kind: "squad" as Kind, layer: "L1" },
  { key: "L2", label: "產品策略",  hint: "JTBD / 上市 / 價值主張",   kind: "squad" as Kind, layer: "L2" },
  { key: "L3", label: "受眾策略",  hint: "STP / Persona / 分眾",     kind: "squad" as Kind, layer: "L3" },
  { key: "L4", label: "通路策略",  hint: "FB / IG / YT / LinkedIn",  kind: "squad" as Kind, layer: "L4" },
  { key: "L5", label: "活動策略",  hint: "Launch / Campaign / Event", kind: "squad" as Kind, layer: "L5" },
  { key: "L6", label: "驗證校準",  hint: "監測 / 稽核 / 校準",       kind: "squad" as Kind, layer: "L6" },
  { key: "agent", label: "Agents", hint: "AI 角色與專家",            kind: "agent" as Kind, layer: "" },
  { key: "skill", label: "技能",   hint: "原子能力庫",               kind: "skill" as Kind, layer: "" },
];

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg: string, variant: "default" | "success" | "warn" = "default") {
  const el = document.createElement("div");
  el.textContent = msg;
  const bg = variant === "success" ? "#059669" : variant === "warn" ? "#D97706" : "#1A1A18";
  el.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
    background:${bg};color:white;padding:10px 22px;border-radius:10px;font-size:13px;
    font-weight:500;z-index:99999;white-space:nowrap;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,0.22);font-family:Inter,sans-serif;`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 2000);
}

// ── Layer options for dropdown ────────────────────────────────────────────────
const LAYER_OPTIONS = [
  { value: "ALL", label: "全部層級" },
  ...Object.entries(LAYER).map(([k, v]) => ({ value: k, label: `${k}・${v.label}` })),
];

// ════════════════════════════════════════════════════════════════════════════
export default function MethodologyCatalog() {
  const { brandId } = useOutletContext<ShellOutletCtx>();
  const [searchParams] = useSearchParams();

  const [searchQ,     setSearchQ]     = useState(() => searchParams.get("query") ?? "");
  const [activeKind,  setActiveKind]  = useState<Kind>(() => {
    const k = searchParams.get("kind");
    return (k === "agent" || k === "skill" || k === "squad") ? k as Kind : "squad";
  });
  const [layerFilter, setLayerFilter] = useState("ALL");
  const [layerOpen,   setLayerOpen]   = useState(false);
  const [kindOpen,    setKindOpen]    = useState(false);
  const [selected,    setSelected]    = useState<any | null>(null);

  // ── Data: squads (includeUnapproved bypasses is_approved gate) ────────────
  // CJ direction: CJ needs to see all active squads in /templates even
  // before they are manually approved. The approval gate (is_approved=1)
  // is only for anonymous/public access; authenticated staff see all.
  const squadQuery = trpc.squad.listForFront.useQuery(
    { includeUnapproved: true } as any,
    { refetchOnWindowFocus: false, staleTime: 30_000 }
  );

  // ── Data: agents + skills via entity.listForHome (best-effort) ────────────
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null, kinds: ["agent", "skill"] },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const squads:  any[] = useMemo(() => (squadQuery.data  as any[]) ?? [], [squadQuery.data]);
  const agents:  any[] = useMemo(() => ((entityQuery.data as any[]) ?? []).filter((e: any) => e.kind === "agent"), [entityQuery.data]);
  const skills:  any[] = useMemo(() => ((entityQuery.data as any[]) ?? []).filter((e: any) => e.kind === "skill"), [entityQuery.data]);

  const allEntities: any[] = useMemo(() => [
    ...squads.map(s => ({ ...s, kind: "squad" as Kind, strategyLayer: String(s.strategy_layer ?? "L1") })),
    ...agents,
    ...skills,
  ], [squads, agents, skills]);

  const isLoading = squadQuery.isLoading;

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    squad: squads.length,
    agent: agents.length,
    skill: skills.length,
    total: squads.length + agents.length + skills.length,
  }), [squads, agents, skills]);

  // ── Grid filtered ─────────────────────────────────────────────────────────
  const gridItems = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return allEntities.filter(e => {
      if (e.kind !== activeKind) return false;
      if (layerFilter !== "ALL" && !String(e.strategyLayer ?? e.strategy_layer ?? "").startsWith(layerFilter)) return false;
      if (!q) return true;
      return `${e.name ?? ""} ${e.description ?? ""} ${e.slug ?? ""}`.toLowerCase().includes(q);
    });
  }, [allEntities, activeKind, layerFilter, searchQ]);

  // ── Apply explore tile ────────────────────────────────────────────────────
  const applyTile = (tile: typeof EXPLORE_TILES[0]) => {
    setActiveKind(tile.kind);
    if (tile.layer) setLayerFilter(tile.layer);
    else setLayerFilter("ALL");
    setTimeout(() => document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  const layerLabel = LAYER_OPTIONS.find(o => o.value === layerFilter)?.label ?? "全部層級";
  const kindLabel  = KIND_TABS.find(t => t.id === activeKind)?.label ?? "方法論小組";

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF9", paddingBottom: 64 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "48px 40px 56px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -50, left: "35%", width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 860, position: "relative", zIndex: 1 }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px" }}>
            TEMPLATES · 範本庫
          </p>
          <h1 style={{ color: "white", fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.1 }}>
            什麼都可以做到
          </h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, margin: "0 0 30px", lineHeight: 1.6 }}>
            {counts.total > 0
              ? `${counts.squad} 個方法論小組 · ${counts.agent} 個 Agents · ${counts.skill} 個技能`
              : isLoading ? "載入中…" : "瀏覽我們的 Squad、Agent、Skill 目錄"}
          </p>

          {/* Search */}
          <div style={{ position: "relative", maxWidth: 580 }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              color: "#9CA3AF", fontSize: 16, zIndex: 1,
            }} />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋方法論小組、Agent、技能…"
              style={{
                width: "100%", padding: "14px 48px 14px 50px", borderRadius: 50,
                border: "none", fontSize: 15, outline: "none", background: "white",
                color: "#1A1A18", boxSizing: "border-box",
                boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              }}
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "#E5E5E3", border: "none", borderRadius: "50%",
                width: 24, height: 24, cursor: "pointer", color: "#57534E",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
              }}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          {/* Quick pills */}
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {KIND_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveKind(t.id); setSearchQ(""); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{
                  padding: "7px 16px", borderRadius: 50, fontSize: 13,
                  background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
                  color: "white", cursor: "pointer", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 7,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              >
                <FontAwesomeIcon icon={t.icon} style={{ fontSize: 11 }} />
                {t.label}
                {counts[t.id] > 0 && (
                  <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>
                    {counts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 40px" }}>

        {/* ── 探索類別 tiles ───────────────────────────────────────────── */}
        <HScrollSection title="探索類別" mt={32}>
          {EXPLORE_TILES.map(t => {
            const li = t.layer ? layerInfo(t.layer) : { bg: t.key === "agent" ? "#F5F3FF" : "#EEF2FF", text: t.key === "agent" ? "#7C3AED" : "#4F46E5", icon: t.key === "agent" ? faRobot : faCubes };
            const active = t.layer ? activeKind === t.kind && layerFilter === t.layer : activeKind === t.kind;
            return (
              <button
                key={t.key}
                onClick={() => applyTile(t)}
                style={{
                  flexShrink: 0, width: 168, height: 92, borderRadius: 12,
                  padding: "14px 16px", background: active ? li.text : li.bg,
                  border: `1.5px solid ${active ? li.text : "transparent"}`,
                  cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  boxSizing: "border-box", transition: "all 0.15s",
                  boxShadow: active ? `0 4px 16px ${li.text}40` : "none",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
              >
                <FontAwesomeIcon icon={li.icon} style={{ fontSize: 18, color: active ? "rgba(255,255,255,0.85)" : li.text }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: active ? "white" : "#1A1A18", margin: 0, lineHeight: 1.2 }}>{t.label}</p>
                  <p style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.65)" : "#A8A29E", margin: "2px 0 0" }}>{t.hint}</p>
                </div>
              </button>
            );
          })}
        </HScrollSection>

        {/* ── 精選方法論小組 ─────────────────────────────────────────────── */}
        <HScrollSection
          title="精選方法論小組"
          subtitle={`${counts.squad} 個預配好的 agent 編組，照工作流跑出產出`}
          accentColor="#4F46E5"
          cta="完整目錄 →"
          onCta={() => { setActiveKind("squad"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
          loading={isLoading}
          mt={32}
        >
          {squads.slice(0, 24).map(s => (
            <SquadCard key={s.id} squad={s} onSelect={() => setSelected({ ...s, kind: "squad", strategyLayer: s.strategy_layer })} />
          ))}
        </HScrollSection>

        {/* ── Agents ──────────────────────────────────────────────────────── */}
        {agents.length > 0 && (
          <HScrollSection
            title="精選 Agents"
            subtitle={`${counts.agent} 個個別 AI 專家角色`}
            accentColor="#7C3AED"
            cta="完整目錄 →"
            onCta={() => { setActiveKind("agent"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
            mt={28}
          >
            {agents.slice(0, 24).map((e: any) => (
              <AgentCard key={e.id} entity={e} onSelect={() => setSelected(e)} />
            ))}
          </HScrollSection>
        )}

        {/* ── 技能 ─────────────────────────────────────────────────────────── */}
        {skills.length > 0 && (
          <HScrollSection
            title="精選技能"
            subtitle={`${counts.skill} 個原子能力，可被 Agent 套用`}
            accentColor="#059669"
            cta="完整目錄 →"
            onCta={() => { setActiveKind("skill"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
            mt={28}
          >
            {skills.slice(0, 24).map((e: any) => (
              <SkillCard key={e.id} entity={e} onSelect={() => setSelected(e)} />
            ))}
          </HScrollSection>
        )}

        {/* ── 為你提供更多 grid ─────────────────────────────────────────── */}
        <div id="grid-section" style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A18", margin: "0 0 2px", letterSpacing: "-0.01em" }}>
                為你提供更多範本
              </h2>
              <p style={{ fontSize: 13, color: "#A8A29E", margin: 0 }}>
                {gridItems.length} 個 {kindLabel}{layerFilter !== "ALL" ? ` · ${layerLabel}` : ""}
              </p>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* Kind dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setKindOpen(v => !v); setLayerOpen(false); }}
                  style={{
                    padding: "7px 14px", borderRadius: 50, border: "1px solid #E4E3E1",
                    background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A18",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <FontAwesomeIcon icon={KIND_TABS.find(t => t.id === activeKind)?.icon ?? faUsers} style={{ fontSize: 11 }} />
                  {kindLabel}
                  <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10, color: "#A8A29E" }} />
                </button>
                {kindOpen && (
                  <DropMenu onClose={() => setKindOpen(false)}>
                    {KIND_TABS.map(t => (
                      <DropItem key={t.id} active={activeKind === t.id} onClick={() => { setActiveKind(t.id); setKindOpen(false); }}>
                        <FontAwesomeIcon icon={t.icon} style={{ width: 14 }} />
                        {t.label} ({counts[t.id]})
                      </DropItem>
                    ))}
                  </DropMenu>
                )}
              </div>

              {/* Layer dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setLayerOpen(v => !v); setKindOpen(false); }}
                  style={{
                    padding: "7px 14px", borderRadius: 50, border: "1px solid #E4E3E1",
                    background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A18",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {layerLabel}
                  <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10, color: "#A8A29E" }} />
                </button>
                {layerOpen && (
                  <DropMenu onClose={() => setLayerOpen(false)}>
                    {LAYER_OPTIONS.map(o => (
                      <DropItem key={o.value} active={layerFilter === o.value} onClick={() => { setLayerFilter(o.value); setLayerOpen(false); }}>
                        {o.label}
                      </DropItem>
                    ))}
                  </DropMenu>
                )}
              </div>
            </div>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 200, borderRadius: 12, background: "#F0F0EE", animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && gridItems.length === 0 && (
            <div style={{ padding: "60px 24px", textAlign: "center", border: "2px dashed #E4E3E1", borderRadius: 16 }}>
              <FontAwesomeIcon icon={faCircleInfo} style={{ fontSize: 36, color: "#D1D0CE", marginBottom: 16 }} />
              <p style={{ fontSize: 16, fontWeight: 600, color: "#57534E", margin: "0 0 8px" }}>
                沒有符合的{kindLabel}
              </p>
              <p style={{ fontSize: 14, color: "#A8A29E", margin: "0 0 16px" }}>
                試試清除搜尋，或換個層級篩選
              </p>
              <button
                onClick={() => { setSearchQ(""); setLayerFilter("ALL"); }}
                style={{
                  padding: "8px 20px", borderRadius: 8, background: "#6366F1",
                  color: "white", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
              >
                清除篩選
              </button>
            </div>
          )}

          {/* Grid */}
          {!isLoading && gridItems.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {gridItems.map((e: any) => (
                <GridCard key={`${e.kind}-${e.id}`} entity={e} onSelect={() => setSelected(e)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      {selected && (
        <DetailModal
          entity={selected}
          onClose={() => setSelected(null)}
          onLaunch={(e: any) => {
            setSelected(null);
            const qs = new URLSearchParams();
            if (e.slug) qs.set("slug", e.slug);
            const ws = Array.isArray(e.workspace) ? e.workspace[0] : (e.workspace ?? "");
            if (ws) qs.set("workspace", ws);
            if (e.strategyLayer) qs.set("layer", String(e.strategyLayer).slice(0, 2));
            window.open(`/picker?${qs}`, "_blank", "noopener");
          }}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}

/* ── HScrollSection ─────────────────────────────────────────────────────── */
function HScrollSection({ title, subtitle, accentColor, cta, onCta, loading, mt = 24, children }: {
  title: string; subtitle?: string; accentColor?: string;
  cta?: string; onCta?: () => void; loading?: boolean; mt?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: 1 | -1) => ref.current?.scrollBy({ left: d * 680, behavior: "smooth" });
  return (
    <section style={{ marginTop: mt }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: accentColor ?? "#1A1A18", margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 13, color: "#A8A29E", margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {cta && <button onClick={onCta} style={{ background: "none", border: "none", color: accentColor ?? "#6366F1", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 8px" }}>{cta}</button>}
          <button onClick={() => scroll(-1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #E4E3E1", background: "white", cursor: "pointer", color: "#57534E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button onClick={() => scroll(1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid #E4E3E1", background: "white", cursor: "pointer", color: "#57534E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>
      {loading ? (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ flexShrink: 0, width: 240, height: 160, borderRadius: 12, background: "#F0F0EE", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : (
        <div ref={ref} style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ── SquadCard (horizontal scroll) ─────────────────────────────────────── */
function SquadCard({ squad, onSelect }: { squad: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const li = layerInfo(squad.strategy_layer);
  const layer = String(squad.strategy_layer ?? "L1").slice(0, 2).toUpperCase();
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flexShrink: 0, width: 240, borderRadius: 12, background: "white",
        border: "1px solid #E4E3E1", cursor: "pointer", overflow: "hidden",
        transition: "all 0.2s",
        transform: hov ? "translateY(-3px)" : "none",
        boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ height: 110, background: li.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <MethodologyGlyph seed={squad.slug ?? String(squad.id)} layer={(layer as MosLayer)} size={76} />
        <div style={{ position: "absolute", top: 8, left: 8, background: "white", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: li.text }}>
          {layer}・{li.label}
        </div>
        {hov && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: li.text, color: "white", borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 600 }}>預覽</div>
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {squad.name}
        </p>
        {squad.description && (
          <p style={{ fontSize: 11, color: "#A8A29E", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {squad.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── AgentCard ──────────────────────────────────────────────────────────── */
function AgentCard({ entity, onSelect }: { entity: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const avatarUrl = entity.coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "");
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flexShrink: 0, width: 190, borderRadius: 12, background: "white",
        border: "1px solid #E4E3E1", cursor: "pointer", overflow: "hidden",
        transition: "all 0.2s",
        transform: hov ? "translateY(-3px)" : "none",
        boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ height: 130, background: "#F5F3FF", position: "relative", overflow: "hidden" }}>
        <img
          src={avatarUrl}
          alt={entity.name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => { const img = e.currentTarget; const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? ""); if (img.src !== fb) img.src = fb; }}
        />
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.92)", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "#7C3AED" }}>Agent</div>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", margin: "0 0 2px" }}>{entity.name}</p>
        {entity.subtitle && <p style={{ fontSize: 11, color: "#A8A29E", margin: 0 }}>{entity.subtitle}</p>}
      </div>
    </div>
  );
}

/* ── SkillCard ──────────────────────────────────────────────────────────── */
function SkillCard({ entity, onSelect }: { entity: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flexShrink: 0, width: 220, borderRadius: 12, background: "white",
        border: "1px solid #E4E3E1", cursor: "pointer", overflow: "hidden",
        transition: "all 0.2s",
        transform: hov ? "translateY(-3px)" : "none",
        boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ height: 100, background: "#F0FDF4", display: "flex", alignItems: "flex-end", padding: "0 14px 12px", position: "relative" }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#059669", margin: 0, lineHeight: 1.1, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {entity.name}
        </p>
        <FontAwesomeIcon icon={skillIcon(entity.taskType)} style={{ fontSize: 22, color: "#059669", opacity: 0.4 }} />
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "#059669" }}>技能</div>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        {entity.description && (
          <p style={{ fontSize: 11, color: "#A8A29E", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {entity.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── GridCard (3-col grid) ────────────────────────────────────────────── */
function GridCard({ entity, onSelect }: { entity: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const li = layerInfo(entity.strategyLayer ?? entity.strategy_layer);
  const layer = String(entity.strategyLayer ?? entity.strategy_layer ?? "L1").slice(0, 2).toUpperCase();

  if (entity.kind === "agent") {
    const avatarUrl = entity.coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "");
    return (
      <div onClick={onSelect} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ background: "white", borderRadius: 12, border: "1px solid #E4E3E1", overflow: "hidden", cursor: "pointer", transition: "all 0.2s", transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ height: 140, background: "#F5F3FF", position: "relative", overflow: "hidden" }}>
          <img src={avatarUrl} alt={entity.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { const img = e.currentTarget; const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? ""); if (img.src !== fb) img.src = fb; }} />
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.92)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "#7C3AED" }}>Agent</div>
          {hov && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "#7C3AED", color: "white", borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600 }}>套用 Agent</div></div>}
        </div>
        <div style={{ padding: "12px 14px" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px" }}>{entity.name}</p>
          {entity.subtitle && <p style={{ fontSize: 12, color: "#A8A29E", margin: 0 }}>{entity.subtitle}</p>}
        </div>
      </div>
    );
  }

  if (entity.kind === "skill") {
    return (
      <div onClick={onSelect} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ background: "white", borderRadius: 12, border: "1px solid #E4E3E1", overflow: "hidden", cursor: "pointer", transition: "all 0.2s", transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ height: 120, background: "#F0FDF4", display: "flex", alignItems: "flex-end", padding: "0 16px 14px", position: "relative" }}>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#059669", margin: 0, flex: 1, lineHeight: 1.1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{entity.name}</p>
          <FontAwesomeIcon icon={skillIcon(entity.taskType)} style={{ fontSize: 28, color: "#059669", opacity: 0.35 }} />
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "#059669" }}>技能</div>
          {hov && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "#059669", color: "white", borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600 }}>套用技能</div></div>}
        </div>
        <div style={{ padding: "12px 14px" }}>
          {entity.description && <p style={{ fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{entity.description}</p>}
        </div>
      </div>
    );
  }

  // Squad
  return (
    <div onClick={onSelect} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: "white", borderRadius: 12, border: "1px solid #E4E3E1", overflow: "hidden", cursor: "pointer", transition: "all 0.2s", transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ height: 130, background: li.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <MethodologyGlyph seed={entity.slug ?? String(entity.id)} layer={(layer as MosLayer)} size={80} />
        <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.92)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: li.text }}>{layer}・{li.label}</div>
        {entity.is_approved === 0 && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "#FEF3C7", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, color: "#D97706" }}>審核中</div>
        )}
        {hov && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: li.text, color: "white", borderRadius: 20, padding: "7px 18px", fontSize: 13, fontWeight: 600 }}>啟動小組</div></div>}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 4px", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{entity.name}</p>
        {entity.description && <p style={{ fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{entity.description}</p>}
      </div>
    </div>
  );
}

/* ── Dropdown helpers ───────────────────────────────────────────────────── */
function DropMenu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
      background: "white", borderRadius: 12, minWidth: 200, padding: "6px 0",
      boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
      border: "1px solid rgba(0,0,0,0.07)",
    }}>
      {children}
    </div>
  );
}
function DropItem({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", padding: "8px 16px", border: "none", textAlign: "left",
        background: active ? "#EEF2FF" : hov ? "#FAFAF9" : "white",
        color: active ? "#4F46E5" : "#1A1A18", fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8, fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

/* ── DetailModal ────────────────────────────────────────────────────────── */
function DetailModal({ entity, onClose, onLaunch }: {
  entity: any; onClose: () => void; onLaunch: (e: any) => void;
}) {
  const li = layerInfo(entity.strategyLayer ?? entity.strategy_layer);
  const layer = String(entity.strategyLayer ?? entity.strategy_layer ?? "L1").slice(0, 2).toUpperCase();
  const isSquad = entity.kind === "squad";
  const isAgent = entity.kind === "agent";
  const isSkill = entity.kind === "skill";
  const ctaLabel = isSquad ? "啟動小組" : isAgent ? "套用 Agent" : "套用技能";

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9000, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 20, width: "100%", maxWidth: 680,
        maxHeight: "86vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
      }}>
        {/* Hero */}
        <div style={{ height: 160, background: isAgent ? "#F5F3FF" : isSkill ? "#F0FDF4" : li.bg, position: "relative", borderRadius: "20px 20px 0 0", overflow: "hidden" }}>
          {isAgent ? (
            <img
              src={entity.coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "")}
              alt={entity.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : isSkill ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FontAwesomeIcon icon={skillIcon(entity.taskType)} style={{ fontSize: 72, color: "#059669", opacity: 0.25 }} />
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MethodologyGlyph seed={entity.slug ?? String(entity.id)} layer={(layer as MosLayer)} size={120} />
            </div>
          )}
          <button onClick={onClose} style={{
            position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.9)",
            border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#57534E",
          }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div style={{ padding: "24px 28px 32px" }}>
          {/* Chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {isSquad && (
              <span style={{ padding: "4px 10px", borderRadius: 20, background: li.bg, fontSize: 12, fontWeight: 700, color: li.text }}>
                {layer}・{li.label}
              </span>
            )}
            <span style={{ padding: "4px 10px", borderRadius: 20, background: isAgent ? "#F5F3FF" : isSkill ? "#F0FDF4" : "#F5F5F4", fontSize: 12, fontWeight: 600, color: isAgent ? "#7C3AED" : isSkill ? "#059669" : "#57534E" }}>
              {isSquad ? "方法論小組" : isAgent ? "Agent" : "技能"}
            </span>
            {isSquad && entity.is_approved === 0 && (
              <span style={{ padding: "4px 10px", borderRadius: 20, background: "#FEF3C7", fontSize: 12, fontWeight: 600, color: "#D97706" }}>審核中</span>
            )}
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#1A1A18", margin: "0 0 8px", letterSpacing: "-0.01em" }}>{entity.name}</h2>
          {entity.subtitle && <p style={{ fontSize: 14, color: "#6366F1", fontWeight: 600, margin: "0 0 14px" }}>{entity.subtitle}</p>}
          {entity.description && <p style={{ fontSize: 14, color: "#57534E", lineHeight: 1.65, margin: "0 0 24px" }}>{entity.description}</p>}

          {/* CTA */}
          <button
            onClick={() => onLaunch(entity)}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white", border: "none", fontSize: 16, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}
          >
            <FontAwesomeIcon icon={faRocket} />
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
