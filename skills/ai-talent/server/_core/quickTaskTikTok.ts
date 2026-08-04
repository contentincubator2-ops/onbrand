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

  // ── Tier 1 影片任務卡（2026-07-29 CJ「模仿 TikTok 產品影片類型」）─────
  //
  // 這四張是全站第一批「真的會產出影片」的任務卡，不是只給腳本。
  // 共同設計原則：全部 FACELESS（畫面上沒有人在講話）。
  // 原因是技術邊界而不是偏好 —— 對嘴目前不可用（PiAPI 方案擋掉 kling
  // lip_sync、Hedra 註冊項是壞的），所以任何需要「嘴巴對上聲音」的格式
  // （UGC 見證、創辦人直述、反應影片）都不在 Tier 1，留給 Tier 3。
  //
  // 影片來源一律是「這張卡自己生的靜圖 → Kling i2v」，因此當任務 scope
  // 在某個產品上時，Nano Banana 的真實產品合成會一路帶到影片第一格，
  // 產品是真的而不是 AI 幻想出來的。
  {
    id: "tt-30-product-hero",
    tier: "30s",
    postType: "foryou",
    label: { en: "Product Hero Clip (vertical video)", zh: "產品主視覺短片（直式影片）" },
    description: { en: "Real vertical clip — product hero shot", zh: "真的會產出直式影片・產品主視覺" },
    agent_id: 180167,
    skill_slug: "tiktok-content",
    primary_question: "要主打哪個產品？它最想被看見的一點是什麼？",
    primary_input: { key: "topic", placeholder: "例：無螢幕兒童有聲故事年卡 / 主打睡前陪伴", type: "textarea" },
    inputs: [{ key: "topic", label: "產品 + 主打賣點", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 產品短片的貼文文案（會搭配一支直式產品短片）。每變體 1 種切角。
規則：
- 第一句就是鉤子，前 1.5 秒要抓住人。
- 文案在描述「這個產品在畫面上看起來是什麼樣子、為什麼值得停下來看」。
- 不要寫成規格表，要寫成一個畫面。
- 60-120 字。
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-product-asmr",
    tier: "30s",
    postType: "foryou",
    label: { en: "Product ASMR Clip", zh: "產品 ASMR 短片" },
    description: { en: "Real vertical clip — macro texture, no voiceover", zh: "真的會產出直式影片・材質特寫免口播" },
    agent_id: 30011,
    skill_slug: "short-video-script",
    primary_question: "要拍哪個產品的質感 / 觸感？",
    primary_input: { key: "topic", placeholder: "例：故事書封面紙質 / 開盒瞬間", type: "textarea" },
    inputs: [{ key: "topic", label: "產品 + 想強調的質感", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok ASMR 產品短片的貼文文案。每變體 1 種切角。
規則：
- ASMR 影片沒有口播，文案要補上「聲音的想像」（例：紙頁翻動的沙沙聲）。
- 描述觸感、材質、光線，讓人有想伸手摸的感覺。
- 短、慢、有節奏感。40-90 字。
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-text-hook-card",
    tier: "30s",
    postType: "foryou",
    label: { en: "Text Hook Card (trending audio)", zh: "字卡鉤子短片（搭熱門音樂）" },
    description: { en: "Real vertical clip — clean bg for text overlay", zh: "真的會產出直式影片・乾淨底圖疊字" },
    agent_id: 60033,
    skill_slug: "short-video-script",
    primary_question: "想讓觀眾看到的那一句話是什麼？",
    primary_input: { key: "topic", placeholder: "例：別再用手機哄睡了", type: "textarea" },
    inputs: [{ key: "topic", label: "主張 / 想講的一句話", type: "textarea", required: true }],
    // 2026-08-02 收緊：初版只限制「每行 ≤14 字」卻沒限制總行數與總字數，
    // captionMaxChars 又放到 120，模型就寫成 9 行 105 字的完整貼文 ——
    // 疊到 5 秒的片上觀眾根本讀不完。字卡的交付物是「會被逐句疊上畫面的
    // 那幾行字」，不是一篇貼文，所以行數與總長都必須是硬上限。
    systemPrompt: `你要產出的是「會被逐句疊在 5 秒短影音畫面上的字卡文字」，不是貼文。每變體 1 種語氣。

硬性規則（違反就是失敗）：
- **必須輸出 4 行**，用換行分隔（JSON 字串內用 \\n）。1 行 = 失敗。
- **每一行 6-12 字**。超過 12 字的行 = 失敗（一行太長，觀眾來不及讀）。
- 第 1 行是主鉤子，要能單獨成立、夠嗆或夠有共鳴。
- 第 2-4 行逐句推進，每行都能單獨看懂，不要跨行斷句。
- 只輸出這 4 行字，不要編號、不要說明、不要引號。

形狀長這樣（○ 代表字，**只照抄形狀，不要照抄任何內容**）：
○○○○○○○
○○○○○○○○○
○○○○○○
○○○○○○○○

為什麼：這幾行會被逐句疊在 5 秒的畫面上，一行太長就讀不完，全部擠成一行就無法逐句出現。
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    // 分鏡表層 —— 腳本與模擬影片之間的橋。用戶已經有腳本、還不想燒錢生片時，
    // 先看 5 格畫面確認方向對不對。沿用 yt-60-storyboard 的 cardsKind 機制。
    id: "tt-30-storyboard",
    tier: "30s",
    postType: "storyboard",
    label: { en: "TikTok Storyboard (5 shots)", zh: "TikTok 分鏡表（5 格鏡頭）" },
    description: { en: "Script split into 5 vertical shots, each with an AI frame", zh: "腳本拆 5 個直式鏡頭，每格配 AI 示意圖" },
    agent_id: 180167,
    skill_slug: "tiktok-content",
    primary_question: "貼上你的腳本，或描述這支影片想拍什麼",
    primary_input: { key: "topic_or_script", placeholder: "貼上已有腳本，或描述主題讓 AI 從頭規劃", type: "textarea" },
    inputs: [{ key: "topic_or_script", label: "腳本或影片主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 直式短影音的分鏡表。把用戶的腳本或主題拆成 5 個鏡頭 ——
這是同一支片依序推進的 5 格（鉤子→鋪陳→核心→轉折→CTA），不是 5 個互不相關的版本。

每格鏡頭要寫：
[鏡頭時長] 例：0-3 秒
[畫面] 1 句具體描述這格拍什麼（主體、動作、背景、光線，越具體越好 —— 這句會直接拿去生圖）
[口白／字幕] 這格的口白或螢幕字幕（15-30 字）
[運鏡] 手持 / 固定 / 特寫 / 推近 等 1 個鏡頭語言

直式 9:16 構圖，主體必須放在畫面中央偏上（下方會被 TikTok UI 蓋住）。
鏡頭之間要有連貫性（同場景、同主體的推進），不要 5 格各自獨立。
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "tiktok", post_type: "storyboard" },
  },
  {
    id: "tt-30-before-after",
    tier: "30s",
    postType: "foryou",
    label: { en: "Before / After Clip", zh: "Before / After 對比短片" },
    description: { en: "Real vertical clip — problem-to-solution reveal", zh: "真的會產出直式影片・痛點到解方" },
    agent_id: 60031,
    skill_slug: "short-video-script",
    primary_question: "用了之後，什麼事情變得不一樣了？",
    primary_input: { key: "topic", placeholder: "例：睡前battle 40 分鐘 → 聽故事 10 分鐘睡著", type: "textarea" },
    inputs: [{ key: "topic", label: "使用前的狀況 → 使用後的改變", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok Before/After 對比短片的文案。每變體 1 種切角。
規則：
- 先把「之前有多痛」寫具體（有畫面、有時間、有情緒），不要抽象。
- 再寫「之後」，改變要可被看見，不要用「變得更好」這種空話。
- 不要誇大成療效或保證，只描述真實可發生的日常改變。
- 60-120 字。
${TT_SUFFIX}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
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

  // ── Tier 1 影片卡 ────────────────────────────────────────────────────
  // 這四張是全站唯一 runVideoGen=true 的設定。三個刻意的選擇：
  //
  // variants/images = 2（其他卡都是 3）：每個 variant 要跑一支 Kling i2v，
  //   實測一支 ~150 秒且要真金白銀。2 支平行 ≈ 一樣的牆鐘時間但成本砍
  //   三分之一。少而好，不是多而濫。
  // runImageGen=true：影片的第一格就是這張靜圖，靜圖必須真的算出來。
  // imageQualitySteps 提高到 8：這張圖會被放大成整支影片的基底，
  //   draft 品質的圖會讓整支片看起來很糟。
  "tt-30-product-hero": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["質感特寫", "情境使用"], captionMinChars: 60, captionMaxChars: 120,
    runVideoGen: true, videoDurationSec: 10,
    videoMotionHint:
      "Slow cinematic push-in on the product with gentle parallax. Soft light " +
      "drifts across the surface. The product stays perfectly still and intact.",
  },
  "tt-30-product-asmr": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["材質特寫", "開箱瞬間"], captionMinChars: 40, captionMaxChars: 90,
    runVideoGen: true, videoDurationSec: 5,
    videoMotionHint:
      "Extreme macro close-up. Very slow drift across the product surface, " +
      "emphasising texture and tactile detail. Shallow depth of field, minimal motion.",
  },
  "tt-30-text-hook-card": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: TT_DIR_YUNA,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    // ⚠️ captionMaxChars 絕對不能設 ≤60。orchestra 的 lengthHint 有一條隱藏
    // 耦合：captionMaxChars <= 60 會注入一段【嚴格字數 — 最高優先】，內容
    // 明講「只能是 1 句，不分段」—— 那是為了 headline/一句話這種微任務寫的，
    // 但它的優先級蓋過任務 prompt，會把字卡的 4 行強制壓成 1 行。
    // 實測：120 → 3-6 行（正常）；60 → 永遠 1 行，改幾次 prompt 都沒用。
    // 4 行 × 6-12 字 ＋ 換行 ≈ 27-51 字，設 90 留餘裕且避開 ≤60 陷阱。
    variantLabels: ["直球", "共鳴"], captionMinChars: 24, captionMaxChars: 90,
    runVideoGen: true, videoDurationSec: 5,
    // 這支的畫面是「給字卡當底」的，所以刻意要求幾乎不動、構圖留白 ——
    // 疊字是之後在 output 層做的（模型畫不出正確中文字，見 NO-TEXT 政策）。
    videoMotionHint:
      "Very subtle slow zoom on a clean, uncluttered background with generous " +
      "empty space in the upper third. Almost no motion — this is a backdrop " +
      "for text that is overlaid later. Nothing enters or leaves the frame.",
  },
  // 分鏡表：variants=1（分鏡是「一份」文件，不是多個版本可選），
  // cardsPerVariant=5 讓拆分器切成 5 格、每格自己一張圖。
  // holdForImages 確保 5 格畫面都到齊才收工 —— 缺格的分鏡表沒有意義。
  "tt-30-storyboard": {
    variants: 1, images: 1, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["分鏡完整版"], captionMinChars: 300, captionMaxChars: 1000,
    cardsPerVariant: 5,
    cardsKind: "storyboard",
    holdForImages: true,
  },

  // 2026-07-29 修正：這張卡原本是壞的 —— 一張靜圖 + 一句 motion prompt
  // 只能呈現「一個狀態」，所以產出的片根本沒有對比，卻叫 before/after。
  // 改用 Kling 的 image_tail_url：頭格＝使用前，尾格＝使用後（由
  // videoTailHint 生第二張圖），模型在同一顆連續鏡頭裡內插過去。
  // variantLabels 也跟著改 —— 兩個變體是兩種「切角」，不是前後兩半。
  "tt-30-before-after": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: TT_DIR_GRANT,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["睡前場景", "日常場景"], captionMinChars: 60, captionMaxChars: 120,
    runVideoGen: true, videoDurationSec: 5,
    videoMotionHint:
      "One continuous shot, steady camera, no hard cut and no scene change.",
    videoTailHint:
      "同一個場景、同一個機位，但呈現「使用之後」的狀態：緊繃與混亂被平靜取代，" +
      "光線更柔和、空間更整齊、人物神情放鬆。不要換場景、不要換人、不要出現文字。",
  },
};

export function getTTOrchestraConfig(taskId: string): OrchestraConfig | null {
  return TT_30S_ORCHESTRA[taskId] ?? null;
}
