/**
 * searchSquads — shared search + ranking for squad / agent / skill catalogs.
 *
 * Used by both PickerWorkspace and MissionsHome. Replaces ad-hoc
 * boolean filter functions with score-based ranking + platform/layer
 * auto-detection from free-text queries.
 *
 * Core fix from PR6 (2026-04-28): typing "facebook 月度計畫" used to
 * miss the Facebook calendar squad because:
 *   1. SEARCH_SYNONYMS had no "計畫"/"行事曆"/"calendar" group
 *   2. boolean filter — every match equally weighted, so workspace
 *      match didn't bubble up
 *   3. no auto-detection of platform/layer in query
 */
import { pickLocaleText } from "../../lib/localizeText";

/* ─────────────────────── Synonym groups (expanded) ──────────────────── */

export const SEARCH_SYNONYMS: Array<string[]> = [
  // Posting & content
  ["貼文", "po文", "post", "posts", "content", "social-media", "social media"],
  ["文案", "copy", "copywriting", "copywrite", "ad copy"],
  ["廣告", "ad", "ads", "advertising", "paid", "paid-ads", "campaign-ads", "promoted"],
  ["影片", "短影音", "影音", "video", "videos", "reels", "shorts", "tiktok"],
  // Brand & strategy
  ["品牌", "brand", "branding", "brand-positioning"],
  ["定位", "positioning"],
  ["上市", "發表", "上線", "發佈", "launch", "launching", "go-to-market", "gtm", "release"],
  ["受眾", "客群", "audience", "persona", "icp", "segmentation"],
  ["公關", "媒體", "pr", "public-relations", "press", "media-relations"],
  ["電子報", "edm", "email", "newsletter", "mailer"],
  ["互動", "engagement", "engage"],
  ["故事", "說故事", "敘事", "story", "stories", "限動", "storytelling", "narrative"],
  ["分析", "research", "analysis", "audit"],
  ["策略", "strategy", "strategic", "plan"],
  ["活動", "campaign", "event"],
  ["驗證", "validation", "audit", "scorecard", "monitor"],
  ["創意", "創作", "creative"],
  // PR6 additions — calendar / planning / cadence
  ["行事曆", "月行事曆", "週行事曆", "calendar", "schedule", "排程", "scheduling"],
  ["月度", "月計畫", "月度計畫", "月度經營", "計畫", "計劃", "planning", "monthly", "month"],
  ["週", "週計畫", "weekly", "week"],
  ["年度", "年計畫", "annual", "yearly"],
  ["季度", "季計畫", "quarterly", "quarter"],
  // PR6 additions — visual assets
  ["縮圖", "thumbnail", "thumb", "cover", "封面"],
  ["大頭照", "頭像", "profile picture", "avatar", "profile-pic", "頭貼"],
  ["輪播", "carousel", "slides"],
  ["主題標籤", "標籤", "hashtag", "hashtags", "tag"],
  // PR6 additions — content formats
  ["長文", "深度文", "article", "long-form", "深度文章"],
  ["問答", "qa", "q&a", "faq"],
  ["教學", "tutorial", "guide", "how-to"],
  ["直播", "live", "livestream"],
  // Funnel & metrics
  ["流量", "traffic", "reach", "曝光"],
  ["轉換", "轉換率", "conversion", "convert"],
  ["留存", "retention", "活躍"],
  ["KPI", "kpi", "指標", "metric", "metrics", "成效"],
];

export function expandSynonyms(q: string): string[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out = new Set<string>([ql]);
  // Tokenize (CJK doesn't split on whitespace cleanly; keep both whole + tokens)
  const tokens = ql.split(/[\s,;、，]+/).filter(Boolean);
  for (const tok of tokens) out.add(tok);
  for (const group of SEARCH_SYNONYMS) {
    for (const term of [...tokens, ql]) {
      if (group.some((g) => term.includes(g.toLowerCase()) || g.toLowerCase().includes(term))) {
        for (const g of group) out.add(g.toLowerCase());
      }
    }
  }
  return [...out];
}

/* ─────────────────── Platform & layer auto-detection ────────────────── */

