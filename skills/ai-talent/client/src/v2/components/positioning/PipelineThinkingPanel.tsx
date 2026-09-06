/**
 * PipelineThinkingPanel — layer-1 brand positioning "war-room" view.
 *
 * 2026-05-11 (CJ「工作區或許可參考企劃區的人像加上思維」):
 * redesigned around a Theater-style persona + speech-bubble so the
 * brain bar visually matches the rest of the product. The whole panel
 * replaces the regular brand workspace while a pipeline run is active —
 * so PositioningTopRow + PositioningGrid don't compete for attention.
 *
 * Layout:
 *   [PORTRAIT]  [SPEECH BUBBLE — eyebrow + step title + typewriter]
 *   ────────────────────────────────────────────────────────────
 *   [REASONING column, long-form]      [AGENDA sidebar, 14 steps]
 *
 * Discipline: B&W line-art (2px solid #111, 4px offset shadow). Echoes
 * Theater's BrainBar / PlatformCell.
 */
import React from "react";
import { Avatar, Button, Progress } from "@heroui/react";
import {
  Play, Pause, SkipForward, Square, CircleDot, CheckCircle2,
} from "lucide-react";
import type { PipelineStepSpec, PipelineStatus } from "../../lib/positioningPipeline";

export interface PipelineThinkingPanelProps {
  steps: PipelineStepSpec[];
  status: PipelineStatus;
  cursor: number;
  completedIds: number[];
  thinkingText: string | null;
  phase: "loading" | "typing" | "writing";
  startedAt: number | null;
  title?: string;
  /** Brand name to seed the strategist persona. */
  brandName?: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

function cleanTitle(s?: string) {
  return s?.replace(/^(?:Step\s+\S+|最後)\s*[—\-]\s*/u, "") ?? "";
}

/* Typewriter — reveals text character-by-character, but jumps if upstream
 * text changes drastically (so streaming chunks don't queue endlessly). */
function useTypewriter(text: string | null, cps = 60) {
  const [shown, setShown] = React.useState("");
  React.useEffect(() => {
    if (!text) { setShown(""); return; }
    // If the current shown is a prefix of the new text and within 200
    // chars, keep typing forward; otherwise snap to text minus 80 chars
    // so the trailing reveal still feels live without ever lagging far.
    let from = 0;
    if (text.startsWith(shown) && text.length - shown.length < 400) {
      from = shown.length;
    } else if (text.length > 200) {
      from = Math.max(0, text.length - 200);
      setShown(text.slice(0, from));
    }
    let i = from;
    const interval = 1000 / cps;
    const tick = setInterval(() => {
      i++;
      if (i >= text.length) {
        setShown(text);
        clearInterval(tick);
      } else {
        setShown(text.slice(0, i));
      }
    }, interval);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return shown;
}

export default function PipelineThinkingPanel({
  steps, status, cursor, completedIds,
  thinkingText, phase, startedAt,
  title = "Brand Positioning",
  brandName,
  onStart, onPause, onResume, onSkip, onStop,
}: PipelineThinkingPanelProps) {
  const total = steps.length;
  const current = steps[cursor];
  const next = steps[cursor + 1];
  const pct = status === "done"
    ? 100
    : Math.round((completedIds.length / Math.max(1, total)) * 100);

  // Live elapsed counter for the current step.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [status]);
  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  // Persona — stable strategist avatar seeded by brand name.
  const personaName = "策略總監";
  const personaSeed = `Strategist-${brandName ?? "Drop"}`;
  const personaAvatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(personaSeed)}`;

  // Typewriter for the streaming reasoning.
  const typed = useTypewriter(thinkingText, 65);

  // Auto-scroll reasoning to bottom as text streams in.
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [typed]);

  const stepTitle = cleanTitle(current?.title) || (status === "done" ? "完成" : "—");

  return (
    <section className="relative">
      {/* ── Brain bar — portrait + speech bubble (Theater style) ─────── */}
      <div className="flex items-stretch gap-5 mb-5">
        {/* Portrait */}
        <div className="flex-shrink-0 relative">
          <div
            className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center"
            style={{ border: "2px solid #111", boxShadow: "4px 4px 0 rgba(17,17,17,0.4)" }}
          >
            <Avatar src={personaAvatar} size="lg" className="w-20 h-20" radius="md" />
          </div>
          <div
            className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[12px] font-bold text-white rounded-md whitespace-nowrap"
            style={{ background: "#111", border: "1.5px solid #111" }}
          >
            策略總監
          </div>
        </div>

        {/* Speech bubble */}
        <div className="flex-1 relative">
          <div
            className="relative bg-white px-6 py-4 rounded-2xl h-full"
            style={{
              border: "2px solid #111",
              boxShadow: "4px 4px 0 rgba(17,17,17,0.2)",
              minHeight: 96,
            }}
          >
            {/* speech tail */}
            <div
              className="absolute left-[-10px] top-8 w-5 h-5 bg-white"
              style={{
                borderLeft: "2px solid #111",
                borderBottom: "2px solid #111",
                transform: "rotate(45deg)",
              }}
            />
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-neutral-700">
                <span className="font-semibold text-neutral-800">{personaName}</span>
                <span className="text-neutral-500">·</span>
                <span>{title}</span>
                <span className="text-neutral-500">·</span>
                <span>Step {Math.min(cursor + 1, total)} / {total}</span>
                {status === "running" && (
                  <span className="inline-flex items-center gap-1 text-neutral-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-pulse" />
                    Live
                  </span>
                )}
                {status === "paused" && <span className="text-amber-700">Paused</span>}
                {status === "done" && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 size={11} /> Done
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {status === "running" && (
                  <>
                    <IconBtn label="暫停" onClick={onPause}><Pause size={13} /></IconBtn>
                    <IconBtn label="跳過" onClick={onSkip}><SkipForward size={13} /></IconBtn>
                    <IconBtn label="停止" onClick={onStop}><Square size={13} /></IconBtn>
                  </>
                )}
                {status === "paused" && (
                  <>
                    <Button size="sm" className="bg-neutral-900 text-white font-semibold h-7" startContent={<Play size={12} fill="currentColor" />} onPress={onResume}>繼續</Button>
                    <IconBtn label="停止" onClick={onStop}><Square size={13} /></IconBtn>
                  </>
                )}
                {status === "done" && (
                  <Button size="sm" variant="light" className="h-7" onPress={onStop}>關閉</Button>
                )}
                {status === "idle" && (
                  <Button size="sm" className="bg-neutral-900 text-white font-semibold h-7" startContent={<Play size={12} fill="currentColor" />} onPress={onStart}>開始分析</Button>
                )}
              </div>
            </div>

            <h2
              className="font-bold text-neutral-900 leading-tight tracking-tight"
              style={{ fontSize: "clamp(1.25rem, 1.8vw, 1.625rem)" }}
            >
              {stepTitle}
            </h2>

            {/* Progress + elapsed */}
            {status !== "idle" && (
              <div className="mt-3">
                <Progress
                  size="sm"
                  value={pct}
                  aria-label="pipeline progress"
                  classNames={{
                    indicator: status === "done" ? "bg-emerald-600" : "bg-neutral-900",
                    track: "bg-neutral-100",
                  }}
                />
                <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-neutral-700 mt-1.5">
                  <span>{completedIds.length} / {total} complete</span>
                  {status === "running" && <span className="font-mono">{elapsedSec}s</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body: reasoning + agenda ──────────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr,260px] bg-white rounded-2xl overflow-hidden"
        style={{ border: "2px solid #111", boxShadow: "4px 4px 0 rgba(17,17,17,0.12)" }}
      >
        {/* LEFT — reasoning */}
        <div className="px-7 py-6 lg:border-r border-neutral-200 min-h-[280px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-700 mb-3">
            {phase === "loading" && "Anthropic 啟動推理鏈"}
            {phase === "typing"  && "Reasoning · streaming"}
            {phase === "writing" && "寫入欄位中"}
            {status === "done"   && "Final reasoning"}
          </p>

          <div
            ref={bodyRef}
            className="text-[14px] leading-[1.9] text-neutral-700 whitespace-pre-wrap max-h-[420px] overflow-y-auto pr-2"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, "Times New Roman", serif',
            }}
          >
            {phase === "loading" && !typed && (
              <div className="text-neutral-700 italic text-sm">
                正在啟動 Anthropic 推理鏈，搭配 web search 與既有 context 推導本步驟。
                通常 20–60 秒，請稍候 — 系統不是當機，是在認真思考。
              </div>
            )}
            {/* 2026-05-11 (CJ「你好中文按了品牌定位後，一直停留在 0/14」):
                stuck-step rescue hint — visible after 45s on the same step. */}
            {status === "running" && elapsedSec >= 45 && phase !== "writing" && (
              <div
                style={{
                  marginTop: 12, padding: "10px 14px",
                  border: "1px solid #FBBF24", background: "#FFFBEB",
                  borderRadius: 8,
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 12.5, color: "#92400E", lineHeight: 1.55,
                }}
              >
                <strong>這一步比平常久（{elapsedSec}s）</strong>
                ：系統會在 90 秒後自動跳過，也可以按右上方「跳過」立即略過 — 之後可單獨重跑此段。
              </div>
            )}
            {typed}
            {status === "running" && phase === "typing" && (
              <span
                className="inline-block w-[2px] h-[1.05em] bg-neutral-900 align-middle ml-0.5"
                style={{ animation: "pulse-cursor 1s steps(2) infinite" }}
              />
            )}
          </div>
          <style>{`@keyframes pulse-cursor { 50% { opacity: 0 } }`}</style>
        </div>

        {/* RIGHT — agenda */}
        <aside className="px-6 py-6 bg-neutral-50/50">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-700 mb-3">
            Agenda
          </p>

          {/* Now */}
          <div className="mb-4">
            <p className="text-[12px] uppercase tracking-[0.2em] text-neutral-700 mb-1">Now</p>
            <div className="flex items-start gap-2">
              <CircleDot size={13} className="text-neutral-900 mt-1 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 leading-snug">{stepTitle}</p>
                {current?.segmentId && (
                  <p className="text-[12px] text-neutral-700 mt-0.5 font-mono">{current.segmentId}</p>
                )}
              </div>
            </div>
          </div>

          {next && status !== "done" && (
            <div className="mb-4">
              <p className="text-[12px] uppercase tracking-[0.2em] text-neutral-700 mb-1">Next</p>
              <p className="text-sm text-neutral-700 leading-snug pl-5">
                {cleanTitle(next.title)}
              </p>
            </div>
          )}

          <div className="border-t border-neutral-200 pt-3">
            <p className="text-[12px] uppercase tracking-[0.2em] text-neutral-700 mb-2">
              All · {total}
            </p>
            <ol className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
              {steps.map((s, i) => {
                const isDone = completedIds.includes(s.id);
                const isCur = i === cursor && status !== "done";
                const isFuture = i > cursor;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 text-[11.5px] leading-snug ${
                      isCur ? "text-neutral-900 font-semibold"
                        : isDone ? "text-neutral-700"
                        : isFuture ? "text-neutral-700"
                        : "text-neutral-700"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                        isDone ? "bg-neutral-400"
                          : isCur ? "bg-neutral-900 animate-pulse"
                          : "bg-neutral-200"
                      }`}
                    />
                    <span className="font-mono text-[12px] text-neutral-700 w-5 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate">{cleanTitle(s.title)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}

function IconBtn({
  children, label, onClick,
}: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-900 transition"
    >
      {children}
    </button>
  );
}
