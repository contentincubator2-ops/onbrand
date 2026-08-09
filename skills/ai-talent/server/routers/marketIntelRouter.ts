/**
 * marketIntelRouter — real-data backing for the 市場情報 (Market
 * Intelligence) private-preview workspace (DataWorkspacePage.tsx,
 * sowork@sowork.tw only).
 *
 * 2026-07-25: wired the listening cards to perplexityScout (live web search)
 * so the page shows REAL, dated, linkable findings instead of theory.
 * 2026-08-06: 四區塊 redesign (市場熱點/產業討論/自己/競爭者) + Phase-1
 * accumulating store — `runListeningTask` still returns live results AND now
 * writes them into `listening_mentions` so history builds up over time;
 * `getStoredMentions` reads the accumulated dataset. Shared query packs /
 * cleaning / table live in _core/listeningScopes.ts (see also
 * scripts/ingest-listening-mentions.ts, the daily accumulation job).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import {
  LISTENING_TASK_KEYS, loadBrandCtx, fetchScopeMentions,
  ensureMentionsTable, upsertMention, SOURCE_TYPES,
  scoreSentiment, buildWordCloud, type ListeningTaskKey, type Sentiment,
} from "../_core/listeningScopes";

export const marketIntelRouter = router({
  /** Run one real listening query against live web search, scoped to the
   *  picked brand. Returns real findings or an honest "no result" — never
   *  fabricated numbers. Also writes findings into the accumulating store. */
  runListeningTask: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      taskKey: z.enum(LISTENING_TASK_KEYS),
      // Recency window (days) — freshness filter; default per-scope in fetchScopeMentions.
      days: z.number().int().min(1).max(730).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const brand = await loadBrandCtx(input.brandId, userId);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });

      const res = await fetchScopeMentions(brand, input.taskKey, input.days);
      if (!res.ok) {
        return { ok: false as const, message: res.message };
      }

      // Accumulate — every live run also feeds the historical store (Phase 1).
      // Non-fatal: a store hiccup must not break the live view.
      try {
        await ensureMentionsTable();
        for (const item of res.items) {
          await upsertMention(input.brandId, input.taskKey, item);
        }
      } catch (e) {
        console.warn("[marketIntel] mention store write failed (non-fatal):", (e as Error).message);
      }

      // Phase 2: attach 正/負/中 sentiment per item + a breakdown & word cloud
      // of THIS result set, so the live view shows OpView-style 內容分析 at once
      // (no dependency on the store being populated yet).
      const analyzed = res.items.map((it) => ({ ...it, sentiment: scoreSentiment(`${it.title} ${it.excerpt}`) }));
      const sentimentMix: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 };
      for (const a of analyzed) sentimentMix[a.sentiment]++;
      const wordCloud = buildWordCloud(res.items.map((it) => `${it.title} ${it.excerpt}`), 30);

      return {
        ok: true as const,
        generatedAt: new Date().toISOString(),
        query: res.query,
        items: analyzed,
        sentimentMix,
        wordCloud,
      };
    }),

  /** Read the accumulated mentions for a brand (Phase 1 store). Grouped-ready
   *  rows the UI can turn into per-scope lists / trend counts. */
  getStoredMentions: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scope: z.enum(LISTENING_TASK_KEYS).optional(),
      sourceType: z.enum(["news", "fanpage", "blog", "forum", "threads", "youtube", "web"]).optional(),
      // Time filter: only mentions first captured within the last N days.
      sinceDays: z.number().int().min(1).max(730).optional(),
      limit: z.number().int().min(1).max(200).default(60),
    }))
    .query(async ({ ctx, input }) => {
      // Ownership check — only surface mentions for a brand the caller owns.
      const brand = await loadBrandCtx(input.brandId, ctx.user!.id);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });

      try {
        await ensureMentionsTable();
      } catch { /* table may already exist / race — reads below still work */ }

      // Recency filters on the ARTICLE publish date (falls back to capture
      // date only when the source gave no publish date) — CJ「以發布時間為條件」.
      const PUB_DATE = "COALESCE(publishedAt, DATE_FORMAT(firstSeenAt,'%Y-%m-%d'))";
      const dateCond = `${PUB_DATE} >= DATE_FORMAT(NOW() - INTERVAL ? DAY, '%Y-%m-%d')`;

      const conds: string[] = ["brandId = ?"];
      const params: any[] = [input.brandId];
      if (input.scope) { conds.push("scope = ?"); params.push(input.scope); }
      if (input.sourceType) { conds.push("sourceType = ?"); params.push(input.sourceType); }
      if (input.sinceDays) { conds.push(dateCond); params.push(input.sinceDays); }
      const where = conds.join(" AND ");

      const [rows]: any = await localPool.execute(
        `SELECT scope, title, source, url, excerpt, sourceType, sentiment,
                firstSeenAt, lastSeenAt, seenCount, publishedAt
           FROM listening_mentions
          WHERE ${where}
          ORDER BY firstSeenAt DESC
          LIMIT ${input.limit}`,
        params,
      );
      const items = rows as Array<{ scope: ListeningTaskKey } & Record<string, any>>;

      // Per-scope counts (累積聲量 badge) — respect the same publish-date filter.
      const scopeWhere = input.sinceDays ? `brandId = ? AND ${dateCond}` : "brandId = ?";
      const scopeParams = input.sinceDays ? [input.brandId, input.sinceDays] : [input.brandId];
      const [countRows]: any = await localPool.execute(
        `SELECT scope, COUNT(*) AS n, MAX(lastSeenAt) AS latest
           FROM listening_mentions WHERE ${scopeWhere} GROUP BY scope`,
        scopeParams,
      );
      const counts: Record<string, { n: number; latest: string | null }> = {};
      for (const r of countRows as any[]) counts[r.scope] = { n: Number(r.n), latest: r.latest ?? null };

      // Source-mix breakdown (OpView 來源分布) — same time filter.
      const [srcRows]: any = await localPool.execute(
        `SELECT COALESCE(sourceType,'web') AS sourceType, COUNT(*) AS n
           FROM listening_mentions WHERE ${scopeWhere} GROUP BY COALESCE(sourceType,'web')`,
        scopeParams,
      );
      const sourceMix: Record<string, number> = {};
      for (const t of SOURCE_TYPES) sourceMix[t] = 0;
      sourceMix.web = 0;
      for (const r of srcRows as any[]) sourceMix[r.sourceType] = Number(r.n);

      // ── Phase 2: sentiment breakdown + word cloud (OpView 內容分析). Computed
      // over a representative corpus matching the SAME filters as `items` (incl.
      // scope when the page is a single scope) so the panels reflect the view.
      const corpusConds: string[] = ["brandId = ?"];
      const corpusParams: any[] = [input.brandId];
      if (input.scope) { corpusConds.push("scope = ?"); corpusParams.push(input.scope); }
      if (input.sinceDays) { corpusConds.push(dateCond); corpusParams.push(input.sinceDays); }
      const [corpusRows]: any = await localPool.execute(
        `SELECT title, excerpt, sentiment FROM listening_mentions
          WHERE ${corpusConds.join(" AND ")} ORDER BY firstSeenAt DESC LIMIT 500`,
        corpusParams,
      );
      const sentimentMix: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0 };
      const cloudTexts: string[] = [];
      for (const r of corpusRows as any[]) {
        const s: Sentiment = (r.sentiment as Sentiment) || scoreSentiment(`${r.title} ${r.excerpt ?? ""}`);
        if (s === "positive" || s === "negative" || s === "neutral") sentimentMix[s]++;
        cloudTexts.push(`${r.title} ${r.excerpt ?? ""}`);
      }
      const wordCloud = buildWordCloud(cloudTexts, 40);

      return { ok: true as const, items, counts, sourceMix, sentimentMix, wordCloud };
    }),

  /** Phase 3: daily 聲量趨勢 from the accumulating store. Bucketed by the
   *  ARTICLE publish date (COALESCE → capture date) so a trend appears even
   *  from a single ingest, and grows richer as the daily job accumulates.
   *  `volume` = Σ seenCount (repeat exposure), `mentions` = distinct items. */
  getMentionTrend: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scope: z.enum(LISTENING_TASK_KEYS).optional(),
      days: z.number().int().min(7).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const brand = await loadBrandCtx(input.brandId, ctx.user!.id);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      try { await ensureMentionsTable(); } catch { /* first-run race — read still works */ }

      const PUB_DATE = "COALESCE(publishedAt, DATE_FORMAT(firstSeenAt,'%Y-%m-%d'))";
      const conds: string[] = ["brandId = ?"];
      const params: any[] = [input.brandId];
      if (input.scope) { conds.push("scope = ?"); params.push(input.scope); }
      conds.push(`${PUB_DATE} >= DATE_FORMAT(NOW() - INTERVAL ? DAY, '%Y-%m-%d')`);
      params.push(input.days);

      const [rows]: any = await localPool.execute(
        `SELECT LEFT(${PUB_DATE}, 10) AS day,
                COUNT(*) AS mentions,
                SUM(seenCount) AS volume,
                SUM(sentiment = 'positive') AS pos,
                SUM(sentiment = 'negative') AS neg
           FROM listening_mentions
          WHERE ${conds.join(" AND ")}
          GROUP BY day
          ORDER BY day ASC`,
        params,
      );
      const series = (rows as any[])
        .filter((r) => r.day)
        .map((r) => ({
          day: String(r.day),
          mentions: Number(r.mentions),
          volume: Number(r.volume ?? r.mentions),
          pos: Number(r.pos ?? 0),
          neg: Number(r.neg ?? 0),
        }));
      const totalMentions = series.reduce((a, b) => a + b.mentions, 0);
      return { ok: true as const, series, totalMentions };
    }),
});
