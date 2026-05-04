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
import { randomUUID } from 'crypto';
import { protectedProcedure, router } from "../_core/trpc";
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

  /**
   * start — 提交任務到 BullMQ Queue（A2A 非同步模式）
   *
   * SEC-B-04 (2026-05-04): changed from publicProcedure to protectedProcedure.
   * Previous public + per-IP rate limit allowed any anonymous caller to burn
   * Anthropic / Azure quota by submitting LLM jobs (10/min/IP, easily bypassed
   * via IP rotation, and the in-memory rate map evaporates on PM2 restart).
   * Frontend caller (MissionChatCore.tsx:577) is always inside a logged-in
   * session, so this change is non-breaking for legit users.
   */
  start: protectedProcedure
    .input(z.object({
      userRequest: z.string().min(1).max(2000),
      brand: z.string().optional(),
      industry: z.string().optional(),
      taskType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Belt-and-suspenders: still rate-limit per user (account-level)
      const userId = (ctx as any)?.user?.id ?? "anon";
      _checkRateLimit(`start:user:${userId}`, 30);
      const jobId = randomUUID();
      const job = await marketingQueue.add('execute-task', {
        jobId,
        userRequest: input.userRequest,
        brand: input.brand,
        industry: input.industry,
        taskType: input.taskType,
        userId, // tag the job so worker can audit
      }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      return { jobId: job.id, status: 'queued' };
    }),

  /**
   * status — 輪詢任務狀態
   * SEC-B-04: protected so anonymous callers can't enumerate jobIds.
   */
  status: protectedProcedure
    .input(z.object({ jobId: z.string().min(1).max(128) }))
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


});
