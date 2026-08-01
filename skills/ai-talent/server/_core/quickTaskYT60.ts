/**
 * YouTube 60s tier — production-package tasks (2026-05-06).
 * Mirrors FB60/IG60 multi-agent pattern. Image director: Nina Cheng (180157).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const NINA = 180157; // Nina Cheng — YT Visual Direction Lead

const YT_TONE = `
語氣要求：YouTube 觀眾會看完整片，可比 IG 詳細。
注意 SEO：title 含核心關鍵字、description 前 125 字最重要。`;

export const YT_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "yt-60-video-package",
    tier: "60s", postType: "video",
    label: { en: "YT Full Video Copy Pack", zh: "YT 影片完整文案包" },
    description: { en: "Title + description + chapters + 5 alternate titles + thumbnail style", zh: "Title + description + chapters + 5 個替代 title + 縮圖風格" },
    agent_id: 224000, // Yu-Chia Chen — YouTube Marketing Strategist 食品飲料 (~1000 char)
    skill_slug: "youtube-content",
    primary_question: "影片主題 / 賣點？",
    primary_input: { key: "topic", placeholder: "例：教學 / 開箱 / 評測", type: "textarea" },
    inputs: [{ key: "topic", label: "影片主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 影片完整文案包（title 50-60 字 / description 800-1500 字 / chapters）。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 1500,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  {
    id: "yt-60-shorts-script",
    tier: "60s", postType: "shorts",
    label: { en: "YT Shorts Full Script", zh: "YT Shorts 完整腳本" },
    description: { en: "Strategist plans the structure + 60-second script + thumbnail brief", zh: "Strategist 規劃結構 + 60 秒腳本 + 縮圖 brief" },
    agent_id: 223996, // Yu-Ting Su — YouTube Marketing Strategist B2B SaaS (1025 char)
    skill_slug: "shorts-scriptwriter",
    primary_question: "Shorts 主題？",
    primary_input: { key: "topic", placeholder: "教學 / 反差 / 揭密", type: "textarea" },
    inputs: [{ key: "topic", label: "Shorts 主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT Shorts 60 秒腳本（300-500 字）。
[0-3s] hook / [3-45s] hold / [45-60s] payoff + CTA。每段標時間戳。9:16 直式。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "youtube", post_type: "shorts" },
  },
  {
    id: "yt-60-thumbnail-suite",
    tier: "60s", postType: "thumbnail",
    label: { en: "YT Thumbnails — 5 Styles", zh: "YT 縮圖 5 種風格" },
    description: { en: "5 thumbnail visual directions + matching title variants", zh: "5 種縮圖視覺方向 + 配合的 title 變體" },
    agent_id: 36, // Nina Yeh | YouTube Scriptwriter
    skill_slug: "youtube-thumbnail",
    primary_question: "影片主題 / 縮圖要傳達什麼？",
    primary_input: { key: "topic", placeholder: "影片主題或關鍵畫面", type: "textarea" },
    inputs: [{ key: "topic", label: "縮圖主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 縮圖配套 title（每變體 30-50 字）+ 縮圖風格 brief。
title 高 CTR：數字、反問、反差、誇張詞配合畫面風格。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "youtube", post_type: "thumbnail" },
  },
  {
    id: "yt-60-series-3ep",
    tier: "60s", postType: "video",
    label: { en: "YT 3-Episode Series", zh: "YT 3 集系列" },
    description: { en: "Strategist designs a 3-episode arc + full captions for 3 videos + connected narrative", zh: "Strategist 設計 3 集弧 + 3 部影片完整 caption + 連貫敘事" },
    agent_id: 180509, // Nina Liu
    skill_slug: "youtube-content",
    primary_question: "想連載講什麼主題？",
    primary_input: { key: "story_topic", placeholder: "教程系列 / 故事系列 / 評測系列", type: "textarea" },
    inputs: [{ key: "story_topic", label: "系列主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 3 集系列其中 1 集（title 50 字 + description 600-1000 字）。
本集是「{label}」。集與集要有勾連。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  {
    id: "yt-60-community-post",
    tier: "60s", postType: "community",
    label: { en: "YT Community Post", zh: "YT 社群貼文" },
    description: { en: "5 community post types (poll / image / text / Q&A / teaser)", zh: "5 種社群貼文（投票 / 圖片 / 文字 / 問答 / 預告）" },
    agent_id: 180157, // Nina Cheng | Social Media Engagement Manager
    skill_slug: "youtube-community",
    primary_question: "Community 想傳達什麼？",
    primary_input: { key: "topic", placeholder: "新片預告 / 互動問答 / 幕後", type: "textarea" },
    inputs: [{ key: "topic", label: "社群主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 社群貼文（80-200 字）。
本次是「{label}」類型（投票 / 圖片 / 文字 / 問答 / 預告）。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "youtube", post_type: "community" },
  },
  {
    id: "yt-60-viral-rewrite",
    tier: "60s", postType: "video",
    label: { en: "YT Viral Video Rewrite", zh: "YT 爆款影片改寫" },
    description: { en: "Strategist maps the viral structure + brand rewrite + comparison table", zh: "Strategist 找原爆款結構 + 改寫為品牌版 + 對照表" },
    agent_id: 180545, // Chun-Hao Cheng
    skill_slug: "youtube-content",
    primary_question: "貼上爆款影片 title / 連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款 title / URL / 主題", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結", type: "textarea", required: true },
      { key: "brand_angle", label: "品牌切入角度", type: "textarea", required: false },
    ],
    systemPrompt: `產出 YT 爆款改寫（title + description 600-1000 字）。
保留原 hook 機制與結構，內容換成品牌自己的事。
${YT_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  // 2026-08-01 (CJ「參考 HeyGen 重新設計 YT 分類」分鏡圖層): 腳本→畫面之間
  // 缺一格。純文字腳本沒有畫面感，真的生影片又太貴太重 — 分鏡圖用既有的
  // runImageGen 靜圖引擎（跟縮圖包同一套機制），把腳本拆成 5 格會動的畫面
  // 推進，成本等同一個縮圖包，但拿到的是可以直接給拍攝或給影片素材參考的
  // 逐鏡頭視覺。
  {
    id: "yt-60-storyboard",
    tier: "60s", postType: "storyboard",
    label: { en: "YT Video Storyboard (Shot-by-Shot)", zh: "YT 影片分鏡圖（逐鏡頭）" },
    description: { en: "Script broken into 5 shots, each with an AI still frame + camera direction", zh: "腳本拆成 5 個鏡頭，每格配 AI 示意圖 + 運鏡指示" },
    agent_id: 210220, // Yu-Cheng Chang — Senior Motion Graphics Designer (YT 主場)
    skill_slug: "youtube-content",
    primary_question: "貼上腳本，或描述影片主題",
    primary_input: { key: "topic_or_script", placeholder: "貼上已有的腳本，或描述影片主題讓 AI 從頭規劃", type: "textarea" },
    inputs: [{ key: "topic_or_script", label: "腳本或影片主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 影片分鏡圖（storyboard）。把用戶提供的腳本或主題拆成 5 個鏡頭 —
這是同一支片的 5 格分鏡，依序推進（開場→建立→核心→高潮→收尾），不是 5 個互不相關的版本。

caption 結構（每格鏡頭）：
[鏡頭時長] 例：3-5 秒
[畫面] 1 句具體描述這格要拍什麼（給生圖 AI 當依據：主體、動作、背景、光線，越具體越好）
[口白／字幕] 這格搭配的口白或螢幕字幕（20-40 字）
[運鏡] 推軌 / 手持 / 固定 / 特寫 等 1 個鏡頭語言

鏡頭之間要有畫面連貫性（同一場景 / 同一主體的推進），不要 5 格各自獨立無關。
${YT_TONE}
image_style_direction.summary 給這一格畫面的視覺風格（構圖、色調、光線，會直接拿去生成這格畫面）。`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "youtube", post_type: "storyboard" },
  },
];

const NINA_FALLBACK = NINA; // 主場 video-package
// 2026-05-08 (CJ direction): per-task unique image directors for YT 60s
const YT60_DIR_LUKE  = 220734; // Luke Hsu — Quantitative Research Designer
const YT60_DIR_REINA = 220736; // Reina Yang — Quantitative Research Designer
const YT60_DIR_BLAKE = 220737; // Blake Yeh — Quantitative Research Designer
const YT60_DIR_RUTH  = 220739; // Ruth Chou — Quantitative Research Designer
const YT60_DIR_UMA   = 220740; // Uma Tsai — Quantitative Research Designer

export const YT_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "yt-60-video-package": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: NINA_FALLBACK,
    aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 8,
    imageModelOverride: "openai/gpt-image-2", // CJ: lock YT video cover to gpt-image-2
    variantLabels: ["教學版", "故事版", "數據版", "懸念版", "對比版"],
    captionMinChars: 400, captionMaxChars: 800,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "yt-60-shorts-script": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: YT60_DIR_LUKE,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["教學版", "反差版", "揭密版", "節奏版", "懸念版"],
    captionMinChars: 300, captionMaxChars: 500,
    strategistAgentId: 60033, // Yawen Yeh — E-commerce Short Video Scriptwriter (845 char)
    extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
  },
  "yt-60-thumbnail-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: YT60_DIR_REINA,
    aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 8,
    imageModelOverride: "openai/gpt-image-2", // CJ: lock YT thumbnail to gpt-image-2
    variantLabels: ["數字式", "反問式", "反差式", "誇張式", "懸念式"],
    captionMinChars: 30, captionMaxChars: 50,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "yt-60-series-3ep": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: YT60_DIR_BLAKE,
    aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 8,
    imageModelOverride: "openai/gpt-image-2", // CJ: lock YT series cover to gpt-image-2
    variantLabels: ["第 1 集", "第 2 集", "第 3 集"],
    captionMinChars: 350, captionMaxChars: 700,
    strategistAgentId: 30014, // Nina Liu — YouTube Script Creator (1929 char)
    postLabels: ["第 1 集", "第 2 集", "第 3 集"],
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "yt-60-community-post": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: YT60_DIR_RUTH,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["投票式", "圖片式", "文字式", "問答式", "預告式"],
    captionMinChars: 80, captionMaxChars: 200,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "yt-60-viral-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: YT60_DIR_UMA,
    aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 4,
    imageModelOverride: "openai/gpt-image-2", // CJ: lock YT viral-rewrite cover to gpt-image-2
    variantLabels: ["保結構式", "情感放大式", "反差式", "數據式", "故事式"],
    captionMinChars: 350, captionMaxChars: 700,
    strategistAgentId: 180158, // Oliver Fang — Social Media Analytics Specialist (1697 char)
    specialtyAgentId: 180591, // Samantha Anderson — General Counsel (2199 char)
    extras: { compareTable: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  // 2026-08-01: variants 在這裡代表「5 格鏡頭」而非 5 個互斥版本 — 跟其他
  // yt-60 任務語意不同，但沿用同一顆 runImageGen 引擎最划算（不需要新機制）。
  "yt-60-storyboard": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: YT60_DIR_REINA,
    aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 8,
    variantLabels: ["鏡頭 1 開場", "鏡頭 2 建立", "鏡頭 3 核心", "鏡頭 4 高潮", "鏡頭 5 收尾"],
    captionMinChars: 60, captionMaxChars: 150,
  },
};

export function getYT60Template(taskId: string): FBTaskTemplate | null {
  return YT_60S_TASKS.find((t) => t.id === taskId) ?? null;
}
export function getYT60OrchestraConfig(taskId: string): OrchestraConfig | null {
  return YT_60S_ORCHESTRA[taskId] ?? null;
}
