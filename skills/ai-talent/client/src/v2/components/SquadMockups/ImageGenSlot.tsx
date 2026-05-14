/**
 * ImageGenSlot — in-mockup image generation area.
 *
 * Replaces the static "等待 AI 生成" skeleton placeholder in every
 * mockup that has an image area. The same physical space shows:
 *
 *   Phase 1  idle       → gray placeholder ("🎨 圖片方向 · 等待 AI")
 *   Phase 2  designing  → pulsing + "🤔 設計方向思考中…" streaming text
 *   Phase 3  direction  → design direction card (dark overlay)
 *   Phase 4  prompting  → AI Prompt being written (within same overlay)
 *   Phase 5  generating → model + progress indicator
 *   Phase 6  done       → actual generated image (fade in)
 *   Phase 7  error      → error message + retry hint
 *
 * Per CJ direction 2026-05-02:
 *   「圖片的時候，是直接在mockup的圖片區域，展現思考的過程，然後在同一個
 *   地方給出結論，在同一個地方，進行視覺三步驟」
 *
 * Visual 3-step flow (project_media_gen_flow.md):
 *   1. 設計方向提案
 *   2. AI Prompt 生成
 *   3. 模型選擇 + 執行
 */
import React from "react";
import { Button, Chip, Skeleton } from "@heroui/react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ImageGenPhase =
  | "idle"        // waiting, no agent active
  | "designing"   // agent thinking about design direction
  | "direction"   // direction decided, not yet prompting
  | "prompting"   // AI prompt being written
  | "generating"  // model is generating the image
  | "done"        // image ready
  | "error";      // something went wrong

export interface ImageGenSlotProps {
  phase?: ImageGenPhase;
  /** Step 1: design direction text (may stream in word by word) */
  designDirection?: string;
  /** Step 2: AI prompt */
  aiPrompt?: string;
  /** Step 3: which model is being used */
  modelName?: string;
  /** Final result image URL or base64 data URI */
  resultUrl?: string;
  /** Error message */
  errorMsg?: string;
  /** CSS aspect-ratio value, e.g. "16/9" | "1/1" | "4/5" */
  aspectRatio?: string;
  className?: string;
  /** Called when user clicks "重新生成" in error state */
  onRetry?: () => void;
}

// ── Step label mapping ────────────────────────────────────────────────────────

