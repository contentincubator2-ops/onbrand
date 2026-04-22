/**
 * sseReplayBuffer.ts -- Redis-backed SSE replay buffer (Issue #9)
 *
 * Provides a 5-minute rolling window of the last 500 SSE chunks per mission.
 * On reconnect, the client sends Last-Event-ID: <missionId>:<seq> and the
 * server replays all chunks since that seq, then resumes live streaming.
 *
 * Redis key: sse:buf:<missionId>  (LIST, newest at head)
 * TTL: 300 seconds (5 minutes)
 * Max list length: 500 entries
 *
 * Entry shape: { seq: number; event: string; data: string; ts: number }
 *   - `data` is the raw JSON string as written to the SSE wire (serialized).
 */

import type Redis from "ioredis";

// -- Types ---------------------------------------------------------------------

export interface SseChunk {
  seq: number;
  event: string;
  /** Serialized JSON string of the SSE data payload. */
  data: string;
  ts: number;
}

// -- Constants -----------------------------------------------------------------

const BUFFER_TTL_SEC = 300;      // 5 minutes
const BUFFER_MAX_LEN = 500;      // last 500 chunks per mission
const KEY_PREFIX     = "sse:buf:";

// -- Seq counter ---------------------------------------------------------------

/**
 * Increment and return the next monotonic sequence number for a mission.
 * Stored as `sse:seq:<missionId>` in Redis with the same TTL.
 */
export async function nextSeq(redis: Redis, missionId: number): Promise<number> {
  const key = "sse:seq:" + missionId;
  const seq = await redis.incr(key);
  await redis.expire(key, BUFFER_TTL_SEC);
  return seq;
}

// -- Push ----------------------------------------------------------------------

/**
 * Append a chunk to the replay buffer and refresh TTL.
 * The list is capped at BUFFER_MAX_LEN items (oldest trimmed from tail).
 */
export async function pushChunk(
  redis: Redis,
  missionId: number,
  chunk: SseChunk
): Promise<void> {
  const key = KEY_PREFIX + missionId;
  const entry = JSON.stringify(chunk);

  // LPUSH to keep newest at head; LTRIM to cap length; EXPIRE to refresh TTL.
  await redis
    .multi()
    .lpush(key, entry)
    .ltrim(key, 0, BUFFER_MAX_LEN - 1)
    .expire(key, BUFFER_TTL_SEC)
    .exec();
}

// -- Replay --------------------------------------------------------------------

/**
 * Return all chunks with seq > lastSeq, in ascending order (oldest first).
 * Returns null when the buffer key no longer exists (expired / evicted).
 */
export async function sinceSeq(
  redis: Redis,
  missionId: number,
  lastSeq: number
): Promise<SseChunk[] | null> {
  const key = KEY_PREFIX + missionId;
  const exists = await redis.exists(key);
  if (!exists) return null;   // buffer evicted -> 410 Gone

  // Read entire list (newest at index 0, oldest at tail).
  const raw = await redis.lrange(key, 0, -1);
  // Parse and filter
  const chunks: SseChunk[] = [];
  for (const entry of raw) {
    try {
      const c = JSON.parse(entry) as SseChunk;
      if (c.seq > lastSeq) chunks.push(c);
    } catch { /* skip malformed */ }
  }
  // Return ascending (oldest first) so the client sees events in order.
  chunks.sort((a, b) => a.seq - b.seq);
  return chunks;
}

// -- Parse Last-Event-ID -------------------------------------------------------

/**
 * Parse Last-Event-ID header value of the form <missionId>:<seq>.
 * Returns null if the header is missing or malformed.
 */
export function parseLastEventId(
  header: string | undefined | null
): { missionId: number; seq: number } | null {
  if (!header) return null;
  const parts = header.split(":");
  if (parts.length !== 2) return null;
  const missionId = parseInt(parts[0] ?? "", 10);
  const seq       = parseInt(parts[1] ?? "", 10);
  if (isNaN(missionId) || isNaN(seq)) return null;
  return { missionId, seq };
}

// -- ReplayBuffer class (convenience wrapper) ----------------------------------

export class ReplayBuffer {
  constructor(private readonly redis: Redis) {}

  nextSeq(missionId: number)                              { return nextSeq(this.redis, missionId); }
  push(missionId: number, chunk: SseChunk)                { return pushChunk(this.redis, missionId, chunk); }
  sinceSeq(missionId: number, lastSeq: number)            { return sinceSeq(this.redis, missionId, lastSeq); }
  parseLastEventId(header: string | undefined | null)     { return parseLastEventId(header); }
}
