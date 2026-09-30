import { describe, expect, it } from "vitest";
import { cardState, charLen, digestRoom, isUrl, progressPct, progressText, type Regulation } from "./regulationModel";

const reg = (id: number, digestChars: number, active = true): Regulation => ({
  id, brandId: 1, title: `r${id}`, source: "", body: "", enabled: true, chars: 10_000,
  digest: digestChars ? "x" : "", digestChars, draftDigest: "", jobStatus: "idle", jobProgress: null, jobError: null,
  active, createdAt: null, updatedAt: null,
});

const list = (items: Regulation[], allowedTotal: number) => ({
  items,
  budget: { allowedTotal, limitedByBrain: allowedTotal < 4_000, nonRegulationChars: 0, capacity: 16_000 },
  limits: { titleMax: 60, sourceMax: 300, bodyMax: 50_000, digestMax: 800, totalMax: 4_000, maxCards: 20 },
});

describe("digestRoom", () => {
  it("總額度扣掉其他生效中的卡，再跟單張上限取小；原文多長都不算", () => {
    expect(digestRoom(list([reg(1, 600), reg(2, 700, false)], 4_000), null, true)).toBe(800);
    expect(digestRoom(list([reg(1, 800), reg(2, 800), reg(3, 800), reg(4, 800), reg(5, 500)], 4_000), null, true)).toBe(300);
  });
  it("編輯中的那張不算在「其他」裡", () => {
    expect(digestRoom(list([reg(1, 700), reg(2, 700)], 1_400), 2, true)).toBe(700);
  });
  it("大腦沒空間：生效的一個字都放不下，停用的可以", () => {
    expect(digestRoom(list([], 0), null, true)).toBe(0);
    expect(digestRoom(list([], 0), null, false)).toBe(800);
  });
});

describe("cardState", () => {
  it("萃取中／待確認優先；沒有審查重點＝未萃取；有就看啟用", () => {
    expect(cardState({ jobStatus: "extracting", digest: "x", enabled: true })).toBe("extracting");
    expect(cardState({ jobStatus: "review", digest: "", enabled: true })).toBe("review");
    expect(cardState({ jobStatus: "failed", digest: "", enabled: true })).toBe("failed");
    expect(cardState({ jobStatus: "failed", digest: "x", enabled: true })).toBe("active");
    expect(cardState({ jobStatus: "idle", digest: "", enabled: true })).toBe("pending");
    expect(cardState({ jobStatus: "idle", digest: "x", enabled: false })).toBe("off");
  });
});

describe("progress", () => {
  it("逐段往上、整理階段接近完成", () => {
    expect(progressPct({ stage: "extracting", done: 0, total: 4 })).toBe(5);
    expect(progressPct({ stage: "extracting", done: 2, total: 4 })).toBe(45);
    expect(progressPct({ stage: "merging", done: 4, total: 4 })).toBe(92);
    expect(progressText({ stage: "extracting", done: 3, total: 9 }, false)).toBe("萃取中・第 3／9 段");
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
