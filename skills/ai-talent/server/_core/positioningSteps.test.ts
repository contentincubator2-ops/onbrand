import { describe, expect, it } from "vitest";
import { hasContent } from "./positioningSteps";

/**
 * Regression guard for the heytom-market onboarding (2026-08-11): the brand
 * pipeline reported done 10/10 while writing an entirely blank 目標受眾.
 *
 * Cause: callJSON returned the empty fallback skeleton on failure instead of
 * throwing, so the runner's retry/fail machinery never engaged and a blank
 * segment shipped as a finished deliverable.
 *
 * hasContent is the gate that decides "did this step actually produce
 * something a human would read". These cases are the real fallback shapes
 * used in positioningSteps.ts.
 */
describe("hasContent", () => {
  it.each([
    ["audience", { primary: "", secondary: "", matrix: [] }],
    ["competition", { intensity: "", direct: [], indirect: [], map: "" }],
    ["trends", { favorable: [], risks: [] }],
    ["origin", { story: "", belief5Layers: [] }],
    ["values", { items: [] }],
    ["differentiation", { emotional: "", functional: "", summary: "" }],
    ["goldenCircle", { why: "", how: "", what: "" }],
    ["voice", { archetypes: [], tone: [], forbidden: [], samples: [] }],
  ])("treats the empty %s skeleton as no content", (_label, skeleton) => {
    expect(hasContent(skeleton)).toBe(false);
  });

  it("treats whitespace-only strings as no content", () => {
    expect(hasContent({ primary: "   \n  ", secondary: "" })).toBe(false);
  });

  it("does not accept numbers alone as content", () => {
    // taglineScore's skeleton is { rows: [], total: 0 } — a real score always
    // carries text in rows[], so a bare number must not pass the gate.
    expect(hasContent({ rows: [], total: 0 })).toBe(false);
  });

  it("accepts a segment with real prose", () => {
    expect(hasContent({ primary: "忙碌上班族，重視省時但不將就", secondary: "", matrix: [] })).toBe(true);
  });

  it("accepts content nested inside arrays of objects", () => {
    expect(hasContent({
      rows: [{ dim: "記憶", code: "Memorability", score: 80, comment: "好記" }],
      total: 80,
    })).toBe(true);
  });

  it("accepts a populated array of plain strings", () => {
    expect(hasContent({ archetypes: [], tone: ["溫暖", "幽默"], forbidden: [] })).toBe(true);
  });

  it.each([null, undefined, "", "  ", [], {}, 0, false])(
    "treats %p as no content",
    (value) => {
      expect(hasContent(value)).toBe(false);
    },
  );
});
