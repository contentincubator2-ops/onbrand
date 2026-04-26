/**
 * redditScout — Reddit public API via app-only OAuth (client_credentials).
 *
 * Tier: oauth_token (user supplies clientId + clientSecret from reddit.com/prefs/apps)
 * Strategy:
 *   1. POST /api/v1/access_token with Basic auth → bearer token
 *   2. /search?q=<kw>&sort=new&t=week (per keyword, up to N)
 */

import type { Scout, ScoutContext, IntelItem } from "./types";

const MAX_QUERIES = 5;
const PER_QUERY_MAX = 6;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "marketing-os/1.0 (by /u/marketing-os-bot)",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  if (!json?.access_token) return null;
  cachedToken = {
    token: json.access_token,
    expiresAt: now + (Number(json.expires_in ?? 3600) * 1000),
  };
  return cachedToken.token;
}

export const redditScout: Scout = {
  id: "reddit",
  label: "Reddit",
  tier: "api_key",
  requiredTool: "reddit",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("reddit");
    if (!cred?.clientId || !cred?.clientSecret) return [];

    const token = await getToken(cred.clientId, cred.clientSecret);
    if (!token) return [];

    const queries = [...ctx.competitors, ...ctx.keywords].slice(0, MAX_QUERIES);
    const windowParam = ctx.days <= 7 ? "week" : ctx.days <= 30 ? "month" : "year";

    const items: IntelItem[] = [];
    for (const q of queries) {
      try {
        const url = new URL("https://oauth.reddit.com/search");
        url.searchParams.set("q", q);
        url.searchParams.set("sort", "new");
        url.searchParams.set("t", windowParam);
        url.searchParams.set("limit", String(PER_QUERY_MAX));
        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "marketing-os/1.0 (by /u/marketing-os-bot)",
          },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        for (const child of (json?.data?.children ?? []) as any[]) {
          const d = child?.data;
          if (!d?.title) continue;
          items.push({
            key: `reddit:${d.id}`,
            type: "social_trend",
            title: String(d.title).slice(0, 240),
            content: String(d.selftext ?? "").slice(0, 400),
            source: `r/${d.subreddit ?? "reddit"}`,
            url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
            publishedAt: d.created_utc
              ? new Date(Number(d.created_utc) * 1000).toISOString()
              : undefined,
            relevanceScore: Math.min(1, Math.max(0.4, Number(d.score ?? 0) / 500)),
            scoutId: "reddit",
          });
        }
      } catch {
        // Skip failed query
      }
    }
    return items.slice(0, ctx.limit);
  },
};
