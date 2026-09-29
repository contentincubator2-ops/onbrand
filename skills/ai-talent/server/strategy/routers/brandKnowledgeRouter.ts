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
import { parseBrief, fieldsInBrief } from "../core/aiBrief";
import { invokeLLM } from "../../platform/core/llm";
import { buildBrandPrefix, buildBrandBrain, BRAIN_CAPACITY, BRAIN_CATEGORIES } from "../core/brandContext";
import { getBrandRealContent } from "../core/brandRealContent";
import localPool from "../../localDb";

const ASSET_KEYS_COPY = [
  "voice", "voice_principles",
  "preferred_terms", "banned_words", "term_substitutions",
  "branded_terms", "product_naming", "abbreviations",
  "cta_library", "hook_library", "ai_prompts", "templates_copy",
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
  ai_prompts:         { ask: "請列 5 個常用的 AI prompt（每條完整可貼上的 system prompt 或 instruction），**必須具體指明該品牌產業 + 受眾 + 禁忌**，不要寫『請寫一篇有溫度的貼文』這種空洞 prompt。", shape: "items", n: 5 },
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
  const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../core/brandMarket");
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
   * 檢查大腦 —— 品牌大腦記住了什麼、用了多少容量、哪些只記住一部分、哪些超載。
   *
   * 2026-09-29（CJ「像手機記憶體的感覺，透明化品牌大腦當中有記到的內容，分為不同
   * 類別，視覺化給用戶看」）。清單跟產文 prompt 由同一個 buildBrandBrain 產生，
   * 所以畫面上寫「記住」的，就是每篇產文真的讀得到的。
   */
  brain: protectedProcedure
    .input(z.object({ brandId: z.number(), productId: z.number().optional(), eventId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const [own]: any = await localPool.execute(
        `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, ctx.user!.id],
      );
      const categories = Object.entries(BRAIN_CATEGORIES).map(([key, v]) => ({ key, zh: v.zh, en: v.en }));
      if (!Array.isArray(own) || own.length === 0) {
        return { capacity: BRAIN_CAPACITY, usedChars: 0, items: [], categories };
      }
      const brain = await buildBrandBrain(input.brandId, input.productId ?? null, input.eventId ?? null);
      return { capacity: brain.capacity, usedChars: brain.usedChars, items: brain.items, categories };
    }),

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
   * 既有語調鎖定 (Voice Lock) — 2026-07-29 (CJ「像 Pokémon GO 這樣的客戶，
   * 習慣用自己的語調溝通…我應該如何識別出它適合的語調，其實是用它原來
   * 溝通的語調」→「通用」).
   *
   * 識別訊號：品牌已有活躍、有實際成效的既有陣地（讚/留言/分享不是零）—
   * 這代表既有語調已被市場驗證，不該被 AI 泛用人設覆蓋。使用者貼上幾篇
   * 真實高成效貼文，AI 只萃取「可驗證、可量化」的規則（開頭稱呼、標點
   * 慣例、emoji 密度與語意對應、固定格式等）——不是語氣印象詞，且明確
   * 禁止發明樣本中沒出現的習慣。鎖定後，generateAiPromptForPlatform 對
   * 這個品牌的「每一次」未來生成都會強制（code-level，非僅提示詞）帶上
   * 這層規則，不會被下一次 AI 協助填 洗掉。
   */
  extractVoiceLock: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      samplePosts: z.array(z.string().min(5).max(2000)).min(2).max(10),
      sourceNote: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const sys = `你是品牌語調稽核員，繁體中文。任務：從使用者貼上的「真實貼文範例」中，萃取可驗證、可量化的寫作規則——不是語氣印象詞，是可以逐字檢查是否遵守的具體規則。只輸出 JSON，第一字元就是 {。

嚴格規則：
- 只記錄在多篇範例中重複出現、可驗證的模式：開頭稱呼、標點慣例、emoji 數量與語意對應、固定格式（時間／數字寫法）、稱謂用詞、句子長度節奏等。
- 樣本中只出現一次、無法判斷是否為固定習慣的細節，不要當作規則寫出。
- 絕對不可自行發明範例中沒有出現的修辭習慣、口頭禪或句型——這是本任務最容易犯的錯誤，切記不要腦補。
- 若樣本數量不足以判斷某個維度，該維度就不要下結論，不要用少數樣本強行歸納。
- 「活潑」「溫暖」「親切」這類不可驗證的抽象形容詞不算規則，不要輸出。

輸出 JSON：
{"rules": ["規則1（具體、可驗證、可執行，≤50字）", "規則2", ...], "sourceSummary": "一句話總結樣本來源與萃取基礎（≤40字）"}
rules 3-8 條。`;
      const samplesBlock = input.samplePosts
        .map((p, i) => `【範例 ${i + 1}】\n${p.trim()}`)
        .join("\n\n");
      const { invokeLLM } = await import("../../platform/core/llm");
      const r = await Promise.race([
        invokeLLM({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: samplesBlock },
          ],
          maxTokens: 1200,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 30_000)),
      ]);
      const raw = r.choices[0]?.message?.content;
      const text = typeof raw === "string" ? raw : "";
      try {
        const inTok = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        await localPool.execute(
          `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                VALUES (?, 'brand', ?, 'voice_lock_extract', ?, ?, ?, ?)`,
          [userId, input.brandId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
           (inTok * 1.0 + outTok * 5.0) / 1_000_000],
        );
      } catch { /* non-fatal */ }
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonText = m ? m[1]!.trim() : text.trim();
      let parsed: any = null;
      try { parsed = JSON.parse(jsonText); } catch {
        const s = jsonText.indexOf("{");
        if (s >= 0) { try { parsed = JSON.parse(jsonText.slice(s)); } catch {} }
      }
      if (!parsed || !Array.isArray(parsed.rules) || parsed.rules.length === 0) {
        return { ok: false as const, error: "萃取失敗，請確認貼的是真實貼文原文，再試一次" };
      }
      const lock = {
        rules: parsed.rules.map((r: any) => String(r)).slice(0, 8),
        sourceSummary: String(parsed.sourceSummary ?? input.sourceNote ?? `依 ${input.samplePosts.length} 篇真實貼文歸納`),
        sampleCount: input.samplePosts.length,
        lockedAt: new Date().toISOString(),
      };
      const [posRows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? AND userId = ?`, [input.brandId, userId]);
      if ((posRows as any[]).length === 0) return { ok: false as const, error: "brand not found" };
      let pos: any = posRows[0].positioning;
      if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
      pos = pos ?? {};
      pos._voiceLock = lock;
      await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`, [JSON.stringify(pos), input.brandId, userId]);
      return { ok: true as const, lock };
    }),

  clearVoiceLock: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [posRows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? AND userId = ?`, [input.brandId, userId]);
      if ((posRows as any[]).length === 0) return { ok: false as const, error: "brand not found" };
      let pos: any = posRows[0].positioning;
      if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
      pos = pos ?? {};
      delete pos._voiceLock;
      await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`, [JSON.stringify(pos), input.brandId, userId]);
      return { ok: true as const };
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
   * AI 指令庫 — generate platform-specific text + image prompts using
   * brand positioning + knowledge + real public content.
   */
  suggestAIPrompts: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: z.enum(["facebook", "instagram", "youtube", "threads", "tiktok", "linkedin", "email", "press"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // 2026-07-28 (CJ 級聯重生): body extracted to generateAiPromptForPlatform
      // so workbench applyScenario can regenerate all 8 platforms server-side.
      return await generateAiPromptForPlatform(input.brandId, ctx.user!.id, input.platform);
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

/**
 * AI 指令庫 per-platform generator — extracted from the suggestAIPrompts
 * mutation (2026-07-28) so the strategy-workbench applyScenario cascade can
 * regenerate all 8 platforms server-side after a scenario is applied.
 * 文字指令 = 【人設】400-600 字 + 【平台寫作指令】120-200 字 (CJ spec).
 */
/** 2026-07-29 (CJ「像 Pokémon GO 這樣的客戶…如何識別出它適合的語調，其實是
 *  用它原來溝通的語調」→「通用」): shape persisted at positioning._voiceLock.
 *  Populated by extractVoiceLock from user-pasted real posts. Once present,
 *  generateAiPromptForPlatform ALWAYS deterministically appends these rules
 *  verbatim to the generated text prompt (code-level guarantee, not just a
 *  prompt instruction the LLM might dilute — this is the generalized,
 *  reusable version of the one-off fix applied to Pokémon GO 2026-07-29). */
export type VoiceLock = { rules: string[]; sourceSummary: string; sampleCount: number; lockedAt: string };

async function loadVoiceLock(brandId: number): Promise<VoiceLock | null> {
  try {
    const [rows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? LIMIT 1`, [brandId]);
    let pos: any = rows[0]?.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
    const lock = pos?._voiceLock;
    return (lock && Array.isArray(lock.rules) && lock.rules.length > 0) ? lock as VoiceLock : null;
  } catch { return null; }
}

function voiceLockBlock(lock: VoiceLock | null): string {
  if (!lock) return "";
  return `\n\n【真實觀察規則 — 務必遵守，優先於上方人設風格描述】\n(${lock.sourceSummary})\n` +
    lock.rules.map((r) => `- ${r}`).join("\n");
}

export async function generateAiPromptForPlatform(
  brandId: number,
  userId: number,
  platform: "facebook" | "instagram" | "youtube" | "threads" | "tiktok" | "linkedin" | "email" | "press",
): Promise<
  | { ok: true; value: { text: string; image: string }; hasRealContent: boolean }
  | { ok: false; error: string }
> {
  const [brandPrefix, real, voiceLock] = await Promise.all([
    buildBrandPrefix(brandId).catch(() => ""),
    getBrandRealContent(brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
    loadVoiceLock(brandId),
  ]);
  const labelMap: Record<string, string> = {
    facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", threads: "Threads",
    tiktok: "TikTok", linkedin: "LinkedIn", email: "EDM 電子報", press: "新聞稿",
  };
  const label = labelMap[platform] ?? platform;
  const hasReal = real.hasContent;
  // 2026-07-18 多市場 (P2): generated per-platform system prompts must
  // themselves command the brand's market language.
  const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../core/brandMarket");
  const mkt = await getBrandMarket(brandId).catch(() => DEFAULT_BRAND_MARKET);
  const langLine = mkt.isZhTW
    ? "繁體中文"
    : `產出的指令內容必須明確要求「所有貼文 / 配圖文字一律使用 ${mkt.outputLanguage}（品牌目標市場語言）」，指令本身也用 ${mkt.outputLanguage} 撰寫`;
  const sys = `你是品牌文案顧問，${langLine}。
任務：為這個品牌產出在 ${label} 平台寫貼文 / 配圖時可以直接 inject 給 LLM 的 system prompt。
${hasReal
  ? "下方有品牌官網 / 社群實際內容 — 以該內容推斷產業 / 受眾 / 語氣。"
  : "目前沒抓到品牌的官網 / 社群實際內容，請根據品牌名 + 描述 + 產業常識合理推斷，直接寫指令草稿，不要回拒或留空。"
}

【重要 — 事實準確度優先於文采】若下方品牌資料包含具體、可驗證的觀察事實（例如「emoji 每篇 1-2 個」「時間格式固定寫法」「特定標點慣例」「開頭固定稱呼」等），寫【平台寫作指令】時必須原樣採用該數字 / 格式 / 規則，不可自行放寬、四捨五入或改寫成相近但不同的版本。人設段落的「口頭禪或標誌性表達」也一樣——若品牌資料已提供真實觀察到的具體習慣，直接採用；資料沒有提供時才可以合理創造，且創造的內容不可被誤認為是已驗證的事實。

文字指令必須是以下兩段固定結構（兩段之間空一行）：
【人設】400-600 字的完整人設，寫給要扮演這個角色的 LLM：這位 ${label} 內容操盤手是誰（姓名可虛構）、專業背景與資歷、性格與說話習慣（含口頭禪或標誌性表達 1-2 個——優先採用品牌資料中已驗證的真實習慣，只有資料沒提供時才自行創造）、對這個品牌與其受眾的理解、寫作時的價值觀與堅持。人設必須從下方品牌定位（黃金圈 / 品牌語氣 / 目標受眾）自然長出來，不可與定位矛盾；字數不足 400 字或超過 600 字都算不合格。
【平台寫作指令】120-200 字：${label} 貼文的口吻、結構、長度、要避免的、要強調的——所有具體數字與格式規則須逐字沿用品牌資料，不可自行調整。

輸出 JSON：
{
  "text": "<上述兩段結構的完整文字指令，含【人設】與【平台寫作指令】標題>",
  "image": "<完整可貼上的圖片指令；80-200 字；說明 ${label} 配圖風格：構圖、色調、字幅、品牌元素、可用 / 不可用素材類型>"
}
直接輸出 JSON，第一字元就是 {。
${brandPrefix}${real.context}${voiceLockBlock(voiceLock)}`;
  try {
    const r = await Promise.race([
      invokeLLM({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `平台：${label}` },
        ],
        // 400-600 字人設 + 平台指令 + 圖片指令 ≈ 1600-2200 tokens of CJK.
        maxTokens: 2600,
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
              VALUES (?, 'brand', ?, ?, ?, ?, ?, ?)`,
        [userId, brandId, `ai_prompt:${platform}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
         (inTok * 1.0 + outTok * 5.0) / 1_000_000],
      );
    } catch {/* non-fatal */}
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
    // 2026-07-29: deterministic guarantee — a prompt instruction alone is
    // probabilistic (this is exactly how Pokémon GO's rules got diluted the
    // first time). If a voice lock exists, its rules are ALWAYS appended
    // verbatim to the generated text, in code, regardless of what the LLM did.
    const lockedText = voiceLock
      ? `${String(parsed.text ?? "").slice(0, 3400)}${voiceLockBlock(voiceLock)}`
      : String(parsed.text ?? "");
    return {
      ok: true as const,
      value: {
        text:  lockedText.slice(0, 4000),
        image: String(parsed.image ?? "").slice(0, 4000),
      },
      hasRealContent: real.hasContent,
    };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message ?? e) };
  }
}
