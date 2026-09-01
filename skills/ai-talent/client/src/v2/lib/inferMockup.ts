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
  // --- new channels ---
  | "email"
  | "google"
  | "twitter"
  | "line"
  | "web"
  | "press"
  | "deck"
  // --- new platforms ---
  | "xiaohongshu"
  | "threads"
  | "pinterest"
  | "podcast"
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
  // Facebook (original 2 + 8 quick-task pivot variants 2026-05-05)
  | "marketplace"     // listing card
  | "event"           // event card
  | "cover"           // FB cover photo (851×315)
  | "comment"         // FB comment reply (one-reply chrome)
  // 2026-08-20: same chrome family — IG / LinkedIn / TikTok / YouTube reply,
  // plus YouTube's creator-pinned comment (「由頻道發布者置頂」row).
  | "pinned-comment"  // YT pinned comment (yt-30-pinned-comment)
  | "group"           // FB group post (group chrome)
  | "recommendation"  // FB recommendation reply (with star rating)
  | "pinned"          // FB pinned post (FBFeed + pin badge)
  | "album"           // FB multi-image album (4-grid)
  // TikTok
  | "foryou"          // FYP video w/ side action rail
  // Email / EDM
  | "edm"             // full HTML email
  | "email-newsletter"// simple single-column newsletter
  | "dm"              // 1:1 outreach letter (KOL invite etc.)
  // Google Ads
  | "search-ad"       // text search result ad
  | "display-ad"      // banner / image display ad
  | "pmax"            // Performance Max
  | "shopping-ad"     // Google Shopping product card
  | "video-ad"        // YouTube TrueView in-stream ad
  // Twitter / X
  | "tweet"           // single tweet card
  | "thread"          // multi-tweet thread
  // LINE
  | "broadcast"       // LINE OA mass message
  | "line-card"       // LINE Flex Message card
  | "richmenu"        // LINE Rich Menu
  // Web
  | "landing"         // landing page
  | "blog"            // blog article
  | "product-page"    // product / e-commerce page
  // Press / PR
  | "press-release"   // news release
  // Deck
  | "slide"           // presentation deck
  // Xiaohongshu / RED
  | "note"             // 圖文筆記 (photo + text)
  | "xhs-video"        // 影片筆記
  | "xhs-search"       // 搜索結果卡片
  // Threads
  | "post"             // single Threads post
  | "thread"           // already defined for Twitter — reused for Threads chain
  // Pinterest
  | "pin"              // single pin (mobile)
  | "board"            // board / masonry grid (desktop)
  | "story-pin"        // idea pin / story format
  // Podcast
  | "episode"          // single episode player
  | "show"             // show/channel page with episode list
  | "audiogram"        // square audiogram social card
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
  // Email
  "email:edm":            "EDM 電子郵件",
  "email:email-newsletter": "電子報",
  "email:dm":             "KOL 邀約信",
  // Google
  "google:search-ad":     "Google 搜尋廣告",
  "google:display-ad":    "Google 多媒體廣告",
  "google:pmax":          "Google PMax",
  "google:shopping-ad":   "Google 購物廣告",
  "google:video-ad":      "Google 影片廣告",
  // Twitter / X
  "twitter:tweet":        "X 推文",
  "twitter:thread":       "X Thread",
  // LINE
  "line:broadcast":       "LINE 廣播訊息",
  "line:line-card":       "LINE Flex Card",
  "line:richmenu":        "LINE Rich Menu",
  // Web
  "web:landing":          "官網 Landing Page",
  "web:blog":             "部落格文章",
  "web:product-page":     "產品頁面",
  // Press
  "press:press-release":  "新聞稿",
  // Deck
  "deck:slide":           "簡報 Deck",
  "generic:generic":      "通用輸出",
  // Xiaohongshu
  "xiaohongshu:note":       "小紅書 圖文筆記",
  "xiaohongshu:xhs-video":  "小紅書 影片筆記",
  "xiaohongshu:xhs-search": "小紅書 搜索筆記",
  // Threads
  "threads:post":    "Threads 貼文",
  "threads:thread":  "Threads 串文",
  // Pinterest
  "pinterest:pin":       "Pinterest Pin",
  "pinterest:board":     "Pinterest 看板",
  "pinterest:story-pin": "Pinterest Idea Pin",
  // Podcast
  "podcast:episode":   "Podcast 單集",
  "podcast:show":      "Podcast 節目頁",
  "podcast:audiogram": "Podcast Audiogram",
};

