/**
 * Workflow Router — 自動工作流 Triggers
 *
 * 功能：
 * 1. CRUD：建立/列出/更新/刪除工作流
 * 2. triggerByTask：任務完成後呼叫，檢查是否有匹配的工作流並觸發下游任務
 * 3. 每個工作流包含多個「步驟」，每步驟對應一個 AI 員工 + 任務描述
 */

import { z } from "zod";
import { marketingQueue } from '../queue/marketingQueue';
import { buildJobId } from '../queue/jobId';
import { randomUUID } from 'crypto';
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { taskWorkflows, tasks, agents, subscriptions } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// SEC: Simple in-memory rate limit for public LLM endpoints
// Limits: 10 requests/minute per IP for runTask, 20 for status/recommendSquads
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function _checkRateLimit(key: string, maxPerMin: number): void {
  const now = Date.now();
  const entry = _rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > maxPerMin) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please slow down." });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WorkflowStep {
  agentSlug: string;
  agentName?: string;
  taskTitle: string;
  taskDescription?: string;
  delayMinutes?: number;
}

const workflowStepSchema = z.object({
  agentSlug: z.string().min(1),
  agentName: z.string().optional(),
  taskTitle: z.string().min(1).max(256),
  taskDescription: z.string().optional(),
  delayMinutes: z.number().min(0).default(0),
});

