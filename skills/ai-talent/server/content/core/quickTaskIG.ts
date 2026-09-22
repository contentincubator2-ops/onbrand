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
  },
};

export function getIGOrchestraConfig(taskId: string): OrchestraConfig | null {
  return IG_30S_ORCHESTRA[taskId] ?? null;
}
