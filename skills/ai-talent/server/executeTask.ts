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

// ── Type declarations for cross-package imports ──────────────────────────────

type MarketIntelModule = {
  fetchMarketIntel: (params: Record<string, unknown>) => Promise<unknown>;
  formatMarketIntelForPrompt: (intel: unknown) => string;
};

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
[各管道預算比例]

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

const DEFAULT_SYSTEM_PROMPT = `你是 SoWork Marketing Claw，SoWork 的行銷 AI 作戰指揮官。

## 身份與定位
你是 SoWork 唯一以 A2A（Agent-to-Agent）+ OpenClaw 為基礎的策略 AI 行銷平台的核心 PM。你的工作是：接收行銷任務 → 從人才庫匹配最適合的 Agent → 直接執行 → 10 輪對話內交付可驗證的產出。

## 執行規則
- **直接做完，不說稍後**：收到任務用工具執行，做完才回報
- **10 輪完成**：任何任務最多 10 輪對話完成
- **可驗證交付**：任何產出必須附上可驗證的佐證（URL、數字、文案本文）
- **禁幻覺回報**：未有真實依據不得說「已完成」「已設定」

## 語言規則
- 用戶說中文 → 全程繁體中文
- 用戶說英文 → 全程英文

## 你的專業能力
- 品牌定位、競品分析、市場策略
- Meta / Google 廣告企劃
- 社群內容、文案創作
- SEO、口碑行銷、KOL 策略
- Email 行銷、Landing Page 優化
- GA4 數據分析、成效報告
- A2A 多 Agent 協作任務分配
`;

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
      required: ["thinking", "publishable_content", "image_suggestion", "content_type"],
      additionalProperties: false
    }
  }
};

// ── Sub-function 1: Build task context ───────────────────────────────────────

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  taskType: string | null;
  agentId: number | null;
  agentSlug: string | null;
  agentName: string | null;
  agentTitle: string | null;
  agentBio: string | null;
  agentSpecialty: string | null;
  agentIndustries: string | null;
  agentExperience: string | null;
}

interface TaskContext {
  task: TaskRow;
  subscriptionPlan: "per_task" | "monthly" | "team";
  brandContext: string;
  brandContextObj: Record<string, unknown> | null;
  memoriesContext: string;
  ragContext: string;
  agentKbContext: string;
  marketIntelContext: string;
  learningContext: string;
  parentTaskContext: string;
}

