/**
 * influencerRouter — 「網紅切角」的 tRPC 介面。規則在 core/influencer/influencerAngles.ts。
 *
 * readable：除了 YouTube 與一般網頁，伺服器現在還讀得到哪些社群平台（有接數據商才有）。
 * usps：這個主體在定位裡現成的賣點（用戶可以取消勾選、自己加）。
 * latest：這個品牌最近一批的結果（重新整理不會不見）。
 * parseSheet：上傳的名單檔（.xlsx／.csv／.txt）→ 名單，還沒開始寫。
 * analyzeStart／analyzePoll：讀每一位的連結 → 整理口吻 → 當他本人想三個點子；開始後立刻回 jobId，
 *   想好一位就能被 poll 拿走一位。帶 batchId＝在原來那一批裡補寫／重寫指定的人。
 * pickIdea：用戶挑了某一位的第幾個點子 → 這時才寫那封邀約信。
 * savePerson：用戶改了某一位的名字／Email／邀約信，存回這一批（匯出用改過的版本）。
 * exportFile：整批匯出成 .xlsx 或 .docx。
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { callModel, callModelStrict } from "../../platform/core/llm/multiModelRouter";
import { getBrandMarket } from "../../strategy/core/brand/brandMarket";
import { buildBrandPrefix } from "../../strategy/core/brand/brandContext";
import localPool from "../../localDb";
import { classifyLink, PLATFORM_LABEL } from "../core/influencer/influencerLink";
import { readInfluencer } from "../core/influencer/influencerReader";
import { providerPlatforms } from "../core/influencer/apifyProfiles";
import {
  MAX_PEOPLE, NOTES_MAX, emailIssues, emailPrompt, ideasPrompt, materialEnough, parseEmail, parseIdeas, personLabel, voicePrompt,
  type PersonResult,
} from "../core/influencer/influencerAngles";
import { buildDocx, buildXlsx, parseSheet } from "../core/influencer/influencerSheet";
import { MAX_USPS, USP_MAX_CHARS, cleanUsps, loadUsps, matchPrompt, parseMatches, type MatchPerson } from "../core/influencer/influencerUsps";

/** 跟靈感舞台同一個理由：這是判斷題，固定用 Sonnet（可用 env 覆寫）。 */
const MODEL = process.env.INFLUENCER_MODEL || process.env.INSPIRATION_MODEL || "claude-sonnet-4-6";
const READ_CONCURRENCY = 4;
/** 同時替幾位想點子（每位兩次模型呼叫，約 20 秒）。 */
const WRITE_CONCURRENCY = 3;
/** 存下來給寫信用的素材摘錄長度。 */
const DIGEST_CHARS = 2000;
/** 分配賣點時每位給模型看多少素材（一次看整批，30 位 × 這個長度）。 */
const MATCH_DIGEST_CHARS = 500;
const SHEET_MAX_BYTES = 2 * 1024 * 1024;

const brandInput = z.object({ brandId: z.number().int().positive() });
const subjectZ = z.object({
  kind: z.enum(["brand", "product", "event"]),
  id: z.number().int().positive().nullable(),
});
const personZ = z.object({
  id: z.string().min(1).max(40),
  url: z.string().trim().min(4).max(600),
  name: z.string().trim().max(60).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().max(NOTES_MAX).optional(),
});

// 每位使用者每小時 12 批（一批最多 30 位＝30 次連結讀取＋60 次模型呼叫）。
const rate = new Map<number, number[]>();
function checkRate(userId: number): void {
  const now = Date.now();
  const hits = (rate.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 12) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時跑太多批了，晚點再來。" });
  hits.push(now);
  rate.set(userId, hits);
}

