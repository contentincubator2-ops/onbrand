/**
 * TikTok quick-task templates (2026-05-05).
 * 10 TT 30s tasks. All caption_writer agents distinct from FB+IG+YT pools.
 * image_director = Anna Tseng (180165, Visual Content Strategy Director).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const TT_SUFFIX = `
TikTok 觀眾極短專注力。前 1.5 秒沒抓到 = 滑掉。語氣要野、不要官腔。`;

/**
 * 高互動機制卡共用的鐵律 + 輸出格式（2026-08-23）。
 *
 * 這五條是從史上最多讚的 10 支 TikTok 反推出來的共同點。它們全都是
 * 「畫面怎麼演」的規則，不是文案規則 —— 這類卡的交付物是可以照著拍的
 * 分格腳本，不是旁白稿，所以格式必須逼模型一格一格寫，不能寫成散文。
 */
const TT_MECHANIC_CORE = `
【讀的人是誰 — 最高優先】
讀這份腳本的人，是等一下要拿手機去拍的人（品牌小編、店員、老闆本人）。
他會把這頁開在旁邊，一格一格照著拍。所以每一行都要是「他看完就知道手該
放哪、鏡頭對哪裡」的指示，不是描述影片看起來像什麼。
判準：把腳本交給一個沒參與討論的同事，他能不問問題就拍完。做不到就是還不夠具體。

【這類影片的共同鐵律 — 五條都要遵守】
① 零台詞或極少台詞：交付的是「畫面怎麼演」，要說的話用字卡，不要寫旁白稿。
② 前 0.5 秒畫面就要有懸念：鉤子是眼睛看到的東西，不是一句開場白。
③ 只做一件事：一支片一個滿足點。不要三段論，不要條列三個重點。
④ 動作卡在拍點上：每個切換都要標拍點或時間戳，剪接點就是節奏。
⑤ 可循環：最後一格要能無縫接回第一格，觀眾不自覺就重播。

【輸出格式 — 每一格都照這五行寫，不可寫成散文】
[起-迄s] 這一格的名稱
　畫面：手機放哪（平拍／俯拍／貼地）+ 景別（特寫／中景／全身）+ 畫面裡有什麼
　動作：誰的手、對什麼東西、做什麼、多快（一格只寫一個動作）
　聲音：音樂拍點 / 現場音 / 音效（沒有旁白就寫「無旁白」）
　字卡：畫面上出現的字（≤12 字；沒有就寫「無」）

【「畫面」與「動作」寫到什麼程度才算合格】
　✗ 畫面：廚房場景，產品放在桌上　　→ 拍的人不知道鏡頭要放哪、要拍多近
　✓ 畫面：手機平放桌面高度、鏡頭與桌面同高，中景，產品置中，背景是白牆
　✗ 動作：展示產品　　　　　　　　→ 怎麼展示？誰展示？多快？
　✓ 動作：右手把產品從左邊推進畫面正中央，約 1 秒，推到定位後停住不動

【格數與長度 — 這條沒守住，後面兩個區塊就寫不完】
全片只切 5-7 格，不要逐一分解每個細微動作（拿出來、放下、打開… 併成一格）。
每格四行加起來 ≤ 70 字。寫到第 7 格就收，把剩下的篇幅留給下面兩個區塊。

【腳本之後，一定要接這兩個區塊（各自獨立一段，用方括號標題）】
【開拍前準備】（五行，每行 ≤25 字）
　・器材：先給手機拍得出來的做法；要腳架／補光燈也寫出來
　・場地：在哪拍、背景、光從哪來
　・道具：這支片要備的東西，含數量
　・人力：幾個人、各自做什麼（只有一人時怎麼拍也要寫）
　・預估：拍攝＋重拍大約多久
【常見失誤】（兩行，每行 ≤35 字）
　照這個範本寫兩行，每行只出現一次「失誤：」和一次「改法：」：
　　失誤：手機被碰到位移　改法：用膠帶在桌面標機位，每次放回同一點
　　失誤：手影擋住產品　　改法：補光燈從上方 60 度打下來
　解法要當場檢查得出來，禁止「注意光線」「保持穩定」這種誰都知道的話。
　※ 標題就寫【常見失誤】四個字，不要自己改長。不要加編號、不要用箭頭
　　（→ 會被系統清掉），兩個欄位之間空一格就好。

※ 實測會踩的兩個雷，務必避開：
　- 四行必須**各自獨立換行**。不可以擠成一行，不可以用方括號 [畫面：…] 包起來。
　- 時間戳那一行**只放格名**（例：[0.0-0.5s] 開場）。畫面內容一律寫在下一行的「畫面：」。

【硬規則 — 違反即不合格】
- 全片 8-15 秒，標時間戳。這類機制越短越好，不要寫成 60 秒。
- 品牌的賣點要是畫面裡的主角，不能只在最後一格才出現。
- 結尾 CTA 用字卡或畫面呈現，禁止「按讚追蹤分享」這種罐頭句。
- 不得指名真實名人，不得照抄任何特定爆款的內容、金句或分鏡。
- 拍攝條件要寫成一般品牌做得到的（手機 + 自然光 + 現有場地），
  需要空拍機或特殊器材時，必須同時給一個手機也拍得出來的替代方案。`;

