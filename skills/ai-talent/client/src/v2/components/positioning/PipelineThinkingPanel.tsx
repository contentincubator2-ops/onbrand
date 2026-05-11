/**
 * PipelineThinkingPanel — layer-1, editorial "brain at work" display.
 *
 * 2026-05-11 (CJ「直接在第一層顯現，要有頂級廣告公司的感覺」)
 *
 * Previously the streaming reasoning only appeared inside a segment
 * editor (layer 2). This panel hoists it onto the brand workspace
 * home view so users see the AI thinking the moment they hit
 * 「開始品牌定位」 — without having to descend into a sub-page.
 *
 * Design discipline (B&W 4A agency):
 *   - No gradients. No decorative emojis. No coloured rings.
 *   - Editorial typography hierarchy: tiny eyebrow → big title → reasoning body.
 *   - Two-column grid: long-form reasoning (left, ~7/10) + control sidebar
 *     (right, ~3/10) showing progress, current/next step, controls.
 *   - Subtle ticker dot signals liveness; no spinner unless cold-start.
 *   - Reasoning text uses a serif-feeling stack to evoke long-form editorial.
 */
import React from "react";
import { Button, Progress } from "@heroui/react";
import {
  Play, Pause, SkipForward, Square, CircleDot, CheckCircle2, Sparkles,
} from "lucide-react";
import type { PipelineStepSpec, PipelineStatus } from "../../lib/positioningPipeline";

export interface PipelineThinkingPanelProps {
  steps: PipelineStepSpec[];
  status: PipelineStatus;
  cursor: number;
  completedIds: number[];
  /** The streaming reasoning text from the LLM. */
  thinkingText: string | null;
  /** 'loading' before stream arrives, 'typing' while text streams, 'writing' = persisting. */
  phase: "loading" | "typing" | "writing";
  /** ms timestamp when the current step started — drives the elapsed counter. */
  startedAt: number | null;
  /** Title shown in the eyebrow row. */
  title?: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

function cleanTitle(s?: string) {
  return s?.replace(/^(?:Step\s+\S+|最後)\s*[—\-]\s*/u, "") ?? "";
}

export default function PipelineThinkingPanel({
  steps, status, cursor, completedIds,
  thinkingText, phase, startedAt,
  title = "Brand Positioning",
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

  // Auto-scroll the reasoning area to the bottom as text streams in.
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thinkingText]);

