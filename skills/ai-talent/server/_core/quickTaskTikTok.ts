/**
 * TikTok quick-task templates (2026-05-05).
 * 10 TT 30s tasks. All caption_writer agents distinct from FB+IG+YT pools.
 * image_director = Anna Tseng (180165, Visual Content Strategy Director).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const TT_SUFFIX = `
TikTok 觀眾極短專注力。前 1.5 秒沒抓到 = 滑掉。語氣要野、不要官腔。`;

export const TT_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "tt-30-opening-hook",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Opening Hook (First 3s)", zh: "TikTok 開場鉤子（前 3 秒）" },
    description: { en: "VO + overlay captions + camera direction", zh: "口播 + overlay 字幕 + 鏡頭" },
    agent_id: 30011,
    skill_slug: "short-video-script",
    primary_question: "這支 TikTok 想講什麼？",
    primary_input: { key: "topic", placeholder: "例：3 個被低估的 NotionAI 用法 / 我犯過的設計大錯", type: "textarea" },
    inputs: [{ key: "topic", label: "主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 前 3 秒 hook。每變體：
口播（10-20 字，第 0-1.5 秒就要吸住人）：
overlay 字幕（搭配口播，可比口播再簡短）：
鏡頭建議（1 句）：
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-full-script",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Full Script (30–60s)", zh: "TikTok 完整腳本（30-60s）" },
    description: { en: "hook → reveal → 3 segments → CTA", zh: "hook → reveal → 3 段內容 → CTA" },
    agent_id: 180167,
    skill_slug: "tiktok-content",
    primary_question: "想做什麼主題的 TikTok？",
    primary_input: { key: "topic", placeholder: "例：揭穿一個常見迷思", type: "textarea" },
    inputs: [{ key: "topic", label: "TikTok 主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 完整腳本（30-60 秒）。每變體：
[0-3s] HOOK
[3-8s] reveal / payoff promise
[8-25s] 3 段重點（每段 5 秒）
[25-40s] 反差或高潮
[40-60s] CTA
每段含：口播原話、字幕、鏡頭。${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-caption-rhythm",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Caption Rhythm (Timestamped)", zh: "TikTok 字幕節奏（時間戳版）" },
    description: { en: "Caption rhythm cut to the voiceover", zh: "跟著口播切的字幕節奏" },
    agent_id: 60033,
    skill_slug: "short-video-script",
    primary_question: "貼上你的口播稿（or TikTok 主題）",
    primary_input: { key: "voiceover", placeholder: "貼整段口播", type: "textarea" },
    inputs: [{ key: "voiceover", label: "口播稿 / 主題", type: "textarea", required: true }],
    systemPrompt: `把口播切成字幕節奏。每變體 1 種風格（標準 / 極簡 / 強調式）。每行：[Xs-Ys] 字幕文字
規則：每行字幕 6-10 字最佳；強調詞用全大寫或加 emoji；不要超過 3 行同時顯示。${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-bio-rewrite",
    tier: "30s",
    postType: "profile",
    label: { en: "TikTok Bio Rewrite", zh: "TikTok 個人簡介改寫" },
    description: { en: "80-char bio + emoji + link", zh: "80 字 bio + emoji + link" },
    agent_id: 220949,
    skill_slug: "tiktok-strategist",
    primary_question: "你 / 帳號是誰、做什麼、想吸引誰？",
    primary_input: { key: "context", placeholder: "簡介自己 + 想吸引的觀眾類型", type: "textarea" },
    inputs: [{ key: "context", label: "你的簡介", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok bio（80 字內）。每變體 1 種角度（專家定位 / 個性風格 / 結果導向）。
結構：L1 一句定位 / L2-3 1-2 個亮點 / L4 CTA（「📩 DM」/「👇」）
emoji 適度。`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "tiktok", post_type: "profile" },
  },
  {
    id: "tt-30-hashtag-set",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Hashtag Set", zh: "TikTok 主題標籤套組" },
    description: { en: "5-15 tiered hashtags", zh: "5-15 個 hashtag 分層" },
    agent_id: 222392,
    skill_slug: "tiktok-discoverability",
    primary_question: "TikTok 主題或利基領域",
    primary_input: { key: "topic", placeholder: "例：辦公室小知識 / 美妝測評", type: "textarea" },
    inputs: [{ key: "topic", label: "主題 / 利基", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 主題標籤套組（每變體不同策略）。
變體 1（fyp 大流量）：5 個 大 #fyp 系列 + 5 個產業熱門
變體 2（精準利基）：8 個 小眾高匹配
變體 3（趨勢搭便車）：3 個近期趨勢 + 3 個品牌 / 主題
caption 直接列 hashtag。`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-caption-description",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Caption (Description Field)", zh: "TikTok 文案（描述欄）" },
    description: { en: "Under-100-char description + CTA", zh: "100 字內描述 + CTA" },
    agent_id: 60055,
    skill_slug: "tiktok-ads",
    primary_question: "影片在講什麼？想引導什麼動作？",
    primary_input: { key: "context", placeholder: "影片內容 + 行動呼籲 目標", type: "textarea" },
    inputs: [{ key: "context", label: "內容 + 行動呼籲", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 描述欄文案（100 字內）。每變體 1 種口吻（懸念 / 直球 / 反差）。
結構：1 句鉤子 + 1 句補充 + 1 句 CTA。最後 1 行放 hashtag（5 個內）。`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-duet-angle",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Duet Angle Ideas", zh: "TikTok 合拍角度建議" },
    description: { en: "React to / build on / rebut a video", zh: "對某影片做反應 / 補充 / 反駁" },
    agent_id: 60031,
    skill_slug: "short-video-script",
    primary_question: "貼上要 duet 的影片網址 or 描述其內容",
    primary_input: { key: "target", placeholder: "TikTok 網址 or 影片描述", type: "textarea" },
    inputs: [{ key: "target", label: "對象影片", type: "textarea", required: true }],
    systemPrompt: `產出 duet 角度建議。每變體 1 種角度（共鳴反應 / 專業補充 / 反差吐槽）。
結構：你的口播（15-30 字）+ 你 side 鏡頭該做什麼（1 句）。`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-trend-remix",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Trend Remix", zh: "TikTok 熱門趨勢改編" },
    description: { en: "Turn an existing trend into your version", zh: "把現有 trend 改成你的版本" },
    agent_id: 210310,
    skill_slug: "trend-researcher",
    primary_question: "想搭便車的 trend / sound 是？",
    primary_input: { key: "trend", placeholder: "例：'oh no oh no oh no no no' / 某個對嘴 trend", type: "textarea" },
    inputs: [{ key: "trend", label: "熱門趨勢 / 配樂", type: "textarea", required: true }],
    systemPrompt: `產出 trend 改編建議。每變體 1 種（產業共鳴版 / 反差版 / 教育型）。
結構：你的版本 setup（口播 / 視覺 cue）+ punchline + 為何貼合 trend 的時機點。`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-comment-reply",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Comment Reply", zh: "TikTok 留言互動回覆" },
    description: { en: "Replies in 5 voices", zh: "5 種口吻回覆" },
    agent_id: 180158,
    skill_slug: "social-engagement",
    primary_question: "貼上要回的留言",
    primary_input: { key: "user_comment", placeholder: "用戶留言", type: "textarea" },
    inputs: [{ key: "user_comment", label: "用戶留言", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 留言回覆（30-80 字）。每變體 1 種口吻（同感 / 幽默 / 反問）。
TikTok 留言可短可長 — 簡潔有梗最好。`,
    preferredModel: "qwen", maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-live-opening",
    tier: "30s",
    postType: "live",
    label: { en: "TikTok Live 30-Second Opener", zh: "TikTok 直播開場 30 秒" },
    description: { en: "Opening lines + warm-up + CTA", zh: "開場詞 + 暖場 + CTA" },
    agent_id: 60073,
    skill_slug: "live-script",
    primary_question: "今晚直播主題",
    primary_input: { key: "topic", placeholder: "例：開箱新品 / Q&A / 試色", type: "textarea" },
    inputs: [{ key: "topic", label: "直播主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 直播開場 30 秒。
[0-10s] 開場（不要 "大家好"）
[10-20s] 暖場互動（明確說「在留言打 ___」）
[20-30s] 預告今晚會講什麼
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "tiktok", post_type: "live" },
  },
];

const ANNA_ID      = 180165; // Anna Tseng (主場)
const TT_DIR_YUNA  = 220721; // Yuna Chiang — Decision Design Consultant
const TT_DIR_GRANT = 220722; // Grant Yu — Decision Design Consultant
export const TT_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "tt-30-opening-hook":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: ANNA_ID, aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4, variantLabels: ["懸念", "反差", "直球"], captionMinChars: 30, captionMaxChars: 100 },
  "tt-30-full-script":       { variants: 3, images: 3, runImageGen: false, imageDirectorId: TT_DIR_YUNA, aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4, variantLabels: ["教學型", "故事型", "反差型"], captionMinChars: 200, captionMaxChars: 800 },
  "tt-30-caption-rhythm":    { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["標準", "極簡", "強調式"], captionMinChars: 100, captionMaxChars: 600 },
  "tt-30-bio-rewrite":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["專家定位", "個性風格", "結果導向"], captionMinChars: 50, captionMaxChars: 80 },
  "tt-30-hashtag-set":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["fyp 大流量", "精準利基", "趨勢搭便車"], captionMinChars: 0, captionMaxChars: 400 },
  "tt-30-caption-description":{ variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["懸念", "直球", "反差"], captionMinChars: 50, captionMaxChars: 100 },
  "tt-30-duet-angle":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["共鳴反應", "專業補充", "反差吐槽"], captionMinChars: 50, captionMaxChars: 200 },
  "tt-30-trend-remix":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["產業共鳴版", "反差版", "教育型"], captionMinChars: 80, captionMaxChars: 300 },
  "tt-30-comment-reply":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["同感式", "幽默式", "反問式"], captionMinChars: 30, captionMaxChars: 80 },
  "tt-30-live-opening":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: TT_DIR_GRANT, aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4, variantLabels: ["懸念", "互動", "直球"], captionMinChars: 100, captionMaxChars: 300 },
};

export function getTTOrchestraConfig(taskId: string): OrchestraConfig | null {
  return TT_30S_ORCHESTRA[taskId] ?? null;
}
