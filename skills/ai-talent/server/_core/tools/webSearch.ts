/**
 * web_search tool — general web search with provider fallback chain.
 *
 * Provider priority:
 *   1. Serper.dev   (SERPER_API_KEY)   — $50/2500 queries, fastest
 *   2. Brave Search (BRAVE_API_KEY)    — free 2000/mo, decent quality
 *   3. DuckDuckGo HTML scrape          — free, no key, lower quality
 *
 * Returns up to `num` results as a numbered markdown list:
 *   1. Title — snippet (url)
 */

import { registerTool } from "./index";
import { addCitation } from "./citationStore";

const SERPER_KEY = process.env.SERPER_API_KEY ?? "";
const BRAVE_KEY = process.env.BRAVE_API_KEY ?? "";
const DEFAULT_NUM = 8;
const MAX_NUM = 15;
const TIMEOUT_MS = 8000;

interface SearchHit { title: string; url: string; snippet: string; }

async function searchSerper(query: string, num: number): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "x-api-key": SERPER_KEY, "content-type": "application/json" },
      body: JSON.stringify({ q: query, num }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`serper HTTP ${res.status}`);
    const data: any = await res.json();
    const organic: any[] = data.organic ?? [];
    return organic.slice(0, num).map(h => ({
      title: String(h.title ?? ""),
      url: String(h.link ?? ""),
      snippet: String(h.snippet ?? ""),
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function searchBrave(query: string, num: number): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${num}`;
    const res = await fetch(url, {
      headers: { "X-Subscription-Token": BRAVE_KEY, "accept": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`brave HTTP ${res.status}`);
    const data: any = await res.json();
    const web: any[] = data?.web?.results ?? [];
    return web.slice(0, num).map(h => ({
      title: String(h.title ?? ""),
      url: String(h.url ?? ""),
      snippet: String(h.description ?? ""),
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGo(query: string, num: number): Promise<SearchHit[]> {
  // Use the HTML endpoint (public, no key). Parse <a class="result__a"> + snippet sibling.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SoWork-Marketing-OS/1.0)",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ddg HTTP ${res.status}`);
    const html = await res.text();
    const hits: SearchHit[] = [];
    // Very lightweight parsing — good enough for top results
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html))) snippets.push(stripTags(sm[1]!));
    let lm: RegExpExecArray | null;
    let i = 0;
    while ((lm = linkRe.exec(html)) && hits.length < num) {
      let href = lm[1]!;
      // DDG wraps urls in /l/?uddg=... — unwrap
      const m = href.match(/uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]!);
      hits.push({
        title: stripTags(lm[2]!),
        url: href,
        snippet: snippets[i] ?? "",
      });
      i++;
    }
    return hits;
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

registerTool({
  name: "web_search",
  description:
    "Search the web and return the top results as a numbered list (title, snippet, URL). Use to find competitor brands, verify category conventions, discover industry benchmarks, or locate public content about a brand. Prefer narrow factual queries; do NOT use this when the user already gave a specific URL (use web_fetch instead).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query. Keep under 12 words." },
      num: {
        type: "number",
        description: `Number of results (default ${DEFAULT_NUM}, max ${MAX_NUM})`,
      },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = String(args.query ?? "").trim();
    if (!query) return "[tool_error] query is required";
    const num = Math.min(MAX_NUM, Math.max(1, Number(args.num ?? DEFAULT_NUM)));

    let hits: SearchHit[] = [];
    let providerUsed = "";
    const errors: string[] = [];

    const providers: Array<[string, () => Promise<SearchHit[]>]> = [];
    if (SERPER_KEY) providers.push(["serper", () => searchSerper(query, num)]);
    if (BRAVE_KEY) providers.push(["brave", () => searchBrave(query, num)]);
    providers.push(["duckduckgo", () => searchDuckDuckGo(query, num)]);

    for (const [name, fn] of providers) {
      try {
        hits = await fn();
        if (hits.length > 0) { providerUsed = name; break; }
      } catch (err: any) {
        errors.push(`${name}: ${err?.message ?? String(err)}`);
      }
    }

    if (hits.length === 0) {
      return `[tool_error] all search providers failed: ${errors.join(" | ") || "no results"}`;
    }

    // Record top 3 as citations (search-level, not page-level)
    if (ctx.sessionId) {
      for (const h of hits.slice(0, 3)) {
        addCitation(ctx.sessionId, {
          kind: "web_search",
          url: h.url,
          title: h.title,
          fetchedAt: new Date().toISOString(),
          excerpt: h.snippet,
          meta: { query, providerUsed },
        });
      }
    }

    const lines = [
      `Search: "${query}"  (provider: ${providerUsed}, ${hits.length} results)`,
      "",
      ...hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.url}`),
    ];
    return lines.join("\n");
  },
});
