/**
 * brandVoiceRouter — 建品牌時丟參考文章，學成這個品牌自己的寫法。
 *
 * 2026-10-07（CJ「我要在流程中，增加這件事情」）。設計與取捨在 core/catalog/brandVoice.ts。
 *
 * 四步對到的 procedure：
 *   1 丟文章 → 自動分類（分錯可拖曳改）   `classify`（只回分類，不寫任何東西）
 *   2 每一類反推寫法、量語氣與常用詞       `start`（一類一張卡，背景跑，有進度）
 *   3 每一類一篇試寫，左右對照原文         背景自動接著寫；`status` 輪詢
 *   4 像／不像＋哪裡不像，修到像為止       `feedback`（不像→照說的修 SKILL→自動重寫）
 *     確認 → 上架成任務卡、語氣寫進品牌大腦  `finish`
 *   換題目重寫／失敗重試                   `retry`
 *
 * 每一類就是一張 origin: "voice" 的自建任務卡，反推／試寫／上架全沿用
 * brandTaskCardRouter 的同一份程式。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { assertCanAct } from "../../platform/core/billing/planGate";
import { invokeLLM } from "../../platform/core/llm/llm";
import localPool from "../../localDb";
import { invalidateBrandPrefix } from "../../strategy/core/brand/brandContext";
import {
  type BrandTaskCard,
  listBrandTaskCards, getBrandTaskCard, mutateBrandTaskCards, withBrandLock, writePositioningKey,
  measureSamples, cardTemplate, cardConfig, factLeaks, redactFactLeaks, illustrationInFlight,
  MAX_CARDS_PER_BRAND, MAX_SAMPLE_CHARS,
} from "../core/catalog/brandTaskCards";
import {
  type VoiceCategoryId, type VoiceProfile, type VoiceState,
  VOICE_CATEGORIES, VOICE_CATEGORY_IDS, VOICE_MAX_ARTICLES, VOICE_MAX_PER_CATEGORY,
  VOICE_MIN_ARTICLE_CHARS, VOICE_MIN_PER_CATEGORY,
  voiceCategory, voiceCardId, renderForClassify, parseClassification, parseVoiceProfile,
  pickTrialTopic, buildVoiceBlock, mergeVoiceText, classifyPrompt, profilePrompt, revisePrompt, dropNearDuplicates,
} from "../core/catalog/brandVoice";
import { distilSkill, drawCardIllustration } from "./brandTaskCardRouter";

/** 內建的貼文通路。學寫法的卡先掛在其中一個通路，之後可以在「我的任務卡」複製到別的通路。 */
const VOICE_CHANNELS = ["facebook", "instagram", "threads", "line", "email", "website"] as const;

const TOTAL_STEPS = 4;   // 1 收下文章 / 2 反推寫法 / 3 試寫 / 4 等你看
/** 背景工作超過這麼久沒有更新，就當它斷了（伺服器重啟會讓背景工作消失）。 */
const STALE_MS = 6 * 60_000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), ms))]);

const contentOf = (r: any): string => {
  const raw = r?.choices?.[0]?.message?.content;
  return (typeof raw === "string" ? raw : "").trim();
};

// ─────────────────────────────────────────────────────────────────────
// 1 自動分類
// ─────────────────────────────────────────────────────────────────────
async function classifyArticles(articles: string[]): Promise<(VoiceCategoryId | null)[]> {
  const sys = classifyPrompt();
  const r = await withTimeout(invokeLLM({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: renderForClassify(articles) },
    ],
    maxTokens: 1200,
  }), 60_000);
  return parseClassification(contentOf(r), articles.length);
}

