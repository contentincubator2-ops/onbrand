/**
 * executeTask - Core AI task execution engine
 *
 * Orchestrates the full lifecycle of a task execution:
 * 1. Build system prompt from agent profile + brand context
 * 2. Call LLM with structured JSON output schema
 * 3. Persist result to task_executions
 * 4. Update task status to completed / failed
 *
 * Output schema:
 * {
 *   thinking: string,          // AI's reasoning / strategy notes (shown in grey, not copyable)
 *   publishable_content: string, // The actual deliverable (copyable, ready to publish)
 *   image_suggestion?: string, // Optional: image/visual direction
 *   metadata?: object          // Optional: hashtags, posting time, etc.
 * }
 */

import { getDb } from "./db";
import { tasks, taskExecutions, agents, brands, subscriptions, userApiKeys, agentMemories } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { invokeLLMWithBilling } from "./llmWithBilling";
import { notifyUser } from "./notificationService";
import { searchBrandKnowledge } from "./rag";
import { saveLearning, getRelevantLearnings, formatLearningsForPrompt } from "./learning";
import { triggerWorkflowsForTask } from "./triggerWorkflows";

// ── Output format instructions by task type ──────────────────────────────────
const OUTPUT_FORMAT_INSTRUCTIONS: Record<string, string> = {
  press_release: `
【publishable_content 格式】完整新聞稿，格式如下：
標題（15字以內）
副標題（補充說明）
[城市]，[日期]——首段（5W1H，2-3句）
品牌背景段落
產品/活動詳情段落
品牌代表人引言（「品牌名稱代表人表示：『...』」）
關於品牌（1段）
媒體聯絡資訊

【thinking 格式】說明你的新聞稿策略：選擇的切入角度、目標媒體、預期效果。`,

  facebook_post: `
【publishable_content 格式】提供兩個版本的 Facebook 貼文：

版本 A（情感訴求）：
[150-300字貼文正文，第一行要抓住注意力]
[換行]
[hashtag，5-8個]

版本 B（促銷資訊）：
[突出優惠或 CTA 的貼文，150-300字]
[換行]
[hashtag，5-8個]

---
建議配圖：[具體圖片方向描述]
最佳發佈時間：[建議時段]

【thinking 格式】說明你的貼文策略：目標受眾、情感訴求點、A/B 測試假設。`,

  instagram_post: `
【publishable_content 格式】
主文案：
[150字以內，第一行要在 3 秒內抓住注意力]

Hashtag：
[15-20個，分類：品牌/產品/情境/趨勢]

限時動態腳本：
第1張：[畫面描述 + 文字]
第2張：[畫面描述 + 文字]
第3張：[畫面描述 + 文字]

配圖/影片方向：[具體視覺建議]

【thinking 格式】說明你的 IG 策略：演算法考量、視覺風格選擇、互動設計。`,

  ab_test: `
【publishable_content 格式】A/B 測試方案報告：

## 執行摘要
[3-5句概述測試目標與預期效果]

## 測試方案對比
| 項目 | 版本 A | 版本 B |
|------|--------|--------|
| 假設 | ... | ... |
| 文案 | ... | ... |
| 目標受眾 | ... | ... |
| 預期效果 | ... | ... |

## 版本 A 完整設計
[詳細說明]

## 版本 B 完整設計
[詳細說明]

## 測試參數
- 測試期間：[建議天數]
- 建議樣本量：[數字]
- 信心水準：95%

## 主要評估指標
[列出 KPI]

## 決策建議
[勝出條件與後續行動]

【thinking 格式】說明你的測試設計邏輯：假設基礎、變數控制、統計方法。`,

  competitor_analysis: `
【publishable_content 格式】競品分析報告：

## 執行摘要
[3-5句核心洞察]

## 市場競爭格局
| 品牌 | 定位 | 目標客群 | 價格帶 | 核心優勢 |
|------|------|----------|--------|----------|
| ... | ... | ... | ... | ... |

## 各競品深度分析
### [競品名稱]
- 品牌定位：
- 核心產品：
- 行銷策略：
- 優勢：
- 劣勢：
- 近期動態：

## 機會與威脅
**機會：** [列點]
**威脅：** [列點]

## 策略建議
[具體可執行的差異化建議]

【thinking 格式】說明你的分析框架選擇與資料來源。`,

  ad_copy: `
【publishable_content 格式】廣告文案：

## Google 搜尋廣告
標題1（30字內）：
標題2（30字內）：
標題3（30字內）：
描述1（90字內）：
描述2（90字內）：

## Facebook/Instagram 廣告
主標題（25字內）：
主文（125字內）：
描述（30字內）：
CTA 按鈕：

## A/B 測試版本
版本A（情感訴求）：[文案]
版本B（理性訴求）：[文案]
版本C（限時優惠）：[文案]

【thinking 格式】說明你的文案策略：USP 選擇、情感觸發點、CTA 設計邏輯。`,

  strategy: `
【publishable_content 格式】行銷策略報告：

## 策略摘要
[3-5句核心策略方向]

## 市場分析（3C）
**消費者（Consumer）：** [洞察]
**競爭者（Competitor）：** [分析]
**公司（Company）：** [優劣勢]

## 策略目標
| 目標 | KPI | 時程 | 負責人 |
|------|-----|------|--------|
| ... | ... | ... | ... |

## 短中長期策略方向
**短期（1-3個月）：** [具體行動]
**中期（3-6個月）：** [具體行動]
**長期（6-12個月）：** [具體行動]

## 預算配置建議
[各渠道預算比例]

## 預期成效
[量化指標]

【thinking 格式】說明你的策略框架選擇與優先順序判斷邏輯。`,

  video_script: `
【publishable_content 格式】短影音腳本：

## 腳本主體
| 時間點 | 畫面 | 旁白/字幕 | 音效/音樂 |
|--------|------|-----------|-----------|
| 0-3秒 | ... | ... | ... |
| 3-10秒 | ... | ... | ... |
| 10-20秒 | ... | ... | ... |
| 20-30秒 | ... | ... | ... |

## 製作備注
- 視覺風格：
- 字幕設計：
- 配樂建議：
- 拍攝重點：

## 備用版本
版本B：[不同角度或風格]

【thinking 格式】說明你的腳本策略：前3秒留人設計、情感弧線、平台演算法考量。`,
};

