/**
 * brandKnowledgeRouter — CRUD for brand_knowledge_items.
 *
 * NotebookLM-style: user uploads successful posts / external references.
 * Cap: 50 items × 8K chars per item = ~400K chars total per brand
 * (within Claude 200K context × 2). Items are injected as additional
 * context into Theater + 30s/60s/100s prompts (separate wiring).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { buildBrandPrefix } from "../_core/brandContext";
import { getBrandRealContent } from "../_core/brandRealContent";
import localPool from "../localDb";

const ASSET_KEYS_COPY = [
  "voice", "voice_principles",
  "preferred_terms", "banned_words", "term_substitutions",
  "branded_terms", "product_naming", "abbreviations",
  "cta_library", "hook_library", "ai_prompts", "templates_copy",
] as const;
type CopyAssetKey = typeof ASSET_KEYS_COPY[number];

const ASSET_SPEC: Record<CopyAssetKey, { ask: string; shape: "text" | "items" | "pairs"; n?: number }> = {
  voice:              { ask: "請用 80-150 字描述這個品牌的整體語氣方向（正式/口語/幽默/溫暖等綜合判斷），讓寫文案的人能掌握『品牌講話的感覺』。", shape: "text" },
  voice_principles:   { ask: "請列 6-10 條 Do/Don't 規則（每條一行）。具體可操作，例如『寫【家人都笑了】而不是【顧客好評如潮】』。", shape: "items", n: 8 },
  preferred_terms:    { ask: "請列 8-15 個這個品牌應該『鼓勵使用』的詞。要符合品牌語氣 + 在地語感（繁體中文）。", shape: "items", n: 12 },
  banned_words:       { ask: "請列 8-15 個應該『避免使用』的詞 — 包含空話、誇大用語、產業常見的爛詞。", shape: "items", n: 12 },
  term_substitutions: { ask: "請列 6-10 對『不要說 X，改說 Y』的對照組（X=爛說法、Y=品牌建議說法）。", shape: "pairs", n: 8 },
  branded_terms:      { ask: "依據品牌定位，列 5-8 個值得『品牌化』的專用詞彙（自家用語 / 註冊概念）。", shape: "items", n: 6 },
  product_naming:     { ask: "請寫 100-200 字的產品命名規範（中英對照規則、格式統一、是否帶版本號等）。", shape: "text" },
  abbreviations:      { ask: "請列 6-10 對縮寫對照（縮寫 → 全稱），跟產業 + 品牌相關。", shape: "pairs", n: 8 },
  cta_library:        { ask: "請列 8 個符合品牌語氣的 CTA（行動句），不要套話。涵蓋導購/留言/分享/收藏/詢問等不同意圖。", shape: "items", n: 8 },
  hook_library:       { ask: "請列 8 個符合品牌語氣的開場 Hook 句型（不要寫具體案例，是可重用的模板）。", shape: "items", n: 8 },
  ai_prompts:         { ask: "請列 5 個常用的 AI prompt（每條完整可貼上的 system prompt 或 instruction），符合品牌口吻 + 產業情境。", shape: "items", n: 5 },
  templates_copy:     { ask: "請列 5 個文案範本標題（標題 + 一句說明），常用情境（活動文 / 公告 / EDM / 道歉 / 感謝）。", shape: "items", n: 5 },
};

function formatHintFor(shape: "text" | "items" | "pairs", n?: number): string {
  if (shape === "text")  return `輸出 JSON：{"text":"<完整內容>"}`;
  if (shape === "items") return `輸出 JSON：{"items":["...","...",...]}（${n ?? 8} 個左右）`;
  return `輸出 JSON：{"pairs":[{"from":"原本說的","to":"改成說的"},...]}`;
}

function coerceShape(parsed: any, shape: "text" | "items" | "pairs"): any {
  if (shape === "text")  return { text: String(parsed?.text ?? "") };
  if (shape === "items") return { items: Array.isArray(parsed?.items) ? parsed.items.filter((x: any) => typeof x === "string") : [] };
  return {
    pairs: Array.isArray(parsed?.pairs)
      ? parsed.pairs
          .filter((p: any) => p && typeof p.from === "string" && typeof p.to === "string")
          .map((p: any) => ({ from: p.from, to: p.to }))
      : [],
  };
}

/** Tolerant JSON extraction. Tries fenced block first, then first
 *  balanced {…} object in the text. Handles LLMs that prepend chatty
 *  text like "Sure, here's the JSON:" before the actual object. */
