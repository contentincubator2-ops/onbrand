/**
 * intakeRouter — Conversational pre-launch intake for squads.
 *
 * POST /api/intake/chat
 *
 * Body:
 *   {
 *     squadId:    number,
 *     messages:   Array<{ role: "user"|"assistant", content: string }>,
 *     brandCtx:   string,   // serialised brand context (name, desc, audience, etc.)
 *     squadCtx:   string,   // serialised squad context (steps, workspace, methodology)
 *   }
 *
 * SSE events (newline-delimited JSON, prefixed "data: "):
 *   { type: "delta",         text: string }   — streaming token for agent reply
 *   { type: "auth_required", platform: string } — inject OAuth card into chat
 *   { type: "preview_delta", text: string }   — preview chunk for center panel
 *   { type: "ready" }                          — intake complete, safe to launch
 *   { type: "done" }                           — stream finished
 *   { type: "error",         message: string } — fatal error
 */

import { Router } from "express";
import localPool from "../localDb.js";
import { invokeLLMStream } from "../_core/llm.js";
import { buildLeadIntakeGuide } from "../_core/agentPromptBuilder.js";

export const intakeRouter = Router();

// ── Platforms that need OAuth — matched against squad workspace ─────────────

const OAUTH_PLATFORMS = new Set(["facebook", "instagram", "linkedin", "youtube", "tiktok", "line"]);

// ── System prompt for pre-launch intake ─────────────────────────────────────

function buildIntakeSystemPrompt(squadCtx: string, brandCtx: string): string {
  const guide = buildLeadIntakeGuide();
  return [
    "你是這個小組的主要 AI 專家，負責在任務派出前收集必要資訊。",
    "語言：繁體中文（硬性規定）。",
    "",
    "【小組資訊】",
    squadCtx,
    "",
    "【品牌資訊】",
    brandCtx || "（尚未提供品牌資訊）",
    "",
    guide,
    "",
    "【特殊標記格式 — 僅供系統使用，禁止在面向用戶的文字中出現】",
    "若需要用戶授權特定平台，在回覆的最後一行輸出：",
    "  {{AUTH_REQUIRED:<platform>}}",
    "  其中 <platform> 可以是 facebook / instagram / linkedin / youtube / tiktok / line",
    "  範例：{{AUTH_REQUIRED:facebook}}",
    "  條件：只有當小組的工作空間對應到該平台，且對話中尚未授權時，才輸出此標記。",
    "",
    "若所有問題已完成且可以開始執行，在回覆的最後一行輸出：",
    "  {{INTAKE_READY}}",
  ].join("\n");
}

// ── Detect intent markers in streamed text ──────────────────────────────────

function extractMarkers(text: string): {
  clean: string;
  authPlatform: string | null;
  ready: boolean;
} {
  let clean = text;
  let authPlatform: string | null = null;
  let ready = false;

  const authMatch = text.match(/\{\{AUTH_REQUIRED:(\w+)\}\}/);
  if (authMatch) {
    authPlatform = authMatch[1] ?? null;
    clean = clean.replace(/\{\{AUTH_REQUIRED:\w+\}\}/g, "").trim();
  }

  if (text.includes("{{INTAKE_READY}}")) {
    ready = true;
    clean = clean.replace(/\{\{INTAKE_READY\}\}/g, "").trim();
  }

  return { clean, authPlatform, ready };
}

// ── Generate preview text (non-streaming, background) ──────────────────────
// Calls LLM for a 1-sentence preview of what the squad will produce,
// based on the latest user answer. Sent as preview_delta events.

async function generatePreview(
  squadCtx: string,
  latestAnswer: string,
): Promise<string> {
  try {
    const stream = invokeLLMStream({
      messages: [
        {
          role: "system",
          content: [
            "根據以下小組資訊和用戶的最新回覆，用 1-2 句話（繁體中文）預告這個小組將產出什麼具體成果。",
            "只描述成果本身，不問問題，不重複問題，不超過 60 字。",
            "",
            "【小組】",
            squadCtx.slice(0, 800),
          ].join("\n"),
        },
        {
          role: "user",
          content: `用戶最新回覆：${latestAnswer.slice(0, 300)}`,
        },
      ],
      maxTokens: 120,
    });

    let result = "";
    for await (const chunk of stream) result += chunk;
    return result.trim();
  } catch {
    return "";
  }
}

