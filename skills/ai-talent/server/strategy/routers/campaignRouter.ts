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
 *   setLock     — 定稿／解鎖（2026-09-30 CJ「定稿一次鎖整份」）
 *   chat        — 跟內容企劃對話：回覆＋提案（不寫入；套用走 savePlan）
 *   kpiAgent    — 會協助拆 KPI 的投放專家是誰（打開 KPI 視窗時先讓用戶看到）
 *   team        — 這檔活動的內容企劃與投放專家（真的 agent，見 core/campaignTeam.ts）
 *   planKpi     — 用戶填總預算／總目標 → 投放專家拆到每一段＋挑要下廣告的篇（提案，不寫入）
 *   setInPlanner— 內容層決定某一篇要不要排進本週企劃（定稿後也能改，它是排程不是企劃內容）
 *   setBackdrop — 策略畫面的底圖模板（用戶自己選；不受定稿影響，它不是企劃內容）
 *
 * 定稿之後 saveSettings／generate／savePlan 一律拒絕——鎖的是整份，不是只鎖
 * 畫面。markWritten 不受影響：內容層本來就是在定稿之後寫。
 *
 * 權限一律以 events.userId 為準（跟 scopeRouter 的其他活動操作同一條線）。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { buildCampaignPlan, inferCampaignSettings, type CampaignPlan } from "../core/campaignPlan";
import { runCampaignChat } from "../core/campaignChat";
import { KPI_METRICS, pickKpiAgent, runKpiPlan } from "../core/campaignKpi";
import { brandIndustry, pickPlannerAgent } from "../core/campaignTeam";
import { isHiddenContentPlatform, isHiddenHistoryItem } from "../../platform/core/planGate";
import { ownedProductIds, resolveProductScope } from "../core/eventProductScope";
import { invalidateBrandPrefix } from "../core/brandContext";

const settingsInput = z.object({
  type: z.string().max(40),
  mechanic: z.string().max(600),
  goal: z.string().max(300).optional(),
  channels: z.array(z.string().max(40)).max(12),
  venue: z.string().max(200).optional(),
  sessions: z.string().max(300).optional(),
  signupUrl: z.string().max(500).optional(),
  partners: z.object({ kol: z.boolean().optional(), cobrand: z.boolean().optional() }).optional(),
  /** 搭配產品／純品牌。沒傳＝還沒選（見 core/eventProductScope.ts）。 */
  productScope: z.enum(["brand", "products"]).optional(),
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
  inPlanner: z.boolean().optional(),
  paid: z.boolean().optional(),
});

const PHASE_KEYS = ["teaser", "launch", "sustain", "lastcall", "encore"] as const;

const planInput = z.object({
  smp: z.string().max(200),
  items: z.array(planItemInput).max(60),
  phaseMessages: z.record(z.enum(PHASE_KEYS), z.string().max(60)).optional(),
  kpi: z.any().nullable().optional(),
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

function lockedAtOf(pos: Record<string, any>): string | null {
  const v = pos?.campaignPlan?.lockedAt;
  return typeof v === "string" && v ? v : null;
}

/** 定稿後改不了——要改先解鎖。鎖的是整份，所以設定、重排、存檔都擋。 */
function assertUnlocked(pos: Record<string, any>): void {
  if (lockedAtOf(pos)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "企劃已定稿，要修改請先按標題旁的鎖頭解鎖" });
  }
}

async function productIdsOf(eventId: number): Promise<number[]> {
  const [rows]: any = await localPool.execute(
    `SELECT productId FROM event_products WHERE eventId = ? ORDER BY productId`, [eventId],
  );
  return (rows as any[]).map((r) => Number(r.productId));
}

/**
 * 2026-09-29 CJ「前台隱藏，資料保留」：LinkedIn／YouTube／新聞稿／X 的企劃格與通路設定
 * 不再回給前台。savePlan 是整份覆寫，所以存的時候要把藏起來的格子補回去，不然
 * 使用者改一次企劃就把它們刪掉了。
 */
