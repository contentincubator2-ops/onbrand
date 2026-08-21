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
  it("treats a YouTube link as material, not the landing page", () => {
    expect(extractRequestedUrl({ campaign: "參考這支 https://www.youtube.com/watch?v=abc123def45" })).toBeNull();
  });
  it("finds the landing page even when a YouTube link comes first", () => {
    expect(extractRequestedUrl({ campaign: "參考 https://youtu.be/abc123def45 ，CTA 導到 www.abc.com。" })).toBe(URL);
  });
  it("strips trailing punctuation glued to the URL", () => {
    expect(extractRequestedUrl({ campaign: "連結：https://abc.com/sale;" })).toBe("https://abc.com/sale");
    expect(extractRequestedUrl({ campaign: "連結 [www.abc.com]" })).toBe(URL);
  });
  it("keeps a scheme when the user typed one", () => {
    expect(extractRequestedUrl({ campaign: "CTA: https://abc.com/sale?x=1&y=2" })).toBe("https://abc.com/sale?x=1&y=2");
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
  it("flags URL that is in [Primary] but not its last line", () => {
    const c = `[Headline] a\n[Primary] 先看 ${URL} 再說。\n最後一句話。\n[CTA] c`;
    expect(validateAdCopy(c, URL)?.reason).toBe("missing_url");
  });
  it("flags URL duplicated into [CTA]", () => {
    const c = `[Headline] a\n[Primary] b\n${URL}\n[CTA] 看看 ${URL}`;
    expect(validateAdCopy(c, URL)?.reason).toBe("url_in_cta");
  });
  it("flags any other URL in [CTA]", () => {
    const c = `[Headline] a\n[Primary] b\n${URL}\n[CTA] 看看 www.other.com`;
    expect(validateAdCopy(c, URL)?.reason).toBe("url_in_cta");
  });
  it("flags a fabricated URL in the preamble or hashtag tail when none was requested", () => {
    expect(validateAdCopy("見 www.x.com\n[Headline] a\n[Primary] b\n[CTA] c", null)?.reason).toBe("fabricated_url");
    expect(validateAdCopy("[Headline] a\n[Primary] b\n[CTA] c\n#tag www.x.com", null)?.reason).toBe("fabricated_url");
  });
  it("flags a fabricated URL when none was requested", () => {
    const c = "[Headline] a\n[Primary] 上 www.made-up.com 看看\n[CTA] c";
    expect(validateAdCopy(c, null)?.reason).toBe("fabricated_url");
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
  it("moves a mid-paragraph URL to the last line and strips every copy from [CTA]", () => {
    const c = `[Headline] a\n[Primary] 先看 ${URL} 再說。\n最後一句話。\n[CTA] ${URL} 看看 ${URL}`;
    const out = repairAdCopy(c, URL);
    expect(out).toBe(`[Headline] a\n[Primary] 先看 ${URL} 再說。\n最後一句話。\n${URL}\n[CTA] 看看`);
    expect(validateAdCopy(out, URL)).toBeNull();
  });
  it("also strips foreign URLs from [CTA]", () => {
    const out = repairAdCopy(`[Headline] a\n[Primary] b\n${URL}\n[CTA] 看看 www.other.com`, URL);
    expect(out).toBe(`[Headline] a\n[Primary] b\n${URL}\n[CTA] 看看`);
    expect(validateAdCopy(out, URL)).toBeNull();
  });
  it("falls back to a default button label when [CTA] was only the URL", () => {
    const out = repairAdCopy(`[Headline] a\n[Primary] b\n${URL}\n[CTA] ${URL}`, URL);
    expect(out).toBe(`[Headline] a\n[Primary] b\n${URL}\n[CTA] 立即查看`);
  });
  it("handles URLs with regex-special characters", () => {
    const u = "https://abc.com/sale?x=1&y=(2)";
    const out = repairAdCopy(`[Headline] a\n[Primary] b\n[CTA] 買 → ${u}`, u);
    expect(out).toBe(`[Headline] a\n[Primary] b\n${u}\n[CTA] 買`);
  });
  it("is a no-op for compliant captions, captions without markers, or no URL", () => {
    expect(repairAdCopy(GOOD, URL)).toBe(GOOD);
    const plain = "純文字貼文 #tag";
    expect(repairAdCopy(plain, URL)).toBe(plain);
    expect(repairAdCopy("[Headline] a\n[Primary] b\n[CTA] c", null)).toBe("[Headline] a\n[Primary] b\n[CTA] c");
  });
});
