/**
 * A2A (Agent-to-Agent) Workflow Orchestrator
 *
 * Executes multi-node workflows where tasks can depend on each other,
 * forming serial and parallel execution chains.
 */

import { executeTask } from "../executeTask";
import { getDb } from "../db";
import { tasks } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface A2AWorkflowNode {
  nodeId: string;
  agentId: number;
  taskTitle: string;
  taskDescription: string;
  dependsOn?: string[];  // nodeIds that must complete first
  inputFrom?: string;    // take output from this node as additional context
}

export interface A2AWorkflowDef {
  workflowId: string;
  name: string;
  description: string;
  nodes: A2AWorkflowNode[];
}

export interface A2AExecutionResult {
  workflowId: string;
  status: "completed" | "partial" | "failed";
  nodeResults: Record<string, {
    taskId?: number;
    status: string;
    output?: string;
    error?: string;
  }>;
  completedAt: Date;
}

export type A2AEventType =
  | { type: "workflow_start"; workflowId: string; name: string; totalNodes: number }
  | { type: "node_start"; nodeId: string; nodeName: string; step: number; total: number }
  | { type: "node_done"; nodeId: string; nodeName: string; step: number; total: number; taskId?: number }
  | { type: "node_error"; nodeId: string; nodeName: string; error: string }
  | { type: "workflow_done"; status: string };

export type A2AEventCallback = (event: A2AEventType) => void;

// ── Topology helpers ──────────────────────────────────────────────────────────

/**
 * Build an execution plan as layers (BFS topological sort).
 * Nodes in the same layer have no dependencies on each other and can run in parallel.
 */
function buildExecutionLayers(nodes: A2AWorkflowNode[]): A2AWorkflowNode[][] {
  const nodeMap = new Map<string, A2AWorkflowNode>(nodes.map((n) => [n.nodeId, n]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // nodeId → list of nodes that depend on it

  for (const node of nodes) {
    inDegree.set(node.nodeId, node.dependsOn?.length ?? 0);
    dependents.set(node.nodeId, []);
  }
  for (const node of nodes) {
    for (const dep of node.dependsOn ?? []) {
      dependents.get(dep)?.push(node.nodeId);
    }
  }

  const layers: A2AWorkflowNode[][] = [];
  let ready = nodes.filter((n) => (inDegree.get(n.nodeId) ?? 0) === 0);

  while (ready.length > 0) {
    layers.push(ready);
    const nextReady: A2AWorkflowNode[] = [];
    for (const node of ready) {
      for (const dependentId of dependents.get(node.nodeId) ?? []) {
        const newDegree = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          const dep = nodeMap.get(dependentId);
          if (dep != null) nextReady.push(dep);
        }
      }
    }
    ready = nextReady;
  }

  return layers;
}

// ── Task creation helper ──────────────────────────────────────────────────────

async function createTaskForNode(
  node: A2AWorkflowNode,
  userId: number,
  brandId: number | undefined,
  priorOutput: string | undefined
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const description = priorOutput
    ? `${node.taskDescription}\n\n【上游任務產出】\n${priorOutput.slice(0, 1500)}`
    : node.taskDescription;

  const insertResult = await (db.insert(tasks) as any).values({
    userId,
    brandId: brandId ?? null,
    agentId: node.agentId || null,
    title: node.taskTitle,
    description,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const taskId: number =
    (insertResult as any)[0]?.insertId ??
    (insertResult as any).insertId ??
    0;

  return taskId || null;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Execute an A2A workflow.
 * Resolves node dependencies and executes in correct order.
 * Parallel-capable: nodes with the same depth level run concurrently.
 * Optional onEvent callback fires SSE events to the frontend in real time.
 */
export async function executeA2AWorkflow(
  workflow: A2AWorkflowDef,
  userId: number,
  brandId?: number,
  onEvent?: A2AEventCallback
): Promise<A2AExecutionResult> {
  const nodeResults: A2AExecutionResult["nodeResults"] = {};

  // Initialise all nodes as pending
  for (const node of workflow.nodes) {
    nodeResults[node.nodeId] = { status: "pending" };
  }

  const layers = buildExecutionLayers(workflow.nodes);
  const totalNodes = workflow.nodes.length;
  let stepCounter = 0;

  onEvent?.({ type: "workflow_start", workflowId: workflow.workflowId, name: workflow.name, totalNodes });

  for (const layer of layers) {
    // Execute all nodes in this layer concurrently
    await Promise.all(
      layer.map(async (node) => {
        const step = ++stepCounter;
        onEvent?.({ type: "node_start", nodeId: node.nodeId, nodeName: node.taskTitle, step, total: totalNodes });
        try {
          // Collect upstream output if inputFrom is specified
          let priorOutput: string | undefined;
          if (node.inputFrom) {
            priorOutput = nodeResults[node.inputFrom]?.output;
          }

          // Create a real task row so executeTask can load it
          const taskId = await createTaskForNode(node, userId, brandId, priorOutput);

          if (!taskId) {
            nodeResults[node.nodeId] = {
              status: "failed",
              error: "Failed to create task record",
            };
            onEvent?.({ type: "node_error", nodeId: node.nodeId, nodeName: node.taskTitle, error: "Failed to create task record" });
            return;
          }

          nodeResults[node.nodeId] = { taskId, status: "running" };

          const result = await executeTask(taskId, userId, brandId);

          if (result.success) {
            nodeResults[node.nodeId] = {
              taskId,
              status: "completed",
              output: result.output,
            };
            onEvent?.({ type: "node_done", nodeId: node.nodeId, nodeName: node.taskTitle, step, total: totalNodes, taskId });
          } else {
            nodeResults[node.nodeId] = {
              taskId,
              status: "failed",
              error: result.error,
            };
            onEvent?.({ type: "node_error", nodeId: node.nodeId, nodeName: node.taskTitle, error: result.error ?? "unknown" });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          nodeResults[node.nodeId] = {
            status: "failed",
            error: errMsg,
          };
          onEvent?.({ type: "node_error", nodeId: node.nodeId, nodeName: node.taskTitle, error: errMsg });
        }
      })
    );

    // If ALL nodes in this layer failed and there are more layers, we still continue
    // (nodes without cross-layer dependencies can still proceed)
  }

  // Determine overall status
  const statuses = Object.values(nodeResults).map((r) => r.status);
  const allCompleted = statuses.every((s) => s === "completed");
  const allFailed = statuses.every((s) => s === "failed");

  const overallStatus = allCompleted ? "completed" : allFailed ? "failed" : "partial";
  onEvent?.({ type: "workflow_done", status: overallStatus });

  return {
    workflowId: workflow.workflowId,
    status: overallStatus,
    nodeResults,
    completedAt: new Date(),
  };
}
