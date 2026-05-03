/**
 * useMissionStream — SSE-backed real-time step streaming + slot state management.
 *
 * Session 5: SSE streaming replacing 10s polling.
 * Session 6: per-slot state (empty / loading / filled) for mockup slot system.
 *
 * Slot state lifecycle:
 *   step starts streaming → target slot = "loading"
 *   tokens arrive         → slot value accumulates (live preview)
 *   step_done             → slot = "filled" with final output
 *   DB refetch            → all confirmed/drafted steps → "filled" from DB
 *
 * slotMap is built from TWO sources (merged in SquadDetailPanel):
 *   1. DB-backed: progressByOrd + inferSlotName(step) → "filled" for completed steps
 *   2. SSE-backed: activeSlotKey + streamingText → "loading" while running
 */

import { useState, useCallback, useRef, useMemo } from "react";
import type { MockupSlotMap, MockupSlotState } from "../components/PlatformMockup/shared";

export type { MockupSlotMap, MockupSlotState };

// ── Slot name inference ────────────────────────────────────────────────────────

/**
 * Infer which mockup slot a step fills.
 * Priority: step.mockupSlot → step.outputKind → outputType/name keywords
 */
export function inferSlotName(step: any): string {
  // 1. Explicit field (highest priority — set in squads.steps JSON)
  if (step?.mockupSlot && typeof step.mockupSlot === "string") return step.mockupSlot;

  // 2. outputKind
  const kind = String(step?.outputKind ?? "").toLowerCase();
  if (kind === "image" || kind === "media") return "image";
  if (kind === "video") return "videoDesc";
  if (kind === "hashtag" || kind === "hashtags") return "hashtags";

  // 3. Keyword fallback across outputType + name
  const hay = [step?.outputType, step?.name, step?.title]
    .filter(Boolean).join(" ").toLowerCase();
  if (/hashtag|#tag|tags\b/i.test(hay)) return "hashtags";
  if (/title|headline|標題|主標/i.test(hay)) return "title";
  if (/description|intro|簡介|說明/i.test(hay)) return "description";
  if (/cta|call.to.action|行動呼籲|連結/i.test(hay)) return "cta";
  if (/image|visual|圖像|視覺|主視覺|kv\b/i.test(hay)) return "imageDesc";
  if (/video|reel|影片|短片/i.test(hay)) return "videoDesc";

  return "caption"; // default
}

/**
 * Build a slot map from DB-backed step progress.
 * Called in SquadDetailPanel after progressQuery resolves.
 */
export function buildSlotMapFromProgress(
  steps: any[],
  progressByOrd: Map<number, any>,
): MockupSlotMap {
  const map: MockupSlotMap = {};
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const ord = i + 1;
    const prog = progressByOrd.get(ord);
    if (!prog) continue;
    const status = prog.status ?? "pending";
    if (status !== "drafted" && status !== "confirmed") continue;
    const output: string = (prog.agentOutput ?? prog.agent_output ?? "").toString().trim();
    if (!output) continue;
    const slot = inferSlotName(step);
    // Hashtags: parse from output text
    if (slot === "hashtags") {
      const tags = output.match(/#[一-龥\w]+/g) ?? [];
      map[slot] = { status: "filled", value: tags.length > 0 ? tags : [output] };
    } else {
      map[slot] = { status: "filled", value: output };
    }
  }
  return map;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface StepStreamStatus {
  stepOrder: number | null;
  stepName: string;
  agentName: string;
  agentTitle: string;
  agentSkill: string;
  totalSteps: number;
  isRunning: boolean;
}

export interface UseMissionStreamReturn {
  /** Raw accumulated text of the currently-streaming step */
  streamingText: string;
  /** Which slot key is currently loading/streaming */
  activeSlotKey: string | null;
  /** The SSE portion of the slot map (just the active slot in loading/filled state).
   *  Merge this over buildSlotMapFromProgress() in SquadDetailPanel for the full map. */
  sseSlotMap: MockupSlotMap;
  /** Currently executing step info */
  stepStatus: StepStreamStatus;
  /** Whether a step is actively streaming */
  isStreaming: boolean;
  /** Error message if stream failed */
  streamError: string | null;
  /** Trigger SSE execution of a step */
  startStep: (params: StartStepParams) => Promise<void>;
  /** Abort any in-flight stream */
  abort: () => void;
}

export interface StartStepParams {
  missionId: number;
  squadSlug: string;
  stepOrder: number;
  userInput?: string;
  scopeBrandId?: number | null;
  scopeProductId?: number | null;
  scopeEventId?: number | null;
  /** Squad step definition — used to infer which slot this step fills */
  step?: any;
}

const EMPTY_STATUS: StepStreamStatus = {
  stepOrder: null, stepName: "", agentName: "",
  agentTitle: "", agentSkill: "", totalSteps: 0, isRunning: false,
};

export function useMissionStream(opts?: {
  onStepDone?: (stepOrder: number, output: string) => void;
  onProgress?: () => void;
}): UseMissionStreamReturn {
  const [streamingText, setStreamingText] = useState("");
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [sseSlotMap, setSseSlotMap] = useState<MockupSlotMap>({});
  const [stepStatus, setStepStatus] = useState<StepStreamStatus>(EMPTY_STATUS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const currentStepRef = useRef<any>(null);
  // Stable refs for callbacks — prevents startStep from being recreated every render
  // when the caller passes inline arrow functions as opts (which produce new references).
  const onStepDoneRef = useRef(opts?.onStepDone);
  const onProgressRef = useRef(opts?.onProgress);
  onStepDoneRef.current = opts?.onStepDone;
  onProgressRef.current = opts?.onProgress;

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    setIsStreaming(false);
    setStepStatus((s) => ({ ...s, isRunning: false }));
  }, []);

  const startStep = useCallback(async (params: StartStepParams) => {
    controllerRef.current?.abort();

    const slotKey = inferSlotName(params.step ?? {});
    setActiveSlotKey(slotKey);
    setStreamingText("");
    setStreamError(null);
    setIsStreaming(true);
    currentStepRef.current = params.step ?? null;

    // Mark the slot as "loading" immediately
    setSseSlotMap((prev) => ({ ...prev, [slotKey]: { status: "loading" } }));

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const resp = await fetch("/api/missions/step-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          missionId:     params.missionId,
          squadSlug:     params.squadSlug,
          stepOrder:     params.stepOrder,
          userInput:     params.userInput ?? "",
          scopeBrandId:    params.scopeBrandId  ?? null,
          scopeProductId:  params.scopeProductId ?? null,
          scopeEventId:    params.scopeEventId   ?? null,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accText = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }
          if (!trimmed.startsWith("data:")) { currentEvent = ""; continue; }
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          let evt: any;
          try { evt = JSON.parse(raw); } catch { currentEvent = ""; continue; }

          switch (currentEvent || "message") {
            case "step_start":
              setStepStatus({
                stepOrder:  evt.stepOrder,
                stepName:   evt.stepName   ?? "",
                agentName:  evt.agentName  ?? "",
                agentTitle: evt.agentTitle ?? "",
                agentSkill: evt.agentSkill ?? "",
                totalSteps: evt.totalSteps ?? 0,
                isRunning:  true,
              });
              break;

            case "delta":
              accText += evt.text ?? "";
              setStreamingText(accText);
              // Update slot value live as tokens arrive
              setSseSlotMap((prev) => ({
                ...prev,
                [slotKey]: { status: "loading", value: accText },
              }));
              break;

            case "step_done": {
              const finalOutput = evt.output ?? accText;
              const finalValue = slotKey === "hashtags"
                ? (finalOutput.match(/#[一-龥\w]+/g) ?? [finalOutput])
                : finalOutput;
              setSseSlotMap((prev) => ({
                ...prev,
                [slotKey]: { status: "filled", value: finalValue },
              }));
              setStepStatus((s) => ({ ...s, isRunning: false }));
              onStepDoneRef.current?.(evt.stepOrder, finalOutput);
              onProgressRef.current?.();
              break;
            }

            case "error":
              setStreamError(evt.message ?? "Stream error");
              // Clear loading state on error
              setSseSlotMap((prev) => {
                const next = { ...prev };
                if (next[slotKey]?.status === "loading") delete next[slotKey];
                return next;
              });
              break;
          }
          currentEvent = "";
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setStreamError(e?.message ?? "Connection error");
      setSseSlotMap((prev) => {
        const next = { ...prev };
        if (next[slotKey]?.status === "loading") delete next[slotKey];
        return next;
      });
    } finally {
      setIsStreaming(false);
      setStepStatus((s) => ({ ...s, isRunning: false }));
    }
  }, []); // stable — callbacks accessed via refs

  return {
    streamingText, activeSlotKey, sseSlotMap,
    stepStatus, isStreaming, streamError, startStep, abort,
  };
}
