/**
 * CreateTaskModal — Canva「建立設計」modal, pixel-faithful.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐  ✕ (outside card)
 *   │  建立設計          │  [─── 搜尋 ───────────────] │
 *   │  ─────────────     │  [熱門][FB][IG][LI][TT][YT] │
 *   │  ✦ 為你推薦        │  熱門                       │
 *   │  ❤ 社群媒體 ●      │  ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
 *   │    品牌策略         │  │  │ │  │ │  │ │  │      │
 *   │    電子報           │  └──┘ └──┘ └──┘ └──┘      │
 *   │    上傳             │                            │
 *   └─────────────────────────────────────────────────┘
 *
 * Background: blurred backdrop (rgba dark overlay) — home page visible behind.
 */
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark, faMagnifyingGlass, faRocket, faBullhorn, faUsers,
  faEnvelope, faCloudArrowUp, faWandMagicSparkles, faFire,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";

/* ── Categories (left sidebar) ──────────────────────────────────────── */
const CATEGORIES = [
  { key: "recommended", label: "為你推薦",  icon: faWandMagicSparkles, color: "#F97316", workspaces: [] as string[] },
  { key: "social",      label: "社群媒體",  icon: faUsers,             color: "#E4405F", workspaces: ["facebook","instagram","youtube","tiktok","linkedin"] },
  { key: "brand",       label: "品牌策略",  icon: faRocket,            color: "#7C3AED", workspaces: ["brand-positioning","pr","audience"] },
  { key: "email",       label: "電子報",    icon: faEnvelope,          color: "#7B5BC8", workspaces: ["email"] },
  { key: "upload",      label: "上傳",      icon: faCloudArrowUp,      color: "#059669", workspaces: [] as string[] },
] as const;
type CategoryKey = typeof CATEGORIES[number]["key"];

const WS_TO_CAT: Record<string, CategoryKey> = {
  facebook:"social", instagram:"social", youtube:"social", tiktok:"social", linkedin:"social",
  "brand-positioning":"brand", pr:"brand", audience:"brand",
  email:"email",
};

/* ── Channel tabs per category ──────────────────────────────────────── */
const CHANNEL_TABS: Record<CategoryKey, Array<{ key: string; label: string; icon: any; color: string }>> = {
  recommended: [],
  social: [
    { key:"facebook",  label:"Facebook",  icon:faFacebookF,  color:"#1877F2" },
    { key:"instagram", label:"Instagram", icon:faInstagram,  color:"#E4405F" },
    { key:"linkedin",  label:"LinkedIn",  icon:faLinkedinIn, color:"#0A66C2" },
    { key:"tiktok",    label:"TikTok",    icon:faTiktok,     color:"#010101" },
    { key:"youtube",   label:"YouTube",   icon:faYoutube,    color:"#FF0000" },
  ],
  brand: [
    { key:"brand-positioning", label:"品牌定位", icon:faRocket,   color:"#7C3AED" },
    { key:"pr",                label:"新聞稿",   icon:faBullhorn, color:"#475569" },
    { key:"audience",          label:"用戶研究", icon:faUsers,    color:"#E07B0F" },
  ],
  email:  [{ key:"email", label:"電子報", icon:faEnvelope, color:"#7B5BC8" }],
  upload: [],
};

/* ── Sub-chips per workspace ─────────────────────────────────────────── */
const CONTENT_TYPES: Record<string, Array<{ value: string; label: string }>> = {
  facebook:           [{value:"calendar",label:"行事曆"},{value:"post",label:"貼文"},{value:"ad",label:"廣告文案"},{value:"campaign",label:"活動企劃"},{value:"report",label:"成效報告"}],
  instagram:          [{value:"calendar",label:"行事曆"},{value:"post",label:"貼文"},{value:"visual",label:"視覺圖文"},{value:"campaign",label:"活動"}],
  youtube:            [{value:"script",label:"影片腳本"},{value:"visual",label:"縮圖設計"},{value:"campaign",label:"活動"},{value:"report",label:"成效"}],
  tiktok:             [{value:"script",label:"影片腳本"},{value:"visual",label:"視覺方向"},{value:"campaign",label:"活動"}],
  linkedin:           [{value:"calendar",label:"行事曆"},{value:"post",label:"貼文"},{value:"campaign",label:"活動"}],
  "brand-positioning":[{value:"positioning",label:"品牌定位"},{value:"research",label:"市場研究"}],
  pr:                 [{value:"post",label:"新聞稿"},{value:"campaign",label:"活動"}],
  audience:           [{value:"research",label:"用戶研究"},{value:"report",label:"分析報告"}],
  email:              [{value:"newsletter",label:"電子報"},{value:"campaign",label:"行銷活動"}],
};

