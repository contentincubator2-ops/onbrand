import { describe, expect, it } from "vitest";
import { parseAdCopy, shortenAdCta } from "./parseAdCopy";

describe("parseAdCopy", () => {
  it("parses inline labelled copy and keeps trailing hashtags out of CTA", () => {
    expect(parseAdCopy(
      "[Headline] 住進理想日常 [Primary] 採光與綠意兼具，歡迎親自感受。 [CTA] 預約實景參觀 #理想住宅 #預約看屋",
    )).toEqual({
      headline: "住進理想日常",
      primary: "採光與綠意兼具，歡迎親自感受。",
      cta: "預約實景參觀",
      hashtags: ["理想住宅", "預約看屋"],
    });
  });

  it("returns empty strings for missing labelled sections", () => {
    expect(parseAdCopy("[Primary] Only the primary copy [CTA] Learn more")).toEqual({
      headline: "",
      primary: "Only the primary copy",
      cta: "Learn more",
      hashtags: [],
    });
  });

  it("accepts full-width, case-insensitive markers", () => {
    expect(parseAdCopy("【HEADLINE】全形標題\n【primary】全形主文\n【CtA】立即諮詢")).toEqual({
      headline: "全形標題",
      primary: "全形主文",
      cta: "立即諮詢",
      hashtags: [],
    });
  });

  it("returns null when the caption has no markers", () => {
    expect(parseAdCopy("這是一則一般貼文，沒有廣告文案標記。 #日常")).toBeNull();
  });

  it("separates a multiline hashtag suffix from CTA", () => {
    expect(parseAdCopy("[CTA] Book a private tour\n\n#NewHome #OpenHouse")?.cta).toBe("Book a private tour");
    expect(parseAdCopy("[CTA] Book a private tour\n\n#NewHome #OpenHouse")?.hashtags).toEqual(["NewHome", "OpenHouse"]);
  });
});

describe("shortenAdCta", () => {
  it("keeps short CTAs and compacts the common real-estate CTA", () => {
    expect(shortenAdCta("立即諮詢")).toBe("立即諮詢");
    expect(shortenAdCta("預約實景參觀")).toBe("預約參觀");
  });
});
