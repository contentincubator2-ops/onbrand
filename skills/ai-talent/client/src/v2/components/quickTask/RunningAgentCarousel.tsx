/**
 * RunningAgentCarousel — small Notion-style card showing the current
 * agent doing the work, with concentric-ring highlight animation. For
 * 60s/100s multi-agent tasks the avatar rotates through team members.
 *
 * CJ direction (2026-05-08):
 *   "多 agent 頭像出現在小白卡，類似 [Notion popup with concentric
 *    ring highlight on icon] 這張圖。"
 *
 * Usage: rendered inside the modal's "running" state (no output yet).
 * Replaces the previous simple Spinner + text + StagePipelineView for a
 * more focused single-card experience.
 */
import { useEffect, useState, useMemo } from "react";
import { Avatar } from "@heroui/react";

interface AgentLike {
  id?: number;
  name: string;
  title?: string;
  avatarUrl?: string | null;
  role?: string;
}

interface Stage {
  key: string;
  label: string;
  status?: "pending" | "running" | "done" | "failed";
}

interface Props {
  /** All agents working on this task (caption_writer, image_director, QA, etc.) */
  agents: AgentLike[];
  /** Current stages from orchestra (drives "X 正在做 Y" text) */
  stages?: Stage[] | null;
  /** Tier color for ring accent */
  accentColor: string;
  /** Optional progress 0-100 */
  progressPct?: number;
  /** Latency display "12.3s / 20s" */
  elapsedText?: string;
}

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

export default function RunningAgentCarousel({
  agents, stages, accentColor, progressPct, elapsedText,
}: Props) {
  // Rotate through agents every 2.4s. If only 1 agent, stay on it.
  const [activeIdx, setActiveIdx] = useState(0);
  const safeAgents = agents.filter(Boolean);

  useEffect(() => {
    if (safeAgents.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % safeAgents.length);
    }, 2400);
    return () => clearInterval(t);
  }, [safeAgents.length]);

  const activeAgent = safeAgents[activeIdx] ?? safeAgents[0];

  // Pick most relevant running stage line for the caption beneath the avatar.
  const runningStageLabel = useMemo(() => {
    if (!stages || stages.length === 0) return null;
    const running = stages.find((s) => s.status === "running");
    if (running) return running.label;
    const lastDone = [...stages].reverse().find((s) => s.status === "done");
    return lastDone?.label ?? stages[0]?.label ?? null;
  }, [stages]);

  if (!activeAgent) return null;

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* Concentric ring + avatar */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 132, height: 132 }}
      >
        {/* Outer ring — slow pulse */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: `2px solid ${accentColor}55`,
            animation: "ringPulseSlow 2.4s ease-in-out infinite",
          }}
        />
        {/* Mid ring — faster pulse, offset */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 14,
            border: `2px solid ${accentColor}99`,
            animation: "ringPulseFast 1.8s ease-in-out infinite 0.4s",
          }}
        />
        {/* Inner solid ring — solid colour */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 28,
            border: `2px solid ${accentColor}`,
          }}
        />
        {/* Avatar — fades when active idx changes */}
        <div
          key={activeAgent.id ?? activeAgent.name}
          className="absolute rounded-full overflow-hidden bg-white"
          style={{
            inset: 32,
            animation: "avatarFade 0.45s ease",
            boxShadow: `0 0 18px ${accentColor}55`,
          }}
        >
          <Avatar
            src={activeAgent.avatarUrl || dicebear(activeAgent.name)}
            className="w-full h-full"
            classNames={{ base: "w-full h-full rounded-full" }}
          />
        </div>
        {/* Tiny status dot top-right */}
        <span
          className="absolute rounded-full"
          style={{
            top: 18, right: 18,
            width: 14, height: 14,
            background: "#10B981",
            border: "2px solid white",
            animation: "blink 1.2s ease-in-out infinite",
          }}
          title="active"
        />
      </div>

      {/* Agent name + role */}
      <div className="mt-4 text-center">
        <div className="text-sm font-semibold text-default-900 leading-tight">
          {activeAgent.name}
        </div>
        <div className="text-tiny text-default-500 mt-0.5">
          {activeAgent.role ?? activeAgent.title ?? "Agent"}
        </div>
      </div>

      {/* Stage label */}
      {runningStageLabel && (
        <div
          className="mt-3 px-3 py-1 rounded-full text-tiny font-medium"
          style={{
            background: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {runningStageLabel}
        </div>
      )}

      {/* Progress bar (thin) */}
      {typeof progressPct === "number" && (
        <div className="w-full max-w-[280px] mt-4">
          <div className="h-1 rounded-full bg-default-100 overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, progressPct)}%`,
                background: accentColor,
              }}
            />
          </div>
          {elapsedText && (
            <div className="mt-1.5 text-[10px] text-default-400 text-center tabular-nums">
              {elapsedText}
            </div>
          )}
        </div>
      )}

      {/* Roster of all agents — small dots beneath, highlights active */}
      {safeAgents.length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          {safeAgents.map((a, i) => (
            <div
              key={a.id ?? a.name}
              className="rounded-full overflow-hidden transition-all"
              style={{
                width: i === activeIdx ? 26 : 20,
                height: i === activeIdx ? 26 : 20,
                opacity: i === activeIdx ? 1 : 0.45,
                boxShadow: i === activeIdx ? `0 0 0 2px ${accentColor}` : "none",
              }}
              title={`${a.name} · ${a.role ?? a.title ?? ""}`}
            >
              <Avatar
                src={a.avatarUrl || dicebear(a.name)}
                className="w-full h-full"
                classNames={{ base: "w-full h-full" }}
              />
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes ringPulseSlow {
          0%, 100% { transform: scale(1); opacity: 0.6 }
          50% { transform: scale(1.08); opacity: 0.3 }
        }
        @keyframes ringPulseFast {
          0%, 100% { transform: scale(1); opacity: 0.85 }
          50% { transform: scale(1.06); opacity: 0.5 }
        }
        @keyframes avatarFade {
          from { opacity: 0; transform: scale(0.92) }
          to { opacity: 1; transform: scale(1) }
        }
        @keyframes blink {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.35 }
        }
      `}</style>
    </div>
  );
}
