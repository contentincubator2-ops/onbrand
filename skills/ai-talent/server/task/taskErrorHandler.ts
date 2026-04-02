/**
 * taskErrorHandler.ts — Structured error handling for task execution.
 * Classifies errors, determines retry eligibility, and handles cleanup.
 */
import { updateTaskStatus } from "./taskStateManager";

/** Custom error with task context */
export class TaskExecutionError extends Error {
  constructor(
    message: string,
    public readonly taskId: number,
    public readonly code: "LLM_ERROR" | "DB_ERROR" | "TIMEOUT" | "VALIDATION" | "UNKNOWN" = "UNKNOWN",
    public readonly retryable = false
  ) {
    super(message);
    this.name = "TaskExecutionError";
  }
}

/** Determine if an error is retryable (rate limits, timeouts) */
export function shouldRetry(error: unknown): boolean {
  if (error instanceof TaskExecutionError) return error.retryable;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("rate limit") || msg.includes("timeout") || msg.includes("503");
  }
  return false;
}

/** Handle task error: log, update DB status to failed */
export async function handleTaskError(error: unknown, taskId: number): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[task:${taskId}] failed:`, message);
  try {
    await updateTaskStatus(taskId, "cancelled", message);
  } catch (dbErr) {
    console.error(`[task:${taskId}] failed to update status:`, dbErr);
  }
}
