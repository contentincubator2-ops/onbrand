/**
 * genMetrics — generation-duration telemetry for the proof-metrics report.
 *
 * Two channels, both best-effort and never allowed to break generation:
 *  1. `stampGenMetrics` puts {durationMs, ok, genTaskId} into the metadata JSON
 *     of the mission_outputs row (no migration). Unsampled, so p50/p95 are exact
 *     for every persisted output.
 *  2. `logGenCompleted` writes an info-level 'gen.completed' error_log event.
 *     Runs that never persist a row (failures, cancels) are always logged;
 *     clean successes are sampled and carry `sampleRate` for re-weighting.
 *     Readers of error_log 'errors' must filter level IN ('error','warn').
 */

export interface GenStamp {
  durationMs: number;
  ok: boolean;
  taskId: string;
}

export function stampGenMetrics<T extends Record<string, any>>(meta: T, g: GenStamp): T & {
  durationMs: number;
  genOk: boolean;
  genTaskId: string;
} {
  return {
    ...meta,
    durationMs: Math.max(0, Math.round(g.durationMs)),
    genOk: g.ok,
    genTaskId: g.taskId,
  };
}

/** "fb-99-carousel-5" -> "fb"; "ig_strategy" -> "ig_strategy". Feature = channel/engine prefix. */
export function featureOfTaskId(taskId: string | null | undefined): string {
  const t = String(taskId ?? "").trim();
  if (!t) return "unknown";
  return t.split("-")[0] || "unknown";
}

export const GEN_OK_SAMPLE_RATE = 0.25;

export function logGenCompleted(
  g: GenStamp & { cancelled?: boolean },
  rand: () => number = Math.random,
): void {
  const clean = g.ok && !g.cancelled;
  const sampleRate = clean ? GEN_OK_SAMPLE_RATE : 1;
  if (rand() >= sampleRate) return;
  void import("../../routers/opsRouter")
    .then(({ logError }) => logError({
      source: "gen.completed",
      level: "info",
      message: g.cancelled ? "generation cancelled" : g.ok ? "generation ok" : "generation failed",
      meta: { taskId: g.taskId, feature: featureOfTaskId(g.taskId), durationMs: Math.round(g.durationMs), ok: g.ok, cancelled: !!g.cancelled, sampleRate },
    }))
    .catch(() => { /* telemetry must never break generation */ });
}
