/**
 * listingBatchRouter — 商品頁卡的批次產出：選商品 → 估點數 → 背景逐筆寫 → 逐筆審 → 匯出。
 *
 * 2026-10-05。核心與取捨見 core/catalog/listingBatch.ts；執行見 quickTask/listingBatchRunner.ts。
 * 這裡只是權限、驗證與審核狀態的增改。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { assertCanAct, assertTaskAllowed } from "../../platform/core/billing/planGate";
import { getBalance, costOf } from "../../platform/core/billing/pointsService";
import localPool from "../../localDb";
import { getBrandTaskCard, listingSpecOf, type BrandTaskCard } from "../core/catalog/brandTaskCards";
import {
  MAX_BATCH_ITEMS, BATCH_ID_RE, parseBatchTable, buildBatchItems, newBatchId, summarizeOutput,
  listBatches, getBatch, mutateBatches, updateBatch, deriveStatus, countItems, isStaleRunning,
  type ListingBatch, type BatchItem,
} from "../core/catalog/listingBatch";
import { gateInfoFor } from "./quickTask/helpers";
import { kickBatch, isBatchActive } from "./quickTask/listingBatchRunner";

const batchId = z.string().regex(BATCH_ID_RE);
const source = {
  brandId: z.number().int().positive(),
  cardId: z.string().min(1).max(80),
  productIds: z.array(z.number().int().positive()).max(MAX_BATCH_ITEMS).default([]),
  /** 從 Excel／Google 試算表複製的表格，或一行一個商品名稱。 */
  table: z.string().max(60_000).default(""),
};

/** 批次要用的卡：必須存在、已上架、而且是商品頁卡。 */
async function loadListingCard(brandId: number, cardId: string): Promise<BrandTaskCard> {
  const card = await getBrandTaskCard(brandId, cardId);
  if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
  if (card.status !== "ready") throw new TRPCError({ code: "BAD_REQUEST", message: "這張卡還沒上架，先完成試寫並上架。" });
  if (card.format !== "listing") throw new TRPCError({ code: "BAD_REQUEST", message: "批次產出只支援商品頁的卡（電商、開店平台）。" });
  return card;
}

async function resolveItems(userId: number, input: { brandId: number; productIds: number[]; table: string }, card: BrandTaskCard) {
  let products: Array<{ id: number; name: string }> = [];
  if (input.productIds.length > 0) {
    const ph = input.productIds.map(() => "?").join(",");
    const [rows]: any = await localPool.execute(
      `SELECT id, name FROM products WHERE id IN (${ph}) AND userId = ? AND brandId = ?`,
      [...input.productIds, userId, input.brandId],
    );
    const byId = new Map((rows as any[]).map((r) => [Number(r.id), String(r.name)]));
    // 保持用戶勾選的順序；不屬於這個品牌的 id 靜靜丟掉（不洩漏別人的產品存在與否）。
    products = input.productIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
  }
  const parsed = parseBatchTable(input.table, card.askFields);
  const items = buildBatchItems(products, parsed.rows);
  return { items, parsed };
}

async function costOfBatch(userId: number, count: number) {
  const [balance] = await Promise.all([getBalance(userId)]);
  const perRun = costOf("task_30s");
  const unlimited = balance.pointsPerCycle < 0;
  const total = perRun * count;
  return { perRun, total, balance: balance.balance, unlimited, enough: unlimited || balance.balance >= total };
}

