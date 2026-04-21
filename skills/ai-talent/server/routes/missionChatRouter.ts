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

// ── All data lives in mos_db — use localPool throughout ──────────────────────
// localPool → mos_db on localhost (missions, brands, squads, agents, sessions, …)
// No more Azure sowork_db dependency.

import { invokeLLMStream } from "../_core/llm";
import { loadAgentContext } from "../agentContextLoader";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const PptxGenJS = _require("pptxgenjs");
import sgMail from "@sendgrid/mail";
import { writeBrandBrainEntry } from "./brandBrainRoute";
import { recordMissionExport } from "./exportsRoute";
import { getEmbedding, cosineSimilarity } from "../_core/embedding";
import { getOrCreateSquadSession, saveStepResultOnly, advanceToNextStep, resetSquadSession } from "../_core/squadSessionManager";
import { persistReportSection } from "../_core/reportPersistence";
import { buildSquadAgentPrompt, buildSecondOpinionPrompt, buildLeadSynthesisPrompt } from "../_core/agentPromptBuilder";

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
    brand.tagline ? `品牌標語：${brand.tagline}` : "",
    brand.valueProposition ? `品牌定位：${brand.valueProposition}` : "",
    brand.targetMarket ? `目標市場：${brand.targetMarket}` : "",
    brand.audienceA ? `受眾A：${brand.audienceA}` : "",
    brand.audienceB ? `受眾B：${brand.audienceB}` : "",
    brand.emotionalDiff ? `情感差異化：${brand.emotionalDiff}` : "",
    brand.functionalDiff ? `功能差異化：${brand.functionalDiff}` : "",
    brand.website ? `官網：${brand.website}` : "",
  ].filter(Boolean).join("\n");
}

