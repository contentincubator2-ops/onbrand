import { describe, expect, it } from "vitest";
import { readProductFacts, hasAnyProductFact } from "./productFacts";
import { PRODUCT_SEGMENTS } from "./positioningSchema";

// 2026-09-25（CJ「將產品定位中，增加價格/規格／重量／份數 還有網址」）：
// 這一段的風險全在「同一個東西有兩個存放位置」——canonical 的 facts.*，以及
// intake／官網掃描今天仍在寫的頂層 price / productUrl。讀錯邊，畫面就會空白，
// 使用者會以為自己填的東西不見了。
describe("readProductFacts", () => {
  it("canonical 位置讀得到五格", () => {
    const f = readProductFacts({
      facts: { price: "NT$560", spec: "2 片裝", weight: "300g", servings: "2–3 人份", url: "https://x.tw/p/1" },
    });
    expect(f).toEqual({ price: "NT$560", spec: "2 片裝", weight: "300g", servings: "2–3 人份", url: "https://x.tw/p/1" });
  });

  it("舊位置（頂層 price / productUrl）也讀得到——這就是原本看不到售價的那條路", () => {
    const f = readProductFacts({ price: "NT$560", productUrl: "https://x.tw/p/1" });
    expect(f.price).toBe("NT$560");
    expect(f.url).toBe("https://x.tw/p/1");
  });

  it("兩邊都有值時 canonical 贏（使用者自己填的才是最新的）", () => {
    const f = readProductFacts({ price: "NT$399", facts: { price: "NT$560" } });
    expect(f.price).toBe("NT$560");
  });

  it("字串 JSON、壞掉的 JSON、null 都不會爆", () => {
    expect(readProductFacts(JSON.stringify({ facts: { weight: "300g" } })).weight).toBe("300g");
    expect(readProductFacts("{壞掉").price).toBe("");
    expect(readProductFacts(null).price).toBe("");
  });

  it("空白字串不算填過", () => {
    expect(hasAnyProductFact({ facts: { price: "   " } })).toBe(false);
    expect(hasAnyProductFact({ facts: { price: "NT$1" } })).toBe(true);
    expect(hasAnyProductFact({})).toBe(false);
  });
});

describe("商品事實這一段的設定", () => {
  const facts = PRODUCT_SEGMENTS.find((s) => s.id === "facts");

  it("存在，而且排在最前面", () => {
    expect(facts).toBeTruthy();
    expect(PRODUCT_SEGMENTS[0]!.id).toBe("facts");
  });

  it("標記為只由使用者填寫 —— AI 代填會編出假售價", () => {
    expect(facts!.userOnly).toBe(true);
    // 其餘六段仍然是 AI 可以幫忙的
    for (const seg of PRODUCT_SEGMENTS.filter((s) => s.id !== "facts")) {
      expect(seg.userOnly, seg.id).toBeFalsy();
    }
  });

  it("五格欄位的 key 跟讀取端對得起來", () => {
    expect(facts!.fields.map((f) => f.key)).toEqual(["price", "spec", "weight", "servings", "url"]);
    const read = readProductFacts({ facts: Object.fromEntries(facts!.fields.map((f) => [f.key, `v-${f.key}`])) });
    expect(Object.values(read).every((v) => v.startsWith("v-"))).toBe(true);
  });

  it("編號不跟既有六段相撞（加一段不重編既有編號）", () => {
    const nums = PRODUCT_SEGMENTS.map((s) => s.num);
    expect(new Set(nums).size).toBe(nums.length);
    expect(facts!.num).toBe("1.0");
  });
});