const STEP_LABELS: Record<ImageGenPhase, { step: number; label: string; icon: string }> = {
  idle:       { step: 0, label: "等待 AI",      icon: "🎨" },
  designing:  { step: 1, label: "設計方向提案",     icon: "🤔" },
  direction:  { step: 1, label: "設計方向確認",     icon: "✅" },
  prompting:  { step: 2, label: "AI Prompt 生成",  icon: "✍️" },
  generating: { step: 3, label: "模型執行中",       icon: "🤖" },
  done:       { step: 3, label: "圖片完成",         icon: "✨" },
  error:      { step: 3, label: "生成失敗",         icon: "⚠️" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** 3-step progress indicator strip shown at the top of the slot */
function StepStrip({ phase }: { phase: ImageGenPhase }) {
  const steps = [
    { n: 1, label: "設計方向" },
    { n: 2, label: "AI Prompt" },
    { n: 3, label: "模型執行" },
  ];
  const current = STEP_LABELS[phase].step;
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-black/60 backdrop-blur-sm">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n && phase !== "idle";
        return (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-1">
              <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold
                ${done ? "bg-success text-white" : active ? "bg-primary text-white animate-pulse" : "bg-white/20 text-white/50"}`}>
                {done ? "✓" : s.n}
              </span>
              <span className={`text-[10px] font-medium ${done ? "text-success" : active ? "text-white" : "text-white/40"}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px ${done ? "bg-success/60" : "bg-white/20"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Text content block shown inside the slot overlay */
function OverlayContent({ phase, designDirection, aiPrompt, modelName, errorMsg, onRetry }: ImageGenSlotProps) {
  if (phase === "idle") return null;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
      {/* Step 1: Design Direction */}
      {(phase === "designing" || phase === "direction" || phase === "prompting" || phase === "generating" || phase === "done") && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
            {phase === "designing" ? "🤔 設計方向思考中…" : "🎨 設計方向"}
          </p>
          {phase === "designing" ? (
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              {designDirection && (
                <p className="text-[11px] text-white/80 leading-snug ml-1">{designDirection}</p>
              )}
            </div>
          ) : (
            designDirection && (
              <p className="text-[11px] text-white leading-snug">{designDirection}</p>
            )
          )}
        </div>
      )}

      {/* Step 2: AI Prompt */}
      {(phase === "prompting" || phase === "generating" || phase === "done") && (
        <div className="space-y-1 border-t border-white/10 pt-2">
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
            {phase === "prompting" ? "✍️ AI Prompt 生成中…" : "✍️ AI Prompt"}
          </p>
          {aiPrompt ? (
            <p className="text-[11px] text-white/80 leading-snug font-mono break-all">{aiPrompt}</p>
          ) : phase === "prompting" ? (
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}
        </div>
      )}

      {/* Step 3: Model */}
      {(phase === "generating" || phase === "done") && (
        <div className="space-y-1 border-t border-white/10 pt-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
              {phase === "generating" ? "🤖 模型執行中…" : "🤖 模型"}
            </p>
            {modelName && (
              <Chip size="sm" className="h-4 text-[9px] bg-white/20 text-white border-0">
                {modelName}
              </Chip>
            )}
          </div>
          {phase === "generating" && (
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-[11px] text-danger font-medium">⚠️ {errorMsg ?? "圖片生成失敗"}</p>
          {onRetry && (
            <Button size="sm" color="danger" variant="flat" onPress={onRetry} className="h-6 text-tiny">
              重新生成
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImageGenSlot({
  phase = "idle",
  designDirection,
  aiPrompt,
  modelName,
  resultUrl,
  errorMsg,
  aspectRatio = "16/9",
  className = "",
  onRetry,
}: ImageGenSlotProps) {
  const isActive = phase !== "idle" && phase !== "done" && phase !== "error";
  const isDone = phase === "done" && !!resultUrl;
  const showOverlay = phase !== "idle" && !isDone;

  return (
    <div
      className={`relative overflow-hidden bg-default-100 ${className}`}
      style={{ aspectRatio }}
    >
      {/* Background: skeleton when idle/active, image when done */}
      {isDone ? (
        <img
          src={resultUrl}
          alt="AI 生成圖片"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ animation: "fadeIn 0.5s ease" }}
        />
      ) : (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}

      {/* Idle placeholder icon */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex items-center justify-center text-default-400 flex-col gap-1">
          <span className="text-3xl">🎨</span>
          <p className="text-tiny text-center px-4">圖片方向 · 等待 AI 產出</p>
        </div>
      )}

      {/* Active / error overlay */}
      {showOverlay && (
        <div className="absolute inset-0 flex flex-col bg-black/75 backdrop-blur-sm">
          {/* 3-step progress strip */}
          <StepStrip phase={phase} />
          {/* Content area */}
          <OverlayContent
            phase={phase}
            designDirection={designDirection}
            aiPrompt={aiPrompt}
            modelName={modelName}
            errorMsg={errorMsg}
            onRetry={onRetry}
          />
        </div>
      )}

      {/* "Done" badge */}
      {isDone && (
        <div className="absolute top-2 right-2">
          <Chip size="sm" color="success" variant="solid" className="text-[10px] h-5">
            ✨ AI 生成
          </Chip>
        </div>
      )}

      {/* Pulsing border when actively generating */}
      {isActive && (
        <div className="absolute inset-0 border-2 border-primary rounded-inherit pointer-events-none animate-pulse" />
      )}
    </div>
  );
}

// ── Convenience: static placeholder (backward-compat with existing mockups) ──

/**
 * Drop-in replacement for the old gray skeleton + icon pattern.
 * Usage: <ImageGenPlaceholder text="封面圖 · 等待 AI 生成" aspectRatio="3/1" />
 */
export function ImageGenPlaceholder({
  text = "圖片方向 · 等待 AI 產出",
  aspectRatio = "16/9",
  className = "",
}: {
  text?: string;
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <ImageGenSlot
      phase="idle"
      aspectRatio={aspectRatio}
      className={className}
    />
  );
}
