/**
 * squadChatRoute — SSE endpoint for A2A Squad 逐步確認對話
 * POST /api/stream/squad-chat
 *
 * 設計原則：「先做再問」
 * Agent 主動執行分析 → 帶結果給用戶 → 等用戶確認/調整 → 繼續下一步
 *
 * Body: {
 *   squadSlug: string
 *   missionId: number
 *   userMessage: string
 *   conversationHistory: { role, content }[]
 *   brandContext: { name, industry, website, targetAudience, description }
 *   currentStep?: number   // 前端帶入，0 表示剛開始
 * }
 *
 * SSE events:
 *   agent    → { agentName, agentTitle, agentRole, step, totalSteps }
 *   delta    → { text }
 *   done     → { step, totalSteps, nextPrompt, isComplete }
 *   error    → { message }
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import { invokeLLMStream } from "../_core/llm";
import { getDb, getSoworkDb } from "../db";
import mysql from "mysql2/promise";

export const squadChatRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
function getSecretBytes() {
  return new TextEncoder().encode(getJwtSecret());
}
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

// ── Squad DB pool (sowork_db on Azure) ───────────────────────────────────────
let _squadPool: mysql.Pool | null = null;
function getSquadPool(): mysql.Pool {
  if (!_squadPool) {
    _squadPool = mysql.createPool({
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      ssl: { rejectUnauthorized: false },
      connectionLimit: 5,
    });
  }
  return _squadPool;
}

// ── Squad member type ─────────────────────────────────────────────────────────
interface SquadMember {
  agent_id: number;
  role: string;
  is_lead: boolean;
  order: number;
}

interface AgentRow {
  id: number;
  name: string;
  title: string;
  bio: string;
  specialty: string;
  layer: string;
}

// ── Step definitions per squadSlug ───────────────────────────────────────────
// 每個任務有固定的步驟序列；Agent 在每個步驟「先搜尋/分析，帶結果問用戶確認」
const MISSION_STEPS: Record<string, string[]> = {
  // 品牌定位 (tw-b2b-saas-gtm)
  "tw-b2b-saas-gtm": [
    "品牌基礎研究：主動搜尋品牌網站與公開資料，輸出品牌核心業務摘要，請用戶確認方向",
    "競品分析：搜尋同類競品，輸出 3-5 個競品概覽（名稱/定位/弱點），請用戶確認/調整競品清單",
    "目標受眾：根據品牌與競品分析，產出 2-3 個 Persona 輪廓，請用戶確認是否符合實際客群",
    "差異化優勢：分析競品空白，提出 5 個候選差異化優勢，請用戶選擇或調整",
    "價值主張草稿：基於確認的差異化，提出 3 個價值主張版本，請用戶選擇偏好方向",
    "品牌個性與語調：定義 2 組品牌原型與溝通語調，請用戶確認",
    "訊息策略：產出品牌標語 3 選 1 + 電梯簡報草稿，請用戶確認",
    "通路策略：建議主要行銷通路與各通路內容方向，請用戶確認",
    "定位方案 A 完整版：整合前面確認的內容，輸出方向 A 的完整定位方案（含標語/定位聲明/訊息支柱）",
    "定位方案 B 完整版：提出差異化第二方向，輸出方向 B 的完整定位方案，最終交付 2 方向 × 5 定位 = 10 個方案",
  ],
  // 競品每日情報 (mkt-analytics-attribution)
  "mkt-analytics-attribution": [
    "確認追蹤競品清單：根據品牌產業搜尋主要競品，列出建議追蹤清單，請用戶確認或補充",
    "競品動態搜尋：主動搜尋各競品最新新聞/社群/廣告動態（過去 7 天），輸出原始情報摘要",
    "情報分析與威脅評級：對每條情報進行分析，標記高/中/低威脅，說明對品牌的影響",
    "行動建議：根據情報，提出 3 個具體行動建議，請用戶確認優先處理項目",
    "報告格式確認：輸出完整競品每日情報報告，確認此格式是否符合每日使用需求",
  ],
  // 官網文案調整 (tw-website-rebuild)
  "tw-website-rebuild": [
    "官網現況分析：讀取品牌官網，摘要現有 Hero/CTA/Value Prop 文案，標出改善機會點",
    "競品官網比較：搜尋 2-3 個競品官網文案，找出差異化空間，請用戶確認改善方向",
    "Hero 文案優化：提出 3 個 Hero 標題 + 副標題組合，請用戶選擇或調整語氣",
    "CTA 與 Value Prop 優化：提出 3 組 CTA 文案 + 3 組 Value Proposition，請用戶確認",
    "完整文案交付：整合確認版本，輸出官網完整優化文案（含 Hero/CTA/Features/FAQ 建議）",
  ],
  // 每週長文 (mkt-seo-growth)
  "mkt-seo-growth": [
    "關鍵字研究：根據品牌產業搜尋熱門關鍵字與問題，提出 5 個文章主題候選，請用戶選擇",
    "競品文章分析：搜尋該主題現有排名文章，分析內容缺口，請用戶確認切入角度",
    "文章大綱：產出 H2/H3 結構大綱（含預期字數分配），請用戶確認結構",
    "草稿產出（前半）：輸出文章前 700-800 字草稿，請用戶確認方向後繼續",
    "草稿產出（完整版）：輸出完整 1500 字+ SEO 長文，含 Meta Description 與 SEO 建議",
  ],
  // 固定品牌貼文 (mkt-content-engine)
  "mkt-content-engine": [
    "本週話題研究：搜尋本週行業熱門話題與社群趨勢，提出 5 個貼文主題，請用戶確認方向",
    "品牌語調確認：根據品牌資料分析語調，輸出 2 個語調範例，請用戶確認偏好",
    "一週排期規劃：提出 7 天貼文排期（含平台/主題/格式），請用戶確認或調整",
    "貼文草稿（前 3 篇）：輸出第 1-3 天的完整貼文草稿（含圖片描述建議），請用戶確認",
    "貼文草稿（完整版）：輸出全週 5-7 篇完整貼文，含圖文格式與 Hashtag 建議",
  ],
  // 廣告投放優化 (tw-ecom-full-funnel)
  "tw-ecom-full-funnel": [
    "廣告現況診斷：請用戶提供廣告帳號近期數據，或根據品牌資料估算現況問題點",
    "競品廣告研究：搜尋競品廣告投放策略與素材方向，找出差距，請用戶確認",
    "受眾策略優化：提出 3 個 Ad Set 受眾優化方向（冷/暖/再行銷），請用戶確認優先項",
    "素材與文案建議：對應每個 Ad Set 提出素材方向 + 文案範例，請用戶確認",
    "完整優化方案：輸出 3 個 Ad Set 完整優化方向（受眾/出價/素材/預算配比），含預期成效",
  ],
};

// 取得某步驟要指派的 agent（依 order 輪換）
function getAgentForStep(
  members: SquadMember[],
  step: number,
  totalSteps: number
): SquadMember {
  const sorted = [...members].sort((a, b) => a.order - b.order);
  // Step 1, last step → lead agent
  // 中間步驟依序輪換
  if (step === 1 || step === totalSteps) {
    return sorted.find((m) => m.is_lead) ?? sorted[0]!;
  }
  const idx = (step - 2) % sorted.length;
  return sorted[idx] ?? sorted[0]!;
}

// ── Main route ────────────────────────────────────────────────────────────────
squadChatRouter.post("/squad-chat", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    squadSlug,
    missionId,
    userMessage,
    conversationHistory = [],
    brandContext = {},
    currentStep = 0,
  } = req.body as {
    squadSlug: string;
    missionId: number;
    userMessage: string;
    conversationHistory: { role: string; content: string }[];
    brandContext: {
      name?: string;
      industry?: string;
      website?: string;
      targetAudience?: string;
      description?: string;
    };
    currentStep?: number;
  };

  if (!squadSlug || !userMessage) {
    res.status(400).json({ error: "squadSlug and userMessage are required" });
    return;
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch { /* client disconnected */ }
  };

  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  try {
    // 1. Load squad from DB
    const pool = getSquadPool();
    const [squadRows] = await pool.execute(
      "SELECT slug, name, CONVERT(members USING utf8mb4) as members FROM agent_squads WHERE slug = ? LIMIT 1",
      [squadSlug]
    ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

    const squadRow = squadRows[0];
    if (!squadRow) {
      send("error", { message: `Squad not found: ${squadSlug}` });
      res.end();
      clearInterval(keepalive);
      return;
    }

    const members: SquadMember[] = typeof squadRow["members"] === "string"
      ? JSON.parse(squadRow["members"] as string)
      : (squadRow["members"] as SquadMember[]);

    // 2. Determine current step
    const steps = MISSION_STEPS[squadSlug] ?? [
      "分析需求並提出初步方案，請用戶確認方向",
      "根據用戶回饋深化執行，輸出完整成果",
    ];
    const totalSteps = steps.length;

    // nextStep = currentStep + 1 (1-indexed)
    // If user just sent their first message (currentStep=0), this is step 1
    const thisStep = Math.min(currentStep + 1, totalSteps);
    const stepInstruction = steps[thisStep - 1] ?? steps[steps.length - 1]!;
    const isLastStep = thisStep >= totalSteps;

    // 3. Load agent for this step
    const stepMember = getAgentForStep(members, thisStep, totalSteps);
    const agentIds = members.map((m) => m.agent_id);

    let agentRow: AgentRow | null = null;
    try {
      const placeholders = agentIds.map(() => "?").join(",");
      const [agentRows] = await pool.execute(
        `SELECT id, name, title, COALESCE(bio,'') as bio, COALESCE(specialty,'') as specialty, COALESCE(layer,'execution') as layer
         FROM agents WHERE id IN (${placeholders}) LIMIT ${agentIds.length}`,
        agentIds
      ) as [mysql.RowDataPacket[], mysql.FieldPacket[]];

      agentRow = (agentRows as AgentRow[]).find((a) => a.id === stepMember.agent_id)
        ?? (agentRows[0] as AgentRow ?? null);
    } catch (err) {
      console.error("[squad-chat] agent load error:", err);
    }

    const agentName = agentRow?.name ?? "行銷顧問";
    const agentTitle = agentRow?.title ?? stepMember.role;
    const agentBio = agentRow?.bio ?? "";
    const agentSpecialty = agentRow?.specialty ?? "";

    // Emit agent info immediately
    send("agent", {
      agentName,
      agentTitle,
      agentRole: stepMember.role,
      step: thisStep,
      totalSteps,
    });

    // 4. Persist step state to DB
    try {
      const db = await getDb();
      if (db) {
        await (db as any).execute(
          `INSERT INTO mission_step_state (userId, missionId, currentStep, totalSteps, status)
           VALUES (?, ?, ?, ?, 'in_progress')
           ON DUPLICATE KEY UPDATE currentStep=VALUES(currentStep), totalSteps=VALUES(totalSteps), updatedAt=NOW()`,
          [userId, missionId, thisStep, totalSteps]
        );
      }
    } catch (err) {
      console.error("[squad-chat] step state persist error:", err);
    }

    // 5. Build brand context string
    const brandCtxStr = [
      brandContext.name ? `品牌名稱：${brandContext.name}` : "",
      brandContext.industry ? `產業：${brandContext.industry}` : "",
      brandContext.website ? `官網：${brandContext.website}` : "",
      brandContext.targetAudience ? `目標受眾：${brandContext.targetAudience}` : "",
      brandContext.description ? `品牌描述：${brandContext.description}` : "",
    ].filter(Boolean).join("\n");

    // 6. Build system prompt — 「先做再問」強力版
    const squadName = squadRow["name"] as string;
    const isAutoStart = userMessage.trim() === "開始";

    // 各 squad 的知識庫：競品、行業數據、典型案例
    const SQUAD_KNOWLEDGE: Record<string, string> = {
      "tw-b2b-saas-gtm": `你熟悉 B2B SaaS GTM 策略，了解台灣 SaaS 市場競品如 91APP、SHOPLINE、Cyberbiz、Gomo、商店街等。
對快時尚品牌（如 LATIV）的數位化轉型、會員行銷、CRM 整合有深入研究。`,
      "mkt-analytics-attribution": `你是 GA4 數據架構師，熟悉台灣電商競品分析工具（SimilarWeb、iSpionage、Facebook Ad Library）。
能搜尋競品最新動態：UNIQLO 台灣、H&M、NET、GU、Zara 的廣告投放、社群策略、促銷活動。`,
      "tw-website-rebuild": `你熟悉電商官網 CRO、UX 最佳實踐。
LATIV 官網 https://www.lativ.com.tw 是台灣快時尚電商，有首頁、分類頁、商品頁、結帳流程。
競品官網參考：UNIQLO.com, hm.com/zh_tw, net-fashion.net。`,
      "mkt-seo-growth": `你是 B2B/B2C SEO 專家。
LATIV 的 SEO 機會：「MIT服飾」「台灣製造」「平價時尚」「快時尚 推薦」等關鍵字。
競品 SEO 強度：UNIQLO > NET > LATIV，長尾關鍵字有機會超越。`,
      "mkt-content-engine": `你是社群內容策略師，熟悉台灣 Facebook/Instagram 社群生態。
LATIV 的社群風格：親切台灣本土感，強調 MIT、性價比、季節穿搭。
本週流行話題：換季穿搭、母親節、MIT 台灣品牌、平價時尚。`,
      "tw-ecom-full-funnel": `你熟悉台灣電商全漏斗廣告策略。
LATIV 廣告機會：Facebook/Instagram 購物廣告、Google Shopping、LINE 廣告。
受眾策略：18-45歲女性、購物興趣、既有客戶再行銷、相似受眾。`,
    };

    const squadKnowledge = SQUAD_KNOWLEDGE[squadSlug] ?? "";

    const systemPrompt = `你是 ${agentName}，${agentTitle}，在「${squadName}」擔任「${stepMember.role}」。

【背景】${agentBio.slice(0, 200)}

【專長】${agentSpecialty.slice(0, 200)}

【領域知識】
${squadKnowledge}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【工作模式：先做再問（強制）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${isAutoStart ? `任務剛啟動。你必須「立刻主動開始研究」，不能問任何空問題。
根據下方品牌資料，直接輸出本步驟的研究結果。` : `根據用戶的回覆內容，繼續本步驟的任務或推進到下一步。`}

✅ 每次回覆的結構：
1. 「## 📊 [本步驟標題]」開場
2. 主動列出你的研究/分析結果（具體數字、名稱、比較）
3. 最後 2-3 行：「✅ 確認問題：以上 [XX] 是否符合你的預期？需要調整哪些部分？確認後我們進入下一步。」

❌ 嚴格禁止：
- 空問題（「請問你的品牌目標是？」）
- 說需要更多資訊才能分析
- 輸出純建議沒有具體結果
- 開場說「您好」「嗨」等問候語

【本步驟任務 Step ${thisStep}/${totalSteps}】
${stepInstruction}

【品牌資料】
${brandCtxStr || "品牌：LATIV，台灣快時尚，官網：https://www.lativ.com.tw"}

${isLastStep
  ? "【最終步驟】整合所有確認結果，輸出完整交付物（格式豐富，有表格/條列/標題）。"
  : `【提示】完成本步驟後，在結尾說明：「確認後進入 Step ${thisStep + 1}：${steps[thisStep] ?? "最終交付"}」`
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【輸出規格】
- 繁體中文
- 用 ## ### 標題分段
- 用表格或條列清單呈現分析
- 長度：500-900 字（自動啟動時可更長）
- 直接輸出，不要 JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // 7. Build messages
    const historyMsgs = conversationHistory.slice(-12).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyMsgs,
      { role: "user" as const, content: userMessage },
    ];

    // 8. Stream LLM response
    send("start", { message: `${agentName} 正在分析...` });

    let fullContent = "";
    for await (const delta of invokeLLMStream({ messages, provider: "openrouter" })) {
      fullContent += delta;
      send("delta", { text: delta });
    }

    // 9. Save assistant message to chat_messages
    try {
      const db = await getDb();
      if (db) {
        const { chatMessages } = await import("../../drizzle/schema");
        await (db.insert(chatMessages) as any).values({
          userId,
          missionId: missionId ?? null,
          role: "assistant",
          content: fullContent,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      console.error("[squad-chat] save message error:", err);
    }

    // 10. Done event
    send("done", {
      step: thisStep,
      totalSteps,
      agentName,
      agentTitle,
      isComplete: isLastStep,
      nextStepHint: isLastStep ? null : steps[thisStep] ?? null,
    });

  } catch (err: any) {
    console.error("[squad-chat] error:", err);
    send("error", { message: err?.message ?? "Unknown error" });
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});
