/**
 * 法規 tray 的字數把關（2026-09-30 CJ「有字數上限，確定品牌大腦吃得下」）：
 *   1. 可放的總量＝硬上限與大腦剩餘空間取小。
 *   2. 停用的卡不佔空間；編輯同一張不重複計算。
 *   3. 擋下時講清楚是哪一種上限、還剩幾字。
 */
import { describe, expect, it } from "vitest";
import { checkRegulationFits, regulationBudget, REG_DIGEST_MAX, REG_TOTAL_MAX, regulationLine, rowToRegulation } from "./brandRegulations";

describe("regulationBudget", () => {
  it("大腦還很空：用硬上限", () => {
    expect(regulationBudget(2_000, 16_000)).toEqual({ allowedTotal: REG_TOTAL_MAX, limitedByBrain: false });
  });
  it("大腦快滿：用剩下的空間", () => {
    expect(regulationBudget(13_000, 16_000)).toEqual({ allowedTotal: 3_000, limitedByBrain: true });
  });
  it("大腦已經超載：一個字都放不下", () => {
    expect(regulationBudget(17_000, 16_000).allowedTotal).toBe(0);
  });
});

describe("checkRegulationFits", () => {
  const existing = [
    { id: 1, enabled: true, digestChars: 600 },
    { id: 2, enabled: false, digestChars: 700 },
  ];
  it("放得下就過；停用的卡不算", () => {
    expect(checkRegulationFits({ existing, next: { id: null, enabled: true, chars: 700 }, allowedTotal: 1_300, limitedByBrain: false })).toBeNull();
  });
  it("編輯同一張不重複算自己", () => {
    expect(checkRegulationFits({ existing, next: { id: 1, enabled: true, chars: 800 }, allowedTotal: 800, limitedByBrain: false })).toBeNull();
  });
  it("存成停用一定可以（只要沒超過單張上限）", () => {
    expect(checkRegulationFits({ existing, next: { id: null, enabled: false, chars: 790 }, allowedTotal: 0, limitedByBrain: true })).toBeNull();
  });
  it("超過單張上限", () => {
    expect(checkRegulationFits({ existing: [], next: { id: null, enabled: false, chars: REG_DIGEST_MAX + 1 }, allowedTotal: 99_999, limitedByBrain: false }))
      .toContain(`審查重點最多 ${REG_DIGEST_MAX.toLocaleString("en-US")} 字`);
  });
  it("被大腦空間卡住：說還剩幾字、去「記憶」騰空間", () => {
    const msg = checkRegulationFits({ existing, next: { id: null, enabled: true, chars: 500 }, allowedTotal: 1_000, limitedByBrain: true })!;
    expect(msg).toContain("只剩 400 字");
    expect(msg).toContain("記憶");
  });
  it("被總量上限卡住", () => {
    const msg = checkRegulationFits({ existing: [...existing, { id: 3, enabled: true, chars: 0, digestChars: 800 }, { id: 4, enabled: true, digestChars: 800 }, { id: 5, enabled: true, digestChars: 800 }, { id: 6, enabled: true, digestChars: 800 }], next: { id: null, enabled: true, chars: 700 }, allowedTotal: REG_TOTAL_MAX, limitedByBrain: false })!;
    expect(msg).toContain(`合計最多 ${REG_TOTAL_MAX.toLocaleString("en-US")} 字`);
  });
});

describe("regulationLine", () => {
  it("有來源就標出來", () => {
    expect(regulationLine({ title: "食安法", source: "衛福部" }, "條文")).toBe("【食安法】（來源：衛福部）\n條文");
    expect(regulationLine({ title: "食安法", source: " " }, "條文")).toBe("【食安法】\n條文");
  });
});

describe("rowToRegulation", () => {
  it("有審查重點且啟用才算生效；原文字數與審查重點字數分開算", () => {
    const r = rowToRegulation({ id: 1, brandId: 2, title: "t", body: "原文原文", digest: "- 重點", enabled: 1, jobStatus: "review", draftDigest: "- 新" });
    expect(r).toMatchObject({ chars: 4, digestChars: 4, active: true, jobStatus: "review", draftDigest: "- 新" });
    expect(rowToRegulation({ id: 1, brandId: 2, title: "t", body: "x", digest: null, enabled: 1 }).active).toBe(false);
    expect(rowToRegulation({ id: 1, brandId: 2, title: "t", body: "x", digest: "y", enabled: 0 }).active).toBe(false);
    expect(rowToRegulation({ id: 1, brandId: 2, title: "t", body: "x", jobStatus: "weird" }).jobStatus).toBe("idle");
  });
});
