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

// 2026-05-18 (CJ「用戶有提供連結就要讀，剛剛沒讀」): the old regex
// REQUIRED http(s):// — users very often paste a link WITHOUT the
// scheme (www.x.com / x.com/page), so it was never detected → never
// fetched. Now also catch scheme-less URLs and normalize.
const BOUNDARY = "\\s一-龥（），。！？「」『』、；：\\\"<>";
const URL_SCHEME_RE = new RegExp(`https?:\\/\\/[^${BOUNDARY}]+`, "i");
// 2026-05-18: the old `www\.[a-z0-9-]+` alternative truncated
// "www.sowork.ai/pricing" → "www.sowork" (matched only the first label,
// then the optional path failed because the next char was ".ai"). The
// TLD-anchored form below already handles a leading "www." correctly, so
// we use a single "(label.)+TLD(/path)?" shape — no separate www branch.
const URL_BARE_RE = new RegExp(
  `(?:[a-z0-9-]+\\.)+(?:com|org|net|io|ai|co|tw|app|dev|me|info|biz|tv|news|xyz|page|site|shop|store|link|gov|edu)(?:\\.tw)?(?:\\/[^${BOUNDARY}]*)?`,
  "i",
);
const FETCH_TIMEOUT_MS = 9000;
const MAX_BODY_CHARS = 3000;
const MIN_USABLE_BODY_CHARS = 200;
const BOILERPLATE_PAGE_TITLES = new Set([
  "tiktok",
  "tiktok - make your day",
  "instagram",
  "log in • instagram",
  "facebook",
  "log in to facebook",
  "facebook – log in or sign up",
  "threads",
]);

export interface UrlSummary {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  body_excerpt: string;
  /** Whether body_excerpt contains actual article/page copy rather than a
   * login wall, JavaScript shell, or an insufficiently small extraction. */
  body_usable: boolean;
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

const LOGIN_REQUIRED_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "threads.net",
  "linkedin.com",
  "tiktok.com",
]);

const LOGIN_OR_JS_SHELL_RE =
  /you must log in|log into facebook|javascript is required|enable javascript|請先登入/i;

function isLoginRequiredHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return [...LOGIN_REQUIRED_HOSTS].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

const TRAIL_RE = /[).,，。、；：!?！？'"]+$/;

/** Extract the first URL from a free-form string. Handles scheme-less
 *  links (www.x.com / x.com/page) and strips trailing punctuation. */
export function findFirstUrl(input: string): string | null {
  const s = input ?? "";
  const scheme = s.match(URL_SCHEME_RE);
  if (scheme) return scheme[0].replace(TRAIL_RE, "");
  const bare = s.match(URL_BARE_RE);
  if (bare) {
    const idx = bare.index ?? 0;
    // crude e-mail guard: skip "name@domain.com"
    if (idx > 0 && s[idx - 1] === "@") {
      const rest = s.slice(idx + bare[0].length);
      const next = findFirstUrl(rest);
      return next;
    }
    return "https://" + bare[0].replace(TRAIL_RE, "");
  }
  return null;
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

/** Platform shell titles carry no topic information and must not make an
 * otherwise empty fetch look useful. Exact matching avoids rejecting real
 * articles that merely mention a platform in a longer title. */
export function isBoilerplatePageTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return BOILERPLATE_PAGE_TITLES.has(normalized);
}

function promptableTitle(value: string | null | undefined): string | null {
  const normalized = textValue(value);
  return normalized && !isBoilerplatePageTitle(normalized) ? normalized : null;
}

/** A fetch is meaningful when it contains promptable text metadata or enough
 * real page copy to pass the same body-quality threshold used below. Keeping
 * this check named prevents empty JS shells from masquerading as fetched
 * context while preserving short, normal pages that carry a title/summary. */
