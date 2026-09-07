/**
 * How many pieces a 60s/99s run actually ships — 2026-08-22.
 *
 * (CJ 驗收 ig-60-live-suite「6 段流程表只回 5 段」.) The 60s/99s scaling step
 * inside runOrchestra used to force `variants: 5` on every non-cards config.
 * The intent was "60s gives MORE versions than 30s"; scaling DOWN was never
 * part of it, and it silently broke two families of task:
 *
 *   - TRUNCATED packs — a config that declares its own piece count via
 *     postLabels / extras.postsCount. 「IG 直播 30 分鐘流程腳本」(6 段) shipped 5
 *     and lost 收尾預告; 「FB 直播完整 9 段配套」 and 「FB 發布工具包」(9) shipped 5.
 *   - PADDED packs — 「IG 3 篇連載」/「IG Story 3 連拍」/「YT 3 集系列」 got two extra
 *     tabs labelled 進階版／替代版 that the task never promised, filled with
 *     whatever the writer could invent for a slot with no brief.
 *
 * Both break the SOP's AC-3 (task label 的數字必須等於實際變體數).
 *
 * The rule now: a pack ships exactly what it declares; anything else is
 * padded UP to the 5-version floor but never cut down.
 */

export interface TierVariantShapeInput {
  /** OrchestraConfig.variants */
  variants: number;
  /** OrchestraConfig.images */
  images: number;
  /** OrchestraConfig.variantLabels */
  variantLabels: string[];
  /** OrchestraConfig.postLabels — set by multi-post packs */
  postLabels?: string[];
  /** OrchestraConfig.extras?.postsCount — set by multi-post packs */
  postsCount?: number;
}

export interface TierVariantShape {
  variants: number;
  images: number;
  variantLabels: string[];
}

/** Generic labels for a non-pack task scaled up to the 5-version floor. */
const FILLER_LABELS = ["進階版", "替代版", "極簡版", "完整版"];

/** Does this config declare its own piece count? */
export function isPackShape(c: Pick<TierVariantShapeInput, "postLabels" | "postsCount">): boolean {
  return !!(c.postsCount || (c.postLabels?.length ?? 0) > 0);
}

/**
 * Resolve the piece count + labels a 60s/99s run should ship.
 * Callers apply this only to non-cards configs (cardsPerVariant fully
 * specifies its own shape: ONE variant + N cards).
 */
export function resolveTierVariantShape(c: TierVariantShapeInput): TierVariantShape {
  // A pack ships what it declares. Everything else keeps the 5-version
  // floor that makes 60s/99s worth more than 30s — but is never cut down
  // (pr-99-newsjack declares a pool of 6 lenses and only ever shipped 5).
  const target = isPackShape(c) ? c.variants : Math.max(5, c.variants);
  const base = c.variantLabels;
  const variantLabels =
    base.length >= target
      ? base.slice(0, target)
      : [
          ...base,
          ...Array.from(
            { length: target - base.length },
            (_, i) => FILLER_LABELS[i] ?? `版本 ${base.length + i + 1}`,
          ),
        ];
  return {
    variants: target,
    images: c.images > 0 ? target : 0,
    variantLabels,
  };
}