const labelOf = (p: Platform, f: Format) =>
  VARIANT_LABELS[`${p}:${f}`] ?? `${p} · ${f}`;

const variant = (platform: Platform, format: Format): MockupVariant =>
  ({ platform, format, label: labelOf(platform, format) });

/* ───────────────── helpers ───────────────── */

const norm = (s: any): string => String(s ?? "").toLowerCase();

/**
 * Safely coerce a workspace / tags field to string[].
 * Handles:
 *   - Already an array   → use as-is
 *   - JSON string        → parse, flatten
 *   - Bare string        → wrap in array
 *   - null / undefined   → []
 */
const toStringArray = (v: any): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.startsWith("[")) {
      try { const parsed = JSON.parse(trimmed); return Array.isArray(parsed) ? parsed.map(String) : [trimmed]; }
      catch { /* fall through */ }
    }
    return trimmed ? [trimmed] : [];
  }
  return [];
};

/**
 * Build the inference haystack from an entity.
 *
 * Design principle (Session 2):
 *   Source data for inference is ENGLISH-only.
 *   Chinese fields (name, specialty, bio) are UI-display only and are
 *   intentionally excluded to keep keyword rules simple and unambiguous.
 *
 * English signal priority:
 *   1. slug           — DB identifier, always English (e.g. "mkt-kol-social")
 *   2. workspace      — English JSON array (e.g. ["instagram", "strategy"])
 *   3. mockup_platform — explicit DB tag (e.g. "instagram")
 *   4. primarySkill   — English skill slug (e.g. "youtube-publisher")
 *   5. englishTitle / englishName / specialty_en / bio_en — agent English fields
 *   6. task_type / taskType — "image" / "video" / "text"
 *   7. tags / outputFormats / useCases — usually English slugs
 *
 * Chinese name/specialty/bio are NOT included.
 */
const collectHaystack = (entity: any): string => {
  if (!entity) return "";
  return [
    // ── 1. structural identifiers (always English) ──
    norm(entity.slug),
    // ── 2. workspace tags (English JSON array or string) ──
    ...toStringArray(entity.workspace).map(norm),
    // ── 3. explicit mockup fields ──
    norm(entity.mockup_platform),
    norm(entity.mockup?.platform),
    // ── 4. agent English fields ──
    norm(entity.primarySkill),
    norm(entity.englishTitle),
    norm(entity.englishName),
    norm(entity.specialty_en),
    norm(entity.bio_en),
    // ── 5. task type (skill inference) ──
    norm(entity.task_type),
    norm(entity.taskType),
    // ── 6. structured tags (English slugs) ──
    ...toStringArray(entity.tags).map(norm),
    ...toStringArray(entity.outputFormats).map(norm),
    ...toStringArray(entity.useCases).map(norm),
    ...toStringArray(entity.workspace_tags).map(norm),
  ].filter(Boolean).join(" ");
};

/* ───────────────── platform detection ───────────────── */

/**
 * Platform keyword map — English only.
 *
 * Sources that feed the haystack are already English (slug, workspace,
 * primarySkill, englishTitle, specialty_en).  No Chinese needed here.
 * Chinese labels live in VARIANT_LABELS (display only).
 *
 * Order: most-specific / least-ambiguous platform first so the first-match
 * wins rule produces the correct result.
 */
