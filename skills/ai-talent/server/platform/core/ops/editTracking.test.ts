import { describe, it, expect } from "vitest";
import { applyEditMarker, isHumanEdit } from "./editTracking";
import { featureOfTaskId, stampGenMetrics } from "./genMetrics";

describe("editTracking", () => {
  it("only plain saves count as human edits", () => {
    expect(isHumanEdit({})).toBe(true);
    expect(isHumanEdit({ writer: { key: "a" } })).toBe(false);
    expect(isHumanEdit({ regulationCompliance: { status: "compliant" } })).toBe(false);
  });
  it("unchanged text is not an edit", () => {
    expect(applyEditMarker({ a: 1 }, "same", "same")).toBeNull();
  });
  it("marks edited with abs char delta and accumulates", () => {
    const first = applyEditMarker({ keep: 1 }, "hello", "hello world")!;
    expect(first).toMatchObject({ keep: 1, edited: true, editedChars: 6, editedCharsTotal: 6, editCount: 1 });
    const second = applyEditMarker(first, "hello world", "hi")!;
    expect(second).toMatchObject({ editedChars: 9, editedCharsTotal: 15, editCount: 2 });
  });
  it("handles null metadata and equal-length rewrites", () => {
    expect(applyEditMarker(null, "abc", "xyz")).toMatchObject({ edited: true, editedChars: 0 });
  });
});

describe("genMetrics", () => {
  it("stamps without mutating and derives feature", () => {
    const base = { a: 1 };
    const out = stampGenMetrics(base, { durationMs: 1234.6, ok: true, taskId: "fb-99-carousel-5" });
    expect(out).toMatchObject({ a: 1, durationMs: 1235, genOk: true, genTaskId: "fb-99-carousel-5" });
    expect((base as any).durationMs).toBeUndefined();
    expect(featureOfTaskId("ig-60-x")).toBe("ig");
    expect(featureOfTaskId(null)).toBe("unknown");
  });
});
