/**
 * aeoQuestionRouter — 策略層「AI 搜尋」tray 的 tRPC 介面。邏輯在 core/brand/aeoQuestions.ts。
 *
 *   list          地圖上的題目＋覆蓋率（幾題、幾題已產出、幾題已上架）
 *   suggest       請 AI 依品牌定位建議題目，直接加進地圖（回傳加了哪幾題）
 *   add           自己加一題
 *   archive       拿掉一題（封存，不刪）
 *   setPublished  標記「貼上官網了」／取消
 *
 * 回答是在作品頁「轉成 AI 搜尋版」存檔時連上來的（quickTask.aeoSave），不在這裡。
 * 不走方案閘門：建議題目是偶爾按一次的事，不是每篇產文的成本。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import localPool from "../../localDb";
import {
  AEO_MAX_QUESTIONS, AEO_QUESTION_MAX, addAeoQuestions, archiveAeoQuestion, cleanQuestion, coverageOf,
  getAeoQuestion, listAeoQuestions, parseSuggestedQuestions, setAeoPublished, statusOf, suggestPrompt,
  type AeoQuestion,
} from "../core/brand/aeoQuestions";

async function loadOwned(userId: number, id: number): Promise<AeoQuestion> {
  const q = await getAeoQuestion(id);
  if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一題" });
  await assertBrandAccess(userId, q.brandId);
  return q;
}

const view = (q: AeoQuestion) => ({ ...q, status: statusOf(q) });

export const aeoQuestionRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const rows = await listAeoQuestions(input.brandId);
      return { questions: rows.map(view), coverage: coverageOf(rows), max: AEO_MAX_QUESTIONS };
    }),

  suggest: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const existing = await listAeoQuestions(input.brandId);
      if (existing.length >= AEO_MAX_QUESTIONS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `一個品牌最多 ${AEO_MAX_QUESTIONS} 題。先拿掉用不到的再加。` });
      }
      const [rows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [input.brandId]);
      const brandName = String((rows as any[])[0]?.name ?? "").trim() || "這個品牌";
      const { buildBrandPrefix } = await import("../core/brand/brandContext");
      const brandPrefix = await buildBrandPrefix(input.brandId, null, null, "full").catch(() => "");
      if (brandPrefix.trim().length < 80) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "品牌定位還沒有內容，AI 沒有依據可以建議問題。先填好品牌定位，或自己加題目。" });
      }
      const { callModel } = await import("../../platform/core/llm/multiModelRouter");
      const r = await callModel([
        { role: "system", content: `你是熟悉這個品牌與它的顧客的行銷研究員。\n${brandPrefix}${suggestPrompt({ brandName, existing: existing.map((q) => q.question) })}` },
        { role: "user", content: "請開始。" },
      ], undefined, "anthropic");
      const questions = parseSuggestedQuestions(r.content ?? "", existing.map((q) => q.question), { brandName });
      if (!questions.length) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "這次沒有產出可用的題目，請再試一次。" });
      }
      const added = await addAeoQuestions(input.brandId, ctx.user!.id, questions, "ai");
      return { added: added.map(view) };
    }),

  add: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), question: z.string().min(2).max(AEO_QUESTION_MAX * 2) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      if (!cleanQuestion(input.question)) throw new TRPCError({ code: "BAD_REQUEST", message: "請寫下一個問題。" });
      const added = await addAeoQuestions(input.brandId, ctx.user!.id, [input.question], "user");
      if (!added.length) {
        const full = (await listAeoQuestions(input.brandId)).length >= AEO_MAX_QUESTIONS;
        throw new TRPCError({ code: "BAD_REQUEST", message: full ? `一個品牌最多 ${AEO_MAX_QUESTIONS} 題。` : "這一題已經在清單上了。" });
      }
      return view(added[0]!);
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.user!.id, input.id);
      await archiveAeoQuestion(input.id);
      return { ok: true as const };
    }),

  setPublished: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), published: z.boolean(), url: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const q = await loadOwned(ctx.user!.id, input.id);
      if (input.published && !q.answerOutputId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這一題還沒有回答，不能標記上架。" });
      }
      await setAeoPublished(input.id, input.published, input.url);
      const next = await getAeoQuestion(input.id);
      return next ? view(next) : null;
    }),
});
