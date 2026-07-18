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
        // For events `industry` doesn't apply — fetch startAt/endAt instead.
        // Brand has industry, product/event don't (events have date range).
        input.kind === "brand"
          ? `SELECT name, industry FROM brands WHERE id = ? AND userId = ? LIMIT 1`
          : input.kind === "product"
          ? `SELECT name, '' AS industry FROM products WHERE id = ? AND userId = ? LIMIT 1`
          : `SELECT name, '' AS industry, startAt, endAt, brandId FROM events WHERE id = ? AND userId = ? LIMIT 1`,
        [input.id, userId],
      );
      if (!rows?.[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `${input.kind} #${input.id} not found` });
      }
      const entityName = String(rows[0].name ?? "");
      const industry   = String(rows[0].industry ?? "");
      const eventStartAt = input.kind === "event" ? rows[0].startAt : null;
      const eventEndAt   = input.kind === "event" ? rows[0].endAt   : null;

      // Substitute placeholders in the CJ-spec promptTemplate
      // ({brand_name} / {industry} / {description} / {event_name} /
      //  {event_period}) with real entity data. CJ caught the bug 2026-04-29:
      // intake agent saw "no concrete event name" because the placeholders
      // weren't being filled — event name was thrown into the {industry}
      // slot instead of {event_name}.
      const description = (() => {
        const meta = (positioning as any)?._meta;
        return String(meta?.description ?? "（無補充描述）");
      })();
      const formatDate = (d: any): string => {
        if (!d) return "";
        try {
          if (d instanceof Date) return d.toISOString().split("T")[0]!;
          return String(d).split("T")[0] ?? String(d);
        } catch { return String(d); }
      };
      const eventPeriod = input.kind === "event"
        ? `${formatDate(eventStartAt) || "(未填)"} ~ ${formatDate(eventEndAt) || "(未填)"}`
        : "";
      const taskPrompt = (input.systemHint ?? input.title)
        .replace(/\{brand_name\}/g, entityName)
        .replace(/\{event_name\}/g, entityName)
        .replace(/\{event_period\}/g, eventPeriod)
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

      // Strip server-side metadata before exposing context to LLM —
      // otherwise LLM may copy origin's research sources/URLs into its
      // own sources[] (CJ caught this: every segment showed origin's
      // 7524 chars). Only segment-level positioning content goes through.
      const cleanContext = (() => {
        const out: any = { ...positioning };
        delete out._research;     // research evidence — not for LLM
        delete out._wizardMeta;   // bookkeeping
        delete out._meta;         // create-time metadata
        return out;
      })();

      // ── Event metadata block: ALWAYS inject for event scope ─────────────
      // Without this, intake agent sees the prompt say "based on activity
      // name and period" but never gets told what they actually are. CJ
      // caught the bug 2026-04-29: "明明標題有寫活動名稱，但 intake 卻說
      // 沒有具體名字" → eventId 資訊沒被帶到 intake agent.
      let eventMetaBlock = "";
      if (input.kind === "event") {
        const lines = [
          `【活動名稱】${entityName}`,
          eventPeriod ? `【活動期間】${eventPeriod}` : null,
        ].filter(Boolean);
        eventMetaBlock = `\n\n${lines.join("\n")}`;
      }

      // ── Event scope: extra context injections ────────────────────────────
      // CJ direction 2026-04-29 — 11-step event pipeline needs 3 distinct
      // injection types depending on which segment is running:
      //
      //   1. brief       → inject parent brand + (multi) product positioning
      //                    so intake agent has full strategic context
      //   2. awards      → inject award_frameworks + recent creative_cases (RAG)
      //   3. creative    → inject award_frameworks + Grand Prix / Gold cases (RAG)
      //   4. guidelines  → inject brand visual + voice + website tone signals
      let parentBrandProductBlock = "";
      let brandAssetsBlock = "";

      if (input.kind === "event" && (input.segmentId === "brief" || input.segmentId === "context"
                                  || input.segmentId === "audience" || input.segmentId === "objectives"
                                  || input.segmentId === "smp" || input.segmentId === "messaging"
                                  || input.segmentId === "creative" || input.segmentId === "guidelines"
                                  || input.segmentId === "channels" || input.segmentId === "journey")) {
        try {
          // Parent brand: events.brandId → brands.positioning
          const [evRows]: any = await localPool.execute(
            `SELECT brandId, productId FROM events WHERE id = ? AND userId = ? LIMIT 1`,
            [input.id, ctx.user!.id],
          );
          const ev = (evRows as any[])?.[0];
          const parts: string[] = [];
          if (ev?.brandId) {
            const [bRows]: any = await localPool.execute(
              `SELECT name, industry, description, positioning FROM brands WHERE id = ? LIMIT 1`,
              [ev.brandId],
            );
            const brand = (bRows as any[])?.[0];
            if (brand) {
              const bPos = (typeof brand.positioning === "string"
                ? (() => { try { return JSON.parse(brand.positioning); } catch { return {}; } })()
                : (brand.positioning ?? {}));
              const cleanBrand = { ...bPos };
              delete cleanBrand._research;
              delete cleanBrand._wizardMeta;
              delete cleanBrand._meta;
              parts.push(`【父品牌】${brand.name}${brand.industry ? `（${brand.industry}）` : ""}\n${(brand.description ?? "").slice(0, 500)}\n品牌定位 JSON：\n${JSON.stringify(cleanBrand, null, 2).slice(0, 4000)}`);
            }
          }
          // Linked products: prefer m:n event_products, fall back to single productId
          const [epRows]: any = await localPool.execute(
            `SELECT productId FROM event_products WHERE eventId = ?`,
            [input.id],
          );
          const productIds: number[] = (epRows as any[]).map((r) => Number(r.productId));
          if (productIds.length === 0 && ev?.productId) productIds.push(Number(ev.productId));
          for (const pid of productIds.slice(0, 4)) { // cap at 4 for context size
            const [pRows]: any = await localPool.execute(
              `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
              [pid],
            );
            const prod = (pRows as any[])?.[0];
            if (prod) {
              const pPos = (typeof prod.positioning === "string"
                ? (() => { try { return JSON.parse(prod.positioning); } catch { return {}; } })()
                : (prod.positioning ?? {}));
              const cleanProd = { ...pPos };
              delete cleanProd._research;
              delete cleanProd._wizardMeta;
              delete cleanProd._meta;
              parts.push(`【對應產品】${prod.name}\n產品定位 JSON：\n${JSON.stringify(cleanProd, null, 2).slice(0, 2500)}`);
            }
          }
          if (parts.length > 0) {
            parentBrandProductBlock = `\n\n${parts.join("\n\n")}`;
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[pipeline] parent brand/product injection failed:", e);
        }
      }

      // Step 9 guidelines: pull brand visual + voice + website tone signals
      if (input.kind === "event" && input.segmentId === "guidelines") {
        try {
          const [evRows]: any = await localPool.execute(
            `SELECT brandId FROM events WHERE id = ? AND userId = ? LIMIT 1`,
            [input.id, ctx.user!.id],
          );
          const ev = (evRows as any[])?.[0];
          if (ev?.brandId) {
            const [bRows]: any = await localPool.execute(
              `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
              [ev.brandId],
            );
            const brand = (bRows as any[])?.[0];
            const bPos = (typeof brand?.positioning === "string"
              ? (() => { try { return JSON.parse(brand.positioning); } catch { return {}; } })()
              : (brand?.positioning ?? {}));
            // Look for known visual / voice segment keys (brand schema:
            // visual_assets / tone_voice). Be permissive about key naming
            // since brand schema has evolved.
            const visualSegment = bPos.visual_assets ?? bPos.visualAssets ?? bPos.visual ?? null;
            const voiceSegment  = bPos.tone_voice ?? bPos.toneVoice ?? bPos.voice ?? null;
            const visualText = visualSegment ? JSON.stringify(visualSegment, null, 2) : "（未填寫）";
            const voiceText  = voiceSegment ? JSON.stringify(voiceSegment, null, 2) : "（未填寫）";
            const sparseWarning = (
              (!visualSegment || JSON.stringify(visualSegment).length < 300) &&
              (!voiceSegment  || JSON.stringify(voiceSegment).length  < 300)
            ) ? "\n⚠ 注意：品牌視覺 + 聲音語氣資料稀疏（合計不足 300 字）。請在 conclusion.sourceWarning 提示用戶先完成品牌定位 step 9（聲音語氣）+ step 13（視覺資產）再 rerun。"
              : "";
            brandAssetsBlock = `\n\n【父品牌視覺資產】\n${visualText}\n\n【父品牌聲音語氣】\n${voiceText}${sparseWarning}`;
            // Note: brand website tone fetch is intentionally skipped in
            // server-side fetch here — gateway agent's web_search will pull
            // it via the brief.relatedSites URLs naturally.
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[pipeline] guidelines brand assets injection failed:", e);
        }
      }

      // Event scope award injection: now triggered on `awards` (step 5)
      // and `creative` (step 8 — replaces old `solution` segId).
      let awardContextBlock = "";
      if (input.kind === "event" && (input.segmentId === "awards" || input.segmentId === "creative")) {
        try {
          const [frameworks]: any = await localPool.execute(
            `SELECT name, category, description, suitableFor FROM award_frameworks ORDER BY id ASC`
          );
          // For step 5 (awards segment):  pull recent cases per award (3 each)
          // For step 8 (creative segment): pull Grand Prix / Gold benchmark
          // (Old segIds: "awards" / "solution" — new: "awards" / "creative")
          const isStep2 = input.segmentId === "awards";
          const namePatterns = (frameworks as any[]).map((f) => f.name);
          let casesByAward: Record<string, any[]> = {};
          for (const name of namePatterns) {
            const sql = isStep2
              ? `SELECT brand, year, award_level, sub_category, description, source_url
                   FROM creative_cases
                  WHERE award_name LIKE CONCAT('%', SUBSTRING_INDEX(?, ' (', 1), '%')
                  ORDER BY year DESC, FIELD(award_level, 'Grand Prix', 'Gold', 'Silver', 'Bronze') ASC
                  LIMIT 3`
              : `SELECT brand, year, award_level, sub_category, description, source_url
                   FROM creative_cases
                  WHERE award_name LIKE CONCAT('%', SUBSTRING_INDEX(?, ' (', 1), '%')
                    AND award_level IN ('Grand Prix', 'Gold')
                  ORDER BY year DESC LIMIT 5`;
            const [rows]: any = await localPool.execute(sql, [name]);
            casesByAward[name] = (rows as any[]) ?? [];
          }
          const blocks = (frameworks as any[]).map((f) => {
            const cases = casesByAward[f.name] ?? [];
            const casesText = cases.length === 0
              ? "  （資料庫尚無案例）"
              : cases.map((c: any) => `  • ${c.brand ?? "?"} [${c.award_level ?? ""}] ${c.year ?? ""}${c.sub_category ? ` (${c.sub_category})` : ""} — ${(c.description ?? "").slice(0, 200)}${c.source_url ? `\n    ${c.source_url}` : ""}`).join("\n");
            return `▸ ${f.name}（${f.category ?? ""}）\n  ${(f.description ?? "").slice(0, 200)}\n${casesText}`;
          }).join("\n\n");
          awardContextBlock = `\n\n【可選獎項清單 + 注入案例】\n${blocks}`;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[pipeline] award context injection failed:", e);
        }
      }

      const user = `${taskPrompt}${eventMetaBlock}

【已有 positioning context（前面步驟的 conclusion）】
${JSON.stringify(cleanContext, null, 2).slice(0, 6000)}${parentBrandProductBlock}${brandAssetsBlock}${awardContextBlock}

注意：上面只是其他段落的結論，不要當成本步驟的 sources。本步驟的 sources[] 必須是你自己 web_search 抓到的新 URL，不可複製其他段落的引用清單。

請直接以合法 JSON 回應，conclusion 結構嚴格依系統訊息中的範例。`;

      // LLM call with cross-provider fallback (Anthropic → Azure Foundry
      // → Azure OpenAI → OpenRouter). Single provider failure won't block.
      let raw = "";
      try {
        const result = await callLLM({ system: sys, user, maxTokens: 4000 });
        raw = result.text;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        // 2026-07-19 (CJ 定位時連續看到「credit balance too low」原始錯誤):
        // billing/quota outages get a human message — the raw provider dump
        // (key names, API bodies) belongs in error_log, not in a user toast.
        const isBilling = /credit\s*balance|insufficient|quota|402|billing/i.test(detail);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: isBilling
            ? "AI 供應商額度暫時不足，系統已自動通報團隊。請過幾分鐘再重試這一步（進度不會遺失）。"
            : `LLM call failed: ${detail.slice(0, 300)}`,
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
      // Only mark wizard meta + write conclusion when parse succeeded.
      // CJ-caught bug: audience has 3 steps (6/7/8) writing same segment;
      // last step's narrow conclusion ({matrix:...}) was overwriting
      // earlier {primary,secondary,...}. MERGE instead of replace so
      // each step augments the segment.
      const nextPositioning = { ...positioning };
      const conclusionSaved = parsed.conclusion != null && Object.keys(parsed.conclusion).length > 0;
      if (conclusionSaved) {
        const existing = (nextPositioning[input.segmentId] as any) ?? {};
        // Shallow merge — top-level keys from new step overwrite, others
        // preserved. Good for additive (matrix on top of primary/secondary).
        nextPositioning[input.segmentId] = { ...existing, ...parsed.conclusion };
        const meta = (nextPositioning._wizardMeta as any) ?? {};
        meta[input.segmentId] = {
          wroteAt: new Date().toISOString(),
          stepId: input.stepId,
          agent: input.agent,
          title: input.title,
          // SMP step is a checkpoint — UI uses this flag to gate
          // auto-advance and force the user to confirm before steps
          // 7-11 fire. Cleared (set to false) when user confirms.
          ...(input.kind === "event" && input.segmentId === "smp"
            ? { requiresUserApproval: true }
            : {}),
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
