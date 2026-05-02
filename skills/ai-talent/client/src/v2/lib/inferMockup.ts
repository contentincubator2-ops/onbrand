/**
 * inferMockup — given a squad / agent / skill, decide which platform
 * mockup variant to render in the /picker middle preview.
 *
 * Heuristic ladder (highest priority first):
 *   1. Explicit override field (squad.mockup / agent.mockup / skill.mockup)
 *   2. Format keywords (slug, name, outputFormats, tags) → reels/story/etc
 *   3. Platform keywords (workspace[], slug, name, tags) → ig/fb/li/yt/tt
 *   4. Skill task_type → format hint (image / video / text)
 *   5. Generic fallback
 *
 * The full PlatformMockup component family will switch on
 * { platform, format } to pick the right sub-component.
 */

export type Platform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "youtube"
  | "tiktok"
  | "generic";

export type Format =
  // shared
  | "feed"            // standard image post
  | "carousel"        // multi-image swipe
  | "reel"            // 9:16 vertical video
  | "story"           // 9:16 ephemeral
  | "live"            // live stream w/ LIVE chip
  | "profile"         // 3-col thumbnail grid
  | "ad"              // promoted/sponsored variant
  // YouTube
  | "video-card"      // thumbnail + title in feed
  | "watch"           // watch page (player + meta)
  | "shorts"          // 9:16 short
  | "community"       // text post
  | "premiere"        // countdown thumbnail
  // LinkedIn
  | "article"         // longform article
  | "newsletter"      // issue card
  | "poll"            // radio + progress
  | "document"        // PDF carousel
  | "native-video"    // video post
  // Facebook
  | "marketplace"     // listing card
  | "event"           // event card
  // TikTok
  | "foryou"          // FYP video w/ side action rail
  // fallback
  | "generic";

export interface MockupVariant {
  platform: Platform;
  format: Format;
  /** Human-readable label for badges / debug */
  label: string;
}

const VARIANT_LABELS: Record<string, string> = {
  "instagram:feed":       "Instagram 貼文",
  "instagram:carousel":   "Instagram 輪播",
  "instagram:reel":       "Instagram Reels",
  "instagram:story":      "Instagram 限動",
  "instagram:live":       "Instagram 直播",
  "instagram:profile":    "Instagram 個人檔案",
  "instagram:ad":         "Instagram 廣告",
  "facebook:feed":        "Facebook 貼文",
  "facebook:reel":        "Facebook Reel",
  "facebook:story":       "Facebook 限動",
  "facebook:marketplace": "Facebook Marketplace",
  "facebook:event":       "Facebook 活動",
  "facebook:ad":          "Facebook 廣告",
  "facebook:carousel":    "Facebook 輪播廣告",
  "linkedin:feed":        "LinkedIn 貼文",
  "linkedin:article":     "LinkedIn 文章",
  "linkedin:newsletter":  "LinkedIn 電子報",
  "linkedin:poll":        "LinkedIn 投票",
  "linkedin:document":    "LinkedIn 文件",
  "linkedin:native-video":"LinkedIn 原生影片",
  "linkedin:ad":          "LinkedIn 推廣貼文",
  "linkedin:event":       "LinkedIn 活動",
  "youtube:video-card":   "YouTube 影片卡",
  "youtube:watch":        "YouTube 觀看頁",
  "youtube:shorts":       "YouTube Shorts",
  "youtube:community":    "YouTube 社群貼文",
  "youtube:premiere":     "YouTube 首播",
  "youtube:live":         "YouTube 直播",
  "tiktok:foryou":        "TikTok For You",
  "tiktok:carousel":      "TikTok 圖文",
  "tiktok:live":          "TikTok 直播",
  "tiktok:profile":       "TikTok 個人檔案",
  "generic:generic":      "通用輸出",
};

const labelOf = (p: Platform, f: Format) =>
  VARIANT_LABELS[`${p}:${f}`] ?? `${p} · ${f}`;

const variant = (platform: Platform, format: Format): MockupVariant =>
  ({ platform, format, label: labelOf(platform, format) });

/* ───────────────── helpers ───────────────── */

const norm = (s: any): string => String(s ?? "").toLowerCase();