const PLATFORM_KEYWORDS: Array<[Platform, string[]]> = [
  // ── Unique brand-name platforms (unambiguous) ─────────────────────────
  ["xiaohongshu", ["xiaohongshu", "xhs", "rednote", "red-note", "red note"]],
  ["threads",     ["threads-app", "meta-threads", "threads"]],  // workspace slug "threads" is safe; avoid bare "thread" (singular)
  ["pinterest",   ["pinterest", "pin-board", "idea-pin", "story-pin"]],
  ["podcast",     ["podcast", "podcasting", "audiogram", "spotify-podcast", "apple-podcast"]],
  // ── Video platforms ────────────────────────────────────────────────────
  ["tiktok",      ["tiktok", "tt-", "douyin", "fyp", "for-you-page"]],
  ["youtube",     ["youtube", "yt-", "youtu.be", "youtube-shorts", "youtube-studio"]],
  // ── Social platforms ───────────────────────────────────────────────────
  ["instagram",   ["instagram", "ig-", "ig_", " ig ", "reels", "stories", "ugc", "kol", "influencer"]],
  ["facebook",    ["facebook", "fb-", "fb_", " fb ", "meta-fb", "messenger"]],
  ["linkedin",    ["linkedin", "li-", "b2b-social", "company-page"]],
  ["twitter",     ["twitter", "x.com", "tweet", "x-platform"]],
  // ── Owned/paid channels ────────────────────────────────────────────────
  ["email",       ["email", "edm", "newsletter", "mailer", "enewsletter", "email-marketing", "email-automation"]],
  ["google",      ["google", "google-ads", "gads", "pmax", "performance-max", "search-ad", "display-ad", "shopping-ad", "sem"]],
  ["line",        ["line-oa", "line-official", "richmenu", "rich-menu", "line-push", "line@", " line "]],  // " line " (space-padded) matches workspace slug "line" after haystack join
  ["web",         ["website", "landing-page", "landingpage", "blog", "product-page", "seo", "organic-search"]],
  ["press",       ["press-release", "pr-release", "media-release", "press-statement", "crisis-pr"]],
  ["deck",        ["deck", "slide", "slides", "presentation", "ppt", "powerpoint", "pitch-deck"]],
];