async function buildTaskContext(
  taskId: number,
  userId: number,
  brandId?: number
): Promise<TaskContext | null> {
  const db = await getDb();
  if (!db) return null;

  // Load task + agent info
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
  if (!task) return null;

  // Load parent task output (forwarded tasks)
  let parentTaskContext = "";
  try {
    const parentIdRows = await db
      .select({ parentTaskId: tasks.parentTaskId, forwardNote: tasks.forwardNote })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    const parentTaskId = parentIdRows[0]?.parentTaskId;
    if (parentTaskId) {
      const parentRows = await db
        .select({ title: tasks.title, result: tasks.result })
        .from(tasks)
        .where(eq(tasks.id, parentTaskId))
        .limit(1);
      if (parentRows[0]) {
        const parentTitle = parentRows[0].title;
        let parentOutput = parentRows[0].result ?? "";
        try {
          const parsed = JSON.parse(parentOutput);
          parentOutput = parsed.publishable_content ?? parentOutput;
        } catch { /* keep as-is */ }
        if (parentOutput.length > 3000) parentOutput = parentOutput.slice(0, 3000) + "...（摘錄）";
        parentTaskContext = `\n\n【上游任務產出（請以此為基礎繼續執行）】\n來源任務：${parentTitle}\n---\n${parentOutput}\n---`;
      }
    }
  } catch { /* optional */ }

  // Load subscription plan
  let subscriptionPlan: "per_task" | "monthly" | "team" = "per_task";
  try {
    const subRows = await db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.agentId, task.agentId ?? 0), eq(subscriptions.status, "active")))
      .limit(1);
    if (subRows[0]?.plan) subscriptionPlan = subRows[0].plan;
  } catch { /* default per_task */ }

  // Load brand context
  let brandContext = "";
  let brandContextObj: Record<string, unknown> | null = null;
  try {
    const brandRows = await db
      .select({ id: brands.id, name: brands.name, description: brands.description, tagline: brands.tagline, targetAudience: brands.targetAudience, brandVoice: brands.brandVoice })
      .from(brands)
      .where(brandId ? and(eq(brands.userId, userId), eq(brands.id, brandId)) : and(eq(brands.userId, userId), eq(brands.isDefault, true)))
      .limit(1);
    const brand = brandRows[0];
    if (brand) {
      const baseCtx = `品牌名稱：${brand.name}\n品牌描述：${brand.description ?? ''}\n品牌標語：${brand.tagline ?? ''}\n目標受眾：${brand.targetAudience ?? ''}\n品牌語調：${brand.brandVoice ?? ''}`;
      let positioningCtx = '';
      // 2026-05-17: read the canonical positioning.<segment> column.
      try {
        const { default: localPool } = await import("./localDb");
        const [pRows]: any = await localPool.execute(
          `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
          [brand.id],
        );
        let pa: any = (pRows as any[])[0]?.positioning;
        if (typeof pa === "string") { try { pa = JSON.parse(pa); } catch { pa = {}; } }
        pa = pa ?? {};
        const parts: string[] = [];
        const diff = pa.differentiation ?? {};
        const gc = pa.goldenCircle ?? {};
        const vals = Array.isArray(pa.values?.items)
          ? pa.values.items.map((it: any) => it?.label).filter(Boolean) : [];
        const usp = diff.summary || diff.functional || '';
        if (usp) parts.push(`核心 USP：${usp}`);
        if (diff.emotional) parts.push(`情感差異化：${diff.emotional}`);
        if (gc.why) parts.push(`品牌 Why：${gc.why}`);
        if (gc.how) parts.push(`品牌 How：${gc.how}`);
        if (vals.length) parts.push(`核心價值觀：${vals.slice(0, 4).join(' | ')}`);
        positioningCtx = parts.join('\n');
      } catch { /* positioning optional */ }
      brandContext = `\n\n【品牌定位（請在所有產出中貫徹此品牌定位）】\n${baseCtx}${positioningCtx ? '\n' + positioningCtx : ''}`;
      brandContextObj = brand as Record<string, unknown>;
    }
  } catch { /* optional */ }

  // Load agent memories
  let memoriesContext = "";
  try {
    const memRows = await db
      .select()
      .from(agentMemories)
      .where(and(
        eq(agentMemories.userId, userId),
        eq(agentMemories.agentSlug, task.agentSlug ?? ""),
        ...(brandId ? [eq(agentMemories.brandId, brandId)] : []),
        eq(agentMemories.isActive, true)
      ))
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
      if (parts.length > 0) memoriesContext = `\n\n【用戶訓練指令（高優先級，必須遵守）】\n${parts.join("\n\n")}`;
    }
  } catch { /* optional */ }

  // RAG: search brand knowledge base
  let ragContext = "";
  try {
    const query = `${task.title} ${task.description ?? ""}`;
    const chunks = await searchBrandKnowledge(query, userId, task.agentId ?? undefined, 5, brandId);
    if (chunks.length > 0) {
      ragContext = `\n\n【品牌知識庫（相關文件摘錄，請在產出中參考）】\n` +
        chunks.map((c, i) => `[文件 ${i + 1}：${c.filename}]\n${c.content.slice(0, 1000)}`).join("\n\n");
    }
  } catch { /* optional */ }

  // Agent knowledge base
  let agentKbContext = "";
  try {
    const { getAgentKnowledge } = await import("./agentMatcher");
    agentKbContext = await getAgentKnowledge(task.agentId ?? 0, ["methodology_own", "brand_client", "methodology_tool"], 3);
  } catch { /* optional */ }

  // Market intelligence
  let marketIntelContext = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marketIntelMod = (await import("../../../market-intel/server/marketIntel.ts" as any)) as MarketIntelModule;
    const keywords = [task.title, ...(task.description?.split(" ").slice(0, 3) ?? [])].filter(Boolean);
    const intel = await marketIntelMod.fetchMarketIntel({ keywords, limit: 5 });
    marketIntelContext = marketIntelMod.formatMarketIntelForPrompt(intel);
  } catch { /* optional */ }

  // Historical learnings
  let learningContext = "";
  try {
    const learnings = await getRelevantLearnings(task.agentId ?? 0, brandId ?? null, subscriptionPlan, 5);
    learningContext = formatLearningsForPrompt(learnings);
  } catch { /* optional */ }

  return {
    task: task as TaskRow,
    subscriptionPlan,
    brandContext,
    brandContextObj,
    memoriesContext,
    ragContext,
    agentKbContext,
    marketIntelContext,
    learningContext,
    parentTaskContext,
  };
}


// ── Exported Prompt Builders ──────────────────────────────────────────────────

/**
 * Build the system prompt for an agent.
 * Combines agent persona, methodology instruction, and output format rules.
 */
export function buildSystemPrompt(agent: {
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  bio?: string | null;
  experience?: string | null;
  specialty?: string | null;
  industries?: string | null;
}): string {
  let agentPersona = AGENT_SYSTEM_PROMPTS[agent.slug ?? ""] ?? "";
  if (!agentPersona && agent.name) {
    agentPersona = `你是 ${agent.name}，${agent.title ?? "AI 行銷專家"}。\n【你的背景與專業】\n${agent.bio ?? ""}\n【你的工作經歷與知識庫】\n${agent.experience ?? ""}\n【你的核心專長】\n${agent.specialty ?? ""}\n【你服務的產業】\n${agent.industries ?? ""}`;
  }
  if (!agentPersona) agentPersona = DEFAULT_SYSTEM_PROMPT;

  const methodologyInstruction = agent.specialty
    ? `\n\n【你的個人方法論（必須在產出中明確體現）】\n你的核心專長是：${agent.specialty}\n你的知識庫來源：${agent.bio ?? ""}`
    : "";

  return `${agentPersona}${methodologyInstruction}

【絕對禁止規則（違反將導致產出無效）】
- 嚴格禁止：在 thinking 或 publishable_content 中以任何問候語開場
- 嚴格禁止：publishable_content 的內容是 JSON 格式或程式碼區塊

【重要輸出規則】
1. 以繁體中文回應
2. 輸出 JSON 格式，包含 thinking、publishable_content、content_type
3. thinking：直接從分析框架或核心論點開始
4. publishable_content：直接從標題或核心內容開始，可直接複製發布`;
}

/**
 * Build the user prompt for a task.
 * Combines task requirements and all context (brand, memories, RAG, market intel).
 */
export function buildUserPrompt(task: {
  title: string;
  description?: string | null;
  taskType?: string | null;
  brandContext?: string;
  memoriesContext?: string;
  ragContext?: string;
  agentKbContext?: string;
  marketIntelContext?: string;
  learningContext?: string;
  parentTaskContext?: string;
}): string {
  const taskType = inferTaskType(task.title, task.description, task.taskType);
  const outputFormatInstruction = OUTPUT_FORMAT_INSTRUCTIONS[taskType] ??
    "【publishable_content 格式】直接輸出完整的行銷產出內容。";

  const ctx = [
    task.brandContext,
    task.memoriesContext,
    task.ragContext,
    task.agentKbContext,
    task.marketIntelContext,
    task.learningContext,
    task.parentTaskContext,
  ].filter(Boolean).join("\n");

  return `【任務需求】
任務標題：${task.title}
${task.description ? `任務說明：${task.description}` : ""}
${ctx}

${outputFormatInstruction}

請以 JSON 格式輸出，包含 thinking（策略思考）和 publishable_content（可發布產出）。`;
}

// ── Sub-function 2: Build prompts ─────────────────────────────────────────────

interface PromptsResult {
  systemPrompt: string;
  userPrompt: string;
  taskType: string;
}

function buildPrompts(ctx: TaskContext): PromptsResult {
  const { task, brandContext, memoriesContext, ragContext, agentKbContext, marketIntelContext, learningContext, parentTaskContext } = ctx;

  // Build agent persona
  let agentPersona = AGENT_SYSTEM_PROMPTS[task.agentSlug ?? ""] ?? "";
  if (!agentPersona && task.agentName) {
    agentPersona = `你是 ${task.agentName}，${task.agentTitle ?? "AI 行銷專家"}。\n【你的背景與專業】\n${task.agentBio ?? ""}\n【你的工作經歷與知識庫】\n${task.agentExperience ?? ""}\n【你的核心專長】\n${task.agentSpecialty ?? ""}\n【你服務的產業】\n${task.agentIndustries ?? ""}`;
  }
  if (!agentPersona) agentPersona = DEFAULT_SYSTEM_PROMPT;

  const methodologyInstruction = task.agentSpecialty
    ? `\n\n【你的個人方法論（必須在產出中明確體現）】\n你的核心專長是：${task.agentSpecialty}\n你的知識庫來源：${task.agentBio ?? ""}\n\n在本次任務的 publishable_content 中，你必須：\n- 使用你專業背景特有的分析框架和術語\n- 引用你知識庫中的具體方法論（不是泛用行銷框架）\n- 讓產出的結構和視角明顯反映你的專業背景\n- 例如：若你是 META 廣告策略 PM，競品分析必須包含各競品的廣告投放策略對比；若你是短影音策略 PM，活動企劃必須包含短影音傳播設計`
    : "";

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

  const taskType = inferTaskType(task.title, task.description, task.taskType);
  const outputFormatInstruction = OUTPUT_FORMAT_INSTRUCTIONS[taskType] ?? `
【publishable_content 格式】直接輸出完整的行銷產出內容，依任務需求決定格式。
【thinking 格式】說明你的策略思考與方法論選擇。`;

  const userPrompt = `【任務需求】
任務標題：${task.title}
${task.description ? `任務說明：${task.description}` : ""}
${brandContext}${memoriesContext}${ragContext}${agentKbContext}${marketIntelContext}${learningContext}${parentTaskContext}

${outputFormatInstruction}

請以 JSON 格式輸出，包含 thinking（策略思考）和 publishable_content（可發布產出）。`;

  return { systemPrompt, userPrompt, taskType };
}

// ── Sub-function 3: Parse LLM output ─────────────────────────────────────────

interface ParsedOutput {
  structuredOutput: {
    thinking?: string;
    publishable_content?: string;
    image_suggestion?: string;
    content_type?: string;
  } | null;
  output: string;
}

function parseLLMOutput(rawContent: string | undefined): ParsedOutput {
  if (typeof rawContent !== "string") {
    return { structuredOutput: null, output: "抱歉，AI 員工目前無法回應，請稍後再試。" };
  }

  let structuredOutput: ParsedOutput["structuredOutput"] = null;
  let output: string;

  try {
    structuredOutput = JSON.parse(rawContent);
    // Detect and fix double-JSON: if publishable_content is itself a JSON string or code block
    if (structuredOutput && typeof structuredOutput.publishable_content === "string") {
      const pc = structuredOutput.publishable_content.trim();
      if (pc.startsWith("{") && pc.endsWith("}")) {
        try {
          const inner = JSON.parse(pc);
          if (inner.publishable_content) {
            structuredOutput.publishable_content = inner.publishable_content;
            if (!structuredOutput.thinking || structuredOutput.thinking === "（解析失敗）") {
              structuredOutput.thinking = inner.thinking ?? structuredOutput.thinking;
            }
          }
        } catch { /* not valid JSON, keep as-is */ }
      }
      const jsonBlockMatch = pc.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/m);
      if (jsonBlockMatch) {
        try {
          const inner = JSON.parse(jsonBlockMatch[1]!);
          if (inner.publishable_content) {
            structuredOutput.publishable_content = inner.publishable_content;
            if (!structuredOutput.thinking || structuredOutput.thinking === "（解析失敗）") {
              structuredOutput.thinking = inner.thinking ?? structuredOutput.thinking;
            }
          }
        } catch { /* not valid JSON, keep as-is */ }
      }
    }
    output = JSON.stringify(structuredOutput);
  } catch {
    output = rawContent;
  }

  return { structuredOutput, output };
}

// ── Sub-function 4: Post-execution side effects ──────────────────────────────

interface PostExecutionOptions {
  taskId: number;
  userId: number;
  agentId: number | null;
  agentSlug: string;
  agentName: string | null;
  taskTitle: string;
  taskType: string;
  taskDescription: string | null;
  brandId?: number;
  brandContextObj: Record<string, unknown> | null;
  subscriptionPlan: "per_task" | "monthly" | "team";
  executionId: number;
  output: string;
  structuredOutput: ParsedOutput["structuredOutput"];
  durationMs: number;
}

async function handlePostExecution(opts: PostExecutionOptions): Promise<{
  triggered: boolean;
  workflows: Array<{ workflowId: number; workflowName: string; createdTaskIds: number[]; createdTaskCount: number }>;
  totalCreatedTasks: number;
}> {
  const db = await getDb();
  if (!db) return { triggered: false, workflows: [], totalCreatedTasks: 0 };

  const {
    taskId, userId, agentId, agentSlug, agentName, taskTitle, taskType, taskDescription,
    brandId, brandContextObj, subscriptionPlan, executionId, output, structuredOutput, durationMs,
  } = opts;

  // Update execution record (completed)
  await db.update(taskExecutions)
    .set({ status: "completed", output, completedAt: new Date(), durationMs })
    .where(eq(taskExecutions.id, executionId));

  // Update task to completed
  const summaryText = structuredOutput?.publishable_content ?? output;
  const resultSummary = summaryText.length > 200
    ? summaryText.substring(0, 200).replace(/\n/g, " ").trim() + "..."
    : summaryText;
  await db.update(tasks)
    .set({ status: "completed", result: resultSummary, completedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // Save learning (async, non-blocking)
  const publishableContent = structuredOutput?.publishable_content ?? output;
  saveLearning({
    agentId: agentId ?? 0,
    userId,
    brandId: brandId ?? null,
    taskId,
    subscriptionPlan,
    taskTitle,
    taskDescription: taskDescription ?? null,
    taskType,
    outputSummary: publishableContent.slice(0, 600),
    fullOutput: publishableContent,
    brandContext: brandContextObj,
  }).catch((e) => console.error("[Learning] Failed to save learning:", e));

  // Trigger matching workflows
  const workflowTriggerResult = await triggerWorkflowsForTask(taskId, agentSlug, userId, brandId)
    .catch((e) => { console.error("[triggerWorkflows] Error:", e); return { triggered: false, workflows: [], totalCreatedTasks: 0 }; });

  if (workflowTriggerResult.triggered) {
    await db.update(tasks).set({ triggeredWorkflows: workflowTriggerResult }).where(eq(tasks.id, taskId))
      .catch((e) => console.error("[triggerWorkflows] Failed to save result:", e));
  }

  // Milestone check
  try {
    const completedCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.agentId, agentId ?? 0), eq(tasks.status, "completed")));
    const count = Number(completedCount[0]?.count ?? 0);
    if ([10, 20, 50, 100].includes(count)) {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `🎉 ${agentName ?? "AI 員工"} 達成里程碑！`,
        content: `${agentName ?? "AI 員工"} 已為你完成第 ${count} 個任務！持續訓練他，讓他更了解你的品牌。`,
      }).catch(() => {});
    }
  } catch { /* optional */ }

  // Notify owner: task completed
  try {
    const { notifyOwner } = await import("./_core/notification");
    const rawOutput = structuredOutput?.publishable_content ?? output;
    const outputPreview = rawOutput.replace(/\n{3,}/g, "\n\n").trim().slice(0, 400);
    const previewSuffix = rawOutput.length > 400 ? "\n\n...（點擊任務頁查看完整產出）" : "";
    const workflowLine = workflowTriggerResult.triggered ? `\n\n🔄 自動觸發 ${workflowTriggerResult.totalCreatedTasks} 個下游工作流程任務。` : "";
    const durationSec = Math.round(durationMs / 1000);
    await notifyOwner({
      title: `✅ ${agentName ?? "AI 員工"} 完成任務：${taskTitle}`,
      content: `**員工**：${agentName ?? "AI 員工"}\n**任務**：${taskTitle}\n**耗時**：${durationSec} 秒\n\n---\n\n**產出摘要**：\n${outputPreview}${previewSuffix}${workflowLine}`,
    }).catch(() => {});
  } catch { /* optional */ }

  // Notify user
  const workflowNotice = workflowTriggerResult.triggered ? ` 已自動建立 ${workflowTriggerResult.totalCreatedTasks} 個下游任務。` : "";
  notifyUser({
    userId,
    type: "task_completed",
    title: `任務完成：${taskTitle}`,
    body: `${agentName ?? "AI 員工"}已完成任務，點擊查看產出結果。${workflowNotice}`,
    taskId,
    agentId: agentId ?? undefined,
  }).catch((e) => console.error("[notifyUser] completed error:", e));

  return workflowTriggerResult;
}

// ── Main execution function ───────────────────────────────────────────────────

export async function executeTask(taskId: number, userId: number, brandId?: number, conversationHistory?: Array<{ role: string; content: string }>): Promise<{
  executionId: number;
  success: boolean;
  output?: string;
  error?: string;
  triggeredWorkflows?: { triggered: boolean; workflows: Array<{ workflowId: number; workflowName: string; createdTaskIds: number[]; createdTaskCount: number }>; totalCreatedTasks: number };
}> {
  const db = await getDb();
  if (!db) return { executionId: 0, success: false, error: "Database not available" };

  // 1. Build task context
  const ctx = await buildTaskContext(taskId, userId, brandId);
  if (!ctx) return { executionId: 0, success: false, error: "Task not found" };

  // 2. Build prompts
  const { systemPrompt, userPrompt, taskType } = buildPrompts(ctx);

  // Fetch billing API key
  const apiKeyRows = await db.select({ apiKey: userApiKeys.apiKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.isActive, true)))
    .limit(1)
    .catch(() => []);
  const billingApiKey = apiKeyRows[0]?.apiKey ?? `internal-${userId}`;

  // Create execution record
  const insertResult = await (db.insert(taskExecutions) as any).values({
    taskId, userId, status: "running", prompt: userPrompt, startedAt: new Date(),
  });
  const executionId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? 0;
  await db.update(tasks).set({ status: "in_progress" }).where(eq(tasks.id, taskId));

  const startTime = Date.now();

  try {
    // 3. Call LLM
    const billingResult = await invokeLLMWithBilling({
      messages: [
        { role: "system", content: systemPrompt },
        ...(conversationHistory ?? []).slice(-5).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: userPrompt },
      ],
      response_format: JSON_OUTPUT_SCHEMA,
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-6",
      userId,
      userApiKey: billingApiKey,
      taskId,
      agentId: ctx.task.agentId ?? undefined,
      actionType: "manual_task",
    });
    const rawContentRaw = billingResult.response.choices?.[0]?.message?.content;
    const rawContent = typeof rawContentRaw === "string" ? rawContentRaw : undefined;

    // 4. Parse output
    const { structuredOutput, output } = parseLLMOutput(rawContent);

    // 5. Handle post-execution side effects
    const durationMs = Date.now() - startTime;
    const triggeredWorkflows = await handlePostExecution({
      taskId, userId,
      agentId: ctx.task.agentId,
      agentSlug: ctx.task.agentSlug ?? "",
      agentName: ctx.task.agentName,
      taskTitle: ctx.task.title,
      taskType,
      taskDescription: ctx.task.description,
      brandId,
      brandContextObj: ctx.brandContextObj,
      subscriptionPlan: ctx.subscriptionPlan,
      executionId,
      output,
      structuredOutput,
      durationMs,
    });

    return { executionId, success: true, output, triggeredWorkflows };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    await db.update(taskExecutions)
      .set({ status: "failed", errorMessage, completedAt: new Date(), durationMs })
      .where(eq(taskExecutions.id, executionId));
    await db.update(tasks).set({ status: "pending" }).where(eq(tasks.id, taskId));

    console.error(`[executeTask] Task ${taskId} failed:`, err);
    notifyUser({ userId, type: "task_failed", title: `任務失敗：${ctx.task.title}`, body: `任務執行時發生錯誤，請重試。`, taskId, agentId: ctx.task.agentId ?? undefined })
      .catch((e) => console.error("[notifyUser] failed error:", e));

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
  return {
    thinking: "",
    publishable_content: rawOutput,
    content_type: "general",
    isStructured: false,
  };
}