const collectHaystack = (entity: any): string => {
  if (!entity) return "";
  const arr = (v: any): string[] => Array.isArray(v) ? v : v ? [String(v)] : [];
  return [
    norm(entity.slug),
    norm(entity.name),
    norm(typeof entity.name === "object" ? entity.name?.["zh-TW"] || entity.name?.en : ""),
    norm(entity.title),
    norm(entity.specialty),
    norm(entity.primarySkill),
    norm(entity.description),
    norm(entity.task_type),
    norm(entity.taskType),
    ...arr(entity.workspace).map(norm),
    ...arr(entity.tags).map(norm),
    ...arr(entity.outputFormats).map(norm),
    ...arr(entity.useCases).map(norm),
  ].filter(Boolean).join(" ");
};

/* ───────────────── platform detection ───────────────── */

const PLATFORM_KEYWORDS: Array<[Platform, string[]]> = [
  ["instagram", ["instagram", "ig-", "ig_", " ig ", "reels", "限動", "stories"]],
  ["tiktok",    ["tiktok", "tt-", "douyin", "抖音", "for you"]],
  ["youtube",   ["youtube", "yt-", "shorts", "youtu.be"]],
  ["linkedin",  ["linkedin", "li-", "公司頁面", "個人品牌"]],
  ["facebook",  ["facebook", "fb-", "fb_", " fb ", "meta-fb", "messenger"]],
];

function detectPlatform(haystack: string): Platform {
  for (const [p, kws] of PLATFORM_KEYWORDS) {
    if (kws.some((kw) => haystack.includes(kw))) return p;
  }
  return "generic";
}

/* ───────────────── format detection ───────────────── */

interface FormatRule {
  format: Format;
  /** keywords that pin this format (lowercase) */
  keywords: string[];
  /** which platforms allow this format (empty = any) */
  platforms?: Platform[];
}

const FORMAT_RULES: FormatRule[] = [
  // ── Calendar / monthly plan → feed (must be first so "article" in squad
  //    description doesn't hijack a calendar squad to article format) ──────
  { format: "feed", keywords: ["月行事曆", "monthly-calendar", "monthly calendar", "行事曆排程"], platforms: ["linkedin", "instagram", "facebook"] },
  // 9:16 vertical
  { format: "reel",         keywords: ["reel", "reels"],                       platforms: ["instagram", "facebook"] },
  { format: "shorts",       keywords: ["short", "shorts"],                     platforms: ["youtube"] },
  { format: "foryou",       keywords: ["foryou", "for you", "fyp", "tiktok"],  platforms: ["tiktok"] },
  // ephemeral
  { format: "story",        keywords: ["story", "stories", "限動"],             platforms: ["instagram", "facebook"] },
  // long-form
  { format: "article",      keywords: ["article", "longform", "長文", "blog"], platforms: ["linkedin"] },
  { format: "newsletter",   keywords: ["newsletter", "電子報", "issue"],        platforms: ["linkedin"] },
  // YouTube specials
  { format: "watch",        keywords: ["watch", "video page", "觀看頁"],         platforms: ["youtube"] },
  { format: "community",    keywords: ["community post", "社群貼文"],            platforms: ["youtube"] },
  { format: "premiere",     keywords: ["premiere", "首播", "countdown"],         platforms: ["youtube"] },
  { format: "live",         keywords: ["live", "直播", "livestream"]                                              },
  // LinkedIn specials
  { format: "poll",         keywords: ["poll", "投票"],                          platforms: ["linkedin"] },
  { format: "document",     keywords: ["document", "pdf", "文件"],               platforms: ["linkedin"] },
  { format: "native-video", keywords: ["native video", "原生影片"],              platforms: ["linkedin"] },
  // FB specials
  { format: "marketplace",  keywords: ["marketplace", "listing"],               platforms: ["facebook"] },
  { format: "event",        keywords: ["event", "活動"],                         platforms: ["facebook", "linkedin"] },
  // ads
  { format: "ad",           keywords: ["ad ", "ads", "advert", "廣告", "sponsored", "promoted"] },
  // multi-image
  { format: "carousel",     keywords: ["carousel", "multi-image", "輪播", "圖文"] },
  // profile
  { format: "profile",      keywords: ["profile", "個人檔案", "channel page", "頻道頁"] },
];

const PLATFORM_DEFAULT_FORMAT: Record<Platform, Format> = {
  instagram: "feed",
  facebook:  "feed",
  linkedin:  "feed",
  youtube:   "video-card",
  tiktok:    "foryou",
  generic:   "generic",
};

function detectFormat(haystack: string, platform: Platform): Format {
  for (const rule of FORMAT_RULES) {
    if (rule.platforms && !rule.platforms.includes(platform)) continue;
    if (rule.keywords.some((kw) => haystack.includes(kw))) return rule.format;
  }
  return PLATFORM_DEFAULT_FORMAT[platform];
}

