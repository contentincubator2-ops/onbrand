/**
 * customChannelRouter — 用戶自己新增 mission tray（通路）。
 *
 * 2026-10-04（CJ「用戶也可自己增加 mission tray，例如蝦皮、momo、網紅合作」）。
 * 資料與平台範本在 core/catalog/customChannels.ts；這裡只是權限與增刪改。
 *
 * 不經過方案的「通路額度」（planGate.resolveChannels）：額度管的是內建通路的
 * 「7 選 N」，自訂通路底下全是用戶自建卡，已受 ownTaskCards 上限約束。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { assertCanAct } from "../../platform/core/billing/planGate";
import { CUSTOM_CHANNEL_RE } from "../../platform/core/customChannelId";
import { listBrandTaskCards } from "../core/catalog/brandTaskCards";
import {
  CHANNEL_PRESETS, MAX_CUSTOM_CHANNELS_PER_BRAND,
  buildChannel, listCustomChannels, mutateCustomChannels,
} from "../core/catalog/customChannels";

const channelId = z.string().regex(CUSTOM_CHANNEL_RE);

export const customChannelRouter = router({
  /** 可選的平台範本（資料）。不需要品牌，登入就看得到。 */
  presets: protectedProcedure.query(() => CHANNEL_PRESETS),

  /** 這個品牌自己加的通路。 */
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return await listCustomChannels(input.brandId);
    }),

  /** 從範本建（preset），或用戶自己命名（name）。兩者至少給一個。 */
  create: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      preset: z.string().max(30).optional(),
      name: z.string().min(1).max(30).optional(),
      // 自己命名時選型態：貼文（預設）或商品頁（逐欄交付、可批次產出）。從範本建的以範本為準。
      format: z.enum(["post", "listing"]).optional(),
    }).refine((v) => !!v.preset || !!v.name, { message: "preset or name required" }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      let created: ReturnType<typeof buildChannel> | null = null;
      const list = await mutateCustomChannels(input.brandId, userId, (cur) => {
        // 同一個範本只建一次：再點一次回既有那個，不要長出「蝦皮」「蝦皮-2」。
        const dup = input.preset ? cur.find((c) => c.preset === input.preset) : undefined;
        if (dup) { created = dup; return cur; }
        if (cur.length >= MAX_CUSTOM_CHANNELS_PER_BRAND) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `每個品牌最多 ${MAX_CUSTOM_CHANNELS_PER_BRAND} 個自訂通路。` });
        }
        try {
          created = buildChannel(input.brandId, cur, { preset: input.preset, name: input.name, format: input.format, userId });
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) });
        }
        return [...cur, created];
      });
      return { channel: created!, channels: list };
    }),

  rename: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: channelId, name: z.string().min(1).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const list = await mutateCustomChannels(input.brandId, userId, (cur) =>
        cur.map((c) => (c.id === input.id ? { ...c, name: input.name.trim() } : c)));
      return { channels: list };
    }),

  /**
   * 刪通路。底下還有自建卡就擋下來：卡只存 channel id，通路沒了卡會變成找不到
   * 入口的孤兒，用戶會以為卡不見了。要先刪卡，或到「我的任務卡」複製到別的通路。
   */
  remove: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: channelId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const cards = (await listBrandTaskCards(input.brandId)).filter((c) => c.channel === input.id);
      if (cards.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `這個通路底下還有 ${cards.length} 張自建任務卡。先刪掉，或複製到其他通路再刪。`,
        });
      }
      const list = await mutateCustomChannels(input.brandId, userId, (cur) => cur.filter((c) => c.id !== input.id));
      return { channels: list };
    }),
});