  return (
    <section
      className="relative bg-white border border-neutral-200 rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 8px 32px -16px rgba(0,0,0,0.08)" }}
    >
      {/* ── Top rail (eyebrow row) ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-100 bg-neutral-50/60">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-neutral-500">
            {title}
          </span>
          <span className="text-neutral-300">·</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
            Step {Math.min(cursor + 1, total)} / {total}
          </span>
          {status === "running" && (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-900 animate-pulse" />
              Live
            </span>
          )}
          {status === "paused" && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Paused</span>
          )}
          {status === "done" && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-700">
              <CheckCircle2 size={11} /> Completed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "idle" && (
            <Button
              size="sm"
              className="bg-neutral-900 text-white data-[hover=true]:bg-neutral-800 font-semibold"
              startContent={<Play size={13} fill="currentColor" />}
              onPress={onStart}
            >
              開始分析
            </Button>
          )}
          {status === "running" && (
            <>
              <Button size="sm" variant="bordered" startContent={<Pause size={12} />} onPress={onPause}>暫停</Button>
              <Button size="sm" variant="bordered" startContent={<SkipForward size={12} />} onPress={onSkip}>跳過</Button>
              <Button size="sm" variant="light" startContent={<Square size={12} />} onPress={onStop}>停止</Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button size="sm" className="bg-neutral-900 text-white font-semibold" startContent={<Play size={13} fill="currentColor" />} onPress={onResume}>繼續</Button>
              <Button size="sm" variant="light" startContent={<Square size={12} />} onPress={onStop}>停止</Button>
            </>
          )}
          {status === "done" && (
            <Button size="sm" variant="light" onPress={onStop}>關閉</Button>
          )}
        </div>
      </div>

      {/* ── Progress rail (thin) ──────────────────────────────────────── */}
      {status !== "idle" && (
        <div className="px-6 pt-3">
          <Progress
            size="sm"
            value={pct}
            color={status === "done" ? "success" : "default"}
            aria-label="pipeline progress"
            classNames={{ indicator: status === "done" ? "" : "bg-neutral-900" }}
          />
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-neutral-400 mt-1.5">
            <span>{completedIds.length} of {total} complete</span>
            {status === "running" && <span className="font-mono">{elapsedSec}s</span>}
          </div>
        </div>
      )}

      {/* ── Main body: editorial 2-column ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,260px]">
        {/* LEFT — reasoning column */}
        <div className="px-6 lg:px-8 py-6 lg:border-r border-neutral-100">
          {status === "idle" ? (
            <div className="py-10 max-w-[640px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400 mb-3">
                READY
              </p>
              <h2 className="font-bold text-neutral-900 leading-tight mb-3"
                  style={{ fontSize: "clamp(1.5rem, 2.2vw, 2rem)" }}>
                準備好深入分析了
              </h2>
              <p className="text-sm text-neutral-600 leading-relaxed">
                14 個推理步驟，每一步都由 Claude Sonnet 4.5 配上 web research，
                從信念基礎、市場局勢，一路推導出單一核心命題與品牌守則。
                平均 6–10 分鐘 — 期間你可以隨時暫停、跳過或編輯結論。
              </p>
            </div>
          ) : (
            <>
              {/* Eyebrow + clean title for the active step */}
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400 mb-2">
                {phase === "loading" && "正在啟動推理"}
                {phase === "typing"  && "Reasoning · streaming"}
                {phase === "writing" && "Writing to fields"}
              </p>
              <h2
                className="font-bold text-neutral-900 leading-[1.15] tracking-tight mb-5"
                style={{ fontSize: "clamp(1.5rem, 2.2vw, 2rem)" }}
              >
                {cleanTitle(current?.title) || "完成"}
              </h2>

              {/* Reasoning body */}
              <div
                ref={bodyRef}
                className="text-[13.5px] leading-[1.85] text-neutral-700 whitespace-pre-wrap max-h-[420px] overflow-y-auto pr-2"
                style={{
                  fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, "Times New Roman", serif',
                  columnGap: 32,
                }}
              >
                {phase === "loading" && !thinkingText && (
                  <div className="text-neutral-400 italic text-sm">
                    Anthropic 正在啟動推理鏈，搭配 web search 與既有 context 推導本步驟。
                    通常 20–60 秒，請稍候。
                  </div>
                )}
                {thinkingText}
                {status === "running" && phase === "typing" && (
                  <span className="inline-block w-[2px] h-[1.1em] bg-neutral-900 align-middle ml-0.5 animate-pulse" />
                )}
                {status === "done" && (
                  <div className="text-neutral-500 italic">
                    所有步驟完成 — 結論已寫入下方各區。
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT — sidebar: now / next / queue */}
        <aside className="px-6 lg:px-7 py-6 bg-neutral-50/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400 mb-3">
            Agenda
          </p>

          {/* Now */}
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-1">Now</p>
            <div className="flex items-start gap-2">
              <CircleDot size={13} className="text-neutral-900 mt-1 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 leading-snug">
                  {cleanTitle(current?.title) || (status === "done" ? "完成" : "—")}
                </p>
                {current?.segmentId && (
                  <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                    {current.segmentId}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Next */}
          {next && (
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-1">Next</p>
              <div className="flex items-start gap-2">
                <Sparkles size={12} className="text-neutral-400 mt-1 shrink-0" />
                <p className="text-sm text-neutral-600 leading-snug">
                  {cleanTitle(next.title)}
                </p>
              </div>
            </div>
          )}

          {/* Queue (compact list of all steps with status dot) */}
          <div className="border-t border-neutral-200 pt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-2">
              All steps · {total}
            </p>
            <ol className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {steps.map((s, i) => {
                const isDone = completedIds.includes(s.id);
                const isCur = i === cursor && status !== "done";
                const isFuture = i > cursor;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 text-[11.5px] leading-snug ${
                      isCur ? "text-neutral-900 font-semibold"
                        : isDone ? "text-neutral-500"
                        : isFuture ? "text-neutral-400"
                        : "text-neutral-500"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                        isDone ? "bg-neutral-400"
                          : isCur ? "bg-neutral-900 animate-pulse"
                          : "bg-neutral-200"
                      }`}
                    />
                    <span className="font-mono text-[10px] text-neutral-400 w-5 shrink-0">
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
