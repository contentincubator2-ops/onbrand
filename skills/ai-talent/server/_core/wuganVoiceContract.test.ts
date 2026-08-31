/**
 * 測資全部取自 2026-08-31 wg-fb-life-practice 的實際產出 —— 那一次三個變體
 * 共 8 處違反，prompt 裡明文禁止也擋不住。
 */
import { describe, it, expect } from "vitest";
import {
  isWuganVoiceTemplate, validateWuganVoice, repairWuganVoice, buildWuganVoiceReminder,
} from "./wuganVoiceContract";

const REAL_VIOLATIONS = [
  "其實好氧不是選擇題，而是讓新鮮空氣、過濾系統、低毒建材一起運作。",
  "秋天的清晨不是拒絕開窗的理由，而是讓空氣對流更有效率的季節。",
  "不是靠香味掩蓋，而是讓好的空氣條件成為住在裡面的日常。",
  "家裡的空氣始終在流動，而不是被困在溫度與濕度的選擇題裡。",
  "讓呼吸成為最理所當然的事，不再是需要被計算、被妥協的生活選項。",
  "十築好氧不只是開窗，而是讓新鮮空氣能被妥善導入、過濾、循環。",
];

const CLEAN = [
  "真正關注好水的家，會用心到看不見的管線裡，讓每一次打開水龍頭都能安心。",
  "選擇能維修、能更換零件、能長久使用的家具，就是把珍惜資源落實在家的日常。",
  "把自然放進家裡，也要讓它在不同天氣裡被好好照顧。",
  "好的學習空間，會把自然、材料與安定感放進孩子每天使用的細節裡。",
];

describe("isWuganVoiceTemplate", () => {
  it("認得帶了鐵律的卡", () => {
    expect(isWuganVoiceTemplate({ systemPrompt: "…【第一鐵律：全文正向直述，嚴禁否定轉折句型】…" })).toBe(true);
  });
  it("其他品牌的卡不受影響", () => {
    expect(isWuganVoiceTemplate({ systemPrompt: "產出單張圖文 FB 貼文 caption，100-200 字。" })).toBe(false);
  });
});

describe("validateWuganVoice", () => {
  it.each(REAL_VIOLATIONS)("抓得到實際產出裡的違反：%s", (line) => {
    expect(validateWuganVoice(line)).not.toBeNull();
  });

  it.each(CLEAN)("不誤判合格的品牌句：%s", (line) => {
    expect(validateWuganVoice(line)).toBeNull();
  });

  it("回報總數與第一處位置", () => {
    const issue = validateWuganVoice(REAL_VIOLATIONS.join(""))!;
    expect(issue).not.toBeNull();
    expect(issue.count).toBeGreaterThanOrEqual(REAL_VIOLATIONS.length);
    expect(issue.excerpt.length).toBeGreaterThan(0);
  });

  it("單獨的「不再是」不算違反 —— skill 禁的是「不再是⋯而是⋯」的轉折構造", () => {
    // 2026-08-31 實測誤判：「讓空調不再是唯一的溫濕調節工具」是正常中文，
    // 攔下來只會白白燒一次重試。
    expect(validateWuganVoice("隔熱與通風的平衡，讓空調不再是唯一的溫濕調節工具。")).toBeNull();
    expect(validateWuganVoice("好的設計讓除濕機不再是必需品。")).toBeNull();
  });

  it("頓號形式的轉折仍然抓得到", () => {
    expect(validateWuganVoice("當空氣流動被感受到時，家不再是悶的、是透氣的。")).not.toBeNull();
    expect(validateWuganVoice("這不是裝飾、是每天都在運作的條件。")).not.toBeNull();
  });

  it("空字串不算違反", () => {
    expect(validateWuganVoice("")).toBeNull();
  });

  it("跨句不誤連 —— 前句的「不是」不該和後句的「而是」湊成一對", () => {
    expect(validateWuganVoice("這件事我們不是很在意。而是的說法要避免。")).toBeNull();
  });
});

describe("repairWuganVoice", () => {
  it("「A不是X，而是Y」→「A是Y」", () => {
    const out = repairWuganVoice("其實好氧不是選擇題，而是讓新鮮空氣一起運作。");
    expect(out).toBe("其實好氧是讓新鮮空氣一起運作。");
    expect(validateWuganVoice(out)).toBeNull();
  });

  it("「不只是X，而是Y」也修得掉", () => {
    const out = repairWuganVoice("十築好氧不只是開窗，而是讓空氣被妥善導入。");
    expect(out).toBe("十築好氧是讓空氣被妥善導入。");
    expect(validateWuganVoice(out)).toBeNull();
  });

  it("刪掉「，而不是…」的對比尾巴，保留肯定半邊", () => {
    const out = repairWuganVoice("家裡的空氣始終在流動，而不是被困在選擇題裡。");
    expect(out).toBe("家裡的空氣始終在流動。");
    expect(validateWuganVoice(out)).toBeNull();
  });

  it("刪掉「，不再是…」的對比尾巴", () => {
    const out = repairWuganVoice("讓呼吸成為最理所當然的事，不再是需要被計算的生活選項。");
    expect(out).toBe("讓呼吸成為最理所當然的事。");
    expect(validateWuganVoice(out)).toBeNull();
  });

  it("破折號引出的對比尾巴同樣處理", () => {
    const out = repairWuganVoice("讓空氣自然流動——而不是靠機器硬撐。");
    expect(validateWuganVoice(out)).toBeNull();
  });

  it("修得掉頓號形式的轉折", () => {
    const out = repairWuganVoice("當空氣流動被感受到時，家不再是悶的、是透氣的。");
    expect(validateWuganVoice(out)).toBeNull();
    expect(out).toContain("透氣");
  });

  it("修得掉沒有逗號的「A而不是B」，且不吃掉 Markdown 記號", () => {
    // 2026-08-31 實測殘留：bullet 標題裡的「讓冷氣成為支持而不是依賴」
    const out = repairWuganVoice("**負荷的預測與調控，讓冷氣成為支持而不是依賴**");
    expect(validateWuganVoice(out)).toBeNull();
    expect(out).toContain("讓冷氣成為支持");
    expect(out.endsWith("**")).toBe(true);
  });

  it("合格的句子原封不動", () => {
    for (const line of CLEAN) expect(repairWuganVoice(line)).toBe(line);
  });

  it("修補後不留下重複或懸空的標點", () => {
    const out = repairWuganVoice("家裡的空氣始終在流動，而不是被困在選擇題裡。呼吸順了，而不是被溫差綁架。");
    expect(out).not.toMatch(/[，,]{2,}/);
    expect(out).not.toMatch(/[，,][。！？]/);
  });
});

describe("buildWuganVoiceReminder", () => {
  it("提示裡帶了句型名稱與原文摘錄", () => {
    const issue = validateWuganVoice("好氧不是選擇題，而是讓空氣流動。")!;
    const msg = buildWuganVoiceReminder(issue);
    expect(msg).toContain(issue.pattern);
    expect(msg).toContain("正向直述");
  });
});
