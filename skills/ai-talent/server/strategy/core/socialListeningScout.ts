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

import { perplexityScout } from "../../platform/core/scouts/perplexityScout";
import type { ScoutContext } from "../../platform/core/scouts/types";

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

/**
 * Scout query kind — drives what real-time data we fetch:
 *   - viral: 爆款 hooks / structures / 結構（預設）
 *   - festivals: 即將到來的節慶 / 假日 / 節日（給月曆任務用）
 *   - trending: 目前正熱的時事 / 梗 / 新聞（給時事改寫任務用）
 *   - news: 產業最新消息 / 趨勢預測（給 thought-leadership / quarterly 用）
 */
export type ScoutKind = "viral" | "festivals" | "trending" | "news";

/** Build a synthetic ScoutContext for one-shot research. */
function buildCtx(args: {
  channel: string;
  topic: string;
  industry?: string;
  brandId?: number;
  kind?: ScoutKind;
}): ScoutContext {
  const channelLabel = CHANNEL_LABELS[args.channel] ?? args.channel;
  const today = new Date();
  const monthYear = `${today.getFullYear()}年${today.getMonth() + 1}月`;
  const kind = args.kind ?? "viral";

  let keywords: string[];
  switch (kind) {
    case "festivals":
      keywords = [
        `${monthYear} 即將到來的節慶 假日 行銷檔期`,
        `台灣 ${monthYear} 節日 行事曆`,
        args.topic.slice(0, 80),
      ];
      break;
    case "trending":
      keywords = [
        `台灣 ${monthYear} 熱門時事 trending`,
        `${channelLabel} 最新熱搜話題`,
        args.topic.slice(0, 80),
      ];
      break;
    case "news":
      keywords = [
        `${args.industry ?? args.topic} 產業最新消息 ${monthYear}`,
        `${args.industry ?? args.topic} 趨勢分析`,
        args.topic.slice(0, 80),
      ];
      break;
    case "viral":
    default:
      keywords = [
        `${channelLabel} 爆款`,
        `${channelLabel} viral posts ${args.industry ?? ""}`.trim(),
        args.topic.slice(0, 80),
      ];
  }
  keywords = keywords.filter(Boolean);

  return {
    brandId: args.brandId ?? 0,
    brandName: "(orchestra)",
    industry: args.industry,
    keywords,
    competitors: [],
    industryTags: args.industry ? [args.industry] : [],
    days: 30,
    limit: 5,
    loadCred: async () => null,
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
  kind?: ScoutKind;
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
export function formatViralPatternsForPrompt(p: ViralPatterns, kind?: ScoutKind): string {
  const channelLabel = CHANNEL_LABELS[p.channel] ?? p.channel;
  const titleByKind: Record<ScoutKind, string> = {
    viral: `${channelLabel} 近 30 天爆款 / 趨勢摘要`,
    festivals: `近期節慶 / 假日 / 行銷檔期（即時抓取）`,
    trending: `目前熱門時事 / 梗 / 話題（即時抓取）`,
    news: `產業最新消息 / 趨勢（即時抓取）`,
  };
  const ruleByKind: Record<ScoutKind, string> = {
    viral: `產出時請參考以上 hooks / 結構 / 長度，但不要照抄。要扣回用戶品牌語氣，借用爆款結構要素。`,
    festivals: `產出時請扣回**真實即將到來的節慶**，不要編造節日。內容月曆要安排到對的日期。`,
    trending: `產出時請**扣回真實時事**，不要寫通用內容。時事是 hook，品牌是 punchline。`,
    news: `產出時請扣回**產業真實最新消息**，可引用具體數字 / 公司 / 案例。不要寫成通用 thought-leadership。`,
  };
  const k = kind ?? "viral";
  const lines: string[] = [
    `【${titleByKind[k]}】（real-data 100s tier — 從 ${p.patterns.length} 條真實資料萃取）`,
    `查詢：${p.query}`,
  ];
  p.patterns.forEach((it, i) => {
    lines.push(`${i + 1}. 【${it.source}】${it.title}`);
    if (it.excerpt) lines.push(`   ${it.excerpt}`);
  });
  lines.push(`【100s 規則】${ruleByKind[k]}`);
  return lines.join("\n");
}
