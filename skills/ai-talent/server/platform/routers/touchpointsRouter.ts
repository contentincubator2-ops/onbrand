/**
 * touchpointsRouter — 接觸點覆蓋率的 tRPC 介面。邏輯在 core/touchpoints.ts。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import localPool from "../../localDb";
import { getTouchpointCoverage } from "../core/ops/touchpoints";

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  if ((rows as any[]).length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${brandId} 不存在或不屬於這個帳號` });
  }
}

export const touchpointsRouter = router({
  /** 這個品牌的接觸點覆蓋率：幾個已自動部署、幾個還是手動貼上。 */
  coverage: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user!.id, input.brandId);
      return getTouchpointCoverage(input.brandId);
    }),

  /**
   * 首頁「策略 → 內容 → 成效」工作流用的彙總。
   *
   * 2026-09-14（CJ「沒有將策略落實到內容層乃至於串接到成效層的感覺…策略層是，
   * 品牌定位有了，產品定位是否還須補齊」）：從「彙總數字」改成「缺口清單」——
   * 策略層回品牌定位狀態＋每個產品是否補齊定位＋最新的策略提醒本文（不只是
   * 則數），前端才能畫出真正的 mission tray，而不是一個抽象的百分比。
   * 成效層的模擬數據留在前端算（跟成效工作台同一份 perfMockData，不重算）。
   */
  homeSummary: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user!.id, input.brandId);
      const coverage = await getTouchpointCoverage(input.brandId);
      const [brandRows]: any = await localPool.execute(
        `SELECT positioningStatus FROM brands WHERE id = ? LIMIT 1`,
        [input.brandId],
      );
      const positioningStatus = (brandRows as any[])[0]?.positioningStatus ?? null;
      const [productRows]: any = await localPool.execute(
        `SELECT id, name, (positioning IS NOT NULL AND JSON_LENGTH(positioning) > 0) AS hasPositioning
           FROM products WHERE brandId = ? AND userId = ? LIMIT 50`,
        [input.brandId, ctx.user!.id],
      );
      const products = (productRows as any[]).map((p) => ({
        id: Number(p.id), name: String(p.name ?? ""), hasPositioning: !!p.hasPositioning,
      }));
      const [alertRows]: any = await localPool.execute(
        `SELECT id, title, summary FROM strategy_alerts WHERE brandId = ? AND status = 'new' ORDER BY createdAt DESC LIMIT 3`,
        [input.brandId],
      );
      const strategyAlerts = (alertRows as any[]).map((a) => ({ id: Number(a.id), title: String(a.title ?? ""), summary: String(a.summary ?? "") }));
      return { coverage, positioningStatus, products, strategyAlerts };
    }),
});
