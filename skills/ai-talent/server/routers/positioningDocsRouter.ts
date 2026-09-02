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
import { router, protectedProcedure } from "../_core/trpc";
import { promises as fs } from "fs";
import { join } from "path";
import localPool from "../localDb";
import { invokeLLM } from "../_core/llm";
import {
  type PositioningScope, type PromptField, type AppliedDocRecord,
  loadPositioning, sourceDocsOf, appliedDocOf, coverageOf, applyMapping,
  promptFieldsFor, MAX_INJECTED_CHARS,
} from "../_core/positioningDocs";

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
        filled, missing,
        total: filled.length + missing.length,
        docs: sourceDocsOf(pos),
        applied: appliedDocOf(pos),
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
      const sys = `你在把一份「使用者自己寫的${scopeLabel}定位文件」對映到系統的欄位。繁體中文。

【最重要的規則：只准引用，不准創作】
每一格的值都必須來自下方文件的原文。你可以節錄、可以把相鄰的句子接起來、可以去掉贅字，
但**不可以寫出文件裡沒有的主張**。文件沒講到的欄位就整格不要出現在輸出裡。
少填一格會被誠實標成「你的文件沒有這項」；編一句出來則會直接變成這個${scopeLabel}對外的說法，
後續每一篇文案都會沿用它。前者可以補，後者是污染。

【要對映的欄位】
${targets}

【輸出 JSON】
{
  "mappings": [
    { "path": "欄位路徑", "value": <照該欄位宣告的形狀>, "from": "S3", "quote": "原文裡最能佐證的一句（≤60 字）" }
  ],
  "unmappedSections": ["S5", "S7"]
}
- "from" 是這個值主要來自哪一節的編號（S0、S1…）。
- "unmappedSections" 是內容有意義、但對不到任何欄位的節 —— 那些會另外整段餵進 prompt。
- 對不到的欄位就不要放進 mappings，不要放空字串。
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
        proposals, unmapped, missing,
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
        if (injected.length + block.length + 2 > MAX_INJECTED_CHARS) break;
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
});
