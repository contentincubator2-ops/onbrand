/**
 * eventCalendarRouter — 策略層「活動」頁年度時間軸的節點。邏輯與為什麼「節點 ≠ 活動」見
 * core/eventCalendar.ts。
 *
 *   nodes        [from, from+months) 的內建節慶（扣掉隱藏的）＋自建節點，另回隱藏清單
 *   addNode      自建節點（名稱、日期、可選結束日、每年重複、備註）
 *   updateNode   改自建節點
 *   removeNode   刪自建節點
 *   hideBuiltin  隱藏一個內建節慶（整個品牌、每一年）
 *   showBuiltin  取消隱藏
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import localPool from "../../localDb";
import { getBrandMarket } from "../core/brandMarket";
import {
  NODE_MAX_PER_BRAND, NODE_NAME_MAX, NODE_NOTE_MAX,
  builtinNodes, expandCustomNodes, loadNodeRows, marketRules, ymd,
} from "../core/eventCalendar";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nodeInput = z.object({
  name: z.string().trim().min(1).max(NODE_NAME_MAX),
  startDate: dateStr,
  endDate: dateStr.nullable().optional(),
  recurring: z.boolean().default(false),
  note: z.string().trim().max(NODE_NOTE_MAX).nullable().optional(),
}).refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "結束日不能早於開始日", path: ["endDate"] });

async function loadOwnedNode(userId: number, id: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, brandId FROM brand_calendar_nodes WHERE id = ? AND kind = 'custom' LIMIT 1`, [id],
  );
  const r = (rows as any[])?.[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個節點" });
  await assertBrandAccess(userId, Number(r.brandId));
  return r;
}

export const eventCalendarRouter = router({
  nodes: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      /** YYYY-MM：視窗從這個月 1 號開始 */
      fromMonth: z.string().regex(/^\d{4}-\d{2}$/),
      months: z.number().int().min(1).max(24).default(12),
    }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const y = Number(input.fromMonth.slice(0, 4)), m = Number(input.fromMonth.slice(5, 7));
      const from = ymd(y, m, 1);
      const end = new Date(Date.UTC(y, m - 1 + input.months, 1));
      const to = ymd(end.getUTCFullYear(), end.getUTCMonth() + 1, 1);

      const [{ targetCountry }, { custom, hidden }] = await Promise.all([
        getBrandMarket(input.brandId), loadNodeRows(input.brandId),
      ]);
      const all = builtinNodes(targetCountry, from, to);
      const hiddenBuiltins = marketRules(targetCountry).rules
        .map((r) => ({ builtinKey: `${marketRules(targetCountry).market.toLowerCase()}:${r.slug}`, nameZh: r.zh, nameEn: r.en }))
        .filter((r) => hidden.has(r.builtinKey));
      return {
        market: marketRules(targetCountry).market,
        from, to,
        builtin: all.filter((n) => !hidden.has(n.builtinKey!)),
        custom: expandCustomNodes(custom, from, to),
        hiddenBuiltins,
        customCount: custom.length,
        customMax: NODE_MAX_PER_BRAND,
      };
    }),

  addNode: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }).and(nodeInput))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [cnt]: any = await localPool.execute(
        `SELECT COUNT(*) AS n FROM brand_calendar_nodes WHERE brandId = ? AND kind = 'custom'`, [input.brandId],
      );
      if (Number((cnt as any[])[0]?.n ?? 0) >= NODE_MAX_PER_BRAND) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `一個品牌最多 ${NODE_MAX_PER_BRAND} 個自訂節點` });
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO brand_calendar_nodes (brandId, userId, kind, name, startDate, endDate, recurring, note)
         VALUES (?, ?, 'custom', ?, ?, ?, ?, ?)`,
        [input.brandId, ctx.user!.id, input.name, input.startDate, input.endDate ?? null,
         input.recurring ? 1 : 0, input.note || null],
      );
      return { id: Number(r?.insertId ?? 0) };
    }),

  updateNode: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }).and(nodeInput))
    .mutation(async ({ ctx, input }) => {
      await loadOwnedNode(ctx.user!.id, input.id);
      await localPool.execute(
        `UPDATE brand_calendar_nodes SET name = ?, startDate = ?, endDate = ?, recurring = ?, note = ?
          WHERE id = ? AND kind = 'custom'`,
        [input.name, input.startDate, input.endDate ?? null, input.recurring ? 1 : 0, input.note || null, input.id],
      );
      return { ok: true };
    }),

  removeNode: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwnedNode(ctx.user!.id, input.id);
      await localPool.execute(`DELETE FROM brand_calendar_nodes WHERE id = ? AND kind = 'custom'`, [input.id]);
      return { ok: true };
    }),

  hideBuiltin: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), builtinKey: z.string().regex(/^[a-z]+:[a-z0-9-]+$/) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await localPool.execute(
        `INSERT INTO brand_calendar_nodes (brandId, userId, kind, builtinKey)
         SELECT ?, ?, 'hidden', ? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM brand_calendar_nodes WHERE brandId = ? AND kind = 'hidden' AND builtinKey = ?)`,
        [input.brandId, ctx.user!.id, input.builtinKey, input.brandId, input.builtinKey],
      );
      return { ok: true };
    }),

  showBuiltin: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), builtinKey: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await localPool.execute(
        `DELETE FROM brand_calendar_nodes WHERE brandId = ? AND kind = 'hidden' AND builtinKey = ?`,
        [input.brandId, input.builtinKey],
      );
      return { ok: true };
    }),
});
