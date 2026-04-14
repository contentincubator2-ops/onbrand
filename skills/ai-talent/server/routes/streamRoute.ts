/**
 * streamRoute — Server-Sent Events endpoint for streaming LLM responses
 * POST /api/stream/task
 *
 * Accepts: { title, description, brandId, conversationHistory }
 * Streams: SSE events with token deltas, then a final JSON result event
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import { invokeLLMStream } from "../_core/llm";
// ── OpenClaw Gateway helper ───────────────────────────────────────────────────
const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";

async function callGateway(
  agentId: string,
  messages: { role: string; content: string }[],
  stream = false
): Promise<string> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: agentId, messages, stream }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`Gateway ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

async function* streamGateway(
  agentId: string,
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: agentId, messages, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok || !resp.body) throw new Error(`Gateway ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const d = JSON.parse(raw);
        const t = d?.choices?.[0]?.delta?.content ?? "";
        if (t) yield t;
      } catch { /* skip */ }
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

import { getDb, getSoworkDb } from "../db";
import { brands, tasks, agents } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
// (task type detection is done inline below)

export const streamRouter = Router();

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

// ── Auth middleware ───────────────────────────────────────────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), getSecretBytes());
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch {
    return null;
  }
}

// ── Agent cache (shared with taskRouter) ─────────────────────────────────────
const _streamAgentCache = new Map<string, { agentId: number; name: string; title: string; bio: string; specialty: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function getAgentForTask(taskType: string, userId: number) {
  const cached = _streamAgentCache.get(taskType);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;
  try {
    const { matchAgents } = await import("../agentMatcher");
    const matches = await matchAgents({ userId, taskType, limit: 1 });
    if (matches.length > 0 && matches[0]) {
      const hit = {
        agentId: matches[0].id,
        name: matches[0].name,
        title: matches[0].title,
        bio: matches[0].bio ?? "",
        specialty: matches[0].specialty ?? "",
        ts: Date.now(),
      };
      _streamAgentCache.set(taskType, hit);
      return hit;
    }
  } catch (err) {
    console.error("[streamRoute] matchAgents failed:", err);
  }
  return null;
}

// ── A2A Workflow streaming endpoint ──────────────────────────────────────────
streamRouter.post("/a2a-workflow", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { workflowId, brandId } = req.body as { workflowId: string; brandId?: number };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // SSE keepalive — send a comment every 15s to prevent Traefik/proxy from closing the connection
  const keepaliveInterval = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  try {
    // Dynamic workflow map — no hardcoded templates; Squad DB drives workflows
    const { buildExecutionLayers } = await import("../a2a/a2aOrchestrator") as any;
    const { executeTask } = await import("../executeTask");
    const { getDb } = await import("../db");
    const { tasks: tasksTable } = await import("../../drizzle/schema");

    const templates: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workflow = templates[workflowId] as any;
    if (!workflow) { send("error", { message: `Unknown workflow: ${workflowId}` }); res.end(); return; }

    // Match agents per task type for each node
    const nodeTaskTypeMap: Record<string, string> = {
      "brand-positioning": "brand_positioning",
      "competitor-analysis": "competitor_analysis",
      "content-calendar": "social_content",
      "ad-copy": "ad_copy",
      "market-sizing": "market_research",
      "consumer-insight": "market_research",
      "market-report": "market_research",
    };

    send("workflow-start", { workflowId, name: workflow.name, nodeCount: workflow.nodes.length });

    const nodeResults: Record<string, { taskId?: number; status: string; output?: string; error?: string; agentName?: string; agentTitle?: string; publishable?: string }> = {};
    for (const node of workflow.nodes) {
      nodeResults[node.nodeId] = { status: "pending" };
    }

    // Build execution layers for dependency ordering
    const layers: typeof workflow.nodes[] = [];
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const node of workflow.nodes) {
      inDegree.set(node.nodeId, node.dependsOn?.length ?? 0);
      dependents.set(node.nodeId, []);
    }
    for (const node of workflow.nodes) {
      for (const dep of node.dependsOn ?? []) {
        dependents.get(dep)?.push(node.nodeId);
      }
    }
    let ready = workflow.nodes.filter((n: any) => (inDegree.get(n.nodeId) ?? 0) === 0);
    while (ready.length > 0) {
      layers.push(ready);
      const nextReady: typeof workflow.nodes = [];
      for (const node of ready) {
        for (const depId of dependents.get(node.nodeId) ?? []) {
          const newDeg = (inDegree.get(depId) ?? 0) - 1;
          inDegree.set(depId, newDeg);
          if (newDeg === 0) {
            const dep = workflow.nodes.find((n: any) => n.nodeId === depId);
            if (dep) nextReady.push(dep);
          }
        }
      }
      ready = nextReady;
    }

    for (const layer of layers) {
      await Promise.all(layer.map(async (node: any) => {
        // Match agent
        let agentHit: { agentId: number; name: string; title: string } | null = null;
        try {
          const { matchAgents } = await import("../agentMatcher");
          const matches = await matchAgents({ userId, taskType: nodeTaskTypeMap[node.nodeId] ?? "general", limit: 1 });
          if (matches.length > 0 && matches[0]) {
            agentHit = { agentId: matches[0].id, name: matches[0].name, title: matches[0].title };
          }
        } catch { /* ignore */ }

        send("node-start", {
          nodeId: node.nodeId,
          title: node.taskTitle,
          agentName: agentHit?.name ?? null,
          agentTitle: agentHit?.title ?? null,
          status: "running",
        });

        nodeResults[node.nodeId] = { status: "running", agentName: agentHit?.name, agentTitle: agentHit?.title };

        try {
          const db = await getDb();
          if (!db) throw new Error("DB not available");

          let priorOutput: string | undefined;
          if (node.inputFrom) priorOutput = nodeResults[node.inputFrom]?.output;

          const description = priorOutput
            ? `${node.taskDescription}\n\n【上游任務產出】\n${priorOutput.slice(0, 1500)}`
            : node.taskDescription;

          const insertResult = await (db.insert(tasksTable) as any).values({
            userId,
            brandId: brandId ?? null,
            agentId: agentHit?.agentId ?? null,
            title: node.taskTitle,
            description,
            taskType: nodeTaskTypeMap[node.nodeId] ?? "general",
            status: "pending",
            createdAt: new Date(),
          });
          const taskId: number = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? 0;

          const result = await executeTask(taskId, userId, brandId);

          let publishable = result.output ?? "";
          try {
            function stripFence2(s: string): string {
              const m = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
              return m ? (m[1] ?? s).trim() : s.trim();
            }
            function unwrap2(raw: string, d = 0): Record<string, unknown> | null {
              if (d > 4) return null;
              try {
                const p = JSON.parse(stripFence2(raw.trim())) as Record<string, unknown>;
                if (typeof p.publishable_content === "string") {
                  const pc = p.publishable_content.trim();
                  if (pc.startsWith("{") || pc.startsWith("```")) {
                    const inner = unwrap2(pc, d + 1);
                    if (inner?.publishable_content) { p.publishable_content = inner.publishable_content; }
                  }
                }
                return p;
              } catch { return null; }
            }
            const parsed = unwrap2(result.output ?? "");
            publishable = parsed ? ((parsed.publishable_content as string) ?? publishable) : publishable;
          } catch { /* use raw */ }

          nodeResults[node.nodeId] = {
            taskId, status: "completed",
            output: result.output,
            publishable: publishable.slice(0, 800),
            agentName: agentHit?.name,
            agentTitle: agentHit?.title,
          };

          send("node-done", {
            nodeId: node.nodeId,
            title: node.taskTitle,
            agentName: agentHit?.name,
            agentTitle: agentHit?.title,
            publishable: publishable.slice(0, 800),
            status: "completed",
            taskId,
          });
        } catch (err: any) {
          nodeResults[node.nodeId] = { status: "failed", error: err?.message };
          send("node-done", { nodeId: node.nodeId, title: node.taskTitle, status: "failed", error: err?.message });
        }
      }));
    }

    const allCompleted = Object.values(nodeResults).every(r => r.status === "completed");
    send("workflow-done", {
      status: allCompleted ? "completed" : "partial",
      totalNodes: workflow.nodes.length,
      completedNodes: Object.values(nodeResults).filter(r => r.status === "completed").length,
    });

  } catch (err: any) {
    send("error", { message: err?.message ?? "Unknown error" });
  } finally {
    clearInterval(keepaliveInterval);
    res.end();
  }
});

