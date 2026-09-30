/**
 * brandRegulationRouter — 策略層「法規」tray 的 tRPC 介面。邏輯在 core/brandRegulations.ts。
 *
 * 2026-09-30（CJ「用戶自行增加整個法規來源（但是有字數上限，確定品牌大腦吃得下），agent 寫
 * 文章前要審查」）。每一次存檔都重算「這個品牌不含法規時，一次寫作最多讀進大腦多少字」，
 * 法規合計不得超過大腦剩下的空間——放得進去才讓存，存了就一定讀得到。
 *
 * 不收費、不走方案閘門：這裡沒有 LLM 呼叫，只是讓每一篇產文多一段審查依據。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import localPool from "../../localDb";
import { buildBrandBrain, invalidateBrandPrefix, BRAIN_CAPACITY, type BrainItem } from "../core/brandContext";
import {
  REG_CARD_MAX, REG_MAX_CARDS, REG_SOURCE_MAX, REG_TITLE_MAX, REG_TOTAL_MAX,
  charLen, checkRegulationFits, listRegulations, regulationBudget, rowToRegulation,
} from "../core/brandRegulations";

/** 產品／活動太多時只算最近更新的這麼多個（跟 brandMemory 一樣）。 */
const MAX_ENTITIES = 30;

/** 一行記憶實際會佔的字數；被擠掉的那行照它原本的份量算（騰出空間後它會回來）。 */
const demandOf = (items: BrainItem[], keep: (i: BrainItem) => boolean) =>
  items
    .filter((i) => i.category !== "regulation" && i.status !== "checkOnly" && keep(i))
    .reduce((n, i) => n + (i.status === "overflow" ? i.storedChars : i.keptChars), 0);

/**
 * 不含法規時，一次寫作最多讀進大腦幾字：品牌那份＋最大的產品＋最大的活動
 * （一次寫作只聚焦一個產品、一個活動）。
 */
export async function brainDemandWithoutRegulations(brandId: number): Promise<number> {
  const ids = async (table: "products" | "events") => {
    try {
      const [rows]: any = await localPool.execute(
        `SELECT id FROM ${table} WHERE brandId = ? ORDER BY updatedAt DESC LIMIT ${MAX_ENTITIES}`, [brandId],
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => Number(r.id));
    } catch { return []; }
  };
  const [productIds, eventIds] = await Promise.all([ids("products"), ids("events")]);
  const [brand, products, events] = await Promise.all([
    buildBrandBrain(brandId),
    Promise.all(productIds.map((id) => buildBrandBrain(brandId, id, null))),
    Promise.all(eventIds.map((id) => buildBrandBrain(brandId, null, id))),
  ]);
  const base = demandOf(brand.items, (i) => i.category !== "product" && i.category !== "event");
  const maxProduct = Math.max(0, ...products.map((b) => demandOf(b.items, (i) => i.category === "product")));
  const maxEvent = Math.max(0, ...events.map((b) => demandOf(b.items, (i) => i.category === "event")));
  return base + maxProduct + maxEvent;
}

async function budgetFor(brandId: number) {
  const demand = await brainDemandWithoutRegulations(brandId);
  return { ...regulationBudget(demand, BRAIN_CAPACITY), nonRegulationChars: demand, capacity: BRAIN_CAPACITY };
}

async function loadOwned(userId: number, id: number) {
  const [rows]: any = await localPool.execute(`SELECT * FROM brand_regulations WHERE id = ? LIMIT 1`, [id]);
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這條法規" });
  await assertBrandAccess(userId, Number(r.brandId));
  return rowToRegulation(r);
}

const fields = {
  title: z.string().trim().min(1).max(REG_TITLE_MAX),
  source: z.string().trim().max(REG_SOURCE_MAX).default(""),
  // 條文本身的上限在 checkRegulationFits 給看得懂的訊息；這裡只擋明顯灌爆的輸入。
  body: z.string().trim().min(1).max(REG_CARD_MAX * 4),
  enabled: z.boolean().default(true),
  en: z.boolean().optional(),
};

async function assertFits(brandId: number, next: { id: number | null; enabled: boolean; chars: number }, en?: boolean) {
  const [existing, budget] = await Promise.all([listRegulations(brandId), budgetFor(brandId)]);
  const reason = checkRegulationFits({ existing, next, allowedTotal: budget.allowedTotal, limitedByBrain: budget.limitedByBrain, en });
  if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
  return existing;
}

export const brandRegulationRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const [items, budget] = await Promise.all([listRegulations(input.brandId), budgetFor(input.brandId)]);
      return {
        items,
        usedTotal: items.filter((r) => r.enabled).reduce((n, r) => n + r.chars, 0),
        budget,
        limits: {
          titleMax: REG_TITLE_MAX, sourceMax: REG_SOURCE_MAX, cardMax: REG_CARD_MAX,
          totalMax: REG_TOTAL_MAX, maxCards: REG_MAX_CARDS,
        },
      };
    }),

  create: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), ...fields }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const existing = await assertFits(input.brandId, { id: null, enabled: input.enabled, chars: charLen(input.body) }, input.en);
      if (existing.length >= REG_MAX_CARDS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: input.en
          ? `Up to ${REG_MAX_CARDS} regulation cards per brand.`
          : `一個品牌最多 ${REG_MAX_CARDS} 張法規卡。` });
      }
      const [res]: any = await localPool.execute(
        `INSERT INTO brand_regulations (brandId, userId, title, source, body, enabled) VALUES (?, ?, ?, ?, ?, ?)`,
        [input.brandId, ctx.user.id, input.title, input.source, input.body, input.enabled ? 1 : 0],
      );
      invalidateBrandPrefix(input.brandId);
      return { id: Number(res?.insertId ?? 0) };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), ...fields }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      await assertFits(cur.brandId, { id: cur.id, enabled: input.enabled, chars: charLen(input.body) }, input.en);
      await localPool.execute(
        `UPDATE brand_regulations SET title = ?, source = ?, body = ?, enabled = ? WHERE id = ?`,
        [input.title, input.source, input.body, input.enabled ? 1 : 0, cur.id],
      );
      invalidateBrandPrefix(cur.brandId);
      return { ok: true };
    }),

  setEnabled: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), enabled: z.boolean(), en: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      if (input.enabled) await assertFits(cur.brandId, { id: cur.id, enabled: true, chars: cur.chars }, input.en);
      await localPool.execute(`UPDATE brand_regulations SET enabled = ? WHERE id = ?`, [input.enabled ? 1 : 0, cur.id]);
      invalidateBrandPrefix(cur.brandId);
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      await localPool.execute(`DELETE FROM brand_regulations WHERE id = ?`, [cur.id]);
      invalidateBrandPrefix(cur.brandId);
      return { ok: true };
    }),
});
