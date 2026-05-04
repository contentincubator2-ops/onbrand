/**
 * MethodologyCatalog — 範本目錄（Canva 風格，純 inline-CSS）
 *
 * 資料模型（正確版）：
 *   範本頁面 = 平台目錄（用戶使用「之前」）
 *     - entity.listForHome  → squads + agents + skills（含圖片）
 *     - squad.listForFront(includeUnapproved:true) → 補上未審核的 squads
 *   不放 task_catalog（那是 mission 執行步驟，不是範本）
 *
 * 卡片風格：原版 LandscapeCard（有圖，inline-CSS 版本）
 *   - Squad  → MethodologyGlyph + layer chip
 *   - Agent  → 全幅 avatar 圖片
 *   - Skill  → 大字技能名 + task-type icon
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronLeft, faChevronRight,
  faRocket, faStar, faEllipsis, faUsers, faRobot, faCubes,
  faChevronDown, faXmark, faCircleInfo, faBullseye, faPalette,
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
  L1: { bg: "#EEF2FF", text: "#4F46E5", label: "品牌策略", icon: faBullseye   },
  L2: { bg: "#FFF1F2", text: "#E11D48", label: "產品策略", icon: faBriefcase  },
  L3: { bg: "#FFFBEB", text: "#D97706", label: "受眾策略", icon: faUsers      },
  L4: { bg: "#F5F3FF", text: "#7C3AED", label: "通路策略", icon: faShareNodes },
  L5: { bg: "#F0FDF4", text: "#16A34A", label: "活動策略", icon: faRocket     },
  L6: { bg: "#F5F5F4", text: "#57534E", label: "驗證校準", icon: faChartLine  },
};
function layerInfo(raw?: string | null) {
  const k = String(raw ?? "L1").toUpperCase().match(/L([1-6])/)?.[0] ?? "L1";
  return { key: k, ...(LAYER[k] ?? LAYER.L1) };
}

// ── Skill icon ────────────────────────────────────────────────────────────────
const SKILL_ICON: Record<string, any> = {
  text: faPenNib, image: faImage, video: faVideo, audio: faMicrophoneLines,
  data: faChartColumn, research: faMagnifyingGlass, strategy: faChessKnight,
  code: faCode, generic: faWandSparkles,
};
const skillIcon = (t?: string | null) => SKILL_ICON[String(t ?? "").toLowerCase()] ?? faWandSparkles;

// ── Kind tabs ────────────────────────────────────────────────────────────────
type Kind = "squad" | "agent" | "skill";
const KIND_TABS: Array<{ id: Kind; label: string; icon: any }> = [
  { id: "squad", label: "方法論小組", icon: faUsers  },
  { id: "agent", label: "Agents",     icon: faRobot  },
  { id: "skill", label: "技能",       icon: faCubes  },
];

// ── Category explore tiles ───────────────────────────────────────────────────
const EXPLORE_TILES = [
  { key: "L1", label: "品牌策略", hint: "定位 / 原型 / 敘事",        kind: "squad" as Kind, layer: "L1" },
  { key: "L2", label: "產品策略", hint: "JTBD / 上市 / 價值主張",    kind: "squad" as Kind, layer: "L2" },
  { key: "L3", label: "受眾策略", hint: "STP / Persona / 分眾",      kind: "squad" as Kind, layer: "L3" },
  { key: "L4", label: "通路策略", hint: "FB / IG / YT / LinkedIn",   kind: "squad" as Kind, layer: "L4" },
  { key: "L5", label: "活動策略", hint: "Launch / Campaign / Event",  kind: "squad" as Kind, layer: "L5" },
  { key: "L6", label: "驗證校準", hint: "監測 / 稽核 / 校準",        kind: "squad" as Kind, layer: "L6" },
  { key: "agent", label: "Agents", hint: "AI 角色與專家",            kind: "agent" as Kind, layer: "" },
  { key: "skill", label: "技能",   hint: "原子能力庫",               kind: "skill" as Kind, layer: "" },
];

const LAYER_OPTIONS = [
  { value: "ALL", label: "全部層級" },
  ...Object.entries(LAYER).map(([k, v]) => ({ value: k, label: `${k}・${v.label}` })),
];

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
    background:#1A1A18;color:white;padding:10px 22px;border-radius:10px;font-size:13px;
    font-weight:500;z-index:99999;white-space:nowrap;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,0.22);font-family:Inter,sans-serif;`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 2000);
}

// ════════════════════════════════════════════════════════════════════════════
export default function MethodologyCatalog() {
  const { brandId } = useOutletContext<ShellOutletCtx>();
  const [searchParams] = useSearchParams();

  const [searchQ,     setSearchQ]    = useState(() => searchParams.get("query") ?? "");
  const [activeKind,  setActiveKind] = useState<Kind>(() => {
    const k = searchParams.get("kind");
    return (k === "agent" || k === "skill" || k === "squad") ? k as Kind : "squad";
  });
  const [layerFilter, setLayerFilter] = useState("ALL");
  const [layerOpen,   setLayerOpen]   = useState(false);
  const [kindOpen,    setKindOpen]    = useState(false);
  const [selected,    setSelected]    = useState<any | null>(null);

  // ── Data: squad.listForFront(includeUnapproved) → ALL active squads w/ images
  // Now returns hero_image_url + mockup_images (added to server query)
  const squadQuery = trpc.squad.listForFront.useQuery(
    { includeUnapproved: true } as any,
    { refetchOnWindowFocus: false, staleTime: 30_000 }
  );

  // ── Data: agents via trpc.agent.list (typed, reliable — uses getSoworkDb) ──
  const agentQuery = trpc.agent.list.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: false, staleTime: 30_000 }
  );

  // ── Data: entity.listForHome → skills + any enrichment ───────────────────
  // Best-effort: provides skills + agents-from-skills (agent-template category).
  // Falls back gracefully if localPool/getSoworkDb is unavailable.
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  // ── Normalize squad data (listForFront now has images) ────────────────────
  const squads: any[] = useMemo(() => {
    return ((squadQuery.data as any[]) ?? []).map((s: any) => {
      // Parse mockup_images JSON → pick first as coverImageUrl fallback
      let mockupImages: string[] = [];
      try {
        if (typeof s.mockup_images === "string") mockupImages = JSON.parse(s.mockup_images);
        else if (Array.isArray(s.mockup_images)) mockupImages = s.mockup_images;
      } catch {}
      return {
        id: s.id,
        kind: "squad" as Kind,
        slug: s.slug,
        name: s.name,
        description: s.description,
        strategyLayer: String(s.strategy_layer ?? "L1").slice(0, 2).toUpperCase(),
        // Three-tier image fallback: hero_image_url → mockupImages[0] → MethodologyGlyph
        coverImageUrl: s.hero_image_url ?? mockupImages[0] ?? null,
        mockupImages,
        is_approved: s.is_approved,
      };
    });
  }, [squadQuery.data]);

  // ── Normalize agent data ───────────────────────────────────────────────────
  const agents: any[] = useMemo(() => {
    const fromAgent = ((agentQuery.data as any[]) ?? []).map((a: any) => ({
      id: a.id,
      kind: "agent" as Kind,
      slug: a.slug ?? `agent-${a.id}`,
      name: a.name_zh ?? a.name ?? "",
      subtitle: a.title_zh ?? a.title ?? null,
      description: a.bio_zh ?? a.bio ?? a.specialty ?? null,
      strategyLayer: "L4",
      coverImageUrl: a.avatarUrl ?? null,
    }));
    // Also grab agents from entity.listForHome if available (more enriched)
    const fromEntity = ((entityQuery.data as any[]) ?? []).filter((e: any) => e.kind === "agent");
    // Merge: entity data wins for slugs that overlap (has more fields)
    const entitySlugs = new Set(fromEntity.map((e: any) => e.slug));
    const extra = fromAgent.filter(a => !entitySlugs.has(a.slug));
    return [...fromEntity, ...extra];
  }, [agentQuery.data, entityQuery.data]);

  // ── Skills from entity.listForHome ───────────────────────────────────────
  const skills: any[] = useMemo(() =>
    ((entityQuery.data as any[]) ?? []).filter((e: any) => e.kind === "skill"),
  [entityQuery.data]);

  const counts = useMemo(() => ({
    squad: squads.length, agent: agents.length, skill: skills.length,
    total: squads.length + agents.length + skills.length,
  }), [squads, agents, skills]);

  const allEntities: any[] = useMemo(() => [...squads, ...agents, ...skills], [squads, agents, skills]);

  const isLoading = squadQuery.isLoading && agentQuery.isLoading;

  // ── Grid filter ───────────────────────────────────────────────────────────
  const gridItems = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return allEntities.filter(e => {
      if (e.kind !== activeKind) return false;
      const layer = String(e.strategyLayer ?? e.strategy_layer ?? "").slice(0, 2);
      if (layerFilter !== "ALL" && layer !== layerFilter) return false;
      if (!q) return true;
      return `${e.name ?? ""} ${e.description ?? ""} ${e.slug ?? ""}`.toLowerCase().includes(q);
    });
  }, [allEntities, activeKind, layerFilter, searchQ]);

  const applyTile = (t: typeof EXPLORE_TILES[0]) => {
    setActiveKind(t.kind);
    setLayerFilter(t.layer || "ALL");
    setTimeout(() => document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  const layerLabel = LAYER_OPTIONS.find(o => o.value === layerFilter)?.label ?? "全部層級";
  const kindLabel  = KIND_TABS.find(t => t.id === activeKind)?.label ?? "方法論小組";

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF9", paddingBottom: 64 }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "48px 40px 56px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -50, left: "35%", width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 860, position: "relative", zIndex: 1 }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px" }}>TEMPLATES · 範本庫</p>
          <h1 style={{ color: "white", fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.1 }}>什麼都可以做到</h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, margin: "0 0 30px", lineHeight: 1.6 }}>
            {counts.total > 0
              ? `${counts.squad} 個方法論小組 · ${counts.agent} 個 Agents · ${counts.skill} 個技能`
              : isLoading ? "載入中…" : "瀏覽我們的 Squad、Agent、Skill 目錄"}
          </p>

          {/* Search */}
          <div style={{ position: "relative", maxWidth: 580 }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 16, zIndex: 1 }} />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋方法論小組、Agent、技能…"
              style={{ width: "100%", padding: "14px 48px 14px 50px", borderRadius: 50, border: "none", fontSize: 15, outline: "none", background: "white", color: "#1A1A18", boxSizing: "border-box", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "#E5E5E3", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", color: "#57534E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          {/* Kind pills */}
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {KIND_TABS.map(t => (
              <button key={t.id}
                onClick={() => { setActiveKind(t.id); setSearchQ(""); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ padding: "7px 16px", borderRadius: 50, fontSize: 13, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)", color: "white", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 7, transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              >
                <FontAwesomeIcon icon={t.icon} style={{ fontSize: 11 }} />
                {t.label}
                {counts[t.id] > 0 && <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{counts[t.id]}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 40px" }}>

        {/* ── 探索類別 ─────────────────────────────────────────────────── */}
        <HScrollSection title="探索類別" mt={32}>
          {EXPLORE_TILES.map(t => {
            const li = t.layer ? layerInfo(t.layer) : (t.key === "agent" ? { key: "agent", bg: "#F5F3FF", text: "#7C3AED", label: "Agents", icon: faRobot } : { key: "skill", bg: "#ECFDF5", text: "#059669", label: "技能", icon: faCubes });
            const active = t.layer ? (activeKind === t.kind && layerFilter === t.layer) : activeKind === t.kind;
            return (
              <button key={t.key} onClick={() => applyTile(t)}
                style={{ flexShrink: 0, width: 168, height: 92, borderRadius: 12, padding: "14px 16px", background: active ? li.text : li.bg, border: `1.5px solid ${active ? li.text : "transparent"}`, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", transition: "all 0.15s", boxShadow: active ? `0 4px 16px ${li.text}40` : "none" }}
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
        <HScrollSection title="精選方法論小組" subtitle={`${counts.squad} 個預配好的 agent 編組`} accentColor="#4F46E5"
          cta="完整目錄 →" onCta={() => { setActiveKind("squad"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
          loading={isLoading} mt={32}
        >
          {squads.slice(0, 24).map(e => (
            <div key={e.id} style={{ flexShrink: 0, width: 260 }}>
              <LandscapeCard entity={e} onPreview={() => setSelected(e)} aspect="5/4" size="sm" />
            </div>
          ))}
        </HScrollSection>

        {/* ── Agents ──────────────────────────────────────────────────────── */}
        {agents.length > 0 && (
          <HScrollSection title="精選 Agents" subtitle={`${counts.agent} 個 AI 專家角色`} accentColor="#7C3AED"
            cta="完整目錄 →" onCta={() => { setActiveKind("agent"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
            mt={28}
          >
            {agents.slice(0, 24).map(e => (
              <div key={e.id} style={{ flexShrink: 0, width: 200 }}>
                <LandscapeCard entity={e} onPreview={() => setSelected(e)} aspect="3/4" size="sm" />
              </div>
            ))}
          </HScrollSection>
        )}

        {/* ── 技能 ────────────────────────────────────────────────────────── */}
        {skills.length > 0 && (
          <HScrollSection title="精選技能" subtitle={`${counts.skill} 個原子能力`} accentColor="#059669"
            cta="完整目錄 →" onCta={() => { setActiveKind("skill"); document.getElementById("grid-section")?.scrollIntoView({ behavior: "smooth" }); }}
            mt={28}
          >
            {skills.slice(0, 24).map(e => (
              <div key={e.id} style={{ flexShrink: 0, width: 260 }}>
                <LandscapeCard entity={e} onPreview={() => setSelected(e)} aspect="16/9" size="sm" />
              </div>
            ))}
          </HScrollSection>
        )}

        {/* ── 為你提供更多 grid ─────────────────────────────────────────── */}
        <div id="grid-section" style={{ marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A18", margin: "0 0 2px", letterSpacing: "-0.01em" }}>為你提供更多範本</h2>
              <p style={{ fontSize: 13, color: "#A8A29E", margin: 0 }}>{gridItems.length} 個 {kindLabel}{layerFilter !== "ALL" ? ` · ${layerLabel}` : ""}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Kind dropdown */}
              <div style={{ position: "relative" }}>
                <button onClick={() => { setKindOpen(v => !v); setLayerOpen(false); }}
                  style={{ padding: "7px 14px", borderRadius: 50, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A18", display: "flex", alignItems: "center", gap: 6 }}>
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
                <button onClick={() => { setLayerOpen(v => !v); setKindOpen(false); }}
                  style={{ padding: "7px 14px", borderRadius: 50, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A18", display: "flex", alignItems: "center", gap: 6 }}>
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

          {isLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 12, background: "#F0F0EE", aspectRatio: "16/9", animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {!isLoading && gridItems.length === 0 && (
            <div style={{ padding: "60px 24px", textAlign: "center", border: "2px dashed #E4E3E1", borderRadius: 16 }}>
              <FontAwesomeIcon icon={faCircleInfo} style={{ fontSize: 36, color: "#D1D0CE", marginBottom: 16 }} />
              <p style={{ fontSize: 16, fontWeight: 600, color: "#57534E", margin: "0 0 8px" }}>沒有符合的{kindLabel}</p>
              <p style={{ fontSize: 14, color: "#A8A29E", margin: "0 0 16px" }}>試試清除搜尋或換個層級篩選</p>
              <button onClick={() => { setSearchQ(""); setLayerFilter("ALL"); }}
                style={{ padding: "8px 20px", borderRadius: 8, background: "#6366F1", color: "white", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                清除篩選
              </button>
            </div>
          )}

          {!isLoading && gridItems.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {gridItems.map(e => (
                <LandscapeCard key={`${e.kind}-${e.id ?? e.slug}`} entity={e} onPreview={() => setSelected(e)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      {selected && (
        <DetailModal
          entity={selected}
          relatedEntities={allEntities.filter(e => e.kind === selected.kind && e.id !== selected.id && String(e.strategyLayer ?? e.strategy_layer ?? "").slice(0,2) === String(selected.strategyLayer ?? selected.strategy_layer ?? "").slice(0,2)).slice(0, 6)}
          onClose={() => setSelected(null)}
          onLaunch={(e: any) => {
            setSelected(null);
            const qs = new URLSearchParams();
            if (e.slug) qs.set("slug", e.slug);
            const ws = Array.isArray(e.workspace) ? e.workspace[0] : (e.workspace ?? "");
            if (ws) qs.set("workspace", ws);
            if (e.strategyLayer ?? e.strategy_layer) qs.set("layer", String(e.strategyLayer ?? e.strategy_layer).slice(0, 2));
            window.open(`/picker?${qs}`, "_blank", "noopener");
          }}
          onSelectRelated={e => setSelected(e)}
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
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ flexShrink: 0, width: 260, borderRadius: 12, background: "#F0F0EE", aspectRatio: "5/4", animation: "pulse 1.5s ease-in-out infinite" }} />
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

/* ── LandscapeCard — 原版有圖卡片（inline-CSS 版）───────────────────────────
 *
 * Squad  → MethodologyGlyph + bg-default-50
 * Agent  → 全幅 avatar 圖片
 * Skill  → 大字技能名 + task-type icon
 * 共用   → layer chip（左上）、kind chip（右上，hover 淡出）
 *           hover overlay：star + ellipsis 按鈕 + 淡色遮罩
 * ─────────────────────────────────────────────────────────────────────── */
function LandscapeCard({ entity, onPreview, aspect = "16/9", size = "md" }: {
  entity: any; onPreview: () => void; aspect?: string; size?: "sm" | "md" | "lg";
}) {
  const [hov, setHov] = useState(false);
  const [starHov, setStarHov] = useState(false);
  const [menuHov, setMenuHov] = useState(false);
  const [starred, setStarred] = useState(false);

  const li = layerInfo(entity.strategyLayer ?? entity.strategy_layer);
  const layer = li.key;
  // Three-tier image fallback: coverImageUrl → mockupImages[0] → MethodologyGlyph
  const coverImageUrl: string | undefined =
    entity.coverImageUrl ?? entity.heroImageUrl ??
    (Array.isArray(entity.mockupImages) ? entity.mockupImages[0] : undefined) ??
    undefined;
  const kindLabel = entity.kind === "squad" ? "小組" : entity.kind === "agent" ? "Agent" : "技能";
  const titleSize = size === "sm" ? 13 : size === "lg" ? 16 : 14;
  const glyphSize = size === "sm" ? 64 : size === "lg" ? 120 : 88;

  return (
    <div
      onClick={onPreview}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", borderRadius: 12, background: "white",
        border: "1px solid #E4E3E1", overflow: "hidden", cursor: "pointer",
        transition: "all 0.2s",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {/* ── Hero area ───────────────────────────────────────────────── */}
      <div style={{
        position: "relative", width: "100%", background: "#F5F4F2",
        borderBottom: "1px solid #E4E3E1", aspectRatio: aspect, overflow: "hidden",
      }}>
        {entity.kind === "skill" ? (
          /* Skill: big name text + icon */
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: "0 14px 12px", background: "#F5F4F2" }}>
            <p style={{
              fontWeight: 700, color: "#374151", margin: 0, lineHeight: 1.05,
              flex: 1, overflow: "hidden",
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              fontSize: size === "sm" ? 18 : size === "lg" ? 28 : 22,
            }}>
              {entity.name}
            </p>
            <FontAwesomeIcon icon={skillIcon(entity.taskType)} style={{
              color: "#9CA3AF", position: "absolute", bottom: 12, right: 14,
              fontSize: size === "sm" ? 18 : size === "lg" ? 30 : 22,
            }} />
          </div>
        ) : entity.kind === "agent" ? (
          /* Agent: full-bleed avatar */
          <img
            src={coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "")}
            alt={entity.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => {
              const img = e.currentTarget;
              const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "");
              if (img.src !== fb) img.src = fb;
            }}
          />
        ) : coverImageUrl ? (
          /* Squad with cover image */
          <img src={coverImageUrl} alt={entity.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          /* Squad: MethodologyGlyph */
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.85 }}>
            <MethodologyGlyph seed={entity.slug ?? entity.id} layer={(layer as MosLayer)} size={glyphSize} />
          </div>
        )}

        {/* Layer chip — top-left */}
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "rgba(255,255,255,0.94)", backdropFilter: "blur(4px)",
          borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600,
          color: li.text, pointerEvents: "none",
          border: `1px solid ${li.text}20`,
        }}>
          {layer}・{li.label}
        </div>

        {/* Kind chip — top-right, fades on hover */}
        <div style={{
          position: "absolute", top: 10, right: 10,
          background: "rgba(255,255,255,0.94)", backdropFilter: "blur(4px)",
          borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 500,
          color: "#57534E", pointerEvents: "none",
          opacity: hov ? 0 : 1, transition: "opacity 0.2s",
        }}>
          {kindLabel}
        </div>

        {/* Unapproved badge */}
        {entity.is_approved === 0 && (
          <div style={{
            position: "absolute", bottom: 10, right: 10,
            background: "#FEF3C7", borderRadius: 6, padding: "2px 7px",
            fontSize: 10, fontWeight: 600, color: "#D97706",
          }}>審核中</div>
        )}

        {/* Hover overlay: subtle tint + action buttons */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.05)",
          opacity: hov ? 1 : 0, transition: "opacity 0.2s",
          pointerEvents: hov ? "auto" : "none",
        }}>
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            <button
              onClick={e => { e.stopPropagation(); setStarred(v => !v); }}
              onMouseEnter={() => setStarHov(true)}
              onMouseLeave={() => setStarHov(false)}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: starHov ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.94)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: starred ? "#F59E0B" : "#57534E", fontSize: 13,
                transition: "all 0.15s",
              }}
            >
              <FontAwesomeIcon icon={faStar} />
            </button>
            <button
              onClick={e => e.stopPropagation()}
              onMouseEnter={() => setMenuHov(true)}
              onMouseLeave={() => setMenuHov(false)}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: menuHov ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.94)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#57534E", fontSize: 13, transition: "all 0.15s",
              }}
            >
              <FontAwesomeIcon icon={faEllipsis} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Card body ───────────────────────────────────────────────── */}
      <div style={{ padding: "10px 12px 12px" }}>
        {entity.kind === "skill" ? (
          /* Skill: subtitle + description (name is in the hero) */
          <>
            {entity.subtitle && <p style={{ fontSize: 11, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{entity.subtitle}</p>}
            {entity.description && <p style={{ fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{entity.description}</p>}
          </>
        ) : (
          <>
            <p style={{ fontSize: titleSize, fontWeight: 600, color: "#1A1A18", margin: "0 0 3px", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
              {entity.name}
            </p>
            {entity.description && (
              <p style={{ fontSize: 12, color: "#78716C", margin: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {entity.description}
              </p>
            )}
          </>
        )}
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
    <div ref={ref} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300, background: "white", borderRadius: 12, minWidth: 200, padding: "6px 0", boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.07)" }}>
      {children}
    </div>
  );
}
function DropItem({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", padding: "8px 16px", border: "none", textAlign: "left", background: active ? "#EEF2FF" : hov ? "#FAFAF9" : "white", color: active ? "#4F46E5" : "#1A1A18", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: active ? 600 : 400 }}>
      {children}
    </button>
  );
}

/* ── DetailModal ────────────────────────────────────────────────────────── */
function DetailModal({ entity, relatedEntities, onClose, onLaunch, onSelectRelated }: {
  entity: any; relatedEntities: any[]; onClose: () => void;
  onLaunch: (e: any) => void; onSelectRelated: (e: any) => void;
}) {
  const li = layerInfo(entity.strategyLayer ?? entity.strategy_layer);
  const layer = li.key;
  const coverImageUrl: string | undefined =
    entity.coverImageUrl ?? entity.heroImageUrl ??
    (Array.isArray(entity.mockupImages) ? entity.mockupImages[0] : undefined) ??
    undefined;
  const kindLabel = entity.kind === "squad" ? "方法論小組" : entity.kind === "agent" ? "Agent" : "技能";
  const ctaLabel  = entity.kind === "squad" ? "啟動此小組" : entity.kind === "agent" ? "套用此 Agent" : "套用此技能";

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 1000, maxHeight: "88vh", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.22)", display: "grid", gridTemplateColumns: "1fr auto" }}>

        {/* Left: preview */}
        <div style={{ padding: "28px 28px 28px 28px", overflowY: "auto", borderRight: "1px solid #F0F0EE" }}>
          {/* Big hero */}
          <div style={{ position: "relative", width: "100%", background: "#F5F4F2", borderRadius: 12, overflow: "hidden", aspectRatio: "4/3", border: "1px solid #E4E3E1" }}>
            {entity.kind === "skill" ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FontAwesomeIcon icon={skillIcon(entity.taskType)} style={{ fontSize: 120, color: "#D1D0CE" }} />
              </div>
            ) : entity.kind === "agent" ? (
              <img src={coverImageUrl || agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? "")} alt={entity.name}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                onError={e => { const img = e.currentTarget; const fb = agentAvatarUrl(entity.slug ?? String(entity.id), entity.subtitle ?? entity.name ?? ""); if (img.src !== fb) img.src = fb; }}
              />
            ) : coverImageUrl ? (
              <img src={coverImageUrl} alt={entity.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.9 }}>
                <MethodologyGlyph seed={entity.slug ?? entity.id} layer={(layer as MosLayer)} size={200} />
              </div>
            )}
            <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,0.94)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: li.text }}>{layer}・{li.label}</div>
            <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.94)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 500, color: "#57534E" }}>{kindLabel}</div>
          </div>

          {/* Related */}
          {relatedEntities.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18", margin: "0 0 12px" }}>更多類似的{kindLabel}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {relatedEntities.map(r => (
                  <div key={`rel-${r.kind}-${r.id}`} onClick={() => onSelectRelated(r)}
                    style={{ borderRadius: 8, border: "1px solid #E4E3E1", overflow: "hidden", cursor: "pointer", background: "white" }}>
                    <div style={{ background: "#F5F4F2", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <MethodologyGlyph seed={r.slug ?? r.id} layer={(String(r.strategyLayer ?? r.strategy_layer ?? "L1").slice(0, 2) as MosLayer)} size={48} />
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18", margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>{r.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: meta + CTA */}
        <div style={{ width: 340, padding: "28px 28px 28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={onClose} style={{ alignSelf: "flex-end", background: "#F5F4F2", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#57534E", fontSize: 14 }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ padding: "4px 10px", borderRadius: 20, background: li.bg, fontSize: 12, fontWeight: 600, color: li.text }}>{layer}・{li.label}</span>
            <span style={{ padding: "4px 10px", borderRadius: 20, background: "#F5F4F2", fontSize: 12, color: "#57534E" }}>{kindLabel}</span>
            {entity.is_approved === 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "#FEF3C7", fontSize: 12, fontWeight: 600, color: "#D97706" }}>審核中</span>}
          </div>

          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "#1A1A18", margin: "0 0 6px", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{entity.name}</h2>
            {entity.subtitle && <p style={{ fontSize: 14, color: "#6366F1", fontWeight: 600, margin: 0 }}>{entity.subtitle}</p>}
          </div>

          {entity.description && (
            <p style={{ fontSize: 14, color: "#57534E", lineHeight: 1.65, margin: 0 }}>{entity.description}</p>
          )}

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
            <button onClick={() => onLaunch(entity)}
              style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
              <FontAwesomeIcon icon={faRocket} />
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
