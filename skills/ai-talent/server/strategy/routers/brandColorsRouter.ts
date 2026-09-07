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
} from "../core/brandPaletteAggregator";
import {
  composeBrandedProductImage,
  type Layout,
} from "../../content/core/brandedComposer";
import { scrapeWebsiteImages } from "../core/websiteImageScraper";
import { probeImageUrl } from "../../content/core/imageFetch";

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

      let urls = await loadBrandProductImageUrls(input.brandId, userId, 30);

      // 2026-07-01 (CJ「跟 riverflow 一樣」): products rarely carry images
      // yet (productDiscovery is text-first). Riverflow's actual flow is
      // URL → images → palette, so when the product path is dry, scrape
      // the brand website directly. This makes extraction work minutes
      // after brand creation with zero manual steps.
      if (urls.length === 0) {
        const [brandRows]: any = await localPool.execute(
          `SELECT website FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
          [input.brandId, userId],
        );
        const website: string | null = (brandRows as any[])[0]?.website ?? null;
        if (website && /^https?:\/\//.test(website)) {
          try {
            const scraped = await scrapeWebsiteImages(website, 30);
            urls = scraped.map((s) => s.url);
          } catch (e) {
            console.warn(`[brandColors] website scrape failed for brand ${input.brandId}:`, (e as Error).message);
          }
        }
      }

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
      const { rgbToLab } = await import("../core/brandColorExtractor");
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

  /**
   * 2026-06-21 (CJ「按 riverflow 標準」brand DNA sprint):
   * Generate branded product images (4 layout variants by default) by
   * compositing the product cutout against the brand palette.
   *
   * Pipeline:
   *   1. Load the product (need imageUrl + name + maybe tagline)
   *   2. Read the brand_colors palette (require it to exist)
   *   3. removeProductBackground via Replicate (or passthrough fallback)
   *   4. composeBrandedProductImage runs 4 layouts in sharp
   *   5. Return base64 PNG data URLs the frontend can render immediately
   *
   * Returns the variants inline (base64). Saving to a CDN / asset library
   * is a follow-up — keep this synchronous so the UI shows live results.
   */
  generateBrandedVariants: protectedProcedure
    .input(z.object({
      // 2026-07-19 (CJ「品牌視覺頁通常只有色號跑得出來」): productId is now
      // optional — most real brands have zero products with images, so the
      // variants pipeline had no entry point / no subject. Brand-level calls
      // pass brandId only; the subject image falls back product → website
      // scrape (the SAME source the palette 色號 extraction already uses).
      productId: z.number().int().positive().optional(),
      brandId: z.number().int().positive().optional(),
      layouts: z
        .array(z.enum(["centered-hero", "left-bias-bar", "corner-pop", "dual-band"]))
        .min(1).max(4).optional(),
      skipCutout: z.boolean().default(false),
    }).refine((v) => !!v.productId || !!v.brandId, { message: "productId or brandId required" }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      let resolvedBrandId = 0;
      let subjectName = "";
      let subjectImageUrl = "";
      let tagline = "";

      const pickTagline = (p: any): string => {
        let t = p?.tagline ?? p?._interim?.tagline ?? p?.usp ?? p?._interim?.usp ?? "";
        if (typeof t !== "string") t = "";
        return t.slice(0, 60);
      };

      if (input.productId) {
        // Load product + parent brand
        // 2026-06-30 (CJ prod bug): products table has no imageUrl column —
        // read image from positioning JSON same locations as loadBrandProductImageUrls.
        const [prodRows]: any = await localPool.execute(
          `SELECT id, brandId, name, positioning
             FROM products WHERE id = ? AND userId = ? LIMIT 1`,
          [input.productId, userId],
        );
        const product = (prodRows as any[])[0];
        if (!product) {
          return { ok: false as const, reason: "product_not_found" as const };
        }
        resolvedBrandId = Number(product.brandId);
        subjectName = product.name;
        try {
          let p: any = product.positioning;
          if (typeof p === "string") p = JSON.parse(p);
          const candidates = [
            p?.imageUrl, p?.image,
            p?._interim?.imageUrl, p?._interim?.image,
            Array.isArray(p?.images) ? p.images[0] : null,
            Array.isArray(p?._interim?.images) ? p._interim.images[0] : null,
            Array.isArray(p?._assets?.photos) ? (typeof p._assets.photos[0] === "string" ? p._assets.photos[0] : p._assets.photos[0]?.url) : null,
          ];
          for (const c of candidates) {
            if (typeof c === "string" && /^https?:\/\//.test(c)) { subjectImageUrl = c; break; }
          }
          tagline = pickTagline(p);
        } catch { /* fall through */ }
      } else {
        const [bRows]: any = await localPool.execute(
          `SELECT id, name, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
          [input.brandId!, userId],
        );
        const brand = (bRows as any[])[0];
        if (!brand) {
          return { ok: false as const, reason: "brand_not_found" as const };
        }
        resolvedBrandId = Number(brand.id);
        subjectName = brand.name;
        try {
          let p: any = brand.positioning;
          if (typeof p === "string") p = JSON.parse(p);
          tagline = pickTagline(p);
        } catch { /* ignore */ }
        // Brand-level subject: newest product image if any exists
        const productUrls = await loadBrandProductImageUrls(resolvedBrandId, userId, 5);
        subjectImageUrl = productUrls[0] ?? "";
      }

      // A URL-shaped value is not necessarily an image: retired sites often
      // redirect old product paths to an HTML homepage. Treat that exactly as
      // no image so the website scrape fallback below still gets a chance.
      if (subjectImageUrl && !(await probeImageUrl(subjectImageUrl, 8_000))) {
        subjectImageUrl = "";
      }

      // Fallback: no usable product image → scrape the brand website (same source
      // extractForBrand already uses for 色號, so if colors worked this works).
      if (!subjectImageUrl) {
        try {
          const [wRows]: any = await localPool.execute(
            `SELECT website FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
            [resolvedBrandId, userId],
          );
          const website = (wRows as any[])[0]?.website;
          if (typeof website === "string" && website.trim()) {
            const { scrapeWebsiteImages } = await import("../core/websiteImageScraper");
            const imgs = await scrapeWebsiteImages(website, 8);
            for (const img of imgs) {
              if (await probeImageUrl(img.url, 8_000)) {
                subjectImageUrl = img.url;
                break;
              }
            }
          }
        } catch { /* fall through to the reason below */ }
      }
      if (!subjectImageUrl) {
        return { ok: false as const, reason: "no_subject_image" as const };
      }

      const palette = await readBrandColors(resolvedBrandId, userId);
      if (!palette || !palette.swatches?.length) {
        return { ok: false as const, reason: "no_palette_yet" as const };
      }

      const result = await composeBrandedProductImage({
        productImageUrl: subjectImageUrl,
        productName: subjectName,
        tagline,
        palette: palette.swatches.map((s) => ({ hex: s.hex, role: s.role })),
        layouts: input.layouts as Layout[] | undefined,
        skipCutout: input.skipCutout,
      });

      // Encode variants as base64 data URLs so the frontend can render
      // without a round-trip to asset storage. Keep payload sane: typical
      // 1080×1080 PNG is ~200-500KB → base64 ~700KB → x4 = ~2.8MB. tRPC
      // batch can handle that; if it grows we'll add a CDN upload step.
      const variants = result.variants.map((v) => ({
        layout: v.layout,
        pngDataUrl: `data:image/png;base64,${v.pngBuffer.toString("base64")}`,
        colorsUsed: v.colorsUsed,
        hadCutout: v.hadCutout,
      }));

      return {
        ok: true as const,
        variants,
        totalMs: result.totalMs,
        productName: subjectName,
        cutoutAvailable: !!process.env.REPLICATE_API_TOKEN,
      };
    }),
});
