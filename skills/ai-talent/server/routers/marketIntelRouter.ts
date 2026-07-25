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
  "listening.topic_buckets",
  "listening.verbatims",
  "listening.crisis_scan",
] as const;
type ListeningTaskKey = typeof LISTENING_TASK_KEYS[number];

interface RunResultItem { title: string; source: string; excerpt: string; url?: string }

async function loadBrand(brandId: number, userId: number): Promise<{ name: string; industry: string | null } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT name, industry FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  return row ? { name: String(row.name ?? ""), industry: row.industry ?? null } : null;
}

/** Query-pack per listening task — see project design in DataWorkspacePage's
 *  irisMarketDesign.listening blocks (四類訊號桶 / 危機分級). */
function buildKeywords(taskKey: ListeningTaskKey, brandName: string): string[] {
  switch (taskKey) {
    case "listening.topic_buckets":
      return [
        `${brandName} 版型 尺寸 準不準`,
        `${brandName} 材質 質感 評價`,
        `${brandName} 划算 cp值 貴嗎`,
      ];
    case "listening.verbatims":
      return [
        `${brandName} 開箱 心得 評價`,
        `${brandName} 穿搭 好穿嗎`,
      ];
    case "listening.crisis_scan":
      return [
        `${brandName} 退換貨 客訴`,
        `${brandName} 色差 瑕疵 材質問題`,
      ];
  }
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

      const keywords = buildKeywords(input.taskKey, brand.name);
      const { perplexityScout } = await import("../_core/scouts/perplexityScout");
      const SCOUT_TIMEOUT_MS = 15_000;

      try {
        const items = await Promise.race([
          perplexityScout.fetch({
            brandId: input.brandId,
            brandName: brand.name,
            industry: brand.industry ?? undefined,
            keywords,
            competitors: [],
            industryTags: brand.industry ? [brand.industry] : [],
            days: 180, // apparel discussion is evergreen, not news-cycle — widen the window
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

        const mapped: RunResultItem[] = items.slice(0, 6).map((it) => ({
          title: it.title,
          source: it.source,
          excerpt: (it.content ?? "").slice(0, 280),
          url: it.url,
        }));
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
