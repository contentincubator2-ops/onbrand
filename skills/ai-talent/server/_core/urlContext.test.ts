import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUrlSummary, formatUrlSummaryForPrompt } from "./urlContext";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("URL body quality", () => {
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
    expect(summary?.body_usable).toBe(false);
    expect(summary?.og.title).toBe("Open-source AI models are changing research");
    expect(summary?.og.description).toBe("A practical overview of the latest open-source model research.");

    const prompt = formatUrlSummaryForPrompt(summary!);
    expect(prompt).toContain("OG 標題：Open-source AI models are changing research");
    expect(prompt).toContain("OG 描述：A practical overview of the latest open-source model research.");
    expect(prompt).toContain("只取得連結卡片摘要，未取得正文");
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
