/**
 * missionChatRouter.ts — Mission Chat 統一入口（v4: squad-first routing）
 * POST /api/chat (mounted at missionChatRouter)
 *
 * Renamed from chatRoute.ts / missionChatRouter (2026-04-19) to align with mission-centric
 * architecture. All mission chat goes through this router regardless of workspace.
 *
 * Routing priority (unified across ALL workspaces):
 *   1. Squad present (missions.squadSlug)  → tryExecuteSquadChat() reads squads.steps
 *      → Squad Lead opens chat, step agents execute per squads.steps[].assignedAgentId
 *   2. No squad + workspace=strategy       → legacy executePositioningStep (6-step hardcoded)
 *   3. No squad + other workspace          → generic LLM chat
 *
 * 品牌定位 6 步驟流程（workspace=strategy）：
 * Step 1: PM recap + 問目標
 * Step 2: 競品分析（品牌策略師）
 * Step 3: 目標受眾（市場研究師）
 * Step 4: 品牌定位宣言（品牌策略師）
 * Step 5: 品牌聲音定義（文案師）
 * Step 6: 總結 + 輸出 PPT → 寄到 cjwang@sowork.tw
 *
 * SSE events:
 *   relay_step → { id, label, agentName, agentTitle, layer, status, summary? }
 *   delta      → { text }
 *   done       → { sessionId, isComplete }
 *   error      → { message }
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import localPool from "../localDb";
import { logEvent, newSessionId } from "../_core/sessionLogger";
import { invokeLLMStream } from "../_core/llm";
import { loadAgentContext } from "../agentContextLoader";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const PptxGenJS = _require("pptxgenjs");
import sgMail from "@sendgrid/mail";
import { writeBrandBrainEntry } from "./brandBrainRoute";
import { recordMissionExport } from "./exportsRoute";
import { getEmbedding, cosineSimilarity } from "../_core/embedding";
import { getOrCreateSquadSession, saveStepAndAdvance, resetSquadSession } from "../_core/squadSessionManager";
import { buildSquadAgentPrompt, buildSecondOpinionPrompt } from "../_core/agentPromptBuilder";

export const missionChatRouter = Router();

const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";
const SENDGRID_KEY = process.env.SENDGRID_API_KEY ?? "";
const PPT_EMAIL = "cjwang@sowork.tw";

// P0 fix: use localPool (mos_db) for all DB operations


function formatBrandCtx(brand: Record<string, string>): string {
  return [
    brand.name ? `品牌名稱：${brand.name}` : "",
    brand.industry ? `產業：${brand.industry}` : "",
    brand.description ? `品牌描述：${brand.description}` : "",
    brand.targetAudience ? `目標受眾：${brand.targetAudience}` : "",
    brand.website ? `官網：${brand.website}` : "",
  ].filter(Boolean).join("\n");
}

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

// ── Semantic search ───────────────────────────────────────────────────────────
async function semanticSearch(queryEmbedding: number[], topN = 3): Promise<{
  squads: { slug: string; name: string; description: string; similarity: number }[];
  agents: { slug: string; name: string; title: string; specialty: string; similarity: number }[];
}> {
  const [squadRows] = await localPool.execute(
    `SELECT s.slug, s.name, s.description,
            a.slug as agent_slug, a.name as agent_name, a.title, a.specialty,
            ae.embedding
     FROM squads s
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

// ── Build PM context for non-strategy workspaces ──────────────────────────────
function buildPmContext(
  userMessage: string,
  squads: any[],
  agents: any[],
  brandCtx: Record<string, string>,
  missionCtx?: { title?: string; workspace?: string; agentCtxPrefix?: string; agentDepthLabel?: string }
): string {
  const brandStr = Object.entries(brandCtx).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const squadList = squads.map((s, i) =>
    `${i + 1}. [Squad] ${s.name} (${s.slug}) — 相關度 ${(s.similarity * 100).toFixed(0)}%\n   ${s.description?.slice(0, 80) ?? ""}`
  ).join("\n");
  const agentList = agents.map((a, i) =>
    `${i + 1}. [Agent] ${a.name}｜${a.title} (${a.slug}) — 相關度 ${(a.similarity * 100).toFixed(0)}%\n   ${a.specialty?.slice(0, 60) ?? ""}`
  ).join("\n");

  const ctxSection = missionCtx?.agentCtxPrefix ? ("\n\n【任務 & 品牌記憶】\n" + missionCtx.agentCtxPrefix.slice(0, 1500)) : "";
  const depthNote = missionCtx?.agentDepthLabel ?? "";
  const wsLabel: Record<string, string> = {
    strategy: "品牌策略定位",
    website: "官網 SEO 優化",
    facebook: "Facebook 社群行銷",
  };
  const wsDesc = missionCtx?.workspace ? (wsLabel[missionCtx.workspace] ?? missionCtx.workspace) : "一般任務";
  const missionTitle = missionCtx?.title ?? "未命名任務";

  return `【當前任務背景】
工作區：${wsDesc}
任務名稱：${missionTitle}
品牌資料：
${brandStr || "未提供"}${ctxSection}

【用戶訊息】
${userMessage}

【向量搜尋：最相關 Squad】
${squadList || "無"}

【向量搜尋：最相關 Agent】
${agentList || "無"}

【PM 行動指引】
你是 SoWork 行銷 AI PM，精通品牌策略、內容行銷、數位廣告。
以繁體中文回覆。根據用戶的具體需求，自行拆解任務步驟，選擇最合適的 Squad Lead 或 Agent 執行。
品牌資料已提供，不要讓 Agent 重複詢問用戶已知資訊。
直接分析並行動，不要問無謂的確認問題。${depthNote ? ("\n" + depthNote) : ""}`;
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
        yield { event: "delta", data: { text } };
      } catch { /* skip */ }
    }
  }
}

