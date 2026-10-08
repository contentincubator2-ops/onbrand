/**
 * inspireRouter — 醫師自媒體示範頁（/inspire）的公開介面，免登入。
 *
 * 2026-10-07（CJ「免登入的示範頁面……醫生掃 QR code、輸入名字、選議題、搭配不同網紅語調，
 * 產出文章內容」「展現出正在審查哪些條文」）。題庫、創作者 agent、條文在 content/core/inspire/。
 *
 * config：議題、100 位創作者 agent 的卡面資料、條文清單與出處。
 * ideateStart／ideatePoll：選到的每一位 agent 各自呼叫一次、各想幾個點子；誰先想完誰先出現。
 * writeStart／writePoll：採用一個點子 → 由那位 agent 寫成該平台的成稿 → 逐組條文審查。
 * reviewStart：醫師改過稿子之後，拿目前的文字再審一次（結果同樣用 writePoll 拿）。
 *
 * 審查只提建議，不改稿（CJ「審查後不要直接改寫，要提出建議，看醫生自己是否要改寫」）：
 * 每個疑慮交出原句、涉及的條文、原因與建議的改法，要不要改在前端由醫師逐句決定。
 * 審查是一組條文一次呼叫、依序進行，畫面上的「審查中／通過」對應的是真的那一次呼叫；
 * 呼叫失敗的那一組標成 skipped，不假裝審過。
 *
 * 免登入＝任何人都能呼叫，所以：每個 IP 有每分鐘與每小時上限、全站有每日上限
 * （INSPIRE_DAILY_CAP），自訂議題必須跟血壓有關，回傳內容不含提示詞、創作者的名字與出處。
 * 伺服器是單一 pm2 process（同 inspirationRouter 的說明），進度與計數放記憶體。
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../../platform/core/trpc";
import { callModel } from "../../platform/core/llm/multiModelRouter";
import {
  INSPIRE_TOPICS, PLATFORM_FORMAT, PLATFORM_LABEL, cleanDoctorName, finalizeDraft, inspireWritePrompt,
  parseIdeas, parseReviewIssues, personaIdeationPrompt, resolveTopic, reviewPrompt,
  type InspireIdea, type ReviewIssue,
} from "../../content/core/inspire/doctorInspire";
import { INSPIRE_PERSONAS, PERSONA_KEYS, leaksPersona, personaOf, type InspirePersona } from "../../content/core/inspire/inspirePersonas";
import {
  FACT_SOURCE, INSPIRE_FACTS, REGULATIONS_CHECKED_AT, REGULATION_GROUPS, itemsOfGroup, scanRiskTerms,
  type RegulationGroupId,
} from "../../content/core/inspire/inspireRegulations";

const WRITE_MODEL = process.env.INSPIRE_MODEL || "claude-sonnet-4-6";
const REVIEW_MODEL = process.env.INSPIRE_REVIEW_MODEL || WRITE_MODEL;
const DAILY_CAP = Math.max(1, Number(process.env.INSPIRE_DAILY_CAP) || 3000);
export const MAX_PERSONAS = 4;
/** 每位 agent 一輪想幾個點子。 */
export const IDEAS_PER_PERSONA = 3;

// ─── 上限 ──────────────────────────────────────────────────────────────

const hitsByIp = new Map<string, number[]>();
let day = ""; let dayCount = 0;

const IP_PER_MIN = Math.max(1, Number(process.env.INSPIRE_IP_PER_MIN) || 30);
const IP_PER_HOUR = Math.max(1, Number(process.env.INSPIRE_IP_PER_HOUR) || 600);

/**
 * 每個 IP 每分鐘 IP_PER_MIN 次、每小時 IP_PER_HOUR 次（想點子、寫成稿、重審合計）；全站每日 DAILY_CAP 次。
 * 2026-10-08：原本是 6／40，但活動現場與辦公室是很多人共用一個對外 IP，幾分鐘就全部被擋，所以放寬並可用 env 調整。
 */
