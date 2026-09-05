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
    label: { en: "YT Video Titles (3 Strategies)", zh: "YT 影片標題（3 種策略）" },
    description: { en: "SEO-friendly / contrast-number / curiosity — one of each", zh: "SEO 友善 / 反差數字 / 懸念式 各 1 種" },
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
    label: { en: "YT Thumbnail Copy + Visual Brief", zh: "YT 縮圖文案 + 視覺需求" },
    description: { en: "Big thumbnail text (5-8 chars) + overall visual direction", zh: "縮圖大字（5-8 字）+ 整體視覺風格方向" },
    agent_id: 30014, // Nina Liu — YouTube Script Creator (1929 char persona)
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
    label: { en: "YT Description — Full SEO Version", zh: "YT 說明欄 SEO 完整版" },
    description: { en: "With timestamps / links / hashtags / tags", zh: "含時間戳 / 連結 / hashtag / tags" },
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
    label: { en: "YT Chapter Timeline (Auto-Chaptering) ⭐", zh: "YT 章節時間軸（自動切章節）⭐" },
    description: { en: "Paste a video URL → auto-chapter timestamps from the transcript", zh: "貼影片網址 → 自動從 transcript 切章節時間戳" },
    agent_id: 223993, // Pin-Chen Yang — YouTube Marketing Strategist 醫材 (1033 char)
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
    label: { en: "YT Shorts Script (30–60s)", zh: "YT Shorts 腳本（30-60s）" },
    description: { en: "hook → 3 segments → CTA structure", zh: "hook → 3 段內容 → CTA 結構" },
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
    label: { en: "YT Opening Hook (First 15s)", zh: "YT 開場鉤子（前 15 秒）" },
    description: { en: "VO + captions + camera direction", zh: "口播 + 字幕 + 鏡頭" },
    agent_id: 224007, // YouTube Marketing Strategist 跨產業 (~1000 char)
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
    label: { en: "YT End CTA + End Screen", zh: "YT 結尾行動呼籲 + 片尾畫面" },
    description: { en: "Subscribe / bell / next-video / comment prompts", zh: "訂閱 / 鈴鐺 / 推薦下一片 / 留言引導" },
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
    label: { en: "YT Comment Reply", zh: "YT 留言互動回覆" },
    description: { en: "5 voices: fans / complaints / peers / skeptics / lurkers", zh: "5 種口吻：粉絲 / 客訴 / 同行 / 質疑 / 沉默" },
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
    label: { en: "YT Pinned Comment (Discussion Hook)", zh: "YT 釘選留言（鉤子引討論）" },
    description: { en: "The first pinned comment after publish — spark the discussion", zh: "影片發布後第一個釘留言，引討論" },
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
    label: { en: "YT Community Post (Community Tab)", zh: "YT 社群貼文（社群分頁）" },
    description: { en: "3 types: text / poll / teaser", zh: "文字 / 民調 / 預告 3 種型" },
    agent_id: 180186, // Mark Yang — KOL Partnership Specialist
    skill_slug: "youtube-publisher",
    primary_question: "今天想在 Community tab 講什麼？",
    primary_input: { key: "topic", placeholder: "例：下集預告 / 問粉絲想看什麼 / 幕後", type: "textarea" },
    inputs: [{ key: "topic", label: "貼文主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 社群貼文（每變體 1 種型態）。

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
  // 2026-08-01 (CJ「參考 HeyGen 重新設計 YT 分類」影片層): YT 第一個真的會動
  // 的任務。跟 TikTok 的 tt-30-product-hero 系列同一套 Kling i2v 機制，刻意
  // 選「乾淨開場畫面」而非「產品主視覺」— 不是每個 OnBrand 品牌都是電商，
  // 但每個 YT Shorts 都需要一個能抓住前 1-2 秒的開場畫面，泛用性最高。
  {
    id: "yt-30-shorts-clip",
    tier: "30s",
    postType: "shorts",
    label: { en: "YT Shorts Opening Clip (Real Video) ⭐", zh: "YT Shorts 開場動態片段（真的會動）⭐" },
    description: { en: "AI renders an actual moving vertical clip for your Short's opening — not a script, a usable video asset", zh: "AI 直接生成一支會動的直式短片，不是腳本文字，是可以直接用的開場素材" },
    agent_id: 60030, // Boyu Hsu — YouTube Short Video Scriptwriter（同 yt-30-shorts-script，畫面人設延續）
    skill_slug: "youtube-shorts-automation",
    primary_question: "這支 Shorts 的開場畫面想呈現什麼？",
    primary_input: { key: "scene_desc", placeholder: "例：產品在自然光下的質感特寫 / 手沖咖啡的蒸氣瞬間", type: "textarea" },
    inputs: [{ key: "scene_desc", label: "開場畫面描述", type: "textarea", required: true }],
    systemPrompt: `產出 YT Shorts 開場片段的貼文文案（會搭配一支真的會動的直式短片）。每變體 1 種切角。
規則：
- 第一句就是鉤子，前 1-2 秒要抓住人（Shorts 演算法看開頭留存率）。
- 文案要描述「畫面本身」而不是規格條列 — 讓人一看就知道會看到什麼動態。
- 60-120 字。
${YT_TONE_SUFFIX}
image_style_direction.summary 給這支片開場畫面的視覺風格（構圖、光線、主體，會直接拿去生成第一格畫面）。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "youtube", post_type: "shorts" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "yt-30-live-test-demo",
    tier: "30s",
    postType: "video",
    label: { en: "Video: Turn the Claim Into a Live Test", zh: "YT 影片：把宣稱做成一場實測" },
    description: { en: "Prove the spec instead of stating it", zh: "不講規格，當場證明給人看" },
    agent_id: 224000,              // 沿用同 postType 現役卡
    skill_slug: "youtube-content",
    source: {
      type: "viral",
      short: "Volvo Trucks「Epic Split」",
      metric: "首日 650 萬次觀看，累計逾 5,900 萬",
      asOf: "2013-11",
      takeaway:
        "把規格變成一場有風險的實測——觀眾看的是「會不會失敗」，規格只是失敗的條件。",
    },
    primary_question: "你們有哪一項規格，可以當場做給人看？",
    primary_input: { key: "topic", placeholder: "例：防水到可以泡水 24 小時 / 轉向精準到能走鋼索", type: "textarea" },
    inputs: [
      { key: "topic", label: "想證明的規格", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支「當場實測」的 YouTube 影片腳本，把品牌宣稱變成一場看得到成敗的測試。

結構：
1. 開場 10 秒：講清楚要測什麼、失敗會怎樣。失敗的後果要具體、要看得見。
2. 設置：為什麼這個測法算數（誰在場、怎麼確保沒有作假）。
3. 執行：逐段描述畫面，保留真實的緊張感，不要旁白劇透。
4. 結果：不論成敗都照實呈現。成功不要歡呼，讓畫面自己說。

硬規則：
- 測試必須有真的失敗可能，安排好一定會成功的表演不算實測。
- 不要在腳本裡列規格表，規格只以「測試條件」的身分出現一次。
- 沒有實際做過的測試，在開場註明這是提案腳本。`,
    preferredModel: "qwen",
    maxTokens: 1980,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  {
    id: "yt-30-premiere-countdown-room",
    tier: "30s",
    postType: "premiere",
    label: { en: "Premiere: Make the Wait a Party", zh: "YT 首映：把等待變成聚會" },
    description: { en: "The waiting room is the content", zh: "首映前的聊天室就是內容" },
    agent_id: 223995,              // 沿用同 postType 現役卡
    skill_slug: "shorts-scriptwriter",
    source: {
      type: "viral",
      short: "BTS「Butter」YouTube 首映",
      metric: "390 萬人同時在線，金氏世界紀錄",
      asOf: "2021-05",
      takeaway:
        "首映的價值在「同時」——把倒數期間的聊天室當成節目的一部分經營，人才會準時到，而不是事後補看。",
    },
    primary_question: "這次首映要播什麼？粉絲彼此之間有什麼共同語言？",
    primary_input: { key: "topic", placeholder: "例：新品發表 / 幕後紀錄片；粉絲會刷的那句話", type: "textarea" },
    inputs: [
      { key: "topic", label: "首映內容 + 粉絲的共同語言", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一場 YouTube 首映（Premiere），重點是「首映前 30 分鐘」怎麼經營。

要產出：
1. 倒數畫面上要出現什麼（每 10 分鐘一次變化，共 3 段）。
2. 官方帳號在聊天室要丟的 5 句話，每句都要能引發回應而不是宣布事項。
3. 一個只有準時到場的人才拿得到的東西（暗號、限定圖、先看片段）。
4. 首映結束後 5 分鐘內要發的第一則留言。

硬規則：
- 不要用「即將開始，敬請期待」這種佔位話術。
- 那個「準時才有」的東西必須是真的做得到的，不要開空頭。
- 聊天室的話要短，長句在滾動的聊天室裡沒有人讀。`,
    preferredModel: "qwen",
    maxTokens: 1650,
    outputDefaults: { platform: "youtube", post_type: "premiere" },
  },
  {
    id: "yt-30-watch-mirror-test",
    tier: "30s",
    postType: "watch",
    label: { en: "Watch: Show People Their Own Gap", zh: "YT 長片：讓當事人看見自己的落差" },
    description: { en: "An experiment that changes the subject on camera", zh: "設計一個讓受訪者當場改變的實驗" },
    agent_id: 24,              // 沿用同 postType 現役卡
    skill_slug: "youtube-publisher",
    source: {
      type: "viral",
      short: "Dove「Real Beauty Sketches」",
      metric: "12 天內逾 5,000 萬次觀看、370 萬次分享",
      asOf: "2013-04",
      takeaway:
        "最會被分享的長片不是講品牌，是讓當事人在鏡頭前發現自己錯了——落差要由第三方揭露，品牌只負責設計那個裝置。",
    },
    primary_question: "你的顧客對自己有什麼誤解，是你能證明給他看的？",
    primary_input: { key: "topic", placeholder: "例：以為自己不會挑 / 以為自己需要更貴的", type: "textarea" },
    inputs: [
      { key: "topic", label: "顧客對自己的誤解", type: "textarea", required: true },
    ],
    systemPrompt: `你要設計一支長片實驗，讓參與者在鏡頭前看見自己的認知落差。

結構：
1. 裝置：設計一個能產生兩個版本的機制（自己說的 vs 別人說的、盲測 vs 看標籤、現在 vs 半年前）。
2. 過程：參與者不知道會被對照，全程自然。
3. 揭露：兩個版本並排出現的那一刻，不要旁白，讓表情說話。
4. 收束：一句話點出落差的意義，然後停住。

硬規則：
- 品牌全片不出現在畫面前面，最後才以極小的方式署名。
- 落差必須是真的，不能事先套招。
- 不要替參與者下結論，也不要煽情配樂指示以外的情緒指導。
- 如果實驗會讓參與者難堪，改設計——落差要能讓人變好，不是被消費。`,
    preferredModel: "qwen",
    maxTokens: 2420,
    outputDefaults: { platform: "youtube", post_type: "watch" },
  },
  {
    id: "yt-30-shorts-sound-brand",
    tier: "30s",
    postType: "shorts",
    label: { en: "Shorts: Make the Sound the Logo", zh: "YT Shorts：用聲音當記憶點" },
    description: { en: "Recognisable with the screen off", zh: "關掉畫面也認得出來的短片" },
    agent_id: 60030,              // 沿用同 postType 現役卡
    skill_slug: "youtube-shorts-automation",
    source: {
      type: "viral",
      short: "e.l.f.「#eyeslipsface」",
      metric: "6 天破 10 億次播放，當時史上最快",
      asOf: "2019-10",
      takeaway:
        "短影音的記憶點做在聲音上——畫面被滑走，聲音還會留在耳朵裡，而且別人翻拍時會自動帶著你的品牌。",
    },
    primary_question: "你的品牌可以有什麼固定的聲音？",
    primary_input: { key: "topic", placeholder: "例：一句口號的唸法 / 開罐聲 / 三個音的旋律", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以固定重複的聲音元素", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支 15-30 秒的 YouTube Shorts 腳本，核心是「一個會被記住並被翻拍的聲音」。

要產出：
1. 那個聲音是什麼（旋律、口號唸法、實際音效），描述到別人可以照做。
2. 聲音出現的時間點：開頭 3 秒內一次，結尾再一次，中間不要濫用。
3. 逐鏡腳本，每鏡標秒數 / 畫面 / 聲音 / 字卡。
4. 一句邀請別人用這個聲音翻拍的話。

硬規則：
- 聲音要短到 3 秒內能學會、能哼。
- 不要用有版權疑慮的既有歌曲，寫成可自製的描述。
- 字卡每行不超過 12 字。`,
    preferredModel: "qwen",
    maxTokens: 880,
    outputDefaults: { platform: "youtube", post_type: "shorts" },
  },
  {
    id: "yt-30-storyboard-one-take",
    tier: "30s",
    postType: "storyboard",
    label: { en: "Storyboard: One Take Through the Company", zh: "YT 分鏡：一鏡到底走完全公司" },
    description: { en: "One continuous shot that explains the business", zh: "用一個連續鏡頭把整個生意講完" },
    agent_id: 210220,              // 沿用同 postType 現役卡
    skill_slug: "youtube-content",
    source: {
      type: "viral",
      short: "Dollar Shave Club",
      metric: "48 小時 12,000 筆訂單，首小時官網被灌爆",
      asOf: "2012-03",
      takeaway:
        "一鏡到底逼你把話講清楚——沒有剪接可以躲，說不完就是想不清楚；而且觀眾知道這沒法造假。",
    },
    primary_question: "你的工作現場有什麼是可以一路走過去拍的？",
    primary_input: { key: "topic", placeholder: "例：從倉庫走到出貨口 / 從備料走到出餐", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以一路走完的現場動線", type: "textarea", required: true },
    ],
    systemPrompt: `你要畫一支「一鏡到底」的分鏡腳本，主角邊走邊講，把整個生意講完。

輸出格式：逐段標「秒數 / 鏡頭移動 / 畫面裡有什麼 / 主角這段講的話」。

結構：
1. 起點：從一個具體的物件或動作開始，不要從人臉開始。
2. 途中：每經過一個站點，帶出一件別人不知道的事實。至少 3 個站點。
3. 終點：停在成品或客人手上，講最後一句。

硬規則：
- 全程不能有剪接點，鏡頭移動要寫得出來（推、跟、繞）。
- 主角講的話要口語，不能是唸稿。
- 每個站點的事實必須是真的，寧可少一個站點。
- 不要出現字幕以外的動畫特效。`,
    preferredModel: "qwen",
    maxTokens: 1980,
    outputDefaults: { platform: "youtube", post_type: "storyboard" },
  },
  {
    id: "yt-30-thumbnail-one-object",
    tier: "30s",
    postType: "thumbnail",
    label: { en: "Thumbnail: Leave One Thing on Screen", zh: "YT 縮圖：畫面上只留一個東西" },
    description: { en: "So bare it survives the scroll", zh: "極簡到滑動時無法忽略" },
    agent_id: 36,              // 沿用同 postType 現役卡
    skill_slug: "youtube-thumbnail",
    source: {
      type: "viral",
      short: "World Record Egg",
      metric: "逾 5,200 萬個讚，當時 IG 史上最多",
      asOf: "2019-02",
      takeaway:
        "縮圖的競爭對手不是別的縮圖，是滑動的手指——畫面越空，主體越大，越像一個錯誤，越有人停下來。",
    },
    primary_question: "這支影片最不尋常的那個畫面是什麼？",
    primary_input: { key: "topic", placeholder: "例：一顆蛋 / 空掉的貨架 / 一張手寫紙條", type: "textarea" },
    inputs: [
      { key: "topic", label: "影片裡最不尋常的畫面", type: "textarea", required: true },
    ],
    systemPrompt: `你要提出 3 組 YouTube 縮圖方案，每一組都只放一個主體。

每組要寫：
- 主體是什麼、佔畫面多少比例（不得低於 40%）。
- 背景（原則是純色或極簡，寫出顏色）。
- 疊字：最多 3 個字，或不放字。寫出為什麼這 3 個字夠。
- 為什麼這張在手機上縮到指甲大小時還認得出來。

硬規則：
- 不要放人臉張嘴的誇張表情，那已經是雜訊。
- 不要放兩個以上的主體，也不要放箭頭與紅圈。
- 縮圖承諾的東西，影片裡必須真的有。`,
    preferredModel: "qwen",
    maxTokens: 616,
    outputDefaults: { platform: "youtube", post_type: "thumbnail" },
  },
  {
    id: "yt-30-community-cliffhanger",
    tier: "30s",
    postType: "community",
    label: { en: "Community: Make Channel News Everyone's News", zh: "YT 社群：把頻道的事變成大家的事" },
    description: { en: "Let subscribers decide what happens next", zh: "讓訂閱者決定接下來發生什麼" },
    agent_id: 180186,              // 沿用同 postType 現役卡
    skill_slug: "youtube-publisher",
    source: {
      type: "viral",
      short: "Duolingo「Duo 之死」",
      metric: "兩週 17 億次自然曝光",
      asOf: "2025-02",
      takeaway:
        "社群貼文不是公告欄，是把頻道的決定權分一點出去——人會為自己投過票的結果回來看。",
    },
    primary_question: "頻道接下來有什麼決定，可以讓觀眾參與？",
    primary_input: { key: "topic", placeholder: "例：下一集拍什麼 / 要不要停更某系列 / 換不換片頭", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以交給觀眾決定的事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 YouTube 社群貼文，把頻道的一個決定交給訂閱者。

結構：
1. 第一句就講清楚要決定什麼，以及決定會造成什麼後果。
2. 給 2-3 個選項，每個選項都要有真實的代價（不能有一個明顯是對的）。
3. 說明什麼時候公布、依據什麼決定。
4. 承諾會照結果做。

硬規則：
- 不要問「你們想看什麼」這種沒有邊界的問題，給明確選項。
- 承諾了就要能做到，做不到的選項不要放進去。
- 120-300 字，手機上一眼讀完。`,
    preferredModel: "qwen",
    maxTokens: 660,
    outputDefaults: { platform: "youtube", post_type: "community" },
  },
  {
    id: "yt-30-videocard-single-action",
    tier: "30s",
    postType: "video-card",
    label: { en: "Card: One Card, One Action", zh: "YT 資訊卡：一張卡只要一個動作" },
    description: { en: "No second option while the card is up", zh: "卡片出現時，畫面上不要有第二個選擇" },
    agent_id: 30014,              // 沿用同 postType 現役卡
    skill_slug: "youtube-publisher",
    source: {
      type: "viral",
      short: "Coinbase QR 廣告",
      metric: "一分鐘內逾 2,000 萬次掃描，官方 App 當機約一小時",
      asOf: "2022-02",
      takeaway:
        "資訊卡跟畫面在搶同一雙眼睛——卡片出現的那幾秒，畫面與旁白都要停下來讓路，否則沒有人會點。",
    },
    primary_question: "你希望觀眾在影片中途做什麼？",
    primary_input: { key: "topic", placeholder: "例：跳到工具頁 / 領取檔案 / 看前一集", type: "textarea" },
    inputs: [
      { key: "topic", label: "希望觀眾在片中做的那一件事", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃影片中的資訊卡（Card）出現方式，讓它真的被點。

要產出 3 個方案，每個寫出：
- 卡片出現的時間點，以及為什麼是這一刻（觀眾此時剛好缺什麼）。
- 卡片出現的那 5 秒，畫面在做什麼、旁白在說什麼（原則是留白或直接指向）。
- 卡片文案，不超過 12 字。
- 不點的人會錯過什麼，用一句話講。

硬規則：
- 同一時間只出一張卡。
- 不要在片頭 30 秒內出卡，觀眾還沒決定要不要看。
- 卡片文案不要用「點這裡」，要講點了會得到什麼。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "youtube", post_type: "video-card" },
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
  // 2026-08-01: YT 第一個 runVideoGen=true 的設定，複製 tt-30-product-hero
  // 那一組已驗證的紀律 — variants/images=2（其他卡是 3），imageQualitySteps
  // 拉到 8（會被放大成整支影片的第一格，draft 品質會讓全片看起來很糟）。
  "yt-30-shorts-clip": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: YT_DIR_IRIS,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["質感特寫", "情境動態"], captionMinChars: 60, captionMaxChars: 120,
    runVideoGen: true, videoDurationSec: 5,
    videoMotionHint:
      "Slow cinematic push-in with gentle parallax, soft light drifting across " +
      "the frame. Steady camera, minimal motion — built to hold attention in " +
      "the first 1-2 seconds of a Short.",
  },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "yt-30-live-test-demo": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["實測版", "對照組版", "素人挑戰版"],
    captionMinChars: 400, captionMaxChars: 900,
  },
  "yt-30-premiere-countdown-room": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["倒數版", "解謎版", "應援版"],
    captionMinChars: 350, captionMaxChars: 750,
  },
  "yt-30-watch-mirror-test": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["雙描述版", "盲測版", "時間差版"],
    captionMinChars: 500, captionMaxChars: 1100,
  },
  "yt-30-shorts-sound-brand": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["原創旋律版", "招牌音效版", "口號節奏版"],
    captionMinChars: 150, captionMaxChars: 400,
  },
  "yt-30-storyboard-one-take": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["動線版", "交接版", "逆向版"],
    captionMinChars: 400, captionMaxChars: 900,
  },
  "yt-30-thumbnail-one-object": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["單一主體版", "反常版", "留白版"],
    captionMinChars: 100, captionMaxChars: 280,
  },
  "yt-30-community-cliffhanger": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["投票版", "求救版", "公開帳本版"],
    captionMinChars: 120, captionMaxChars: 300,
  },
  "yt-30-videocard-single-action": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: YU_CHENG_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["停頓版", "懸念版", "補完版"],
    captionMinChars: 80, captionMaxChars: 220,
  },
};

export function getYTOrchestraConfig(taskId: string): OrchestraConfig | null {
  return YT_30S_ORCHESTRA[taskId] ?? null;
}
