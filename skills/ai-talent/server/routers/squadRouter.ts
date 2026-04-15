/**
 * squadRouter.ts — Squad 生命週期管理
 *
 * 流程：
 *   1. assemble()   — 用戶確認組隊 → 建立 squads + squad_agents 實例
 *   2. getStatus()  — 前端輪詢 → 回傳 status (assembling/ready/running/done)
 *   3. getAgents()  — 取得該 squad 的 agent 實例清單
 *   4. squadLeadOpen() — Squad Lead 掌握 brand context 後自動生成開場問題
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { randomBytes } from "crypto";

// ── Squad Lead 定義 ────────────────────────────────────────────────────────────
const SQUAD_LEAD_DEF = {
  agentName: "劉品妤",
  agentTitle: "AI 品牌故事 CMO",
  agentRole: "squad_lead",
  model: "claude-sonnet",
  skills: ["品牌定位", "策略規劃", "跨團隊協作"],
};

// ── Positioning Squad 成員定義（品牌定位 10 步驟）────────────────────────────
const POSITIONING_AGENTS = [
  { agentName: "Mark Liu",    agentRole: "市場研究員",   agentTitle: "市場研究師",   stepScope: [1],    model: "claude-sonnet", skills: ["產業趨勢", "市場機會", "競爭分析"] },
  { agentName: "Amy Chen",    agentRole: "消費者洞察師", agentTitle: "消費者研究師", stepScope: [2],    model: "claude-sonnet", skills: ["消費者行為", "Persona 設計", "調研分析"] },
  { agentName: "Sarah Chen",  agentRole: "競品分析師",   agentTitle: "品牌策略師",   stepScope: [3,4,5],model: "claude-sonnet", skills: ["競品研究", "品牌核心價值", "差異化定位"] },
  { agentName: "David Wang",  agentRole: "定位顧問",     agentTitle: "策略定位師",   stepScope: [6,7],  model: "claude-sonnet", skills: ["價值主張", "品牌個性", "定位框架"] },
  { agentName: "Jessica Wu",  agentRole: "創意文案師",   agentTitle: "品牌文案師",   stepScope: [8],    model: "claude-sonnet", skills: ["品牌訊息", "標語設計", "文案策略"] },
  { agentName: "Tom Lin",     agentRole: "通路策略師",   agentTitle: "行銷通路師",   stepScope: [9],    model: "claude-sonnet", skills: ["通路規劃", "內容行銷", "媒體選擇"] },
  { agentName: "PM Agent",    agentRole: "行銷計劃師",   agentTitle: "行銷計劃師",   stepScope: [10],   model: "claude-sonnet", skills: ["執行計畫", "KPI 設定", "里程碑規劃"] },
];

function genSquadUid(): string {
  return "sq_" + randomBytes(8).toString("hex");
}

function genAgentKey(squadUid: string, agentName: string): string {
  return `${squadUid}_${agentName.toLowerCase().replace(/\s+/g, "-")}`;
}

export const squadRouter = router({

  // ── 1. assemble — 用戶確認組隊，後端初始化整個 Squad ───────────────────────
  assemble: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      brandId: z.number(),
      workspace: z.string().default("strategy"),
      squadType: z.string().default("brand_positioning"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const userId = ctx.user.id;
      const squadUid = genSquadUid();

      // 取得品牌名稱（for title）
      const [brandRows] = await db.execute(
        sql`SELECT name FROM brands WHERE id = ${input.brandId} AND (userId = ${userId} OR createdBy = ${userId}) LIMIT 1`
      ) as any[];
      const brandName = (brandRows as any[])?.[0]?.name ?? "未命名品牌";
      const title = `${brandName} 品牌定位小組`;

      // 建立 squads 記錄
      await db.execute(sql`
        INSERT INTO squads (squad_uid, mission_id, brand_id, user_id, workspace, squad_type, title, status, squad_lead)
        VALUES (
          ${squadUid}, ${input.missionId}, ${input.brandId}, ${userId},
          ${input.workspace}, ${input.squadType}, ${title},
          'assembling', ${SQUAD_LEAD_DEF.agentName}
        )
      `);

      // 建立 Squad Lead 實例
      const leadKey = genAgentKey(squadUid, SQUAD_LEAD_DEF.agentName);
      await db.execute(sql`
        INSERT INTO squad_agents
          (squad_uid, brand_id, user_id, mission_id, agent_key, agent_name, agent_role, agent_title, step_scope, brand_context, model, skills, status)
        VALUES (
          ${squadUid}, ${input.brandId}, ${userId}, ${input.missionId},
          ${leadKey}, ${SQUAD_LEAD_DEF.agentName}, ${SQUAD_LEAD_DEF.agentRole},
          ${SQUAD_LEAD_DEF.agentTitle}, ${JSON.stringify([])},
          ${JSON.stringify({})}, ${SQUAD_LEAD_DEF.model},
          ${JSON.stringify(SQUAD_LEAD_DEF.skills)}, 'idle'
        )
      `);

      // 建立各 Agent 實例
      for (const agent of POSITIONING_AGENTS) {
        const agentKey = genAgentKey(squadUid, agent.agentName);
        await db.execute(sql`
          INSERT INTO squad_agents
            (squad_uid, brand_id, user_id, mission_id, agent_key, agent_name, agent_role, agent_title, step_scope, brand_context, model, skills, status)
          VALUES (
            ${squadUid}, ${input.brandId}, ${userId}, ${input.missionId},
            ${agentKey}, ${agent.agentName}, ${agent.agentRole}, ${agent.agentTitle},
            ${JSON.stringify(agent.stepScope)}, ${JSON.stringify({})},
            ${agent.model}, ${JSON.stringify(agent.skills)}, 'idle'
          )
        `);
      }

      // 更新 missions 記錄 squad_uid（為對話路由做準備）
      await db.execute(sql`
        UPDATE missions SET squadSlug = ${squadUid}, updatedAt = NOW()
        WHERE id = ${input.missionId} AND userId = ${userId}
      `);

      // 初始化完成 → status = ready
      await db.execute(sql`
        UPDATE squads SET status = 'ready', updated_at = NOW()
        WHERE squad_uid = ${squadUid}
      `);

      return { squadUid, title, status: "ready" };
    }),

  // ── 2. getStatus — 前端輪詢用 ────────────────────────────────────────────────
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
      return {
        squadUid: row.squad_uid,
        title: row.title,
        status: row.status,
        squadLead: row.squad_lead,
      };
    }),

  // ── 3. getAgents — 取得 squad 成員實例清單 ───────────────────────────────────
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
        agentName: r.agent_name,
        agentRole: r.agent_role,
        agentTitle: r.agent_title,
        stepScope: r.step_scope ?? [],
        skills: r.skills ?? [],
        model: r.model,
        status: r.status,
      }));
    }),

  // ── 4. squadLeadOpen — Squad Lead 掌握 context 後生成開場問題 ─────────────
  squadLeadOpen: protectedProcedure
    .input(z.object({
      squadUid: z.string(),
      missionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 取得品牌 + 任務 context
      const [rows] = await db.execute(
        sql`SELECT b.name as brandName, b.industry, b.description, b.targetAudience,
                   b.tagline, b.positioningStatus,
                   m.title as missionTitle, m.objective, m.workspace,
                   s.title as squadTitle
            FROM squads s
            JOIN missions m ON m.id = s.mission_id
            JOIN brands b ON b.id = s.brand_id
            WHERE s.squad_uid = ${input.squadUid} AND s.user_id = ${ctx.user.id}
            LIMIT 1`
      ) as any[];

      const ctx_data = (rows as any[])?.[0];
      if (!ctx_data) throw new TRPCError({ code: "NOT_FOUND" });

      const prompt = `你是 ${SQUAD_LEAD_DEF.agentName}，${SQUAD_LEAD_DEF.agentTitle}，剛剛帶領了一支品牌定位小組被召集完畢。

品牌資訊：
- 品牌名稱：${ctx_data.brandName}
- 產業：${ctx_data.industry ?? "未填寫"}
- 描述：${ctx_data.description ?? "未填寫"}
- 目標受眾：${ctx_data.targetAudience ?? "未填寫"}
- 目前 Tagline：${ctx_data.tagline ?? "尚無"}
- 定位狀態：${ctx_data.positioningStatus ?? "pending"}

任務：${ctx_data.missionTitle}
目標：${ctx_data.objective ?? "未填寫"}

根據以上資訊，作為 Squad Lead，請：
1. 用一句話確認你對這個品牌的初步理解
2. 提出 2-3 個最關鍵的問題，幫助你的團隊在開始之前釐清課題
3. 推薦接下來的 10 步驟品牌定位流程（一句話說明為什麼這個流程適合這個品牌）

語氣：專業但有溫度，像一個真正帶過品牌的行銷人。用繁體中文回應。
長度：控制在 200 字內。`;

      const llmResult = await invokeLLM({ messages: [
        { role: "system", content: `你是 ${SQUAD_LEAD_DEF.agentName}，${SQUAD_LEAD_DEF.agentTitle}。` },
        { role: "user", content: prompt },
      ]});
      const replyContent = llmResult.choices?.[0]?.message?.content ?? "";
      const reply = typeof replyContent === "string" ? replyContent : JSON.stringify(replyContent);

      // 寫入對話紀錄
      await db.execute(sql`
        INSERT INTO chat_messages (userId, missionId, role, content, conversationTitle, createdAt)
        VALUES (${ctx.user.id}, ${input.missionId}, 'assistant', ${reply}, ${SQUAD_LEAD_DEF.agentName}, NOW())
      `);

      // 更新 squad status = running
      await db.execute(sql`
        UPDATE squads SET status = 'running', updated_at = NOW()
        WHERE squad_uid = ${input.squadUid} AND user_id = ${ctx.user.id}
      `);

      return { message: reply, agentName: SQUAD_LEAD_DEF.agentName, agentTitle: SQUAD_LEAD_DEF.agentTitle };
    }),
});