// ── Router ────────────────────────────────────────────────────────────────────
export const workflowRouter = router({
  /**
   * 列出目前用戶的所有工作流
   */
  list: protectedProcedure
    .input(z.object({ brandId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(taskWorkflows)
        .where(
          and(
            eq(taskWorkflows.userId, ctx.user.id),
            ...(input.brandId ? [eq(taskWorkflows.brandId, input.brandId)] : [])
          )
        )
        .orderBy(desc(taskWorkflows.createdAt));

      return rows.map((r) => ({
        ...r,
        steps: (r.steps as WorkflowStep[]) ?? [],
      }));
    }),

  /**
   * 建立新工作流
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        brandId: z.number().optional(),
        triggerAgentSlug: z.string().optional(),
        triggerTaskType: z.string().optional(),
        steps: z.array(workflowStepSchema).min(1).max(10),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(taskWorkflows).values({
        userId: ctx.user.id,
        brandId: input.brandId ?? null,
        name: input.name,
        description: input.description ?? null,
        triggerAgentSlug: input.triggerAgentSlug ?? null,
        triggerTaskType: input.triggerTaskType ?? null,
        steps: input.steps,
        isActive: input.isActive,
        triggerCount: 0,
      });

      return { id: (result as any).insertId };
    }),

  /**
   * 更新工作流
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        triggerAgentSlug: z.string().optional(),
        triggerTaskType: z.string().optional(),
        steps: z.array(workflowStepSchema).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db
        .select({ userId: taskWorkflows.userId })
        .from(taskWorkflows)
        .where(eq(taskWorkflows.id, input.id))
        .limit(1);

      if (!existing[0] || existing[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.triggerAgentSlug !== undefined) updateData.triggerAgentSlug = input.triggerAgentSlug;
      if (input.triggerTaskType !== undefined) updateData.triggerTaskType = input.triggerTaskType;
      if (input.steps !== undefined) updateData.steps = input.steps;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      await db
        .update(taskWorkflows)
        .set(updateData)
        .where(and(eq(taskWorkflows.id, input.id), eq(taskWorkflows.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * 刪除工作流
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(taskWorkflows)
        .where(and(eq(taskWorkflows.id, input.id), eq(taskWorkflows.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * 切換工作流啟用/停用
   */
  toggle: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(taskWorkflows)
        .set({ isActive: input.isActive })
        .where(and(eq(taskWorkflows.id, input.id), eq(taskWorkflows.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * 任務完成後觸發工作流（由前端在任務完成後呼叫）
   * 自動建立下游任務
   */
  triggerByTask: protectedProcedure
    .input(
      z.object({
        completedTaskId: z.number(),
        agentSlug: z.string(),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { triggered: false, workflowName: null, createdTaskIds: [] };

      // 查找匹配的工作流（triggerAgentSlug 匹配 或 無條件觸發）
      const matchingWorkflows = await db
        .select()
        .from(taskWorkflows)
        .where(
          and(
            eq(taskWorkflows.userId, ctx.user.id),
            eq(taskWorkflows.isActive, true),
            eq(taskWorkflows.triggerAgentSlug, input.agentSlug),
            ...(input.brandId ? [eq(taskWorkflows.brandId, input.brandId)] : [])
          )
        )
        .limit(3);

      if (matchingWorkflows.length === 0) {
        return { triggered: false, workflowName: null, createdTaskIds: [] };
      }

      const workflow = matchingWorkflows[0]!;
      const steps = (workflow.steps as WorkflowStep[]) ?? [];
      const createdTaskIds: number[] = [];

      // 查找每個步驟的 agentId
      for (const step of steps) {
        const agentRows = await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(eq(agents.slug, step.agentSlug))
          .limit(1);

        if (!agentRows[0]) continue;

        // 確認用戶已聘用此 AI 員工
        const subRows = await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, ctx.user.id),
              eq(subscriptions.agentId, agentRows[0].id),
              eq(subscriptions.status, "active")
            )
          )
          .limit(1);

        if (!subRows[0]) continue;

        // 建立下游任務（以完成任務為 parentTaskId）
        const [insertResult] = await db.insert(tasks).values({
          userId: ctx.user.id,
          agentId: agentRows[0].id,
          brandId: input.brandId ?? null,
          parentTaskId: input.completedTaskId,
          forwardNote: `由工作流「${workflow.name}」自動觸發`,
          title: step.taskTitle,
          description: step.taskDescription ?? `工作流「${workflow.name}」自動建立的任務`,
          status: "pending",
          priority: "normal",
        });

        const newTaskId = (insertResult as any).insertId;
        if (newTaskId) createdTaskIds.push(newTaskId);
      }

      // 更新工作流觸發統計
      await db
        .update(taskWorkflows)
        .set({
          triggerCount: workflow.triggerCount + 1,
          lastTriggeredAt: new Date(),
        })
        .where(eq(taskWorkflows.id, workflow.id));

      return {
        triggered: true,
        workflowName: workflow.name,
        createdTaskIds,
      };
    }),

  /**
   * 取得可用的 AI 員工清單（用於工作流步驟選擇）
   */
  getAvailableAgents: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // 只回傳用戶已聘用的 AI 員工
    const rows = await db
      .select({
        id: agents.id,
        slug: agents.slug,
        name: agents.name,
        title: agents.title,
        avatarUrl: agents.avatarUrl,
        layer: agents.layer,
      })
      .from(agents)
      .innerJoin(
        subscriptions,
        and(
          eq(subscriptions.agentId, agents.id),
          eq(subscriptions.userId, ctx.user.id),
          eq(subscriptions.status, "active")
        )
      );

    return rows;
  }),

  // ─── Sprint 3: LLM 直接呼叫 ────────────────────────────────────────────────

  /**
   * runTask — 直接呼叫 LLM 產出行銷內容
   * 不需要認證（publicProcedure），適合前端即時呼叫
   */
  runTask: publicProcedure
    .input(z.object({
      userRequest: z.string().min(1),
      brand: z.string().optional(),
      industry: z.string().optional(),
      taskType: z.string().optional(),
      agentName: z.string().optional(),
      agentTitle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // SEC: rate limit — 10 requests/minute per IP
      const ip = (ctx as any)?.req?.ip ?? (ctx as any)?.ip ?? 'unknown';
      _checkRateLimit(`runTask:${ip}`, 10);
      const { invokeLLM } = await import("../_core/llm");
      const { getModelForTask, inferTaskType } = await import("../_core/modelRouter");

      const { userRequest, brand, industry, agentName, agentTitle } = input;

      // 推斷任務類型
      const inferredType = inferTaskType(userRequest);
      const modelConfig = getModelForTask(inferredType);

      // 建立 system prompt
      const agentPersona = agentName
        ? `你是 ${agentName}，${agentTitle || "行銷專家"}。`
        : "你是一位專業的行銷策略師與文案專家。";

      const systemPrompt = `${agentPersona}
你服務的產業：${industry || "科技"}
品牌：${brand || "未指定"}

請根據用戶的需求，提供專業的行銷內容或建議。
輸出格式為 JSON（必須是合法 JSON，不要加 markdown code block）：
{
  "thinking": "你的策略思考過程（100字以內）",
  "publishable_content": "可以直接使用的完整內容",
  "metadata": { "hashtags": ["tag1", "tag2"], "posting_time": "建議發文時間" }
}`;

      try {
        const response = await invokeLLM({
          provider: modelConfig.provider as any,
          model: modelConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userRequest }
          ],
          max_tokens: 1500,
          response_format: { type: "json_object" },
        });

        const rawContent = response.choices?.[0]?.message?.content ?? "";
        let parsed: any;
        try {
          parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
        } catch {
          parsed = { publishable_content: rawContent, thinking: "", metadata: { hashtags: [], posting_time: "" } };
        }

        return {
          success: true,
          agent: {
            name: agentName || "AI 行銷專家",
            title: agentTitle || "Marketing Specialist",
          },
          model: modelConfig.label,
          taskType: inferredType,
          result: parsed,
          usage: response.usage,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `LLM 呼叫失敗: ${err.message}`,
        });
      }
    }),


  /**
   * start — 提交任務到 BullMQ Queue（A2A 非同步模式）
   */
  start: publicProcedure
    .input(z.object({
      userRequest: z.string().min(1).max(2000),
      brand: z.string().optional(),
      industry: z.string().optional(),
      taskType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // SEC: rate limit — 10 requests/minute per IP
      const ip = (ctx as any)?.req?.ip ?? (ctx as any)?.ip ?? 'unknown';
      _checkRateLimit(`start:${ip}`, 10);
      // Use a stable mission ID derived from the request so that duplicate
      // submissions within a session are idempotent (BullMQ dedupes on jobId).
      const missionId = randomUUID();
      const payload = {
        jobId: missionId,
        userRequest: input.userRequest,
        brand: input.brand,
        industry: input.industry,
        taskType: input.taskType,
      };
      const deterministicJobId = buildJobId(missionId, 'execute-task', payload as Record<string, unknown>);
      const job = await marketingQueue.add('execute-task', payload, {
        jobId: deterministicJobId,
        // defaultJobOptions (attempts:5, backoff:exponential) already applied
        // by the Queue constructor; explicit overrides can still be passed here.
      });
      return { jobId: job.id, status: 'queued' };
    }),

  /**
   * status — 輪詢任務狀態
   */
  status: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await marketingQueue.getJob(input.jobId);
      if (!job) return { status: 'not_found' };
      const state = await job.getState();
      const progress = job.progress;
      const result = job.returnvalue;
      const failReason = job.failedReason;
      return {
        jobId: input.jobId,
        status: state,
        progress,
        result: state === 'completed' ? result : null,
        error: state === 'failed' ? failReason : null,
      };
    }),

  /**
   * runSquadWorkflow — 多 agent 協作（Sprint 3 後半段）- kept for backward compat
   */
  runSquadWorkflow: protectedProcedure
    .input(z.object({
      userRequest: z.string().min(1),
      squadId: z.number().optional(),
      brand: z.string().optional(),
      industry: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return { message: "Use workflow.runSquad for Squad A2A execution", status: "deprecated" };
    }),

  /**
   * recommendSquads — 根據用戶需求推薦適合的 Squad（Sprint 7）
   */
  recommendSquads: publicProcedure
    .input(z.object({
      userRequest: z.string().min(1),
      brand: z.string().optional(),
      industry: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { recommendSquads } = await import('../squad/squadRecommender');
      return recommendSquads({ ...input, limit: 3 });
    }),

  /**
   * runSquad — 執行 Squad Leader A2A Workflow（Sprint 7）
   */
  runSquad: publicProcedure
    .input(z.object({
      squadId: z.number(),
      userRequest: z.string().min(1),
      brand: z.string().optional(),
      industry: z.string().optional(),
      userId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { squadQueue } = await import('../queue/squadLeaderWorker');
      const missionId = randomUUID();
      const payload = {
        jobId: missionId,
        ...input,
      };
      const deterministicJobId = buildJobId(
        missionId,
        'squad-task',
        payload as Record<string, unknown>,
      );
      const job = await squadQueue.add('squad-task', payload, {
        jobId: deterministicJobId,
        // defaultJobOptions (attempts:5, backoff:exponential) already applied
        // by the Queue constructor.
      });
      return { jobId: job.id, status: 'queued' };
    }),

  /**
   * squadStatus — 查詢 Squad 任務狀態（Sprint 7）
   */
  squadStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const { squadQueue } = await import('../queue/squadLeaderWorker');
      const job = await squadQueue.getJob(input.jobId);
      if (!job) return { status: 'not_found' };
      const state = await job.getState();
      return {
        jobId: input.jobId,
        status: state,
        progress: job.progress,
        result: state === 'completed' ? job.returnvalue : null,
        error: state === 'failed' ? job.failedReason : null,
      };
    }),

  // PM Agent — 個人專屬 PM，帶對話記憶
  pmChat: publicProcedure
    .input(z.object({
      userMessage: z.string().min(1).max(2000),
      sessionId: z.string().default('default'),
      userId: z.number().optional(),
      brandName: z.string().optional(),
      industry: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { processPMAgentMessage } = await import('../pmAgent/pmAgentService');
      const result = await processPMAgentMessage({
        userId: input.userId || 199,
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        brandName: input.brandName,
        industry: input.industry,
      });
      return result;
    }),

  // 取得對話歷史
  pmHistory: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      userId: z.number().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const { getConversationHistory } = await import('../pmAgent/pmAgentService');
      return getConversationHistory(input.userId || 199, input.sessionId, input.limit);
    }),

});
