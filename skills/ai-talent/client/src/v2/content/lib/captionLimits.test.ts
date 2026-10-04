import { describe, expect, it } from "vitest";
import { captionLimitFor, captionLimitHint, captionLength } from "./captionLimits";

describe("captionLimits", () => {
  it("knows the limits", () => {
    expect(captionLimitFor("threads")).toBe(500);
    expect(captionLimitFor("X")).toBe(280);
    expect(captionLimitFor("instagram")).toBe(2000);
    expect(captionLimitFor("linkedin")).toBe(3000);
    expect(captionLimitFor("facebook")).toBeNull();
  });
  it("counts code points", () => {
    expect(captionLength("a😀b")).toBe(3);
  });
  it("flags over-limit in both languages", () => {
    const h = captionLimitHint("threads", "x".repeat(501), true)!;
    expect(h.over).toBe(true);
    expect(h.text).toContain("501/500");
    expect(captionLimitHint("threads", "短", false)!.text).toContain("1/500");
    expect(captionLimitHint("facebook", "x", true)).toBeNull();
  });
});