const CT_KW: Record<string, string[]> = {
  calendar:["行事曆","calendar","月曆","規劃"],
  post:["貼文","post","文案","caption"],
  ad:["廣告","ad","cvo","brief","轉換"],
  script:["腳本","script","影片","video","hook"],
  visual:["視覺","visual","縮圖","thumbnail","圖文"],
  campaign:["活動","campaign","launch","倒數","促銷"],
  report:["報告","report","analytics","成效","分析"],
  research:["研究","research","受眾","audience","insight"],
  positioning:["定位","positioning","品牌","原型"],
  newsletter:["電子報","newsletter","edm","email"],
};

const WS_INFO: Record<string, { icon: any; color: string }> = {
  facebook:           {icon:faFacebookF,  color:"#1877F2"},
  instagram:          {icon:faInstagram,  color:"#E4405F"},
  youtube:            {icon:faYoutube,    color:"#FF0000"},
  tiktok:             {icon:faTiktok,     color:"#010101"},
  linkedin:           {icon:faLinkedinIn, color:"#0A66C2"},
  "brand-positioning":{icon:faRocket,     color:"#7C3AED"},
  pr:                 {icon:faBullhorn,   color:"#475569"},
  audience:           {icon:faUsers,      color:"#E07B0F"},
  email:              {icon:faEnvelope,   color:"#7B5BC8"},
};

/* ════════════════════════════════════════════════════════════════════ */
interface Props { open: boolean; initialWorkspace: string; onClose: () => void; }

