import { describe, expect, it } from "vitest";
import { angleFor, angleVisualLens, angleWritingBlock, checkAngle } from "./variantAngles";

describe("版本名稱 = 版本設計", () => {
  it("每個通用切角都有寫法定義，而且定義裡點名了自己的名稱", () => {
    for (const label of ["情感版", "理性版", "故事版", "數據版", "懸念版", "反差版"]) {
      const block = angleWritingBlock(label, { taskSystemPrompt: "" });
      expect(block, label).toContain(`這一版叫「${label}」`);
      expect(block, label).toContain("版本切角");
    }
  });

  it("同一個切角的不同寫法（情感式／情感放大式／數據式…）讀的是同一份定義", () => {
    expect(angleFor("情感式")).toBe(angleFor("情感版"));
    expect(angleFor("情感放大式")).toBe(angleFor("情感版"));
    expect(angleFor("數據式")).toBe(angleFor("數據版"));
    expect(angleFor("故事式")).toBe(angleFor("故事版"));
    expect(angleFor("懸念式")).toBe(angleFor("懸念版"));
  });

  // 截圖裡的問題：標成「理性版」的貼文通篇是氣味、畫面、感覺。
  it("理性版明確禁止感官／情緒寫法與數字開場；情感版明確禁止數字開場與優點清單", () => {
    const rational = angleWritingBlock("理性版");
    expect(rational).toContain("不寫感官描寫與情緒渲染");
    expect(rational).toContain("不用數字當開場");
    const emotional = angleWritingBlock("情感版");
    expect(emotional).toContain("情緒先於資訊");
    expect(emotional).toContain("開場不用數字");
  });

  it("理性版與數據版的定義是分開的：一個講決策邏輯，一個講具體數字", () => {
    expect(angleWritingBlock("理性版")).toContain("決策的邏輯");
    expect(angleWritingBlock("理性版")).not.toContain("一個具體的數字");
    expect(angleWritingBlock("數據版")).toContain("一個具體的數字");
    expect(angleWritingBlock("數據版")).toContain("嚴禁杜撰統計");
  });

  it("點名其他版本，要求開場與論證方式明顯不同（三個獨立呼叫不能收斂成同一篇）", () => {
    const block = angleWritingBlock("理性版", { siblings: ["情感版", "理性版", "數據版"] });
    expect(block).toContain("「情感版」、「數據版」");
    expect(block).not.toContain("「理性版」、");
    expect(block).toContain("明顯不同");
    expect(angleWritingBlock("理性版", { siblings: ["理性版"] })).not.toContain("明顯不同");
  });

  it("不是通用切角的名稱一律不動（自訂名稱由任務自己的 prompt 定義）", () => {
    for (const label of ["第 3 天", "詢價回覆", "教學版", "預告 1", "爆點 2"]) {
      expect(angleFor(label), label).toBeNull();
      expect(angleWritingBlock(label, { siblings: ["a", "b"] }), label).toBe("");
      expect(checkAngle(label, "隨便一句話"), label).toBeNull();
    }
  });

  it("任務自己的 systemPrompt 已經提到這個名稱：以任務的定義為準，這裡不覆蓋", () => {
    const own = "口吻分別：反問式 / 數字式 / 反差式";
    expect(angleWritingBlock("反差式", { taskSystemPrompt: own })).toBe("");
    expect(angleWritingBlock("反差式", { taskSystemPrompt: "只寫一篇短貼文" })).toContain("這一版叫「反差式」");
    expect(checkAngle("數據版", "沒有數字的一句話", "請寫數據版：……")).toBeNull();
  });

  it("圖片鏡頭跟文案寫法共用同一張表；別名也拿得到", () => {
    expect(angleVisualLens("情感版")).toBe("聚焦人物表情與肢體情緒、特寫、暖色光、淺景深");
    expect(angleVisualLens("數據版")).toContain("數字/圖表");
    expect(angleVisualLens("情感式")).toBe(angleVisualLens("情感版"));
    expect(angleVisualLens("第 3 天")).toBeNull();
  });
});

describe("checkAngle：數據版一定要用數字開場（唯一能機器驗證的切角）", () => {
  it.each([
    "3 種方式，讓房間在下班後 10 分鐘內安靜下來。",
    "一天 24 小時，你有幾分鐘是真正屬於自己的？",
    "只要三步：噴、點、閉眼。",
    "100ml 的空間噴霧，撐起整個週末。",
  ])("有數字或計量 → 通過：%s", (caption) => {
    expect(checkAngle("數據版", caption)).toBeNull();
    expect(checkAngle("數據式", caption)).toBeNull();
  });

  it("開頭 80 字內完全沒有數字（截圖那種感官散文）→ 要求重寫，並說明原因", () => {
    const prose = "打開門的瞬間，空氣裡有什麼不一樣。不是洗衣精的味道，是某種讓肩膀自動放下來的氣息。".padEnd(80, "。") + "第 1 個";
    const issue = checkAngle("數據版", prose);
    expect(issue).toContain("數據版");
    expect(issue).toContain("數字");
  });

  it("其他切角不做機器判斷（不假裝能評語氣）", () => {
    for (const label of ["情感版", "理性版", "故事版", "懸念版", "反差版"]) {
      expect(checkAngle(label, "一句沒有數字的話")).toBeNull();
    }
  });
});
