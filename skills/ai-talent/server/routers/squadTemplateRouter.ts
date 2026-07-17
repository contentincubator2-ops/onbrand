/**
 * squadTemplateRouter.ts — Squad 模板管理 + DB-driven 推薦 (mission 內執行的團隊)
 *
 * Renamed from squadRouter in Phase A (2026-04-18)
 * Purpose: Manages squad templates (the team composition recommendations) used within missions.
 *
 * Original header:
 * squadRouter.ts — Squad 生命週期管理 + DB-driven 推薦
 *
 * 查詢流程：
 *   getRecommendedSquads() — 從 517 個 squads 中，按 workspace + brand + mission 評分推薦 6 個
 *   getMembersById()       — 解析 squads.members JSON → 查 agents → 回傳真實成員 + workflow steps
 *   getAlternativeLeads()  — 其他 squad 的 lead agents（備選專家）
 *   getSquadBySlug()       — 透過 slug 查單一 squad（用於頁面重載後還原選中狀態）
 *
 * 執行流程：
 *   assemble()     — 用戶確認組隊 → 建立 squads + squad_agents 實例（支援 squadId 或 fallback 硬編碼）
 *   getStatus()    — 前端輪詢
 *   getAgents()    — 取得 squad_agents 實例清單
 *   squadLeadOpen()— Squad Lead 生成開場問題
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { normalizeTaskId, legacyTaskId } from "../_core/tierCompat";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import localPool from "../localDb";
import { sql } from "drizzle-orm";
import { callLLM } from "../_core/llmRouter";
import { randomBytes } from "crypto";
import { loadAgentContext } from "../agentContextLoader";
import { getSquadRequirements } from "../_core/squadRequirements";
import { getEmbedding, cosineSimilarity } from "../_core/embedding";
import { synthesizeAgentAsSquad, type AgentRow } from "../_core/agentSquadSynth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return fallback;
}

/** Sanitize a string for safe use in a SQL LIKE clause (escape %, _, \) */
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ── Live-run helpers (used by squad.runStepLive) ────────────────────────

/** Parse a positioning JSON column (string or object) safely. */
function parseJsonField(val: any): any {
  if (val == null) return {};
  if (typeof val === "object") return val;
  try { return JSON.parse(String(val)); } catch { return {}; }
}

/** Format positioning JSON into a context block, stripping noise keys. */
function formatPositioningContext(positioning: any, description: any, label = "品牌定位"): string {
  const cleaned = { ...(positioning ?? {}) };
  delete cleaned._research;
  delete cleaned._wizardMeta;
  delete cleaned._meta;
  const parts: string[] = [];
  if (description) parts.push(`【描述】${String(description).slice(0, 500)}`);
  if (Object.keys(cleaned).length > 0) {
    parts.push(`【${label}】\n${JSON.stringify(cleaned, null, 2).slice(0, 3000)}`);
  }
  return parts.join("\n");
}

/** Concrete schema example per (outputKind, mockupVariant) so LLM has
 *  a target shape for `conclusion`. Mirrors pipelineRouter's mockConclusion
 *  pattern — specific keys converge faster than free-form. */
function mockConclusionForStep(outputKind: string, mockupVariant?: string): any {
  switch (outputKind) {
    case "decision":
      // Intake or user-checkpoint outputs
      return {
        eventType: "brand|growth|conversion|hybrid",
        roleThisRound: "（一句話：本次 squad 對品牌的角色）",
        briefSummary: "（200 字內活動策略摘要）",
        gaps: ["（資料缺失項 1）", "（缺失項 2）"],
        confirmedFields: { "（key）": "（value）" },
      };
    case "text_strategic":
      // Research / context analysis
      return {
        keyFindings: ["（觀察 1）", "（觀察 2）", "（觀察 3）"],
        audiencePains: ["（痛點 1）", "（痛點 2）"],
        competitorGaps: ["（競品 pillar 空白 1）"],
        platformSignals: "（FB prime time / 演算法觀察）",
        strategyImplication: "（這些研究對 pillar 設計的啟發）",
      };
    case "structured_table":
      if (mockupVariant === "PillarTableMockup") {
        return {
          tilt: "（一句話 content tilt）",
          pillars: [{
            name: "（pillar 名稱）",
            hypothesis: "（為何這 pillar 適合）",
            ratio: 35,
            target_kpi: "saves|shares|reach|convert",
            sample_topics: ["主題 1", "主題 2", "主題 3", "主題 4", "主題 5"],
            visualDirection: "（這 pillar 的視覺方向，影響 image_brief）",
          }],
        };
      }
      if (mockupVariant === "CalendarGridMockup") {
        return {
          targetDateStart: "YYYY-MM-DD",
          targetDateEnd:   "YYYY-MM-DD",
          pillars: [{ name: "（pillar 名）", ratio: 35 }],
          entries: [{
            date: "YYYY-MM-DD",
            pillarIndex: 0,
            pillarName: "（pillar 名）",
            format: "post|reel|carousel|long-text|story",
            topic: "（主題）",
            eventAnchor: "（活動名，無則省略此欄）",
          }],
        };
      }
      return { items: [{ "（key）": "（value）" }] };
    case "text_content":
      return {
        briefs: [{
          date: "YYYY-MM-DD",
          pillarIndex: 0,
          pillarName: "（pillar）",
          format: "post|reel|carousel|long-text|story",
          hook: "（開場一句吸引眼球）",
          copy: "（200 字內主文）",
          cta: "（行動呼籲）",
          imageDirection: "（依該 pillar 的 visualDirection 寫的視覺方向）",
          eventAnchor: "（活動，無則省略）",
        }],
      };
    case "image_brief":
    case "video_brief":
      return {
        brief: "（視覺/影片 brief）",
        visualDirection: "（風格、色彩、構圖）",
        formatHints: ["1:1", "9:16"],
      };
    case "qa_review":
      return {
        verdict: "approved|needs_revision|pending",
        overallScore: 78,
        pillarChecks: [{ pillarName: "（pillar）", expectedRatio: 35, actualRatio: 33, score: 85, notes: "..." }],
        eventChecks: [{ eventName: "（活動）", posts: 4, expectedPosts: 4, score: 90, notes: "..." }],
        itemChecklist: [{ id: "voice", label: "品牌語氣", status: "pass|warning|fail", detail: "..." }],
      };
    default:
      return {};
  }
}

/** Per-outputKind LLM maxTokens — bigger steps need more; small steps
 *  shouldn't waste tokens (also reduces server timeout risk). */
function maxTokensForOutputKind(outputKind: string): number {
  switch (outputKind) {
    case "text_strategic":   return 3000;
    case "structured_table": return 3500;
    case "text_content":     return 6000;  // batch briefs (16-20 篇)
    case "qa_review":        return 2500;
    case "image_brief":
    case "video_brief":      return 1500;
    case "decision":         return 1500;
    default:                 return 2000;
  }
}

/** 3-strategy parser: whole / fenced ```json / greedy {…} */
function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  // 1) try whole
  try { return JSON.parse(raw); } catch {}
  // 2) try fenced
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // 3) greedy first {...} block
  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) {
    try { return JSON.parse(greedy[0]); } catch {}
  }
  return null;
}

/** Map parsed LLM conclusion → mockup-component-shaped data per outputKind.
 *  thinking + sources come from the envelope (not part of conclusion). */
function mapToMockupData(
  conclusion: any,
  outputKind: string,
  mockupVariant: string,
  rawText: string,
  thinking: string,
  sources: any[],
): any {
  if (!conclusion) {
    // Fallback so mockup renders something rather than empty
    return outputKind === "text_strategic"
      ? { thinking: thinking || rawText.slice(0, 2000), conclusion: "", sources, budget: { minUrls: 8, minChars: 12000 } }
      : null;
  }
  switch (outputKind) {
    case "text_strategic":
      // Research mockup wants: thinking + conclusion (string) + sources + budget
      // conclusion may itself be a string OR an object with keyFindings etc.
      return {
        thinking,
        conclusion: typeof conclusion === "string"
          ? conclusion
          : (conclusion.strategyImplication ?? formatStrategicConclusion(conclusion)),
        sources,
        budget: { minUrls: 8, minChars: 12000 },
      };
    case "structured_table":
      if (mockupVariant === "PillarTableMockup") {
        return {
          tilt: conclusion.tilt ?? "",
          pillars: Array.isArray(conclusion.pillars) ? conclusion.pillars
                 : Array.isArray(conclusion.items)   ? conclusion.items
                 : [],
        };
      }
      if (mockupVariant === "CalendarGridMockup") {
        return {
          targetDateStart: conclusion.targetDateStart ?? "",
          targetDateEnd:   conclusion.targetDateEnd   ?? "",
          pillars: Array.isArray(conclusion.pillars) ? conclusion.pillars : [],
          entries: Array.isArray(conclusion.entries) ? conclusion.entries
                 : Array.isArray(conclusion.items)   ? conclusion.items
                 : [],
        };
      }
      return conclusion;
    case "text_content":
      return { briefs: Array.isArray(conclusion.briefs) ? conclusion.briefs : [] };
    case "qa_review":
      return conclusion; // shape already matches QAReport
    case "decision":
      // For intake: project conclusion into IntakeFormData
      return {
        systemData: {},
        userInput: conclusion.confirmedFields ?? {},
        gaps: Array.isArray(conclusion.gaps) ? conclusion.gaps : [],
        webSummary: {
          audiencePainsPreview: conclusion.briefSummary ?? "",
        },
      };
    default:
      return conclusion;
  }
}

/** When LLM returns rich strategic conclusion as object, render it readable. */
function formatStrategicConclusion(c: any): string {
  if (!c || typeof c !== "object") return "";
  const lines: string[] = [];
  if (c.keyFindings)        lines.push(`# 關鍵發現\n- ${(c.keyFindings as string[]).join("\n- ")}`);
  if (c.audiencePains)      lines.push(`# 受眾痛點\n- ${(c.audiencePains as string[]).join("\n- ")}`);
  if (c.competitorGaps)     lines.push(`# 競品空白\n- ${(c.competitorGaps as string[]).join("\n- ")}`);
  if (c.platformSignals)    lines.push(`# 平台訊號\n${c.platformSignals}`);
  if (c.strategyImplication)lines.push(`# 戰略意涵\n${c.strategyImplication}`);
  return lines.join("\n\n");
}

// ── Workspace → tag keywords mapping ─────────────────────────────────────────

const WORKSPACE_TAGS: Record<string, string[]> & { strategy: string[] } = {
  strategy:          ["brand", "strategy", "gtm", "b2b", "full-funnel", "positioning", "market", "saas"],
  "brand-positioning": ["brand-positioning", "positioning", "brand-strategy", "differentiation", "perceptual-mapping", "category-design", "jtbd", "purpose-driven", "mind-positioning", "segmentation", "value-proposition", "benefit-based"],
  website:           ["seo", "website", "content", "web", "ux", "cro", "copywriting", "conversion"],
  facebook:          ["meta-ads", "facebook", "social", "ads", "community", "ecom", "creative"],
  linkedin:          ["linkedin", "b2b", "thought-leadership", "demand-gen", "b2b_saas"],
  youtube:           ["youtube", "video", "content", "yt", "影片"],
  pr:                ["pr", "公關", "媒體", "新聞", "media"],
  event:             ["event", "活動", "展覽"],
  instore:           ["retail", "門市", "實體"],
  monitoring:        ["monitoring", "social-listening", "sentiment", "intelligence", "輿情", "監測", "情報", "競品", "crisis", "brand-tracking"],
  analytics:         ["analytics", "data", "attribution", "CLV", "LTV", "RFM", "cohort", "A/B", "MMM", "AARRR", "conversion", "experimentation", "North-Star", "Kano", "NPS", "incrementality", "分析", "歸因", "用戶研究"],
};

/**
 * Normalize a workspace key to a known WORKSPACE_TAGS key.
 * Handles user-created workspaces with CJK labels (e.g. "情報監測", "公關通路")
 * or arbitrary slugs that don't map 1:1 to our built-in workspace keys.
 */
function normalizeWorkspace(ws: string): string {
  if (WORKSPACE_TAGS[ws]) return ws;   // already a known key

  const s = ws.toLowerCase();
  // Brand positioning / methodology signals
  if (/brand.position|品牌定位|品牌策略|定位方法|positioning|differentiat|perceptual|category.design|品類設計|jtbd|jobs.to.be.done|purpose.driven|mind.position|心智定位|segmentation.based|benefit.based|value.proposition/.test(s)) return "brand-positioning";
  // Analytics / data signals
  if (/analytics|數據分析|資料分析|\babi\b|attribution|歸因|clv|ltv|rfm|cohort|同期群|aarrr|north.star|kano|a\/b.test|a\/b測試|mmm|marketing.mix|incrementalit|留存分析|用戶研究|consumer.research/.test(s)) return "analytics";
  // Monitoring / intelligence signals
  if (/監測|情報|輿情|listening|monitor|sentiment|intelligence|追蹤|brand.track/.test(s)) return "monitoring";
  // Social / Facebook
  if (/臉書|facebook|\bfb\b|meta|ig|instagram|社群/.test(s)) return "facebook";
  // LinkedIn
  if (/linkedin/.test(s)) return "linkedin";
  // YouTube / Video
  if (/youtube|\byt\b|影片|video/.test(s)) return "youtube";
  // PR
  if (/公關|媒體關係|\bpr\b|kol|媒體/.test(s)) return "pr";
  // Website / SEO
  if (/官網|website|web|seo|搜尋/.test(s)) return "website";
  // Event
  if (/活動|event|展覽/.test(s)) return "event";
  // In-store / Retail
  if (/門市|實體|retail|instore/.test(s)) return "instore";

  return "strategy"; // final fallback
}

// ── Fallback squad lead definition ───────────────────────────────────────────

const FALLBACK_SQUAD_LEAD = {
  agentName: "Jordan Hayes",
  agentTitle: "AI 品牌故事 CMO",
  agentRole: "squad_lead",
  model: "claude-sonnet",
  skills: ["品牌定位", "策略規劃", "跨團隊協作"],
};

function genSquadUid(): string {
  return "sq_" + randomBytes(8).toString("hex");
}

