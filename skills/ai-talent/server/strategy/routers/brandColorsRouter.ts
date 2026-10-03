/**
 * brandColorsRouter — read / extract / override the auto-detected brand
 * color palette (riverflow-style brand DNA).
 *
 * Routes:
 *   - getCurrent(brandId)        — read the saved palette (or null)
 *   - extractForBrand(brandId)   — pull product image URLs from the brand's
 *                                  products + run aggregator + persist
 *   - setOverrides(brandId, ..)  — user manually edits / reorders / locks
 *   - reset(brandId)             — clear and let next extract overwrite
 *
 * Storage:
 *   brands.brand_colors JSON column (added by migrate.ts 2026-06-21).
 *
 * 2026-06-21 — created.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import {
  aggregateBrandPalette,
  type BrandPalette,
  type BrandColorRole,
} from "../core/brand/brandPaletteAggregator";
import { probeImageUrl } from "../../platform/core/media/imageFetch";
import { listPhotos } from "../core/brand/assetPhotos";

// ── Zod ────────────────────────────────────────────────────────────────

const BRAND_COLOR_ROLES = [
  "primary", "accent", "ink", "neutral", "highlight", "support",
] as const satisfies readonly BrandColorRole[];

const swatchOverrideSchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(BRAND_COLOR_ROLES),
  weight: z.number().min(0).max(1).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Pull up to N product image URLs for a brand.
 *
 * 2026-06-30 (CJ prod bug): originally assumed `products.imageUrl` +
 * `products.extraImages` columns exist. They don't — the real `products`
 * schema is (id, userId, brandId, slug, name, positioning JSON, timestamps).
 * Image URLs, if present at all, live inside the `positioning` JSON blob
 * as one of:
 *   - positioning.imageUrl (top-level, if any writer sets it)
 *   - positioning._interim.imageUrl (interim-pulse writers)
 *   - positioning._assets.photos[] (asset panel)
 *   - positioning.images[] (LLM extractors)
 * We walk all four locations. Returns [] if none — caller returns
 * `no_product_images` and the UI shows the empty-state CTA.
 */
async function loadBrandProductImageUrls(
  brandId: number,
  userId: number,
  cap = 30,
): Promise<string[]> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning FROM products
       WHERE brandId = ? AND userId = ?
       ORDER BY id DESC
       LIMIT 100`,
    [brandId, userId],
  );
  const urls: string[] = [];
  const isHttp = (v: unknown): v is string =>
    typeof v === "string" && /^https?:\/\//.test(v);

  for (const r of (rows as any[])) {
    let p: any = r.positioning;
    if (typeof p === "string") {
      try { p = JSON.parse(p); } catch { p = null; }
    }
    if (!p || typeof p !== "object") continue;

    // Common locations
    const candidates: unknown[] = [
      p.imageUrl,
      p.image,
      p._interim?.imageUrl,
      p._interim?.image,
    ];
    // Array-style locations
    const arrays: unknown[] = [
      p.images,
      p._interim?.images,
      p._assets?.photos,
      p._assets?.images,
    ];
    for (const c of candidates) {
      if (isHttp(c)) urls.push(c);
    }
    for (const arr of arrays) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (isHttp(item)) urls.push(item);
          else if (item && typeof item === "object" && isHttp((item as any).url)) {
            urls.push((item as any).url);
          }
        }
      }
    }

    if (urls.length >= cap) break;
  }
  const unique = Array.from(new Set(urls));
  const usable: string[] = [];
  for (let offset = 0; offset < unique.length && usable.length < cap; offset += 8) {
    const batch = unique.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async (url) => ({ url, ok: await probeImageUrl(url, 8_000) })));
    usable.push(...results.filter((result) => result.ok).map((result) => result.url));
  }
  return usable.slice(0, cap);
}

/**
 * 品牌照片庫（AssetPhotoGallery 上傳的，見 assetPhotos.ts）——2026-09-10
 * 起，沒有產品圖時的合法後備來源，取代原本爬品牌官網湊圖的做法。
 */
async function loadBrandPhotoUrls(brandId: number, cap = 30): Promise<string[]> {
  const photos = await listPhotos("brand", brandId);
  return photos.slice(0, cap).map((p) => p.url);
}

interface StoredBrandColors extends BrandPalette {
  userLocked?: boolean;
}

async function readBrandColors(
  brandId: number, userId: number,
): Promise<StoredBrandColors | null> {
  const [rows]: any = await localPool.execute(
    `SELECT brand_colors FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row || !row.brand_colors) return null;
  let parsed: any = row.brand_colors;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || !Array.isArray(parsed.swatches)) return null;
  return parsed as StoredBrandColors;
}

