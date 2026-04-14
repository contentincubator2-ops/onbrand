/**
 * chatRoute.ts — 統一對話入口
 * POST /api/chat
 *
 * 流程：
 * 1. 用戶訊息 → embedding → 向量搜尋 top 3 squad/agent
 * 2. 把 top 3 注入 PM context
 * 3. Gateway 呼叫 openclaw/pm，PM 決定執行哪個 squad
 * 4. PM 呼叫 squad leader，squad leader 呼叫各 member
 * 5. 每個步驟發出 relay_step SSE event → 前端 TypedThreadCard
 *
 * SSE events:
 *   relay_step → { id, label, agentName, agentTitle, layer, status, summary? }
 *   delta      → { text }
 *   done       → { sessionId, isComplete }
 *   error      → { message }
 *
 * POST /api/chat/save — 儲存對話摘要
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import localPool from "../localDb";
import { logEvent, newSessionId } from "../_core/sessionLogger";
import { getDb } from "../db";
import { runSquadLeadQA, formatQAAsMessage, SQUAD_LEAD } from "../squadLeadQA";

export const chatRouter = Router();

const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";

// ── Auth ──────────────────────────────────────────────────────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(auth.slice(7), secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

// ── Embedding via Azure OpenAI ────────────────────────────────────────────────
async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
    const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
    const deployment = process.env.AZURE_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small";
    const resp = await fetch(
      `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-01`,
      {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ input: text.slice(0, 2000) }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return data?.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += (a[i] ?? 0) * (b[i] ?? 0); na += (a[i] ?? 0) ** 2; nb += (b[i] ?? 0) ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ── Semantic search: find top N agents/squads ─────────────────────────────────
async function semanticSearch(queryEmbedding: number[], topN = 3): Promise<{
  squads: { slug: string; name: string; description: string; similarity: number }[];
  agents: { slug: string; name: string; title: string; specialty: string; similarity: number }[];
}> {
  // Search squads by matching agents in each squad
  const [squadRows] = await localPool.execute(
    `SELECT s.slug, s.name, s.description,
            a.slug as agent_slug, a.name as agent_name, a.title, a.specialty,
            ae.embedding
     FROM agent_squads s
     JOIN squad_members sm ON sm.squad_id = s.id
     JOIN agents a ON a.id = sm.agent_id
     JOIN agent_embeddings ae ON ae.agent_id = a.id
     WHERE s.is_active = 1 AND ae.embedding IS NOT NULL
     LIMIT 2000`
  ) as any[];

  const squadScores: Map<string, { name: string; description: string; score: number }> = new Map();
  const agentScores: { slug: string; name: string; title: string; specialty: string; score: number }[] = [];

  for (const row of squadRows as any[]) {
    let emb: number[];
    try { emb = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding; }
    catch { continue; }
    const sim = cosineSimilarity(queryEmbedding, emb);

    // Squad score = max similarity among its members
    const existing = squadScores.get(row.slug);
    if (!existing || sim > existing.score) {
      squadScores.set(row.slug, { name: row.name, description: row.description ?? "", score: sim });
    }

    agentScores.push({ slug: row.agent_slug, name: row.agent_name, title: row.title, specialty: row.specialty ?? "", score: sim });
  }

  const squads = [...squadScores.entries()]
    .map(([slug, v]) => ({ slug, name: v.name, description: v.description, similarity: v.score }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);

  const agents = agentScores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(a => ({ ...a, similarity: a.score }));

  return { squads, agents };
}

// ── Build PM context with top matches ─────────────────────────────────────────
function buildPmContext(
  userMessage: string,
  squads: { slug: string; name: string; description: string; similarity: number }[],
  agents: { slug: string; name: string; title: string; specialty: string; similarity: number }[],
  brandCtx: Record<string, string>,
  missionCtx?: { title?: string; workspace?: string; currentStep?: number; isFirstMessage?: boolean }
): string {
  const brandStr = Object.entries(brandCtx).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const squadList = squads.map((s, i) =>
    `${i + 1}. [Squad] ${s.name} (${s.slug}) — 相關度 ${(s.similarity * 100).toFixed(0)}%\n   ${s.description?.slice(0, 80) ?? ""}`
  ).join("\n");
  const agentList = agents.map((a, i) =>
    `${i + 1}. [Agent] ${a.name}｜${a.title} (${a.slug}) — 相關度 ${(a.similarity * 100).toFixed(0)}%\n   ${a.specialty?.slice(0, 60) ?? ""}`
  ).join("\n");

  const wsLabel: Record<string, string> = {
    strategy: "品牌策略定位",
    website: "官網 SEO 優化",
    facebook: "Facebook 社群行銷",
  };
  const wsDesc = missionCtx?.workspace ? (wsLabel[missionCtx.workspace] ?? missionCtx.workspace) : "一般任務";
  const missionTitle = missionCtx?.title ?? "未命名任務";
  const stepInfo = missionCtx?.currentStep ? `（目前進度：第 ${missionCtx.currentStep} 步）` : "";
  const isFirst = missionCtx?.isFirstMessage ?? false;

  const missionSection = isFirst
    ? `【當前任務背景】
工作區：${wsDesc}
任務名稱：${missionTitle}${stepInfo}
品牌資料：
${brandStr || "未提供"}

⚡ 這是用戶進入此任務的第一條訊息。
請以繁體中文：
1. 簡要 recap 你掌握的工作區、任務、品牌資訊（2-3 句）
2. 詢問用戶這次想達成的具體目標
3. 不要預設流程，等用戶說明後再拆解任務`
    : `【當前任務背景】
工作區：${wsDesc}
任務名稱：${missionTitle}${stepInfo}
品牌資料：
${brandStr || "未提供"}`;

  return `${missionSection}

【用戶訊息】
${userMessage}

【向量搜尋：最相關 Squad】
${squadList || "無"}

【向量搜尋：最相關 Agent】
${agentList || "無"}

【PM 行動指引】
你是 SoWork 行銷 AI PM，精通品牌策略、內容行銷、數位廣告。
以繁體中文回覆。根據用戶的具體需求，自行拆解任務步驟，選擇最合適的 Squad Lead 或 Agent 執行。
每個執行步驟以 relay_step SSE event 標記。直接分析並行動，不要問無謂的確認問題。`;
}

// ── Gateway streaming proxy ───────────────────────────────────────────────────
async function* streamFromGateway(
  agentId: string,
  messages: { role: string; content: string }[]
): AsyncGenerator<{ event: string; data: unknown }> {
  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GATEWAY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: agentId, messages, stream: true }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok || !resp.body) throw new Error(`Gateway ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let stepCounter = 0;
  let currentAgentName = "";
  let fullContent = "";

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
        const text = d?.choices?.[0]?.delta?.content ?? "";
        if (!text) continue;
        fullContent += text;
        yield { event: "delta", data: { text } };

        // Detect agent handoff markers in stream (PM outputs structured markers)
        // Format: [RELAY:agentSlug:agentName:agentTitle:layer]
        const relayMatch = fullContent.match(/\[RELAY:([^:]+):([^:]+):([^:]+):([^\]]+)\]/);
        if (relayMatch) {
          stepCounter++;
          currentAgentName = relayMatch[2] ?? "";
          yield {
            event: "relay_step",
            data: {
              id: stepCounter,
              label: `Step ${stepCounter}: ${relayMatch[3]}`,
              agentName: relayMatch[2] ?? "",
              agentTitle: relayMatch[3] ?? "",
              layer: relayMatch[4] ?? "execution",
              status: "running",
            }
          };
          fullContent = fullContent.replace(relayMatch[0], "");
        }
      } catch { /* skip */ }
    }
  }

  // Final relay step done
  if (stepCounter > 0) {
    yield { event: "relay_step", data: { id: stepCounter, status: "done", summary: fullContent.slice(0, 400) } };
  }
}