function extractJSON(text: string): any | null {
  // 1. Fenced ```json {...} ``` block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1]!.trim()); } catch { /* fall through */ }
  }
  // 2. First top-level balanced JSON object
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return null; }
      }
    }
  }
  return null;
}

const SUGGEST_TIMEOUT_MS = 30_000;

async function suggestOne(args: {
  brandId: number;
  userId: number;
  assetKey: CopyAssetKey;
  brandPrefix: string;
  realContent: string;
  knowledgeBlock: string;
}): Promise<{ ok: true; value: any; shape: string } | { ok: false; error: string }> {
  const spec = ASSET_SPEC[args.assetKey];
  const sys = `你是品牌文案顧問，繁體中文。任務：根據品牌定位 + 知識庫 + **品牌真實公開內容**，幫填寫文字資產欄位。
${spec.ask}
${formatHintFor(spec.shape, spec.n)}
直接輸出 JSON 物件，**第一個字元就是 {**。不要前綴「以下是…」、不要 markdown code fence、不要解釋。

【最重要的規則】
- 如果下方有「品牌真實公開內容」，**必須**以該內容為準推斷產業 / 受眾 / 語氣。不要用品牌名字猜產業。
- 如果真實內容跟你的訓練印象不符，以真實內容為準。
${args.brandPrefix}${args.realContent}${args.knowledgeBlock}`;

  try {
    const r = await Promise.race([
      invokeLLM({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `品牌資產欄位：${args.assetKey}` },
        ],
        maxTokens: 1500,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout (30s)")), SUGGEST_TIMEOUT_MS)),
    ]);
    const raw = r.choices[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    const inTok  = r.usage?.prompt_tokens ?? 0;
    const outTok = r.usage?.completion_tokens ?? 0;
    try {
      await localPool.execute(
        `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
              VALUES (?, 'brand', ?, ?, ?, ?, ?, ?)`,
        [args.userId, args.brandId, `asset_suggest:${args.assetKey}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
         (inTok * 1.0 + outTok * 5.0) / 1_000_000],
      );
    } catch {/* non-fatal */}
    const parsed = extractJSON(text);
    if (!parsed) {
      console.warn(`[suggestOne:${args.assetKey}] JSON parse failed. Raw text:`, text.slice(0, 500));
      return { ok: false, error: `JSON parse failed (got ${text.length} chars)` };
    }
    return { ok: true, value: coerceShape(parsed, spec.shape), shape: spec.shape };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.warn(`[suggestOne:${args.assetKey}] failed:`, msg);
    return { ok: false, error: msg };
  }
}

const MAX_ITEMS_PER_BRAND = 50;
const MAX_BODY_CHARS = 8_000;

export const brandKnowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, kind, title, body, sourceUrl, tags, createdAt, updatedAt
             FROM brand_knowledge_items
            WHERE userId = ? AND brandId = ?
            ORDER BY createdAt DESC`,
          [userId, input.brandId],
        );
        return (rows as any[]).map(r => ({
          id: Number(r.id),
          kind: String(r.kind),
          title: String(r.title),
          body: r.body ?? "",
          sourceUrl: r.sourceUrl ?? null,
          tags: r.tags ? (typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags) : [],
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        }));
      } catch { return []; }
    }),

  create: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      kind: z.enum(["reference", "winning_post", "competitor", "voice_sample", "note"]).default("reference"),
      title: z.string().min(1).max(255),
      body: z.string().max(MAX_BODY_CHARS).optional(),
      sourceUrl: z.string().url().max(1024).optional(),
      tags: z.array(z.string()).max(20).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // Cap check
      const [cnt]: any = await localPool.execute(
        `SELECT COUNT(*) AS n FROM brand_knowledge_items WHERE userId = ? AND brandId = ?`,
        [userId, input.brandId],
      );
      const n = Number((cnt as any[])[0]?.n ?? 0);
      if (n >= MAX_ITEMS_PER_BRAND) {
        return { ok: false as const, error: `已達上限（${MAX_ITEMS_PER_BRAND} 條）— 請先刪除舊條目` };
      }
      const [r]: any = await localPool.execute(
        `INSERT INTO brand_knowledge_items (userId, brandId, kind, title, body, sourceUrl, tags)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.brandId, input.kind, input.title, input.body ?? null, input.sourceUrl ?? null, JSON.stringify(input.tags)],
      );
      return { ok: true as const, id: Number(r?.insertId ?? 0) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      body: z.string().max(MAX_BODY_CHARS).optional(),
      sourceUrl: z.string().url().max(1024).optional(),
      tags: z.array(z.string()).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const sets: string[] = [];
      const params: any[] = [];
      if (input.title     !== undefined) { sets.push("title = ?");     params.push(input.title); }
      if (input.body      !== undefined) { sets.push("body = ?");      params.push(input.body); }
      if (input.sourceUrl !== undefined) { sets.push("sourceUrl = ?"); params.push(input.sourceUrl); }
      if (input.tags      !== undefined) { sets.push("tags = ?");      params.push(JSON.stringify(input.tags)); }
      if (!sets.length) return { ok: true };
      params.push(input.id, userId);
      await localPool.execute(
        `UPDATE brand_knowledge_items SET ${sets.join(", ")} WHERE id = ? AND userId = ?`,
        params,
      );
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await localPool.execute(
        `DELETE FROM brand_knowledge_items WHERE id = ? AND userId = ?`,
        [input.id, userId],
      );
      return { ok: true };
    }),

  /**
   * AI 協助填寫 (single field) — kept for backward-compat with old per-card
   * buttons. Now grounded in brand's real public content (FB / website).
   */
  suggestForAsset: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      assetKey: z.enum(ASSET_KEYS_COPY),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [brandPrefix, real, knowledgeBlock] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);
      const r = await suggestOne({
        brandId: input.brandId, userId, assetKey: input.assetKey,
        brandPrefix, realContent: real.context, knowledgeBlock,
      });
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, shape: r.shape, value: r.value, hasRealContent: real.hasContent };
    }),

  /**
   * AI 指令庫 — generate platform-specific text + image prompts using
   * brand positioning + knowledge + real public content.
   */
  suggestAIPrompts: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: z.enum(["facebook", "instagram", "youtube", "threads", "tiktok", "linkedin", "email", "press"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [brandPrefix, real, knowledgeBlock] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);
      const labelMap: Record<string, string> = {
        facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", threads: "Threads",
        tiktok: "TikTok", linkedin: "LinkedIn", email: "EDM 電子報", press: "新聞稿",
      };
      const label = labelMap[input.platform] ?? input.platform;
      const sys = `你是品牌文案顧問，繁體中文。
任務：為這個品牌產出在 ${label} 平台寫貼文 / 配圖時可以直接 inject 給 LLM 的 system prompt。
必須以下方「品牌真實公開內容」推斷產業 / 受眾 / 語氣，不要用品牌名瞎猜。

輸出 JSON：
{
  "text": "<完整可貼上的文字指令；80-200 字；說明 ${label} 該怎麼寫貼文：口吻、結構、長度、要避免的、要強調的>",
  "image": "<完整可貼上的圖片指令；80-200 字；說明 ${label} 配圖風格：構圖、色調、字幅、品牌元素、可用 / 不可用素材類型>"
}
直接輸出 JSON，第一字元就是 {。
${brandPrefix}${real.context}${knowledgeBlock}`;
      try {
        const r = await Promise.race([
          invokeLLM({
            messages: [
              { role: "system", content: sys },
              { role: "user", content: `平台：${label}` },
            ],
            maxTokens: 1500,
          }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 30_000)),
        ]);
        const raw = r.choices[0]?.message?.content;
        const text = typeof raw === "string" ? raw : "";
        const inTok = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        try {
          await localPool.execute(
            `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                  VALUES (?, 'brand', ?, ?, ?, ?, ?, ?)`,
            [userId, input.brandId, `ai_prompt:${input.platform}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
             (inTok * 1.0 + outTok * 5.0) / 1_000_000],
          );
        } catch {/* non-fatal */}
        // Reuse extractJSON from suggestOne path — inline lite version here
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonText = m ? m[1]!.trim() : text.trim();
        let parsed: any = null;
        try { parsed = JSON.parse(jsonText); } catch {
          const start = jsonText.indexOf("{");
          if (start >= 0) {
            try { parsed = JSON.parse(jsonText.slice(start)); } catch {}
          }
        }
        if (!parsed) return { ok: false as const, error: "JSON parse failed" };
        return {
          ok: true as const,
          value: {
            text:  String(parsed.text  ?? "").slice(0, 4000),
            image: String(parsed.image ?? "").slice(0, 4000),
          },
          hasRealContent: real.hasContent,
        };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message ?? e) };
      }
    }),

  /**
   * 一鍵自動填寫 — fills ALL empty asset fields in one call.
   *
   * CJ direction (2026-05-07):
   *   "自動填寫，全局只要一個按鈕就好，不需要每個地方有按鈕。"
   *
   * 1. Fetches brand's real public content (FB / 官網) ONCE — cached for
   *    subsequent suggest calls in the same hour.
   * 2. For each asset in `keys` that is currently empty (`emptyKeys`),
   *    runs suggestOne in parallel batches of 3 (avoids LLM rate-limit).
   * 3. Returns map of { key → suggestion value } so frontend can write
   *    them all into positioning._assets in one savePositioning call.
   */
  bulkSuggestEmptyAssets: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      emptyKeys: z.array(z.enum(ASSET_KEYS_COPY)).min(1),
      forceRefresh: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [brandPrefix, real, knowledgeBlock] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId, { force: !!input.forceRefresh }).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);

      const results: Record<string, { value: any; shape: string }> = {};
      const errors: Record<string, string> = {};

      // Run in parallel batches of 3 (12 keys × ~3-4s each → ~12-16s total).
      const BATCH = 3;
      for (let i = 0; i < input.emptyKeys.length; i += BATCH) {
        const batch = input.emptyKeys.slice(i, i + BATCH);
        const settled = await Promise.all(batch.map((k) =>
          suggestOne({ brandId: input.brandId, userId, assetKey: k, brandPrefix, realContent: real.context, knowledgeBlock })
            .then((r) => ({ key: k, r }))
        ));
        for (const { key, r } of settled) {
          if (r.ok) results[key] = { value: r.value, shape: r.shape };
          else errors[key] = r.error;
        }
      }

      return {
        ok: true as const,
        results,
        errors,
        hasRealContent: real.hasContent,
        sources: real.sources,
      };
    }),
});