function genAgentKey(squadUid: string, agentName: string): string {
  return `${squadUid}_${agentName.toLowerCase().replace(/\s+/g, "-")}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export const squadTemplateRouter = router({

  // ── listByBrand ──────────────────────────────────────────────────────────────
  // Returns ALL active squad templates as a CANONICAL shape. The frontend
  // reads ONLY these fields:
  //
  //   { id, slug, name, description, tier, strategyLayer,
  //     methodology: { author, year, source, summary } | null,
  //     lead:    { agentId, name, primarySkill } | null,
  //     members: [{ agentId, name, role, isLead, primarySkill, aiModel }],
  //     steps:   [{ order, name, description, requiredSkill,
  //                 assignedAgentId, assignedAgentName, outputType,
  //                 tools, prompts? }],
  //     tokenBudget, workflowComplete }
  //
  // Phase 1 (2026-04-25) consolidated workflow steps into `squads.steps`
  // (canonical shape). The legacy `squad_workflow_templates` table was
  // backfilled into squads.steps and dropped — no more LEFT JOIN needed.
  // ── listForFront ─────────────────────────────────────────────────────────
  // CJ direction 2026-04-30: every squad must pass approval before
  // appearing in user-facing pickers. ALL front-stage squad loaders
  // (BrandsPage / PickerWorkspace / MissionsHome / BoardroomPage / etc.)
  // should call THIS procedure. is_approved=0 squads stay invisible
  // until CJ flips them.
  //
  // Internal admin views that need to see drafts can call listAll
  // (separate procedure, gated by admin role — TODO).
  //
  // This is the canonical filter; existing listByBrand is kept for
  // back-compat but new callers should use listForFront.
  // ── Admin procedures (CJ direction 2026-04-30) ──────────────────────────
  // /admin/squads SquadLabPage uses these. No role gate yet — any logged-in
  // user can see drafts; tighten when role system lands.
  listForAdmin: protectedProcedure
    .input(z.object({
      status: z.enum(["draft", "approved", "all"]).default("all"),
      tier: z.enum(["core", "defer", "kill", "all"]).default("all"),
      search: z.string().max(80).optional(),
    }).optional())
    .query(async ({ input }) => {
      const where: string[] = ["s.is_active = 1"];
      const params: any[] = [];
      if (input?.status === "draft") where.push("s.is_approved = 0");
      else if (input?.status === "approved") where.push("s.is_approved = 1");
      if (input?.tier && input.tier !== "all") {
        where.push("s.tier = ?");
        params.push(input.tier);
      }
      if (input?.search) {
        where.push("(s.name LIKE ? OR s.slug LIKE ? OR s.methodology LIKE ?)");
        const term = `%${input.search}%`;
        params.push(term, term, term);
      }
      const [rows] = await localPool.execute(
        `SELECT s.id, s.slug, s.name, s.description, s.methodology,
                s.tier, s.strategy_layer, s.workspace, s.tags,
                s.lead_agent_id, s.is_approved, s.approved_at, s.approved_by,
                s.created_at, s.updated_at,
                JSON_LENGTH(s.steps)  AS step_count,
                JSON_LENGTH(s.agents) AS agent_count
           FROM squads s
          WHERE ${where.join(" AND ")}
          ORDER BY s.is_approved ASC, s.updated_at DESC
          LIMIT 500`,
        params,
      ) as any[];
      return (rows as any[]) ?? [];
    }),

  // Get single squad with full step + agent detail for the lab detail pane.
  getForAdmin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [rows] = await localPool.execute(
        `SELECT * FROM squads WHERE id = ? LIMIT 1`,
        [input.id],
      ) as any[];
      const row = (rows as any[])?.[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `squad ${input.id} not found` });
      // Hydrate referenced agents
      const agentsRaw = safeJsonParse<any[]>(row.agents, []);
      const stepsRaw  = safeJsonParse<any[]>(row.steps, []);
      const ids = new Set<number>();
      for (const a of agentsRaw) if (a?.id) ids.add(Number(a.id));
      for (const s of stepsRaw)  if (s?.assignedAgentId) ids.add(Number(s.assignedAgentId));
      if (row.lead_agent_id) ids.add(Number(row.lead_agent_id));
      const agentMap: Record<number, any> = {};
      if (ids.size > 0) {
        const placeholders = [...ids].map(() => "?").join(",");
        const [aRows] = await localPool.execute(
          `SELECT id, slug, name, englishName, title, layer, aiModel, avatarUrl
             FROM agents WHERE id IN (${placeholders})`,
          [...ids],
        ) as any[];
        for (const a of (aRows as any[])) agentMap[Number(a.id)] = a;
      }
      return { ...row, agents: agentsRaw, steps: stepsRaw, agentMap };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await localPool.execute(
        `UPDATE squads SET is_approved = 1, approved_at = NOW(), approved_by = ? WHERE id = ?`,
        [ctx.user!.id, input.id],
      );
      return { ok: true, approvedBy: ctx.user!.id, note: input.note };
    }),

  /** Soft reject — flips is_approved=0, leaves squad active so admin can edit. */
  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      await localPool.execute(
        `UPDATE squads SET is_approved = 0, approved_at = NULL, approved_by = NULL WHERE id = ?`,
        [input.id],
      );
      return { ok: true, reason: input.reason };
    }),

  /**
   * runStepLive — actually execute one squad step against the LLM.
   *
   * No DB writes (no mission_step_progress row). For admin lab "Test Run"
   * mode where CJ wants to see real LLM output per step before approving.
   *
   * Caller passes:
   *   - squadId + stepIndex → fetches step config (prompt, model, outputKind)
   *   - brandId (optional) → for brand-context substitution
   *   - userInput (optional) → step 1 checkpoint values feed downstream
   *   - upstreamOutputs (optional) → outputs from prior steps in the run
   *
   * Returns:
   *   - rawText (LLM raw response)
   *   - parsed (best-effort JSON parse; null if LLM didn't comply)
   *   - mockupData (per outputKind, shape ready for mockup component)
   */
  runStepLive: protectedProcedure
    .input(z.object({
      squadId: z.number(),
      stepIndex: z.number().int().min(0).max(20),
      // Scope binding — accepts brand / product / event (CJ correction
      // 2026-04-30: not just brand). Backward-compat: brandId still
      // accepted standalone if scopeKind is omitted.
      scopeKind: z.enum(["brand", "product", "event"]).optional(),
      scopeId: z.number().optional(),
      brandId: z.number().nullable().optional(),
      userInput: z.record(z.string(), z.any()).optional(),
      upstreamOutputs: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Load squad + step
      const [sqRows] = await localPool.execute(
        `SELECT id, slug, name, methodology, steps, agents, lead_agent_id
           FROM squads WHERE id = ? LIMIT 1`,
        [input.squadId],
      ) as any[];
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new TRPCError({ code: "NOT_FOUND", message: `squad ${input.squadId} not found` });
      const steps = safeJsonParse<any[]>(squad.steps, []);
      const step = steps[input.stepIndex];
      if (!step) throw new TRPCError({ code: "NOT_FOUND", message: `step ${input.stepIndex} not found` });

      // UI-only steps don't call LLM
      if (step.aiModel === "n/a" || step.outputKind === "decision" && step.userInputFields?.length > 0) {
        return {
          ok: true,
          step: { name: step.name, outputKind: step.outputKind, mockupVariant: step.mockupVariant },
          rawText: "",
          parsed: null,
          mockupData: null,
          note: "此 step 是 UI checkpoint，不打 LLM。請在前端填寫 userInput 後 run 下一步。",
        };
      }

      // 2. Resolve scope context (brand / product / event)
      // Pri: explicit scopeKind+scopeId. Fallback: legacy brandId.
      const scopeKind = input.scopeKind ?? (input.brandId ? "brand" : undefined);
      const scopeId   = input.scopeId   ?? input.brandId   ?? undefined;
      let scopeLabel = "未綁定 scope";
      let scopeContext = "";
      let resolvedBrandId: number | null = null;
      if (scopeKind && scopeId) {
        if (scopeKind === "brand") {
          const [r] = await localPool.execute(
            `SELECT id, name, industry, description, positioning FROM brands WHERE id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            resolvedBrandId = Number(row.id);
            scopeLabel = `品牌：${row.name}${row.industry ? `（${row.industry}）` : ""}`;
            const pos = parseJsonField(row.positioning);
            scopeContext = formatPositioningContext(pos, row.description);
          }
        } else if (scopeKind === "product") {
          const [r] = await localPool.execute(
            `SELECT p.id, p.name, p.brandId, p.positioning, b.name AS brandName, b.industry, b.description AS brandDescription, b.positioning AS brandPositioning
               FROM products p
          LEFT JOIN brands b ON b.id = p.brandId
              WHERE p.id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            resolvedBrandId = row.brandId ? Number(row.brandId) : null;
            scopeLabel = `產品：${row.name}（隸屬品牌「${row.brandName ?? "—"}」）`;
            const productPos = parseJsonField(row.positioning);
            const brandPos = parseJsonField(row.brandPositioning);
            scopeContext = [
              formatPositioningContext(brandPos, row.brandDescription, "父品牌定位"),
              formatPositioningContext(productPos, null, "產品定位"),
            ].filter(Boolean).join("\n\n");
          }
        } else if (scopeKind === "event") {
          const [r] = await localPool.execute(
            `SELECT e.id, e.name, e.brandId, e.startAt, e.endAt, e.positioning,
                    b.name AS brandName, b.industry, b.description AS brandDescription, b.positioning AS brandPositioning
               FROM events e
          LEFT JOIN brands b ON b.id = e.brandId
              WHERE e.id = ? LIMIT 1`,
            [scopeId],
          ) as any[];
          const row = (r as any[])?.[0];
          if (row) {
            resolvedBrandId = row.brandId ? Number(row.brandId) : null;
            const period = row.startAt ? `${String(row.startAt).split("T")[0]} ~ ${String(row.endAt ?? "").split("T")[0]}` : "（無日期）";
            scopeLabel = `活動：${row.name}（隸屬品牌「${row.brandName ?? "—"}」，期間 ${period}）`;
            const eventPos = parseJsonField(row.positioning);
            const brandPos = parseJsonField(row.brandPositioning);
            scopeContext = [
              formatPositioningContext(brandPos, row.brandDescription, "父品牌定位"),
              formatPositioningContext(eventPos, null, "活動定位（11-segment）"),
            ].filter(Boolean).join("\n\n");
          }
        }
      }

      // 3. Build prompts
      const userInputs = input.userInput ?? {};
      const upstream = input.upstreamOutputs ?? {};

      // Pattern adopted from pipelineRouter (proven on 14-step brand pipeline):
      // strict {thinking, conclusion, sources} envelope with a concrete
      // schema example for `conclusion`. The example tells LLM exactly
      // which keys to fill — converges faster + more parseable than free-form.
      const schemaExample = JSON.stringify(mockConclusionForStep(step.outputKind, step.mockupVariant), null, 2);

      const systemPrompt = `你是 ${step.assignedAgentName ?? "Squad Agent"}（zh-TW）。Squad「${squad.name}」步驟「${step.name}」負責人。

【方法論】${squad.methodology ?? "N/A"}
【步驟說明】${step.description ?? ""}

【輸出格式 — 嚴格 JSON，不要任何前綴/後綴/markdown code fence】
你的回應**必須**是合法 JSON 字串，三個 top-level keys：
- "thinking" (string, 200-600 字推理過程，繁中)
- "conclusion" (object, 結構必須符合下方範例的 keys)
- "sources" (array of {url,title,charCount,excerpt}，無研究時可空陣列)

conclusion 範例（outputKind = "${step.outputKind}", mockup = "${step.mockupVariant ?? ""}"; 依此 keys 填入真實內容）：
${schemaExample}

注意：直接 raw JSON，不要 \`\`\`json 圍籬，不要 prose 前綴。conclusion 不能是空 object。

⚠️【數據真實性規則】任何具體數字（百分比、互動率、發布數量、粉絲數、曝光數等），必須來自用戶提供的資料或上游步驟輸出。若無法取得真實數據，請以「（需提供真實 API 數據）」標示佔位符，不可虛構或假設任何具體數值。違反此規則比輸出空白更嚴重。`;

      const userPrompt = [
        `【執行 Scope】${scopeLabel}`,
        scopeContext || null,
        Object.keys(userInputs).length > 0
          ? `【用戶在 step 1 填的 brief】\n${JSON.stringify(userInputs, null, 2)}`
          : null,
        Object.keys(upstream).length > 0
          ? `【上游 step 已產出】\n${JSON.stringify(upstream, null, 2).slice(0, 3000)}`
          : null,
        "請執行此步驟，輸出 thinking + conclusion + sources JSON。",
      ].filter(Boolean).join("\n\n");

      // 4. Call LLM with cross-provider fallback (Anthropic → Azure Foundry
      //    → Azure OpenAI → OpenRouter). Single-provider failure (e.g.
      //    Azure DeploymentNotFound 404) doesn't kill the run.
      const t0 = Date.now();
      let rawText = "";
      let attempts = 1;
      const maxTokens = maxTokensForOutputKind(step.outputKind);
      try {
        // timeoutMs per provider — nginx default ~60s, must beat it.
        // 35s × 3 anthropic keys = 105s worst case but first usually succeeds.
        // Aborting fast lets us fall through providers before nginx 502s.
        // eslint-disable-next-line no-console
        console.log(`[runStepLive] squad=${input.squadId} step=${input.stepIndex} kind=${step.outputKind} maxTokens=${maxTokens} promptChars=${systemPrompt.length + userPrompt.length}`);
        const result = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens, timeoutMs: 35_000 });
        rawText = result.text;
        attempts = result.attempts?.length ?? 1;
        // eslint-disable-next-line no-console
        console.log(`[runStepLive] OK squad=${input.squadId} step=${input.stepIndex} attempts=${attempts} chars=${rawText.length}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Common failure modes: nginx 502 HTML, provider 5xx, all providers down
        const friendly = msg.includes("Unexpected token") || msg.includes("<html>")
          ? "LLM provider 回傳 HTML（可能 5xx 或 timeout）。請降低 maxTokens 或重試。"
          : msg;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `LLM call failed (all providers): ${friendly}`,
        });
      }
      const durationMs = Date.now() - t0;

      // 5. Best-effort JSON parse — expect {thinking, conclusion, sources}
      //    envelope per pipelineRouter pattern.
      const parsedRaw = tryParseJson(rawText);
      const thinking: string = parsedRaw?.thinking ?? "";
      const conclusion: any  = parsedRaw?.conclusion ?? (
        // Fallback: if LLM returned conclusion fields at top level (no envelope)
        parsedRaw && Object.keys(parsedRaw).some((k) => k !== "thinking" && k !== "sources" && k !== "conclusion")
          ? Object.fromEntries(Object.entries(parsedRaw).filter(([k]) => k !== "thinking" && k !== "sources"))
          : null
      );
      const sources: any[] = Array.isArray(parsedRaw?.sources) ? parsedRaw.sources : [];

      // 6. Map conclusion → mockup-shaped data per outputKind
      const mockupData = mapToMockupData(conclusion, step.outputKind, step.mockupVariant, rawText, thinking, sources);

      return {
        ok: true,
        step: { name: step.name, outputKind: step.outputKind, mockupVariant: step.mockupVariant, aiModel: step.aiModel },
        rawText,
        parsed: parsedRaw,
        thinking,
        conclusion,
        sources,
        mockupData,
        durationMs,
        attempts,
      };
    }),

  listForFront: protectedProcedure
    .input(z.object({
      brandId: z.number().optional(),
      includeUnapproved: z.boolean().default(false), // admin-only escape hatch
    }).optional())
    .query(async ({ input }) => {
      const filter = input?.includeUnapproved
        ? "1=1"           // admin mode: show all squads regardless of is_active/is_approved
        : "s.is_approved = 1";
      // Try rich query first; fall back to minimal if columns are missing
      const richQuery = `
        SELECT s.id, s.slug, s.name, s.description,
               s.strategy_layer, s.workspace, s.methodology,
               s.agents, s.steps,
               NULL AS hero_image_url
          FROM squads s
         WHERE ${filter}
         ORDER BY s.id ASC
         LIMIT 1000`;
      const minimalQuery = `
        SELECT id, slug, name, description, strategy_layer,
               NULL AS workspace, NULL AS methodology,
               NULL AS agents, NULL AS steps,
               NULL AS hero_image_url
          FROM squads
         WHERE ${filter.replace(/s\./g, "")}
         ORDER BY id ASC
         LIMIT 1000`;
      let rows: any[];
      try {
        [rows] = await localPool.execute(richQuery) as any[];
      } catch {
        [rows] = await localPool.execute(minimalQuery) as any[];
      }
      return (rows as any[]) ?? [];
    }),

  listByBrand: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async () => {
      // CJ direction 2026-04-30 update: existing squads ARE drafts pending
      // CJ review — listByBrand keeps showing all is_active=1 (to not
      // break existing UI), but each row carries its is_approved flag so
      // the front can render a "🟡 reviewing" badge. listForFront remains
      // the strict-governance procedure for future audited callers.
      const [rows] = await localPool.execute(
        `SELECT s.id, s.slug, s.name, s.description, s.agents, s.steps,
                s.tier, s.strategy_layer, s.methodology, s.lead_agent_id, s.token,
                s.hero_image_url, s.source, s.ingest_source_url, s.workspace, s.tags,
                s.use_cases, s.output_formats,
                s.task_label_zh, s.task_label_en,
                s.mockup_platform, s.mockup_format, s.output_kind,
                s.is_approved, s.approved_at
           FROM squads s
          WHERE s.is_active = 1
          ORDER BY COALESCE(s.tier, 99) ASC, s.id ASC
          LIMIT 1000`
      ) as any[];

      type RawRow = any;
      const raw = rows as RawRow[];

      // ── Pass 1: collect every agent id we'll need to resolve ────────────────
      const agentIdSet = new Set<number>();
      const perRow = raw.map((r) => {
        const membersRaw = safeJsonParse<any[]>(r.agents, []);
        const stepsRaw = safeJsonParse<any[]>(r.steps, []);

        if (r.lead_agent_id) agentIdSet.add(Number(r.lead_agent_id));
        for (const m of membersRaw) {
          if (m?.agent_id) agentIdSet.add(Number(m.agent_id));
        }
        for (const s of stepsRaw) {
          if (s?.assignedAgentId) agentIdSet.add(Number(s.assignedAgentId));
        }
        return { r, membersRaw, stepsRaw };
      });

      // ── Pass 2: batch resolve agents ────────────────────────────────────────
      const agentMap: Record<number, any> = {};
      if (agentIdSet.size > 0) {
        const ids = [...agentIdSet];
        const placeholders = ids.map(() => "?").join(",");
        try {
          const [aRows] = await localPool.execute(
            `SELECT id, name, title, primarySkill, aiModel FROM agents WHERE id IN (${placeholders})`,
            ids,
          ) as any[];
          for (const a of aRows as any[]) agentMap[a.id] = a;
        } catch (e) {
          console.error("[squadRouter.listByBrand] agent batch lookup failed:", e);
        }
      }

      // ── Pass 3: build canonical shape ───────────────────────────────────────
      return perRow.map(({ r, membersRaw, stepsRaw }) => {
        // members
        const members = membersRaw
          .map((m: any) => {
            const a = agentMap[Number(m.agent_id)];
            if (!a) return null;
            return {
              agentId: Number(m.agent_id),
              name: a.name ?? "",
              role: m.role ?? a.title ?? "",
              isLead: !!(m.is_lead === true || m.is_lead === 1),
              primarySkill: a.primarySkill ?? null,
              aiModel: a.aiModel ?? null,
            };
          })
          .filter(Boolean) as Array<{
            agentId: number; name: string; role: string;
            isLead: boolean; primarySkill: string | null; aiModel: string | null;
          }>;

        // lead — prefer explicit lead_agent_id (resolved); fall back to is_lead member
        let lead: { agentId: number; name: string; primarySkill: string | null } | null = null;
        if (r.lead_agent_id && agentMap[Number(r.lead_agent_id)]) {
          const a = agentMap[Number(r.lead_agent_id)];
          lead = { agentId: Number(r.lead_agent_id), name: a.name ?? "", primarySkill: a.primarySkill ?? null };
        } else {
          const ml = members.find((m) => m.isLead);
          if (ml) lead = { agentId: ml.agentId, name: ml.name, primarySkill: ml.primarySkill };
        }

        // steps — normalize curated vs inline shape into one
        const steps = stepsRaw.map((s: any, i: number) => {
          // curated keys: { step, title, description, owner, output, prompts, sections }
          // inline keys:  { order, skill, title|name, outputType, description, requiredTools, assignedAgentId }
          const order = Number(s.order ?? s.step ?? i + 1);
          const requiredSkill =
            (Array.isArray(s.requiredSkills) && s.requiredSkills[0]) ||
            s.skill || s.requiredSkill || s.owner || null;
          const assignedAgentId = s.assignedAgentId ? Number(s.assignedAgentId) : null;
          const assignedAgent = assignedAgentId ? agentMap[assignedAgentId] : null;
          return {
            order,
            name: s.name ?? s.title ?? `Step ${order}`,
            description: s.description ?? null,
            requiredSkill,
            assignedAgentId,
            assignedAgentName: assignedAgent?.name ?? s.assignedAgentName ?? null,
            outputType: s.outputType ?? s.output ?? null,
            tools: Array.isArray(s.requiredTools) ? s.requiredTools
                 : Array.isArray(s.tools) ? s.tools : [],
            ...(Array.isArray(s.prompts) && s.prompts.length ? { prompts: s.prompts } : {}),
          };
        });

        // methodology — could be string OR JSON object in DB; normalize
        let methodology: { author?: string; year?: number; source?: string; summary?: string } | null = null;
        if (r.methodology) {
          if (typeof r.methodology === "object") {
            methodology = r.methodology;
          } else if (typeof r.methodology === "string") {
            // try parse JSON; if fails, treat as summary string
            try {
              const parsed = JSON.parse(r.methodology);
              methodology = typeof parsed === "object" ? parsed : { summary: r.methodology };
            } catch {
              methodology = { summary: r.methodology };
            }
          }
        }

        return {
          id: Number(r.id),
          slug: String(r.slug),
          name: String(r.name ?? ""),
          description: r.description ?? null,
          tier: r.tier ?? null,
          strategyLayer: r.strategy_layer ?? null,
          heroImageUrl: r.hero_image_url ?? null,
          source: (r.source ?? "seeded") as "seeded" | "ingested" | "forked",
          ingestSourceUrl: r.ingest_source_url ?? null,
          // workspace + tags + use_cases + output_formats for client-side
          // channel filtering and richer keyword search in the Picker.
          workspace: safeJsonParse<string[]>(r.workspace, []),
          tags: safeJsonParse<string[]>(r.tags, []),
          useCases: safeJsonParse<string[]>(r.use_cases, []),
          outputFormats: safeJsonParse<string[]>(r.output_formats, []),
          // PR6 / Q2 — explicit task label + mockup variant from LLM classifier
          taskLabel: r.task_label_zh ?? null,
          taskLabelEn: r.task_label_en ?? null,
          outputKind: r.output_kind ?? null,
          mockup: (r.mockup_platform && r.mockup_format)
            ? { platform: r.mockup_platform, format: r.mockup_format }
            : undefined,
          methodology,
          lead,
          members,
          steps,
          tokenBudget: r.token ?? null,
          workflowComplete: steps.length > 0,
        };
      });
    }),

  // ── getRecommendedSquads ─────────────────────────────────────────────────────
  // 從 squads 按 workspace + brand + mission 評分，回傳前 N 個 squad chips
  getRecommendedSquads: protectedProcedure
    .input(z.object({
      workspace: z.string().default("strategy"),
      brandId:   z.number().optional(),
      missionId: z.number().optional(),
      limit:     z.number().default(6),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // ── 1. Full brand profile (sowork_db) ───────────────────────────────────
      let brandIndustry: string | null = null;
      let brandContext  = "";
      if (input.brandId && db) {
        try {
          const [bRows] = await db.execute(
            sql`SELECT name, industry, description, tagline,
                       valueProposition, targetMarket, audienceA, audienceB,
                       emotionalDiff, functionalDiff
                FROM brands WHERE id = ${input.brandId} LIMIT 1`
          ) as any[];
          const b = (bRows as any[])?.[0];
          if (b) {
            brandIndustry = b.industry ? String(b.industry).replace(/['"\\;]/g, "") : null;
            const parts: string[] = [];
            if (b.name)             parts.push(`品牌：${b.name}`);
            if (b.industry)         parts.push(`產業：${b.industry}`);
            if (b.description)      parts.push(`品牌描述：${b.description}`);
            if (b.tagline)          parts.push(`品牌標語：${b.tagline}`);
            if (b.valueProposition) parts.push(`品牌定位：${b.valueProposition}`);
            if (b.targetMarket)     parts.push(`目標市場：${b.targetMarket}`);
            if (b.audienceA)        parts.push(`受眾A：${b.audienceA}`);
            if (b.audienceB)        parts.push(`受眾B：${b.audienceB}`);
            if (b.emotionalDiff)    parts.push(`情感差異化：${b.emotionalDiff}`);
            if (b.functionalDiff)   parts.push(`功能差異化：${b.functionalDiff}`);
            brandContext = parts.join(" | ");
          }
        } catch (e) {
          console.error("[squadRouter] brand lookup error:", e);
        }
      }

      // ── 2. Full mission context + keyword extraction + workspace hint ────────
      let missionKeywords: string[] = [];
      let missionWorkspaceHint: string | null = null;
      let missionContext = "";

      if (input.missionId && db) {
        try {
          const [mRows] = await db.execute(
            sql`SELECT title, description, objective, audience, offer, workspace
                FROM missions WHERE id = ${input.missionId} LIMIT 1`
          ) as any[];
          const m = (mRows as any[])?.[0];
          if (m) {
            // Collect all mission text fields
            const mParts: string[] = [];
            if (m.title)     mParts.push(`任務：${m.title}`);
            if (m.description) mParts.push(`任務描述：${m.description}`);
            if (m.objective) mParts.push(`目標：${m.objective}`);
            if (m.audience)  mParts.push(`受眾：${m.audience}`);
            if (m.offer)     mParts.push(`提案：${m.offer}`);
            missionContext = mParts.join(" | ");

            // Keyword extraction (handles Chinese + English)
            const rawText = [m.title ?? "", m.description ?? "", m.objective ?? ""].join(" ");
            const parts = rawText.split(/[\s，,。、！？：:；;「」【】()[\]]+/).filter(Boolean);
            const kws = new Set<string>();
            for (const part of parts) {
              const p = part.toLowerCase();
              if (p.length >= 2 && p.length <= 30) kws.add(p);
              // Chinese bigrams for non-space CJK text
              if (p.length > 3 && /[\u4e00-\u9fff]/.test(p)) {
                for (let i = 0; i < p.length - 1; i++) {
                  const bi = p.slice(i, i + 2);
                  if (/[\u4e00-\u9fff]{2}/.test(bi)) kws.add(bi);
                }
              }
            }
            missionKeywords = [...kws];

            // Workspace hint: from stored workspace OR detected from text
            const storedWs = m.workspace ? String(m.workspace) : null;
            const tl = rawText.toLowerCase();
            const textHint =
              /臉書|facebook|\bfb\b|meta.*ads/.test(tl)             ? "facebook"   :
              /linkedin/.test(tl)                                     ? "linkedin"   :
              /youtube|\byt\b|影片/.test(tl)                         ? "youtube"    :
              /公關|媒體關係|\bpr\b|kol/.test(tl)                    ? "pr"         :
              /seo|搜尋引擎|網站|website/.test(tl)                    ? "website"    :
              /活動|event|展覽/.test(tl)                              ? "event"      :
              /instagram|\big\b/.test(tl)                             ? "facebook"   :
              /社群監測|輿情|情報監測|social.listen|brand.monitor|sentiment|monitoring/.test(tl) ? "monitoring" :
              /數據分析|資料分析|rfm|clv|ltv|aarrr|cohort|同期群|a\/b測試|north.star|kano|歸因分析|行銷組合|marketing.mix|用戶研究|留存分析|增量測試|incrementalit/.test(tl) ? "analytics" :
              null;
            // Normalize stored workspace key (handles CJK labels like "情報監測")
            const normalizedStoredWs = storedWs ? normalizeWorkspace(storedWs) : null;
            missionWorkspaceHint = textHint ?? normalizedStoredWs;
            console.log(`[squadRouter] mission ${input.missionId} ws=${storedWs} textHint=${textHint} kws=${missionKeywords.slice(0,6).join(",")}`);
          }
        } catch (e) {
          console.error("[squadRouter] mission lookup error:", e);
        }
      }

      // Effective workspace = text hint (strongest) → stored mission ws → passed-in ws (all normalized)
      const effectiveWorkspace = missionWorkspaceHint ?? normalizeWorkspace(input.workspace);
      const effectiveTags      = WORKSPACE_TAGS[effectiveWorkspace] ?? WORKSPACE_TAGS.strategy;

      // 3. Build LIKE conditions
      const tagLikes      = effectiveTags.map(t => `tags LIKE '%${escapeLike(t)}%'`).join(" OR ");
      const wsLike        = escapeLike(effectiveWorkspace);
      const industryClause = brandIndustry ? ` OR industry_key = '${brandIndustry}'` : "";

      const selectCols = `id, slug, name, description, industry_key, missionType,
                          agents, tags, use_cases, methodology, workspace, embedding`;

      // 4. Two-pass fetch — workspace-declared squads first, then tag-based supplement
      let squadRows: any[] = [];
      const seenIds = new Set<number>();

      try {
        // Pass A: squads that explicitly declare this workspace
        const [wsRows] = await localPool.execute(
          `SELECT ${selectCols}
           FROM squads
           WHERE is_active = 1 AND workspace LIKE '%${wsLike}%'
           ORDER BY id DESC LIMIT 150`
        ) as any[];
        for (const r of wsRows as any[]) { squadRows.push(r); seenIds.add(r.id); }
        console.log(`[squadRouter] pass-A (workspace="${effectiveWorkspace}"): ${squadRows.length} rows`);

        // Pass B: tag-based candidates (exclude already found)
        const [tagRows] = await localPool.execute(
          `SELECT ${selectCols}
           FROM squads
           WHERE is_active = 1 AND (${tagLikes}${industryClause})
           ORDER BY id DESC LIMIT 200`
        ) as any[];
        for (const r of tagRows as any[]) {
          if (!seenIds.has(r.id)) { squadRows.push(r); seenIds.add(r.id); }
        }
        console.log(`[squadRouter] pass-B total candidates: ${squadRows.length}`);
      } catch (e) {
        console.error("[squadRouter] squads query error:", e);
        try {
          const [rows] = await localPool.execute(
            `SELECT ${selectCols} FROM squads WHERE is_active = 1 ORDER BY RAND() LIMIT 60`
          ) as any[];
          squadRows = rows as any[];
        } catch (e2) { console.error("[squadRouter] fallback also failed:", e2); }
      }

      console.log(`[squadRouter] getRecommendedSquads effectiveWorkspace=${effectiveWorkspace} total=${squadRows.length}`);
      if (!squadRows.length) return [];

      // 5. JS-side scoring
      const ewsLower = effectiveWorkspace.toLowerCase();
      const candidates = squadRows.map(row => {
        const agents      = safeJsonParse<any[]>(row.agents, []);
        const rowTags     = safeJsonParse<string[]>(row.tags, []);
        const useCases    = safeJsonParse<string[]>(row.use_cases, []);
        const squadWs     = safeJsonParse<string[]>(row.workspace, []);
        const rowDesc     = (row.description ?? "").toLowerCase();
        const rowName     = (row.name ?? "").toLowerCase();
        const methodology = (row.methodology ?? "").toLowerCase();
        const squadWsLower = squadWs.map(w => w.toLowerCase());

        let score = 0;

        // ── Workspace match — dominant signal ────────────────────────────────
        const wsMatch = squadWsLower.some(w =>
          w === ewsLower || w.includes(ewsLower) || ewsLower.includes(w)
        );
        if (wsMatch) {
          score += 20;  // declared workspace match — overrides almost everything else
        } else if (squadWsLower.length > 0) {
          score -= 8;   // declared but wrong workspace — heavy penalty
        }

        // ── Workspace tag match — secondary ──────────────────────────────────
        for (const tag of effectiveTags) {
          const tl = tag.toLowerCase();
          if (rowTags.some((t: string) => t && t.toLowerCase().includes(tl))) score += 3;
          if (rowName.includes(tl)) score += 1;
        }

        // Brand industry match
        if (brandIndustry) {
          if (row.industry_key === brandIndustry) score += 5;
          if (rowTags.some((t: string) => t && t.toLowerCase().includes(brandIndustry!.toLowerCase()))) score += 2;
        }

        // Mission keyword matching
        for (const word of missionKeywords) {
          const wl = word.toLowerCase();
          if (rowName.includes(wl)) score += 4;
          if (rowDesc.includes(wl)) score += 2;
          if (methodology.includes(wl)) score += 1;
          if (useCases.some((uc: string) => uc && uc.toLowerCase().includes(wl))) score += 3;
          if (rowTags.some((t: string) => t && t.toLowerCase().includes(wl))) score += 2;
        }

        score += Math.min(agents.length, 5);

        const leadAgent = agents.find((m: any) => m.is_lead === true || m.is_lead === 1);
        return { row, agents, score, leadAgentId: leadAgent?.agent_id ?? null };
      });

      // ── 6. Semantic re-ranking (text-embedding-3-large) ─────────────────────
      // Build a rich query vector from brand profile + mission context.
      // Compare against each squad's pre-computed embedding (stored in squads.embedding).
      // Squads with embeddings get a cosine-similarity bonus on top of the keyword score.
      // Squads without embeddings fall back to keyword score only.
      let semanticEnabled = false;
      try {
        const queryParts = [
          brandContext,
          missionContext,
          `工作區：${effectiveWorkspace}`,
        ].filter(Boolean);
        const queryText = queryParts.join(" | ").slice(0, 2000);

        if (queryText.length > 10) {
          const queryVec = await getEmbedding(queryText);
          if (queryVec) {
            semanticEnabled = true;
            for (const c of candidates) {
              const embRaw = c.row.embedding;
              if (!embRaw) continue;
              const squadVec = safeJsonParse<number[]>(embRaw, []);
              if (!squadVec.length) continue;
              const sim = cosineSimilarity(queryVec, squadVec); // 0–1
              // Map cosine sim [0.2, 0.9] → additive score [0, 30]
              // A sim of 0.7+ (very relevant) adds ~25 pts
              const bonus = Math.max(0, (sim - 0.2) / 0.7) * 30;
              c.score += bonus;
            }
            console.log(`[squadRouter] Semantic re-ranking applied (${candidates.filter(c => c.row.embedding).length} squads with embeddings)`);
          }
        }
      } catch (e) {
        console.error("[squadRouter] Semantic re-ranking failed, falling back to keyword score:", e);
      }

      if (!semanticEnabled) {
        console.log("[squadRouter] No semantic re-ranking (no query embedding or embeddings not computed yet)");
      }

      // 7. Sort + take top N
      const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, input.limit);

      // 7. Batch-fetch lead agents via localPool
      const leadIds = top.map(c => c.leadAgentId).filter(Boolean) as number[];
      const leadMap: Record<number, any> = {};
      if (leadIds.length) {
        try {
          const leadPlaceholders = leadIds.map(() => "?").join(",");
          const [agentRows] = await localPool.execute(
            `SELECT id, name, title FROM agents WHERE id IN (${leadPlaceholders})`,
            leadIds,
          ) as any[];
          for (const a of agentRows as any[]) leadMap[a.id] = a;
        } catch (e) {
          console.error("[squadRouter] lead agents lookup error:", e);
        }
      }

      const squadChips = top.map(({ row, agents, score, leadAgentId }) => ({
        type:        "squad" as const,
        squadId:     row.id as number,
        slug:        (row.slug ?? "") as string,
        name:        (row.name ?? "") as string,
        description: (row.description ?? null) as string | null,
        industryKey: (row.industry_key ?? null) as string | null,
        missionType: (row.missionType ?? null) as string | null,
        agentCount:  agents.length,
        lead: leadAgentId && leadMap[leadAgentId] ? {
          agentId: leadAgentId,
          name:    leadMap[leadAgentId].name as string,
          title:   leadMap[leadAgentId].title as string,
        } : null,
        matchScore: score,
      }));

      // ── 8. Agent chips — synthesize top agents as single-person squads ────
      // This unlocks 17k+ agents as potential chips. Agents are keyword-scored
      // against the same mission keywords/workspace tags. A typical mix is
      // 60% squad / 40% agent so both appear in the chip row.
      const agentChips: any[] = [];
      try {
        const agentLimit = Math.max(2, Math.floor(input.limit / 2));
        // Keyword LIKE clause on agent.specialty / primarySkill / title / skills JSON
        const kwConditions: string[] = [];
        const kwParams: any[] = [];
        for (const kw of missionKeywords.slice(0, 8)) {
          const esc = `%${escapeLike(kw)}%`;
          kwConditions.push(`(a.specialty LIKE ? OR a.primarySkill LIKE ? OR a.title LIKE ? OR JSON_SEARCH(a.skills, 'one', ?) IS NOT NULL)`);
          kwParams.push(esc, esc, esc, kw);
        }
        for (const tag of effectiveTags.slice(0, 4)) {
          const esc = `%${escapeLike(tag)}%`;
          kwConditions.push(`(a.specialty LIKE ? OR a.primarySkill LIKE ? OR a.title LIKE ?)`);
          kwParams.push(esc, esc, esc);
        }
        // No layer filter — any agent can surface as a chip. We already rank
        // by rating + keyword score, so weak matches fall to the bottom.
        const whereClause = kwConditions.length
          ? `WHERE (${kwConditions.join(" OR ")})`
          : `WHERE 1=1`;

        const [agentRows] = await localPool.execute(
          `SELECT a.id, a.slug, a.name, a.title, a.specialty, a.primarySkill,
                  a.methodology, a.skills, a.taskType, a.layer, a.aiModel, a.avatarUrl
           FROM agents a
           ${whereClause}
           ORDER BY (a.rating IS NOT NULL) DESC, a.rating DESC, a.id DESC
           LIMIT ${agentLimit * 3}`,
          kwParams,
        ) as any[];

        // JS-side scoring — mirror squad scoring logic at smaller scale
        const scored = (agentRows as AgentRow[]).map((a: any) => {
          let score = 0;
          const specialty = String(a.specialty ?? "").toLowerCase();
          const primary   = String(a.primarySkill ?? "").toLowerCase();
          const title     = String(a.title ?? "").toLowerCase();
          for (const kw of missionKeywords) {
            const k = kw.toLowerCase();
            if (specialty.includes(k)) score += 3;
            if (primary.includes(k))   score += 5;
            if (title.includes(k))     score += 2;
          }
          for (const tag of effectiveTags) {
            const tl = tag.toLowerCase();
            if (specialty.includes(tl)) score += 2;
            if (primary.includes(tl))   score += 3;
          }
          return { agent: a, score };
        });
        scored.sort((x, y) => y.score - x.score);

        // De-dupe against squad lead ids already shown
        const shownLeadIds = new Set(squadChips.map((s) => s.lead?.agentId).filter(Boolean));

        for (const { agent, score } of scored) {
          if (agentChips.length >= agentLimit) break;
          if (shownLeadIds.has(agent.id)) continue;
          const synth = synthesizeAgentAsSquad(agent);
          agentChips.push({
            type:        "agent" as const,
            squadId:     synth.squadId,       // negative, used as lookup key
            slug:        synth.slug,           // "agent:<id-or-slug>"
            name:        agent.name,            // chip shows agent name directly
            description: agent.specialty ?? null,
            agentId:     agent.id,
            agentTitle:  agent.title ?? null,
            primarySkill: agent.primarySkill ?? null,
            avatarUrl:   agent.avatarUrl ?? null,
            stepCount:   synth.steps.length,
            lead: {
              agentId: agent.id,
              name:    agent.name,
              title:   agent.title ?? "Specialist",
            },
            matchScore: score,
          });
        }
      } catch (e) {
        console.error("[squadRouter] agent-chip enrichment error:", e);
      }

      // Merge: interleave squads and agents by matchScore so top picks surface
      const merged = [...squadChips, ...agentChips]
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
        .slice(0, input.limit + Math.floor(input.limit / 2));

      console.log(`[squadRouter] chips: ${squadChips.length} squad + ${agentChips.length} agent → merged ${merged.length}`);
      return merged;
    }),

  // ── getMembersById ──────────────────────────────────────────────────────────
  // 給定 squadId，解析 agents JSON → 查 agents table → 回傳真實成員 + workflow steps
  getMembersById: protectedProcedure
    .input(z.object({ squadId: z.number() }))
    .query(async ({ input }) => {
      // ── Agent-mode: negative squadId = synthesized single-agent squad ───────
      // Chip recommender sends squadId=-agentId for agent chips. Look up the
      // underlying agent row and synthesize it into squad shape so the sidebar
      // renders identically to a real squad.
      if (input.squadId < 0) {
        const agentId = Math.abs(input.squadId);
        const [aRows] = await localPool.execute(
          `SELECT id, slug, name, title, specialty, primarySkill, methodology,
                  skills, taskType, layer, aiModel, avatarUrl, industries
           FROM agents WHERE id = ? LIMIT 1`,
          [agentId],
        ) as any[];
        const agent = (aRows as any[])?.[0];
        if (!agent) {
          console.warn(`[squadRouter.getMembersById] Synth agent not found id=${agentId}`);
          return { squadName: "", lead: null, agents: [], steps: [], showcases: [], methodology: "" };
        }
        const synth = synthesizeAgentAsSquad(agent as AgentRow);
        const leadMember = {
          agentId:      agent.id as number,
          role:         (agent.title ?? "Specialist") as string,
          isLead:       true,
          order:        1,
          name:         (agent.name ?? "") as string,
          title:        (agent.title ?? "") as string,
          specialty:    (agent.specialty ?? "") as string,
          primarySkill: (agent.primarySkill ?? "") as string,
          aiModel:      (agent.aiModel ?? "") as string,
          avatarUrl:    (agent.avatarUrl ?? null) as string | null,
        };
        const enrichedSteps = synth.steps.map((s) => ({
          order: s.order,
          name: s.title,
          title: s.title,
          description: s.description,
          requiredSkills: [s.skill],
          requiredTools: s.requiredTools,
          tool: s.requiredTools[0] ?? null,
          outputType: s.outputType,
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
          assignedAgentPrimarySkill: agent.primarySkill ?? null,
          assignedAgentAiModel: agent.aiModel ?? null,
        }));
        return {
          squadName:   synth.name,
          methodology: synth.methodology,
          lead:        leadMember,
          agents:      [],
          steps:       enrichedSteps,
          showcases:   [],
        };
      }

      // squads and agents live on VM local DB (localPool)
      // Read `steps` directly from squads table (migrated from squad_template in Phase A.2)
      const [squadRows] = await localPool.execute(
        `SELECT id, slug, name, agents, missionType, showcases, methodology, steps FROM squads WHERE id = ? AND is_active = 1 LIMIT 1`,
        [input.squadId]
      ) as any[];
      const squad = (squadRows as any[])?.[0];
      if (!squad) {
        console.warn(`[squadRouter.getMembersById] Squad not found for squadId=${input.squadId}`);
        return { squadName: "", lead: null, agents: [], steps: [], showcases: [], methodology: "" };
      }

      console.log(`[squadRouter.getMembersById] Loaded squad id=${squad.id}, slug=${squad.slug}, name=${squad.name}`);
      const agentsJson = safeJsonParse<any[]>(squad.agents, []);
      const agentIds = agentsJson.map((m: any) => m.agent_id).filter(Boolean) as number[];

      if (!agentIds.length) {
        console.warn(`[squadRouter.getMembersById] Squad ${squad.id} (${squad.slug}) has NO agents in agents JSON`);
      }

      // Fetch real agent data
      let agentMap: Record<number, any> = {};
      if (agentIds.length) {
        const agentPlaceholders = agentIds.map(() => "?").join(",");
        const [agentRows] = await localPool.execute(
          `SELECT id, name, title, specialty, primarySkill, aiModel, avatarUrl
           FROM agents WHERE id IN (${agentPlaceholders})`,
          agentIds,
        ) as any[];
        for (const a of agentRows as any[]) agentMap[(a as any).id] = a;
      }

      // Merge agents JSON with real agent data
      const mapped = agentsJson
        .map(m => {
          const a = agentMap[m.agent_id];
          if (!a) return null;
          return {
            agentId:      m.agent_id as number,
            role:         (m.role ?? "") as string,
            isLead:       !!(m.is_lead === true || m.is_lead === 1),
            order:        (m.order ?? 0) as number,
            name:         (a.name ?? "") as string,
            title:        (a.title ?? "") as string,
            specialty:    (a.specialty ?? "") as string,
            primarySkill: (a.primarySkill ?? "") as string,
            aiModel:      (a.aiModel ?? "") as string,
            avatarUrl:    (a.avatarUrl ?? null) as string | null,
          };
        })
        .filter(Boolean) as any[];

      mapped.sort((a: any, b: any) =>
        (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0) || a.order - b.order
      );

      const lead   = mapped.find((m: any) => m.isLead) ?? null;
      const agents = mapped.filter((m: any) => !m.isLead);

      // Steps now live directly on the squad row (migrated from squad_template in Phase A.2)
      let steps: any[] = safeJsonParse<any[]>(squad.steps, []);

      // Fallback: if squads.steps is empty, try legacy squad_template by missionType (transitional)
      if (!steps.length && squad.missionType) {
        try {
          const [wfRows] = await localPool.execute(
            `SELECT steps FROM squad_template WHERE taskType = ? AND isActive = 1 LIMIT 1`,
            [squad.missionType]
          ) as any[];
          const wf = (wfRows as any[])?.[0];
          if (wf) steps = safeJsonParse<any[]>(wf.steps, []);
        } catch { /* no steps */ }
      }

      const showcases = safeJsonParse<any[]>(squad.showcases, []);

      // Enrich steps with real agent details (primarySkill, aiModel, name)
      const enrichedSteps = steps.map((step: any) => {
        const assignedId: number | null = step.assignedAgentId ?? null;
        const agentDetail = assignedId ? agentMap[assignedId] : null;
        return {
          ...step,
          assignedAgentPrimarySkill: agentDetail?.primarySkill ?? null,
          assignedAgentAiModel:      agentDetail?.aiModel      ?? null,
          assignedAgentName:         agentDetail?.name         ?? step.assignedAgentName ?? null,
        };
      });

      return {
        squadName:   (squad.name ?? "") as string,
        methodology: (squad.methodology ?? "") as string,
        lead,
        agents,
        steps: enrichedSteps,
        showcases,
      };
    }),

  // ── getAlternativeLeads ──────────────────────────────────────────────────────
  // 同一 workspace 其他 squads 的 lead agents（備選專家）
  getAlternativeLeads: protectedProcedure
    .input(z.object({
      workspace:      z.string().default("strategy"),
      excludeSquadId: z.number().optional(),
      limit:          z.number().default(6),
    }))
    .query(async ({ input }) => {
      const tags = WORKSPACE_TAGS[input.workspace] ?? WORKSPACE_TAGS.strategy;
      const tagLikes = tags.map(t => `s.tags LIKE '%${escapeLike(t)}%'`).join(" OR ");
      const excludeClause = input.excludeSquadId ? `AND s.id != ${input.excludeSquadId}` : "";

      const [rows] = await localPool.execute(
        `SELECT s.id, s.name, s.agents, s.industry_key
         FROM squads s
         WHERE s.is_active = 1 AND (${tagLikes})
         ${excludeClause}
         LIMIT 30`
      ) as any[];

      const candidates = (rows as any[])
        .map((row: any) => {
          const agents = safeJsonParse<any[]>(row.agents, []);
          const leadAgent = agents.find((m: any) => m.is_lead === true || m.is_lead === 1);
          return { squadId: row.id, squadName: row.name, leadAgentId: leadAgent?.agent_id ?? null };
        })
        .filter((c: any) => c.leadAgentId);

      if (!candidates.length) return [];

      const leadIds = candidates.map((c: any) => c.leadAgentId) as number[];
      const altLeadPlaceholders = leadIds.map(() => "?").join(",");
      const [agentRows] = await localPool.execute(
        `SELECT id, name, title, primarySkill, aiModel
         FROM agents WHERE id IN (${altLeadPlaceholders}) ORDER BY rating DESC`,
        leadIds,
      ) as any[];

      const agentMap: Record<number, any> = {};
      for (const a of agentRows as any[]) agentMap[(a as any).id] = a;

      return candidates
        .map((c: any) => {
          const agent = agentMap[c.leadAgentId!];
          if (!agent) return null;
          return {
            squadId:      c.squadId as number,
            squadName:    (c.squadName ?? "") as string,
            agentId:      agent.id as number,
            name:         (agent.name ?? "") as string,
            title:        (agent.title ?? "") as string,
            primarySkill: (agent.primarySkill ?? "") as string,
            aiModel:      (agent.aiModel ?? "") as string,
          };
        })
        .filter(Boolean)
        .slice(0, input.limit);
    }),

  // ── getSquadBySlug ────────────────────────────────────────────────────────────
  getSquadBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [rows] = await localPool.execute(
        `SELECT id, slug, name, description, industry_key, missionType, agents
         FROM squads WHERE slug = ? AND is_active = 1 LIMIT 1`,
        [input.slug]
      ) as any[];
      const row = (rows as any[])?.[0];
      if (!row) return null;

      const agentsArr  = safeJsonParse<any[]>(row.agents, []);
      const leadAgent  = agentsArr.find((m: any) => m.is_lead === true || m.is_lead === 1);

      // Fetch lead agent via localPool
      let lead = null;
      if (leadAgent?.agent_id) {
        const [aRows] = await localPool.execute(
          `SELECT id, name, title FROM agents WHERE id = ? LIMIT 1`,
          [leadAgent.agent_id]
        ) as any[];
        const a = (aRows as any[])?.[0];
        if (a) lead = { agentId: (a as any).id, name: (a as any).name, title: (a as any).title };
      }

      return {
        squadId:     row.id as number,
        slug:        (row.slug ?? "") as string,
        name:        (row.name ?? "") as string,
        description: (row.description ?? null) as string | null,
        industryKey: (row.industry_key ?? null) as string | null,
        missionType: (row.missionType ?? null) as string | null,
        agentCount:  agentsArr.length,
        lead,
      };
    }),

  // ── assemble ─────────────────────────────────────────────────────────────────
  // 用戶確認組隊 → 從 DB squad 建立真實 squad_agents 實例
  assemble: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      brandId:   z.number(),
      workspace: z.string().default("strategy"),
      squadId:   z.number().optional(),   // DB squads.id — preferred
      squadType: z.string().default("brand_positioning"), // fallback label
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const userId   = ctx.user.id;
      const squadUid = genSquadUid();

      // Get brand name
      const [brandRows] = await db.execute(
        sql`SELECT name FROM brands WHERE id = ${input.brandId} AND (userId = ${userId} OR createdBy = ${userId}) LIMIT 1`
      ) as any[];
      const brandName = (brandRows as any[])?.[0]?.name ?? "未命名品牌";

      // ── Determine squad title + members ──────────────────────────────────────
      let squadTitle = `${brandName} 行銷小組`;
      type AgentDef = { agentName: string; agentRole: string; agentTitle: string; model: string; skills: string[]; isLead?: boolean };
      let agentDefs: AgentDef[] = [];

      if (input.squadId && input.squadId < 0) {
        // Agent-mode: negative squadId = synthesized single-agent squad
        try {
          const agentId = Math.abs(input.squadId);
          const [aRows] = await localPool.execute(
            `SELECT id, slug, name, title, specialty, primarySkill, methodology, skills, taskType, layer, aiModel, avatarUrl, industries
             FROM agents WHERE id = ? LIMIT 1`,
            [agentId],
          ) as any[];
          const agent = (aRows as any[])?.[0];
          if (agent) {
            const synth = synthesizeAgentAsSquad(agent as AgentRow);
            squadTitle = `${brandName} × ${agent.name}`;
            agentDefs = [{
              agentName:  agent.name,
              agentRole:  agent.title ?? "specialist",
              agentTitle: agent.title ?? "Specialist",
              model:      agent.aiModel ?? "claude-sonnet",
              skills:     agent.primarySkill ? [agent.primarySkill] : [],
              isLead:     true,
            }];
            // Overwrite squadType with synth slug so missions.squadSlug stores "agent:<id>"
            (input as any).squadType = synth.slug;
          }
        } catch (e) {
          console.error("[squadRouter] assemble: agent-mode lookup error:", e);
        }
      } else if (input.squadId) {
        // Pull real members from squads (lives on VM local DB — localPool)
        try {
          const [sqRows] = await localPool.execute(
            `SELECT name, agents FROM squads WHERE id = ? AND is_active = 1 LIMIT 1`,
            [input.squadId]
          ) as any[];
          const sq = (sqRows as any[])?.[0];

          if (sq) {
            squadTitle = `${brandName} × ${sq.name}`;
            const membersJson = safeJsonParse<any[]>(sq.agents ?? sq.members, []);
            const agentIds = membersJson.map((m: any) => m.agent_id).filter(Boolean) as number[];

            if (agentIds.length) {
              const assemblePlaceholders = agentIds.map(() => "?").join(",");
              const [agentRows] = await localPool.execute(
                `SELECT id, name, title, primarySkill, aiModel
                 FROM agents WHERE id IN (${assemblePlaceholders})`,
                agentIds,
              ) as any[];
              const agentMap: Record<number, any> = {};
              for (const a of agentRows as any[]) agentMap[(a as any).id] = a;

              agentDefs = membersJson
                .map((m: any) => {
                  const a = agentMap[m.agent_id];
                  if (!a) return null;
                  return {
                    agentName:  a.name,
                    agentRole:  m.role ?? "specialist",
                    agentTitle: a.title,
                    model:      a.aiModel ?? "claude-sonnet",
                    skills:     a.primarySkill ? [a.primarySkill] : [],
                    isLead:     !!(m.is_lead === true || m.is_lead === 1),
                  };
                })
                .filter(Boolean) as AgentDef[];
            }
          }
        } catch (e) {
          console.error("[squadRouter] assemble: squads lookup error (localPool):", e);
        }
      }

      // Fallback to hardcoded positioning squad if no DB squad or no members
      if (!agentDefs.length) {
        squadTitle = `${brandName} 品牌定位小組`;
        agentDefs = [
          { agentName: FALLBACK_SQUAD_LEAD.agentName, agentRole: "squad_lead", agentTitle: FALLBACK_SQUAD_LEAD.agentTitle, model: FALLBACK_SQUAD_LEAD.model, skills: FALLBACK_SQUAD_LEAD.skills, isLead: true },
          { agentName: "Ryan Torres",    agentRole: "市場研究員",   agentTitle: "市場研究師",   model: "claude-sonnet", skills: ["產業趨勢", "市場機會"] },
          { agentName: "Priya Nair",    agentRole: "消費者洞察師", agentTitle: "消費者研究師", model: "claude-sonnet", skills: ["消費者行為", "Persona 設計"] },
          { agentName: "Layla Brooks",  agentRole: "競品分析師",   agentTitle: "品牌策略師",   model: "claude-sonnet", skills: ["競品研究", "差異化定位"] },
          { agentName: "Marcus Webb",  agentRole: "定位顧問",     agentTitle: "策略定位師",   model: "claude-sonnet", skills: ["價值主張", "品牌個性"] },
          { agentName: "Claire Sutton",  agentRole: "創意文案師",   agentTitle: "品牌文案師",   model: "claude-sonnet", skills: ["品牌訊息", "文案策略"] },
          { agentName: "Derek Mills",     agentRole: "通路策略師",   agentTitle: "行銷通路師",   model: "claude-sonnet", skills: ["通路規劃", "媒體選擇"] },
          { agentName: "PM Agent",    agentRole: "行銷計劃師",   agentTitle: "行銷計劃師",   model: "claude-sonnet", skills: ["執行計畫", "KPI 設定"] },
        ];
      }

      const leadDef = agentDefs.find(a => a.isLead) ?? agentDefs[0]!;

      // Insert squads record
      await db.execute(sql`
        INSERT INTO squad_sessions (squad_uid, mission_id, brand_id, user_id, workspace, squad_type, title, status, squad_lead)
        VALUES (
          ${squadUid}, ${input.missionId}, ${input.brandId}, ${userId},
          ${input.workspace}, ${input.squadType}, ${squadTitle},
          'assembling', ${leadDef.agentName}
        )
      `);

      // Insert squad_agents
      for (const agent of agentDefs) {
        const agentKey = genAgentKey(squadUid, agent.agentName);
        await db.execute(sql`
          INSERT INTO squad_agents
            (squad_uid, brand_id, user_id, mission_id, agent_key, agent_name, agent_role, agent_title,
             step_scope, brand_context, model, skills, status)
          VALUES (
            ${squadUid}, ${input.brandId}, ${userId}, ${input.missionId},
            ${agentKey}, ${agent.agentName}, ${agent.agentRole}, ${agent.agentTitle},
            ${JSON.stringify([])}, ${JSON.stringify({})},
            ${agent.model}, ${JSON.stringify(agent.skills)}, 'idle'
          )
        `);
      }

      // Link squad to mission — store the TEMPLATE SLUG (input.squadType), not the instance UID.
      // missionChatRouter reads missions.squadSlug and queries squads WHERE slug = ?.
      // Storing the UID here caused squad lookup to fail → "Mission Lead" fallback.
      // The squad_uid is already linked via squad_sessions.mission_id for instance tracking.
      const templateSlugToStore = input.squadType; // e.g. "brand-archetype-positioning"
      await db.execute(sql`
        UPDATE missions SET squadSlug = ${templateSlugToStore}, updatedAt = NOW()
        WHERE id = ${input.missionId} AND userId = ${userId}
      `);

      // Mark ready
      await db.execute(sql`
        UPDATE squad_sessions SET status = 'ready', updated_at = NOW()
        WHERE squad_uid = ${squadUid}
      `);

      return { squadUid, title: squadTitle, status: "ready" };
    }),

  // ── getStatus ────────────────────────────────────────────────────────────────
  getStatus: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rows] = await db.execute(
        sql`SELECT squad_uid, title, status, squad_lead, created_at
            FROM squad_sessions
            WHERE mission_id = ${input.missionId} AND user_id = ${ctx.user.id}
            ORDER BY created_at DESC LIMIT 1`
      ) as any[];
      const row = (rows as any[])?.[0];
      if (!row) return null;
      return { squadUid: row.squad_uid, title: row.title, status: row.status, squadLead: row.squad_lead };
    }),

  // ── getAgents ─────────────────────────────────────────────────────────────────
  getAgents: protectedProcedure
    .input(z.object({ squadUid: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(
        sql`SELECT agent_name, agent_role, agent_title, step_scope, skills, model, status
            FROM squad_agents
            WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id}
            ORDER BY id ASC`
      ) as any[];
      return (rows as any[]).map(r => ({
        agentName:  r.agent_name,
        agentRole:  r.agent_role,
        agentTitle: r.agent_title,
        stepScope:  r.step_scope ?? [],
        skills:     r.skills ?? [],
        model:      r.model,
        status:     r.status,
      }));
    }),

  // ── squadLeadOpen ─────────────────────────────────────────────────────────────
  squadLeadOpen: protectedProcedure
    .input(z.object({
      squadUid:  z.string(),
      missionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sqRows] = await db.execute(
        sql`SELECT brand_id, title, squad_lead FROM squad_sessions
            WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id} LIMIT 1`
      ) as any[];
      const sq = (sqRows as any[])?.[0];
      if (!sq) throw new TRPCError({ code: "NOT_FOUND" });

      const leadName  = sq.squad_lead ?? FALLBACK_SQUAD_LEAD.agentName;
      const leadTitle = FALLBACK_SQUAD_LEAD.agentTitle;

      const agentCtx = await loadAgentContext({
        missionId: input.missionId,
        brandId:   sq.brand_id,
        userId:    ctx.user.id,
        squadUid:  input.squadUid,
        agentKey:  undefined,
        isSquadLead: true,
      });

      const systemPrompt = `你是 ${leadName}，${leadTitle}。
