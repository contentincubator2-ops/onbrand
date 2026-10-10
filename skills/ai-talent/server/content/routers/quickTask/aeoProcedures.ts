/**
 * 轉成 AI 搜尋版：作品頁上，把一篇社群貼文轉成官網問答或 YouTube 標題＋說明欄。
 * 規則、解析、驗證在 core/engine/aeoContract.ts；這裡只負責接品牌資料、叫模型、存檔。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../platform/core/trpc";
import localPool from "../../../localDb";
import { assertBrandAccess } from "../../../platform/core/brandAuth";
import { openAeoQuestions, recordAeoAnswer } from "../../../strategy/core/brand/aeoQuestions";
import {
  AEO_TARGETS, AEO_TARGET_TASK, aeoContractBlock, aeoPlainText, aeoRetryRequest, faqHtmlSnippet,
  parseAeoReply, repairAeo, serializeAeo, validateAeo, type AeoFields, type AeoTarget,
} from "../../core/engine/aeoContract";

const fieldsInput = z.object({
  question: z.string().max(300).optional(),
  answer: z.string().max(1000).optional(),
  body: z.string().max(6000).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(6000).optional(),
});

async function brandNameOf(brandId: number): Promise<string | null> {
  const [rows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const name = (rows as any[])[0]?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export const aeoProcedures = {
  /** 產出 AI 搜尋版（不存檔；用戶看過、改過再存）。 */
  aeoVersion: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      productId: z.number().optional(),
      eventId: z.number().optional(),
      target: z.enum(AEO_TARGETS),
      caption: z.string().min(10).max(20000),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const { callModel } = await import("../../../platform/core/llm/multiModelRouter");
      const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
      const target: AeoTarget = input.target;
      const brandName = await brandNameOf(input.brandId).catch(() => null);
      // 讀目標通路（官網／YouTube）的通路角色，不是原貼文那個通路的。
      const { roleChannelOfTaskId } = await import("../../../strategy/core/brand/channelRoles");
      const brandPrefix = await buildBrandPrefix(
        input.brandId, input.productId ?? null, input.eventId ?? null, "full",
        roleChannelOfTaskId(AEO_TARGET_TASK[target].taskId),
      ).catch(() => "");

      // 2026-10-10：問題地圖上還沒回答的題目。這篇能回答其中一題就用那一題，覆蓋率才算得準。
      const candidates = target === "web-qa" ? await openAeoQuestions(input.brandId) : [];
      const matchOf = (p: { matchIndex: number }) => candidates[p.matchIndex - 1] ?? null;

      const system =
        `你是替品牌整理官方內容的編輯。手上有一篇已經寫好的社群貼文，要把同一件事改成 AI 搜尋引擎讀得到、可以單獨引用的版本。\n` +
        brandPrefix +
        // 合約接在最後：最後讀到的最有力。
        aeoContractBlock(target, { brandName, candidates: candidates.map((c) => c.question) });
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: system },
        { role: "user", content: `這是原稿：\n\n${input.caption}` },
      ];

      // 數字只認原稿裡有的（品牌名本身可能帶數字）。品牌資料不算：合約不准拿它補原稿沒提到的事實。
      const checkOpts = { brandName, sources: [input.caption, brandName ?? ""] };

      try {
        const r = await callModel(messages, undefined, "anthropic");
        let parsed = parseAeoReply(target, r.content ?? "");
        if (parsed.noConvert) {
          return { ok: true as const, noConvert: true as const, reason: parsed.reason, target, fields: {} as AeoFields, problems: [] as string[], html: null, regulationCompliance: null, matchedQuestionId: null };
        }
        // 對到地圖上的題目就用地圖上那一句（模型可能改了一兩個字）。
        const withMatch = (p: typeof parsed): AeoFields => {
          const f = repairAeo(target, p.fields);
          const m = matchOf(p);
          return m ? { ...f, question: m.question } : f;
        };
        let fields = withMatch(parsed);
        let problems = validateAeo(target, fields, checkOpts);
        // 驗證重試一次：帶著沒達標的地方請它修。還是沒過就照給，問題列給用戶看，不硬擋。
        if (problems.length) {
          const retry = await callModel([
            ...messages,
            { role: "assistant", content: r.content ?? "" },
            { role: "user", content: aeoRetryRequest(problems) },
          ], undefined, "anthropic").catch(() => null);
          const second = retry ? parseAeoReply(target, retry.content ?? "") : null;
          if (second && !second.noConvert) {
            const f2 = withMatch(second);
            const p2 = validateAeo(target, f2, checkOpts);
            if (p2.length < problems.length) { fields = f2; problems = p2; parsed = second; }
          }
        }
        // 禁用詞／法規：整份帶標記送檢，檢完再解析回欄位；解析不回來就保留檢查前的欄位。
        let regulationCompliance: import("../../core/engine/regulationCompliance").RegulationComplianceRecord | null = null;
        try {
          const { enforceBrandAndRegulations } = await import("../../core/engine/regulationCompliance");
          const checked = await enforceBrandAndRegulations(input.brandId, serializeAeo(target, fields));
          regulationCompliance = checked.record;
          const back = repairAeo(target, parseAeoReply(target, checked.text).fields);
          if (!validateAeo(target, back, checkOpts).some((p) => p.startsWith("缺"))) {
            fields = back;
            problems = validateAeo(target, fields, checkOpts);
          }
        } catch { /* fail-safe */ }
        return {
          ok: true as const, noConvert: false as const, reason: "", target, fields, problems,
          html: target === "web-qa" ? faqHtmlSnippet(fields) : null,
          regulationCompliance,
          matchedQuestionId: matchOf(parsed)?.id ?? null,
        };
      } catch (e: any) {
        return { ok: false as const, noConvert: false as const, reason: "", target, fields: {} as AeoFields, problems: [] as string[], html: null, regulationCompliance: null, matchedQuestionId: null, error: e?.message ?? String(e) };
      }
    }),

  /** 用戶改過欄位後，重新組官網那段 HTML（含結構化資料）。純計算，不叫模型。 */
  aeoHtml: protectedProcedure
    .input(z.object({ fields: fieldsInput }))
    .query(({ input }) => ({ html: faqHtmlSnippet(input.fields) })),

  /**
   * 存成一篇產出，掛在官網／YouTube 底下，之後在專案頁找得到。
   * 官網問答另外記到問題地圖上（brand_aeo_questions）：對得上的題目連過去，對不上就補一題。
   */
  aeoSave: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      target: z.enum(AEO_TARGETS),
      fields: fieldsInput,
      fromOutputId: z.number().int().positive().optional(),
      /** 這則官網問答回答的是問題地圖上的哪一題（aeoVersion 回傳的 matchedQuestionId）。 */
      questionId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const target: AeoTarget = input.target;
      const fields = repairAeo(target, input.fields);
      if (validateAeo(target, fields).some((p) => p.startsWith("缺"))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "內容還沒填完，不能存。" });
      }
      // 來源那篇必須是自己的；不是就當沒帶，不把別人的產出編號寫進 metadata。
      let fromOutputId: number | null = null;
      if (input.fromOutputId) {
        const [rows]: any = await localPool.execute(
          `SELECT o.id FROM mission_outputs o JOIN missions m ON m.id = o.missionId
           WHERE o.id = ? AND m.userId = ? LIMIT 1`,
          [input.fromOutputId, ctx.user!.id],
        );
        if ((rows as any[])[0]) fromOutputId = input.fromOutputId;
      }
      const spec = AEO_TARGET_TASK[target];
      const text = aeoPlainText(target, fields);
      const headline = (target === "web-qa" ? fields.question : fields.title) ?? spec.labelZh;
      const { recordTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
      const rec = await recordTaskRun({
        userId: ctx.user!.id, brandId: input.brandId,
        workspace: spec.workspace, taskId: spec.taskId, taskLabel: `${spec.labelZh}（AI 搜尋版）`, tier: "30s",
        title: headline.slice(0, 60),
        content: JSON.stringify([{ label: spec.labelZh, caption: text }], null, 2),
        metadata: {
          platform: spec.workspace, source: "aeo-convert", aeoTarget: target,
          aeoQuestion: target === "web-qa" ? fields.question ?? null : null,
          fromOutputId,
        },
      });
      if (!rec.outputId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "沒有存成功，請再試一次。" });
      // 記到問題地圖上（策略層「AI 搜尋」）。地圖寫不進去不影響存檔——那篇產出已經在專案裡了。
      let questionId: number | null = null;
      if (target === "web-qa" && fields.question) {
        questionId = await recordAeoAnswer({
          brandId: input.brandId, userId: ctx.user!.id, question: fields.question,
          outputId: rec.outputId, questionId: input.questionId ?? null,
        }).catch((e) => { console.warn(`[aeoSave] question map not updated: ${e?.message ?? e}`); return null; });
      }
      return { outputId: rec.outputId, questionId };
    }),
};
