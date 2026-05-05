/**
 * QuickTaskOutput — canonical output shape for every 快派 task (30s/60s/90s).
 *
 * Design principle (CJ direction 2026-05-05):
 *   The quick-task SLA covers TEXT + STYLE DIRECTION ONLY. Actual image /
 *   video rendering happens in a separate flow (MediaGenFlow / ImageSlotFlow)
 *   that the user opts into AFTER the SLA window closes. So this shape carries
 *   `image_style_direction` / `video_style_direction` (descriptive prose, not
 *   prompts) — never b64 images, URLs, or model IDs.
 *
 * Mockup wiring:
 *   - `caption` / `hashtags` / `cta` / `title` / `description` → existing
 *     MockupFields (liveCaption etc.) render directly via MarkdownText.
 *   - `image_style_direction` → new MockupFields.liveStyleDirection (renders
 *     inside the image placeholder slot in FBFeed / IGFeed / etc., until the
 *     user runs MediaGenFlow to fill the slot with an actual image).
 *   - `video_style_direction` → same, but for video slots (Reels / Shorts).
 *
 * Tier semantics:
 *   - 30s: caption + hashtags + (optional) image_style_direction (1 sentence).
 *   - 60s: full caption + 3-5 hashtags + structured image_style_direction +
 *          (optional) cta + (optional) variants[] (1-3 alt versions).
 *   - 90s: everything 60s has + KPI predictions, audience insights,
 *          competitor benchmarks, pillar mapping, etc. (richer, not faster).
 */
import { z } from "zod";

// ─── Style direction sub-schemas ────────────────────────────────────────────

/**
 * Image style direction — NOT a prompt. A descriptive brief for the user to
 * carry into MediaGenFlow step 1 (設計方向). MediaGenFlow's step 2 (AI prompt)
 * is generated from this; step 3 picks the model.
 */
export const imageStyleDirectionSchema = z.object({
  /** Plain-text style summary — shown inside mockup image placeholder. e.g.
   * "warm golden-hour, hand-held casual lifestyle, soft focus on hands" */
  summary: z.string().min(8).max(280),
  /** Mood / tone keywords — used by MediaGenFlow step 2 prompt builder */
  tone: z.array(z.string().max(40)).max(8).optional(),
  /** What the image actually shows (subject) — keep concrete and visible */
  subject: z.string().max(280).optional(),
  /** Composition cues — angle, framing, perspective */
  composition: z.string().max(140).optional(),
  /** Lighting cues — golden-hour, studio, neon, candid, etc. */
  lighting: z.string().max(140).optional(),
  /** Color palette in plain text — "粉櫻 + 暖陽 + 寶藍" or "monochrome navy" */
  color_palette: z.string().max(140).optional(),
  /** Aspect ratio preset for the platform variant */
  aspect_ratio: z.enum([
    "1:1",      // FB feed square, IG feed
    "4:5",      // FB / IG portrait feed
    "16:9",     // FB feed landscape, YT thumbnail, FB cover-narrow
    "9:16",     // FB Reels, IG Reels, Story
    "851:315",  // FB cover photo
    "1200:630", // FB / OG link preview
    "1080:1080",// IG square absolute
  ]).optional(),
  /** Suggested model — quick-task only suggests, MediaGenFlow lets user override */
  model_suggestion: z.enum([
    "gpt-image-1",      // OpenAI, best prompt adherence
    "imagen-4-fast",    // Google Imagen 4 fast
    "imagen-4-ultra",   // Google Imagen 4 ultra (slow but premium)
    "flux-kontext",     // Azure Foundry FLUX
    "hailuo-image",     // Hailuo
    "any",              // let user pick
  ]).default("any"),
});
export type ImageStyleDirection = z.infer<typeof imageStyleDirectionSchema>;

/**
 * Video style direction — same idea for short-form video (Reels / Shorts /
 * TikTok). Descriptive brief, not a prompt.
 */
export const videoStyleDirectionSchema = z.object({
  /** Plain-text style summary — shown in video placeholder. */
  summary: z.string().min(8).max(280),
  /** Duration target in seconds */
  duration_seconds: z.number().min(3).max(90).optional(),
  /** Pacing — fast / medium / slow + cuts per 10s */
  pacing: z.string().max(80).optional(),
  /** Camera style — handheld / locked-off / drone / first-person etc. */
  camera_style: z.string().max(140).optional(),
  /** Hook beat (first 1-2s) — what grabs attention */
  hook_beat: z.string().max(280).optional(),
  /** Structural arc — hook→build→turn→payoff or jab-jab-right-hook etc. */
  structural_arc: z.string().max(280).optional(),
  /** Music / sound style — upbeat / cinematic / native-audio etc. */
  audio_style: z.string().max(140).optional(),
  /** Aspect ratio — Reels/TikTok/Shorts are 9:16, FB feed video is 16:9 or 1:1 */
  aspect_ratio: z.enum(["9:16", "1:1", "16:9", "4:5"]).default("9:16"),
  /** Suggested model */
  model_suggestion: z.enum([
    "hailuo-video",   // text-to-video / image-to-video
    "veo",            // Google Veo
    "seedance-2",     // fal.ai Seedance 2.0
    "any",
  ]).default("any"),
});
export type VideoStyleDirection = z.infer<typeof videoStyleDirectionSchema>;

