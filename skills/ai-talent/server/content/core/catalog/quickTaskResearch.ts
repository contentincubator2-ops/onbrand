/**
 * User Research quick-task templates (2026-05-05).
 * 10 Research 30s tasks. All caption_writer agents distinct from prior pools.
 * Output uses GenericMockup (document-style).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const RES_TONE = `
研究文件要 specific、可執行、避免抽象學術語言。
訪綱問題要開放式（不是 yes/no），引導受訪者講故事。`;

export const RESEARCH_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "rs-30-interview-guide",
    tier: "30s", postType: "generic",
    label: { en: "Interview Guide (10 Questions)", zh: "訪談大綱（10 題）" },
    description: { en: "10 open-ended questions for depth interviews", zh: "深度訪談的 10 題開放式問題" },
    agent_id: 210303, skill_slug: "ux-research",
    primary_question: "想了解使用者什麼？訪談主題？",
    primary_input: { key: "topic", placeholder: "例：了解 SaaS 中型客戶為何流失 / 新手媽媽如何選副食品", type: "textarea" },
    inputs: [{ key: "topic", label: "訪談主題", type: "textarea", required: true }],
    systemPrompt: `產出訪談 10 題訪綱。每變體 1 種 framework（Jobs-to-be-Done / 5 Whys / 旅程地圖式）。
規則：開放式問題（"請告訴我..."）、不要誘導性、含 1 個破冰題 + 8 個核心 + 1 個 wrap-up。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-persona-draft",
    tier: "30s", postType: "generic",
    label: { en: "Persona Draft", zh: "用戶輪廓草稿" },
    description: { en: "One archetypal user persona card", zh: "1 個典型用戶 persona 卡片" },
    agent_id: 30003, skill_slug: "persona",
    primary_question: "你的目標 TA 是誰？已知什麼資訊？",
    primary_input: { key: "context", placeholder: "目標客戶資料 + 已知行為", type: "textarea" },
    inputs: [{ key: "context", label: "受眾資訊", type: "textarea", required: true }],
    systemPrompt: `產出 persona 卡片。每變體 1 個 persona（不同 segment）。
結構：姓名 + 年齡 + 職業 → 1 句生活情境 → 主要 goals (3) → pain points (3) → 一週中的典型一天 → 用什麼 tool / 媒體 / KOL → 對你品牌的關鍵問題。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-survey",
    tier: "30s", postType: "generic",
    label: { en: "Survey Questions (10 Items)", zh: "問卷題目（10 題）" },
    description: { en: "10 quantitative survey questions (with options)", zh: "量化問卷的 10 題（含選項）" },
    agent_id: 180521, skill_slug: "survey-research",
    primary_question: "想量化什麼指標 / 假設？",
    primary_input: { key: "topic", placeholder: "例：NPS 因子 / 購買決策歷程 / 競品偏好", type: "textarea" },
    inputs: [{ key: "topic", label: "問卷主題", type: "textarea", required: true }],
    systemPrompt: `產出 survey 問卷（10 題）。每變體 1 種題型組合（NPS-led / decision-journey / brand-tracking）。
規則：含 demographics 2 題 + 核心 6 題 + open-ended 2 題。每題給：問題 + 題型（單選 / 多選 / Likert / 數字 / 開放）+ 選項。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-journey-map",
    tier: "30s", postType: "generic",
    label: { en: "User Journey Map (5 Stages)", zh: "用戶歷程地圖（5 階段）" },
    description: { en: "Awareness → Consideration → Purchase → Use → Advocacy", zh: "Awareness → Consideration → Purchase → Use → Advocacy" },
    agent_id: 220927, skill_slug: "ux-research",
    primary_question: "用戶從哪裡知道你 → 到變忠實顧客？",
    primary_input: { key: "context", placeholder: "產品 / 服務 + 已知接觸點", type: "textarea" },
    inputs: [{ key: "context", label: "產品 + 接觸點", type: "textarea", required: true }],
    systemPrompt: `產出 5 階段 user journey map。每階段：
- 用戶在做什麼
- 想什麼 / 感受什麼
- 接觸什麼 channel / 內容
- 痛點
- 你能介入的機會點

每變體 1 種 customer segment 視角。${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-competitive-interview",
    tier: "30s", postType: "generic",
    label: { en: "Competitor / Win-Loss Interview Guide", zh: "競品 / 成敗分析訪綱" },
    description: { en: "Learn why customers chose competitors / churned", zh: "了解客戶為何選競品 / 流失" },
    agent_id: 90031, skill_slug: "consumer-insights",
    primary_question: "目標：win or loss interview？",
    primary_input: { key: "context", placeholder: "你 / 競品 + 訪談對象 + 已知背景", type: "textarea" },
    inputs: [{ key: "context", label: "訪談背景", type: "textarea", required: true }],
    systemPrompt: `產出 win/loss interview 訪綱（8-10 題）。
結構：背景 (2) → 評估過程（看了哪些選項、依據是？）(3) → 最終決定（為何選 X？）(2) → 反思 (2) → wrap-up。
規則：避免問「為什麼不選我們」，要問「你最後選 X 的關鍵時刻」。${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-jtbd-guide",
    tier: "30s", postType: "generic",
    label: { en: "JTBD Interview Guide", zh: "JTBD 訪談大綱" },
    description: { en: "Jobs-to-be-Done structured interview", zh: "Jobs-to-be-Done 結構訪談" },
    agent_id: 211502, skill_slug: "research-manager",
    primary_question: "想了解用戶「雇用」你的產品做什麼？",
    primary_input: { key: "context", placeholder: "產品 + 想了解的 job", type: "textarea" },
    inputs: [{ key: "context", label: "產品 + 任務", type: "textarea", required: true }],
    systemPrompt: `產出 JTBD 訪談大綱。
結構：第一次想到要解決這問題（when / where）→ 之前用什麼 → 切換的觸發點 → 評估了什麼 → 用了之後（what changed）。
每變體 1 種 framing（functional / emotional / social job）。${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-synthesis-template",
    tier: "30s", postType: "generic",
    label: { en: "Post-Interview Synthesis Template", zh: "訪後洞察整合模板" },
    description: { en: "The template that turns multiple interviews into insights", zh: "把多個訪談歸納成 insight 的模板" },
    agent_id: 90032, skill_slug: "qualitative-research",
    primary_question: "訪談主題 + 訪了多少人？",
    primary_input: { key: "context", placeholder: "主題 + 樣本數 + 想得到什麼決策", type: "textarea" },
    inputs: [{ key: "context", label: "洞察整合脈絡", type: "textarea", required: true }],
    systemPrompt: `產出 synthesis 模板。每變體 1 種 framework（affinity mapping / themes-evidence-implications / how-might-we）。
結構：主題分類 → 每主題下：證據 quote、出現頻率、影響嚴重度 → implications + recommendations。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-consent-form",
    tier: "30s", postType: "generic",
    label: { en: "Participant Consent Form", zh: "受訪者知情同意書" },
    description: { en: "A regulation-compliant interview consent form", zh: "符合法規的訪談同意書" },
    agent_id: 210311, skill_slug: "research-ethics",
    primary_question: "訪談主題 / 錄音錄影 / 補償？",
    primary_input: { key: "context", placeholder: "訪談形式 + 補償 + 用途", type: "textarea" },
    inputs: [{ key: "context", label: "訪談條件", type: "textarea", required: true }],
    systemPrompt: `產出受訪者知情同意書。每變體 1 種版本（精簡 / 完整 / 兒童 / 老人友善）。
必含：研究目的、訪談形式（時長 / 錄音 / 場地）、資料用途、保密措施、退出權、聯絡人、補償（如有）、簽名欄。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-usability-script",
    tier: "30s", postType: "generic",
    label: { en: "Usability Test Script", zh: "易用性測試腳本" },
    description: { en: "5-7 tasks + what to observe", zh: "5-7 個任務 + 觀察重點" },
    agent_id: 220528, skill_slug: "consumer-insights",
    primary_question: "要測試的產品 / 介面是？關鍵流程？",
    primary_input: { key: "context", placeholder: "產品 + 想測的關鍵任務", type: "textarea" },
    inputs: [{ key: "context", label: "測試對象 + 任務", type: "textarea", required: true }],
    systemPrompt: `產出 usability test 腳本。每變體 1 種重點（first-impression / task completion / error recovery）。
結構：開場（介紹 / 暖身 / think-aloud 引導）→ 任務 1-7（每任務含 scenario + 完成標準 + 觀察重點）→ wrap-up（SUS 量表 + 開放回饋）。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-screener",
    tier: "30s", postType: "generic",
    label: { en: "Participant Screener", zh: "受訪者篩選問卷" },
    description: { en: "Screening questions that keep participants on-TA", zh: "確保訪談對象符合 TA 的篩選題" },
    agent_id: 220529, skill_slug: "consumer-insights",
    primary_question: "想篩出什麼樣的人？",
    primary_input: { key: "context", placeholder: "受眾條件（背景 / 行為 / 屬性）", type: "textarea" },
    inputs: [{ key: "context", label: "受眾條件", type: "textarea", required: true }],
    systemPrompt: `產出 screener 篩選問卷（5-8 題）。每變體 1 種 quota 設計（broader / strict / mixed）。
規則：每題標明「合格條件」（passes if X）；包含 disqualify 題（避開行銷 / 競品從業）。
${RES_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "rs-30-gap-experiment",
    tier: "30s",
    postType: "generic",
    label: { en: "Research: Design a Visible Gap", zh: "用戶研究：設計一個看得見落差的實驗" },
    description: { en: "Put two versions side by side", zh: "讓兩個版本並排，落差自己出現" },
    agent_id: 210303, // 沿用同 postType 現役卡
    skill_slug: "ux-research",
    source: {
      type: "viral",
      short: "Dove「Real Beauty Sketches」",
      metric: "12 天內逾 5,000 萬次觀看、370 萬次分享",
      asOf: "2013-04",
      takeaway:
        "研究要能被分享，靠的是把發現做成「兩個版本並排」的畫面——落差本身就是結論，不需要再寫一段解釋。",
    },
    primary_question: "你想驗證使用者對什麼有誤解？",
    primary_input: { key: "topic", placeholder: "例：他們以為自己在意價格，其實在意等待時間", type: "textarea" },
    inputs: [
      { key: "topic", label: "想驗證的使用者誤解", type: "textarea", required: true },
    ],
    systemPrompt: `你要設計一個能產出「可視化落差」的用戶研究。

要產出：
1. 假設：使用者以為 X，實際上是 Y。一句話。
2. 裝置：怎麼在同一批受試者身上取得兩個版本的答案（自述 vs 觀察、盲測 vs 具名、事前 vs 事後）。
3. 招募條件與樣本數，以及為什麼這個樣本數夠用（或不夠用）。
4. 訪談或測試的逐題腳本。
5. 結果要怎麼呈現成一張並排的圖。

硬規則：
- 兩個版本必須來自同一批人，否則落差不成立。
- 要寫出這個設計可能有的偏誤，至少兩項。
- 不要在題目裡暗示期待的答案。
- 樣本數不要吹大，12 人就寫 12 人。`,
    preferredModel: "qwen",
    maxTokens: 2420,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-30-personal-data-story",
    tier: "30s",
    postType: "press",
    label: { en: "Findings: Give the Data Back", zh: "研究發表：把數據還給每個使用者" },
    description: { en: "Aggregates don't travel; personal numbers do", zh: "總量沒人轉，個人化數字才會" },
    agent_id: 90043, // 沿用同 postType 現役卡
    skill_slug: "user-research",
    source: {
      type: "viral",
      short: "Spotify Wrapped",
      metric: "24 小時 2 億人參與、逾 6.3 億次分享",
      asOf: "2025-12",
      takeaway:
        "研究結果要傳開，得把總量翻譯成「這對你來說是多少」——人不會轉發統計，會轉發關於自己的發現。",
    },
    primary_question: "你的研究裡，有哪些數字可以還原到單一使用者？",
    primary_input: { key: "topic", placeholder: "例：平均每人一年花在等待上的時間", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以還原到個人的數字", type: "textarea", required: true },
    ],
    systemPrompt: `你要把一份研究結果寫成會被轉發的發表稿。

結構：
1. 開頭給一個「換算到個人」的數字，不要先給總量。
2. 說明換算方式，一段，讓人可以自己算。
3. 三個延伸發現，每個都用「對你來說是…」的句型。
4. 方法與限制：樣本、期間、誤差，誠實寫。
5. 一句可被引用的結論。

硬規則：
- 總量數字最多出現一次，且不能放在開頭。
- 換算必須數學上站得住，寫出分母。
- 限制段不可省略，也不要寫在最不起眼的地方。
- 沒做過的研究要註明這是設計稿。`,
    preferredModel: "qwen",
    maxTokens: 1980,
    outputDefaults: { platform: "generic", post_type: "press" },
  },
];

const JOCHING_ID = 220530;
export const RESEARCH_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "rs-30-interview-guide":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["JTBD 框架", "5 Whys 框架", "旅程地圖式"], captionMinChars: 400, captionMaxChars: 1000 },
  "rs-30-persona-draft":        { variants: 3, images: 3, runImageGen: false, imageDirectorId: JOCHING_ID, aspectRatio: "1:1",variantLabels: ["主流 segment", "新興 segment", "邊緣 segment"], captionMinChars: 300, captionMaxChars: 700 },
  "rs-30-survey":               { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["NPS-led", "Decision-journey", "Brand-tracking"], captionMinChars: 500, captionMaxChars: 1200 },
  "rs-30-journey-map":          { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["新客視角", "回購客視角", "流失客視角"], captionMinChars: 500, captionMaxChars: 1200 },
  "rs-30-competitive-interview":{ variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["Win 訪", "Loss 訪", "Mixed 訪"], captionMinChars: 400, captionMaxChars: 800 },
  "rs-30-jtbd-guide":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["Functional job", "Emotional job", "Social job"], captionMinChars: 400, captionMaxChars: 800 },
  "rs-30-synthesis-template":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["Affinity mapping", "Themes-evidence", "How-might-we"], captionMinChars: 400, captionMaxChars: 1000 },
  "rs-30-consent-form":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["精簡版", "完整版", "兒童 / 老人友善"], captionMinChars: 300, captionMaxChars: 800 },
  "rs-30-usability-script":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["First-impression 重", "Task completion 重", "Error recovery 重"], captionMinChars: 500, captionMaxChars: 1200 },
  "rs-30-screener":             { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["Broader quota", "Strict quota", "Mixed quota"], captionMinChars: 300, captionMaxChars: 700 },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "rs-30-gap-experiment": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["雙描述版", "盲測版", "前後測版"],
    captionMinChars: 500, captionMaxChars: 1100,
  },
  "rs-30-personal-data-story": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["個人換算版", "對照版", "時間成本版"],
    captionMinChars: 400, captionMaxChars: 900,
  },
};

export function getResearchOrchestraConfig(taskId: string): OrchestraConfig | null {
  return RESEARCH_30S_ORCHESTRA[taskId] ?? null;
}
