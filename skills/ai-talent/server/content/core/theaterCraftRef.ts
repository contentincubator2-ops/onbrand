/**
 * theaterCraftRef — Bring the FB/IG/LI/TT/YT craft refs into Theater cells.
 *
 * 2026-06-10 (CJ「文章結構都很像」根因 fix):
 *
 * Each platform's craft file (fbCraft.ts / igCraft.ts / etc.) already has
 * 10-40 internationally-awarded campaign references per task ID — but Theater
 * has no task ID, so it never used them. Result: every 7-day cell ran the
 * same generic FB rubric → templated outputs across the week.
 *
 * This helper:
 *   1. Exposes the per-platform TASK_REF dictionaries to Theater
 *   2. Picks a varied case for each (date × platform) cell so the same week's
 *      cells use DIFFERENT award frameworks (no two cells share a case)
 *   3. Builds a 250-400 char craft block ready to drop into the cell prompt
 *
 * Selection algorithm — deterministic per (brandId, date, platform):
 *   - Hash (brand + date + platform) → stable index → pick from the pool
 *   - Same brand re-run = same case (predictable)
 *   - Different days = different case (variety)
 *   - Different platforms = different case (cross-platform variety)
 */

import {
  FB_CRAFT_RUBRIC, FB_TASK_REF,
} from "./fbCraft";
import {
  IG_CRAFT_RUBRIC, IG_TASK_REF,
} from "./igCraft";
import {
  LI_CRAFT_RUBRIC, LI_TASK_REF,
} from "./liCraft";
import {
  TT_CRAFT_RUBRIC, TT_TASK_REF,
} from "./ttCraft";
import {
  YT_CRAFT_RUBRIC, YT_TASK_REF,
} from "./ytCraft";

/** Theater-supported platforms (subset of all platforms; threads/line/blog
 *  have no craft files yet — fall back to no craft injection). */
export type TheaterCraftPlatform = "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube";

/** Stable string hash → small positive integer. djb2 variant. */
function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h | 0);
}

interface CraftBundle {
  rubric: string;            // platform-wide craft rubric (e.g. FB_CRAFT_RUBRIC)
  caseLabel: string;         // the task key (e.g. "fb-60-single-full")
  caseRef: string;           // the award reference for that task
}

const CRAFT_REGISTRY: Record<TheaterCraftPlatform, { rubric: string; pool: Record<string, string> }> = {
  facebook:  { rubric: FB_CRAFT_RUBRIC, pool: FB_TASK_REF },
  instagram: { rubric: IG_CRAFT_RUBRIC, pool: IG_TASK_REF },
  linkedin:  { rubric: LI_CRAFT_RUBRIC, pool: LI_TASK_REF },
  tiktok:    { rubric: TT_CRAFT_RUBRIC, pool: TT_TASK_REF },
  youtube:   { rubric: YT_CRAFT_RUBRIC, pool: YT_TASK_REF },
};

/**
 * Pick one (rubric, caseRef) bundle for this (brand, date, platform) cell.
 * Returns null if the platform has no craft file yet.
 */
export function pickTheaterCraft(
  brandId: number,
  date: string,        // YYYY-MM-DD
  platform: string,
): CraftBundle | null {
  const reg = CRAFT_REGISTRY[platform as TheaterCraftPlatform];
  if (!reg) return null;

  // Prefer "60-single-full" or "60-*-full" style refs — those describe a
  // complete post (matches what Theater generates). Filter to those first;
  // if pool is tiny, fall back to all entries.
  const allKeys = Object.keys(reg.pool);
  const preferredKeys = allKeys.filter((k) =>
    /-60-(single|feed|insight|video-package|full|post)|-60-[a-z]+-full/.test(k) ||
    /-30-(caption-short|pure-text-hook|reel-script|opening-hook|insight-post|hook)/.test(k),
  );
  const pool = preferredKeys.length >= 3 ? preferredKeys : allKeys;

  if (pool.length === 0) return null;

  // Deterministic pick — same brand+date+platform → same case.
  const seed = `${brandId}|${date}|${platform}`;
  const idx = hash32(seed) % pool.length;
  const key = pool[idx]!;
  const ref = reg.pool[key]!;

  return { rubric: reg.rubric, caseLabel: key, caseRef: ref };
}

/**
 * Build a complete craft block ready to drop into the cell prompt.
 * Returns "" when no craft is available for this platform.
 *
 * The block is intentionally compact (rubric is heavy, case ref is the
 * surgical part). Put this LATE in the system prompt — LLMs weight the
 * tail more strongly.
 */
export function buildTheaterCraftBlock(
  brandId: number,
  date: string,
  platform: string,
): string {
  const bundle = pickTheaterCraft(brandId, date, platform);
  if (!bundle) return "";

  return `
${bundle.rubric}

【今天這篇的得獎案例參考 — 從以下案例「學結構，不抄字」】
${bundle.caseRef}

寫作要求：
1. **不要照抄案例的措辭或品牌名**——只學它的「結構與切入角度」。
2. 把這個案例的「為什麼有效」（反差／情緒弧／第一句怎麼鉤人）套到你的品牌上。
3. 寫完後自問：這篇貼文的結構，是不是真的有用上這個案例的精神？如果蓋掉品牌名跟產品名，剩下的「結構」是否符合得獎水準？
`.trim();
}
