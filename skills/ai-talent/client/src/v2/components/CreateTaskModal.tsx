/**
 * CreateTaskModal — Canva-style "建立任務" modal overlay.
 *
 * Flow:
 *   Home tile click → open modal (pre-selected workspace)
 *   Left sidebar    → switch workspace
 *   Top chips       → filter by content_type
 *   Squad card      → navigate to /picker?workspace=X&slug=Y
 *
 * Mirrors Canva's "建立設計" overlay exactly:
 *   - Full-screen white overlay
 *   - Left 260px: workspace category list
 *   - Right: search bar + content_type chips + squad card grid
 *   - X closes, clicking outside does nothing (user must click X)
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark, faMagnifyingGlass, faRocket, faBullhorn, faUsers,
  faEnvelope, faPlus, faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";

/* ── Workspace sidebar items ─────────────────────────────────────────── */
const WORKSPACES = [
  { key: "facebook",          label: "Facebook",  icon: faFacebookF,  color: "#1877F2" },
  { key: "instagram",         label: "Instagram", icon: faInstagram,  color: "#E4405F" },
  { key: "youtube",           label: "YouTube",   icon: faYoutube,    color: "#FF0000" },
  { key: "tiktok",            label: "TikTok",    icon: faTiktok,     color: "#010101" },
  { key: "linkedin",          label: "LinkedIn",  icon: faLinkedinIn, color: "#0A66C2" },
  { key: "brand-positioning", label: "品牌定位",  icon: faRocket,     color: "#7C3AED" },
  { key: "pr",                label: "新聞稿",    icon: faBullhorn,   color: "#475569" },
  { key: "audience",          label: "用戶研究",  icon: faUsers,      color: "#E07B0F" },
  { key: "email",             label: "電子報",    icon: faEnvelope,   color: "#7B5BC8" },
] as const;

type WorkspaceKey = typeof WORKSPACES[number]["key"];

/* ── Content-type chips per workspace ───────────────────────────────── */
const CONTENT_TYPES: Record<string, Array<{ value: string; label: string }>> = {
  facebook:          [{ value: "all", label: "熱門" }, { value: "calendar", label: "行事曆" }, { value: "post", label: "貼文文案" }, { value: "ad", label: "廣告文案" }, { value: "campaign", label: "活動企劃" }, { value: "report", label: "成效報告" }],
  instagram:         [{ value: "all", label: "熱門" }, { value: "calendar", label: "行事曆" }, { value: "post", label: "貼文文案" }, { value: "visual", label: "視覺圖文" }, { value: "campaign", label: "活動企劃" }],
  youtube:           [{ value: "all", label: "熱門" }, { value: "script", label: "影片腳本" }, { value: "visual", label: "縮圖設計" }, { value: "campaign", label: "活動企劃" }, { value: "report", label: "成效報告" }],
  tiktok:            [{ value: "all", label: "熱門" }, { value: "script", label: "影片腳本" }, { value: "visual", label: "視覺方向" }, { value: "campaign", label: "活動企劃" }],
  linkedin:          [{ value: "all", label: "熱門" }, { value: "calendar", label: "行事曆" }, { value: "post", label: "貼文文案" }, { value: "campaign", label: "活動企劃" }],
  "brand-positioning": [{ value: "all", label: "熱門" }, { value: "positioning", label: "品牌定位" }, { value: "research", label: "市場研究" }, { value: "campaign", label: "活動企劃" }],
  pr:                [{ value: "all", label: "熱門" }, { value: "post", label: "新聞稿" }, { value: "campaign", label: "活動企劃" }, { value: "report", label: "媒體報告" }],
  audience:          [{ value: "all", label: "熱門" }, { value: "research", label: "用戶研究" }, { value: "report", label: "分析報告" }],
  email:             [{ value: "all", label: "熱門" }, { value: "newsletter", label: "電子報" }, { value: "campaign", label: "行銷活動" }],
};

