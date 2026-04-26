/**
 * semrushScout — SEMrush public API.
 *
 * Tier: api_key (user supplies SEMrush API key — requires paid plan)
 * Strategy:
 *   For each keyword, call `?type=phrase_related&key=K&phrase=P&database=us`
 *   to get related keywords with search volume. Surfaces rising related
 *   queries as trending_topic items.
 *
 * SEMrush API returns CSV (semicolon-separated) by default.
 */

import type { Scout, ScoutContext, IntelItem } from "./types";

const MAX_QUERIES = 3;
const PER_QUERY_MAX = 6;

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(";").map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
    return row;
  });
}

export const semrushScout: Scout = {
  id: "semrush",
  label: "SEMrush",
  tier: "api_key",
  requiredTool: "semrush",

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const cred = await ctx.loadCred("semrush");
    const key = cred?.apiKey;
    if (!key) return [];

    const phrases = [...ctx.keywords, ...ctx.industryTags].slice(0, MAX_QUERIES);
    if (!phrases.length) return [];

    const items: IntelItem[] = [];
    for (const phrase of phrases) {
      try {
        const url = new URL("https://api.semrush.com/");
        url.searchParams.set("type", "phrase_related");
        url.searchParams.set("key", key);
        url.searchParams.set("phrase", phrase);
        url.searchParams.set("database", "us");
        url.searchParams.set("display_limit", String(PER_QUERY_MAX));
        url.searchParams.set("export_columns", "Ph,Nq,Cp,Co,Tr");
        const res = await fetch(url.toString());
        if (!res.ok) continue;
        const text = await res.text();
        if (text.startsWith("ERROR")) continue;
        const rows = parseCsv(text);
        for (const r of rows) {
          const related = r["Keyword"] || r["Ph"];
          const vol = Number(r["Search Volume"] || r["Nq"] || 0);
          if (!related) continue;
          items.push({
            key: `semrush:${phrase}:${related}`,
            type: "trending_topic",
            title: `「${related}」搜尋量 ${vol.toLocaleString()}/月（相關於「${phrase}」）`,
            content: `SEMrush 相關查詢 · CPC $${r["CPC"] ?? r["Cp"] ?? "0"}`,
            source: "SEMrush",
            url: `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(related)}`,
            publishedAt: new Date().toISOString().slice(0, 10),
            relevanceScore: Math.min(1, 0.4 + vol / 50_000),
            scoutId: "semrush",
          });
        }
      } catch {
        // Skip
      }
    }

    return items.slice(0, ctx.limit);
  },
};
