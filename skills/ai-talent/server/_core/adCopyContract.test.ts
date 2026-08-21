import { describe, expect, it } from "vitest";
import {
  buildAdCopyRule,
  extractRequestedUrl,
  isAdCopyTemplate,
  repairAdCopy,
  validateAdCopy,
} from "./adCopyContract";
import { FB_60S_TASKS_V2 } from "./quickTaskFB60";

const URL = "www.abc.com";
const GOOD =
  "[Headline] 換季那天，你打開衣櫃愣了幾秒\n" +
  "[Primary] 不是衣服不夠穿——是不知道今年要當哪種自己。\n今年想穿出什麼感覺？點進來找找靈感\nwww.abc.com\n" +
  "[CTA] 看穿搭指南\n#秋冬穿搭 #換季必備";

describe("isAdCopyTemplate", () => {
  it("matches only the ad-pack template among the FB 60s tasks", () => {
    const hits = FB_60S_TASKS_V2.filter(isAdCopyTemplate).map((t) => t.id);
    expect(hits).toEqual(["fb-60-ad-pack-3"]);
  });
});

describe("extractRequestedUrl", () => {
  it("finds a bare domain inside a multi-line brief", () => {
    expect(extractRequestedUrl({ campaign: "秋冬穿搭推薦\n每篇都加上 CTA : www.abc.com" })).toBe(URL);
  });
  it("returns null when the brief has no URL", () => {
    expect(extractRequestedUrl({ campaign: "母親節" })).toBeNull();
  });
});

describe("buildAdCopyRule", () => {
  it("forbids inventing links when no URL was given", () => {
    expect(buildAdCopyRule(null)).toContain("不要**自行捏造");
    expect(buildAdCopyRule(null)).not.toContain("落地頁網址");
  });
  it("requires the exact URL at the end of [Primary]", () => {
    expect(buildAdCopyRule(URL)).toContain(`「${URL}」`);
  });
});

describe("validateAdCopy", () => {
  it("accepts a compliant caption", () => {
    expect(validateAdCopy(GOOD, URL)).toBeNull();
  });
  it("accepts markers-only when no URL requested", () => {
    expect(validateAdCopy("[Headline] a\n[Primary] b\n[CTA] c", null)).toBeNull();
  });
  it("flags missing markers (the IRIS case)", () => {
    expect(validateAdCopy("聖誕節那天，我穿上這件上衣走進家門。\n#聖誕穿搭", URL)?.reason).toBe("missing_markers");
  });
  it("flags URL present only in [CTA] (the 理性切角 case)", () => {
    const c = "[Headline] 秋冬穿搭這樣配\n[Primary] 具體怎麼配？點下面。\n[CTA] 看完整穿搭指南 → www.abc.com";
    expect(validateAdCopy(c, URL)?.reason).toBe("missing_url");
  });
  it("accepts 【】 full-width markers", () => {
    expect(validateAdCopy(`【Headline】a\n【Primary】b ${URL}\n【CTA】c`, URL)).toBeNull();
  });
});

describe("repairAdCopy", () => {
  it("moves the URL from [CTA] to the end of [Primary], keeping hashtags last", () => {
    const c = "[Headline] 秋冬穿搭這樣配\n[Primary] 具體怎麼配？點下面。\n[CTA] 看完整穿搭指南 → www.abc.com\n#秋冬穿搭";
    const out = repairAdCopy(c, URL);
    expect(out).toBe(
      "[Headline] 秋冬穿搭這樣配\n[Primary] 具體怎麼配？點下面。\nwww.abc.com\n[CTA] 看完整穿搭指南\n#秋冬穿搭",
    );
    expect(validateAdCopy(out, URL)).toBeNull();
  });
  it("appends the URL when it is missing everywhere", () => {
    const out = repairAdCopy("[Headline] a\n[Primary] b\n[CTA] c", URL);
    expect(out).toBe(`[Headline] a\n[Primary] b\n${URL}\n[CTA] c`);
  });
  it("is a no-op for compliant captions, captions without markers, or no URL", () => {
    expect(repairAdCopy(GOOD, URL)).toBe(GOOD);
    const plain = "純文字貼文 #tag";
    expect(repairAdCopy(plain, URL)).toBe(plain);
    expect(repairAdCopy("[Headline] a\n[Primary] b\n[CTA] c", null)).toBe("[Headline] a\n[Primary] b\n[CTA] c");
  });
});