// 根據任務標題/描述推斷任務類型
function inferTaskType(title: string, description?: string | null, explicitType?: string | null): string {
  if (explicitType && OUTPUT_FORMAT_INSTRUCTIONS[explicitType]) return explicitType;
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (text.includes("新聞稿") || text.includes("press release") || text.includes("媒體稿")) return "press_release";
  if (text.includes("facebook") || text.includes("fb") || text.includes("粉絲專頁") || text.includes("臉書貼文") || text.includes("社群媒體")) return "facebook_post";
  if (text.includes("instagram") || text.includes("ig") || text.includes("限時動態")) return "instagram_post";
  if (text.includes("a/b") || text.includes("ab測試") || text.includes("分流測試")) return "ab_test";
  if (text.includes("競品") || text.includes("競爭對手") || text.includes("市場分析")) return "competitor_analysis";
  if (text.includes("廣告文案") || text.includes("ad copy") || text.includes("廣告素材")) return "ad_copy";
  if (text.includes("策略") || text.includes("strategy") || text.includes("規劃")) return "strategy";
  if (text.includes("腳本") || text.includes("短影音") || text.includes("reels") || text.includes("tiktok")) return "video_script";
  return "general";
}

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  "wang-short-video": `你是王品好，短影音策略師，曾任職 TikTok 台灣和 YouTube 亞太區。
你的專業：短影音腳本撰寫（TikTok、Reels、YouTube Shorts）、病毒式傳播策略、影片 SEO 與演算法優化、跨平台內容再利用。`,

  "wu-strategy": `你是吳思遠，品牌策略師，曾任職 Ogilvy 和 Kantar。
你的專業：品牌定位與差異化策略、消費者洞察與市場研究、整合行銷傳播（IMC）規劃、品牌資產管理。`,

  "li-copywriter": `你是李文心，文案創意總監，曾任職 Leo Burnett 和 BBDO。
你的專業：廣告文案創作（平面、數位、影音）、品牌故事敘述、社群媒體內容策略、A/B 測試文案優化。`,

  "zhang-pr": `你是張媛媛，公關策略師，曾任職 Edelman 和 Weber Shandwick。
你的專業：新聞稿撰寫與優化、媒體關係管理、危機公關處理、品牌故事包裝。`,

  "lin-training": `你是林教練，行銷培訓師，曾任職 Google 和 Meta 台灣。
你的專業：數位行銷培訓課程設計、廣告投放實戰教學、行銷團隊能力提升、行銷工具與技術應用。`,
};

