/**
 * Worker endpoint — processes a single queued_jobs row.
 *
 * Called two ways:
 *   1. Fast-path: marketingQueue.add() fires a POST here via waitUntil.
 *   2. Safety-net: /api/cron/drain-queue fires POSTs for any rows still
 *      `waiting` after 30s.
 *
 * Atomic claim via `UPDATE ... WHERE status='waiting'` prevents both
 * paths from racing and processing the same job twice.
 *
 * Auth: Bearer CRON_SECRET in the Authorization header.
 *
 * ── Pipeline (ports server/queue/orchestratorWorker.ts to Vercel) ──
 *   1. matchAgents() — DB lookup against the 21k+ rows in `agents`
 *      to pick the best specialist for this task. Best-effort:
 *      failures fall back to a generic AI marketing agent.
 *   2. Skill-md loading is skipped on Vercel — SKILLS_PATH lives on
 *      the VM filesystem, not in /var/task.
 *   3. inferTaskType + getModelForTask — pure helpers, kept as-is.
 *   4. Research step is skipped on Vercel — the VM version uses
 *      streamGateway against localhost:18790 (OpenClaw with
 *      web_search tool), neither of which is reachable from a Vercel
 *      function. The richer system prompt below compensates by
 *      pushing the model to be specific without external lookups.
 *   5. Main LLM turn via invokeLLM (provider chain: azure-foundry →
 *      auto-fallback to openrouter). Same JSON-output contract as
 *      the orchestrator: thinking + publishable_content + metadata.
 *   6. Parse JSON output with the same fallback (raw string into
 *      publishable_content) if the model didn't return strict JSON.
 *
 * Each stage updates queued_jobs.progress/status so the row mirrors
 * what BullMQ's job.updateProgress() does on the VM.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "drizzle-orm";
import { getDb } from "../../server/db";
import { updateJob } from "../../server/queue/marketingQueue";
import { invokeLLM } from "../../server/_core/llm";
import { matchAgents } from "../../server/agentMatcher";
import { inferTaskType, getModelForTask } from "../../server/_core/modelRouter";

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

interface ExecuteTaskPayload {
  jobId: string;
  userRequest: string;
  brand?: string;
  industry?: string;
  taskType?: string;
  userId?: number;
  sessionId?: string;
}

interface ProcessorResult {
  agent: { name: string; title: string; specialty: string; taskType: string };
  model: string;
  provider: string;
  thinking: string;
  publishable_content: string;
  metadata?: Record<string, unknown>;
  usage: unknown;
  llmDurationMs: number;
  finishReason: string | null;
  notes: string[];
}

async function runProcessor(
  jobId: string,
  payload: ExecuteTaskPayload,
): Promise<ProcessorResult> {
  const { userRequest, brand, industry, taskType, userId } = payload;
  const notes: string[] = [];

  // ── Step 1: agent match ───────────────────────────────────────────
  await updateJob(jobId, { progress: 10 });
  let agent = {
    name: "AI 行銷專家",
    title: "Marketing Specialist",
    specialty: "行銷策略與內容創作",
    taskType: taskType ?? "social_content",
  };
  try {
    const matches = await matchAgents({
      userId: userId ?? 0,
      taskType: taskType || "general",
      taskDescription: userRequest,
      industry,
      limit: 1,
    });
    const m = matches[0];
    if (m) {
      agent = {
        name: m.name,
        title: m.title,
        specialty: m.specialty,
        taskType: (m as any).taskType ?? agent.taskType,
      };
    } else {
      notes.push("no agent match — using default specialist");
    }
  } catch (err) {
    notes.push(`matchAgents failed: ${(err as Error).message}`);
  }
  await updateJob(jobId, { progress: 25 });

  // ── Step 3: model routing (pure) ──────────────────────────────────
  const inferredType = inferTaskType(userRequest);
  const modelConfig = getModelForTask(inferredType);

  // ── Step 4: research step skipped on Vercel ───────────────────────
  notes.push("research stage skipped (no localhost gateway on Vercel)");
  await updateJob(jobId, { progress: 40 });

  // ── Step 5: main LLM turn ─────────────────────────────────────────
  const systemPrompt = [
    `你是 ${agent.name}，${agent.title}。`,
    `專長：${agent.specialty}`,
    "",
    brand ? `品牌：${brand}` : "",
    industry ? `產業：${industry}` : "",
    "",
    "【要求】",
    "- 產出有具體數據與深度分析的方案，避免空洞行銷語言",
    "- thinking 至少 300 字",
    "- publishable_content 用 Markdown 結構化",
    "",
    "輸出**必須是合法 JSON**，shape：",
    `{"thinking":"深度分析 300 字以上","publishable_content":"結構化 Markdown 方案","metadata":{"hashtags":[],"format":"方案類型"}}`,
  ]
    .filter(Boolean)
    .join("\n");

  const provider = process.env.LLM_PROVIDER || "azure-foundry";
  const model = process.env.LLM_MODEL || "Phi-4";

  await updateJob(jobId, { progress: 60 });

  const t0 = Date.now();
  const llm = await invokeLLM({
    provider: provider as any,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userRequest },
    ],
    maxTokens: 2500,
  });
  const llmMs = Date.now() - t0;

  await updateJob(jobId, { progress: 90 });

  // ── Step 6: parse JSON output (with fallback) ─────────────────────
  const raw = llm.choices?.[0]?.message?.content;
  const contentStr =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw
            .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
            .filter(Boolean)
            .join("\n")
        : "";

  let parsed: { thinking?: string; publishable_content?: string; metadata?: Record<string, unknown> } = {};
  try {
    // Tolerate ```json fences if the model wrapped its output.
    const stripped = contentStr.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(stripped);
  } catch {
    parsed = { publishable_content: contentStr, thinking: "" };
    notes.push("model output was not strict JSON — returned as plain content");
  }

  return {
    agent,
    model: llm.model ?? model,
    provider,
    thinking: parsed.thinking ?? "",
    publishable_content: parsed.publishable_content ?? "",
    metadata: parsed.metadata,
    usage: (llm as any).usage ?? null,
    llmDurationMs: llmMs,
    finishReason: llm.choices?.[0]?.finish_reason ?? null,
    notes,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(payload));
  };

  if (req.method !== "POST") return send(405, { error: "method_not_allowed" });

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return send(401, { error: "unauthorized" });
  }

  let jobId: string;
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return send(400, { error: "missing jobId" });
    }
  } catch {
    return send(400, { error: "bad_json" });
  }

  const db = await getDb();

  // Atomic claim — only the first caller wins.
  const [claim] = (await db.execute(sql`
    UPDATE queued_jobs
    SET status = 'active',
        started_at = IFNULL(started_at, NOW(3)),
        attempts = attempts + 1
    WHERE id = ${jobId} AND status = 'waiting'
  `)) as unknown as [{ affectedRows: number }, unknown];

  if (claim.affectedRows === 0) {
    return send(200, { ok: true, jobId, skipped: "not_waiting" });
  }

  try {
    const [rows] = (await db.execute(sql`
      SELECT id, queue, name, data FROM queued_jobs WHERE id = ${jobId} LIMIT 1
    `)) as unknown as [Array<{ id: string; queue: string; name: string; data: string }>, unknown];
    const row = rows[0];
    if (!row) throw new Error("job disappeared after claim");

    const payload: ExecuteTaskPayload = JSON.parse(row.data);
    const processed = await runProcessor(jobId, payload);

    const result = {
      ...processed,
      jobName: row.name,
      queue: row.queue,
      echo: {
        userRequest: payload.userRequest,
        brand: payload.brand,
        industry: payload.industry,
      },
      completedAt: new Date().toISOString(),
    };

    await updateJob(jobId, { status: "completed", progress: 100, result });
    return send(200, { ok: true, jobId, state: "completed", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "failed", failedReason: msg });
    console.error(`[worker] job ${jobId} failed:`, err);
    return send(500, { ok: false, jobId, error: msg });
  }
}
