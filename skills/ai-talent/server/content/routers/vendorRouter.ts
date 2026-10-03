/**
 * vendorRouter — 產出旁邊的「找合作對象」（規則見 core/vendorFinder.ts）。
 *
 *   context：這篇產出該找哪一種廠商、預設搜什麼（使用者可以改搜尋字）。
 *   search ：搜公開網頁 → 只從搜尋結果整理廠商 → 驗證網址。每人每小時 12 次。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { getBrandMarket } from "../../strategy/core/brand/brandMarket";
import { cleanKolBrief, kolBriefText } from "../core/campaign/campaignKolBrief";
import { defaultVendorQuery, findVendors, vendorKindFor, VENDOR_KIND_LABEL, type VendorKind } from "../core/planning/vendorFinder";

const KINDS = ["kol_agency", "cobrand_partner", "ad_agency"] as const;

const hits = new Map<number, number[]>();
function rateOk(userId: number): boolean {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 12) { hits.set(userId, list); return false; }
  list.push(now);
  hits.set(userId, list);
  return true;
}

const parse = (v: any) => {
  if (!v) return {};
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return {}; }
};

/** 這篇產出（含權限檢查）＋它所屬活動的網紅任務說明單與品牌產業。 */
async function loadOutput(userId: number, outputId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT m.brandId, m.userId, mo.metadata, b.industry
       FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId
       LEFT JOIN brands b ON b.id = m.brandId
      WHERE mo.id = ? LIMIT 1`,
    [outputId],
  );
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這篇產出" });
  if (r.brandId) await assertBrandAccess(userId, Number(r.brandId));
  else if (Number(r.userId) !== userId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這篇產出" });
  const meta = parse(r.metadata);
  const eventId = Number(meta?.campaignItem?.eventId ?? meta?.eventId ?? 0) || null;
  let kolBrief = null as ReturnType<typeof cleanKolBrief> | null;
  if (eventId) {
    const [ev]: any = await localPool.execute(`SELECT positioning FROM events WHERE id = ? AND userId = ? LIMIT 1`, [eventId, userId]);
    const pos = parse((ev as any[])[0]?.positioning);
    kolBrief = cleanKolBrief(pos?.kolBrief);
  }
  return {
    brandId: r.brandId ? Number(r.brandId) : null,
    industry: String(r.industry ?? ""),
    paid: !!meta?.campaignItem?.paid,
    kolBrief,
  };
}

export const vendorRouter = router({
  /** 這篇產出要找哪一種廠商、預設搜尋字。不是網紅／異業合作／廣告的產出回 kind=null（畫面不顯示按鈕）。 */
  context: protectedProcedure
    .input(z.object({ outputId: z.number().int().positive(), taskId: z.string().max(120).nullable().optional() }))
    .query(async ({ ctx, input }) => {
      const o = await loadOutput(ctx.user!.id, input.outputId);
      const kind = vendorKindFor(input.taskId, o.paid);
      if (!kind) return { kind: null, label: null, query: "" };
      const market = await getBrandMarket(o.brandId);
      const people = o.kolBrief?.influencers ?? [];
      const query = defaultVendorQuery(kind, {
        country: market.targetCountry, industry: o.industry,
        kolTypes: people.map((p) => p.type ?? "").filter(Boolean),
        platforms: people.map((p) => p.platform ?? "").filter(Boolean),
      });
      return { kind, label: VENDOR_KIND_LABEL[kind], query };
    }),

  search: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      kind: z.enum(KINDS),
      query: z.string().min(2).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      const o = await loadOutput(ctx.user!.id, input.outputId);
      if (!rateOk(ctx.user!.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時已經搜了 12 次，晚一點再試。" });
      }
      const context = input.kind === "kol_agency" ? kolBriefText(o.kolBrief) : "";
      try {
        return await findVendors({ kind: input.kind as VendorKind, query: input.query, context });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `搜尋失敗：${String(e?.message ?? e).slice(0, 160)}` });
      }
    }),
});
