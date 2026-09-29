/**
 * inspirationRouter — 「靈感舞台」的 tRPC 介面。規則與思考框架在 core/inspirationStage.ts。
 *
 * roster：八位 thinker 的顯示資料＋這個品牌的預設陣容＋可以放的通路。
 * ideateStart／ideatePoll：主體固定，請陣容裡每一位各想切角（可指定只請一位再想幾個、避開已有的切角）；
 *   邊想邊顯示——開始後立刻回 jobId，想好一張就能被 poll 拿走一張。
 * setLineup：換人——存新陣容；被換掉的人記一次 dropped，之後不再排進預設。
 * adopt：採用一個切角 → 在本週企劃加一格（已排定），回傳任務卡讓前端接著寫全文。
 */
import { randomUUID } from "node:crypto";
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
  THINKER_KEYS, LINEUP_SIZE, bump, completedAngleObjects, ideationSystemPrompt, loadPrefs, loadThinkerCards, parseAngles,
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

// ─── 邊想邊顯示 ────────────────────────────────────────────────────────
//
// 2026-09-30（CJ「邊想邊顯示」）：一輪 Sonnet 要 ~45 秒，整段回來才顯示太久。仍是一次呼叫
// （多樣性靠同一份提示詞，見 ideationSystemPrompt），但改用 Anthropic 原生串流：每寫完一張卡
// 的 `}` 就放進 job，前端每秒來拿一次。伺服器是單一 pm2 process（ecosystem*.cjs instances: 1），
// job 放記憶體即可；重啟時進行中的 job 會消失，前端當成失敗讓用戶再按一次。

interface IdeateJob {
  userId: number;
  keys: ThinkerKey[];
  angles: Array<Angle & { thinker: ThinkerKey }>;
  done: boolean;
  failed: ThinkerKey[];
  createdAt: number;
}
const jobs = new Map<string, IdeateJob>();
const JOB_TTL_MS = 10 * 60_000;
function sweepJobs(): void {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
}

type RoundArgs = Parameters<typeof runRound>[0];

/** 串流一輪：每多一張寫完的卡就呼叫 onAngles（整份目前的清單）。串流失敗回 null，由呼叫端退回非串流。 */
async function streamRound(args: RoundArgs, onAngles: (a: Array<Angle & { thinker: ThinkerKey }>) => void): Promise<Array<Angle & { thinker: ThinkerKey }> | null> {
  const system = ideationSystemPrompt({ ...args, thinkers: args.keys.map((k) => ({ thinker: thinkerOf(k), name: args.nameOf(k) })) });
  try {
    const { anthropicStream } = await import("../../platform/core/llm");
    let buf = ""; let seen = 0;
    let latest: Array<Angle & { thinker: ThinkerKey }> = [];
    for await (const chunk of anthropicStream(
      [{ role: "system", content: system }, { role: "user", content: "請開始想。" }] as any, 4000, IDEATION_MODEL,
    )) {
      buf += chunk;
      const objs = completedAngleObjects(buf);
      if (objs.length > seen) {
        seen = objs.length;
        latest = parseAngles(`{"angles":[${objs.join(",")}]}`, { keys: args.keys, platforms: args.platforms, perThinker: args.count });
        onAngles(latest);
      }
    }
    // 收尾：用整段再解析一次（容錯比逐張好，例如最後一張的 `}` 跟 `]` 黏在一起）。
    const all = parseAngles(buf, { keys: args.keys, platforms: args.platforms, perThinker: args.count });
    return all.length >= latest.length ? all : latest;
  } catch (e) {
    console.warn("[inspiration] stream failed, falling back:", (e as Error)?.message?.slice(0, 160));
    return null;
  }
}

async function runJob(job: IdeateJob, base: Omit<RoundArgs, "keys" | "avoid">, avoid: string[]): Promise<void> {
  const byOrder = (xs: Array<Angle & { thinker: ThinkerKey }>) => xs.sort((x, y) => job.keys.indexOf(x.thinker) - job.keys.indexOf(y.thinker));
  try {
    let angles = await streamRound({ ...base, keys: job.keys, avoid }, (a) => { job.angles = a; });
    if (!angles?.length) angles = await runRound({ ...base, keys: job.keys, avoid });
    job.angles = byOrder([...angles]);
    // 模型漏掉的人：只替他們再問一次（帶著已經有的切角，免得撞）。
    const missing = job.keys.filter((k) => !job.angles.some((a) => a.thinker === k));
    if (missing.length && job.angles.length) {
      const more = await runRound({ ...base, keys: missing, avoid: [...avoid, ...job.angles.map((a) => a.title)] });
      job.angles = byOrder([...job.angles, ...more]);
    }
  } catch (e) {
    console.warn("[inspiration] job failed:", (e as Error)?.message?.slice(0, 160));
  } finally {
    job.failed = job.keys.filter((k) => !job.angles.some((a) => a.thinker === k));
    job.done = true;
  }
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

  /** 恢復預設陣容：陣容與採用／換掉紀錄整筆清掉（換太多人、或測試後清理）。 */
  resetLineup: protectedProcedure
    .input(brandInput)
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await localPool.execute(`DELETE FROM inspiration_prefs WHERE brandId = ?`, [input.brandId]);
      return { lineup: (await loadPrefs(input.brandId)).lineup };
    }),

  /** 開始一輪：準備好品牌資料就回 jobId，想的過程在背景跑；前端用 ideatePoll 拿進度。 */
  ideateStart: protectedProcedure
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
        brandName: subject.brandName, subjectLine: subject.subjectLine, brandCtx, nameOf,
        occasion: input.occasion || undefined, platforms, count: input.count,
        outputLanguage: market.outputLanguage, direction: input.direction || undefined,
      };
      sweepJobs();
      const jobId = randomUUID();
      const job: IdeateJob = { userId, keys, angles: [], done: false, failed: [], createdAt: Date.now() };
      jobs.set(jobId, job);
      void runJob(job, base, input.avoid);
      return { jobId };
    }),

  /** 這一輪目前想好的切角。done 之後 failed 才有意義。 */
  ideatePoll: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const job = jobs.get(input.jobId);
      // 找不到＝伺服器重啟或過期；別人的 job 也當成找不到。
      if (!job || job.userId !== ctx.user!.id) return { angles: [], done: true, failed: [] as ThinkerKey[], lost: true };
      return { angles: job.angles, done: job.done, failed: job.failed, lost: false };
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

