/**
 * campaignRouter — 活動的「設定」與「宣傳企劃」。
 *
 * 2026-09-25（CJ「在策略層，只做完活動的企劃和編輯，活動撰寫都還是在內容層，
 * 在內容層增加活動的 mission tray」）。
 *
 * ── 一份資料，兩個地方讀 ─────────────────────────────────────────────
 * 策略層（活動企劃頁）決定「要做什麼」，內容層（活動 tray）負責「寫出來」。
 * 兩邊讀的是**同一筆** events.positioning.campaignPlan——不是各存一份再同步。
 * 複製兩份的話，策略層改了切角、內容層還在寫舊的，而且畫面上看不出來。
 *
 * 所以這支 router 是那筆資料的唯一出入口：
 *   get         — 設定 + 企劃 + 活動基本資料（兩層共用）
 *   saveSettings— 設定（含適用產品，寫進既有的 event_products）
 *   generate    — 產生企劃（買點數的那一步；失敗不寫入半成品）
 *   savePlan    — 使用者編輯後的企劃
 *   trayList    — 內容層 tray 的首頁：有企劃的活動 + 進度
 *   markWritten — 某一格寫完了，回貼產出（策略層的 ✓ 從這裡來）
 *
 * 權限一律以 events.userId 為準（跟 scopeRouter 的其他活動操作同一條線）。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { buildCampaignPlan, type CampaignPlan } from "../core/campaignPlan";

const settingsInput = z.object({
  type: z.string().max(40),
  mechanic: z.string().max(600),
  goal: z.string().max(300).optional(),
  channels: z.array(z.string().max(40)).max(12),
  venue: z.string().max(200).optional(),
  sessions: z.string().max(300).optional(),
  signupUrl: z.string().max(500).optional(),
  partners: z.object({ kol: z.boolean().optional(), cobrand: z.boolean().optional() }).optional(),
});

const planItemInput = z.object({
  id: z.string().max(80),
  phase: z.string().max(20),
  date: z.string().max(20),
  platform: z.string().max(40),
  taskId: z.string().max(120),
  taskLabel: z.string().max(200),
  angle: z.string().max(400),
  enabled: z.boolean(),
  outputId: z.number().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  repaired: z.boolean().optional(),
});

const planInput = z.object({
  smp: z.string().max(200),
  items: z.array(planItemInput).max(60),
  kol: z.any().nullable().optional(),
  cobrand: z.any().nullable().optional(),
  generatedAt: z.string().optional(),
});

interface EventRow { id: number; name: string; brandId: number; startAt: any; endAt: any; positioning: any }

async function loadEvent(eventId: number, userId: number): Promise<EventRow> {
  const [rows]: any = await localPool.execute(
    `SELECT id, name, brandId, startAt, endAt, positioning FROM events WHERE id = ? AND userId = ? LIMIT 1`,
    [eventId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `活動 #${eventId} 不存在或不屬於這個帳號` });
  return row as EventRow;
}

function parsePositioning(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw !== "string") return raw as Record<string, any>;
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * 只改 positioning 裡的一個 key，其他原封不動。
 *
 * 活動的 positioning 裡還住著舊的 11 段得獎 brief（現在退成「參獎／提案」進階
 * 選項）。整包覆寫會把它洗掉——使用者不會馬上發現，等到某天打開進階模式才發現
 * 東西不見了，而那時已經沒有還原的依據。
 */
