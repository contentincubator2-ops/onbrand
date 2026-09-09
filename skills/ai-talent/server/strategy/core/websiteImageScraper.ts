/**
 * websiteImageScraper — collect product-ish image URLs from a brand website.
 *
 * Riverflow-style input gathering: before we can extract a brand palette
 * or compose branded product shots, we need actual product images. This
 * module fetches a handful of likely pages (home, /products, /shop, …),
 * parses raw HTML (regex-based — no DOM dependency), and returns a
 * de-duplicated, noise-filtered list of absolute image URLs.
 *
 * Sources per page, in priority order:
 *   1. Shopify /products.json fast-path (structured, best quality)
 *   2. <meta property="og:image"> hero images
 *   3. <img src / data-src / srcset> tags, with heuristics that drop
 *      logos, icons, sprites, tracking pixels, svg, and tiny images.
 *
 * No new dependencies — plain fetch + regex, same style as
 * productDiscovery.crawlWebsite.
 *
 * 2026-07-01 (CJ「跟 riverflow 一樣」gap #1) — created.
 */

const UA = "OnBrand/1.0 (brand intelligence crawler)";
const PAGE_TIMEOUT_MS = 8_000;

export interface ScrapedImage {
  url: string;
  /** Where we found it — for debugging / telemetry. */
  source: "shopify" | "og" | "img";
  /** alt text or product title when available (used for product matching). */
  alt?: string;
}

// ── Noise filters ────────────────────────────────────────────────────────

const EXT_BLOCKLIST = /\.(svg|gif|ico|webp\?.*sprite|bmp)(\?|$)/i;
const PATH_BLOCKLIST =
  /(logo|icon|favicon|sprite|badge|payment|visa|master|line-pay|applepay|arrow|btn|button|banner-?bg|pixel|tracking|avatar|placeholder|loading|blank|spacer|footer|header-?bg)/i;
const HOST_BLOCKLIST =
  /(googletagmanager|google-analytics|doubleclick|facebook\.com\/tr|connect\.facebook|hotjar|clarity\.ms)/i;

function isLikelyProductImage(url: string): boolean {
  if (!/^https?:\/\//.test(url)) return false;
  if (EXT_BLOCKLIST.test(url)) return false;
  if (PATH_BLOCKLIST.test(url)) return false;
  if (HOST_BLOCKLIST.test(url)) return false;
  // Must end in a raster-image-ish extension or have an image-ish path/query
  if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url) && !/(upload|image|img|product|media|cdn)/i.test(url)) {
    return false;
  }
  return true;
}

/** Resolve relative/protocol-relative URLs against a page URL. */
function absolutize(raw: string, pageUrl: string): string | null {
  try {
    const cleaned = raw.trim().replace(/&amp;/g, "&");
    if (!cleaned || cleaned.startsWith("data:")) return null;
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return null;
  }
}

// ── Per-source extractors ────────────────────────────────────────────────

