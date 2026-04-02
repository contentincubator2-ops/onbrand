import { describe, it, expect, vi } from "vitest";
import { TaskExecutionError, shouldRetry } from "./taskErrorHandler";

describe("TaskExecutionError", () => {
  it("creates error with correct properties", () => {
    const e = new TaskExecutionError("LLM failed", 42, "LLM_ERROR", true);
    expect(e.message).toBe("LLM failed");
    expect(e.taskId).toBe(42);
    expect(e.code).toBe("LLM_ERROR");
    expect(e.retryable).toBe(true);
    expect(e.name).toBe("TaskExecutionError");
  });
  it("defaults to non-retryable", () => {
    const e = new TaskExecutionError("err", 1);
    expect(e.retryable).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("retries rate limit errors", () => {
    expect(shouldRetry(new Error("rate limit exceeded"))).toBe(true);
  });
  it("retries timeout errors", () => {
    expect(shouldRetry(new Error("request timeout"))).toBe(true);
  });
  it("does not retry generic errors", () => {
    expect(shouldRetry(new Error("invalid input"))).toBe(false);
  });
  it("retries retryable TaskExecutionError", () => {
    expect(shouldRetry(new TaskExecutionError("x", 1, "TIMEOUT", true))).toBe(true);
  });
  it("does not retry non-retryable TaskExecutionError", () => {
    expect(shouldRetry(new TaskExecutionError("x", 1, "VALIDATION", false))).toBe(false);
  });
});
