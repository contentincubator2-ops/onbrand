/**
 * Press Release (新聞稿) quick-task templates (2026-05-05).
 * 10 PR 30s tasks. All caption_writer agents distinct from prior pools.
 * image_director = Vincent Chu (60011, PR Strategist Tech) — repurposed.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const PR_TONE = `
新聞稿要客觀、第三人稱、倒金字塔結構（重要事實在前）。
不要過度形容詞、不要「業界領導」這種陳腔濫調。
記者偏好可直接引用的數字 + 名字 + 時間 + 地點。`;

export const PR_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "pr-30-headline",
    tier: "30s", postType: "press-release",
    label: "新聞稿標題",
    description: "決定記者要不要打開的第一行",
    agent_id: 29, skill_slug: "press-release",
    primary_question: "這則新聞核心事件是？",
    primary_input: { key: "event", placeholder: "誰 + 做了什麼 + 何時 / 何地", type: "textarea" },
    inputs: [{ key: "event", label: "新聞事件", type: "textarea", required: true }],
    systemPrompt: `產出新聞稿標題。每變體 1 種角度（事實式 / 突破式 / 數據式）。
規則：50 字內、含 1 個具體數字或名字、不要 buzzword。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-subhead",
    tier: "30s", postType: "press-release",
    label: "新聞稿副標 + 引言",
    description: "標題下方的延伸 1-2 句",
    agent_id: 30008, skill_slug: "media-pr",
    primary_question: "標題重點 + 想擴充什麼面向？",
    primary_input: { key: "context", placeholder: "標題 + 你想引申的", type: "textarea" },
    inputs: [{ key: "context", label: "標題 + 引申", type: "textarea", required: true }],
    systemPrompt: `產出新聞稿副標（30-80 字）。每變體 1 種延伸（影響面 / 規模 / 時程）。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-lead-paragraph",
    tier: "30s", postType: "press-release",
    label: "倒金字塔 lead 第一段",
    description: "5W1H 第一段（最重要的事實）",
    agent_id: 60035, skill_slug: "press",
    primary_question: "事件的 5W1H？",
    primary_input: { key: "event", placeholder: "誰 / 做了什麼 / 何時 / 何地 / 為何 / 如何", type: "textarea" },
    inputs: [{ key: "event", label: "5W1H 細節", type: "textarea", required: true }],
    systemPrompt: `產出新聞稿第一段（lead，80-150 字）。
規則：第一句必須包含 What + Who + When + Where；第二句補 Why；第三句補 How（如果重要）。
不要繞、不要鋪陳、不要"近年來..."這種廢話開頭。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-ceo-quote",
    tier: "30s", postType: "press-release",
    label: "CEO / 高管 quote",
    description: "可直接引用的引言",
    agent_id: 60036, skill_slug: "press",
    primary_question: "誰要說？關於什麼？想傳達什麼觀點？",
    primary_input: { key: "context", placeholder: "發言人角色 + 核心觀點", type: "textarea" },
    inputs: [{ key: "context", label: "發言人 + 主題", type: "textarea", required: true }],
    systemPrompt: `產出 CEO / 高管引言。每變體 1 種角度（願景式 / 客戶價值式 / 市場觀察式）。
規則：60-120 字、第一人稱、要記者願意直接引用（specific、有觀點）。
不要"我們很高興..."這種範本。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-boilerplate",
    tier: "30s", postType: "press-release",
    label: "公司簡介 boilerplate",
    description: "新聞稿底部固定的「關於 XXX」段落",
    agent_id: 60037, skill_slug: "press",
    primary_question: "公司核心業務 / 規模 / 重要里程碑？",
    primary_input: { key: "context", placeholder: "業務 + 規模 + 創辦時間 + 主要產品", type: "textarea" },
    inputs: [{ key: "context", label: "公司資料", type: "textarea", required: true }],
    systemPrompt: `產出 boilerplate（150-250 字）。
結構：1 句定位 → 主要產品 / 服務 → 規模（員工 / 客戶數 / 營收）→ 重要里程碑 → 聯絡方式。
不要"業界領先"、"全球頂尖"這種空話。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-fact-sheet",
    tier: "30s", postType: "press-release",
    label: "Fact sheet（一頁式事實彙整）",
    description: "給記者快速 reference 的 bullet 清單",
    agent_id: 60038, skill_slug: "press",
    primary_question: "事件的所有可量化事實？",
    primary_input: { key: "context", placeholder: "所有可寫進 fact sheet 的數字 / 名字 / 時間", type: "textarea" },
    inputs: [{ key: "context", label: "事實素材", type: "textarea", required: true }],
    systemPrompt: `產出 Fact sheet。
結構：標題 → bullet list（每行 1 個事實，含具體數字 / 名字 / 時間）→ 5-10 項。
分類：產品（規格 / 價格）/ 公司（規模 / 創辦）/ 市場（佔有率 / 客戶）/ 時程（里程碑）。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-media-pitch",
    tier: "30s", postType: "press-release",
    label: "Media pitch email",
    description: "寄給記者的「為何要報導我」信",
    agent_id: 180175, skill_slug: "press",
    primary_question: "新聞主題 + 為何這個記者會感興趣？",
    primary_input: { key: "context", placeholder: "新聞主題 + 記者過往報導 + 為何相關", type: "textarea" },
    inputs: [{ key: "context", label: "Pitch 脈絡", type: "textarea", required: true }],
    systemPrompt: `產出 media pitch email（120-200 字）。
結構：subject 30 字內 → 第一句 personalize（提到他過去寫的 XX 文章）→ 我們有 X，跟你寫的 Y 有什麼關係 → 1 個 hook 數字 → 我可以提供（採訪 / 獨家 / 數據）→ 期限。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-crisis-statement",
    tier: "30s", postType: "press-release",
    label: "危機聲明",
    description: "資安 / 召回 / 客訴等危機事件的對外聲明",
    agent_id: 180182, skill_slug: "media-relations",
    primary_question: "危機事件是？已知事實 + 已採取行動？",
    primary_input: { key: "context", placeholder: "事件 + 影響範圍 + 已採取的行動", type: "textarea" },
    inputs: [{ key: "context", label: "危機資訊", type: "textarea", required: true }],
    systemPrompt: `產出危機聲明（200-350 字）。
結構：1 句承認事件 + 致歉 → 已知事實（具體、不含糊）→ 已採取的行動 → 後續承諾 + 時程 → 聯絡管道。
不要試圖淡化、不要找藉口、不要拖延。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-spokesperson-qa",
    tier: "30s", postType: "press-release",
    label: "發言人 Q&A（媒體採訪準備）",
    description: "預期記者會問什麼 + 標準答案",
    agent_id: 210266, skill_slug: "spokesperson",
    primary_question: "新聞主題 + 預期會被質疑的點？",
    primary_input: { key: "context", placeholder: "主題 + 你擔心被問的尖銳問題", type: "textarea" },
    inputs: [{ key: "context", label: "主題 + 痛點", type: "textarea", required: true }],
    systemPrompt: `產出媒體 Q&A（5-8 組）。每變體 1 種風格（防禦型 / 透明型 / 主動引導型）。
結構：Q: [問題] / A: [80 字內答案，含具體事實 / 數字 / 不繞 / 不空話]
針對最尖銳的問題練最仔細。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-launch-social",
    tier: "30s", postType: "press-release",
    label: "新聞發布同步社群文",
    description: "新聞稿發出當天同步發 FB/LI 的引導文",
    agent_id: 180193, skill_slug: "press",
    primary_question: "新聞主題 + 想讓社群點進新聞稿做什麼？",
    primary_input: { key: "context", placeholder: "新聞核心 + CTA", type: "textarea" },
    inputs: [{ key: "context", label: "新聞 + CTA", type: "textarea", required: true }],
    systemPrompt: `產出新聞同步社群文（每變體 1 個平台口吻：FB / LinkedIn / Threads）。
規則：100-200 字、第一句鉤子（不要"我們今天宣布..."）、含 1 個數字或名字、CTA 連結到完整新聞稿。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
];

const VINCENT_ID = 60011;
export const PR_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "pr-30-headline":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["事實式", "突破式", "數據式"], captionMinChars: 20, captionMaxChars: 50 },
  "pr-30-subhead":            { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["影響面", "規模延伸", "時程感"], captionMinChars: 30, captionMaxChars: 80 },
  "pr-30-lead-paragraph":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["事實密度型", "影響面型", "故事感型"], captionMinChars: 80, captionMaxChars: 200 },
  "pr-30-ceo-quote":          { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["願景式", "客戶價值", "市場觀察"], captionMinChars: 60, captionMaxChars: 150 },
  "pr-30-boilerplate":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["產品導向", "規模導向", "里程碑導向"], captionMinChars: 150, captionMaxChars: 300 },
  "pr-30-fact-sheet":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["產品優先", "公司優先", "市場優先"], captionMinChars: 200, captionMaxChars: 600 },
  "pr-30-media-pitch":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["共同議題切入", "獨家數據切入", "採訪邀請切入"], captionMinChars: 100, captionMaxChars: 250 },
  "pr-30-crisis-statement":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["克制", "標準", "全面承諾"], captionMinChars: 200, captionMaxChars: 400 },
  "pr-30-spokesperson-qa":    { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["防禦型", "透明型", "主動引導"], captionMinChars: 300, captionMaxChars: 1000 },
  "pr-30-launch-social":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: VINCENT_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["FB 口吻", "LinkedIn 口吻", "Threads 口吻"], captionMinChars: 100, captionMaxChars: 250 },
};

export function getPROrchestraConfig(taskId: string): OrchestraConfig | null {
  return PR_30S_ORCHESTRA[taskId] ?? null;
}
