/**
 * inspirationRouter — 「靈感舞台」的 tRPC 介面。規則與思考框架在 core/inspirationStage.ts。
 *
 * roster：八位 thinker 的顯示資料＋這個品牌的預設陣容＋可以放的通路。
 * ideate：主體固定，請陣容裡每一位各想切角（可指定只請一位再想幾個、避開已有的切角）。
 * setLineup：換人——存新陣容；被換掉的人記一次 dropped，之後不再排進預設。
 * adopt：採用一個切角 → 在本週企劃加一格（已排定），回傳任務卡讓前端接著寫全文。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { callModel } from "../../platform/core/multiModelRouter";
import { getBrandMarket } from "../../strategy/core/brandMarket";
import { buildBrandPrefix } from "../../strategy/core/brandContext";
import localPool from "../../localDb";
import { brandPlatforms, cardsFor, isYmd, PLATFORM_ZH } from "../core/weeklyPlanner";
import {
  THINKER_KEYS, LINEUP_SIZE, bump, ideationSystemPrompt, loadPrefs, loadThinkerCards, parseAngles,
  pickCardForFormat, savePrefs, slotTopic, thinkerOf,
  type Angle, type ThinkerKey,
} from "../core/inspirationStage";

/** 想切角要的是判斷力，不是速度；用 general 預設的 haiku 實測切角偏泛。 */
const IDEATION_MODEL = process.env.INSPIRATION_MODEL || "claude-sonnet-4-6";

const brandInput = z.object({ brandId: z.number().int().positive() });
const subjectZ = z.object({
  kind: z.enum(["brand", "product", "event"]),
  id: z.number().int().positive().nullable(),
});
const thinkerZ = z.enum(THINKER_KEYS as [ThinkerKey, ...ThinkerKey[]]);

// 每位使用者：每分鐘 4 輪、每小時 30 輪（一輪＝最多 5 次 LLM 呼叫）。
const rate = new Map<number, number[]>();
function checkRate(userId: number): void {
  const now = Date.now();
  const hits = (rate.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.filter((t) => now - t < 60_000).length >= 4) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "想太快了，等一下再請他們想。" });
  if (hits.length >= 30) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時想太多輪了，晚點再來。" });
  hits.push(now);
  rate.set(userId, hits);
}

/**
 * 品牌加入的通路裡，有文字任務卡可以寫的那些。2026-09-29 dev 實測：Threads、LINE 在任務
 * 目錄裡只有圖片規格卡、沒有文字卡，採用時「這個通路沒有可用的任務卡」——所以不給 agent
 * 建議、也不給用戶選。那兩個通路補上文字卡後這裡自動放行。
 */
async function writablePlatforms(brandId: number): Promise<string[]> {
  const all = await brandPlatforms(brandId);
  const ok = all.filter((p) => cardsFor([p]).length > 0);
  return ok.length ? ok : ["facebook"];
}

/** 主體的名稱；產品／活動必須屬於這個品牌。 */
async function resolveSubject(brandId: number, subject: z.infer<typeof subjectZ>): Promise<{ brandName: string; subjectLine: string; productId: number | null; eventId: number | null }> {
  const [bRows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const brandName = String((bRows as any[])[0]?.name ?? "");
  if (subject.kind === "brand" || !subject.id) {
    return { brandName, subjectLine: `品牌「${brandName}」本身（不是單一產品）`, productId: null, eventId: null };
  }
  const table = subject.kind === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(`SELECT name FROM ${table} WHERE id = ? AND brandId = ? LIMIT 1`, [subject.id, brandId]);
  const name = (rows as any[])[0]?.name;
  if (!name) throw new TRPCError({ code: "NOT_FOUND", message: subject.kind === "product" ? "找不到這個產品" : "找不到這個活動" });
  return subject.kind === "product"
    ? { brandName, subjectLine: `「${brandName}」的產品「${name}」`, productId: subject.id, eventId: null }
    : { brandName, subjectLine: `「${brandName}」的活動「${name}」`, productId: null, eventId: subject.id };
}

/**
 * 一次呼叫讓陣容裡的人一起想（原因見 ideationSystemPrompt）。優先用 Anthropic——dev／正式站上
 * general 預設排第一的 qwen 帳號被封鎖（見 LLM cascade 記錄），切角品質也差最多；沒有 key 時
 * callModel 會自己退回 general 的順序。
 */
async function runRound(args: Omit<Parameters<typeof ideationSystemPrompt>[0], "thinkers"> & {
  keys: ThinkerKey[]; nameOf: (k: ThinkerKey) => string;
}): Promise<Array<Angle & { thinker: ThinkerKey }>> {
  const system = ideationSystemPrompt({ ...args, thinkers: args.keys.map((k) => ({ thinker: thinkerOf(k), name: args.nameOf(k) })) });
  // 第二次改用 provider 預設模型：IDEATION_MODEL 在某個環境沒開通時，不讓整輪落空。
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callModel([{ role: "system", content: system }, { role: "user", content: "請開始想。" }], "creative_writing", "anthropic", attempt === 0 ? IDEATION_MODEL : undefined);
      const angles = parseAngles(String(r.content ?? ""), { keys: args.keys, platforms: args.platforms, perThinker: args.count });
      if (angles.length) return angles;
    } catch { /* retry */ }
  }
  return [];
}

