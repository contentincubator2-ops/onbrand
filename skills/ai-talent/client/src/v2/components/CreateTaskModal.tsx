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

/* ── Entity card — Canva-style landscape card ─────────────────────── */
/**
 * Visual design: landscape 4:3, coloured gradient bg using channel brand color.
 * Mimics Canva's template cards which show a styled content preview.
 * Since we have no real images, we render a simulated "content frame":
 *   - Gradient bg (channel color, light→medium)
 *   - Decorative layout blocks (header bar + content lines = abstract post mockup)
 *   - Platform icon badge top-right
 *   - Hover: slight scale + outline ring + "開始使用" button appears
 */
function EntityCard({ entity, onSelect }: { entity: any; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const ws = Array.isArray(entity.workspace) ? entity.workspace[0] : (entity.workspace ?? "");
  const info = WS_INFO[ws] ?? null;
  const color  = info?.color ?? "#7C3AED";
  const name   = entity.name ?? "";
  // Derive a subtle secondary shade from the primary color
  const colorRgb = hexToRgb(color);
  const bgLight = `rgba(${colorRgb},0.08)`;
  const bgMid   = `rgba(${colorRgb},0.14)`;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        cursor: "pointer",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition: "transform 0.2s ease",
      }}
    >
      {/* ── Thumbnail: 4:3 landscape ── */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "4/3",
        borderRadius: 10,
        background: `linear-gradient(135deg, ${bgLight} 0%, ${bgMid} 100%)`,
        overflow: "hidden",
        outline: hov ? `2px solid ${color}` : "2px solid rgba(0,0,0,0.06)",
        boxShadow: hov
          ? `0 6px 20px rgba(${colorRgb},0.22)`
          : "0 1px 4px rgba(0,0,0,0.08)",
        transition: "outline 0.12s, box-shadow 0.15s",
      }}>

        {/* ── Platform device mockup ── */}
        <PlatformMockup ws={ws} color={color} name={name} />

        {/* Platform icon — top-right badge */}
        {info && (
          <span style={{
            position: "absolute", top: 8, right: 8,
            width: 24, height: 24, borderRadius: "50%",
            background: color, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}>
            <FontAwesomeIcon icon={info.icon} />
          </span>
        )}

        {/* Kind badge — top-left */}
        <span style={{
          position: "absolute", top: 8, left: 8,
          fontSize: 9, fontWeight: 700,
          background: "rgba(255,255,255,0.85)",
          color: color,
          borderRadius: 4, padding: "2px 6px",
          letterSpacing: "0.04em", backdropFilter: "blur(4px)",
        }}>
          {entity.kind === "squad" ? "SQUAD" : entity.kind === "agent" ? "AGENT" : "SKILL"}
        </span>

        {/* Hover overlay: darkens + shows CTA */}
        <div style={{
          position: "absolute", inset: 0,
          background: `rgba(${colorRgb},0.18)`,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          paddingBottom: 12,
          opacity: hov ? 1 : 0, transition: "opacity 0.15s",
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#fff",
            background: color, borderRadius: 20, padding: "5px 18px",
            boxShadow: `0 2px 8px rgba(${colorRgb},0.4)`,
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
        {name}
      </p>
    </div>
  );
}

/** Convert #RRGGBB to "R,G,B" for rgba() usage */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNaN(r) ? "100,100,100" : `${r},${g},${b}`;
}

/** Which device mockup to render per workspace */
function mockupType(ws: string): "phone-post" | "phone-story" | "phone-video" | "browser" | "document" {
  if (ws === "instagram") return "phone-story";
  if (ws === "tiktok")    return "phone-video";
  if (ws === "youtube" || ws === "linkedin") return "browser";
  if (ws === "email" || ws === "brand-positioning" || ws === "pr" || ws === "audience") return "document";
  return "phone-post"; // facebook, default
}

/**
 * PlatformMockup — SVG device frame that looks like Canva's template previews.
 * Each workspace gets a distinct device type with platform-coloured content.
 */
