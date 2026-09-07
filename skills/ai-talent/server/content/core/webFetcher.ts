/**
 * webFetcher.ts
 *
 * Real-world grounding for Squad Lead agents (Mary Allen et al.):
 *   1. Extract URLs from the user's latest message + recent history
 *   2. Fetch each URL (HTML → readable text, capped at 8KB per page)
 *   3. Return a formatted "grounded context" block to inject into the system prompt
 *
 * Why not full Anthropic-style tool-calling? The current streaming path only
 * yields text deltas — it doesn't surface tool_call deltas. A pre-pass fetch
 * gives us 90% of the value (no more hallucinated hero copy) with 10% of the
 * complexity. Full tool-loop stays as a follow-up.
 */

import { assertUrlSafe } from "./urlGuard";

const MAX_URLS_PER_TURN = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 500 * 1024; // 500KB hard cap on raw HTML
const MAX_READABLE_CHARS = 8000; // per-URL cap on text sent to LLM

const URL_RE = /https?:\/\/[^\s<>"'`)]+/gi;

// Block internal / private hosts + obvious non-HTML endpoints.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i,
  /\.local$/i,
];

const BLOCKED_EXTENSIONS = [
  ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz",
  ".mp3", ".mp4", ".mov", ".avi", ".wav",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".exe", ".dmg", ".pkg",
];

export interface FetchedPage {
  url: string;
  ok: boolean;
  title?: string;
  text?: string;
  error?: string;
  finalUrl?: string;
  statusCode?: number;
}

/** Extract unique URLs from a block of text. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const raw = text.match(URL_RE) ?? [];
  const cleaned = raw
    .map(u => u.replace(/[.,;:!?)\]}>"']+$/, "")) // strip trailing punctuation
    .filter(u => !isBlockedUrl(u));
  return Array.from(new Set(cleaned));
}

function isBlockedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (BLOCKED_HOST_PATTERNS.some(p => p.test(host))) return true;
    const path = u.pathname.toLowerCase();
    if (BLOCKED_EXTENSIONS.some(ext => path.endsWith(ext))) return true;
    return false;
  } catch {
    return true;
  }
}

/** Strip HTML tags, scripts, styles → readable plain text. */
function htmlToReadableText(html: string): { title?: string; text: string } {
  // Remove scripts/styles/noscript
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, " ");

  // Keep h1/h2/h3/p/li newlines by replacing tags with \n
  s = s
    .replace(/<\/(h[1-6]|p|li|div|section|article|header|footer|main|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ") // strip remaining tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return { title, text: s };
}

/** Fetch a single URL with timeout + size cap.
 *  SSRF-guarded: the initial URL and every redirect hop are validated with
 *  assertUrlSafe() (DNS-resolved private-range check). Redirects are followed
 *  MANUALLY (max 5) so each Location target is re-validated — `redirect:"follow"`
 *  would let a public host bounce us to an internal address unchecked. */
const MAX_REDIRECTS = 5;
export async function fetchReadable(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    let res: Response;
    for (let hop = 0; ; hop++) {
      try {
        await assertUrlSafe(current);
      } catch (e: any) {
        return { url, ok: false, error: e?.message ?? "blocked by SSRF guard" };
      }
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SoWork-OnBrand/1.0; +https://onbrand.sowork.ai)",
          "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "accept-language": "en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
        },
      });
      // Follow 3xx redirects manually, re-validating each target.
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop >= MAX_REDIRECTS) {
          return { url, ok: false, statusCode: res.status, error: "too many redirects" };
        }
        current = new URL(res.headers.get("location")!, current).toString();
        continue;
      }
      break;
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("html") && !ctype.includes("text/plain") && !ctype.includes("xml")) {
      return { url, ok: false, statusCode: res.status, error: `unsupported content-type: ${ctype}` };
    }

    if (!res.ok) {
      return { url, ok: false, statusCode: res.status, error: `HTTP ${res.status}` };
    }

    // Read with size cap
    const reader = res.body?.getReader();
    if (!reader) return { url, ok: false, error: "no body" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const raw = Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8");

    let parsed: { title?: string; text: string };
    if (ctype.includes("html") || ctype.includes("xml")) {
      parsed = htmlToReadableText(raw);
    } else {
      parsed = { text: raw.trim() };
    }

    const truncated = parsed.text.length > MAX_READABLE_CHARS
      ? parsed.text.slice(0, MAX_READABLE_CHARS) + "\n\n…（內文過長已截斷）"
      : parsed.text;

    return {
      url,
      ok: true,
      statusCode: res.status,
      finalUrl: res.url || current,
      title: parsed.title,
      text: truncated,
    };
  } catch (err: any) {
    return {
      url,
      ok: false,
      error: err?.name === "AbortError" ? "timeout" : (err?.message ?? String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Given the user's latest message + recent history, extract URLs and
 * fetch them. Returns a formatted context block to append to the system
 * prompt, or empty string if no URLs found.
 */
export async function buildGroundedContextFromUrls(
  userMessage: string,
  historyTexts: string[] = [],
): Promise<{ block: string; fetched: FetchedPage[] }> {
  const all = extractUrls([userMessage, ...historyTexts].join("\n"));
  const urls = all.slice(0, MAX_URLS_PER_TURN);
  if (urls.length === 0) return { block: "", fetched: [] };

  const results = await Promise.all(urls.map(u => fetchReadable(u)));

  const parts: string[] = [
    "【已自動抓取的網頁事實（你必須基於這些內容回答，禁止憑記憶或推測引述）】",
  ];
  for (const r of results) {
    if (r.ok && r.text) {
      parts.push(
        `\n── URL: ${r.url}${r.title ? `  |  Title: ${r.title}` : ""} ──\n${r.text}`,
      );
    } else {
      parts.push(
        `\n── URL: ${r.url} ── 抓取失敗（${r.error ?? "unknown"}）。你必須如實告訴用戶「我無法即時讀取這個網址」，不得憑記憶引述任何來自這個網站的文字。`,
      );
    }
  }
  return { block: parts.join("\n"), fetched: results };
}