export const TT_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "tt-30-opening-hook",
    source: {
      type: "viral",
      short: "e.l.f.「#eyeslipsface」",
      metric: "6 天破 10 億次播放，當時史上最快",
      asOf: "2019-10",
      takeaway:
        "記憶點做在「聲音」不是畫面：品牌委製原創音樂，鉤子在觀眾沒看畫面時仍然成立。",
    },
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

  // ── 高互動機制腳本卡（2026-08-23 CJ「參考史上互動最高的 10 支 TikTok」）──
  //
  // 來源：TikTok 史上最多讚的 10 支影片（41M–78.7M 讚）。這 10 支沒有一支
  // 在賣東西，也沒有一支有 CTA —— 直接「改寫成品牌版」只會做出漂亮但不
  // 轉換的腳本（而且「車站偶遇 8 歲小提琴女孩」這種機緣本來就無法改寫）。
  // 所以搬的是它們共享的**視覺機制**，不是內容：
  //
  //   零台詞 · 0.5 秒內畫面就有懸念 · 單一滿足點 · 動作卡拍點 · 可循環
  //
  // 10 支歸成 5 種機制，一種機制一張卡，讓用戶自己挑要拍哪一種：
  //   視覺魔術（倒轉特效對嘴 78.7M / 非綠幕特效 58.0M / TimeWarpScan 43.3M）
  //   從無到有（巧克力草莓 52.1M / 繪畫展示 52.3M）
  //   卡點快剪（加速 remix 54.4M / 音量爆點 46.3M）
  //   尺度揭曉（空拍 45.7M）
  //   真實反應（車站鋼琴＋小提琴女孩 58.3M / 大笑反應 41.0M）
  //
  // 全部歸在「腳本」類別（見 client TT_TASK_FORMAT_MAP），交付物是可以照著
  // 拍的分格腳本，不產圖（runImageGen:false）—— 用戶會想連試好幾種機制，
  // 每張卡都要便宜。
  {
    id: "tt-30-visual-illusion",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok One-Second Flip Script (8–15s)", zh: "TikTok 一秒變身腳本（8-15 秒）" },
    description: { en: "Same frame, two different things · shot-by-shot visual / action / sound / on-screen text", zh: "同一個鏡頭前後判若兩物 · 逐格畫面／動作／音效／字卡" },
    agent_id: 180167,
    skill_slug: "tiktok-content",
    primary_question: "想拍什麼東西的「一秒變身」？",
    primary_input: { key: "topic", placeholder: "例：一秒收納的嬰兒推車 / 沖下去才變色的茶包", type: "textarea" },
    inputs: [{ key: "topic", label: "產品 / 主題 + 想被看見的那個瞬間", type: "textarea", required: true }],
    systemPrompt: `你在寫「視覺魔術式」TikTok 短片腳本。本變體的切角是「{label}」。

【這個機制為什麼有效】
史上最多讚的幾支片都靠同一招：畫面在一兩秒內做了一件眼睛沒預期的事，
觀眾看不懂「這是怎麼辦到的」，於是重播——重播率把互動推上去。
關鍵不是特效多炫，是**轉折點乾淨**：前一秒和後一秒必須判若兩物。

【各切角怎麼執行 — 嚴格照 {label} 走】
- 「一秒變身」：同一顆鏡頭、同一個構圖，一個遮擋或一次轉身之後主體完全變了。
- 「借位錯覺」：利用前後景錯位，讓兩個不相干的東西在畫面上接成一個。
- 「倒放回原」：慢動作與正常速度在同一鏡切換，或倒放讓散開的東西回到原位。

【這支片的骨架 — 下面只列「每一格要交代什麼」，實際輸出仍要照上面的四行格式寫】
[0.0-0.5s] 開場：先給一個「正常」的畫面，但構圖已經藏好破綻
[0.5-2.0s] 觸發：遮擋 / 轉身 / 潑水 / 蓋上——轉折的動作本身要快
[2.0-4.0s] 揭曉：變化後的畫面，停住讓人看清楚
[4.0-8.0s] 回放或重複：再做一次，讓人第二次看懂
${TT_MECHANIC_CORE}`,
    preferredModel: "qwen", maxTokens: 2000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-process-payoff",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Process Script (8–15s)", zh: "TikTok 製作過程腳本（8-15 秒）" },
    description: { en: "From raw to finished, no voiceover · shot-by-shot visual / action / sound / on-screen text", zh: "從原料到完成那一刻，全程無旁白 · 逐格畫面／動作／音效／字卡" },
    agent_id: 30011,
    skill_slug: "short-video-script",
    primary_question: "有什麼「做出來 / 弄好」的過程可以拍？",
    primary_input: { key: "topic", placeholder: "例：手沖一杯的 90 秒 / 亂到整齊的衣櫃 / 蛋糕裱花", type: "textarea" },
    inputs: [{ key: "topic", label: "要拍的過程 + 完成品", type: "textarea", required: true }],
    systemPrompt: `你在寫「從無到有滿足式」TikTok 短片腳本。本變體的切角是「{label}」。

【這個機制為什麼有效】
巧克力草莓、一幅畫的完成——這類片沒有一句話，觀眾就是為了看「完成的那一刻」
留下來。有效的關鍵是**開頭就先讓人知道結局會很爽**（先閃一格完成品），
然後才回到過程，觀眾才有理由等下去。

【各切角怎麼執行 — 嚴格照 {label} 走】
- 「製作過程」：原料 → 手的動作 → 成品。手是主角，臉不入鏡。
- 「整理復原」：混亂 → 秩序。前後同機位同構圖，對比才成立。
- 「組裝完成」：零散 → 一體。每個零件歸位都要有一個「卡進去」的瞬間。

【這支片的骨架 — 下面只列「每一格要交代什麼」，實際輸出仍要照上面的四行格式寫】
[0.0-1.0s] 先閃完成品 0.5 秒（承諾結局），立刻切回起點
[1.0-2.0s] 起點畫面：越亂／越素越好，對比才夠
[2.0-9.0s] 過程快剪：3-5 個關鍵動作，每個動作一格
[9.0-12.0s] 完成瞬間：慢下來，停 1 秒以上讓人看清楚
${TT_MECHANIC_CORE}`,
    preferredModel: "qwen", maxTokens: 2000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-beat-sync",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Beat-Sync Script (8–15s)", zh: "TikTok 音樂卡點腳本（8-15 秒）" },
    description: { en: "Multiple items or scenes cut on the beat · every shot marked with its beat + visual / action / on-screen text", zh: "多品項／多情境跟著拍點快切 · 每格標拍點＋畫面／動作／字卡" },
    agent_id: 60033,
    skill_slug: "short-video-script",
    primary_question: "有哪些品項 / 畫面想串成一支？",
    primary_input: { key: "topic", placeholder: "例：8 種口味輪流出場 / 一週穿搭 / 門市到出貨", type: "textarea" },
    inputs: [{ key: "topic", label: "要串起來的畫面或品項", type: "textarea", required: true }],
    systemPrompt: `你在寫「節奏卡點式」TikTok 短片腳本。本變體的切角是「{label}」。

【這個機制為什麼有效】
加速 remix、突然放大的音量——這類片的內容其實很普通，是**節奏**讓人看完。
關鍵在於切點必須精準壓在拍子上，一格差半拍整支就鬆掉。
所以這份腳本的每一格都要標「第幾拍」，不是只標秒數。

【各切角怎麼執行 — 嚴格照 {label} 走】
- 「多品項快切」：同機位同構圖，只換主體，每拍換一個。構圖不動是重點。
- 「情境輪播」：同一個人／同一個動作，場景每拍換一次。
- 「安靜→爆點」：前段刻意安靜緩慢，某一拍突然音量與剪接一起炸開。

【這支片的骨架 — 下面只列「每一格要交代什麼」，實際輸出仍要照上面的四行格式寫】
[第 1-2 拍] 建立規律：讓觀眾在兩拍內學會「接下來會怎麼切」
[第 3-8 拍] 執行規律：一拍一格，越切越快或越切越大
[第 9 拍]   破一次規律：停格 / 靜音 / 反向，這是全片的記憶點
[第 10-12 拍] 收：回到第一格的構圖，讓片子能無縫循環
${TT_MECHANIC_CORE}`,
    preferredModel: "qwen", maxTokens: 2000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-scale-reveal",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok One-Take Reveal Script (8–15s)", zh: "TikTok 一鏡到底腳本（8-15 秒）" },
    description: { en: "No cuts — the camera keeps pulling out until the scale lands · shot-by-shot visual / action / sound / on-screen text", zh: "鏡頭不剪接持續拉開，最後揭曉規模 · 逐格畫面／動作／音效／字卡" },
    agent_id: 60031,
    skill_slug: "short-video-script",
    primary_question: "有什麼「規模 / 數量 / 細節」值得被看見？",
    primary_input: { key: "topic", placeholder: "例：一天出貨 3000 箱的倉庫 / 一顆鏡片的 12 道工序", type: "textarea" },
    inputs: [{ key: "topic", label: "想被看見的規模或細節", type: "textarea", required: true }],
    systemPrompt: `你在寫「尺度震撼式」TikTok 短片腳本。本變體的切角是「{label}」。

【這個機制為什麼有效】
空拍那支靠的不是風景漂亮，是**尺度落差**：觀眾以為自己在看一個東西，
鏡頭一拉才發現規模完全不是那回事。腳本要設計的就是「什麼時候讓人發現」。

【各切角怎麼執行 — 嚴格照 {label} 走】
- 「細節拉到全景」：從一個極近的細節開始，一路後退到全景。
- 「一鏡到底走位」：鏡頭跟著一個主體穿過空間，用移動累積規模感。
- 「數量堆疊」：同一構圖，東西一件一件加進來，最後滿到出框。

【這支片的骨架 — 下面只列「每一格要交代什麼」，實際輸出仍要照上面的四行格式寫】
[0.0-2.0s] 起手：極近或極窄的畫面，觀眾此刻誤判了規模
[2.0-8.0s] 持續拉開：不要剪接，用移動或變焦，速度平穩
[8.0-12.0s] 揭曉：全貌出現的那一刻停住，讓數字或規模自己說話
[12.0-15.0s] 收：字卡點出這代表什麼（一句，≤12 字）
${TT_MECHANIC_CORE}`,
    preferredModel: "qwen", maxTokens: 2000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-real-reaction",
    tier: "30s",
    postType: "foryou",
    label: { en: "TikTok Real Reaction Script (8–15s)", zh: "TikTok 真實反應腳本（8-15 秒）" },
    description: { en: "Film a customer's first-use reaction (not acted) · shot-by-shot visual / action / live sound / on-screen text + consent reminder", zh: "拍顧客第一次使用的真實反應（不是演的） · 逐格畫面／動作／現場音／字卡＋同意提醒" },
    agent_id: 180158,
    skill_slug: "social-engagement",
    primary_question: "誰第一次用你的產品時，會有藏不住的反應？",
    primary_input: { key: "topic", placeholder: "例：阿嬤第一次用語音助理 / 客人聞到剛出爐那一下", type: "textarea" },
    inputs: [{ key: "topic", label: "誰 + 在什麼情境下會有反應", type: "textarea", required: true }],
    systemPrompt: `你在寫「真實反應式」TikTok 短片腳本。本變體的切角是「{label}」。

【這個機制為什麼有效】
車站裡陌生小女孩加入合奏、真的笑到停不下來——這類片贏在**情緒會傳染**，
而且觀眾一眼分得出真假。所以這份腳本不能寫「演員演出驚訝」，
要寫的是「怎麼佈置一個情境，讓反應自己發生，攝影機剛好在」。

【各切角怎麼執行 — 嚴格照 {label} 走】
- 「第一次使用」：找真的沒用過的人，不預告會發生什麼，機器先開著。
- 「旁人被吸引」：拍主體做事，重點在旁邊路人的視線與停留。
- 「素人真實回饋」：問一個開放問題後閉嘴，等對方自己講出那句話。

【這支片的骨架 — 下面只列「每一格要交代什麼」，實際輸出仍要照上面的四行格式寫】
[0.0-1.5s] 情境交代：一眼看懂是誰、在哪、正要發生什麼
[1.5-4.0s] 觸發：把東西交給對方 / 打開 / 開始，不要提示反應
[4.0-9.0s] 反應本身：不剪接、不配樂蓋掉現場音，讓表情完整發生
[9.0-12.0s] 落點：字卡點出這個反應說明了什麼

【這張卡的特別規則】
- 禁止寫台詞讓人「照著念」。要寫的是「問什麼問題 / 怎麼交給對方」。
- 必須寫一段「拍攝前要先取得同意」的提醒（尤其涉及長輩、小孩、路人）。
- 如果情境需要素人，腳本要說明去哪找（現有顧客 / 門市現場 / 員工家人）。
${TT_MECHANIC_CORE}`,
    preferredModel: "qwen", maxTokens: 2000,
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
    source: {
      type: "viral",
      short: "Ocean Spray × Nathan Apodaca「Dreams」",
      metric: "原片 8,000 萬次觀看、1,290 萬讚、14.3 萬留言",
      asOf: "2020-09",
      takeaway:
        "品牌沒有發起這支影片，是接住素人已經跑起來的動能——合拍要找「已經有人在做的事」，不是自己起一個梗。",
    },
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
- **一行只放一句話**。嚴禁把兩句話用空格併在同一行 —— 那等於一張字卡塞兩句，
  觀眾讀不完。句子之間一律換行。
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

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "tt-30-live-relay-host",
    tier: "30s",
    postType: "live",
    label: { en: "Live: Swap Hosts, Not Just Products", zh: "TikTok 直播：換人比換品更留人" },
    description: { en: "Every segment opens like it's the first", zh: "每一段都當成新的開場" },
    agent_id: 60073, // 沿用同 postType 現役卡
    skill_slug: "live-script",
    source: {
      type: "viral",
      short: "Walmart TikTok 直播帶貨",
      metric: "觀看人數達預期 7 倍，帳號追蹤數 +25%",
      asOf: "2021-12",
      takeaway:
        "直播的流失發生在「聽不懂現在在幹嘛」的那一刻——每次換人都重講一次前提，等於每 10 分鐘救回一批新進來的人。",
    },
    primary_question: "這場直播要賣什麼？有誰可以輪流上場？",
    primary_input: { key: "topic", placeholder: "例：老闆 + 資深店員 + 一位常客", type: "textarea" },
    inputs: [
      { key: "topic", label: "商品 + 可輪流上場的人", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一份 60 分鐘的 TikTok 直播腳本，採「每 10 分鐘換一位主持」的接力制，共 6 段。

每段寫出：
- 主持人是誰、他的身分。
- 開場 20 秒：對剛進來的人重講一次現在賣什麼、優惠是什麼。
- 中段：這個人獨有的角度（他自己怎麼用、被客人問過什麼）。
- 交棒 15 秒：預告下一位是誰、會講什麼。

硬規則：
- 每段都要能單獨看懂，禁止出現「剛剛說過的」。
- 商品資訊每段完整重講，不要怕重複。
- 沒有給定的優惠不要編，寫成「主持人現場公布」。`,
    preferredModel: "qwen",
    maxTokens: 1320,
    outputDefaults: { platform: "tiktok", post_type: "live" },
  },
  {
    id: "tt-30-profile-self-aware",
    tier: "30s",
    postType: "profile",
    label: { en: "Profile: Build the Flaw Into the Persona", zh: "TikTok 帳號：把缺點寫進人設" },
    description: { en: "Own the joke people already make", zh: "用大家已經在笑的事當帳號主題" },
    agent_id: 220949, // 沿用同 postType 現役卡
    skill_slug: "tiktok-strategist",
    source: {
      type: "viral",
      short: "Ryanair 自嘲短影音",
      metric: "單月 16 支影片近 3,000 萬次觀看",
      asOf: "2022-08",
      takeaway:
        "帳號人設要從「別人已經在講的話」長出來，不是從品牌想被怎麼看長出來——認領那個笑點，你就從被笑變成主辦人。",
    },
    primary_question: "大家最常拿你們的什麼開玩笑？",
    primary_input: { key: "topic", placeholder: "例：座位很窄 / 排隊很久 / 包裝很醜", type: "textarea" },
    inputs: [
      { key: "topic", label: "大家最常拿來開玩笑的點", type: "textarea", required: true },
    ],
    systemPrompt: `你要設定一個 TikTok 帳號的人設，主題是「認領大家已經在笑的那件事」。

要產出：
1. 一句人設宣言（bio 用，不超過 40 字），要讓人一看就知道這帳號的立場。
2. 三種固定內容型態，每種寫清楚拍什麼、多長、固定的開場方式。
3. 面對負評的回覆原則，附 2 個範例回覆。
4. 一條紅線：什麼事不能拿來自嘲。

硬規則：
- 自嘲的必須是真的存在的缺點，不能是假謙虛（「我們就是太用心」）。
- 紅線一定要寫，安全、健康、歧視相關的事不能當梗。
- 不要在人設裡放產品優點清單。`,
    preferredModel: "qwen",
    maxTokens: 770,
    outputDefaults: { platform: "tiktok", post_type: "profile" },
  },
  {
    id: "tt-30-storyboard-catch-wave",
    tier: "30s",
    postType: "storyboard",
    label: { en: "Storyboard: Catch What Fans Already Filmed", zh: "TikTok 分鏡：接住素人已經拍好的東西" },
    description: { en: "Don't start a trend; continue someone's", zh: "不自己起梗，去續拍別人的" },
    agent_id: 180167, // 沿用同 postType 現役卡
    skill_slug: "tiktok-content",
    source: {
      type: "viral",
      short: "Ocean Spray × Nathan Apodaca",
      metric: "原片 8,000 萬次觀看、1,290 萬讚",
      asOf: "2020-09",
      takeaway:
        "爆點通常不是品牌製造的，是品牌接住的——續拍時要保留原作者的主角地位，品牌站第二位才有人願意再傳。",
    },
    primary_question: "有沒有人自發拍過跟你們有關的影片？",
    primary_input: { key: "topic", placeholder: "例：客人自己拍的開箱 / 有人在店門口跳舞", type: "textarea" },
    inputs: [
      { key: "topic", label: "已經有人自發拍過的內容", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一支「接住素人內容」的 TikTok 分鏡表。

輸出：5 格分鏡，每格標「畫面 / 動作 / 字卡 / 秒數」。

結構原則：
1. 第 1 格必須明確指向原作者（畫面重現、致敬、或直接合拍），讓人一眼認出這是續拍。
2. 中間 3 格：品牌用自己的資源把那件事做大（更大的場地、更多人、更好的設備）。
3. 最後 1 格：把功勞交回原作者，並邀請下一個人。

硬規則：
- 原作者要被指名，不能只是模仿卻不提。
- 不要在片中推銷產品，產品只能自然出現在畫面裡。
- 如果還沒取得原作者同意，在分鏡表最上方註明「需先取得授權」。`,
    preferredModel: "qwen",
    maxTokens: 1210,
    outputDefaults: { platform: "tiktok", post_type: "storyboard" },
  },
  // ── 爆款結構卡・近 3 個月案例（CJ 2026-09-29 核可）────────────────────
  // TikTok、2026-08～09 量測、數字已對照參考文章；弱點寫在 caveat。
  {
    id: "tt-30-live-landmark-launch",
    tier: "30s",
    postType: "live",
    label: { en: "Live: Landmark Launch Event", zh: "TikTok 直播：地標首賣事件" },
    description: { en: "Tease, landmark set, story, countdown, results post", zh: "預告→地標場景→產品故事→倒數開賣→戰報" },
    agent_id: 60073,
    skill_slug: "live-script",
    source: {
      type: "viral",
      short: "Sambal Nyet 新品 TikTok Shop 首賣直播",
      metric: "1 分 51 秒賣出 RM200 萬；同時在線 38.8 萬人",
      asOf: "2026-08",
      caveat: "馬來西亞案例；品牌由創作者本人創辦，自帶粉絲",
      url: "https://www.therakyatpost.com/news/malaysia/2026/08/10/khairul-aming-sets-five-new-tiktok-records-in-sambal-nyet-bilis-launch/",
      takeaway:
        "把新品上市做成一場有日期、有地標場景、有限量數字的直播事件，搶購本身變成內容，播完再發戰報收第二波聲量。",
    },
    primary_question: "要首賣的新品是什麼？有沒有一個有話題的地點？限量多少？",
    primary_input: { key: "topic", placeholder: "例：新口味辣椒醬 / 在老店的屋頂直播 / 限量 3,000 罐", type: "textarea" },
    inputs: [
      { key: "topic", label: "新品 + 直播地點 + 限量數字", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一場 TikTok Shop「新品首賣直播事件」，並寫出主持流程。

產出：
1. 預告（開播前 3 天、前 1 天、前 1 小時各一則短文案，40 字內）：日期、時間、限量數字。
2. 直播流程（約 45 分鐘）：
   - 開場 3 分鐘：介紹地點為什麼選這裡，和產品有什麼關係。
   - 產品故事 10 分鐘：配方、做法、為什麼做這款。
   - 倒數開賣：口令、限量數字，即時報庫存與秒數的講稿範例。
   - 加碼：最早下單者的小獎（不要編造你沒有的大獎，寫「主持人現場公布」）。
3. 戰報文案（播完 1 小時內）：賣出多少、幾分鐘、下一次什麼時候。

硬規則：
- 限量數字要真實，不能製造假稀缺。
- 不承諾沒有的優惠。`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "live" },
  },
  {
    id: "tt-30-account-staff-trend-lines",
    tier: "30s",
    postType: "profile",
    label: { en: "Account: Staff Cast + Branded Trends", zh: "TikTok 帳號：員工出演＋流行梗品牌版" },
    description: { en: "Test with product videos, then run two fixed series", zh: "先測商品影片，再開兩條固定企劃線" },
    agent_id: 220949,
    skill_slug: "tiktok-strategist",
    source: {
      type: "viral",
      short: "コメダ珈琲店 官方 TikTok",
      metric: "追蹤突破 20 萬；總觀看 2.2 億，單支最高 430 萬",
      asOf: "2026-09",
      caveat: "日本案例；代營運商發布的新聞稿，觀看數是累計",
      url: "https://prtimes.jp/main/html/rd/p/000000007.000108332.html",
      takeaway:
        "先用商品介紹影片測出受眾想看什麼，再固定兩條企劃線：員工出演、把流行格式改成品牌版；KPI 綁「讓年輕人變常客」而不是追蹤數。",
    },
    primary_question: "你們的經營目標是什麼？店裡有哪些員工願意上鏡？",
    primary_input: { key: "topic", placeholder: "例：讓大學生變常客 / 有兩位店長和一位很會跳舞的工讀生", type: "textarea" },
    inputs: [
      { key: "topic", label: "經營目標 + 可以上鏡的員工", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌規劃 TikTok 官方帳號的前 8 週營運。

產出：
1. KPI：從用戶給的經營目標倒推 2 個可追蹤指標（不要只寫追蹤數、觀看數）。
2. 第 1–2 週「測試期」：6 支商品介紹影片的主題，每支測一種角度（價格、做法、情境、員工推薦…），寫出要看哪個數字判斷勝出。
3. 第 3–8 週「兩條固定企劃線」：
   - 員工出演：3 個可以重複的單元名稱與一句話格式（例：「店長的一句話」）。
   - 流行格式品牌版：說明怎麼挑流行格式、怎麼改成品牌場景，給 2 個示範。
4. 每週覆盤表：固定看的 3 個數字與下一步怎麼調整。

硬規則：
- 員工出演要先取得同意，寫在規劃最上方。
- 不追需要特定音樂授權的流行音樂，選格式不選歌。`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "profile" },
  },
  {
    id: "tt-30-comment-ugc-hack",
    tier: "30s",
    postType: "comment",
    label: { en: "Comments: Show Up Under the Viral Hack", zh: "TikTok 留言：到顧客的爆紅吃法底下接梗" },
    description: { en: "Don't film it — comment on the customer's viral video", zh: "品牌不自己拍，在別人的爆紅影片底下口語接梗" },
    agent_id: 60055,
    skill_slug: "tiktok-ads",
    source: {
      type: "viral",
      short: "McDonald's 留言接「Cookie McDouble」吃法",
      metric: "創作者影片 1,060 萬觀看、近 99 萬反應；官方帳號下場留言",
      asOf: "2026-09",
      caveat: "數字屬於創作者的影片，不是品牌的；美國案例",
      url: "https://www.yahoo.com/lifestyle/articles/cookie-cheeseburger-mcdonalds-menu-hack-075922572.html",
      takeaway:
        "顧客自創的吃法爆紅時，品牌官方帳號在影片和後續二創底下用口語留一句不推銷的短評，用極低成本分到流量，之後再評估要不要做成限定品。",
    },
    primary_question: "最近有沒有顧客在 TikTok 上拍你們產品的「新吃法／新用法」？",
    primary_input: { key: "topic", placeholder: "例：有人把我們的冰淇淋夾進鬆餅 / 把飲料加兩份珍珠", type: "textarea" },
    inputs: [
      { key: "topic", label: "顧客的新吃法或用法", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌規劃「到顧客爆紅影片底下留言」的回應。

產出：
1. 第一則留言（15 字內）×3 個版本：口語、像朋友，不推銷、不放連結、不說「歡迎來店」。
2. 在二創（stitch／duet）影片底下的第二則留言 ×2 個版本。
3. 官方跟進影片的點子（可選）：主管或員工「正式試吃／試用」這個吃法的 15 秒腳本。
4. 後續判斷：這個吃法值不值得做成限定品，列 3 個判斷條件。

硬規則：
- 24 小時內留言，晚了就不要留。
- 不在涉及安全疑慮（食安、過敏、危險用法）的影片底下附和；遇到這種情況改寫「安全提醒」版本。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "tiktok", post_type: "comment" },
  },
  {
    id: "tt-30-account-embrace-creator-meme",
    tier: "30s",
    postType: "profile",
    label: { en: "Account: Adopt the Creator's Meme", zh: "TikTok 帳號：接住創作者給你的梗" },
    description: { en: "Rename, crown the creator, invite remixes", zh: "創作者誤讀品牌時，改名、封頭銜、辦二創" },
    agent_id: 220949,
    skill_slug: "tiktok-strategist",
    source: {
      type: "viral",
      short: "Vaseline 改名「Baseline」接梗",
      metric: "創作者 TikTok 影片 460 萬觀看、62.55 萬讚",
      asOf: "2026-08",
      caveat: "數字屬於創作者的影片；品牌自己的回應影片只有「數百萬觀看」",
      url: "https://www.fashiontimes.co.uk/vaseline-viral-baseline-marketing-1763315",
      takeaway:
        "創作者無意間把品牌名念錯而爆紅時，品牌立刻「承認並放大」：官方帳號改名、封創作者一個玩笑頭銜、邀粉絲用新名字二創，比自製廣告更快吃到聲量。",
    },
    primary_question: "有沒有創作者或顧客把你們的品牌名、產品念錯或用錯而變成梗？",
    primary_input: { key: "topic", placeholder: "例：大家都把我們的「沐光」念成「木瓜」", type: "textarea" },
    inputs: [
      { key: "topic", label: "被誤讀的方式 + 是誰開始的", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃品牌在 48 小時內「接住」創作者給的梗。

產出：
1. 判斷：這個梗會不會傷害品牌（負面、低俗、涉及他人）？會的話直接寫「不建議接」與原因。
2. 48 小時行動清單：
   - 官方帳號暫時改名／換頭像的文字（改多久、怎麼改回來）。
   - 給創作者的玩笑頭銜與公開致謝文案（40 字內）。
   - 私訊創作者的合作邀請（60 字內，先徵求同意再公開標記）。
3. 粉絲二創活動：一句話規則＋hashtag。
4. 品牌自拍「致敬」影片的 20 秒腳本。

硬規則：
- 先取得創作者同意再標記或使用其影片。
- 不嘲笑念錯的人；梗的主角是品牌自己。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "tiktok", post_type: "profile" },
  },
  {
    id: "tt-30-live-auction-trust",
    tier: "30s",
    postType: "live",
    label: { en: "Live: Inspect Each Item, Then Auction", zh: "TikTok 直播：逐件驗貨＋競標" },
    description: { en: "For high-ticket items, inspect on camera to earn trust", zh: "高單價、重真偽的品類，用鏡頭驗貨換信任" },
    agent_id: 60073,
    skill_slug: "live-script",
    source: {
      type: "viral",
      short: "英國 TikTok Shop 直播競標（Lux Laces 等）",
      metric: "Lux Laces 首場直播成交 £30,000；首月營收逾 £100,000",
      asOf: "2026-08",
      caveat: "英國案例；TikTok 官方新聞稿，首場直播日期未寫",
      url: "https://newsroom.tiktok.com/tiktokshoplivefashionandcollectables?lang=en-GB",
      takeaway:
        "稀缺品或二手品在直播中逐件展示細節與瑕疵，再用限時競標製造搶購，信任感直接轉成成交；固定班表從每週 2–3 場推到每天。",
    },
    primary_question: "你們賣什麼高單價或重真偽的東西？這一場有幾件？",
    primary_input: { key: "topic", placeholder: "例：二手名牌包 12 件 / 限量球鞋 8 雙", type: "textarea" },
    inputs: [
      { key: "topic", label: "品類 + 這一場的件數", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一場 TikTok 直播「逐件驗貨＋競標」的流程與主持稿。

產出：
1. 開場 2 分鐘：這一場有幾件、競標規則（起標價、每次加價、倒數秒數）、怎麼付款與出貨。
2. 每一件的固定段落（約 3 分鐘）：
   - 驗貨：正面、背面、細節、瑕疵，主持人主動講出瑕疵。
   - 來源與狀況：一句話講清楚。
   - 開標與倒數口令。
3. 收尾：成交清單口播、下一場時間、導追蹤。
4. 班表建議：從每週幾場開始、做到什麼數字再加場。

硬規則：
- 瑕疵一定要講，不能只拍好的一面。
- 不提供你無法保證的真偽證明；寫「依店家鑑定流程」。`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "live" },
  },
  {
    id: "tt-30-live-daily-show",
    tier: "30s",
    postType: "live",
    label: { en: "Live: A Named Daily Show", zh: "TikTok 直播：固定節目化的每日直播" },
    description: { en: "Name it, fix the time slot, hosts call out flaws", zh: "取節目名、固定時段，主持人主動講瑕疵" },
    agent_id: 60073,
    skill_slug: "live-script",
    source: {
      type: "viral",
      short: "Fashionphile 每日 TikTok 直播節目",
      metric: "美國 TikTok Shop 二手精品營收 94% 來自直播；品類 GMV 年增 400%",
      asOf: "2026-09",
      caveat: "美國案例；數字是整個品類的，不是單一品牌的單場",
      url: "https://www.modernretail.co/operations/nearly-all-luxury-resale-transactions-on-tiktok-shop-us-now-come-from-livestreams/",
      takeaway:
        "把直播做成有節目名、固定時段的「節目」，主持人主動講每件商品的狀況與瑕疵，點名熟客，留言區自然變成熟客社群。",
    },
    primary_question: "你們能每天固定哪個時段直播？主持人是誰？",
    primary_input: { key: "topic", placeholder: "例：每天晚上 9 點 / 店長和一位資深店員輪流", type: "textarea" },
    inputs: [
      { key: "topic", label: "固定時段 + 主持人", type: "textarea", required: true },
    ],
    systemPrompt: `你要把品牌的 TikTok 直播規劃成一個「每日固定節目」。

產出：
1. 節目名稱 3 個候選（每個 8 字內）與一句節目口號。
2. 固定時段與長度，以及每週的主題輪替（週一新品、週三瑕疵特價…）。
3. 單集流程（60 分鐘）：開場固定台詞、每件商品的固定段落（來源、狀況、瑕疵、尺寸）、熟客點名時間、收尾預告。
4. 熟客經營：怎麼記住常客、怎麼在直播中點名、怎麼在留言區讓熟客互相認識。

硬規則：
- 每件商品都要講狀況與瑕疵。
- 固定時段一旦公布就不要隨意更動；要改先預告一週。`,
    preferredModel: "qwen",
    maxTokens: 1000,
    outputDefaults: { platform: "tiktok", post_type: "live" },
  },
  {
    id: "tt-30-script-character-scorecard",
    tier: "30s",
    postType: "foryou",
    label: { en: "Script: Score a Famous Character", zh: "TikTok 腳本：用大家熟悉的角色打分數" },
    description: { en: "Ten quick scores, a verdict, then swap the character", zh: "10 項能力逐一打分，最後下判決，換角色就能量產" },
    agent_id: 180167,
    skill_slug: "tiktok-content",
    source: {
      type: "viral",
      short: "EMOLVA「用動漫角色評商業技能」系列",
      metric: "單支突破 100 萬觀看",
      asOf: "2026-08",
      caveat: "日本案例；公司自己發的新聞稿，影片上架日未查到",
      url: "https://prtimes.jp/main/html/rd/p/000000183.000021425.html",
      takeaway:
        "用大眾熟悉的角色當載體，套一個有評分、有判決的專業框架（錄不錄用），格式固定、換角色就能量產成系列。",
    },
    primary_question: "你們的專業可以拿來「評分」什麼？想用哪一類大家熟悉的角色？",
    primary_input: { key: "topic", placeholder: "例：用營養師的角度評分卡通角色的早餐 / 用房仲角度評分動畫裡的房子", type: "textarea" },
    inputs: [
      { key: "topic", label: "你的專業評分框架 + 角色類型", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支 45–60 秒的 TikTok「角色評分」腳本，並規劃成系列。

腳本結構：
1. 鉤子（3 秒）：「〇〇（角色）的＿＿能力幾分？」
2. 評分：5–10 項能力，每項一句理由＋一個分數，節奏要快（每項 3–5 秒）。
3. 公布總分。
4. 下判決（錄用／不錄用、買／不買、住／不住…）＋一句專業洞察。
5. 結尾預告下一個角色，邀請留言點名。

產出：分鏡（畫面／台詞／字幕），另附 5 個下一集可以評的角色。

硬規則：
- 評分理由要來自真的專業知識，不要只是玩梗。
- 使用角色時只做評論，不使用官方圖片素材；畫面用自己的手繪或文字卡。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-topic-local-contest-kickoff",
    tier: "30s",
    postType: "foryou",
    label: { en: "Ideation: Local Demo + Contest", zh: "TikTok 選題：在地示範＋比賽帶 UGC" },
    description: { en: "Cold-start a new account with a local demo and a contest", zh: "新帳號冷啟動：先讓在地真人示範，再用比賽讓大家自己拍" },
    agent_id: 210310,
    skill_slug: "trend-researcher",
    source: {
      type: "viral",
      short: "入間市「緑翠プロジェクト」",
      metric: "開設 10 天總觀看突破 13 萬",
      asOf: "2026-08",
      caveat: "日本地方政府；數字量級小，是政府自己發的新聞稿",
      url: "https://prtimes.jp/main/html/rd/p/000000234.000039058.html",
      takeaway:
        "新帳號先讓在地真人示範一首歌加一段舞（有排練花絮），再開一個有實質獎品的翻拍比賽，讓民眾自己拍，帳號冷啟動就有 UGC。",
    },
    primary_question: "你們要開新帳號或辦週年活動嗎？有沒有在地團體或員工可以示範？",
    primary_input: { key: "topic", placeholder: "例：開店 10 週年 / 附近國中熱舞社願意一起拍", type: "textarea" },
    inputs: [
      { key: "topic", label: "場合 + 可以示範的在地團體或員工", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌規劃 TikTok 新帳號的冷啟動選題：「在地示範＋翻拍比賽」。

產出：
1. 主題：一段 15 秒、學得會的動作或一句口號（寫出動作分解或台詞）。
2. 前 3 支示範影片的選題與一句話內容（排練花絮、正式示範、失敗 NG）。
3. 比賽規則：參加方式、指定 hashtag、期間（日期）、評選方式、實質獎品（寫「由品牌提供」，不要編沒有的獎）。
4. 收尾：決賽或頒獎怎麼做成最後一支影片。

硬規則：
- 有未成年人入鏡要取得監護人同意，寫在規劃最上方。
- 動作不能有危險性。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-30-copy-founder-number-story",
    tier: "30s",
    postType: "foryou",
    label: { en: "Copy: The Founder Numbers Story", zh: "TikTok 文案：數字反差的創業故事系列" },
    description: { en: "Open with a start-small, end-big number contrast", zh: "第一句丟出「小資本→大營收」的數字反差，每集接一段幕後" },
    agent_id: 60055,
    skill_slug: "tiktok-ads",
    source: {
      type: "viral",
      short: "女子麥麵包 創業故事系列",
      metric: "創業故事系列累積超過 100 萬次觀看",
      asOf: "2026-09",
      caveat: "台灣案例；100 萬是系列累計，未確認是近期爆紅；出自平台新聞稿",
      url: "https://www.kocpc.com.tw/archives/669921",
      takeaway:
        "用「2,000 元起家到年營收 1,800 萬」這種數字反差當系列開場，每集接一段真實的卡關或產品開發幕後，最後導到節慶新品或課程。",
    },
    primary_question: "你們的起點和現在各是什麼數字？有哪一段卡關可以講？",
    primary_input: { key: "topic", placeholder: "例：一台攤車起家、現在三家店 / 第一年差點收掉", type: "textarea" },
    inputs: [
      { key: "topic", label: "起點數字 + 現在數字 + 一段卡關", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一組 TikTok「數字反差創業故事」系列的文案（5 集）。

每集產出：
- 開場字幕（第一句，15 字內）：數字反差，例「從＿＿到＿＿」。
- 口播稿（60–120 字）：這一集的一段故事。
- 影片說明文（caption，50–100 字）＋3 個 hashtag。

5 集的安排：
1. 起點：當時有多少錢、為什麼開始。
2. 卡關：最慘的一次，具體到哪一天、發生什麼。
3. 轉折：做對了哪一件事。
4. 產品幕後：一個產品怎麼做出來的。
5. 現在：節慶新品或課程，自然導流。

硬規則：
- 數字必須真實，用戶沒給的數字不要編，寫「（請填入）」。
- 不要雞湯口號。`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
];

const ANNA_ID      = 180165; // Anna Tseng (主場)
const TT_DIR_YUNA  = 220721; // Yuna Chiang — Decision Design Consultant
const TT_DIR_GRANT = 220722; // Grant Yu — Decision Design Consultant
export const TT_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "tt-30-opening-hook":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: ANNA_ID, aspectRatio: "9:16",variantLabels: ["懸念", "反差", "直球"], captionMinChars: 30, captionMaxChars: 100 },
  "tt-30-full-script":       { variants: 3, images: 3, runImageGen: false, imageDirectorId: TT_DIR_YUNA, aspectRatio: "9:16",variantLabels: ["教學型", "故事型", "反差型"], captionMinChars: 200, captionMaxChars: 800 },
  "tt-30-caption-rhythm":    { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["標準", "極簡", "強調式"], captionMinChars: 100, captionMaxChars: 600 },

  // ── 高互動機制腳本卡（2026-08-23）────────────────────────────────────
  // images:0 / runImageGen:false —— 交付物是「照著拍的分格腳本」，配圖幫不上
  // 忙，而且用戶會想連試好幾種機制，每張卡都要便宜。
  // captionMaxChars 放到 1200：一格 5 行 × 4-6 格，壓太緊模型會把格子合併，
  // 就退回散文了。下限 400 則是防止只寫兩格交差。
  "tt-30-visual-illusion":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["一秒變身", "借位錯覺", "倒放回原"], captionMinChars: 500, captionMaxChars: 1000 },
  "tt-30-process-payoff":    { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["製作過程", "整理復原", "組裝完成"], captionMinChars: 500, captionMaxChars: 1000 },
  "tt-30-beat-sync":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["多品項快切", "情境輪播", "安靜→爆點"], captionMinChars: 500, captionMaxChars: 1000 },
  "tt-30-scale-reveal":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["細節拉到全景", "一鏡到底走位", "數量堆疊"], captionMinChars: 500, captionMaxChars: 1000 },
  "tt-30-real-reaction":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["第一次使用", "旁人被吸引", "素人真實回饋"], captionMinChars: 500, captionMaxChars: 1000 },
  "tt-30-bio-rewrite":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["專家定位", "個性風格", "結果導向"], captionMinChars: 50, captionMaxChars: 80 },
  "tt-30-hashtag-set":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["fyp 大流量", "精準利基", "趨勢搭便車"], captionMinChars: 0, captionMaxChars: 400 },
  "tt-30-caption-description":{ variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["懸念", "直球", "反差"], captionMinChars: 50, captionMaxChars: 100 },
  "tt-30-duet-angle":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["共鳴反應", "專業補充", "反差吐槽"], captionMinChars: 50, captionMaxChars: 200 },
  "tt-30-trend-remix":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["產業共鳴版", "反差版", "教育型"], captionMinChars: 80, captionMaxChars: 300 },
  "tt-30-comment-reply":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["同感式", "幽默式", "反問式"], captionMinChars: 30, captionMaxChars: 80 },
  "tt-30-live-opening":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: TT_DIR_GRANT, aspectRatio: "9:16",variantLabels: ["懸念", "互動", "直球"], captionMinChars: 100, captionMaxChars: 300 },

  // ── Tier 1 產品卡（原影片卡）──────────────────────────
  // 2026-09-08 影片生成移除（不在價目表上），這四張只出靜圖。沿用原本的
  // 紀律：variants/images = 2、imageQualitySteps 8 —— 圖是主角，少而好。
  "tt-30-product-hero": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["質感特寫", "情境使用"], captionMinChars: 60, captionMaxChars: 120,
  },
  "tt-30-product-asmr": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["材質特寫", "開箱瞬間"], captionMinChars: 40, captionMaxChars: 90,
  },
  "tt-30-text-hook-card": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: TT_DIR_YUNA,
    aspectRatio: "9:16", // ⚠️ captionMaxChars 絕對不能設 ≤60。orchestra 的 lengthHint 有一條隱藏
    // 耦合：captionMaxChars <= 60 會注入一段【嚴格字數 — 最高優先】，內容
    // 明講「只能是 1 句，不分段」—— 那是為了 headline/一句話這種微任務寫的，
    // 但它的優先級蓋過任務 prompt，會把字卡的 4 行強制壓成 1 行。
    // 實測：120 → 3-6 行（正常）；60 → 永遠 1 行，改幾次 prompt 都沒用。
    // 4 行 × 6-12 字 ＋ 換行 ≈ 27-51 字，設 90 留餘裕且避開 ≤60 陷阱。
    variantLabels: ["直球", "共鳴"], captionMinChars: 24, captionMaxChars: 90,
    // 這支的畫面是「給字卡當底」的，構圖留白；疊字在 output 層做
    // （模型畫不出正確中文字，見 NO-TEXT 政策）。
  },
  // 分鏡表：variants=1（分鏡是「一份」文件，不是多個版本可選），
  // cardsPerVariant=5 讓拆分器切成 5 格、每格自己一張圖。
  // holdForImages 確保 5 格畫面都到齊才收工 —— 缺格的分鏡表沒有意義。
  "tt-30-storyboard": {
    variants: 1, images: 1, runImageGen: true, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["分鏡完整版"], captionMinChars: 300, captionMaxChars: 1000,
    cardsPerVariant: 5,
    cardsKind: "storyboard",
    holdForImages: true,
  },

  // 2026-09-08：影片生成移除後，這張卡只出兩張靜圖；兩個變體是兩種「切角」。
  "tt-30-before-after": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: TT_DIR_GRANT,
    aspectRatio: "9:16", variantLabels: ["睡前場景", "日常場景"], captionMinChars: 60, captionMaxChars: 120,
  },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "tt-30-live-relay-host": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["接力版", "雙人對打版", "顧客上場版"],
    captionMinChars: 300, captionMaxChars: 600,
  },
  "tt-30-profile-self-aware": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["自嘲版", "對嗆版", "擺爛版"],
    captionMinChars: 150, captionMaxChars: 350,
  },
  "tt-30-storyboard-catch-wave": {
    variants: 3, images: 3, runImageGen: false, imageDirectorId: ANNA_ID,
    aspectRatio: "9:16", variantLabels: ["續拍版", "致敬版", "回禮版"],
    captionMinChars: 250, captionMaxChars: 550,
  },
  // ── 爆款結構卡・近 3 個月案例（2026-09-29）
  "tt-30-live-landmark-launch": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["地標版", "倒數版", "戰報版"],
    captionMinChars: 300,
    captionMaxChars: 700,
  },
  "tt-30-account-staff-trend-lines": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["員工線", "流行格式線", "覆盤版"],
    captionMinChars: 300,
    captionMaxChars: 700,
  },
  "tt-30-comment-ugc-hack": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["朋友口吻", "驚訝口吻", "試吃預告"],
    captionMinChars: 5,
    captionMaxChars: 60,
  },
  "tt-30-account-embrace-creator-meme": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["改名版", "封頭銜版", "二創版"],
    captionMinChars: 200,
    captionMaxChars: 500,
  },
  "tt-30-live-auction-trust": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["驗貨版", "競標版", "班表版"],
    captionMinChars: 300,
    captionMaxChars: 700,
  },
  "tt-30-live-daily-show": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["節目版", "熟客版", "主題輪替版"],
    captionMinChars: 300,
    captionMaxChars: 700,
  },
  "tt-30-script-character-scorecard": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["錄用判決", "買不買判決", "住不住判決"],
    captionMinChars: 200,
    captionMaxChars: 500,
  },
  "tt-30-topic-local-contest-kickoff": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["示範先行", "比賽先行", "NG 花絮先行"],
    captionMinChars: 200,
    captionMaxChars: 500,
  },
  "tt-30-copy-founder-number-story": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANNA_ID,
    aspectRatio: "9:16",
    variantLabels: ["起點集", "卡關集", "轉折集"],
    captionMinChars: 200,
    captionMaxChars: 600,
  },
};

export function getTTOrchestraConfig(taskId: string): OrchestraConfig | null {
  return TT_30S_ORCHESTRA[taskId] ?? null;
}
