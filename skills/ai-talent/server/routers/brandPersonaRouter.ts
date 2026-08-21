/**
 * brandPersonaRouter — 人設 tray 的 CRUD（品牌自訂 agent）。
 *
 * 2026-08-21 (CJ「加一個人設的 task tray，讓她可以自己新創 agent、自己命名，
 * 並且決定這個 agent 語調的應用範圍要在哪些內容的任務」).
 *
 * 寫入方式刻意跟 AIPromptsEditor 的 scope.savePositioning 不同：那條路是
 * client 端 read-modify-write 整包 positioning，快照一舊就會把背景定位 job 剛
 * 寫進去的段落蓋掉。人設是一份會被反覆編輯的清單，所以合併在 server 端做 ——
 * 每次只碰 positioning._personas 這個 key。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { assertBrandAccess } from "../_core/brandAuth";
import { parsePersonas, PERSONA_TEXT_CAP, type BrandPersona } from "../_core/brandPersonas";
import { invokeLLM } from "../_core/llm";
import { buildBrandPrefix } from "../_core/brandContext";
import { getBrandRealContent } from "../_core/brandRealContent";
import localPool from "../localDb";

const MAX_PERSONAS_PER_BRAND = 20;

const personaInput = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  title: z.string().max(120).default(""),
  persona: z.string().max(PERSONA_TEXT_CAP).default(""),
  scope: z.object({
    taskIds: z.array(z.string().max(64)).max(400).default([]),
    platforms: z.array(z.string().max(32)).max(32).default([]),
  }).default({ taskIds: [], platforms: [] }),
  enabled: z.boolean().default(true),
});

/** Read positioning JSON for a brand (parsed, always an object). */
async function readPositioning(brandId: number): Promise<Record<string, any>> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
    [brandId],
  );
  let pos: any = rows?.[0]?.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
  return (pos && typeof pos === "object") ? pos : {};
}

/** Write back only the _personas key; everything else in positioning is untouched. */
async function writePersonas(brandId: number, personas: BrandPersona[]): Promise<void> {
  const pos = await readPositioning(brandId);
  const next = { ...pos, _personas: personas };
  const [r]: any = await localPool.execute(
    `UPDATE brands SET positioning = ? WHERE id = ?`,
    [JSON.stringify(next), brandId],
  );
  if (((r as any)?.affectedRows ?? 0) === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Brand #${brandId} not found` });
  }
}

export const brandPersonaRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const pos = await readPositioning(input.brandId);
      return { personas: parsePersonas(pos) };
    }),

  /** Create or update one persona. Returns the whole list so the UI can rerender. */
  save: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), persona: personaInput }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const pos = await readPositioning(input.brandId);
      const current = parsePersonas(pos);
      const now = new Date().toISOString();
      const existing = current.find((p) => p.id === input.persona.id);
      if (!existing && current.length >= MAX_PERSONAS_PER_BRAND) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `一個品牌最多 ${MAX_PERSONAS_PER_BRAND} 個人設`,
        });
      }
      const next: BrandPersona = {
        id: input.persona.id,
        name: input.persona.name.trim(),
        title: input.persona.title.trim(),
        persona: input.persona.persona,
        scope: {
          // 去重，順便擋掉空字串
          taskIds: Array.from(new Set(input.persona.scope.taskIds.map((s) => s.trim()).filter(Boolean))),
          platforms: Array.from(new Set(input.persona.scope.platforms.map((s) => s.trim()).filter(Boolean))),
        },
        enabled: input.persona.enabled,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const merged = existing
        ? current.map((p) => (p.id === next.id ? next : p))
        : [...current, next];
      await writePersonas(input.brandId, merged);
      return { ok: true as const, personas: merged };
    }),

  remove: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), personaId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const pos = await readPositioning(input.brandId);
      const merged = parsePersonas(pos).filter((p) => p.id !== input.personaId);
      await writePersonas(input.brandId, merged);
      return { ok: true as const, personas: merged };
    }),

  /**
   * 依品牌定位 + 官網 / 社群實際內容草擬人設本文。
   *
   * 為什麼要有這顆按鈕：要客戶自己寫 300-500 字人設，多數人會寫成兩行形容詞
   * （「親切、專業」），那種 prompt 對輸出沒有作用。給草稿再讓他改，才是他真的
   * 能維護的東西。名字與職稱一律用使用者填的 —— 那是他要命名的權利，AI 不碰。
   */
  suggest: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      name: z.string().min(1).max(60),
      title: z.string().max(120).optional(),
      /** 使用者對語調的一句話期待，例如「像鄰居媽媽在講故事」 */
      hint: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [brandPrefix, real] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
      ]);
      const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../_core/brandMarket");
      const mkt = await getBrandMarket(input.brandId).catch(() => DEFAULT_BRAND_MARKET);
      const langLine = mkt.isZhTW
        ? "繁體中文"
        : `使用 ${mkt.outputLanguage}（品牌目標市場語言）撰寫`;

      const sys = `你是品牌內容顧問，${langLine}。
任務：為這個品牌寫一份「內容寫手人設」，寫給之後要扮演這個角色的 LLM 看。

固定條件（不可更動）：
- 這位寫手的名字是「${input.name}」${input.title ? `，職稱是「${input.title}」` : ""}。名字與職稱由品牌方指定，請原樣使用，不要改名、不要另取英文名。
${input.hint ? `- 品牌方對語調的期待：「${input.hint}」。人設必須明確體現這件事。` : ""}

內容要求：
- 300-500 字，一段到三段的連續敘述，不要條列、不要標題。
- 必須包含：他是誰與背景、說話的節奏與用字習慣（含 1-2 個標誌性表達）、他怎麼理解這個品牌的受眾、寫作時的堅持與不做的事。
- 人設必須從下方品牌定位自然長出來，不可與定位矛盾；若下方資料已有可驗證的真實習慣（emoji 用量、稱呼、標點慣例），直接沿用，不要自行放寬或改寫。
- 不要寫「我會協助你…」這種助理口吻，直接寫這個人是誰。

只輸出 JSON，第一個字元就是 {：
{"persona":"<人設本文>"}
${brandPrefix}${real.context}`;

      try {
        const r = await Promise.race([
          invokeLLM({
            messages: [
              { role: "system", content: sys },
              { role: "user", content: `寫手：${input.name}${input.title ? `（${input.title}）` : ""}` },
            ],
            maxTokens: 1600,
          }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 40_000)),
        ]);
        const raw = r.choices[0]?.message?.content;
        const text = typeof raw === "string" ? raw : "";
        const inTok = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        try {
          await localPool.execute(
            `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                  VALUES (?, 'brand', ?, 'brand_persona', ?, ?, ?, ?)`,
            [ctx.user!.id, input.brandId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
             (inTok * 1.0 + outTok * 5.0) / 1_000_000],
          );
        } catch {/* non-fatal */}

        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonText = m ? m[1]!.trim() : text.trim();
        let parsed: any = null;
        try { parsed = JSON.parse(jsonText); } catch {
          const start = jsonText.indexOf("{");
          if (start >= 0) { try { parsed = JSON.parse(jsonText.slice(start)); } catch {} }
        }
        const persona = String(parsed?.persona ?? "").trim();
        if (!persona) return { ok: false as const, error: "JSON parse failed" };
        return {
          ok: true as const,
          persona: persona.slice(0, PERSONA_TEXT_CAP),
          hasRealContent: real.hasContent,
        };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message ?? e) };
      }
    }),
});