// ── Main streaming endpoint ───────────────────────────────────────────────────
streamRouter.post("/task", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { title, description, brandId, conversationHistory } = req.body as {
    title: string;
    description?: string;
    brandId?: number;
    conversationHistory?: Array<{ role: string; content: string }>;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const taskKeepalive = setInterval(() => { res.write(": keepalive\n\n"); }, 15000);

  try {
    // 1. Detect task type
    const text = `${title} ${description ?? ""}`.toLowerCase();
    let taskType = "general";
    if (/facebook|fb廣告|fb|貼文|post/.test(text)) taskType = "ad_copy";
    else if (/instagram|ig|reels/.test(text)) taskType = "social_content";
    else if (/新聞稿|pr|press release|公關/.test(text)) taskType = "press_release";
    else if (/競品|competitor|競爭|對手/.test(text)) taskType = "competitor_analysis";
    else if (/市場|market|研究|research/.test(text)) taskType = "market_research";
    else if (/品牌定位|定位|positioning|策略/.test(text)) taskType = "brand_positioning";
    else if (/廣告|ad|文案|copy/.test(text)) taskType = "ad_copy";
    else if (/社群|social|內容|content/.test(text)) taskType = "social_content";

    // 2. Match agent (cached)
    const agentHit = await getAgentForTask(taskType, userId);
    send("agent", {
      agentId: agentHit?.agentId ?? null,
      agentName: agentHit?.name ?? null,
      agentTitle: agentHit?.title ?? null,
      agentSpecialty: agentHit?.specialty ?? null,
      taskType,
    });

    // 3. Build brand context
    let brandContext = "";
    let brandContextObj: Record<string, unknown> | null = null;
    try {
      const db = await getDb();
      if (db) {
        const brandRows = await db
          .select({ name: brands.name, description: brands.description, tagline: brands.tagline, targetAudience: brands.targetAudience, brandVoice: brands.brandVoice, soworkAnalysis: brands.soworkAnalysis })
          .from(brands)
          .where(brandId
            ? and(eq(brands.userId, userId), eq(brands.id, brandId))
            : and(eq(brands.userId, userId), eq(brands.isDefault, true)))
          .limit(1);
        const brand = brandRows[0];
        if (brand) {
          brandContextObj = brand as Record<string, unknown>;
          const analysis = brand.soworkAnalysis as Record<string, unknown> | null;
          brandContext = `\n\n【品牌背景】\n品牌名稱：${brand.name}\n品牌描述：${brand.description ?? ""}\n目標受眾：${brand.targetAudience ?? ""}\n品牌定位：${(analysis?.positioning as string) ?? ""}`;
        }
      }
    } catch { /* optional */ }

    // 4. Build system + user prompt
    const agentPersona = agentHit
      ? `你是 ${agentHit.name}，${agentHit.title}。\n【核心專長】\n${agentHit.specialty}\n【背景】\n${agentHit.bio}`
      : `你是 SoWork Marketing Claw，SoWork 的行銷 AI 作戰指揮官。`;

    const systemPrompt = `${agentPersona}

【工作方式】
1. 先在 thinking 中展示深度分析過程（不少於300字）
2. 基於分析，在 publishable_content 輸出結構化的完整方案
3. 如果有研究資料，必須引用具體數字和事實
4. 輸出要有層次：背景分析 → 核心策略 → 具體步驟 → 預期成果

【絕對禁止規則】
- 禁止以問候語開場
- 禁止空泛的行銷語言，必須有具體數據、步驟、時程
- publishable_content 必須是結構化 Markdown（含標題、清單、表格）
- 不允許只有一段話就結束

【輸出格式】
輸出 JSON：{ "thinking": "深度策略思考過程", "publishable_content": "結構化完整方案（Markdown）", "content_type": "類型" }`;

    const historyMessages = (conversationHistory ?? []).slice(-6).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const userMessage = `【任務】${title}\n${description ? `【說明】${description}` : ""}${brandContext}

請以 JSON 格式輸出，包含 thinking 和 publishable_content。`;

    // 4.5 Research step: if task contains URL or research keywords, do web research first
    let researchContext = "";
    const taskText = `${title} ${description ?? ""}`;
    const urlMatch = taskText.match(/https?:\/\/[^\s]+/);
    const hasResearchIntent = /youtube|市場|competitor|競品|research|研究|分析|系統|strategy|策略|AI系統|自動/.test(taskText.toLowerCase());

    if ((urlMatch || hasResearchIntent) && taskText.length > 20) {
      send("thinking", { text: "🔍 正在研究中..." });
      try {
        const researchQuery = urlMatch
          ? `研究以下網站和市場機會：${urlMatch[0]}。任務背景：${taskText.slice(0, 200)}`
          : `深入研究：${taskText.slice(0, 300)}。請提供具體數據、市場分析和可行方案。`;

        const researchMessages = [
          {
            role: "system" as const,
            content: "你是深度研究助手。請搜尋並分析相關資訊，提供具體數據和洞察，不要空泛描述。"
          },
          {
            role: "user" as const,
            content: researchQuery
          }
        ];

        let researchResult = "";
        // Use perplexity sonar via openrouter for web search capability
        for await (const delta of invokeLLMStream({
          messages: researchMessages,
          provider: "openrouter",
          model: "perplexity/sonar-pro",
        })) {
          researchResult += delta;
        }

        if (researchResult.length > 100) {
          researchContext = `

【研究結果】
${researchResult.slice(0, 3000)}`;
          send("thinking", { text: `✅ 研究完成（${researchResult.length} 字）` });
        }
      } catch (err) {
        // Research failed silently, continue without it
        console.error("Research step failed:", err);
      }
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyMessages,
      { role: "user" as const, content: userMessage + researchContext },
    ];

    // 5. Stream tokens
    let fullContent = "";
    send("start", { message: "開始生成..." });

    const _mainAgentId = agentHit ? `openclaw/${(agentHit as any).slug ?? "pm"}` : "openclaw/pm";
    for await (const delta of streamGateway(_mainAgentId, messages as any)) {
      fullContent += delta;
      send("delta", { text: delta });
    }

    // 6. Parse final output — recursive JSON unwrapper
    let publishable = fullContent;
    let thinking = "";
    let contentType = taskType;
    try {
      function stripFence(s: string): string {
        const m = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
        return m ? (m[1] ?? s).trim() : s.trim();
      }
      function unwrap(raw: string, d = 0): Record<string, unknown> | null {
        if (d > 4) return null;
        try {
          const p = JSON.parse(stripFence(raw.trim())) as Record<string, unknown>;
          if (typeof p.publishable_content === "string") {
            const pc = p.publishable_content.trim();
            if (pc.startsWith("{") || pc.startsWith("```")) {
              const inner = unwrap(pc, d + 1);
              if (inner?.publishable_content) {
                p.publishable_content = inner.publishable_content;
                if (!p.thinking) p.thinking = inner.thinking ?? "";
              }
            }
          }
          return p;
        } catch { return null; }
      }
      const parsed = unwrap(fullContent);
      if (parsed) {
        publishable = (parsed.publishable_content as string) ?? fullContent;
        thinking = (parsed.thinking as string) ?? "";
        contentType = (parsed.content_type as string) ?? taskType;
      }
    } catch { /* use raw */ }

    // 7. Save to DB
    let taskId = 0;
    try {
      const db = await getDb();
      if (db) {
        const insertResult = await (db.insert(tasks) as any).values({
          userId,
          brandId: brandId ?? null,
          agentId: agentHit?.agentId ?? null,
          title,
          description: description ?? null,
          taskType,
          status: "completed",
          result: fullContent,
          createdAt: new Date(),
        });
        taskId = (insertResult as any)[0]?.insertId ?? 0;
      }
    } catch { /* optional */ }

    // 8. Send done event
    send("done", {
      taskId,
      publishable_content: publishable,
      thinking,
      content_type: contentType,
      agentName: agentHit?.name ?? null,
      agentTitle: agentHit?.title ?? null,
    });

  } catch (err: any) {
    send("error", { message: err?.message ?? "Unknown error" });
  } finally {
    clearInterval(taskKeepalive);
    res.end();
  }
});