// ─────────────────────────────────────────────────────────────────────
// 2 語氣／結構／常用詞
// ─────────────────────────────────────────────────────────────────────
async function profileSamples(categoryZh: string, samples: string[]): Promise<VoiceProfile | null> {
  const sys = profilePrompt(categoryZh, samples.length);
  try {
    const r = await withTimeout(invokeLLM({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: samples.map((s, i) => `【第 ${i + 1} 篇】\n${s.trim()}`).join("\n\n").slice(0, 40_000) },
      ],
      maxTokens: 900,
    }), 60_000);
    return parseVoiceProfile(contentOf(r), samples);
  } catch (err) {
    // 語氣與常用詞是加分項：量不出來不該讓整張卡失敗，卡片的寫法（SKILL）還是在。
    console.warn(`[brandVoice] profile 失敗（${categoryZh}）：`, String((err as any)?.message ?? err).slice(0, 200));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 3 試寫
// ─────────────────────────────────────────────────────────────────────
/** 跟 brandTaskCard.dryRun 同一條路：不寫 mission_outputs、不扣點、只產一個版本。 */
async function trialWrite(card: BrandTaskCard, topic: string): Promise<string> {
  const { runOrchestra } = await import("../core/engine/quickTaskOrchestra");
  const config = { ...cardConfig(card), variants: 1, variantLabels: ["試寫"] };
  const result: any = await runOrchestra({
    template: cardTemplate(card),
    config: config as any,
    inputs: { topic },
    brandId: card.brandId,
    // userId 刻意不傳 —— 傳了就會 recordTaskRun，/projects 會塞滿半成品。
  });
  const caption = String(result?.variants?.[0]?.caption ?? "").trim();
  if (!caption) throw new Error("試寫回了空白");
  return caption;
}

async function trialTopicFor(brandId: number, category: VoiceCategoryId): Promise<string> {
  const cat = voiceCategory(category)!;
  let brandName = "";
  let products: string[] = [];
  try {
    const [b]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [brandId]);
    brandName = String((b as any[])[0]?.name ?? "");
    const [p]: any = await localPool.execute(`SELECT name FROM products WHERE brandId = ? ORDER BY id LIMIT 12`, [brandId]);
    products = (p as any[]).map((r) => String(r?.name ?? "")).filter(Boolean);
  } catch { /* 讀不到就用通用題目 */ }
  return pickTrialTopic(cat, brandName, products, VOICE_CATEGORY_IDS.indexOf(category));
}

