/**
 * brandRealContent — fetch the brand's ACTUAL public content (website +
 * FB / IG / YT social links) so AI 自動填寫 / 自動定位 are grounded in
 * real text, not hallucinated industry guesses.
 *
 * CJ direction (2026-05-07):
 *   "我用五感十築試自動填寫，結果變成美妝。應該要去讀取該粉絲團或
 *    官網常用的文字。"
 *
 * Cache: 1 hour in-process Map keyed by brandId. Cheap re-fetch; saves
 * latency on the bulk-suggest path which calls 12 times in a row.
 */
import localPool from "../localDb";
import { fetchUrlSummary, formatUrlSummaryForPrompt } from "./urlContext";

interface CachedSnapshot {
  brandId: number;
  fetchedAt: number;
  context: string;
  hasContent: boolean;
}

const CACHE = new Map<number, CachedSnapshot>();
const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CHARS_PER_SOURCE = 4_000;

export interface BrandRealContent {
  context: string;       // prompt-injectable block
  hasContent: boolean;   // false if nothing fetched (no URLs / all failed)
  sources: string[];     // human-readable list of what was used
}

/** Pull website + socialLinks from brands row. */
async function loadBrandUrls(brandId: number): Promise<{
  name: string; website: string | null; socialLinks: Record<string, string> | null;
} | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT name, website, socialLinks FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    let social = row.socialLinks;
    if (typeof social === "string") { try { social = JSON.parse(social); } catch { social = null; } }
    return {
      name: String(row.name ?? ""),
      website: row.website ?? null,
      socialLinks: (social && typeof social === "object") ? social : null,
    };
  } catch { return null; }
}

/**
 * Fetch real public content for a brand. Returns cached value if fetched
 * within TTL. Bypass cache by passing { force: true }.
 */
export async function getBrandRealContent(
  brandId: number,
  opts: { force?: boolean } = {},
): Promise<BrandRealContent> {
  const cached = CACHE.get(brandId);
  if (cached && !opts.force && Date.now() - cached.fetchedAt < TTL_MS) {
    return { context: cached.context, hasContent: cached.hasContent, sources: [] };
  }

  const brand = await loadBrandUrls(brandId);
  if (!brand) return { context: "", hasContent: false, sources: [] };

  const sources: string[] = [];
  const blocks: string[] = [];

  // 1. Website
  if (brand.website) {
    try {
      const summary = await fetchUrlSummary(brand.website);
      if (summary) {
        const formatted = formatUrlSummaryForPrompt(summary).slice(0, MAX_CHARS_PER_SOURCE);
        blocks.push(`【官網】${brand.website}\n${formatted}`);
        sources.push("官網");
      }
    } catch { /* skip */ }
  }

  // 2. Social links (FB / IG / YT) — best-effort URL fetch.
  // For FB: their public page HTML is mostly empty without auth; we still
  // try fetchUrlSummary which falls back to OG tags / meta description.
  // If that's all we get it's still useful (品牌 self-description).
  if (brand.socialLinks) {
    for (const [platform, url] of Object.entries(brand.socialLinks)) {
      if (typeof url !== "string" || !url.startsWith("http")) continue;
      try {
        const summary = await fetchUrlSummary(url);
        if (summary) {
          const formatted = formatUrlSummaryForPrompt(summary).slice(0, MAX_CHARS_PER_SOURCE);
          const label = platform.toUpperCase();
          blocks.push(`【${label}】${url}\n${formatted}`);
          sources.push(label);
        }
      } catch { /* skip */ }
    }
  }

  const context = blocks.length > 0
    ? `\n\n【品牌真實公開內容（用於 ground 產出，不要捏造跟這份不符的產業）】\n${blocks.join("\n\n")}`
    : "";

  const snap: CachedSnapshot = {
    brandId,
    fetchedAt: Date.now(),
    context,
    hasContent: blocks.length > 0,
  };
  CACHE.set(brandId, snap);
  return { context, hasContent: snap.hasContent, sources };
}

/** Clear cache for a brand (e.g. after user edits website / socialLinks). */
export function invalidateBrandRealContent(brandId: number): void {
  CACHE.delete(brandId);
}
