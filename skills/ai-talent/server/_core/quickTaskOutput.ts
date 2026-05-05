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
 * Tolerant string coercer — accepts either a string or an array of strings
 * (LLMs frequently emit arrays for fields like "color_palette" / "tone" /
 * "lighting" even when the schema asks for prose). Joins arrays with " · ".
 */
const stringOrArray = (max: number) =>
  z.preprocess(
    (v) => {
      if (Array.isArray(v)) return v.filter(Boolean).map(String).join(" · ").slice(0, max);
      if (typeof v === "string") return v.slice(0, max);
      if (v == null) return undefined;
      return String(v).slice(0, max);
    },
    z.string().max(max).optional(),
  );

/**
 * Image style direction — NOT a prompt. A descriptive brief for the user to
 * carry into MediaGenFlow step 1 (設計方向). MediaGenFlow's step 2 (AI prompt)
 * is generated from this; step 3 picks the model.
 *
 * 2026-05-05: schema is intentionally tolerant. Any field that an LLM might
 * be tempted to give as array-instead-of-string gets auto-joined. Aspect
 * ratio and model suggestion are open enums (string instead of strict
 * z.enum) so a slightly-off LLM value ("9x16" instead of "9:16") still
 * survives — UI can normalize on its end.
 */
export const imageStyleDirectionSchema = z.object({
  /** Plain-text style summary — shown inside mockup image placeholder. */
  summary: stringOrArray(280),
  /** Mood / tone keywords — used by MediaGenFlow step 2 prompt builder */
  tone: z.preprocess(
    (v) => {
      if (Array.isArray(v)) return v.map(String).slice(0, 8);
      if (typeof v === "string") return v.split(/[,，;；·、]+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
      return undefined;
    },
    z.array(z.string().max(60)).max(8).optional(),
  ),
  /** What the image actually shows (subject) */
  subject: stringOrArray(280),
  /** Composition cues */
  composition: stringOrArray(280),
  /** Lighting cues */
  lighting: stringOrArray(280),
  /** Color palette — accepts string OR array of color names */
  color_palette: stringOrArray(280),
  /** Aspect ratio — open string (recommend the 7 known presets but don't reject) */
  aspect_ratio: z.string().max(20).optional(),
  /** Suggested model — open string */
  model_suggestion: z.string().max(40).optional(),
});
export type ImageStyleDirection = z.infer<typeof imageStyleDirectionSchema>;

/**
 * Video style direction — same idea for short-form video (Reels / Shorts /
 * TikTok). Tolerant coercion same as image schema.
 */
export const videoStyleDirectionSchema = z.object({
  summary: stringOrArray(280),
  duration_seconds: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v),
    z.number().min(1).max(90).optional(),
  ),
  pacing: stringOrArray(140),
  camera_style: stringOrArray(280),
  hook_beat: stringOrArray(280),
  structural_arc: stringOrArray(280),
  audio_style: stringOrArray(280),
  aspect_ratio: z.string().max(20).optional(),
  model_suggestion: z.string().max(40).optional(),
});
export type VideoStyleDirection = z.infer<typeof videoStyleDirectionSchema>;

// ─── Tier-specific extras ───────────────────────────────────────────────────

/**
 * Variants — lighter for 30s (1-2), richer for 60s (3-5).
 * 2026-05-05: label auto-filled with "版本 N" if LLM omits — this happens
 * often. caption is the only truly required field.
 */
export const variantSchema = z.object({
  label: z.string().max(80).optional().default(""),
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
  if (result.success) {
    // Backfill missing variant labels with "版本 N"
    if (result.data.variants) {
      result.data.variants = result.data.variants.map((v, i) => ({
        ...v,
        label: v.label && v.label.length > 0 ? v.label : `版本 ${i + 1}`,
      }));
    }
    return { ok: true, data: result.data };
  }
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
【輸出格式 — 嚴格 JSON，無 markdown code fence、無 \`\`\`json 圍籬】
必填: tier, platform, post_type, caption.
可選: title, description, cta, hashtags, image_style_direction, video_style_direction.
hashtags 是 string[] 不含 # 前綴.
所有 image_style_direction / video_style_direction 子欄位都是「字串」（不是陣列、不是物件）.
若你想給多個元素（如多個顏色），用「·」或「、」連接成單一字串.
例：color_palette 寫 "粉櫻 · 暖陽 · 寶藍"，不要寫 ["粉櫻","暖陽","寶藍"].
唯一例外：tone 可以是 string[] 也可以是 string.
variants[] 每個物件需含 label（如 "情感版" / "理性版" / "幽默版"）和 caption.`;
  if (tier === "30s") {
    return base + `
【30s tier 規則】
- variants[] 留空或最多 1 個替代版.
- image_style_direction 至少給 summary（1 句）+ aspect_ratio.
- 不要 kpi_prediction.
- caption 控制在 600 字內.`;
  }
  if (tier === "60s") {
    return base + `
【60s tier 規則】
- variants[] 給 1-3 個明顯不同口吻 / 情感版本，每個必須有 label 和 caption.
- image_style_direction 至少給 summary + tone + composition + aspect_ratio.
- video_style_direction 若 post_type 是 reel / video，也填.
- 不要 kpi_prediction.
- caption 可到 2000 字.`;
  }
  return base + `
【90s tier 規則】
- variants[] 給 3-5 個版本，每個必須有 label.
- image_style_direction / video_style_direction 全欄位填（字串型態）.
- kpi_prediction 必填（reach + engagement_rate + best_post_time + reasoning）.
- 可用 extra{} 攜帶 pillar_mapping / competitor_benchmark 等富資料.`;
}
