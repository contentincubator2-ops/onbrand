/**
 * 法規 tray 的字數把關（2026-09-30 CJ「有字數上限，確定品牌大腦吃得下」）：
 *   1. 可放的總量＝硬上限與大腦剩餘空間取小。
 *   2. 停用的卡不佔空間；編輯同一張不重複計算。
 *   3. 擋下時講清楚是哪一種上限、還剩幾字。
 */
import { describe, expect, it } from "vitest";
import { checkRegulationFits, regulationBudget, REG_CARD_MAX, REG_TOTAL_MAX, regulationLine } from "./brandRegulations";

describe("regulationBudget", () => {
  it("大腦還很空：用硬上限", () => {
    expect(regulationBudget(2_000, 16_000)).toEqual({ allowedTotal: REG_TOTAL_MAX, limitedByBrain: false });
  });
  it("大腦快滿：用剩下的空間", () => {
    expect(regulationBudget(12_500, 16_000)).toEqual({ allowedTotal: 3_500, limitedByBrain: true });
  });
  it("大腦已經超載：一個字都放不下", () => {
    expect(regulationBudget(17_000, 16_000).allowedTotal).toBe(0);
  });
});

describe("checkRegulationFits", () => {
  const existing = [
    { id: 1, enabled: true, chars: 2_000 },
    { id: 2, enabled: false, chars: 2_500 },
  ];
  it("放得下就過；停用的卡不算", () => {
    expect(checkRegulationFits({ existing, next: { id: null, enabled: true, chars: 2_000 }, allowedTotal: 4_000, limitedByBrain: false })).toBeNull();
  });
  it("編輯同一張不重複算自己", () => {
    expect(checkRegulationFits({ existing, next: { id: 1, enabled: true, chars: 3_000 }, allowedTotal: 3_000, limitedByBrain: false })).toBeNull();
  });
  it("存成停用一定可以（只要沒超過單張上限）", () => {
    expect(checkRegulationFits({ existing, next: { id: null, enabled: false, chars: 2_900 }, allowedTotal: 0, limitedByBrain: true })).toBeNull();
  });
  it("超過單張上限", () => {
    expect(checkRegulationFits({ existing: [], next: { id: null, enabled: false, chars: REG_CARD_MAX + 1 }, allowedTotal: 99_999, limitedByBrain: false }))
      .toContain(`最多 ${REG_CARD_MAX.toLocaleString("en-US")} 字`);
  });
  it("被大腦空間卡住：說還剩幾字、去「記憶」騰空間", () => {
    const msg = checkRegulationFits({ existing, next: { id: null, enabled: true, chars: 1_500 }, allowedTotal: 3_000, limitedByBrain: true })!;
    expect(msg).toContain("只剩 1,000 字");
    expect(msg).toContain("記憶");
  });
  it("被總量上限卡住", () => {
    const msg = checkRegulationFits({ existing: [...existing, { id: 3, enabled: true, chars: 2_500 }], next: { id: null, enabled: true, chars: 2_000 }, allowedTotal: REG_TOTAL_MAX, limitedByBrain: false })!;
    expect(msg).toContain(`合計最多 ${REG_TOTAL_MAX.toLocaleString("en-US")} 字`);
  });
});

describe("regulationLine", () => {
  it("有來源就標出來", () => {
    expect(regulationLine({ title: "食安法", source: "衛福部" }, "條文")).toBe("【食安法】（來源：衛福部）\n條文");
    expect(regulationLine({ title: "食安法", source: " " }, "條文")).toBe("【食安法】\n條文");
  });
});
