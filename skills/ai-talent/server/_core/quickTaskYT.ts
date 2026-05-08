/**
 * YouTube quick-task templates (2026-05-05).
 *
 * 10 YT 30s tasks. All caption_writer agents distinct from FB + IG (zero
 * overlap). Killer differentiator: every task accepts a YouTube video URL
 * and the orchestra auto-fetches metadata + transcript (via youtubeContext)
 * to inject into the LLM prompt — so e.g. "章節時間軸" can auto-segment a
 * 1-hour podcast into chapters in 30 seconds.
 */

import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const YT_TONE_SUFFIX = `
語氣要求：YouTube 觀眾喜歡資訊密度高 + 一點玩味。不要寫成業配文。
品牌語氣若 system context 已給，務必貼合。`;

// ─── 30s tier (10 tasks) ────────────────────────────────────────────────────

export const YT_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "yt-30-title-strategies",
    tier: "30s",
    postType: "watch",
    label: "YT 影片標題（3 種策略）",
    description: "SEO 友善 / 反差數字 / 懸念式 各 1 種",
    agent_id: 24, // Janet Chang — YouTube Strategist
    skill_slug: "youtube-publisher",
    primary_question: "貼影片網址（會自動讀取）或描述影片主題",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  影片主題描述", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "影片網址或主題", type: "textarea", required: true }],
    systemPrompt: `產出 YouTube 影片標題建議。
caption 結構：給 5 種不同策略各 1 個標題（每個 60 字元內）：
  1. SEO 友善（含主關鍵字 + 高搜尋詞）
  2. 反差式（"我以為 X，結果發現 Y"）
  3. 數字式（含具體數字 / 排行）
  4. 懸念式（拋問題不立刻給答案）
  5. 直球式（直接說價值，不繞）
caption 用 markdown 1. 2. 3. 列出，每個標題後加 1 句說明該策略為何選這個。
${YT_TONE_SUFFIX}
另外給 image_style_direction.summary（縮圖風格 16:9）。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-thumbnail-text",
    tier: "30s",
    postType: "video-card",
    label: "YT 縮圖文案 + 視覺 brief",
    description: "縮圖大字（5-8 字）+ 整體視覺風格方向",
    agent_id: 36, // Nina Yeh — YouTube Scriptwriter
    skill_slug: "youtube-publisher",
    primary_question: "貼影片網址或描述影片主題",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  影片主題", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "影片網址或主題", type: "textarea", required: true }],
    systemPrompt: `產出 YouTube 縮圖大字。caption 只放**用戶會疊在縮圖上的那幾個字**，視覺風格由另一位 agent 獨立處理（不要寫進 caption）。

caption 結構（每變體 1 種）：
  主大字（5-8 字，最大那個字）
  輔字（可選，1-3 字，例：「→」「！」「？」等強調）
  推薦理由（1 句解釋為何選這個切角）