export default function CreateTaskModal({ open, initialWorkspace, onClose }: Props) {
  const navigate = useNavigate();

  const [category, setCategory]     = useState<CategoryKey>(() => (WS_TO_CAT[initialWorkspace] ?? "recommended") as CategoryKey);
  const [channel,  setChannel]      = useState<string>(initialWorkspace || "all");
  const [contentType, setContentType] = useState("all");
  const [search, setSearch]         = useState("");

  useEffect(() => {
    if (open) {
      const cat = (WS_TO_CAT[initialWorkspace] ?? "recommended") as CategoryKey;
      setCategory(cat);
      setChannel(initialWorkspace || "all");
      setContentType("all");
      setSearch("");
    }
  }, [open, initialWorkspace]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const entityQ = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery({ brandId: null }, { refetchOnWindowFocus: false })
    : { data: [], isLoading: false };
  const allEntities: any[] = (entityQ.data as any[]) ?? [];

  const catDef = CATEGORIES.find(c => c.key === category)!;
  const tabs   = CHANNEL_TABS[category] ?? [];
  const chips  = channel !== "all" ? (CONTENT_TYPES[channel] ?? []) : [];

  const filtered = useMemo(() => {
    let items = allEntities;
    if (category !== "recommended" && catDef.workspaces.length > 0) {
      items = items.filter((e: any) => {
        const ws: string[] = Array.isArray(e.workspace) ? e.workspace : [e.workspace ?? ""];
        return ws.some(w => (catDef.workspaces as string[]).includes(w.toLowerCase()));
      });
    }
    if (channel !== "all") {
      items = items.filter((e: any) => {
        const ws: string[] = Array.isArray(e.workspace) ? e.workspace : [e.workspace ?? ""];
        return ws.some(w => w.toLowerCase() === channel);
      });
    }
    if (contentType !== "all") {
      const kws = CT_KW[contentType] ?? [];
      items = items.filter((e: any) => {
        const hay = ((e.name ?? "") + " " + (e.description ?? "") + " " + (e.slug ?? "")).toLowerCase();
        return kws.some(kw => hay.includes(kw));
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((e: any) =>
        (e.name ?? "").toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q));
    }
    return items.slice(0, 48);
  }, [allEntities, category, channel, contentType, search, catDef]);

  const handleSelect = (entity: any) => {
    const ws = Array.isArray(entity.workspace) ? entity.workspace[0] : (entity.workspace ?? channel);
    const qs = new URLSearchParams();
    if (ws) qs.set("workspace", ws);
    if (entity.slug) qs.set("slug", entity.slug);
    if (entity.name) qs.set("title", entity.name);
    onClose();
    navigate(`/picker?${qs.toString()}`);
  };

  if (!open) return null;

  const sectionLabel = channel !== "all"
    ? tabs.find(t => t.key === channel)?.label ?? "熱門"
    : (category === "recommended" ? "為你推薦" : catDef.label);

  return (
    /* ── Backdrop: semi-transparent + blur, HOME PAGE VISIBLE BEHIND ── */
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(30,34,48,0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {/* ── White modal card ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth: 1120,
          height: "min(88vh, 760px)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 32px 100px rgba(0,0,0,0.28)",
          display: "flex", overflow: "hidden",
          animation: "modalSlideUp 0.2s ease-out",
        }}
      >
        {/* ✕ — floating just outside top-right of card */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -14, right: -14, zIndex: 20,
            width: 38, height: 38, borderRadius: "50%",
            background: "#fff", border: "1px solid rgba(0,0,0,0.12)",
            cursor: "pointer", fontSize: 15, color: "#374151",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        {/* ── Left sidebar ── */}
        <aside style={{
          width: 230, flexShrink: 0,
          borderRight: "1px solid rgba(0,0,0,0.07)",
          overflowY: "auto", padding: "28px 0 20px",
          display: "flex", flexDirection: "column",
        }}>
          {/* Title in left panel — exactly like Canva */}
          <h2 style={{
            fontSize: 22, fontWeight: 700, color: "#111827",
            margin: "0 0 20px", padding: "0 20px",
            letterSpacing: "-0.02em",
          }}>
            建立任務
          </h2>

          {/* Category list */}
          {CATEGORIES.map(cat => {
            const active = category === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => { setCategory(cat.key); setChannel("all"); setContentType("all"); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", border: "none", textAlign: "left", cursor: "pointer",
                  background: active ? "rgba(124,58,237,0.07)" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(124,58,237,0.07)" : "transparent"; }}
              >
                <FontAwesomeIcon
                  icon={cat.icon}
                  style={{
                    fontSize: 15, width: 18, flexShrink: 0,
                    color: active ? cat.color : "#9CA3AF",
                  }}
                />
                <span style={{
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? "#7C3AED" : "#374151",
                }}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </aside>

        {/* ── Main area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Search bar — top, full-width */}
          <div style={{ flexShrink: 0, padding: "20px 24px 0" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              height: 46, borderRadius: 23,
              border: "1.5px solid rgba(124,58,237,0.55)",
              boxShadow: "0 0 0 3px rgba(124,58,237,0.07)",
              padding: "0 18px", background: "#fff",
            }}>
              <FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#9CA3AF", fontSize: 14, flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="你想要建立什麼？"
                autoFocus
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: 14, color: "#111827", background: "transparent",
                }}
              />
            </div>
          </div>

          {/* Channel tabs row — horizontal scroll, no scrollbar */}
          {tabs.length > 0 && (
            <div style={{
              flexShrink: 0, padding: "12px 24px 0",
              display: "flex", gap: 6, alignItems: "center",
              overflowX: "auto", scrollbarWidth: "none",
            }}>
              {/* 熱門 */}
              <TabPill
                label="熱門" icon={faFire} iconColor="#F97316"
                active={channel === "all"}
                onClick={() => { setChannel("all"); setContentType("all"); }}
              />
              {tabs.map(t => (
                <TabPill
                  key={t.key}
                  label={t.label} icon={t.icon} iconColor={t.color}
                  active={channel === t.key}
                  onClick={() => { setChannel(t.key); setContentType("all"); }}
                />
              ))}
            </div>
          )}

          {/* Sub-chips */}
          {chips.length > 0 && (
            <div style={{
              flexShrink: 0, padding: "8px 24px 0",
              display: "flex", gap: 6, flexWrap: "wrap",
            }}>
              <SubChip label="全部" active={contentType === "all"} color={WS_INFO[channel]?.color ?? "#7C3AED"} onClick={() => setContentType("all")} />
              {chips.map(c => (
                <SubChip key={c.value} label={c.label} active={contentType === c.value} color={WS_INFO[channel]?.color ?? "#7C3AED"} onClick={() => setContentType(c.value)} />
              ))}
            </div>
          )}

          {/* Section label */}
          <div style={{ flexShrink: 0, padding: "14px 24px 6px" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
              {sectionLabel}
            </p>
          </div>

          {/* Card grid — scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 28px" }}>
            {entityQ.isLoading ? (
              <GridSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}>
                {filtered.map((e: any) => (
                  <EntityCard key={`${e.kind}-${e.slug}`} entity={e} onSelect={() => handleSelect(e)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tab pill ─────────────────────────────────────────────────────── */
function TabPill({ label, icon, iconColor, active, onClick }: {
  label: string; icon: any; iconColor: string; active: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 9999, border: "none",
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        fontSize: 13, fontWeight: active ? 600 : 500,
        background: active ? "#7C3AED" : hov ? "rgba(0,0,0,0.07)" : "rgba(0,0,0,0.04)",
        color: active ? "#fff" : "#374151",
        transition: "background 0.12s, color 0.12s",
      }}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 11, color: active ? "#fff" : iconColor }} />
      {label}
    </button>
  );
}

/* ── Sub-chip ─────────────────────────────────────────────────────── */
function SubChip({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: 12, fontWeight: active ? 600 : 400,
        padding: "4px 12px", borderRadius: 9999, border: "none", cursor: "pointer",
        background: active ? color : hov ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.05)",
        color: active ? "#fff" : "#6B7280",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {label}
    </button>
  );
}

/* ── Entity card ─────────────────────────────────────────────────── */
function EntityCard({ entity, onSelect }: { entity: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const ws = Array.isArray(entity.workspace) ? entity.workspace[0] : (entity.workspace ?? "");
  const info = WS_INFO[ws] ?? null;
  const letter = (entity.name ?? "?").slice(0, 1).toUpperCase();

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ cursor: "pointer" }}
    >
      {/* Thumbnail — portrait, like Canva template cards */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "3/4",
        borderRadius: 8,
        background: hov ? "rgba(57,70,96,0.11)" : "#F3F4F6",
        overflow: "hidden",
        outline: hov ? "2px solid #7C3AED" : "2px solid transparent",
        transition: "outline 0.12s ease, background 0.12s ease",
      }}>
        {/* Muted platform icon */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {info
            ? <FontAwesomeIcon icon={info.icon} style={{ fontSize: 52, color: info.color, opacity: 0.20 }} />
            : <span style={{ fontSize: 52, fontWeight: 800, color: "rgba(64,79,109,0.14)", userSelect: "none" }}>{letter}</span>
          }
        </div>

        {/* Kind badge — top-left */}
        <span style={{
          position: "absolute", top: 8, left: 8,
          fontSize: 9, fontWeight: 700,
          background: info ? info.color : "rgba(0,0,0,0.4)", color: "#fff",
          borderRadius: 4, padding: "2px 6px",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {entity.kind === "squad" ? "Squad" : entity.kind === "agent" ? "Agent" : "技能"}
        </span>

        {/* Hover CTA fade-in at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.32), transparent)",
          padding: "28px 10px 10px",
          display: "flex", justifyContent: "center",
          opacity: hov ? 1 : 0, transition: "opacity 0.15s",
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#fff",
            background: info?.color ?? "#7C3AED",
            borderRadius: 20, padding: "4px 14px",
          }}>
            開始使用
          </span>
        </div>
      </div>

      {/* Label */}
      <p style={{
        fontSize: 12, fontWeight: 500, color: "#111827",
        margin: "7px 2px 0", lineHeight: 1.4,
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {entity.name}
      </p>
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function GridSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div style={{ aspectRatio:"3/4", borderRadius: 8, background: "#F3F4F6", animation: "pulse 1.5s infinite" }} />
          <div style={{ height: 11, borderRadius: 4, background: "#F3F4F6", margin: "7px 2px 0", animation: "pulse 1.5s infinite" }} />
        </div>
      ))}
    </div>
  );
}

/* ── Empty ────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
      <FontAwesomeIcon icon={faWandMagicSparkles} style={{ fontSize: 34, display: "block", margin: "0 auto 12px" }} />
      <p style={{ fontSize: 14 }}>尚無符合的任務範本</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>試試其他分類或搜尋關鍵字</p>
    </div>
  );
}
