import { describe, expect, it } from "vitest";
import {
  AEO_QUESTION_MAX, cleanPublishedUrl, cleanQuestion, coverageOf, parseSuggestedQuestions, questionKey,
  statusOf, suggestPrompt,
} from "./aeoQuestions";

describe("狀態與覆蓋率", () => {
  it("沒有回答＝還沒回答；有回答＝已產出；標了上架才是已上架", () => {
    expect(statusOf({ answerOutputId: null, publishedAt: null })).toBe("open");
    expect(statusOf({ answerOutputId: 12, publishedAt: null })).toBe("answered");
    expect(statusOf({ answerOutputId: 12, publishedAt: "2026-10-10T00:00:00Z" })).toBe("published");
    // 沒有回答卻有上架時間（不該發生）：不能算上架
    expect(statusOf({ answerOutputId: null, publishedAt: "2026-10-10T00:00:00Z" })).toBe("open");
  });

  it("已產出含已上架的；產出不等於上架", () => {
    const rows = [
      { answerOutputId: null, publishedAt: null },
      { answerOutputId: 1, publishedAt: null },
      { answerOutputId: 2, publishedAt: "2026-10-10T00:00:00Z" },
    ];
    expect(coverageOf(rows)).toEqual({ total: 3, answered: 2, published: 1 });
    expect(coverageOf([])).toEqual({ total: 0, answered: 0, published: 0 });
  });
});

describe("cleanQuestion", () => {
  it("去編號、去引號、補問號", () => {
    expect(cleanQuestion("3. 擴香可以用多久")).toBe("擴香可以用多久？");
    expect(cleanQuestion("・「敏感肌可以用嗎？」")).toBe("敏感肌可以用嗎？");
    expect(cleanQuestion("Q2: 怎麼選尺寸。")).toBe("怎麼選尺寸？");
    expect(cleanQuestion("   ")).toBe("");
  });

  it("太長就截到上限，仍以問號結尾", () => {
    const q = cleanQuestion("字".repeat(100));
    expect([...q].length).toBe(AEO_QUESTION_MAX);
    expect(q.endsWith("？")).toBe(true);
  });
});

describe("questionKey", () => {
  it("標點、空白、全半形問號、大小寫不同都算同一題", () => {
    expect(questionKey("SoWork 是什麼？")).toBe(questionKey("sowork是什麼?"));
    expect(questionKey("擴香，可以用多久？")).toBe(questionKey("擴香可以用多久"));
    expect(questionKey("擴香可以用多久")).not.toBe(questionKey("擴香可以放多久"));
  });
});

describe("parseSuggestedQuestions", () => {
  it("一行一題；跳過現有的、重複的、太短的雜訊", () => {
    const raw = "常見問題\n1. 擴香瓶放臥室安全嗎？\n2. 擴香瓶放臥室安全嗎\n- 雪松擴香可以用多久？\n\n3. 怎麼挑適合小坪數的擴香？";
    expect(parseSuggestedQuestions(raw, ["雪松擴香可以用多久?"])).toEqual([
      "擴香瓶放臥室安全嗎？", "怎麼挑適合小坪數的擴香？",
    ]);
  });

  it("最多給到上限", () => {
    const raw = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 個顧客會問的問題是什麼？`).join("\n");
    expect(parseSuggestedQuestions(raw, [], 5)).toHaveLength(5);
  });
});

describe("suggestPrompt", () => {
  it("帶品牌名、要求一半不帶品牌名、列出不要重複的題目", () => {
    const p = suggestPrompt({ brandName: "禾木香氛", existing: ["擴香可以用多久？"] });
    expect(p).toContain("「禾木香氛」");
    expect(p).toContain("至少一半是不帶品牌名的品類問題");
    expect(p).toContain("- 擴香可以用多久？");
  });
});

describe("cleanPublishedUrl", () => {
  it("只收 http(s)，沒寫協定補 https", () => {
    expect(cleanPublishedUrl("example.com/faq")).toBe("https://example.com/faq");
    expect(cleanPublishedUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(cleanPublishedUrl("javascript:alert(1)")).toBeNull();
    expect(cleanPublishedUrl("  ")).toBeNull();
    expect(cleanPublishedUrl(null)).toBeNull();
  });
});
