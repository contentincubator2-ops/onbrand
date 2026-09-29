/**
 * Instagram quick-task templates (2026-05-05).
 *
 * 13 IG 30s tasks following the FB SOP (per project_30s_task_sop.md).
 * Each task uses a DIFFERENT caption_writer agent (zero overlap with FB
 * agents) and a single shared image_director (Nancy Yeh, ≠ Mandy from FB).
 *
 * postType naming aligns with PlatformMockup/index.tsx case keys:
 *   feed / reel / story / carousel / profile / live (+ threads:post for #13)
 */

import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const FB_TONE_SUFFIX = `
語氣要求：自然、像真人朋友的口吻。不要 "親愛的客戶" 罐頭。
品牌語氣若 system context 已給，務必貼合。`;

// ─── 30s tier (13 tasks) ────────────────────────────────────────────────────

export const IG_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "ig-30-caption-short",
    tier: "30s",
    postType: "feed",
    label: { en: "IG Short Caption (Single Image)", zh: "IG 短貼文文案（單圖）" },
    description: { en: "80-150-word IG feed caption + 5-10 hashtags", zh: "80–150 字 IG feed caption + 5-10 個 hashtag" },
    agent_id: 180166, // Iris Liang — Instagram Marketing Specialist
    skill_slug: "instagram-copywriting",
    primary_question: "今天這篇 IG 貼文要講什麼？",
    primary_input: { key: "topic", placeholder: "例：新品上市 / 客戶分享 / 幕後花絮", type: "textarea" },
    inputs: [{ key: "topic", label: "貼文主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG 單圖文 caption（80–150 字）。
結構：第 1 句 hook 拉注意 → 中間 1 段內容（不要太長 — IG 用戶會跳過長文） → 結尾 1 句邀請（留言 / 收藏 / 分享）。
${FB_TONE_SUFFIX}
另外給 1 句 image_style_direction.summary（aspect_ratio="1:1"）。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-pure-text-hook",
    tier: "30s",
    postType: "feed",
    label: { en: "IG Hooks ×3 (For Your Draft)", zh: "IG 開場鉤子 3 種（搭配你的原文）" },
    description: { en: "3 hooks in different voices, spliced onto your draft", zh: "3 種不同口吻 hook，自動接你原本的貼文內容" },
    agent_id: 222311, // Ming-Han Zhou — Brand Strategist B2B SaaS & SEA (1621 char persona)
    skill_slug: "hook-copywriter",
    primary_question: "貼上你原本要發的貼文 / 文章內容，我會寫不同口吻的 IG 開場接上去",
    primary_input: { key: "article_body", placeholder: "貼上完整的貼文內文（hook 會接在最前面）", type: "textarea" },
    inputs: [{ key: "article_body", label: "原本的貼文內容", type: "textarea", required: true }],
    systemPrompt: `任務：用戶提供「原本的貼文內容」。
你只要寫 hook（開場句），**不要重複貼用戶的原文** — orchestra 會在後端自動把原文接到你寫的 hook 後面。

本則固定走「{label}」這一種（反問式＝用問句直擊讀者；數字式＝以具體數字製造張力；反差式＝用預期落差勾住注意），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption = 那個口吻的 hook（30-60 字，1-2 句即可）。
${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-reel-hook",
    tier: "30s",
    postType: "reel",
    label: { en: "IG Reel Opening Hook (First 3s)", zh: "IG Reel 開場鉤子（前 3 秒）" },
    description: { en: "First-3-seconds VO + caption rhythm + opening visual brief", zh: "前 3 秒口播 + 字幕節奏 + 視覺開場 brief" },
    agent_id: 60029, // Siyu Lin — TikTok/Reels Short Video Scriptwriter
    skill_slug: "short-video-scriptwriter",
    primary_question: "這支 Reel 的主題 / 賣點是？",
    primary_input: { key: "topic", placeholder: "例：30 秒教學 / 開箱 / 反差展示", type: "textarea" },
    inputs: [{ key: "topic", label: "Reel 主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG Reel 前 3 秒 hook（給開場用）。
本則固定走「{label}」這一種（懸念開場＝拋未解的鉤子；反差開場＝用預期落差製造張力；直接挑釁＝點名痛點直球切入），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構：
  口播原話（粗體）：[15-25 字，第 0-1 秒就要說]
  螢幕字幕：[搭配口播的字幕，可比口播再簡短]
  視覺開場（給拍攝者）：[1 句鏡頭建議]
不要長句 / 不要文謅謅 / 不要客套開場。前 3 秒沒抓到注意力 = 完蛋。
另外給 image_style_direction.summary（封面圖風格，9:16）。`,
    preferredModel: "qwen",
    maxTokens: 350,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },
  {
    id: "ig-30-reel-script-full",
    tier: "30s",
    postType: "reel",
    label: { en: "IG Reel Full Script (15–30s)", zh: "IG Reel 完整腳本（15-30s）" },
    description: { en: "Structured storyboard: hook→promise→3 segments→CTA", zh: "結構化分鏡：hook→承諾→3 段內容→CTA" },
    agent_id: 35, // Jason Fang — Short Video Scriptwriter (exec)
    skill_slug: "short-video-scriptwriter",
    primary_question: "這支 Reel 想傳達什麼價值？",
    primary_input: { key: "topic", placeholder: "例：3 個 IG 演算法迷思 / 我如何用 90 天從 0 到 10K", type: "textarea" },
    inputs: [{ key: "topic", label: "Reel 主題 / 想傳達的價值", type: "textarea", required: true }],
    systemPrompt: `產出 IG Reel 完整腳本（15-30 秒）。
本支固定走「{label}」這一種（教學型＝給可操作的步驟知識；故事型＝用敘事帶觀眾走一遍；反差型＝以預期落差貫穿全片），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構：
  [0-3s] HOOK：[一句懸念 / 反差 / 數字 hook]
  [3-10s] 承諾：[告訴觀眾接下來會看到什麼價值]
  [10-25s] 3 段內容：
    • Beat 1: [內容 1，5 秒內]
    • Beat 2: [內容 2，5 秒內]
    • Beat 3: [內容 3，5 秒內]
  [25-30s] CTA：[追蹤 / 留言關鍵字 / 收藏]

每個 Beat 寫得具體（"用這 3 個 hashtag" 比 "用對 hashtag" 好）。
另外給 image_style_direction.summary（封面圖風格，9:16）。`,
    preferredModel: "qwen", // longer / structured — better with Claude
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },
  {
    id: "ig-30-story-text",
    tier: "30s",
    postType: "story",
    label: { en: "IG Story Copy + Sticker Ideas", zh: "IG 限時動態文案 + 貼圖建議" },
    description: { en: "9:16 headline + body + recommended stickers", zh: "9:16 主標 + 內文 + 推薦 sticker" },
    agent_id: 180170, // Nancy Yeh | Social Media Visual Designer
    skill_slug: "brand-story",
    primary_question: "今天的 Story 想說什麼？",
    primary_input: { key: "topic", placeholder: "例：幕後 / 限時優惠 / 提問 / 投票", type: "textarea" },
    inputs: [{ key: "topic", label: "限時動態主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG Story 文案。caption 純文字，**絕對不要**夾雜視覺描述、英文 prompt。
本則固定走「{label}」這一種（驚奇式＝用意外資訊勾住；提問式＝拋問題引互動；幕後式＝給未公開的真實畫面感），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構 — 用換行分段：
  主標（5-12 字，疊在圖上 — 最大字）
  內文（30-60 字，補充訊息）
  推薦 sticker：[poll / question / quiz / countdown / emoji-slider / link 選 1-2 個 + sticker 上的文字]

不要長文。9:16 高度有限，文字要能 1 秒讀完。
（圖片風格由另一位 agent 獨立處理，不要寫進 caption）`,
    preferredModel: "qwen",
    maxTokens: 300,
    outputDefaults: { platform: "instagram", post_type: "story" },
  },
  {
    id: "ig-30-carousel-structure",
    tier: "30s",
    postType: "carousel",
    label: { en: "IG 10-Page Carousel Structure", zh: "IG 輪播 10 頁結構" },
    description: { en: "1 title page + 8 content pages + 1 CTA page, copy per page", zh: "1 標題頁 + 8 內容頁 + 1 CTA 頁，每頁文字" },
    agent_id: 224094, // Jing Yi Lim — Social Media Strategist B2B SaaS MY (1143 char)
    skill_slug: "short-form-copywriting",
    primary_question: "想做什麼主題的 carousel？（教學 / 清單 / 反差 / 故事）",
    primary_input: { key: "topic", placeholder: "例：5 個被低估的 IG 演算法技巧 / 我從 0 學設計的 3 個錯誤", type: "textarea" },
    inputs: [{ key: "topic", label: "輪播主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG Carousel（10 頁）的每頁文字。
本組固定走「{label}」這一種（教學清單型＝可操作的編號清單；故事型＝用敘事弧串起每頁；反差型＝用預期落差貫穿輪播），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構：

頁 1（標題）：[3-7 字大標 + 1 句副標]
頁 2-9（內容 8 頁）：[每頁 1 個重點 + 30-50 字補充。標號從 #1 到 #8]
頁 10（CTA）：[總結 1 句 + 邀請動作（收藏 / 分享 / 留言）]

caption 欄位請用「---」分隔每一頁。標號用 1. 2. 3. 結構清楚。
另外給 image_style_direction.summary（每頁同一視覺風格，aspect_ratio="1:1"）。`,
    preferredModel: "qwen",
    maxTokens: 1200,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },
  {
    id: "ig-30-bio-rewrite",
    tier: "30s",
    postType: "profile",
    label: { en: "IG Bio Rewrite", zh: "IG 個人簡介改寫" },
    description: { en: "150-char bio with emoji + line breaks + CTA", zh: "150 字 bio 含 emoji + 換行 + CTA" },
    agent_id: 180168, // Wendy Su — Link in Bio Specialist
    skill_slug: "link-in-bio",
    primary_question: "你的 IG 帳號是誰、做什麼、想吸引誰？",
    primary_input: { key: "context", placeholder: "例：『我是 ___，幫 ___ 解決 ___，過去 ___』", type: "textarea" },
    inputs: [{ key: "context", label: "你 / 品牌簡介", type: "textarea", required: true }],
    systemPrompt: `任務：根據用戶在 [context] 提供的資訊，幫**用戶**改寫 IG bio。
⚠️ 主角永遠是用戶，不是你（agent）。bio 是寫給用戶的 IG profile 用的。
絕對不要寫「我是 Wendy Su」、「Link in Bio 專家」、「幫小品牌做 ___」等任何關於你 / agent 的描述。
讀 [context]：用戶是誰、做什麼、想吸引誰 → 寫的是**那個人**的 bio。

本則固定走「{label}」這一種（專家定位＝強調權威與專業；個性風格＝凸顯人味與個性；結果導向＝強調能帶來的具體成果），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構（用換行排版）：
  L1: 一句 positioning（**用戶**是誰 + 做什麼 + 為誰）
  L2-3: 2-3 個亮點（用 emoji 條列）
  L4: CTA（"👇 點 link in bio" 或 "📩 DM 我「____」")

emoji 適度，不要每行都塞。bio 有字數限制，每字都要算。`,
    preferredModel: "qwen",
    maxTokens: 350,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },
  {
    id: "ig-30-hashtag-set",
    tier: "30s",
    postType: "feed",
    label: { en: "IG 30-Hashtag Set", zh: "IG 主題標籤 30 個套組" },
    description: { en: "3 tiers: 5 core / 15 mid / 10 long-tail", zh: "3 階分層：核心 5 / 中型 15 / 長尾 10" },
    agent_id: 180176, // Michael Wu | Social Media Specialist
    skill_slug: "hashtag-discoverability",
    primary_question: "貼文主題 / 你的利基領域是？",
    primary_input: { key: "topic", placeholder: "例：手沖咖啡 / 北美室內設計 / SaaS B2B", type: "textarea" },
    inputs: [{ key: "topic", label: "主題 / 利基", type: "textarea", required: true }],
    systemPrompt: `產出 IG hashtag 套組。
本組固定走「{label}」這一種（曝光導向 (20)＝20 個大流量 hashtag 1M+ post；品牌導向 (8)＝8 個偏品牌/利基 50K-500K post；利基導向 (12)＝12 個小眾高匹配 5K-50K post），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
數量與大小分層嚴格依「{label}」的定義。

caption 直接列 hashtag（每個 # 前綴 + 空格分隔，可換行）。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-comment-reply",
    tier: "30s",
    postType: "feed",
    label: { en: "IG Comment Reply (General)", zh: "IG 留言回覆（一般）" },
    description: { en: "5 reply voices (fans / friendly debate / peers / KOL / general inquiry)", zh: "5 種口吻回覆（粉絲互動 / 友善討論 / 同行交流 / KOL 互動 / 一般詢問）" },
    agent_id: 180143, // Emily Wang — Community Manager
    skill_slug: "community-manager",
    primary_question: "貼上原始用戶留言（或留言情境）",
    primary_input: { key: "user_comment", placeholder: "用戶說了什麼？整段貼進來", type: "textarea" },
    inputs: [{ key: "user_comment", label: "用戶留言", type: "textarea", required: true }],
    systemPrompt: `產出 IG 對留言的回覆（30-80 字）。
規則：
- 先呼應對方訊息（不是貼罐頭「謝謝您」）
- 給 1 個有溫度的小細節
- 結尾不要結束話題（"下次再聊" 比 "祝您愉快" 好）

caption 放回覆文。description 可放原始用戶留言（mockup 顯示用）。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 250,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-dm-script",
    tier: "30s",
    postType: "feed", // no dedicated DM mockup yet — fallback to feed
    label: { en: "IG DM Auto-Reply Script", zh: "IG DM 自動回覆腳本" },
    description: { en: "3 scenarios: price inquiry / after-sales / collab invite", zh: "3 種情境：詢價 / 售後 / 合作邀約" },
    agent_id: 180163, // Helen Sung | Social Media Community Builder
    skill_slug: "customer-service-copy",
    primary_question: "你想處理哪類 DM？貼上常見訊息範例",
    primary_input: { key: "scenario", placeholder: "例：『請問還有貨嗎？』 / 『產品不滿意』 / 『想合作』", type: "textarea" },
    inputs: [{ key: "scenario", label: "DM 情境 / 範例訊息", type: "textarea", required: true }],
    systemPrompt: `產出 IG DM 自動回覆腳本。
本則固定走「{label}」這一種情境（詢價回覆＝回應商品/價格詢問；售後安撫＝處理不滿與售後問題；合作回覆＝回應合作/業配邀約），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構：
1. 開場（個人化，不要 "Hi 您好"）
2. 直接給答案 / 動作（不要繞）
3. 下一步（連結 / 表單 / 真人接手指示）

字數 60-150。語氣要像真人，不要 "親愛的"。
不需要 image_style_direction。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-live-opening",
    tier: "30s",
    postType: "live",
    label: { en: "IG Live 30-Second Opener", zh: "IG 直播開場 30 秒" },
    description: { en: "Opening lines + warm-up + comment-driving CTA", zh: "開場詞 + 暖場互動 + CTA 引留言" },
    agent_id: 60072, // Yiting Tsai — Live Shopping Script (Beauty)
    skill_slug: "live-shopping-script",
    primary_question: "今晚直播主題 / 想聊什麼？",
    primary_input: { key: "topic", placeholder: "例：新品試色 / Q&A / 開箱 / 教學", type: "textarea" },
    inputs: [{ key: "topic", label: "直播主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG 直播開場 30 秒腳本。
本則固定走「{label}」這一種（懸念式＝拋未解鉤子吊胃口；互動式＝立刻拉觀眾留言參與；直球式＝開門見山講價值），必須與其他變體明顯不同，嚴禁混用或寫成通用版。
caption 結構：
[0-10s] 開場詞：[第一句要 hook，不要 "大家好我是 ___"]
[10-20s] 暖場：[1 個讓觀眾留言的問題 / 投票，明確說 "在留言打 ___"]
[20-30s] 預告：[今晚會講什麼，給留下來的理由]

不要過度親切，要像 KOL 不像主持人。
另外給 image_style_direction.summary（直播封面圖風格，aspect_ratio="16:9"）。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-30-story-repost-strategy",
    tier: "30s",
    postType: "story",
    label: { en: "IG Story 24h Repost Strategy", zh: "IG 限時動態 24h 後重發策略" },
    description: { en: "What follows the 24h expiry (highlights / feed remix / new Story)", zh: "限時動態失效後該怎麼接（精選 / 改編 feed / 新限時動態）" },
    agent_id: 220751, // Jake Chou — Insights Storyteller
    skill_slug: "insights-storyteller",
    primary_question: "原本那則限時動態是什麼內容？",
    primary_input: { key: "original_story", placeholder: "貼上限時動態文字 / 主題", type: "textarea" },
    inputs: [{ key: "original_story", label: "原限時動態內容", type: "textarea", required: true }],
    systemPrompt: `產出限時動態 24h 失效後的重發策略。
本則固定走「{label}」這一條路徑（精選封面型＝精選到 Highlight：給「分類名稱」+「封面圖建議」+「保留哪些 sticker」；Feed 改編型＝改編成 Feed Post：給「caption 節錄」+「視覺改造方向」；後續限時動態型＝發後續限時動態：給「下一則限時動態文字」+「sticker 建議」+「掛 stories link / mention」），必須與其他變體明顯不同，嚴禁混用或寫成通用版。

直接給可動作的內容（不要寫「思考一下要不要…」這種廢話）。
另外給 image_style_direction.summary（路徑 1 / 2 用，aspect_ratio="9:16"）。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "story" },
  },
  {
    id: "ig-30-threads-cross-post",
    tier: "30s",
    postType: "post", // threads:post mockup
    label: { en: "IG → Threads Cross-Post Rewrite", zh: "IG → Threads 跨平台改寫" },
    description: { en: "Rewrite your IG post in Threads style", zh: "把 IG 貼文改寫成 Threads 風格" },
    agent_id: 60022, // Kevin Huang — LINE/Threads Social Copywriter
    skill_slug: "threads-copywriter",
    primary_question: "貼上 IG 那篇 caption（要改寫成 Threads 版本）",
    primary_input: { key: "ig_caption", placeholder: "整段 IG caption 貼進來", type: "textarea" },
    inputs: [{ key: "ig_caption", label: "原 IG 文案", type: "textarea", required: true }],
    systemPrompt: `把 IG caption 改寫成 Threads 風格。Threads ≠ IG：
- 文字優先，不依賴 hashtag
- 對話感重（像在 Twitter，不像 IG 廣告）
- 短文 + 引發討論的 hook（提問 / 反差 / 觀點）
- 不要 IG 的 emoji 海

本則固定走「{label}」這一種（觀點式＝純觀點貼文 150-250 字，像在發見解；提問式＝拋問題＋自己 1-2 句看法，引討論；故事縮短＝IG 長文精煉到 200 字以內），必須與其他變體明顯不同，嚴禁混用或寫成通用版。

不需要 image_style_direction（Threads 也不依賴主圖）。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "threads", post_type: "post" },
  },

  // ── 爆款結構卡（2026-09-05）─────────────────────────────────────────
  // source 一律帶 metric + asOf。agent_id / skill_slug 沿用同 postType 現役卡。
  {
    id: "ig-30-feed-single-object",
    tier: "30s",
    postType: "feed",
    label: { en: "Feed: One Image, One Idea", zh: "IG 貼文：一張圖只講一件事" },
    description: { en: "Simple enough that anyone can join in", zh: "極簡到人人都能參與的單圖貼文" },
    agent_id: 180166, // 沿用 IG feed 現役 agent
    skill_slug: "instagram-copywriting",
    source: {
      type: "viral",
      short: "World Record Egg",
      metric: "逾 5,200 萬個讚，當時 IG 史上最多",
      asOf: "2019-02",
      takeaway:
        "門檻低到荒謬時，參與本身就變成內容——貼文不必好看，要好加入。",
    },
    primary_question: "你想讓大家一起做的那件小事是什麼？",
    primary_input: { key: "topic", placeholder: "例：曬出你桌上的那杯 / 猜這是第幾代包裝", type: "textarea" },
    inputs: [
      { key: "topic", label: "想邀大家一起做的小事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 IG 單圖貼文，目標是「讓看到的人願意動手參與」，不是讓他讚嘆。

規格：
- 主文 80-200 字。第一句就講清楚要大家做什麼。
- 參與門檻必須低到「不需要買東西、不需要技巧、30 秒內做得到」。
- 給一個明確的參與方式（留言一個字、貼一張照片、tag 一個人，選一種就好）。
- 收尾用一句讓人想試的話，不要用「快來參加」這種招呼語。

硬規則：
- 不要形容產品有多好。這則貼文的主角是參與者，不是產品。
- 不要同時開兩種參與方式，會兩種都沒人做。
- hashtag 最多 3 個，而且要是參與者自己會用的。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-reel-brand-event",
    tier: "30s",
    postType: "reel",
    label: { en: "Reel: Put Your Mascot in Trouble", zh: "IG Reels：讓吉祥物／人格出事" },
    description: { en: "Give your brand persona real stakes", zh: "把品牌人格丟進一個真的有後果的事件" },
    agent_id: 60029, // 沿用 IG Reel 現役 agent
    skill_slug: "short-video-scriptwriter",
    source: {
      type: "viral",
      short: "Duolingo「Duo 之死」",
      metric: "兩週 17 億次自然曝光；Dua Lipa 在 IG 該則留言逾 14.1 萬讚",
      asOf: "2025-02",
      takeaway:
        "人格要能出事才有人關心——事件必須有後果，而且後果要由觀眾的行動決定。",
    },
    primary_question: "你的品牌人格（吉祥物、老闆、店貓）可以發生什麼事？",
    primary_input: { key: "topic", placeholder: "例：吉祥物離職 / 招牌被颱風吹走 / 老闆跟員工打賭", type: "textarea" },
    inputs: [
      { key: "topic", label: "品牌人格 + 可以發生在它身上的事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支 15-30 秒的 IG Reels 腳本，讓品牌人格發生一件「有後果」的事。

必備三件事：
1. 事件要有真實後果（消失、關閉、更換、暫停），不是演一演就恢復。
2. 後果要由觀眾的行動決定——講清楚要做到什麼，事情才會逆轉。
3. 品牌人格全程不解釋、不出戲。

輸出：
- 逐鏡，每鏡標秒數 / 畫面 / 字卡（每行不超過 12 字）。
- 最後一鏡要給出觀眾能做的那個動作，具體到數字或期限。

硬規則：
- 不要在腳本裡置入產品功能，這支片賣的是關心不是規格。
- 不要用「敬請期待」收尾，那等於沒有後果。
- 如果品牌沒有可辨識的人格，先寫一句話把它立起來再往下。`,
    preferredModel: "qwen",
    maxTokens: 616,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },
  {
    id: "ig-30-carousel-proof-set",
    tier: "30s",
    postType: "carousel",
    label: { en: "Carousel: Let the Evidence Speak", zh: "IG 輪播：讓證據自己說話" },
    description: { en: "A set of real samples; the conclusion writes itself", zh: "蒐集來的實例排成一組，結論不用寫" },
    agent_id: 224159, // 沿用 IG 輪播現役 agent
    skill_slug: "carousel-copywriter",
    source: {
      type: "viral",
      short: "Heinz「Draw Ketchup」",
      metric: "賺得媒體 580 萬美元，為投放金額的 127 倍",
      asOf: "2021-01",
      takeaway:
        "與其宣稱自己是第一，不如收集一堆陌生人的答案讓結論自己浮出來——證據比形容詞有說服力。",
    },
    primary_question: "你有什麼「大家做出來都一樣」的實例可以蒐集？",
    primary_input: { key: "topic", placeholder: "例：請客人畫出我們的產品 / 一百個人怎麼形容這個味道", type: "textarea" },
    inputs: [
      { key: "topic", label: "可蒐集的實例 + 你想證明的那句話", type: "textarea", required: true },
    ],
    systemPrompt: `你要產出一組 6 張的 IG 輪播文案，用蒐集來的實例證明一件事，而不是宣稱它。

結構：
- 第 1 張：說清楚這個實驗怎麼做的（問了誰、問了什麼、多少人）。不要先講結論。
- 第 2-5 張：一張一個實例，只描述實例本身，不加評論。
- 第 6 張：把結論交給讀者——用一句話點出剛才那些實例共同指向什麼。

硬規則：
- 前 5 張完全不准出現品牌自誇的形容詞。
- 樣本數要誠實：只有 12 個人就寫 12 個人，不要寫「許多人」。
- 沒有真的做過這個蒐集，就在第 1 張寫清楚這是提案而非結果。
- 第 6 張不要放 CTA，讓結論停在讀者心裡。`,
    preferredModel: "qwen",
    maxTokens: 990,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },
  {
    id: "ig-30-story-one-action",
    tier: "30s",
    postType: "story",
    label: { en: "Story: One Frame, One Action", zh: "IG 限時動態：一個畫面一個動作" },
    description: { en: "Strip the frame to a single act", zh: "畫面只留一件事，讓人立刻動手" },
    agent_id: 180170, // Nancy Yeh — Social Media Visual Designer
    skill_slug: "brand-story",
    source: {
      type: "viral",
      short: "Coinbase QR 廣告",
      metric: "一分鐘內逾 2,000 萬次掃描，官方 App 當機約一小時",
      asOf: "2022-02",
      takeaway:
        "畫面上只留一個可以互動的東西，看的人就沒有第二個選項——猶豫是被多餘元素製造出來的。",
    },
    primary_question: "你希望看到限時動態的人，現在立刻做什麼？",
    primary_input: { key: "topic", placeholder: "例：掃碼領券 / 投票選口味 / 私訊關鍵字", type: "textarea" },
    inputs: [
      { key: "topic", label: "希望對方立刻做的那一個動作", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 IG 限時動態，畫面上只做一件事。

規格：
- 疊字最多 2 行，每行不超過 10 字。
- 只出現一個互動元素（投票 / 問答 / 連結 / 關鍵字，選一個）。
- 寫出畫面要放什麼：背景、那個互動元素的位置、有沒有其他東西（答案通常是沒有）。
- 給一個時間壓力，具體到幾點或幾小時。

硬規則：
- 不要同時放連結和投票。多一個選項，動作率就掉一半。
- 不要在同一格解釋為什麼，解釋放下一格。
- 疊字要能在 1.5 秒內讀完。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "story" },
  },
  {
    id: "ig-30-profile-self-insert",
    tier: "30s",
    postType: "profile",
    label: { en: "Profile: Let Fans Put Themselves In", zh: "IG 個人檔案：讓粉絲把自己放進來" },
    description: { en: "Turn brand visuals into a template fans can wear", zh: "把品牌視覺變成粉絲可以套用的模板" },
    agent_id: 180168, // 沿用 IG 個人檔案現役 agent
    skill_slug: "link-in-bio",
    source: {
      type: "viral",
      short: "Barbie 自拍生成器",
      metric: "濾鏡上線後被使用逾 1,300 萬次",
      asOf: "2023-04",
      takeaway:
        "品牌視覺要能被「穿在別人身上」才會擴散——讓粉絲成為主角，品牌只出借版面。",
    },
    primary_question: "你的品牌有什麼視覺元素，可以讓粉絲套在自己身上？",
    primary_input: { key: "topic", placeholder: "例：品牌色邊框 / 制式標題卡 / 招牌問句", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以被粉絲套用的視覺元素", type: "textarea", required: true },
    ],
    systemPrompt: `你要設計一組「讓粉絲把自己放進品牌視覺」的 IG 個人檔案內容。

要產出三件東西：
1. 一句可被套用的稱號句型，中間留空給粉絲自己填（例：「我是＿＿＿的第 ＿ 號常客」）。
2. bio 改寫：150 字內，第一行就講清楚這個玩法怎麼參加。
3. 三組精選封面的命名，讓粉絲一眼看出哪一格是放自己的。

硬規則：
- 句型要短到能塞進限時動態疊字，而且填空處不超過兩個。
- 不要要求粉絲下載任何東西才能參加。
- bio 不要放公司介紹，放參加方式。
- 稱號不能有優劣之分，不要製造階級。`,
    preferredModel: "qwen",
    maxTokens: 572,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },
  {
    id: "ig-30-live-host-relay",
    tier: "30s",
    postType: "live",
    label: { en: "Live: Multi-Host Relay", zh: "IG 直播：多主持接力帶貨" },
    description: { en: "Swap hosts every 10 minutes so no one leaves", zh: "每 10 分鐘換人，觀眾沒有離開的空檔" },
    agent_id: 60072, // 沿用 IG 直播現役 agent
    skill_slug: "live-shopping-script",
    source: {
      type: "viral",
      short: "Walmart TikTok 直播帶貨",
      metric: "觀看人數達預期 7 倍，帳號追蹤數 +25%",
      asOf: "2021-12",
      takeaway:
        "換人比換商品更能留住觀眾——每一次接力都是一個新的開場，錯過的人不必回頭補。",
    },
    primary_question: "這場直播要賣什麼？有哪些人可以輪流上？",
    primary_input: { key: "topic", placeholder: "例：三位店員 + 一位老顧客，賣冬季新品", type: "textarea" },
    inputs: [
      { key: "topic", label: "商品 + 可輪流上場的人", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一份 60 分鐘的 IG 直播流程腳本，採「每 10 分鐘換一位主持」的接力制。

每一段（6 段）都要寫出：
- 這一段由誰主持、他的身分（店員 / 老闆 / 老顧客 / 合作對象）。
- 開場 20 秒：對「剛進來的人」重新說一次現在在賣什麼，不要接上一段的話。
- 中段：這一位獨有的角度（他自己怎麼用、他被客人問過什麼）。
- 交棒 15 秒：預告下一位是誰、他會講什麼，給一個留下來的理由。

硬規則：
- 每一段都要能單獨看懂，不能有「剛才說過的」。
- 商品資訊在每段都完整重講一次，不要怕重複。
- 沒有提供的優惠不要編，用「主持人現場公布」佔位。`,
    preferredModel: "qwen",
    maxTokens: 1210,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-30-post-platform-firstday",
    tier: "30s",
    postType: "post",
    label: { en: "Threads: Day-One Account Opening", zh: "IG→Threads：新平台第一天怎麼開帳" },
    description: { en: "Move your existing audience in one move", zh: "把既有粉絲一次帶過去的開場組" },
    agent_id: 60022, // 沿用 Threads 改寫現役 agent
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "Threads 上線",
      metric: "5 天內破 1 億註冊，當時史上最快",
      asOf: "2023-07",
      takeaway:
        "新平台的爆發靠的是既有關係一次搬過去，不是重新累積——開帳第一天就要給老粉絲一個非跟不可的理由。",
    },
    primary_question: "你要把粉絲帶去哪個新平台？你在原平台有什麼是他們捨不得的？",
    primary_input: { key: "topic", placeholder: "例：搬去 Threads，我們在 IG 的每日一問要移過去", type: "textarea" },
    inputs: [
      { key: "topic", label: "目標平台 + 你手上最捨不得被放掉的內容", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一組「新平台開帳第一天」的貼文，把既有粉絲一次帶過去。

要產出三則：
1. 原平台的預告：講清楚要去哪裡、什麼時候、去了有什麼是這裡沒有的。
2. 新平台的第一則：不要自我介紹，直接做那件「只有這裡才有」的事。
3. 原平台的回頭提醒：給沒跟過去的人第二次機會，並說出已經發生了什麼。

硬規則：
- 「只有那裡才有」必須是具體的內容或互動，不是「更多驚喜」。
- 不要在第一則講品牌歷史，沒有人在新平台想看那個。
- 三則加起來要有連續感，第 3 則要引用第 2 則真的發生的事。
- 每則 120-300 字。`,
    preferredModel: "qwen",
    maxTokens: 660,
    outputDefaults: { platform: "instagram", post_type: "post" },
  },
  // ── 爆款結構卡・近 3 個月案例（CJ 2026-09-29）────────────────────────
  // IG 上的真實案例、2026-08～09 量測、數字要出現在 source.url 的參考文章裡。
  // 前台只列近 3 個月的爆款卡，月份滑出去就自動下架，這批卡每月要換。
  // 弱點（跨平台數字、品牌自報、年份推定）照實寫進 metric，讓用戶自己判斷。
  {
    id: "ig-30-feed-account-takeover",
    tier: "30s",
    postType: "feed",
    label: { en: "Post: Cute Outsider Takes Over", zh: "IG 貼文：帳號被可愛的局外人接管" },
    description: { en: "A playful 'takeover' photo with your brand hidden in the frame", zh: "假裝帳號被一個可愛的局外人接管，品牌元素藏在畫面裡" },
    agent_id: 180166, // 沿用 IG feed 現役 agent
    skill_slug: "instagram-copywriting",
    source: {
      type: "viral",
      short: "新加坡 LTA「寶寶在公車上自拍」",
      metric: "3 天逾 12,500 個讚",
      asOf: "2026-08",
      caveat: "政府帳號；跟風迷因，只取「帳號被接管」這個機制",
      url: "https://www.asiaone.com/singapore/accidental-baby-selfie-trend-singapore",
      takeaway:
        "官方帳號假裝被一個反差極大的可愛局外人「接管」，畫面裡藏著自家場景（公車），語氣瞬間變軟，大家留言猜、留言玩。",
    },
    primary_question: "你們家最有代表性的場景或物件是什麼？誰來「接管」帳號最好笑？",
    primary_input: { key: "topic", placeholder: "例：門市的收銀台 / 讓店貓接管帳號一天", type: "textarea" },
    inputs: [
      { key: "topic", label: "品牌場景 + 接管者（寶寶、寵物、吉祥物、實習生…）", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 IG 單圖貼文：品牌帳號「被一個可愛的局外人接管」了。

先決定：
- 接管者：跟品牌平常語氣反差越大越好（寶寶、店貓、吉祥物、最資淺的實習生）。
- 畫面：接管者出現在品牌專屬的場景裡（門市、產線、制服色、招牌商品），一眼認得出是你們家。

產出：
1. 拍攝指示（一句話）：畫面要拍什麼、品牌元素放在哪裡。
2. caption（30–120 字）：用接管者的口吻寫，隨性、錯字感、甚至只有 emoji 也可以，不能像官方。
3. 置頂留言（40–80 字）：官方小編「發現帳號被接管」的反應，延續這個角色遊戲。

硬規則：
- 不要推銷、不要放價格或連結。
- 不要用真實小孩的臉而沒有家長同意——預設用背影、手、或寵物／吉祥物。
- hashtag 最多 2 個。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-30-carousel-fake-callout",
    tier: "30s",
    postType: "carousel",
    label: { en: "Carousel: Fake Call-Out, Real Pitch", zh: "IG 輪播：假公審，真賣點" },
    description: { en: "Slide 1 stops the scroll with a mock call-out, last slide flips it", zh: "第一張假點名攔住滑動，中間把賣點寫成罪狀，最後一張反轉" },
    agent_id: 224159, // 沿用 IG 輪播現役 agent
    skill_slug: "carousel-copywriter",
    source: {
      type: "viral",
      short: "Your Social Team 假公審輪播",
      metric: "24 小時 5 萬次觀看",
      asOf: "2026-08",
      caveat: "代理商自報；頁面未標年份，依貼文 ID 推定為 2026-08",
      url: "https://yoursocial.team/blog/trend-drops-august-week-two",
      postUrl: "https://www.instagram.com/p/Db3Anfijuvo/",
      takeaway:
        "第一張用衝突型的假點名攔住滑動，中間把自家服務的好處寫成對方「偷走的東西」，最後一張揭曉是玩笑，賣點就這樣被看完了。",
    },
    primary_question: "你們最大的三個好處是什麼？要「點名」誰（虛構的對象）？",
    primary_input: { key: "topic", placeholder: "例：點名「每天加班到 10 點的你」/ 好處：自動排程、報表一鍵、週末不用上線", type: "textarea" },
    inputs: [
      { key: "topic", label: "虛構的點名對象 + 三個好處", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一組 5 張的 IG 輪播：「假公審」。

每張圖只放一句大字（15 字內）＋一行小字說明：
1. 第 1 張：假的公開點名（「○○，我們要公開你了」），衝突感要夠，但對象必須是虛構或泛稱，不能點真人真品牌。
2. 第 2–4 張：把品牌的三個好處寫成「他被我們偷走的東西」（例：「你的週末」「你的加班費藉口」），一張一個。
3. 第 5 張：反轉揭曉是玩笑＋一個明確行動（收藏、分享給需要的人、或點連結）。

另外寫 caption（80–180 字）：延續玩笑語氣，最後一句邀請大家 tag 一個「該被公審的人」。

硬規則：
- 不能點名真實的人、品牌、競爭對手。
- 不要恐嚇或羞辱語氣；是玩笑，不是攻擊。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },
  {
    id: "ig-30-reel-native-language-try",
    tier: "30s",
    postType: "reel",
    label: { en: "Reel: Clumsy but Sincere in Their Language", zh: "IG Reels：用對方的母語笨拙地講一個好康" },
    description: { en: "Admit you can't speak it, try anyway, deliver one concrete offer", zh: "先承認不會講，還是努力講完一個具體好康" },
    agent_id: 60029, // 沿用 IG Reel 現役 agent
    skill_slug: "short-video-scriptwriter",
    source: {
      type: "viral",
      short: "紐約市長曼達尼中文宣傳 Reel",
      metric: "IG 貼文逾 140 萬個讚、約 3 萬 7 千則留言",
      asOf: "2026-08",
      caveat: "政治人物帳號",
      url: "https://www.worldjournal.com/wj/story/121390/9695681",
      takeaway:
        "開場直接承認「我不會講這個語言，但想試一下」，再用對方的母語講清楚一個具體好康；笨拙本身就是誠意，大家留言幫忙糾正、分享給同鄉。",
    },
    primary_question: "你想對哪一群說不同語言的人，講哪一個具體好康？",
    primary_input: { key: "topic", placeholder: "例：對日本觀光客說：出示護照結帳 9 折，到 10/31", type: "textarea" },
    inputs: [
      { key: "topic", label: "對象的語言 + 具體好康（數字、期限）", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支 30–45 秒的 IG Reels 腳本：品牌代表用「對方的母語」笨拙但真誠地講一個具體好康。

結構：
1. 開場 3 秒：用自己的語言說「我不會講○○話，但我想試試看」。
2. 主體：換成對方的語言，只講一件事——好康是什麼、給誰、數字、到什麼時候。句子要短，允許有口音與停頓。
3. 收尾：回到自己的語言，一句真心話＋一個明確動作（來店說一句暗號、點連結）。

產出：
- 分鏡：每個鏡頭寫「畫面／台詞（原文＋中文對照）／字幕」。
- caption（50–120 字）：雙語，邀請母語者在留言區「糾正我的發音」。
- 同一支腳本再給一個換成另一種語言的版本建議（一句話說可以換成哪一群人）。

硬規則：
- 外語台詞要正確、簡單，不能拿口音或文化開玩笑。
- 好康一定要具體到數字與期限。`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },
  {
    id: "ig-30-live-vote-bracket",
    tier: "30s",
    postType: "live",
    label: { en: "Live: Viewer-Voted Knockout Bracket", zh: "IG 直播：觀眾投票淘汰賽" },
    description: { en: "Turn your catalog into a bracket; the audience picks the winner", zh: "把商品目錄變成淘汰賽，觀眾留言決定誰晉級" },
    agent_id: 60072, // 沿用 IG 直播現役 agent
    skill_slug: "live-shopping-script",
    source: {
      type: "viral",
      short: "SwissWatchExpo「The Grail Bracket」",
      metric: "數百則留言，品牌史上互動最多的一場直播",
      asOf: "2026-08",
      caveat: "品牌自報，數字不精確",
      url: "https://www.swisswatchexpo.com/thewatchclub/the-grail-bracket/",
      takeaway:
        "16 件話題商品分組對戰、每回合開放留言投票、雙機位並排比細節，高單價商品也能靠「看比賽」累積信任，成交在直播後私訊完成。",
    },
    primary_question: "你有哪 8 或 16 件商品可以拿來對戰？觀眾會用什麼標準選？",
    primary_input: { key: "topic", placeholder: "例：8 款招牌麵包 / 標準：你最想當早餐的", type: "textarea" },
    inputs: [
      { key: "topic", label: "參賽商品（8 或 16 件）+ 投票標準", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一場 IG 直播的「觀眾投票淘汰賽」企劃與主持腳本。

產出：
1. 賽程表：把商品兩兩分組（8 件＝3 輪、16 件＝4 輪），第一輪就放一組「冷門 vs 熱門」製造爆冷可能。
2. 每一回合的主持稿（每回合 60–90 秒）：
   - 兩件並排，各講一個具體細節（材質、做法、故事），不要講價格。
   - 開放留言投票的口令（例：「留言 A 或 B」），並說明幾秒後結算。
   - 結算後一句話評論結果。
3. 決賽與收尾：公布冠軍、點出最大爆冷、告訴大家直播後怎麼私訊詢問或預約。
4. 直播前一天的預告限動文案（40 字內）。

硬規則：
- 直播中不喊「快下單」；成交導到直播後私訊。
- 每回合都要有明確的投票口令與結算時間。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-30-profile-one-rule-debut",
    tier: "30s",
    postType: "profile",
    label: { en: "Profile: Debut With One Personality Rule", zh: "IG 個人檔案：開帳號先立一條個性規則" },
    description: { en: "First post sets one rule; the story flips the same joke", zh: "首篇用一條個性規則定調，限動再延續同一個梗" },
    agent_id: 180168, // 沿用 IG 個人檔案現役 agent
    skill_slug: "link-in-bio",
    source: {
      type: "viral",
      short: "珍妮佛勞倫斯開 IG 帳號",
      metric: "不到 24 小時漲粉 300 萬",
      asOf: "2026-09",
      caveat: "名人帳號，靠既有知名度",
      url: "https://woman.tvbs.com.tw/fashion/52170",
      takeaway:
        "開帳號不放精修照，第一支影片就立一條很有個性的規則（誰酸我我就不玩了），限動再用同一個梗反轉，讓「開帳號」這件事本身變成話題。",
    },
    primary_question: "你們要開新帳號（或重新出發）嗎？品牌最有個性的一句話是什麼？",
    primary_input: { key: "topic", placeholder: "例：甜點店開 IG / 個性：我們只做到賣完為止，不接預訂", type: "textarea" },
    inputs: [
      { key: "topic", label: "新帳號／重新出發 + 品牌最有個性的一句話", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌規劃一個 IG 新帳號（或重新出發）的「首發三件套」，核心是一條個性規則。

產出：
1. 個人檔案 bio（150 字元內）：第一行就是那條規則，第二行說明你是誰、在哪裡。
2. 首篇 Reel 腳本（15–30 秒）：不精修、口語，一個人對鏡頭宣告這條規則，並說明為什麼。
3. 首發限動 3 則：黑底白字或隨手拍，延續同一條規則的梗，最後一則反轉（自嘲或加碼）。
4. 精選動態分類 3 個名稱（每個 4 字內），也用同一個語氣命名。

硬規則：
- 規則要真的是品牌會做到的事，不能只是口號。
- 不要「歡迎追蹤」「敬請期待」這種開場。`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },
  {
    id: "ig-30-comment-fill-blank",
    tier: "30s",
    postType: "comment",
    label: { en: "Comments: Fill-in-the-Blank Entry", zh: "IG 留言：填空句型＋標記好友" },
    description: { en: "A fixed sentence to complete, tag one friend, scarce prize", zh: "給一句填空、標記一位好友、名額稀少的獎品" },
    agent_id: 180143, // Emily Wang — Community Manager
    skill_slug: "community-manager",
    source: {
      type: "viral",
      short: "臺北洲際酒店「The First 80」",
      metric: "8 萬 2,956 則參與，約 1,037 人搶 1 個名額",
      asOf: "2026-09",
      caveat: "FB／IG／Threads 三平台合計",
      url: "https://udn.com/news/amp/story/7270/9778590",
      takeaway:
        "用一句填空（「我愛上臺北，因為＿＿」）把留言門檻降到最低、再要求標記一位同行者，每一則留言都是一篇 UGC，也順便替活動擴散；名額只有 80 組，稀缺讓人搶著寫。",
    },
    primary_question: "你能送什麼稀少的獎品？想讓大家用哪一句話留言？",
    primary_input: { key: "topic", placeholder: "例：新店試吃 30 名 / 句型：「我最想帶＿＿來吃，因為＿＿」", type: "textarea" },
    inputs: [
      { key: "topic", label: "獎品與名額 + 你想要的留言句型", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 IG 留言活動貼文，核心是「填空句型＋標記好友」。

貼文（150–300 字）：
1. 第一句：獎品是什麼、只有幾個名額（數字）。
2. 參加方式（條列，最多 4 步）：追蹤帳號 → 在這篇留言，照句型填空 → 標記一位想一起來的人 →（需要的話）填報名表。
3. 句型：給一句 10–20 字、有空格的句子，空格要讓人想講自己的故事，不是填產品名。
4. 截止日與公布日（日期），以及怎麼公布。

另外產出：
- 3 則示範留言（不同人設的填法），讓大家知道可以寫得多有個性。
- 公布名單那天的貼文開頭一句（預告下一波）。

硬規則：
- 不設購買門檻。
- 評選標準要寫清楚（抽籤或看內容，二選一），避免事後爭議。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "instagram", post_type: "comment" },
  },
  {
    id: "ig-30-comment-ex-partner-jab",
    tier: "30s",
    postType: "comment",
    label: { en: "Comments: A Friendly Jab Under a Hot Post", zh: "IG 留言：在熱門貼文底下留一句友善的刺" },
    description: { en: "Borrow traffic from a big post with one short, friendly jab", zh: "在別人的高流量貼文底下，用既有關係留一句 20 字內的話" },
    agent_id: 180143, // Emily Wang — Community Manager
    skill_slug: "community-manager",
    source: {
      type: "viral",
      short: "Samsung 在 Rosé IG 貼文下留言",
      metric: "這則留言 21.2 萬人按讚、回覆超過 2,000 則",
      asOf: "2026-09",
      caveat: "全球品牌；報導未寫出是哪個官方帳號留言",
      url: "https://www.mirrordaily.news/story/85288",
      takeaway:
        "當事人發了跟自家品類有關的大貼文，品牌用既有關係（前代言、前合作）的角度留一句友善但帶刺的話，不發聲明、不追加解釋，讓回覆串自己發酵。",
    },
    primary_question: "最近哪一則熱門貼文跟你們的品類有關？你們跟當事人有什麼既有關係？",
    primary_input: { key: "topic", placeholder: "例：某部落客發文說在找好咖啡 / 我們曾經送過她豆子", type: "textarea" },
    inputs: [
      { key: "topic", label: "熱門貼文在講什麼 + 你們跟當事人的關係", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在一則別人的熱門 IG 貼文底下，寫一句「友善但帶刺」的留言。

先判斷（寫出來）：
- 這則貼文為什麼跟品牌有關（品類、場景、當事人）。
- 可以用的既有關係（曾合作、曾送禮、同一個城市…）；沒有關係就不要硬留，直接說「不建議留言」並說明原因。

產出：
1. 3 則留言候選（每則 20 字內）：語氣像朋友之間的吐槽，不能酸當事人、不能貶低對手。
2. 風險檢查：每則一句話說明可能被誤解的地方。
3. 被回覆之後的第二句（15 字內）：只接梗，不推銷、不放連結。

硬規則：
- 不在有爭議、悲傷或政治事件的貼文底下留言。
- 不留連結、不提價格、不 tag 對手品牌。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "comment" },
  },
  {
    id: "ig-30-dm-sample-request",
    tier: "30s",
    postType: "feed", // 還沒有 DM mockup —— 與 ig-30-dm-script 同樣退回 feed
    label: { en: "DM: Message Us for a Free Sample", zh: "IG 私訊：私訊就送試用" },
    description: { en: "DM is the only door to the sample — and to product feedback", zh: "私訊是拿試用品的唯一入口，順便收集產品回饋" },
    agent_id: 180163, // Helen Sung — Social Media Community Builder
    skill_slug: "customer-service-copy",
    source: {
      type: "viral",
      short: "Plainspeak IG 私訊送試用包",
      metric: "已寄出數千包試用包",
      asOf: "2026-09",
      caveat: "報導只寫「數千包」，沒有精確數字",
      url: "https://www.modernretail.co/marketing/brands-briefing-instagram-dms-are-proving-to-be-a-gold-mine-for-product-development/",
      takeaway:
        "把「私訊我們」設成拿免費試用的唯一入口，一次拿到潛在客戶名單與第一手問題；私訊裡最常被問的事，後來直接變成產品調整（例如開放單買）。",
    },
    primary_question: "你能送什麼試用品？最想從客人口中問到的一件事是什麼？",
    primary_input: { key: "topic", placeholder: "例：單包掛耳咖啡 / 想知道大家都在什麼時間喝咖啡", type: "textarea" },
    inputs: [
      { key: "topic", label: "試用品 + 想問客人的一件事", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一檔「IG 私訊就送試用」：公告貼文＋私訊回覆腳本。

產出：
1. 公告貼文（80–160 字）：第一句就說「私訊我們一個字就寄試用給你」，寫清楚送什麼、送到哪裡（地區）、到什麼時候或送完為止。
2. 私訊自動回覆（第一則，60 字內）：謝謝＋請對方留下寄送資料的方式。
3. 私訊第二則（40 字內）：只問一題使用情境問題（用戶指定的那件事），要好回答。
4. 私訊整理表：把回覆分類的 3–5 個欄位（例：使用時間、最在意的點、想要的規格），方便之後轉成產品決策。
5. 兩週後的回訪私訊（60 字內）：告訴提過需求的人「我們聽到了」，並說做了什麼調整或還在評估。

硬規則：
- 個資只收寄送需要的，不要多問。
- 不要在第一則就推銷正貨。`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
];

// ─── Plan B Orchestra config ────────────────────────────────────────────────

const NANCY_ID  = 180170; // Nancy Yeh — Social Media Visual Designer (caption-short 主場)
// 2026-05-08: per-task unique image directors (was 1 shared by 8 IG tasks)
const NELSON_ID = 220863; // Nelson Chen — Brand Narrative Editor
const YAHUI_ID  = 220540; // Ya-Hui Yuan — Client Proposal & Pitch Specialist
const REED_ID   = 220752; // Reed Lee — Insights Storyteller
const SEAN_ID   = 220753; // Sean Wu — Insights Storyteller
const KURT_ID   = 220754; // Kurt Chen — Insights Storyteller
const DALE_ID   = 220755; // Dale Yu — Insights Storyteller
const RACHEL_ID = 220913; // Rachel Lin — Senior UX/UI Designer

export const IG_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ig-30-caption-short": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: NANCY_ID, aspectRatio: "1:1", variantLabels: ["生活感版", "品牌感版", "問句式"],
    captionMinChars: 80, captionMaxChars: 150,
  },
  "ig-30-pure-text-hook": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: NELSON_ID, aspectRatio: "1:1", variantLabels: ["反問式", "數字式", "反差式"],
    captionMinChars: 30, captionMaxChars: 60,
  },
  "ig-30-reel-hook": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: YAHUI_ID, aspectRatio: "9:16", variantLabels: ["懸念開場", "反差開場", "直接挑釁"],
    captionMinChars: 30, captionMaxChars: 80,
  },
  "ig-30-reel-script-full": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: REED_ID, aspectRatio: "9:16", variantLabels: ["教學型", "故事型", "反差型"],
    captionMinChars: 200, captionMaxChars: 600,
  },
  "ig-30-story-text": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: SEAN_ID, aspectRatio: "9:16", variantLabels: ["驚奇式", "提問式", "幕後式"],
    captionMinChars: 30, captionMaxChars: 80,
  },
  "ig-30-carousel-structure": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: KURT_ID, aspectRatio: "1:1", variantLabels: ["教學清單型", "故事型", "反差型"],
    captionMinChars: 400, captionMaxChars: 1500,
  },
  "ig-30-bio-rewrite": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, variantLabels: ["專家定位", "個性風格", "結果導向"],
    captionMinChars: 80, captionMaxChars: 150,
  },
  "ig-30-hashtag-set": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, variantLabels: ["曝光導向 (20)", "品牌導向 (8)", "利基導向 (12)"],
    captionMinChars: 0, captionMaxChars: 600,
  },
  "ig-30-comment-reply": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, variantLabels: ["溫暖式", "幽默式", "邀請式"],
    captionMinChars: 30, captionMaxChars: 80,
  },
  "ig-30-dm-script": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, variantLabels: ["詢價回覆", "售後安撫", "合作回覆"],
    captionMinChars: 60, captionMaxChars: 150,
  },
  "ig-30-live-opening": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: DALE_ID, aspectRatio: "16:9", variantLabels: ["懸念式", "互動式", "直球式"],
    captionMinChars: 100, captionMaxChars: 300,
  },
  "ig-30-story-repost-strategy": {
    variants: 3, images: 3, runImageGen: false,
    imageDirectorId: RACHEL_ID, aspectRatio: "9:16", variantLabels: ["精選封面型", "Feed 改編型", "後續限時動態型"],
    captionMinChars: 100, captionMaxChars: 400,
  },
  "ig-30-threads-cross-post": {
    variants: 3, images: 0, runImageGen: false,
    imageDirectorId: null, aspectRatio: null, variantLabels: ["觀點式", "提問式", "故事縮短"],
    captionMinChars: 100, captionMaxChars: 400,
  },

  // ── 爆款結構卡 ──────────────────────────────────────────────────────
  "ig-30-feed-single-object": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["極簡版", "邀請版", "紀錄版"],
    captionMinChars: 80,
    captionMaxChars: 200,
  },
  "ig-30-reel-brand-event": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "9:16",
    variantLabels: ["出事版", "求救版", "反轉版"],
    captionMinChars: 120,
    captionMaxChars: 280,
  },
  "ig-30-carousel-proof-set": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["實例版", "對照版", "統計版"],
    captionMinChars: 200,
    captionMaxChars: 450,
  },
  "ig-30-story-one-action": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "9:16",
    variantLabels: ["純動作版", "倒數版", "選一個版"],
    captionMinChars: 30,
    captionMaxChars: 90,
  },
  "ig-30-profile-self-insert": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["模板版", "稱號版", "會員版"],
    captionMinChars: 100,
    captionMaxChars: 260,
  },
  "ig-30-live-host-relay": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "9:16",
    variantLabels: ["接力版", "對打版", "顧客上場版"],
    captionMinChars: 250,
    captionMaxChars: 550,
  },
  "ig-30-post-platform-firstday": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["搬家版", "限定版", "先搶版"],
    captionMinChars: 120,
    captionMaxChars: 300,
  },  // ── 爆款結構卡・近 3 個月案例（2026-09-29）
  "ig-30-feed-account-takeover": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["寶寶接管", "寵物接管", "實習生接管"],
    captionMinChars: 30,
    captionMaxChars: 120,
  },
  "ig-30-carousel-fake-callout": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["點名你", "點名老闆", "點名週一"],
    captionMinChars: 80,
    captionMaxChars: 180,
  },
  "ig-30-reel-native-language-try": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "9:16",
    variantLabels: ["承認不會版", "努力講完版", "請你糾正版"],
    captionMinChars: 50,
    captionMaxChars: 120,
  },
  "ig-30-live-vote-bracket": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "9:16",
    variantLabels: ["8 強版", "16 強版", "爆冷版"],
    captionMinChars: 40,
    captionMaxChars: 200,
  },
  "ig-30-profile-one-rule-debut": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["規則版", "自嘲版", "加碼版"],
    captionMinChars: 40,
    captionMaxChars: 150,
  },
  "ig-30-comment-fill-blank": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["故事填空", "回憶填空", "願望填空"],
    captionMinChars: 150,
    captionMaxChars: 300,
  },
  "ig-30-comment-ex-partner-jab": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["前任角度", "老朋友角度", "同城角度"],
    captionMinChars: 5,
    captionMaxChars: 40,
  },
  "ig-30-dm-sample-request": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: NANCY_ID,
    aspectRatio: "1:1",
    variantLabels: ["一個字就寄", "限量版", "問一題版"],
    captionMinChars: 80,
    captionMaxChars: 160,
  },
};

export function getIGOrchestraConfig(taskId: string): OrchestraConfig | null {
  return IG_30S_ORCHESTRA[taskId] ?? null;
}
