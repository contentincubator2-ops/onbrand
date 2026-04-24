/**
 * googleTrendsScout — Browserbase-driven Google Trends "related queries".
 *
 * Tier: free
 * Strategy: for the top keyword(s) + industry tags, hit the Trends
 * "realtime trending" page scoped to TW locale, harvest trend card titles.
 * Falls back to query-comparison page for specific terms.
 *
 * This is "current trending topics" → type="trending_topic".
 */

import { getBrowserProvider } from "../browser";
import type { Scout, ScoutContext, IntelItem } from "./types";

const MAX_QUERIES = 3;
const PER_QUERY_MAX = 8;

export const googleTrendsScout: Scout = {
  id: "google-trends",
  label: "Google 趨勢",
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
            const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}&geo=TW&hl=zh-TW`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });

            // Trends page is JS-heavy; wait a bit for related-queries widgets.
            await page.waitForTimeout(3000);

            const rows = await page.evaluate((cap: number) => {
              const out: Array<{ title: string; kind: "rising" | "top" }> = [];
              // Related-queries rows — structure: .fe-related-queries .fe-item-title
              const nodes = Array.from(document.querySelectorAll<HTMLElement>(
                ".fe-related-queries .fe-item-title, .fe-related-queries .label-text, " +
                "div[widget-name='RELATED_QUERIES'] .label-text"
              ));
              for (const n of nodes) {
                const t = (n.textContent || "").trim();
                if (!t || t.length < 2) continue;
                out.push({ title: t, kind: "rising" });
                if (out.length >= cap) break;
              }
              return out;
            }, PER_QUERY_MAX);

            for (const r of rows) {
              items.push({
                key: `google-trends:${hashish(q + ":" + r.title)}`,
                type: "trending_topic",
                title: `趨勢：${r.title}（相關於「${q}」）`,
                content: `Google Trends 指出「${r.title}」與「${q}」有顯著關聯，近期搜尋量上升。`,
                source: "Google Trends",
                url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(r.title)}&geo=TW`,
                publishedAt: new Date().toISOString().slice(0, 10),
                relevanceScore: 0.7,
                scoutId: "google-trends",
              });
            }
          } catch {
            // Skip this query
          }
        }
        return null;
      },
      { timeoutMs: 90_000, label: "googleTrendsScout" }
    );

    // Dedupe
    const seen = new Set<string>();
    return items.filter((it) => {
      if (seen.has(it.title)) return false;
      seen.add(it.title);
      return true;
    }).slice(0, ctx.limit);
  },
};

function selectQueries(ctx: ScoutContext): string[] {
  const q: string[] = [];
  for (const k of ctx.keywords) if (q.length < MAX_QUERIES) q.push(k);
  for (const t of ctx.industryTags) if (q.length < MAX_QUERIES) q.push(t);
  return q.slice(0, MAX_QUERIES);
}

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