export function checkInspireRate(ip: string, now = Date.now()): void {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; hitsByIp.clear(); }
  if (dayCount >= DAILY_CAP) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "今天的示範名額用完了，明天再來試試。" });
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.filter((t) => now - t < 60_000).length >= IP_PER_MIN) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "按太快了，等一下再試。" });
  if (hits.length >= IP_PER_HOUR) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時用太多次了，晚點再來。" });
  hits.push(now);
  hitsByIp.set(ip, hits);
  dayCount++;
}
export function resetInspireRateForTest(): void { hitsByIp.clear(); day = ""; dayCount = 0; }

// ─── 進度 ──────────────────────────────────────────────────────────────

interface IdeateJob {
  keys: string[];
  ideas: InspireIdea[];
  /** 還在想的 agent。 */
  pending: string[];
  /** 想完但沒交出可用點子的 agent。 */
  failed: string[];
  done: boolean;
  createdAt: number;
}

export type ReviewStatus = "pending" | "checking" | "pass" | "issue" | "skipped";
export type WriteStage = "writing" | "reviewing" | "done" | "failed";
/** compliant：全部通過；issues：有疑慮，附建議；partial：有幾組沒審到。 */
export type WriteVerdict = "compliant" | "issues" | "partial";

interface WriteJob {
  stage: WriteStage;
  text: string;
  review: Array<{ group: RegulationGroupId; status: ReviewStatus }>;
  issues: ReviewIssue[];
  verdict: WriteVerdict | null;
  createdAt: number;
}

const ideateJobs = new Map<string, IdeateJob>();
const writeJobs = new Map<string, WriteJob>();
const JOB_TTL_MS = 15 * 60_000;
function sweep(): void {
  const now = Date.now();
  for (const [id, j] of ideateJobs) if (now - j.createdAt > JOB_TTL_MS) ideateJobs.delete(id);
  for (const [id, j] of writeJobs) if (now - j.createdAt > JOB_TTL_MS) writeJobs.delete(id);
}

async function ask(system: string, user: string, model: string): Promise<string> {
  // 第二次改用 provider 預設模型：指定的模型在某個環境沒開通時，不讓整段落空。
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callModel([{ role: "system", content: system }, { role: "user", content: user }], "creative_writing", "anthropic", attempt === 0 ? model : undefined);
      const out = String(r.content ?? "").trim();
      if (out) return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error("empty response");
}

type IdeateArgs = Omit<Parameters<typeof personaIdeationPrompt>[0], "persona">;

/** 每位 agent 各自平行想；想完一位就把點子放進 job，前端下一次 poll 就看得到。 */
async function runIdeate(job: IdeateJob, args: IdeateArgs): Promise<void> {
  await Promise.all(job.keys.map(async (key) => {
    const persona = personaOf(key)!;
    let got: InspireIdea[] = [];
    // 一個都沒交出來（呼叫失敗、格式壞掉、或全部露出名字被濾掉）就再請他想一次，不讓一位 agent 整輪落空。
    for (let attempt = 0; attempt < 2 && !got.length; attempt++) {
      try {
        got = parseIdeas(await ask(personaIdeationPrompt({ ...args, persona }), "請開始想。", WRITE_MODEL), persona, args.count);
        if (!got.length) console.warn(`[inspire] ideate ${key}: no usable ideas (attempt ${attempt + 1})`);
      } catch (e) {
        console.warn(`[inspire] ideate ${key} failed:`, (e as Error)?.message?.slice(0, 160));
      }
    }
    if (got.length) job.ideas = [...job.ideas, ...got].sort((x, y) => job.keys.indexOf(x.persona) - job.keys.indexOf(y.persona));
    else job.failed.push(key);
    job.pending = job.pending.filter((k) => k !== key);
  }));
  job.done = true;
}

