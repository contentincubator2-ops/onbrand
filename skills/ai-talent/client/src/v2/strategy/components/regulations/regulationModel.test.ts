import { describe, expect, it } from "vitest";
import { cardRoom, charLen, isUrl, type Regulation } from "./regulationModel";

const reg = (id: number, chars: number, enabled = true): Regulation =>
  ({ id, brandId: 1, title: `r${id}`, source: "", body: "", enabled, chars, createdAt: null, updatedAt: null });

const list = (items: Regulation[], allowedTotal: number) => ({
  items,
  budget: { allowedTotal, limitedByBrain: allowedTotal < 6_000, nonRegulationChars: 0, capacity: 16_000 },
  limits: { titleMax: 60, sourceMax: 300, cardMax: 3_000, totalMax: 6_000, maxCards: 20 },
});

describe("cardRoom", () => {
  it("新卡：總額度扣掉其他啟用中的卡，再跟單張上限取小", () => {
    expect(cardRoom(list([reg(1, 2_000), reg(2, 2_500, false)], 6_000), null, true)).toBe(3_000);
    expect(cardRoom(list([reg(1, 4_500)], 6_000), null, true)).toBe(1_500);
  });
  it("編輯中的那張不算在「其他」裡", () => {
    expect(cardRoom(list([reg(1, 2_000), reg(2, 2_000)], 4_000), 2, true)).toBe(2_000);
  });
  it("大腦沒空間：啟用的一個字都放不下，但可以存成停用", () => {
    expect(cardRoom(list([], 0), null, true)).toBe(0);
    expect(cardRoom(list([], 0), null, false)).toBe(3_000);
  });
});

describe("helpers", () => {
  it("字數以字元計、去頭尾空白", () => {
    expect(charLen("  食安法  ")).toBe(3);
  });
  it("網址才當連結", () => {
    expect(isUrl("https://law.moj.gov.tw/x")).toBe(true);
    expect(isUrl("衛福部食藥署")).toBe(false);
  });
});
