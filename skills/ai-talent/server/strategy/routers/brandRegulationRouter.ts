/**
 * brandRegulationRouter — 策略層「法規」tray 的 tRPC 介面。邏輯在 core/brandRegulations.ts
 * 與 core/regulationDigest.ts。
 *
 * 2026-09-30 第二版（CJ「用戶上傳相關資料後，跳出視窗提醒對方目前多少字，佔品牌容量多少，要萃取
 * 嗎？要的話該任務卡片就有進度顯示，萃取好以後請用戶回來確認（法規 mission tray 會跳出通知）」）：
 *
 *   create / update   存原文（≤ 50,000 字）；回傳 stats 給「要萃取嗎？」視窗
 *   extract           背景萃取審查重點；卡片讀 jobProgress 顯示進度
 *   confirmDigest     用戶確認（可先修改）→ 審查重點生效；也用來改已生效的審查重點
 *   adoptOriginal     原文夠短：直接當審查重點
 *   discardDraft      不要這次萃取的結果
 *   reviewCount       rail 圖示的通知點（有幾條等確認）
 *
 * 審查重點的字數每次存都重算大腦剩餘空間——放得進去才讓存，存了就一定讀得到。
 * 不走方案閘門：萃取是一次性的，不是每篇產文的成本。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import localPool from "../../localDb";
import { buildBrandBrain, invalidateBrandPrefix, BRAIN_CAPACITY, type BrainItem } from "../core/brand/brandContext";
import {
  REG_BODY_MAX, REG_DIGEST_MAX, REG_MAX_CARDS, REG_SOURCE_MAX, REG_TITLE_MAX, REG_TOTAL_MAX,
  charLen, checkRegulationFits, getRegulation, listRegulations, loadActiveRegulations, regulationBudget,
  type BrandRegulation,
} from "../core/brand/brandRegulations";
import { startRegulationExtraction } from "../core/brand/regulationDigest";

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

async function loadOwned(userId: number, id: number): Promise<BrandRegulation> {
  const reg = await getRegulation(id);
  if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這條法規" });
  await assertBrandAccess(userId, reg.brandId);
  return reg;
}

/**
 * 「要萃取嗎？」視窗要的數字：原文多少字、佔大腦容量多少、原文能不能直接當審查重點。
 */
async function statsFor(reg: Pick<BrandRegulation, "id" | "brandId" | "chars" | "enabled">) {
  const [existing, budget] = await Promise.all([listRegulations(reg.brandId), budgetFor(reg.brandId)]);
  const othersActive = existing.filter((r) => r.active && r.id !== reg.id).reduce((n, r) => n + r.digestChars, 0);
  const room = Math.max(0, Math.min(REG_DIGEST_MAX, budget.allowedTotal - othersActive));
  return {
    chars: reg.chars,
    capacity: BRAIN_CAPACITY,
    /** 原文佔大腦容量的百分比（可能 > 100）。 */
    pctOfCapacity: Math.round((reg.chars / BRAIN_CAPACITY) * 1000) / 10,
    /** 大腦目前被其他內容用掉多少（不含法規）＋其他法規的審查重點。 */
    usedByOthers: budget.nonRegulationChars + othersActive,
    digestMax: REG_DIGEST_MAX,
    /** 這張卡的審查重點最多還能放幾字。 */
    digestRoom: room,
    /** 原文夠短，可以直接當審查重點。 */
    canAdoptOriginal: reg.chars > 0 && reg.chars <= room,
  };
}

async function assertDigestFits(reg: BrandRegulation, digestChars: number, enabled: boolean, en?: boolean) {
  const [existing, budget] = await Promise.all([listRegulations(reg.brandId), budgetFor(reg.brandId)]);
  const reason = checkRegulationFits({
    existing: existing.map((r) => ({ id: r.id, enabled: r.active, digestChars: r.digestChars })),
    next: { id: reg.id, enabled, chars: digestChars },
    allowedTotal: budget.allowedTotal, limitedByBrain: budget.limitedByBrain, en,
  });
  if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
}

const idInput = z.object({ id: z.number().int().positive(), en: z.boolean().optional() });
const meta = {
  title: z.string().trim().min(1).max(REG_TITLE_MAX),
  source: z.string().trim().max(REG_SOURCE_MAX).default(""),
  body: z.string().trim().min(1).max(REG_BODY_MAX),
  en: z.boolean().optional(),
};

