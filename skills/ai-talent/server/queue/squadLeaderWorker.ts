import { Worker, Job, Queue } from 'bullmq';
import { logEvent, newSessionId } from "../_core/sessionLogger";

// ── OpenClaw Gateway helper ───────────────────────────────────────────────────
const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";

async function callGateway(
  agentSlug: string,
  messages: { role: string; content: string }[],
  stream = false,
  ctx?: { sessionId?: string; userId?: number | null }
): Promise<string> {
  const t0  = Date.now();
  const sid = ctx?.sessionId ?? newSessionId();
  try {
    const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${GATEWAY_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ model: agentSlug, messages, stream }),
      signal:  AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug, eventType: "gateway_error",
        isGatewayOk: false, latencyMs: Date.now() - t0, errorMsg: `${resp.status}: ${errText.slice(0, 200)}` });
      throw new Error(`Gateway ${resp.status}: ${errText}`);
    }
    const data    = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content ?? "";
    logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug, eventType: "gateway_call",
      isGatewayOk: true, latencyMs: Date.now() - t0, contentLength: content.length });
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.startsWith("Gateway ")) {
      logEvent({ sessionId: sid, userId: ctx?.userId, agentSlug, eventType: "gateway_error",
        isGatewayOk: false, latencyMs: Date.now() - t0, errorMsg: msg });
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

import { connection, squadQueue as _squadQueue } from './marketingQueue';
import localPool from '../localDb';

export interface SquadJobData {
  jobId:       string;
  squadId:     number;
  userRequest: string;
  brand?:      string;
  industry?:   string;
  userId?:     number;
}

/** One step's execution result */
export interface StepOutput {
  stepOrder:         number;
  stepName:          string;
  assignedAgentName: string | null;
  assignedAgentSlug: string | null;
  output:            string;
}

export interface SquadJobResult {
  squadName:       string;
  missionType:     string;
  leader:          string;
  leaderTitle:     string;
  stepOutputs:     StepOutput[];
  integratedOutput:string;
  executionTimeMs: number;
}

// squadQueue is now defined in marketingQueue.ts (unified provider that
// routes to BullMQ on the VM or the DB-backed queue on Vercel). Re-export
// here only for backwards compatibility — new code should import directly
// from './marketingQueue'.
export const squadQueue = _squadQueue;

// ── Gateway slug resolver ─────────────────────────────────────────────────────
// OpenClaw gateway requires "openclaw/<slug>" format.
function gatewaySlug(slug?: string | null): string {
  if (!slug) return "openclaw/pm";
  return slug.startsWith("openclaw/") ? slug : `openclaw/${slug}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step-driven Squad Execution
//
// Flow:
//   1. Load squad definition (from squads.agents JSON — NOT squad_members join table)
//   2. Load workflow steps (from squads.steps — migrated from squad_template)
//   3. Squad Lead does a brief context analysis
//   4. Execute each step SEQUENTIALLY:
//        - Use step.assignedAgentSlug if available (pre-assigned at seed time)
//        - Fall back to squad lead if no agent assigned to this step
//        - Pass accumulated context (previous step outputs) to each step
//   5. Squad Lead integrates all step outputs into final deliverable
// ─────────────────────────────────────────────────────────────────────────────

export function startSquadLeaderWorker() {
  const worker = new Worker<SquadJobData, SquadJobResult>(
    'squad-jobs',
    async (job: Job<SquadJobData>) => {
      const startTime = Date.now();
      const { squadId, userRequest, brand, industry, userId } = job.data;
      const ctx = { sessionId: newSessionId(), userId };
      console.log(`[Squad Worker] ▶ squad=${squadId} request="${userRequest.slice(0, 60)}"`);

      await job.updateProgress(5);

      // ── 1. Load squad from squads.agents JSON + squads.steps ────────────────
      const [squadRows] = await localPool.query(
        `SELECT id, slug, name, description, missionType, agents, steps
         FROM squads WHERE id = ? AND is_active = 1 LIMIT 1`,
        [squadId]
      ) as any[];
      const squad = (squadRows as any[])[0];
      if (!squad) throw new Error(`Squad ${squadId} not found`);

      // Parse agents JSON: [{agent_id, is_lead, role, order, ...}]
      let agentDefs: any[] = [];
      try { agentDefs = JSON.parse(squad.agents ?? "[]"); } catch {}

      // Find lead definition
      const leadDef = agentDefs.find((a: any) => a.is_lead) ?? agentDefs[0] ?? null;

      // ── 2. Resolve Squad Lead's full profile ──────────────────────────────────
      let leader = { name: "Squad Leader", title: "專案負責人", slug: null as string | null };
      if (leadDef?.agent_id) {
        try {
          const [lRows] = await localPool.query(
            `SELECT name, title, slug FROM agents WHERE id = ? LIMIT 1`, [leadDef.agent_id]
          ) as any[];
          const lRow = (lRows as any[])[0];
          if (lRow) leader = { name: lRow.name, title: lRow.title, slug: lRow.slug };
        } catch (e) {
          console.warn(`[Squad Worker] lead lookup error:`, e);
        }
      }

      const leaderGatewaySlug = gatewaySlug(leader.slug);
      const brandCtx = [brand && `品牌：${brand}`, industry && `產業：${industry}`].filter(Boolean).join("，");

      await job.updateProgress(15);
      console.log(`[Squad Worker] Squad: ${squad.name} | Lead: ${leader.name} | missionType: ${squad.missionType}`);

      // ── 3. Load workflow steps (now embedded directly in squads.steps) ──────
      let steps: any[] = [];
      try {
        // Prefer inline squads.steps (Phase A.2 migrated data lives here)
        if (squad.steps) {
          const parsed = JSON.parse(squad.steps);
          steps = Array.isArray(parsed)
            ? parsed.sort((a: any, b: any) => (a.order ?? a.step ?? 0) - (b.order ?? b.step ?? 0))
            : [];
        }

        // Fallback: legacy squad_template lookup by missionType (transitional)
        if (!steps.length && squad.missionType) {
          const [wfRows] = await localPool.query(
            `SELECT steps FROM squad_template WHERE taskType = ? AND isActive = 1 LIMIT 1`,
            [squad.missionType]
          ) as any[];
          const wf = (wfRows as any[])[0];
          if (wf?.steps) {
            const parsed = JSON.parse(wf.steps);
            steps = Array.isArray(parsed)
              ? parsed.sort((a: any, b: any) => (a.order ?? a.step ?? 0) - (b.order ?? b.step ?? 0))
              : [];
          }
        }
      } catch (e) {
        console.warn(`[Squad Worker] workflow steps load error:`, e);
      }

      // ── 4. Lead context brief ─────────────────────────────────────────────────
      const briefSystem = `你是「${squad.name}」的 Squad Lead：${leader.name}（${leader.title}）。\n${brandCtx ? brandCtx + "\n" : ""}任務：${userRequest}\n\n用 2-3 句話說明你將如何帶領這個任務，以及整體策略方向。`;
      let leaderBrief = "";
      try {
        leaderBrief = await callGateway(leaderGatewaySlug,
          [{ role: "system", content: briefSystem },
           { role: "user",   content: "請簡要說明任務策略方向。" }], false, ctx);
      } catch (e) {
        console.warn(`[Squad Worker] lead brief error:`, e);
        leaderBrief = `${squad.name} 任務啟動。`;
      }
      await job.updateProgress(25);

      // ── 5. Execute steps SEQUENTIALLY ────────────────────────────────────────
      // Context accumulates across steps so each agent sees prior outputs.
      const stepOutputs: StepOutput[] = [];
      let   accumulatedContext = `任務：${userRequest}\n${brandCtx}\n\nSquad Lead 策略方向：${leaderBrief}\n`;

      const progressPerStep = steps.length > 0 ? Math.floor(50 / steps.length) : 10;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepNum  = step.order ?? step.step ?? (i + 1);
        const stepName = step.name ?? step.title ?? `Step ${stepNum}`;
        const stepDesc = step.description ?? "";
        const outputType = step.outputType ?? "";

        // Determine which agent runs this step
        const assignedSlug = step.assignedAgentSlug as string | null ?? null;
        const assignedName = step.assignedAgentName as string | null ?? null;
        const executorSlug = assignedSlug ? gatewaySlug(assignedSlug) : leaderGatewaySlug;
        const executorName = assignedName ?? leader.name;

        console.log(`[Squad Worker] Step ${stepNum}/${steps.length}: "${stepName}" → agent: ${executorName}`);

        const stepSystem = [
          `你是執行步驟「${stepName}」的專家：${executorName}。`,
          brandCtx,
          `\n── 任務背景 ──\n${accumulatedContext}`,
          `\n── 本步驟要求 ──\n${stepDesc}`,
          outputType ? `\n請輸出：${outputType}` : "",
          `\n直接輸出本步驟的完整成果，不需解釋你在做什麼。`,
        ].filter(Boolean).join("\n");

        let stepOutput = "";
        try {
          stepOutput = await callGateway(
            executorSlug,
            [{ role: "system", content: stepSystem },
             { role: "user",   content: `請執行「${stepName}」並輸出完整成果。` }],
            false, ctx
          );
        } catch (e: any) {
          console.error(`[Squad Worker] Step ${stepNum} error:`, e.message);
          stepOutput = `（步驟 ${stepNum} ${stepName} 執行失敗：${e.message}）`;
        }

        stepOutputs.push({
          stepOrder:         stepNum,
          stepName,
          assignedAgentName: assignedName,
          assignedAgentSlug: assignedSlug,
          output:            stepOutput,
        });

        // Append condensed step result to context for next step
        accumulatedContext += `\n\n── 步驟 ${stepNum}（${stepName}）結果 ──\n${stepOutput.slice(0, 600)}${stepOutput.length > 600 ? "…" : ""}`;

        await job.updateProgress(25 + (i + 1) * progressPerStep);
      }

      // ── 6. Squad Lead final integration ──────────────────────────────────────
      await job.updateProgress(80);

      const integrationSystem = [
        `你是「${squad.name}」的 Squad Lead：${leader.name}（${leader.title}）。`,
        brandCtx,
        `原始任務：${userRequest}`,
        ``,
        `你的團隊已完成以下 ${stepOutputs.length} 個步驟：`,
        stepOutputs.map(s =>
          `【步驟 ${s.stepOrder}：${s.stepName}】（執行人：${s.assignedAgentName ?? "Squad Lead"}）\n${s.output}`
        ).join("\n\n---\n\n"),
        ``,
        `請以 Squad Lead 身份，整合所有步驟產出，形成一份完整、連貫、可直接交付給客戶的最終報告。`,
        `確保內容邏輯一致，去除重複，突出關鍵洞察與行動建議。`,
      ].join("\n");

      let integratedOutput = "";
      try {
        integratedOutput = await callGateway(
          leaderGatewaySlug,
          [{ role: "system", content: integrationSystem },
           { role: "user",   content: "請整合所有步驟產出，輸出完整的客戶交付報告。" }],
          false, ctx
        );
      } catch (e: any) {
        console.error(`[Squad Worker] Integration error:`, e.message);
        // Fallback: concatenate step outputs
        integratedOutput = stepOutputs.map(s => `## ${s.stepName}\n${s.output}`).join("\n\n");
      }

      await job.updateProgress(100);

      return {
        squadName:        squad.name,
        missionType:      squad.missionType ?? "",
        leader:           leader.name,
        leaderTitle:      leader.title,
        stepOutputs,
        integratedOutput,
        executionTimeMs:  Date.now() - startTime,
      };
    },
    // `connection` comes from marketingQueue and is typed loosely
    // (unknown) because on Vercel it throws on access. On the VM path
    // (the only place where startSquadLeaderWorker actually runs) it
    // resolves to the BullMQ-compatible ioredis instance.
    { connection: connection as never, concurrency: 3 }
  );

  worker.on("completed", (job) => {
    console.log(`[Squad Worker] ✅ job ${job.id} completed in ${job.returnvalue?.executionTimeMs}ms`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[Squad Worker] ❌ job ${job?.id} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error(`[Squad Worker] worker error:`, err.message);
  });

  console.log("[Squad Worker] Step-driven Squad Leader Worker started (concurrency: 3)");
  return worker;
}
