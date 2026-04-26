/**
 * perplexityScout — web-grounded LLM fetch via Perplexity sonar-pro.
 *
 * Tier: free (we pay the API cost, user doesn't auth)
 * Coverage: broadest — any publicly indexed news/blog/forum post.
 * Weakness: no login-walled sources (opview, meltwater, gwi); depends on
 *           Perplexity's own retrieval.
 */

import { invokeLLM } from "../llm";
import type { Scout, ScoutContext, IntelItem, IntelItemType } from "./types";

const ALLOWED: Set<IntelItemType> = new Set([
  "competitor_news",
  "trending_topic",
  "social_trend",
]);

export const perplexityScout: Scout = {
  id: "perplexity",
  label: "Perplexity 上網",
  tier: "free",

  async isAvailable(): Promise<boolean> {
    return !!process.env.PERPLEXITY_API_KEY;
  },

  async fetch(ctx: ScoutContext): Promise<IntelItem[]> {
    const { brandName, industry, keywords, competitors, industryTags, days, limit } = ctx;

    const system =
      "You are a marketing intel agent. Given a brand's watchlist, fetch RECENT real news/trend/social items " +
      "from the open web (search grounded). Prefer items within the last " + days + " days. " +
      "Return ONLY a JSON object: {\"items\":[{\"type\":\"competitor_news\"|\"trending_topic\"|\"social_trend\"," +
      "\"title\":string,\"content\":string (<=220 chars summary),\"source\":string (publisher/domain)," +
      "\"url\":string,\"publishedAt\":\"YYYY-MM-DD\" or ISO,\"relevanceScore\":0..1}]}. " +
      "Rules: no duplicate titles; each item must cite a real URL; content must reflect the article, not filler. " +
      "Mix types — aim ~50% competitor_news, ~30% trending_topic, ~20% social_trend. Cap at " + limit + " items.";

    const userMsg = [
      brandName ? `【Brand】${brandName}` : "",
      industry ? `【Industry】${industry}` : "",
      competitors.length ? `【Competitors to watch】${competitors.join(", ")}` : "",
      keywords.length ? `【Keywords】${keywords.join(", ")}` : "",
      industryTags.length ? `【Industry tags】${industryTags.join(", ")}` : "",
      `【Recency】past ${days} days`,
      `【Target】${limit} items`,
    ].filter(Boolean).join("\n");

    const result = await invokeLLM({
      provider: "perplexity",
      model: "sonar-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      maxTokens: 2400,
      responseFormat: { type: "json_object" },
    } as any);

    const rawContent = (result as any)?.choices?.[0]?.message?.content;
    const raw = typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
        : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const items = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);

    return (items as any[])
      .filter((x) => x && typeof x === "object" && ALLOWED.has(x.type) && typeof x.title === "string")
      .slice(0, limit)
      .map((x: any, idx: number) => ({
        key: `perplexity:${hashish((x.url as string) || (x.title as string))}-${idx}`,
        type: x.type,
        title: String(x.title).slice(0, 240),
        content: String(x.content ?? "").slice(0, 600),
        source: String(x.source ?? "").slice(0, 120) || "web",
        url: typeof x.url === "string" ? x.url.slice(0, 500) : undefined,
        publishedAt: typeof x.publishedAt === "string" ? x.publishedAt : undefined,
        relevanceScore: typeof x.relevanceScore === "number"
          ? Math.max(0, Math.min(1, x.relevanceScore))
          : 0.6,
        scoutId: "perplexity",
      }));
  },
};

function hashish(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