你帶領了「${sq.title ?? "行銷小組"}」完成召集，即將展開工作。
${agentCtx.systemPromptPrefix}`;

      const userPrompt = `根據以上品牌資料和對話記錄，作為 Squad Lead，請：
1. 用一句話確認你對這個品牌目前狀況的初步理解
2. 提出 2-3 個最關鍵的問題，幫助團隊在開始之前釐清課題
3. 簡短說明你推薦的工作方式為什麼適合這個品牌現況

語氣：專業但有溫度，像真正帶過品牌的行銷人。用繁體中文回應。
長度：控制在 250 字內。${agentCtx.depthLabel}`;

      // Cross-provider fallback (Anthropic → Azure → OpenRouter) — Azure
      // alone returns DeploymentNotFound 404 when its deployment name is
      // stale, killing the squad. callLLM survives single-provider failures.
      const llmResult = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1500,
        timeoutMs: 35_000,
      });
      const reply = llmResult.text;

      await db.execute(sql`
        INSERT INTO chat_messages (userId, missionId, role, content, conversationTitle, createdAt)
        VALUES (${ctx.user.id}, ${input.missionId}, 'assistant', ${reply}, ${leadName}, NOW())
      `);

      await db.execute(sql`
        UPDATE squad_sessions SET status = 'running', updated_at = NOW()
        WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id}
      `);

      return {
        message:    reply,
        agentName:  leadName,
        agentTitle: leadTitle,
        historyDepth: agentCtx.historyDepth,
        depthLabel:   agentCtx.depthLabel,
      };
    }),

  // ── getRequirements ───────────────────────────────────────────────────────
  // Return the static requirements config for a squad slug (+ workspace fallback).
  getRequirements: protectedProcedure
    .input(z.object({
      squadSlug: z.string().optional().default(""),
      workspace: z.string().optional(),
    }))
    .query(({ input }) => {
      return getSquadRequirements(input.squadSlug || null, input.workspace ?? null);
    }),

  // ── getSessionStep ────────────────────────────────────────────────────────────
  // Returns the current step index for a mission's squad session.
  // Used by the right-panel sidebar to highlight the active agent / step
  // and to surface per-step conclusions on done steps.
  getSessionStep: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      phaseOrder: z.number().optional(), // Scheme B: defaults to 0 (intake / overall)
    }))
    .query(async ({ input }) => {
      try {
        const phaseOrder = input.phaseOrder ?? 0;
        const [rows] = await localPool.execute(
          `SELECT currentStep, squadSlug, status, stepResults
           FROM squad_chat_sessions
           WHERE missionId = ? AND phaseOrder = ? LIMIT 1`,
          [input.missionId, phaseOrder]
        ) as any[];
        const row = (rows as any[])?.[0];
        if (!row) {
          return {
            currentStep: 0,
            status: "intake" as const,
            found: false,
            stepResults: {} as Record<string, string>,
          };
        }
        // Parse stepResults JSON; stored as { [stepOrder: string]: "raw LLM output ≤2000 chars" }
        let stepResults: Record<string, string> = {};
        try {
          const raw = row.stepResults;
          if (raw) {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === "object") stepResults = parsed;
          }
        } catch { /* leave empty */ }
        return {
          currentStep: Number(row.currentStep ?? 0),
          status: (row.status ?? "intake") as string,
          found: true,
          stepResults,
        };
      } catch {
        return {
          currentStep: 0,
          status: "intake" as const,
          found: false,
          stepResults: {} as Record<string, string>,
        };
      }
    }),

  // ── stepExecute ──────────────────────────────────────────────────────────────
  // Run ONE workflow step against the assigned agent, persist the draft to
  // mission_step_progress, return the output text. Powers the in-place
  // WorkflowRunner in PickerWorkspace (post-launch right pane).
  //
  // Behavior (B3 hybrid):
  //   - mode="ask": agent asks the user a clarifying question for this step
  //                  (used on step 1 to gather requirements). Returns a
  //                  question string; no draft persisted.
  //   - mode="run": agent generates the draft for this step using prev step
  //                  outputs + user's most recent input. Persists `output`
  //                  with status="drafted".
  //   - mode="confirm": user accepted the draft → status="confirmed".
  //
  // Storage: one row per (missionId, stepOrder) in mission_step_progress.
  stepExecute: protectedProcedure
    .input(z.object({
      missionId:  z.number(),
      squadSlug:  z.string(),
      stepOrder:  z.number(),
      mode:       z.enum(["ask", "run", "confirm", "skip", "unskip"]),
      userInput:  z.string().max(4000).optional().default(""),
      // CJ correction 2026-04-30: agents must read product + event positioning,
      // not just brand. Picker passes the active ScopeBar state through here
      // so prompts include the right Pokemon GO Dragon Community Day context
      // instead of generic Snorlax examples.
      scopeBrandId:   z.number().nullable().optional(),
      scopeProductId: z.number().nullable().optional(),
      scopeEventId:   z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Auto-create progress table on first use
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_step_progress (
          id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
          mission_id   INT           NOT NULL,
          step_order   INT           NOT NULL,
          status       VARCHAR(20)   NOT NULL DEFAULT 'pending',
          user_input   TEXT,
          agent_output MEDIUMTEXT,
          agent_id     INT,
          agent_name   VARCHAR(120),
          history      JSON          NULL,
          updated_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                     ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uniq_step (mission_id, step_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Idempotent: add `history` column to existing tables (Sprint 1, E.undo).
      await db.execute(sql`
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'mission_step_progress'
           AND COLUMN_NAME = 'history'
      `).then(async (res: any) => {
        const rows = Array.isArray(res) ? res[0] : res?.rows ?? res;
        const c = Number((rows as any[])?.[0]?.c ?? 0);
        if (c === 0) {
          await db.execute(sql`ALTER TABLE mission_step_progress ADD COLUMN history JSON NULL`);
        }
      }).catch(() => { /* already added or alter not allowed; ignore */ });

      // Auto-create overrides table — stores planner step decisions
      // (quantity per step, custom instructions, themes)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mission_step_overrides (
          mission_id            INT           NOT NULL,
          step_order            INT           NOT NULL,
          override_name         VARCHAR(200)  NULL,
          override_instructions MEDIUMTEXT    NULL,
          quantity              INT           NOT NULL DEFAULT 1,
          themes                JSON          NULL,
          updated_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                             ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (mission_id, step_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `).catch(() => { /* table exists */ });

      // Load squad row + steps + agents (localPool — same shape as listByBrand)
      // 100s→99s rename compat: match both new ("fb-99-…") and legacy
      // ("fb-100-…") slug forms so historic DB rows still resolve.
      const stSlugNew = normalizeTaskId(input.squadSlug);
      const stSlugLegacy = legacyTaskId(stSlugNew);
      const stSlugs = stSlugLegacy ? [stSlugNew, stSlugLegacy] : [stSlugNew];
      const [sqRows] = await localPool.execute(
        `SELECT id, slug, name, agents, steps, methodology
           FROM squads WHERE slug IN (${stSlugs.map(() => "?").join(",")}) AND is_active = 1 LIMIT 1`,
        stSlugs,
      ) as any[];
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new TRPCError({ code: "NOT_FOUND", message: `squad slug ${input.squadSlug} not found` });

      const stepsRaw = safeJsonParse<any[]>(squad.steps, []);
      const step = stepsRaw.find((s: any) => Number(s.order ?? s.step) === input.stepOrder)
                ?? stepsRaw[input.stepOrder - 1];
      if (!step) throw new TRPCError({ code: "NOT_FOUND", message: `step ${input.stepOrder} not found` });

      // Resolve assigned agent
      const assignedId = step.assignedAgentId ? Number(step.assignedAgentId) : null;
      let agentRow: any = null;
      if (assignedId) {
        const [aRows] = await localPool.execute(
          `SELECT id, name, title, primarySkill, aiModel, specialty FROM agents WHERE id = ? LIMIT 1`,
          [assignedId],
        ) as any[];
        agentRow = (aRows as any[])?.[0] ?? null;
      }
      const agentName = agentRow?.name ?? step.assignedAgentName ?? "AI 專員";
      const agentTitle = agentRow?.title ?? "";
      const agentSkill = agentRow?.primarySkill ?? step.requiredSkill ?? "";

      // ── confirm: just flip status, no LLM ────────────────────────────────────
      if (input.mode === "confirm") {
        await db.execute(sql`
          UPDATE mission_step_progress
             SET status = 'confirmed'
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
        `);
        return { ok: true, status: "confirmed" as const };
      }

      // ── skip: mark step as skipped (no LLM, no chaining) ─────────────────────
      if (input.mode === "skip") {
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_name, agent_output)
          VALUES (${input.missionId}, ${input.stepOrder}, 'skipped', '使用者跳過', '')
          ON DUPLICATE KEY UPDATE status = 'skipped'
        `);
        return { ok: true, status: "skipped" as const };
      }
      if (input.mode === "unskip") {
        await db.execute(sql`
          UPDATE mission_step_progress
             SET status = 'pending'
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
             AND status = 'skipped'
        `);
        return { ok: true, status: "pending" as const };
      }

      // ── Load previous step outputs for chaining context ──────────────────────
      const [prevRows] = await db.execute(sql`
        SELECT step_order, agent_output
          FROM mission_step_progress
         WHERE mission_id = ${input.missionId}
           AND step_order < ${input.stepOrder}
           AND status IN ('drafted', 'confirmed')
         ORDER BY step_order ASC
      `) as any[];
      const prevOutputs = (prevRows as any[]).map((r: any) =>
        `【Step ${r.step_order} 結果】\n${(r.agent_output ?? "").slice(0, 1500)}`
      ).join("\n\n");

      // Load planner override for this specific step (if a plan step ran earlier)
      let stepOverride: { override_name: string | null; override_instructions: string | null; quantity: number; themes: any } | null = null;
      try {
        const [overrideRows] = await db.execute(sql`
          SELECT override_name, override_instructions, quantity, themes
            FROM mission_step_overrides
           WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
           LIMIT 1
        `) as any[];
        const ov = (overrideRows as any[])[0];
        if (ov) {
          stepOverride = {
            override_name: ov.override_name ?? null,
            override_instructions: ov.override_instructions ?? null,
            quantity: Number(ov.quantity ?? 1),
            themes: safeJsonParse(ov.themes, null),
          };
        }
      } catch { /* overrides table may not exist yet on first run */ }

      // Mission context
      const [mRows] = await db.execute(sql`
        SELECT title, description, objective, audience, brandId FROM missions
         WHERE id = ${input.missionId} AND userId = ${ctx.user.id} LIMIT 1
      `) as any[];
      const mission = (mRows as any[])?.[0];
      const missionContext = mission
        ? `任務：${mission.title}${mission.description ? ` · ${mission.description}` : ""}`
        : "";

      // Scope context — brand + product + event positioning, all injected.
      // CJ feedback 2026-04-30: agent only had brand context, so when user
      // bound 「2026年五月單首龍經典社群日」 the post text still talked about
      // generic 野生卡比獸 instead of Dragon Community Day. Now we resolve
      // and inject all three layers when present, with explicit cascade
      // (event > product > brand) so the LLM knows which is the focus.
      const scopeBrandId   = input.scopeBrandId   ?? mission?.brandId ?? null;
      const scopeProductId = input.scopeProductId ?? null;
      const scopeEventId   = input.scopeEventId   ?? null;
      const contextParts: string[] = [];
      if (scopeBrandId) {
        const [bRows] = await db.execute(sql`
          SELECT name, industry, description, positioningSummary, positioning
            FROM brands WHERE id = ${scopeBrandId} LIMIT 1
        `) as any[];
        const brand = (bRows as any[])?.[0];
        if (brand) {
          const sub: string[] = [`【品牌】${brand.name}${brand.industry ? `（${brand.industry}）` : ""}`];
          if (brand.positioningSummary) sub.push(`品牌定位：${String(brand.positioningSummary).slice(0, 600)}`);
          else if (brand.description)   sub.push(`品牌描述：${String(brand.description).slice(0, 400)}`);
          else if (brand.positioning) {
            const pos = typeof brand.positioning === "string" ? brand.positioning : JSON.stringify(brand.positioning);
            sub.push(`品牌定位（JSON）：${pos.slice(0, 800)}`);
          }
          contextParts.push(sub.join("\n"));
        }
      }
      if (scopeProductId) {
        const [pRows] = await localPool.execute(
          `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
          [scopeProductId],
        ) as any[];
        const product = (pRows as any[])?.[0];
        if (product) {
          const pos = typeof product.positioning === "string" ? product.positioning : (product.positioning ? JSON.stringify(product.positioning) : "");
          contextParts.push(`【產品】${product.name}${pos ? `\n產品定位：${pos.slice(0, 800)}` : ""}`);
        }
      }
      if (scopeEventId) {
        const [eRows] = await localPool.execute(
          `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`,
          [scopeEventId],
        ) as any[];
        const ev = (eRows as any[])?.[0];
        if (ev) {
          const period = ev.startAt
            ? `${String(ev.startAt).split("T")[0]} ~ ${String(ev.endAt ?? "").split("T")[0]}`
            : "（無日期）";
          const pos = typeof ev.positioning === "string" ? ev.positioning : (ev.positioning ? JSON.stringify(ev.positioning) : "");
          contextParts.push(
            `【活動】${ev.name}（期間 ${period}）\n` +
            (pos ? `活動定位（11-segment）：${pos.slice(0, 1500)}` : "活動定位：（未填）"),
          );
          // Strong scope-anchor: tell the LLM the event is the FOCUS, brand is supporting.
          contextParts.push(
            `【重要】此 mission 的執行 scope 是上面這個「活動」。所有舉例、產品、受眾、主題、行動呼籲都必須緊扣這個活動本身（時間、主題、目標族群），禁止用品牌的通用範例（例如野生寶可夢一般介紹）取代活動的特定內容。如果你產出的內容換到品牌的其他活動也說得通，就是失敗。`,
          );
        }
      }
      // ── 100s tier: inject real-time scout data (festivals / trending / news) ─
      // For squad slugs in our 100s pool, fetch real market data via Tavily/
      // Gemini and inject as context. Cached 5 min per (slug, brandId) to
      // avoid hitting the API on every step. Per CJ direction: 100s squads
      // must have actual market data, not just LLM internal knowledge.
      try {
        const { ALL_99S_SQUADS } = await import("../_core/quickTask100Squads");
        const matched = ALL_99S_SQUADS.find((s) => s.squad_slug === normalizeTaskId(input.squadSlug));
        if (matched) {
          const { fetchViralPatterns, formatViralPatternsForPrompt } = await import("../_core/socialListeningScout");
          // Decide kind from squad slug pattern
          const kind: "festivals" | "trending" | "news" | "viral" =
            matched.squad_slug.includes("monthly-calendar") || matched.squad_slug.includes("countdown") ? "festivals"
            : matched.squad_slug.includes("crisis") || matched.squad_slug.includes("kern-mass-control") ? "trending"
            : matched.squad_slug.includes("quarterly") || matched.squad_slug.includes("analytics") || matched.squad_slug.includes("reposition") ? "news"
            : "viral";
          // Use mission-level cache key
          const cacheKey = `__scout_${input.squadSlug}_${scopeBrandId ?? 0}`;
          const cached = (globalThis as any)[cacheKey];
          let viral = cached?.data;
          const cacheAge = cached ? Date.now() - cached.ts : Infinity;
          if (!viral || cacheAge > 5 * 60_000) {
            const topic = `${typeof matched.label === "string" ? matched.label : matched.label.zh} ${mission?.title ?? ""}`.slice(0, 120);
            viral = await fetchViralPatterns({
              channel: matched.platform,
              topic,
              brandId: scopeBrandId ?? undefined,
              kind,
            });
            (globalThis as any)[cacheKey] = { data: viral, ts: Date.now() };
          }
          if (viral && viral.patterns.length > 0) {
            contextParts.push(formatViralPatternsForPrompt(viral, kind));
          }
        }
      } catch (e) {
        // Scout failure non-fatal — squad still runs with brand context only
        console.log(`[100s scout] non-fatal: ${(e as Error)?.message}`);
      }

      const brandContext = contextParts.join("\n\n");

      const stepName = step.name ?? step.title ?? `Step ${input.stepOrder}`;
      const stepDesc = step.description ?? "";
      const outputType = step.outputType ?? step.output ?? "";

      // ── ask: agent asks 1–3 clarifying questions for this step ───────────────
      if (input.mode === "ask") {
        const systemPrompt = `你是 ${agentName}${agentTitle ? `（${agentTitle}）` : ""}，專長：${agentSkill}。
你即將執行「${stepName}」這個步驟。先用使用者聽得懂的話，提出 1–3 個最關鍵的問題，幫你完成這一步。
語氣專業但溫暖，像真正帶過品牌的行銷顧問。用繁體中文。控制在 200 字內。`;
        const userPrompt = `${missionContext}
${brandContext}
方法論：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}
此步驟說明：${stepDesc || "(無)"}
預期產出：${outputType || "(未指定)"}
${prevOutputs ? `\n前面步驟的成果：\n${prevOutputs}` : ""}
請只輸出問題本身，不要前言、不要編號以外的客套話。`;

        // Cross-provider fallback (Anthropic → Azure → OpenRouter) so a stale
        // Azure deployment can't single-handedly kill the squad.
        const llm = await callLLM({
          system: systemPrompt,
          user: userPrompt,
          maxTokens: 800,
          timeoutMs: 35_000,
        });
        const reply = llm.text;

        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_id, agent_name, agent_output)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'asking',
             ${assignedId ?? null}, ${agentName}, ${reply})
          ON DUPLICATE KEY UPDATE
            status = 'asking', agent_output = VALUES(agent_output),
            agent_id = VALUES(agent_id), agent_name = VALUES(agent_name)
        `);

        return {
          ok: true,
          status: "asking" as const,
          agentName, agentTitle, agentSkill,
          stepName, stepDesc, outputType,
          message: reply,
        };
      }

      // ── run: produce the draft for this step ─────────────────────────────────
      // Detect output kind from outputType keywords so we can give targeted guidance.
      // Explicit `outputKind` on the step or its assigned agent wins over keyword regex.
      const explicitKind = String((step as any).outputKind ?? (step as any).assignedAgent?.outputKind ?? "").toLowerCase();
      const ot = (outputType || "").toLowerCase();
      // Visual steps: detect first so we don't mis-label as content.
      const isVisual = explicitKind === "image" || explicitKind === "video"
        || /\b(image|visual|kv|banner|thumbnail|cover|carousel|poster|logo|illustration|video|reel|short|tvc|footage|clip|i2v|t2v|motion|spokesperson)\b/i.test(`${ot} ${stepName}`)
        || /(圖像|視覺|主視覺|封面|縮圖|海報|插畫|圖卡|圖文|圖示|影片|短片|短影音|動畫|動態)/.test(`${ot} ${stepName}`);
      const isContent = !isVisual && (
        /caption|post|copy|hook|hashtag|tag\b|tags|article|newsletter|tweet|script|story|title|headline|description|email|edm|長文|貼文|文案|hashtag|腳本|標題|簡介|文/i.test(ot)
        || /caption|post|copy|hook|hashtag|article|新聞稿|長文|貼文|文案|腳本|標題/i.test(stepName)
      );
      const isStrategic = !isVisual && !isContent &&
        /swot|persona|icp|research|analysis|brand|context|interview|competitor|strategy|plan|brief|outline|framework|insight|positioning|methodology|doc|report|matrix|mapping|journey|研究|分析|策略|框架|計畫|報告|訪談|競品|定位|脈絡|洞察|矩陣|藍圖/i.test(`${ot} ${stepName}`);

      // Plan step: agent reads all context and outputs an execution plan JSON.
      // Detected via explicit outputKind="plan" OR step name keywords.
      const isPlanStep = explicitKind === "plan"
        || /^plan$/i.test(outputType)
        || /執行計畫|execution.?plan|動態計畫|planner/i.test(`${ot} ${stepName}`);

      // ── Visual step short-circuit: agent produces the visual BRIEF only.
      // The actual image/video is generated client-side via the 3-step
      // MediaGenFlow (設計方向 → AI prompt → 模型選擇) — server must NOT
      // call image APIs here, that violates CJ's rule "由用戶在 Step 3 挑模型".
      // Detect a "media completion" payload coming back via userInput when
      // MediaGenFlow finishes — that arrives as `__media_url__: ...` and we
      // store as-is so subsequent steps can reference it.
      if (isVisual && /^__media_url__:/m.test(input.userInput || "")) {
        // Persist the media completion as the confirmed output for this step.
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, user_input, agent_output, agent_id, agent_name)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'drafted',
             ${input.userInput}, ${input.userInput},
             ${assignedId ?? null}, ${agentName})
          ON DUPLICATE KEY UPDATE
            status = 'drafted',
            user_input = VALUES(user_input),
            agent_output = VALUES(agent_output)
        `);
        return {
          ok: true, status: "drafted" as const,
          agentName, agentTitle, agentSkill, stepName, stepDesc, outputType,
          output: input.userInput,
        };
      }

      const outputGuide = isVisual
        ? `這是「視覺素材類」交付物 — 你的工作是寫出【視覺 brief】，不是真的生成圖像 / 影片。
- 用繁體中文描述這個畫面 / 影片要呈現什麼：主體、構圖、色彩、情緒、風格參考
- 如果是影片，再加上分鏡（每個鏡頭的時長 / 鏡頭運動 / 主體動作）
- 不要寫「我會這樣做」，直接寫「這個畫面是…」、「鏡頭一：…」
- 寫 3-6 句即可。後面用戶會看著這個 brief，在 3-step 流程裡進一步選方向、寫 AI prompt、挑模型生成
- 禁止輸出 Markdown code block 或 prompt template；就是純自然語言 brief`
        : isContent
        ? `這是「內容類」交付物 — 你交出的東西要可以直接複製貼上到平台發出去。

【嚴格禁止 — 違反任一條都算失敗】
✗ 禁止 markdown 標題符號（# ## ### 等）— 用戶會直接複製到 Facebook 貼文，井字號是雜訊
✗ 禁止內部標籤 / 步驟名稱（例如「Jab 1: 教育型貼文文案」、「Step 3 文案」、「貼文 1：...」）— 那是內部使用，不該出現在貼文內
✗ 禁止前言 / 解釋 / 開場白（「以下是...」、「我會這樣寫：」、「這篇貼文的目的是...」）— 直接交付貼文本體
✗ 禁止 markdown 條列符號（- *）混在文案中 — 用 emoji 或編號，不要 markdown 語法
✗ 禁止 hashtag 出現在貼文上半段 — 結尾才放，純 #tag 列表

【正確輸出 — 直接是 Facebook / IG / TikTok 用戶看到的那行字】
✓ 第一行就是 hook（吸睛句）+ emoji
✓ 中段：產品/活動賣點 + 受眾為什麼在乎
✓ 結尾：CTA + 連結佔位符 + 3-5 個 hashtag
✓ 換行用真實換行符（\\n），不是 <br> 也不是 markdown
✓ 如果產出是「圖文」、「視覺」、「縮圖」等視覺素材，請寫具體的圖片描述（讓 AI 繪圖工具可以根據此描述產圖）`
        : isStrategic
        ? `這是「策略 / 文件類」交付物 — 寫出完整的成品文件，不是「我會這樣做」的說明。
- 用 markdown 結構（## 大標 / - 條列）
- 每個段落要寫具體內容，不是描述「我會做什麼」
- 例如要做 SWOT 就直接寫 4 格的具體內容；要做 Persona 就直接寫角色檔案`
        : isPlanStep
        ? `這是「執行計畫」步驟 — 你需要讀取上游所有輸出（品牌研究、策略文件、用戶摘要），制定出後續步驟的具體執行計畫。

輸出格式：嚴格輸出 JSON，格式如下：
{
  "plan": [
    {
      "step_order": <整數，對應此 squad 的後續步驟順序>,
      "name": "<此步驟的具體名稱，例如『Dragon Day 教育型貼文 - 活動攻略篇』>",
      "quantity": <整數，要產出幾個版本，通常 1-3>,
      "theme": "<主題摘要，一句話>",
      "instructions": "<給執行 agent 的詳細指示，包含：主題、TA、CTA、必須提及的活動細節、禁忌事項>"
    }
  ],
  "summary": "<用一段話說明你的計畫邏輯，給用戶看的>"
}

規則：
- 只計劃你認為真正需要的步驟（可以比 squad 預設少）
- quantity 最多 3，如果策略說「3 篇貼文」就對那個步驟設 quantity=3
- instructions 要夠詳細，讓 agent 不需要回頭看策略就能執行
- 如果策略已確認了具體的發文主題、日期、TA，一定要寫進 instructions`
        : `直接寫出成品內容，不要寫「我會...」這種方法論說明。`;

      const systemPrompt = `你是 ${agentName}${agentTitle ? `（${agentTitle}）` : ""}，專長：${agentSkill}。
你正在執行「${stepName}」步驟。

【最高優先規則】直接交付完成品本身。
✗ 錯誤輸出（寫方法論）：「先抓住眼球的 hook，再帶出產品價值，最後 CTA」
✓ 正確輸出（寫成品）：「夏天還在悶熱中？這雙鞋讓你帶著風走 ☀️ / Air Mesh 透氣科技 + 反光防滑底 / 限時 9 折，只到週日！👉 連結見 bio」

✗ 錯誤輸出（寫方法論）：「定位的 5 個維度是：產品、TA、競爭、價值、人格」
✓ 正確輸出（寫成品）：「## 品牌定位\\nNIKE 是運動員突破自我的盟友。\\n## 目標 TA\\n18-34 歲都會運動者...」

${outputGuide}

用繁體中文。產出類型：${outputType || "適中"}。
${brandContext ? `\n【強制】這一步是為以下品牌服務，所有舉例、語氣、產品、受眾都必須緊扣這個品牌，禁止通用範本：\n${brandContext}\n如果你產出的內容換到別的品牌也成立，就是失敗。` : `\n【警告】此任務沒有綁定品牌，請提示使用者先到右上角選擇品牌再執行。`}`;

      const targetQuantity = stepOverride?.quantity ?? 1;
      const quantityGuide = targetQuantity > 1
        ? `\n【重要】請產出 ${targetQuantity} 個獨立版本的完整內容。每個版本之間用「---VERSION---」這個分隔符隔開（單獨一行）。版本之間不要有編號前言，直接是第一個版本的內容，分隔符，第二個版本的內容。`
        : "";

      const userPrompt = `${missionContext}
${brandContext ? `\n${brandContext}\n` : ""}
方法論參考：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}
此步驟說明：${stepOverride?.override_name ?? stepDesc ?? stepName}
預期產出類型：${outputType || "(未指定)"}
${stepOverride?.override_instructions ? `\n【執行計畫指示】（優先遵從）：\n${stepOverride.override_instructions}` : ""}
${prevOutputs ? `\n上游步驟成果（直接接續使用，不要重述）：\n${prevOutputs}` : ""}
${input.userInput ? `\n使用者補充：\n${input.userInput}` : ""}
${quantityGuide}

請直接交付【成品內容】 — 不是「我會這樣做」的說明。所有舉例必須來自上面這個 scope（活動 > 產品 > 品牌 cascade）的真實內容；如果有【活動】，舉例必須緊扣此活動的時間 / 主題 / TA / 商品 / CTA，不要拿品牌的其他活動或泛用例子代替。
若產出類型是貼文文案：禁止 markdown 標題符號（#）、禁止內部標籤（Jab 1: / Step 1:）、禁止前言。直接從第一句開始寫貼文本體。`;

      // Cross-provider fallback — Azure-only invokeLLM throws DeploymentNotFound
      // when the deployment name drifts. callLLM falls back to Anthropic /
      // OpenRouter / Foundry so a single bad provider can't block the squad.
      const llm = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 3000,
        timeoutMs: 35_000,
      });
      const rawOutput = llm.text;

      // Defensive cleanup for content-type outputs — strip markdown headers
      // and internal section labels even when the LLM ignores the prompt.
      // Strategic / brief outputs keep their markdown structure intact.
      const stripContentArtifacts = (s: string): string => {
        return s
          // Drop "Jab 1: ...", "Step 3: ...", "貼文 1：..." style internal labels
          // appearing as their own line at the start.
          .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
          // Strip leading markdown headers that snuck into a content post
          // (#, ##, ### at the start of a line).
          .replace(/^#{1,6}\s+/gm, "")
          // Strip "以下是..." / "這是..." / "我會..." prefaces on the first line.
          .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
          .trim();
      };
      let output = isContent ? stripContentArtifacts(rawOutput) : rawOutput;

      // ── Plan step: parse JSON output → write mission_step_overrides ──────────
      if (isPlanStep) {
        try {
          const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          const planJson = JSON.parse(cleaned);
          const planItems: any[] = Array.isArray(planJson.plan) ? planJson.plan : (Array.isArray(planJson) ? planJson : []);
          for (const item of planItems) {
            const so = Number(item.step_order);
            if (!so || isNaN(so)) continue;
            await db.execute(sql`
              INSERT INTO mission_step_overrides
                (mission_id, step_order, override_name, override_instructions, quantity, themes)
              VALUES
                (${input.missionId}, ${so},
                 ${item.name ?? null},
                 ${item.instructions ?? null},
                 ${Math.min(Math.max(Number(item.quantity ?? 1), 1), 5)},
                 ${item.theme ? JSON.stringify({ theme: item.theme }) : null})
              ON DUPLICATE KEY UPDATE
                override_name = VALUES(override_name),
                override_instructions = VALUES(override_instructions),
                quantity = VALUES(quantity),
                themes = VALUES(themes)
            `).catch((e: any) => console.warn("[planStep] override upsert failed:", e?.message));
          }
          // Keep the plan output readable for the user (use summary + pretty JSON)
          if (planJson.summary) {
            output = `## 執行計畫摘要\n${planJson.summary}\n\n## 詳細計畫\n\`\`\`json\n${JSON.stringify(planJson, null, 2)}\n\`\`\``;
          }
        } catch (e) {
          console.warn("[planStep] failed to parse plan JSON:", (e as Error).message);
        }
      }

      // ── Multi-version: if quantity > 1, split by separator → JSON ───────────
      const targetQty = stepOverride?.quantity ?? 1;
      if (!isPlanStep && targetQty > 1) {
        const parts = output.split(/^---VERSION---$/m).map((p: string) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          output = JSON.stringify({ __versions__: true, items: parts });
        }
        // If LLM didn't use separators but we expected multiple, keep raw output as single version
      }

      // Push the previous draft (if any) into history so the user can undo.
      // history is a JSON array of { output, userInput, ts }.
      const [existRows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const exist = (existRows as any[])?.[0];
      let nextHistory: any[] = [];
      if (exist?.agent_output) {
        const prevHist = safeJsonParse<any[]>(exist.history, []);
        nextHistory = [
          ...prevHist,
          { output: exist.agent_output, userInput: exist.user_input, ts: new Date().toISOString() },
        ].slice(-10); // cap at last 10 versions
      }

      await db.execute(sql`
        INSERT INTO mission_step_progress
          (mission_id, step_order, status, user_input, agent_output, agent_id, agent_name, history)
        VALUES
          (${input.missionId}, ${input.stepOrder}, 'drafted',
           ${input.userInput || null}, ${output},
           ${assignedId ?? null}, ${agentName},
           ${JSON.stringify(nextHistory)})
        ON DUPLICATE KEY UPDATE
          status = 'drafted',
          user_input = VALUES(user_input),
          agent_output = VALUES(agent_output),
          agent_id = VALUES(agent_id),
          agent_name = VALUES(agent_name),
          history = VALUES(history)
      `);

      return {
        ok: true,
        status: "drafted" as const,
        agentName, agentTitle, agentSkill,
        stepName, stepDesc, outputType,
        output,
      };
    }),

  // ── stepGetProgress ──────────────────────────────────────────────────────────
  // Read all step rows for a mission. Powers the WorkflowRunner timeline so
  // it can re-hydrate state on page reload (e.g. user shares /picker?mission=).
  stepGetProgress: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const [rows] = await db.execute(sql`
          SELECT step_order, status, user_input, agent_output, agent_name, history, updated_at
            FROM mission_step_progress
           WHERE mission_id = ${input.missionId}
           ORDER BY step_order ASC
        `) as any[];
        return (rows as any[]).map((r: any) => {
          const hist = safeJsonParse<any[]>(r.history, []);
          return {
            stepOrder:   Number(r.step_order),
            status:      String(r.status) as "asking" | "drafted" | "confirmed" | "pending",
            userInput:   r.user_input ?? "",
            agentOutput: r.agent_output ?? "",
            agentName:   r.agent_name ?? "",
            historyCount: Array.isArray(hist) ? hist.length : 0,
            updatedAt:   r.updated_at,
          };
        });
      } catch {
        return []; // table may not exist yet
      }
    }),

  // ── stepUndo ─────────────────────────────────────────────────────────────────
  // Pop the last history entry back into agent_output. Powers the "↶ 上一版"
  // button. No-op (return ok:false) if history is empty.
  stepUndo: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepOrder: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const [rows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const row = (rows as any[])?.[0];
      if (!row) return { ok: false, reason: "no-row" as const };

      const hist = safeJsonParse<any[]>(row.history, []);
      if (!Array.isArray(hist) || hist.length === 0) {
        return { ok: false, reason: "no-history" as const };
      }
      const last = hist[hist.length - 1];
      const remaining = hist.slice(0, -1);

      await db.execute(sql`
        UPDATE mission_step_progress
           SET agent_output = ${last.output ?? ""},
               user_input   = ${last.userInput ?? null},
               history      = ${JSON.stringify(remaining)},
               status       = 'drafted'
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
      `);
      return { ok: true, output: String(last.output ?? "") };
    }),

  // ── stepEditOutput ───────────────────────────────────────────────────────────
  // Manual user edit of agent_output. Pushes the previous version into history
  // (so undo still works). CJ direction 2026-04-30: 用戶要能逐字修改 agent
  // 寫的貼文文案，不能只是看著沒辦法改。
  stepEditOutput: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      stepOrder: z.number(),
      output:    z.string().max(20_000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Push current output into history before overwriting (so 上一版 keeps working)
      const [rows] = await db.execute(sql`
        SELECT agent_output, user_input, history FROM mission_step_progress
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder} LIMIT 1
      `) as any[];
      const row = (rows as any[])?.[0];
      if (!row) {
        // No row yet → create it as a manual draft
        await db.execute(sql`
          INSERT INTO mission_step_progress
            (mission_id, step_order, status, agent_output, agent_name, history)
          VALUES
            (${input.missionId}, ${input.stepOrder}, 'drafted',
             ${input.output}, '使用者手動編輯', '[]')
          ON DUPLICATE KEY UPDATE
            status = 'drafted',
            agent_output = VALUES(agent_output),
            history = VALUES(history)
        `);
        return { ok: true, output: input.output };
      }
      const prevHist = safeJsonParse<any[]>(row.history, []);
      const nextHistory = row.agent_output
        ? [...prevHist, { output: row.agent_output, userInput: row.user_input, ts: new Date().toISOString(), source: "pre-edit" }].slice(-10)
        : prevHist;

      await db.execute(sql`
        UPDATE mission_step_progress
           SET agent_output = ${input.output},
               history      = ${JSON.stringify(nextHistory)},
               status       = 'drafted'
         WHERE mission_id = ${input.missionId} AND step_order = ${input.stepOrder}
      `);
      return { ok: true, output: input.output };
    }),

  // ── askMary ──────────────────────────────────────────────────────────────────
  // Floating "問 Mary Allen" helper. Mary is the brand-strategy spokesperson
  // — given the mission's full step progress + brand context, she answers a
  // freeform user question about the run (e.g. "this step seems weak, why?",
  // "summarize what we have so far", "should we pivot the angle?").
  // Stateless: each call rebuilds context from DB. No history persisted yet
  // (drawer keeps it in client memory until refresh).
  askMary: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      question:  z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      // Mission + brand
      const [mRows] = await db.execute(sql`
        SELECT id, title, description, brandId, methodology FROM missions
         WHERE id = ${input.missionId} AND userId = ${ctx.user.id} LIMIT 1
      `) as any[];
      const mission = (mRows as any[])?.[0];
      if (!mission) throw new TRPCError({ code: "NOT_FOUND", message: "mission not found" });

      let brandLine = "";
      if (mission.brandId) {
        const [bRows] = await db.execute(sql`
          SELECT name, industry, positioningSummary FROM brands WHERE id = ${mission.brandId} LIMIT 1
        `) as any[];
        const b = (bRows as any[])?.[0];
        if (b) brandLine = `品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}${b.positioningSummary ? ` · ${String(b.positioningSummary).slice(0, 300)}` : ""}`;
      }

      // Step progress
      const [pRows] = await db.execute(sql`
        SELECT step_order, status, agent_name, agent_output FROM mission_step_progress
         WHERE mission_id = ${input.missionId}
         ORDER BY step_order ASC
      `) as any[];
      const progress = (pRows as any[]) ?? [];
      const progressLines = progress.map((r: any) => {
        const o = String(r.agent_output ?? "").slice(0, 600);
        return `[Step ${r.step_order} · ${r.status} · ${r.agent_name ?? ""}]\n${o}`;
      }).join("\n\n");

      const systemPrompt = `你是 Mary Allen，SoWork 的品牌策略召集人。語氣專業、誠實、不繞圈。
你正在陪一個團隊跑一個 marketing mission。使用者會問你關於這個任務的事 ——
你要根據目前的進度與品牌資訊作答，不要憑空編造。
回答用繁體中文，控制在 250 字內。如果答案需要看更多資料，明確說「我需要先看 Step X」。`;
      const userPrompt = `${brandLine}
任務：${mission.title}${mission.description ? ` · ${mission.description}` : ""}
方法論：${mission.methodology ?? "(未指定)"}

目前進度：
${progressLines || "(還沒有任何步驟產出)"}

使用者的問題：
${input.question}`;

      // Cross-provider fallback so squad-lead Q&A survives single-provider outages.
      const llm = await callLLM({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1500,
        timeoutMs: 35_000,
      });
      const answer = llm.text;
      return { ok: true, answer };
    }),

  // ── missionAnalytics ─────────────────────────────────────────────────────────
  // Per-mission analytics for the Canva-style 分析 dropdown. Reports
  // step-level timings, agent assignments, status counts. Token tracking
  // would slot in here later (we don't yet record token usage per call).
  missionAnalytics: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const [rows] = await db.execute(sql`
          SELECT step_order, status, agent_name, LENGTH(agent_output) AS output_len, updated_at
            FROM mission_step_progress
           WHERE mission_id = ${input.missionId}
           ORDER BY step_order ASC
        `) as any[];
        const arr = (rows as any[]) ?? [];
        const counts = arr.reduce((acc: any, r: any) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        return {
          totalSteps: arr.length,
          counts,
          steps: arr.map((r: any) => ({
            stepOrder: Number(r.step_order),
            status:    String(r.status),
            agentName: r.agent_name ?? "",
            outputLen: Number(r.output_len ?? 0),
            updatedAt: r.updated_at,
          })),
        };
      } catch {
        return { totalSteps: 0, counts: {}, steps: [] };
      }
    }),

  // ── logUsage ─────────────────────────────────────────────────────────────────
  // Write a squad_usage_log row when the user starts a squad session.
  logUsage: protectedProcedure
    .input(z.object({
      squadId:     z.number(),
      squadSlug:   z.string(),
      missionId:   z.number().optional(),
      brandId:     z.number().optional(),
      workspace:   z.string().optional(),
      missionType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.execute(sql`
        INSERT INTO squad_usage_log
          (user_id, brand_id, workspace, mission_id, mission_type, squad_id, squad_slug, started_at)
        VALUES (
          ${ctx.user.id},
          ${input.brandId ?? null},
          ${input.workspace ?? null},
          ${input.missionId ?? null},
          ${input.missionType ?? null},
          ${input.squadId},
          ${input.squadSlug},
          NOW(3)
        )
      `);
      return { ok: true };
    }),

  // ── getUsageStats ─────────────────────────────────────────────────────────────
  // PM analytics: aggregate squad usage counts for the current user (or all if admin).
  getUsageStats: protectedProcedure
    .input(z.object({
      days:    z.number().default(30),
      brandId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(sql`
        SELECT squad_slug, mission_type, workspace,
               COUNT(*) AS uses,
               MAX(started_at) AS last_used
        FROM squad_usage_log
        WHERE user_id = ${ctx.user.id}
          AND started_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
          ${input.brandId ? sql`AND brand_id = ${input.brandId}` : sql``}
        GROUP BY squad_slug, mission_type, workspace
        ORDER BY uses DESC
        LIMIT 50
      `) as any[];
      return (rows as any[]).map(r => ({
        squadSlug:   r.squad_slug as string,
        missionType: (r.mission_type ?? null) as string | null,
        workspace:   (r.workspace ?? null) as string | null,
        uses:        Number(r.uses),
        lastUsed:    r.last_used as Date,
      }));
    }),

  // ── getStepsAdmin ─────────────────────────────────────────────────────────
  // Returns the full steps array for a squad so the admin can view/edit
  // outputType per step. Uses localPool (mos_db).
  getStepsAdmin: protectedProcedure
    .input(z.object({ squadId: z.number() }))
    .query(async ({ input }) => {
      const [[row]] = await localPool.execute(
        `SELECT id, slug, name, steps FROM squads WHERE id = ?`,
        [input.squadId],
      ) as any;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Squad not found" });
      let steps: any[] = [];
      try {
        steps = typeof row.steps === "string"
          ? JSON.parse(row.steps)
          : (Array.isArray(row.steps) ? row.steps : []);
      } catch {}
      return {
        id: row.id as number,
        slug: row.slug as string,
        name: row.name as string,
        steps,
      };
    }),

  // ── setStepOutputType ─────────────────────────────────────────────────────
  // Patches a single step's outputType inside the steps JSON.
  // Matches by step index (0-based) or step.order / step.step field.
  setStepOutputType: protectedProcedure
    .input(z.object({
      squadId:    z.number(),
      stepIndex:  z.number(),       // 0-based index in the steps array
      outputType: z.string(),       // key from OUTPUT_TYPE_REGISTRY, or "" to clear
    }))
    .mutation(async ({ input }) => {
      const [[row]] = await localPool.execute(
        `SELECT steps FROM squads WHERE id = ?`,
        [input.squadId],
      ) as any;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Squad not found" });

      let steps: any[] = [];
      try {
        steps = typeof row.steps === "string"
          ? JSON.parse(row.steps)
          : (Array.isArray(row.steps) ? row.steps : []);
      } catch {}

      if (input.stepIndex < 0 || input.stepIndex >= steps.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Step index ${input.stepIndex} out of range` });
      }

      steps[input.stepIndex] = {
        ...steps[input.stepIndex],
        outputType: input.outputType || undefined,
      };

      await localPool.execute(
        `UPDATE squads SET steps = ? WHERE id = ?`,
        [JSON.stringify(steps), input.squadId],
      );

      return { ok: true, steps };
    }),

  // ── briefSearch ──────────────────────────────────────────────────────────
  // Real-time web search for BriefPanel fields.
  // Provider cascade (in order):
  //   0. Vertex AI Grounding    (GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_VERTEX_TOKEN)
  //   1. Gemini 2.0 Flash + Google Search  (GEMINI_API_KEY / GOOGLE_AI_API_KEY)
  //   2. Tavily               (TAVILY_API_KEY)
  //   3. Jina AI               (free, no key)
  //   4. Azure AI Foundry      (knowledge fallback, no live data)
  //   [Perplexity REMOVED — all 5 keys quota-exhausted 2026-05-04, causes 401 on every call]
  // Returns a short plain-text answer; empty string → client keeps field idle.
  briefSearch: protectedProcedure
    .input(z.object({
      query:       z.string().min(1).max(400),
      brandName:   z.string().optional(),
      productName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { ENV } = await import("../_core/env");
      const { invokeLLM, invokeVertexGrounding } = await import("../_core/llm");

      const q = input.query
        .replace("{brand_name}",   input.brandName   ?? "")
        .replace("{product_name}", input.productName ?? "");

      const extractText = (raw: any): string => {
        if (typeof raw === "string") return raw.trim();
        if (Array.isArray(raw)) return raw.map((p: any) => typeof p === "string" ? p : p?.text ?? "").join("").trim();
        return "";
      };

      // ── 0. Vertex AI Grounding (Google Search via Vertex AI) ──────────────
      // Best quality: uses GOOGLE_APPLICATION_CREDENTIALS (service account) or
      // GOOGLE_VERTEX_TOKEN env var. Falls through silently if neither is set.
      const hasVertexCreds = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_VERTEX_TOKEN);
      if (hasVertexCreds) {
        try {
          const answer = await invokeVertexGrounding({
            query: `用繁體中文，簡短回答（1-3句）：${q}`,
            system: "你是行銷數據研究員。只回傳答案本身，不要前言。",
            maxOutputTokens: 300,
          });
          if (answer.trim()) {
            console.log("[briefSearch] Vertex Grounding OK:", q.slice(0, 60));
            return { result: answer.trim() };
          }
        } catch (e: any) {
          console.warn("[briefSearch] Vertex Grounding error:", e?.message ?? e);
        }
      }

      // ── 1. Gemini 2.0 Flash + Google Search grounding ────────────────────
      // Uses google_search tool — real-time Google results, no extra key.
      const geminiKey = (ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY ?? "";
      if (geminiKey) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: `用繁體中文，簡短回答（1-3句）：${q}` }] }],
                tools: [{ google_search: {} }],
                generationConfig: { maxOutputTokens: 300 },
              }),
            }
          );
          if (res.ok) {
            const data = await res.json() as any;
            const answer = extractText(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
            if (answer) {
              console.log("[briefSearch] Gemini+Search OK:", q.slice(0, 60));
              return { result: answer };
            }
          } else {
            console.warn("[briefSearch] Gemini HTTP", res.status);
          }
        } catch (e: any) {
          console.warn("[briefSearch] Gemini error:", e?.message ?? e);
        }
      }

      // ── 2. Tavily (dedicated search API) ─────────────────────────────────
      const tavilyKey = ENV.TAVILY_API_KEY ?? "";
      if (tavilyKey) {
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key:        tavilyKey,
              query:          q,
              include_answer: true,
              search_depth:   "basic",
              max_results:    3,
            }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            const answer = (data?.answer as string | undefined)?.trim()
              || (data?.results?.[0]?.content as string | undefined)?.slice(0, 300).trim()
              || "";
            if (answer) {
              console.log("[briefSearch] Tavily OK:", q.slice(0, 60));
              return { result: answer };
            }
          } else {
            console.warn("[briefSearch] Tavily HTTP", res.status);
          }
        } catch (e: any) {
          console.warn("[briefSearch] Tavily error:", e?.message ?? e);
        }
      }

      // ── 3. Jina AI Search (free, no key needed) ───────────────────────────
      try {
        const jinaRes = await fetch(`https://s.jina.ai/${encodeURIComponent(q)}`, {
          headers: { "Accept": "application/json", "X-Return-Format": "text" },
        });
        if (jinaRes.ok) {
          const text = await jinaRes.text();
          const snippet = text.slice(0, 400).trim();
          if (snippet) {
            console.log("[briefSearch] Jina OK:", q.slice(0, 60));
            return { result: snippet };
          }
        }
      } catch (e: any) {
        console.warn("[briefSearch] Jina error:", e?.message ?? e);
      }

      // ── 4. Azure AI Foundry (LLM fallback, training data only) ───────────
      try {
        const res = await (invokeLLM as any)({
          provider: "azure-foundry",
          messages: [
            { role: "system", content: "你是行銷數據研究員。根據訓練知識，用繁體中文給出簡短摘要（1-3句）。只回傳內容。注意：非即時資料。" },
            { role: "user", content: q },
          ],
          maxTokens: 300,
        } as any);
        const answer = extractText((res as any)?.choices?.[0]?.message?.content);
        if (answer) {
          console.log("[briefSearch] Azure Foundry fallback OK:", q.slice(0, 60));
          return { result: answer };
        }
      } catch (e: any) {
        console.warn("[briefSearch] Azure Foundry error:", e?.message ?? e);
      }

      // ── 5. All failed — client keeps field idle ───────────────────────────
      console.warn("[briefSearch] All providers failed for:", q.slice(0, 60));
      return { result: "" };
    }),
});
