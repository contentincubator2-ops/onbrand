/**
 * AI 員工個人學習記錄機制
 *
 * 設計原則：
 * - 月租型（monthly/team）：isPrivate=true，學習記錄屬品牌私有
 *   → 只在同品牌的未來任務中注入，其他用戶無法受益
 * - 任務型（per_task）：isPrivate=false，學習記錄為公共資產
 *   → 可注入所有用戶的相同 AI 員工任務，累積提升全平台品質
 */

import { getDb } from "./db";
import { agentLearnings } from "../drizzle/schema";
import { eq, and, or, desc } from "drizzle-orm";

export interface SaveLearningInput {
  agentId: number;
  userId: number;
  brandId?: number | null;
  taskId?: number | null;
  subscriptionPlan: "per_task" | "monthly" | "team";
  taskTitle: string;
  taskDescription?: string | null;
  taskType?: string | null;
  outputSummary: string;
  fullOutput: string;
  brandContext?: Record<string, unknown> | null;
}

/**
 * 任務完成後自動儲存學習記錄
 * 月租/團隊型 → isPrivate=true（品牌私有）
 * 任務型 → isPrivate=false（公共共享）
 */
export async function saveLearning(input: SaveLearningInput): Promise<number> {
  const isPrivate = input.subscriptionPlan === "monthly" || input.subscriptionPlan === "team";

  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const [result] = await database.insert(agentLearnings).values({
    agentId: input.agentId,
    userId: input.userId,
    brandId: input.brandId ?? null,
    taskId: input.taskId ?? null,
    subscriptionPlan: input.subscriptionPlan,
    isPrivate,
    taskTitle: input.taskTitle,
    taskDescription: input.taskDescription ?? null,
    taskType: input.taskType ?? null,
    // 產出摘要：取前 600 字，用於未來相似任務的上下文注入
    outputSummary: input.outputSummary.slice(0, 600),
    fullOutput: input.fullOutput,
    brandContext: input.brandContext ?? null,
  });

  console.log(
    `[Learning] Saved learning record for agent ${input.agentId}, ` +
    `task "${input.taskTitle}", isPrivate=${isPrivate}, id=${(result as any).insertId}`
  );

  return (result as any).insertId as number;
}

/**
 * 更新學習記錄的用戶反饋（評分 + 文字）
 */
export async function updateLearningFeedback(
  learningId: number,
  rating: number,
  feedback?: string | null
): Promise<void> {
  const database = await getDb();
  if (!database) return;
  await database
    .update(agentLearnings)
    .set({
      userRating: rating,
      userFeedback: feedback ?? null,
      feedbackAt: new Date(),
    })
    .where(eq(agentLearnings.id, learningId));

  console.log(`[Learning] Updated feedback for learning ${learningId}: rating=${rating}`);
}

export interface LearningContext {
  taskTitle: string;
  taskType?: string | null;
  outputSummary: string;
  userRating?: number | null;
  userFeedback?: string | null;
  isPrivate: boolean;
}

/**
 * 檢索相關歷史學習記錄，用於注入到新任務的 system prompt
 *
 * 隱私規則：
 * - 月租/團隊型任務：只返回同品牌的私有學習 + 所有公共學習
 * - 任務型任務：只返回公共學習（isPrivate=false）
 *
 * @param agentId AI 員工 ID
 * @param brandId 當前品牌 ID（月租型任務時傳入）
 * @param subscriptionPlan 訂閱類型（決定能看到哪些學習記錄）
 * @param limit 最多返回幾筆（預設 5）
 */
export async function getRelevantLearnings(
  agentId: number,
  brandId: number | null | undefined,
  subscriptionPlan: "per_task" | "monthly" | "team",
  limit = 5
): Promise<LearningContext[]> {
  try {
    const isSubscribed = subscriptionPlan === "monthly" || subscriptionPlan === "team";

    let rows;

    if (isSubscribed && brandId) {
      // 月租/團隊型：可看到同品牌私有學習 + 所有公共學習
      const database = await getDb();
      if (!database) return [];
      rows = await database
        .select({
          taskTitle: agentLearnings.taskTitle,
          taskType: agentLearnings.taskType,
          outputSummary: agentLearnings.outputSummary,
          userRating: agentLearnings.userRating,
          userFeedback: agentLearnings.userFeedback,
          isPrivate: agentLearnings.isPrivate,
        })
        .from(agentLearnings)
        .where(
          and(
            eq(agentLearnings.agentId, agentId),
            or(
              // 同品牌的私有學習
              and(
                eq(agentLearnings.isPrivate, true),
                eq(agentLearnings.brandId, brandId)
              ),
              // 所有公共學習
              eq(agentLearnings.isPrivate, false)
            )
          )
        )
        .orderBy(desc(agentLearnings.createdAt))
        .limit(limit);
    } else {
      // 任務型：只能看到公共學習（isPrivate=false）
      const database2 = await getDb();
      if (!database2) return [];
      rows = await database2
        .select({
          taskTitle: agentLearnings.taskTitle,
          taskType: agentLearnings.taskType,
          outputSummary: agentLearnings.outputSummary,
          userRating: agentLearnings.userRating,
          userFeedback: agentLearnings.userFeedback,
          isPrivate: agentLearnings.isPrivate,
        })
        .from(agentLearnings)
        .where(
          and(
            eq(agentLearnings.agentId, agentId),
            eq(agentLearnings.isPrivate, false)
          )
        )
        .orderBy(desc(agentLearnings.createdAt))
        .limit(limit);
    }

    return rows as LearningContext[];
  } catch (err) {
    console.error("[Learning] Failed to fetch relevant learnings:", err);
    return [];
  }
}

/**
 * 將學習記錄格式化為 system prompt 注入文字
 */
export function formatLearningsForPrompt(learnings: LearningContext[]): string {
  if (learnings.length === 0) return "";

  const lines: string[] = [
    "【過去執行經驗（請參考以下歷史任務的成功模式，避免重複錯誤）】",
  ];

  for (const l of learnings) {
    const ratingNote = l.userRating
      ? `（用戶評分：${l.userRating}/5${l.userFeedback ? `，反饋：「${l.userFeedback}」` : ""}）`
      : "";
    lines.push(
      `- 任務「${l.taskTitle}」${ratingNote}：${l.outputSummary}`
    );
  }

  lines.push("請在本次任務中延續高評分任務的風格與深度，並改善低評分任務的缺失。");

  return "\n\n" + lines.join("\n");
}
