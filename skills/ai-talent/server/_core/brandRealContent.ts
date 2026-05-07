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
import { perplexityScout } from "./scouts/perplexityScout";

const PERPLEXITY_TIMEOUT_MS = 12_000;

/** Map a social URL host → friendly platform label + search hint. */
function classifySocialUrl(url: string): { platform: string; label: string } | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("facebook.com") || host === "fb.com" || host === "m.facebook.com") return { platform: "facebook", label: "Facebook 粉專" };
    if (host.includes("instagram.com"))                      return { platform: "instagram", label: "Instagram" };
    if (host.includes("youtube.com") || host === "youtu.be") return { platform: "youtube", label: "YouTube" };
    if (host.includes("threads.net"))                        return { platform: "threads", label: "Threads" };
    if (host.includes("tiktok.com"))                         return { platform: "tiktok", label: "TikTok" };
    if (host.includes("linkedin.com"))                       return { platform: "linkedin", label: "LinkedIn" };
    if (host.includes("line.me") || host.includes("lin.ee")) return { platform: "line", label: "LINE OA" };
    return null;
  } catch { return null; }
}

/** Use Perplexity to fetch real brand content from a social platform.
 *  Direct fetchUrlSummary on FB / IG returns mostly empty (auth wall); this
 *  goes around by asking Perplexity for actual indexed posts / mentions. */
async function fetchSocialViaPerplexity(args: {
  brandName: string;
  platform: string;
  label: string;
  url: string;
}): Promise<string | null> {
  try {
    const items = await Promise.race([
      perplexityScout.fetch({
        brandId: 0,
        brandName: args.brandName,
        industry: undefined,
        keywords: [
          `${args.brandName} ${args.label} 最近貼文`,
          `${args.brandName} ${args.platform} 內容語氣 風格`,
          args.url,
        ],
        competitors: [],
        industryTags: [],
        days: 60,
        limit: 5,
        loadCred: async () => null,
      } as any),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PERPLEXITY_TIMEOUT_MS)),
    ]);
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    const lines = items.slice(0, 4).map((it: any, i: number) => {
      const title = String(it.title ?? "").slice(0, 120);
      const excerpt = String(it.content ?? "").slice(0, 320).replace(/\s+/g, " ");
      return `${i + 1}. ${title}\n   ${excerpt}`;
    });
    return `【${args.label}】${args.url}\n（透過 Perplexity 搜尋實際內容）\n${lines.join("\n")}`;
  } catch { return null; }
}

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

  // 2. Social links — direct fetchUrlSummary on FB / IG returns mostly
  //    empty body (auth wall + JS-rendered). Use Perplexity to query
  //    actual indexed brand content instead. Run in parallel so multiple
  //    socials don't serialise.
  if (brand.socialLinks) {
    const socialEntries = Object.entries(brand.socialLinks)
      .filter(([, url]) => typeof url === "string" && url.startsWith("http")) as [string, string][];

    const socialResults = await Promise.all(socialEntries.map(async ([key, url]) => {
      const cls = classifySocialUrl(url) ?? { platform: key, label: key.toUpperCase() };
      // Strategy A: Perplexity first (real post content from web index)
      const viaPerplexity = await fetchSocialViaPerplexity({
        brandName: brand.name, platform: cls.platform, label: cls.label, url,
      });
      if (viaPerplexity) {
        return { label: cls.label, block: viaPerplexity.slice(0, MAX_CHARS_PER_SOURCE) };
      }
      // Strategy B fallback: direct OG fetch (returns at least page name)
      try {
        const summary = await fetchUrlSummary(url);
        if (summary) {
          const formatted = formatUrlSummaryForPrompt(summary).slice(0, MAX_CHARS_PER_SOURCE);
          return { label: cls.label, block: `【${cls.label}】${url}\n${formatted}` };
        }
      } catch { /* skip */ }
      return null;
    }));

    for (const r of socialResults) {
      if (!r) continue;
      blocks.push(r.block);
      sources.push(r.label);
    }
  }

  const context = blocks.length > 0
    ? `\n\n【品牌真實公開內容（用於 ground 產出，不要捏造跟這份不符的產業）】\n${blocks.join("\n\n")}`
    : "";

  const dedupedSources = Array.from(new Set(sources));
  const snap: CachedSnapshot = {
    brandId,
    fetchedAt: Date.now(),
    context,
    hasContent: blocks.length > 0,
  };
  CACHE.set(brandId, snap);
  return { context, hasContent: snap.hasContent, sources: dedupedSources };
}

/** Clear cache for a brand (e.g. after user edits website / socialLinks). */
export function invalidateBrandRealContent(brandId: number): void {
  CACHE.delete(brandId);
}
