/**
 * 自建任務卡：id 規則、範例量測、以及「卡 → template + config」的形狀。
 *
 * 這三件事錯了的症狀都不明顯：id 規則錯 → 卡在 regenerateVariant 那條路解析不到
 * （其他入口都好，只有「換人重寫」壞）；量測錯 → caption 驗證一直重試最後回空白；
 * template 形狀錯 → 任務跑得起來但 mockup 或 recordTaskRun 默默降級。
 */
import { describe, expect, it } from "vitest";
import {
  brandIdOfCardId, slugifyCardName, measureSamples,
  cardTemplate, cardConfig, illustrationInFlight, factLeaks, redactFactLeaks, verbatimSamples, type BrandTaskCard,
} from "./brandTaskCards";

function makeCard(over: Partial<BrandTaskCard> = {}): BrandTaskCard {
  const samples = ["a".repeat(300), "b".repeat(400), "c".repeat(500)];
  return {
    id: "u2976-promo", brandId: 2976, name: "促購文", channel: "facebook",
    status: "ready", currentStep: 3, totalSteps: 3, lastError: null,
    samples,
    primaryQuestion: "這次要促銷哪個商品？",
    primaryPlaceholder: "例：冬季限定熱可可",
    askFields: [{ key: "promo_ends", label: "優惠截止日", type: "text", required: true, placeholder: "" }],
    skill: "規則一：開場不用問句。".repeat(20),
    measured: measureSamples(samples),
    variants: 3, agentId: null,
    createdAt: "", updatedAt: "", createdBy: 1, lastDryRun: null,
    ...over,
  };
}

describe("卡 id 帶 brandId（regenerateVariant 拿不到 brandId，只能從 id 剖）", () => {
  it("剖得出 brandId", () => {
    expect(brandIdOfCardId("u2976-promo")).toBe(2976);
    expect(brandIdOfCardId("u1-a")).toBe(1);
    expect(brandIdOfCardId("u2976-promo-wen-2")).toBe(2976);
  });

  it("不是自建卡的 id 一律回 null —— 免得每次解析內建卡都白查一次 DB", () => {
    for (const id of [
      "fb-30-caption-short", "wg-cal-eco", "u-promo", "u0-promo",
      "U2976-promo", "u2976_promo", "u2976-", "", "u2976-Promo",
    ]) {
      expect(brandIdOfCardId(id), id).toBeNull();
    }
  });

  it("中文卡名取不出 ascii 時退回時間戳，不會產生空 slug", () => {
    expect(slugifyCardName("促購文")).toMatch(/^card-[a-z0-9]+$/);
    expect(slugifyCardName("Promo Post")).toBe("promo-post");
    expect(slugifyCardName("  --Promo!!--  ")).toBe("promo");
    // 空 slug 會讓 id 變成 "u2976-"，那個過不了 CARD_ID_RE
    expect(brandIdOfCardId(`u2976-${slugifyCardName("促購文")}`)).toBe(2976);
  });
});

describe("字數區間從範例量出來", () => {
  it("用中位數當基準，上下限各留兩成餘裕", () => {
    const m = measureSamples(["x".repeat(100), "x".repeat(200), "x".repeat(300)]);
    expect(m.count).toBe(3);
    expect(m.medianChars).toBe(200);
    expect(m.minChars).toBe(80);    // 100 * 0.8
    expect(m.maxChars).toBe(360);   // 300 * 1.2
  });

  it("一篇特別長的不會把中位數拉走（所以不用平均）", () => {
    const m = measureSamples([
      "x".repeat(300), "x".repeat(310), "x".repeat(320), "x".repeat(330), "x".repeat(5000),
    ]);
    expect(m.medianChars).toBe(320);
  });

  it("下限有地板 —— 免得一篇 20 字的範例把下限壓到 16，caption 驗證會一直過不了", () => {
    expect(measureSamples(["x".repeat(20)]).minChars).toBe(40);
  });

  it("空輸入不會炸", () => {
    expect(measureSamples([])).toEqual({ count: 0, minChars: 0, maxChars: 0, medianChars: 0 });
    expect(measureSamples(["", "   "])).toEqual({ count: 0, minChars: 0, maxChars: 0, medianChars: 0 });
  });
});

