/**
 * 2026-09-25（CJ「剛剛生出來的文案，顯示得很奇怪」）：那一則的實際產出就是下面
 * REAL_MISS 這段——`fb-30-ad-cta` 承諾 6–12 字的按鈕文字，回來的是一整段促銷文，
 * 於是 mockup 的按鈕落回「選購」、長文被塞進底下的小框。
 *
 * 合約的價值全在「壞掉的樣子」上，所以測試從那一則真實產出開始寫。
 */
import { describe, it, expect } from "vitest";
import {
  adSlotOf, validateAdSlot, repairAdSlot, buildAdSlotRule, visibleLength, SLOT_SPECS,
} from "./adSlotContract";

const REAL_MISS =
  "🎉 中秋活動正式開跑！全站85折，讓你輕鬆享受美味！美國橫膈牛排NT$560起，還有更多厲害的肉品！但要快，數量有限！ 只需點擊這裡，立即選購你最愛的中秋美味，趕快讓這個中秋桌上多點驚喜！ 👉點擊下單，搶購優惠！";

describe("adSlotOf", () => {
  it("認得三張單欄位廣告卡", () => {
    expect(adSlotOf("fb-30-ad-cta")).toBe("cta");
    expect(adSlotOf("fb-30-ad-headline")).toBe("headline");
    expect(adSlotOf("fb-30-ad-description")).toBe("description");
  });
  it("其他卡不歸這支管", () => {
    for (const id of ["fb-30-single", "fb-60-launch-kit", "ig-30-caption", "", null, undefined]) {
      expect(adSlotOf(id as any), String(id)).toBeNull();
    }
  });
});

describe("visibleLength", () => {
  it("emoji 與空白不吃字數額度", () => {
    expect(visibleLength("立即選購")).toBe(4);
    expect(visibleLength("👉 立即選購 ")).toBe(4);
  });
});

describe("validateAdSlot", () => {
  it("CJ 遇到的那一則會被擋下來", () => {
    const issue = validateAdSlot(REAL_MISS, "cta");
    expect(issue?.reason).toBe("too_long");
    expect(issue?.detail).toContain("上限 12 字");
  });

  it("合格的 CTA 兩行過關", () => {
    expect(validateAdSlot("立即搶中秋優惠\n適合：檔期倒數三天內投放", "cta")).toBeNull();
  });

  it("CTA 少了「適合：」那一行＝沒履約（那一行是卡片描述承諾的東西）", () => {
    expect(validateAdSlot("立即搶中秋優惠", "cta")?.reason).toBe("missing_context_line");
    expect(validateAdSlot("立即搶中秋優惠\n現在下單最划算", "cta")?.reason).toBe("missing_context_line");
  });

  it("標題與說明是單行、各有字數上限", () => {
    expect(validateAdSlot("中秋烤肉黃金組合 85 折", "headline")).toBeNull();
    expect(validateAdSlot("中秋烤肉黃金組合，橫膈牛排加厚切牛舌，限時 85 折再送烤肉醬", "headline")?.reason).toBe("too_long");
    expect(validateAdSlot("一行\n兩行", "description")?.reason).toBe("too_many_lines");
  });

  it("空的就是空的", () => {
    expect(validateAdSlot("   \n  ", "cta")?.reason).toBe("empty");
  });
});

describe("repairAdSlot —— 最後一次嘗試也不能交出版面放不進去的東西", () => {
  it("把 CJ 那一則修成放得進按鈕的形狀，而且沒有丟掉看得見的字", () => {
    const fixed = repairAdSlot(REAL_MISS, "cta");
    const [head, ctx] = fixed.split("\n");
    expect(validateAdSlot(fixed, "cta")).toBeNull();
    expect(visibleLength(head!)).toBeLessThanOrEqual(SLOT_SPECS.cta.maxChars);
    expect(ctx!.startsWith("適合：")).toBe(true);
    // 被切下來的內容搬去情境行，不是直接刪掉
    expect(ctx!.length).toBeGreaterThan(6);
  });

  it("已經有「適合：」那一行時保留它，只修按鈕那一行", () => {
    const fixed = repairAdSlot("立即點擊選購你最愛的中秋美味組合\n適合：倒數期投放", "cta");
    expect(fixed.split("\n")[1]).toBe("適合：倒數期投放");
    expect(validateAdSlot(fixed, "cta")).toBeNull();
  });

  it("標題超長就切在句讀處，切完仍超長才硬截", () => {
    const fixed = repairAdSlot("中秋烤肉黃金組合，橫膈牛排加厚切牛舌限時 85 折", "headline");
    expect(visibleLength(fixed)).toBeLessThanOrEqual(SLOT_SPECS.headline.maxChars);
    expect(fixed.includes("\n")).toBe(false);
  });

  it("本來就合格的不要動它", () => {
    const ok = "立即搶中秋優惠\n適合：檔期倒數三天內投放";
    expect(repairAdSlot(ok, "cta")).toBe(ok);
  });
});

describe("buildAdSlotRule", () => {
  it("合約講的字數跟驗證用的是同一個數字", () => {
    expect(buildAdSlotRule("cta")).toContain(`最多 ${SLOT_SPECS.cta.maxChars} 個字`);
    expect(buildAdSlotRule("headline")).toContain(`最多 ${SLOT_SPECS.headline.maxChars} 個字`);
  });
  it("CTA 的合約要明講「不要寫主文案」—— 那正是這次寫歪的方向", () => {
    expect(buildAdSlotRule("cta")).toContain("不要");
    expect(buildAdSlotRule("cta")).toContain("主文案");
  });
});
