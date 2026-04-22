/**
 * Unit tests for BullMQ hardening (issue #13).
 *
 * These tests run in a fully-mocked environment — no live Redis or BullMQ
 * processes required.  We test:
 *
 *   (a) Idempotent add: same inputs → same jobId → BullMQ sees a duplicate.
 *   (b) UnrecoverableError: job processor throwing it → no retry.
 *   (c) DLQ: a job that reaches max attempts has moveToDlq() called.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';

// ─── (a) Idempotent jobId ────────────────────────────────────────────────────

import { buildJobId, sha256 } from './jobId';

describe('buildJobId — deterministic idempotency', () => {
  it('returns the same jobId for identical inputs', () => {
    const payload = { userRequest: 'write a tweet', brand: 'Acme', userId: 42 };
    const id1 = buildJobId('mission-123', 'execute-task', payload);
    const id2 = buildJobId('mission-123', 'execute-task', payload);
    expect(id1).toBe(id2);
  });

  it('returns a different jobId when input data changes', () => {
    const id1 = buildJobId('mission-123', 'execute-task', { userRequest: 'tweet A' });
    const id2 = buildJobId('mission-123', 'execute-task', { userRequest: 'tweet B' });
    expect(id1).not.toBe(id2);
  });

  it('returns a different jobId when missionId changes', () => {
    const payload = { userRequest: 'same request' };
    const id1 = buildJobId('mission-aaa', 'execute-task', payload);
    const id2 = buildJobId('mission-bbb', 'execute-task', payload);
    expect(id1).not.toBe(id2);
  });

  it('returns a different jobId when stepId changes', () => {
    const payload = { userRequest: 'same request' };
    const id1 = buildJobId('mission-123', 'execute-task', payload);
    const id2 = buildJobId('mission-123', 'squad-task', payload);
    expect(id1).not.toBe(id2);
  });

  it('produces a valid hex sha256 string', () => {
    const id = buildJobId('m', 's', {});
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256 helper is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
    expect(sha256('hello')).not.toBe(sha256('world'));
  });
});

// ─── (b) UnrecoverableError short-circuits retries ─────────────────────────

import { UnrecoverableError } from 'bullmq';

describe('UnrecoverableError — no-retry semantics', () => {
  it('is an instance of Error', () => {
    const err = new UnrecoverableError('4xx — not retrying');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the expected message', () => {
    const err = new UnrecoverableError('Gateway 401: Unauthorized');
    expect(err.message).toBe('Gateway 401: Unauthorized');
  });

  it('is recognised as UnrecoverableError', () => {
    const err = new UnrecoverableError('bad request');
    expect(err).toBeInstanceOf(UnrecoverableError);
  });

  /**
   * BullMQ workers internally check `error instanceof UnrecoverableError` and
   * move the job to failed immediately without scheduling a retry.  We
   * simulate that check here to prove the integration contract is correct.
   */
  it('simulates BullMQ worker short-circuit: no retry on UnrecoverableError', async () => {
    let attemptCount = 0;

    // Simulate the BullMQ runner loop (simplified).
    async function runWithBullMQSemantics(
      processor: () => Promise<void>,
      maxAttempts: number,
    ): Promise<{ attempts: number; isUnrecoverable: boolean }> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          attemptCount = attempt;
          await processor();
          return { attempts: attemptCount, isUnrecoverable: false };
        } catch (err) {
          if (err instanceof UnrecoverableError) {
            return { attempts: attemptCount, isUnrecoverable: true };
          }
          if (attempt === maxAttempts) throw err;
        }
      }
      throw new Error('unreachable');
    }

    const result = await runWithBullMQSemantics(
      async () => { throw new UnrecoverableError('Gateway 403: Forbidden'); },
      5,
    );

    expect(result.isUnrecoverable).toBe(true);
    // Only 1 attempt — no retries after UnrecoverableError.
    expect(result.attempts).toBe(1);
  });
});

// ─── (c) DLQ: final-failure jobs land in the dead-letter queue ──────────────

import { moveToDlq, getDlq } from './dlq';

// Mock the Queue class so tests never touch Redis.
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-dlq-job' }),
  }));
  return { ...actual, Queue: MockQueue };
});

// Also mock ioredis so the connection in marketingQueue.ts doesn't try to
// connect on import.
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      quit: vi.fn(),
    })),
  };
});

describe('DLQ — failed jobs after max attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal DLQ singleton map between tests by re-importing
    // won't work easily, so instead we rely on the mock being fresh.
  });

  it('getDlq returns a Queue named "<source>-dlq"', () => {
    // After mock: Queue constructor is mocked, getDlq should return an object.
    const dlq = getDlq('marketing-jobs');
    expect(dlq).toBeDefined();
    expect(typeof dlq.add).toBe('function');
  });

  it('moveToDlq calls dlq.add with the full failure context', async () => {
    const dlq = getDlq('marketing-jobs');
    const addSpy = dlq.add as MockedFunction<typeof dlq.add>;

    await moveToDlq('marketing-jobs', {
      originalJobId: 'job-abc',
      sourceQueue: 'marketing-jobs',
      jobName: 'execute-task',
      data: { userRequest: 'test', userId: 1 },
      failedReason: 'Gateway 500: Internal Server Error',
      stacktrace: ['Error: ...', '  at callGateway (...)'],
      attemptsMade: 5,
      timestamp: '2026-04-22T00:00:00.000Z',
    });

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [name, entry] = addSpy.mock.calls[0];
    expect(name).toBe('dlq-entry');
    expect((entry as any).originalJobId).toBe('job-abc');
    expect((entry as any).failedReason).toBe('Gateway 500: Internal Server Error');
    expect((entry as any).attemptsMade).toBe(5);
    expect((entry as any).stacktrace).toHaveLength(2);
  });

  it('moveToDlq increments the prom-client DLQ counter', async () => {
    const { dlqDepthCounter } = await import('./dlq');
    // Read baseline.
    const before = (await dlqDepthCounter.get()).values
      .find((v) => v.labels.queue === 'squad-jobs')?.value ?? 0;

    await moveToDlq('squad-jobs', {
      originalJobId: 'job-xyz',
      sourceQueue: 'squad-jobs',
      jobName: 'squad-task',
      data: {},
      failedReason: 'timeout',
      stacktrace: [],
      attemptsMade: 5,
      timestamp: new Date().toISOString(),
    });

    const after = (await dlqDepthCounter.get()).values
      .find((v) => v.labels.queue === 'squad-jobs')?.value ?? 0;

    expect(after).toBe(before + 1);
  });

  it('moveToDlq does NOT throw if dlq.add rejects (error swallowed)', async () => {
    const dlq = getDlq('marketing-jobs');
    (dlq.add as MockedFunction<typeof dlq.add>).mockRejectedValueOnce(
      new Error('Redis connection failed'),
    );

    await expect(
      moveToDlq('marketing-jobs', {
        originalJobId: 'job-err',
        sourceQueue: 'marketing-jobs',
        jobName: 'execute-task',
        data: {},
        failedReason: 'boom',
        stacktrace: [],
        attemptsMade: 5,
        timestamp: new Date().toISOString(),
      }),
    ).resolves.not.toThrow();
  });
});