const PLATFORM_PATTERNS: Array<{ platform: string; patterns: RegExp[] }> = [
  { platform: "instagram", patterns: [/\binstagram\b/i, /\big\b/i, /reels?/i, /限動/, /stories?/i] },
  { platform: "tiktok",    patterns: [/\btiktok\b/i, /\btt\b/i, /抖音/, /douyin/i] },
  { platform: "youtube",   patterns: [/\byoutube\b/i, /\byt\b/i, /shorts?/i, /youtu\.be/i] },
  { platform: "linkedin",  patterns: [/\blinkedin\b/i, /\bli\b/i, /個人品牌/, /公司頁面/] },
  { platform: "facebook",  patterns: [/\bfacebook\b/i, /\bfb\b/i, /messenger/i, /meta-fb/i] },
  { platform: "email",     patterns: [/\bedm\b/i, /\bemail\b/i, /電子報/, /newsletter/i] },
  { platform: "pr",        patterns: [/\bpr\b/i, /公關/, /press/i, /media[ -]relations/i, /新聞稿/] },
];

const LAYER_PATTERNS: Array<{ layer: string; patterns: RegExp[] }> = [
  { layer: "L1", patterns: [/訪談稿|swot|競品|原型卡|interview|competitor|archetype/i] },
  { layer: "L2", patterns: [/產品|定價|產品卡|fab|vp.?canvas|pricing|product/i] },
  { layer: "L3", patterns: [/persona|icp|旅程圖|區隔|segment|journey/i] },
  { layer: "L4", patterns: [/行事曆|月度|月計畫|貼文|reels?|shorts|限動|carousel|calendar|monthly|post|hashtag/i] },
  { layer: "L5", patterns: [/kpi|預算|甘特|風險|budget|gantt|risk/i] },
  { layer: "L6", patterns: [/監測|稽核|audit|事件|對標|benchmark|monitor/i] },
];

export function detectPlatform(q: string): string | null {
  for (const { platform, patterns } of PLATFORM_PATTERNS) {
    if (patterns.some((p) => p.test(q))) return platform;
  }
  return null;
}

export function detectLayer(q: string): string | null {
  for (const { layer, patterns } of LAYER_PATTERNS) {
    if (patterns.some((p) => p.test(q))) return layer;
  }
  return null;
}

const CHANNEL_ALIASES: Record<string, string[]> = {
  facebook:  ["facebook", "fb", "meta-fb", "fb-page", "fb-ads"],
  instagram: ["instagram", "ig", "ig-reels", "ig-feed"],
  linkedin:  ["linkedin", "li", "linkedin-post"],
  youtube:   ["youtube", "yt", "shorts", "yt-shorts"],
  tiktok:    ["tiktok", "tt", "douyin"],
  pr:        ["pr", "public-relations", "media-relations", "press"],
  email:     ["email", "edm", "newsletter", "mailer"],
};

export function squadMatchesPlatform(squad: any, platform: string): boolean {
  if (!platform) return false;
  const aliases = CHANNEL_ALIASES[platform] ?? [platform];
  const wsArr = Array.isArray(squad.workspace) ? squad.workspace : (squad.workspace ? [squad.workspace] : []);
  const tagArr = Array.isArray(squad.tags) ? squad.tags : [];
  const haystack = [
    ...wsArr, ...tagArr, squad.slug,
    pickLocaleText(squad.name, "en"), pickLocaleText(squad.name, "zh-TW"),
  ].filter(Boolean).join(" ").toLowerCase();
  return aliases.some((a) => haystack.includes(a));
}

/* ─────────────────────────── Scoring ─────────────────────────────── */

export interface SearchHit {
  squad: any;
  score: number;
  /** True when score is high enough to highlight as "best match" */
  isBestMatch: boolean;
}

const BEST_MATCH_THRESHOLD = 60;

/**
 * Score how well a squad matches a query. Higher = better.
 * Workspace match dominates; precise outputType/tag matches add a lot;
 * fuzzy matches in name/description/methodology add a little.
 */
