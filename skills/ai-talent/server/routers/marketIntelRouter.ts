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
  ensureMentionsTable, upsertMention, type ListeningTaskKey,
} from "../_core/listeningScopes";

export const marketIntelRouter = router({
  /** Run one real listening query against live web search, scoped to the
   *  picked brand. Returns real findings or an honest "no result" — never
   *  fabricated numbers. Also writes findings into the accumulating store. */
  runListeningTask: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      taskKey: z.enum(LISTENING_TASK_KEYS),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const brand = await loadBrandCtx(input.brandId, userId);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });

      const res = await fetchScopeMentions(brand, input.taskKey);
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

      return {
        ok: true as const,
        generatedAt: new Date().toISOString(),
        query: res.query,
        items: res.items,
      };
    }),

  /** Read the accumulated mentions for a brand (Phase 1 store). Grouped-ready
   *  rows the UI can turn into per-scope lists / trend counts. */
  getStoredMentions: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scope: z.enum(LISTENING_TASK_KEYS).optional(),
      limit: z.number().int().min(1).max(200).default(60),
    }))
    .query(async ({ ctx, input }) => {
      // Ownership check — only surface mentions for a brand the caller owns.
      const brand = await loadBrandCtx(input.brandId, ctx.user!.id);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });

      try {
        await ensureMentionsTable();
      } catch { /* table may already exist / race — reads below still work */ }

      const where = input.scope ? "brandId = ? AND scope = ?" : "brandId = ?";
      const params: any[] = input.scope ? [input.brandId, input.scope] : [input.brandId];
      const [rows]: any = await localPool.execute(
        `SELECT scope, title, source, url, excerpt, sentiment,
                firstSeenAt, lastSeenAt, seenCount
           FROM listening_mentions
          WHERE ${where}
          ORDER BY firstSeenAt DESC
          LIMIT ${input.limit}`,
        params,
      );
      const items = rows as Array<{ scope: ListeningTaskKey } & Record<string, any>>;

      // Per-scope counts so the UI can show a 累積聲量 badge without a 2nd call.
      const [countRows]: any = await localPool.execute(
        `SELECT scope, COUNT(*) AS n, MAX(lastSeenAt) AS latest
           FROM listening_mentions WHERE brandId = ? GROUP BY scope`,
        [input.brandId],
      );
      const counts: Record<string, { n: number; latest: string | null }> = {};
      for (const r of countRows as any[]) counts[r.scope] = { n: Number(r.n), latest: r.latest ?? null };

      return { ok: true as const, items, counts };
    }),
});