// ── Stream via invokeLLMStream (fallback) ─────────────────────────────────────
async function* streamFromLLM(
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string
): AsyncGenerator<string> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(-10).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];
  for await (const delta of invokeLLMStream({ messages, maxTokens: 4096 })) {
    yield delta;
  }
}

// ── Generate and send PPT ─────────────────────────────────────────────────────
async function generateAndSendPPT(
  brandName: string,
  reportContent: string,
  stepResults: Record<string, string>
): Promise<void> {
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = `${brandName} 品牌定位報告`;

    // 封面
    const slide1 = pptx.addSlide();
    slide1.background = { color: "1A1A18" };
    slide1.addText(`${brandName}\n品牌定位完整報告`, {
      x: 1, y: 1.5, w: 8, h: 3,
      fontSize: 32, color: "F9F9F8", bold: true, align: "center",
    });
    slide1.addText(`由 SoWork Marketing OS 生成 · ${new Date().toLocaleDateString("zh-TW")}`, {
      x: 1, y: 4.5, w: 8, h: 0.5,
      fontSize: 12, color: "9B9990", align: "center",
    });

    // 步驟內容頁
    const stepTitles = ["任務確認", "競品分析", "目標受眾", "品牌定位宣言", "品牌聲音", "完整報告"];
    for (let i = 1; i <= 6; i++) {
      const content = stepResults[String(i)] ?? "";
      if (!content) continue;
      const slide = pptx.addSlide();
      slide.background = { color: "FAFAF9" };
      slide.addText(`Step ${i}: ${stepTitles[i - 1]}`, {
        x: 0.5, y: 0.3, w: 9, h: 0.7,
        fontSize: 16, color: "1A1A18", bold: true,
      });
      const lines = content.replace(/##[^#]/g, '').replace(/\*\*/g, '').slice(0, 800);
      slide.addText(lines, {
        x: 0.5, y: 1.1, w: 9, h: 5.2,
        fontSize: 11, color: "4A4A45",
        breakLine: true,
        wrap: true,
      });
    }

    const pptBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;

    // 發送 email
    sgMail.setApiKey(SENDGRID_KEY);
    await sgMail.send({
      to: PPT_EMAIL,
      from: "noreply@sowork.ai",
      subject: `${brandName} 品牌定位報告`,
      text: `附件為 ${brandName} 的品牌定位完整報告，由 Marketing OS 自動生成。`,
      html: `<p>附件為 <strong>${brandName}</strong> 的品牌定位完整報告，由 Marketing OS 自動生成。</p>`,
      attachments: [
        {
          content: (pptBuffer as Buffer).toString("base64"),
          filename: `${brandName}_品牌定位報告.pptx`,
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          disposition: "attachment",
        },
      ],
    });
    console.log(`[missionChatRouter] PPT sent to ${PPT_EMAIL}`);
  } catch (err: any) {
    console.error("[missionChatRouter] PPT generation/send error:", err?.message);
    throw err;
  }
}
// (removed 2026-04-19) executePositioningStep + POSITIONING_STEPS_6 hardcoded 6-step legacy

