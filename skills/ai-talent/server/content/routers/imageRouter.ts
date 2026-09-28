/**
 * imageRouter — tRPC surface for Publish Gate image generation.
 *
 * UI flow: user clicks "Generate Image" on a FB/IG content card →
 * we resolve brand visual context from the upstream decision chain →
 * call gpt-image-2 (or Nano Banana when the user picks it) → persist → return URL.
 * A failure comes back as a normal `status: "failed"` result (never a thrown
 * error) so the client can offer "改用 Nano Banana" — see stillImageModels.ts.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";
import { generateImage, resolveBrandVisualContext } from "../core/imageGen";
import { fetchImageBuffer, isLocalUploadPath } from "../core/imageFetch";
import { assertBrandOwner } from "../../platform/core/brandAuth";
import { imageActionForRequest, reconcileImageCharge } from "../../platform/core/imageBilling";
import {
  parseBilingualBriefChoice,
  normalizeImagePromptInput,
} from "../core/bilingualVisualBrief";

// 2026-08-02 (CJ「產圖失敗 invalid_enum_value tiktok」): this enum had
// drifted out of sync with promptFromCaption's below — TikTok (and email)
// shipped as a platform long ago but never got added here, so any TikTok
// image-generate call 400'd on the client's `channel: "tiktok"`. Both
// procedures now share this one list so they can't drift apart again.
const channel = z.enum(["fb", "ig", "linkedin", "youtube", "tiktok", "email", "pr"]);
const size = z.enum(["1024x1024", "1024x1536", "1536x1024"]);
// 2026-09-21 (CJ「只留 NANO BANANA 跟 GPT IMAGE 2 兩個選項」): the picker has two
// choices. The input stays a plain string so a stale browser tab that still
// sends a retired id ("flux-schnell", "gpt-image-1", …) is mapped by
// resolveStillImageModel instead of failing validation.
const modelChoice = z.string().max(40);

/**
 * Human-readable reason for a failed image, in the words a user can act on.
 * Raw provider text is scrubbed of keys and only appended for non-auth errors.
 */
function friendlyImageFailure(kind: string | undefined, rawError: string | undefined): string {
  const raw = String(rawError ?? "unknown")
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/sk-[A-Za-z0-9_\-]{16,}/g, "[REDACTED_KEY]");
  const headline =
    kind === "content_policy" ? "這個 prompt 被 AI 的內容政策擋下了（常見原因：提到版權角色或品牌）。可以改寫 prompt，或改用 Nano Banana 試試。"
    : kind === "quota"        ? "AI 圖片額度暫時不足，已通知 SoWork 團隊。"
    : kind === "auth"         ? "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。"
    : kind === "rate_limit"   ? "AI 圖片服務目前忙碌（速率限制）。已自動重試一次仍未成功，可以稍後再試。"
    : kind === "timeout"      ? "生圖逾時。已自動重試一次仍未成功。"
    : "這次沒有生成成功。已自動重試一次仍未成功。";
  return kind === "auth" || kind === "quota" ? headline : `${headline}\n\n[技術細節] ${raw.slice(0, 300)}`;
}

/**
 * 勾了「使用真實產品圖」時，從文案產生圖片指令用的系統提示。
 *
 * 產品會以實照交給生圖模型，所以指令**只寫場景**，不描述產品本身——描述了，模型就會
 * 照文字重畫一個（2026-09-28 實例：照片是生的美國橫膈牛排，指令寫成「剛起鍋的厚切
 * 牛舌」，產出整盤烤好的另一種肉）。
 *
 * canSeePhoto：照片有一起送給這個 LLM（視覺）時為 true——它就能挑一個配合照片狀態的
 * 場景，並檢查「這篇要的畫面」跟「照片裡的產品狀態」有沒有衝突（例：文案講五分鐘上桌的
 * 晚餐，照片卻是生肉），有就回 conflict，前端提醒使用者上傳合適的照片（CJ：「發現衝突的
 * 時候，應該提醒用戶上傳新的照片」）。照片讀不到時退回 false：不替產品決定生熟、也不回衝突。
 */
