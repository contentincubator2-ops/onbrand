/**
 * agentPromptBuilder.ts
 * 為每個 squad agent 建構完整的 system prompt
 *
 * 每個 agent 在執行前必須掌握：
 *   1. 自己的身份（name, title, specialty）
 *   2. 品牌全貌（brand context）
 *   3. 工作區域（workspace 的定義與目標）
 *   4. 任務背景（mission title + objective）
 *   5. 品牌大腦（累積的品牌知識）
 *   6. 前步驟成果（本次 session 已完成的內容）
 *   7. 本步驟任務（具體要做什麼、輸出什麼）
 *
 * Prompt quality principles applied (2026-04):
 *   - Hard identity lock: "這是你唯一的身份" prevents role drift
 *   - Previous results framed as "參考文件" (documents), not conversation turns
 *   - Every behavior guide starts with language + word-count hard constraints
 *   - Forbidden opener lists address all observed failure-mode phrases
 *   - Lead intake forces specialty-specific questions, not generic PM questions
 *   - Specialist steps forced to open with ## Markdown heading to kill filler openers
 */

// ── Workspace 描述 ────────────────────────────────────────────────────────────
const WORKSPACE_DESCRIPTIONS: Record<string, string> = {
  strategy:    "品牌策略工作區 — 負責品牌定位、競品分析、受眾研究、品牌宣言等核心策略工作",
  facebook:    "Facebook 廣告工作區 — 負責 FB 廣告投放策略、文案、創意素材、受眾設定與成效優化",
  instagram:   "Instagram 內容工作區 — 負責 IG 內容策略、Reels、限時動態、品牌視覺與社群互動",
  linkedin:    "LinkedIn 行銷工作區 — 負責 B2B 內容策略、思想領袖文章、公司頁面經營與 Lead Gen",
  youtube:     "YouTube / 短影音工作區 — 負責影片內容策略、腳本撰寫、SEO 優化、短影音（Reels/Shorts/TikTok）",
  pr:          "公關工作區 — 負責新聞稿、媒體關係、KOL 合作、危機處理與品牌聲量管理",
  event:       "活動行銷工作區 — 負責體驗活動設計、活動企劃、現場執行與活動後追蹤",
  website:     "官網 / SEO 工作區 — 負責網站內容、SEO 優化、Landing Page、轉換率優化",
  monitoring:  "品牌監測工作區 — 負責社群聆聽、輿情分析、競品追蹤、品牌健康度報告",
  analytics:   "數據分析工作區 — 負責行銷數據分析、歸因模型、A/B 測試、ROI 追蹤",
  instore:     "實體零售工作區 — 負責門市體驗設計、陳列策略、購買行為分析與 OMO 整合",
};

// ── Agent 角色到品牌大腦類別的映射 ───────────────────────────────────────────
const ROLE_TO_BRAIN_CATEGORY: Record<string, string> = {
  "市場研究師": "audience",
  "競品分析師": "competitors",
  "品牌策略師": "positioning",
  "文案師":     "voice",
  "定位策略師": "positioning",
  "品類設計師": "positioning",
  "內容策略師": "voice",
  "SEO 策略師": "audience",
  "數據分析師": "analytics",
  "活動策略師": "positioning",
};

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface AgentIdentity {
  name: string;
  title: string;
  specialty?: string | null;
  aiModel?: string | null;
}

export interface BrandContext {
  name?: string;
  industry?: string;
  description?: string;
  targetAudience?: string;
  brandVoice?: string;
  tagline?: string;
  positioningSummary?: string;
  website?: string;
}

export interface WorkflowStepDef {
  step?: number;
  order?: number;
  title?: string;
  name?: string;
  description?: string;
  outputType?: string;
  output?: string;
  requiredSkills?: string[];
}

export interface SquadPromptInput {
  agent: AgentIdentity;
  brand: BrandContext;
  workspace: string;
  missionTitle: string;
  squadName: string;
  squadMethodology: string;
  agentRole: string;              // 在這個 squad 裡的角色
  workflowStep: WorkflowStepDef;  // 本步驟定義
  stepIndex: number;              // 0 = lead intake, 1+ = workflow steps
  totalSteps: number;
  previousResults: Record<number, string>; // 前步驟成果摘要
  brandBrain: Record<string, string[]>;    // 品牌大腦
  isLead: boolean;
  recentMessages?: { role: string; content: string }[];
}

