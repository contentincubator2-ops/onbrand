/**
 * chatRoute.ts — 統一對話入口（v3 with positioning state machine）
 * POST /api/chat
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

export const chatRouter = Router();

const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";
const SENDGRID_KEY = "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";
const PPT_EMAIL = "cjwang@sowork.tw";

// P0 fix: use localPool (mos_db) for all DB operations

// ── 品牌定位 6 步驟定義 ───────────────────────────────────────────────────────
const POSITIONING_STEPS_6 = [
  {
    step: 1,
    title: "任務確認",
    agentName: "PM Agent",
    agentTitle: "行銷任務指揮官",
    layer: "strategy",
    instruction: (brand: any) => `你是 SoWork 行銷 PM。
用戶剛進入品牌定位任務。

【品牌資料】
${formatBrandCtx(brand)}

請用繁體中文：
1. 用 2-3 句簡短 recap 你掌握的品牌資料（品牌名稱、產業、描述）
2. 說明今天的品牌定位任務將分 6 個步驟進行，每步都需要你的確認
3. 問：**這次品牌定位最想解決的痛點或目標是什麼？**（例如：打入新市場、重新定位現有客群、提升品牌知名度等）

格式要求：
- 繁體中文
- 簡潔有力，不超過 200 字
- 結尾只有一個問題，等用戶回答`,
    confirmPrompt: "請告訴我這次定位的核心目標，我們就可以開始第一步分析。",
  },
  {
    step: 2,
    title: "競品分析",
    agentName: "品牌策略師",
    agentTitle: "競品研究專家",
    layer: "execution",
    instruction: (brand: any, userGoal: string) => `你是品牌策略師，專精競品分析。

【品牌資料】
${formatBrandCtx(brand)}

【用戶目標】
${userGoal}

請直接輸出競品分析結果（繁體中文）：

## 🔍 競品分析

### 主要競品（3個）
對每個競品列出：名稱、核心定位、主要弱點

### SoWork AI 的差異化空間
根據競品分析，列出 3-4 個 SoWork AI 可以切入的差異化方向

### 初步定位建議
基於競品空白，提出 1 個初步定位方向供確認

---
✅ **確認問題：** 以上競品清單是否準確？有沒有我遺漏的重要競品？定位方向符合你的直覺嗎？
確認後我們進入 Step 3：目標受眾定義。`,
    confirmPrompt: "請確認競品清單是否正確，以及定位方向是否符合你的預期。",
  },
  {
    step: 3,
    title: "目標受眾定義",
    agentName: "市場研究師",
    agentTitle: "消費者洞察專家",
    layer: "execution",
    instruction: (brand: any, userGoal: string, prevContext: string) => `你是市場研究師，專精目標受眾定義。

【品牌資料】
${formatBrandCtx(brand)}

【用戶目標】
${userGoal}

【前面確認的競品分析】
${prevContext}

請直接輸出目標受眾分析（繁體中文）：

## 👥 目標受眾定義

### Persona A（主要受眾）
- 人口特徵：
- 工作場景：
- 核心痛點：
- 決策關鍵：

### Persona B（次要受眾）
- 人口特徵：
- 工作場景：
- 核心痛點：
- 決策關鍵：

### Persona C（潛力受眾，選填）
（若有第三個值得關注的受眾群體）

---
✅ **確認問題：** 以上受眾輪廓是否符合你的實際客群？哪個 Persona 是你最想優先打動的？
確認後進入 Step 4：品牌定位宣言。`,
    confirmPrompt: "請確認受眾輪廓是否準確，並告訴我哪個 Persona 最重要。",
  },
  {
    step: 4,
    title: "品牌定位宣言",
    agentName: "品牌策略師",
    agentTitle: "定位宣言設計師",
    layer: "execution",
    instruction: (brand: any, userGoal: string, prevContext: string) => `你是品牌策略師，專精品牌定位宣言設計。

【品牌資料】
${formatBrandCtx(brand)}

【用戶目標】
${userGoal}

【已確認的分析脈絡】
${prevContext}

請直接輸出品牌定位宣言（繁體中文）：

## 🎯 品牌定位宣言

### Tagline 候選 × 3
1. **[Tagline A]** — 訴求方向說明
2. **[Tagline B]** — 訴求方向說明
3. **[Tagline C]** — 訴求方向說明

### 完整定位聲明
> 「對於 [目標客群]，SoWork AI 是 [品類] 中 [差異化] 的解決方案，因為 [核心理由]。」

### 品牌承諾（一句話）
[給用戶的核心承諾]

---
✅ **確認問題：** 以上哪個 Tagline 最打動你？或者有想調整的方向？
確認後進入 Step 5：品牌聲音定義。`,
    confirmPrompt: "請選擇最喜歡的 Tagline 方向，或告訴我想調整的方向。",
  },
  {
    step: 5,
    title: "品牌聲音定義",
    agentName: "創意文案師",
    agentTitle: "品牌語調設計師",
    layer: "execution",
    instruction: (brand: any, userGoal: string, prevContext: string) => `你是創意文案師，專精品牌語調設計。

【品牌資料】
${formatBrandCtx(brand)}

【用戶目標】
${userGoal}

【已確認的定位脈絡】
${prevContext}

請直接輸出品牌聲音定義（繁體中文）：

## 🎙 品牌聲音定義

### 品牌語調
[3 個形容詞描述品牌語調，例如：專業、親切、有力]

### 溝通風格
[2-3 句描述 SoWork AI 說話的方式]

### DO ✅（我們會這樣說）
- [範例句 1]
- [範例句 2]
- [範例句 3]

### DON'T ❌（我們不會這樣說）
- [範例句 1]
- [範例句 2]
- [範例句 3]

### 對不同受眾的語調調整
- 對中小企業主：[調整方式]
- 對行銷主管：[調整方式]

---
✅ **確認問題：** 以上品牌語調是否符合你心目中的 SoWork AI 形象？有想調整的地方嗎？
確認後進入最後一步 Step 6：完整報告 + PPT 輸出。`,
    confirmPrompt: "請確認品牌語調是否符合預期，確認後我將整理完整報告並發送 PPT。",
  },
  {
    step: 6,
    title: "完整報告 + PPT 輸出",
    agentName: "PM Agent",
    agentTitle: "報告整理師",
    layer: "strategy",
    instruction: (brand: any, userGoal: string, prevContext: string) => `你是 SoWork 行銷 PM，負責整理品牌定位完整報告。

【品牌資料】
${formatBrandCtx(brand)}

【用戶目標】
${userGoal}

【所有確認過的分析內容】
${prevContext}

請整理出完整的品牌定位報告（繁體中文），格式要豐富：

# 📊 SoWork AI 品牌定位完整報告

## 執行摘要
[100字以內的核心定位總結]

## 競品分析結論
[整合 Step 2 的競品分析]

## 目標受眾
[整合 Step 3 的 Persona]

## 品牌定位宣言
[整合 Step 4 的 Tagline + 定位聲明]

## 品牌聲音指南
[整合 Step 5 的 DO/DON'T]

## 下一步行動建議
1. [立即可執行的 3 個行動]
2.
3.

---
🎉 品牌定位完整報告已整理完成！
📧 正在生成 PPT 並發送至 cjwang@sowork.tw...`,
    confirmPrompt: null,
  },
];

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

// ── Semantic search ───────────────────────────────────────────────────────────
async function semanticSearch(queryEmbedding: number[], topN = 3): Promise<{
  squads: { slug: string; name: string; description: string; similarity: number }[];
  agents: { slug: string; name: string; title: string; specialty: string; similarity: number }[];
}> {
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
    console.log(`[chatRoute] PPT sent to ${PPT_EMAIL}`);
  } catch (err: any) {
    console.error("[chatRoute] PPT generation/send error:", err?.message);
    throw err;
  }
}

// ── 品牌定位狀態機 ─────────────────────────────────────────────────────────────
async function executePositioningStep(params: {
  userId: number;
  missionId: number;
  brandId: number;
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  brandContext: Record<string, string>;
  send: (event: string, data: unknown) => void;
}): Promise<void> {
  const { userId, missionId, brandId, userMessage, conversationHistory, brandContext, send } = params;

  // 讀取當前步驟
  let currentStep = 0;
  let stepResultsRaw: Record<string, string> = {};
  let sessionExists = false;

  try {
    const [sessRows] = await localPool.execute(
      `SELECT currentStep, stepResults, status FROM positioning_sessions WHERE missionId=? AND userId=? LIMIT 1`,
      [missionId, userId]
    ) as any;
    const sess = (sessRows as any[])?.[0];
    if (sess) {
      currentStep = sess.currentStep ?? 0;
      sessionExists = true;
      try {
        stepResultsRaw = typeof sess.stepResults === "string"
          ? JSON.parse(sess.stepResults || "{}") : (sess.stepResults ?? {});
      } catch { stepResultsRaw = {}; }
    }
  } catch (e: any) {
    console.error("[chatRoute] DB read error:", e?.message);
  }

  // 如果沒有 session，建立一個
  if (!sessionExists) {
    try {
      await localPool.execute(
        `INSERT IGNORE INTO positioning_sessions (missionId, brandId, userId, currentStep, status, stepResults)
         VALUES (?, ?, ?, 0, 'in_progress', '{}')`,
        [missionId, brandId, userId]
      );
    } catch (e: any) {
      console.error("[chatRoute] DB insert error:", e?.message);
    }
    currentStep = 0;
  }

  // 決定這次要執行哪個步驟
  const targetStep = currentStep + 1;

  if (targetStep > 6) {
    send("delta", { text: "\n\n🎉 品牌定位 6 步驟已全部完成！報告已在上方。" });
    send("relay_step", { id: 6, label: "全部完成", agentName: "PM Agent", agentTitle: "任務指揮官", layer: "strategy", status: "done" });
    return;
  }

  const stepDef = POSITIONING_STEPS_6[targetStep - 1]!;

  // 標記步驟開始
  send("relay_step", {
    id: targetStep,
    label: `Step ${targetStep}/6: ${stepDef.title}`,
    agentName: stepDef.agentName,
    agentTitle: stepDef.agentTitle,
    layer: stepDef.layer,
    status: "running",
  });

  // 更新 DB：標記 in_progress
  try {
    await localPool.execute(
      `UPDATE positioning_sessions SET status='in_progress', updatedAt=NOW() WHERE missionId=? AND userId=?`,
      [missionId, userId]
    );
  } catch (e: any) {
    console.error("[chatRoute] DB update status error:", e?.message);
  }

  // 建立前步脈絡
  const prevContext = Object.entries(stepResultsRaw)
    .filter(([k]) => parseInt(k) < targetStep)
    .map(([k, v]) => `=== Step ${k} 確認內容 ===\n${String(v).slice(0, 500)}`)
    .join("\n\n");

  // 取得用戶目標（P1 fix: 從對話歷史取第一個 user 回覆，或 userMessage）
  // Step 1 的 AI 輸出問：「這次定位最想解決的痛點是什麼？」
  // 用戶回答是對話歷史中第二個 user 訊息（或當前 userMessage 若是 Step 2 的第一次觸發）
  const firstUserReply = conversationHistory.find(m => m.role === "user")?.content;
  const userGoal = firstUserReply || userMessage;

  // 建立 system prompt
  let systemPrompt: string;
  if (targetStep === 1) {
    systemPrompt = (stepDef.instruction as any)(brandContext);
  } else if (targetStep === 2) {
    systemPrompt = (stepDef.instruction as any)(brandContext, userGoal);
  } else {
    systemPrompt = (stepDef.instruction as any)(brandContext, userGoal, prevContext);
  }

  // 執行 LLM 串流
  let fullContent = "";
  try {
    // 先嘗試 Gateway
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-8),
      { role: "user", content: userMessage },
    ];
    let gatewayOk = false;
    try {
      for await (const { event, data } of streamFromGateway("openclaw/pm", messages)) {
        send(event, data);
        if (event === "delta") fullContent += (data as any).text ?? "";
      }
      if (fullContent.length >= 50) gatewayOk = true;
    } catch {
      console.warn("[chatRoute] Gateway failed, falling back to LLM");
    }

    if (!gatewayOk) {
      // 重置，用 invokeLLMStream
      fullContent = "";
      for await (const delta of streamFromLLM(systemPrompt, conversationHistory.slice(-8), userMessage)) {
        fullContent += delta;
        send("delta", { text: delta });
      }
    }
  } catch (err: any) {
    throw new Error(`Step ${targetStep} LLM error: ${err?.message}`);
  }

  // 儲存步驟結果到 DB
  if (fullContent.length > 20) {
    const newResults = { ...stepResultsRaw, [String(targetStep)]: fullContent };
    const nextCurrentStep = targetStep;
    const newStatus = targetStep >= 6 ? "completed" : "waiting_confirm";

    try {
      await localPool.execute(
        `UPDATE positioning_sessions 
         SET currentStep=?, status=?, stepResults=?, updatedAt=NOW()
         WHERE missionId=? AND userId=?`,
        [nextCurrentStep, newStatus, JSON.stringify(newResults), missionId, userId]
      );
    } catch (e: any) {
      console.error("[chatRoute] DB save step error:", e?.message);
    }
  }

  // 步驟完成 relay_step event
  send("relay_step", {
    id: targetStep,
    label: `Step ${targetStep}/6: ${stepDef.title}`,
    agentName: stepDef.agentName,
    agentTitle: stepDef.agentTitle,
    layer: stepDef.layer,
    status: "done",
    summary: fullContent.slice(0, 300),
  });

  // 最後一步：生成 PPT 並發送 + 自動寫入 Brand Brain + 記錄 Exports
  if (targetStep === 6) {
    send("delta", { text: "\n\n⏳ 正在生成 PPT 報告..." });
    const allResults: Record<string, string> = { ...stepResultsRaw, "6": fullContent };

    // 自動寫入 Brand Brain（各步驟結論）
    if (brandId) {
      const brainWrites: Array<{ step: string; category: "competitors"|"audience"|"positioning"|"voice"; title: string }> = [
        { step: "2", category: "competitors", title: `競品分析 - ${brandContext.name || "Brand"}` },
        { step: "3", category: "audience",    title: `目標受眾 - ${brandContext.name || "Brand"}` },
        { step: "4", category: "positioning", title: `品牌定位宣言 - ${brandContext.name || "Brand"}` },
        { step: "5", category: "voice",       title: `品牌聲音定義 - ${brandContext.name || "Brand"}` },
      ];
      await Promise.allSettled(
        brainWrites.map(({ step, category, title }) => {
          const stepContent = allResults[step];
          if (!stepContent) return Promise.resolve();
          return writeBrandBrainEntry({
            brandId,
            category,
            title,
            content: stepContent.slice(0, 5000),
            sourceMissionId: missionId,
          });
        })
      );
      console.log(`[chatRoute] Brand Brain auto-written for brandId=${brandId}`);
    }

    try {
      await generateAndSendPPT(
        brandContext.name || "Brand",
        fullContent,
        allResults
      );

      // 記錄到 mission_exports
      if (brandId) {
        await recordMissionExport({
          brandId,
          missionId,
          exportType: "pptx",
          title: `${brandContext.name || "Brand"} 品牌定位報告`,
        });
      }

      send("delta", { text: `\n\n✅ **PPT 已成功發送至 ${PPT_EMAIL}！**\n請查收信箱。` });
    } catch (pptErr: any) {
      send("delta", { text: `\n\n⚠️ PPT 發送失敗：${pptErr?.message}（報告內容已完整顯示在上方）` });
    }
  }
}

// ── Main chat endpoint ────────────────────────────────────────────────────────
chatRouter.post("/", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { userMessage, conversationHistory = [], sessionId: clientSessionId, missionId, workspace } = req.body as {
    userMessage: string;
    conversationHistory: { role: string; content: string }[];
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
    // ── 品牌定位 6 步驟（workspace=strategy）──────────────────────────────────
    if (workspace === "strategy") {
      // P3 fix: 若沒有 missionId，自動建立 strategy mission
      let resolvedMissionId = missionId;
      if (!resolvedMissionId) {
        try {
          const missionTitle = brandContext.name
            ? `${brandContext.name} 品牌定位`
            : "品牌定位任務";
          const [insertResult] = await localPool.execute(
            `INSERT INTO missions (userId, workspace, title, status, createdAt, updatedAt)
             VALUES (?, 'strategy', ?, 'active', NOW(), NOW())`,
            [userId, missionTitle]
          ) as any[];
          resolvedMissionId = (insertResult as any).insertId;
          send("status", { message: `已自動建立任務 #${resolvedMissionId}` });
          console.log(`[chatRoute] P3: auto-created missionId=${resolvedMissionId} for userId=${userId}`);
        } catch (e: any) {
          console.error("[chatRoute] P3 auto-create mission error:", e?.message);
          resolvedMissionId = 0;
        }
      }

      // 從 missionId 查詢 brand（唯一來源）
      let brandId: number = 0;
      const enrichedBrandCtx: Record<string, string> = {};

      if (resolvedMissionId) {
        try {
          const [mRows] = await localPool.execute(
            `SELECT m.brandId, b.name, b.industry, b.description, b.website
             FROM missions m LEFT JOIN brands b ON b.id = m.brandId
             WHERE m.id = ? LIMIT 1`,
            [resolvedMissionId]
          ) as any;
          const m = (mRows as any[])?.[0];
          if (m) {
            brandId = m.brandId ?? 0;
            enrichedBrandCtx.name = m.name ?? "";
            enrichedBrandCtx.industry = m.industry ?? "";
            enrichedBrandCtx.description = m.description ?? "";
            enrichedBrandCtx.website = m.website ?? "";
          }
        } catch (e: any) {
          console.error("[chatRoute] strategy brand fetch:", e?.message);
        }
      }

      send("status", { message: "品牌定位步驟執行中..." });

      await executePositioningStep({
        userId,
        missionId: resolvedMissionId ?? 0,
        brandId,
        userMessage,
        conversationHistory,
        brandContext: enrichedBrandCtx,
        send,
      });

      send("done", { sessionId, isComplete: true });
      return;
    }

    // ── 一般任務（非 strategy workspace）──────────────────────────────────────
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
        console.warn("[chatRoute] general brand fetch:", e?.message);
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
        console.warn('[chatRoute] agentCtx error:', (e as any)?.message);
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

    send("relay_step", { id: 0, label: "PM 分析任務", agentName: "PM Agent", agentTitle: "任務指揮官", layer: "strategy", status: "running" });

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
chatRouter.post("/reset-positioning", async (req: Request, res: Response) => {
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
    console.error("[chatRoute] reset-positioning error:", err?.message);
    res.status(500).json({ error: err?.message });
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