/** 主體的名稱；產品／活動必須屬於這個品牌。（與 inspirationRouter.resolveSubject 同規則。） */
async function resolveSubject(brandId: number, subject: z.infer<typeof subjectZ>) {
  const [bRows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const brandName = String((bRows as any[])[0]?.name ?? "");
  if (subject.kind === "brand" || !subject.id) {
    return { brandName, subjectLine: `品牌「${brandName}」本身（不是單一產品）`, subjectName: brandName, productId: null, eventId: null };
  }
  const table = subject.kind === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(`SELECT name FROM ${table} WHERE id = ? AND brandId = ? LIMIT 1`, [subject.id, brandId]);
  const name = (rows as any[])[0]?.name;
  if (!name) throw new TRPCError({ code: "NOT_FOUND", message: subject.kind === "product" ? "找不到這個產品" : "找不到這個活動" });
  return subject.kind === "product"
    ? { brandName, subjectLine: `「${brandName}」的產品「${name}」`, subjectName: String(name), productId: subject.id, eventId: null }
    : { brandName, subjectLine: `「${brandName}」的活動「${name}」`, subjectName: String(name), productId: null, eventId: subject.id };
}

// 挑點子寫信：每位使用者每小時 120 封（一封一到兩次模型呼叫）。
const pickRate = new Map<number, number[]>();
function checkPickRate(userId: number): void {
  const now = Date.now();
  const hits = (pickRate.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 120) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時寫太多封了，晚點再來。" });
  hits.push(now);
  pickRate.set(userId, hits);
}

// ─── 批次存取 ─────────────────────────────────────────────────────────

interface BatchRow { id: number; subjectKind: "brand" | "product" | "event"; subjectId: number | null; people: PersonResult[]; updatedAt: string }

function parsePeople(raw: unknown): PersonResult[] {
  try { const v = typeof raw === "string" ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; } catch { return []; }
}
async function loadBatch(brandId: number, batchId?: number): Promise<BatchRow | null> {
  const [rows]: any = batchId
    ? await localPool.execute(`SELECT * FROM influencer_batches WHERE id = ? AND brandId = ? LIMIT 1`, [batchId, brandId])
    : await localPool.execute(`SELECT * FROM influencer_batches WHERE brandId = ? ORDER BY updatedAt DESC LIMIT 1`, [brandId]);
  const r = (rows as any[])[0];
  if (!r) return null;
  // 伺服器重啟時還在跑的人不會有人接手寫完：讀出來時改成「沒寫成」，讓用戶可以重試。
  const people = parsePeople(r.people).map((p) =>
    (["queued", "reading", "thinking"].includes(p.status) && !isRunning(Number(r.id)) ? { ...p, status: "failed" as const } : p));
  return { id: Number(r.id), subjectKind: r.subjectKind, subjectId: r.subjectId == null ? null : Number(r.subjectId), people, updatedAt: String(r.updatedAt) };
}
async function saveBatch(batchId: number, people: PersonResult[]): Promise<void> {
  await localPool.execute(`UPDATE influencer_batches SET people = ? WHERE id = ?`, [JSON.stringify(people), batchId]);
}
/** 回給前端的名單：寫信用的素材摘錄不外送（只有伺服器用得到，一批 30 位會多幾十 KB）。 */
function pub(people: PersonResult[]): PersonResult[] {
  return people.map(({ materialDigest: _m, ...p }) => p);
}

// ─── 背景工作 ─────────────────────────────────────────────────────────
// 伺服器是單一 pm2 process（同 inspirationRouter 的說明），進度放記憶體，結果每一組寫回資料庫。

interface Job { userId: number; batchId: number; people: PersonResult[]; done: boolean; createdAt: number }
const jobs = new Map<string, Job>();
const JOB_TTL_MS = 30 * 60_000;
function sweepJobs(): void {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.done && now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
}
function isRunning(batchId: number): boolean {
  for (const j of jobs.values()) if (j.batchId === batchId && !j.done) return true;
  return false;
}

function runningJob(batchId: number): Job | null {
  for (const j of jobs.values()) if (j.batchId === batchId && !j.done) return j;
  return null;
}

/**
 * 改某一位的欄位。這一批還在跑的時候，背景工作手上那份才是最後會寫回資料庫的——兩邊都要改，
 * 不然用戶在別人還在研究時挑的點子、改的 Email 會被整批覆蓋掉。
 */
async function applyChange(brandId: number, batchId: number, id: string, changes: Partial<PersonResult>): Promise<void> {
  const live = runningJob(batchId)?.people.find((p) => p.id === id);
  if (live) Object.assign(live, changes);
  const b = await loadBatch(brandId, batchId);
  if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一批名單" });
  await saveBatch(b.id, b.people.map((p) => (p.id === id ? { ...p, ...changes } : p)));
}

/** 問一次模型。指定的模型在這個環境沒開通時，改用 provider 預設再試一次；都不行回 null。 */
async function ask(system: string, user: string, maxTokens: number): Promise<string | null> {
  const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = attempt === 0
        ? await callModelStrict(messages, "anthropic", MODEL, { maxTokens })
        : await callModel(messages, "creative_writing", "anthropic");
      const text = String(r.content ?? "").trim();
      if (text) return text;
    } catch (e) {
      console.warn("[influencer] model call failed:", (e as Error)?.message?.slice(0, 160));
    }
  }
  return null;
}

type Base = { brandName: string; subjectLine: string; brandCtx: string; outputLanguage: string; direction?: string; usps: string[] };

