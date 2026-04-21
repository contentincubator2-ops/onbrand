/**
 * PhaseTabs.tsx
 *
 * Scheme B: horizontal tab strip across the top of the chat area.
 * Each tab represents a distinct phase conversation:
 *   • phase 0 = intake / squad lead onboarding
 *   • phase 1..N = workflow step conversations
 *
 * Active tab shows the agent name inline; inactive tabs show avatar + short label.
 * Click a tab → parent sets `activePhase`, which is sent as `phaseOrder` on every
 * subsequent chat request so the server loads/writes to the correct session.
 */

import React from "react";
import type { SquadStepProgress } from "../MissionChatCore";

interface Props {
  steps: SquadStepProgress[];           // phase 1..N (from squadStepProgress)
  activePhase: number;                   // 0..N
  onPhaseChange: (phase: number) => void;
  leadAgentName?: string;                // for phase 0 tab
  leadAgentTitle?: string;
  stalePhases?: Set<number>;             // phases flagged stale (Task 5)
}

const INK    = "#1A1A18";
const MUTED  = "#6B6A66";
const SUBTLE = "#9B9990";
const BORDER = "#E4E3E1";
const ACCENT = "#E8631A";

// Small circular avatar with the agent's first initial
function Avatar({ name, active }: { name: string; active: boolean }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div style={{
      width: 20, height: 20, borderRadius: "50%",
      background: active ? INK : "#E4E3E1",
      color: active ? "#FFF" : MUTED,
      fontSize: 10, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

export function PhaseTabs({
  steps,
  activePhase,
  onPhaseChange,
  leadAgentName = "Squad Lead",
  leadAgentTitle,
  stalePhases,
}: Props) {

  if (!steps || steps.length === 0) return null;

  // Phase 0 (intake) + each workflow step
  const tabs: Array<{
    phase: number;
    label: string;
    agentName: string;
    agentTitle?: string;
    status?: "waiting" | "running" | "done";
  }> = [
    { phase: 0, label: "初談", agentName: leadAgentName, agentTitle: leadAgentTitle, status: undefined },
    ...steps.map((s) => ({
      phase: s.step,
      label: s.label || `Step ${s.step}`,
      agentName: s.agentName,
      agentTitle: s.agentTitle,
      status: s.status,
    })),
  ];

  return (
    <div style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      padding: "0 12px",
      background: "#FAFAF9",
      borderBottom: `1px solid ${BORDER}`,
      overflowX: "auto",
      scrollbarWidth: "thin",
    }}>
      {tabs.map((t, i) => {
        const active = t.phase === activePhase;
        const stale = stalePhases?.has(t.phase);
        const statusDot =
          t.status === "done"    ? { bg: "#C5F0D5", color: "#1A7F3C" } :
          t.status === "running" ? { bg: "#FFE8D4", color: ACCENT } :
          null;

        return (
          <button
            key={t.phase}
            onClick={() => onPhaseChange(t.phase)}
            title={t.agentTitle ? `${t.agentName} · ${t.agentTitle}` : t.agentName}
            style={{
              border: "none",
              borderBottom: active ? `2px solid ${INK}` : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              padding: "9px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexShrink: 0,
              fontFamily: "inherit",
              color: active ? INK : MUTED,
              fontSize: 12,
              lineHeight: 1.2,
              position: "relative",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#F2F1EF"; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Avatar name={t.agentName} active={active} />

            {/* Stale warning red dot */}
            {stale && (
              <span
                title="此階段後有上游變動 — 可能需要重跑"
                style={{
                  position: "absolute", top: 6, left: 22,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#D14343",
                  border: "1.5px solid #FFF",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Step number chip */}
            <span style={{
              fontSize: 9, fontWeight: 700, color: SUBTLE,
              fontVariantNumeric: "tabular-nums",
            }}>
              {t.phase === 0 ? "0" : t.phase.toString().padStart(2, "0")}
            </span>

            {/* Phase label + optional agent name when active */}
            <span style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              lineHeight: 1.15,
            }}>
              <span style={{
                fontWeight: active ? 600 : 500,
                whiteSpace: "nowrap",
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {t.label}
              </span>
              {active && (
                <span style={{
                  fontSize: 9.5, color: SUBTLE,
                  whiteSpace: "nowrap",
                  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {t.agentName}
                </span>
              )}
            </span>

            {/* Status pill (waiting/running/done) */}
            {statusDot && (
              <span style={{
                fontSize: 8.5, fontWeight: 700,
                background: statusDot.bg, color: statusDot.color,
                padding: "1px 5px", borderRadius: 10,
                letterSpacing: "0.02em",
                flexShrink: 0,
              }}>
                {t.status === "done" ? "完成" : t.status === "running" ? "執行中" : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