const isHiddenPlanItem = (i: any) => isHiddenHistoryItem({ platform: i?.platform, taskId: i?.taskId });
function visiblePlan(plan: CampaignPlan | null): CampaignPlan | null {
  if (!plan || !Array.isArray(plan.items)) return plan;
  return { ...plan, items: plan.items.filter((i) => !isHiddenPlanItem(i)) };
}
function visibleSettings(settings: any): any {
  if (!settings || !Array.isArray(settings.channels)) return settings ?? null;
  return { ...settings, channels: settings.channels.filter((c: string) => !isHiddenContentPlatform(c)) };
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
      const [brandRows]: any = await localPool.execute(
        `SELECT industry FROM brands WHERE id = ? LIMIT 1`, [row.brandId],
      );
      return {
        event: {
          id: Number(row.id), name: row.name, brandId: Number(row.brandId),
          startAt: row.startAt ? new Date(row.startAt).toISOString().slice(0, 10) : null,
          endAt: row.endAt ? new Date(row.endAt).toISOString().slice(0, 10) : null,
        },
        settings: visibleSettings(pos.campaign),
        plan: visiblePlan((pos.campaignPlan ?? null) as CampaignPlan | null),
        products: (prodRows as any[]).map((p) => ({ id: Number(p.id), name: String(p.name) })),
        /** "products"｜"brand"｜null（還沒選）。event_products 有資料時一律是 products。 */
        productScope: resolveProductScope(pos.campaign?.productScope, (prodRows as any[]).length),
        /** 舊的 11 段得獎 brief 還在不在——進階模式的入口要不要亮由這個決定。 */
        hasLegacyBrief: ["brief", "smp", "creative", "awards"].some((k) => !!pos?.[k]),
        /** 活動定位（舊的 11 段）裡寫的核心受眾——策略畫面的「對象」。 */
        audience: typeof pos?.audience?.primaryAudience === "string" ? pos.audience.primaryAudience.slice(0, 120) : "",
        /** 底圖模板：用戶選的（null＝依產業）＋品牌產業（前端用來挑預設）。 */
        backdrop: typeof pos?.campaignBackdrop === "string" ? pos.campaignBackdrop : null,
        industry: String((brandRows as any[])[0]?.industry ?? ""),
      };
    }),

  /**
   * 從一段自由文字推斷設定。**只回建議值，不寫入**——要不要採用由使用者確認。
   *
   * 2026-09-26（CJ「現在的顯示方式很複雜」）：設定區原本要回答 24 個控制項，
   * 而答案幾乎都在使用者腦子裡那一句話裡。改成他寫一句，我們推斷，畫面只呈現
   * 一行摘要。
   */
  infer: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive(), brief: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await loadEvent(input.eventId, ctx.user!.id);
      try {
        return await inferCampaignSettings({ eventId: input.eventId, userId: ctx.user!.id, brief: input.brief });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e).slice(0, 300) });
      }
    }),

  saveSettings: protectedProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      settings: settingsInput,
      /** 適用產品。傳了就整組取代（畫面是唯一真相），沒傳就不動。 */
      productIds: z.array(z.number().int().positive()).max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const row = await loadEvent(input.eventId, userId);
      assertUnlocked(parsePositioning(row.positioning));
      // 純品牌活動不綁產品：畫面上選了「純品牌」就把綁定清掉，不留一份跟選擇矛盾的資料。
      const wantIds = input.settings.productScope === "brand" ? [] : input.productIds;
      let scope = input.settings.productScope;
      if (wantIds !== undefined) {
        const ids = await ownedProductIds(wantIds, userId, Number(row.brandId) || null);
        await localPool.execute(`DELETE FROM event_products WHERE eventId = ?`, [input.eventId]);
        for (const pid of ids) {
          await localPool.execute(
            `INSERT IGNORE INTO event_products (eventId, productId) VALUES (?, ?)`, [input.eventId, pid],
          );
        }
        // events.productId 是舊的「主要產品」欄位，活動列表與定位流程在 event_products
        // 是空的時候會退回去讀它——不同步的話，改成純品牌之後舊產品還會冒出來。
        await localPool.execute(
          `UPDATE events SET productId = ? WHERE id = ? AND userId = ?`, [ids[0] ?? null, input.eventId, userId],
        );
        if (ids.length > 0) scope = "products";
        else if (scope === "products") scope = undefined;   // 說要搭產品卻一個都沒選＝還沒選
        if (row.brandId) invalidateBrandPrefix(Number(row.brandId));
      }
      const { productScope: _drop, ...rest } = input.settings;
      await patchPositioning(input.eventId, userId, "campaign", scope ? { ...rest, productScope: scope } : rest);
      return { ok: true };
    }),

  /**
   * 產生企劃。失敗就丟錯誤讓前端顯示原文——**不寫入半成品**：一份空企劃在畫面上
   * 跟「系統覺得你的活動沒什麼好寫的」長得一模一樣。
   */
  generate: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);   // 權限
      assertUnlocked(parsePositioning(row.positioning));
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
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      assertUnlocked(pos);
      const stored = pos.campaignPlan as CampaignPlan | undefined;
      const hidden = (stored?.items ?? []).filter(isHiddenPlanItem);
      const incoming = (input.plan.items ?? []).filter((i: any) => !isHiddenPlanItem(i));
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", {
        ...input.plan,
        // 畫面沒有送回來就沿用存著的，不要因為舊畫面少送一個欄位就洗掉。
        phaseMessages: input.plan.phaseMessages ?? stored?.phaseMessages,
        kpi: input.plan.kpi !== undefined ? input.plan.kpi : stored?.kpi,
        items: [...incoming, ...hidden],
        lockedAt: null,
      });
      return { ok: true };
    }),

  /**
   * 跟內容企劃說一句話。只回提案、不寫入——套用由畫面送 savePlan（見 core/campaignChat.ts）。
   * 定稿後不能再改企劃，所以對話也跟著擋，免得提了一份套用不了的提案。
   */
  chat: protectedProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      message: z.string().min(1).max(800),
      phase: z.enum(PHASE_KEYS).nullable().optional(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1200) })).max(12).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      assertUnlocked(pos);
      const plan = visiblePlan((pos.campaignPlan ?? null) as CampaignPlan | null);
      if (!plan?.items?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "還沒有企劃，先排出企劃再來討論" });
      try {
        return await runCampaignChat({
          eventId: input.eventId, userId: ctx.user!.id, plan,
          message: input.message, phase: input.phase ?? null, history: input.history,
        });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e).slice(0, 300) });
      }
    }),

  team: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const industry = await brandIndustry(Number(row.brandId));
      const [planner, kpi] = await Promise.all([pickPlannerAgent(industry), pickKpiAgent(industry)]);
      return { planner, kpi };
    }),

  kpiAgent: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const [b]: any = await localPool.execute(`SELECT industry FROM brands WHERE id = ? LIMIT 1`, [row.brandId]);
      return { agent: await pickKpiAgent((b as any[])[0]?.industry) };
    }),

  /**
   * 用戶填總預算與總目標，投放專家拆到每一段、挑要下廣告的篇。只回提案，套用走 savePlan。
   * 數字的規則見 core/campaignKpi.ts：絕對數字只來自用戶填的總數。
   */
  planKpi: protectedProcedure
    .input(z.object({
      eventId: z.number().int().positive(),
      budget: z.number().int().min(0).max(1_000_000_000).nullable(),
      goals: z.array(z.object({ metric: z.enum(KPI_METRICS), target: z.number().int().min(1).max(1_000_000_000) })).max(3),
      notes: z.string().max(800).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      assertUnlocked(pos);
      const plan = visiblePlan((pos.campaignPlan ?? null) as CampaignPlan | null);
      if (!plan?.items?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "還沒有企劃，先排出企劃再設定 KPI" });
      try {
        return await runKpiPlan({
          eventId: input.eventId, userId: ctx.user!.id, plan,
          budget: input.budget && input.budget > 0 ? input.budget : null,
          goals: input.goals, notes: input.notes ?? "",
        });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e).slice(0, 300) });
      }
    }),

  /** 某一篇要不要排進本週企劃。只改這一個欄位，定稿後也可以（見檔頭）。 */
  setInPlanner: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive(), itemId: z.string().max(80), inPlanner: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      const plan = pos.campaignPlan as CampaignPlan | undefined;
      const item = plan?.items?.find((i) => i.id === input.itemId);
      if (!plan || !item) throw new TRPCError({ code: "NOT_FOUND", message: "企劃上找不到這一篇" });
      item.inPlanner = input.inPlanner;
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", plan);
      return { ok: true };
    }),

  /** 底圖模板。null＝回到依產業自動挑。模板清單在前端（campaignBackdrops.ts），這裡只擋明顯不對的值。 */
  setBackdrop: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive(), backdrop: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await patchPositioning(input.eventId, ctx.user!.id, "campaignBackdrop", input.backdrop);
      return { ok: true };
    }),

  /** 定稿／解鎖整份企劃。沒有企劃不能定稿——鎖一份空的沒有意義。 */
  setLock: protectedProcedure
    .input(z.object({ eventId: z.number().int().positive(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadEvent(input.eventId, ctx.user!.id);
      const pos = parsePositioning(row.positioning);
      const plan = pos.campaignPlan as CampaignPlan | undefined;
      if (!plan?.items?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "還沒有企劃，先排出企劃再定稿" });
      const lockedAt = input.locked ? new Date().toISOString() : null;
      await patchPositioning(input.eventId, ctx.user!.id, "campaignPlan", { ...plan, lockedAt });
      return { lockedAt };
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
      // 2026-09-30：只列定稿的企劃（策略層只排不寫，定稿後才到內容層寫）。
      const [rows]: any = await localPool.execute(
        `SELECT id, name, startAt, endAt, positioning FROM events
          WHERE brandId = ? AND userId = ? ORDER BY COALESCE(startAt, createdAt) DESC LIMIT 50`,
        [input.brandId, ctx.user!.id],
      );
      const today = new Date().toISOString().slice(0, 10);
      return (rows as any[]).flatMap((row) => {
        const pos = parsePositioning(row.positioning);
        const plan = pos.campaignPlan as CampaignPlan | undefined;
        if (!plan?.items?.length || !plan.lockedAt) return [];
        const items = plan.items.filter((i) => i.enabled && !isHiddenPlanItem(i));
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
