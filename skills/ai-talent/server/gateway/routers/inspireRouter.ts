/**
 * inspireRouter — 醫師自媒體示範頁（/inspire）的公開介面，免登入。
 *
 * 2026-10-07（CJ「免登入的示範頁面……醫生掃 QR code、輸入名字、選議題、搭配不同網紅語調，
 * 產出文章內容」「展現出正在審查哪些條文」）。題庫、風格、條文在 content/core/inspire/。
 *
 * config：議題、說話風格、條文清單與出處（畫面上要看得到審查依據）。
 * ideateStart／ideatePoll：選到的風格各想切角（一輪一次呼叫）。
 * writeStart／writePoll：採用一個切角 → 寫成該平台的成稿 → 逐組條文審查 → 有問題就最小幅度修正。
 *   審查是一組條文一次呼叫、依序進行，畫面上的「審查中／通過」對應的是真的那一次呼叫；
 *   呼叫失敗的那一組標成 skipped，不假裝審過。
 *
 * 免登入＝任何人都能呼叫，所以：每個 IP 有每分鐘與每小時上限、全站有每日上限
 * （INSPIRE_DAILY_CAP），自訂議題必須跟血壓有關，回傳內容不含提示詞與風格的參考來源。
 * 伺服器是單一 pm2 process（同 inspirationRouter 的說明），進度與計數放記憶體。
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../../platform/core/trpc";
import { callModel } from "../../platform/core/llm/multiModelRouter";
import {
  INSPIRE_TOPICS, PLATFORM_FORMAT, PLATFORM_LABEL, cleanDoctorName, finalizeDraft, fixPrompt, inspireIdeationPrompt,
  inspireWritePrompt, parseIdeas, parseReviewIssues, rejectFix, resolveTopic, reviewPrompt,
  type InspireIdea, type ReviewIssue,
} from "../../content/core/inspire/doctorInspire";
import { INSPIRE_PERSONAS, PERSONA_KEYS, personaOf } from "../../content/core/inspire/inspirePersonas";
import {
  ALL_REVIEW_ITEMS, FACT_SOURCE, INSPIRE_FACTS, REGULATIONS_CHECKED_AT, REGULATION_GROUPS, itemsOfGroup, scanRiskTerms,
  type RegulationGroupId,
} from "../../content/core/inspire/inspireRegulations";

const WRITE_MODEL = process.env.INSPIRE_MODEL || "claude-sonnet-4-6";
const REVIEW_MODEL = process.env.INSPIRE_REVIEW_MODEL || WRITE_MODEL;
const DAILY_CAP = Math.max(1, Number(process.env.INSPIRE_DAILY_CAP) || 800);
export const MAX_PERSONAS = 4;

// ─── 上限 ──────────────────────────────────────────────────────────────

const hitsByIp = new Map<string, number[]>();
let day = ""; let dayCount = 0;

/** 每個 IP 每分鐘 6 次、每小時 40 次（想切角與寫成稿合計）；全站每日 DAILY_CAP 次。 */
export function checkInspireRate(ip: string, now = Date.now()): void {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; hitsByIp.clear(); }
  if (dayCount >= DAILY_CAP) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "今天的示範名額用完了，明天再來試試。" });
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.filter((t) => now - t < 60_000).length >= 6) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "按太快了，等一下再試。" });
  if (hits.length >= 40) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時用太多次了，晚點再來。" });
  hits.push(now);
  hitsByIp.set(ip, hits);
  dayCount++;
}
export function resetInspireRateForTest(): void { hitsByIp.clear(); day = ""; dayCount = 0; }

// ─── 進度 ──────────────────────────────────────────────────────────────

interface IdeateJob { keys: string[]; ideas: InspireIdea[]; done: boolean; failed: string[]; createdAt: number }

export type ReviewStatus = "pending" | "checking" | "pass" | "issue" | "skipped";
export type WriteStage = "writing" | "reviewing" | "fixing" | "done" | "failed";
/** compliant：全部通過；fixed：有問題、已修正；flagged：有問題、修不掉，請醫師自己改；partial：有幾組沒審到。 */
export type WriteVerdict = "compliant" | "fixed" | "flagged" | "partial";