// ─── Tier-specific extras ───────────────────────────────────────────────────

/** Variants — lighter for 30s (1-2), richer for 60s (3-5). */
export const variantSchema = z.object({
  label: z.string().max(80),     // "情感版" / "理性版" / "幽默版"
  caption: z.string().max(2000),
  hashtags: z.array(z.string().max(50)).max(15).optional(),
});
export type Variant = z.infer<typeof variantSchema>;

/** 90s-only — KPI prediction the agent thinks this post will hit. */
export const kpiPredictionSchema = z.object({
  reach_estimate: z.string().max(80).optional(),       // "5K-15K"
  engagement_rate_estimate: z.string().max(40).optional(), // "3-5%"
  best_post_time: z.string().max(40).optional(),       // "週四 19:00-21:00"
  reasoning: z.string().max(600).optional(),
});

// ─── Top-level output shape ─────────────────────────────────────────────────

export const quickTaskOutputSchema = z.object({
  /** Tier tag — frontend uses this for color / SLA badge */
  tier: z.enum(["30s", "60s", "90s"]),
  /** Platform tag — drives mockup variant selection */
  platform: z.enum([
    "facebook", "instagram", "linkedin", "youtube", "tiktok",
    "threads", "twitter", "xiaohongshu", "pinterest", "podcast",
    "line", "email", "press", "web", "deck", "google", "meta",
  ]),
  /** Sub-format — drives which mockup component within a platform.
   * e.g. facebook + feed = FBFeed; facebook + reel = FBReel. */
  post_type: z.string().min(1).max(60),
  /** Main caption / body text. Markdown supported. */
  caption: z.string().min(1).max(8000),
  /** Headline / title (e.g. for events, articles, link previews) */
  title: z.string().max(280).optional(),
  /** Sub-headline / description */
  description: z.string().max(2000).optional(),
  /** Call-to-action line */
  cta: z.string().max(280).optional(),
  /** Hashtags (without leading # — frontend adds it) */
  hashtags: z.array(z.string().max(50)).max(30).optional(),
  /** Style direction for accompanying image (not generated, just the brief) */
  image_style_direction: imageStyleDirectionSchema.optional(),
  /** Style direction for accompanying video (not generated, just the brief) */
  video_style_direction: videoStyleDirectionSchema.optional(),
  /** Alternative versions (typically empty for 30s, 1-3 for 60s, 3-5 for 90s) */
  variants: z.array(variantSchema).max(5).optional(),
  /** 90s-only KPI prediction */
  kpi_prediction: kpiPredictionSchema.optional(),
  /** Free-form structured payload for tier-specific data the schema above
   * doesn't cover. Use sparingly — prefer extending the schema. */
  extra: z.record(z.string(), z.any()).optional(),
});
export type QuickTaskOutput = z.infer<typeof quickTaskOutputSchema>;

// ─── Helper: validate + soft-coerce ─────────────────────────────────────────

/**
 * Parse an LLM-generated JSON string into a QuickTaskOutput.
 * Returns either { ok: true, data } or { ok: false, errors }.
 * We intentionally don't throw — quick-task UI should degrade gracefully and
 * still show whatever the LLM produced, even if some fields are missing.
 */
export function parseQuickTaskOutput(
  raw: unknown,
): { ok: true; data: QuickTaskOutput } | { ok: false; errors: string[]; partial: Partial<QuickTaskOutput> } {
  const result = quickTaskOutputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
  return { ok: false, errors, partial: (raw ?? {}) as Partial<QuickTaskOutput> };
}

/**
 * Build the system-prompt suffix that tells an LLM to output this shape.
 * Use as the LAST line of your prompt. Tier-aware so the model knows what's
 * required (e.g. variants[] for 60s, kpi_prediction for 90s).
 */
export function quickTaskOutputSpec(tier: "30s" | "60s" | "90s"): string {
  const base = `
【輸出格式 — 嚴格 JSON，無 markdown code fence】
必填: tier, platform, post_type, caption.
可選: title, description, cta, hashtags, image_style_direction, video_style_direction.
hashtags 不要 # 前綴。caption 可用 markdown。`;
  if (tier === "30s") {
    return base + `
【30s tier 規則】
- variants[] 留空或最多 1 個替代版.
- image_style_direction 給 1 句 summary 就好（不必填全欄位）.
- 不要 kpi_prediction.
- caption 控制在 600 字內.`;
  }
  if (tier === "60s") {
    return base + `
【60s tier 規則】
- variants[] 給 1-3 個明顯不同口吻 / 情感版本.
- image_style_direction 至少給 summary + tone[] + composition + aspect_ratio.
- video_style_direction 若 post_type 是 reel / video, 也填.
- 不要 kpi_prediction.
- caption 可到 2000 字.`;
  }
  // 90s
  return base + `
【90s tier 規則】
- variants[] 給 3-5 個版本.
- image_style_direction / video_style_direction 全欄位填.
- kpi_prediction 必填（reach + engagement_rate + best_post_time + reasoning）.
- 可用 extra{} 攜帶 pillar_mapping / competitor_benchmark 等富資料.`;
}
