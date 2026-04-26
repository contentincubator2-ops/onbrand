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
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import localPool from "../localDb";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
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
  agentName: "劉品妤",
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
  listByBrand: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async () => {
      const [rows] = await localPool.execute(
        `SELECT s.id, s.slug, s.name, s.description, s.agents, s.steps,
                s.tier, s.strategy_layer, s.methodology, s.lead_agent_id, s.token,
                s.hero_image_url
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
        const ids = [...agentIdSet].join(",");
        try {
          const [aRows] = await localPool.execute(
            `SELECT id, name, title, primarySkill, aiModel FROM agents WHERE id IN (${ids})`
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
          const [agentRows] = await localPool.execute(
            `SELECT id, name, title FROM agents WHERE id IN (${leadIds.join(",")})`
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
        const [agentRows] = await localPool.execute(
          `SELECT id, name, title, specialty, primarySkill, aiModel, avatarUrl
           FROM agents WHERE id IN (${agentIds.join(",")})`
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
      const [agentRows] = await localPool.execute(
        `SELECT id, name, title, primarySkill, aiModel
         FROM agents WHERE id IN (${leadIds.join(",")}) ORDER BY rating DESC`
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
              const [agentRows] = await localPool.execute(
                `SELECT id, name, title, primarySkill, aiModel
                 FROM agents WHERE id IN (${agentIds.join(",")})`
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
          { agentName: "Mark Liu",    agentRole: "市場研究員",   agentTitle: "市場研究師",   model: "claude-sonnet", skills: ["產業趨勢", "市場機會"] },
          { agentName: "Amy Chen",    agentRole: "消費者洞察師", agentTitle: "消費者研究師", model: "claude-sonnet", skills: ["消費者行為", "Persona 設計"] },
          { agentName: "Sarah Chen",  agentRole: "競品分析師",   agentTitle: "品牌策略師",   model: "claude-sonnet", skills: ["競品研究", "差異化定位"] },
          { agentName: "David Wang",  agentRole: "定位顧問",     agentTitle: "策略定位師",   model: "claude-sonnet", skills: ["價值主張", "品牌個性"] },
          { agentName: "Jessica Wu",  agentRole: "創意文案師",   agentTitle: "品牌文案師",   model: "claude-sonnet", skills: ["品牌訊息", "文案策略"] },
          { agentName: "Tom Lin",     agentRole: "通路策略師",   agentTitle: "行銷通路師",   model: "claude-sonnet", skills: ["通路規劃", "媒體選擇"] },
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

      const llmResult = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      });
      const replyContent = llmResult.choices?.[0]?.message?.content ?? "";
      const reply = typeof replyContent === "string" ? replyContent : JSON.stringify(replyContent);

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
});
