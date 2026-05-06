/**
 * socialListeningScout — 100s-tier real-data validation.
 *
 * Lightweight wrapper around the existing perplexityScout that asks:
 * "what are the highest-performing posts on {channel} for {topic} this month,
 *  and what patterns made them viral?"
 *
 * Output: prompt-injectable Chinese block summarising 3-5 viral patterns
 * (hooks, structures, lengths) for the LLM to reference. Returns null on
 * any failure — orchestra falls through to non-research mode.
 *
 * Cost: ~$0.05/call (Tavily) or free (Gemini grounding when key set).
 */

import { perplexityScout } from "./scouts/perplexityScout";
import type { ScoutContext } from "./scouts/types";

const SCOUT_TIMEOUT_MS = 12_000;

const CHANNEL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  email: "EDM",
  press: "新聞稿",
};

export interface ViralPatterns {
  channel: string;
  query: string;
  patterns: Array<{ title: string; source: string; excerpt: string }>;
  fetchedAt: string;
}

/** Build a synthetic ScoutContext for one-shot research. */
function buildCtx(args: {
  channel: string;
  topic: string;
  industry?: string;
  brandId?: number;
}): ScoutContext {
  const channelLabel = CHANNEL_LABELS[args.channel] ?? args.channel;
  const keywords = [
    `${channelLabel} 爆款`,
    `${channelLabel} viral posts ${args.industry ?? ""}`.trim(),
    args.topic.slice(0, 80),
  ].filter(Boolean);

  return {
    brandId: args.brandId ?? 0,
    brandName: "(orchestra)",
    industry: args.industry,
    keywords,
    competitors: [],
    industryTags: args.industry ? [args.industry] : [],
    days: 30,
    limit: 5,
    loadCred: async () => null, // perplexityScout falls back to Gemini/Tavily
  };
}

/**
 * Fetch viral content patterns for the given channel + topic.
 * Returns null if scout is unavailable (no API keys) — orchestra should
 * gracefully degrade to non-research output.
 */
export async function fetchViralPatterns(args: {
  channel: string;
  topic: string;
  industry?: string;
  brandId?: number;
}): Promise<ViralPatterns | null> {
  try {
    const ctx = buildCtx(args);
    const items = await Promise.race([
      perplexityScout.fetch(ctx),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCOUT_TIMEOUT_MS)),
    ]);
    if (!items || !Array.isArray(items) || items.length === 0) return null;

    return {
      channel: args.channel,
      query: ctx.keywords.join(" / "),
      patterns: items.slice(0, 5).map((it) => ({
        title: it.title,
        source: it.source,
        excerpt: (it.content ?? "").slice(0, 280),
      })),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Format a ViralPatterns block as prompt-injectable text. */
export function formatViralPatternsForPrompt(p: ViralPatterns): string {
  const channelLabel = CHANNEL_LABELS[p.channel] ?? p.channel;
  const lines: string[] = [
    `【${channelLabel} 近 30 天爆款 / 趨勢摘要】（real-data 100s tier — 從 ${p.patterns.length} 篇高互動內容萃取）`,
    `查詢：${p.query}`,
  ];
  p.patterns.forEach((it, i) => {
    lines.push(`${i + 1}. 【${it.source}】${it.title}`);
    if (it.excerpt) lines.push(`   ${it.excerpt}`);
  });
  lines.push(
    `【100s 規則】產出時請參考以上 hooks / 結構 / 長度，但不要照抄。` +
    `要寫得跟用戶品牌語氣一致，但 sturcure 借用爆款的成功要素。`,
  );
  return lines.join("\n");
}
