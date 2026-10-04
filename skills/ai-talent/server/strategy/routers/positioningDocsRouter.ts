/**
 * positioningDocsRouter — 上傳的定位文件 → canonical 欄位的對映提案與套用。
 *
 * 2026-09-01。上傳與抽取在 routes/positioningDocRoute.ts（要收 raw bytes），
 * 這裡是需要 LLM 與 tRPC context 的另一半。
 *
 * ── 三個刻意的設計 ────────────────────────────────────────────────────
 * 1. **提案，不是自動套用。** LLM 只產「建議這格填這句」，一定要用戶確認才
 *    寫進 positioning。定位是所有任務的上游，靜靜寫錯一格會污染每一張卡。
 *
 * 2. **只准引用，不准創作。** 對映的值必須來自文件原文（可截句、可合併相鄰
 *    句子，不可改寫成新主張）。文件沒講的就留空 —— 一句編出來的「差異化總結」
 *    會直接變成品牌對外的說法，比空著糟得多。空欄位有落差報告接住。
 *
 * 3. **只瞄準會進 prompt 的格。** positioningDocs.PROMPT_FIELDS 那張表就是
 *    buildBrandPrefix 真正讀得到的路徑。硬填滿 10 個 segment 的每個欄位對
 *    產出沒有幫助，只是讓用戶多審一堆不影響結果的東西。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { promises as fs } from "fs";
import { join } from "path";
import localPool from "../../localDb";
import { invokeLLM } from "../../platform/core/llm/llm";
import { randomUUID } from "crypto";
import {
  type PositioningScope, type PromptField, type AppliedDocRecord, type CustomSegment,
  loadPositioning, sourceDocsOf, appliedDocOf, coverageOf, applyMapping, readPath,
  promptFieldsFor, MAX_INJECTED_CHARS,
  customSegmentsOf, addCustomSegment, removeCustomSegment, updateCustomSegment,
  MAX_CUSTOM_SEGMENTS, MAX_CUSTOM_SEGMENT_FIELDS,
  MAX_CUSTOM_SEGMENT_TITLE_CHARS, MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS,
} from "../core/positioning/positioningDocs";

const STORAGE_ROOT =
  process.env.POSITIONING_DOC_DIR ?? join(process.cwd(), "storage", "positioning-docs");

const scopeInput = z.object({
  brandId: z.number(),
  scope: z.enum(["brand", "product", "event"]),
  scopeId: z.number(),
});

/** 產品／活動也要屬於同一個使用者。品牌本身由 positioning 讀寫時的 userId 條件擋住。 */
async function assertScope(userId: number, scope: PositioningScope, scopeId: number): Promise<void> {
  const table = scope === "brand" ? "brands" : scope === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(
    `SELECT id FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`, [scopeId, userId],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${scope} #${scopeId} 不存在或不屬於這個帳號` });
  }
}

interface ExtractedDoc {
  name: string; kind: string; chars: number;
  sections: { level: number; heading: string; body: string }[];
  text: string;
}

async function readExtract(scope: PositioningScope, scopeId: number, docId: string): Promise<ExtractedDoc> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "bad docId" });
  }
  const path = join(STORAGE_ROOT, scope, String(scopeId), `${docId}.extract.json`);
  try {
    return JSON.parse(await fs.readFile(path, "utf-8"));
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "找不到這份文件的抽取結果，請重新上傳" });
  }
}

function shapeHint(f: PromptField): string {
  return f.shape === "text" ? '"字串"'
       : f.shape === "list" ? '["項目", "項目"]'
       : '[{"generic":"一般說法","ours":"我們的說法"}]';
}

/**
 * 值裡「真的需要逐字出自原文」的那部分是否通過 isVerbatim。pairs 形狀的 `generic`
 * 是刻意寫給模型的對照修辭（「一般說法」vs「我們的說法」），本來就不是原文引用，
 * 只有 `ours` 才是要保真的那格。
 */
