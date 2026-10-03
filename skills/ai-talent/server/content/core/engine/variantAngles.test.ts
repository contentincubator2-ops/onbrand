import { describe, expect, it } from "vitest";
import { angleFor, angleVisualLens, angleWritingBlock, checkAngle, dedupeAngleLabels, pickOwnAngleBlock, sanitizeAngleLabel } from "./variantAngles";

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

  // 第一次真實跑出來的問題：「7 片蘇格蘭風景裡，洛蒙德湖排在第 1 號」——有數字，但 7 是編的。
  describe("數字必須對得回素材，不能是杜撰的統計", () => {
    const SOURCE = "洛蒙德湖系列首支登場：No. 01 洛蒙德湖，有空間噴霧、擴香、香氛蠟燭三種使用方式。";

    it("開頭的數字不在素材裡、也不是這篇自己列的數量 → 要求重寫，並點名那個數字", () => {
      const issue = checkAngle("數據版", "7 片蘇格蘭風景裡，洛蒙德湖排在第 1 號。", "", SOURCE);
      expect(issue).toContain("「7」");
      expect(issue).toContain("杜撰");
    });

    it.each([
      "3 種方式，把洛蒙德湖的安靜帶回家。",        // 這篇自己列出的數量（種）
      "No. 01 洛蒙德湖，是這個系列的第 1 支。",     // 01 在素材裡
      "5 分鐘，讓房間從白天切換成夜晚。",           // 小量的時間計量
    ])("素材裡有、或是這篇自己數出來的量 → 通過：%s", (caption) => {
      expect(checkAngle("數據版", caption, "", SOURCE)).toBeNull();
    });

    it("大的量詞數字（不是素材裡的）也算杜撰：「90%」「1200 位」", () => {
      expect(checkAngle("數據版", "90% 的人回到家都會先開燈。", "", SOURCE)).toContain("杜撰");
      expect(checkAngle("數據版", "1200 位客人都說過同一句話。", "", SOURCE)).toContain("杜撰");
    });

    it("整個數字才算數：素材裡有 17 或 2027，不能替 7 背書；01 與 1 是同一個數字", () => {
      const source = "成立於 2017 年，門市 17 間。No. 01 系列。";
      expect(checkAngle("數據版", "7 片風景裡排第一。", "", source)).toContain("杜撰");
      expect(checkAngle("數據版", "17 間門市，都收得到這一支。", "", source)).toBeNull();
      expect(checkAngle("數據版", "No. 1 洛蒙德湖，剛登場。", "", source)).toBeNull();
    });

    it("沒有給素材時只驗「有沒有數字」，不亂判", () => {
      expect(checkAngle("數據版", "7 片蘇格蘭風景裡，洛蒙德湖排在第 1 號。")).toBeNull();
    });
  });

  it("理性版禁止比喻與擬人，要求用直述判斷句", () => {
    const block = angleWritingBlock("理性版");
    expect(block).toContain("不用比喻、擬人與詩意修辭");
    expect(block).toContain("適合");
    expect(block).toContain("代價是");
  });

  it("其他切角不做機器判斷（不假裝能評語氣）", () => {
    for (const label of ["情感版", "理性版", "故事版", "懸念版", "反差版"]) {
      expect(checkAngle(label, "一句沒有數字的話")).toBeNull();
    }
  });
});