const DEFAULT_SYSTEM_PROMPT = `你是一位專業的 AI 行銷顧問，擁有豐富的數位行銷經驗。`;

// ── JSON output schema ────────────────────────────────────────────────────────
const JSON_OUTPUT_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "task_output",
    strict: true,
    schema: {
      type: "object",
      properties: {
        thinking: {
          type: "string",
          description: "你的策略思考過程：分析任務需求、選擇的方法論、關鍵決策點。這是給用戶看的專業說明，不會出現在發布內容中。用繁體中文，2-4段，每段3-5句。"
        },
        publishable_content: {
          type: "string",
          description: "可直接發布或使用的產出內容。依任務類型輸出對應格式（貼文、報告、腳本等）。這個欄位的內容用戶可以直接複製發布，不要包含任何思考過程或說明文字。"
        },
        image_suggestion: {
          type: "string",
          description: "配圖或視覺方向建議（可選）。具體描述圖片風格、構圖、色調。"
        },
        content_type: {
          type: "string",
          description: "產出類型，必須是以下之一：facebook_post / instagram_post / press_release / ab_test / competitor_analysis / ad_copy / strategy / video_script / general"
        }
      },
      required: ["thinking", "publishable_content", "content_type"],
      additionalProperties: false
    }
  }
};

// ── Main execution function ───────────────────────────────────────────────────

