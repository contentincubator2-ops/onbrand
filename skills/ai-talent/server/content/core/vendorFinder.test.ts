/**
 * 找合作對象：網址只能來自搜尋結果（不編造），沒有出處的廠商丟掉。
 */
import { describe, it, expect } from "vitest";
import { validateVendors, defaultVendorQuery, vendorKindFor, type SearchResult } from "./vendorFinder";

const results: SearchResult[] = [
  { title: "網紅經紀推薦 10 家", url: "https://blog.example.com/top-kol-agencies", content: "A 公司 https://www.a-agency.com.tw …" },
  { title: "A 經紀｜關於我們", url: "https://www.a-agency.com.tw/about", content: "…" },
  { title: "A 經紀｜聯絡我們", url: "https://www.a-agency.com.tw/contact", content: "…" },
  { title: "B 行銷", url: "https://b-mkt.tw/", content: "…" },
];

describe("validateVendors", () => {
  it("官網網域要在搜尋結果裡、聯絡頁與出處要逐字是搜尋結果的網址", () => {
    const v = validateVendors({ vendors: [
      { name: "A 經紀", what: "網紅經紀", why: "親子類多", website: "https://a-agency.com.tw", contactUrl: "https://www.a-agency.com.tw/contact", sources: ["https://www.a-agency.com.tw/about"] },
      { name: "編出來的", website: "https://fake.com", sources: ["https://fake.com/x"] },
      { name: "B 行銷", website: "https://hallucinated.io", contactUrl: "https://b-mkt.tw/contact-us", sources: ["https://b-mkt.tw/", "https://not-in-results.com"] },
    ] }, results);
    expect(v.map((x) => x.name)).toEqual(["A 經紀", "B 行銷"]);
    expect(v[0]).toMatchObject({ website: "https://a-agency.com.tw", contactUrl: "https://www.a-agency.com.tw/contact" });
    expect(v[1]).toMatchObject({ website: null, contactUrl: null, sources: ["https://b-mkt.tw/"] });
  });
  it("同一個官網只留一筆；最多 8 筆；壞資料不炸", () => {
    const dup = Array.from({ length: 12 }, (_, i) => ({ name: `X${i}`, website: "https://b-mkt.tw/", sources: ["https://b-mkt.tw/"] }));
    expect(validateVendors({ vendors: dup }, results)).toHaveLength(1);
    expect(validateVendors(null, results)).toEqual([]);
    expect(validateVendors({ vendors: "x" }, results)).toEqual([]);
  });
});

describe("要找哪種廠商、預設搜什麼", () => {
  it("網紅卡→網紅經紀；異業合作卡→夥伴；標了廣告→廣告代理；其他不顯示", () => {
    expect(vendorKindFor("kl-30-influencer-brief", false)).toBe("kol_agency");
    expect(vendorKindFor("cb-30-pitch-letter", false)).toBe("cobrand_partner");
    expect(vendorKindFor("fb-30-caption-short", true)).toBe("ad_agency");
    expect(vendorKindFor("fb-30-caption-short", false)).toBeNull();
  });
  it("網紅：帶市場、說明單裡的類型與平台", () => {
    expect(defaultVendorQuery("kol_agency", { country: "TW", industry: "行銷顧問", kolTypes: ["親子", "美妝"], platforms: ["IG"] }))
      .toBe("台灣 親子 美妝 IG 網紅經紀公司 網紅行銷");
    expect(defaultVendorQuery("ad_agency", { country: "TW", industry: "保健食品" })).toBe("台灣 保健食品 數位廣告代理商 Meta 廣告 代操");
  });
});