/** 依序審每一組條文，結果寫回 job。某一組呼叫失敗就標 skipped。 */
async function reviewInto(job: WriteJob): Promise<void> {
  const text = job.text;
  const hits = scanRiskTerms(text);
  const all: ReviewIssue[] = [];
  for (const slot of job.review) {
    slot.status = "checking";
    const items = itemsOfGroup(slot.group);
    try {
      const raw = await ask(reviewPrompt(items, hits), `# 待審查的成稿\n${text}`, REVIEW_MODEL);
      const issues = parseReviewIssues(raw, { ids: items.map((r) => r.id), text });
      if (!issues) { slot.status = "skipped"; continue; }
      slot.status = issues.length ? "issue" : "pass";
      all.push(...issues);
    } catch (e) {
      console.warn(`[inspire] review ${slot.group} failed:`, (e as Error)?.message?.slice(0, 160));
      slot.status = "skipped";
    }
  }
  // 2026-10-07 DEV 實跑：模型把前三句各報了兩三條，最明顯的「私訊我預約、前十名免費諮詢」反而沒報。
  // 關鍵字掃描命中、但審查沒有點到的句子，一律補成一筆建議——由醫師判斷，不讓它無聲通過。
  for (const h of hits) {
    if (all.some((i) => i.quote.includes(h.quote) || h.quote.includes(i.quote)) || !text.includes(h.quote)) continue;
    all.push({ regulationId: h.regulationId, quote: h.quote, detail: `關鍵字掃描標出：${h.why}。請您判斷是否需要調整。`, suggestion: "" });
    const slot = job.review.find((r) => itemsOfGroup(r.group).some((x) => x.id === h.regulationId));
    if (slot && slot.status === "pass") slot.status = "issue";
  }
  job.issues = all;
  job.verdict = job.review.some((r) => r.status === "skipped") ? "partial" : all.length ? "issues" : "compliant";
}

/** 成稿裡露出創作者的名字或口頭禪：把那幾個字拿掉（重寫一次也可能再犯，直接刪最確定）。 */
function scrubPersona(text: string, persona: InspirePersona): string {
  let out = text;
  for (let i = 0; i < 6; i++) {
    const hit = leaksPersona(out, persona);
    if (!hit) break;
    out = out.split(hit).join("");
  }
  return out;
}

async function runWrite(job: WriteJob, args: Parameters<typeof inspireWritePrompt>[0]): Promise<void> {
  try {
    const raw = await ask(inspireWritePrompt(args), "請開始寫。", WRITE_MODEL);
    job.text = finalizeDraft(scrubPersona(raw, args.persona));
    job.stage = "reviewing";
    await reviewInto(job);
    job.stage = "done";
  } catch (e) {
    console.warn("[inspire] write failed:", (e as Error)?.message?.slice(0, 160));
    job.stage = "failed";
  }
}

async function runReview(job: WriteJob): Promise<void> {
  try { await reviewInto(job); job.stage = "done"; }
  catch (e) { console.warn("[inspire] review failed:", (e as Error)?.message?.slice(0, 160)); job.stage = "failed"; }
}

const newWriteJob = (stage: WriteStage, text = ""): WriteJob => ({
  stage, text, issues: [], verdict: null, createdAt: Date.now(),
  review: REGULATION_GROUPS.map((g) => ({ group: g.id, status: "pending" as ReviewStatus })),
});

// ─── 介面 ──────────────────────────────────────────────────────────────

const personaZ = z.string().refine((k) => PERSONA_KEYS.includes(k), "unknown persona");
const subjectZ = z.object({
  name: z.string().max(40),
  topicId: z.string().max(40).optional(),
  customTopic: z.string().max(80).optional(),
});

function subjectOf(input: z.infer<typeof subjectZ>) {
  const doctor = cleanDoctorName(input.name);
  if (!doctor) throw new TRPCError({ code: "BAD_REQUEST", message: "請先輸入名字。" });
  const topic = resolveTopic(input);
  if (!topic) throw new TRPCError({ code: "BAD_REQUEST", message: "這個示範只做高血壓相關的議題，請換一個跟血壓有關的題目。" });
  return { doctor, topic };
}

