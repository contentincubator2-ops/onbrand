/**
 * 小隊目錄：前台清單、推薦、成員、組隊與簡報搜尋。
 */
import { protectedProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import localPool from "../../../localDb";
import { safeJsonParse, normalizeWorkspace, WORKSPACE_TAGS, escapeLike, genSquadUid, FALLBACK_SQUAD_LEAD, genAgentKey } from "./helpers";
import { getDb } from "../../../db";
import { sql } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "../../../platform/core/llm/embedding";
import { type AgentRow, synthesizeAgentAsSquad } from "../../core/squad/agentSquadSynth";
import { TRPCError } from "@trpc/server";
import { getSquadRequirements } from "../../core/squad/squadRequirements";

export const catalogProcedures = {
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
      type AgentDef = { sourceAgentId?: number; agentName: string; agentRole: string; agentTitle: string; model: string; skills: string[]; isLead?: boolean };
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
              sourceAgentId: agent.id,
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
                    sourceAgentId: a.id,
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
          { sourceAgentId: FALLBACK_SQUAD_LEAD.sourceAgentId, agentName: FALLBACK_SQUAD_LEAD.agentName, agentRole: "squad_lead", agentTitle: FALLBACK_SQUAD_LEAD.agentTitle, model: FALLBACK_SQUAD_LEAD.model, skills: FALLBACK_SQUAD_LEAD.skills, isLead: true },
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
            (squad_uid, brand_id, user_id, mission_id, source_agent_id, agent_key, agent_name, agent_role, agent_title,
             step_scope, brand_context, model, skills, status)
          VALUES (
            ${squadUid}, ${input.brandId}, ${userId}, ${input.missionId},
            ${agent.sourceAgentId ?? null}, ${agentKey}, ${agent.agentName}, ${agent.agentRole}, ${agent.agentTitle},
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
        sql`SELECT source_agent_id, agent_name, agent_role, agent_title, step_scope, skills, model, status
            FROM squad_agents
            WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id}
            ORDER BY id ASC`
      ) as any[];
      return (rows as any[]).map(r => ({
        agentId:    r.source_agent_id ? Number(r.source_agent_id) : null,
        agentName:  r.agent_name,
        agentRole:  r.agent_role,
        agentTitle: r.agent_title,
        stepScope:  r.step_scope ?? [],
        skills:     r.skills ?? [],
        model:      r.model,
        status:     r.status,
      }));
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
      const { ENV } = await import("../../../platform/core/env");
      const { invokeLLM, invokeVertexGrounding } = await import("../../../platform/core/llm/llm");

      const q = input.query
        .replace("{brand_name}",   input.brandName   ?? "")
        .replace("{product_name}", input.productName ?? "");

      const extractText = (raw: any): string => {
        if (typeof raw === "string") return raw.trim();
        if (Array.isArray(raw)) return raw.map((p: any) => typeof p === "string" ? p : p?.text ?? "").join("").trim();
        return "";
      };

      // 2026-07-26 (CJ「自動填寫出現伺服器太忙碌」): none of the provider
      // calls had a timeout — one hung provider pushed the whole cascade
      // past nginx's 60s upstream cap, which returns an HTML error page the
      // client surfaces as 伺服器忙碌. Per-provider budgets keep the worst
      // case (10+10+8+8+12 = 48s) safely under the proxy limit; a timed-out
      // provider just falls through to the next one.
      const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
        ]);

      // ── 0. Vertex AI Grounding (Google Search via Vertex AI) ──────────────
      // Best quality: uses GOOGLE_APPLICATION_CREDENTIALS (service account) or
      // GOOGLE_VERTEX_TOKEN env var. Falls through silently if neither is set.
      const hasVertexCreds = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_VERTEX_TOKEN);
      if (hasVertexCreds) {
        try {
          const answer = await withTimeout(invokeVertexGrounding({
            query: `用繁體中文，簡短回答（1-3句）：${q}`,
            system: "你是行銷數據研究員。只回傳答案本身，不要前言。",
            maxOutputTokens: 300,
          }), 10_000, "vertex");
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
              signal: AbortSignal.timeout(10_000),
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
            signal: AbortSignal.timeout(8_000),
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
          signal: AbortSignal.timeout(8_000),
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
        const res = await withTimeout((invokeLLM as any)({
          provider: "azure-foundry",
          messages: [
            { role: "system", content: "你是行銷數據研究員。根據訓練知識，用繁體中文給出簡短摘要（1-3句）。只回傳內容。注意：非即時資料。" },
            { role: "user", content: q },
          ],
          maxTokens: 300,
        } as any), 12_000, "azure-foundry");
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
};