function detectPlatform(haystack: string): Platform {
  // Pad with spaces so word-boundary keywords like " line " match even
  // when the token is at the start or end of the haystack string.
  const padded = ` ${haystack} `;
  for (const [p, kws] of PLATFORM_KEYWORDS) {
    if (kws.some((kw) => padded.includes(kw))) return p;
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

/**
 * Format rules — English only.
 *
 * Keywords match against the English haystack (slug, workspace, primarySkill,
 * specialty_en, etc.).  No Chinese needed.
 */
const FORMAT_RULES: FormatRule[] = [
  // ── 0. Guard: calendar/schedule → feed (before "article" or "blog" match) ─
  { format: "feed",    keywords: ["monthly-calendar", "content-calendar", "content-schedule"], platforms: ["linkedin", "instagram", "facebook"] },

  // ── 1. Short-video / vertical ─────────────────────────────────────────────
  { format: "reel",    keywords: ["reel", "reels", "short-video"],    platforms: ["instagram", "facebook"] },
  { format: "shorts",  keywords: ["short", "shorts", "youtube-short"], platforms: ["youtube"] },
  { format: "foryou",  keywords: ["foryou", "for-you", "fyp"],         platforms: ["tiktok"] },

  // ── 2. Stories ────────────────────────────────────────────────────────────
  { format: "story",   keywords: ["story", "stories", "ig-story"],    platforms: ["instagram", "facebook"] },

  // ── 3. Live ───────────────────────────────────────────────────────────────
  { format: "live",    keywords: ["live", "livestream", "live-stream", "live-commerce"] },

  // ── 4. LinkedIn specials ──────────────────────────────────────────────────
  { format: "article",      keywords: ["article", "long-form", "longform"],          platforms: ["linkedin"] },
  { format: "newsletter",   keywords: ["newsletter", "linkedin-newsletter"],          platforms: ["linkedin"] },
  { format: "poll",         keywords: ["poll"],                                        platforms: ["linkedin"] },
  { format: "document",     keywords: ["document", "pdf", "linkedin-doc"],            platforms: ["linkedin"] },
  { format: "native-video", keywords: ["native-video", "linkedin-video"],             platforms: ["linkedin"] },

  // ── 5. YouTube specials ───────────────────────────────────────────────────
  { format: "watch",     keywords: ["watch-page", "video-page", "youtube-watch"],    platforms: ["youtube"] },
  { format: "community", keywords: ["community-post", "youtube-community"],           platforms: ["youtube"] },
  { format: "premiere",  keywords: ["premiere", "countdown"],                          platforms: ["youtube"] },

  // ── 6. Facebook specials ──────────────────────────────────────────────────
  { format: "marketplace",    keywords: ["marketplace", "listing"],                       platforms: ["facebook"] },
  { format: "event",          keywords: ["event", "facebook-event"],                      platforms: ["facebook", "linkedin"] },
  // 2026-05-05 quick-task pivot — 6 new FB-only formats
  { format: "cover",          keywords: ["cover", "cover-photo", "fb-cover", "banner"],  platforms: ["facebook"] },
  { format: "comment",        keywords: ["comment-reply", "fb-comment", "crisis-reply"], platforms: ["facebook"] },
  { format: "group",          keywords: ["group-post", "fb-group", "community-group"],   platforms: ["facebook"] },
  { format: "recommendation", keywords: ["recommendation", "review-reply", "fb-review"], platforms: ["facebook"] },
  { format: "pinned",         keywords: ["pinned-post", "pin-post", "fb-pinned"],        platforms: ["facebook"] },
  { format: "album",          keywords: ["album", "multi-photo", "photo-album"],         platforms: ["facebook"] },

  // ── 7. Carousel ───────────────────────────────────────────────────────────
  { format: "carousel",  keywords: ["carousel", "multi-image", "swipe-post"] },

  // ── 8. Profile ────────────────────────────────────────────────────────────
  { format: "profile",   keywords: ["profile", "channel-page", "profile-page"] },

  // ── 9. Ads (low-priority catch-all) ───────────────────────────────────────
  { format: "ad",        keywords: ["ad-creative", "sponsored", "promoted", "paid-ad"] },

  // ── 10. Email ─────────────────────────────────────────────────────────────
  { format: "edm",              keywords: ["edm", "html-email", "email-campaign", "email-blast"], platforms: ["email"] },
  { format: "email-newsletter", keywords: ["newsletter", "weekly-digest", "monthly-digest"],      platforms: ["email"] },

  // ── 11. Google Ads ────────────────────────────────────────────────────────
  { format: "pmax",        keywords: ["pmax", "performance-max"],                          platforms: ["google"] },
  { format: "shopping-ad", keywords: ["shopping", "product-listing", "google-shopping"],  platforms: ["google"] },
  { format: "video-ad",    keywords: ["video-ad", "trueview", "youtube-ad"],              platforms: ["google"] },
  { format: "display-ad",  keywords: ["display", "banner", "gdn", "display-ad"],         platforms: ["google"] },
  { format: "search-ad",   keywords: ["search-ad", "text-ad", "keyword-ad", "sem"],      platforms: ["google"] },

  // ── 12. Twitter / X ───────────────────────────────────────────────────────
  { format: "thread",  keywords: ["twitter-thread", "x-thread"],  platforms: ["twitter"] },
  { format: "tweet",   keywords: ["tweet", "x-post"],              platforms: ["twitter"] },

  // ── 13. LINE ──────────────────────────────────────────────────────────────
  { format: "richmenu",  keywords: ["richmenu", "rich-menu"],                            platforms: ["line"] },
  { format: "line-card", keywords: ["flex-message", "flex-card", "line-card"],           platforms: ["line"] },
  { format: "broadcast", keywords: ["broadcast", "push-message", "line-push"],           platforms: ["line"] },

  // ── 14. Web ───────────────────────────────────────────────────────────────
  { format: "product-page", keywords: ["product-page", "ecommerce-page", "shop-page"],  platforms: ["web"] },
  { format: "landing",      keywords: ["landing", "landing-page"],                        platforms: ["web"] },
  { format: "blog",         keywords: ["blog", "article", "seo-article"],                platforms: ["web"] },

  // ── 15. Press ─────────────────────────────────────────────────────────────
  { format: "press-release", keywords: ["press-release", "pr-release", "media-release", "press-statement"], platforms: ["press"] },

  // ── 16. Deck ──────────────────────────────────────────────────────────────
  { format: "slide", keywords: ["slide", "deck", "presentation", "pitch-deck"], platforms: ["deck"] },

  // ── 17. 小紅書 ────────────────────────────────────────────────────────────
  { format: "xhs-video",  keywords: ["xhs-video", "xhs-reel"],         platforms: ["xiaohongshu"] },
  { format: "xhs-search", keywords: ["xhs-search", "xhs-search-card"], platforms: ["xiaohongshu"] },
  { format: "note",       keywords: ["xhs-note", "xhs-post"],          platforms: ["xiaohongshu"] },

  // ── 18. Threads ───────────────────────────────────────────────────────────
  { format: "thread", keywords: ["threads-thread", "thread-chain"], platforms: ["threads"] },
  { format: "post",   keywords: ["threads-post"],                    platforms: ["threads"] },

  // ── 19. Pinterest ─────────────────────────────────────────────────────────
  { format: "story-pin", keywords: ["story-pin", "idea-pin"],    platforms: ["pinterest"] },
  { format: "board",     keywords: ["board", "pin-board"],        platforms: ["pinterest"] },
  { format: "pin",       keywords: ["pin", "pinterest-pin"],      platforms: ["pinterest"] },

  // ── 20. Podcast ───────────────────────────────────────────────────────────
  { format: "audiogram", keywords: ["audiogram"],                         platforms: ["podcast"] },
  { format: "show",      keywords: ["show-page", "podcast-show"],         platforms: ["podcast"] },
  { format: "episode",   keywords: ["episode", "podcast-episode"],        platforms: ["podcast"] },
];

const PLATFORM_DEFAULT_FORMAT: Record<Platform, Format> = {
  instagram: "feed",
  facebook:  "feed",
  linkedin:  "feed",
  youtube:   "video-card",
  tiktok:    "foryou",
  email:     "edm",
  google:    "search-ad",
  twitter:   "tweet",
  line:      "broadcast",
  web:       "landing",
  press:        "press-release",
  deck:         "slide",
  xiaohongshu:  "note",
  threads:      "post",
  pinterest:    "pin",
  podcast:      "episode",
  generic:      "generic",
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
  if (!squad) return variant("generic", "generic");

  // 1. Explicit override object { platform, format }
  const ov = squad?.mockup;
  if (ov?.platform && ov?.format) {
    return variant(ov.platform as Platform, ov.format as Format);
  }

  // 2. DB-tagged fields (mockup_platform + mockup_format) — highest-trust signal
  //    These are set by Session-1 migration and future admin tagging.
  const dbP = norm(squad.mockup_platform);
  const dbF = norm(squad.mockup_format);
  if (dbP && dbP !== "generic" && dbF) {
    return variant(dbP as Platform, dbF as Format);
  }
  if (dbP === "generic") return variant("generic", "generic");

  // 3. Heuristic — keyword-based fallback for untagged entities
  const haystack = collectHaystack(squad);
  const platform = detectPlatform(haystack);
  const format = detectFormat(haystack, platform);

  return variant(platform, format);
}

/**
 * Infer mockup variant from an agent.
 * Agents now have mockup_platform + mockup_format columns (Session A).
 * The shared inferMockupVariant() already reads these DB fields first.
 */
export function inferMockupVariantFromAgent(agent: any): MockupVariant {
  return inferMockupVariant(agent);
}

/**
 * Infer mockup variant from a skill.
 * Skills now have mockup_platform + mockup_format columns (Session A).
 * Falls back to task_type hint when DB fields are not set.
 */
export function inferMockupVariantFromSkill(skill: any): MockupVariant {
  // DB-tagged fields take priority (same path as squads/agents)
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
  email:     ["edm", "email-newsletter"],
  google:    ["search-ad", "display-ad", "pmax", "shopping-ad", "video-ad"],
  twitter:   ["tweet", "thread"],
  line:      ["broadcast", "line-card", "richmenu"],
  web:       ["landing", "blog", "product-page"],
  press:     ["press-release"],
  deck:      ["slide"],
  xiaohongshu: ["note", "xhs-video", "xhs-search"],
  threads:   ["post", "thread"],
  pinterest: ["pin", "board", "story-pin"],
  podcast:   ["episode", "show", "audiogram"],
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
export type StepKind = "strategic" | "content" | "image" | "video" | "intake" | "qa";

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
  // Intake / checkpoint / QA steps → doc format (CJ direction 2026-05-02)
  if (explicit === "decision" || explicit === "intake") return "intake";
  if (explicit === "qa_review" || explicit === "qa") return "qa";
  const mv = String(step.mockupVariant ?? "");
  if (mv === "IntakeFormMockup") return "intake";
  if (mv === "QAReportMockup") return "qa";
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
