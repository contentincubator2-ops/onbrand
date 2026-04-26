/**
 * similarwebScout — Similarweb Digital Intelligence API.
 *
 * Tier: api_key (user supplies Similarweb Enterprise/Digital Marketing API key)
 * Strategy:
 *   For each competitor domain, call
 *     GET /v1/website/:domain/total-traffic-and-engagement/visits
 *   to get past-N-month traffic. Returns one item per domain summarising
 *   traffic movement (up/down vs. previous period).
 */

import type { Scout, ScoutContext, IntelItem } from "./types";

const MAX_TARGETS = 4;

function isLikelyDomain(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(s.trim());
}

export const similarwebScout: Scout = {
  id: "similarweb",
  label: "Similarweb",
  tier: "api_key",
  requiredTool: "similarweb",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("similarweb");
    const apiKey = cred?.apiKey;
    if (!apiKey) return [];

    const targets = ctx.competitors
      .map((c) => c.toLowerCase().trim())
      .filter(isLikelyDomain)
      .slice(0, MAX_TARGETS);

    if (!targets.length) return [];

    // Similarweb returns monthly granularity; request last 3 months
    const end = new Date();
    const start = new Date(end);
    start.setMonth(end.getMonth() - 2);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const items: IntelItem[] = [];
    for (const domain of targets) {
      try {
        const url = new URL(
          `https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/total-traffic-and-engagement/visits`
        );
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("start_date", fmt(start));
        url.searchParams.set("end_date", fmt(end));
        url.searchParams.set("granularity", "monthly");
        url.searchParams.set("main_domain_only", "false");
        url.searchParams.set("format", "json");
        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        const series = (json?.visits ?? []) as Array<{ date: string; visits: number }>;
        if (series.length < 2) continue;
        const latest = series[series.length - 1]!;
        const prev = series[series.length - 2]!;
        const delta = prev.visits ? (latest.visits - prev.visits) / prev.visits : 0;
        const direction = delta >= 0 ? "上升" : "下降";
        items.push({
          key: `similarweb:${domain}:${latest.date}`,
          type: "competitor_news",
          title: `${domain} 流量${direction} ${Math.abs(delta * 100).toFixed(1)}%（${latest.date}）`,
          content: `最新月造訪 ${latest.visits.toLocaleString()} · 上月 ${prev.visits.toLocaleString()}`,
          source: `Similarweb · ${domain}`,
          url: `https://www.similarweb.com/website/${domain}/`,
          publishedAt: `${latest.date}-01`,
          relevanceScore: Math.min(1, 0.5 + Math.min(Math.abs(delta), 0.5)),
          scoutId: "similarweb",
        });
      } catch {
        // Skip target
      }
    }

    return items.slice(0, ctx.limit);
  },
};
