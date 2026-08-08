/**
 * marketIntelRouter — real-data backing for the 市場情報 (Market
 * Intelligence) private-preview workspace (DataWorkspacePage.tsx,
 * sowork@sowork.tw only).
 *
 * 2026-07-25 (CJ「輿情監測比較像教學，缺乏實際數據」): the listening tab's
 * "Live Market Brief" blocks are intentionally methodology-only (query
 * packs, triage thresholds) — no OpView/Meltwater credential is connected,
 * so the page never fabricates mention counts or fake sentiment numbers.
 * CJ agreed that's the right call but wants at least ONE real, live signal
 * instead of pure theory.
 *
 * This router wires the 3 listening task cards to perplexityScout (the
 * same live web-search engine already used by socialListeningScout for
 * quick-task research) with query packs tailored to each card's actual
 * job — returning REAL, dated, linkable public-web findings. This is not
 * a substitute for a proper social-listening dashboard (no historical
 * trend, no engineered sentiment classifier, no guaranteed platform
 * coverage) — it's an honest "search it right now" upgrade over a blank
 * theory page.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";

const LISTENING_TASK_KEYS = [
  // Legacy (2026-07-25) — kept for backward compat, still callable.
  "listening.topic_buckets",
  "listening.verbatims",
  "listening.crisis_scan",
  // 2026-08-06 (CJ「輿情數據四區塊」): scope-based redesign —
  // 市場熱點（蹭熱度）/ 產業討論 / 自己 / 競爭者.
  "listening.market_hotspots",
  "listening.industry_talk",
  "listening.own_brand",
  "listening.competitors",
] as const;
type ListeningTaskKey = typeof LISTENING_TASK_KEYS[number];

interface RunResultItem { title: string; source: string; excerpt: string; url?: string }

interface BrandCtx {
  name: string;
  industry: string | null;
  competitors: string[];
  /** true when the brand's market is Taiwan → bias search to zh-TW / TW sources. */
  isTaiwan: boolean;
}

