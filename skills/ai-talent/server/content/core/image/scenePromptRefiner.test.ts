/**
 * cleanRefinedScene 的測試。
 *
 * 2026-09-24（CJ「加入AI潤飾的按鈕」）：潤飾結果會**直接填進使用者的輸入框**，
 * 所以模型吐出來的格式雜訊（code fence、引號、「場景：」開頭）不能跟著進去——
 * 那些字會原封不動被送進生圖 prompt。這裡每一條測資都是實際看過的輸出形狀。
 */
import { describe, it, expect } from "vitest";
import { cleanRefinedScene } from "./scenePromptRefiner";

describe("cleanRefinedScene", () => {
  it("去掉 code fence", () => {
    expect(cleanRefinedScene("```\n淺色橡木餐桌，左側窗光斜射\n```")).toBe("淺色橡木餐桌，左側窗光斜射");
    expect(cleanRefinedScene("```text\n淺色橡木餐桌\n```")).toBe("淺色橡木餐桌");
  });

  it("去掉包在外面的引號（中英文都要）", () => {
    expect(cleanRefinedScene("「淺色橡木餐桌，午後光」")).toBe("淺色橡木餐桌，午後光");
    expect(cleanRefinedScene('"light oak table"')).toBe("light oak table");
  });

  it("去掉「場景：」這種開頭標籤", () => {
    expect(cleanRefinedScene("場景：淺色橡木餐桌")).toBe("淺色橡木餐桌");
    expect(cleanRefinedScene("Scene: light oak table")).toBe("light oak table");
  });

  it("句子中間的引號不能被動到（那是內容的一部分）", () => {
    const s = "餐桌上放著一本翻開的書，標題朝下";
    expect(cleanRefinedScene(s)).toBe(s);
  });

  it("空的就是空的——不要回一段假的", () => {
    expect(cleanRefinedScene("")).toBe("");
    expect(cleanRefinedScene("   ")).toBe("");
    expect(cleanRefinedScene(null as any)).toBe("");
  });

  it("超長輸出截到 600 字（輸入框上限）", () => {
    expect(cleanRefinedScene("餐".repeat(900)).length).toBe(600);
  });
});
