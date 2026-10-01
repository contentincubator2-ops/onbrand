/**
 * strategyMonitorRouter — 策略監測的 tRPC 介面。邏輯在 core/strategyMonitor.ts。
 *
 * 2026-09-08 (CJ「策略監測，定義在 9000 的方案」)
 *
 * 閘門的放法：overview 不擋 —— 基礎用戶要看得到這裡有東西，回 locked:true 讓
 * 前台畫升級提示；setWatch／scanNow／setAlertStatus 才用 assertStrategyMonitoringAllowed。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertStrategyMonitoringAllowed, planQuotaFor } from "../../platform/core/planGate";
import localPool from "../../localDb";
import {
  SCAN_INTERVAL_DAYS,
  backfillEvidenceDates, ensureWatches, listAlerts, newsMarketOf, runStrategyScan, setAlertStatus, unreadAlertSummary, updateWatch,
  type StrategyWatch,
} from "../core/strategyMonitor";

async function assertBrandOwner(userId: number, brandId: number): Promise<{ id: number; name: string }> {
  const [rows]: any = await localPool.execute(
    `SELECT id, name FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  const b = (rows as any[])[0];
  if (!b) throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${brandId} 不存在或不屬於這個帳號` });
  return { id: Number(b.id), name: String(b.name ?? "") };
}

function latestScan(watches: StrategyWatch[]): string | null {
  let best: string | null = null;
  for (const w of watches) if (w.lastScanAt && (!best || w.lastScanAt > best)) best = w.lastScanAt;
  return best;
}

/** 正在手動掃描的品牌（單一 pm2 行程，記憶體即可）。 */
const scanningBrands = new Set<number>();

export const strategyMonitorRouter = router({
  /** 這個品牌的監測清單、提醒、上次掃描。基礎方案回 locked:true。 */
  overview: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const brand = await assertBrandOwner(userId, input.brandId);
      let locked = false;
      try { locked = !(await planQuotaFor(userId)).strategyMonitoring; } catch { locked = false; }
      let newsMarket = newsMarketOf(null, null).display;
      try {
        const [mr]: any = await localPool.execute(`SELECT targetCountry, outputLanguage FROM brands WHERE id = ? LIMIT 1`, [input.brandId]);
        const m = (mr as any[])[0];
        newsMarket = newsMarketOf(m?.targetCountry, m?.outputLanguage).display;
      } catch { /* 預設台灣 */ }
      const base = {
        locked, brandName: brand.name, newsMarket,
        scanIntervalDays: SCAN_INTERVAL_DAYS,
      };
      if (locked) return { ...base, watches: [] as StrategyWatch[], alerts: [], productNames: {} as Record<number, string>, lastScanAt: null as string | null, scanning: false };

      const watches = await ensureWatches({ userId, brandId: input.brandId });
      const alerts = await listAlerts(input.brandId);
      backfillEvidenceDates(alerts);   // 舊情報在背景補原文發布日（2026-09-30）
      const [pRows]: any = await localPool.execute(
        `SELECT id, name FROM products WHERE brandId = ? AND userId = ? LIMIT 50`, [input.brandId, userId],
      );
      const productNames: Record<number, string> = {};
      for (const p of pRows as any[]) productNames[Number(p.id)] = String(p.name ?? "");
      const lastScanAt = latestScan(watches);
      return { ...base, watches, alerts, productNames, lastScanAt, scanning: scanningBrands.has(input.brandId) };
    }),

  /**
   * 未讀情報數＋最新一則——側欄「品牌」圖示的數字與左下角通知用（2026-09-30）。
   * 基礎方案（locked）一律回 0：看不到內容的人不該被通知叫過去。
   */
  unreadSummary: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwner(userId, input.brandId);
      let locked = false;
      try { locked = !(await planQuotaFor(userId)).strategyMonitoring; } catch { locked = false; }
      if (locked) return { count: 0, latestId: null as number | null, latestTitle: null as string | null };
      return unreadAlertSummary(input.brandId);
    }),

  /** 改一份監測清單（品牌或某個產品）。 */
  setWatch: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      scope: z.enum(["brand", "product"]),
      scopeId: z.number(),
      keywords: z.array(z.string().max(60)).max(12),
      competitors: z.array(z.string().max(60)).max(12),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwner(userId, input.brandId);
      await assertStrategyMonitoringAllowed(userId);
      await ensureWatches({ userId, brandId: input.brandId });
      await updateWatch({ userId, ...input });
      return { ok: true };
    }),

  /**
   * 手動掃描：品牌先掃，再掃開著的產品，最多 4 份。
   * 2026-09-30（CJ「不要有限制…隨時都可以開始」）：拿掉 24 小時冷卻，改由策略總監頭像
   * 隨時開始。只擋「同一個品牌正在掃」——連點兩下不該花兩次 scout／LLM 的錢。
   */
  scanNow: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwner(userId, input.brandId);
      await assertStrategyMonitoringAllowed(userId);
      if (scanningBrands.has(input.brandId)) {
        throw new TRPCError({ code: "CONFLICT", message: "這個品牌正在掃描中，完成後再開始下一次。" });
      }
      scanningBrands.add(input.brandId);
      try {
        const watches = await ensureWatches({ userId, brandId: input.brandId });
        const targets = watches
          .filter((w) => w.enabled)
          .sort((a, b) => (a.scope === "brand" ? -1 : 0) - (b.scope === "brand" ? -1 : 0))
          .slice(0, 4);
        const results = [];
        for (const w of targets) {
          const r = await runStrategyScan(w);
          results.push({ scope: w.scope, scopeId: w.scopeId, ...r });
        }
        return { results };
      } finally {
        scanningBrands.delete(input.brandId);
      }
    }),

  setAlertStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["new", "seen", "applied", "dismissed"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertStrategyMonitoringAllowed(ctx.user!.id);
      await setAlertStatus({ userId: ctx.user!.id, id: input.id, status: input.status });
      return { ok: true };
    }),
});