// ── Squad Chat 執行器 ─────────────────────────────────────────────────────────
/**
 * 當 mission 有 squadSlug 時，走 squad agent 分工流程
 * 回傳 true 表示已處理，false 表示沒有 squad（讓 caller 走一般路徑）
 */
async function tryExecuteSquadChat(params: {
  userId: number;
  missionId: number;
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  workspace?: string;
  squadSlugHint?: string; // client-supplied hint for first-message race condition
  send: (event: string, data: unknown) => void;
  sessionId: string;
}): Promise<boolean> {
  const { userId, missionId, userMessage, conversationHistory, workspace, squadSlugHint, send } = params;

  // ── 1. 從 mission 讀取 squadSlug 與品牌資料 ─────────────────────────────────
  let squadSlug: string | null = null;
  let brandId = 0;
  let brand: Record<string, string> = {};
  let missionTitle = "";

  try {
    const [mRows] = await localPool.execute(
      `SELECT m.squadSlug, m.title, m.brandId,
              b.name, b.industry, b.description, b.targetAudience,
              b.brandVoice, b.tagline, b.positioningSummary, b.website
       FROM missions m
       LEFT JOIN brands b ON b.id = m.brandId
       WHERE m.id = ? LIMIT 1`,
      [missionId]
    ) as any[];
    const m = (mRows as any[])?.[0];
    // Prefer DB value; fall back to client hint (first-message race: updateMission mutation
    // may not have committed before the chat request arrives on the server).
    const resolvedSlug = m?.squadSlug ?? squadSlugHint ?? null;
    if (!resolvedSlug) return false; // 沒有 squad，讓 caller 走一般路徑

    // If slug came from hint, persist it now so future calls see it in DB
    if (!m?.squadSlug && squadSlugHint) {
      await localPool.execute(
        `UPDATE missions SET squadSlug = ? WHERE id = ?`,
        [squadSlugHint, missionId]
      ).catch(() => {}); // non-fatal
    }

    squadSlug    = resolvedSlug;
    missionTitle = m.title ?? "";
    brandId      = m.brandId ?? 0;
    brand = {
      name:               m.name ?? "",
      industry:           m.industry ?? "",
      description:        m.description ?? "",
      targetAudience:     m.targetAudience ?? "",
      brandVoice:         m.brandVoice ?? "",
      tagline:            m.tagline ?? "",
      positioningSummary: m.positioningSummary ?? "",
      website:            m.website ?? "",
    };
  } catch (e: any) {
    console.warn("[squadChat] mission/brand fetch:", e?.message);
    return false;
  }

  // ── 2. 讀取 squad 定義與 workflow ──────────────────────────────────────────
  let squadName = squadSlug!;
  let squadMethodology = "";
  let squadAgents: any[] = [];
  let workflowSteps: any[] = [];

  try {
    // Read squad + embedded steps (Phase A.2: steps now live on squads.steps)
    const [sRows] = await localPool.execute(
      `SELECT s.id, s.name, s.methodology, s.agents, s.steps as workflowSteps
       FROM squads s
       WHERE s.slug = ? AND s.is_active = 1 LIMIT 1`,
      [squadSlug]
    ) as any[];
    const s = (sRows as any[])?.[0];
    if (s) {
      console.log(`[squadChat] Loaded squad by slug=${squadSlug}, id=${s.id}, name=${s.name}`);
      squadName        = s.name ?? squadSlug;
      squadMethodology = s.methodology ?? "";
      squadAgents      = safeJson(s.agents);
      workflowSteps    = safeJson(s.workflowSteps);

      // Fallback: if squads.steps is empty, read legacy squad_template by slug
      if (!workflowSteps || workflowSteps.length === 0) {
        try {
          const [wtRows] = await localPool.execute(
            `SELECT steps FROM squad_template WHERE taskType = ? AND isActive = 1 LIMIT 1`,
            [squadSlug]
          ) as any[];
          const wt = (wtRows as any[])?.[0];
          if (wt?.steps) workflowSteps = safeJson(wt.steps);
        } catch { /* no legacy steps */ }
      }

      if (!squadAgents || squadAgents.length === 0) {
        console.warn(`[squadChat] WARNING: Squad "${squadSlug}" has NO agents! Will fall back to hardcoded team.`);
      }
    } else {
      console.warn(`[squadChat] Squad not found for slug="${squadSlug}"`);
    }
  } catch (e: any) {
    console.warn("[squadChat] squad fetch error:", e?.message);
  }

  // squad agents 依 order 排序
  squadAgents.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const leadSlot = squadAgents.find((a: any) => a.is_lead === 1 || a.is_lead === true);

  // ── 3. 取得 / 建立 squad session（步驟狀態）──────────────────────────────────
  const session = await getOrCreateSquadSession(localPool as any, missionId, squadSlug!);
  const currentStep = session.currentStep;
  const isLeadStep  = currentStep === 0;
  const totalSteps  = workflowSteps.length;

  // 決定本步驟的 agent slot — dual-track resolver (Phase D)
  // Priority: step.assignedAgentId → step.requiredSkills → squad lead
  const { resolveStepAgent } = await import("../_core/stepAgentResolver");
  let currentSlot: any = null;
  if (isLeadStep) {
    currentSlot = leadSlot ?? squadAgents[0] ?? null;
  } else {
    const wsIdx = Math.min(currentStep - 1, workflowSteps.length - 1);
    const wStep = workflowSteps[wsIdx] ?? {};
    // Use unified resolver (assignedAgentId → requiredSkills → lead)
    currentSlot = resolveStepAgent(wStep, squadAgents)
               ?? squadAgents.find((a: any) => a.role === (wStep?.owner ?? wStep?.agentRole ?? ""))
               ?? squadAgents[wsIdx % squadAgents.length]
               ?? squadAgents[0]
               ?? null;
  }

  // ── 4. 讀取 agent 詳細資料 ──────────────────────────────────────────────────
  let agentDetail: any = null;
  if (currentSlot?.agent_id) {
    try {
      const [aRows] = await localPool.execute(
        `SELECT id, name, title, specialty, avatarUrl, aiModel, primarySkill
         FROM agents WHERE id = ? LIMIT 1`,
        [currentSlot.agent_id]
      ) as any[];
      agentDetail = (aRows as any[])?.[0] ?? null;
    } catch (e: any) {
      console.warn("[squadChat] agent fetch:", e?.message);
    }
  }

  const agentName  = agentDetail?.name  ?? (squadName + " Agent");
  const agentTitle = agentDetail?.title ?? currentSlot?.role ?? "";
  const agentAvatar = agentDetail?.avatarUrl ?? null;

  // ── 5. 讀取品牌大腦 ──────────────────────────────────────────────────────────
  const brandBrain: Record<string, string[]> = {};
  if (brandId) {
    try {
      const [bRows] = await localPool.execute(
        `SELECT category, content FROM brand_brain WHERE brandId = ? ORDER BY updatedAt DESC LIMIT 30`,
        [brandId]
      ) as any[];
      for (const r of (bRows as any[])) {
        const cat = r.category ?? "custom";
        if (!brandBrain[cat]) brandBrain[cat] = [];
        brandBrain[cat].push(r.content);
      }
    } catch { /* non-fatal */ }
  }

  // ── 6. 取得本步驟的 workflow step 定義 ──────────────────────────────────────
  const workflowStep = isLeadStep
    ? { title: "任務確認", description: `啟動「${squadName}」小組，確認任務目標與執行方向`, outputType: "任務目標確認" }
    : (workflowSteps[Math.min(currentStep - 1, workflowSteps.length - 1)] ?? {});

  // ── 7. 送出 relay_step（在 streaming 開始之前）─────────────────────────────
  const stepLabel = isLeadStep
    ? `${squadName} — 任務確認`
    : (workflowStep.title ?? workflowStep.name ?? `Step ${currentStep}`);

  send("relay_step", {
    id:          currentStep,
    step:        currentStep,
    totalSteps,
    label:       stepLabel,
    agentId:     agentDetail?.id ?? null,
    agentName,
    agentTitle,
    agentAvatar,
    agentRole:   currentSlot?.role ?? "",
    squadName,
    layer:       isLeadStep ? "strategy" : "execution",
    status:      "running",
  });

  // ── 8. 建構 system prompt（品牌 + workspace + mission + 步驟任務）───────────
  const systemPrompt = buildSquadAgentPrompt({
    agent:           { name: agentName, title: agentTitle, specialty: agentDetail?.specialty, aiModel: agentDetail?.aiModel },
    brand,
    workspace:       workspace ?? "strategy",
    missionTitle,
    squadName,
    squadMethodology,
    agentRole:       currentSlot?.role ?? agentTitle,
    workflowStep,
    stepIndex:       currentStep,
    totalSteps,
    previousResults: session.stepResults,
    brandBrain,
    isLead:          isLeadStep,
  });

  // ── 9. 串流 LLM 回應 ────────────────────────────────────────────────────────
  // A2A Handoff: non-lead steps receive previous agent's output as explicit handoff
  // context in the user message. This models true agent-to-agent communication where
  // each agent explicitly receives the prior agent's deliverable and acts on it.
  let effectiveUserMessage = userMessage;
  if (!isLeadStep && Object.keys(session.stepResults).length > 0) {
    const prevKey = currentStep - 1;
    const prevOutput = session.stepResults[prevKey]
      ?? session.stepResults[Math.max(...Object.keys(session.stepResults).map(Number))]
      ?? null;
    if (prevOutput) {
      const prevWorkflowStep = workflowSteps[Math.min(currentStep - 2, workflowSteps.length - 1)];
      const prevStepTitle = prevWorkflowStep?.title ?? prevWorkflowStep?.name ?? `Step ${currentStep - 1}`;
      effectiveUserMessage = `【A2A 交接文件 — 來自「${prevStepTitle}」的成果】\n\n${prevOutput.slice(0, 2500)}\n\n${"─".repeat(40)}\n【你的任務】${workflowStep.description ?? stepLabel}\n\n請基於上方的交接成果，執行你負責的步驟。用戶原始請求：${userMessage}`;
    }
  }

  // Phase D2: Each step's agent reads the last 20 chat messages for context continuity.
  // This ensures the executing agent understands the conversation flow, not just the
  // handoff from the previous step.
  const recentHistory = (conversationHistory ?? [])
    .slice(-20)
    .map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...recentHistory,
    { role: "user" as const, content: effectiveUserMessage },
  ];

  let fullOutput = "";
  try {
    for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
      send(event, data);
      if (event === "delta") fullOutput += (data as any).text ?? "";
    }
  } catch (e: any) {
    // gateway 失敗，fallback 到直接 LLM
    console.warn("[squadChat] gateway fallback:", e?.message);
    for await (const chunk of streamFromLLM(systemPrompt, [], userMessage)) {
      fullOutput += chunk;
      send("delta", { text: chunk });
    }
  }

  // ── 10. 儲存步驟結果，推進步驟 ────────────────────────────────────────────
  await saveStepAndAdvance(localPool as any, missionId, currentStep, fullOutput, totalSteps);

  send("relay_step", {
    id: currentStep, status: "done",
    agentName, agentTitle,
    summary: fullOutput.slice(0, 400),
    totalSteps,
    // Signal to the client whether more steps remain (enables auto-advance A2A)
    hasMoreSteps: currentStep + 1 <= totalSteps,
    nextStepIndex: currentStep + 1,
  });

  // ── 11. 自動存入品牌大腦（關鍵步驟成果）──────────────────────────────────
  if (brandId && fullOutput.length > 100 && !isLeadStep) {
    type BrainCategory = "custom" | "audience" | "positioning" | "voice" | "competitors";
    const STEP_TO_BRAIN_CATEGORY: Record<number, BrainCategory> = {
      1: "audience",    // 研究步驟 → 受眾
      2: "competitors", // 競品分析 → 競品
      3: "positioning", // 定位步驟 → 定位
      4: "voice",       // 文案步驟 → 聲音
    };
    const category: BrainCategory = STEP_TO_BRAIN_CATEGORY[currentStep] ?? "custom";
    try {
      await writeBrandBrainEntry({
        brandId,
        category,
        title: `${squadName} — ${stepLabel}`,
        content: fullOutput.slice(0, 1500),
        sourceMissionId: missionId,
      });
    } catch (e: any) {
      console.warn("[squadChat] brain write:", e?.message);
    }
  }

  // ── 12. 偵測 @mention → 第二意見 ─────────────────────────────────────────
  const mentionMatch = userMessage.match(/@([\u4e00-\u9fa5\w\s]{1,20})/);
  if (mentionMatch && mentionMatch[1]) {
    const mentionedName = mentionMatch[1].trim();
    await handleMentionSecondOpinion({
      mentionedName, primaryResponse: fullOutput, userMessage,
      brand, squadAgents, send, conversationHistory,
    });
  }

  // ── 13. 送出後續建議 ─────────────────────────────────────────────────────
  const nextStep = workflowSteps[currentStep]; // currentStep 已推進，指向下一步
  const suggestions = nextStep
    ? [
        `繼續執行：${nextStep.title ?? nextStep.name ?? "下一步"}`,
        `深入分析剛才的結果`,
        `調整方向後重新執行這一步`,
      ]
    : [
        `💾 將完整成果存入品牌大腦`,
        `📄 匯出完整報告`,
        `🔁 針對某個環節深入分析`,
      ];

  send("suggestions", { items: suggestions });

  return true; // 已處理
}