describe("卡 → template", () => {
  it("主問題永遠是 topic，額外欄位接在後面", () => {
    const t = cardTemplate(makeCard());
    expect(t.primary_input?.key).toBe("topic");
    expect(t.inputs.map((f) => f.key)).toEqual(["topic", "promo_ends"]);
  });

  it("systemPrompt 就是 SKILL 本文", () => {
    const card = makeCard({ skill: "這是我的規則" });
    expect(cardTemplate(card).systemPrompt).toBe("這是我的規則");
  });

  it("官網卡用 platform:\"doc\" —— mission_outputs 的 enum 沒有 \"web\"，會被默默降級成 other", () => {
    expect(cardTemplate(makeCard({ channel: "website" })).outputDefaults.platform).toBe("doc");
    expect(cardTemplate(makeCard({ channel: "pr" })).outputDefaults.platform).toBe("press");
    expect(cardTemplate(makeCard({ channel: "facebook" })).outputDefaults.platform).toBe("facebook");
  });

  it("maxTokens 跟著中位數走，且有下限（短範例不能把它壓到寫不完）", () => {
    expect(cardTemplate(makeCard()).maxTokens).toBeGreaterThanOrEqual(700);
    const long = makeCard({ measured: measureSamples(["x".repeat(3000)]) });
    expect(cardTemplate(long).maxTokens).toBeGreaterThan(cardTemplate(makeCard()).maxTokens);
    expect(cardTemplate(long).maxTokens).toBeLessThanOrEqual(8000);
  });
});

describe("卡片插畫場景", () => {
  it("用戶選過的場景跟著 template 送到前端；沒選就不帶（前端自動挑）", () => {
    expect(cardTemplate(makeCard({ scene: "gift" })).scene).toBe("gift");
    expect(cardTemplate(makeCard()).scene).toBeUndefined();
    expect(cardTemplate(makeCard({ scene: null })).scene).toBeUndefined();
  });

  it("AI 插畫畫好才送到前端，畫到一半或失敗都不送", () => {
    const url = "/static/covers/taskcard-u1-x.webp";
    expect(cardTemplate(makeCard({ illustrationUrl: url, illustrationStatus: "ready" })).illustration_url).toBe(url);
    expect(cardTemplate(makeCard({ illustrationUrl: url, illustrationStatus: "generating" })).illustration_url).toBeUndefined();
    expect(cardTemplate(makeCard({ illustrationUrl: url, illustrationStatus: "failed" })).illustration_url).toBeUndefined();
  });

  it("伺服器重啟留下的 generating 超過 5 分鐘就不算在畫", () => {
    const now = Date.parse("2026-09-30T10:00:00Z");
    expect(illustrationInFlight({ illustrationStatus: "generating", illustrationStartedAt: "2026-09-30T09:58:00Z" }, now)).toBe(true);
    expect(illustrationInFlight({ illustrationStatus: "generating", illustrationStartedAt: "2026-09-30T09:50:00Z" }, now)).toBe(false);
    expect(illustrationInFlight({ illustrationStatus: "generating", illustrationStartedAt: null }, now)).toBe(false);
    expect(illustrationInFlight({ illustrationStatus: "ready", illustrationStartedAt: "2026-09-30T09:59:00Z" }, now)).toBe(false);
  });
});

describe("卡 → config", () => {
  it("variants 收在 1–5，labels 數量對得上", () => {
    expect(cardConfig(makeCard({ variants: 3 })).variants).toBe(3);
    expect(cardConfig(makeCard({ variants: 3 })).variantLabels).toHaveLength(3);
    expect(cardConfig(makeCard({ variants: 99 as any })).variants).toBe(5);
    expect(cardConfig(makeCard({ variants: 0 as any })).variants).toBe(1);
  });

  it("不生圖 —— 自建卡目前只管文字，開了圖會拖到 30 秒體感又沒有 image director", () => {
    const c = cardConfig(makeCard());
    expect(c.runImageGen).toBe(false);
    expect(c.images).toBe(0);
  });

  it("字數區間直接帶進 config，變成 caption 的驗收標準", () => {
    const card = makeCard();
    const c = cardConfig(card);
    expect(c.captionMinChars).toBe(card.measured.minChars);
    expect(c.captionMaxChars).toBe(card.measured.maxChars);
  });
});