export const inspirationRouter = router({
  roster: protectedProcedure
    .input(brandInput)
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [thinkers, prefs, platforms] = await Promise.all([
        loadThinkerCards(), loadPrefs(input.brandId), writablePlatforms(input.brandId),
      ]);
      return {
        thinkers, lineup: prefs.lineup,
        platforms: platforms.map((p) => ({ id: p, label: PLATFORM_ZH[p] ?? p })),
      };
    }),

  setLineup: protectedProcedure
    .input(brandInput.extend({ lineup: z.array(thinkerZ).min(1).max(LINEUP_SIZE), dropped: thinkerZ.optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const prefs = await loadPrefs(input.brandId);
      const lineup = Array.from(new Set(input.lineup));
      const stats = input.dropped ? bump(prefs.stats, input.dropped, "dropped") : prefs.stats;
      await savePrefs(input.brandId, lineup, stats);
      return { lineup };
    }),

  ideate: protectedProcedure
    .input(brandInput.extend({
      subject: subjectZ,
      occasion: z.string().trim().max(120).optional(),
      thinkers: z.array(thinkerZ).min(1).max(LINEUP_SIZE),
      /** 每位想幾個：一般一輪 1 個；「請他再想」3 個。 */
      count: z.number().int().min(1).max(3).default(1),
      /** 畫面上已經有的切角標題——不要重複。 */
      avoid: z.array(z.string().max(60)).max(40).default([]),
      direction: z.string().trim().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      checkRate(userId);
      const keys = Array.from(new Set(input.thinkers));
      const [subject, market, platforms, cards] = await Promise.all([
        resolveSubject(input.brandId, input.subject),
        getBrandMarket(input.brandId),
        writablePlatforms(input.brandId),
        loadThinkerCards(),
      ]);
      const brandCtx = await buildBrandPrefix(input.brandId, subject.productId, subject.eventId, "full").catch(() => "");
      const nameOf = (k: ThinkerKey) => cards.find((c) => c.key === k)?.name ?? thinkerOf(k).fallbackName;
      const base = {
        brandName: subject.brandName, subjectLine: subject.subjectLine, brandCtx,
        occasion: input.occasion || undefined, platforms, count: input.count,
        outputLanguage: market.outputLanguage, direction: input.direction || undefined,
      };

      let angles = await runRound({ ...base, keys, nameOf, avoid: input.avoid });
      // 模型漏掉的人：只替他們再問一次（帶著已經有的切角，免得撞）。
      const missing = keys.filter((k) => !angles.some((a) => a.thinker === k));
      if (missing.length && angles.length) {
        const more = await runRound({ ...base, keys: missing, nameOf, avoid: [...input.avoid, ...angles.map((a) => a.title)] });
        angles = [...angles, ...more].sort((x, y) => keys.indexOf(x.thinker) - keys.indexOf(y.thinker));
      }
      const failed = keys.filter((k) => !angles.some((a) => a.thinker === k));
      return { angles, failed };
    }),

  adopt: protectedProcedure
    .input(brandInput.extend({
      thinker: thinkerZ,
      title: z.string().trim().min(2).max(60),
      hook: z.string().trim().min(2).max(120),
      why: z.string().trim().max(160).default(""),
      answer: z.string().trim().max(80).default(""),
      platform: z.string().max(24),
      format: z.string().max(20).default("貼文"),
      date: z.string().refine(isYmd, "date 要是 YYYY-MM-DD"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const platforms = await writablePlatforms(input.brandId);
      if (!platforms.includes(input.platform)) throw new TRPCError({ code: "BAD_REQUEST", message: "這個品牌沒有加入這個通路" });
      const card = pickCardForFormat(input.platform, input.format, cardsFor([input.platform]));
      if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: "這個通路沒有可用的任務卡" });
      const t = thinkerOf(input.thinker);
      const reason = [t.school, input.answer, input.why].filter(Boolean).join("｜").slice(0, 300);
      const [r]: any = await localPool.execute(
        `INSERT INTO planned_slots (userId, brandId, slotDate, platform, taskId, taskLabel, topic, format, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned')`,
        [userId, input.brandId, input.date, input.platform, card.id, card.labelZh, slotTopic(input), input.format || null, reason],
      );
      // 偏好紀錄失敗不擋採用。
      try {
        const prefs = await loadPrefs(input.brandId);
        await savePrefs(input.brandId, prefs.lineup, bump(prefs.stats, input.thinker, "adopted"));
      } catch { /* non-fatal */ }
      return { slotId: Number(r.insertId), taskId: card.id, topic: slotTopic(input), date: input.date, platform: input.platform };
    }),
});

