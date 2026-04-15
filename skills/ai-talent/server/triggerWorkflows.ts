/**
 * triggerWorkflows — 任務完成後自動觸發工作流 helper
 *
 * 這個 helper 直接操作資料庫（繞過 tRPC），供 executeTask.ts 在任務完成後呼叫。
 * 它會：
 * 1. 查找匹配的啟用工作流（triggerAgentSlug 匹配 或 無條件觸發）
 * 2. 為每個步驟建立下游任務
 * 3. 更新工作流觸發統計
 * 4. 回傳觸發結果（供寫入 tasks.triggeredWorkflows）
 */

import { getDb } from "./db";
import { taskWorkflows, tasks, agents, subscriptions } from "../drizzle/schema";
import { eq, and, or, isNull } from "drizzle-orm";

export interface TriggeredWorkflowResult {
  triggered: boolean;
  workflows: Array<{
    workflowId: number;
    workflowName: string;
    createdTaskIds: number[];
    createdTaskCount: number;
  }>;
  totalCreatedTasks: number;
}

interface WorkflowStep {
  agentSlug: string;
  agentName?: string;
  taskTitle: string;
  taskDescription?: string;
  delayMinutes?: number;
}

/**
 * 任務完成後自動觸發匹配的工作流
 *
 * @param completedTaskId - 剛完成的任務 ID
 * @param agentSlug - 完成任務的 AI 員工 slug
 * @param userId - 任務所屬用戶 ID
 * @param brandId - 任務所屬品牌 ID（可選）
 */
export async function triggerWorkflowsForTask(
  completedTaskId: number,
  agentSlug: string,
  userId: number,
  brandId: number | null | undefined
): Promise<TriggeredWorkflowResult> {
  const empty: TriggeredWorkflowResult = {
    triggered: false,
    workflows: [],
    totalCreatedTasks: 0,
  };

  try {
    const db = await getDb();
    if (!db) return empty;

    // 查找匹配的工作流：
    // 1. triggerAgentSlug 完全匹配
    // 2. triggerAgentSlug 為 null（無條件觸發）
    const brandCondition = brandId
      ? or(eq(taskWorkflows.brandId, brandId), isNull(taskWorkflows.brandId))
      : isNull(taskWorkflows.brandId);

    const matchingWorkflows = await db
      .select()
      .from(taskWorkflows)
      .where(
        and(
          eq(taskWorkflows.userId, userId),
          eq(taskWorkflows.isActive, true),
          or(
            eq(taskWorkflows.triggerAgentSlug, agentSlug),
            isNull(taskWorkflows.triggerAgentSlug)
          ),
          brandCondition
        )
      )
      .limit(5);

    if (matchingWorkflows.length === 0) return empty;

    const triggeredWorkflows: TriggeredWorkflowResult["workflows"] = [];

    for (const workflow of matchingWorkflows) {
      const steps = (workflow.steps as WorkflowStep[]) ?? [];
      const createdTaskIds: number[] = [];

      for (const step of steps) {
        // 查找 AI 員工
        const agentRows = await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(eq(agents.slug, step.agentSlug))
          .limit(1);

        if (!agentRows[0]) {
          console.warn(`[triggerWorkflows] Agent not found: ${step.agentSlug}`);
          continue;
        }

        // 確認用戶已聘用此 AI 員工
        const subRows = await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, userId),
              eq(subscriptions.agentId, agentRows[0].id),
              eq(subscriptions.status, "active")
            )
          )
          .limit(1);

        if (!subRows[0]) {
          console.warn(`[triggerWorkflows] User ${userId} has not hired agent ${step.agentSlug}`);
          continue;
        }

        // 建立下游任務
        const [insertResult] = await db.insert(tasks).values({
          userId,
          agentId: agentRows[0].id,
          brandId: brandId ?? null,
          parentTaskId: completedTaskId,
          forwardNote: `由工作流「${workflow.name}」自動觸發`,
          title: step.taskTitle,
          description:
            step.taskDescription ??
            `工作流「${workflow.name}」自動建立的任務，請參考上游任務 #${completedTaskId} 的產出。`,
          status: "pending",
          priority: "normal",
        });

        const newTaskId = (insertResult as any).insertId;
        if (newTaskId) {
          createdTaskIds.push(newTaskId);
          console.log(
            `[triggerWorkflows] Created downstream task #${newTaskId} for workflow "${workflow.name}"`
          );
        }
      }

      if (createdTaskIds.length > 0) {
        // 更新工作流觸發統計
        await db
          .update(taskWorkflows)
          .set({
            triggerCount: workflow.triggerCount + 1,
            lastTriggeredAt: new Date(),
          })
          .where(eq(taskWorkflows.id, workflow.id));

        triggeredWorkflows.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          createdTaskIds,
          createdTaskCount: createdTaskIds.length,
        });
      }
    }

    if (triggeredWorkflows.length === 0) return empty;

    const totalCreatedTasks = triggeredWorkflows.reduce(
      (sum, w) => sum + w.createdTaskCount,
      0
    );

    console.log(
      `[triggerWorkflows] Task #${completedTaskId} triggered ${triggeredWorkflows.length} workflow(s), created ${totalCreatedTasks} downstream task(s)`
    );

    return {
      triggered: true,
      workflows: triggeredWorkflows,
      totalCreatedTasks,
    };
  } catch (err) {
    console.error("[triggerWorkflows] Error:", err);
    return empty;
  }
}
