/**
 * addonRouter — 加購申請（目前只有電商營運報告）。邏輯在 core/addonRequests.ts。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import localPool from "../../localDb";
import { addonAvailableFor } from "../core/plans";
import {
  createEcomReportingRequest, listAddonRequests, quoteEcomReporting,
} from "../core/addonRequests";
import { loadUserPlan } from "./billingRouter";

const SKUS = z.number().int().min(1).max(100000);

/** 專業（或企業）方案、而且方案還有效，才能申請加購。 */
async function assertCanRequest(userId: number): Promise<{ email: string | null }> {
  const plan = await loadUserPlan(userId);
  if (plan.planStatus === "expired" || plan.planStatus === "canceled") {
    throw new TRPCError({ code: "FORBIDDEN", message: "方案已到期，請先續訂 onBrand Studio 專業版。" });
  }
  if (!addonAvailableFor("ecom_reporting", plan.planCode)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "電商營運報告須搭配 onBrand Studio 專業版（NT$9,000／月）訂閱。" });
  }
  const [rows]: any = await localPool.execute(`SELECT email FROM users WHERE id = ? LIMIT 1`, [userId]);
  return { email: (rows as any[])[0]?.email ?? null };
}

export const addonRouter = router({
  /** 依品項數試算。純計算，不寫任何東西，所以不擋方案。 */
  quote: protectedProcedure
    .input(z.object({ skus: SKUS }))
    .query(({ input }) => quoteEcomReporting(input.skus)),

  /** 這位用戶的電商營運報告申請紀錄（新到舊）＋ 能不能申請。 */
  status: protectedProcedure.query(async ({ ctx }) => {
    const plan = await loadUserPlan(ctx.user!.id);
    const eligible = plan.planStatus !== "expired" && plan.planStatus !== "canceled"
      && addonAvailableFor("ecom_reporting", plan.planCode);
    return { eligible, requests: await listAddonRequests(ctx.user!.id, "ecom_reporting") };
  }),

  /** 送出申請：存進資料庫、寄信給業務。同時只會有一筆進行中的申請。 */
  request: protectedProcedure
    .input(z.object({
      skus: SKUS,
      storePlatform: z.string().max(60).optional(),
      notes: z.string().max(1500).optional(),
      brandId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { email } = await assertCanRequest(userId);
      let brandId: number | null = null;
      if (input.brandId) {
        const [b]: any = await localPool.execute(
          `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, userId],
        );
        if ((b as any[]).length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${input.brandId} 不存在或不屬於這個帳號` });
        }
        brandId = input.brandId;
      }
      return createEcomReportingRequest({
        userId, userEmail: email, brandId,
        skus: input.skus, storePlatform: input.storePlatform, notes: input.notes,
      });
    }),
});