export function scoreSquad(
  squad: any,
  query: string,
  opts: { detectedPlatform?: string | null; detectedLayer?: string | null } = {},
): number {
  if (!query.trim()) return 0;
  const terms = expandSynonyms(query);
  if (terms.length === 0) return 0;

  let score = 0;

  // Platform match (highest weight)
  if (opts.detectedPlatform && squadMatchesPlatform(squad, opts.detectedPlatform)) {
    score += 40;
  }

  // Layer match
  if (opts.detectedLayer) {
    const lk = (squad.strategyLayer ?? "").toString().slice(0, 2);
    if (lk === opts.detectedLayer) score += 20;
  }

  const containsAny = (text: string | undefined | null): number => {
    if (!text) return 0;
    const lower = String(text).toLowerCase();
    return terms.filter((t) => lower.includes(t)).length;
  };

  // Field weights
  const weights: Array<{ field: string; value: any; weight: number; cap?: number }> = [
    // PR6 / Q2 — explicit LLM-classified task label is the highest-signal field
    { field: "taskLabel",     value: (squad.taskLabel ?? squad.task_label_zh ?? "") + " " + (squad.taskLabelEn ?? squad.task_label_en ?? ""), weight: 30, cap: 60 },
    { field: "outputFormats", value: Array.isArray(squad.outputFormats) ? squad.outputFormats.join(" ") : "", weight: 18, cap: 36 },
    { field: "name_zh",       value: pickLocaleText(squad.name, "zh-TW"),                                     weight: 16, cap: 32 },
    { field: "name_en",       value: pickLocaleText(squad.name, "en"),                                        weight: 12, cap: 24 },
    { field: "tags",          value: Array.isArray(squad.tags) ? squad.tags.join(" ") : "",                    weight: 10, cap: 30 },
    { field: "useCases",      value: Array.isArray(squad.useCases) ? squad.useCases.join(" ") : "",            weight: 10, cap: 30 },
    { field: "workspace",     value: Array.isArray(squad.workspace) ? squad.workspace.join(" ") : (squad.workspace ?? ""), weight: 8, cap: 16 },
    { field: "slug",          value: squad.slug,                                                              weight: 8,  cap: 16 },
    { field: "description",   value: pickLocaleText(squad.description, "zh-TW") ?? pickLocaleText(squad.description, "en") ?? "", weight: 4, cap: 16 },
    { field: "methodology",   value: squad.methodology?.author + " " + (squad.methodology?.summary ?? ""),    weight: 4,  cap: 12 },
  ];

  for (const w of weights) {
    const hits = containsAny(w.value);
    if (hits === 0) continue;
    score += Math.min(hits * w.weight, w.cap ?? 999);
  }

  // Step text — small per-step weight
  if (Array.isArray(squad.steps)) {
    const stepText = squad.steps.map((st: any) => `${st.name ?? ""} ${st.description ?? ""} ${st.outputType ?? ""}`).join(" ");
    const stepHits = containsAny(stepText);
    score += Math.min(stepHits * 3, 18);
  }

  // Member text — small
  if (Array.isArray(squad.members)) {
    const memText = squad.members.map((m: any) => `${m.name ?? ""} ${m.role ?? ""} ${m.primarySkill ?? ""}`).join(" ");
    const memHits = containsAny(memText);
    score += Math.min(memHits * 2, 8);
  }

  return score;
}

/* ─────────────────────────── Public API ──────────────────────────── */

export interface SearchResult {
  hits: SearchHit[];
  detectedPlatform: string | null;
  detectedLayer: string | null;
}

/**
 * Score + rank squads against a query. Returns ALL squads with their
 * score (0 for non-matches when query is set). Caller filters by
 * score>0 if they only want hits.
 *
 * When query is empty, all results have score=0; caller can sort by
 * other criteria (recency / layer).
 */
export function searchAndRankSquads(squads: any[], query: string): SearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      hits: squads.map((s) => ({ squad: s, score: 0, isBestMatch: false })),
      detectedPlatform: null,
      detectedLayer: null,
    };
  }

  const detectedPlatform = detectPlatform(trimmed);
  const detectedLayer = detectLayer(trimmed);

  const scored: SearchHit[] = squads
    .map((s) => {
      const score = scoreSquad(s, trimmed, { detectedPlatform, detectedLayer });
      return { squad: s, score, isBestMatch: score >= BEST_MATCH_THRESHOLD };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  return { hits: scored, detectedPlatform, detectedLayer };
}
