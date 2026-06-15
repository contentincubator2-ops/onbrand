/**
 * miaNudges.ts — public API for firing + reading Mia contextual nudges.
 *
 * Use from any page:
 *
 *   import { fireNudge } from "../components/mia/miaNudges";
 *
 *   onGenerationDone(() => fireNudge("theater.generation_done"));
 *
 * State lives in sessionStorage so it survives client-side route changes
 * but resets on tab close / logout — we don't want nudges from yesterday
 * showing up tomorrow.
 *
 * Architecture:
 *   - Per-session "fired set" of nudge IDs → used for dedupe
 *   - Per-session "unread queue" of pending nudge events
 *   - Both sync across React subscribers via a custom event bus
 *
 * 2026-06-12 (CJ「Mia 細緻化 + 不要自動跳出」): created.
 */

import { useEffect, useSyncExternalStore } from "react";
import { NUDGE_CATALOG, type NudgeId, type NudgeDefinition, interpolate } from "./miaNudgeCatalog";
import type { MiaAction } from "../SupportDrawer.types";

/**
 * Catalog lookup typed to the wide NudgeDefinition shape. The catalog
 * literal narrows each entry to its exact keys (great for autocomplete
 * when editing the catalog), but at runtime we want consistent access to
 * optional fields like `actions` and `dedupePerSession`. This helper
 * widens the lookup result.
 */
function getDef(id: NudgeId): NudgeDefinition {
  return NUDGE_CATALOG[id] as unknown as NudgeDefinition;
}

// ── Storage layout ───────────────────────────────────────────────────────

const QUEUE_KEY = "mia:nudge:queue";
const FIRED_KEY = "mia:nudge:fired";
const CHANGE_EVENT = "mia:nudge:changed";

/** Single queued nudge entry — resolved at fire time so locale changes
 *  later don't accidentally rewrite the message under the user. */
export interface QueuedNudge {
  id: NudgeId;
  /** Resolved message at fire time (post-i18n + interpolation). */
  message: string;
  /** Optional actions (carried from catalog at fire time). */
  actions?: MiaAction[];
  /** ISO timestamp for ordering + analytics. */
  firedAt: string;
}

// ── Internal helpers (storage-safe) ──────────────────────────────────────

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readQueue(): QueuedNudge[] {
  if (typeof sessionStorage === "undefined") return [];
  return safeParse<QueuedNudge[]>(sessionStorage.getItem(QUEUE_KEY), []);
}

function writeQueue(queue: QueuedNudge[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* quota exceeded / private mode — silently drop */
  }
}

function readFiredSet(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  return new Set(safeParse<string[]>(sessionStorage.getItem(FIRED_KEY), []));
}

function writeFiredSet(set: Set<string>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* swallow */
  }
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// ── Lang resolver (read directly to avoid React-context coupling) ────────

function currentLang(): "zh-TW" | "en" {
  if (typeof localStorage === "undefined") return "zh-TW";
  const stored = localStorage.getItem("language");
  if (stored === "en") return "en";
  return "zh-TW";
}

// ── Analytics (reuses ops.logError sink with level: "info") ──────────────
// We piggyback on the Sentry-lite ops.logError table (level="info" rows
// aren't surfaced in the /admin/errors dashboard but accumulate as
// queryable event history). When ARR justifies a real analytics product
// (Mixpanel / PostHog), the call sites stay the same — only this helper
// rewires.

type AnalyticsEvent =
  | "mia.nudge.fired"
  | "mia.nudge.deduped"
  | "mia.nudge.drained"
  | "mia.nudge.action_clicked";

function logAnalytics(
  event: AnalyticsEvent,
  meta: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    // tRPC v11 no-transformer wire format: {"0": <input>}
    const body = {
      "0": {
        level: "info",
        source: event,
        route: window.location.pathname,
        message: typeof meta.nudgeId === "string" ? meta.nudgeId : event,
        fingerprint: `mia:${event}:${String(meta.nudgeId ?? "?")}`.slice(0, 64),
        meta: {
          ...meta,
          href: window.location.href,
          ua: navigator.userAgent.slice(0, 200),
        },
      },
    };
    fetch("/trpc/ops.logError?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    }).catch(() => {
      /* analytics never throws */
    });
  } catch {
    /* swallow */
  }
}

/**
 * Public: SupportDrawer calls this when the user clicks an action button
 * inside a Mia message. Helps measure which nudges actually drive next-
 * step engagement vs. just sitting in the queue.
 */
