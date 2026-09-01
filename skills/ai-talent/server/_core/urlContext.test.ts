import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchUrlSummary,
  formatUrlSummaryForPrompt,
  hasMeaningfulUrlContent,
  isBoilerplatePageTitle,
} from "./urlContext";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("URL body quality", () => {
  it("uses one explicit 200-character boundary for otherwise metadata-free pages", () => {
    const base = {
      title: null,
      description: null,
      h1: null,
      og: { image: null, title: null, description: null, site_name: null, domain: "example.com" },
    };

    expect(hasMeaningfulUrlContent({ ...base, body_excerpt: "字".repeat(199), body_usable: true })).toBe(false);
    expect(hasMeaningfulUrlContent({ ...base, body_excerpt: "字".repeat(200), body_usable: true })).toBe(true);
    expect(hasMeaningfulUrlContent({ ...base, body_excerpt: "字".repeat(500), body_usable: false })).toBe(false);
    expect(hasMeaningfulUrlContent({ ...base, title: "有標題的正常頁", body_excerpt: "", body_usable: false })).toBe(true);
  });

  it("recognizes known platform boilerplate titles without rejecting real titles", () => {
    for (const title of [
      "TikTok - Make Your Day",
      "Instagram",
      "Facebook",
      "Log in to Facebook",
      "Threads",
    ]) {
      expect(isBoilerplatePageTitle(title)).toBe(true);
    }
    expect(isBoilerplatePageTitle("Instagram 春季內容策略完整指南")).toBe(false);
  });

  it("rejects an empty JavaScript shell instead of returning contradictory prompt context", async () => {
    const html = `<!doctype html><html><head><title data-rh="true"></title></head>
      <body><script>window.__APP__ = { lots: "of JavaScript" };</script></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));

    const summary = await fetchUrlSummary("https://example.com/client-rendered-page");
    expect(summary).toBeNull();
  });

  it("keeps a short normal page with a title and usable body", async () => {
    const article = "這是短篇正常文章，清楚交代新品的設計理念、適用情境、材質特色與使用方式。".repeat(8);
    const html = `<!doctype html><html><head><title>短篇新品介紹</title></head>
      <body><main><p>${article}</p></main></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));

    const summary = await fetchUrlSummary("https://example.com/short-article");
    expect(summary).not.toBeNull();
    expect(summary?.title).toBe("短篇新品介紹");
    expect(summary?.body_usable).toBe(true);
    expect(hasMeaningfulUrlContent(summary!)).toBe(true);
  });

  it("falls back to TikTok oEmbed and exposes caption, author, music, and thumbnail as card metadata", async () => {
    const pageHtml = `<!doctype html><html><head><title data-rh="true"></title></head><body><script>app()</script></body></html>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: "三個讓短影音更有記憶點的拍攝技巧",
        author_name: "Derry Yoke",
        author_unique_id: "derryyoke",
        thumbnail_url: "https://p16-sign.tiktokcdn.com/example.jpeg",
        provider_name: "TikTok",
        html: `<blockquote><a href="https://www.tiktok.com/music/example">♬ original sound - Derry Yoke</a></blockquote>`,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://www.tiktok.com/@derryyoke/video/7638528410200902919?is_from_webapp=1";
    const summary = await fetchUrlSummary(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://www.tiktok.com/oembed?url=");
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(summary).toMatchObject({
      url,
      title: "三個讓短影音更有記憶點的拍攝技巧",
      body_excerpt: "",
      body_usable: false,
      fetched_chars: 0,
      og: {
        image: "https://p16-sign.tiktokcdn.com/example.jpeg",
        title: "三個讓短影音更有記憶點的拍攝技巧",
        description: "作者：Derry Yoke @derryyoke｜音樂：original sound - Derry Yoke",
        site_name: "TikTok",
        domain: "tiktok.com",
      },
    });
    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).toContain("只取得連結卡片層級資訊");
    expect(prompt).toContain("不足處以品牌素材補足");
    expect(prompt).not.toContain("務必基於以上連結內容生成");
    expect(prompt).not.toContain("內文摘錄");
  });

  it("ignores TikTok boilerplate title and hydration JSON, then merges blank-title oEmbed card data", async () => {
    const hydration = JSON.stringify({ __UNIVERSAL_DATA_FOR_REHYDRATION__: "x".repeat(84_000) });
    const pageHtml = `<!doctype html><html><head><title>TikTok - Make Your Day</title></head>
      <body><div id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${hydration}</div></body></html>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: "",
        author_name: "帥哥",
        author_unique_id: "derryyoke",
        thumbnail_url: "https://p16-sign.tiktokcdn.com/real-example.jpeg",
        provider_name: "TikTok",
        html: `<blockquote><a href="https://www.tiktok.com/music/example">♬ 原聲 - Derryyoke - 帥哥</a></blockquote>`,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://www.tiktok.com/@derryyoke/video/7638528410200902919?sender_device=pc";
    const summary = await fetchUrlSummary(url);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      url,
      title: null,
      body_excerpt: "",
      body_usable: false,
      og: {
        image: "https://p16-sign.tiktokcdn.com/real-example.jpeg",
        title: null,
        description: "作者：帥哥 @derryyoke｜音樂：原聲 - Derryyoke - 帥哥",
        site_name: "TikTok",
        domain: "tiktok.com",
      },
    });
    expect(summary!.fetched_chars).toBeGreaterThan(80_000);
    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).not.toContain("TikTok - Make Your Day");
    expect(prompt).not.toContain("務必基於以上連結內容生成");
    expect(prompt).toContain("作者：帥哥 @derryyoke");
    expect(prompt).toContain("不足處以品牌素材補足");
  });

  it("returns null when both a TikTok page shell and its oEmbed payload lack promptable text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html><head><title></title></head><body><script>app()</script></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: "",
        author_name: "",
        author_unique_id: "",
        thumbnail_url: "https://p16-sign.tiktokcdn.com/only-an-image.jpeg",
        provider_name: "TikTok",
        html: "",
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUrlSummary("https://www.tiktok.com/@empty/video/123")).resolves.toBeNull();
  });

  it("degrades TikTok oEmbed failures to null", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("page blocked"))
      .mockRejectedValueOnce(new Error("oEmbed unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUrlSummary("https://www.tiktok.com/@creator/video/456")).resolves.toBeNull();
  });

  it("keeps Facebook OG data but omits login-wall markup from prompt context", async () => {
    const html = `<!doctype html><html><head>
      <title>Facebook</title>
      <meta name="description" content="A useful link card description">
      <meta property="og:title" content="Open-source AI models are changing research">
      <meta property="og:description" content="A practical overview of the latest open-source model research.">
      <meta property="og:site_name" content="Facebook">
    </head><body><div>Log into Facebook</div><div>JavaScript is required to continue.</div>
      <div>technical-page-shell-marker should never reach the prompt</div></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));

    const summary = await fetchUrlSummary("https://www.facebook.com/example/posts/123");
    expect(summary).not.toBeNull();
    expect(summary?.title).toBeNull();
    expect(summary?.body_usable).toBe(false);
    expect(summary?.og.title).toBe("Open-source AI models are changing research");
    expect(summary?.og.description).toBe("A practical overview of the latest open-source model research.");

    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).toContain("OG 標題：Open-source AI models are changing research");
    expect(prompt).toContain("OG 描述：A practical overview of the latest open-source model research.");
    expect(prompt).toContain("只取得連結卡片層級資訊");
    expect(prompt).not.toContain("務必基於以上連結內容生成");
    expect(prompt).not.toContain("technical-page-shell-marker");
    expect(prompt).not.toContain("JavaScript is required");
    expect(prompt).not.toContain("內文摘錄");
  });

  it("keeps the existing body excerpt behavior for a normal article", async () => {
    const article = "這是一篇完整文章的正文內容，說明開源人工智慧模型如何協助研究團隊驗證想法、分享成果，並讓更多開發者參與技術創新。".repeat(8);
    const html = `<!doctype html><html><head>
      <title>開源 AI 如何改變研究協作</title>
      <meta name="description" content="從工具到社群，解析開源模型的影響。">
      <meta property="og:title" content="開源 AI 如何改變研究協作">
      <meta property="og:description" content="從工具到社群，解析開源模型的影響。">
    </head><body><main><h1>研究協作的新方式</h1><p>${article}</p></main></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));

    const summary = await fetchUrlSummary("https://example.com/articles/open-ai");
    expect(summary).not.toBeNull();
    expect(summary?.body_usable).toBe(true);

    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).toContain("H1：研究協作的新方式");
    expect(prompt).toContain("內文摘錄");
    expect(prompt).toContain(article.slice(0, 80));
    expect(prompt).not.toContain("只取得連結卡片摘要");
    expect(prompt).toContain("務必基於以上連結內容生成");
  });

  it("ignores a JavaScript warning inside noscript when the visible article body is usable", async () => {
    const article = "這篇文章整理春季新品的設計理念、材質選擇與日常搭配方式，並分享每一款商品適合的生活情境。".repeat(10);
    const html = `<!doctype html><html><head>
      <title>春季新品完整指南</title>
      <noscript>You need to enable JavaScript to run this app.</noscript>
    </head><body><noscript>You need to enable JavaScript to run this app.</noscript>
      <main><h1>找到適合你的春日風格</h1><p>${article}</p></main></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));

    const summary = await fetchUrlSummary("https://example.com/articles/spring-guide");
    expect(summary).not.toBeNull();
    expect(summary?.body_usable).toBe(true);

    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).toContain("內文摘錄");
    expect(prompt).toContain(article.slice(0, 80));
    expect(prompt).not.toContain("You need to enable JavaScript");
  });
});
