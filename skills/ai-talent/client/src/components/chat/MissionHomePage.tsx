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
        <div style={{ fontSize: 12, color: "#9B9990", letterSpacing: 0.2 }}>
          ⚙️ {t("resource_matching")}
        </div>
        <style>{`
          @keyframes pulse-dot {
            0%, 100% { transform: scale(0.7); opacity: 0.4; }
            50%       { transform: scale(1.1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (status === "ready" && data.agents > 0) {
    const stats = [
      { label: "Agents", value: data.agents.toLocaleString(), icon: "👤", color: "#0A6EFA" },
      { label: t("label_skills"), value: data.skills, icon: "⚡", color: "#7C3AED" },
      { label: "AI Models", value: data.providers, icon: "🤖", color: "#059669" },
    ];

    return (
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {stats.map(({ label, value, icon, color }) => (
            <div
              key={label}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 3, padding: "10px 16px",
                background: "#FAFAF9", border: "1px solid #E4E3E1",
                borderRadius: 12,
                minWidth: 72,
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 10, color: "#9B9990" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, color: "#059669",
          background: "#F0FDF4", border: "1px solid #BBF7D0",
          borderRadius: 20, padding: "3px 10px",
        }}>
          <span>✓</span>
          <span>語意匹配完成 · text-embedding-3-large</span>
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
      {squad.lead?.avatar || "🎯"}
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
