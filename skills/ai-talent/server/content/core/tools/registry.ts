/**
 * tools/registry.ts — low-level tool registry, no side-effect imports.
 *
 * Split out of index.ts to avoid ESM TDZ: tool modules call `registerTool`
 * at import time, so the registry must be fully initialized BEFORE any
 * tool module runs. Putting the Map in its own file with zero further
 * imports guarantees that.
 */

import type { Tool as LlmTool } from "../../../platform/core/llm";

// ── Types ───────────────────────────────────────────────────────────────────
export interface ToolContext {
  missionId?: string | number;
  sessionId?: string;
  brand?: { name?: string; website?: string; id?: number | string } | null;
  callerAgentId?: number;
  callerAgentName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string>;
}

export interface ToolInvocation {
  id: string;
  name: string;
  argsRaw: string;
  args: Record<string, any>;
  resultText: string;
  ok: boolean;
  durationMs: number;
}

// ── Registry ───────────────────────────────────────────────────────────────
const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (registry.has(tool.name)) {
    console.warn(`[tools] duplicate registration: ${tool.name} (overwriting)`);
  }
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listToolNames(): string[] {
  return Array.from(registry.keys()).sort();
}

export function getToolsForStep(
  names: string[] | undefined,
): { llmTools: LlmTool[]; executors: Map<string, ToolDefinition["execute"]> } {
  const llmTools: LlmTool[] = [];
  const executors = new Map<string, ToolDefinition["execute"]>();
  if (!names || names.length === 0) return { llmTools, executors };

  for (const name of names) {
    const def = registry.get(name);
    if (!def) {
      console.warn(`[tools] step requested unknown tool "${name}" — skipping`);
      continue;
    }
    llmTools.push({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    });
    executors.set(def.name, def.execute);
  }
  return { llmTools, executors };
}

export async function invokeToolCall(
  name: string,
  argsRaw: string,
  ctx: ToolContext,
  callId = "",
): Promise<ToolInvocation> {
  const t0 = Date.now();
  let args: Record<string, any> = {};
  try {
    args = argsRaw ? JSON.parse(argsRaw) : {};
  } catch (err: any) {
    return {
      id: callId, name, argsRaw, args: {},
      resultText: `[tool_error] failed to parse args: ${err.message}`,
      ok: false, durationMs: Date.now() - t0,
    };
  }

  const def = registry.get(name);
  if (!def) {
    return {
      id: callId, name, argsRaw, args,
      resultText: `[tool_error] unknown tool: ${name}`,
      ok: false, durationMs: Date.now() - t0,
    };
  }

  try {
    const resultText = await def.execute(args, ctx);
    return {
      id: callId, name, argsRaw, args,
      resultText,
      ok: !resultText.startsWith("[tool_error]"),
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      id: callId, name, argsRaw, args,
      resultText: `[tool_error] ${err?.message ?? String(err)}`,
      ok: false, durationMs: Date.now() - t0,
    };
  }
}