// 2026-09-22（CJ「不應該將所有產品都規定為情感版、理性版還有數據版……香氛產品用數據版，好奇怪」）：
// 幾張泛用任務卡不再預先指定角度，改由每篇自己判斷、自己回報名稱。
describe("pickOwnAngleBlock：不指定角度，寫手自己判斷再回報名稱", () => {
  it("明講這次不指定角度，並點名『香氛硬套數據版』這個具體反例", () => {
    const block = pickOwnAngleBlock({ index: 1, total: 3 });
    expect(block).toContain("這次不指定角度");
    expect(block).toContain("由你判斷");
    expect(block).toContain("香氛");
    expect(block).toContain("數據版");
  });

  it("列出六個通用切角當參考，但明講可以不用、可以自創", () => {
    const block = pickOwnAngleBlock({ index: 1, total: 3 });
    for (const name of ["情感版", "理性版", "故事版", "數據版", "懸念版", "反差版"]) {
      expect(block).toContain(name);
    }
    expect(block).toContain("可以自創更合適的切角");
  });

  it("第一篇不用避開別人，第二篇以後才提醒避開最安全的第一選擇", () => {
    expect(pickOwnAngleBlock({ index: 1, total: 3 })).not.toContain("盡量避開");
    expect(pickOwnAngleBlock({ index: 2, total: 3 })).toContain("盡量避開");
    expect(pickOwnAngleBlock({ index: 3, total: 3 })).toContain("另外還有 2 篇");
  });

  it("要求輸出多帶一個 label 欄位，且數字仍要能查證", () => {
    const block = pickOwnAngleBlock({ index: 1, total: 3 });
    expect(block).toContain('"label"');
    expect(block).toContain("不准杜撰統計");
  });
});

describe("sanitizeAngleLabel：模型自報的名稱要先洗過才能上畫面", () => {
  it("正常名稱原樣保留", () => {
    expect(sanitizeAngleLabel("嗅覺版", "情感版")).toBe("嗅覺版");
  });

  it("去掉模型常見的包裹符號（引號、書名號、方括號）", () => {
    expect(sanitizeAngleLabel("「嗅覺版」", "情感版")).toBe("嗅覺版");
    expect(sanitizeAngleLabel("『決策版』", "情感版")).toBe("決策版");
    expect(sanitizeAngleLabel("[場景版]", "情感版")).toBe("場景版");
  });

  it("空字串、非字串、或長到不像一個版本名稱 → 落回 fallback", () => {
    expect(sanitizeAngleLabel("", "情感版")).toBe("情感版");
    expect(sanitizeAngleLabel(undefined, "情感版")).toBe("情感版");
    expect(sanitizeAngleLabel(null, "情感版")).toBe("情感版");
    expect(sanitizeAngleLabel("這其實是一整句話不是一個版本名稱喔", "情感版")).toBe("情感版");
  });
});

// 2026-09-22 實測：三篇獨立判斷常常收斂到同一個名字（三篇都叫「情感版」）——內容不同，但畫面上
// 版本頁籤全部同名看起來像壞掉。dedupeAngleLabels 只調整顯示用的名字，不動內容判斷本身。
describe("dedupeAngleLabels：畫面上不重複名字，但不動內容", () => {
  it("實測那組（三篇都叫「情感版」）：後面兩篇加上序號區分", () => {
    const results = [{ label: "情感版" }, { label: "情感版" }, { label: "情感版" }];
    dedupeAngleLabels(results);
    expect(results.map((r) => r.label)).toEqual(["情感版", "情感版②", "情感版③"]);
  });

  it("本來就不同的名字完全不動", () => {
    const results = [{ label: "情感版" }, { label: "理性版" }, { label: "嗅覺版" }];
    dedupeAngleLabels(results);
    expect(results.map((r) => r.label)).toEqual(["情感版", "理性版", "嗅覺版"]);
  });

  it("只有部分重複時，只調整重複的那幾個", () => {
    const results = [{ label: "情感版" }, { label: "理性版" }, { label: "情感版" }];
    dedupeAngleLabels(results);
    expect(results.map((r) => r.label)).toEqual(["情感版", "理性版", "情感版②"]);
  });

  it("caption 內容不受影響——只動 label 欄位", () => {
    const results = [
      { label: "情感版", caption: "第一篇" },
      { label: "情感版", caption: "第二篇" },
    ];
    dedupeAngleLabels(results);
    expect(results[0]!.caption).toBe("第一篇");
    expect(results[1]!.caption).toBe("第二篇");
  });
});