async function writeBrandColors(
  brandId: number, userId: number, payload: StoredBrandColors,
): Promise<void> {
  await localPool.execute(
    `UPDATE brands SET brand_colors = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(payload), brandId, userId],
  );
}

// ── Router ─────────────────────────────────────────────────────────────

export const brandColorsRouter = router({

  /** Read the stored palette for a brand (or null if not yet extracted). */
  getCurrent: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      return await readBrandColors(input.brandId, userId);
    }),

  /**
   * Run aggregator against this brand's product images. Idempotent: if the
   * user has locked the palette (manual overrides), refuses unless force=true.
   */
  extractForBrand: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      targetSize: z.number().int().min(3).max(10).default(7),
      force: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // Respect user lock unless explicitly forced
      if (!input.force) {
        const existing = await readBrandColors(input.brandId, userId);
        if (existing?.userLocked) {
          return {
            ok: false as const,
            reason: "user_locked",
            existing,
          };
        }
      }

      // 2026-09-10 (CJ「所有品牌／產品的照片都應該由用戶上傳」)：這裡以前在
      // 產品沒圖時會直接爬品牌官網湊圖（2026-07-01「跟 riverflow 一樣」的
      // 決定）。改成不爬——沒有產品圖或品牌照片庫的圖，就老實回
      // no_product_images，UI 走既有的空狀態 CTA（上傳一張）。
      const urls = [
        ...await loadBrandProductImageUrls(input.brandId, userId, 30),
        ...await loadBrandPhotoUrls(input.brandId, 30),
      ].slice(0, 30);

      if (urls.length === 0) {
        return {
          ok: false as const,
          reason: "no_product_images",
          existing: null,
        };
      }

      const palette = await aggregateBrandPalette(urls, {
        targetSize: input.targetSize,
      });
      if (!palette) {
        return {
          ok: false as const,
          reason: "extraction_failed",
          existing: null,
        };
      }

      const stored: StoredBrandColors = { ...palette, userLocked: false };
      await writeBrandColors(input.brandId, userId, stored);
      return { ok: true as const, palette: stored };
    }),

  /**
   * User manually overrides the palette (reorder, recolor, relabel roles).
   * Marks userLocked=true so future extractForBrand calls skip unless forced.
   */
  setOverrides: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      swatches: z.array(swatchOverrideSchema).min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const existing = await readBrandColors(input.brandId, userId);

      // Hydrate full swatch records from hex (recompute RGB/LAB so display
      // stays accurate even if user pastes a new hex).
      const { rgbToLab } = await import("../core/brand/brandColorExtractor");
      const hydrated = input.swatches.map((s, idx, arr) => {
        const r = parseInt(s.hex.slice(1, 3), 16);
        const g = parseInt(s.hex.slice(3, 5), 16);
        const b = parseInt(s.hex.slice(5, 7), 16);
        const lab = rgbToLab(r, g, b);
        // If user didn't supply weight, distribute remaining equally
        const w = s.weight ?? Math.round((1 / arr.length) * 1000) / 1000;
        return {
          hex: s.hex.toLowerCase(),
          rgb: { r, g, b },
          lab,
          weight: w,
          role: s.role,
        };
      });

      const updated: StoredBrandColors = {
        swatches: hydrated,
        sourceImageCount: existing?.sourceImageCount ?? 0,
        attemptedImageCount: existing?.attemptedImageCount ?? 0,
        extractedAt: existing?.extractedAt ?? new Date().toISOString(),
        userLocked: true,
      };
      await writeBrandColors(input.brandId, userId, updated);
      return { ok: true as const, palette: updated };
    }),

  /** Clear the user lock and the stored palette (next extract overwrites). */
  reset: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await localPool.execute(
        `UPDATE brands SET brand_colors = NULL WHERE id = ? AND userId = ?`,
        [input.brandId, userId],
      );
      return { ok: true as const };
    }),
});
