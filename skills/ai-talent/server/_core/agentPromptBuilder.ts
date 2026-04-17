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
  strategy:          "品牌策略工作區 — 負責品牌定位、競品分析、受眾研究、品牌宣言等核心策略工作",
  "brand-positioning": "品牌定位方法論工作區 — 運用系統化方法論（利益階梯、差異化、JTBD、心智定位等）建立品牌在市場中的清晰位置，產出定位書、訊息框架與落地文案",
  facebook:          "Facebook 廣告工作區 — 負責 FB 廣告投放策略、文案、創意素材、受眾設定與成效優化",
  instagram:         "Instagram 內容工作區 — 負責 IG 內容策略、Reels、限時動態、品牌視覺與社群互動",
  linkedin:          "LinkedIn 行銷工作區 — 負責 B2B 內容策略、思想領袖文章、公司頁面經營與 Lead Gen",
  youtube:           "YouTube / 短影音工作區 — 負責影片內容策略、腳本撰寫、SEO 優化、短影音（Reels/Shorts/TikTok）",
  pr:                "公關工作區 — 負責新聞稿、媒體關係、KOL 合作、危機處理與品牌聲量管理",
  event:             "活動行銷工作區 — 負責體驗活動設計、活動企劃、現場執行與活動後追蹤",
  website:           "官網 / SEO 工作區 — 負責網站內容、SEO 優化、Landing Page、轉換率優化",
  monitoring:        "品牌監測工作區 — 負責社群聆聽、輿情分析、競品追蹤、品牌健康度報告",
  analytics:         "數據分析工作區 — 負責行銷數據分析、歸因模型、A/B 測試、ROI 追蹤",
  instore:           "實體零售工作區 — 負責門市體驗設計、陳列策略、購買行為分析與 OMO 整合",
};

// ── 方法論 × 步驟 輸出格式模板 ───────────────────────────────────────────────
/**
 * 針對每個品牌定位方法論，定義每個步驟的精確輸出格式指令。
 * key: `${methodology}:${stepIndex}`（stepIndex 0 = lead intake）
 * 這些指令會附加到 buildBehaviorGuide 的末尾，覆蓋通用格式。
 */
