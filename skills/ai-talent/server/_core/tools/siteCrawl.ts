/**
 * site_crawl tool — fetch the root URL + up to N additional same-origin pages,
 * concatenate readable text. Designed for brand homepage + About + Product etc.
 *
 * Strategy:
 *   1. Fetch root URL → read <a href> tags
 *   2. Keep links that are same-origin and match common high-value paths
 *      (/about, /product, /service, /story, /mission, /manifesto, etc.)
 *   3. Fetch up to `maxPages` (default 4, max 8), concat as separate sections
 */

import { registerTool } from "./registry";
import { fetchReadable } from "../webFetcher";
import { addCitation } from "./citationStore";

const DEFAULT_MAX_PAGES = 4;
const MAX_PAGES = 8;

const HIGH_VALUE_PATH_PATTERNS = [
  /\/about/i, /\/story/i, /\/mission/i, /\/manifesto/i, /\/why/i,
  /\/product/i, /\/service/i, /\/solution/i, /\/offering/i,
  /\/brand/i, /\/values/i, /\/vision/i, /\/team/i,
  /\/pricing/i, /\/plans/i,
  /\/blog(\/|$)/i, /\/stories(\/|$)/i,
];

function extractLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const set = new Set<string>();
  const re = /<a[^>]+href="([^"#]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const href = m[1]!;
      const abs = new URL(href, baseUrl).toString();
      if (new URL(abs).origin !== origin) continue;
      set.add(abs);
    } catch { /* skip malformed */ }
  }
  return Array.from(set);
}

function scoreLink(url: string): number {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return 0; // already root
    for (const p of HIGH_VALUE_PATH_PATTERNS) if (p.test(path)) return 2;
    if (path.split("/").filter(Boolean).length <= 2) return 1; // shallow
    return -1;
  } catch { return -1; }
}

registerTool({
  name: "site_crawl",
  description:
    "Crawl a website's root URL + up to 4-8 high-value pages (About, Product, Story, Mission, etc.) and return concatenated readable text. Use this when you need a holistic view of a brand's self-description — homepage alone is usually insufficient. Prefer over repeated web_fetch calls.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Root URL of the site to crawl." },
      maxPages: {
        type: "number",
        description: `Max pages to fetch including root (default ${DEFAULT_MAX_PAGES}, max ${MAX_PAGES}).`,
      },
    },
    required: ["url"],
  },
  async execute(args, ctx) {
    const url = String(args.url ?? "").trim();
    if (!url) return "[tool_error] url is required";
    const maxPages = Math.min(MAX_PAGES, Math.max(1, Number(args.maxPages ?? DEFAULT_MAX_PAGES)));

    // 1) Fetch root
    const root = await fetchReadable(url);
    if (!root.ok) return `[tool_error] root fetch failed: ${root.error ?? "unknown"}`;

    // 2) Extract + rank links from root's raw HTML via a second fetch — but
    //    fetchReadable already parsed to text. Re-fetch HTML lightly for links.
    let linkCandidates: string[] = [];
    try {
      const htmlRes = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; SoWork-Marketing-OS/1.0)" },
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        linkCandidates = extractLinks(html, url);
      }
    } catch { /* non-fatal */ }

    const ranked = linkCandidates
      .map(u => ({ u, s: scoreLink(u) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.u);

    const picks: string[] = [];
    const seen = new Set<string>([new URL(root.finalUrl ?? url).toString()]);
    for (const u of ranked) {
      if (picks.length >= maxPages - 1) break;
      if (seen.has(u)) continue;
      seen.add(u);
      picks.push(u);
    }

    // 3) Fetch picks in parallel
    const pages = await Promise.all(picks.map(u => fetchReadable(u)));

    // 4) Record citations
    if (ctx.sessionId) {
      addCitation(ctx.sessionId, {
        kind: "site_crawl",
        url: root.finalUrl ?? url,
        title: root.title,
        fetchedAt: new Date().toISOString(),
        excerpt: (root.text ?? "").slice(0, 300),
        meta: { role: "root" },
      });
      for (const p of pages) {
        if (p.ok) {
          addCitation(ctx.sessionId, {
            kind: "site_crawl",
            url: p.finalUrl ?? p.url,
            title: p.title,
            fetchedAt: new Date().toISOString(),
            excerpt: (p.text ?? "").slice(0, 300),
          });
        }
      }
    }

    // 5) Assemble output
    const sections: string[] = [
      `Site crawl of ${url} — ${1 + pages.filter(p => p.ok).length} pages`,
      "",
      "── Root ──",
      `URL: ${root.finalUrl ?? url}`,
      root.title ? `Title: ${root.title}` : "",
      "",
      (root.text ?? "").slice(0, 4000),
    ];
    for (const p of pages) {
      if (!p.ok) {
        sections.push("", `── ${p.url} (failed: ${p.error ?? "unknown"}) ──`);
      } else {
        sections.push(
          "",
          `── ${p.finalUrl ?? p.url} ──`,
          p.title ? `Title: ${p.title}` : "",
          "",
          (p.text ?? "").slice(0, 3000),
        );
      }
    }
    return sections.filter(Boolean).join("\n");
  },
});
