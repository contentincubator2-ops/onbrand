/**
 * navPrefsRouter — 內容層左側欄「這個品牌要放哪些入口」。
 *
 * 2026-09-27（CJ「左邊的 mission tray 要做大改變：除了專案、行事曆、活動以外，所有的
 * mission tray 變成使用者自己可以加入，自己選要加 facebook、instagram 或其他通路。
 * 目前功能都有了，但使用體驗還是很反直覺」）：
 *   - 固定：專案、行事曆（排程＋規劃合一）、活動——不存在這裡。
 *   - 可加入：5 個通路（2026-09-29 起）＋ 案例、七日發布台、AI 指令庫。
 *   - 每個品牌一份（CJ 選的）；沒設定過＝預設 Facebook＋Instagram（CJ 選的）。
 *
 * 只存 id 清單與順序。「這個品牌的任務包允不允許這個通路」由前端照 brandNav 過濾——
 * 存的東西不因任務包改變而被刪，任務包放寬之後原本的選擇會回來。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../core/trpc";
import localPool from "../../localDb";
import { assertBrandAccess } from "../core/brandAuth";

export const BRAND_NAV_PREFS_DDL = `
  CREATE TABLE IF NOT EXISTS brand_nav_prefs (
    brandId    INT          NOT NULL PRIMARY KEY,
    items      JSON         NOT NULL,
    updatedBy  INT          NULL,
    updatedAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 可以加進側欄的入口（順序＝挑選清單上的順序）。跟 client 的 NAV_CATALOG 同一份 id。 */
// 2026-09-29 CJ：內容通路只留 FB／IG／Threads／LINE／TikTok／電子報／官網（見
// planGate.HIDDEN_CONTENT_PLATFORMS）；AI 指令庫從側欄移除。存過 li/yt/pr/x 或
// ai-prompts 的品牌，sanitizeNavItems 讀出來時就會濾掉。
export const NAV_ITEM_IDS = ["fb", "ig", "threads", "line", "tt", "email", "web", "case", "theater"] as const;
export type NavItemId = (typeof NAV_ITEM_IDS)[number];
export const DEFAULT_NAV_ITEMS: NavItemId[] = ["fb", "ig"];

/** 只留認得的 id、去重、保留使用者排的順序。 */
export function sanitizeNavItems(raw: unknown): NavItemId[] {
  const out: NavItemId[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const id = String(x);
    if ((NAV_ITEM_IDS as readonly string[]).includes(id) && !out.includes(id as NavItemId)) out.push(id as NavItemId);
  }
  return out;
}

export const navPrefsRouter = router({
  /** 這個品牌的側欄項目。沒設定過回預設值，並標 isDefault。 */
  get: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [rows]: any = await localPool.execute(`SELECT items FROM brand_nav_prefs WHERE brandId = ? LIMIT 1`, [input.brandId]);
      const r = (rows as any[])[0];
      if (!r) return { items: DEFAULT_NAV_ITEMS, isDefault: true };
      const raw = typeof r.items === "string" ? (() => { try { return JSON.parse(r.items); } catch { return []; } })() : r.items;
      return { items: sanitizeNavItems(raw), isDefault: false };
    }),

  /** 存整份清單（含順序）。允許存空清單——使用者可以把所有通路都拿掉。 */
  save: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), items: z.array(z.string().max(20)).max(20) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const items = sanitizeNavItems(input.items);
      await localPool.execute(
        `INSERT INTO brand_nav_prefs (brandId, items, updatedBy) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE items = VALUES(items), updatedBy = VALUES(updatedBy)`,
        [input.brandId, JSON.stringify(items), ctx.user!.id],
      );
      return { items };
    }),
});