describe("SKILL 不可以帶著範例的具體數字", () => {
  // 2026-09-04 dev 實測：prompt 已經明文禁止，模型還是把三個價格抄進規則。
  // 後果是使用者下次拿這張卡寫薑茶，文案裡冒出熱可可的定價。
  const samples = [
    "冷氣團來了，兩盒 499。",
    "經典款這週補貨，一盒 279。",
    "六盒組 1499，限量 40 組。",
  ];
  const own = [75, 126, 97, 3];   // 我們自己放進 prompt 的字數區間

  it("抓得出洩漏的價格", () => {
    const skill = "規則三：價格寫成「兩盒 499」這種格式，一盒 279 時省略單位。";
    expect(factLeaks(skill, samples, own)).toEqual(expect.arrayContaining(["499", "279"]));
  });

  it("我們自己放進 prompt 的字數區間不算洩漏", () => {
    const skill = "全文控制在 75–126 字，中位數 97 字附近最佳，共 3 段。";
    expect(factLeaks(skill, samples, own)).toEqual([]);
  });

  it("邊界比對：499 不會命中 1499", () => {
    expect(factLeaks("限量組是 1499 元", samples, own)).toEqual(["1499"]);
    expect(factLeaks("兩盒 499", samples, own)).toEqual(["499"]);
  });

  it("乾淨的 SKILL 沒有偽報", () => {
    const skill = "規則一：開場不用問句。規則二：每段不超過三句。規則三：價格一律引用當次輸入。";
    expect(factLeaks(skill, samples, own)).toEqual([]);
  });

  it("一位數不算 —— 「最多 3 句」是規則本身在講數量", () => {
    expect(factLeaks("每段最多 3 句，分 2 段", ["有 3 個重點", "共 2 段"], [])).toEqual([]);
  });

  it("修補換成占位而不是刪掉 —— 刪整句會把規則語意弄破", () => {
    const skill = "價格寫成「兩盒 499」，六盒組 1499。";
    const fixed = redactFactLeaks(skill, factLeaks(skill, samples, own));
    expect(fixed).not.toMatch(/499|1499/);
    expect(fixed).toContain("（依當次輸入）");
    expect(fixed).toContain("兩盒");   // 語意還在
  });

  it("相鄰的占位會被收成一個（中間夾空白或頓號也算）", () => {
    expect(redactFactLeaks("價格 499 279 都可以", ["499", "279"]))
      .toBe("價格 （依當次輸入） 都可以");
    expect(redactFactLeaks("價格 499、279 都可以", ["499", "279"]))
      .toBe("價格 （依當次輸入） 都可以");
  });

  it("長的數字先換 —— 否則換掉 499 會把 1499 打成「1（依當次輸入）」", () => {
    expect(redactFactLeaks("六盒組 1499", ["499", "1499"])).toBe("六盒組 （依當次輸入）");
  });

  it("修補完再驗一次應該乾淨", () => {
    const skill = "兩盒 499、一盒 279、六盒 1499。";
    const fixed = redactFactLeaks(skill, factLeaks(skill, samples, own));
    expect(factLeaks(fixed, samples, own)).toEqual([]);
  });
});

describe("從對話串抽出來的樣本必須逐字出自原文", () => {
  // 模型很愛順手把成品「整理得更好」再交出來。那樣抽到的就不是使用者真的發過的
  // 文，而這張卡的全部價值就建立在「學你真的寫過的東西」。
  const thread = `我：幫我寫三篇促購文
AI：好的，我寫了三個版本給你參考。

版本一：
冷氣團來了。冰箱最上層那排熱可可，是我們去年冬天賣得最好的東西。

版本二：
有人問我們為什麼不做無糖版。因為甜度砍掉之後可可的厚度就不見了。

我：第二篇太短
AI：我幫你加長：
有人問我們為什麼不做無糖版。因為甜度砍掉之後可可的厚度就不見了，喝起來像在喝溫水。`;

  it("原文有的留下來", () => {
    const got = verbatimSamples([
      "冷氣團來了。冰箱最上層那排熱可可，是我們去年冬天賣得最好的東西。",
    ], thread);
    expect(got).toHaveLength(1);
  });

  it("模型改寫過的丟掉 —— 換一個字就對不上", () => {
    expect(verbatimSamples([
      "冷氣團來了。冰箱最上層那排熱可可，是我們去年冬天賣最好的商品。",
    ], thread)).toEqual([]);
  });

  it("空白與 Markdown 記號的差異不算改寫（從網頁複製常會不一致）", () => {
    expect(verbatimSamples([
      "**冷氣團來了。**  冰箱最上層那排熱可可，是我們去年冬天賣得最好的東西。",
    ], thread)).toHaveLength(1);
  });

  it("同一篇改了三版、內容一樣的只留一份", () => {
    const one = "有人問我們為什麼不做無糖版。因為甜度砍掉之後可可的厚度就不見了。";
    expect(verbatimSamples([one, one, ` ${one} `], thread)).toHaveLength(1);
  });

  it("太短的丟掉 —— 學不到東西", () => {
    expect(verbatimSamples(["好的", "我："], thread)).toEqual([]);
  });

  it("完全沒抽到也不會炸", () => {
    expect(verbatimSamples([], thread)).toEqual([]);
    expect(verbatimSamples([null as any, undefined as any, 123 as any], thread)).toEqual([]);
  });
});
