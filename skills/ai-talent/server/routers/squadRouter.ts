/**
 * squadRouter.ts — Squad 生命週期管理 + DB-driven 推薦
 *
 * 查詢流程：
 *   getRecommendedSquads() — 從 517 個 agent_squads 中，按 workspace + brand + mission 評分推薦 6 個
 *   getMembersById()       — 解析 agent_squads.members JSON → 查 agents → 回傳真實成員 + workflow steps
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
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { randomBytes } from "crypto";
import { loadAgentContext } from "../agentContextLoader";

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

const WORKSPACE_TAGS: Record<string, string[]> = {
  strategy:  ["brand", "strategy", "gtm", "b2b", "full-funnel", "positioning", "market", "saas"],
  website:   ["seo", "website", "content", "web", "ux", "cro", "copywriting", "conversion"],
  facebook:  ["meta-ads", "facebook", "social", "ads", "community", "ecom", "creative"],
  linkedin:  ["linkedin", "b2b", "thought-leadership", "demand-gen", "b2b_saas"],
  youtube:   ["youtube", "video", "content", "yt", "影片"],
  pr:        ["pr", "公關", "媒體", "新聞", "media"],
  event:     ["event", "活動", "展覽"],
  instore:   ["retail", "門市", "實體"],
};

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

export const squadRouter = router({

  // ── getRecommendedSquads ─────────────────────────────────────────────────────
  // 從 agent_squads 按 workspace + brand + mission 評分，回傳前 N 個 squad chips
  getRecommendedSquads: protectedProcedure
    .input(z.object({
      workspace: z.string().default("strategy"),
      brandId:   z.number().optional(),
      missionId: z.number().optional(),
      limit:     z.number().default(6),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const tags = WORKSPACE_TAGS[input.workspace] ?? WORKSPACE_TAGS.strategy;

      // 1. Get brand industry
      let brandIndustry: string | null = null;
      if (input.brandId) {
        const [bRows] = await db.execute(
          sql`SELECT industry FROM brands WHERE id = ${input.brandId} LIMIT 1`
        ) as any[];
        const raw = (bRows as any[])?.[0]?.industry ?? null;
        // sanitise before embedding in raw SQL
        brandIndustry = raw ? raw.replace(/['"\\;]/g, "") : null;
      }

      // 2. Get mission title + description for keyword scoring
      let missionKeywords: string[] = [];
      if (input.missionId) {
        const [mRows] = await db.execute(
          sql`SELECT title, description FROM missions WHERE id = ${input.missionId} LIMIT 1`
        ) as any[];
        const m = (mRows as any[])?.[0];
        const text = [m?.title ?? "", m?.description ?? ""].join(" ");
        missionKeywords = text.split(/[\s，,。、！？]+/).filter(w => w.length >= 2);
      }

      // 3. Build dynamic LIKE conditions from workspace tags (hardcoded, safe)
      const tagLikes = tags.map(t => `tags LIKE '%${escapeLike(t)}%'`).join(" OR ");
      const industryClause = brandIndustry
        ? ` OR industry_key = '${brandIndustry}'`
        : "";

      // 4. Fetch up to 60 candidates
      const [squadRows] = await db.execute(
        sql.raw(`
          SELECT id, slug, name, description, industry_key, market, taskType,
                 members, tags, use_cases, squad_type
          FROM agent_squads
          WHERE is_active = 1
            AND (${tagLikes}${industryClause})
          LIMIT 60
        `)
      ) as any[];

      if (!(squadRows as any[]).length) return [];

      // 5. JS-side scoring
      const candidates = (squadRows as any[]).map(row => {
        const members  = safeJsonParse<any[]>(row.members, []);
        const rowTags  = safeJsonParse<string[]>(row.tags, []);
        const useCases = safeJsonParse<string[]>(row.use_cases, []);

        let score = 0;
        // Workspace tag overlap
        for (const tag of tags) {
          if (rowTags.some(t => t.toLowerCase().includes(tag.toLowerCase()))) score += 3;
        }
        // Industry match
        if (brandIndustry) {
          if (row.industry_key === brandIndustry) score += 5;
          if (rowTags.some(t => t.toLowerCase().includes(brandIndustry!.toLowerCase()))) score += 2;
        }
        // Mission keyword overlap
        for (const word of missionKeywords) {
          if ((row.name ?? "").includes(word)) score += 2;
          if (useCases.some((uc: string) => uc.includes(word))) score += 1;
        }
        // Member richness bonus
        score += Math.min(members.length, 5);

        const leadMember = members.find((m: any) => m.is_lead === true || m.is_lead === 1);
        return { row, members, rowTags, useCases, score, leadAgentId: leadMember?.agent_id ?? null };
      });

      // 6. Sort + take top N
      const top = [...candidates]
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit);

      // 7. Batch-fetch lead agents
      const leadIds = top.map(c => c.leadAgentId).filter(Boolean) as number[];
      const leadMap: Record<number, any> = {};
      if (leadIds.length) {
        const [agentRows] = await db.execute(
          sql.raw(`SELECT id, name, title FROM agents WHERE id IN (${leadIds.join(",")})`)
        ) as any[];
        for (const a of agentRows as any[]) leadMap[a.id] = a;
      }

      return top.map(({ row, members, score, leadAgentId }) => ({
        squadId:     row.id as number,
        slug:        (row.slug ?? "") as string,
        name:        (row.name ?? "") as string,
        description: (row.description ?? null) as string | null,
        industryKey: (row.industry_key ?? null) as string | null,
        taskType:    (row.taskType ?? null) as string | null,
        memberCount: members.length,
        lead: leadAgentId && leadMap[leadAgentId] ? {
          agentId: leadAgentId,
          name:    leadMap[leadAgentId].name as string,
          title:   leadMap[leadAgentId].title as string,
        } : null,
        matchScore: score,
      }));
    }),

  // ── getMembersById ──────────────────────────────────────────────────────────
  // 給定 squadId，解析 members JSON → 查 agents → 回傳真實成員 + workflow steps
  getMembersById: protectedProcedure
    .input(z.object({ squadId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { squadName: "", lead: null, members: [], steps: [] };

      const [squadRows] = await db.execute(
        sql`SELECT name, members, taskType FROM agent_squads WHERE id = ${input.squadId} AND is_active = 1 LIMIT 1`
      ) as any[];
      const squad = (squadRows as any[])?.[0];
      if (!squad) return { squadName: "", lead: null, members: [], steps: [] };

      const membersJson = safeJsonParse<any[]>(squad.members, []);
      const agentIds = membersJson.map(m => m.agent_id).filter(Boolean) as number[];

      // Fetch real agent data
      let agentMap: Record<number, any> = {};
      if (agentIds.length) {
        const [agentRows] = await db.execute(
          sql.raw(
            `SELECT id, name, title, specialty, primarySkill, aiModel, avatarUrl
             FROM agents WHERE id IN (${agentIds.join(",")})`
          )
        ) as any[];
        for (const a of agentRows as any[]) agentMap[a.id] = a;
      }

      // Merge members JSON with real agent data
      const mapped = membersJson
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

      const lead    = mapped.find((m: any) => m.isLead) ?? null;
      const members = mapped.filter((m: any) => !m.isLead);

      // Fetch workflow steps from squad_workflow_templates
      let steps: any[] = [];
      if (squad.taskType) {
        const [wfRows] = await db.execute(
          sql`SELECT steps FROM squad_workflow_templates WHERE taskType = ${squad.taskType} AND isActive = 1 LIMIT 1`
        ) as any[];
        const wf = (wfRows as any[])?.[0];
        if (wf) steps = safeJsonParse<any[]>(wf.steps, []);
      }

      return {
        squadName: (squad.name ?? "") as string,
        lead,
        members,
        steps,
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
      const db = await getDb();
      if (!db) return [];

      const tags = WORKSPACE_TAGS[input.workspace] ?? WORKSPACE_TAGS.strategy;
      const tagLikes = tags.map(t => `s.tags LIKE '%${escapeLike(t)}%'`).join(" OR ");
      const excludeClause = input.excludeSquadId ? `AND s.id != ${input.excludeSquadId}` : "";

      const [rows] = await db.execute(
        sql.raw(`
          SELECT s.id, s.name, s.members, s.industry_key
          FROM agent_squads s
          WHERE s.is_active = 1 AND (${tagLikes})
          ${excludeClause}
          LIMIT 30
        `)
      ) as any[];

      // Extract lead agent ids
      const candidates = (rows as any[])
        .map(row => {
          const members = safeJsonParse<any[]>(row.members, []);
          const lead = members.find((m: any) => m.is_lead === true || m.is_lead === 1);
          return { squadId: row.id, squadName: row.name, leadAgentId: lead?.agent_id ?? null };
        })
        .filter(c => c.leadAgentId);

      if (!candidates.length) return [];

      const leadIds = candidates.map(c => c.leadAgentId) as number[];
      const [agentRows] = await db.execute(
        sql.raw(
          `SELECT id, name, title, primarySkill, aiModel
           FROM agents WHERE id IN (${leadIds.join(",")}) ORDER BY rating DESC`
        )
      ) as any[];

      const agentMap: Record<number, any> = {};
      for (const a of agentRows as any[]) agentMap[a.id] = a;

      return candidates
        .map(c => {
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
  // 透過 slug 查單一 squad（用於頁面重載後還原選中的 chip 狀態）
  getSquadBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [rows] = await db.execute(
        sql`SELECT id, slug, name, description, industry_key, taskType, members
            FROM agent_squads WHERE slug = ${input.slug} AND is_active = 1 LIMIT 1`
      ) as any[];
      const row = (rows as any[])?.[0];
      if (!row) return null;

      const members  = safeJsonParse<any[]>(row.members, []);
      const leadMember = members.find((m: any) => m.is_lead === true || m.is_lead === 1);

      // Fetch lead agent
      let lead = null;
      if (leadMember?.agent_id) {
        const [aRows] = await db.execute(
          sql`SELECT id, name, title FROM agents WHERE id = ${leadMember.agent_id} LIMIT 1`
        ) as any[];
        const a = (aRows as any[])?.[0];
        if (a) lead = { agentId: a.id, name: a.name, title: a.title };
      }

      return {
        squadId:     row.id as number,
        slug:        (row.slug ?? "") as string,
        name:        (row.name ?? "") as string,
        description: (row.description ?? null) as string | null,
        industryKey: (row.industry_key ?? null) as string | null,
        taskType:    (row.taskType ?? null) as string | null,
        memberCount: members.length,
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
      squadId:   z.number().optional(),   // DB agent_squads.id — preferred
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

      if (input.squadId) {
        // Pull real members from agent_squads
        const [sqRows] = await db.execute(
          sql`SELECT name, members FROM agent_squads WHERE id = ${input.squadId} AND is_active = 1 LIMIT 1`
        ) as any[];
        const sq = (sqRows as any[])?.[0];

        if (sq) {
          squadTitle = `${brandName} × ${sq.name}`;
          const membersJson = safeJsonParse<any[]>(sq.members, []);
          const agentIds = membersJson.map((m: any) => m.agent_id).filter(Boolean) as number[];

          if (agentIds.length) {
            const [agentRows] = await db.execute(
              sql.raw(
                `SELECT id, name, title, primarySkill, aiModel
                 FROM agents WHERE id IN (${agentIds.join(",")})`
              )
            ) as any[];
            const agentMap: Record<number, any> = {};
            for (const a of agentRows as any[]) agentMap[a.id] = a;

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

      const leadDef = agentDefs.find(a => a.isLead) ?? agentDefs[0];

      // Insert squads record
      await db.execute(sql`
        INSERT INTO squads (squad_uid, mission_id, brand_id, user_id, workspace, squad_type, title, status, squad_lead)
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

      // Link squad to mission
      await db.execute(sql`
        UPDATE missions SET squadSlug = ${squadUid}, updatedAt = NOW()
        WHERE id = ${input.missionId} AND userId = ${userId}
      `);

      // Mark ready
      await db.execute(sql`
        UPDATE squads SET status = 'ready', updated_at = NOW()
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
            FROM squads
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
        sql`SELECT brand_id, title, squad_lead FROM squads
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
        UPDATE squads SET status = 'running', updated_at = NOW()
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
});
