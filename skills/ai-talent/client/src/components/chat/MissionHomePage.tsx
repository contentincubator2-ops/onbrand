import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import type { DBSquad } from "../../types/squad";
import { useLang } from "../../lib/i18n";

interface MissionHomePageProps {
  workspace?:        string;
  missionTitle?:     string;
  missionId?:        number | null;
  brandId?:          number | null;
  onMissionSelect?:  (text: string) => void;
  onSquadPreview?:   (squad: DBSquad | null) => void;
}

// ─── Workspace icon map ───────────────────────────────────────────────────────
const WS_ICON: Record<string, string> = {
  strategy: "🧭", linkedin: "💼", youtube: "🎥", facebook: "📣",
  pr: "📰", event: "🎪", website: "🌐", brand: "🏷️", content: "✍️",
};

// ─── Resource stat SVG icons ──────────────────────────────────────────────────
const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconZap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconCpu = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
    <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
    <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
    <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
  </svg>
);

// ─── ResourceBanner ───────────────────────────────────────────────────────────
function ResourceBanner({ missionId }: { missionId: number }) {
  const { t } = useLang();
  const resourceQuery = trpc.resource.summaryByMission.useQuery(
    { missionId },
    {
      enabled: true,
      refetchOnWindowFocus: false,
      refetchInterval: (query: any) => {
        const s = (query.state.data as any)?.status;
        return s === "ready" || s === "error" ? false : 2000;
      },
    }
  );

  const data   = resourceQuery.data as any;
  const status = data?.status ?? "pending";

  if (status === "pending") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 24,
      }}>
        {/* Animated orbs */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                width: i === 2 ? 10 : 7, height: i === 2 ? 10 : 7,
                borderRadius: "50%",
                background: i === 2 ? "#0A6EFA" : "#BFDBFE",
                animation: `pulse-dot 1.6s ${i * 0.15}s ease-in-out infinite`,
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "#9B9990", letterSpacing: 0.2,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" opacity=".3"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          {t("resource_matching")}
        </div>
      </div>
    );
  }

  if (status === "ready" && data.agents > 0) {
    const stats = [
      { label: "Agents", value: data.agents.toLocaleString(), icon: <IconUsers />, color: "#0A6EFA", bg: "#EFF6FF", border: "#BFDBFE" },
      { label: t("label_skills"),  value: data.skills,    icon: <IconZap />,   color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
      { label: "AI Models",        value: data.providers, icon: <IconCpu />,   color: "#059669", bg: "#F0FDF4", border: "#BBF7D0" },
    ];

    return (
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {stats.map(({ label, value, icon, color, bg, border }) => (
            <div
              key={label}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 4, padding: "10px 18px",
                background: bg, border: `1px solid ${border}`,
                borderRadius: 12, minWidth: 76,
                transition: "transform 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
            >
              <span style={{ color }}>{icon}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.5px" }}>{value}</span>
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10.5, color: "#059669",
          background: "#F0FDF4", border: "1px solid #BBF7D0",
          borderRadius: 20, padding: "4px 12px", fontWeight: 500,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          語意匹配完成 · text-embedding-3-large
        </div>
      </div>
    );
  }

  return null;
}

// ─── SquadChip ────────────────────────────────────────────────────────────────
function SquadChip({
  squad, isSelected, onClick,
}: { squad: DBSquad; isSelected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10,
        padding: "7px 14px",
        fontSize: 13, fontWeight: 500,
        cursor: "pointer",
        border: isSelected ? "1.5px solid #1A1A18" : hovered ? "1.5px solid #C8C7C3" : "1.5px solid #E4E3E1",
        background: isSelected ? "#1A1A18" : hovered ? "#F9F9F8" : "#FFFFFF",
        color: isSelected ? "#FFFFFF" : "#4A4A45",
        transition: "all 0.15s",
        fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 6,
        boxShadow: isSelected ? "0 2px 8px rgba(26,26,24,0.15)" : hovered ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke={isSelected ? "rgba(255,255,255,0.8)" : "#9B9990"}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
      <span>{squad.name}</span>
      {squad.lead?.name && (
        <span style={{
          fontSize: 10, color: isSelected ? "rgba(255,255,255,0.6)" : "#9B9990",
          fontWeight: 400,
        }}>
          · {squad.lead.name}
        </span>
      )}
    </button>
  );
}

// ─── MissionHomePage ──────────────────────────────────────────────────────────

export const MissionHomePage: React.FC<MissionHomePageProps> = ({
  workspace      = "strategy",
  missionTitle,
  missionId,
  brandId,
  onMissionSelect,
  onSquadPreview,
}) => {
  const { t } = useLang();
  const [inputValue, setInputValue]       = useState("");
  const [selectedSquad, setSelectedSquad] = useState<DBSquad | null>(null);
  const [inputFocused, setInputFocused]   = useState(false);

  const wsIcon = WS_ICON[workspace] ?? "🚀";
  const shortTitle = missionTitle ? missionTitle.slice(0, 28) : "";
  const titleText  = shortTitle || t("mission_start");

  // ── DB-driven squad chips ──────────────────────────────────────────────────
  const squadQuery = trpc.squad.getRecommendedSquads.useQuery(
    { workspace, brandId: brandId ?? undefined, missionId: missionId ?? undefined, limit: 6 },
    {
      enabled:              !!missionId,
      staleTime:            60_000,
      refetchOnWindowFocus: false,
    }
  );

  const squads: DBSquad[] = (squadQuery.data as any[]) ?? [];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (inputValue.trim() && onMissionSelect) {
      onMissionSelect(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "100%", overflowY: "auto",
      padding: "48px 24px 100px",
      background: "#FFFFFF",
    }}>
      {/* Hero section */}
      <div style={{ maxWidth: 640, width: "100%", textAlign: "center", marginBottom: 32 }}>
        {/* Workspace badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#F2F1EF", border: "1px solid #E4E3E1",
          borderRadius: 20, padding: "4px 12px", marginBottom: 16,
          fontSize: 12, color: "#6B6A66", fontWeight: 500,
        }}>
          <span>{wsIcon}</span>
          <span>{workspace.charAt(0).toUpperCase() + workspace.slice(1)} Workspace</span>
        </div>

        {/* Main title */}
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: "#1A1A18",
          lineHeight: 1.25, margin: "0 0 10px 0",
          letterSpacing: "-0.5px",
        }}>
          {titleText}
        </h1>
        <p style={{ fontSize: 14, color: "#9B9990", margin: 0, lineHeight: 1.6 }}>
          {t("mission_subtitle")}
        </p>
      </div>

      {/* Input box — Perplexity-style */}
      <div style={{
        width: "100%", maxWidth: 640,
        background: inputFocused ? "#FFFFFF" : "#FAFAF9",
        border: inputFocused ? "2px solid #1A1A18" : "1.5px solid #E4E3E1",
        borderRadius: 18,
        padding: "14px 16px 10px",
        boxShadow: inputFocused
          ? "0 0 0 4px rgba(26,26,24,0.06), 0 4px 20px rgba(0,0,0,0.08)"
          : "0 2px 8px rgba(0,0,0,0.04)",
        marginBottom: 16,
        transition: "all 0.2s",
      }}>
        <textarea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={t("mission_placeholder")}
          rows={2}
          style={{
            width: "100%", border: "none", outline: "none",
            resize: "none", fontSize: 15, color: "#1A1A18",
            lineHeight: 1.6, background: "transparent",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#C8C7C3" }}>Enter 送出 · Shift+Enter 換行</span>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            style={{
              background: inputValue.trim() ? "#1A1A18" : "#E8EAF0",
              color: "#FFFFFF", border: "none", borderRadius: 10,
              padding: "7px 18px", fontSize: 13, fontWeight: 600,
              cursor: inputValue.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s", whiteSpace: "nowrap",
              fontFamily: "inherit",
              boxShadow: inputValue.trim() ? "0 2px 8px rgba(26,26,24,0.2)" : "none",
            }}
          >
            {t("mission_submit_btn")} →
          </button>
        </div>
      </div>

      {/* Squad chips — DB-driven */}
      {squadQuery.isLoading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              height: 36, width: `${70 + i * 15}px`, borderRadius: 10,
              background: "#F2F1EF", animation: "pulse 1.5s infinite",
            }} />
          ))}
        </div>
      )}

      {!squadQuery.isLoading && squads.length > 0 && (
        <div style={{
          maxWidth: 640, width: "100%",
          display: "flex", flexWrap: "wrap", gap: 8,
          justifyContent: "center",
          marginBottom: 8,
        }}>
          <div style={{ width: "100%", textAlign: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#C8C7C3", fontWeight: 500 }}>
              推薦 AI 行銷小隊
            </span>
          </div>
          {squads.map(squad => (
            <SquadChip
              key={squad.squadId}
              squad={squad}
              isSelected={selectedSquad?.squadId === squad.squadId}
              onClick={() => {
                const next = selectedSquad?.squadId === squad.squadId ? null : squad;
                setSelectedSquad(next);
                setInputValue(next ? `請 ${next.name} 協助我` : "");
                onSquadPreview?.(next);
              }}
            />
          ))}
        </div>
      )}

      {/* Resource matching banner */}
      {missionId ? (
        <ResourceBanner missionId={missionId} />
      ) : (
        <div style={{ fontSize: 12, color: "#C8C7C3", marginTop: 20 }}>
          {t("mission_no_squad")}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
