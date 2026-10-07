import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import { assertBrandAccess } from "../core/brandAuth";
import { isRuntimeFeatureEnabled } from "../core/ops/runtimeSafety";
import { createZernioClient } from "../core/connectors/zernio";
import { createZernioAdapter } from "../core/connectors/publish/zernioAdapter";
import { PublishUserError } from "../core/connectors/publish/publishAdapter";
import { getPublishProvider } from "../core/connectors/publish/publishProvider";

const PLATFORMS = ["facebook", "instagram", "linkedin", "threads", "x", "youtube", "tiktok"] as const;
const connectionInput = z.object({ brandId: z.number().int().positive(), platform: z.enum(PLATFORMS) });
const httpsUrl = z.string().url().refine(value => new URL(value).protocol === "https:", "連接返回網址必須使用 HTTPS。");
const socialProcedure = protectedProcedure.use(async ({ next }) => {
  if (!isRuntimeFeatureEnabled("SOCIAL_PUBLISH_ENABLED")) throw new TRPCError({
    code: "PRECONDITION_FAILED", message: "此環境已停用社群連接與發布功能。",
  });
  return next();
});
async function requireAdapter() {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "連接服務尚未啟用，請聯絡 sowork@sowork.ai。" });
  const { default: pool } = await import("../../localDb");
  return createZernioAdapter({ client: createZernioClient({ apiKey }), pool,
    brandNameOf: async brandId => {
      const [rows]: any = await pool.execute("SELECT name FROM brands WHERE id = ? LIMIT 1", [brandId]);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "品牌不存在" });
      return rows[0].name ?? "";
    },
  });
}
async function connectAction<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: e instanceof PublishUserError ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: e instanceof Error ? e.message : "連接服務暫時異常，請稍後再試。" });
  }
}
export const zernioConnectRouter = router({
  getProviders: socialProcedure.query(() => ({
    facebook: getPublishProvider("facebook"), instagram: getPublishProvider("instagram"),
    linkedin: getPublishProvider("linkedin"), threads: getPublishProvider("threads"), x: getPublishProvider("x"),
    youtube: getPublishProvider("youtube"), tiktok: getPublishProvider("tiktok"),
  })),
  getConnectUrl: socialProcedure.input(connectionInput.extend({ redirectUrl: httpsUrl.optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      return connectAction(async () => {
        const adapter = await requireAdapter();
        const redirectUrl = input.redirectUrl ?? `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/brands/edit?b=${input.brandId}&cat=publish`;
        if (!httpsUrl.safeParse(redirectUrl).success) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "連接返回網址尚未設定為 HTTPS，請聯絡 sowork@sowork.ai。" });
        return adapter.getConnectUrl({ ...input, redirectUrl });
      });
    }),
  getConnectionStatus: socialProcedure.input(connectionInput).mutation(async ({ ctx, input }) => {
    await assertBrandAccess(ctx.user.id, input.brandId);
    return connectAction(async () => {
      const accounts = await (await requireAdapter()).syncConnections(input);
      return { connected: accounts.length > 0, accounts: accounts.map(a => ({
        accountId: a.accountId, name: a.accountLabel ?? a.accountUsername ?? a.accountId, username: a.accountUsername ?? null,
      })) };
    });
  }),
  disconnect: socialProcedure.input(connectionInput.extend({ accountId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      return connectAction(async () => (await requireAdapter()).disconnect(input));
    }),
});