export function logNudgeActionClicked(
  nudgeId: string,
  actionLabel: string,
  actionKind: string,
): void {
  logAnalytics("mia.nudge.action_clicked", {
    nudgeId,
    actionLabel: actionLabel.slice(0, 80),
    actionKind,
  });
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fire a contextual nudge. Adds it to the unread queue, which the Shell
 * surfaces as a badge on the Mia avatar. Does NOT auto-open the drawer.
 *
 * @param id          Nudge ID from the catalog
 * @param vars        Optional `{token}` substitutions for the message
 * @returns           True if queued, false if deduped / catalog miss
 */
export function fireNudge(
  id: NudgeId,
  vars?: Record<string, string | number>,
): boolean {
  const def = getDef(id);
  if (!def) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[mia] fireNudge: unknown id "${id}"`);
    }
    return false;
  }

  // Dedupe (default: once per session per id)
  const dedupe = def.dedupePerSession !== false;
  if (dedupe) {
    const fired = readFiredSet();
    if (fired.has(id)) {
      logAnalytics("mia.nudge.deduped", { nudgeId: id });
      return false;
    }
    fired.add(id);
    writeFiredSet(fired);
  }

  const lang = currentLang();
  const template = def.message[lang] ?? def.message["zh-TW"];
  const message = interpolate(template, vars);

  const entry: QueuedNudge = {
    id,
    message,
    actions: def.actions,
    firedAt: new Date().toISOString(),
  };

  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  emitChange();
  logAnalytics("mia.nudge.fired", { nudgeId: id, kind: def.kind ?? "static" });

  // For LLM-resolved nudges, kick off backend resolution. The fallback
  // message is already queued and visible in the badge count; once the
  // backend returns, we patch the entry's message in place.
  if (def.kind === "llm") {
    resolveLlmNudgeInBackground(id, entry, vars ?? {});
  }
  return true;
}

/**
 * For kind="llm" nudges: send the prompt template + context vars to the
 * backend, replace the queued entry's message with the LLM result when
 * it returns. If the call fails, the static fallback message stays.
 *
 * Runs async (non-blocking). Errors are swallowed — analytics records
 * the failure rate via the source name.
 */
function resolveLlmNudgeInBackground(
  nudgeId: NudgeId,
  fallbackEntry: QueuedNudge,
  contextVars: Record<string, string | number>,
): void {
  if (typeof fetch === "undefined") return;
  const def = getDef(nudgeId);
  const promptTemplate = def.promptTemplate;
  if (!promptTemplate) return;
  const lang = currentLang();
  const prompt = interpolate(
    promptTemplate[lang] ?? promptTemplate["zh-TW"],
    contextVars,
  );
  // tRPC v11 no-transformer wire format: {"0": <input>}
  const body = {
    "0": {
      nudgeId,
      prompt,
      lang,
      contextVars,
    },
  };
  fetch("/trpc/support.contextNudge?batch=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      // tRPC batch response: array of { result: { data: { json: ... } } } or
      // similar. We just look for a top-level message string.
      const resolved =
        data?.[0]?.result?.data?.message ??
        data?.result?.data?.message ??
        data?.message;
      if (typeof resolved !== "string" || resolved.trim().length === 0) return;
      // Patch the queued entry's message in place (find by firedAt+id).
      const queue = readQueue();
      const idx = queue.findIndex(
        (q) => q.id === nudgeId && q.firedAt === fallbackEntry.firedAt,
      );
      if (idx === -1) return; // already drained
      queue[idx] = { ...queue[idx], message: resolved };
      writeQueue(queue);
      emitChange();
      logAnalytics("mia.nudge.fired", {
        nudgeId,
        kind: "llm",
        resolved: true,
      });
    })
    .catch(() => {
      /* network blip / route 404 — fallback stays */
    });
}

/**
 * Drain the unread queue. Used by SupportDrawer when the user opens it —
 * pending nudges become Mia messages, the queue resets to empty.
 *
 * @returns The drained nudges in fire order, or [] if nothing pending.
 */
export function drainQueue(): QueuedNudge[] {
  const queue = readQueue();
  if (queue.length === 0) return [];
  writeQueue([]);
  emitChange();
  logAnalytics("mia.nudge.drained", {
    count: queue.length,
    ids: queue.map((q) => q.id).join(","),
  });
  return queue;
}

/**
 * Peek at the unread queue without consuming it. Used internally by the
 * unread-count hook; rarely needed directly.
 */
export function peekQueue(): QueuedNudge[] {
  return readQueue();
}

/**
 * Reset the session — clear queue + fired set. Use on logout so the next
 * user (or next login) starts with a clean slate.
 */
export function resetNudgeSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(QUEUE_KEY);
    sessionStorage.removeItem(FIRED_KEY);
  } catch {
    /* swallow */
  }
  emitChange();
}

// ── React subscription hook ──────────────────────────────────────────────

/**
 * Subscribe to the unread queue. Returns the current entry count + a
 * stable drain function. Re-renders the consuming component whenever
 * a new nudge fires or the queue is drained.
 *
 * Usage:
 *   const { unreadCount, drain } = useUnreadNudges();
 *   // Render badge:
 *   {unreadCount > 0 && <Badge count={unreadCount} />}
 *   // When drawer opens:
 *   const pending = drain();
 */
export function useUnreadNudges(): {
  unreadCount: number;
  drain: () => QueuedNudge[];
  peek: () => QueuedNudge[];
} {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CHANGE_EVENT, callback);
    return () => window.removeEventListener(CHANGE_EVENT, callback);
  };
  // Snapshot is JSON-stringified length so React sees changes
  const getSnapshot = (): number => readQueue().length;
  const getServerSnapshot = (): number => 0;

  const unreadCount = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return { unreadCount, drain: drainQueue, peek: peekQueue };
}

/**
 * Optional: subscribe to specific nudge events for analytics / observers.
 * Most consumers don't need this — useUnreadNudges is enough.
 */
export function useOnNudgeFired(handler: (queue: QueuedNudge[]) => void): void {
  useEffect(() => {
    const cb = () => handler(readQueue());
    window.addEventListener(CHANGE_EVENT, cb);
    return () => window.removeEventListener(CHANGE_EVENT, cb);
  }, [handler]);
}