export const listingBatchRouter = router({
  /** 還沒建，只估：解析結果、會寫幾筆、要花多少點、點數夠不夠。 */
  quote: protectedProcedure
    .input(z.object(source))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const card = await loadListingCard(input.brandId, input.cardId);
      const { items, parsed } = await resolveItems(userId, input, card);
      return {
        count: items.length,
        labels: items.map((i) => i.label),
        ignoredColumns: parsed.ignoredColumns,
        truncated: parsed.truncated,
        note: parsed.note,
        ...(await costOfBatch(userId, items.length)),
      };
    }),

  create: protectedProcedure
    .input(z.object({ ...source, name: z.string().max(60).optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const card = await loadListingCard(input.brandId, input.cardId);
      await assertTaskAllowed({ userId, brandId: input.brandId, info: gateInfoFor(card.id) });
      const { items } = await resolveItems(userId, input, card);
      if (items.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有可以寫的商品。勾選產品，或貼上商品名稱。" });
      const cost = await costOfBatch(userId, items.length);
      // 全部都付不起就不要開始；夠付一部分就開始，點數用完會自動暫停（補了可以接著跑）。
      if (!cost.unlimited && cost.balance < cost.perRun) {
        throw new TRPCError({ code: "FORBIDDEN", message: `點數不足 — 還剩 ${cost.balance} 點，每個商品需要 ${cost.perRun} 點。` });
      }
      const id = newBatchId();
      const now = new Date().toISOString();
      const batch: ListingBatch = {
        id, brandId: input.brandId, cardId: card.id, channelId: String(card.channel),
        name: (input.name?.trim() || `${card.name} · ${now.slice(0, 10)}`).slice(0, 60),
        createdAt: now, createdBy: userId, status: "running", pausedReason: null, items,
      };
      await mutateBatches(input.brandId, userId, (list) => {
        // 同一個品牌同時只跑一個批次：兩條 worker 疊在一起只會撞供應商的併發限制。
        if (list.some((b) => b.status === "running" && isBatchActive(b.brandId, b.id))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "這個品牌已經有一個批次在跑，等它結束或先取消。" });
        }
        return [batch, ...list];
      });
      kickBatch(input.brandId, userId, id);
      return { batchId: id, count: items.length, ...cost };
    }),

  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), channelId: z.string().max(48).optional() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const all = await listBatches(input.brandId);
      return all
        .filter((b) => !input.channelId || b.channelId === input.channelId)
        .map((b) => ({
          id: b.id, name: b.name, cardId: b.cardId, channelId: b.channelId, createdAt: b.createdAt,
          status: effectiveStatus(b), counts: countItems(b.items),
        }));
    }),

  /** 審核頁的資料：批次、逐筆狀態、每筆成品拆好的欄位與問題。 */
  get: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), batchId }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      let batch = await getBatch(input.brandId, input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個批次" });
      const active = isBatchActive(batch.brandId, batch.id);

      // 沒有 worker 在跑、卻還有「進行中」的項目＝伺服器重啟留下的殭屍：標成失敗（點數已扣，
      // 重試要用戶自己按）。順便讓畫面不會永遠轉圈。
      const stale = batch.items.filter((i) => i.state === "running" && (!active || isStaleRunning(i)));
      if (stale.length > 0) {
        try {
          const ids = new Set(stale.map((i) => i.id));
          await mutateBatches(batch.brandId, batch.createdBy, (list) => list.map((b) => {
            if (b.id !== batch!.id) return b;
            const items = b.items.map((i) => (ids.has(i.id)
              ? { ...i, state: "failed" as const, error: "中斷（伺服器重啟或逾時），可以單筆重試", finishedAt: new Date().toISOString() }
              : i));
            return { ...b, items, status: deriveStatus({ ...b, items }) };
          }));
          batch = (await getBatch(input.brandId, input.batchId)) ?? batch;
        } catch { /* 寫不回去就只在這次回應裡當失敗 */ }
      }

      const card = await getBrandTaskCard(batch.brandId, batch.cardId);
      const cardSpec = card ? listingSpecOf(card) : null;
      const ids = batch.items.map((i) => i.outputId).filter((x): x is number => !!x);
      const outputs = new Map<number, { content: unknown; spec: any }>();
      if (ids.length > 0) {
        const ph = ids.map(() => "?").join(",");
        const [rows]: any = await localPool.execute(
          `SELECT o.id, o.content, o.metadata FROM mission_outputs o
             JOIN missions m ON m.id = o.missionId
            WHERE o.id IN (${ph}) AND m.userId = ?`,
          [...ids, batch.createdBy],
        );
        for (const r of rows as any[]) {
          let md: any = r.metadata;
          if (typeof md === "string") { try { md = JSON.parse(md); } catch { md = null; } }
          outputs.set(Number(r.id), { content: r.content, spec: md?.listing ?? null });
        }
      }
      const items = batch.items.map((i) => {
        const o = i.outputId ? outputs.get(i.outputId) : undefined;
        const spec = o?.spec?.fields?.length ? o.spec : cardSpec;
        return {
          id: i.id, label: i.label, productId: i.productId, state: i.state, error: i.error,
          approval: i.approval, outputId: i.outputId,
          summary: o && spec ? summarizeOutput(o.content, spec) : null,
        };
      });
      return {
        batch: {
          id: batch.id, name: batch.name, cardId: batch.cardId, cardName: card?.name ?? "",
          channelId: batch.channelId, createdAt: batch.createdAt,
          status: effectiveStatus(batch, active), pausedReason: batch.pausedReason,
        },
        counts: countItems(batch.items),
        perRun: costOf("task_30s"),
        items,
      };
    }),

  /**
   * 核准／退回／改回待審。核准時預設只放行「乾淨」的（沒缺欄位、沒超標）；有問題的回傳在
   * skipped，由用戶看過再用 force 核准——匯出的東西是要上架的，不能因為按了「全部核准」就放行。
   */
  setApproval: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), batchId,
      itemIds: z.array(z.string().max(12)).min(1).max(MAX_BATCH_ITEMS),
      approval: z.enum(["approved", "rejected", "pending"]),
      force: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const batch = await getBatch(input.brandId, input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個批次" });
      const want = new Set(input.itemIds);
      let skipped: string[] = [];
      if (input.approval === "approved" && !input.force) {
        const cleanIds = await cleanItemIds(batch, batch.items.filter((i) => want.has(i.id) && i.state === "done"));
        skipped = batch.items.filter((i) => want.has(i.id) && i.state === "done" && !cleanIds.has(i.id)).map((i) => i.id);
      }
      const skip = new Set(skipped);
      await updateBatch(input.brandId, batch.createdBy, input.batchId, (b) => ({
        batch: { ...b, items: b.items.map((i) => (want.has(i.id) && i.state === "done" && !skip.has(i.id) ? { ...i, approval: input.approval } : i)) },
        result: null,
      }));
      return { skipped };
    }),

  /** 單筆（或多筆）重試：失敗、取消、或對結果不滿意想重寫的都可以。重寫會再扣一次點。 */
  retry: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), batchId, itemIds: z.array(z.string().max(12)).min(1).max(MAX_BATCH_ITEMS) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const batch = await getBatch(input.brandId, input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個批次" });
      const want = new Set(input.itemIds);
      await updateBatch(input.brandId, batch.createdBy, input.batchId, (b) => ({
        batch: {
          ...b, status: "running", pausedReason: null,
          items: b.items.map((i) => (want.has(i.id) && i.state !== "running"
            ? { ...i, state: "queued" as const, outputId: null, error: null, approval: "pending" as const, startedAt: undefined, finishedAt: undefined }
            : i)),
        },
        result: null,
      }));
      kickBatch(input.brandId, batch.createdBy, input.batchId);
      return { ok: true };
    }),

  /** 暫停（點數不足）或伺服器重啟之後，從還沒寫的接著跑。 */
  resume: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), batchId }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await assertCanAct(ctx.user!.id);
      const batch = await getBatch(input.brandId, input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個批次" });
      if (batch.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "這個批次已取消。要補寫的商品請用「重試」。" });
      kickBatch(input.brandId, batch.createdBy, input.batchId);
      return { ok: true };
    }),

  /** 取消還沒開始的；已經在寫的那幾筆會寫完（點數已扣）。 */
  cancel: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), batchId }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await assertCanAct(ctx.user!.id);
      const batch = await getBatch(input.brandId, input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個批次" });
      await updateBatch(input.brandId, batch.createdBy, input.batchId, (b) => ({
        batch: { ...b, status: "cancelled", items: b.items.map((i) => (i.state === "queued" ? { ...i, state: "cancelled" as const } : i)) },
        result: null,
      }));
      return { ok: true };
    }),

  /** 只刪批次紀錄。產出（成品）留在專案裡。 */
  remove: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), batchId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      if (isBatchActive(input.brandId, input.batchId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這個批次還在跑，先取消再刪。" });
      }
      const batch = await getBatch(input.brandId, input.batchId);
      if (!batch) return { ok: true };
      await mutateBatches(input.brandId, batch.createdBy, (list) => list.filter((b) => b.id !== input.batchId));
      return { ok: true };
    }),
});