絕對不要寫：字體建議 / 色塊建議 / 人臉建議 / 構圖建議 — 那些是視覺 agent 的事。
${YT_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "youtube", post_type: "video-card" },
  },
  {
    id: "yt-30-description-seo",
    tier: "30s",
    postType: "watch",
    label: "YT description SEO 完整版",
    description: "含時間戳 / 連結 / hashtag / tags",
    agent_id: 30013, // Eric Chen — SEO Content Writer
    skill_slug: "seo-content-engine",
    primary_question: "貼影片網址（會自動讀取）或描述影片主題",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  影片主題", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "影片網址或主題", type: "textarea", required: true }],
    systemPrompt: `產出 YouTube description（SEO 完整版）。
caption 結構：
  L1-2: 影片重點 hook（150 字內，含主關鍵字 1-2 次）
  L3: ▼ 章節時間戳（如有 transcript 可從 transcript 推估，否則寫 "[請填寫]"）
  L4: 🔗 重要連結（[請填寫] 1-3 條）
  L5: 📍 相關影片 / 播放清單（[請填寫]）
  L6-7: 5 個 hashtag + 5 個 tags
  L8: 訂閱 CTA + 鈴鐺提示

不要寫得像範本。每個欄位要根據用戶內容客製。
不需要 image_style_direction（description 不出現在縮圖）。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-chapter-timeline",
    tier: "30s",
    postType: "watch",
    label: "YT 章節時間軸（自動切章節）⭐",
    description: "貼影片網址 → 自動從 transcript 切章節時間戳",
    agent_id: 180268, // Kevin Chiang — extract-youtube-transcript ⭐
    skill_slug: "extract-youtube-transcript",
    primary_question: "貼 YouTube 影片網址（系統會自動抓字幕）",
    primary_input: { key: "url", placeholder: "https://youtu.be/...", type: "text" },
    inputs: [{ key: "url", label: "影片網址", type: "text", required: true }],
    systemPrompt: `任務：用戶貼了一支 YT 影片。orchestra 已抓到字幕逐字稿（transcript）。
你要根據 transcript 內容把影片切成 5-10 個章節，每個章節給時間戳 + 標題。

caption 結構：
\`\`\`
00:00 - [章節 1 標題：5-15 字，要有資訊量]
01:23 - [章節 2 標題]
03:45 - [章節 3 標題]
...
\`\`\`

規則：
- 標題不要 "前言" / "結論" 這種無聊詞，要寫該章節真的講什麼
- 時間戳用 transcript 提供的真實秒數（換算 mm:ss）
- 章節長度均勻（每段 1-3 分鐘理想）

如果 transcript 沒抓到，告訴用戶 "這支影片沒有字幕可抓 — 請先給字幕或主題"。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-shorts-script",
    tier: "30s",
    postType: "shorts",
    label: "YT Shorts 腳本（30-60s）",
    description: "hook → 3 段內容 → CTA 結構",
    agent_id: 60030, // Boyu Hsu — YouTube Short Video Scriptwriter
    skill_slug: "youtube-shorts-automation",
    primary_question: "Shorts 想講什麼？貼影片網址或主題都可",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  Shorts 主題", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "Shorts 主題或長片網址", type: "textarea", required: true }],
    systemPrompt: `產出 YT Shorts 腳本（30-60 秒）。如果用戶給的是長片網址 + 已抓 transcript，從原片精煉成 Shorts。

caption 結構：
[0-3s] HOOK（口播 + 字幕 + 視覺）
[3-15s] 承諾 + 第 1 個重點
[15-35s] 第 2 個重點 + 第 3 個重點
[35-50s] 反差 / 高潮
[50-60s] CTA（看完整版 / 訂閱）

每段都寫：口播原話、螢幕字幕、鏡頭建議。
不要 "大家好" 開頭。不要「最後」結尾。
${YT_TONE_SUFFIX}
image_style_direction.summary 給縮圖風格（9:16）。`,
    preferredModel: "qwen",
    maxTokens: 1000,
    outputDefaults: { platform: "youtube", post_type: "shorts" },
  },
  {
    id: "yt-30-opening-hook",
    tier: "30s",
    postType: "watch",
    label: "YT 開場 hook（前 15 秒）",
    description: "口播 + 字幕 + 鏡頭",
    agent_id: 30014, // Nina Liu — YouTube Script Creator
    skill_slug: "youtube-publisher",
    primary_question: "影片網址或主題",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  影片主題", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "影片網址或主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 影片前 15 秒開場 hook。

caption 結構：
[0-3s]   第一句鉤子（口播）：[一句懸念 / 反差 / 數字]
         螢幕字幕：[搭配口播]
         鏡頭建議：[1 句]
[3-7s]   承諾：[告訴觀眾接下來會看到什麼]
         字幕：[搭配]
[7-15s]  自我介紹（精簡，5 秒內）+ 切入主題
         字幕 + 鏡頭

規則：第一句不要 "Hi 大家好我是..."，YouTube 演算法看頭 5 秒留存率，不要浪費。
${YT_TONE_SUFFIX}
image_style_direction.summary 給縮圖風格（16:9）。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-end-cta",
    tier: "30s",
    postType: "watch",
    label: "YT 結尾 CTA + End Screen",
    description: "訂閱 / 鈴鐺 / 推薦下一片 / 留言引導",
    agent_id: 30004, // Kevin Lin — YouTube Strategy PM
    skill_slug: "youtube-publisher",
    primary_question: "影片主題 / 你想引導觀眾做什麼",
    primary_input: { key: "intent", placeholder: "例：讓觀眾去看下集 / 訂閱 / 留言 / 點擊產品連結", type: "textarea" },
    inputs: [{ key: "intent", label: "結尾要引導什麼動作", type: "textarea", required: true }],
    systemPrompt: `產出 YT 影片結尾 CTA（最後 30-60 秒）。

caption 結構：
[結尾口播] 60-90 字，自然引導，不要 "謝謝收看請按讚訂閱開啟小鈴鐺" 範本
[End screen 配置]：
  ▢ 主推影片（左上 / 右上 / 中央）：[推薦哪一支 + 理由]
  ▢ 訂閱按鈕位置：[左下 / 右下]
  ▢ 播放清單：[要不要顯示 + 哪一個 list]
[釘選留言建議]：[一句適合釘的留言]

依用戶 intent 客製優先順序（intent 是 "看下集" 就主推下集影片，不要每個都塞）。
不需要 image_style_direction（end screen 是 video overlay）。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-comment-reply",
    tier: "30s",
    postType: "watch",
    label: "YT 留言互動回覆",
    description: "5 種口吻：粉絲 / 客訴 / 同行 / 質疑 / 沉默",
    agent_id: 180157, // Nina Cheng — Social Media Engagement Manager
    skill_slug: "community-manager",
    primary_question: "貼上原始留言 + 你想呈現什麼態度",
    primary_input: { key: "user_comment", placeholder: "整段留言貼進來", type: "textarea" },
    inputs: [{ key: "user_comment", label: "用戶留言", type: "textarea", required: true }],
    systemPrompt: `產出 YT 留言回覆（每變體 1 種口吻 / 情境）。

caption 規則：
- 30-100 字
- 先呼應對方訊息（不要罐頭「謝謝您」）
- 給 1 個有溫度的細節（你的真實看法 / 1 個額外資訊）
- 結尾不要結束話題

不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-pinned-comment",
    tier: "30s",
    postType: "watch",
    label: "YT 釘選留言（hook 引討論）",
    description: "影片發布後第一個釘留言，引討論",
    agent_id: 210252, // Chun-Hao Cheng — Senior YouTube Content Creator
    skill_slug: "youtube-publisher",
    primary_question: "影片網址或主題（系統會根據內容寫 hook 留言）",
    primary_input: { key: "topic_or_url", placeholder: "https://youtu.be/...  或  影片主題", type: "textarea" },
    inputs: [{ key: "topic_or_url", label: "影片網址或主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 影片釘選留言（創作者自己第一個留的 hook）。
caption 結構：每個變體寫 1 個不同策略的釘留言（80-150 字）：
  - 提問式：拋一個影片中提到的問題，引留言區討論
  - 補充式：補充影片中沒講完的細節
  - 反差式：「拍完後我才發現 X，跟影片中講的不一樣」
（依 variantLabels 順序）

要像創作者自己留的，不要像官方公告。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-community-post",
    tier: "30s",
    postType: "community",
    label: "YT 社群貼文（Community tab）",
    description: "文字 / 民調 / 預告 3 種型",
    agent_id: 180186, // Mark Yang — KOL Partnership Specialist
    skill_slug: "youtube-publisher",
    primary_question: "今天想在 Community tab 講什麼？",
    primary_input: { key: "topic", placeholder: "例：下集預告 / 問粉絲想看什麼 / 幕後", type: "textarea" },
    inputs: [{ key: "topic", label: "貼文主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT Community 貼文（每變體 1 種型態）。

caption 結構（每變體不同）：
變體 1（純文字型）：100-200 字情感 / 觀點貼文
變體 2（民調型）：1 個提問 + 4 個選項（適合 YT poll）
變體 3（預告型）：1-2 句 hook + 倒數 / 時間 + 邀請動作

YT Community 受眾比一般 IG 投入 — 可以用比較深度的內容（不像 IG Stories 那麼快拋）。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "youtube", post_type: "community" },
  },
];

// ─── Plan B Orchestra config ────────────────────────────────────────────────

const YU_CHENG_ID = 210220; // Yu-Cheng Chang — Senior Motion Graphics Designer (YT 主場)
// 2026-05-08: per-task unique image directors for YT
const YT_DIR_ERIC = 220731; // Eric Wu — Quantitative Research Designer
const YT_DIR_IRIS = 220732; // Iris Hung — Quantitative Research Designer
const YT_DIR_ROSS = 220733; // Ross Chou — Quantitative Research Designer

export const YT_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "yt-30-title-strategies": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: YU_CHENG_ID, aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 4,
    variantLabels: ["SEO 友善", "反差 + 數字", "懸念式"],
    captionMinChars: 200, captionMaxChars: 600,
  },
  "yt-30-thumbnail-text": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: YT_DIR_ERIC, aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 4,
    variantLabels: ["大字震撼型", "人臉表情型", "對比拼貼型"],
    captionMinChars: 100, captionMaxChars: 400,
  },
  "yt-30-description-seo": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["關鍵字密集型", "故事敘述型", "清單導向型"],
    captionMinChars: 400, captionMaxChars: 1500,
  },
  "yt-30-chapter-timeline": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["精簡 5 章", "標準 8 章", "細緻 12 章"],
    captionMinChars: 100, captionMaxChars: 1200,
  },
  "yt-30-shorts-script": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: YT_DIR_IRIS, aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["教學型", "故事型", "反差型"],
    captionMinChars: 300, captionMaxChars: 1000,
  },
  "yt-30-opening-hook": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: YT_DIR_ROSS, aspectRatio: "16:9", fluxSize: "landscape_16_9", imageQualitySteps: 4,
    variantLabels: ["懸念式", "數字 / 反差", "直球觀點"],
    captionMinChars: 150, captionMaxChars: 700,
  },
  "yt-30-end-cta": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["訂閱導向", "下集導向", "留言互動導向"],
    captionMinChars: 150, captionMaxChars: 600,
  },
  "yt-30-comment-reply": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["溫暖式", "幽默式", "深度回應"],
    captionMinChars: 30, captionMaxChars: 150,
  },
  "yt-30-pinned-comment": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["提問式", "補充式", "反差式"],
    captionMinChars: 80, captionMaxChars: 200,
  },
  "yt-30-community-post": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["純文字觀點", "民調型", "預告倒數型"],
    captionMinChars: 100, captionMaxChars: 400,
  },
};

export function getYTOrchestraConfig(taskId: string): OrchestraConfig | null {
  return YT_30S_ORCHESTRA[taskId] ?? null;
}
