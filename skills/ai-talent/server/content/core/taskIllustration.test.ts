import { describe, expect, it } from "vitest";
import { illustrationPrompt, parseConcepts, ILLUSTRATION_STYLE } from "./taskIllustration";

describe("任務卡插畫 prompt", () => {
  it("畫風固定在前、概念接在後，而且明講不准有字", () => {
    const p = illustrationPrompt("  a clumsy robot bowing  ");
    expect(p.startsWith(ILLUSTRATION_STYLE)).toBe(true);
    expect(p.endsWith("Scene: a clumsy robot bowing")).toBe(true);
    expect(ILLUSTRATION_STYLE).toMatch(/no text/i);
    expect(ILLUSTRATION_STYLE).toContain("#E85D2E");
  });

  it("概念 JSON：只收要的 id、太短的丟掉、前後有雜字也解得出來", () => {
    const text = 'Sure!\n{"concepts":{"a":"two speech bubbles meeting over a gift box","b":"hi","z":"not asked for at all here"}}\nthanks';
    expect(parseConcepts(text, ["a", "b", "c"])).toEqual({ a: "two speech bubbles meeting over a gift box" });
    expect(parseConcepts("no json", ["a"])).toEqual({});
  });
});
