/** Client side of quickTask.cancelRun: run keys and the user-facing toast. */

/** Matches the server's RUN_KEY (8-64 chars, [A-Za-z0-9_-]). */
export function newRunKey(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export interface CancelRunResult { cancelled?: boolean; refundedPoints?: number }

/**
 * Toast text for a cancelRun result. Points are mentioned only when the
 * server says it refunded some. Returns null when the run had already
 * finished server-side (nothing to say beyond the existing discard toast).
 */
export function cancelToastText(r: CancelRunResult | null | undefined, en: boolean): string | null {
  if (!r || !r.cancelled) return null;
  const pts = Number(r.refundedPoints ?? 0);
  if (pts > 0) {
    return en
      ? `Stopped. ${pts} points were returned.`
      : `已停止，已退還 ${pts} 點。`;
  }
  return en ? "Stopped." : "已停止。";
}
