/**
 * Dead-Letter Queue (DLQ) support for BullMQ.
 *
 * Each queue gets a companion "<queue>-dlq" queue.  When a job exhausts all
 * retry attempts its full payload + error context is copied there by the
 * worker's `failed` event handler (see each worker file).
 *
 * Observability stub: a prom-client Counter `bullmq_dlq_depth{queue}` is
 * incremented on every DLQ insertion so a future Alertmanager rule (#26) can
 * fire on it without touching this file.
 */

import { Queue } from 'bullmq';
import { Counter } from 'prom-client';
import { connection } from './marketingQueue';

// ── Prometheus counter ────────────────────────────────────────────────────────

export const dlqDepthCounter = new Counter({
  name: 'bullmq_dlq_depth',
  help: 'Total jobs moved to a BullMQ dead-letter queue',
  labelNames: ['queue'] as const,
});

// ── Per-queue DLQ singletons ──────────────────────────────────────────────────

const _dlqInstances = new Map<string, Queue>();

export function getDlq(sourceQueueName: string): Queue {
  const dlqName = `${sourceQueueName}-dlq`;
  if (!_dlqInstances.has(dlqName)) {
    _dlqInstances.set(dlqName, new Queue(dlqName, { connection }));
  }
  return _dlqInstances.get(dlqName)!;
}

// ── Helper called from worker `failed` handlers ───────────────────────────────

export interface DlqEntry {
  originalJobId: string | undefined;
  sourceQueue: string;
  jobName: string;
  data: unknown;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: string;
}

export async function moveToDlq(
  sourceQueueName: string,
  entry: DlqEntry,
): Promise<void> {
  try {
    const dlq = getDlq(sourceQueueName);
    await dlq.add('dlq-entry', entry, {
      // No retries in the DLQ – it is a dead-end holding queue.
      attempts: 1,
    });
    dlqDepthCounter.inc({ queue: sourceQueueName });
  } catch (err) {
    // Never let DLQ errors crash the worker process.
    console.error(`[DLQ] Failed to move job to ${sourceQueueName}-dlq:`, err);
  }
}