const METHODOLOGY_STEP_FORMATS: Record<string, string> = {

  // ═══════════════════════════════════════════════════
  // Benefit-Based Positioning（利益階梯定位）
  // ═══════════════════════════════════════════════════

  "benefit-based:2": `
【Step 2 輸出格式（強制）】
你的回應必須包含以下兩個區塊，按順序輸出：

## Feature → Functional Benefit Map

| 產品功能 | 功能利益（Functional Benefit） |
|---------|-------------------------------|
| [功能1] | [明確、可感知的功能好處，用戶角度描述] |
| [功能2] | [同上] |
（至少 5 行，覆蓋品牌所有核心功能）

### 關鍵洞察：ICP 最重視的功能利益
- [洞察 1：哪個功能利益對目標客群衝擊最大，說明為什麼]
- [洞察 2：哪個功能利益是競品沒有的差異化空間]
- [洞察 3：哪個功能利益容易被誤解或需要進一步情感化]

---
**下一步**：Step 3 將由情感品牌專家負責，將每項功能利益挖掘為更深層的情感利益。
**確認問題**：以上 [X 項] 功能利益中，哪一項是你認為最能打動目標客群、最值得作為主要定位訴求的？`,

  "benefit-based:3": `
【Step 3 輸出格式（強制）】
你的回應必須包含以下三個區塊，按順序輸出：

## Functional → Emotional Benefit Map

| 功能利益 | 情感利益（Emotional Benefit）|
|---------|------------------------------|
| [功能利益1] | [第一人稱情感描述，例如「我終於不需要...」] |
| [功能利益2] | [同上] |
（覆蓋所有 Step 2 的功能利益）

### 核心情感定錨（最重要）
從以上情感利益中，選出最強的一個作為整個定位的情感核心：

> **[一句話，用目標客群的自我認同語言表達最強的情感利益]**

這句話必須：(1) 用第三人稱但讓人有代入感 (2) 不包含產品功能描述 (3) 是目標客群願意公開說的話

### 情感層級評估
- 最強情感利益：[列出，說明為何共鳴度最高]
- 次強情感利益：[列出，說明適合哪個廣告場景]
- 需要捨棄的情感：[列出，說明為何對 ICP 共鳴度低]

---
**下一步**：Step 4 將由訊息框架策略師負責，將功能利益與情感利益整合為完整的 Message Ladder。
**確認問題**：我識別出的核心情感是「[你定錨的情感]」——這和你對目標客群的認識吻合嗎？`,

  "benefit-based:4": `
【Step 4 輸出格式（強制）】
你的回應必須包含以下兩個區塊，按順序輸出：

## [品牌名稱] 完整 Message Ladder

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 品牌主張（Brand Promise）
  [一句話，涵蓋情感利益 + 差異化）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 社會認同（Social Proof / Credibility）
  [具體數字或事實，讓品牌主張可信]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 情感利益（Emotional Benefit）← 核心定錨層
  [從 Step 3 選出的最強情感利益，完整句子]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 功能利益（Functional Benefit）
  [從 Step 2 最重要的 2-3 項，用受眾語言描述]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 功能特性（Features）
  [產品核心功能，2-4 項]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▲ 行動呼籲（CTA）
  [具體行動，用情感驅動語言]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

### Ladder 設計說明
- 為何選這個品牌主張：[2 句說明邏輯]
- 訊息一致性驗證：[說明每層如何支撐上一層]
- 對比競品：[說明這個 Ladder 在競品對比中的差異化空間]

---
**下一步**：Step 5 將由轉換文案師負責，將 Message Ladder 落地為 Landing Page Copy、廣告 Headlines 與 Email Subject Lines。
**確認問題**：Message Ladder 的品牌主張是「[你的主張]」——這句話你願意放在官網最顯眼的位置嗎？`,

  "benefit-based:5": `
【Step 5 輸出格式（強制）】
你的回應必須按順序包含以下四個區塊，每個區塊都必須完整輸出：

## 🖥️ Landing Page Hero Copy

\`\`\`
H1（情感利益層，≤ 12 字）：
[完整 H1 文字]

副標（功能利益層，1-2 句）：
[完整副標文字]

Social Proof（可信度，1 句含具體數字）：
[完整文字]

Pain Point Block（3 個競品痛點 → 3 個你的優勢）：
以前你可能試過：
  × [競品痛點 1]
  × [競品痛點 2]
  × [競品痛點 3]

[品牌名稱] 不一樣：
  ✓ [對應優勢 1]
  ✓ [對應優勢 2]
  ✓ [對應優勢 3]

主 CTA：[動詞開頭，≤ 10 字] →
次 CTA：[動詞開頭，≤ 10 字] →
\`\`\`

## 📣 廣告 4 版 Headlines

\`\`\`
版本 A｜情感主打（品牌認知 / 冷受眾）
Headline：[≤ 14 字，情感利益層]
Primary Text：[3-4 句，痛點 → 解方 → 品牌差異化]
CTA：[≤ 6 字]

版本 B｜功能主打（Retargeting / 已有認知受眾）
Headline：[≤ 14 字，功能利益層]
Primary Text：[3-4 句，功能特性 → 功能利益 → 具體結果]
CTA：[≤ 6 字]

版本 C｜競品痛點（對競品不滿意的用戶）
Headline：[≤ 14 字，直接打競品用戶痛點]
Primary Text：[3-4 句，競品問題 → 你的不同 → 具體優勢]
CTA：[≤ 6 字]

版本 D｜ICP 精準（直接對話目標客群角色）
Headline：[≤ 14 字，用 ICP 的職稱或情境開頭]
Primary Text：[3-4 句，ICP 情境 → 痛點 → 解法 → 情感結尾]
CTA：[≤ 6 字]
\`\`\`

## 📧 Email Subject Lines（4 條）

\`\`\`
1. [好奇心 / 利益驅動型]
2. [競品對比型]
3. [ICP 直呼職稱型]
4. [痛點共鳴型]
\`\`\`

## 📊 A/B 效力評估

| 版本 | 情感強度 | 差異化 | 建議用途 |
|------|---------|-------|---------|
| A | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Hero / 品牌認知 |
| B | ⭐⭐⭐ | ⭐⭐⭐ | Retargeting |
| C | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 競品用戶拉新 |
| D | ⭐⭐⭐⭐ | ⭐⭐⭐ | 精準 ICP 投放 |

主推組合建議：[說明為何選這個組合]

---
**下一步**：Step 6 Squad Lead 將整合所有步驟輸出，完成品牌利益階梯定位書最終交付。
**確認問題**：4 版 Headlines 中，哪一版最接近你期望品牌呈現的氣質？`,

  // ── 最終步驟：Squad Lead 交付三份文件 ──────────────────────────────────────
  "benefit-based:final": `
【最終交付格式（強制）— 輸出三份完整文件】
你是 Squad Lead，負責整合所有步驟成果，輸出以下三份完整文件。
字數上限：1500 字（三份合計）。每份文件必須完整，不得截斷。
禁止：不得重述「前面各步驟已說明」，直接輸出文件內容。

---

# 📄 文件一：Landing Page Copy

\`\`\`
H1：[從 Step 5 選出最強版本或微調後的最終版]

副標：[最終版副標]

Social Proof：[最終版]

Pain Point Block：
以前你可能試過：
  × [痛點 1]
  × [痛點 2]
  × [痛點 3]

[品牌名稱] 不一樣：
  ✓ [優勢 1]
  ✓ [優勢 2]
  ✓ [優勢 3]

主 CTA：[最終版] →
次 CTA：[最終版] →
\`\`\`

---

# 📣 文件二：廣告 4 版 Headlines（最終版）

\`\`\`
版本 A｜情感主打
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 B｜功能主打
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 C｜競品痛點
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]

版本 D｜ICP 精準
Headline：[最終版]
Primary Text：[最終版 3-4 句]
CTA：[最終版]
\`\`\`

---

# 📘 文件三：品牌利益階梯定位書

\`\`\`
══════════════════════════════════════════════════════
[品牌名稱]｜品牌利益階梯定位書
Benefit-Based Positioning Playbook  v1.0
══════════════════════════════════════════════════════

【一、核心定位句】
[一句話品牌主張]

定位邏輯：[2 句說明為何從情感利益出發而非功能]

──────────────────────────────────────────────────────
【二、利益階梯全覽】

  ▲ 品牌主張：[完整句]
  ▲ 社會認同：[完整句]
  ▲ 情感利益（核心）：[完整句]
  ▲ 功能利益：[2-3 項]
  ▲ 功能特性：[2-4 項]
  ▲ 行動呼籲：[完整句]

──────────────────────────────────────────────────────
【三、目標客群（ICP）】

主要：[職稱 / 公司規模 / 痛點 / 情感需求]
次要：[第二客群]

──────────────────────────────────────────────────────
【四、競品差異化定位】

[競品1] → [他們給什麼]
[競品2] → [他們給什麼]
[品牌名稱] → [你真正給的是什麼]

差異化核心：[1-2 句，說明你佔據的唯一心智位置]

──────────────────────────────────────────────────────
【五、各通路訊息一致性原則】

官網 Hero     → [情感利益層]
廣告（冷受眾）→ [痛點層]
廣告（暖受眾）→ [功能層]
Email 主旨   → [ICP 直擊]
LinkedIn     → [思想領袖層]

──────────────────────────────────────────────────────
【六、禁止使用的訊息方向】

× [禁止訊息 1 + 原因]
× [禁止訊息 2 + 原因]
× [禁止訊息 3 + 原因]

──────────────────────────────────────────────────────
【七、一句話定位測試】

當有人問「[品牌名稱] 是什麼？」
標準回答：「[20-40 字，涵蓋 ICP + 核心功能 + 情感差異化]」

══════════════════════════════════════════════════════
交付：利益階梯定位小組
\`\`\``,

  // ═══════════════════════════════════════════════════
  // Differentiation Positioning（差異化定位）最終交付
  // ═══════════════════════════════════════════════════
  "differentiation:final": `
【最終交付格式（差異化定位書）】
輸出：差異化定位書（Differentiation Positioning Playbook）
結構：
  # [品牌名稱] 差異化定位書
  ## 核心差異化主張（April Dunford 格式）
  ## 獨特屬性清單（通過篩選的，及淘汰原因）
  ## 市場類別宣言
  ## 競品 Battlecard 摘要（2-3 個主要競品）
  ## 定位一致性手冊（各通路應用）
  ## 下一步行動（3 項，立即 / 30 天 / 長期）`,

  // ═══════════════════════════════════════════════════
  // JTBD Positioning 最終交付
  // ═══════════════════════════════════════════════════
  "jtbd:final": `
【最終交付格式（JTBD 定位書）】
輸出：JTBD Positioning Playbook
結構：
  # [品牌名稱] JTBD 定位書
  ## 核心 Job 定義（情境 + 觸發 + 成功標準）
  ## Job Map（開始→準備→執行→結束）
  ## 真正的競爭替代品（非傳統競品分類）
  ## JTBD 定位聲明（完整格式）
  ## 任務驅動訊息框架（官網 / 廣告 / 銷售話術）
  ## 下一步行動`,
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

  // 8. 行為指引（語言 + 字數上限 + 禁止語 + 步驟規則 + 方法論格式）
  const behaviorGuide = buildBehaviorGuide(
    isLead, stepIndex, totalSteps,
    squadMethodology,
    workflowStep.outputType ?? workflowStep.output,
  );

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
function buildBehaviorGuide(
  isLead: boolean,
  stepIndex: number,
  totalSteps: number,
  squadMethodology?: string,
  outputType?: string,
): string {
  // ── Squad Lead 開場 Intake ─────────────────────────────────────────────────
  if (isLead && stepIndex === 0) {
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

  // ── 最終步驟：Squad Lead 交付 ─────────────────────────────────────────────
  const isLastStep = stepIndex >= totalSteps;
  if (isLastStep) {
    // 方法論特定格式：優先使用
    const methodologyFinalKey = squadMethodology ? `${squadMethodology}:final` : null;
    const methodologyFinalFormat = methodologyFinalKey
      ? METHODOLOGY_STEP_FORMATS[methodologyFinalKey]
      : null;

    if (methodologyFinalFormat) {
      return [
        "【執行指引 — 最終交付步驟（Squad Lead）】",
        "語言：繁體中文（硬性規定）。",
        "禁止開頭語：不得以「好的」「根據以上所有分析」「綜合各步驟」「作為最終總結者」「根據 Group Chat Context」開頭。",
        "直接輸出以下格式的三份交付文件，零前言、零後記：",
        methodologyFinalFormat.trim(),
      ].join("\n");
    }

    // 通用最終步驟格式（無方法論特定格式時）
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

  // ── 中間執行步驟 ──────────────────────────────────────────────────────────
  // 方法論特定格式：優先使用，覆蓋通用格式
  const methodologyStepKey = squadMethodology ? `${squadMethodology}:${stepIndex}` : null;
  const methodologyStepFormat = methodologyStepKey
    ? METHODOLOGY_STEP_FORMATS[methodologyStepKey]
    : null;

  const baseGuide = [
    "【執行指引 — 執行步驟】",
    "語言：繁體中文（硬性規定）。",
    `字數上限：${methodologyStepFormat ? "800" : "600"} 字。超過即截止。不得加「補充說明」「注意事項」或「附錄」區塊。`,
    "禁止開頭語：不得以「好的」「根據 Group Chat Context」「根據以上分析」「根據 Squad Lead」「首先，讓我」「作為 [任何角色名稱]」「我來幫您」開頭。",
    "輸出規則：",
    "  1. 你的回應第一個字符必須是 Markdown 二級標題（## 開頭）。直接輸出分析，零過渡詞。",
    "  2. 使用 Markdown 結構：## 主標題，### 子標題，- 要點。每個 ### 區塊不超過 5 個要點。",
    "  3. 你的分析必須引入參考文件中【未曾出現過】的新觀點、新資料或新框架；若只是重述，視為無效輸出。",
    "  4. 不得在輸出正文中提及步驟編號（例如「如第 2 步所述」），直接陳述內容。",
  ];

  if (methodologyStepFormat) {
    // 方法論格式完整替換結尾格式（包含 ---下一步 / 確認問題）
    baseGuide.push(methodologyStepFormat.trim());
  } else {
    // 通用結尾
    baseGuide.push(
      `  5. 結尾固定格式（兩行，不得省略）：`,
      `     ---`,
      `     **下一步**：Step ${stepIndex + 1} 將由 [下一步執行者角色] 負責 [一句話說明任務]。`,
      `     **確認問題**：[針對你剛才輸出內容的 1 個具體確認問題，不得是開放泛問]`,
    );
  }

  return baseGuide.join("\n");
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
