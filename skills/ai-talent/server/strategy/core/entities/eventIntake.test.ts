import { describe, it, expect } from "vitest";
import { cleanLinks, readEventIntake, INTAKE_LINKS_MAX } from "./eventIntake";

describe("cleanLinks", () => {
  it("收陣列或一段文字，只留 http(s)，去重複", () => {
    expect(cleanLinks(["https://a.com/x", "https://a.com/x", "javascript:alert(1)", "ftp://a.com"]))
      .toEqual(["https://a.com/x"]);
    expect(cleanLinks("https://a.com/x\nhttps://b.com，https://c.com")).toEqual([
      "https://a.com/x", "https://b.com/", "https://c.com/",
    ]);
  });
  it("沒帶 https:// 的網域會補上；不是網址的字不收", () => {
    expect(cleanLinks(["www.shop.com/mid-autumn", "中秋活動頁", "localhost"])).toEqual(["https://www.shop.com/mid-autumn"]);
  });
  it("有上限", () => {
    const many = Array.from({ length: 9 }, (_, i) => `https://a.com/${i}`);
    expect(cleanLinks(many)).toHaveLength(INTAKE_LINKS_MAX);
    expect(cleanLinks(many, 2)).toHaveLength(2);
  });
  it("壞資料回空陣列", () => {
    expect(cleanLinks(null)).toEqual([]);
    expect(cleanLinks({ a: 1 })).toEqual([]);
  });
});

describe("readEventIntake", () => {
  it("讀最上層的 targetAudience，空白收成一格", () => {
    expect(readEventIntake({ targetAudience: "  30–40 歲\n送禮上班族 " })).toEqual({ audience: "30–40 歲 送禮上班族" });
  });
  it("沒寫就是空的；截到 300 字；不是字串不收", () => {
    expect(readEventIntake(null)).toEqual({ audience: "" });
    expect(readEventIntake({ targetAudience: "字".repeat(999) }).audience).toHaveLength(300);
    expect(readEventIntake({ targetAudience: 123 }).audience).toBe("");
  });
});