/* ── Keyword heuristic for content_type filtering ────────────────────── */
const CT_KW: Record<string, string[]> = {
  calendar:    ["行事曆", "calendar", "月曆", "規劃"],
  post:        ["貼文", "post", "文案", "caption"],
  ad:          ["廣告", "ad", "cvo", "brief", "轉換"],
  script:      ["腳本", "script", "影片", "video", "hook"],
  visual:      ["視覺", "visual", "縮圖", "thumbnail", "圖文"],
  campaign:    ["活動", "campaign", "launch", "倒數", "促銷"],
  report:      ["報告", "report", "analytics", "成效", "分析"],
  research:    ["研究", "research", "受眾", "audience", "insight"],
  positioning: ["定位", "positioning", "品牌", "原型"],
  newsletter:  ["電子報", "newsletter", "edm", "email"],
};

/* ─────────────────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  initialWorkspace: WorkspaceKey;
  onClose: () => void;
}

export default function CreateTaskModal({ open, initialWorkspace, onClose }: Props) {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspaceKey>(initialWorkspace);
  const [contentType, setContentType] = useState("all");
  const [search, setSearch] = useState("");

  // Sync workspace when initialWorkspace changes (tile click)
  React.useEffect(() => {
    if (open) {
      setWorkspace(initialWorkspace);
      setContentType("all");
      setSearch("");
    }
  }, [open, initialWorkspace]);

  // Query all entities, filter client-side (avoids needing new endpoint)
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery({ brandId: null }, { refetchOnWindowFocus: false })
    : { data: [], isLoading: false };

  const allEntities: any[] = (entityQuery.data as any[]) ?? [];

  const filtered = useMemo(() => {
    let items = allEntities.filter((e: any) => {
      const ws: string[] = Array.isArray(e.workspace) ? e.workspace : [e.workspace ?? ""];
      return ws.some(w => w.toLowerCase() === workspace);
    });

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
        (e.name ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q)
      );
    }

    return items.slice(0, 48);
  }, [allEntities, workspace, contentType, search]);

  const currentWs = WORKSPACES.find(w => w.key === workspace)!;
  const chips = CONTENT_TYPES[workspace] ?? [{ value: "all", label: "熱門" }];

  const handleSelect = (entity: any) => {
    const ws = Array.isArray(entity.workspace) ? entity.workspace[0] : (entity.workspace ?? workspace);
    const qs = new URLSearchParams();
    if (ws) qs.set("workspace", ws);
    if (entity.slug) qs.set("slug", entity.slug);
    if (entity.name) qs.set("title", entity.name);
    onClose();
    navigate(`/picker?${qs.toString()}`);
  };

  if (!open) return null;

  return (
    /* ── Full-screen overlay ── */
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "#fff",
      display: "flex", flexDirection: "column",
      animation: "fadeIn 0.15s ease-out",
    }}>
      {/* ── Top bar ── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: "1px solid #f3f4f6",
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>建立任務</span>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "none", cursor: "pointer", fontSize: 18, color: "#6b7280",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Left sidebar — workspace list */}
        <aside style={{
          width: 220, flexShrink: 0,
          borderRight: "1px solid #f3f4f6",
          overflowY: "auto", padding: "12px 8px",
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", padding: "4px 10px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            頻道 / 類型
          </p>
          {WORKSPACES.map(ws => {
            const active = workspace === ws.key;
            return (
              <button
                key={ws.key}
                onClick={() => { setWorkspace(ws.key); setContentType("all"); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 10, border: "none", textAlign: "left",
                  cursor: "pointer", background: active ? `${ws.color}12` : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? `${ws.color}12` : "none"; }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: active ? ws.color : "#f3f4f6",
                  color: active ? "#fff" : "#6b7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, transition: "background 0.15s, color 0.15s",
                }}>
                  <FontAwesomeIcon icon={ws.icon} />
                </span>
                <span style={{
                  fontSize: 13, fontWeight: active ? 700 : 400,
                  color: active ? ws.color : "#374151",
                }}>
                  {ws.label}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Search + chips */}
          <div style={{ flexShrink: 0, padding: "16px 24px 0" }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              height: 44, borderRadius: 22,
              border: "1.5px solid #e5e7eb", padding: "0 16px",
              background: "#fff", marginBottom: 14,
            }}>
              <FontAwesomeIcon icon={faMagnifyingGlass} style={{ color: "#9ca3af", fontSize: 14, flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="你想要建立什麼任務？"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111827", background: "transparent",
                }}
              />
            </div>

            {/* Content-type chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {chips.map(chip => {
                const active = contentType === chip.value;
                return (
                  <button
                    key={chip.value}
                    onClick={() => setContentType(chip.value)}
                    style={{
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? "#fff" : "#374151",
                      background: active ? currentWs.color : "rgba(0,0,0,0.05)",
                      border: "none", borderRadius: 20,
                      padding: "6px 16px", cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.09)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section label */}
          <div style={{ padding: "0 24px 12px", flexShrink: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {chips.find(c => c.value === contentType)?.label ?? "熱門"}
            </p>
          </div>

          {/* Squad card grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 32px" }}>
            {entityQuery.isLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ aspectRatio: "4/3", borderRadius: 8, background: "rgba(64,79,109,0.06)", animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 0", color: "#9ca3af" }}>
                <FontAwesomeIcon icon={faWandMagicSparkles} style={{ fontSize: 32, marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 14 }}>尚無符合的任務範本</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>試試其他分類或搜尋關鍵字</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {filtered.map((entity: any) => (
                  <SquadCard key={`${entity.kind}-${entity.slug}`} entity={entity} wsColor={currentWs.color} onSelect={() => handleSelect(entity)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Squad card ──────────────────────────────────────────────────────── */

const WS_ICON_MAP: Record<string, { icon: any; color: string }> = {
  facebook:           { icon: faFacebookF,  color: "#1877F2" },
  instagram:          { icon: faInstagram,  color: "#E4405F" },
  youtube:            { icon: faYoutube,    color: "#FF0000" },
  tiktok:             { icon: faTiktok,     color: "#010101" },
  linkedin:           { icon: faLinkedinIn, color: "#0A66C2" },
  "brand-positioning":{ icon: faRocket,     color: "#7C3AED" },
  pr:                 { icon: faBullhorn,   color: "#475569" },
  audience:           { icon: faUsers,      color: "#E07B0F" },
  email:              { icon: faEnvelope,   color: "#7B5BC8" },
};

function SquadCard({ entity, wsColor, onSelect }: { entity: any; wsColor: string; onSelect: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const ws = Array.isArray(entity.workspace) ? entity.workspace[0] : (entity.workspace ?? "");
  const wsInfo = WS_ICON_MAP[ws] ?? null;
  const letter = (entity.name ?? "?").slice(0, 1).toUpperCase();

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      {/* Thumbnail */}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "4/3",
        borderRadius: 8, background: "rgba(64,79,109,0.06)", overflow: "hidden",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
        transition: "box-shadow 0.15s ease",
        transform: hovered ? "translateY(-2px)" : "none",
      }}>
        {/* Muted icon */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {wsInfo ? (
            <FontAwesomeIcon icon={wsInfo.icon} style={{ fontSize: 48, color: wsInfo.color, opacity: 0.25 }} />
          ) : (
            <span style={{ fontSize: 48, fontWeight: 800, color: "rgba(64,79,109,0.18)", lineHeight: 1, userSelect: "none" }}>{letter}</span>
          )}
        </div>

        {/* Hover overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.28)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hovered ? 1 : 0, transition: "opacity 0.15s ease",
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#fff",
            background: wsColor, borderRadius: 20, padding: "6px 18px",
          }}>
            開始使用
          </span>
        </div>

        {/* Kind badge */}
        <span style={{
          position: "absolute", top: 8, right: 8,
          fontSize: 9, fontWeight: 700, color: "#fff",
          background: "rgba(0,0,0,0.45)", borderRadius: 4, padding: "2px 6px",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {entity.kind === "squad" ? "Squad" : entity.kind === "agent" ? "Agent" : "Skill"}
        </span>
      </div>

      {/* Text */}
      <div style={{ padding: "8px 2px 2px" }}>
        <p style={{
          fontSize: 13, fontWeight: 600, color: "rgb(15,16,21)",
          lineHeight: 1.35, margin: 0,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {entity.name}
        </p>
      </div>
    </div>
  );
}
