/**
 * touchpointsRouter — 接觸點覆蓋率的 tRPC 介面。邏輯在 core/touchpoints.ts。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import localPool from "../../localDb";
import { getTouchpointCoverage } from "../core/touchpoints";

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
   * 首頁「三層總覽」用的彙總：內容與部署（touchpoints coverage）＋
   * 策略層現況（定位是否鎖定、幾則新的策略提醒）。成效層的模擬數據留在
   * 前端算（跟成效工作台同一份 perfMockData，不在這裡重算一次）。
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
      const [alertRows]: any = await localPool.execute(
        `SELECT COUNT(*) AS n FROM strategy_alerts WHERE brandId = ? AND status = 'new'`,
        [input.brandId],
      );
      const strategyAlertsNewCount = Number((alertRows as any[])[0]?.n ?? 0);
      return { coverage, positioningStatus, strategyAlertsNewCount };
    }),
});
