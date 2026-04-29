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

// ── OpenClaw gateway (same env as orchestratorWorker) ────────────────────
const GATEWAY_HTTP = process.env.OPENCLAW_GATEWAY_HTTP ?? "http://localhost:18790";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "mos-pm-claw-2026";

async function callGateway(
  agentSlug: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: agentSlug, messages, stream: false }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gateway ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

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
  // Strip markdown code fences if present
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const obj = JSON.parse(cleaned);
    return {
      thinking: String(obj?.thinking ?? ""),
      conclusion: obj?.conclusion ?? null,
      sources: Array.isArray(obj?.sources) ? obj.sources.map((s: any) => ({
        url: String(s?.url ?? ""),
        title: String(s?.title ?? ""),
        charCount: Number(s?.charCount ?? 0),
        excerpt: String(s?.excerpt ?? "").slice(0, 800),
      })).filter((s: ResearchSource) => s.url) : [],
    };
  } catch {
    return { thinking: raw, conclusion: null, sources: [] };
  }
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
      agent: z.string(),               // openclaw gateway agent slug
      title: z.string(),
      systemHint: z.string().optional(), // optional override
      budget: z.object({
        minUrls:  z.number().min(0),
        minChars: z.number().min(0),
      }),
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

      // Build the prompt. Agent is on OpenClaw gateway with web_search.
      const sys = `你是 SoWork 品牌定位分析師。`
        + `任務：${input.title}\n`
        + `對象：${entityName}（${input.kind}，產業：${industry}）\n\n`
        + (input.systemHint ?? "")
        + `\n\n【研究預算（OR 邏輯，滿足任一即可）】`
        + `\n- minUrls=${input.budget.minUrls}（至少抓 ${input.budget.minUrls} 個 URL）`
        + `\n- minChars=${input.budget.minChars}（或累積 ${input.budget.minChars} 字內容）`
        + (input.budget.minUrls === 0 && input.budget.minChars === 0
            ? `\n→ 此步驟為內部分析，不需 web_search，直接基於既有 context 蒸餾。`
            : `\n→ 使用 web_search 工具直到滿足任一條件，記錄每個來源 URL / 標題 / charCount / excerpt。`)
        + `\n\n【已有 positioning context】\n${JSON.stringify(positioning, null, 2).slice(0, 8000)}\n`
        + `\n\n【輸出格式】嚴格回傳 JSON：`
        + `\n{"thinking":"完整推理過程（500-2000 字）","conclusion":{<符合 segment "${input.segmentId}" 的結構化資料>},"sources":[{"url":"...","title":"...","charCount":N,"excerpt":"..."}]}`
        + `\n語言：繁體中文（zh-TW）。conclusion JSON key 保持英文，value 用中文。`;

      const user = `請為 ${entityName}（${industry} 產業）執行：${input.title}。`
        + `\n生成符合 segment "${input.segmentId}" 結構的 conclusion JSON。`
        + `\n推理過程必須詳細（thinking ≥ 500 字），讓使用者看到分析邏輯。`;

      // Call gateway. Agent may or may not exist as openclaw/<slug>; fall
      // back to openclaw/pm which is the generic research agent.
      const slugCandidates = [`openclaw/${input.agent}`, "openclaw/pm"];
      let raw = "";
      let lastErr: any = null;
      for (const slug of slugCandidates) {
        try {
          raw = await callGateway(slug, [
            { role: "system", content: sys },
            { role: "user",   content: user },
          ]);
          if (raw) break;
        } catch (e) { lastErr = e; }
      }
      if (!raw) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Gateway call failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
        });
      }

      const parsed = parseAgentResponse(raw);

      // Persist conclusion + sources + wizard meta scoped to entity id.
      const nextPositioning = { ...positioning };
      if (parsed.conclusion != null) {
        nextPositioning[input.segmentId] = parsed.conclusion;
      }
      // Track which segments were written by the wizard (vs manually edited)
      // so the UI can badge them with "🤖 Wizard 自動產出".
      const meta = (nextPositioning._wizardMeta as any) ?? {};
      meta[input.segmentId] = {
        wroteAt: new Date().toISOString(),
        stepId: input.stepId,
        agent: input.agent,
        title: input.title,
      };
      nextPositioning._wizardMeta = meta;
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
