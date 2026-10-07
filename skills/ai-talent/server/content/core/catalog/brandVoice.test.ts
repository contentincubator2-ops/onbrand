/**
 * brandVoice 的純函式：切文章、解析分類、常用詞驗證、試寫題目、寫進品牌口吻的那一段。
 */
import { describe, expect, it, vi } from "vitest";

// brandTaskCards 載入時會建連線池；這支只測純函式，不需要資料庫。
vi.mock("../../../localDb", () => ({ default: { execute: vi.fn() } }));

import {
  VOICE_CATEGORIES, VOICE_BLOCK_START, VOICE_BLOCK_END,
  splitArticles, parseClassification, groupByCategory, verifiedPhrases, parseVoiceProfile,
  pickTrialTopic, buildVoiceBlock, mergeVoiceText, countsTowardCardQuota, voiceCardId, voiceCategory,
} from "./brandVoice";
import { CARD_ID_RE, brandIdOfCardId, withBrandLock } from "./brandTaskCards";

const A = "今天想跟大家聊聊冷泡茶，為什麼放冰箱一晚就不苦澀了呢？";
const B = "母親節檔期開跑囉！全館滿額就送小禮，快帶媽媽來逛逛吧。";

describe("類別", () => {
  it("五類，id 不重複", () => {
    expect(VOICE_CATEGORIES.map((c) => c.zh)).toEqual(["產品介紹", "節慶活動", "知識教育", "品牌故事", "互動閒聊"]);
    expect(new Set(VOICE_CATEGORIES.map((c) => c.id)).size).toBe(5);
  });

  it("每一類的卡 id 都是合法的自建卡 id，而且剖得出 brandId", () => {
    for (const c of VOICE_CATEGORIES) {
      const id = voiceCardId(2964, c.id);
      expect(CARD_ID_RE.test(id), id).toBe(true);
      expect(brandIdOfCardId(id)).toBe(2964);
    }
  });
});

describe("splitArticles", () => {
  it("用 --- 分隔", () => {
    expect(splitArticles(`${A}\n---\n${B}`)).toEqual([A, B]);
  });

  it("連續三個以上空行也算分隔；單一空行是文章自己的分段，不切", () => {
    const twoPara = `${A}\n\n第二段還是同一篇，繼續把觀念講完整。`;
    expect(splitArticles(`${twoPara}\n\n\n\n${B}`)).toEqual([twoPara, B]);
  });

  it("太短的片段丟掉（分隔線前後的殘渣）", () => {
    expect(splitArticles(`${A}\n---\n好\n---\n${B}`)).toEqual([A, B]);
  });

  it("Windows 換行也切得開", () => {
    expect(splitArticles(`${A}\r\n---\r\n${B}`)).toEqual([A, B]);
  });
});

describe("parseClassification", () => {
  it("標準格式", () => {
    expect(parseClassification(`{"items":[{"n":1,"cat":"knowledge"},{"n":2,"cat":"festival"}]}`, 2))
      .toEqual(["knowledge", "festival"]);
  });

  it("沒列到的、類別不認得的、編號超出範圍的＝未分類", () => {
    expect(parseClassification(`{"items":[{"n":1,"cat":"recruit"},{"n":3,"cat":"chat"},{"n":9,"cat":"chat"}]}`, 3))
      .toEqual([null, null, "chat"]);
  });

  it("前後夾了說明文字、或寫成 {編號: 類別} 也吃", () => {
    expect(parseClassification(`好的，結果如下：{"1":"story","2":"product"} 以上。`, 2)).toEqual(["story", "product"]);
  });

  it("被截斷的 JSON 逐筆撈", () => {
    expect(parseClassification(`{"items":[{"n":1,"cat":"chat"},{"n":2,"cat":"prod`, 2)).toEqual(["chat", null]);
  });

  it("整段不是 JSON＝全部未分類，不丟錯", () => {
    expect(parseClassification("抱歉我無法處理", 2)).toEqual([null, null]);
  });
});

describe("groupByCategory", () => {
  it("未分類的不進任何一類，順序照原本", () => {
    const g = groupByCategory(["a", "b", "c"], ["chat", null, "chat"]);
    expect(g.chat).toEqual(["a", "c"]);
    expect(g.product).toEqual([]);
  });
});

describe("verifiedPhrases —— 常用詞只留真的出現在原文的", () => {
  const samples = [
    "嗨茶友們，今天來聊冷泡。喝起來順順的～",
    "嗨茶友們，母親節快到了。送禮也要順順的～",
    "嗨茶友們，新品 499 元上市。",
  ];

  it("模型編的詞（原文沒有）丟掉", () => {
    expect(verifiedPhrases(["嗨茶友們", "質感生活提案"], samples).map((p) => p.text)).toEqual(["嗨茶友們"]);
  });

  it("次數是我們數的（出現在幾篇），依次數排序", () => {
    expect(verifiedPhrases(["順順的～", "嗨茶友們"], samples)).toEqual([
      { text: "嗨茶友們", count: 3 },
      { text: "順順的～", count: 2 },
    ]);
  });

  it("只出現在一篇的不是習慣", () => {
    expect(verifiedPhrases(["母親節快到了"], samples)).toEqual([]);
  });

  it("含價格／日期這類數字的不收，太短或整句照抄的也不收", () => {
    expect(verifiedPhrases(["499 元", "嗨", "嗨茶友們，今天來聊冷泡。喝起來順順的～"], samples)).toEqual([]);
  });

  it("原文有空白或換行、模型回的沒有，照樣對得上；重複的只算一次", () => {
    expect(verifiedPhrases(["嗨 茶友們", "嗨茶友們"], samples)).toHaveLength(1);
  });
});

