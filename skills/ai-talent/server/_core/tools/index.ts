/**
 * tools/index.ts — central Tool registry for Squad Lead agents.
 *
 * Design:
 *   - Each tool is a self-contained module exporting a `ToolDefinition`.
 *   - Registry is populated at import time (static, no dynamic loading).
 *   - `getToolsForStep(names[])` returns both the JSON schemas (for the LLM)
 *     and the executor functions (for tool_call resolution).
 *   - Executor returns a STRING (markdown / plaintext) — LLM-friendly.
 *   - Errors inside an executor are caught and returned as strings starting
 *     with "[tool_error]" so the LLM can reason about failures.
 *
 * Mary Allen's Step 2 (archetype selection) declares:
 *   requiredTools: ["web_search", "site_crawl"]
 * missionChatRouter resolves these via `getToolsForStep` before the LLM call.
 */

import type { Tool as LlmTool } from "../llm";

// ── Types ───────────────────────────────────────────────────────────────────
export interface ToolContext {
  /** mission id — for citation persistence */
  missionId?: string | number;
  /** session id — passed to citation_bundler to scope accumulated sources */
  sessionId?: string;
  /** brand row — some tools use brand domain/name for defaults */
  brand?: { name?: string; website?: string; id?: number | string } | null;
  /** who's calling — for audit log */
  callerAgentId?: number;
  callerAgentName?: string;
}

export interface ToolDefinition {
  /** canonical name, matches LLM function name */
  name: string;
  /** one-sentence description shown to the LLM */
  description: string;
  /** JSON-Schema-style parameters object */
  parameters: Record<string, unknown>;
  /** executor — args are already JSON.parse'd */
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

/**
 * Given a list of tool names (from squad step.requiredTools), return the LLM-
 * facing Tool[] schema + a map of executors. Unknown names are silently
 * skipped but logged — the LLM simply won't see them.
 */
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

/** Execute a single tool call with timing + error capture. */
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
      id: callId,
      name,
      argsRaw,
      args: {},
      resultText: `[tool_error] failed to parse args: ${err.message}`,
      ok: false,
      durationMs: Date.now() - t0,
    };
  }

  const def = registry.get(name);
  if (!def) {
    return {
      id: callId,
      name,
      argsRaw,
      args,
      resultText: `[tool_error] unknown tool: ${name}`,
      ok: false,
      durationMs: Date.now() - t0,
    };
  }

  try {
    const resultText = await def.execute(args, ctx);
    return {
      id: callId,
      name,
      argsRaw,
      args,
      resultText,
      ok: !resultText.startsWith("[tool_error]"),
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      id: callId,
      name,
      argsRaw,
      args,
      resultText: `[tool_error] ${err?.message ?? String(err)}`,
      ok: false,
      durationMs: Date.now() - t0,
    };
  }
}

// ── Auto-register bundled tools ────────────────────────────────────────────
// Each tool module calls `registerTool(...)` at import time.
// Ordering matters only for `listToolNames` sort — runtime is map lookup.
import "./webFetch";
import "./webSearch";
import "./siteCrawl";
import "./youtubeFetch";
import "./citationBundler";
import "./themeApply";
import "./boardroomPdf";
