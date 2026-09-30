import { describe, expect, it } from "vitest";
import { extractPublishedDate, normalizeDate } from "./publishedDate";

const NOW = new Date("2026-09-30T12:00:00Z");

describe("normalizeDate", () => {
  it("各種格式都收成 YYYY-MM-DD", () => {
    expect(normalizeDate("2026-09-28T08:00:00+08:00", NOW)).toBe("2026-09-28");
    expect(normalizeDate("2026/9/5", NOW)).toBe("2026-09-05");
    expect(normalizeDate("20260928", NOW)).toBe("2026-09-28");
    expect(normalizeDate("Mon, 28 Sep 2026 10:00:00 GMT", NOW)).toBe("2026-09-28");
  });
  it("不合理的日期不收（未來、太舊、亂碼）", () => {
    expect(normalizeDate("2027-01-01", NOW)).toBeNull();
    expect(normalizeDate("1999-12-31", NOW)).toBeNull();
    expect(normalizeDate("昨天", NOW)).toBeNull();
    expect(normalizeDate("", NOW)).toBeNull();
  });
});

describe("extractPublishedDate", () => {
  it("article:published_time 優先", () => {
    const html = `<head><meta property="og:title" content="x"><meta property="article:published_time" content="2026-09-21T03:00:00Z"></head>`;
    expect(extractPublishedDate(html, undefined, NOW)).toBe("2026-09-21");
  });
  it("content 在 property 前面、單引號也讀得到", () => {
    expect(extractPublishedDate(`<meta content='2026-09-20' name='pubdate'>`, undefined, NOW)).toBe("2026-09-20");
  });
  it("JSON-LD datePublished", () => {
    const html = `<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-19T10:00:00+08:00"}</script>`;
    expect(extractPublishedDate(html, undefined, NOW)).toBe("2026-09-19");
  });
  it("<time datetime>", () => {
    expect(extractPublishedDate(`<article><time datetime="2026-09-18">9/18</time></article>`, undefined, NOW)).toBe("2026-09-18");
  });
  it("網址裡的日期是最後的備援", () => {
    expect(extractPublishedDate("<html></html>", "https://example.com/2026/09/17/some-post", NOW)).toBe("2026-09-17");
  });
  it("什麼都沒有就回 null，不猜", () => {
    expect(extractPublishedDate("<html><meta name='description' content='2026-09-01'></html>", "https://www.facebook.com/x/posts/123", NOW)).toBeNull();
  });
});
