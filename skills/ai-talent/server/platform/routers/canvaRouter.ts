/**
 * canvaRouter — Canva 連接的狀態／中斷／列設計。授權的 install／callback 在
 * server/platform/routes/cloudOAuthRoute.ts（瀏覽器轉址流程，不走 tRPC）。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖」）。
 *
 * 連接跟著「人」：這個 namespace 列在 teamAccess 的 PERSONAL_NAMESPACES，所以 ctx.user
 * 永遠是按下按鈕的那個人——團隊成員看到的是自己的 Canva，不是品牌擁有者的。
 * 真正把圖存進品牌的那一步在 assetPhoto.importCanvaDesign（要看品牌權限）。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../core/trpc";
import { ENV } from "../core/env";
import {
  getConnectionStatus, disconnectCloud, getValidAccessToken, CloudNotConnectedError, CANVA_ACCOUNT_SCOPE,
} from "../core/connectors/cloudTokens";
import { listCanvaDesigns, canvaErrorMessage, canvaCanWrite } from "../core/connectors/canvaClient";

export const canvaRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const configured = !!ENV.CANVA_CLIENT_ID && !!ENV.CANVA_CLIENT_SECRET;
    if (!configured) return { configured, connected: false, accountName: null as string | null, canCreate: false };
    const s = await getConnectionStatus(ctx.user!.id, CANVA_ACCOUNT_SCOPE, "canva");
    // canCreate：這個環境的 integration 有沒有開「替用戶開新設計」的 scope（CANVA_SCOPES）。
    return { configured, connected: s.connected, accountName: s.accountEmail, canCreate: canvaCanWrite() };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await disconnectCloud(ctx.user!.id, CANVA_ACCOUNT_SCOPE, "canva");
    return { ok: true as const };
  }),

  listDesigns: protectedProcedure
    .input(z.object({
      query: z.string().max(255).optional(),
      continuation: z.string().max(2000).optional(),
      lang: z.enum(["zh-TW", "en"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const accessToken = await getValidAccessToken(ctx.user!.id, CANVA_ACCOUNT_SCOPE, "canva");
        const page = await listCanvaDesigns(accessToken, input);
        return { ok: true as const, ...page };
      } catch (e) {
        if (e instanceof CloudNotConnectedError) return { ok: false as const, error: "not-connected" as const, message: "" };
        return { ok: false as const, error: "failed" as const, message: canvaErrorMessage(e, input.lang === "en") };
      }
    }),
});