export async function executeTask(taskId: number, userId: number, brandId?: number): Promise<{
  executionId: number;
  success: boolean;
  output?: string;
  error?: string;
  triggeredWorkflows?: { triggered: boolean; workflows: Array<{ workflowId: number; workflowName: string; createdTaskIds: number[]; createdTaskCount: number }>; totalCreatedTasks: number };
}> {
  const db = await getDb();
  if (!db) return { executionId: 0, success: false, error: "Database not available" };

  // 1. Load task + agent info
  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      taskType: tasks.taskType,
      agentId: tasks.agentId,
      agentSlug: agents.slug,
      agentName: agents.name,
      agentTitle: agents.title,
      agentBio: agents.bio,
      agentSpecialty: agents.specialty,
      agentIndustries: agents.industries,
      agentExperience: agents.experienceDetail,
    })
    .from(tasks)
    .leftJoin(agents, eq(tasks.agentId, agents.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  const task = taskRows[0];
  if (!task) return { executionId: 0, success: false, error: "Task not found" };

  // 1b. If this is a forwarded task, load parent task's output
  let parentTaskOutput = "";
  let parentTaskTitle = "";
  try {
    const parentIdRows = await db
      .select({ parentTaskId: tasks.parentTaskId, forwardNote: tasks.forwardNote })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    const parentTaskId = parentIdRows[0]?.parentTaskId;
    const forwardNote = parentIdRows[0]?.forwardNote;
    if (parentTaskId) {
      const parentRows = await db
        .select({ title: tasks.title, result: tasks.result })
        .from(tasks)
        .where(eq(tasks.id, parentTaskId))
        .limit(1);
      if (parentRows[0]) {
        parentTaskTitle = parentRows[0].title;
        const rawParentOutput = parentRows[0].result ?? "";
        // Try to extract publishable_content from JSON output
        try {
          const parsed = JSON.parse(rawParentOutput);
          parentTaskOutput = parsed.publishable_content ?? rawParentOutput;
        } catch {
          parentTaskOutput = rawParentOutput;
        }
        if (parentTaskOutput.length > 3000) {
          parentTaskOutput = parentTaskOutput.slice(0, 3000) + "...（摘錄）";
        }
      }
    }
  } catch {
    // Parent task lookup is optional
  }

  // 2. Load subscription plan for this agent (determines learning privacy)
  let subscriptionPlan: "per_task" | "monthly" | "team" = "per_task";
  try {
    const subRows = await db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.agentId, task.agentId ?? 0),
          eq(subscriptions.status, "active")
        )
      )
      .limit(1);
    if (subRows[0]?.plan) subscriptionPlan = subRows[0].plan;
  } catch {
    // Default to per_task if subscription lookup fails
  }

  // 2b + 3. Load brand context (merged: brandId takes priority, fallback to isDefault)
  let brandContext = "";
  let brandContextObj: Record<string, unknown> | null = null;
  try {
    const brandRows = await db
      .select({
        name: brands.name,
        description: brands.description,
        tagline: brands.tagline,
        targetAudience: brands.targetAudience,
        brandVoice: brands.brandVoice,
      })
      .from(brands)
      .where(
        brandId
          ? and(eq(brands.userId, userId), eq(brands.id, brandId))
          : and(eq(brands.userId, userId), eq(brands.isDefault, true))
      )
      .limit(1);
    const brand = brandRows[0];
    if (brand) {
      brandContext = `\n\n【品牌背景（請在所有產出中貫徹此品牌定位）】
品牌名稱：${brand.name}
品牌描述：${brand.description ?? ""}
品牌標語：${brand.tagline ?? ""}
目標受眾：${brand.targetAudience ?? ""}
品牌語調：${brand.brandVoice ?? ""}`;
      brandContextObj = brand as Record<string, unknown>;
    }
  } catch {
    // Brand context is optional; continue without it
  }

  // 2c. Inject relevant historical learnings for this agent
  let learningContext = "";
  try {
    const learnings = await getRelevantLearnings(
      task.agentId ?? 0,
      brandId ?? null,
      subscriptionPlan,
      5
    );
    learningContext = formatLearningsForPrompt(learnings);
  } catch {
    // Learning context is optional; continue without it
  }

  // 2d. Agent Memories: Inject user-defined training memories for this agent
  let memoriesContext = "";
  try {
    const memRows = await db
      .select()
      .from(agentMemories)
      .where(
        and(
          eq(agentMemories.userId, userId),
          eq(agentMemories.agentSlug, task.agentSlug ?? ""),
          ...(brandId ? [eq(agentMemories.brandId, brandId)] : []),
          eq(agentMemories.isActive, true)
        )
      )
      .orderBy(agentMemories.createdAt)
      .limit(20);

    if (memRows.length > 0) {
      const memByType: Record<string, string[]> = {};
      for (const mem of memRows) {
        const t = mem.memoryType ?? "other";
        if (!memByType[t]) memByType[t] = [];
        memByType[t].push(mem.content);
      }
      const parts: string[] = [];
      if (memByType.preference?.length) parts.push(`【偏好設定】\n${memByType.preference.join("\n")}`);
      if (memByType.forbidden?.length) parts.push(`【禁止事項】\n${memByType.forbidden.join("\n")}`);
      if (memByType.audience?.length) parts.push(`【目標受眾指引】\n${memByType.audience.join("\n")}`);
      if (memByType.style?.length) parts.push(`【風格指引】\n${memByType.style.join("\n")}`);
      if (memByType.other?.length) parts.push(`【其他指引】\n${memByType.other.join("\n")}`);
      if (parts.length > 0) {
        memoriesContext = `\n\n【用戶訓練指令（高優先級，必須遵守）】\n${parts.join("\n\n")}`;
      }
    }
  } catch {
    // memories context is optional
  }

  // TODO Sprint 3: Facebook Insights integration
  // Requires: brandIntegrations table + fbGraphApi.ts
  const fbInsightsContext = "";

  // 2e. RAG: Search brand knowledge base for relevant documents
  let ragContext = "";
  try {
    const query = `${task.title} ${task.description ?? ""}`;
    const chunks = await searchBrandKnowledge(query, userId, task.agentId ?? undefined, 5, brandId);
    if (chunks.length > 0) {
      ragContext = `\n\n【品牌知識庫（相關文件摘錄，請在產出中參考）】\n` +
        chunks.map((c, i) => `[文件 ${i + 1}：${c.filename}]\n${c.content.slice(0, 1000)}`).join("\n\n");
    }
  } catch {
    // RAG is optional; continue without it
  }

  // 2f. Agent Knowledge Base: Inject from sowork_db.agent_knowledge_base
  let agentKbContext = "";
  try {
    const { getAgentKnowledge } = await import("./agentMatcher");
    agentKbContext = await getAgentKnowledge(
      task.agentId ?? 0,
      ["methodology_own", "brand_client", "methodology_tool"],
      3
    );
  } catch {
    // agent knowledge is optional
  }

  // 2g. Market Intelligence: Inject real-time data from sowork_db.market_data
  let marketIntelContext = "";
  try {
    const { fetchMarketIntel, formatMarketIntelForPrompt } = await import("../../../market-intel/server/marketIntel");
    const keywords = [task.title, ...(task.description?.split(" ").slice(0, 3) ?? [])].filter(Boolean);
    const intel = await fetchMarketIntel({ keywords, limit: 5 });
    marketIntelContext = formatMarketIntelForPrompt(intel);
  } catch {
    // market intel is optional
  }

  // 3. Build system prompt
  let agentPersona = AGENT_SYSTEM_PROMPTS[task.agentSlug ?? ""] ?? "";
  if (!agentPersona && task.agentName) {
    agentPersona = `你是 ${task.agentName}，${task.agentTitle ?? "AI 行銷專家"}。
【你的背景與專業】
${task.agentBio ?? ""}
【你的工作經歷與知識庫】
${task.agentExperience ?? ""}
【你的核心專長】
${task.agentSpecialty ?? ""}
【你服務的產業】
${task.agentIndustries ?? ""}`;
  }
  if (!agentPersona) agentPersona = DEFAULT_SYSTEM_PROMPT;

  // Build methodology injection based on agent's specialty and knowledge sources
  const methodologyInstruction = task.agentSpecialty
    ? `\n\n【你的個人方法論（必須在產出中明確體現）】\n你的核心專長是：${task.agentSpecialty}\n你的知識庫來源：${Array.isArray(task.agentIndustries) ? '' : ''}${task.agentBio ?? ''}\n\n在本次任務的 publishable_content 中，你必須：\n- 使用你專業背景特有的分析框架和術語\n- 引用你知識庫中的具體方法論（不是泛用行銷框架）\n- 讓產出的結構和視角明顯反映你的專業背景\n- 例如：若你是 META 廣告策略 PM，競品分析必須包含各競品的廣告投放策略對比；若你是短影音策略 PM，活動企劃必須包含短影音傳播設計`
    : '';

  const systemPrompt = `${agentPersona}${methodologyInstruction}

【絕對禁止規則（違反將導致產出無效）】
- 嚴格禁止：在 thinking 或 publishable_content 中以任何問候語開場（禁止「你好」「大家好」「我是」「很高興」「各位好」等）
- 預設禁止：在 publishable_content 或 thinking 中使用任何 Emoji。例外：如果任務說明中明確要求使用 Emoji（例如「Facebook 貧文需含 Emoji」「請加入表情符號」），則可在 publishable_content 中適度使用，但 thinking 中一律禁止 Emoji
- 嚴格禁止：publishable_content 的內容是 JSON 格式或程式碼區塊（publishable_content 必須是純 Markdown 文字，可直接複製發布）
- 嚴格禁止：在 publishable_content 中包含思考過程、自我介紹、任務說明

【重要輸出規則】
1. 以繁體中文回應
2. 輸出 JSON 格式，包含 thinking、publishable_content、image_suggestion（可選）、content_type
3. thinking：直接從分析框架或核心論點開始，說明你如何分析這個任務、選擇的方法論、關鍵決策點。不得以問候語或自我介紹開場。
4. publishable_content：直接從標題或核心內容開始，不得包含任何思考過程、問候語、自我介紹、JSON 格式。用戶可以直接複製這個欄位的內容發布。
5. 根據任務類型，publishable_content 要有對應的格式結構`;

  // 4. Determine task type and output format
  const taskType = inferTaskType(task.title, task.description, task.taskType);
  const outputFormatInstruction = OUTPUT_FORMAT_INSTRUCTIONS[taskType] ?? `
【publishable_content 格式】直接輸出完整的行銷產出內容，依任務需求決定格式。
【thinking 格式】說明你的策略思考與方法論選擇。`;

  // 5. Build user prompt
  // If this is a forwarded task, inject parent task output as context
  const parentTaskContext = parentTaskOutput
    ? `\n\n【上游任務產出（請以此為基礎繼續執行）】\n來源任務：${parentTaskTitle}\n---\n${parentTaskOutput}\n---`
    : "";

  const userPrompt = `【任務需求】
任務標題：${task.title}
${task.description ? `任務說明：${task.description}` : ""}
${brandContext}${memoriesContext}${fbInsightsContext}${ragContext}${agentKbContext}${marketIntelContext}${learningContext}${parentTaskContext}

${outputFormatInstruction}

請以 JSON 格式輸出，包含 thinking（策略思考）和 publishable_content（可發布產出）。`;

  // 5b. Fetch user's API key for billing context
  const apiKeyRows = await db
    .select({ apiKey: userApiKeys.apiKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.isActive, true)))
    .limit(1)
    .catch(() => []);
  const billingApiKey = apiKeyRows[0]?.apiKey ?? `internal-${userId}`;

  // 6. Create execution record (status: running)
  const insertResult = await db.insert(taskExecutions).values({
    taskId,
    userId,
    agentId: task.agentId,
    status: "running",
    prompt: userPrompt,
    startedAt: new Date(),
  });
  const executionId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? 0;

  // Update task status to in_progress
  await db
    .update(tasks)
    .set({ status: "in_progress" })
    .where(eq(tasks.id, taskId));

  const startTime = Date.now();

  try {
    // 7. Call LLM with structured JSON output (billing-aware)
    const billingResult = await invokeLLMWithBilling({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: JSON_OUTPUT_SCHEMA,
      provider: "forge",
      model: "gemini-2.5-flash",
      userId,
      userApiKey: billingApiKey,
      taskId,
      agentId: task.agentId ?? undefined,
      actionType: "manual_task",
    });
    const response = billingResult.response;

    const rawContent = response.choices?.[0]?.message?.content;
    let output: string;
    let structuredOutput: {
      thinking?: string;
      publishable_content?: string;
      image_suggestion?: string;
      content_type?: string;
    } | null = null;

    if (typeof rawContent === "string") {
      try {
        structuredOutput = JSON.parse(rawContent);
        // Detect and fix double-JSON: if publishable_content is itself a JSON string or code block
        if (structuredOutput && typeof structuredOutput.publishable_content === 'string') {
          const pc = structuredOutput.publishable_content.trim();
          // Case 1: publishable_content is a raw JSON string
          if (pc.startsWith('{') && pc.endsWith('}')) {
            try {
              const inner = JSON.parse(pc);
              if (inner.publishable_content) {
                structuredOutput.publishable_content = inner.publishable_content;
                if (!structuredOutput.thinking || structuredOutput.thinking === '（解析失敗）') {
                  structuredOutput.thinking = inner.thinking ?? structuredOutput.thinking;
                }
              }
            } catch { /* not valid JSON, keep as-is */ }
          }
          // Case 2: publishable_content is a ```json code block
          const jsonBlockMatch = pc.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/m);
          if (jsonBlockMatch) {
            try {
              const inner = JSON.parse(jsonBlockMatch[1]);
              if (inner.publishable_content) {
                structuredOutput.publishable_content = inner.publishable_content;
                if (!structuredOutput.thinking || structuredOutput.thinking === '（解析失敗）') {
                  structuredOutput.thinking = inner.thinking ?? structuredOutput.thinking;
                }
              }
            } catch { /* not valid JSON, keep as-is */ }
          }
        }
        // Re-serialize the (possibly fixed) structured output
        output = JSON.stringify(structuredOutput);
      } catch {
        // Fallback: treat as plain text
        output = rawContent;
      }
    } else {
      output = "抱歉，AI 員工目前無法回應，請稍後再試。";
    }

    const durationMs = Date.now() - startTime;

    // 8. Update execution record (completed)
    await db
      .update(taskExecutions)
      .set({
        status: "completed",
        output,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(taskExecutions.id, executionId));

    // 9. Update task status to completed + save result summary
    const summaryText = structuredOutput?.publishable_content ?? output;
    const resultSummary = summaryText.length > 200
      ? summaryText.substring(0, 200).replace(/\n/g, " ").trim() + "..."
      : summaryText;

    await db
      .update(tasks)
      .set({
        status: "completed",
        result: resultSummary,
        completedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // 10. Save learning record (async, non-blocking)
    const publishableContent = structuredOutput?.publishable_content ?? output;
    saveLearning({
      agentId: task.agentId ?? 0,
      userId,
      brandId: brandId ?? null,
      taskId,
      subscriptionPlan,
      taskTitle: task.title,
      taskDescription: task.description ?? null,
      taskType: taskType,
      outputSummary: publishableContent.slice(0, 600),
      fullOutput: publishableContent,
      brandContext: brandContextObj,
    }).catch((e) => console.error("[Learning] Failed to save learning:", e));

    // 11. Auto-trigger matching workflows (async, non-blocking)
    const agentSlugForTrigger = task.agentSlug ?? "";
    const workflowTriggerResult = await triggerWorkflowsForTask(
      taskId,
      agentSlugForTrigger,
      userId,
      brandId
    ).catch((e) => {
      console.error("[triggerWorkflows] Error:", e);
      return { triggered: false, workflows: [], totalCreatedTasks: 0 };
    });

    // 11b. Save workflow trigger result to task record
    if (workflowTriggerResult.triggered) {
      await db
        .update(tasks)
        .set({ triggeredWorkflows: workflowTriggerResult })
        .where(eq(tasks.id, taskId))
        .catch((e) => console.error("[triggerWorkflows] Failed to save result:", e));
    }

    // 11c. Milestone check: notify owner when agent reaches 10/20/50 completed tasks
    try {
      const completedCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.agentId, task.agentId ?? 0),
            eq(tasks.status, "completed")
          )
        );
      const count = Number(completedCount[0]?.count ?? 0);
      const milestones = [10, 20, 50, 100];
      if (milestones.includes(count)) {
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `🎉 ${task.agentName ?? "AI 員工"} 達成里程碑！`,
          content: `${task.agentName ?? "AI 員工"} 已為你完成第 ${count} 個任務！持續訓練他，讓他更了解你的品牌。`,
        }).catch(() => {});
      }
    } catch {
      // milestone check is optional
    }

    // 11d. Notify owner: task completed (every time, not just milestones)
    try {
      const { notifyOwner } = await import("./_core/notification");
      const agentDisplayName = task.agentName ?? "AI 員工";
      const rawOutput = structuredOutput?.publishable_content ?? output;
      const outputPreview = rawOutput
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 400);
      const previewSuffix = rawOutput.length > 400 ? "\n\n...（點擊任務頁查看完整產出）" : "";
      const workflowLine = workflowTriggerResult.triggered
        ? `\n\n🔄 自動觸發 ${workflowTriggerResult.totalCreatedTasks} 個下游工作流程任務。`
        : "";
      const durationSec = Math.round(durationMs / 1000);
      await notifyOwner({
        title: `✅ ${agentDisplayName} 完成任務：${task.title}`,
        content: `**員工**：${agentDisplayName}\n**任務**：${task.title}\n**耗時**：${durationSec} 秒\n\n---\n\n**產出摘要**：\n${outputPreview}${previewSuffix}${workflowLine}`,
      }).catch(() => {});
    } catch {
      // owner notification is optional, never block task completion
    }

    // 12. Notify user: task completed
    const workflowNotice = workflowTriggerResult.triggered
      ? ` 已自動建立 ${workflowTriggerResult.totalCreatedTasks} 個下游任務。`
      : "";
    notifyUser({
      userId,
      type: "task_completed",
      title: `任務完成：${task.title}`,
      body: `${task.agentName ?? "AI 員工"}已完成任務，點擊查看產出結果。${workflowNotice}`,
      taskId,
      agentId: task.agentId,
    }).catch((e) => console.error("[notifyUser] completed error:", e));
    return { executionId, success: true, output, triggeredWorkflows: workflowTriggerResult };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    await db
      .update(taskExecutions)
      .set({
        status: "failed",
        errorMessage,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(taskExecutions.id, executionId));

    await db
      .update(tasks)
      .set({ status: "pending" })
      .where(eq(tasks.id, taskId));

    console.error(`[executeTask] Task ${taskId} failed:`, err);

    notifyUser({
      userId,
      type: "task_failed",
      title: `任務失敗：${task.title}`,
      body: `任務執行時發生錯誤，請重試。`,
      taskId,
      agentId: task.agentId,
    }).catch((e) => console.error("[notifyUser] failed error:", e));

    return { executionId, success: false, error: errorMessage };
  }
}