function valueIsVerbatim(shape: PromptField["shape"], value: any, sourceText: string): boolean {
  if (shape === "text") return isVerbatim(String(value), sourceText);
  if (shape === "list") return (value as string[]).every((v) => isVerbatim(v, sourceText));
  return (value as { generic: string; ours: string }[]).every((p) => isVerbatim(p.ours, sourceText));
}

/** LLM 回傳的值收斂成該欄位宣告的形狀；對不上就丟掉（寧可少一格也不要壞資料）。 */
function coerce(f: PromptField, raw: any): any | undefined {
  if (f.shape === "text") {
    const s = typeof raw === "string" ? raw.trim() : "";
    return s.length >= 2 ? s : undefined;
  }
  if (f.shape === "list") {
    const arr = Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x.trim()) : [];
    return arr.length ? arr.map((x: string) => x.trim()).slice(0, 20) : undefined;
  }
  const pairs = Array.isArray(raw)
    ? raw.filter((p: any) => p && typeof p.ours === "string" && p.ours.trim())
         .map((p: any) => ({ generic: String(p.generic ?? "").trim(), ours: String(p.ours).trim() }))
    : [];
  return pairs.length ? pairs.slice(0, 8) : undefined;
}

function segmentOf(path: string): [string, string] {
  const i = path.indexOf(".");
  return [path.slice(0, i), path.slice(i + 1)];
}