function PlatformMockup({ ws, color, name }: { ws: string; color: string; name: string }) {
  const kind = mockupType(ws);
  const rgb  = hexToRgb(color);
  const c    = (a: number) => `rgba(${rgb},${a})`;  // shorthand

  // All SVGs use a 200×150 viewBox matching the 4:3 card ratio
  switch (kind) {

    /* ── Phone (portrait) — Facebook-style post ── */
    case "phone-post": return (
      <svg viewBox="0 0 200 150" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        {/* bg */}
        <rect width="200" height="150" fill={c(0.07)} />
        {/* phone body */}
        <rect x="62" y="8" width="76" height="134" rx="10" fill="white" stroke={c(0.25)} strokeWidth="1.5"/>
        {/* status bar */}
        <rect x="62" y="8" width="76" height="12" rx="10" fill={c(0.15)} />
        <circle cx="100" cy="14" r="2" fill={c(0.4)} />
        {/* platform header bar */}
        <rect x="62" y="20" width="76" height="18" fill={c(0.12)} />
        <circle cx="74" cy="29" r="5" fill={color} />
        <rect x="83" y="26" width="28" height="4" rx="2" fill={c(0.35)} />
        <rect x="83" y="32" width="18" height="3" rx="1.5" fill={c(0.2)} />
        {/* image area */}
        <rect x="62" y="38" width="76" height="52" fill={c(0.22)} />
        {/* diagonal stripes in image */}
        <line x1="62" y1="38" x2="138" y2="90" stroke={c(0.12)} strokeWidth="6"/>
        <line x1="75" y1="38" x2="138" y2="101" stroke={c(0.12)} strokeWidth="6"/>
        <line x1="88" y1="38" x2="138" y2="88" stroke={c(0.08)} strokeWidth="6"/>
        {/* caption lines */}
        <rect x="67" y="95"  width="50" height="4" rx="2" fill={c(0.35)} />
        <rect x="67" y="102" width="38" height="3" rx="1.5" fill={c(0.22)} />
        <rect x="67" y="108" width="44" height="3" rx="1.5" fill={c(0.18)} />
        {/* action bar */}
        <rect x="62" y="118" width="76" height="14" rx="0" fill={c(0.07)} />
        <rect x="67" y="123" width="12" height="3" rx="1.5" fill={c(0.3)} />
        <rect x="83" y="123" width="12" height="3" rx="1.5" fill={c(0.3)} />
        <rect x="99" y="123" width="12" height="3" rx="1.5" fill={c(0.3)} />
        {/* home indicator */}
        <rect x="88" y="136" width="24" height="3" rx="1.5" fill={c(0.2)} />
      </svg>
    );

    /* ── Phone (portrait) — Instagram story (9:16 tall frame) ── */
    case "phone-story": return (
      <svg viewBox="0 0 200 150" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <rect width="200" height="150" fill={c(0.07)} />
        {/* phone body */}
        <rect x="66" y="6" width="68" height="138" rx="12" fill="white" stroke={c(0.25)} strokeWidth="1.5"/>
        {/* full-screen story image */}
        <rect x="67" y="7" width="66" height="136" rx="11" fill={c(0.20)} />
        {/* story gradient overlay bottom */}
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent"/>
            <stop offset="100%" stopColor={`rgba(${rgb},0.5)`}/>
          </linearGradient>
        </defs>
        <rect x="67" y="90" width="66" height="53" rx="0" fill="url(#sg)" />
        {/* story progress bars */}
        <rect x="71" y="12" width="14" height="2" rx="1" fill="rgba(255,255,255,0.8)" />
        <rect x="87" y="12" width="14" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
        <rect x="103" y="12" width="14" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
        <rect x="119" y="12" width="10" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
        {/* avatar + name */}
        <circle cx="75" cy="24" r="5" fill="white" opacity="0.9"/>
        <rect x="83" y="21" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.9)" />
        <rect x="83" y="26" width="14" height="2" rx="1" fill="rgba(255,255,255,0.6)" />
        {/* text lines bottom */}
        <rect x="70" y="108" width="40" height="4" rx="2" fill="rgba(255,255,255,0.9)" />
        <rect x="70" y="115" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.6)" />
        {/* send message bar */}
        <rect x="69" y="127" width="62" height="9" rx="4.5" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
        <rect x="73" y="130" width="20" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)" />
        {/* home indicator */}
        <rect x="83" y="139" width="24" height="3" rx="1.5" fill={c(0.3)} />
      </svg>
    );

    /* ── Phone (vertical video) — TikTok ── */
    case "phone-video": return (
      <svg viewBox="0 0 200 150" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <rect width="200" height="150" fill={c(0.07)} />
        {/* phone */}
        <rect x="66" y="6" width="68" height="138" rx="12" fill="#111" stroke={c(0.25)} strokeWidth="1"/>
        {/* video bg */}
        <rect x="67" y="7" width="66" height="136" rx="11" fill={c(0.30)} />
        {/* play button */}
        <polygon points="92,55 92,85 118,70" fill="rgba(255,255,255,0.85)" />
        {/* right-side action icons */}
        <circle cx="124" cy="45" r="6" fill="rgba(255,255,255,0.25)"/>
        <rect x="121" y="43" width="6" height="4" rx="1" fill="rgba(255,255,255,0.7)" />
        <circle cx="124" cy="62" r="6" fill="rgba(255,255,255,0.25)"/>
        <rect x="121" y="59.5" width="6" height="1.5" rx="0.75" fill="rgba(255,255,255,0.7)" />
        <rect x="121" y="62" width="6" height="1.5" rx="0.75" fill="rgba(255,255,255,0.7)" />
        <rect x="121" y="64.5" width="6" height="1.5" rx="0.75" fill="rgba(255,255,255,0.7)" />
        {/* bottom info */}
        <rect x="70" y="108" width="35" height="4" rx="2" fill="rgba(255,255,255,0.9)"/>
        <rect x="70" y="115" width="25" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/>
        {/* progress bar */}
        <rect x="67" y="128" width="66" height="2" rx="1" fill="rgba(255,255,255,0.2)"/>
        <rect x="67" y="128" width="28" height="2" rx="1" fill="rgba(255,255,255,0.8)"/>
        <circle cx="95" cy="129" r="3" fill="white"/>
        {/* home indicator */}
        <rect x="83" y="136" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.3)"/>
      </svg>
    );

    /* ── Browser window — YouTube / LinkedIn ── */
    case "browser": return (
      <svg viewBox="0 0 200 150" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <rect width="200" height="150" fill={c(0.07)} />
        {/* browser chrome */}
        <rect x="20" y="18" width="160" height="114" rx="8" fill="white" stroke={c(0.2)} strokeWidth="1.5"/>
        {/* title bar */}
        <rect x="20" y="18" width="160" height="22" rx="8" fill={c(0.12)}/>
        <rect x="20" y="30" width="160" height="10" fill={c(0.12)}/>
        {/* traffic lights */}
        <circle cx="33" cy="29" r="4" fill="#FF5F57"/>
        <circle cx="44" cy="29" r="4" fill="#FFBD2E"/>
        <circle cx="55" cy="29" r="4" fill="#28C840"/>
        {/* URL bar */}
        <rect x="66" y="24" width="96" height="10" rx="5" fill="white" opacity="0.7"/>
        <rect x="71" y="27" width="40" height="3" rx="1.5" fill={c(0.3)}/>
        {/* content area */}
        {ws === "youtube" ? (
          <>
            {/* YT layout: thumbnail grid */}
            <rect x="25" y="44" width="70" height="40" rx="4" fill={c(0.20)}/>
            <polygon points="48,57 48,71 62,64" fill="rgba(255,255,255,0.8)"/>
            <rect x="25" y="88" width="50" height="4" rx="2" fill={c(0.35)}/>
            <rect x="25" y="94" width="35" height="3" rx="1.5" fill={c(0.2)}/>
            <rect x="105" y="44" width="70" height="40" rx="4" fill={c(0.15)}/>
            <polygon points="128,57 128,71 142,64" fill="rgba(255,255,255,0.7)"/>
            <rect x="105" y="88" width="50" height="4" rx="2" fill={c(0.3)}/>
            <rect x="105" y="94" width="38" height="3" rx="1.5" fill={c(0.18)}/>
            {/* second row */}
            <rect x="25" y="104" width="70" height="36" rx="4" fill={c(0.12)}/>
            <rect x="105" y="104" width="70" height="36" rx="4" fill={c(0.10)}/>
          </>
        ) : (
          <>
            {/* LinkedIn layout */}
            {/* left sidebar */}
            <rect x="25" y="42" width="36" height="90" rx="4" fill={c(0.07)}/>
            <circle cx="43" cy="56" r="10" fill={c(0.25)}/>
            <rect x="29" y="70" width="28" height="3" rx="1.5" fill={c(0.3)}/>
            <rect x="32" y="75" width="22" height="2.5" rx="1.25" fill={c(0.2)}/>
            {/* main feed */}
            <rect x="66" y="42" width="88" height="90" rx="4" fill={c(0.05)}/>
            <rect x="70" y="46" width="80" height="30" rx="3" fill={c(0.18)}/>
            <rect x="70" y="80" width="60" height="4" rx="2" fill={c(0.35)}/>
            <rect x="70" y="87" width="44" height="3" rx="1.5" fill={c(0.22)}/>
            <rect x="70" y="93" width="50" height="3" rx="1.5" fill={c(0.18)}/>
            <rect x="70" y="102" width="80" height="22" rx="3" fill={c(0.1)}/>
          </>
        )}
      </svg>
    );

    /* ── Document / Email / Brand ── */
    case "document": return (
      <svg viewBox="0 0 200 150" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <rect width="200" height="150" fill={c(0.06)} />
        {/* paper shadow */}
        <rect x="37" y="19" width="126" height="115" rx="6" fill={c(0.08)}/>
        {/* paper */}
        <rect x="34" y="16" width="126" height="115" rx="6" fill="white" stroke={c(0.18)} strokeWidth="1"/>
        {/* header band */}
        <rect x="34" y="16" width="126" height="28" rx="6" fill={color}/>
        <rect x="34" y="34" width="126" height="10" fill={color}/>
        {/* logo/icon in header */}
        <circle cx="50" cy="30" r="8" fill="rgba(255,255,255,0.25)"/>
        <rect x="44" y="28" width="12" height="4" rx="2" fill="rgba(255,255,255,0.6)"/>
        {/* header title */}
        <rect x="64" y="26" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.9)"/>
        <rect x="64" y="33" width="32" height="3.5" rx="1.75" fill="rgba(255,255,255,0.6)"/>
        {/* body content */}
        <rect x="42" y="52" width="90" height="5" rx="2.5" fill={c(0.35)}/>
        <rect x="42" y="61" width="110" height="3.5" rx="1.75" fill={c(0.22)}/>
        <rect x="42" y="68" width="100" height="3.5" rx="1.75" fill={c(0.18)}/>
        <rect x="42" y="75" width="85" height="3.5" rx="1.75" fill={c(0.15)}/>
        {/* divider */}
        <rect x="42" y="84" width="110" height="1" fill={c(0.12)}/>
        {/* second section */}
        <rect x="42" y="91" width="45" height="22" rx="4" fill={c(0.15)}/>
        <rect x="93" y="91" width="57" height="4" rx="2" fill={c(0.25)}/>
        <rect x="93" y="99" width="45" height="3" rx="1.5" fill={c(0.18)}/>
        <rect x="93" y="105" width="50" height="3" rx="1.5" fill={c(0.15)}/>
        {/* CTA button */}
        <rect x="42" y="118" width="55" height="10" rx="5" fill={color}/>
        <rect x="47" y="121.5" width="35" height="3" rx="1.5" fill="rgba(255,255,255,0.9)"/>
      </svg>
    );
  }
}

/* ── Skeleton ─────────────────────────────────────────────────────── */
function GridSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div style={{ aspectRatio:"4/3", borderRadius: 8, background: "#F3F4F6", animation: "pulse 1.5s infinite" }} />
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