// ── Get latest execution for a task ──────────────────────────────────────────
export async function getLatestExecution(taskId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(taskExecutions)
    .where(and(eq(taskExecutions.taskId, taskId), eq(taskExecutions.userId, userId)))
    .orderBy(desc(taskExecutions.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

// ── Get all executions for a task ─────────────────────────────────────────────
export async function getTaskExecutions(taskId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(taskExecutions)
    .where(and(eq(taskExecutions.taskId, taskId), eq(taskExecutions.userId, userId)))
    .orderBy(desc(taskExecutions.createdAt));
}

// ── Parse structured output from execution ───────────────────────────────────
export function parseTaskOutput(rawOutput: string): {
  thinking: string;
  publishable_content: string;
  image_suggestion?: string;
  content_type: string;
  isStructured: boolean;
} {
  try {
    const parsed = JSON.parse(rawOutput);
    if (parsed.thinking && parsed.publishable_content) {
      return {
        thinking: parsed.thinking,
        publishable_content: parsed.publishable_content,
        image_suggestion: parsed.image_suggestion,
        content_type: parsed.content_type ?? "general",
        isStructured: true,
      };
    }
  } catch {
    // Not JSON
  }
  // Fallback for old plain text outputs
  return {
    thinking: "",
    publishable_content: rawOutput,
    content_type: "general",
    isStructured: false,
  };
}
