/**
 * 資料來源研究：網址只能來自搜尋結果。模型只能用編號挑，編不出網址。
 */
import { describe, expect, it } from "vitest";
import { dedupeHits, pickReferences, hostOf, cleanHttpUrl, MAX_REFERENCES, type RawHit } from "./cardResearch";

const hits: RawHit[] = [
  { title: "A", url: "https://www.example.com/a", content: "內文 A" },
  { title: "B", url: "https://news.site.tw/b", content: "內文 B" },
  { title: "C", url: "https://blog.org/c", content: "內文 C" },
];

describe("pickReferences", () => {
  it("網址取自搜尋結果，不看模型寫了什麼", () => {
    const raw = JSON.stringify({ picks: [{ n: 2, takeaway: "這個來源談到開場要用小故事。", url: "https://fake.example/evil" }] });
    const out = pickReferences(raw, hits, "T");
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://news.site.tw/b");
    expect(out[0]!.host).toBe("news.site.tw");
  });

  it("不存在的編號、重複編號、沒有要點的都丟掉", () => {
    const raw = JSON.stringify({ picks: [
      { n: 9, takeaway: "編號不存在的來源重點" },
      { n: 1, takeaway: "第一次選到的合法來源重點" },
      { n: 1, takeaway: "重複選同一筆來源的重點" },
      { n: 3, takeaway: "短" },
    ] });
    expect(pickReferences(raw, hits).map((r) => r.url)).toEqual(["https://www.example.com/a"]);
  });

  it("壞掉的 JSON 回空陣列，不炸", () => {
    expect(pickReferences("我找不到", hits)).toEqual([]);
    expect(pickReferences('{"picks":', hits)).toEqual([]);
  });

  it("數量有上限", () => {
    const many: RawHit[] = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, url: `https://s${i}.com/x`, content: "c" }));
    const raw = JSON.stringify({ picks: many.map((_, i) => ({ n: i + 1, takeaway: "這是一個夠長的重點說明" })) });
    expect(pickReferences(raw, many)).toHaveLength(MAX_REFERENCES);
  });
});

describe("dedupeHits / url 清理", () => {
  it("同網址（忽略 hash 與結尾斜線）只留一筆，非 http 網址丟掉", () => {
    const out = dedupeHits([
      { title: "x", url: "https://a.com/p/", content: "" },
      { title: "y", url: "https://a.com/p#top", content: "" },
      { title: "z", url: "javascript:alert(1)", content: "" },
      { title: "w", url: "not a url", content: "" },
    ]);
    expect(out).toHaveLength(1);
  });
  it("hostOf 去掉 www", () => {
    expect(hostOf("https://www.a.com/x")).toBe("a.com");
    expect(cleanHttpUrl("ftp://a.com")).toBeNull();
  });
});