export function productScenePromptSystem(productName: string, canSeePhoto = false): string {
  const name = productName.replace(/\s+/g, " ").trim().slice(0, 120);
  const stateRule = canSeePhoto
    ? `- The attached image is the product photo. Choose a setting that fits the product in the state it is photographed (raw, packaged, cooked, served, worn, boxed…) — never a setting that needs it in a different state.`
    : `- You cannot see the photo, so do not decide whether the product is raw, cooked, packaged or served. Choose a setting where it looks natural as-is (e.g. a kitchen counter, a wooden table, a picnic setup).`;
  const conflictRule = canSeePhoto
    ? `
Conflict check: does this post need the product shown in a clearly different state or use than the photo shows (e.g. the post is about a ready-to-eat dinner but the photo shows raw meat; the post shows the garment worn but the photo is a flat lay; the post is about the product in use but the photo is only the box)? Differences in angle, background, lighting or props are NOT conflicts.
If there is a conflict, set "conflict" to {"photoShows":"…","postNeeds":"…","suggestPhoto":"…"} in Traditional Chinese, each 20 characters or fewer; suggestPhoto names the photo the user should upload (e.g. 「煎好擺盤的橫膈牛排」). Otherwise set "conflict" to null. Still write the scene prompt for the current photo either way.`
    : "";
  const shape = canSeePhoto
    ? `{"prompt":"English prompt","promptZh":"繁體中文版","conflict":null}`
    : `{"prompt":"English prompt","promptZh":"繁體中文版"}`;
  return `You are a senior commercial photography art director.
A REAL product photo will be supplied to the image model separately and must appear exactly as photographed. The product is: ${name || "the brand's product"}.
Given a social media caption and brand context, write one concise image-generation prompt (60–120 English words) that describes ONLY the scene the product is placed into, then a natural Traditional Chinese version for a Taiwan user. Both versions must describe exactly the same scene.

Rules:
- Refer to the product only as "the product" / 「產品」. Never describe its appearance: no shape, colour, texture, cut, doneness, cooking state, portion, plating, packaging, label or size.
- Never name or depict any other food or item that could be mistaken for the product or replace it (e.g. no other cuts of meat, no other dishes as the hero).
${stateRule}
- Describe only: the surface it rests on, a few supporting props that do not compete with it, environment, lighting, camera angle/framing, mood.
- Reflect the caption's core message through the setting and mood — no text in frame.
- Use the brand's visual identity (colours, archetype, tone). Do NOT mention competitor brand names.${conflictRule}
- Output JSON only in exactly this shape: ${shape}`;
}

export interface PhotoConflict { photoShows: string; postNeeds: string; suggestPhoto: string }

/** 這張照片是不是這個品牌自己的產品照（上傳的，或產品資料裡的主圖）。 */
async function brandOwnsProductPhoto(brandId: number, url: string): Promise<boolean> {
  const { default: localPool } = await import("../../localDb");
  try {
    const [a]: any = await localPool.execute(
      `SELECT 1 FROM asset_photos WHERE brandId = ? AND scope = 'product' AND url = ? LIMIT 1`, [brandId, url],
    );
    if ((a as any[]).length) return true;
    const [b]: any = await localPool.execute(
      `SELECT 1 FROM products WHERE brandId = ? AND JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.imageUrl')) = ? LIMIT 1`, [brandId, url],
    );
    return (b as any[]).length > 0;
  } catch { return false; }
}

/** 從回覆裡撈 conflict；格式不對、欄位空的一律當沒有衝突（寧可不提醒，也不要提醒錯）。 */
export function parsePhotoConflict(raw: unknown): PhotoConflict | null {
  const text = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(text); } catch {
    const s = text.indexOf("{"); const e = text.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(text.slice(s, e + 1)); } catch { obj = null; } }
  }
  const c = obj?.conflict;
  if (!c || typeof c !== "object") return null;
  const clip = (v: unknown) => String(v ?? "").trim().slice(0, 40);
  const out = { photoShows: clip(c.photoShows), postNeeds: clip(c.postNeeds), suggestPhoto: clip(c.suggestPhoto) };
  return out.photoShows && out.postNeeds && out.suggestPhoto ? out : null;
}