export const inspireRouter = router({
  config: publicProcedure.query(() => ({
    topics: INSPIRE_TOPICS,
    maxPersonas: MAX_PERSONAS,
    ideasPerPersona: IDEAS_PER_PERSONA,
    // 只給卡面上的東西；agent 的人設、參考的是誰、出處都不出 server。
    personas: INSPIRE_PERSONAS.map((p) => ({
      key: p.key, platform: p.platform, platformLabel: PLATFORM_LABEL[p.platform], market: p.market,
      label: p.label, reference: p.reference, pitch: p.pitch, format: PLATFORM_FORMAT[p.platform],
    })),
    regulationGroups: REGULATION_GROUPS.map((g) => ({
      ...g,
      items: itemsOfGroup(g.id).map((r) => ({
        id: r.id, law: r.law, article: r.article, title: r.title, gist: r.gist, url: r.url, amended: r.amended, secondary: !!r.secondary,
      })),
    })),
    facts: INSPIRE_FACTS,
    factSource: FACT_SOURCE,
    checkedAt: REGULATIONS_CHECKED_AT,
  })),

  ideateStart: publicProcedure
    .input(subjectZ.extend({
      personas: z.array(personaZ).min(1).max(MAX_PERSONAS),
      avoid: z.array(z.string().max(60)).max(40).default([]),
      direction: z.string().trim().max(80).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { doctor, topic } = subjectOf(input);
      checkInspireRate(ctx.ip || "unknown");
      const keys = Array.from(new Set(input.personas));
      sweep();
      const jobId = randomUUID();
      const job: IdeateJob = { keys, ideas: [], pending: [...keys], failed: [], done: false, createdAt: Date.now() };
      ideateJobs.set(jobId, job);
      void runIdeate(job, { doctor, topic, count: IDEAS_PER_PERSONA, avoid: input.avoid, direction: input.direction || undefined });
      return { jobId };
    }),

  ideatePoll: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }) => {
      const job = ideateJobs.get(input.jobId);
      // 找不到＝伺服器重啟或過期。
      if (!job) return { ideas: [] as InspireIdea[], pending: [] as string[], failed: [] as string[], done: true, lost: true };
      return { ideas: job.ideas, pending: job.pending, failed: job.failed, done: job.done, lost: false };
    }),

  writeStart: publicProcedure
    .input(subjectZ.extend({
      persona: personaZ,
      title: z.string().trim().min(2).max(60),
      hook: z.string().trim().min(2).max(120),
      concept: z.string().trim().max(260).default(""),
      answer: z.string().trim().max(80).default(""),
      why: z.string().trim().max(160).default(""),
    }))
    .mutation(({ ctx, input }) => {
      const { doctor, topic } = subjectOf(input);
      checkInspireRate(ctx.ip || "unknown");
      sweep();
      const jobId = randomUUID();
      const job = newWriteJob("writing");
      writeJobs.set(jobId, job);
      void runWrite(job, {
        doctor, topic, persona: personaOf(input.persona)!,
        idea: { title: input.title, hook: input.hook, concept: input.concept, answer: input.answer, why: input.why },
      });
      return { jobId };
    }),

  /** 醫師改過之後再審一次：只審，不動文字。 */
  reviewStart: publicProcedure
    .input(z.object({ text: z.string().trim().min(20).max(6000) }))
    .mutation(({ ctx, input }) => {
      checkInspireRate(ctx.ip || "unknown");
      sweep();
      const jobId = randomUUID();
      const job = newWriteJob("reviewing", input.text);
      writeJobs.set(jobId, job);
      void runReview(job);
      return { jobId };
    }),

  writePoll: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }) => {
      const job = writeJobs.get(input.jobId);
      if (!job) return { stage: "failed" as WriteStage, text: "", review: [], issues: [] as ReviewIssue[], verdict: null as WriteVerdict | null, lost: true };
      const done = job.stage === "done";
      // 成稿審完才交出去：疑慮與建議要跟著文字一起出現。
      return { stage: job.stage, text: done ? job.text : "", review: job.review, issues: done ? job.issues : [], verdict: done ? job.verdict : null, lost: false };
    }),
});
