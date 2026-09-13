/**
 * competitorRouter — 選一個具名競爭者，逐接觸點比對的 tRPC 介面。
 * 邏輯在 core/competitorSnapshot.ts。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { getOrResearchCompetitorSnapshot } from "../core/competitorSnapshot";

/** 同一套推導規則見 strategyMonitor.ts 的 deriveDefaultWatch/namesOf —— 品牌的具名競爭者來自定位文件的 competition.direct / competition.indirect，不是另外一份清單。 */
function namesOf(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: any) => (typeof r === "string" ? r : r?.name)).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

async function loadBrand(userId: number, brandId: number): Promise<{ competitors: string[] }> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${brandId} 不存在或不屬於這個帳號` });
  const pos = typeof row.positioning === "string" ? (() => { try { return JSON.parse(row.positioning); } catch { return {}; } })() : (row.positioning ?? {});
  const competitors = [...namesOf(pos?.competition?.direct), ...namesOf(pos?.competition?.indirect)]
    .map((n) => n.trim());
  return { competitors: Array.from(new Set(competitors)).slice(0, 10) };
}

export const competitorRouter = router({
  /** 這個品牌定位文件裡列出的具名競爭者 —— 選單的資料來源，不是另外維護一份。 */
  list: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { competitors } = await loadBrand(ctx.user!.id, input.brandId);
      return { competitors };
    }),

  /** 選定競爭者的逐接觸點比對快照（14 天內走快取）。 */
  snapshot: protectedProcedure
    .input(z.object({ brandId: z.number(), competitorName: z.string().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const { competitors } = await loadBrand(ctx.user!.id, input.brandId);
      if (!competitors.includes(input.competitorName)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這個競爭者不在品牌定位文件的競爭者清單裡" });
      }
      return getOrResearchCompetitorSnapshot(input.brandId, input.competitorName);
    }),
});
