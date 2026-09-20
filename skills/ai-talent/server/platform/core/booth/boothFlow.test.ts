/**
 * 展場流程裡不碰資料庫也不碰模型的那幾件事。
 *
 * 網址正規化值得鎖起來：訪客在手機上打字，給的會是 "gopro.com"、
 * "GoPro.com/" 或整串帶 utm 的連結，而爬蟲吃不吃得到就看這一步。
 */
import { describe, expect, it } from "vitest";
import { BOOTH_PRODUCT_CAP, BoothError, __test } from "./boothFlow";

const { normaliseWebsite, slugify } = __test;

describe("normaliseWebsite", () => {
  it("adds a scheme to what people actually type", () => {
    expect(normaliseWebsite("gopro.com")).toBe("https://gopro.com");
    expect(normaliseWebsite("www.gopro.com")).toBe("https://www.gopro.com");
    expect(normaliseWebsite("  GoPro.com  ")).toBe("https://gopro.com");
  });

  it("keeps a scheme that is already there", () => {
    expect(normaliseWebsite("http://gopro.com")).toBe("http://gopro.com");
    expect(normaliseWebsite("https://gopro.com")).toBe("https://gopro.com");
  });

  it("drops a bare trailing slash but keeps a real path", () => {
    // A product page path is often the only thing that works on a JS storefront,
    // so it must survive.
    expect(normaliseWebsite("https://gopro.com/")).toBe("https://gopro.com");
    expect(normaliseWebsite("https://gopro.com/shop/cameras")).toBe("https://gopro.com/shop/cameras");
  });

  it("rejects things that are not addresses", () => {
    for (const bad of ["", "   ", "gopro", "my company"]) {
      expect(() => normaliseWebsite(bad)).toThrow(BoothError);
    }
  });
});

describe("slugify", () => {
  it("keeps CJK instead of wiping the name to nothing", () => {
    // \w drops CJK, which once made every Chinese brand collide on a fallback slug.
    expect(slugify("摘星社群")).toBe("摘星社群");
    expect(slugify("五感十築")).toBe("五感十築");
  });

  it("lowercases and hyphenates latin names", () => {
    expect(slugify("GoPro Inc.")).toBe("gopro-inc");
    expect(slugify("  Vertex   Coffee  Roasters ")).toBe("vertex-coffee-roasters");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("brand");
    expect(slugify("")).toBe("brand");
  });
});

describe("booth limits", () => {
  it("caps products well below the normal 50", () => {
    // One hundred scans is one hundred bills; the cap is the budget.
    expect(BOOTH_PRODUCT_CAP).toBeLessThanOrEqual(10);
    expect(BOOTH_PRODUCT_CAP).toBeGreaterThan(0);
  });
});
