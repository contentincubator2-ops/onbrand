/**
 * A2A Orchestrator Tests
 *
 * Covers:
 * - Dependency resolution (topological sort / BFS layering)
 * - Parallel node identification (same-layer nodes)
 * - Error tolerance (single-node failure doesn't block independent nodes)
 * - Mock executeTask integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { A2AWorkflowDef } from "./a2aOrchestrator";
import { executeTask } from "../executeTask";
import { executeA2AWorkflow } from "./a2aOrchestrator";

// ── Mock executeTask & getDb ──────────────────────────────────────────────────

vi.mock("../executeTask", () => ({
  executeTask: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([{ insertId: Math.floor(Math.random() * 1000) + 1 }])),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LINEAR_WORKFLOW: A2AWorkflowDef = {
  workflowId: "test-linear",
  name: "Linear Test",
  description: "A → B → C",
  nodes: [
    { nodeId: "A", agentId: 1, taskTitle: "Step A", taskDescription: "desc A" },
    { nodeId: "B", agentId: 1, taskTitle: "Step B", taskDescription: "desc B", dependsOn: ["A"], inputFrom: "A" },
    { nodeId: "C", agentId: 1, taskTitle: "Step C", taskDescription: "desc C", dependsOn: ["B"], inputFrom: "B" },
  ],
};

const PARALLEL_WORKFLOW: A2AWorkflowDef = {
  workflowId: "test-parallel",
  name: "Parallel Test",
  description: "A → (B || C) → D",
  nodes: [
    { nodeId: "A", agentId: 1, taskTitle: "Root", taskDescription: "root" },
    { nodeId: "B", agentId: 1, taskTitle: "Branch B", taskDescription: "b", dependsOn: ["A"], inputFrom: "A" },
    { nodeId: "C", agentId: 1, taskTitle: "Branch C", taskDescription: "c", dependsOn: ["A"], inputFrom: "A" },
    { nodeId: "D", agentId: 1, taskTitle: "Merge D", taskDescription: "d", dependsOn: ["B", "C"], inputFrom: "B" },
  ],
};

const PARTIAL_FAIL_WORKFLOW: A2AWorkflowDef = {
  workflowId: "test-partial-fail",
  name: "Partial Fail Test",
  description: "A (ok) || B (fail), then C depends on A only",
  nodes: [
    { nodeId: "A", agentId: 1, taskTitle: "Always OK", taskDescription: "ok" },
    { nodeId: "B", agentId: 1, taskTitle: "Will Fail", taskDescription: "fail" },
    { nodeId: "C", agentId: 1, taskTitle: "After A", taskDescription: "after a", dependsOn: ["A"], inputFrom: "A" },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("executeA2AWorkflow — linear dependency resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeTask.mockResolvedValue({ success: true, output: "mock output", executionId: 1 });
  });

  it("should execute all nodes in order and return completed status", async () => {
    const result = await executeA2AWorkflow(LINEAR_WORKFLOW, 1);
    expect(result.status).toBe("completed");
    expect(Object.keys(result.nodeResults)).toHaveLength(3);
    expect(result.nodeResults["A"]?.status).toBe("completed");
    expect(result.nodeResults["B"]?.status).toBe("completed");
    expect(result.nodeResults["C"]?.status).toBe("completed");
  });

  it("should call executeTask for each node", async () => {
    await executeA2AWorkflow(LINEAR_WORKFLOW, 1);
    // 3 nodes → 3 task creations → 3 executeTask calls
    expect(executeTask).toHaveBeenCalledTimes(3);
  });
});

describe("executeA2AWorkflow — parallel node identification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeTask.mockResolvedValue({ success: true, output: "mock output", executionId: 1 });
  });

  it("should run B and C concurrently (both depend only on A)", async () => {
    const callOrder: string[] = [];
    executeTask.mockImplementation(async (taskId: number) => {
      callOrder.push(String(taskId));
      return { success: true, output: `output-${taskId}`, executionId: taskId };
    });

    const result = await executeA2AWorkflow(PARALLEL_WORKFLOW, 1);
    expect(result.status).toBe("completed");
    expect(result.nodeResults["B"]?.status).toBe("completed");
    expect(result.nodeResults["C"]?.status).toBe("completed");
    expect(result.nodeResults["D"]?.status).toBe("completed");
  });
});

describe("executeA2AWorkflow — error tolerance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mark single-node failure correctly and still complete independent nodes", async () => {
    let callCount = 0;
    executeTask.mockImplementation(async () => {
      callCount++;
      // Node B (second root node) fails; A and C succeed
      if (callCount === 2) {
        return { success: false, error: "Simulated failure", executionId: callCount };
      }
      return { success: true, output: `output-${callCount}`, executionId: callCount };
    });

    const result = await executeA2AWorkflow(PARTIAL_FAIL_WORKFLOW, 1);

    // Overall should be "partial" (some completed, some failed)
    expect(result.status).toBe("partial");
    expect(result.nodeResults["A"]?.status).toBe("completed");
    expect(result.nodeResults["B"]?.status).toBe("failed");
    expect(result.nodeResults["C"]?.status).toBe("completed");
  });

  it("should mark overall status as 'failed' when all nodes fail", async () => {
    executeTask.mockResolvedValue({ success: false, error: "all fail", executionId: 0 });

    const result = await executeA2AWorkflow(LINEAR_WORKFLOW, 1);
    expect(result.status).toBe("failed");
  });
});

describe("executeA2AWorkflow — mock executeTask integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass userId and brandId through to task creation", async () => {
    executeTask.mockResolvedValue({ success: true, output: "ok", executionId: 99 });

    await executeA2AWorkflow(
      { ...LINEAR_WORKFLOW, nodes: [LINEAR_WORKFLOW.nodes[0]!] },
      42,
      7
    );

    // executeTask should be called with (taskId, userId=42, brandId=7)
    expect(executeTask).toHaveBeenCalledWith(expect.any(Number), 42, 7);
  });

  it("should include completedAt in result", async () => {
    executeTask.mockResolvedValue({ success: true, output: "ok", executionId: 1 });
    const before = new Date();
    const result = await executeA2AWorkflow(
      { ...LINEAR_WORKFLOW, nodes: [LINEAR_WORKFLOW.nodes[0]!] },
      1
    );
    const after = new Date();
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
