/**
 * youtubeDataScout — YouTube Data API v3.
 *
 * Tier: api_key (user supplies Google Cloud API key with YouTube Data API enabled)
 * Strategy: search.list for each competitor/keyword, restricted to past N days,
 *           order=date. Returns recent videos as competitor_news / social_trend.
 */

import type { Scout, ScoutContext, IntelItem } from "./types";

const PER_QUERY_MAX = 6;
const MAX_QUERIES = 5;

export const youtubeDataScout: Scout = {
  id: "youtube-data",
  label: "YouTube",
  tier: "api_key",
  requiredTool: "youtube_data",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("youtube_data");
    const apiKey = cred?.apiKey;
    if (!apiKey) return [];

    const queries: Array<{ q: string; type: IntelItem["type"] }> = [];
    for (const c of ctx.competitors.slice(0, 3)) queries.push({ q: c, type: "competitor_news" });
    for (const k of ctx.keywords.slice(0, 2)) queries.push({ q: k, type: "social_trend" });

    const publishedAfter = new Date(Date.now() - ctx.days * 86_400_000).toISOString();

    const items: IntelItem[] = [];
    for (const { q, type } of queries.slice(0, MAX_QUERIES)) {
      try {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("q", q);
        url.searchParams.set("type", "video");
        url.searchParams.set("order", "date");
        url.searchParams.set("publishedAfter", publishedAfter);
        url.searchParams.set("maxResults", String(PER_QUERY_MAX));
        url.searchParams.set("key", apiKey);
        const res = await fetch(url.toString());
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        for (const item of (json.items ?? []) as any[]) {
          const vid = item?.id?.videoId;
          const sn = item?.snippet;
          if (!vid || !sn) continue;
          items.push({
            key: `youtube-data:${vid}`,
            type,
            title: String(sn.title ?? "").slice(0, 240),
            content: String(sn.description ?? "").slice(0, 400),
            source: `YouTube · ${sn.channelTitle ?? ""}`.slice(0, 120),
            url: `https://www.youtube.com/watch?v=${vid}`,
            publishedAt: sn.publishedAt,
            relevanceScore: 0.7,
            scoutId: "youtube-data",
          });
        }
      } catch {
        // Skip failed query
      }
    }

    return items.slice(0, ctx.limit);
  },
};
