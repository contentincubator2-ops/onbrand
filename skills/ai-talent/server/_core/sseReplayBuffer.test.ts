/**
 * sseReplayBuffer.test.ts -- Integration tests for SSE replay buffer (Issue #9)
 *
 * Uses ioredis-mock so no real Redis instance is needed.
 *
 * Test matrix:
 *   1. nextSeq -- monotonically increments per mission.
 *   2. pushChunk + sinceSeq -- replay returns missed chunks in order.
 *   3. sinceSeq with lastSeq=0 -- returns all buffered chunks.
 *   4. Buffer evicted (key missing) -- sinceSeq returns null (410 trigger).
 *   5. parseLastEventId -- parses valid and malformed headers.
 *   6. Disconnect mid-stream simulation -- reconnect replays exactly missing chunks.
 *   7. ReplayBuffer class wrapper.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const RedisMock = _require("ioredis-mock");

import {
  nextSeq,
  pushChunk,
  sinceSeq,
  parseLastEventId,
  ReplayBuffer,
  type SseChunk,
} from "./sseReplayBuffer";

// -- Helpers -------------------------------------------------------------------

function makeChunk(seq: number, event = "delta", text = "chunk"): SseChunk {
  return { seq, event, data: JSON.stringify({ text: text + seq }), ts: Date.now() };
}

// -- Tests ---------------------------------------------------------------------

describe("sseReplayBuffer -- nextSeq", () => {
  it("increments monotonically for the same mission", async () => {
    const redis = new RedisMock();
    const s1 = await nextSeq(redis, 42);
    const s2 = await nextSeq(redis, 42);
    const s3 = await nextSeq(redis, 42);
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s3).toBe(3);
  });

  it("maintains independent counters for different missions", async () => {
    const redis = new RedisMock();
    const a = await nextSeq(redis, 1);
    const b = await nextSeq(redis, 2);
    const a2 = await nextSeq(redis, 1);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(a2).toBe(2);
  });
});

describe("sseReplayBuffer -- pushChunk + sinceSeq", () => {
  it("replays all chunks when lastSeq=0", async () => {
    const redis = new RedisMock();
    const missionId = 99;
    await pushChunk(redis, missionId, makeChunk(1));
    await pushChunk(redis, missionId, makeChunk(2));
    await pushChunk(redis, missionId, makeChunk(3));

    const chunks = await sinceSeq(redis, missionId, 0);
    expect(chunks).not.toBeNull();
    expect(chunks!.map(c => c.seq)).toEqual([1, 2, 3]);
  });

  it("replays only missed chunks since lastSeq", async () => {
    const redis = new RedisMock();
    const missionId = 100;
    for (let i = 1; i <= 5; i++) {
      await pushChunk(redis, missionId, makeChunk(i));
    }

    const chunks = await sinceSeq(redis, missionId, 3);
    expect(chunks).not.toBeNull();
    expect(chunks!.map(c => c.seq)).toEqual([4, 5]);
  });

  it("returns empty array when already up-to-date", async () => {
    const redis = new RedisMock();
    const missionId = 101;
    await pushChunk(redis, missionId, makeChunk(1));
    await pushChunk(redis, missionId, makeChunk(2));

    const chunks = await sinceSeq(redis, missionId, 2);
    expect(chunks).not.toBeNull();
    expect(chunks).toHaveLength(0);
  });

  it("preserves ascending order even though list is newest-first internally", async () => {
    const redis = new RedisMock();
    const missionId = 102;
    // Push chunks out of order to verify sort
    await pushChunk(redis, missionId, makeChunk(3));
    await pushChunk(redis, missionId, makeChunk(1));
    await pushChunk(redis, missionId, makeChunk(2));

    const chunks = await sinceSeq(redis, missionId, 0);
    expect(chunks!.map(c => c.seq)).toEqual([1, 2, 3]);
  });
});

describe("sseReplayBuffer -- buffer evicted (410 trigger)", () => {
  it("returns null when key does not exist in Redis", async () => {
    const redis = new RedisMock();
    const result = await sinceSeq(redis, 9999, 0);
    expect(result).toBeNull();
  });
});

describe("sseReplayBuffer -- parseLastEventId", () => {
  it("parses valid header", () => {
    expect(parseLastEventId("42:17")).toEqual({ missionId: 42, seq: 17 });
  });

  it("returns null for missing header", () => {
    expect(parseLastEventId(null)).toBeNull();
    expect(parseLastEventId(undefined)).toBeNull();
    expect(parseLastEventId("")).toBeNull();
  });

  it("returns null for malformed header", () => {
    expect(parseLastEventId("only-one-part")).toBeNull();
    expect(parseLastEventId("abc:def")).toBeNull();
    expect(parseLastEventId("1:2:3")).toBeNull();
  });
});

describe("sseReplayBuffer -- disconnect mid-stream simulation", () => {
  it("reconnect under 5 min: no duplicate, no missing chunks", async () => {
    const redis = new RedisMock();
    const missionId = 200;

    // Simulate 10 chunks emitted before disconnect
    for (let i = 1; i <= 10; i++) {
      await pushChunk(redis, missionId, makeChunk(i));
    }

    // Client disconnected after receiving chunk 6 (Last-Event-ID: 200:6)
    const lastSeenSeq = 6;
    const missed = await sinceSeq(redis, missionId, lastSeenSeq);

    expect(missed).not.toBeNull();
    expect(missed!.map(c => c.seq)).toEqual([7, 8, 9, 10]);

    // Simulate 3 more chunks arriving during reconnect
    await pushChunk(redis, missionId, makeChunk(11));
    await pushChunk(redis, missionId, makeChunk(12));

    // Reconnect again -- should only get new ones since seq 10
    const afterReconnect = await sinceSeq(redis, missionId, 10);
    expect(afterReconnect!.map(c => c.seq)).toEqual([11, 12]);
  });

  it("reconnect after buffer eviction returns null (410 scenario)", async () => {
    const redis = new RedisMock();
    // Never pushed anything -- key does not exist
    const result = await sinceSeq(redis, 777, 5);
    expect(result).toBeNull();
  });
});

describe("sseReplayBuffer -- ReplayBuffer class", () => {
  it("wraps all operations correctly", async () => {
    const redis = new RedisMock();
    const buf = new ReplayBuffer(redis);

    const seq1 = await buf.nextSeq(50);
    const seq2 = await buf.nextSeq(50);
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);

    await buf.push(50, makeChunk(1));
    await buf.push(50, makeChunk(2));

    const chunks = await buf.sinceSeq(50, 0);
    expect(chunks).toHaveLength(2);

    expect(buf.parseLastEventId("50:1")).toEqual({ missionId: 50, seq: 1 });
  });
});
