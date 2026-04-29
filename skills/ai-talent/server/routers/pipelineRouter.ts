/**
 * pipelineRouter — runs one step of the brand / product / event
 * positioning research pipeline. Per CJ direction 2026-04-29:
 *   - Each step has a researchBudget (minUrls OR minChars; OR semantics).
 *   - The OpenClaw gateway agent has web_search baked in; we instruct it
 *     to satisfy the budget before producing the conclusion.
 *   - All sources are persisted to positioning._research[segmentId]
 *     scoped to the active brand/product/event id, so re-runs hit cache.
 *   - The runner returns { thinking, conclusion, sources, charCount }.
 *     The client's ThinkingOverlay replays the thinking with a typewriter
 *     effect — server doesn't stream (SSE wiring is Phase 6b).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { callLLM } from "../_core/llmRouter";

// ── Helpers ────────────────────────────────────────────────────────────────
async function readPositioning(
  kind: "brand" | "product" | "event",
  id: number,
  userId: number,
): Promise<any> {
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(
    `SELECT positioning FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
    [id, userId],
  );
  const raw = (rows?.[0]?.positioning ?? null) as any;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

async function writePositioning(
  kind: "brand" | "product" | "event",
  id: number,
  userId: number,
  positioning: any,
): Promise<void> {
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  await localPool.execute(
    `UPDATE \`${table}\` SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(positioning), id, userId],
  );
}

interface ResearchSource {
  url: string;
  title: string;
  charCount: number;
  excerpt: string;
}
interface StepResult {
  thinking: string;
  conclusion: any;
  sources: ResearchSource[];
}

/**
 * Parse the agent's JSON response. Agent is instructed to return:
 *   { "thinking": "...", "conclusion": {...}, "sources": [...] }
 * Falls back to {thinking: raw, conclusion: null, sources: []} if parse fails.
 */
function parseAgentResponse(raw: string): StepResult {
  // Try several extraction strategies — LLMs sometimes wrap the JSON
  // in prose ("Here's the analysis: { ... }") even when told otherwise.
  const candidates: string[] = [];
  // 1) Whole response, stripping markdown code fences
  candidates.push(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
  // 2) Code-fenced JSON block
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());
  // 3) Largest balanced { ... } in the response (greedy)
  const firstBrace = raw.indexOf("{");
  const lastBrace  = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      // Some agents return the conclusion fields at top level (no
      // "conclusion" wrapper). Fall back to the whole object.
      const conclusion = obj?.conclusion ?? (
        // detect: if the object has "thinking" and other domain keys,
        // assume the non-thinking/sources keys form the conclusion
        Object.keys(obj).some((k) => k !== "thinking" && k !== "sources" && k !== "conclusion")
          ? Object.fromEntries(Object.entries(obj).filter(([k]) => k !== "thinking" && k !== "sources"))
          : null
      );
      return {
        thinking: String(obj?.thinking ?? ""),
        conclusion: conclusion ?? null,
        sources: Array.isArray(obj?.sources) ? obj.sources.map((s: any) => ({
          url: String(s?.url ?? ""),
          title: String(s?.title ?? ""),
          charCount: Number(s?.charCount ?? 0),
          excerpt: String(s?.excerpt ?? "").slice(0, 800),
        })).filter((s: ResearchSource) => s.url) : [],
      };
    } catch { /* try next candidate */ }
  }

  // All candidates failed to parse — log diagnostic
  // eslint-disable-next-line no-console
  console.warn(`[pipeline] LLM returned non-JSON response (${raw.length} chars):`, raw.slice(0, 500));
  return { thinking: raw, conclusion: null, sources: [] };
}

function totalCharCount(sources: ResearchSource[]): number {
  return sources.reduce((acc, s) => acc + (s.charCount || 0), 0);
}