/** 一位：口吻卡 → 當他本人想三個點子。點子解析不出來就再想一次；還是不行回 null。 */
async function researchPerson(p: PersonResult, material: string, base: Base, avoid: string[]) {
  const voice = await ask(voicePrompt(base.outputLanguage), material.slice(0, 4000), 900);
  if (!voice) return null;
  const system = ideasPrompt({
    ...base, label: personLabel(p), platform: p.platform ? PLATFORM_LABEL[p.platform] : "", followers: p.followers,
    material, voice, avoid, usp: p.usp,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(system, "請開始。", 1600);
    const ideas = raw ? parseIdeas(raw, material) : null;
    if (ideas) return { voice: voice.slice(0, 900), ideas };
  }
  return null;
}

async function runJob(job: Job, targets: string[], base: Base): Promise<void> {
  const byId = (id: string) => job.people.find((p) => p.id === id)!;
  const patch = (id: string, v: Partial<PersonResult>) => { Object.assign(byId(id), v); };
  try {
    // 1) 讀連結（併發有上限，別對同一個網站一次開太多連線）。
    const material = new Map<string, string>();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, targets.length) }, async () => {
      while (cursor < targets.length) {
        const id = targets[cursor++]!;
        const p = byId(id);
        patch(id, { status: "reading" });
        const { link, read } = await readInfluencer(p.url);
        if (!link) { patch(id, { status: "invalid_link", platform: null, handle: null }); continue; }
        const notes = (p.notes ?? "").trim();
        const text = [read.material, notes ? `用戶補充的素材（這位網紅的貼文或介紹）：\n${notes}` : ""].filter(Boolean).join("\n\n");
        patch(id, {
          platform: link.platform, handle: link.handle, followers: read.followers, displayName: read.displayName,
          source: read.source !== "none" ? read.source : notes ? "user_notes" : "none",
        });
        if (!materialEnough(text)) { patch(id, { status: "needs_material" }); continue; }
        material.set(id, text);
        patch(id, { status: "thinking" });
      }
    }));
    await saveBatch(job.batchId, job.people).catch(() => {});

    const ready = targets.filter((id) => material.has(id));

    // 2) 有賣點清單：先看完整批再分配誰講哪一個（一位一位各自挑，大家都會挑最顯眼的那個）。
    //    這一批原本就配好的人算進去，補寫的人才不會又擠到同一個賣點。
    for (const id of targets) patch(id, { usp: undefined, uspWhy: undefined });
    if (base.usps.length && ready.length) {
      const taken: Record<string, number> = {};
      for (const p of job.people) if (p.usp && !targets.includes(p.id) && base.usps.includes(p.usp)) taken[p.usp] = (taken[p.usp] ?? 0) + 1;
      const people: MatchPerson[] = ready.map((id) => {
        const p = byId(id);
        return { id, label: personLabel(p), platform: p.platform ? PLATFORM_LABEL[p.platform] : "", followers: p.followers, digest: material.get(id)!.slice(0, MATCH_DIGEST_CHARS) };
      });
      const raw = base.usps.length > 1
        ? await ask(matchPrompt({ brandName: base.brandName, subjectLine: base.subjectLine, usps: base.usps, people, taken, outputLanguage: base.outputLanguage }), "請開始。", 1500)
        : null;
      for (const [id, m] of parseMatches(raw, base.usps, ready, taken)) patch(id, { usp: m.usp, uspWhy: m.why });
      await saveBatch(job.batchId, job.people).catch(() => {});
    }

    // 3) 一位一位想（同時 WRITE_CONCURRENCY 位）。後面的人拿得到已經用掉的點子，免得整批撞題。
    const used = job.people.filter((p) => p.status === "done" && !targets.includes(p.id)).flatMap((p) => (p.ideas ?? []).map((i) => i.title));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, ready.length) }, async () => {
      while (next < ready.length) {
        const id = ready[next++]!;
        const text = material.get(id)!;
        const got = await researchPerson(byId(id), text, base, used.slice(-30)).catch(() => null);
        if (!got) { patch(id, { status: "failed" }); continue; }
        const { detectedName, ...ideas } = got.ideas;
        const p = byId(id);
        patch(id, {
          ...ideas, voice: got.voice, materialDigest: text.slice(0, DIGEST_CHARS), status: "done",
          ...(!p.name && !p.displayName && detectedName ? { displayName: detectedName } : {}),
        });
        used.push(...ideas.ideas.map((i) => i.title));
        await saveBatch(job.batchId, job.people).catch(() => {});
      }
    }));
  } catch (e) {
    console.warn("[influencer] job failed:", (e as Error)?.message?.slice(0, 160));
  } finally {
    for (const id of targets) if (["queued", "reading", "thinking"].includes(byId(id).status)) patch(id, { status: "failed" });
    job.done = true;
    await saveBatch(job.batchId, job.people).catch(() => {});
  }
}

