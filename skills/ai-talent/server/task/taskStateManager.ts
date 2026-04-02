/**
 * taskStateManager.ts — Database state operations for tasks.
 * insert / update / fetch task records via Drizzle ORM.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tasks, taskExecutions } from "../../drizzle/schema";

/** Insert a new task record and return the generated ID */
export async function insertTaskRecord(
  task: { userId: number; title: string; description?: string | null; agentId?: number | null },
  agentId?: number
): Promise<number> {
  const db = await getDb();
  const result = await (db.insert(tasks) as any).values({
    userId: task.userId,
    title: task.title,
    description: task.description ?? null,
    agentId: agentId ?? task.agentId ?? null,
    status: "pending",
  });
  return (result as any)[0]?.insertId ?? 0;
}

/** Update task status (and optionally output) */
export async function updateTaskStatus(
  taskId: number,
  status: "pending" | "in_progress" | "review" | "completed" | "cancelled",
  output?: string
): Promise<void> {
  const db = await getDb();
  await db.update(tasks)
    .set({ status, ...(output ? { output } : {}), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

/** Fetch a single task record by ID */
export async function fetchTaskRecord(taskId: number) {
  const db = await getDb();
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return rows[0] ?? null;
}
