/**
 * tabLockRouter — 品牌頁的「鎖定」（定位／文字／視覺）。
 *
 * 2026-09-30（CJ「七日發布台要整個拿掉」）：這三支原本掛在 theaterRouter 底下，但只有品牌頁
 * （BrandsPage）在用，跟七日發布台無關；刪七日發布台時原樣搬過來。原本的 lockTabs（複數）
 * 已經沒有呼叫者（呼叫它的元件先前就刪了），沒有搬。
 *
 * 鎖定＝用戶宣告「這份是定案」：畫面顯示已鎖、編輯器唯讀，定位鎖由 positioningLock.ts 擋住
 * 背景重新推論。資料存在 brands.tabLocks（JSON）。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";

const tabZ = z.enum(["positioning", "copy", "visual"]);

async function readLocks(brandId: number, userId: number): Promise<Record<string, any>> {
  const [rows]: any = await localPool.execute(
    `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error("brand not found");
  let cur: any = row.tabLocks;
  if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
  return cur ?? {};
}

async function writeLocks(brandId: number, userId: number, locks: Record<string, any>): Promise<void> {
  await localPool.execute(
    `UPDATE brands SET tabLocks = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(locks), brandId, userId],
  );
}

export const tabLockRouter = router({
  get: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        const out = await readLocks(input.brandId, ctx.user.id);
        return {
          positioning: out.positioning ?? null,
          copy:        out.copy        ?? null,
          visual:      out.visual      ?? null,
        };
      } catch {
        return { positioning: null, copy: null, visual: null };
      }
    }),

  lock: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), tab: tabZ }))
    .mutation(async ({ ctx, input }) => {
      const cur = await readLocks(input.brandId, ctx.user.id);
      cur[input.tab] = { at: new Date().toISOString(), by: ctx.user.id };
      await writeLocks(input.brandId, ctx.user.id, cur);
      return { ok: true as const, lock: cur[input.tab] };
    }),

  unlock: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), tab: tabZ }))
    .mutation(async ({ ctx, input }) => {
      const cur = await readLocks(input.brandId, ctx.user.id);
      cur[input.tab] = null;
      await writeLocks(input.brandId, ctx.user.id, cur);
      return { ok: true as const };
    }),
});