/** 同 brandTaskCards.ts 的 normalizeForMatch——忽略空白與 markdown 符號差異，不忽略內容差異。 */
function normalizeForMatch(t: string): string {
  return t.replace(/[\s　]+/g, "").replace(/[*_`~]/g, "").trim();
}

/**
 * 「只准引用，不准創作」的確定性版本。2026-09-04 在 brandTaskCards 那邊實測過：
 * prompt 明文禁止之後，模型還是會順手把抽出來的內容「整理得更好」。定位欄位比
 * task-card 的貼文樣本更容易被悄悄改寫（模型很愛把「25-35 歲的年輕人」順成
 * 「25 到 35 歲的年輕族群」），而定位是所有任務的上游——一句被改寫過的受眾描述
 * 會透過 buildBrandPrefix 污染每一張後續產出的卡。純 prompt 擋不住的東西就別
 * 只靠 prompt：每一個值都必須整段（正規化空白/符號後）出現在原文裡。
 */
function isVerbatim(value: string, sourceText: string): boolean {
  const needle = normalizeForMatch(value);
  return needle.length >= 2 && normalizeForMatch(sourceText).includes(needle);
}

export const positioningDocsRouter = router({
  /**
   * 目前的落差 —— 不需要先上傳就能看。用戶第一次點進來就該知道
   * 「引擎會用到的 13 格，你現在有幾格」。
   */
  coverage: protectedProcedure
    .input(scopeInput.omit({ brandId: true }))
    .query(async ({ ctx, input }) => {
      await assertScope(ctx.user!.id, input.scope, input.scopeId);
      const pos = await loadPositioning(input.scope, input.scopeId, ctx.user!.id);
      const { filled, missing } = coverageOf(pos, input.scope);
      return {
        // 2026-10-04：filled 連同目前的值一起回，產品視窗要把「AI 讀到的定位」全部列出來。
        filled: filled.map((f) => ({ ...f, value: readPath(pos, f.path) })),
        missing,
        total: filled.length + missing.length,
        docs: sourceDocsOf(pos),
        applied: appliedDocOf(pos),
        customSegments: customSegmentsOf(pos),
      };
    }),

  /**
   * 對映提案。回傳的東西一格都還沒寫進資料庫。
   */
  propose: protectedProcedure
    .input(scopeInput.omit({ brandId: true }).extend({ docId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertScope(ctx.user!.id, input.scope, input.scopeId);
      const doc = await readExtract(input.scope, input.scopeId, input.docId);
      const fields = promptFieldsFor(input.scope);

      const sectionText = doc.sections
        .map((s, i) => `[S${i}] ${s.heading || "(無標題)"}\n${s.body}`)
        .join("\n\n")
        .slice(0, 60_000);

      const targets = fields
        .map((f) => `- ${f.path}（${f.label}）值的形狀：${shapeHint(f)}`)
        .join("\n");

      const scopeLabel = input.scope === "brand" ? "品牌" : input.scope === "product" ? "產品" : "活動";
      const sys = `你在把使用者貼上或上傳的一份${scopeLabel}定位素材，對映到系統的欄位。繁體中文。

【這份素材可能是什麼】
可能是一份正式寫好的定位文件，也可能是使用者貼上的一整段 AI 對話紀錄（他之前在 ChatGPT / Claude /
Gemini 裡已經跟 AI 討論過這個${scopeLabel}的定位）。如果看起來是後者，請先在心裡把它清乾淨：
- 略過使用者自己下的指令與追問（「幫我想一下受眾」「這段改短一點」）
- 略過 AI 的解釋、開場白、收尾詢問（「好的，這是我的分析」「需要我再調整嗎？」）
- 同一個主題被討論、修改了很多次的，只取**最後定案**的那個版本，不要取中途被取代的舊版
- 略過大綱、條列建議、比較分析這類過程性文字，只取**已經確定下來的結論**

【最重要的規則：只准引用，不准創作，一字不改】
每一格的值都必須**逐字**出自下方原文——可以節錄、可以把相鄰的句子接起來、可以去掉贅字或講者標籤，
但不可以換句話說、不可以把用詞「順一遍」。例如原文寫「25-35 歲的年輕人」，輸出就必須是「25-35 歲的
年輕人」這幾個字，不可以變成「25 到 35 歲的年輕族群」——即使後者讀起來更通順。你也**不可以寫出原文
沒有的主張**。文件沒講到的欄位就整格不要出現在輸出裡：少填一格會被誠實標成「你的文件沒有這項」；
編一句出來則會直接變成這個${scopeLabel}對外的說法，後續每一篇文案都會沿用它。前者可以補，後者是污染。

【要對映的固定欄位】
${targets}

【內容套不進任何固定欄位時：提議開一張新卡，不要硬塞】
如果有一整段內容明顯是這個${scopeLabel}定位的一部分、資訊量足夠自成一塊（例如「品牌願景」「供應鏈
故事」「創辦緣由的第二層」），但完全套不進上面任何一個固定欄位，不要硬塞進最接近的欄位、也不要
丟進 unmappedSections 當成無結構的補充文字——改成在 "suggestedSegments" 裡提議開一張新卡，把這段
內容拆成 2-6 個「欄位名稱＋值」，值一樣要逐字引用原文。內容太單薄（一兩句話講不清楚是什麼主題）的
不要硬建卡，留在 unmappedSections 當補充段落即可。最多提議 3 張新卡。

【輸出 JSON】
{
  "mappings": [
    { "path": "欄位路徑", "value": <照該欄位宣告的形狀>, "from": "S3", "quote": "原文裡最能佐證的一句（≤60 字）" }
  ],
  "suggestedSegments": [
    { "title": "卡片名稱（≤${MAX_CUSTOM_SEGMENT_TITLE_CHARS}字，例如「品牌願景」）",
      "fields": [ { "label": "欄位名稱", "value": "逐字引用原文的值" } ],
      "from": "S5" }
  ],
  "unmappedSections": ["S7"]
}
- "from" 是主要依據哪一節的編號（S0、S1…）。
- "unmappedSections" 是內容有意義、但既對不到任何固定欄位、也不足以自成一張新卡的節 —— 那些會
  另外整段餵進 prompt。
- 對不到的欄位就不要放進 mappings，不要放空字串；沒有值得提議的新卡就給空陣列。
直接輸出 JSON，第一個字元就是 {。`;

      let parsed: any = {};
      try {
        const r = await Promise.race([
          invokeLLM({
            messages: [
              { role: "system", content: sys },
              { role: "user", content: sectionText },
            ],
            maxTokens: 4000,
          }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 90_000)),
        ]);
        const raw = r.choices[0]?.message?.content;
        const text = typeof raw === "string" ? raw : "";
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("no JSON in response");
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch (err: any) {
        // 對映失敗要說出來。回一份空提案讓用戶以為「文件裡什麼都沒有」是最壞的結果。
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `對映失敗（${String(err?.message ?? err).slice(0, 200)}）— 文件已經存好了，可以重試對映`,
        });
      }

      const byPath = new Map(fields.map((f) => [f.path, f]));
      const seen = new Set<string>();
      const proposals: {
        path: string; label: string; shape: PromptField["shape"];
        value: any; fromHeading: string; quote: string; overwrites: any;
      }[] = [];
      const pos = await loadPositioning(input.scope, input.scopeId, ctx.user!.id);

      for (const m of Array.isArray(parsed.mappings) ? parsed.mappings : []) {
        const f = byPath.get(String(m?.path ?? ""));
        if (!f || seen.has(f.path)) continue;
        const value = coerce(f, m?.value);
        if (value === undefined) continue;
        if (!valueIsVerbatim(f.shape, value, doc.text)) {
          console.warn(`[positioningDocsRouter] propose: 「${f.path}」改寫過原文，丟棄不提案`);
          continue;
        }
        seen.add(f.path);
        const idx = parseInt(String(m?.from ?? "").replace(/^S/i, ""), 10);
        const [segId, fieldKey] = segmentOf(f.path);
        proposals.push({
          path: f.path, label: f.label, shape: f.shape, value,
          fromHeading: doc.sections[idx]?.heading || "",
          quote: String(m?.quote ?? "").slice(0, 120),
          // 已經有值的格要讓用戶知道自己在覆蓋什麼 —— 定位常常是先跑過 AI
          // 產生、之後才補上自己的文件。
          overwrites: (pos as any)?.[segId]?.[fieldKey] ?? null,
        });
      }

      // 2026-09-23：套不進固定欄位、但自成一塊的內容 —— 提議開新卡，使用者要另外
      // 呼叫 createCustomSegment 才會真的建立（同一條「提案，不是自動套用」規矩）。
      const existingCount = customSegmentsOf(pos).length;
      const roomLeft = Math.max(0, MAX_CUSTOM_SEGMENTS - existingCount);
      const suggestedSegments: {
        title: string; fromHeading: string;
        fields: { label: string; value: string }[];
      }[] = [];
      for (const s of Array.isArray(parsed.suggestedSegments) ? parsed.suggestedSegments : []) {
        if (suggestedSegments.length >= Math.min(3, roomLeft)) break;
        const title = String(s?.title ?? "").trim().slice(0, MAX_CUSTOM_SEGMENT_TITLE_CHARS);
        if (!title) continue;
        const rawFields = Array.isArray(s?.fields) ? s.fields : [];
        const segFields: { label: string; value: string }[] = [];
        for (const rf of rawFields) {
          if (segFields.length >= MAX_CUSTOM_SEGMENT_FIELDS) break;
          const label = String(rf?.label ?? "").trim().slice(0, 40);
          const value = String(rf?.value ?? "").trim().slice(0, MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS);
          if (!label || !value) continue;
          if (!isVerbatim(value, doc.text)) {
            console.warn(`[positioningDocsRouter] propose: 新卡「${title}」的「${label}」改寫過原文，該欄位丟棄`);
            continue;
          }
          segFields.push({ label, value });
        }
        if (segFields.length === 0) continue; // 整張卡沒有一格通過驗證就不提議
        const idx = parseInt(String(s?.from ?? "").replace(/^S/i, ""), 10);
        suggestedSegments.push({ title, fromHeading: doc.sections[idx]?.heading || "", fields: segFields });
      }

      const usedIdx = new Set(
        (Array.isArray(parsed.unmappedSections) ? parsed.unmappedSections : [])
          .map((s: any) => parseInt(String(s).replace(/^S/i, ""), 10))
          .filter((n: number) => Number.isFinite(n)),
      );
      const unmapped = doc.sections
        .map((s, i) => ({ index: i, heading: s.heading || "(無標題段落)", chars: s.body.length }))
        .filter((s) => usedIdx.has(s.index) && s.chars > 0);

      const missing = fields.filter((f) => !seen.has(f.path));
      return {
        docId: input.docId, docName: doc.name,
        sectionCount: doc.sections.length,
        proposals, unmapped, missing, suggestedSegments,
        total: fields.length,
      };
    }),

  /**
   * 套用用戶確認過的對映。只寫他勾選的格。
   *
   * 不叫 `apply`：tRPC 把它列為保留字（撞 Function.prototype.apply），
   * router() 建構當下就丟 "Reserved words used in router({}) call"。
   * 那是啟動期例外 —— typecheck 與單元測試都是綠的，伺服器直接起不來。
   */
  applyMapping: protectedProcedure
    .input(scopeInput.omit({ brandId: true }).extend({
      docId: z.string(),
      accepted: z.array(z.object({ path: z.string(), value: z.any() })).max(40),
      /** 對不到欄位、但用戶要求照樣餵進 prompt 的節（section index）。 */
      injectSections: z.array(z.number().int().min(0)).max(40).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertScope(userId, input.scope, input.scopeId);
      const doc = await readExtract(input.scope, input.scopeId, input.docId);
      const fields = promptFieldsFor(input.scope);
      const byPath = new Map(fields.map((f) => [f.path, f]));

      const segments: Record<string, Record<string, any>> = {};
      const filled: string[] = [];
      for (const a of input.accepted) {
        const f = byPath.get(a.path);
        if (!f) continue;                       // 不在登錄表上的路徑一律不寫
        const value = coerce(f, a.value);
        if (value === undefined) continue;
        const [segId, fieldKey] = segmentOf(f.path);
        (segments[segId] ??= {})[fieldKey] = value;
        filled.push(f.path);
      }

      // 對不到欄位的原文段落 —— 這是「用戶有、但我們沒問」的內容不白上傳的那條路。
      let injected = "";
      for (const i of input.injectSections) {
        const s = doc.sections[i];
        if (!s) continue;
        const block = `【${s.heading || "補充"}】\n${s.body}`.trim();
        // 2026-09-29：原本是 break——某一段太長放不下時，它**和後面所有段落**都被丟掉，
        // 而且沒有任何提示。改成只跳過放不下的那一段，後面較短的段落照樣放。
        if (injected.length + block.length + 2 > MAX_INJECTED_CHARS) continue;
        injected += (injected ? "\n\n" : "") + block;
      }

      const applied: AppliedDocRecord = {
        docId: input.docId,
        name: doc.name,
        appliedAt: new Date().toISOString(),
        filled,
        missing: fields.filter((f) => !filled.includes(f.path)).map((f) => f.path),
        injectedContext: injected,
      };
      await applyMapping({ scope: input.scope, id: input.scopeId, userId, segments, applied });

      const pos = await loadPositioning(input.scope, input.scopeId, userId);
      const { filled: nowFilled, missing } = coverageOf(pos, input.scope);
      return { ok: true, applied, coverage: { filled: nowFilled, missing, total: fields.length } };
    }),

  /**
   * 2026-09-23（CJ「品牌定位…也可以自訂新增欄位，或是輸入 chatgpt 針對不同產品或品牌的討論」）：
   * 使用者確認 propose() 提議的其中一張新卡（可能先自己改過標題／欄位／值）之後，才真的建立。
   * 跟固定欄位的 applyMapping 是同一條「提案，不是自動套用」規矩——這裡不重新驗證逐字引用，
   * 因為使用者已經在審閱畫面看過、可能編輯過這份草稿了；verbatim 檢查的用途是擋住 LLM 自己
   * 亂編，不是限制使用者本人修改自己確認要存的內容。
   */
  createCustomSegment: protectedProcedure
    .input(scopeInput.omit({ brandId: true }).extend({
      title: z.string().min(1).max(MAX_CUSTOM_SEGMENT_TITLE_CHARS),
      fields: z.array(z.object({
        label: z.string().min(1).max(40),
        value: z.string().min(1).max(MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS),
      })).min(1).max(MAX_CUSTOM_SEGMENT_FIELDS),
      /** 這張卡是從哪份文件的提議來的；使用者手動新建則不傳。 */
      docId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertScope(userId, input.scope, input.scopeId);
      const pos = await loadPositioning(input.scope, input.scopeId, userId);
      if (customSegmentsOf(pos).length >= MAX_CUSTOM_SEGMENTS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `自訂卡片已達上限（${MAX_CUSTOM_SEGMENTS} 張），請先刪掉一張再建立新的` });
      }
      const seenKeys = new Set<string>();
      const fields = input.fields.map((f, i) => {
        let key = f.label.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "_").replace(/^_+|_+$/g, "");
        if (!key) key = `field_${i + 1}`;
        while (seenKeys.has(key)) key = `${key}_${i + 1}`;
        seenKeys.add(key);
        return { key, label: f.label.trim(), value: f.value.trim() };
      });
      const segment: CustomSegment = {
        id: randomUUID(), title: input.title.trim(), fields,
        createdAt: new Date().toISOString(), sourceDocId: input.docId ?? null,
      };
      const list = await addCustomSegment({ scope: input.scope, id: input.scopeId, userId, segment });
      return { ok: true, segment, segments: list };
    }),

  /**
   * 改一張自訂卡的標題／內容。
   *
   * 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容，內容可以
   * 打字或是直接上傳文件」）：自訂卡在這之前只能建立與刪除，改一個字要刪掉重建。
   * 欄位上限與 createCustomSegment 同一組常數——同一種資料不該有兩套規則。
   */
  updateCustomSegment: protectedProcedure
    .input(scopeInput.omit({ brandId: true }).extend({
      segmentId: z.string(),
      title: z.string().min(1).max(MAX_CUSTOM_SEGMENT_TITLE_CHARS),
      fields: z.array(z.object({
        label: z.string().min(1).max(40),
        value: z.string().min(1).max(MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS),
      })).min(1).max(MAX_CUSTOM_SEGMENT_FIELDS),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertScope(userId, input.scope, input.scopeId);
      const pos = await loadPositioning(input.scope, input.scopeId, userId);
      if (!customSegmentsOf(pos).some((s) => s.id === input.segmentId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡片" });
      }
      const seenKeys = new Set<string>();
      const fields = input.fields.map((f, i) => {
        let key = f.label.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "_").replace(/^_+|_+$/g, "");
        if (!key) key = `field_${i + 1}`;
        while (seenKeys.has(key)) key = `${key}_${i + 1}`;
        seenKeys.add(key);
        return { key, label: f.label.trim(), value: f.value.trim() };
      });
      const list = await updateCustomSegment({
        scope: input.scope, id: input.scopeId, userId,
        segmentId: input.segmentId, title: input.title.trim(), fields,
      });
      return { ok: true, segments: list };
    }),

  /** 使用者建錯了、或想重來——刪掉一張自訂卡。固定欄位沒有對應動作，那些是 schema 的一部分。 */
  removeCustomSegment: protectedProcedure
    .input(scopeInput.omit({ brandId: true }).extend({ segmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertScope(userId, input.scope, input.scopeId);
      const list = await removeCustomSegment({ scope: input.scope, id: input.scopeId, userId, segmentId: input.segmentId });
      return { ok: true, segments: list };
    }),
});