/* ───────────────── public API ───────────────── */

/**
 * Infer mockup variant from a squad object. Falls back to generic when
 * no platform / format keywords match.
 */
export function inferMockupVariant(squad: any): MockupVariant {
  // 1. Explicit override
  const ov = squad?.mockup;
  if (ov?.platform && ov?.format) {
    return variant(ov.platform as Platform, ov.format as Format);
  }
  if (!squad) return variant("generic", "generic");

  const haystack = collectHaystack(squad);
  const platform = detectPlatform(haystack);
  const format = detectFormat(haystack, platform);

  return variant(platform, format);
}

/**
 * Infer mockup variant from an agent. Agents work on multiple formats;
 * we pick the most distinctive one mentioned in title/specialty.
 */
export function inferMockupVariantFromAgent(agent: any): MockupVariant {
  return inferMockupVariant(agent);
}

/**
 * Infer mockup variant from a skill. Skills have task_type
 * (text/image/code/search/audio/video/multimodal/embedding) which we
 * map to a likely format hint.
 */
export function inferMockupVariantFromSkill(skill: any): MockupVariant {
  // First try keyword match in name/tags
  const v = inferMockupVariant(skill);
  if (v.platform !== "generic") return v;

  // task_type fallback
  const tt = norm(skill?.task_type ?? skill?.taskType);
  if (tt === "video") return variant("instagram", "reel");
  if (tt === "image") return variant("instagram", "feed");
  if (tt === "audio") return variant("youtube", "video-card");
  // text / code / search / embedding / multimodal → generic
  return variant("generic", "generic");
}

/** All possible variants (for admin / debug) */
export function getAllVariants(): MockupVariant[] {
  return Object.keys(VARIANT_LABELS).map((k) => {
    const [p, f] = k.split(":");
    return variant(p as Platform, f as Format);
  });
}

/**
 * Top variants per platform, ordered by user preference. Used in
 * PickerWorkspace to render a variant switcher Tabs row so the user
 * can preview the same squad in different formats.
 */
const PLATFORM_TOP_VARIANTS: Record<Platform, Format[]> = {
  instagram: ["feed", "carousel", "reel", "story", "profile"],
  facebook:  ["feed", "reel", "story", "event", "marketplace"],
  linkedin:  ["feed", "article", "newsletter", "poll", "document"],
  youtube:   ["video-card", "watch", "shorts", "community"],
  tiktok:    ["foryou", "profile"],
  generic:   ["generic"],
};

export function getVariantsForPlatform(platform: Platform): MockupVariant[] {
  return PLATFORM_TOP_VARIANTS[platform].map((f) => variant(platform, f));
}

/**
 * Classify a squad step as "strategic" (research / analysis /
 * brand context / framework — should render as a Word doc) vs
 * "content" (caption / image / hashtag — should render as the
 * platform mockup).
 */
/**
 * Step kind taxonomy:
 *   - "strategic"  → SWOT / persona / framework / report. Renders as DocMockup.
 *   - "content"    → caption / hashtag / hook / title. Feeds PlatformMockup.
 *   - "image"      → KV / banner / cover / thumbnail / carousel image.
 *                    Routes through MediaGenFlow (3-step) instead of plain LLM.
 *   - "video"      → reel / short / TVC / spokesperson clip.
 *                    Routes through MediaGenFlow (3-step) for video models.
 *
 * Per CJ direction 2026-04-29: any image/video output MUST go through the
 * 3-step flow (設計方向 → AI prompt → 模型選擇), so squad-runner detects
 * visual steps here and swaps the middle preview to MediaGenFlow inline.
 */
export type StepKind = "strategic" | "content" | "image" | "video";

const STRATEGIC_KEYWORDS = [
  "research", "researcher", "analysis", "analyst", "audit",
  "swot", "persona", "icp", "brand", "context", "interview",
  "competitor", "competitive", "strategy", "strategic", "plan",
  "planning", "brief", "outline", "framework", "insight",
  "positioning", "methodology", "doc", "document", "report",
  "scorecard", "matrix", "mapping", "journey",
  // zh
  "研究", "分析", "策略", "框架", "計畫", "計劃", "報告",
  "訪談", "競品", "定位", "脈絡", "洞察", "矩陣", "藍圖",
  "規劃", "盤點", "稽核",
];