export const brandRegulationRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const [items, budget] = await Promise.all([listRegulations(input.brandId), budgetFor(input.brandId)]);
      return {
        items,
        usedTotal: items.filter((r) => r.active).reduce((n, r) => n + r.digestChars, 0),
        reviewCount: items.filter((r) => r.jobStatus === "review").length,
        budget,
        limits: {
          titleMax: REG_TITLE_MAX, sourceMax: REG_SOURCE_MAX, bodyMax: REG_BODY_MAX,
          digestMax: REG_DIGEST_MAX, totalMax: REG_TOTAL_MAX, maxCards: REG_MAX_CARDS,
        },
      };
    }),

  /**
   * 任務卡視窗用：這個品牌有幾條會用在審查的法規（>0 時進度多一格「合規檢查」）。
   * 刻意不算大腦空間——list 要為每個產品／活動各跑一次大腦，開任務卡不該付這個成本。
   */
  activeCount: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      return { count: (await loadActiveRegulations(input.brandId)).length };
    }),

  /** rail「法規」圖示的通知點：萃取好、等用戶確認的有幾條。 */
  reviewCount: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const [rows]: any = await localPool.execute(
        `SELECT COUNT(*) AS c FROM brand_regulations WHERE brandId = ? AND jobStatus = 'review'`, [input.brandId],
      );
      return { count: Number((rows as any[])[0]?.c ?? 0) };
    }),

  create: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), ...meta }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const existing = await listRegulations(input.brandId);
      if (existing.length >= REG_MAX_CARDS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: input.en
          ? `Up to ${REG_MAX_CARDS} regulation cards per brand.`
          : `一個品牌最多 ${REG_MAX_CARDS} 張法規卡。` });
      }
      const [res]: any = await localPool.execute(
        `INSERT INTO brand_regulations (brandId, userId, title, source, body, enabled) VALUES (?, ?, ?, ?, ?, 1)`,
        [input.brandId, ctx.user.id, input.title, input.source, input.body],
      );
      const id = Number(res?.insertId ?? 0);
      return { id, stats: await statsFor({ id, brandId: input.brandId, chars: charLen(input.body), enabled: true }) };
    }),

  /** 改名稱／來源／原文。改了原文：已生效的審查重點照常用，回傳 bodyChanged 讓畫面問要不要重新萃取。 */
  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), ...meta }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      const bodyChanged = cur.body.trim() !== input.body.trim();
      await localPool.execute(
        `UPDATE brand_regulations SET title = ?, source = ?, body = ? WHERE id = ?`,
        [input.title, input.source, input.body, cur.id],
      );
      if (bodyChanged && cur.jobStatus !== "extracting") {
        // 舊原文萃取出來、還沒確認的草稿對不上新原文了。
        await localPool.execute(
          `UPDATE brand_regulations SET draftDigest = NULL, jobStatus = 'idle', jobProgress = NULL, jobError = NULL WHERE id = ?`, [cur.id],
        );
      }
      invalidateBrandPrefix(cur.brandId);
      return { bodyChanged, stats: await statsFor({ ...cur, chars: charLen(input.body) }) };
    }),

  extract: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      if (!cur.chars) throw new TRPCError({ code: "BAD_REQUEST", message: "原文是空的" });
      await localPool.execute(
        `UPDATE brand_regulations SET draftDigest = NULL, jobStatus = 'extracting', jobProgress = ?, jobError = NULL WHERE id = ?`,
        [JSON.stringify({ stage: "reading", done: 0, total: 0 }), cur.id],
      );
      startRegulationExtraction(cur.id);
      return { ok: true };
    }),

  /** 確認審查重點（萃取好的草稿，用戶可先改）；也用來修改已生效的審查重點。 */
  confirmDigest: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), digest: z.string().trim().min(1).max(REG_DIGEST_MAX * 3), en: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      await assertDigestFits(cur, charLen(input.digest), cur.enabled, input.en);
      await localPool.execute(
        `UPDATE brand_regulations
            SET digest = ?, draftDigest = NULL, digestConfirmedAt = NOW(3),
                jobStatus = IF(jobStatus = 'extracting', jobStatus, 'idle'), jobProgress = IF(jobStatus = 'extracting', jobProgress, NULL)
          WHERE id = ?`,
        [input.digest, cur.id],
      );
      invalidateBrandPrefix(cur.brandId);
      return { ok: true };
    }),

  /** 原文夠短：直接當審查重點用。 */
  adoptOriginal: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      await assertDigestFits(cur, cur.chars, cur.enabled, input.en);
      await localPool.execute(
        `UPDATE brand_regulations SET digest = body, draftDigest = NULL, digestConfirmedAt = NOW(3),
                jobStatus = 'idle', jobProgress = NULL, jobError = NULL WHERE id = ?`,
        [cur.id],
      );
      invalidateBrandPrefix(cur.brandId);
      return { ok: true };
    }),

  /** 不要這次萃取的結果（已生效的審查重點不受影響）。 */
  discardDraft: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      await localPool.execute(
        `UPDATE brand_regulations SET draftDigest = NULL, jobStatus = 'idle', jobProgress = NULL, jobError = NULL WHERE id = ?`, [cur.id],
      );
      return { ok: true };
    }),

  setEnabled: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), enabled: z.boolean(), en: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const cur = await loadOwned(ctx.user.id, input.id);
      if (input.enabled && cur.digestChars > 0) await assertDigestFits(cur, cur.digestChars, true, input.en);
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
