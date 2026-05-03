/**
 * useMissionStream — SSE-backed real-time step streaming hook.
 *
 * Replaces the 10s polling + non-streaming stepExecute for "run" mode.
 * Confirm / skip still go through trpc.squad.stepExecute mutation.
 *
 * SSE events consumed:
 *   step_start  { stepOrder, stepName, agentName, agentTitle, agentSkill, totalSteps }
 *   delta       { text }           — streaming token, appended to streamingText
 *   step_done   { stepOrder, output, status }
 *   error       { message }
 *
 * Field mapping:
 *   Uses the same FIELD_ROUTES logic as aggregateMockupFields to route
 *   the live accumulated text into the right mockup slot (caption / title /
 *   description / hashtags / cta) as tokens arrive.
 */

import { useState, useCallback, useRef, useMemo } from "react";

// ── Field routing (mirrors inferMockup FIELD_ROUTES) ─────────────────────────

export interface LiveMockupFields {
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  cta?: string;
  imageDesc?: string;
  videoDesc?: string;
}

const CONTENT_FIELD_ROUTES: Array<{ test: RegExp; field: keyof LiveMockupFields }> = [
  { test: /title|headline|標題|主標/i,          field: "title"       },
  { test: /description|intro|簡介|說明/i,        field: "description" },
  { test: /hashtag|tag/i,                        field: "hashtags"    },
  { test: /cta|call.to.action|行動呼籲|連結/i,   field: "cta"         },
  { test: /image|visual|圖像|視覺/i,             field: "imageDesc"   },
  { test: /video|reel|影片|短片/i,               field: "videoDesc"   },
  { test: /caption|post|copy|hook|貼文|文案/i,   field: "caption"     },
];

function parseHashtags(text: string): string[] {
  const matches = text.match(/#[一-龥\w]+/g) ?? [];
  if (matches.length > 0) return matches;
  return text.split(/[\s,、，]+/).filter((t) => t.startsWith("#"));
}

function routeTextToField(text: string, step: any): keyof LiveMockupFields {
  const haystack = [step?.outputType, step?.output, step?.name, step?.title]
    .filter(Boolean).join(" ").toLowerCase();
  for (const r of CONTENT_FIELD_ROUTES) {
    if (r.test.test(haystack)) return r.field;
  }
  return "caption"; // default
}

function buildLiveFields(text: string, step: any): LiveMockupFields {
  if (!text || !step) return {};
  const field = routeTextToField(text, step);
  if (field === "hashtags") return { hashtags: parseHashtags(text) };
  return { [field]: text };
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
  /** Parsed into mockup field slots — updates token-by-token */
  liveFields: LiveMockupFields;
  /** Currently executing step info */
  stepStatus: StepStreamStatus;
  /** Whether a step is actively streaming */
  isStreaming: boolean;
  /** Error message if stream failed */
  streamError: string | null;
  /**
   * Trigger SSE execution of a step.
   * mode="run" streams + saves; confirm/skip remain tRPC mutations.
   */
  startStep: (params: {
    missionId: number;
    squadSlug: string;
    stepOrder: number;
    userInput?: string;
    scopeBrandId?: number | null;
    scopeProductId?: number | null;
    scopeEventId?: number | null;
    step?: any; // squad step definition for field routing
  }) => Promise<void>;
  /** Abort any in-flight stream */
  abort: () => void;
}

const EMPTY_STATUS: StepStreamStatus = {
  stepOrder: null, stepName: "", agentName: "",
  agentTitle: "", agentSkill: "", totalSteps: 0, isRunning: false,
};

export function useMissionStream(opts?: {
  onStepDone?: (stepOrder: number, output: string) => void;
  onProgress?: () => void; // called when step_done — trigger polling refetch
}): UseMissionStreamReturn {
  const [streamingText, setStreamingText] = useState("");
  const [stepStatus, setStepStatus] = useState<StepStreamStatus>(EMPTY_STATUS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const currentStepRef = useRef<any>(null); // squad step definition for field routing

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    setIsStreaming(false);
    setStepStatus((s) => ({ ...s, isRunning: false }));
  }, []);

  const startStep = useCallback(async (params: {
    missionId: number;
    squadSlug: string;
    stepOrder: number;
    userInput?: string;
    scopeBrandId?: number | null;
    scopeProductId?: number | null;
    scopeEventId?: number | null;
    step?: any;
  }) => {
    // Abort any in-flight stream
    controllerRef.current?.abort();

    setStreamingText("");
    setStreamError(null);
    setIsStreaming(true);
    currentStepRef.current = params.step ?? null;

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const resp = await fetch("/api/missions/step-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          missionId:    params.missionId,
          squadSlug:    params.squadSlug,
          stepOrder:    params.stepOrder,
          userInput:    params.userInput ?? "",
          scopeBrandId:    params.scopeBrandId ?? null,
          scopeProductId:  params.scopeProductId ?? null,
          scopeEventId:    params.scopeEventId ?? null,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }

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
              break;

            case "step_done":
              setStepStatus((s) => ({ ...s, isRunning: false }));
              opts?.onStepDone?.(evt.stepOrder, evt.output ?? accText);
              opts?.onProgress?.();
              break;

            case "error":
              setStreamError(evt.message ?? "Stream error");
              break;
          }
          currentEvent = "";
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setStreamError(e?.message ?? "Connection error");
    } finally {
      setIsStreaming(false);
      setStepStatus((s) => ({ ...s, isRunning: false }));
    }
  }, [opts?.onStepDone, opts?.onProgress]);

  // Live field mapping — recalculates on every token
  const liveFields = useMemo(
    () => buildLiveFields(streamingText, currentStepRef.current),
    [streamingText],
  );

  return { streamingText, liveFields, stepStatus, isStreaming, streamError, startStep, abort };
}
