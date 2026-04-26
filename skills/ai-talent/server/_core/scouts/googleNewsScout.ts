/**
 * googleNewsScout — Browserbase-driven Google News scrape.
 *
 * Tier: free (no user auth required; runs in our Browserbase session)
 * Strategy: for each (competitor + top keyword) query, open
 *   https://news.google.com/search?q=<q>&hl=zh-TW&gl=TW&ceid=TW:zh-Hant
 * and harvest the article cards (<article> elements). Lightweight
 * fingerprint hit is fine for news.google.com.
 *
 * Caps: at most MAX_QUERIES queries per fetch to stay under budget.
 */

import { getBrowserProvider } from "../browser";
import type { Scout, ScoutContext, IntelItem } from "./types";

const MAX_QUERIES = 4;
const PER_QUERY_MAX = 6;

export const googleNewsScout: Scout = {
  id: "google-news",
  label: "Google 新聞",
  tier: "free",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const queries = selectQueries(ctx);
    if (!queries.length) return [];

    const provider = await getBrowserProvider();

    const items: IntelItem[] = [];
    await provider.run(
      async ({ page }) => {
        for (const q of queries) {
          try {
            const url = `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
            // Google News selectors change; stay high-level.
            const rows = await page.evaluate((cap: number) => {
              const out: Array<{ title: string; source: string; url: string; publishedAt: string | null }> = [];
              const articles = Array.from(document.querySelectorAll("article")).slice(0, cap * 3);
              for (const a of articles) {
                const titleEl = a.querySelector("a[href*='./articles'], a.JtKRv, h3 a, h4 a") as HTMLAnchorElement | null;
                const sourceEl = a.querySelector("div[data-n-tid]")
                  || a.querySelector("a[data-n-tid]")
                  || a.querySelector("div.vr1PYe, div.wEwyrc");
                const timeEl = a.querySelector("time");
                if (!titleEl || !titleEl.textContent) continue;
                const href = titleEl.getAttribute("href") || "";
                const absUrl = href.startsWith("http") ? href
                  : href.startsWith("./") ? `https://news.google.com${href.slice(1)}`
                  : `https://news.google.com/${href}`;
                out.push({
                  title: titleEl.textContent.trim(),
                  source: (sourceEl?.textContent ?? "Google News").trim(),
                  url: absUrl,
                  publishedAt: timeEl?.getAttribute("datetime") ?? null,
                });
                if (out.length >= cap) break;
              }
              return out;
            }, PER_QUERY_MAX);

            for (const r of rows) {
              items.push({
                key: `google-news:${hashish(r.url || r.title)}`,
                type: "competitor_news",
                title: r.title.slice(0, 240),
                content: "",
                source: r.source.slice(0, 120),
                url: r.url.slice(0, 500),
                publishedAt: r.publishedAt ?? undefined,
                relevanceScore: 0.65,
                scoutId: "google-news",
              });
            }
          } catch {
            // Skip this query, continue with the rest
          }
        }
        return null;
      },
      { timeoutMs: 90_000, label: "googleNewsScout" }
    );

    // Cross-query dedupe by URL
    const seen = new Set<string>();
    const deduped: IntelItem[] = [];
    for (const it of items) {
      const k = it.url || it.title;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(it);
      if (deduped.length >= ctx.limit) break;
    }
    return deduped;
  },
};

function selectQueries(ctx: ScoutContext): string[] {
  // Prefer competitor names first (most likely to produce news hits),
  // then industry tags + keywords.
  const q: string[] = [];
  for (const c of ctx.competitors) if (q.length < MAX_QUERIES) q.push(c);
  for (const k of ctx.keywords) if (q.length < MAX_QUERIES) q.push(k);
  for (const t of ctx.industryTags) if (q.length < MAX_QUERIES) q.push(t);
  return q.slice(0, MAX_QUERIES);
}

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
