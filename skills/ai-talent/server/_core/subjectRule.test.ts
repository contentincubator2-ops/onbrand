import { describe, it, expect } from "vitest";
import { buildSubjectRule, hasUserSuppliedTopic } from "./quickTaskOrchestra";

/**
 * 2026-09-18：CJ 回報 LINE 產出完全忽略他給的主題，兩次都重現。
 * 根因是「主題優先序」規則只在抓到 URL 時才存在，打字輸入主題時完全沒有東西
 * 對抗品牌區塊的「最高優先級，所有產出都要符合」。
 */

describe("hasUserSuppliedTopic", () => {
  it("使用者真的寫了東西", () => {
    expect(hasUserSuppliedTopic("[topic] 中秋節怎麼跟孩子過")).toBe(true);
  });

  it("沒有輸入的哨兵字串不算", () => {
    expect(hasUserSuppliedTopic("(no extra inputs)")).toBe(false);
  });

  it("空白與 undefined 不算", () => {
    expect(hasUserSuppliedTopic("")).toBe(false);
    expect(hasUserSuppliedTopic("   ")).toBe(false);
    expect(hasUserSuppliedTopic(null)).toBe(false);
    expect(hasUserSuppliedTopic(undefined)).toBe(false);
  });

  it("只有欄位標籤沒有內容，等同沒給主題", () => {
    // userMsg 的形狀是 "[key] value"。使用者送出空欄位時會變成只剩標籤，
    // 那時加上「必須呼應使用者寫的內容」只會讓模型去呼應一個空字串。
    expect(hasUserSuppliedTopic("[topic] ")).toBe(false);
    expect(hasUserSuppliedTopic("[topic] \n[context] ")).toBe(false);
  });
});

describe("buildSubjectRule", () => {
  const TOPIC = "[topic] 神探哈奇奇新一集上線，講消失的生日蛋糕之謎";

  it("使用者打字給主題時，現在會產生主題優先序規則（這就是這次的修復）", () => {
    const r = buildSubjectRule({ hasUrl: false, userMsg: TOPIC });
    expect(r).not.toBe("");
    expect(r).toContain("主題優先序");
    expect(r).toContain("品牌不是主題");
  });

  it("明確劃清「鎖定屬性」管的是怎麼講而不是講什麼", () => {
    // 不弱化品牌鎖定本身 —— 它撐著禁用詞與 tagline 合規。只劃清範圍。
    const r = buildSubjectRule({ hasUrl: false, userMsg: TOPIC });
    expect(r).toContain("怎麼講");
    expect(r).toContain("講什麼");
  });

  it("擋掉「改寫成品牌通用介紹文」這個實際發生的失敗樣態", () => {
    const r = buildSubjectRule({ hasUrl: false, userMsg: TOPIC });
    expect(r).toMatch(/通用介紹文|品牌價值宣傳/);
  });

  it("沒有主題也沒有 URL 時保持空字串 —— 不對著空氣下規則", () => {
    expect(buildSubjectRule({ hasUrl: false, userMsg: "(no extra inputs)" })).toBe("");
    expect(buildSubjectRule({ hasUrl: false, userMsg: "" })).toBe("");
  });

  it("URL 版的措辭原封不動保留", () => {
    // URL 那一半 2026-05-06 就修好了而且在線上跑了四個月，不該被這次改動波及。
    const r = buildSubjectRule({ hasUrl: true, userMsg: TOPIC });
    expect(r).toContain("上面 URL 抓到的內容");
    expect(r).toContain("不要硬扯品牌");
  });

  it("URL 優先於打字主題 —— 兩者都有時以 URL 為主題來源", () => {
    const r = buildSubjectRule({ hasUrl: true, userMsg: TOPIC });
    expect(r).toContain("URL");
    expect(r).not.toContain("user message 裡使用者寫的內容");
  });

  it("配圖 brief 拿到的是短版，而且同樣不准畫成品牌主商品", () => {
    const noUrl = buildSubjectRule({ hasUrl: false, userMsg: TOPIC, visual: true });
    expect(noUrl).toContain("視覺主題");
    expect(noUrl).toContain("不是品牌主商品");
    // 短版就是短 —— 配圖 agent 的 prompt 不該被一整段文案規則灌爆
    expect(noUrl.length).toBeLessThan(120);

    const withUrl = buildSubjectRule({ hasUrl: true, userMsg: TOPIC, visual: true });
    expect(withUrl).toContain("URL");
  });

  it("配圖版在沒有主題時同樣保持空字串", () => {
    expect(buildSubjectRule({ hasUrl: false, userMsg: "", visual: true })).toBe("");
  });
});