// ── Router ────────────────────────────────────────────────────────────────
export const pipelineRouter = router({
  /**
   * Run one step. Looks up the active scope, calls the OpenClaw gateway
   * agent with web_search instructions (satisfying minUrls OR minChars),
   * persists sources to positioning._research[segId] and conclusion to
   * positioning[segId]. Returns the parsed result so the UI can replay
   * the thinking text via the typewriter overlay.
   */
  runStep: protectedProcedure
    .input(z.object({
      kind: z.enum(["brand", "product", "event"]),
      id: z.number(),
      stepId: z.number(),
      segmentId: z.string(),
      agent: z.string(),
      title: z.string(),
      systemHint: z.string().optional(),
      budget: z.object({
        minUrls:  z.number().min(0),
        minChars: z.number().min(0),
      }),
      /** Sample conclusion structure — pinned to the LLM prompt so it
       *  returns exactly the right JSON shape for this segment. */
      schemaHint: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // Read scope to give agent context of the brand/product/event so far.
      const positioning = await readPositioning(input.kind, input.id, userId);
      const research = (positioning._research as any) ?? {};

      // Fetch the entity name + industry for context.
      const table = input.kind === "brand" ? "brands"
                  : input.kind === "product" ? "products" : "events";
      const [rows]: any = await localPool.execute(
        `SELECT name, ${input.kind === "brand" ? "industry" : "name AS industry"}
           FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, userId],
      );
      if (!rows?.[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `${input.kind} #${input.id} not found` });
      }
      const entityName = String(rows[0].name ?? "");
      const industry   = String(rows[0].industry ?? "");

      // Substitute placeholders in the CJ-spec promptTemplate
      // ({brand_name} / {industry} / {description}) with real entity data.
      const description = (() => {
        const meta = (positioning as any)?._meta;
        return String(meta?.description ?? "（無補充描述）");
      })();
      const taskPrompt = (input.systemHint ?? input.title)
        .replace(/\{brand_name\}/g, entityName)
        .replace(/\{industry\}/g, industry || "未指定")
        .replace(/\{description\}/g, description);

      const schemaExample = input.schemaHint != null
        ? JSON.stringify(input.schemaHint, null, 2)
        : "{}";

      // System: enforce strict JSON output. User: the actual CJ-spec task.
      const sys = `你是 SoWork 品牌定位分析師（zh-TW）。請依照使用者訊息中的任務指示執行分析。

【輸出格式 — 嚴格 JSON，不要任何前綴/後綴/markdown code fence】
你的回應**必須**是合法 JSON 字串，三個 top-level keys：
- "thinking" (string, 500-2000 字推理過程)
- "conclusion" (object, 結構必須完全符合下方範例的 keys)
- "sources" (array of {url,title,charCount,excerpt}，可空陣列)

conclusion 範例（segment "${input.segmentId}"，依此 keys 填入真實內容；欄位 key 保持英文，value 用繁體中文）：
${schemaExample}

研究預算（OR 邏輯，滿足任一即可）：
- minUrls=${input.budget.minUrls}
- minChars=${input.budget.minChars}
${input.budget.minUrls === 0 && input.budget.minChars === 0 ? "→ 此步驟為內部蒸餾，不需 web 資訊，基於既有 context 推理。" : "→ 可參考 web 資訊；如有來源請列在 sources[]。"}

注意：直接 raw JSON，不要 \`\`\`json 圍籬，不要 prose 前綴。conclusion 不能是空 object。`;

      const user = `${taskPrompt}

【已有 positioning context（如有）】
${JSON.stringify(positioning, null, 2).slice(0, 6000)}

請直接以合法 JSON 回應，conclusion 結構嚴格依系統訊息中的範例。`;

      // LLM call with cross-provider fallback (Anthropic → Azure Foundry
      // → Azure OpenAI → OpenRouter). Single provider failure won't block.
      let raw = "";
      try {
        const result = await callLLM({ system: sys, user, maxTokens: 4000 });
        raw = result.text;
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      if (!raw) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LLM returned empty response",
        });
      }

      const parsed = parseAgentResponse(raw);

      // Persist conclusion + sources + wizard meta scoped to entity id.
      // Only mark wizard meta + write conclusion when parse succeeded —
      // otherwise we'd flag a segment as "Wizard 自動產出" with empty
      // fields, which is exactly the bug CJ caught (Step 7 stuck).
      const nextPositioning = { ...positioning };
      const conclusionSaved = parsed.conclusion != null && Object.keys(parsed.conclusion).length > 0;
      if (conclusionSaved) {
        nextPositioning[input.segmentId] = parsed.conclusion;
        const meta = (nextPositioning._wizardMeta as any) ?? {};
        meta[input.segmentId] = {
          wroteAt: new Date().toISOString(),
          stepId: input.stepId,
          agent: input.agent,
          title: input.title,
        };
        nextPositioning._wizardMeta = meta;
      }
      const nextResearch = { ...research };
      const segResearch = (nextResearch[input.segmentId] as any) ?? { sources: [], totalUrls: 0, totalChars: 0 };
      const mergedSources = [...(segResearch.sources ?? []), ...parsed.sources]
        // dedupe by url
        .filter((s, i, arr) => arr.findIndex((x: any) => x.url === s.url) === i);
      const totalChars = totalCharCount(mergedSources);
      nextResearch[input.segmentId] = {
        sources: mergedSources,
        totalUrls: mergedSources.length,
        totalChars,
        budget: input.budget,
        satisfied: {
          urls:  mergedSources.length >= input.budget.minUrls,
          chars: totalChars         >= input.budget.minChars,
        },
        finishedAt: new Date().toISOString(),
      };
      nextPositioning._research = nextResearch;

      await writePositioning(input.kind, input.id, userId, nextPositioning);

      return {
        thinking:   parsed.thinking,
        conclusion: parsed.conclusion,
        sources:    parsed.sources,
        totalUrls:  mergedSources.length,
        totalChars,
        budgetMet:  nextResearch[input.segmentId].satisfied,
      };
    }),
});