// ── Auth ──────────────────────────────────────────────────────────────────────
// Accepts BOTH:
//   1. Authorization: Bearer <jwt>       (legacy flow, Login.tsx → localStorage)
//   2. Cookie: session=<jwt>             (new flow, LoginPage.tsx → HTTP-only cookie)
// This lets /api/chat work regardless of which login page the user went through.
async function verifyToken(req: Request): Promise<number | null> {
  // Try Authorization header first
  const auth = req.headers.authorization;
  let raw: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    raw = auth.slice(7);
  } else if ((req as any).cookies?.session) {
    raw = (req as any).cookies.session;
  }
  if (!raw) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(raw, secret);
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
以繁體中文回覆。根據用戶的具體需求，直接給出建議或分析。
品牌資料已在上方提供，不得詢問用戶品牌名稱、產業、目標客群等已知資訊。
直接分析並行動，不要問無謂的確認問題。
【格式規定】禁止在回應中輸出 [RELAY:...] 格式的標記。禁止使用 Emoji。${depthNote ? ("\n" + depthNote) : ""}`;
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

// ── Squad auto-exec removed ─────────────────────────────────────────────────
// runAutoSquadFlow was removed on 2026-04-21. All squad steps now require
// explicit user confirmation via the "繼續第 N 步" button in MissionChatCore.


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
  phaseOrder?: number;    // Scheme B: which phase conversation to read/write; defaults 0
  send: (event: string, data: unknown) => void;
  sessionId: string;
}): Promise<boolean> {
  const { userId, missionId, userMessage, conversationHistory, workspace, squadSlugHint, send } = params;
  const phaseOrder = params.phaseOrder ?? 0;

  // ── 1. 從 mission 讀取 squadSlug 與品牌資料 ─────────────────────────────────
  let squadSlug: string | null = null;
  let brandId = 0;
  let brand: Record<string, string> = {};
  let missionTitle = "";

  try {
    // All data lives in mos_db — use localPool
    const [mRows] = await localPool.execute(
      `SELECT m.squadSlug, m.title, m.brandId,
              b.name, b.industry, b.description, b.tagline, b.website,
              b.valueProposition, b.targetMarket, b.audienceA, b.audienceB,
              b.emotionalDiff, b.functionalDiff
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
      name:             m.name ?? "",
      industry:         m.industry ?? "",
      description:      m.description ?? "",
      tagline:          m.tagline ?? "",
      website:          m.website ?? "",
      valueProposition: m.valueProposition ?? "",
      targetMarket:     m.targetMarket ?? "",
      audienceA:        m.audienceA ?? "",
      audienceB:        m.audienceB ?? "",
      emotionalDiff:    m.emotionalDiff ?? "",
      functionalDiff:   m.functionalDiff ?? "",
    };
  } catch (e: any) {
    console.warn("[squadChat] mission/brand fetch:", e?.message);
    return false;
  }

  // ── 2. 讀取 squad 定義與 workflow ──────────────────────────────────────────
  let squadId: number | null = null;
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
      squadId          = s.id;
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
  // Support both snake_case (is_lead) and camelCase (isLead) field names
  const leadSlot = squadAgents.find((a: any) =>
    a.is_lead === 1 || a.is_lead === true || a.isLead === 1 || a.isLead === true
  );

  // Fallback: if squadAgents is empty or no lead found, query squad_members table directly
  let fallbackLeadAgentId: number | null = null;
  if (!leadSlot && squadSlug) {
    try {
      const [smRows] = await localPool.execute(
        `SELECT sm.agent_id, sm.is_lead, sm.role
         FROM squad_members sm
         JOIN squads s ON s.id = sm.squad_id
         WHERE s.slug = ? AND s.is_active = 1
         ORDER BY sm.is_lead DESC, sm.id ASC
         LIMIT 1`,
        [squadSlug]
      ) as any[];
      const smLead = (smRows as any[])?.[0];
      if (smLead?.agent_id) {
        fallbackLeadAgentId = smLead.agent_id;
        console.log(`[squadChat] Lead resolved from squad_members: agent_id=${smLead.agent_id}`);
      }
    } catch (e: any) {
      console.warn("[squadChat] squad_members fallback:", e?.message);
    }
  }

  // ── 3. 取得 / 建立 squad session（步驟狀態）──────────────────────────────────
  const session = await getOrCreateSquadSession(localPool as any, missionId, squadSlug!, phaseOrder);
  let currentStep = session.currentStep;
  const totalSteps  = workflowSteps.length;

  // ── 3a. 處理「awaiting_reply」狀態 ─────────────────────────────────────────
  // 用戶可以選擇：回覆當前 Agent（繼續對話）或說「繼續」跳到下一步
  const isContinueSignal = /^(繼續|继续|continue|next|下一步|go|yes|ok|好的|好|開始|开始|確認|确认|confirm|派遣|開始執行|执行)$/i.test(userMessage.trim());

  // Auto-execution has been permanently removed. Every step is step-by-step:
  // user clicks "繼續第 N 步" each time. `isContinueSignal` is still detected so
  // we advance currentStep, but we never chain beyond a single step ahead.

  if (session.status === "awaiting_reply") {
    if (isContinueSignal) {
      // 用戶明確要繼續 → 推進到下一步
      const nextStep = currentStep + 1;
      await advanceToNextStep(localPool as any, missionId, nextStep, totalSteps, phaseOrder);
      currentStep = nextStep;
    } else {
      // 用戶回覆當前 Agent — currentStep 保持不變，重新執行當前步驟的 agent
    }
  }

  // ── 「討論模式」：synthesis 完成後，所有訊息路由給 Squad Lead 繼續討論 ────────
  // status='discussing' 代表整合報告已輸出，用戶在與 Squad Lead 確認定案方向。
  // 強制走 Squad Lead 路徑（currentStep = 0 equivalent），不觸發 synthesis。
  const isDiscussionMode = session.status === "discussing";
  if (isDiscussionMode) {
    currentStep = 0; // Force Squad Lead slot resolution
    // But DON'T auto-advance after this turn — handled in step completion section below
  }

  const isLeadStep  = currentStep === 0;

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

  // ── 4. 讀取 agent 詳細資料 ─────────────────────────────────────────────────
  // Design: Squad Lead is ALWAYS the speaking voice throughout the conversation.
  // Specialist agents are "skill frameworks" injected into the Lead's context —
  // they are NOT separate personas. This mirrors how a real lead delegates
  // internally but presents a unified face to the client.

  // 4a. 永遠拿 Squad Lead 的資料（對話主體）
  // Fetch methodology so Lead agents with custom Mode B system prompts override buildSquadAgentPrompt
  let leadAgentDetail: any = null;
  const leadId = leadSlot?.agent_id ?? fallbackLeadAgentId;
  if (leadId) {
    try {
      const [lRows] = await localPool.execute(
        `SELECT id, name, title, specialty, avatarUrl, aiModel, primarySkill, methodology
         FROM agents WHERE id = ? LIMIT 1`,
        [leadId]
      ) as any[];
      leadAgentDetail = (lRows as any[])?.[0] ?? null;
    } catch (e: any) {
      console.warn("[squadChat] lead agent fetch:", e?.message);
    }
  }

  // 4b. 本步驟 Specialist（技能框架注入，非對話主體）
  // Load full skill documentation: methodology + tool_instructions + workingPrinciples
  let specialistDetail: any = null;
  if (!isLeadStep) {
    const specId = currentSlot?.agent_id;
    if (specId && specId !== leadId) {
      try {
        const [sRows] = await localPool.execute(
          `SELECT id, name, title, specialty, avatarUrl, aiModel, primarySkill,
                  methodology, tool_instructions, workingPrinciples
           FROM agents WHERE id = ? LIMIT 1`,
          [specId]
        ) as any[];
        specialistDetail = (sRows as any[])?.[0] ?? null;
        console.log(`[squadChat] Specialist skill docs: ${specialistDetail?.name}, methodology=${!!specialistDetail?.methodology}, tools=${!!specialistDetail?.tool_instructions}`);
      } catch (e: any) {
        console.warn("[squadChat] specialist agent fetch:", e?.message);
      }
    }
  }

  // Squad Lead is always the speaking voice
  const agentName   = leadAgentDetail?.name   ?? (squadName + " Lead");
  const agentTitle  = leadAgentDetail?.title  ?? "Squad Lead";
  const agentAvatar = leadAgentDetail?.avatarUrl ?? null;

  // Skill badge = specialist's skill (what capability Lead is applying this step)
  const agentSkill  = specialistDetail?.primarySkill ?? leadAgentDetail?.primarySkill ?? "";

  // Model: use specialist's model for step quality; Lead's model for lead/discussion steps
  // For lead intake (step 0): BYPASS gateway — use invokeLLMStream directly (openrouter/forge).
  //   Reason: gateway requires "openclaw/{agent_slug}" format. Model names like
  //   "claude-sonnet-4-6" are NOT valid gateway slugs and silently produce empty streams.
  //   Squad Lead steps are better served by the direct LLM path which is model-agnostic.
  // For execution steps: gateway with specialist's DB model (valid agent slug).
  // Normalize DB model slugs → "openclaw/{slug}" gateway format.
  const normalizeModel = (m?: string | null) =>
    m ? (m.includes("/") ? m : `openclaw/${m}`) : null;

  const agentModel = isLeadStep
    ? "direct-llm"                                           // Lead intake: bypass gateway (see streaming below)
    : (normalizeModel(specialistDetail?.aiModel)             // Specialist step: use specialist's model
        ?? normalizeModel(leadAgentDetail?.aiModel)          // Fallback: Lead's model
        ?? "openclaw/pm");                                   // Final fallback (valid gateway slug)

  console.log(`[squadChat] Lead="${agentName}", step=${currentStep}, skill="${agentSkill}", model="${agentModel}"`);

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
    agentId:     leadAgentDetail?.id ?? null,
    agentName,
    agentTitle,
    agentAvatar,
    agentSkill,
    agentModel,
    agentRole:   currentSlot?.role ?? "",
    squadName,
    layer:       isLeadStep ? "strategy" : "execution",
    status:      "running",
  });

  // ── 8. 建構 system prompt（品牌 + workspace + mission + 步驟任務）───────────
  //
  // Mode B architecture: when a Squad Lead has a custom methodology field (e.g. Mary Allen),
  // use it as the complete system prompt for intake steps. Brand context is prepended so the
  // Lead has full situational awareness. This replaces buildSquadAgentPrompt for lead steps only.
  // Discussion mode always uses buildSquadAgentPrompt (the Lead is synthesizing, not doing intake).
  const hasLeadMethodology = isLeadStep && !isDiscussionMode && (leadAgentDetail?.methodology ?? "").trim().length > 0;

  const systemPrompt = hasLeadMethodology
    ? [
        "【任務背景】",
        `任務名稱：${missionTitle}`,
        `工作區：${workspace ?? "strategy"}`,
        `小組：${squadName}`,
        "",
        formatBrandCtx(brand),
        "",
        "─".repeat(40),
        "",
        leadAgentDetail.methodology,
      ].join("\n")
    : buildSquadAgentPrompt({
        agent: {
          name:      agentName,   // always Lead
          title:     agentTitle,  // always Lead
          specialty: leadAgentDetail?.specialty,
          aiModel:   leadAgentDetail?.aiModel,
        },
        // Specialist skill framework injected into Lead's context (non-lead steps only)
        // Includes full skill documentation: methodology + tool_instructions
        specialistContext: specialistDetail ? {
          name:             specialistDetail.name,
          title:            specialistDetail.title,
          specialty:        specialistDetail.specialty ?? "",
          skill:            specialistDetail.primarySkill ?? "",
          methodology:      specialistDetail.methodology ?? "",
          toolInstructions: specialistDetail.tool_instructions ?? "",
        } : undefined,
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
  const isReplyToSameAgent = session.status === "awaiting_reply" && !isContinueSignal;

  if (!isLeadStep) {
    if (isReplyToSameAgent && session.stepResults[currentStep]) {
      // 用戶在跟剛完成的 Agent 繼續對話 — 讓 Agent 看到自己之前的輸出
      const myPrevOutput = session.stepResults[currentStep] ?? "";
      effectiveUserMessage = `【你在上一輪的分析成果】\n\n${myPrevOutput.slice(0, 1500)}\n\n${"─".repeat(40)}\n【用戶的跟進問題】${userMessage}\n\n請根據你的分析成果，直接回答用戶的問題或修改你的輸出。`;
    } else if (Object.keys(session.stepResults).length > 0) {
      // 正常 A2A 交接 — 新步驟接收上一步成果
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

  // ── Squad Lead step: bypass gateway entirely, call LLM directly ────────────
  // Gateway requires "openclaw/{agent_slug}" format. Model names are NOT valid slugs
  // and silently produce empty streams. Direct LLM call (openrouter → forge) is reliable.
  if (isLeadStep) {
    console.log(`[squadChat] Lead step — using invokeLLMStream directly (skip gateway), step=${currentStep}`);
    try {
      for await (const chunk of streamFromLLM(systemPrompt, recentHistory, effectiveUserMessage)) {
        fullOutput += chunk;
        send("delta", { text: chunk });
      }
    } catch (e: any) {
      console.warn(`[squadChat] invokeLLMStream (openrouter) failed for lead step: ${e?.message}. Trying forge...`);
      try {
        // Forge fallback — uses BUILT_IN_FORGE_API_KEY / BUILT_IN_FORGE_API_URL
        const forgeMessages = [
          { role: "system" as const, content: systemPrompt },
          ...recentHistory.slice(-10).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: effectiveUserMessage },
        ];
        for await (const chunk of invokeLLMStream({ messages: forgeMessages, maxTokens: 4096, provider: "forge" })) {
          fullOutput += chunk;
          send("delta", { text: chunk });
        }
      } catch (e2: any) {
        console.warn(`[squadChat] forge also failed for lead step: ${e2?.message}. Trying gateway pm...`);
        // Final fallback: gateway with pm (known valid slug)
        try {
          for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
            send(event, data);
            if (event === "delta") fullOutput += (data as any).text ?? "";
          }
        } catch (e3: any) {
          console.error(`[squadChat] All LLM providers failed for lead step: ${e3?.message}`);
        }
      }
    }
  } else {
    // ── Specialist steps: use gateway with agent slug ──────────────────────────
    const gatewayModel = agentModel === "direct-llm" ? "openclaw/pm" : agentModel;
    try {
      for await (const { event, data } of streamFromGateway(gatewayModel, messages)) {
        send(event, data);
        if (event === "delta") fullOutput += (data as any).text ?? "";
      }
    } catch (e: any) {
      console.warn(`[squadChat] gateway failed (model=${gatewayModel}):`, e?.message);
      // Fallback: direct invokeLLMStream
      try {
        for await (const chunk of streamFromLLM(systemPrompt, recentHistory, effectiveUserMessage)) {
          fullOutput += chunk;
          send("delta", { text: chunk });
        }
      } catch (e2: any) {
        console.warn("[squadChat] invokeLLMStream fallback also failed:", e2?.message);
      }
    }
  }

  // ── Empty output guard (specialist steps / gateway returned empty stream) ───
  // Gateway sometimes returns HTTP 200 with zero content tokens (silent empty response).
  // This is NOT caught by the catch block above. Detect it and call invokeLLMStream.
  if (!fullOutput.trim()) {
    console.warn(`[squadChat] Empty output after streaming (step=${currentStep}). Calling invokeLLMStream as final guard...`);
    try {
      for await (const chunk of streamFromLLM(systemPrompt, recentHistory, effectiveUserMessage)) {
        fullOutput += chunk;
        send("delta", { text: chunk });
      }
    } catch (finalErr: any) {
      console.error(`[squadChat] Final guard also failed: ${finalErr?.message}`);
      // Send a helpful error message so the user isn't left with empty UI
      const errMsg = "抱歉，LLM 服務暫時無回應，請稍後再試或聯絡管理員。";
      fullOutput = errMsg;
      send("delta", { text: errMsg });
    }
  }

  // ── 10. 儲存步驟結果 ──────────────────────────────────────────────────────
  if (isDiscussionMode) {
    // 討論模式：Squad Lead 繼續對話，不推進步驟，維持 'discussing' 狀態
    // 只記錄輸出（不改變 currentStep / status）
    // no DB write needed for discussion turns
  } else if (isLeadStep) {
    // Mode B: Squad Lead intake — save result but DON'T auto-advance.
    // The Lead (e.g. Mary Allen) confirms with user before dispatching specialists.
    // User must send a continue signal (「繼續」「好的」「確認」「開始」etc.) to advance to step 1.
    await saveStepResultOnly(localPool as any, missionId, currentStep, fullOutput, phaseOrder);
    if (squadId) {
      await persistReportSection(localPool as any, {
        missionId, squadId, stepOrder: currentStep, content: fullOutput,
      });
    }
  } else {
    // Execution steps: save result but WAIT for user to explicitly continue
    await saveStepResultOnly(localPool as any, missionId, currentStep, fullOutput, phaseOrder);
    if (squadId) {
      await persistReportSection(localPool as any, {
        missionId, squadId, stepOrder: currentStep, content: fullOutput,
      });
    }
  }

  const isLastStep = currentStep >= totalSteps;
  send("relay_step", {
    id: currentStep, status: "done",
    label: stepLabel,           // completed step label (e.g. "任務確認" for step 0)
    agentName, agentTitle,
    agentSkill, agentModel,
    summary: fullOutput.slice(0, 400),
    totalSteps,
    // Lead step (step 0): always has more steps (the specialist execution steps follow).
    // Execution steps: check if this is the final specialist step.
    hasMoreSteps: isLeadStep ? (totalSteps > 0) : !isLastStep,
    isLastStep,
    nextStepIndex: currentStep + 1,
    // Always show "continue" button — user must explicitly advance every step.
    // Lead step: user confirms dispatch before specialist 1 executes.
    // Execution steps: user confirms before next specialist executes.
    waitForUser: true,
  });

  // ── 11. Squad Lead 最終整合（最後一步完成後自動觸發，僅執行一次）──────────
  // 當所有 Specialist 都跑完（isLastStep），且不在討論模式，插入 Squad Lead 整合分析。
  // 同一個 SSE 連線繼續送出 relay_step / delta / done，用戶無需再次操作。
  if (isLastStep && !isLeadStep && !isDiscussionMode) {
    // 重新讀取 stepResults（包含剛存入的最後一步）
    const [freshRows] = await (localPool as any).execute(
      `SELECT stepResults FROM squad_chat_sessions WHERE missionId = ? LIMIT 1`,
      [missionId]
    ) as any[];
    const freshResults: Record<number, string> = (() => {
      try { return JSON.parse(freshRows?.[0]?.stepResults ?? "{}"); } catch { return {}; }
    })();

    await runSquadLeadSynthesis({
      leadSlot,
      fallbackLeadAgentId,
      squadName,
      squadMethodology,
      workflowSteps,
      stepResults:    freshResults,
      totalSteps,
      brand,
      brandBrain,
      missionId,
      send,
      agent:     { name: agentName, title: agentTitle, specialty: "" }, // will be overwritten by lead lookup inside
    });
  }

  // ── 12. 自動存入品牌大腦（關鍵步驟成果）──────────────────────────────────
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

  // ── 13. 偵測 @mention → 第二意見 ─────────────────────────────────────────
  const mentionMatch = userMessage.match(/@([\u4e00-\u9fa5\w\s]{1,20})/);
  if (mentionMatch && mentionMatch[1]) {
    const mentionedName = mentionMatch[1].trim();
    await handleMentionSecondOpinion({
      mentionedName, primaryResponse: fullOutput, userMessage,
      brand, squadAgents, send, conversationHistory,
    });
  }

  // ── 14. 送出後續建議 ─────────────────────────────────────────────────────
  const nextStep = workflowSteps[currentStep]; // currentStep 已推進，指向下一步
  const suggestions = isLastStep
    ? [
        `針對定位建議做進一步調整`,
        `@某位 Agent 深入探討特定環節`,
        `儲存完整報告到品牌大腦`,
      ]
    : nextStep
    ? [
        `繼續執行：${nextStep.title ?? nextStep.name ?? "下一步"}`,
        `深入分析剛才的結果`,
        `調整方向後重新執行這一步`,
      ]
    : [
        `針對某個環節深入分析`,
        `儲存完整成果到品牌大腦`,
      ];

  send("suggestions", { items: suggestions });

  // Auto-execution has been permanently removed — every step waits for the
  // user to click "繼續第 N 步". There is no more chained multi-step flow.

  return true; // 已處理
}

// ── Squad Lead 最終整合步驟 ───────────────────────────────────────────────────
/**
 * 在所有 Specialist 完成後，自動觸發 Squad Lead 整合分析。
 * 在同一個 SSE 連線繼續送出事件，用戶無需再次輸入。
 */
async function runSquadLeadSynthesis(params: {
  leadSlot:             any;
  fallbackLeadAgentId:  number | null;
  squadName:            string;
  squadMethodology:     string;
  workflowSteps:        any[];
  stepResults:          Record<number, string>;
  totalSteps:           number;
  brand:                Record<string, string>;
  brandBrain:           Record<string, string[]>;
  missionId:            number;
  send:                 (event: string, data: unknown) => void;
  agent:                { name: string; title: string; specialty: string };
}): Promise<void> {
  const {
    leadSlot, fallbackLeadAgentId, squadName, squadMethodology,
    workflowSteps, stepResults, totalSteps, brand, brandBrain, missionId, send,
  } = params;

  // 取得 Squad Lead 詳細資料
  let leadDetail: any = null;
  const leadAgentId = leadSlot?.agent_id ?? fallbackLeadAgentId;
  if (leadAgentId) {
    try {
      const [aRows] = await localPool.execute(
        `SELECT id, name, title, specialty, avatarUrl, aiModel, primarySkill
         FROM agents WHERE id = ? LIMIT 1`,
        [leadAgentId]
      ) as any[];
      leadDetail = (aRows as any[])?.[0] ?? null;
    } catch (e: any) {
      console.warn("[squadSynthesis] lead agent fetch:", e?.message);
    }
  }

  const leadName   = leadDetail?.name  ?? squadName + " Lead";
  const leadTitle  = leadDetail?.title ?? "Squad Lead";
  const leadAvatar = leadDetail?.avatarUrl ?? null;
  const leadSkill  = leadDetail?.primarySkill ?? "";
  const rawModel   = leadDetail?.aiModel ?? "";
  const leadModel  = rawModel
    ? (rawModel.includes("/") ? rawModel : `openclaw/${rawModel}`)
    : "openclaw/pm";

  const synthesisStepIndex = totalSteps + 1; // e.g. step 6 for a 5-step squad

  // 送出 relay_step running（讓前端渲染 Squad Lead bubble）
  send("relay_step", {
    id:          synthesisStepIndex,
    step:        synthesisStepIndex,
    totalSteps:  synthesisStepIndex,
    label:       `${squadName} — 最終整合建議`,
    agentId:     leadDetail?.id ?? null,
    agentName:   leadName,
    agentTitle:  leadTitle,
    agentAvatar: leadAvatar,
    agentSkill:  leadSkill,
    agentModel:  leadModel,
    agentRole:   "squad_lead",
    squadName,
    layer:       "strategy",
    status:      "running",
    isLead:      true,
    isSynthesis: true,
  });

  // 建構整合 prompt
  const synthesisPrompt = buildLeadSynthesisPrompt({
    agent:            { name: leadName, title: leadTitle, specialty: leadDetail?.specialty ?? "" },
    brand,
    squadName,
    squadMethodology,
    workflowSteps,
    stepResults,
    totalSteps,
    brandBrain,
  });

  const messages = [
    { role: "system" as const, content: synthesisPrompt },
    {
      role: "user" as const,
      content: "請整合所有成員的分析成果，提出最終的品牌定位建議。",
    },
  ];

  // 串流 — Squad Lead synthesis: bypass gateway, use invokeLLMStream directly
  // (Same reason as lead intake: gateway requires valid agent slug, not model names)
  const synthesisUserMsg = "請整合所有成員的分析成果，提出最終的品牌定位建議。";
  let synthesisOutput = "";
  try {
    for await (const chunk of streamFromLLM(synthesisPrompt, [], synthesisUserMsg)) {
      synthesisOutput += chunk;
      send("delta", { text: chunk });
    }
  } catch (e: any) {
    console.warn("[squadSynthesis] invokeLLMStream failed:", e?.message, "— trying gateway pm...");
    try {
      for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
        send(event, data);
        if (event === "delta") synthesisOutput += (data as any).text ?? "";
      }
    } catch (e2: any) {
      console.error("[squadSynthesis] all providers failed:", e2?.message);
    }
  }

  // relay_step done — 完整流程結束
  send("relay_step", {
    id:          synthesisStepIndex,
    status:      "done",
    agentName:   leadName,
    agentTitle:  leadTitle,
    agentSkill:  leadSkill,
    agentModel:  leadModel,
    summary:     synthesisOutput.slice(0, 400),
    totalSteps:  synthesisStepIndex,
    hasMoreSteps: false,
    isLastStep:  true,
    isSynthesis: true,
    waitForUser: true, // 讓用戶與 Squad Lead 討論定案
  });

  // 更新 session 為 discussing：synthesis 完成後，後續訊息路由給 Squad Lead 討論
  // 不設為 'complete'，讓用戶可以繼續與 Squad Lead 交流，直到用戶確認定案
  try {
    await (localPool as any).execute(
      `UPDATE squad_chat_sessions
       SET status = 'discussing', updatedAt = NOW(3)
       WHERE missionId = ?`,
      [missionId]
    );
  } catch (e: any) {
    console.warn("[squadSynthesis] session status update:", e?.message);
  }

  console.log(`[squadSynthesis] Squad Lead synthesis done, missionId=${missionId}, len=${synthesisOutput.length}`);
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

  const { userMessage, conversationHistory = [], sessionId: clientSessionId, missionId, workspace, brandContext = {}, squadSlug: bodySquadSlug, phaseOrder: bodyPhaseOrder } = req.body as {
    userMessage: string;
    conversationHistory: { role: string; content: string }[];
    sessionId?: string;
    missionId?: number;
    workspace?: string;
    brandContext?: Record<string, string>;
    squadSlug?: string;    // client hint for first-message race condition
    phaseOrder?: number;   // Scheme B: which phase's conversation this belongs to (defaults 0)
  };
  const phaseOrder = bodyPhaseOrder ?? 0;

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
        phaseOrder,
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
  const { missionId, phaseOrder } = req.body as { missionId?: number; phaseOrder?: number };
  if (!missionId) { res.status(400).json({ error: "missionId required" }); return; }
  try {
    await resetSquadSession(localPool as any, missionId, phaseOrder ?? 0);
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