interface WriteJob {
  stage: WriteStage;
  text: string;
  /** 修正前的原稿（只有 fixed 時有）。 */
  before: string;
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

type IdeateArgs = Omit<Parameters<typeof inspireIdeationPrompt>[0], "personas"> & { keys: string[] };

async function runIdeate(job: IdeateJob, args: IdeateArgs): Promise<void> {
  const round = async (keys: string[], avoid: string[]) => {
    try {
      const raw = await ask(inspireIdeationPrompt({ ...args, personas: keys.map((k) => personaOf(k)!), avoid }), "請開始想。", WRITE_MODEL);
      return parseIdeas(raw, { keys, perPersona: args.count });
    } catch (e) {
      console.warn("[inspire] ideate failed:", (e as Error)?.message?.slice(0, 160));
      return [];
    }
  };
  try {
    job.ideas = await round(job.keys, args.avoid ?? []);
    // 模型漏掉的風格：只替它們再問一次（帶著已經有的切角，免得撞）。
    const missing = job.keys.filter((k) => !job.ideas.some((a) => a.persona === k));
    if (missing.length && job.ideas.length) {
      const more = await round(missing, [...(args.avoid ?? []), ...job.ideas.map((a) => a.title)]);
      job.ideas = [...job.ideas, ...more].sort((x, y) => job.keys.indexOf(x.persona) - job.keys.indexOf(y.persona));
    }
  } finally {
    job.failed = job.keys.filter((k) => !job.ideas.some((a) => a.persona === k));
    job.done = true;
  }
}

/** 依序審每一組條文；回傳所有問題。某一組呼叫失敗就標 skipped。 */
async function reviewAll(job: WriteJob, text: string): Promise<ReviewIssue[]> {
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
  return all;
}

async function runWrite(job: WriteJob, args: Parameters<typeof inspireWritePrompt>[0]): Promise<void> {
  try {
    job.text = finalizeDraft(await ask(inspireWritePrompt(args), "請開始寫。", WRITE_MODEL));
    job.stage = "reviewing";
    job.issues = await reviewAll(job, job.text);
    const skipped = () => job.review.some((r) => r.status === "skipped");
    if (!job.issues.length) {
      job.verdict = skipped() ? "partial" : "compliant";
      return;
    }
    job.stage = "fixing";
    const withLaw = job.issues.map((i) => {
      const r = ALL_REVIEW_ITEMS.find((x) => x.id === i.regulationId);
      return { ...i, law: r ? `${r.law} ${r.article}` : i.regulationId };
    });
    let revised = "";
    try { revised = finalizeDraft(await ask(fixPrompt(withLaw), `# 原稿\n${job.text}`, WRITE_MODEL)); } catch { revised = ""; }
    if (!revised || rejectFix(job.text, revised, job.issues)) {
      job.verdict = "flagged";
      return;
    }
    job.before = job.text;
    job.text = revised;
    job.verdict = skipped() ? "partial" : "fixed";
  } catch (e) {
    console.warn("[inspire] write failed:", (e as Error)?.message?.slice(0, 160));
    job.stage = "failed";
    return;
  } finally {
    if (job.stage !== "failed") job.stage = "done";
  }
}

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
    // 只給卡面上的東西；風格的提示詞與參考來源不出 server。
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
      /** 每個風格想幾個：一般 1 個；「再想幾個」3 個。 */
      count: z.number().int().min(1).max(3).default(1),
      avoid: z.array(z.string().max(60)).max(30).default([]),
      direction: z.string().trim().max(80).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { doctor, topic } = subjectOf(input);
      checkInspireRate(ctx.ip || "unknown");
      const keys = Array.from(new Set(input.personas));
      sweep();
      const jobId = randomUUID();
      const job: IdeateJob = { keys, ideas: [], done: false, failed: [], createdAt: Date.now() };
      ideateJobs.set(jobId, job);
      void runIdeate(job, { doctor, topic, keys, count: input.count, avoid: input.avoid, direction: input.direction || undefined });
      return { jobId };
    }),

  ideatePoll: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }) => {
      const job = ideateJobs.get(input.jobId);
      // 找不到＝伺服器重啟或過期。
      if (!job) return { ideas: [] as InspireIdea[], done: true, failed: [] as string[], lost: true };
      return { ideas: job.ideas, done: job.done, failed: job.failed, lost: false };
    }),

  writeStart: publicProcedure
    .input(subjectZ.extend({
      persona: personaZ,
      title: z.string().trim().min(2).max(60),
      hook: z.string().trim().min(2).max(120),
      answer: z.string().trim().max(80).default(""),
      why: z.string().trim().max(160).default(""),
    }))
    .mutation(({ ctx, input }) => {
      const { doctor, topic } = subjectOf(input);
      checkInspireRate(ctx.ip || "unknown");
      sweep();
      const jobId = randomUUID();
      const job: WriteJob = {
        stage: "writing", text: "", before: "", issues: [], verdict: null, createdAt: Date.now(),
        review: REGULATION_GROUPS.map((g) => ({ group: g.id, status: "pending" as ReviewStatus })),
      };
      writeJobs.set(jobId, job);
      void runWrite(job, {
        doctor, topic, persona: personaOf(input.persona)!,
        idea: { title: input.title, hook: input.hook, answer: input.answer, why: input.why },
      });
      return { jobId };
    }),

  writePoll: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(({ input }) => {
      const job = writeJobs.get(input.jobId);
      if (!job) return { stage: "failed" as WriteStage, text: "", before: "", review: [], issues: [] as ReviewIssue[], verdict: null as WriteVerdict | null, lost: true };
      return {
        // 成稿審完才交出去：審查中先不顯示可能違規的文字。
        stage: job.stage, text: job.stage === "done" ? job.text : "", before: job.stage === "done" ? job.before : "",
        review: job.review, issues: job.stage === "done" ? job.issues : [], verdict: job.verdict, lost: false,
      };
    }),
});
