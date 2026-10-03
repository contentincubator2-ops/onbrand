/**
 * brandKnowledgeRouter — CRUD for brand_knowledge_items.
 *
 * NotebookLM-style: user uploads successful posts / external references.
 * Cap: 50 items × 8K chars per item = ~400K chars total per brand
 * (within Claude 200K context × 2). Items are injected as additional
 * context into Theater + 30s/60s/100s prompts (separate wiring).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { parseBrief, fieldsInBrief } from "../core/positioning/aiBrief";
import { invokeLLM } from "../../platform/core/llm/llm";
import { buildBrandPrefix } from "../core/brand/brandContext";
import { getBrandRealContent } from "../core/brand/brandRealContent";
import { loadBrandMemory } from "../core/brand/brandMemory";
import localPool from "../../localDb";

const ASSET_KEYS_COPY = [
  "voice", "voice_principles",
  "preferred_terms", "banned_words", "term_substitutions",
  "branded_terms", "product_naming", "abbreviations",
  "cta_library", "hook_library", "templates_copy",
] as const;
type CopyAssetKey = typeof ASSET_KEYS_COPY[number];

// 2026-05-08 (CJ feedback): asset prompts now FORCE industry-specific
// output. Previous version got generic SaaS terms (AI / ROI / KPI /
// CRM / B2B / SOP / MVP / UX) when generating for 桂冠營養研究室
// (food brand). Each prompt now explicitly bans common-business terms
// when the brand isn't actually in tech / SaaS.
const ASSET_SPEC: Record<CopyAssetKey, { ask: string; shape: "text" | "items" | "pairs"; n?: number }> = {
  voice:              { ask: "請用 80-150 字描述這個品牌的整體語氣方向（正式/口語/幽默/溫暖等綜合判斷），讓寫文案的人能掌握『品牌講話的感覺』。**必須對應這個品牌真實的產業 / 受眾**（不要用通用商業語彙）。", shape: "text" },
  voice_principles:   { ask: "請列 6-10 條 Do/Don't 規則（每條一行）。具體可操作，例如『寫【家人都笑了】而不是【顧客好評如潮】』。**規則必須具體呼應這個品牌的產業細節**（食品/建設/金融/遊戲社群 各自規則差很多）。", shape: "items", n: 8 },
  preferred_terms:    { ask: "請列 8-15 個這個品牌應該『鼓勵使用』的詞。**必須是這個品牌實際產業會用的詞**（例：食品品牌 → 『鎖鮮 / 真材實料 / 一口飽滿』；建設品牌 → 『臨棟 / 氣口 / 採光』；遊戲社群 → 『訓練師 / 寶可夢 / 出沒點』）。**禁止輸出『AI / 數位化 / 創新 / 賦能』這類萬用商業詞**。", shape: "items", n: 12 },
  banned_words:       { ask: "請列 8-15 個應該『避免使用』的詞 — 包含空話、誇大用語、產業常見的爛詞。**列出的詞必須是這個品牌會誤用的具體爛詞**（不要只列『最好』『第一』『卓越』這種所有產業都該避免的）。", shape: "items", n: 12 },
  term_substitutions: { ask: "請列 6-10 對『不要說 X，改說 Y』的對照組（X=爛說法、Y=品牌建議說法）。**Y 必須使用這個品牌實際產業的語感**，例如食品『美味』改『一口爆汁』、遊戲社群『稀有』改『爆率超低』。", shape: "pairs", n: 8 },
  branded_terms:      { ask: "依據品牌定位，列 5-8 個值得『品牌化』的專用詞彙（自家用語 / 註冊概念）。**這些必須能在這個品牌的官網 / FB 內容裡找到呼應**，不是憑空編。", shape: "items", n: 6 },
  product_naming:     { ask: "請寫 100-200 字的產品命名規範（中英對照規則、格式統一、是否帶版本號等）。**必須對應實際產品線**（食品有口味 / 包裝；建設有建案名 / 戶型；遊戲有活動名 / 道具）。", shape: "text" },
  abbreviations:      { ask: "請列 6-10 對縮寫對照（縮寫 → 全稱），**必須是這個品牌實際會用到的產業縮寫**。例：食品 → SKU / FDA / HACCP / 食安；建設 → SRC / RC / 公設 / 預售；遊戲社群 → PvP / IV / CP / EX raid。**禁止輸出 AI / ROI / KPI / CRM / B2B / SOP / MVP / UX 這種萬用 SaaS 縮寫**，除非品牌真的是 SaaS / 顧問業。", shape: "pairs", n: 8 },
  cta_library:        { ask: "請列 8 個符合品牌語氣的 CTA（行動句），不要套話。涵蓋導購/留言/分享/收藏/詢問等不同意圖。**句子必須帶該品牌產業的語感**（不要寫『立即下單』這種通用詞，要寫像『今晚冰箱備一包』『下班路上順手帶一盒』這種有畫面的）。", shape: "items", n: 8 },
  hook_library:       { ask: "請列 8 個符合品牌語氣的開場 Hook 句型（不要寫具體案例，是可重用的模板）。**模板裡的場景占位符必須符合該品牌實際使用情境**（食品 → 廚房 / 餐桌；建設 → 看屋 / 通勤；遊戲社群 → 寶可夢站 / 道館）。", shape: "items", n: 8 },
  templates_copy:     { ask: "請列 5 個文案範本標題（標題 + 一句說明），**情境須對應該品牌真實會發生的事件**（食品 → 中元節限定 / 母親節伴手禮；建設 → 公開銷售記者會 / 公設啟用；遊戲社群 → 社群日資訊 / 突發 raid 通知）。", shape: "items", n: 5 },
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
}): Promise<{ ok: true; value: any; shape: string } | { ok: false; error: string }> {
  const spec = ASSET_SPEC[args.assetKey];
  const hasReal = (args.realContent ?? "").length > 0;
  // 2026-07-18 多市場 (P2): asset copy follows the brand's outputLanguage.
  // The industry-vocab examples below are TW-market illustrations — for
  // non-zh brands instruct the model to produce local-language equivalents.
  const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../core/brand/brandMarket");
  const mkt = await getBrandMarket(args.brandId).catch(() => DEFAULT_BRAND_MARKET);
  const langDirective = mkt.isZhTW
    ? "繁體中文"
    : `所有產出內容一律使用 ${mkt.outputLanguage}（品牌目標市場語言），不得混入中文`;
  const localizeNote = mkt.isZhTW
    ? ""
    : `\n5. 下面各產業的「語感範例詞」是台灣市場的中文示意 — **不要照抄**，請產出 ${mkt.outputLanguage} 中相同語感的在地說法（節慶 / 場景 / 慣用語一律用目標市場的，例如美國用 Black Friday / back-to-school，不要用中元節 / 母親節伴手禮）。`;
  const sys = `你是品牌文案顧問，${langDirective}。任務：根據可得資訊填寫文字資產欄位。
${spec.ask}
${formatHintFor(spec.shape, spec.n)}
直接輸出 JSON 物件，**第一個字元就是 {**。不要前綴「以下是…」、不要 markdown code fence、不要解釋。

【產出原則 — 最重要】
1. 先從品牌名 + 描述 + 知識庫 + 真實內容 **判斷產業類型**：
   - 食品 / 餐飲：用『鎖鮮 / 一口爆汁 / 食材 / 風味 / 廚房』這類語感
   - 建設 / 房地產：用『臨棟 / 公設 / 採光 / 動線 / 建案』這類語感
   - 遊戲 / 社群：用『訓練師 / 爆率 / 道館 / 出沒點 / 突發』這類語感
   - 美妝 / 保養：用『質地 / 上臉 / 肌況 / 顯色 / 抗氧』這類語感
   - 金融 / SaaS：才能用『ROI / KPI / CRM / B2B』這類詞
2. **絕對禁止**對非 SaaS 品牌輸出『AI / 數位轉型 / 賦能 / 創新驅動 / ROI / KPI / CRM / SOP / MVP / UX / B2B』這類萬用商業詞 — 這是用戶 #1 抱怨點。
3. ${hasReal
  ? "下方提供了品牌的官網 / 社群實際內容，**必須**以該內容為準推斷產業 / 受眾 / 語氣。"
  : "下方資料有限，但仍要根據品牌名稱 + 描述 + 產業常識**精準推斷產業**。寧可少寫幾條真正貼合的，也不要塞通用詞充數。"
}
4. 如果真的判斷不出產業，回傳空陣列 / 空物件，**不要編造跟品牌無關的內容**。${localizeNote}
${args.brandPrefix}${args.realContent}`;

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
  /**
   * AI 讀到的品牌簡報 —— 每張任務卡開跑前塞進模型的那段字，攤開給用戶看。
   *
   * 2026-09-08 (CJ「顯示出幫他把定位化為 AI 讀懂的文字的過程」)。不是另外生一份
   * 給人看的版本：full／core 就是 buildBrandPrefix 真正回給 orchestra 的字串，
   * parseBrief 只負責切段與對回欄位。
   */
  aiBrief: protectedProcedure
    .input(z.object({ brandId: z.number(), productId: z.number().optional(), eventId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const [own]: any = await localPool.execute(
        `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, ctx.user!.id],
      );
      if (!Array.isArray(own) || own.length === 0) return { full: "", core: "", fullChars: 0, coreChars: 0, sections: [], fields: [] };
      const full = await buildBrandPrefix(input.brandId, input.productId ?? null, input.eventId ?? null, "full");
      const core = await buildBrandPrefix(input.brandId, input.productId ?? null, input.eventId ?? null, "core");
      const sections = parseBrief(full);
      return {
        full, core,
        fullChars: [...full.trim()].length, coreChars: [...core.trim()].length,
        sections, fields: fieldsInBrief(sections),
      };
    }),

  /**
   * 「記憶」tray：品牌在策略層存了什麼（全部，不只 AI 讀的）＋每一種寫作情境讀到的大腦。
   * 2026-09-30（CJ「策略層有品牌、產品、活動、文字、視覺，還有其他真實存入的資料……要精細」）。
   * 不是自己的品牌回 null。見 server/strategy/core/brand/brandMemory.ts。
   */
  memory: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => loadBrandMemory(input.brandId, ctx.user!.id)),

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
      const [brandPrefix, real] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
      ]);
      const r = await suggestOne({
        brandId: input.brandId, userId, assetKey: input.assetKey,
        brandPrefix, realContent: real.context,
      });
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, shape: r.shape, value: r.value, hasRealContent: real.hasContent };
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
      const [brandPrefix, real] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId, { force: !!input.forceRefresh }).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
      ]);

      const results: Record<string, { value: any; shape: string }> = {};
      const errors: Record<string, string> = {};

      // Run in parallel batches of 3 (12 keys × ~3-4s each → ~12-16s total).
      const BATCH = 3;
      for (let i = 0; i < input.emptyKeys.length; i += BATCH) {
        const batch = input.emptyKeys.slice(i, i + BATCH);
        const settled = await Promise.all(batch.map((k) =>
          suggestOne({ brandId: input.brandId, userId, assetKey: k, brandPrefix, realContent: real.context })
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

// 2026-09-29（CJ「知識庫是隱藏內容，不需要讀取」「策略生成也拿掉知識庫」）：
// loadBrandKnowledgeForPrompt 已移除——生文與策略生成都不再把 brand_knowledge_items
// 塞進 prompt。資料照樣保留（list / 編輯仍在），只是不再被任何 AI 讀取。

