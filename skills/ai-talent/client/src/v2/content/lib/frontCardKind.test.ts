import { describe, expect, it } from "vitest";
import { frontCardKind, isRecentViral, viralWindowStart } from "../../platform/lib/sourceVocabulary";

// 2026-09-29 CJ：前台只列爆款結構（近 3 個月）＋品牌自建。
describe("frontCardKind", () => {
  const now = new Date("2026-09-29T12:00:00+08:00");

  it("視窗是台北時間本月＋前兩個月，跨年也對", () => {
    expect(viralWindowStart(now)).toBe("2026-07");
    expect(viralWindowStart(new Date("2027-01-10T12:00:00+08:00"))).toBe("2026-11");
    // 台北已經是 10/1，UTC 還是 9/30 —— 以台北為準
    expect(viralWindowStart(new Date("2026-09-30T17:00:00Z"))).toBe("2026-08");
  });

  it("近 3 個月的爆款才算，滑出去就下架", () => {
    expect(isRecentViral({ type: "viral", asOf: "2026-09" }, now)).toBe(true);
    expect(isRecentViral({ type: "viral", asOf: "2026-07" }, now)).toBe(true);
    expect(isRecentViral({ type: "viral", asOf: "2026-06" }, now)).toBe(false);
    expect(isRecentViral({ type: "viral", asOf: "2026-10" }, now)).toBe(false);
    expect(isRecentViral({ type: "award", asOf: "2026-09" }, now)).toBe(false);
  });

  it("只有兩類會出現在前台", () => {
    expect(frontCardKind({ source: { type: "viral", asOf: "2026-08" } }, now)).toBe("viral");
    expect(frontCardKind({ source: { type: "viral", asOf: "2012-03" } }, now)).toBeNull();
    expect(frontCardKind({ ownCardId: "abc" }, now)).toBe("own");
    expect(frontCardKind({ source: { type: "brand-method" } }, now)).toBe("own");
    expect(frontCardKind({ source: { type: "award" } }, now)).toBeNull();
    expect(frontCardKind({ source: { type: "evergreen" } }, now)).toBeNull();
  });
});
