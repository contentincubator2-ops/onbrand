import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import type { DBSquad } from "../../types/squad";

interface MissionHomePageProps {
  workspace?:        string;
  missionTitle?:     string;
  missionId?:        number | null;
  brandId?:          number | null;
  onMissionSelect?:  (text: string) => void;
  onSquadPreview?:   (squad: DBSquad | null) => void;
}

// ── Tiny resource badge shown below squad chips ───────────────────────────────
function ResourceBanner({ missionId }: { missionId: number }) {
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
        display: "flex", alignItems: "center", gap: 7,
        marginTop: 18, fontSize: 12, color: "#9B9990",
        animation: "none",
      }}>
        {/* Spinner dots */}
        <span style={{ display: "flex", gap: 3 }}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#C8C7C3",
                display: "inline-block",
                animation: `bounce 1.2s ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </span>
        <span>正在為此任務配對最佳 AI 代理人選…</span>
        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%           { transform: scale(1);   opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (status === "ready" && data.agents > 0) {
    return (
      <div style={{
        display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap", justifyContent: "center",
      }}>
        {[
          { label: "Agents",    value: data.agents.toLocaleString() },
          { label: "技能",      value: data.skills },
          { label: "AI Models", value: data.providers },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#F2F1EF", border: "1px solid #E4E3E1",
              borderRadius: 20, padding: "3px 10px",
              fontSize: 11, color: "#6B6A66",
            }}
          >
            <span style={{ fontWeight: 600, color: "#1A1A18" }}>{value}</span>
            <span>{label}</span>
          </div>
        ))}
        <div style={{
          display: "flex", alignItems: "center", gap: 3,
          fontSize: 10, color: "#C8C7C3", alignSelf: "center",
        }}>
          <span>✓</span>
          <span>語意配對完成</span>
        </div>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export const MissionHomePage: React.FC<MissionHomePageProps> = ({
  workspace      = "strategy",
  missionTitle,
  missionId,
  brandId,
  onMissionSelect,
  onSquadPreview,
}) => {
  const [inputValue, setInputValue]       = useState("");
  const [selectedSquad, setSelectedSquad] = useState<DBSquad | null>(null);

  const shortTitle = missionTitle ? missionTitle.slice(0, 10) : "";
  const titleText  = `${shortTitle} 啟動任務`;

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
    <div
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100%", overflowY: "auto",
        padding: "40px 20px 80px",
        background: "#FFFFFF",
      }}
    >
      {/* Title */}
      <div style={{ maxWidth: 600, textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "#1A1A18", marginBottom: 6 }}>
          {titleText}
        </div>
        <div style={{ fontSize: 13, color: "#9B9990" }}>
          選擇執行方式，輸入任務需求
        </div>
      </div>

      {/* Input box */}
      <div
        style={{
          width: "100%", maxWidth: 620,
          background: "#F9F9F8",
          border: "1.5px solid #E2E8F0",
          borderRadius: 16,
          padding: "14px 16px 10px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          marginBottom: 12,
        }}
      >
        <textarea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的任務需求..."
          rows={2}
          style={{
            width: "100%", border: "none", outline: "none",
            resize: "none", fontSize: 14, color: "#1A1A18",
            lineHeight: 1.6, background: "transparent",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            style={{
              background: inputValue.trim() ? "#1A1A18" : "#E8EAF0",
              color: "#FFFFFF", border: "none", borderRadius: 10,
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              cursor: inputValue.trim() ? "pointer" : "not-allowed",
              transition: "background 0.2s", whiteSpace: "nowrap",
              fontFamily: "inherit",
            }}
          >
            啟動任務 →
          </button>
        </div>
      </div>

      {/* Squad chips — DB-driven */}
      {squadQuery.isLoading && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: 620 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              height: 28, width: 90, borderRadius: 20,
              background: "#F2F1EF", animation: "pulse 1.5s infinite",
            }} />
          ))}
        </div>
      )}

      {!squadQuery.isLoading && squads.length > 0 && (
        <div
          style={{
            maxWidth: 620, width: "100%",
            display: "flex", flexWrap: "wrap", gap: 6,
            justifyContent: "center",
          }}
        >
          {squads.map(squad => {
            const isSelected = selectedSquad?.squadId === squad.squadId;
            return (
              <button
                key={squad.squadId}
                onClick={() => {
                  const next = isSelected ? null : squad;
                  setSelectedSquad(next);
                  setInputValue(next ? `請 ${next.name} 協助我` : "");
                  onSquadPreview?.(next);
                }}
                style={{
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 12, fontWeight: 500,
                  cursor: "pointer",
                  border: isSelected ? "1px solid #1A1A18" : "1px solid #E4E3E1",
                  background: isSelected ? "#1A1A18" : "#FFFFFF",
                  color: isSelected ? "#FFFFFF" : "#6B6A66",
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {squad.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Resource matching banner — polling until ready */}
      {missionId ? (
        <ResourceBanner missionId={missionId} />
      ) : (
        <div style={{ fontSize: 12, color: "#C8C7C3", marginTop: 18 }}>
          建立任務後顯示推薦小隊
        </div>
      )}
    </div>
  );
};
