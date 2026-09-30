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
  /** Language: "en" or "zh-TW" (default zh-TW) */
  lang?: string;
  /** 標記頭像為「換到成品頁時的起飛點」（v2/content/lib/agentHandoff.ts）。 */
  handoffAnchor?: boolean;
  /** 目前在做的事：頭像左下角出現對應的小動畫（寫文案＝振筆疾書、圖片＝畫筆上色）。 */
  activity?: "write" | "image" | null;
}

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

export default function RunningAgentCarousel({
  agents, stages, accentColor, progressPct, elapsedText, lang = "zh-TW", handoffAnchor, activity,
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
  // 2026-05-14 (CJ「執行中，已超過 103 秒還在 Jordan Hayes 審核」): the simulator
  // runs out of stages around 60s for 100s-tier tasks. After that EVERY stage
  // is "done" → old code fell back to showing the last done stage's label
  // (QA), making it look like QA was stuck for 100s+. Real cause was the
  // task running past the simulator's scripted timeline. Show a "wrapping up"
  // message instead so users don't think a specific agent is hanging.
  const runningStageLabel = useMemo(() => {
    if (!stages || stages.length === 0) return null;
    const running = stages.find((s) => s.status === "running");
    if (running) return running.label;
    // All stages done but task still rendering → backend is finalising
    // (LLM finishing, image still gen-ing, recording to DB, etc.)
    const allDone = stages.length > 0 && stages.every((s) => s.status === "done");
    if (allDone) {
      return typeof navigator !== "undefined" && /^en/i.test(navigator.language ?? "")
        ? "Wrapping up…"
        : "收尾中…（最後幾秒）";
    }
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
          data-agent-handoff={handoffAnchor ? "" : undefined}
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
        {activity && <ActivityBadge kind={activity} accent={accentColor} />}
        {/* Percentage label — center bottom-overlay style. Only shows
            when progress > 0 to avoid empty 0% noise on first render. */}
        {safePct > 0 && (
          <div
            className="absolute font-bold tabular-nums"
            style={{
              bottom: -4, right: -4,
              fontSize: 12,
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
          {activeAgent.role ?? activeAgent.title ?? (lang === "en" ? "Agent" : "AI 專家")}
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
        <div className="mt-3 text-[12px] text-default-400 text-center tabular-nums">
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

/**
 * 2026-09-30（CJ「Yawen 寫的時候，可以增加動畫嗎？振筆疾書的動畫」）：
 * 頭像左下角一張小紙，筆在上面來回快寫、墨線一條條長出來；
 * 圖片階段換成畫筆＋一塊塊上色。關掉動態效果時停在畫好的樣子。
 */
function ActivityBadge({ kind, accent }: { kind: "write" | "image"; accent: string }) {
  const INK = "#1F2A44";
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-full bg-white flex items-center justify-center"
      style={{ left: -10, bottom: -6, width: 46, height: 46, boxShadow: "0 2px 8px rgba(0,0,0,0.12)", border: "2px solid white" }}
    >
      <svg viewBox="0 0 40 40" width={40} height={40} fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        <style>{`
          .ab-ink { stroke-dasharray: 16; stroke-dashoffset: 16; animation: ab-draw 1.8s ease-in-out infinite }
          .ab-ink.l2 { animation-delay: .45s } .ab-ink.l3 { animation-delay: .9s }
          @keyframes ab-draw { 0% { stroke-dashoffset: 16 } 35%, 80% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: 16; opacity: 0 } }
          .ab-pen { transform-box: fill-box; transform-origin: 0% 100%; animation: ab-scribble .45s ease-in-out infinite, ab-line 1.8s steps(1) infinite }
          @keyframes ab-scribble { 0%,100% { rotate: -8deg } 50% { rotate: 10deg } }
          @keyframes ab-line { 0% { translate: 0 0 } 25% { translate: 0 6px } 50% { translate: 0 12px } 75% { translate: 0 0 } }
          .ab-dab { opacity: 0; animation: ab-pop 1.8s ease-out infinite }
          .ab-dab.d2 { animation-delay: .5s } .ab-dab.d3 { animation-delay: 1s }
          @keyframes ab-pop { 0% { opacity: 0; transform: scale(.3) } 30%, 80% { opacity: 1; transform: scale(1) } 100% { opacity: 0 } }
          .ab-dab { transform-box: fill-box; transform-origin: 50% 50% }
          @media (prefers-reduced-motion: reduce) {
            .ab-ink, .ab-pen, .ab-dab { animation: none; stroke-dashoffset: 0; opacity: 1 }
          }
        `}</style>
        <rect x="6" y="8" width="22" height="26" rx="3" fill="#fff" strokeWidth={1.8} />
        {kind === "write" ? (
          <>
            <path className="ab-ink" d="M10 15 h14" strokeWidth={1.8} />
            <path className="ab-ink l2" d="M10 21 h14" strokeWidth={1.8} />
            <path className="ab-ink l3" d="M10 27 h9" strokeWidth={1.8} />
            {/* 筆：以筆尖為支點快速擺動，每 0.45 秒換一行 */}
            <g className="ab-pen">
              <path d="M24 13 l8 -9 l3 3 l-9 8 z" fill={accent} strokeWidth={1.5} />
              <path d="M24 13 l-1.5 3.5 l3.5 -1.5" fill="#fff" strokeWidth={1.5} />
            </g>
          </>
        ) : (
          <>
            <circle className="ab-dab" cx="12" cy="16" r="3" fill={accent} stroke="none" />
            <circle className="ab-dab d2" cx="20" cy="22" r="3.5" fill="#DCE6F4" stroke="none" />
            <circle className="ab-dab d3" cx="13" cy="27" r="2.5" fill={INK} stroke="none" />
            <g className="ab-pen">
              <path d="M24 16 l9 -10 l2.5 2.5 l-10 9 z" fill={INK} strokeWidth={1.2} />
              <path d="M24 16 c-2 1 -3 3 -2.5 4.5 c2 0 3.5 -1.5 4.5 -2.5 z" fill={accent} strokeWidth={1.2} />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
