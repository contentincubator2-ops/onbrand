/**
 * ahrefsScout — Ahrefs API v3.
 *
 * Tier: api_key (user supplies Ahrefs API token — requires paid Ahrefs plan)
 * Strategy:
 *   For each competitor domain, call
 *     GET https://api.ahrefs.com/v3/site-explorer/domain-rating
 *   to confirm auth, then
 *     GET /v3/site-explorer/top-pages?target=<domain>&limit=N
 *   Returns each top page as competitor_news with backlink-count as relevance.
 *
 * Notes:
 *   - Ahrefs expects the domain without protocol. We accept either a bare
 *     domain or a brand name; if it's not a domain, skip.
 */

import type { Scout, ScoutContext, IntelItem } from "./types";

const PER_TARGET_MAX = 5;
const MAX_TARGETS = 3;

function isLikelyDomain(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(s.trim());
}

export const ahrefsScout: Scout = {
  id: "ahrefs",
  label: "Ahrefs",
  tier: "api_key",
  requiredTool: "ahrefs",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("ahrefs");
    const token = cred?.apiKey;
    if (!token) return [];

    const targets = ctx.competitors
      .map((c) => c.toLowerCase().trim())
      .filter(isLikelyDomain)
      .slice(0, MAX_TARGETS);

    if (!targets.length) return [];

    const items: IntelItem[] = [];
    for (const domain of targets) {
      try {
        const url = new URL("https://api.ahrefs.com/v3/site-explorer/top-pages");
        url.searchParams.set("target", domain);
        url.searchParams.set("mode", "subdomains");
        url.searchParams.set("limit", String(PER_TARGET_MAX));
        url.searchParams.set("order_by", "traffic:desc");
        url.searchParams.set("select", "url,title,traffic,keywords");
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const pages = json?.pages ?? json?.data ?? [];
        for (const p of pages as any[]) {
          const pageUrl = p.url ?? p.page_url;
          const title = p.title ?? pageUrl;
          if (!pageUrl) continue;
          const traffic = Number(p.traffic ?? 0);
          items.push({
            key: `ahrefs:${domain}:${String(pageUrl).slice(0, 60)}`,
            type: "competitor_news",
            title: String(title).slice(0, 240),
            content: `${domain} 高流量頁面 · 預估月流量 ${traffic.toLocaleString()}`,
            source: `Ahrefs · ${domain}`,
            url: pageUrl,
            publishedAt: undefined,
            relevanceScore: Math.min(1, 0.5 + traffic / 100_000),
            scoutId: "ahrefs",
          });
        }
      } catch {
        // Skip target
      }
    }

    return items.slice(0, ctx.limit);
  },
};