async function loadBrand(brandId: number, userId: number): Promise<BrandCtx | null> {
  const [rows]: any = await localPool.execute(
    `SELECT name, industry, soworkAnalysis, positioning, targetCountry, outputLanguage FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;

  // Competitors can live in soworkAnalysis.competitors (array) or, for
  // positioning-pipeline brands, positioning.competition.direct[].name.
  const parse = (v: any) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
  const sa = parse(row.soworkAnalysis) ?? {};
  const pos = parse(row.positioning) ?? {};
  const fromSa = Array.isArray(sa.competitors) ? sa.competitors : [];
  const direct = pos?.competition?.direct;
  const fromPos = Array.isArray(direct)
    ? direct.map((d: any) => (typeof d === "string" ? d : d?.name)).filter(Boolean)
    : [];
  const competitors = Array.from(
    new Set([...fromSa, ...fromPos].map((c) => String(c).trim()).filter(Boolean)),
  ).slice(0, 6);

  // Default to Taiwan unless the brand is explicitly a non-TW market — this
  // product is TW-first, and an unscoped Chinese query pulls in mainland
  // (Baidu, 简体) sources for TW brands like 亞培小安素.
  const tc = String(row.targetCountry ?? "").toUpperCase();
  const ol = String(row.outputLanguage ?? "").toLowerCase();
  const isTaiwan = tc ? tc === "TW" : (ol ? ol.startsWith("zh") : true);

  return { name: String(row.name ?? ""), industry: row.industry ?? null, competitors, isTaiwan };
}

/** Strip HTML/SVG/URL-encoded markup that leaks into scraped snippets
 *  (e.g. a favicon's `<path d="M16…"/>` showing up as the excerpt). */
function cleanText(s: string): string {
  let t = String(s ?? "");
  try { if (/%[0-9a-fA-F]{2}/.test(t)) t = decodeURIComponent(t); } catch { /* keep raw */ }
  t = t
    .replace(/<[^>]*>/g, " ")                    // HTML/SVG tags
    .replace(/\b(?:d|fill|viewBox|xmlns|stroke)\s*=\s*['"][^'"]*['"]/gi, " ") // SVG attrs
    .replace(/[Mm][\s\d.,-]{12,}/g, " ")         // bare SVG path coordinate runs
    .replace(/url\(#[^)]*\)/gi, " ")             // svg url(#gradient) refs
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

/** A cleaned string is real content only if it still has CJK or a word. */
function hasRealText(s: string): boolean {
  return /[一-鿿]/.test(s) || /[A-Za-z]{3,}/.test(s);
}

/** Query-pack per listening task. The 4 scope-based keys (2026-08-06) map
 *  onto the 四區塊 IA: market hotspots → industry talk → own brand →
 *  competitors. Legacy keys keep their original brand-scoped packs. */
function buildKeywords(taskKey: ListeningTaskKey, brand: BrandCtx): string[] {
  const brandName = brand.name;
  const cat = brand.industry?.trim() || brandName;
  // Region qualifier biases web search toward the brand's actual market —
  // for TW brands this keeps 亞培小安素 results on 丁丁藥局/Dcard/PTT rather
  // than 百度百科. ptt/dcard are already TW-only forums so they don't need it.
  const rgn = brand.isTaiwan ? " 台灣" : "";
  switch (taskKey) {
    // ── legacy brand-scoped ──
    case "listening.topic_buckets":
      return [`${brandName} 版型 尺寸 準不準${rgn}`, `${brandName} 材質 質感 評價${rgn}`, `${brandName} 划算 cp值 貴嗎${rgn}`];
    case "listening.verbatims":
      return [`${brandName} 開箱 心得 評價${rgn}`, `${brandName} 穿搭 好穿嗎${rgn}`];
    case "listening.crisis_scan":
      return [`${brandName} 退換貨 客訴${rgn}`, `${brandName} 色差 瑕疵 材質問題${rgn}`];
    // ── 四區塊 ──
    case "listening.market_hotspots":
      // Broad, time-sensitive trending signals to ride — NOT brand-locked.
      return [`${cat} 熱門 話題 趨勢${rgn}`, `${cat} 爆紅 討論度${rgn}`, `${cat} 最新 流行 2026${rgn}`];
    case "listening.industry_talk":
      // Category-level discussion the brand competes inside.
      return [`${cat} 推薦 ptt dcard`, `${cat} 怎麼選 比較${rgn}`, `${cat} 心得 討論${rgn}`];
    case "listening.own_brand":
      return [`${brandName} 評價 心得${rgn}`, `${brandName} 開箱 推薦${rgn}`, `${brandName} 好用嗎 值得${rgn}`];
    case "listening.competitors": {
      const comps = brand.competitors.length ? brand.competitors : [cat];
      return comps.slice(0, 4).map((c) => `${c} 評價 vs ${brandName}${rgn}`);
    }
  }
}

/** Recency window per scope: hotspots are a live trend cycle (short window);
 *  everything else is evergreen discussion. */
function daysFor(taskKey: ListeningTaskKey): number {
  return taskKey === "listening.market_hotspots" ? 30 : 180;
}

export const marketIntelRouter = router({
  /** Run one real listening query against live web search, scoped to the
   *  picked brand. Returns real findings or an honest "no result" — never
   *  fabricated numbers. */
  runListeningTask: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      taskKey: z.enum(LISTENING_TASK_KEYS),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const brand = await loadBrand(input.brandId, userId);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });

      const keywords = buildKeywords(input.taskKey, brand);
      const { perplexityScout } = await import("../_core/scouts/perplexityScout");
      const SCOUT_TIMEOUT_MS = 15_000;

      try {
        const items = await Promise.race([
          perplexityScout.fetch({
            brandId: input.brandId,
            brandName: brand.name,
            industry: brand.industry ?? undefined,
            keywords,
            competitors: input.taskKey === "listening.competitors" ? brand.competitors : [],
            industryTags: brand.industry ? [brand.industry] : [],
            days: daysFor(input.taskKey),
            limit: 6,
            loadCred: async () => null,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), SCOUT_TIMEOUT_MS)),
        ]);

        if (!items || !Array.isArray(items) || items.length === 0) {
          return {
            ok: false as const,
            message: "即時搜尋沒有找到相關的公開討論（可能是小眾品牌聲量太少，或當下 API 無結果）— 這代表確實缺乏公開聲量，不是查詢失敗。",
          };
        }

        const mapped: RunResultItem[] = items
          .map((it) => ({
            title: cleanText(it.title),
            source: it.source,
            excerpt: cleanText(it.content ?? "").slice(0, 280),
            url: it.url,
          }))
          // Drop items whose title is pure markup junk after cleaning.
          .filter((it) => hasRealText(it.title))
          .slice(0, 6);

        if (mapped.length === 0) {
          return {
            ok: false as const,
            message: "即時搜尋有回應，但內容無法解析成可讀結果（來源多為圖檔/JS 片段）。請重試或換一個查詢範圍。",
          };
        }
        return {
          ok: true as const,
          generatedAt: new Date().toISOString(),
          query: keywords.join(" / "),
          items: mapped,
        };
      } catch (e: any) {
        return {
          ok: false as const,
          message: `即時搜尋失敗：${String(e?.message ?? e).slice(0, 150)}`,
        };
      }
    }),
});