async function patchPositioning(eventId: number, userId: number, key: string, value: any): Promise<void> {
  const row = await loadEvent(eventId, userId);
  const pos = parsePositioning(row.positioning);
  pos[key] = value;
  await localPool.execute(
    `UPDATE events SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(pos), eventId, userId],
  );
}

async function productIdsOf(eventId: number): Promise<number[]> {
  const [rows]: any = await localPool.execute(
    `SELECT productId FROM event_products WHERE eventId = ? ORDER BY productId`, [eventId],
  );
  return (rows as any[]).map((r) => Number(r.productId));
}

export const campaignRouter = router({
  /** 設定 + 企劃 + 活動基本資料。策略層的企劃頁與內容層的 tray 都讀這支。 */
  get: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      const [prodRows]: any = await localPool.execute(
        `SELECT p.id, p.name FROM event_products ep JOIN products p ON p.id = ep.productId
          WHERE ep.eventId = ? ORDER BY p.id`, [input.eventId],
      );
      return {
        event: {
          id: Number(row.id), name: row.name, brandId: Number(row.brandId),
          startAt: row.startAt ? new Date(row.startAt).toISOString().slice(0, 10) : null,
          endAt: row.endAt ? new Date(row.endAt).toISOString().slice(0, 10) : null,
        },
        settings: pos.campaign ?? null,
        plan: (pos.campaignPlan ?? null) as CampaignPlan | null,
        products: (prodRows as any[]).map((p) => ({ id: Number(p.id), name: String(p.name) })),
        /** 舊的 11 段得獎 brief 還在不在——進階模式的入口要不要亮由這個決定。 */
        hasLegacyBrief: ["brief", "smp", "creative", "awards"].some((k) => !!pos?.[k]),
      };
    }),

  saveSettings: protectedProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      settings: settingsInput,
      /** 適用產品。傳了就整組取代（畫面是唯一真相），沒傳就不動。 */
      productIds: z.array(z.number().int().positive()).max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await patchPositioning(input.eventId, ctx.user!.id, "campaign", input.settings);
      if (input.productIds !== undefined) {
        await localPool.execute(`DELETE FROM event_products WHERE eventId = ?`, [input.eventId]);
        for (const pid of input.productIds) {
          await localPool.execute(
            `INSERT IGNORE INTO event_products (eventId, productId) VALUES (?, ?)`, [input.eventId, pid],
          );
        }
      }
      return { ok: true };
    }),

  /**
   * 產生企劃。失敗就丟錯誤讓前端顯示原文——**不寫入半成品**：一份空企劃在畫面上
   * 跟「系統覺得你的活動沒什麼好寫的」長得一模一樣。
   */
  generate: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await loadEvent(input.eventId, ctx.user!.id);   // 權限
      let plan: CampaignPlan;
      try {
        plan = await buildCampaignPlan({ eventId: input.eventId, userId: ctx.user!.id });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e).slice(0, 300) });
      }
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", plan);
      return plan;
    }),

  savePlan: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive(), plan: planInput }))
    .mutation(async ({ ctx, input }) => {
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", input.plan);
      return { ok: true };
    }),

  /**
   * 內容層 tray 的首頁：這個品牌有企劃的活動 + 寫了幾篇。
   *
   * 沒有企劃的活動不列——tray 的內容完全由企劃決定，這讓「策略層先想清楚」是
   * 結構上的前提，而不是靠紀律。
   */
  trayList: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT id, name, startAt, endAt, positioning FROM events
          WHERE brandId = ? AND userId = ? ORDER BY COALESCE(startAt, createdAt) DESC LIMIT 50`,
        [input.brandId, ctx.user!.id],
      );
      const today = new Date().toISOString().slice(0, 10);
      return (rows as any[]).flatMap((row) => {
        const pos = parsePositioning(row.positioning);
        const plan = pos.campaignPlan as CampaignPlan | undefined;
        if (!plan?.items?.length) return [];
        const items = plan.items.filter((i) => i.enabled);
        const done = items.filter((i) => !!i.outputId).length;
        const endAt = row.endAt ? new Date(row.endAt).toISOString().slice(0, 10) : null;
        return [{
          id: Number(row.id),
          name: String(row.name),
          startAt: row.startAt ? new Date(row.startAt).toISOString().slice(0, 10) : null,
          endAt,
          total: items.length,
          done,
          /** 結束日過了就收進「已結束」——tray 只留還要做的事，不然會變墳場。 */
          ended: !!endAt && endAt < today,
          smp: plan.smp ?? "",
        }];
      });
    }),

  /** 某一格寫完了。策略層那一格的 ✓ 與 tray 的進度都從這裡來。 */
  markWritten: protectedProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      itemId: z.string().max(80),
      outputId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      const plan = pos.campaignPlan as CampaignPlan | undefined;
      if (!plan?.items?.length) throw new TRPCError({ code: "NOT_FOUND", message: "這個活動還沒有企劃" });
      const item = plan.items.find((i) => i.id === input.itemId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "企劃上找不到這一格" });
      item.outputId = input.outputId;
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", plan);
      return { ok: true };
    }),
});
