/**
 * runCancel — real cancellation for long task runs.
 *
 * A run (runOrchestra) executes inside `runWithCancel`, which stores its
 * AbortSignal in AsyncLocalStorage. Every provider entry point (callModel,
 * callModelStrict, callLLM, generateStillImage) calls `throwIfCancelled()`
 * before issuing a request, so a cancelled run stops spending money at the
 * next call boundary without threading a parameter through ~40 call sites.
 * Calls already in flight are not killed (providers differ on abort
 * support); they simply are not followed by new ones, and their results are
 * discarded by the caller's own cancelled check before anything is written.
 *
 * Outside a run, every helper is a no-op, so behaviour is unchanged.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export class CancelledError extends Error {
  readonly cancelled = true;
  constructor(message = "run cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export function isCancelledError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as any).cancelled === true;
}

interface RunCtx { signal: AbortSignal }
const als = new AsyncLocalStorage<RunCtx>();

export function runWithCancel<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  return als.run({ signal }, fn);
}

export function currentRunSignal(): AbortSignal | undefined {
  return als.getStore()?.signal;
}

export function isRunCancelled(): boolean {
  return als.getStore()?.signal.aborted === true;
}

/** Call at the top of anything that spends money (LLM, image, video). */
export function throwIfCancelled(): void {
  if (isRunCancelled()) throw new CancelledError();
}

// ── Registry: lets a separate request (cancelRun) reach a running job ─────

interface Entry {
  controller: AbortController;
  userId: number;
  /** Points already charged for this run, refunded once if cancelled early. */
  charge: { action: string; points: number } | null;
  /** True once an output row has been written (captions delivered). */
  delivered: boolean;
  refunded: boolean;
}
const registry = new Map<string, Entry>();
const MAX_RUN_AGE_MS = 15 * 60_000;

export function registerRun(
  runKey: string,
  userId: number,
  charge: Entry["charge"] = null,
): AbortController {
  const controller = new AbortController();
  registry.set(runKey, { controller, userId, charge, delivered: false, refunded: false });
  const t = setTimeout(() => registry.delete(runKey), MAX_RUN_AGE_MS);
  (t as any).unref?.();
  return controller;
}

export function markRunDelivered(runKey: string | undefined): void {
  if (!runKey) return;
  const e = registry.get(runKey);
  if (e) e.delivered = true;
}

export function unregisterRun(runKey: string | undefined): void {
  if (runKey) registry.delete(runKey);
}

export type CancelOutcome =
  | { found: false }
  | { found: true; refundPoints: number; refundAction: string | null };

/**
 * Abort a run owned by `userId`. Returns the points to refund (only when no
 * output had been delivered yet, and only once). The caller performs the
 * actual wallet write so this module stays free of DB imports.
 */
export function cancelRunByKey(runKey: string, userId: number): CancelOutcome {
  const e = registry.get(runKey);
  if (!e || e.userId !== userId) return { found: false };
  e.controller.abort();
  let refundPoints = 0;
  let refundAction: string | null = null;
  if (!e.delivered && !e.refunded && e.charge) {
    e.refunded = true;
    refundPoints = e.charge.points;
    refundAction = e.charge.action;
  }
  return { found: true, refundPoints, refundAction };
}

/** Test helper. */
export function _resetRunRegistry(): void {
  registry.clear();
}
