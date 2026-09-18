/**
 * 小定位的守門測試。真正會踩到的是「模型交白卷但我們照寫」——定位頁上一張空卡
 * 比少一張卡糟得多，所以 hasSubstance 的判斷要鎖起來。
 */
import { describe, expect, it } from "vitest";
import { BOOTH_SEGMENTS, PAID_ONLY_SEGMENTS, pickSegments } from "./boothPositioning";

const full = {
  goldenCircle: { why: "讓品牌內容永遠一致", how: "先鎖定品牌大腦", what: "AI 行銷工作室" },
  tagline: { zhTagline: "永遠 on-brand 的 AI 行銷工作室", enTagline: "", type: "價值主張" },
  audience: { primary: "需要跨平台產出內容的行銷人員", secondary: "品牌經營者" },
  differentiation: { functional: "14 步定位法", emotional: "安心", summary: "先定位再產出" },
  voice: { archetypes: ["創造者"], tone: ["精準", "工藝感"], samples: [{ generic: "快又方便", ours: "先鎖定品牌大腦" }] },
};

describe("pickSegments", () => {
  it("takes every segment a real website supports", () => {
    const { patch, filled, thin } = pickSegments(full);
    expect(filled).toEqual([...BOOTH_SEGMENTS]);
    expect(thin).toEqual([]);
    expect(Object.keys(patch).sort()).toEqual([...BOOTH_SEGMENTS].sort());
  });

  it("never writes a segment the model left blank", () => {
    const { filled, thin } = pickSegments({
      ...full,
      goldenCircle: { why: "", how: "", what: "" },
      audience: { primary: "   ", secondary: "品牌經營者" },
    });
    expect(thin).toContain("goldenCircle");
    expect(thin).toContain("audience");
    expect(filled).not.toContain("goldenCircle");
  });

  it("accepts a tagline in either language alone", () => {
    const en = pickSegments({ ...full, tagline: { zhTagline: "", enTagline: "Always on-brand" } });
    expect(en.filled).toContain("tagline");
    const neither = pickSegments({ ...full, tagline: { zhTagline: "", enTagline: "" } });
    expect(neither.thin).toContain("tagline");
  });

  it("treats a missing key and a wrong-typed key the same as blank", () => {
    expect(pickSegments({ ...full, voice: undefined }).thin).toContain("voice");
    expect(pickSegments({ ...full, voice: "not an object" }).thin).toContain("voice");
    expect(pickSegments({ ...full, voice: { tone: [] } }).thin).toContain("voice");
  });

  it("keeps booth and paid-tier segments disjoint", () => {
    // 展場模式若開始填 competition / trends，就是在編造競品分析。
    for (const id of PAID_ONLY_SEGMENTS) {
      expect(BOOTH_SEGMENTS).not.toContain(id as never);
    }
  });

  it("ignores anything outside the booth segment list", () => {
    const { patch } = pickSegments({ ...full, competition: { intensity: "很競爭" }, trends: { favorable: [] } });
    expect(patch).not.toHaveProperty("competition");
    expect(patch).not.toHaveProperty("trends");
  });
});