/** 對外顯示的批次狀態：沒有 worker 在跑、卻還有沒寫的項目，就是「暫停」（伺服器重啟），要用戶按繼續。 */
function effectiveStatus(b: ListingBatch, active = isBatchActive(b.brandId, b.id)): "running" | "paused" | "done" | "cancelled" {
  const s = deriveStatus(b);
  if (s === "running" && !active && b.items.some((i) => i.state === "queued")) return "paused";
  return s;
}

/** 這幾筆裡哪些是「乾淨」的（沒缺欄位、沒超標）。 */
async function cleanItemIds(batch: ListingBatch, items: BatchItem[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = items.map((i) => i.outputId).filter((x): x is number => !!x);
  if (ids.length === 0) return out;
  const card = await getBrandTaskCard(batch.brandId, batch.cardId);
  const cardSpec = card ? listingSpecOf(card) : null;
  const ph = ids.map(() => "?").join(",");
  const [rows]: any = await localPool.execute(
    `SELECT o.id, o.content, o.metadata FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
      WHERE o.id IN (${ph}) AND m.userId = ?`,
    [...ids, batch.createdBy],
  );
  const byId = new Map<number, any>((rows as any[]).map((r) => [Number(r.id), r]));
  for (const i of items) {
    const r = i.outputId ? byId.get(i.outputId) : null;
    if (!r) continue;
    let md: any = r.metadata;
    if (typeof md === "string") { try { md = JSON.parse(md); } catch { md = null; } }
    const spec = md?.listing?.fields?.length ? md.listing : cardSpec;
    if (spec && summarizeOutput(r.content, spec).clean) out.add(i.id);
  }
  return out;
}
