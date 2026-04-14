/**
 * sessionLogger.ts — OpenClaw Gateway 呼叫的統一 event log 寫入器
 * 使用方式：
 *   import { logEvent, logGatewayCall } from './sessionLogger';
 *   await logGatewayCall({ sessionId, userId, agentSlug, agentName, latencyMs, ok, contentLength });
 */

import localPool from "../localDb";
import { randomUUID } from "crypto";

export type EventType =
  | "session_start"
  | "gateway_call"
  | "gateway_fallback"
  | "gateway_error"
  | "output"
  | "session_end";

export interface LogEventParams {
  sessionId: string;
  userId?: number | null;
  agentSlug?: string;
  agentName?: string;
  eventType: EventType;
  isGatewayOk?: boolean;
  latencyMs?: number;
  contentLength?: number;
  qualitySignal?: 1 | 0 | null;
  errorMsg?: string;
  metadata?: Record<string, unknown>;
}

/** 寫入單筆 event（不阻塞，fire-and-forget） */
export function logEvent(params: LogEventParams): void {
  const {
    sessionId, userId, agentSlug, agentName, eventType,
    isGatewayOk = true, latencyMs, contentLength,
    qualitySignal, errorMsg, metadata,
  } = params;

  localPool
    .execute(
      `INSERT INTO session_event_logs
       (sessionId, userId, agentSlug, agentName, eventType, isGatewayOk,
        latencyMs, contentLength, qualitySignal, errorMsg, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        userId ?? null,
        agentSlug ?? null,
        agentName ?? null,
        eventType,
        isGatewayOk ? 1 : 0,
        latencyMs ?? null,
        contentLength ?? null,
        qualitySignal ?? null,
        errorMsg ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
    .catch((err: Error) => {
      console.warn("[sessionLogger] write failed:", err.message);
    });
}

/** 包裝 Gateway 呼叫，自動記 latency + ok/fallback */
export async function withGatewayLog<T>(
  params: {
    sessionId: string;
    userId?: number | null;
    agentSlug: string;
    agentName?: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    logEvent({
      ...params,
      eventType: "gateway_call",
      isGatewayOk: true,
      latencyMs: Date.now() - t0,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent({
      ...params,
      eventType: "gateway_error",
      isGatewayOk: false,
      latencyMs: Date.now() - t0,
      errorMsg: msg,
    });
    throw err;
  }
}

/** 生成 sessionId（如果呼叫方沒有帶） */
export function newSessionId(): string {
  return randomUUID();
}