// ── @mention 第二意見處理 ─────────────────────────────────────────────────────
async function handleMentionSecondOpinion(params: {
  mentionedName: string;
  primaryResponse: string;
  userMessage: string;
  brand: Record<string, string>;
  squadAgents: any[];
  send: (event: string, data: unknown) => void;
  conversationHistory: { role: string; content: string }[];
}): Promise<void> {
  const { mentionedName, primaryResponse, userMessage, brand, squadAgents, send, conversationHistory } = params;

  // 先在 squad members 裡找
  let secondaryAgent: any = null;
  let secondaryAgentData: any = null;

  // 嘗試在 squad 成員裡找同名 agent
  for (const slot of squadAgents) {
    if (!slot.agent_id) continue;
    try {
      const [aRows] = await localPool.execute(
        `SELECT id, name, title, specialty, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
        [slot.agent_id]
      ) as any[];
      const a = (aRows as any[])?.[0];
      if (a && (a.name?.includes(mentionedName) || mentionedName.includes(a.name?.split(" ")[0] ?? ""))) {
        secondaryAgent = slot;
        secondaryAgentData = a;
        break;
      }
    } catch { /* skip */ }
  }

  // 若 squad 裡沒找到，從 agents 表模糊搜尋
  if (!secondaryAgentData) {
    try {
      const [aRows] = await localPool.execute(
        `SELECT id, name, title, specialty, avatarUrl FROM agents
         WHERE name LIKE ? AND isAvailable = 1 LIMIT 1`,
        [`%${mentionedName}%`]
      ) as any[];
      secondaryAgentData = (aRows as any[])?.[0] ?? null;
    } catch { /* skip */ }
  }

  if (!secondaryAgentData) return; // 找不到就略過

  // 送出第二 relay_step
  send("relay_step", {
    id:          99,
    step:        99,
    label:       `@${secondaryAgentData.name} 的第二意見`,
    agentId:     secondaryAgentData.id,
    agentName:   secondaryAgentData.name,
    agentTitle:  secondaryAgentData.title,
    agentAvatar: secondaryAgentData.avatarUrl ?? null,
    agentRole:   "second_opinion",
    layer:       "review",
    status:      "running",
    isSecondOpinion: true,
  });

  const secondPrompt = buildSecondOpinionPrompt(
    { name: secondaryAgentData.name, title: secondaryAgentData.title, specialty: secondaryAgentData.specialty },
    primaryResponse,
    brand,
    userMessage,
  );

  const secondMessages = [
    { role: "system", content: secondPrompt },
    ...conversationHistory.slice(-4),
    { role: "user", content: userMessage },
  ];

  let secondOutput = "";
  try {
    for await (const { event, data } of streamFromGateway("openclaw/pm", secondMessages)) {
      if (event === "delta") {
        send("second_opinion_delta", data);
        secondOutput += (data as any).text ?? "";
      }
    }
  } catch {
    // silent fallback
  }

  send("relay_step", {
    id: 99, status: "done",
    agentName: secondaryAgentData.name,
    summary: secondOutput.slice(0, 400),
    isSecondOpinion: true,
  });
}

// ── Helper ───────────────────────────────────────────────────────────────────
function safeJson(val: string | null | undefined): any[] {
  if (!val) return [];
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

// ── Main chat endpoint ────────────────────────────────────────────────────────
missionChatRouter.post("/", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { userMessage, conversationHistory = [], sessionId: clientSessionId, missionId, workspace, brandContext = {}, squadSlug: bodySquadSlug } = req.body as {
    userMessage: string;
    conversationHistory: { role: string; content: string }[];
    sessionId?: string;
    missionId?: number;
    workspace?: string;
    brandContext?: Record<string, string>;
    squadSlug?: string; // client hint for first-message race condition
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
    // ── Phase C+ fix (2026-04-19): UNIFIED squad-first routing for ALL workspaces ──
    //
    // Regardless of workspace (strategy, linkedin, youtube, facebook, etc.), if the
    // mission has a squad selected, chat MUST read steps from squads.steps — same
    // field as the right-side "執行流程" panel. This guarantees left/right parity.
    //
    // Resolution order:
    //   1. bodySquadSlug (client hint, avoids first-message race)
    //   2. missions.squadSlug (authoritative DB value, looked up inside tryExecuteSquadChat)
    //
    // Only when NO squad is selected does workspace-specific legacy flow activate.
    if ((bodySquadSlug || missionId) && missionId) {
      const squadHandled = await tryExecuteSquadChat({
        userId,
        missionId,
        userMessage,
        conversationHistory,
        workspace,
        squadSlugHint: bodySquadSlug,
        send,
        sessionId,
      });
      if (squadHandled) {
        clearInterval(keepalive);
        res.end();
        logEvent({ sessionId, userId, eventType: "session_end" });
        return;
      }
      // Fall through to generic mission chat only if mission has no squad at all
    }

    // ── Generic mission chat fallback (no squad on mission) ────────────────────
    // When user has not selected any squad, treat as open-ended advisory chat.
    // No PM Agent role, no hardcoded steps — just Squad Lead equivalent (Mission Lead)
    // reads mission/brand context and responds conversationally.
    send("status", { message: "分析任務中..." });

    // 一般路徑也從 DB 補充 brand context（避免 PM 問已知資訊）
    let brandId: number = 0;
    const enrichedBrandCtx: Record<string, string> = {};
    if (missionId) {
      try {
        const [mBrandRows] = await localPool.execute(
          `SELECT m.brandId, b.name, b.industry, b.description, b.website
           FROM missions m LEFT JOIN brands b ON b.id = m.brandId
           WHERE m.id = ? LIMIT 1`,
          [missionId]
        ) as any[];
        const mb = (mBrandRows as any[])?.[0];
        if (mb) {
          brandId = mb.brandId ?? 0;
          enrichedBrandCtx.name = mb.name ?? "";
          enrichedBrandCtx.industry = mb.industry ?? "";
          enrichedBrandCtx.description = mb.description ?? "";
          enrichedBrandCtx.website = mb.website ?? "";
        }
      } catch (e: any) {
        console.warn("[missionChatRouter] general brand fetch:", e?.message);
      }
    }

    const queryEmb = await getEmbedding(userMessage);
    let squads: any[] = [];
    let agents: any[] = [];
    if (queryEmb) {
      const results = await semanticSearch(queryEmb, 3);
      squads = results.squads;
      agents = results.agents;
    }

    let missionTitle = "";
    if (missionId) {
      try {
              const [mRows] = await localPool.execute(
          `SELECT title FROM missions WHERE id=? LIMIT 1`,
          [missionId]
        ) as any;
        missionTitle = (mRows as any[])?.[0]?.title ?? "";
      } catch { /* non-fatal */ }
    }

    // Context Loader: 一般 agent 讀最近20筆
    let agentCtxPrefix = "";
    let agentDepthLabel = "";
    if (brandId && missionId) {
      try {
        const agentCtx = await loadAgentContext({
          missionId,
          brandId,
          userId,
          isSquadLead: false,
        });
        agentCtxPrefix = agentCtx.systemPromptPrefix;
        agentDepthLabel = agentCtx.depthLabel;
      } catch (e: any) {
        console.warn('[missionChatRouter] agentCtx error:', (e as any)?.message);
      }
    }

    const pmContext = buildPmContext(userMessage, squads, agents, enrichedBrandCtx, {
      title: missionTitle,
      workspace: workspace ?? undefined,
      agentCtxPrefix,
      agentDepthLabel,
    });
    const messages = [
      { role: "system", content: pmContext },
      ...conversationHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    send("relay_step", { id: 0, label: "Mission 分析", agentName: "Mission Lead", agentTitle: "任務指揮官", layer: "strategy", status: "running" });

    const t0 = Date.now();
    let fullOutput = "";
    for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
      send(event, data);
      if (event === "delta") fullOutput += (data as any).text ?? "";
    }

    send("relay_step", { id: 0, status: "done", summary: fullOutput.slice(0, 400) });
    logEvent({ sessionId, userId, agentSlug: "openclaw/pm", eventType: "gateway_call", isGatewayOk: true, latencyMs: Date.now() - t0, contentLength: fullOutput.length });

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

// ── Reset positioning session ────────────────────────────────────────────────
missionChatRouter.post("/reset-positioning", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { missionId } = req.body as { missionId?: number };

  try {
    if (missionId) {
      // 清空指定 mission 的定位展期 (only if owned by this user)
      await localPool.execute(
        `DELETE FROM positioning_sessions WHERE missionId = ? AND userId = ?`,
        [missionId, userId]
      );
      // 清空對應 mission 的 chat messages
      await localPool.execute(
        `DELETE FROM chat_messages WHERE missionId = ? AND userId = ?`,
        [missionId, userId]
      );
    } else {
      // 清空該用戶所有 strategy 定位 sessions
      await localPool.execute(
        `DELETE ps FROM positioning_sessions ps
         INNER JOIN missions m ON m.id = ps.missionId
         WHERE ps.userId = ? AND m.workspace = 'strategy'`,
        [userId]
      );
    }
    res.json({ ok: true, message: "定位展期已重置" });
  } catch (err: any) {
    console.error("[missionChatRouter] reset-positioning error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ── Reset squad session (called when user selects a new squad + sends first message) ──
missionChatRouter.post("/reset-squad-session", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { missionId } = req.body as { missionId?: number };
  if (!missionId) { res.status(400).json({ error: "missionId required" }); return; }
  try {
    await resetSquadSession(localPool as any, missionId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[missionChatRouter] reset-squad-session:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ── Save conversation ─────────────────────────────────────────────────────────
missionChatRouter.post("/save", async (req: Request, res: Response) => {
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

// ── Email squad results ────────────────────────────────────────────────────────
// POST /api/chat/email-results  { recipientEmail, subject, content, missionId? }
missionChatRouter.post("/email-results", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { recipientEmail, subject, content, missionId } = req.body as {
    recipientEmail: string;
    subject?: string;
    content: string;
    missionId?: number;
  };

  if (!recipientEmail || !content) {
    res.status(400).json({ error: "recipientEmail and content are required" });
    return;
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  if (!SENDGRID_KEY) {
    res.status(503).json({ error: "Email service not configured" });
    return;
  }

  try {
    sgMail.setApiKey(SENDGRID_KEY);

    // Convert markdown to simple HTML
    const htmlContent = content
      .split("\n\n").map(block => `<p>${block.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^#{1,3} (.+)$/, "<strong>$1</strong>")}</p>`).join("\n")
      .replace(/<p>-\s/g, "<li>").replace(/<\/li>\n<li>/g, "</li><li>");

    await sgMail.send({
      to: recipientEmail,
      from: "noreply@sowork.ai",
      subject: subject ?? `行銷 AI 小組成果報告`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #1A1A18; }
          .header { background: linear-gradient(135deg, #1A1A18, #2D2D2A); color: white; padding: 20px 24px; border-radius: 10px; margin-bottom: 24px; }
          .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
          .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.6; }
          .content { line-height: 1.7; font-size: 14px; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E4E3E1; font-size: 11px; color: #9B9990; }
          strong { color: #0A6EFA; }
          h2, h3 { color: #1A1A18; margin: 1.5em 0 0.5em; }
        </style></head>
        <body>
          <div class="header">
            <h1>🎯 ${subject ?? "行銷 AI 小組成果報告"}</h1>
            <p>由 Marketing OS · AI Squad 生成 · ${new Date().toLocaleDateString("zh-TW")}</p>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
          <div class="footer">
            此報告由 Marketing OS 的 AI 小組協作生成。如有問題請聯絡你的行銷顧問。
          </div>
        </body>
        </html>
      `,
    });

    // Log the export (best-effort, non-blocking)
    if (missionId) {
      recordMissionExport({
        missionId, brandId: 0, exportType: "text",
        title: subject ?? "Email Report",
      }).catch(() => {});
    }

    res.json({ ok: true, recipient: recipientEmail });
  } catch (err: any) {
    console.error("[email-results]", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Email send failed" });
  }
});