/**
 * Helper: pull all knowledge items for a brand and format for LLM injection.
 * Used by Theater / 30s / 60s / 100s prompt builders. Cuts at total char
 * budget (default 80K — leaves room for positioning + brand context).
 *
 * No userId filter: items were created with userId scoping at write time;
 * read-time injection trusts the brand context (orchestra is already
 * gated by brand ownership upstream).
 */
export async function loadBrandKnowledgeForPrompt(
  brandId: number,
  budgetChars = 80_000,
): Promise<string> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT title, body, sourceUrl FROM brand_knowledge_items
        WHERE brandId = ?
        ORDER BY createdAt DESC LIMIT ?`,
      [brandId, MAX_ITEMS_PER_BRAND],
    );
    const items = rows as any[];
    if (!items.length) return "";
    const blocks: string[] = [];
    let used = 0;
    for (const it of items) {
      const block = `── ${it.title} ──\n${(it.body ?? "").slice(0, MAX_BODY_CHARS)}${it.sourceUrl ? `\n[來源] ${it.sourceUrl}` : ""}\n`;
      if (used + block.length > budgetChars) break;
      blocks.push(block);
      used += block.length;
    }
    return `\n\n【品牌知識庫（user-uploaded reference）— 產出時請參考語氣 / 結構 / 案例】\n${blocks.join("\n")}`;
  } catch {
    return "";
  }
}
