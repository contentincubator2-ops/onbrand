/**
 * urlContext.ts — fetch a URL and extract clean text for LLM context.
 *
 * Use case: quick-task primary input may be (or contain) a URL — e.g. the
 * user pastes their company About page, a competitor article, a 連結貼文
 * URL. The LLM needs to actually READ that page, not just see "https://...".
 *
 * Strategy:
 *   1. Detect URLs in the input string (first match wins for now).
 *   2. fetch() with 5s timeout, follow redirects, accept html.
 *   3. Strip <script>, <style>, <nav>, <footer>; pull <title>, <meta
 *      description>, <h1-3>, first 3000 chars of body text.
 *   4. Return a structured summary the prompt builder can prepend.
 *
 * Resilience: any failure (timeout, 4xx/5xx, bot wall) returns null — caller
 * falls back to user-provided string only. Never throws.
 *
 * No external deps — uses Node fetch + simple regex HTML cleanup.
 */

const URL_RE = /https?:\/\/[^\s一-龥（），。！？「」『』、；：]+/i;
const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_CHARS = 3000;

export interface UrlSummary {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  body_excerpt: string;
  fetched_chars: number;
  /** OG card metadata — used by FBLinkCard mockup to render the link preview
   * exactly as Facebook would (so user sees what the OG-rendered post looks
   * like instead of a blank "等待 craft agent" image slot). */
  og: {
    image: string | null;
    title: string | null;
    description: string | null;
    site_name: string | null;
    domain: string;
  };
}

/** Extract the first URL from a free-form string. */
export function findFirstUrl(input: string): string | null {
  const m = input.match(URL_RE);
  return m ? m[0] : null;
}

/** Strip common HTML noise; return clean text. */
function htmlToText(html: string): string {
  return html
    // Remove script / style / nav / footer / aside / header blocks (with content)
    .replace(/<(script|style|nav|footer|aside|header|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function pluck(html: string, selectorPattern: RegExp): string | null {
  const m = html.match(selectorPattern);
  return m ? htmlToText(m[1] ?? m[0]).trim() || null : null;
}

/** Fetch + extract structured page summary. Returns null on any failure. */
export async function fetchUrlSummary(url: string): Promise<UrlSummary | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OnBrand-Bot/1.0; +https://onbrand.sowork.ai)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html") && !ctype.includes("xml") && !ctype.includes("text/")) return null;

    // Cap raw body to 200KB so we don't blow up on massive pages
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const HARD_CAP = 200_000;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= HARD_CAP) break;
      }
    }
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const html = buf.toString("utf-8");

    const title = pluck(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      pluck(html, /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i) ||
      pluck(html, /<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i);
    const h1 = pluck(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

    // OG card extraction — these power FBLinkCard / IGLinkCard mockups so
    // users see the actual OG preview Facebook would auto-generate.
    const ogMeta = (prop: string) =>
      pluck(html, new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']`, "i")) ||
      pluck(html, new RegExp(`<meta\\s+name=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']`, "i"));
    const ogImageRaw = ogMeta("og:image") || ogMeta("twitter:image") || ogMeta("twitter:image:src");
    const ogTitle = ogMeta("og:title") || title;
    const ogDescription = ogMeta("og:description") || description;
    const ogSiteName = ogMeta("og:site_name");
    let domain = "";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    // Resolve relative og:image against page url
    let ogImage: string | null = null;
    if (ogImageRaw) {
      try { ogImage = new URL(ogImageRaw, url).toString(); } catch { ogImage = ogImageRaw; }
    }

    const fullText = htmlToText(html);
    const excerpt = fullText.slice(0, MAX_BODY_CHARS);

    return {
      url,
      title: title?.slice(0, 280) ?? null,
      description: description?.slice(0, 600) ?? null,
      h1: h1?.slice(0, 280) ?? null,
      body_excerpt: excerpt,
      fetched_chars: fullText.length,
      og: {
        image: ogImage,
        title: ogTitle?.slice(0, 280) ?? null,
        description: ogDescription?.slice(0, 600) ?? null,
        site_name: ogSiteName?.slice(0, 80) ?? null,
        domain,
      },
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Format a UrlSummary as a prompt-friendly block. */
export function formatUrlSummaryForPrompt(s: UrlSummary): string {
  const parts: string[] = [`【已抓取參考連結】${s.url}`];
  if (s.title)       parts.push(`標題：${s.title}`);
  if (s.description) parts.push(`描述：${s.description}`);
  if (s.h1)          parts.push(`H1：${s.h1}`);
  if (s.body_excerpt) parts.push(`內文摘錄（前 ${s.body_excerpt.length} 字）：\n${s.body_excerpt}`);
  parts.push(`【務必基於以上連結內容生成 — 不要寫通用模板，要呼應這篇內容的具體訊息、故事、品牌獨特之處】`);
  return parts.join("\n");
}
