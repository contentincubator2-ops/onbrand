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

  // 2026-05-11 (CJ direction「外框圓周視為 100%，陸續跑完」):
  // Replace 3 pulse rings with single SVG arc that fills clockwise as
  // progress completes. Apple Watch activity-ring vibe — avatar = task,
  // ring around it = progress percentage.
  const SIZE = 132;
  const STROKE = 6;            // ring thickness
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const safePct = Math.max(0, Math.min(100, typeof progressPct === "number" ? progressPct : 0));
  const dashOffset = CIRCUMFERENCE * (1 - safePct / 100);

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* Avatar with SVG progress ring around perimeter */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
      >
        {/* Background ring (the unfilled remainder) + progress arc */}
        <svg
          width={SIZE}
          height={SIZE}
          className="absolute inset-0"
          style={{ transform: "rotate(-90deg)" /* start at 12 o'clock */ }}
        >
          {/* Background track — light grey ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={`${accentColor}22`}
            strokeWidth={STROKE}
          />
          {/* Progress arc — fills clockwise as safePct grows */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={accentColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        </svg>
        {/* Avatar — fades when active idx changes. Sits inside the ring
            with a small gap so the ring is clearly visible. */}
        <div
          key={activeAgent.id ?? activeAgent.name}
          className="absolute rounded-full overflow-hidden bg-white"
          style={{
            inset: STROKE + 4,
            animation: "avatarFade 0.45s ease",
            boxShadow: `0 0 16px ${accentColor}44`,
          }}
        >
          <Avatar
            src={activeAgent.avatarUrl || dicebear(activeAgent.name)}
            className="w-full h-full"
            classNames={{ base: "w-full h-full rounded-full" }}
          />
        </div>
        {/* Percentage label — center bottom-overlay style. Only shows
            when progress > 0 to avoid empty 0% noise on first render. */}
        {safePct > 0 && (
          <div
            className="absolute font-bold tabular-nums"
            style={{
              bottom: -4, right: -4,
              fontSize: 11,
              padding: "2px 6px",
              background: accentColor,
              color: "white",
              borderRadius: 999,
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            {Math.round(safePct)}%
          </div>
        )}
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

      {/* 2026-05-11: removed thin horizontal progress bar — the avatar
          ring above IS the progress indicator now. Only keep elapsed
          timestamp text. */}
      {elapsedText && (
        <div className="mt-3 text-[10px] text-default-400 text-center tabular-nums">
          {elapsedText}
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