/** Shopify stores expose /products.json — structured titles + CDN images. */
async function tryShopifyProductsJson(base: string): Promise<ScrapedImage[]> {
  try {
    const res = await fetch(`${base}/products.json?limit=50`, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return [];
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return [];
    const body: any = await res.json();
    const products: any[] = Array.isArray(body?.products) ? body.products : [];
    const out: ScrapedImage[] = [];
    for (const p of products) {
      const title = typeof p?.title === "string" ? p.title : undefined;
      const images: any[] = Array.isArray(p?.images) ? p.images : [];
      for (const img of images.slice(0, 2)) {  // 2 per product is plenty
        const src = typeof img?.src === "string" ? img.src : null;
        if (src && isLikelyProductImage(src)) {
          out.push({ url: src, source: "shopify", alt: title });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** og:image + twitter:image meta tags from raw HTML. */
function extractMetaImages(html: string, pageUrl: string): ScrapedImage[] {
  const out: ScrapedImage[] = [];
  const metaRe =
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]*content=["']([^"']+)["']/gi;
  // Also handle content-before-property attribute order
  const metaRe2 =
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/gi;
  for (const re of [metaRe, metaRe2]) {
    for (const m of html.matchAll(re)) {
      const abs = absolutize(m[1] ?? "", pageUrl);
      if (abs && isLikelyProductImage(abs)) out.push({ url: abs, source: "og" });
    }
  }
  return out;
}

/** <img> tags: src / data-src / data-original / first srcset candidate. */
function extractImgTags(html: string, pageUrl: string): ScrapedImage[] {
  const out: ScrapedImage[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0] ?? "";
    // Skip obviously tiny images when dimensions are declared inline
    const w = tag.match(/\bwidth=["']?(\d+)/i);
    const h = tag.match(/\bheight=["']?(\d+)/i);
    if ((w && Number(w[1]) < 200) || (h && Number(h[1]) < 200)) continue;

    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim() || undefined;

    // Candidate URL attributes in priority order (lazy-load variants first —
    // when both exist, src is usually a blank placeholder)
    let src: string | undefined;
    for (const attr of ["data-src", "data-original", "data-lazy-src", "src"]) {
      const mm = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, "i"));
      if (mm?.[1] && !mm[1].startsWith("data:")) { src = mm[1]; break; }
    }
    // srcset fallback: take the last (largest) candidate
    if (!src) {
      const ss = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
      if (ss) {
        const candidates = ss.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
        src = candidates[candidates.length - 1];
      }
    }
    if (!src) continue;

    const abs = absolutize(src, pageUrl);
    if (abs && isLikelyProductImage(abs)) out.push({ url: abs, source: "img", alt });
  }
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Scrape likely product images from a brand website. Fetches the same
 * page set productDiscovery crawls, plus the Shopify JSON fast-path.
 * Returns up to `cap` de-duplicated ScrapedImages, Shopify > og > img
 * priority preserved by collection order.
 */
export async function scrapeWebsiteImages(
  websiteUrl: string,
  cap = 30,
): Promise<ScrapedImage[]> {
  const base = websiteUrl.trim().replace(/\/$/, "")
    .replace(/\/(index|default|home)\.(php|html|htm|asp|aspx)$/i, "");

  const collected: ScrapedImage[] = [];
  const seen = new Set<string>();
  const push = (imgs: ScrapedImage[]) => {
    for (const img of imgs) {
      // Normalize: strip common size-variant query params for dedupe key
      const key = img.url.replace(/[?&](w|h|width|height|size|v)=[^&]*/gi, "");
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(img);
      if (collected.length >= cap) return;
    }
  };

  // 1. Shopify fast-path — if it works we're likely done in one call
  push(await tryShopifyProductsJson(base));
  if (collected.length >= Math.min(cap, 10)) return collected.slice(0, cap);

  // 2. Crawl page set for og:image + img tags
  const suffixes = [
    "", "/products", "/product", "/shop", "/menu",
    "/collections/all", "/品牌產品", "/產品",
  ];
  for (const suffix of suffixes) {
    if (collected.length >= cap) break;
    const pageUrl = `${base}${suffix}`;
    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { "User-Agent": UA },
      });
      if (!res.ok) continue;
      const html = await res.text();
      push(extractMetaImages(html, pageUrl));
      push(extractImgTags(html, pageUrl));
    } catch { /* skip unavailable pages */ }
  }

  return collected.slice(0, cap);
}

// 2026-09-10 (CJ「所有品牌／產品的照片都應該由用戶上傳」)：matchImageToProduct
// （把掃到的圖配對到掃到的產品名）已移除——那是這支檔案唯一「把圖寫進產品」
// 的用途，其餘（extractMetaImages／extractImgTags／scrapeWebsiteImages）仍
// 保留，因為 productDiscovery.ts 的 SPA 命名 fallback 還要靠 alt 文字辨識
// 產品名（不是靠圖片本身）。