// ─────────────────────────────────────────────────────────────────────
// 4 不像 → 照使用者說的修
// ─────────────────────────────────────────────────────────────────────
async function reviseSkill(card: BrandTaskCard, trial: string, notes: string[]): Promise<string> {
  const sys = revisePrompt(card.measured);
  const user = [
    `【目前的 SKILL】\n${card.skill}`,
    `【照它試寫的結果】\n${trial}`,
    `【使用者說哪裡不像】\n${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
    `【原文】\n${card.samples.map((s, i) => `（第 ${i + 1} 篇）\n${s.trim()}`).join("\n\n")}`,
  ].join("\n\n").slice(0, 60_000);

  const r = await withTimeout(invokeLLM({
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    maxTokens: 4000,
  }), 120_000);
  let skill = contentOf(r);
  if (skill.length < 200) throw new Error(`修出來的 SKILL 太短（${skill.length} 字），可以再試一次`);
  const own = [card.measured.count, card.measured.minChars, card.measured.maxChars, card.measured.medianChars];
  const leaks = factLeaks(skill, card.samples, own);
  if (leaks.length > 0) skill = redactFactLeaks(skill, leaks);
  return skill;
}

// ─────────────────────────────────────────────────────────────────────
// 背景工作
// ─────────────────────────────────────────────────────────────────────
function patchCard(brandId: number, userId: number, cardId: string, fn: (c: BrandTaskCard) => BrandTaskCard) {
  return mutateBrandTaskCards(brandId, userId, (cards) =>
    cards.map((c) => (c.id === cardId ? { ...fn(c), updatedAt: new Date().toISOString() } : c)));
}

const setVoice = (c: BrandTaskCard, v: Partial<VoiceState>): BrandTaskCard =>
  (c.voice ? { ...c, voice: { ...c.voice, ...v } } : c);

async function failCard(brandId: number, userId: number, cardId: string, err: unknown): Promise<void> {
  const msg = String((err as any)?.message ?? err).slice(0, 300);
  console.error(`[brandVoice] ${cardId} 失敗：`, msg);
  await patchCard(brandId, userId, cardId, (c) => setVoice({ ...c, lastError: msg }, { phase: "failed" })).catch(() => {});
}

/** 寫一篇試寫並停在「等你看」。 */
async function runTrial(brandId: number, userId: number, cardId: string): Promise<void> {
  try {
    const card = await getBrandTaskCard(brandId, cardId);
    if (!card?.voice || !card.skill) return;
    await patchCard(brandId, userId, cardId, (c) => setVoice({ ...c, currentStep: 3, lastError: null }, { phase: "writing" }));
    let caption = await trialWrite(card, card.voice.topic);
    // 字數區間在生文那一層只是提示詞裡的一句話，沒有驗收。試寫要拿來跟原文左右對照，
    // 長度差一截第一眼就「不像」，所以超出區間就帶著實際字數再寫一次，取比較靠近區間的那篇。
    const { minChars, maxChars } = card.measured;
    const off = (t: string) => (t.length < minChars ? minChars - t.length : t.length > maxChars ? t.length - maxChars : 0);
    if (off(caption) > 0) {
      const hint = `${card.voice.topic}

（篇幅要求：全文 ${minChars}–${maxChars} 字。上一版寫了 ${caption.length} 字，${caption.length > maxChars ? "太長" : "太短"}，請照這個篇幅重寫。）`;
      const second = await trialWrite(card, hint).catch(() => "");
      if (second && off(second) < off(caption)) caption = second;
    }
    const at = new Date().toISOString();
    await patchCard(brandId, userId, cardId, (c) =>
      setVoice({ ...c, currentStep: TOTAL_STEPS, lastDryRun: { at, caption } }, { phase: "review", verdict: null }));
  } catch (err) {
    await failCard(brandId, userId, cardId, err);
  }
}

/** 反推寫法＋量語氣常用詞（平行），接著試寫。 */
async function runLearn(brandId: number, userId: number, cardId: string): Promise<void> {
  try {
    const card = await getBrandTaskCard(brandId, cardId);
    if (!card?.voice) return;
    const cat = voiceCategory(card.voice.category);
    if (!cat) return;
    await patchCard(brandId, userId, cardId, (c) => setVoice({ ...c, currentStep: 2, lastError: null }, { phase: "learning" }));
    const [skill, profile] = await Promise.all([
      distilSkill({
        brandId, name: card.name, channel: card.channel, samples: card.samples,
        primaryQuestion: card.primaryQuestion, askFields: card.askFields, measured: card.measured,
        listing: null,
      }),
      profileSamples(cat.zh, card.samples),
    ]);
    await patchCard(brandId, userId, cardId, (c) => setVoice({ ...c, skill }, { profile }));
  } catch (err) {
    await failCard(brandId, userId, cardId, err);
    return;
  }
  await runTrial(brandId, userId, cardId);
}

/** 照使用者說的修 SKILL，修完自動再寫一篇。 */
async function runRevise(brandId: number, userId: number, cardId: string): Promise<void> {
  try {
    const card = await getBrandTaskCard(brandId, cardId);
    if (!card?.voice || !card.skill) return;
    const skill = await reviseSkill(card, card.lastDryRun?.caption ?? "", card.voice.notes);
    await patchCard(brandId, userId, cardId, (c) => ({ ...c, skill }));
  } catch (err) {
    await failCard(brandId, userId, cardId, err);
    return;
  }
  await runTrial(brandId, userId, cardId);
}

/** 一次最多同時學幾類。五類全開會讓每一類都變慢，也容易撞 LLM 供應商的速率限制。 */
const LEARN_CONCURRENCY = 3;
async function runAll(brandId: number, userId: number, cardIds: string[]): Promise<void> {
  const queue = [...cardIds];
  await Promise.all(Array.from({ length: Math.min(LEARN_CONCURRENCY, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) await runLearn(brandId, userId, id);
  }));
}

// ─────────────────────────────────────────────────────────────────────
// 給前端看的樣子
// ─────────────────────────────────────────────────────────────────────
function viewOf(card: BrandTaskCard, now = Date.now()) {
  const v = card.voice!;
  const working = v.phase === "learning" || v.phase === "writing" || v.phase === "revising";
  const stale = working && now - Date.parse(card.updatedAt) > STALE_MS;
  return {
    cardId: card.id,
    category: v.category,
    name: card.name,
    channel: card.channel,
    published: card.status === "ready",
    phase: stale ? "failed" as const : v.phase,
    error: stale ? "處理到一半中斷了，按重試再跑一次。" : card.lastError,
    currentStep: card.currentStep,
    totalSteps: TOTAL_STEPS,
    samples: card.samples,
    measured: card.measured,
    profile: v.profile,
    topic: v.topic,
    trial: card.lastDryRun?.caption ?? null,
    trialInRange: card.lastDryRun
      ? card.lastDryRun.caption.length >= card.measured.minChars && card.lastDryRun.caption.length <= card.measured.maxChars
      : null,
    verdict: v.verdict,
    rounds: v.rounds,
  };
}

const voiceCards = (cards: BrandTaskCard[]) =>
  cards
    .filter((c) => c.origin === "voice" && c.voice)
    .sort((a, b) => VOICE_CATEGORY_IDS.indexOf(a.voice!.category) - VOICE_CATEGORY_IDS.indexOf(b.voice!.category));

async function mustVoiceCard(brandId: number, cardId: string): Promise<BrandTaskCard> {
  const card = await getBrandTaskCard(brandId, cardId);
  if (!card || card.origin !== "voice" || !card.voice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一類的寫法" });
  }
  return card;
}

const isBusy = (card: BrandTaskCard) => viewOf(card).phase !== "review" && viewOf(card).phase !== "failed";

export const brandVoiceRouter = router({
  /** 類別清單（前端畫分類欄用，跟 server 同一份）。 */
  categories: protectedProcedure.query(() =>
    VOICE_CATEGORIES.map((c) => ({ id: c.id, zh: c.zh, en: c.en })),
  ),

  /**
   * 文章 → 每一篇屬於哪一類。不寫任何東西進資料庫。
   * 模型沒回應時不丟錯：回全部「未分類」，使用者照樣可以自己拖——自動分類是省事，不是關卡。
   */
  classify: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      articles: z.array(z.string().min(VOICE_MIN_ARTICLE_CHARS).max(MAX_SAMPLE_CHARS)).min(1).max(VOICE_MAX_ARTICLES),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      try {
        return { assignments: await classifyArticles(input.articles), failed: false };
      } catch (err) {
        console.warn("[brandVoice] classify 失敗：", String((err as any)?.message ?? err).slice(0, 200));
        return { assignments: input.articles.map(() => null as VoiceCategoryId | null), failed: true };
      }
    }),

  /**
   * 開始學。每一類（至少兩篇）一張卡，背景反推寫法 → 試寫。
   * 同一類重跑是覆蓋那張卡（id 固定），不會越長越多。
   */
  start: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      channel: z.enum(VOICE_CHANNELS).default("facebook"),
      groups: z.array(z.object({
        category: z.enum(VOICE_CATEGORY_IDS as [VoiceCategoryId, ...VoiceCategoryId[]]),
        samples: z.array(z.string().min(VOICE_MIN_ARTICLE_CHARS).max(MAX_SAMPLE_CHARS))
          .min(VOICE_MIN_PER_CATEGORY).max(VOICE_MAX_PER_CATEGORY),
      })).min(1).max(VOICE_CATEGORIES.length),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);

      // 同一類送了兩次就合併成一張。
      const byCat = new Map<VoiceCategoryId, string[]>();
      for (const g of input.groups) {
        const list = byCat.get(g.category) ?? [];
        for (const s of g.samples) { const t = s.trim(); if (t && !list.includes(t)) list.push(t); }
        byCat.set(g.category, list.slice(0, VOICE_MAX_PER_CATEGORY));
      }
      // 同一篇的不同版本只算一篇；去掉之後不到兩篇的類別就不學（一篇量不出共同點）。
      for (const [cat, list] of [...byCat]) {
        const distinct = dropNearDuplicates(list);
        if (distinct.length >= VOICE_MIN_PER_CATEGORY) byCat.set(cat, distinct);
        else byCat.delete(cat);
      }
      if (byCat.size === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "這些文章的內容幾乎一樣（像是同一篇的不同版本）。每一類請放至少兩篇不同的文章。",
        });
      }

      const topics = new Map<VoiceCategoryId, string>();
      for (const cat of byCat.keys()) topics.set(cat, await trialTopicFor(input.brandId, cat));

      const now = new Date().toISOString();
      const ids: string[] = [];
      await mutateBrandTaskCards(input.brandId, userId, (cards) => {
        const next = [...cards];
        for (const [category, samples] of byCat) {
          const cat = voiceCategory(category)!;
          const id = voiceCardId(input.brandId, category);
          const prev = next.find((c) => c.id === id);
          if (!prev && next.length >= MAX_CARDS_PER_BRAND) continue;   // 技術上限（JSON 欄位大小），不是方案額度
          const card: BrandTaskCard = {
            id, brandId: input.brandId,
            name: prev?.name ?? cat.zh,
            channel: (prev?.channel ?? input.channel) as BrandTaskCard["channel"],
            // 重學期間先下架：SKILL 正在換，這時讓人執行會拿到半新半舊的東西。
            status: "drafting", currentStep: 1, totalSteps: TOTAL_STEPS, lastError: null,
            samples,
            primaryQuestion: cat.question,
            primaryPlaceholder: cat.placeholder,
            askFields: prev?.askFields ?? [],
            skill: "",
            measured: measureSamples(samples),
            variants: prev?.variants ?? 1,
            agentId: prev?.agentId ?? null,
            scene: prev?.scene ?? null,
            illustrationUrl: prev?.illustrationUrl ?? null,
            illustrationStatus: prev?.illustrationStatus === "ready" ? "ready" : null,
            createdAt: prev?.createdAt ?? now, updatedAt: now, createdBy: prev?.createdBy ?? userId,
            lastDryRun: null,
            origin: "voice",
            voice: { category, phase: "learning", profile: null, topic: topics.get(category)!, verdict: null, rounds: 0, notes: [] },
          };
          const i = next.findIndex((c) => c.id === id);
          if (i >= 0) next[i] = card; else next.push(card);
          ids.push(id);
        }
        return next;
      });
      if (ids.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這個品牌的任務卡已經到上限，請先刪掉用不到的卡。" });
      }

      // 背景跑。故意不 await —— 前端要立刻拿到卡片清單開始畫進度。
      void runAll(input.brandId, userId, ids);
      return { cardIds: ids };
    }),

  /** 目前每一類學到哪。前端在有東西還在跑時輪詢這支。 */
  status: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return voiceCards(await listBrandTaskCards(input.brandId)).map((c) => viewOf(c));
    }),

  /**
   * 像／不像。
   * 像：記下來，等 `finish` 一起上架。
   * 不像：一定要說哪裡不像（沒有這句話模型只能亂猜），照說的修 SKILL，修完自動重寫一篇。
   */
  feedback: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      cardId: z.string(),
      verdict: z.enum(["like", "unlike"]),
      note: z.string().trim().max(600).default(""),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const card = await mustVoiceCard(input.brandId, input.cardId);
      if (isBusy(card)) throw new TRPCError({ code: "BAD_REQUEST", message: "這一類還在處理中，等它寫完再回覆。" });
      if (!card.lastDryRun) throw new TRPCError({ code: "BAD_REQUEST", message: "這一類還沒有試寫可以評。" });

      if (input.verdict === "like") {
        await patchCard(input.brandId, userId, input.cardId, (c) => setVoice(c, { verdict: "like" }));
        return { ok: true, revising: false };
      }
      if (input.note.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "說一下哪裡不像（例如：太正式、開頭不會這樣寫、我們不用驚嘆號）。" });
      }
      await patchCard(input.brandId, userId, input.cardId, (c) => setVoice({ ...c, lastError: null }, {
        phase: "revising", verdict: "unlike",
        rounds: (c.voice?.rounds ?? 0) + 1,
        notes: [...(c.voice?.notes ?? []), input.note].slice(-6),
      }));
      void runRevise(input.brandId, userId, input.cardId);
      return { ok: true, revising: true };
    }),

  /** 換個題目重寫一篇，或在失敗後重試（SKILL 還沒生出來就從反推重跑）。 */
  retry: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      cardId: z.string(),
      topic: z.string().trim().min(2).max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const card = await mustVoiceCard(input.brandId, input.cardId);
      if (isBusy(card)) return { ok: true, alreadyRunning: true };
      const fromScratch = !card.skill;
      await patchCard(input.brandId, userId, input.cardId, (c) => setVoice({ ...c, lastError: null }, {
        phase: fromScratch ? "learning" : "writing",
        verdict: null,
        ...(input.topic ? { topic: input.topic } : {}),
      }));
      void (fromScratch ? runLearn : runTrial)(input.brandId, userId, input.cardId);
      return { ok: true, alreadyRunning: false };
    }),

  /**
   * 確認。按了「像」的每一類上架成任務卡，語氣寫進品牌大腦（文字頁「品牌口吻」）。
   * 沒按像的留著不上架，之後可以回來繼續修，或到「我的任務卡」處理。
   */
  finish: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      const liked = voiceCards(await listBrandTaskCards(input.brandId))
        .filter((c) => c.voice!.verdict === "like" && !!c.skill && !isBusy(c));
      if (liked.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "還沒有任何一類按「像」。至少確認一類才能完成。" });
      }
      const likedIds = new Set(liked.map((c) => c.id));

      // 上架；還沒有插畫的補畫一張（跟 brandTaskCard.publish 同一個規則）。
      const needArt = liked.filter((c) => !c.scene && !c.illustrationUrl && !illustrationInFlight(c)).map((c) => c.id);
      const startedAt = new Date().toISOString();
      await mutateBrandTaskCards(input.brandId, userId, (cards) => cards.map((c) => (likedIds.has(c.id)
        ? {
            ...c, status: "ready", lastError: null, updatedAt: startedAt,
            ...(needArt.includes(c.id) ? { illustrationStatus: "generating" as const, illustrationError: null, illustrationStartedAt: startedAt } : {}),
          }
        : c)));
      for (const id of needArt) void drawCardIllustration(input.brandId, userId, id);

      // 語氣寫進品牌大腦。跟卡片寫入排同一個隊，避免跟背景的插畫寫回互蓋。
      const block = buildVoiceBlock(liked.map((c) => ({ category: c.voice!.category, measured: c.measured, profile: c.voice!.profile })));
      let voiceWritten = false;
      if (block) {
        await withBrandLock(input.brandId, async () => {
          const [rows]: any = await localPool.execute(
            `SELECT positioning AS p FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, userId],
          );
          let pos: any = (rows as any[])[0]?.p;
          if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
          pos = pos ?? {};
          const assets = pos._assets && typeof pos._assets === "object" ? pos._assets : {};
          const prevText = typeof assets.voice?.text === "string" ? assets.voice.text : "";
          const nextAssets = { ...assets, voice: { ...(assets.voice ?? {}), text: mergeVoiceText(prevText, block) } };
          await writePositioningKey(input.brandId, userId, pos, "_assets", nextAssets);
        });
        invalidateBrandPrefix(input.brandId);
        voiceWritten = true;
      }

      return {
        published: liked.map((c) => ({ cardId: c.id, category: c.voice!.category, name: c.name, channel: c.channel })),
        voiceWritten,
      };
    }),
});
