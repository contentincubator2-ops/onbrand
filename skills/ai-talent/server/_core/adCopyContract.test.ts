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
  it("finds a bare landing page that precedes a scheme YouTube link", () => {
    expect(extractRequestedUrl({ campaign: "導到 www.abc.com，參考 https://www.youtube.com/watch?v=abc123def45" })).toBe(URL);
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
  it("lists every violation in detail", () => {
    const c = `[Headline] a\n[Primary] b\n[CTA] 看 ${URL}`;
    const issue = validateAdCopy(c, URL);
    expect(issue?.reason).toBe("missing_url");
    expect(issue?.detail).toContain("[CTA]");
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
  it("strips a bare foreign URL that precedes a scheme requested URL in [CTA]", () => {
    const u = "https://abc.com/x";
    const out = repairAdCopy(`[Headline] a\n[Primary] b\n[CTA] www.other.com 看 ${u}`, u);
    expect(out).toBe(`[Headline] a\n[Primary] b\n${u}\n[CTA] 看`);
  });
  it("rebuilds the three segments from an unlabelled caption (the IRIS case)", () => {
    const plain = "聖誕節那天，我穿上這件法式藍語刺繡上衣走進家門。\n媽媽在廚房準備晚餐，抬頭看我一眼。\n#聖誕穿搭 #優雅日常";
    const out = repairAdCopy(plain, URL);
    expect(out).toBe(
      "[Headline] 聖誕節那天，我穿上這件法式藍語刺繡上衣走進家門。\n" +
      "[Primary] 媽媽在廚房準備晚餐，抬頭看我一眼。\nwww.abc.com\n" +
      "[CTA] 立即查看\n#聖誕穿搭 #優雅日常",
    );
    expect(validateAdCopy(out, URL)).toBeNull();
    // Opening line longer than 25 chars: headline clipped at the first
    // sentence break, full line kept as the start of [Primary].
    const long = "換季那天，你打開衣櫃愣了幾秒，不是衣服不夠穿而是不知道今年要當哪種自己。\n秋天有種魔力。";
    expect(repairAdCopy(long, null)).toBe(
      "[Headline] 換季那天\n[Primary] " + long + "\n[CTA] 立即查看",
    );
    // Short first line becomes the headline verbatim; no URL requested → none added.
    expect(repairAdCopy("今年換你寵媽媽\n一份貼近她日常的心意。", null)).toBe(
      "[Headline] 今年換你寵媽媽\n[Primary] 一份貼近她日常的心意。\n[CTA] 立即查看",
    );
  });
  it("strips every fabricated URL when no landing page was requested", () => {
    const c = "前言 www.pre.com\n[Headline] 看 https://x.com/a 這裡\n[Primary] 上 www.made-up.com 看看：\n第二行\n[CTA] www.only.com\n#tag www.tail.com";
    const out = repairAdCopy(c, null);
    expect(out).toBe("[Headline] 看 這裡\n[Primary] 上 看看\n第二行\n[CTA] 立即查看\n#tag");
    expect(validateAdCopy(out, null)).toBeNull();
  });
  it("is a no-op for compliant captions or when nothing is requested", () => {
    expect(repairAdCopy(GOOD, URL)).toBe(GOOD);
    expect(repairAdCopy("", URL)).toBe("");
    expect(repairAdCopy("[Headline] a\n[Primary] b\n[CTA] c", null)).toBe("[Headline] a\n[Primary] b\n[CTA] c");
  });
});