describe("parseVoiceProfile", () => {
  it("解析出語氣、結構，常用詞經過驗證", () => {
    const p = parseVoiceProfile(
      `{"tone":"像店長對熟客說話","structure":"招呼→一件事→輕收尾","phrases":["嗨茶友們","不存在的詞"]}`,
      ["嗨茶友們，早安", "嗨茶友們，晚安"],
    );
    expect(p).toEqual({ tone: "像店長對熟客說話", structure: "招呼→一件事→輕收尾", phrases: [{ text: "嗨茶友們", count: 2 }] });
  });

  it("不是 JSON 或兩格都空＝null（這一類不顯示語氣，不擋流程）", () => {
    expect(parseVoiceProfile("我覺得語氣很溫暖", [])).toBeNull();
    expect(parseVoiceProfile(`{"tone":"","structure":""}`, [])).toBeNull();
  });

  it("太長的語氣會截短", () => {
    const p = parseVoiceProfile(JSON.stringify({ tone: "長".repeat(300), structure: "x" }), []);
    expect([...p!.tone].length).toBeLessThanOrEqual(90);
  });
});

describe("pickTrialTopic —— 用品牌自己的產品當題目", () => {
  const product = voiceCategory("product")!;
  const chat = voiceCategory("chat")!;

  it("有產品就用產品，而且各類輪流取不同支", () => {
    expect(pickTrialTopic(product, "山茶", ["冷泡烏龍", "蜜香紅茶"], 0)).toContain("冷泡烏龍");
    expect(pickTrialTopic(chat, "山茶", ["冷泡烏龍", "蜜香紅茶"], 1)).toContain("蜜香紅茶");
  });

  it("沒有產品就用帶品牌名的通用題目", () => {
    expect(pickTrialTopic(product, "山茶", [], 0)).toContain("山茶");
    expect(pickTrialTopic(product, "山茶", [], 0)).not.toContain("{brand}");
  });
});

describe("寫進品牌口吻的那一段", () => {
  const measured = { count: 3, minChars: 120, maxChars: 380, medianChars: 240 };
  const block = buildVoiceBlock([
    { category: "product", measured, profile: { tone: "像店長對熟客", structure: "招呼→重點→收尾", phrases: [{ text: "嗨茶友們", count: 3 }] } },
    { category: "chat", measured, profile: null },
  ]);

  it("每類一行：篇數、字數區間、語氣、結構、常用詞；沒有語氣資料的只寫字數", () => {
    expect(block.startsWith(VOICE_BLOCK_START)).toBe(true);
    expect(block.endsWith(VOICE_BLOCK_END)).toBe(true);
    expect(block).toContain("・產品介紹（依 3 篇）｜120–380 字；語氣：像店長對熟客；結構：招呼→重點→收尾；常用詞：嗨茶友們");
    expect(block).toContain("・互動閒聊（依 3 篇）｜120–380 字");
  });

  it("沒有任何一類＝空字串", () => {
    expect(buildVoiceBlock([])).toBe("");
  });

  it("原本是空的：直接放進去", () => {
    expect(mergeVoiceText("", block)).toBe(block);
  });

  it("使用者自己寫的內容保留，我們那段接在後面", () => {
    expect(mergeVoiceText("我們說話不用敬語。", block)).toBe(`我們說話不用敬語。\n\n${block}`);
  });

  it("重跑只換掉自己那一段，前後使用者寫的都不動", () => {
    const old = buildVoiceBlock([{ category: "story", measured, profile: null }]);
    const merged = mergeVoiceText(`前面的話。\n\n${old}\n\n後面的話。`, block);
    expect(merged).toContain("前面的話。");
    expect(merged).toContain("後面的話。");
    expect(merged).not.toContain("品牌故事");
    expect(merged.split(VOICE_BLOCK_START)).toHaveLength(2);
  });
});

describe("額度", () => {
  it("從參考文章學來的卡不佔自建卡額度，其他卡照算", () => {
    expect(countsTowardCardQuota({ origin: "voice" })).toBe(false);
    expect(countsTowardCardQuota({})).toBe(true);
  });
});

describe("withBrandLock —— 同一個品牌的讀改寫排隊做", () => {
  it("五張卡同時寫回，不會互相蓋掉", async () => {
    let stored: string[] = [];
    const write = (id: string) => withBrandLock(1, async () => {
      const read = [...stored];
      await new Promise((r) => setTimeout(r, 5));
      stored = [...read, id];
    });
    await Promise.all(["a", "b", "c", "d", "e"].map(write));
    expect(stored).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("前一個失敗不會卡住後面的", async () => {
    const bad = withBrandLock(2, async () => { throw new Error("boom"); });
    const good = withBrandLock(2, async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
  });

  it("不同品牌互不等待", async () => {
    const order: string[] = [];
    const slow = withBrandLock(3, async () => { await new Promise((r) => setTimeout(r, 20)); order.push("slow"); });
    const fast = withBrandLock(4, async () => { order.push("fast"); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["fast", "slow"]);
  });
});
