import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("../../localDb", () => ({ default: { execute: (...a: any[]) => execute(...a) } }));

import { computeProofMetrics } from "./proofMetrics";

function wire(opts: { gen?: any[]; edits?: any[]; genThrows?: boolean }) {
  execute.mockImplementation(async (sql: string) => {
    if (sql.includes("COUNT(*) AS n")) return [[{ n: 10, done: 8, revised: 2, adopted: 3 }]];
    if (sql.includes("TIMESTAMPDIFF")) return [[]];
    if (sql.includes("llm.attempts")) return [[]];
    if (sql.includes("usage_log")) return [[{ usd: 0 }]];
    if (sql.includes("$.genTaskId")) {
      if (opts.genThrows) throw new Error("invalid JSON");
      return [opts.gen ?? []];
    }
    if (sql.includes("AS edited")) return [opts.edits ?? []];
    return [[]];
  });
}

describe("computeProofMetrics generation + edits", () => {
  beforeEach(() => { execute.mockReset(); });

  it("computes p50/p95 overall and per feature", async () => {
    wire({
      gen: [
        { taskId: "fb-99-x", ms: 10000 },
        { taskId: "fb-60-y", ms: 20000 },
        { taskId: "fb-30-z", ms: 30000 },
        { taskId: "ig-60-a", ms: 5000 },
        { taskId: null, ms: 0 }, // ignored
      ],
    });
    const m = await computeProofMetrics(30);
    expect(m.generation.n).toBe(4);
    expect(m.generation.p50Ms).toBe(10000);
    const fb = m.generation.byFeature.find((f) => f.feature === "fb")!;
    expect(fb.n).toBe(3);
    expect(fb.p50Ms).toBe(20000);
    expect(m.generation.byFeature[0]!.feature).toBe("fb"); // sorted by n desc
  });

  it("reports null (not 0) when nothing is measured, and survives a JSON failure", async () => {
    wire({ genThrows: true });
    const m = await computeProofMetrics(30);
    expect(m.generation.n).toBe(0);
    expect(m.generation.p50Ms).toBeNull();
    expect(m.edits.editRate).toBeNull();
    expect(m.edits.medianEditedChars).toBeNull();
  });

  it("computes edit rate, edited-or-revised rate and median editedChars", async () => {
    wire({
      edits: [
        { edited: "true", chars: 10, revised: 0 },
        { edited: "true", chars: 30, revised: 0 },
        { edited: "true", chars: 20, revised: 1 },
        { edited: null, chars: null, revised: 1 },
        { edited: null, chars: null, revised: 0 },
        { edited: null, chars: null, revised: 0 },
        { edited: null, chars: null, revised: 0 },
        { edited: null, chars: null, revised: 0 },
      ],
    });
    const m = await computeProofMetrics(30);
    expect(m.edits.n).toBe(8);
    expect(m.edits.editedN).toBe(3);
    expect(m.edits.editRate).toBe(37.5);
    expect(m.edits.editedOrRevisedRate).toBe(50);
    expect(m.edits.medianEditedChars).toBe(20);
  });
});
