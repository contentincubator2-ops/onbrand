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
 * Processor body: a single LLM turn through the project's invokeLLM
 * provider chain (OpenRouter / Azure Foundry / etc., picked by
 * LLM_DEFAULT_PROVIDER). Not the full A2A orchestration that the VM-side
 * orchestratorWorker.ts does — no agent matching, no skill-md loading,
 * no learning persistence — but it proves the LLM path works through
 * the Vercel queue end-to-end. Richer agent routing iterates from here.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "drizzle-orm";
import { getDb } from "../../server/db";
import { updateJob } from "../../server/queue/marketingQueue";
import { invokeLLM } from "../../server/_core/llm";

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
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

  // Atomic claim — only the first caller wins. affectedRows lets us
  // detect that another invocation already picked this job up.
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

    const payload = JSON.parse(row.data);

    await updateJob(jobId, { progress: 20 });

    const systemPrompt = [
      "You are a marketing assistant for SoWork Marketing Enterprise.",
      payload.brand ? `Brand context: ${payload.brand}.` : "",
      payload.industry ? `Industry: ${payload.industry}.` : "",
      payload.taskType ? `Requested task type: ${payload.taskType}.` : "",
      "Respond with concise, actionable, on-brand marketing output.",
    ]
      .filter(Boolean)
      .join(" ");

    const t0 = Date.now();
    const llm = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.userRequest ?? "" },
      ],
      maxTokens: 1500,
    });
    const llmMs = Date.now() - t0;

    await updateJob(jobId, { progress: 80 });

    const content =
      typeof llm.content === "string"
        ? llm.content
        : Array.isArray(llm.content)
          ? llm.content
              .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
              .filter(Boolean)
              .join("\n")
          : String(llm.content ?? "");

    const result = {
      processed: true,
      jobName: row.name,
      queue: row.queue,
      provider: (llm as any).provider ?? null,
      model: (llm as any).model ?? null,
      content,
      usage: (llm as any).usage ?? null,
      llmDurationMs: llmMs,
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