export const influencerRouter = router({
  readable: protectedProcedure
    .query(() => ({ social: providerPlatforms() as string[] })),

  usps: protectedProcedure
    .input(brandInput.extend({ subject: subjectZ }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return { usps: await loadUsps(input.brandId, input.subject), max: MAX_USPS };
    }),

  latest: protectedProcedure
    .input(brandInput)
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const b = await loadBatch(input.brandId);
      if (!b) return null;
      let jobId: string | null = null;
      for (const [id, j] of jobs) if (j.batchId === b.id && !j.done && j.userId === ctx.user!.id) jobId = id;
      // 還在跑的那一批，以背景工作手上那份為準（資料庫裡的要等它寫回才是新的）。
      const people = runningJob(b.id)?.people ?? b.people;
      return { batchId: b.id, subject: { kind: b.subjectKind, id: b.subjectId }, people: pub(people), jobId };
    }),

  parseSheet: protectedProcedure
    .input(brandInput.extend({ filename: z.string().max(200), contentBase64: z.string().max(Math.ceil(SHEET_MAX_BYTES * 1.4)) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const buf = Buffer.from(input.contentBase64, "base64");
      if (buf.length > SHEET_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "名單檔太大了（上限 2MB）。" });
      if (!/\.(xlsx|csv|tsv|txt)$/i.test(input.filename)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "請上傳 .xlsx、.csv 或 .txt（舊版 .xls 請先另存成 .xlsx）。" });
      }
      try {
        return parseSheet(buf, input.filename);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這個檔案讀不出來，請確認是 .xlsx 或 .csv。" });
      }
    }),

  analyzeStart: protectedProcedure
    .input(brandInput.extend({
      subject: subjectZ,
      people: z.array(personZ).min(1).max(MAX_PEOPLE),
      /** 用戶補充的合作方向（選填）。 */
      direction: z.string().trim().max(160).optional(),
      /** 這次要請網紅講的賣點（定位裡勾選的＋用戶自己加的）。空的＝不分配賣點。 */
      usps: z.array(z.string().max(USP_MAX_CHARS)).max(MAX_USPS).default([]),
      /** 有帶＝在這一批裡補寫／重寫 people 這幾位；沒帶＝開新的一批。 */
      batchId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      checkRate(userId);
      const ids = input.people.map((p) => p.id);
      if (new Set(ids).size !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "名單裡有重複的人。" });

      const [subject, market] = await Promise.all([resolveSubject(input.brandId, input.subject), getBrandMarket(input.brandId)]);
      const brandCtx = await buildBrandPrefix(input.brandId, subject.productId, subject.eventId, "full").catch(() => "");

      const fresh: PersonResult[] = input.people.map((p) => {
        const link = classifyLink(p.url);
        return {
          ...p, url: link?.url ?? p.url, status: "queued",
          platform: link?.platform ?? null, handle: link?.handle ?? null, followers: null, source: "none", displayName: null,
        };
      });

      let batchId: number;
      let people: PersonResult[];
      if (input.batchId) {
        const b = await loadBatch(input.brandId, input.batchId);
        if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一批名單" });
        if (isRunning(b.id)) throw new TRPCError({ code: "CONFLICT", message: "這一批還在寫，等它寫完再補。" });
        const keep = b.people.filter((p) => !ids.includes(p.id));
        if (keep.length + fresh.length > MAX_PEOPLE) throw new TRPCError({ code: "BAD_REQUEST", message: `一批最多 ${MAX_PEOPLE} 位。` });
        // 重寫的人留在原來的位置，新加的人排在後面。
        people = [...b.people.map((p) => fresh.find((f) => f.id === p.id) ?? p), ...fresh.filter((f) => !b.people.some((p) => p.id === f.id))];
        batchId = b.id;
        await localPool.execute(`UPDATE influencer_batches SET subjectKind = ?, subjectId = ?, people = ? WHERE id = ?`,
          [input.subject.kind, subject.productId ?? subject.eventId, JSON.stringify(people), batchId]);
      } else {
        people = fresh;
        const [r]: any = await localPool.execute(
          `INSERT INTO influencer_batches (userId, brandId, subjectKind, subjectId, people) VALUES (?, ?, ?, ?, ?)`,
          [userId, input.brandId, input.subject.kind, subject.productId ?? subject.eventId, JSON.stringify(people)],
        );
        batchId = Number(r.insertId);
      }

      sweepJobs();
      const jobId = randomUUID();
      const job: Job = { userId, batchId, people, done: false, createdAt: Date.now() };
      jobs.set(jobId, job);
      void runJob(job, ids, {
        brandName: subject.brandName, subjectLine: subject.subjectLine, brandCtx,
        outputLanguage: market.outputLanguage, direction: input.direction || undefined, usps: cleanUsps(input.usps),
      });
      return { jobId, batchId };
    }),

  analyzePoll: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const job = jobs.get(input.jobId);
      // 找不到＝伺服器重啟或過期；別人的 job 也當成找不到。前端改讀 latest。
      if (!job || job.userId !== ctx.user!.id) return { people: [] as PersonResult[], done: true, lost: true };
      return { people: pub(job.people), done: job.done, lost: false };
    }),

  /** 用戶挑了第幾個點子：這時才寫邀約信（沒被挑的點子不花錢寫信）。 */
  pickIdea: protectedProcedure
    .input(brandInput.extend({ batchId: z.number().int().positive(), id: z.string().max(40), index: z.number().int().min(0).max(2) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      checkPickRate(userId);
      const b = await loadBatch(input.brandId, input.batchId);
      if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一批名單" });
      const p = runningJob(b.id)?.people.find((x) => x.id === input.id) ?? b.people.find((x) => x.id === input.id);
      const idea = p?.status === "done" ? p.ideas?.[input.index] : undefined;
      if (!p || !idea) throw new TRPCError({ code: "BAD_REQUEST", message: "這一位還沒有這個點子。" });

      const [subject, market] = await Promise.all([
        resolveSubject(input.brandId, { kind: b.subjectKind, id: b.subjectId }), getBrandMarket(input.brandId),
      ]);
      const brandCtx = await buildBrandPrefix(input.brandId, subject.productId, subject.eventId, "full").catch(() => "");
      const material = p.materialDigest || [p.profile, p.evidence, idea.basedOn].filter(Boolean).join("\n");
      const known = [material, brandCtx, idea.title, idea.hook, idea.productPoint, idea.basedOn ?? "", p.usp ?? ""];
      const args = {
        brandName: subject.brandName, subjectLine: subject.subjectLine, brandCtx, label: personLabel(p), material, idea,
        outputLanguage: market.outputLanguage, usp: p.usp,
      };
      let mail = parseEmail((await ask(emailPrompt(args), "請開始。", 900)) ?? "");
      if (!mail) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "這封信沒寫成，請再選一次。" });
      // 檢查（替他編的話、太長）→ 帶著問題重寫一次；重寫後問題變少才換。
      const issues = emailIssues(mail.body, known);
      if (issues.length) {
        const again = parseEmail((await ask(emailPrompt({ ...args, fixes: issues }), "請開始。", 900)) ?? "");
        if (again && emailIssues(again.body, known).length < issues.length) mail = again;
      }
      const changes = {
        picked: input.index, emailSubject: mail.subject, emailBody: mail.body,
        quoteWarning: emailIssues(mail.body, known).some((x) => x.includes("找不到")),
      };
      await applyChange(input.brandId, b.id, input.id, changes);
      return changes;
    }),

  savePerson: protectedProcedure
    .input(brandInput.extend({
      batchId: z.number().int().positive(), id: z.string().max(40),
      name: z.string().trim().max(60).optional(), email: z.string().trim().max(160).optional(),
      emailSubject: z.string().trim().max(60).optional(), emailBody: z.string().trim().max(1200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const { brandId, batchId, id, ...fields } = input;
      const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      await applyChange(brandId, batchId, id, changes);
      return { ok: true };
    }),

  exportFile: protectedProcedure
    .input(brandInput.extend({ batchId: z.number().int().positive(), format: z.enum(["xlsx", "docx"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const b = await loadBatch(input.brandId, input.batchId);
      if (!b || !b.people.length) throw new TRPCError({ code: "NOT_FOUND", message: "這一批沒有可以匯出的內容" });
      const subject = await resolveSubject(input.brandId, { kind: b.subjectKind, id: b.subjectId }).catch(() => null);
      const title = `${subject?.subjectName ?? "品牌"} 網紅切角`;
      const buf = input.format === "xlsx" ? buildXlsx(b.people, title) : buildDocx(b.people, title);
      return {
        filename: `${title.replace(/[\\/:*?"<>|]/g, " ")}.${input.format}`,
        mime: input.format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        base64: buf.toString("base64"),
      };
    }),
});