// Visual-output keywords. Order matters: video patterns are checked first
// so that "reel video" doesn't fall through to "image".
const VIDEO_KEYWORDS = [
  "video", "reel", "short", "tvc", "footage", "clip",
  "i2v", "t2v", "motion", "animation", "spokesperson",
  "影片", "短片", "短影音", "腳本影片", "動畫", "動態",
];
const IMAGE_KEYWORDS = [
  "image", "visual", "kv", "banner", "thumbnail", "cover",
  "carousel", "poster", "logo", "illustration", "graphic",
  "圖像", "視覺", "主視覺", "封面", "縮圖", "海報",
  "插畫", "圖卡", "圖文", "圖示",
];

/**
 * Aggregated content fields produced by content-classified squad steps.
 * Each variant of PlatformMockup picks up whichever fields are
 * relevant and renders them in place of skeletons.
 */
export interface AggregatedMockupFields {
  caption?: string;
  hashtags?: string[];
  title?: string;
  description?: string;
  imageDesc?: string;
  videoDesc?: string;
  cta?: string;
}

const FIELD_ROUTES: Array<{ test: RegExp; field: keyof AggregatedMockupFields }> = [
  { test: /title|headline|標題/i,                         field: "title" },
  { test: /hashtag|tag\b|tags|主題標籤/i,                 field: "hashtags" },
  { test: /caption|copy|post|hook|文案|貼文|內文|腳本/i,  field: "caption" },
  { test: /description|desc|簡介|說明/i,                  field: "description" },
  { test: /thumbnail|cover|封面/i,                         field: "imageDesc" },
  { test: /image|visual|carousel|圖|視覺/i,               field: "imageDesc" },
  { test: /video|reel|short|影片|短片/i,                   field: "videoDesc" },
  { test: /cta|call.to.action|action|行動呼籲/i,          field: "cta" },
];

function parseHashtags(body: string): string[] {
  // Pull out tokens that start with # — keep the # for display
  const tokens = body.match(/#[\p{L}\p{N}_]+/gu);
  if (tokens && tokens.length) return Array.from(new Set(tokens));
  // Fallback: split on whitespace, prefix with #
  return body
    .split(/[\s,;、，]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 30)
    .slice(0, 12)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

/**
 * Aggregate content-step outputs into structured mockup fields.
 * Unrecognized outputs fall through to caption (most universal).
 */
export function aggregateMockupFields(
  steps: any[],
  progressByOrd: Map<number, any>,
): AggregatedMockupFields {
  const out: AggregatedMockupFields = {};
  if (!Array.isArray(steps)) return out;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const ord = i + 1;
    const p = progressByOrd.get(ord);
    const body: string = (p?.agentOutput ?? p?.agent_output ?? "").toString().trim();
    if (!body) continue;
    // Visual + strategic steps don't feed mockup text fields. Visual steps
    // produce a media URL via MediaGenFlow; strategic steps render in the
    // DocMockup. Only "content" body text feeds caption / hashtags / etc.
    if (inferStepKind(step) !== "content") continue;

    const haystack = [step.outputType, step.output, step.name, step.title]
      .filter(Boolean).join(" ").toLowerCase();

    let routed = false;
    for (const r of FIELD_ROUTES) {
      if (r.test.test(haystack)) {
        if (r.field === "hashtags") {
          out.hashtags = parseHashtags(body);
        } else if (!out[r.field]) {
          (out as any)[r.field] = body;
        }
        routed = true;
        break;
      }
    }
    // Fallback: stash as caption if not yet set
    if (!routed && !out.caption) out.caption = body;
  }
  return out;
}

export function inferStepKind(step: any): StepKind {
  if (!step) return "content";
  // Explicit declaration wins over heuristics. Agents/skills that produce
  // visual assets should set `outputKind` directly so we don't depend on
  // keyword regex.
  const explicit = String(step.outputKind ?? step.assignedAgent?.outputKind ?? "").toLowerCase();
  if (explicit === "image" || explicit === "video" || explicit === "strategic" || explicit === "content") {
    return explicit as StepKind;
  }
  const haystack = [
    step.outputType, step.output, step.name, step.title,
    step.skill, step.assignedAgentName, step.role,
    typeof step.description === "string" ? step.description : "",
    Array.isArray(step.requiredSkills) ? step.requiredSkills.join(" ") : "",
  ].filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return "content";
  // Visual checks run BEFORE strategic — a "visual brand book" step is a
  // visual delivery, not a strategy doc.
  if (VIDEO_KEYWORDS.some((kw) => haystack.includes(kw))) return "video";
  if (IMAGE_KEYWORDS.some((kw) => haystack.includes(kw))) return "image";
  return STRATEGIC_KEYWORDS.some((kw) => haystack.includes(kw)) ? "strategic" : "content";
}