// ── Main SSE route ──────────────────────────────────────────────────────────

intakeRouter.post("/chat", async (req, res) => {
  const { squadId, messages = [], brandCtx = "", squadCtx = "" } = req.body ?? {};

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (obj: object) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    (res as any).flush?.();
  };

  try {
    // Detect workspace from squadCtx for auto auth-required detection
    const workspaceMatch = squadCtx.match(/workspace[：:]\s*(\w+)/i);
    const detectedWorkspace = workspaceMatch?.[1]?.toLowerCase() ?? "";
    const needsPlatformAuth =
      OAUTH_PLATFORMS.has(detectedWorkspace) &&
      !messages.some((m: any) => m.role === "user" && m.content?.includes("授權"));

    const systemPrompt = buildIntakeSystemPrompt(squadCtx, brandCtx);

    // Build message history for LLM
    const llmMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...(messages as Array<{ role: string; content: string }>)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Stream agent response
    let fullText = "";
    const stream = invokeLLMStream({ messages: llmMessages, maxTokens: 400 });

    for await (const chunk of stream) {
      fullText += chunk;
      // Strip markers from streamed text before sending to client
      const displayChunk = chunk
        .replace(/\{\{AUTH_REQUIRED:\w+\}\}/g, "")
        .replace(/\{\{INTAKE_READY\}\}/g, "");
      if (displayChunk) send({ type: "delta", text: displayChunk });
    }

    // Extract markers from full response
    const { authPlatform, ready } = extractMarkers(fullText);

    // Emit special events
    if (authPlatform && OAUTH_PLATFORMS.has(authPlatform)) {
      send({ type: "auth_required", platform: authPlatform });
    } else if (needsPlatformAuth && messages.length <= 1) {
      // First turn + platform squad → inject auth card proactively
      send({ type: "auth_required", platform: detectedWorkspace });
    }

    // Generate preview in background after user's first answer
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg && messages.length >= 2) {
      const preview = await generatePreview(squadCtx, lastUserMsg.content ?? "");
      if (preview) send({ type: "preview_delta", text: preview });
    }

    if (ready) send({ type: "ready" });

    send({ type: "done" });
    res.end();
  } catch (e: any) {
    send({ type: "error", message: e?.message ?? "intake failed" });
    res.end();
  }
});

// ── GET /api/intake/squad-ctx/:squadId — build squad context string ─────────

intakeRouter.get("/squad-ctx/:squadId", async (req, res) => {
  const squadId = Number(req.params.squadId);
  if (!squadId) return res.status(400).json({ error: "invalid squadId" });

  try {
    const [rows]: any = await localPool.execute(
      `SELECT name, name_zh, description, description_zh, strategy_layer,
              workspace, methodology, steps, tags, use_cases
         FROM squads WHERE id = ? LIMIT 1`,
      [squadId]
    );
    if (!rows.length) return res.status(404).json({ error: "squad not found" });

    const s = rows[0];
    const safeJson = (v: any, fallback: any = []) => {
      if (!v) return fallback;
      if (typeof v === "object") return v;
      try { return JSON.parse(v); } catch { return fallback; }
    };

    const steps = safeJson(s.steps, []);
    const workspace = safeJson(s.workspace, []);
    const tags = safeJson(s.tags, []);
    const useCases = safeJson(s.use_cases, []);
    const methodology = safeJson(s.methodology, null);

    const ctx = [
      `小組名稱：${s.name_zh ?? s.name ?? ""}`,
      `描述：${s.description_zh ?? s.description ?? ""}`,
      `策略層：${s.strategy_layer ?? ""}`,
      `工作區：${Array.isArray(workspace) ? workspace.join("、") : workspace}`,
      methodology?.author ? `方法論：${methodology.author}（${methodology.year ?? ""}）` : null,
      tags.length ? `標籤：${tags.join("、")}` : null,
      useCases.length ? `適用情境：${useCases.join("、")}` : null,
      steps.length
        ? `執行步驟（共 ${steps.length} 步）：\n${steps
            .slice(0, 6)
            .map((st: any, i: number) => `  Step ${i + 1}：${st.name ?? ""} → ${st.outputType ?? st.output_type ?? ""}`)
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return res.json({ ctx });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});