// ── Main chat endpoint ────────────────────────────────────────────────────────
chatRouter.post("/", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { userMessage, conversationHistory = [], brandContext = {}, sessionId: clientSessionId, missionId, workspace } = req.body as {
    userMessage: string;
    conversationHistory: { role: string; content: string }[];
    brandContext: Record<string, string>;
    sessionId?: string;
    missionId?: number;
    workspace?: string;
  };

  if (!userMessage) { res.status(400).json({ error: "userMessage required" }); return; }

  const sessionId: string = clientSessionId ?? newSessionId();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); (res as any).flush?.(); }
    catch { /* disconnected */ }
  };
  const keepalive = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); } }, 15_000);

  logEvent({ sessionId, userId, eventType: "session_start" });

  try {
    // 0. 偵測是否為首次訊息（任何工作區），傳給 PM context
    let isFirstMessage = false;
    let missionTitle = "";
    let missionBrandId: number | null = null;
    if (missionId) {
      try {
        const db = await getDb();
        const [msgRows] = await (db as any).execute(
          `SELECT id FROM mission_messages WHERE missionId = ${missionId} AND role='user' LIMIT 1`
        ) as any;
        isFirstMessage = !msgRows?.[0];

        // 取得 mission 標題和品牌
        const [missionRows] = await (db as any).execute(
          `SELECT m.title, m.brandId FROM missions m WHERE m.id = ${missionId} LIMIT 1`
        ) as any;
        missionTitle = missionRows?.[0]?.title ?? "";
        missionBrandId = missionRows?.[0]?.brandId ?? null;

        // 若是首次訊息，在 mission_messages 記錄用戶訊息前先建立 positioning session
        if (isFirstMessage && missionBrandId) {
          await (db as any).execute(
            `INSERT IGNORE INTO positioning_sessions (missionId, brandId, userId, currentStep, status, stepResults)
             VALUES (${missionId}, ${missionBrandId}, ${userId}, 1, 'in_progress', '{}')`
          ).catch(() => {});
        }
      } catch { /* non-fatal */ }
    }

    // 1. Semantic search
    // 1. Semantic search
    send("status", { message: "分析任務中..." });
    const queryEmb = await getEmbedding(userMessage);
    let squads: any[] = [];
    let agents: any[] = [];
    if (queryEmb) {
      const results = await semanticSearch(queryEmb, 3);
      squads = results.squads;
      agents = results.agents;
    }

    // 2. Build PM context
    // 取得 positioning session 的 currentStep（若有）
    let currentStep = 0;
    if (missionId) {
      try {
        const db = await getDb();
        const [sessRows] = await (db as any).execute(
          `SELECT currentStep FROM positioning_sessions WHERE missionId = ${missionId} AND userId = ${userId} LIMIT 1`
        ) as any;
        currentStep = sessRows?.[0]?.currentStep ?? 0;
      } catch { /* non-fatal */ }
    }
    const pmContext = buildPmContext(userMessage, squads, agents, brandContext, {
      title: missionTitle,
      workspace: workspace ?? undefined,
      currentStep: currentStep || undefined,
      isFirstMessage,
    });
    const messages = [
      { role: "system", content: pmContext },
      ...conversationHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    // 3. Send initial relay step for PM
    send("relay_step", { id: 0, label: "PM 分析任務", agentName: "PM Agent", agentTitle: "任務指揮官", layer: "strategy", status: "running" });

    // 4. Stream from Gateway (openclaw/pm)
    const t0 = Date.now();
    let fullOutput = "";
    for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
      send(event, data);
      if (event === "delta") fullOutput += (data as any).text ?? "";
    }

    // Mark PM step done
    send("relay_step", { id: 0, status: "done", summary: fullOutput.slice(0, 400) });
    logEvent({ sessionId, userId, agentSlug: "openclaw/pm", eventType: "gateway_call", isGatewayOk: true, latencyMs: Date.now() - t0, contentLength: fullOutput.length });

    // 5. Squad Lead QA（所有任務，只要有實質輸出就觸發）
    if (fullOutput.length > 100) {
      try {
        const db = await getDb();
        let brandName = (brandContext as any).brandName ?? '';
        let industry = (brandContext as any).industry ?? '';
        let description = (brandContext as any).description ?? '';
        let targetMarket = (brandContext as any).targetMarket ?? '';
        let currentStep = 0;
        let previousContext = '';
        let taskTitle = '';

        // 若是 strategy workspace，取得定位步驟資訊
        if (missionId && workspace === 'strategy' && db) {
          const [sessionRows] = await (db as any).execute(
            `SELECT ps.currentStep, ps.stepResults,
                    b.name as bn, b.industry as bi, b.description as bd, b.targetMarket as bt
             FROM positioning_sessions ps
             LEFT JOIN brands b ON b.id = ps.brandId
             WHERE ps.missionId = ${missionId} AND ps.userId = ${userId} LIMIT 1`
          ) as any;
          const sess = sessionRows?.[0];
          if (sess) {
            currentStep = sess.currentStep ?? 0;
            brandName = brandName || sess.bn || '';
            industry = industry || sess.bi || '';
            description = description || sess.bd || '';
            targetMarket = targetMarket || sess.bt || '';
            const stepResults = typeof sess.stepResults === 'string'
              ? JSON.parse(sess.stepResults || '{}') : (sess.stepResults ?? {});
            const prevKeys = Object.keys(stepResults).map(Number)
              .filter(k => k < currentStep).slice(-2);
            if (prevKeys.length > 0) {
              previousContext = prevKeys.map(k =>
                `步驟${k}：${JSON.stringify(stepResults[k]).slice(0, 200)}`
              ).join('\n');
            }
          }
        }

        // 若有 missionId，取得任務標題作為任務描述
        if (missionId && db) {
          try {
            const [mRows] = await (db as any).execute(
              `SELECT m.title, b.name as bn, b.industry as bi, b.description as bd, b.targetMarket as bt
               FROM missions m LEFT JOIN brands b ON b.id = m.brandId
               WHERE m.id = ${missionId} LIMIT 1`
            ) as any;
            const m = mRows?.[0];
            if (m) {
              taskTitle = m.title ?? '';
              brandName = brandName || m.bn || '';
              industry = industry || m.bi || '';
              description = description || m.bd || '';
              targetMarket = targetMarket || m.bt || '';
            }
          } catch { /* non-fatal */ }
        }

        // 通知前端：Squad Lead QA 開始
        send('relay_step', {
          id: 99,
          label: 'Squad Lead QA 審核',
          agentName: SQUAD_LEAD.name,
          agentTitle: SQUAD_LEAD.title,
          layer: 'qa',
          status: 'running',
        });

        const qaResult = await runSquadLeadQA({
          agentName: 'AI 顧問',
          taskTitle: taskTitle || userMessage.slice(0, 40),
          agentOutput: fullOutput,
          brandName: brandName || undefined,
          industry: industry || undefined,
          description: description || undefined,
          targetMarket: targetMarket || undefined,
          userRequest: userMessage,
          previousContext: previousContext || undefined,
          stepNumber: currentStep >= 1 && currentStep <= 10 ? currentStep : undefined,
        });

        // QA 結束
        send('relay_step', {
          id: 99,
          status: 'done',
          summary: `QA ${qaResult.status === 'pass' ? '通過' : '注意'} ${qaResult.overallScore}分`,
        });

        // 把 QA 結論推給用戶
        const qaMessage = formatQAAsMessage(qaResult);
        send('delta', { text: '\n\n---\n' + qaMessage });

        // 更新定位步驟狀態（若是 strategy）
        if (missionId && workspace === 'strategy' && db && currentStep >= 1) {
          try {
            await (db as any).execute(
              `UPDATE positioning_sessions SET status='waiting_confirm', updatedAt=NOW() WHERE missionId=${missionId} AND userId=${userId}`
            );
          } catch { /* non-fatal */ }
        }
      } catch (qaErr: any) {
        console.error('[SquadLeadQA] error:', qaErr?.message);
      }
    }

    // 6. Done
    send("done", { sessionId, isComplete: true });

  } catch (err: any) {
    logEvent({ sessionId, userId, eventType: "gateway_error", isGatewayOk: false, errorMsg: err?.message });
    send("error", { message: err?.message ?? "Unknown error" });
  } finally {
    clearInterval(keepalive);
    logEvent({ sessionId, userId, eventType: "session_end" });
    res.end();
  }
});

// ── Save conversation ─────────────────────────────────────────────────────────
chatRouter.post("/save", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { sessionId, summary, fullHistory, missionId } = req.body as {
    sessionId: string;
    summary: string;
    fullHistory: { role: string; content: string }[];
    missionId?: number;
  };

  try {
    await localPool.execute(
      `INSERT INTO session_event_logs (sessionId, userId, eventType, isGatewayOk, contentLength, metadata)
       VALUES (?, ?, 'output', 1, ?, ?)`,
      [sessionId, userId, summary?.length ?? 0, JSON.stringify({ summary: summary?.slice(0, 500), missionId, turns: fullHistory?.length })]
    );
    res.json({ ok: true, sessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