export function hasMeaningfulUrlContent(
  summary: Pick<UrlSummary, "title" | "description" | "h1" | "body_excerpt" | "og">
    & Partial<Pick<UrlSummary, "body_usable">>,
): boolean {
  const titles = [summary.title, summary.h1, summary.og.title];
  if (titles.some((value) => textValue(value) && !isBoilerplatePageTitle(value))) {
    return true;
  }
  const otherMetadata = [
    summary.description,
    summary.og.description,
  ];
  if (otherMetadata.some((value) => textValue(value))) {
    return true;
  }
  return summary.body_usable !== false
    && summary.body_excerpt.replace(/\s/g, "").length >= MIN_USABLE_BODY_CHARS;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

interface TikTokOEmbedResponse {
  title?: unknown;
  author_name?: unknown;
  author_unique_id?: unknown;
  thumbnail_url?: unknown;
  html?: unknown;
  provider_name?: unknown;
}

/** TikTok's public oEmbed endpoint is the only unauthenticated source that
 * reliably exposes a video's caption, author, thumbnail, and sound metadata. */
async function fetchTikTokOEmbed(url: string): Promise<UrlSummary | null> {
  if (!isTikTokUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const endpoint = new URL("https://www.tiktok.com/oembed");
    endpoint.searchParams.set("url", url);
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OnBrand-Bot/1.0; +https://onbrand.sowork.ai)",
        "Accept": "application/json",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as TikTokOEmbedResponse;
    const title = promptableTitle(textValue(data.title));
    const authorName = textValue(data.author_name);
    const authorUniqueId = textValue(data.author_unique_id);
    const author = [authorName, authorUniqueId ? `@${authorUniqueId.replace(/^@/, "")}` : null]
      .filter(Boolean)
      .join(" ");
    const embedHtml = textValue(data.html);
    const music = embedHtml
      ? pluck(embedHtml, /<a[^>]*>\s*(♬[\s\S]*?)<\/a>/i)?.replace(/^♬\s*/, "") ?? null
      : null;
    const ogDescription = [
      author ? `作者：${author}` : null,
      music ? `音樂：${music}` : null,
    ].filter(Boolean).join("｜") || null;
    let domain = "tiktok.com";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep default */ }

    const summary: UrlSummary = {
      url,
      title: title?.slice(0, 280) ?? null,
      description: null,
      h1: null,
      body_excerpt: "",
      body_usable: false,
      fetched_chars: 0,
      og: {
        image: textValue(data.thumbnail_url),
        title: title?.slice(0, 280) ?? null,
        description: ogDescription?.slice(0, 600) ?? null,
        site_name: textValue(data.provider_name)?.slice(0, 80) ?? "TikTok",
        domain,
      },
    };
    return summary;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mergeTikTokSummaries(
  htmlSummary: UrlSummary | null,
  oEmbedSummary: UrlSummary | null,
  url: string,
): UrlSummary | null {
  if (!htmlSummary && !oEmbedSummary) return null;

  const htmlTitle = promptableTitle(htmlSummary?.title);
  const htmlOgTitle = promptableTitle(htmlSummary?.og.title);
  const oEmbedTitle = promptableTitle(oEmbedSummary?.title);
  const oEmbedOgTitle = promptableTitle(oEmbedSummary?.og.title);
  const summary: UrlSummary = {
    url,
    title: oEmbedTitle ?? htmlTitle,
    description: oEmbedSummary?.description ?? htmlSummary?.description ?? null,
    h1: htmlSummary?.h1 ?? null,
    // TikTok is always card-only. Do not retain hydration JSON as an excerpt
    // that a future caller could accidentally treat as video copy.
    body_excerpt: "",
    body_usable: false,
    fetched_chars: htmlSummary?.fetched_chars ?? 0,
    og: {
      image: oEmbedSummary?.og.image ?? htmlSummary?.og.image ?? null,
      title: oEmbedOgTitle ?? oEmbedTitle ?? htmlOgTitle ?? htmlTitle,
      description: oEmbedSummary?.og.description ?? htmlSummary?.og.description ?? null,
      site_name: oEmbedSummary?.og.site_name ?? htmlSummary?.og.site_name ?? "TikTok",
      domain: oEmbedSummary?.og.domain ?? htmlSummary?.og.domain ?? "tiktok.com",
    },
  };
  return hasMeaningfulUrlContent(summary) ? summary : null;
}

/** Fetch + extract structured page summary. Returns null on any failure. */
export async function fetchUrlSummary(url: string): Promise<UrlSummary | null> {
  const htmlSummary = await fetchHtmlSummary(url);
  if (isTikTokUrl(url)) {
    const oEmbedSummary = await fetchTikTokOEmbed(url);
    return mergeTikTokSummaries(htmlSummary, oEmbedSummary, url);
  }
  if (htmlSummary && hasMeaningfulUrlContent(htmlSummary)) return htmlSummary;
  return null;
}

async function fetchHtmlSummary(url: string): Promise<UrlSummary | null> {
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

    const title = promptableTitle(pluck(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
    const description =
      pluck(html, /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i) ||
      pluck(html, /<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i);
    const h1 = promptableTitle(pluck(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));

    // OG card extraction — these power FBLinkCard / IGLinkCard mockups so
    // users see the actual OG preview Facebook would auto-generate.
    const ogMeta = (prop: string) =>
      pluck(html, new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']`, "i")) ||
      pluck(html, new RegExp(`<meta\\s+name=["']${prop}["']\\s+content=["']([\\s\\S]*?)["']`, "i"));
    const ogImageRaw = ogMeta("og:image") || ogMeta("twitter:image") || ogMeta("twitter:image:src");
    const ogTitle = promptableTitle(ogMeta("og:title")) || title;
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
    const effectiveTextLength = fullText.replace(/\s/g, "").length;
    const effectiveUrl = res.url || url;
    const bodyUsable =
      !isLoginRequiredHost(url) &&
      !isLoginRequiredHost(effectiveUrl) &&
      effectiveTextLength >= MIN_USABLE_BODY_CHARS &&
      !LOGIN_OR_JS_SHELL_RE.test(fullText);

    return {
      url,
      title: title?.slice(0, 280) ?? null,
      description: description?.slice(0, 600) ?? null,
      h1: h1?.slice(0, 280) ?? null,
      body_excerpt: excerpt,
      body_usable: bodyUsable,
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
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Format a UrlSummary as a prompt-friendly block. */
export function formatUrlSummaryForPrompt(s: UrlSummary): string {
  const parts: string[] = [`【已抓取參考連結】${s.url}`];
  if (s.title)       parts.push(`標題：${s.title}`);
  if (s.description) parts.push(`描述：${s.description}`);
  if (s.body_usable === false) {
    if (s.h1) parts.push(`H1：${s.h1}`);
    if (s.og.title && s.og.title !== s.title) parts.push(`OG 標題：${s.og.title}`);
    if (s.og.description && s.og.description !== s.description) parts.push(`OG 描述：${s.og.description}`);
    if (s.og.site_name) parts.push(`OG 網站：${s.og.site_name}`);
    parts.push("只取得連結卡片層級資訊：請據此推論主題方向，不足處以品牌素材補足；不要臆造連結或影片細節，也不要在成品中說明抓取狀況。");
  } else {
    if (s.h1)          parts.push(`H1：${s.h1}`);
    if (s.body_excerpt) parts.push(`內文摘錄（前 ${s.body_excerpt.length} 字）：\n${s.body_excerpt}`);
    parts.push(`【務必基於以上連結內容生成 — 不要寫通用模板，要呼應這篇內容的具體訊息、故事、品牌獨特之處】`);
  }
  return parts.join("\n");
}
