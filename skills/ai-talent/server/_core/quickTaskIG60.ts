/**
 * Instagram 60s tier — production-package tasks (2026-05-06).
 *
 * Mirrors FB60 multi-agent pattern. Each task = 8-9 agents in 3 stages:
 *   Stage 1 (parallel): Strategist + Caption × N + Image Director × N + Flux
 *   Stage 2 (parallel): Hashtag/Reply/Schedule/Followup + Specialty
 *   Stage 3:            QA Reviewer
 *
 * Image director: Nancy Yeh (180170) — IG-native visual lead (≠ Mandy/FB).
 * Universal helpers + QA shared across all channels.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const NANCY = 180170; // Nancy Yeh — IG Visual Direction Lead (主場 feed-full)
// 2026-05-08 (CJ direction): per-task unique image directors for IG 60s
const IG60_DIR_ANGEL  = 220866; // Angel Chen — Brand Narrative Editor
const IG60_DIR_OWEN   = 220868; // Owen Chen — Brand Narrative Editor
const IG60_DIR_RITA   = 220862; // Rita Chen — Brand Narrative Editor
const IG60_DIR_KAREN  = 220864; // Karen Chen — Brand Narrative Editor
const IG60_DIR_NELSON = 220863; // Nelson Chen — Brand Narrative Editor
const IG60_DIR_TODD   = 220730; // Todd Huang — Decision Design Consultant
const IG60_DIR_DAWN   = 220725; // Dawn Su — Decision Design Consultant
const IG60_DIR_BRIAN  = 220727; // Brian Yeh — Decision Design Consultant
const IG60_DIR_PENNY  = 220724; // Penny Huang — Decision Design Consultant
// 2026-08-23: two more for the new live task cards (same pool, unused in IG).
const IG60_DIR_LYDIA  = 220723; // Lydia Tsai — Decision Design Consultant
const IG60_DIR_DREW   = 220726; // Drew Chen — Decision Design Consultant

const IG_TONE = `
語氣要求：自然像朋友、有 IG-native 的呼吸感。不要罐頭口吻。
hashtag 集中放最後一行，5-10 個（IG 容忍量比 FB 高，但別 hashtag 海）。`;

// ─── 10 IG 60s tasks ─────────────────────────────────────────────────────

export const IG_60S_TASKS: FBTaskTemplate[] = [
  // 1. IG 單篇完整貼文 — Iris Liang
  {
    id: "ig-60-feed-full",
    tier: "60s",
    postType: "feed",
    label: { en: "IG Full Single Post", zh: "IG 單篇完整貼文" },
    description: { en: "5 variants + 5 real images + hashtags + reply templates + posting time", zh: "5 variants + 5 真生圖 + hashtag + 留言模板 + 發文時段" },
    agent_id: 60027, // Tina Lin | Travel Brand Social Copywriter
    skill_slug: "instagram-copywriting",
    primary_question: "今天這篇 IG 貼文要講什麼？",
    primary_input: { key: "topic", placeholder: "例：新品上市、客戶分享、幕後花絮", type: "textarea" },
    inputs: [
      { key: "topic", label: "貼文主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 單圖文完整貼文 caption（120-250 字）。
結構：hook → 細節 / 故事 → 邀請（留言 / 收藏 / 分享）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 2. IG Reel 完整腳本 — Siyu Lin (Reels), strategist: Kevin Lin
  {
    id: "ig-60-reel-full",
    tier: "60s",
    postType: "reel",
    label: { en: "IG Reel Full Script", zh: "IG Reel 完整腳本" },
    description: { en: "Strategist plans Hook-Hold-Payoff + full script + 9:16 visuals", zh: "Strategist 規劃 Hook-Hold-Payoff + 完整腳本 + 9:16 視覺" },
    agent_id: 60031, // Yawen Ma | Brand Short Video Scriptwriter - Beauty
    skill_slug: "short-video-scriptwriter",
    primary_question: "這支 Reel 主題 / 賣點？",
    primary_input: { key: "topic", placeholder: "例：30 秒教學 / 開箱 / 反差展示", type: "textarea" },
    inputs: [
      { key: "topic", label: "Reel 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Reel 完整 caption + 腳本（300-500 字）。
結構：[0-3s] hook 口播 / [3-15s] hold 內容 / [15-30s] payoff + CTA。
每段標時間戳。配 9:16 直式視覺。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1200,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },

  // 3. IG 7 卡輪播 — Tyler Brooks, strategist: Kevin Lin
  {
    id: "ig-60-carousel-7",
    tier: "60s",
    postType: "carousel",
    label: { en: "IG 7-Card Carousel", zh: "IG 7 卡輪播" },
    description: { en: "Strategist plans the arc + 7 cards + unified visual tone", zh: "Strategist 規劃敘事弧 + 7 卡內容 + 統一視覺基調" },
    agent_id: 224159, // Lukman Hakim — Social Media Strategist Beauty ID (1135 char)
    skill_slug: "carousel-copywriter",
    primary_question: "輪播主題？",
    primary_input: { key: "topic", placeholder: "教學 / 清單 / 故事 / 對比 etc.", type: "textarea" },
    inputs: [
      { key: "topic", label: "輪播主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 7 卡 Carousel 主貼文 caption（150-250 字 tease）。
注意：每張卡片都要讓人想滑下一張。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },

  // 4. IG Story 完整一組 (3 frames) — Wendy Su, multi-post 3
  {
    id: "ig-60-story-3frame",
    tier: "60s",
    postType: "story",
    label: { en: "IG Story 3-Frame Set", zh: "IG 限時動態 3 幀完整組" },
    description: { en: "Setup / key point / CTA — 3 connected frames + sticker ideas", zh: "前情 / 重點 / CTA 三幀連貫敘事 + sticker 互動建議" },
    agent_id: 180182, // Brian Hsieh | Social Media Specialist
    skill_slug: "social-copy",
    primary_question: "限時動態想傳達什麼？",
    primary_input: { key: "topic", placeholder: "例：新品預告、限時優惠、提問互動", type: "textarea" },
    inputs: [
      { key: "topic", label: "限時動態主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Story 其中 1 幀內容。
本次你寫的是「{label}」幀（前情鋪陳 / 重點揭曉 / CTA 收束）。
caption 30-60 字 overlay 文 + title 5-8 字大標。
9:16 直式風格。每幀互相呼應。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "story" },
  },

  // 5. IG 5 天倒數系列 — Iris Liang fanout, strategist: Ryan Yu, multi-post 5
  {
    id: "ig-60-countdown-5day",
    tier: "60s",
    postType: "feed",
    label: { en: "IG 5-Day Countdown Series", zh: "IG 5 天倒數系列" },
    description: { en: "Strategist designs the countdown arc + 5 posts in parallel + own image each", zh: "Strategist 設計倒數弧 + 5 天 5 篇平行寫作 + 各自配圖" },
    agent_id: 220584, // Ying-Chen Yu — IG/FB Marketing Specialist (vibe-marketing)
    skill_slug: "instagram-copywriting",
    primary_question: "倒數什麼活動？",
    primary_input: { key: "event_name", placeholder: "例：新品 / 週年慶 / 直播", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "key_offer", label: "主要鉤子 / 優惠", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 5 天倒數系列中的 1 篇（80-130 字）。本次你寫的是「{label}」。

【5天倒數框架 — 只執行你那天的定位，不准寫其他天的訊息】
第5天｜受眾：剛聽說活動、尚未了解的新受眾。
  USP 聚焦：建立「這是什麼」的核心認知，讓第一次接觸的人記住你的品牌/活動是什麼。
  開頭範例：「還有5天」「距離 ___ 只剩5天」。
第4天｜受眾：有興趣但還在觀望、需要更多理由的人。
  USP 聚焦：一個最具說服力的差異化優勢（功能 / 效果 / 獨特體驗），讓他們看到「為什麼是你」。
  開頭範例：「還有4天」「4天後，___」。
第3天｜受眾：猶豫中、需要信任感才願意行動的人。
  USP 聚焦：社會認同（真實客戶體驗 / 使用案例 / 具體成效數字），讓他們看到「別人怎麼說」。
  開頭範例：「還有3天」「距離 ___ 只剩3天」。
第2天｜受眾：已有意向但還需要一個理由立刻決定的人。
  USP 聚焦：限時優惠 / 獨家福利 / 只限報名者享有的好處，製造「現在行動」的誘因。
  開頭範例：「只剩2天了」「後天就是 ___」。
第1天｜受眾：高意圖、即將錯過的人。
  USP 聚焦：稀缺感 + 最強 CTA——「今天最後一天」「僅剩 X 個名額／席位」，不行動就後悔。
  開頭範例：「最後1天」「今天是最後機會」。

規則：
① 第一句一定要自然點出倒數天數（全繁體中文，絕不可出現英文 Day）
② 整篇只講 1 個核心 USP（你這天的那個），不要混入其他天的訊息
③ 加入 1 個具體的未公開細節或懸念透露
④ 結尾 1 個明確 CTA（留言 / 點連結 / 儲存備用，三選一）
⑤ 80-130 字，段落自然，不要條列式
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 6. IG Profile Highlight 完整套組 — Emma Zhang writer, multi-post 5
  {
    id: "ig-60-highlight-suite",
    tier: "60s",
    postType: "profile",
    label: { en: "IG Profile Highlights — 5 Covers + Content", zh: "IG 個人檔案精選 5 組封面 + 內容" },
    description: { en: "5 highlight covers (about / products / FAQ / reviews / cases) + consistent visuals", zh: "5 個精選封面（about / 商品 / FAQ / 客評 / 案例）+ 視覺一致" },
    agent_id: 180196, // Kevin Liao — Product Marketing Manager (1750 char)
    skill_slug: "instagram-strategy",
    primary_question: "想凸顯什麼樣的精選？",
    primary_input: { key: "highlight_focus", placeholder: "例：產品介紹 / 創辦故事 / 客戶見證", type: "textarea" },
    inputs: [
      { key: "highlight_focus", label: "精選主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Profile Highlight 其中 1 組（封面 + 內容說明）。
本次你寫的是「{label}」這個 highlight。
caption 30-60 字封面說明 + image_style 描述 9:16 ICON 風格（極簡、品牌色一致）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },

  // 7. IG 直播 30 分鐘流程腳本 — Yiting Tsai, strategist: Live Engagement, 6 段
  //
  // 2026-08-22 (CJ 驗收 /run/4006「IG 直播配套…應該是指完整的直播範本，
  // 目前的寫法比較像是貼文的預告，目前是不正確的」): 舊版把「直播配套」
  // 做成 5 篇圍繞直播的 IG 貼文（預告 / 開場宣告 / 高潮亮點 / 結尾 CTA /
  // 精華回顧），交付的是貼文而不是主播能照著播的流程表。改成 CJ 給的
  // 30 分鐘標準流程範本：6 個時間段，每段給【畫面／動作指示】＋【主播
  // 口白】。直播前後的貼文改由既有 extras 覆蓋（開播時段 / 留言回覆
  // 模板 / 直播後跟進貼文），不再佔用主交付。
  //
  // 2026-08-23 (CJ「研究 acunilicali / Deepika Padukone 的直播腳本設計」→ 採用
  // 其中三個機制): 原版每段只是「照著播」，缺的是讓觀眾願意留下來的設計。
  //   1. 雙螢幕漏斗 — Acun Ilıcalı 破 IG 直播世界紀錄那場（2020-05-25，2 分鐘
  //      300 萬）的關鍵不在直播本身：節目進行中先用限動投票向觀眾提問，觀眾在
  //      開播前就已經投資了一個動作。→ 黃金開場的第一條動作指示改成「開播前
  //      24 小時的限動投票」，開場直接唸投票結果，取代自我介紹腔。
  //   2. 頭號留言者 — Deepika Padukone 的 82°E 上市直播，Ranveer Singh 全程洗
  //      版當頭號支持者；冷場的留言區是素人直播最常見的死因。→ 開場段必須指派
  //      一個人負責前 3 分鐘的留言。
  //   3. 集體目標 — Acun 那場的張力來自一個公開、會跳動的數字（200 萬）與達標
  //      後真的兌現（島上派對）。→ 高潮段宣布目標、催單段回報進度、收尾段兌現，
  //      把「限時催單」的壓迫感換成「再一起做到什麼就會發生什麼事」。
  // 另外補一條備答防呆：82°E 那場公開的翻車點是粉絲問產品、創辦人答不清楚。
  // 深度互動段因此改成強制寫出 3 個具體難題與答法，而不是「回答粉絲提問」。
  {
    id: "ig-60-live-suite",
    tier: "60s",
    postType: "live",
    label: { en: "IG Live 30-Min Run-of-Show", zh: "IG 直播 30 分鐘流程腳本" },
    description: { en: "6 time-blocked segments — screen/action cues + word-for-word host script, with pre-live warm-up, prepared Q&A answers and a live audience goal", zh: "6 個時間段的完整直播範本：每段畫面／動作指示 ＋ 可直接唸的主播口白，含開播前預熱、Q&A 備答與現場集體目標" },
    agent_id: 60072, // Yiting Tsai | Live Shopping Script - Beauty
    skill_slug: "live-content",
    // 意圖說明：intake 只送 primary_input 一格（PlatformTaskPage handleRun
    // 送的是 { [primary_input.key]: primaryAnswer }），所以「重點」與「直播
    // 限定優惠」要靠這一題的提問方式問出來，不能靠 inputs[] 多開欄位。
    primary_question: "這場直播要聊什麼 / 賣什麼？有直播限定優惠也一起說",
    primary_input: { key: "live_topic", placeholder: "例：新品洗面乳開箱，重點是低敏、可卸妝、好沖洗；直播限定折扣碼 LIVE20", type: "textarea" },
    inputs: [
      { key: "live_topic", label: "直播主題 / 重點 / 直播限定優惠", type: "textarea", required: true },
    ],
    systemPrompt: `你在寫「IG 直播 30 分鐘標準流程」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 6 段依序是：
00:00-03:00 黃金開場 → 03:00-10:00 主軸切入 → 10:00-18:00 深度互動 →
18:00-23:00 高潮／優惠公布 → 23:00-28:00 限時催單 → 28:00-30:00 收尾預告。

【這是直播執行腳本，不是 IG 貼文（最高優先）】
- 讀的人是「正要開播的主播 / 小編」，他會把這頁放在鏡頭旁邊邊看邊播。
- 嚴禁寫成貼文文案、嚴禁 hashtag、嚴禁「儲存這篇」「點 bio 連結」這種貼文 CTA。
- 主播口白＝可以直接照著唸出來的口語，不是書面文案。

【輸出格式 — 只有這四個方括號標題，順序固定，前後不要多寫任何字】
【時間】本段的時間段（例：00:00-03:00）
【流程階段】只寫階段名稱本身，4-8 字（例：黃金開場）。不要加副標、不要加冒號或破折號後的第二句、不要用「｜」。
【畫面／動作指示】2-4 條，每條以「・」開頭，寫主播當下要做的具體動作：鏡位、手上拿什麼、要點開哪個功能（留言區 / 購物袋 / 精選提問）、要看哪裡。
【主播口白】用「」包住 2-4 句可以直接唸的話，扣住本場主題與重點；其中要有一個當下就能做的互動指令（按愛心 / 留言關鍵字 / 截圖私訊 / 點購物袋）。

【各段各自要做到的事（只寫你被指派的那一段）】
- 黃金開場：確認收音與燈光、等觀眾進場；一句話講清楚今天要幹嘛以及留下來的理由。這一段的動作指示**第一條必須是開播前 24 小時的預熱**，格式為「・（開播前 24 小時）…」，內容是：用限動投票問一題跟今天主題直接相關的問題，開播時把投票結果唸出來當開場。**第二條必須指派一位「頭號留言者」**（同事 / 店長 / 合作夥伴），前 3 分鐘負責回應主播每一次提問，讓留言區先有人講話。口白要用投票結果開場，不要用「大家好今天要來分享」這種自我介紹腔。
- 主軸切入：進入今天的主題／商品，先講觀眾的痛點再給解法，明講「今天重點有幾個」。
- 深度互動：這一段的核心是**事先備答**，不是臨場反應。動作指示或口白裡要寫出 3 個「觀眾真的會問、而且不好答」的具體問題與答法，每個問題都要有實際答案，不能寫成「回答粉絲提問」這種空句。優先涵蓋：成分／材質有什麼根據、為什麼賣這個價、跟便宜的替代品差在哪、誰不適合用。答不出來的問題就誠實說「這題我回去確認完在限動回你」，不要硬掰。另外主動丟一個問題請觀眾留言決定下一個要看什麼。
- 高潮／優惠公布：公布直播限定的優惠、代碼或福利，講清楚怎麼拿、什麼時候截止。若使用者沒有提供優惠，就改成公布「只有直播講」的獨家資訊、名額或搶先體驗，不要自己編折扣。**同時要宣布一個看得到的集體目標**，讓留下來的人知道「再一起做到什麼就會發生什麼事」（例：留言破 100 就拆第二件新品 / 同時在線破 500 就多抽一位），目標門檻要合理、獎勵要當場兌現得了。
- 限時催單：先**回報集體目標的進度**（還差多少、快到了），再講剩餘名額／庫存／倒數，引導私訊或點連結。急迫感來自「就快達標了」與真實的剩餘量，不要恐嚇、不要誇大不實。
- 收尾預告：謝謝陪伴、用一句話複習今天重點、公布集體目標最後有沒有達標並兌現、預告下一場時間與主題，請觀眾追蹤並開啟通知。

【絕對規則】
- 全篇繁體中文台灣用語，不要簡體字。
- 折扣數字、名額、價格、庫存只能用使用者輸入或品牌資料裡真的有的；沒有就用「直播限定福利」這類不涉及具體數字的講法。集體目標的門檻可以自己設，但要標成建議值。
- 不要出現任務名稱、agent 的自我介紹、英文 prompt、image_style 之類技術註記。
- 只輸出你這一段，不要把其他 5 段一起寫出來。`,
    preferredModel: "qwen",
    maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },

  // 7b. IG 直播衝人數活動腳本 — Amy Huang, strategist: Ryan Yu (growth), 7 段
  //
  // 2026-08-23 (CJ「把 acun / deepika 做成 IG 直播底下的不同任務卡，不要糾結
  // 在單一任務裡面用 pill 分類」): 帶貨型（ig-60-live-suite）只是直播的一種。
  // 這張卡是「事件型」——原型是 Acun Ilıcalı 2020-05-25 那場 IG 直播（2 分鐘
  // 300 萬同時觀看，破當時世界紀錄）。他做對的不是內容，是把直播變成一個有
  // 明確終點的集體任務：公開的數字目標、會跳動的進度、達標當場兌現（島上
  // 派對）。觀眾不是來看主播，是來一起達成一件事。
  {
    id: "ig-60-live-event",
    tier: "60s",
    postType: "live",
    label: { en: "IG Live Audience-Goal Event", zh: "IG 直播衝人數活動腳本" },
    description: { en: "Turn the live into a collective mission with a visible number: warm-up, goal, sprint, progress calls, final push, payoff", zh: "把直播變成有數字目標的集體任務：開播前預熱 → 目標宣告 → 衝刺 → 進度回報 → 臨門一腳 → 達標當場兌現" },
    agent_id: 30009, // Amy Huang — Event Marketing Strategy PM
    skill_slug: "live-content",
    primary_question: "這場直播想跟觀眾一起達成什麼數字？達標你要當場給什麼？",
    primary_input: { key: "live_goal", placeholder: "例：週年慶開箱直播，目標同時在線 300 人，達標當場抽 3 組新品；沒達標也會公布下一場目標", type: "textarea" },
    inputs: [
      { key: "live_goal", label: "直播主題 / 集體目標 / 達標獎勵", type: "textarea", required: true },
    ],
    systemPrompt: `你在寫「IG 直播衝人數活動」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 7 段依序是：
T-24h 預熱宣告 → 00:00-03:00 目標宣告 → 03:00-10:00 第一波衝刺 →
10:00-18:00 內容填充 → 18:00-24:00 臨門一腳 → 24:00-28:00 達標兌現 →
28:00-30:00 下一個目標。

【這是直播執行腳本，不是 IG 貼文（最高優先）】
- 讀的人是「正要開播的主播 / 小編」，他會把這頁放在鏡頭旁邊邊看邊播。
- 嚴禁寫成貼文文案、嚴禁 hashtag、嚴禁「儲存這篇」「點 bio 連結」這種貼文 CTA。
- 主播口白＝可以直接照著唸出來的口語，不是書面文案。

【這種直播的核心 — 每一段都要遵守】
- 觀眾不是來看主播，是來「一起達成一件事」。每一段都要出現那個數字。
- 目標必須是觀眾做得到、而且主播在畫面上看得到的（同時在線人數 / 留言數 /
  分享到限動的截圖數 / 標記朋友數），不要用主播看不到的指標。
- 進度要一直播報，哪怕是估的：「現在 180，還差 120」。張力來自計數器，不是口才。
- 獎勵必須當場兌現得了（當場抽、當場拆箱、當場公布名單）。「之後會…」沒有用。

【輸出格式 — 只有這四個方括號標題，順序固定，前後不要多寫任何字】
【時間】本段的時間段（例：03:00-10:00；第一段寫 T-24h）
【流程階段】只寫階段名稱本身，4-8 字。不要加副標、不要用「｜」。
【畫面／動作指示】2-4 條，每條以「・」開頭，寫主播當下要做的具體動作：鏡位、要看哪個數字、要點開哪個功能（留言區 / 觀看人數 / 限動分享）。
【主播口白】用「」包住 2-4 句可以直接唸的話，其中一定要包含當下的數字與一個明確的集體指令。

【各段各自要做到的事（只寫你被指派的那一段）】
- T-24h 預熱宣告：開播前 24 小時要做的事。用限動投票問一題跟主題相關的問題（開播時要唸結果），並把「時間 + 目標 + 達標獎勵」講成一句話貼出去。同時指派一位「頭號留言者」（同事 / 店長 / 夥伴），負責開播前 3 分鐘回應主播每一次提問，讓留言區先有人講話。
- 目標宣告：不要自我介紹。第一句就講「我們今天要一起做到什麼、做到會發生什麼」，並唸出開播前的限動投票結果暖場。講清楚觀眾具體要做哪一個動作。
- 第一波衝刺：把動作講到最白（標記一位朋友 / 分享到限動並截圖回傳），現場回報數字變化，指名感謝前幾位。這段是把在線人數往上推的主力。
- 內容填充：數字在跑的同時要有東西看，不能只有喊口號。用主題本身的內容（展示、實測、故事）填滿，每 2-3 分鐘插一次進度回報。
- 臨門一腳：講還差多少、還剩幾分鐘，給一個具體的最後推力（差 30 個就先拆一個）。有急迫感但不恐嚇、不誇大。
- 達標兌現：達標就當場兌現，動作要寫清楚（現場抽、現場拆、唸出名單）。沒達標也要誠實講，並把已經給得起的部分先給，不要跳過這一段。
- 下一個目標：謝謝參與、公布最終數字、預告下一場的時間與下一個目標，請觀眾追蹤並開啟通知。

【絕對規則】
- 全篇繁體中文台灣用語，不要簡體字。
- 獎品、名額、折扣只能用使用者輸入或品牌資料裡真的有的。目標數字可以自己建議，但要標成建議值。
- 不要出現任務名稱、agent 的自我介紹、英文 prompt、image_style 之類技術註記。
- 只輸出你這一段，不要把其他 6 段一起寫出來。`,
    preferredModel: "qwen",
    maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },

  // 7c. IG 創辦人開講直播腳本 — Yizhen Lai (brand story), strategist: Grace Wu, 5 段
  //
  // 2026-08-23: 「創辦人型」直播，原型是 Deepika Padukone 的 82°E 上市直播。
  // 開場不是產品是命名與起源（82°E 是穿過印度的經線），做這個品類的理由是
  // 一句私人陳述（"Skincare because it has been very personal to me"），留言區
  // 事先有頭號支持者（Ranveer Singh 全程洗版）。她另外常用事前徵題的 AMA。
  // 這場也有公開的翻車紀錄：粉絲問產品、創辦人答不清楚，加上定價爭議 → 所以
  // 這張卡把「最難的三題」獨立成一段，強制備答。
  {
    id: "ig-60-live-founder",
    tier: "60s",
    postType: "live",
    label: { en: "IG Founder-Led Live", zh: "IG 創辦人開講直播腳本" },
    description: { en: "Founder on camera: origin story, why me, pre-collected AMA, the three hardest questions answered, then an invitation instead of a hard sell", zh: "創辦人親上鏡：起源故事 → 為什麼是我 → 事前徵集的提問 → 最難的三題（定價／根據／比較）→ 邀請而不是催單" },
    agent_id: 60068, // Yizhen Lai — Brand Story Copy
    skill_slug: "live-content",
    primary_question: "你（創辦人）為什麼做這個品牌？這場想講的產品或決定是什麼？",
    primary_input: { key: "founder_story", placeholder: "例：我自己敏感肌 10 年、試過的都刺痛才決定自己做；這次想講新防曬為什麼賣 1280", type: "textarea" },
    inputs: [
      { key: "founder_story", label: "創辦動機 / 這次要講的產品或決定", type: "textarea", required: true },
    ],
    systemPrompt: `你在寫「IG 創辦人開講直播」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 5 段依序是：
00:00-04:00 起源故事 → 04:00-10:00 為什麼是我 → 10:00-20:00 事前徵集提問 →
20:00-26:00 最難的三題 → 26:00-30:00 邀請與下一步。

【這是直播執行腳本，不是 IG 貼文（最高優先）】
- 讀的人是「準備上鏡的創辦人」，他會把這頁放在鏡頭旁邊邊看邊講。
- 嚴禁寫成貼文文案、嚴禁 hashtag、嚴禁「儲存這篇」「點 bio 連結」這種貼文 CTA。
- 口白＝創辦人可以直接照著講的口語，第一人稱，不是品牌新聞稿。

【這種直播的核心 — 每一段都要遵守】
- 賣的是「為什麼是我來做這件事」，不是規格。觀眾買的是可信度。
- 用具體的私人時刻，不要使命宣言。壞例：「我們致力於提供最好的產品」；
  好例：「那天我第三次退貨，坐在地上想說不然自己做算了」。
- 不要業配腔、不要「在這個時代」「用心打造」這類空話。
- 這場的收尾不是催單，是邀請。關係比轉換重要。

【輸出格式 — 只有這四個方括號標題，順序固定，前後不要多寫任何字】
【時間】本段的時間段（例：00:00-04:00）
【流程階段】只寫階段名稱本身，4-8 字。不要加副標、不要用「｜」。
【畫面／動作指示】2-4 條，每條以「・」開頭，寫創辦人當下要做的具體動作：鏡位、手上拿什麼、要點開哪個功能、要看哪裡。
【主播口白】用「」包住 2-4 句可以直接講的第一人稱口語，其中要有一個當下就能做的互動指令（留言問我 / 按愛心 / 投票選下一個主題）。

【各段各自要做到的事（只寫你被指派的那一段）】
- 起源故事：開場**不要講產品**。講品牌名字或這件事的由來——名字從哪來、為什麼是這個名字、跟你的人生哪一段有關。第一條動作指示要指派一位「頭號留言者」（夥伴 / 同事），前 3 分鐘負責回應每一次提問，讓留言區先熱起來。
- 為什麼是我：一段具體的個人經驗，說明為什麼是你來做這個品類。要有時間、地點、當下的感受，不要抽象。結尾把它接回這次要講的產品或決定。
- 事前徵集提問：第一條動作指示必須是「（開播前 24 小時）用限動問答貼紙收題，挑 5 題」。這一段把挑好的問題唸出來回答，並在畫面上點開精選提問。要寫出 5 個「觀眾真的會問」的具體問題與回答方向，不能只寫「回答粉絲提問」。
- 最難的三題：獨立處理三個會傷到信任的問題，每題都要有實際答案：(1) 為什麼賣這個價 (2) 成分／材質／工法有什麼根據 (3) 跟便宜的替代品差在哪。答不出來的就誠實說「這題我回去確認完在限動回你」，不要硬掰、不要迴避。
- 邀請與下一步：謝謝陪伴、用一句話收攏今天講的事、邀請觀眾進社群或追蹤（不是催單），並讓觀眾投票決定下一場想聽什麼。

【絕對規則】
- 全篇繁體中文台灣用語，不要簡體字。
- 價格、成分、數據只能用使用者輸入或品牌資料裡真的有的；沒有就把答法寫成「我回去確認完在限動回你」，不要自己編成分或數字。
- 不要出現任務名稱、agent 的自我介紹、英文 prompt、image_style 之類技術註記。
- 只輸出你這一段，不要把其他 4 段一起寫出來。`,
    preferredModel: "qwen",
    maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },

  // 8. IG 3 篇連載 — Yizhen Lai, strategist: Nelson Chen, multi-post 3
  {
    id: "ig-60-serial-3",
    tier: "60s",
    postType: "feed",
    label: { en: "IG 3-Part Serial Narrative", zh: "IG 3 篇連載敘事" },
    description: { en: "Strategist designs a 3-part arc + 3 hooked serial posts", zh: "Strategist 設計 3 集弧 + 3 篇有勾連的連載貼文" },
    agent_id: 60028, // Wendy Chi | EdTech Social Copywriter
    skill_slug: "social-copy",
    primary_question: "想連載講什麼故事？",
    primary_input: { key: "story_topic", placeholder: "客戶轉型 / 團隊成長 / 產品歷程", type: "textarea" },
    inputs: [
      { key: "story_topic", label: "連載主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 3 篇連載其中 1 篇（150-250 字）。
本次你寫的是「{label}」集（第 1 / 2 / 3 集）。
篇與篇要有勾連（每篇結尾留鉤子帶到下一篇）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 9. IG 爆款改寫 — Jake Chou, strategist: Kevin Liu, specialty: Cheng-Tse Liao
  {
    id: "ig-60-viral-rewrite",
    tier: "60s",
    postType: "feed",
    label: { en: "IG Viral Post Rewrite", zh: "IG 爆款改寫" },
    description: { en: "Strategist maps the viral structure + brand rewrite + comparison table", zh: "Strategist 找原爆款結構 + 改寫品牌版 + 對照表" },
    agent_id: 180145, // Sophia Lin | Social Content Creator
    skill_slug: "instagram-copywriting",
    primary_question: "貼上爆款原文 / 連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款貼文 / 連結 / 主題", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結 / 主題", type: "textarea", required: true },
      { key: "brand_angle", label: "品牌切入角度（可選）", type: "textarea", required: false },
    ],
    systemPrompt: `產出 IG 爆款改寫文（150-300 字）。
保留原爆款的「敘事結構 / hook 機制 / 情緒節奏」，內容換成品牌自己的事。學結構不抄文字。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 10. IG 客戶見證改寫 — Emily Wang, strategist: Kurt Chen, specialty: Jason Evans
  {
    id: "ig-60-testimonial-rewrite",
    tier: "60s",
    postType: "feed",
    label: { en: "IG Testimonial Rewrite", zh: "IG 客戶見證改寫" },
    description: { en: "Strategist maps testimonial structure + narrative rewrite + legal check", zh: "Strategist 找見證結構 + 改寫敘事 + 法務檢核" },
    agent_id: 180152, // Tom Huang | Social Media Content Strategist
    skill_slug: "instagram-copywriting",
    primary_question: "貼上客戶見證 / 訪談 / 評價",
    primary_input: { key: "testimonial_source", placeholder: "客戶原話、訪談逐字、評論截圖文字", type: "textarea" },
    inputs: [
      { key: "testimonial_source", label: "客戶見證原文", type: "textarea", required: true },
      { key: "consent_status", label: "已取得發布同意？", type: "text", required: false, placeholder: "yes / 匿名化 / 待確認" },
    ],
    systemPrompt: `產出 IG 客戶見證改寫文（150-250 字）。
保留客戶情感真實感，重組敘事讓重點凸顯。
法務：預設匿名化、不編造客戶沒說過的話、數字宣稱必須有原文支持。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
];

// ─── Orchestra configs ──────────────────────────────────────────────────────

export const IG_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ig-60-feed-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: NANCY,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["情感版", "理性版", "故事版", "數據版", "懸念版"],
    captionMinChars: 120, captionMaxChars: 250,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-reel-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_ANGEL,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["教學版", "故事版", "反差版", "節奏版", "懸念版"],
    captionMinChars: 200, captionMaxChars: 400,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-carousel-7": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_OWEN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["教學式", "清單式", "故事式", "對比式", "金句式"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 222308, // Hsin-Yi Wu — Email Marketing & CRM Strategist (1415 char)
    extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
  },

  "ig-60-story-3frame": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: IG60_DIR_RITA,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["前情鋪陳", "重點揭曉", "CTA 收束"],
    captionMinChars: 30, captionMaxChars: 60,
    postLabels: ["前情鋪陳", "重點揭曉", "CTA 收束"],
    extras: { postsCount: 3, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-countdown-5day": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_KAREN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["第5天", "第4天", "第3天", "第2天", "第1天"],
    captionMinChars: 80, captionMaxChars: 130,
    strategistAgentId: 224084, // Michelle Lim — Social Media Strategist Beauty MY (1178 char)
    postLabels: ["第5天（認知）", "第4天（差異化）", "第3天（信任）", "第2天（誘因）", "第1天（最後衝刺）"],
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-highlight-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_NELSON,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["About", "商品", "FAQ", "客評", "案例"],
    captionMinChars: 30, captionMaxChars: 60,
    postLabels: ["About", "商品", "FAQ", "客評", "案例"],
    extras: { postsCount: 5, highlightCovers: 5, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  // 2026-08-22 (CJ 驗收 /run/4006): 5 篇直播周邊貼文 → 6 段 30 分鐘流程表。
  // cleanPrompt=true 讓四欄格式不被社群 caption scaffolding（hashtag 文末 /
  // 不要結構化卡片 / 首行 hook）蓋掉，也順帶關掉 IG craft 產後改寫。
  "ig-60-live-suite": {
    variants: 6, images: 6, runImageGen: true, imageDirectorId: IG60_DIR_TODD,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["00:00-03:00 黃金開場", "03:00-10:00 主軸切入", "10:00-18:00 深度互動", "18:00-23:00 高潮／優惠公布", "23:00-28:00 限時催單", "28:00-30:00 收尾預告"],
    captionMinChars: 200, captionMaxChars: 500,
    strategistAgentId: 60034, // Ethan Tsai — Travel Short Video Scriptwriter (942 char)
    postLabels: ["00:00-03:00 黃金開場", "03:00-10:00 主軸切入", "10:00-18:00 深度互動", "18:00-23:00 高潮／優惠公布", "23:00-28:00 限時催單", "28:00-30:00 收尾預告"],
    cleanPrompt: true,
    cleanPromptVariantHint: "只寫「這一段」時間軸，完全照任務指定的四個方括號欄位輸出這一段的內容。",
    cleanPromptCaptionSpec: "<這一段的四欄純文字內容，保留【時間】【流程階段】【畫面／動作指示】【主播口白】四個方括號標題與換行>",
    strategistDeliverable: "一場 30 分鐘 IG 直播的完整流程腳本",
    strategistUnit: "段",
    extras: { postsCount: 6, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  // 2026-08-23 (CJ「做成不同任務卡」): 事件型 —— 7 段，含開播前那一段。
  "ig-60-live-event": {
    variants: 7, images: 7, runImageGen: true, imageDirectorId: IG60_DIR_LYDIA,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["T-24h 預熱宣告", "00:00-03:00 目標宣告", "03:00-10:00 第一波衝刺", "10:00-18:00 內容填充", "18:00-24:00 臨門一腳", "24:00-28:00 達標兌現", "28:00-30:00 下一個目標"],
    captionMinChars: 200, captionMaxChars: 500,
    strategistAgentId: 60007, // Ryan Yu — Growth + campaign-orch
    postLabels: ["T-24h 預熱宣告", "00:00-03:00 目標宣告", "03:00-10:00 第一波衝刺", "10:00-18:00 內容填充", "18:00-24:00 臨門一腳", "24:00-28:00 達標兌現", "28:00-30:00 下一個目標"],
    cleanPrompt: true,
    cleanPromptVariantHint: "只寫「這一段」時間軸，完全照任務指定的四個方括號欄位輸出這一段的內容。",
    cleanPromptCaptionSpec: "<這一段的四欄純文字內容，保留【時間】【流程階段】【畫面／動作指示】【主播口白】四個方括號標題與換行>",
    strategistDeliverable: "一場以集體目標為核心的 IG 直播活動流程腳本",
    strategistUnit: "段",
    extras: { postsCount: 7, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  // 創辦人型 —— 5 段，收尾是邀請不是催單，所以沒有催單段。
  "ig-60-live-founder": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_DREW,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["00:00-04:00 起源故事", "04:00-10:00 為什麼是我", "10:00-20:00 事前徵集提問", "20:00-26:00 最難的三題", "26:00-30:00 邀請與下一步"],
    captionMinChars: 200, captionMaxChars: 500,
    strategistAgentId: 180006, // Grace Wu — Brand Storyteller
    postLabels: ["00:00-04:00 起源故事", "04:00-10:00 為什麼是我", "10:00-20:00 事前徵集提問", "20:00-26:00 最難的三題", "26:00-30:00 邀請與下一步"],
    cleanPrompt: true,
    cleanPromptVariantHint: "只寫「這一段」時間軸，完全照任務指定的四個方括號欄位輸出這一段的內容。",
    cleanPromptCaptionSpec: "<這一段的四欄純文字內容，保留【時間】【流程階段】【畫面／動作指示】【主播口白】四個方括號標題與換行>",
    strategistDeliverable: "一場創辦人親自上鏡的 IG 直播流程腳本",
    strategistUnit: "段",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-serial-3": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: IG60_DIR_DAWN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["第 1 集", "第 2 集", "第 3 集"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 30020, // Iris Yi — Social Media Manager (2001 char)
    postLabels: ["第 1 集", "第 2 集", "第 3 集"],
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-viral-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_BRIAN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["保結構式", "情感放大式", "反差式", "數據式", "故事式"],
    captionMinChars: 150, captionMaxChars: 300,
    strategistAgentId: 180155, // Grace Liao — Social Media Advertising Specialist (1594 char)
    specialtyAgentId: 180605,  // Jason Lee — SVP & General Counsel (compare/claims review)
    extras: { compareTable: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-testimonial-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_PENNY,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["故事式", "對比式", "數據式", "情感式", "簡短式"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 220754, // Kurt Chen
    specialtyAgentId: 180559,  // Deborah Williams — VP & Chief Legal Officer
    extras: { legalAssistant: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
};

export function getIG60Template(taskId: string): FBTaskTemplate | null {
  return IG_60S_TASKS.find((t) => t.id === taskId) ?? null;
}
export function getIG60OrchestraConfig(taskId: string): OrchestraConfig | null {
  return IG_60S_ORCHESTRA[taskId] ?? null;
}