export const imageRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        prompt: z.string().min(1).max(4000),
        channel: channel.optional(),
        decisionId: z.number().int().positive().optional(),
        optionId: z.number().int().positive().optional(),
        upstreamDecisionId: z.number().int().positive().optional(),
        size: size.optional(),
        modelChoice: modelChoice.optional(),
        /** 2026-07-25 (CJ product-faithful gen): real product photo URL —
         *  sent as the reference image (gpt-image-2 edits, or Nano Banana when
         *  picked) with the fidelity guard. */
        subjectImageUrl: z.string().max(2048)
          .refine((v) => /^https?:\/\/\S+$/.test(v) || isLocalUploadPath(v), { message: "subjectImageUrl must be an http(s) URL or an uploaded product photo" })
          .optional(),
        overrideBrandContext: z
          .object({
            positioning: z.string().optional(),
            voiceTone: z.string().optional(),
            archetype: z.string().optional(),
            audience: z.string().optional(),
            colourHints: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const normalizedPrompt = normalizeImagePromptInput(input.prompt);
      if (normalizedPrompt === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "圖片指令包含不完整的 JSON，請重新產生圖片指令後再試。",
        });
      }
      const { modelPrompt, displayPrompt } = normalizedPrompt;
      // Per-model image point cost: gpt-image-2 (default) = 100 pts,
      // Nano Banana (only when picked) = 50 pts. Prepaid, refunded in full on failure.
      const { assertPoints, deductPoints } = await import("../../platform/core/pointsService");
      const imageAction = imageActionForRequest(input);
      await assertPoints(ctx.user.id, imageAction);
      await deductPoints(ctx.user.id, imageAction, { kind: "brand", id: input.brandId });

      let result;
      try {
        const resolved = await resolveBrandVisualContext(
          input.brandId,
          input.upstreamDecisionId ?? input.decisionId
        );
        const brandContext = { ...resolved, ...(input.overrideBrandContext ?? {}) };

        result = await generateImage({
          brandId: input.brandId,
          decisionId: input.decisionId,
          optionId: input.optionId,
          prompt: modelPrompt,
          channel: input.channel,
          size: input.size,
          modelChoice: input.modelChoice,
          subjectImageUrl: input.subjectImageUrl,
          brandContext,
        });
      } catch (error) {
        await reconcileImageCharge({
          userId: ctx.user.id,
          prepaidAction: imageAction,
          result: { status: "failed" },
        });
        throw error;
      }
      await reconcileImageCharge({
        userId: ctx.user.id,
        prepaidAction: imageAction,
        result,
      });
      // A failed generation is NOT thrown: the client needs `canSwitchTo` to show
      // the "改用 Nano Banana" button (the user decides — we never swap models).
      // The charge was already refunded in full by reconcileImageCharge above.
      if (result.status === "failed") {
        return {
          ...result,
          normalizedDisplayPrompt: displayPrompt,
          friendlyMessage: friendlyImageFailure(result.failureKind, result.errorMsg),
        };
      }
      return { ...result, normalizedDisplayPrompt: displayPrompt };
    }),

  /**
   * 2026-06-15: Generate an image prompt from a post caption.
   * Reads the caption + brand context → asks the LLM to produce a
   * concise, model-ready image generation prompt in English.
   * The client can then drop this into the imagePrompt textarea and
   * generate with GPT Image 2 or Nano Banana.
   */
  promptFromCaption: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      caption: z.string().min(1).max(6000),
      channel: channel.optional(),
      size: size.optional(),
      // 3000 chars: plain-text Nano-Banana templates can reach ~2600 chars;
      // JSON-converted templates are ~200-530 chars after nanoBananaJsonToPrompt.
      imageStyle: z.string().max(3000).optional(),
      // 2026-09-28（CJ「產出的圖片跟真實產品圖片差很多」）：勾了「使用真實產品圖」時帶這個。
      // 沒帶的話，這支會自己想像主體（實例：產品照是生的美國橫膈牛排，指令卻寫
      // 「剛起鍋的厚切牛舌」），生圖模型就照文字重畫一個別的東西，產品保真指令壓不過它。
      // imageUrl：那張產品照。有帶、而且確實是這個品牌的照片，就一起給 LLM 看（檢查衝突）。
      product: z.object({ name: z.string().max(200), imageUrl: z.string().max(500).optional() }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);

      const resolved = await resolveBrandVisualContext(input.brandId);
      const { invokeLLM } = await import("../../platform/core/llm");

      // 只讀「這個品牌自己的產品照」——不替任意網址代抓圖。讀不到就退回看不到照片的版本。
      let photoDataUrl: string | null = null;
      if (input.product?.imageUrl && await brandOwnsProductPhoto(input.brandId, input.product.imageUrl)) {
        try {
          const { buffer, mime } = await fetchImageBuffer(input.product.imageUrl, { maxBytes: 8 * 1024 * 1024 });
          photoDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
        } catch { photoDataUrl = null; }
      }

      const brandBlock = [
        resolved.brandName   ? `Brand name: ${resolved.brandName}`     : "",
        resolved.positioning ? `Positioning: ${resolved.positioning}`   : "",
        resolved.archetype   ? `Archetype: ${resolved.archetype}`       : "",
        resolved.voiceTone   ? `Voice/Tone: ${resolved.voiceTone}`      : "",
        resolved.audience    ? `Target audience: ${resolved.audience}`  : "",
        resolved.colourHints?.length ? `Brand colours: ${resolved.colourHints.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const channelHint =
        input.channel === "ig" && input.size === "1024x1536"
                                  ? "Instagram Story, Reel, or Live creative (portrait 9:16)" :
        input.channel === "ig"        ? "Instagram feed post (square 1:1)"     :
        input.channel === "fb"        ? "Facebook post (landscape 4:3)"        :
        input.channel === "linkedin"  ? "LinkedIn post (landscape 16:9)"       :
        input.channel === "youtube"   ? "YouTube thumbnail (landscape 16:9)"   :
        input.channel === "tiktok"    ? "TikTok post (portrait 9:16)"          :
        "social media post";

      const styleHint = input.imageStyle
        ? `\nVisual brief already drafted by art director:\n${input.imageStyle}`
        : "";

      const systemPrompt = input.product ? productScenePromptSystem(input.product.name, !!photoDataUrl) : `You are a senior commercial photography art director.
Given a social media caption and brand context, write one concise, specific image-generation prompt (80–160 English words), then provide a natural Traditional Chinese version for a Taiwan user. Both versions must describe exactly the same scene.

Rules:
- Describe: main subject, environment/setting, lighting, mood, camera angle/framing
- Reflect the caption's core message visually — do NOT illustrate literally (no text in frame)
- Use the brand's visual identity (colours, archetype, tone)
- Do NOT mention any competitor brand names
- Output JSON only in exactly this shape: {"prompt":"English prompt","promptZh":"繁體中文版"}`;

      const userMsg = `Brand context:\n${brandBlock}\n\nPlatform: ${channelHint}${styleHint}\n\nCaption:\n${input.caption}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: photoDataUrl
              ? ([{ type: "text", text: userMsg }, { type: "image_url", image_url: { url: photoDataUrl } }] as any)
              : userMsg,
          },
        ],
        // 160 English words (~220 tokens) plus a natural Traditional Chinese
        // rendering (~200-350 tokens) and JSON escaping need ample headroom.
        maxTokens: 1200,
      });

      const brief = parseBilingualBriefChoice(result.choices?.[0], input.caption);
      const conflict = photoDataUrl ? parsePhotoConflict(result.choices?.[0]?.message?.content) : null;
      return { ...brief, conflict };
    }),

  /**
   * refineScenePrompt — 把使用者隨手寫的場景敘述，潤成一段夠具體的場景描述。
   *
   * 2026-09-24（CJ「當我們要客戶用產品照片做場景圖的時候，會因為她的提示詞不夠
   * 好，所以合成的圖片很糟糕，很AI。在描述場景時，請加入AI潤飾的按鈕」）。
   *
   * 實作在 content/core/scenePromptRefiner.ts——router 只做權限。抽出去的理由是
   * probe 要能跑**同一段程式**驗證產出品質，不是複製一份 prompt 來測（兩份 prompt
   * 遲早會漂移，而漂移的那天測出來的東西就不是線上跑的東西）。
   */
  refineScenePrompt: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scene: z.string().max(600).default(""),
      productId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const { refineScenePrompt } = await import("../core/scenePromptRefiner");
      const refined = await refineScenePrompt({
        brandId: input.brandId, userId: ctx.user.id,
        productId: input.productId ?? null, scene: input.scene,
      });
      if (!refined) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "這次潤飾沒有結果，請再試一次，或直接用你原本寫的。" });
      }
      return { refined, original: input.scene };
    }),

  listForDecision: protectedProcedure
    .input(z.object({ decisionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT i.id, i.provider, i.model, i.prompt, i.sizeSpec, i.url,
               i.status, i.errorMsg, i.createdAt, i.brandId
        FROM generated_images i
        WHERE i.decisionId = ${input.decisionId}
        ORDER BY i.createdAt DESC
        LIMIT 100
      `)) as any;
      const all = Array.isArray(rows) ? rows : [];
      if (all.length && all[0].brandId) await assertBrandOwner(ctx.user.id, all[0].brandId);
      return all;
    }),

  /**
   * 2026-09-10（CJ「model 跟衣服要分開的」）：服飾上身——衣服（garmentImageUrl，
   * 通常是產品照片庫裡的那件）穿到一張真人模特照（modelImageUrl，通常是品牌
   * 照片庫裡的模特／繆思）身上。兩張圖各自的身份不互相污染：衣服不是這支自己
   * 合成的（走 PiAPI Kling 的 ai_try_on，見 mediaGen.ts 的說明），保真的重點
   * 是「別把兩者的身份搞混」。
   *
   * 計費暫時掛在 image_imagen 這個既有級距（PiAPI 官網報價 $0.07/張，跟這個
   * 級距的既有點數換算是否對得上，之後可能要調——這是先求有再求準）。
   */
  generateGarmentTryOn: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      garmentImageUrl: z.string().url().max(2048),
      modelImageUrl: z.string().url().max(2048),
      garmentSlot: z.enum(["dress", "upper", "lower"]).default("dress"),
      decisionId: z.number().int().positive().optional(),
      optionId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { assertPoints, deductPoints } = await import("../../platform/core/pointsService");
      const imageAction = imageActionForRequest({ modelChoice: "nano-banana" }); // → image_imagen（50 點級距）
      await assertPoints(ctx.user.id, imageAction);
      await deductPoints(ctx.user.id, imageAction, { kind: "brand", id: input.brandId });

      const [ins] = (await db.execute(sql`
        INSERT INTO generated_images (brandId, decisionId, optionId, provider, model, prompt, sizeSpec, status)
        VALUES (${input.brandId}, ${input.decisionId ?? null}, ${input.optionId ?? null},
                'piapi', 'kling-try-on', ${`garment:${input.garmentSlot}`}, '1024x1024', 'pending')
      `)) as any;
      const id = Number(ins?.insertId ?? 0);

      try {
        const { dispatchGenerate } = await import("../core/mediaGen");
        const r = await dispatchGenerate("piapi/kling-try-on", {
          prompt: "",
          imageUrl: input.modelImageUrl,
          garmentImageUrl: input.garmentImageUrl,
          garmentSlot: input.garmentSlot,
          brandId: input.brandId,
        });
        if (r.status !== "ready" || !r.url) {
          throw new Error(r.errorMsg ?? "kling try-on returned no image");
        }
        await db.execute(sql`UPDATE generated_images SET url = ${r.url}, status = 'ready', errorMsg = NULL WHERE id = ${id}`);
        await reconcileImageCharge({ userId: ctx.user.id, prepaidAction: imageAction, result: { status: "ready", provider: "piapi", model: "kling-try-on" } });
        return { id, url: r.url, status: "ready" as const };
      } catch (error: any) {
        const msg = String(error?.message ?? error).slice(0, 400);
        await db.execute(sql`UPDATE generated_images SET status = 'failed', errorMsg = ${msg} WHERE id = ${id}`);
        await reconcileImageCharge({ userId: ctx.user.id, prepaidAction: imageAction, result: { status: "failed" } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `服飾上身失敗：${msg}` });
      }
    }),
});
