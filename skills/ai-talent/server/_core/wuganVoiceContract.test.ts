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

  it("同家族的否定詞也要抓 —— 不止於 / 不僅 / 不光 / 不只", () => {
    // 2026-08-31：修 DB 語氣範例時發現。原本只比對「不是」，
    // 品牌 2840 的 sample[1]「責任，不止於交屋那天，而是…」因此漏網。
    expect(validateWuganVoice("好建築的責任，不止於交屋那天，而是對未來數十年的承諾。")).not.toBeNull();
    expect(validateWuganVoice("這不僅是規格，更是生活條件。")).not.toBeNull();
    expect(validateWuganVoice("好設計不光是好看，而是每天都在運作。")).not.toBeNull();
    expect(validateWuganVoice("十築好氧不只是開窗，而是完整的換氣設計。")).not.toBeNull();
  });

  it("已知限制：否定與肯定跨句號時抓不到 —— 跨句比對誤判率太高，刻意不做", () => {
    // 品牌 2840 的 sample[2]「不是給你看的規格表。它是管線裡流動的水質…」
    // 語意上是同一個構造，但跨了句號。這裡把限制寫成測試，避免日後誤以為
    // 驗證器涵蓋了它。
    expect(validateWuganVoice("十項標準，不是給你看的規格表。它是管線裡流動的水質。")).toBeNull();
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

describe("潤稿路徑的修補（polishInput 不經過 orchestra 的 caption 迴圈）", () => {
  it("提案產出裡的禁用句型修得掉", () => {
    // 2026-09-01 實測提案模式殘留的那一處
    const out = repairWuganVoice(
      `【建議 1】晨起開窗，才發現空氣也分階級
　切角：好的空氣不是靠開窗，而是靠可以被維持的換氣條件。`,
    );
    expect(validateWuganVoice(out)).toBeNull();
    expect(out).toContain("【建議 1】");
  });

  it("修補不會動到建議的結構標記", () => {
    const src = `【建議 2】腳踩地板的瞬間
　對應標準：十築舒適
　切角：舒適不是形容詞，而是可被量測的條件。`;
    const out = repairWuganVoice(src);
    expect(out).toContain("【建議 2】");
    expect(out).toContain("對應標準：十築舒適");
    expect(validateWuganVoice(out)).toBeNull();
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

describe("修補涵蓋驗證抓得到的每一種句型", () => {
  // 2026-09-06：BANNED 在 2026-08-31 擴到整個「不止／不僅／不光／不只」家族，
  // repairWuganVoice 的替換清單沒有跟上，於是「不僅是A，更是B」驗得出來、
  // 修不掉。短文本還有具名重試兜底，長文件（captionMaxChars > 2000）直接跳到
  // 修補 —— 所以它會原樣出稿。實測 wg-web-longform 產出「這不僅是對飲用水的
  // 保障，更是對住客健康的承諾」就是這樣來的。
  //
  // 這組測試鎖的是「兩邊必須對得起來」，不是個別句型：只要有人再擴 BANNED
  // 而忘了擴修補，這裡就會紅。
  const VIOLATIONS = [
    "這不僅是對飲用水的保障，更是對住客健康的承諾。",
    "這不只是對飲用水的保障，更是對住客健康的承諾。",
    "十築標準不只是規格表，更是生活的承諾。",
    "這不光是設計，更是責任。",
    "好水不止於過濾，而是整套系統。",
    "這不僅是保障更是承諾。",           // 沒有逗號的寫法
    "這不是保障，而是承諾。",
    "並非只有外觀，而是整體。",
    "這並不是運氣，而是設計的結果。",
  ];

  it.each(VIOLATIONS)("修得掉：%s", (text) => {
    expect(validateWuganVoice(text), "測資本身要先是違反的").not.toBeNull();
    const fixed = repairWuganVoice(text);
    expect(validateWuganVoice(fixed), `修補後仍違反：${fixed}`).toBeNull();
    expect(fixed.length, "修補不該把整句刪光").toBeGreaterThan(3);
  });

  const LEGIT = [
    "讓空調不再是唯一的工具。",
    "把自然放進家裡，也要讓它在不同天氣裡被好好照顧。",
    "真正關注好水的家，會用心到看不見的管線裡。",
  ];

  it.each(LEGIT)("正常中文不動它：%s", (text) => {
    expect(repairWuganVoice(text)).toBe(text);
  });
});
