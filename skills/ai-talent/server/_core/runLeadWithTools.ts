/**
 * runLeadWithTools.ts — Lead-solo tool-call loop.
 *
 * Called by missionChatRouter for every step in Lead-solo architecture.
 * Non-streaming invokeLLM loop: model emits tool_calls → execute → append
 * role="tool" messages → re-invoke until model returns final text.
 *
 * Emits SSE events via `send`:
 *   tool_call   { name, argsRaw }
 *   tool_result { name, ok, preview, durationMs }
 *   delta       { text } — final content chunked for UI parity with streaming
 */

import { invokeLLM } from "./llm";
import { getToolsForStep, invokeToolCall, type ToolContext } from "./tools";

export async function runLeadWithTools(params: {
  systemPrompt: string;
  history: { role: string; content: string }[];
  userMessage: string;
  toolNames: string[];
  ctx: ToolContext;
  send: (event: string, data: unknown) => void;
  maxRounds?: number;
}): Promise<string> {
  const { systemPrompt, history, userMessage, toolNames, ctx, send } = params;
  const maxRounds = params.maxRounds ?? 6;

  const { llmTools } = getToolsForStep(toolNames);

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  let finalText = "";

  for (let round = 0; round < maxRounds; round++) {
    const result = await invokeLLM({
      messages,
      tools: llmTools.length > 0 ? llmTools : undefined,
      toolChoice: llmTools.length > 0 ? "auto" : undefined,
      provider: "openrouter",
      maxTokens: 4096,
    });

    const choice = result.choices?.[0];
    const msg = choice?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    if (toolCalls.length === 0) {
      const text = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p: any) => (p?.type === "text" ? p.text : "")).join("")
          : "";
      finalText = text;
      const CHUNK = 80;
      for (let i = 0; i < text.length; i += CHUNK) {
        send("delta", { text: text.slice(i, i + CHUNK) });
      }
      break;
    }

    const results = await Promise.all(toolCalls.map(async (tc: any) => {
      const name = tc.function?.name ?? "";
      const argsRaw = tc.function?.arguments ?? "";
      send("tool_call", { name, argsRaw: argsRaw.slice(0, 500) });
      const inv = await invokeToolCall(name, argsRaw, ctx, tc.id);
      send("tool_result", {
        name,
        ok: inv.ok,
        durationMs: inv.durationMs,
        preview: inv.resultText.slice(0, 400),
      });
      return { tc, inv };
    }));

    for (const { tc, inv } of results) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: inv.resultText,
      });
    }
  }

  if (!finalText) {
    const finalResult = await invokeLLM({
      messages: [
        ...messages,
        { role: "user", content: "請根據以上工具結果，輸出最終回覆給用戶（中文，無需再呼叫工具）。" },
      ],
      provider: "openrouter",
      maxTokens: 4096,
    });
    const text = (finalResult.choices?.[0]?.message?.content as string) ?? "";
    finalText = text;
    const CHUNK = 80;
    for (let i = 0; i < text.length; i += CHUNK) {
      send("delta", { text: text.slice(i, i + CHUNK) });
    }
  }

  return finalText;
}