// ── 主函數 ────────────────────────────────────────────────────────────────────
export function buildSquadAgentPrompt(input: SquadPromptInput): string {
  const {
    agent, brand, workspace, missionTitle, squadName, squadMethodology,
    agentRole, workflowStep, stepIndex, totalSteps,
    previousResults, brandBrain, isLead,
  } = input;

  const wsDesc = WORKSPACE_DESCRIPTIONS[workspace] ?? `${workspace} 工作區`;

  // 1. 身份宣告（必須在 prompt 最頂部，含身份鎖定語）
  const identity = buildIdentityBlock(agent, squadName, agentRole, squadMethodology);

  // 2. 工作區域
  const workspaceSection = `【工作區域】\n${wsDesc}`;

  // 3. 任務背景
  const missionSection = `【任務背景】\n任務名稱：${missionTitle}\n工作區：${workspace}`;

  // 4. 品牌全貌
  const brandSection = buildBrandSection(brand);

  // 5. 品牌大腦
  const brainSection = buildBrainSection(brandBrain);

  // 6. 前步驟成果（以「參考文件」格式呈現，防止 group chat 解讀）
  const prevSection = buildPreviousResultsSection(previousResults, totalSteps);

  // 7. 本步驟任務
  const stepSection = buildStepSection(workflowStep, stepIndex, totalSteps, isLead);

  // 8. 行為指引（語言 + 字數上限 + 禁止語 + 步驟規則）
  const behaviorGuide = buildBehaviorGuide(isLead, stepIndex, totalSteps);

  const sections = [
    identity,
    workspaceSection,
    missionSection,
    brandSection,
    brainSection,
    prevSection,
    stepSection,
    behaviorGuide,
  ].filter(s => s.trim());

  return sections.join("\n\n");
}

// ── Section builders ─────────────────────────────────────────────────────────

/**
 * 身份宣告區塊
 * 關鍵設計：
 * - "這是你唯一的身份" 鎖定 persona，防止 role drift
 * - specialty 標記為必須體現在每句輸出中的核心約束，而非事實描述
 * - 明確禁止旁白者 / 群組總結者模式
 */
