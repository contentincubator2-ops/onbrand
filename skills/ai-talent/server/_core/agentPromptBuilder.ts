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
  agentRole: string;             // 在這個 squad 裡的角色
  workflowStep: WorkflowStepDef; // 本步驟定義
  stepIndex: number;             // 0 = lead intake, 1+ = workflow steps
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

  // 1. 身份宣告
  const identity = [
    `你是 ${agent.name}，${agent.title}。`,
    agent.specialty ? `你的專長：${agent.specialty}` : null,
    `你目前加入「${squadName}」小組，擔任「${agentRole}」。`,
    `小組採用的方法論：${squadMethodology}`,
  ].filter(Boolean).join("\n");

  // 2. 工作區域
  const workspaceSection = `【工作區域】\n${wsDesc}`;

  // 3. 任務背景
  const missionSection = `【任務背景】\n任務名稱：${missionTitle}\n工作區：${workspace}`;

  // 4. 品牌全貌
  const brandSection = buildBrandSection(brand);

  // 5. 品牌大腦
  const brainSection = buildBrainSection(brandBrain);

  // 6. 前步驟成果
  const prevSection = buildPreviousResultsSection(previousResults, totalSteps);

  // 7. 本步驟任務
  const stepSection = buildStepSection(workflowStep, stepIndex, totalSteps, isLead);

  // 8. 行為指引
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

function buildBrandSection(brand: BrandContext): string {
  if (!brand.name && !brand.description) return "";
  const lines = [
    "【品牌全貌】",
    brand.name         ? `品牌名稱：${brand.name}` : null,
    brand.industry     ? `產業：${brand.industry}` : null,
    brand.description  ? `品牌描述：${brand.description}` : null,
    brand.targetAudience ? `目標受眾：${brand.targetAudience}` : null,
    brand.tagline      ? `品牌標語：${brand.tagline}` : null,
    brand.brandVoice   ? `品牌聲音：${brand.brandVoice}` : null,
    brand.positioningSummary ? `現有定位摘要：${brand.positioningSummary}` : null,
    brand.website      ? `官網：${brand.website}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildBrainSection(brandBrain: Record<string, string[]>): string {
  const categories = Object.keys(brandBrain);
  if (categories.length === 0) return "";

  const CATEGORY_LABELS: Record<string, string> = {
    positioning: "📍 定位",
    audience:    "👥 目標受眾",
    voice:       "🗣️  品牌聲音",
    competitors: "⚔️  競品",
    custom:      "📝 其他",
  };

  const lines = ["【品牌大腦（累積知識）】"];
  for (const cat of categories) {
    const label = CATEGORY_LABELS[cat] ?? cat;
    const entries = brandBrain[cat].slice(0, 3); // 每類最多 3 條
    lines.push(`${label}：`);
    for (const e of entries) {
      lines.push(`  · ${e.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

function buildPreviousResultsSection(
  previousResults: Record<number, string>,
  totalSteps: number
): string {
  const steps = Object.keys(previousResults)
    .map(Number)
    .sort((a, b) => a - b);

  if (steps.length === 0) return "";

  const lines = ["【本次任務前步驟成果】"];
  for (const step of steps) {
    const summary = previousResults[step];
    if (summary) {
      const label = step === 0 ? "Squad Lead 確認" : `Step ${step}`;
      lines.push(`${label}：${summary.slice(0, 500)}`);
    }
  }
  lines.push("（以上是已確認的分析基礎，請在此基礎上繼續深化）");
  return lines.join("\n");
}

function buildStepSection(
  step: WorkflowStepDef,
  stepIndex: number,
  totalSteps: number,
  isLead: boolean
): string {
  const stepTitle = step.title ?? step.name ?? (isLead ? "任務確認" : `Step ${stepIndex}`);
  const stepDesc  = step.description ?? "";
  const outputType = step.outputType ?? step.output ?? "";
  const skills = step.requiredSkills?.join("、") ?? "";

  const lines = [
    isLead
      ? "【你的任務：Squad Lead 開場確認】"
      : `【你的任務：Step ${stepIndex} / ${totalSteps} — ${stepTitle}】`,
    stepDesc ? `任務說明：${stepDesc}` : null,
    outputType ? `預期輸出：${outputType}` : null,
    skills ? `需要的技能：${skills}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function buildBehaviorGuide(isLead: boolean, stepIndex: number, totalSteps: number): string {
  if (isLead) {
    return [
      "【執行指引】",
      "1. 用 2-3 句確認你已掌握的品牌資料",
      "2. 說明本次任務的小組執行流程（共幾步）",
      "3. 提出 2-3 個關鍵確認問題，幫助你了解用戶的核心目標",
      "4. 語氣：專業但親近，像一位資深顧問在啟動項目",
      "5. 不超過 250 字，結尾只問問題，等待用戶回答",
    ].join("\n");
  }

  const isLastStep = stepIndex >= totalSteps;
  if (isLastStep) {
    return [
      "【執行指引】",
      "1. 整合所有前步驟成果，輸出最終完整分析",
      "2. 格式：清晰的 Markdown，有標題、子標題、要點",
      "3. 結尾提供 3 個用戶可以採取的下一步行動",
      "4. 語氣：專業、精煉、有說服力",
    ].join("\n");
  }

  return [
    "【執行指引】",
    "1. 直接執行你負責的這一步，不要問「是否開始」",
    "2. 輸出結構化的分析結果，使用 Markdown 格式",
    "3. 結尾提出 1 個確認問題或說明下一步將由誰接棒",
    "4. 保持專業、精煉，不要重複前步驟已說過的內容",
    "5. 語言：繁體中文",
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
    `你是 ${mentionedAgent.name}，${mentionedAgent.title}。`,
    mentionedAgent.specialty ? `你的專長：${mentionedAgent.specialty}` : null,
    "",
    "【品牌背景】",
    brand.name ? `品牌：${brand.name}（${brand.industry ?? ""}）` : null,
    brand.description ? brand.description.slice(0, 300) : null,
    "",
    "【用戶問題】",
    userQuestion,
    "",
    "【前一位 Agent 的回答】",
    primaryResponse.slice(0, 1500),
    "",
    "【你的任務】",
    "以你獨特的專業角度，對上述回答提供第二意見：",
    "- 你認為有哪些地方值得補充或調整？",
    "- 從你的專業領域看，有什麼被遺漏的視角？",
    "- 你的建議或不同看法是什麼？",
    "",
    "語氣：尊重前一位 Agent 的分析，但坦誠表達你的不同觀點。",
    "格式：直接切入，不超過 200 字。",
  ].filter(Boolean).join("\n");
}
