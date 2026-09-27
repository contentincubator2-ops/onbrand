import { describe, expect, it } from "vitest";
import { verifyQuote } from "./meetingSources";

const src = { code: "S1", label: "x", href: "/", text: "下班回家、換個衣服、開個瓦斯——你的澳洲和牛牛舌已經好了。" };

describe("verifyQuote", () => {
  it("逐字出現才算；忽略空白與引號", () => {
    expect(verifyQuote("澳洲和牛牛舌", src)).toBe("澳洲和牛牛舌");
    expect(verifyQuote("「換個衣服、開個 瓦斯」", src)).toBe("換個衣服、開個 瓦斯");
  });
  it("來源裡沒有的原文、太短、或沒有來源 → null", () => {
    expect(verifyQuote("頂級饕客專屬", src)).toBeNull();
    expect(verifyQuote("的", src)).toBeNull();
    expect(verifyQuote("澳洲", undefined)).toBeNull();
  });
});