function buildIdentityBlock(
  agent: AgentIdentity,
  squadName: string,
  agentRole: string,
  squadMethodology: string,
): string {
  const lines = [
    `你是 ${agent.name}，${agent.title}。這是你唯一的身份——在整個回應過程中不得切換、模糊或放棄此身份。`,
    agent.specialty
      ? `核心專長（你的每一句分析都必須從這個專業角度出發，不得說成通用行銷建議）：${agent.specialty}`
      : null,
    `你在「${squadName}」小組的角色：${agentRole}。`,
    squadMethodology ? `小組方法論：${squadMethodology}` : null,
    `嚴格禁止：不得以旁白者、協調者或「群組總結者」身份發言；不得在輸出中致謝、引用、或回應其他 Agent 的名字或輸出內容。`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildBrandSection(brand: BrandContext): string {
  if (!brand.name && !brand.description) return "";
  const lines = [
    "【品牌全貌】",
    brand.name           ? `品牌名稱：${brand.name}` : null,
    brand.industry       ? `產業：${brand.industry}` : null,
    brand.description    ? `品牌描述：${brand.description}` : null,
    brand.targetAudience ? `目標受眾：${brand.targetAudience}` : null,
    brand.tagline        ? `品牌標語：${brand.tagline}` : null,
    brand.brandVoice     ? `品牌聲音：${brand.brandVoice}` : null,
    brand.positioningSummary ? `現有定位摘要：${brand.positioningSummary}` : null,
    brand.website        ? `官網：${brand.website}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildBrainSection(brandBrain: Record<string, string[]>): string {
  const categories = Object.keys(brandBrain);
  if (categories.length === 0) return "";

  const CATEGORY_LABELS: Record<string, string> = {
    positioning: "定位",
    audience:    "目標受眾",
    voice:       "品牌聲音",
    competitors: "競品",
    custom:      "其他",
  };

  const lines = ["【品牌大腦（累積知識）】"];
  for (const cat of categories) {
    const label = CATEGORY_LABELS[cat] ?? cat;
    const entries = (brandBrain[cat] ?? []).slice(0, 3);
    lines.push(`${label}：`);
    for (const e of entries) {
      lines.push(`  · ${e.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

/**
 * 前步驟成果區塊
 * 關鍵設計：
 * - 重命名為「參考文件」而非「前步驟成果」，防止模型將其解讀為群組對話
 * - 每個條目用 --- 分隔線包裹，強化「文件」而非「訊息」的視覺語義
 * - Header 明確指示：這些是閱讀材料，不是對話對象
 * - 禁止以「根據以上」「根據 Group Chat Context」開頭的迴響行為
 */
function buildPreviousResultsSection(
  previousResults: Record<number, string>,
  totalSteps: number
): string {
  const steps = Object.keys(previousResults)
    .map(Number)
    .sort((a, b) => a - b);

  if (steps.length === 0) return "";

  const lines = [
    "【參考文件：已完成步驟的書面記錄】",
    "（以下是本 session 中其他 Agent 已產出的文件。這些是你的閱讀材料，不是對話對象。" +
    "不得致謝、引用 Agent 名稱、或以「根據以上」「根據 Group Chat Context」「根據 Squad Lead」開頭。）",
  ];

  for (const step of steps) {
    const summary = previousResults[step];
    if (summary) {
      const label = step === 0
        ? "文件 0：Squad Lead 需求確認"
        : `文件 ${step}：Step ${step} 分析輸出`;
      lines.push(`--- ${label} ---`);
      lines.push(summary.slice(0, 500));
    }
  }

  lines.push("--- 參考文件結束 ---");
  lines.push("（以上文件僅供參考。你的任務是在此基礎上產出你這一步的【新內容】，不得重述已有結論。）");
  return lines.join("\n");
}

function buildStepSection(
  step: WorkflowStepDef,
  stepIndex: number,
  totalSteps: number,
  isLead: boolean
): string {
  const stepTitle  = step.title ?? step.name ?? (isLead ? "任務確認" : `Step ${stepIndex}`);
  const stepDesc   = step.description ?? "";
  const outputType = step.outputType ?? step.output ?? "";
  const skills     = step.requiredSkills?.join("、") ?? "";

  const lines = [
    isLead
      ? "【你的任務：Squad Lead 開場確認】"
      : `【你的任務：Step ${stepIndex} / ${totalSteps} — ${stepTitle}】`,
    stepDesc   ? `任務說明：${stepDesc}` : null,
    outputType ? `預期輸出格式：${outputType}` : null,
    skills     ? `本步驟必要技能：${skills}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * 行為指引區塊
 * 關鍵設計：
 * - 語言約束永遠是第一條（硬性規定）
 * - 字數上限緊接語言約束
 * - 禁止開頭語列表針對所有已觀察到的 failure mode 短語
 * - Lead 開場：強制問具體問題，不得問泛問題，結尾固定語
 * - 執行步驟：強制第一字符為 ## 標題，從根源殺死 filler openers
 * - 最終步驟：有完整輸出結構骨架
 */
function buildBehaviorGuide(isLead: boolean, stepIndex: number, totalSteps: number): string {
  if (isLead) {
    return [
      "【執行指引 — Squad Lead 開場（Intake Agent 模式）】",
      "語言：繁體中文（硬性規定，不得使用簡體中文或英文）。",
      "字數上限：250 字（含標點）。超過即截止，不得加附錄。",
      "禁止開頭語：不得以「作為您的 Squad Lead」「很高興為您服務」「好的，我來」「根據您提供的資料」「我已了解您的需求」「當然」「沒問題」開頭。",
      "執行順序（嚴格依照，共五步）：",
      "  1. 【品牌 Recap — 必做第一步】用固定格式一句話確認品牌：",
      "     「我看了 [品牌名稱] 的資料：[品牌描述一句話]，目標客群是 [目標客群]。」",
      "     若品牌資料不完整（缺少名稱/描述/目標客群），改為點出最多 2 個缺失欄位，請用戶補充。",
      "  2. 【自我介紹】用 1 句話說明你是誰、你的小組在【哪個具體專業領域】的核心能力（必須使用你的 specialty，不得說成通用的「行銷顧問」或「AI 助手」）。",
      "  3. 【任務預告】用一行說明：本次任務共幾步，大致由哪類專家依序負責（不需列出每一步細節）。",
      "  4. 【確認問題】提出恰好 2 個確認問題。問題必須具體、針對你的專業領域與這個品牌的具體情況，不得是「有什麼想說的嗎？」「有沒有其他補充？」等開放泛問。",
      "  5. 【固定結尾】最後一句固定為：「請告訴我以上兩個問題的答案，我們就立即開始。」然後停止，等待用戶回應。",
    ].join("\n");
  }

  const isLastStep = stepIndex >= totalSteps;
  if (isLastStep) {
    return [
      "【執行指引 — 最終輸出步驟】",
      "語言：繁體中文（硬性規定）。",
      "字數上限：900 字。不得有冗長前言、致謝語或「補充說明」附錄。",
      "禁止開頭語：不得以「好的」「根據以上所有分析」「綜合各步驟」「作為最終總結者」「根據 Group Chat Context」開頭。",
      "輸出結構（固定骨架，按順序輸出）：",
      "  # [報告標題：品牌名稱 + 任務名稱]",
      "  ## 執行摘要（50 字以內，核心定位一句話）",
      "  ## [每個前步驟一個區塊，用你自己的語言陳述核心結論，不得逐字複製前步驟文件，每區塊加入至少 1 個新洞察]",
      "  ## 下一步行動",
      "  1. [立即可執行，具體動作，含負責人或部門]",
      "  2. [30 天內，具體動作]",
      "  3. [長期（3 個月以上），具體動作]",
      "  （下一步行動區塊結束後停止，不得有其他補充）",
    ].join("\n");
  }

  return [
    "【執行指引 — 執行步驟】",
    "語言：繁體中文（硬性規定）。",
    "字數上限：600 字。超過即截止。不得加「補充說明」「注意事項」或「附錄」區塊。",
    "禁止開頭語：不得以「好的」「根據 Group Chat Context」「根據以上分析」「根據 Squad Lead」「首先，讓我」「作為 [任何角色名稱]」「我來幫您」開頭。",
    "輸出規則：",
    "  1. 你的回應第一個字符必須是 Markdown 二級標題（## 開頭）。直接輸出分析，零過渡詞。",
    "  2. 使用 Markdown 結構：## 主標題，### 子標題，- 要點。每個 ### 區塊不超過 5 個要點。",
    "  3. 你的分析必須引入參考文件中【未曾出現過】的新觀點、新資料或新框架；若只是重述，視為無效輸出。",
    "  4. 不得在輸出正文中提及步驟編號（例如「如第 2 步所述」），直接陳述內容。",
    `  5. 結尾固定格式（兩行，不得省略）：`,
    `     ---`,
    `     **下一步**：Step ${stepIndex + 1} 將由 [下一步執行者角色] 負責 [一句話說明任務]。`,
    `     **確認問題**：[針對你剛才輸出內容的 1 個具體確認問題，不得是開放泛問]`,
  ].join("\n");
}

// ── @mention 第二意見 prompt ──────────────────────────────────────────────────
export function buildSecondOpinionPrompt(
  mentionedAgent: AgentIdentity,
  primaryResponse: string,
  brand: BrandContext,
  userQuestion: string
): string {
  return [
    `你是 ${mentionedAgent.name}，${mentionedAgent.title}。這是你唯一的身份，不得切換。`,
    mentionedAgent.specialty
      ? `你的專業核心：${mentionedAgent.specialty}。你的每一句話都必須從這個專業角度出發，不得說成通用行銷建議。`
      : null,
    "",
    "【品牌背景】",
    brand.name ? `品牌：${brand.name}（${brand.industry ?? ""}）` : null,
    brand.description ? brand.description.slice(0, 300) : null,
    "",
    "【用戶問題】",
    userQuestion,
    "",
    "【前一位 Agent 的回答（參考文件，不是對話對象）】",
    primaryResponse.slice(0, 1500),
    "",
    "【你的任務】",
    "以你獨特的專業角度，對上述回答提供第二意見。",
    "回答必須包含：",
    "- 你認為有哪些地方值得補充或調整（從你的專業領域出發，不是泛評）",
    "- 你的專業領域中有什麼被前一位 Agent 遺漏的視角",
    "- 你的具體建議或不同看法",
    "",
    "語言：繁體中文（硬性規定）。",
    "字數上限：150 字。",
    "禁止開頭語：不得以「前一位 Agent 說得很好」「我同意以上分析」「作為補充」「好的」開頭。",
    "格式：第一個字符必須是 Markdown 二級標題（## 開頭），然後 2-4 個 - 要點，最後 1 句具體建議。",
  ].filter(Boolean).join("\n");
}
