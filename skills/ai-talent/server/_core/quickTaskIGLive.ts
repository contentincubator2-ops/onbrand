/**
 * IG 直播類型卡 — 2026-08-23
 *
 * CJ：「把 acun / deepika 做成 IG 直播底下的不同任務卡，不要糾結在單一任務裡面
 * 還要用 pill 分類」＋「參考『史上觀看數最高的 10 場 IG 直播』，加入不重複的
 * 直播範例，都不能直接寫人名，只能寫類型」。
 *
 * 那份清單去重後（同一種格式只取一個代表）得到 7 種類型，其中「集體目標型」
 * 已經是 ig-60-live-event。這個檔案是其餘 6 種：
 *
 *   ig-60-live-versus         對打型      回合制輪流出招，不宣布勝負
 *   ig-60-live-comeback       久違回歸型  先交代空白期，再講接下來
 *   ig-60-live-collab-drop    聯名發布型  各自暖場 → 連麥合流 → 當場發布
 *   ig-60-live-first-ever     首播型      稀有性 + 不完美即可信度
 *   ig-60-live-behind-scenes  日常場景型  在場勝過表演，用定錨物撐住
 *   ig-60-live-crew           多人同框型  選人比選題重要
 *
 * 一律不寫真人姓名 —— 卡名、描述、prompt 全部只講類型。原始出處只留在這段
 * 註解與 git commit 裡。
 *
 * 每張卡的「工藝」由指派的分身（agents.taskSystemPrompt）帶，這裡的
 * systemPrompt 只負責格式與分段，兩邊不重複。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

// 直播類型主理人分身（seed-ig-live-archetype-agents.ts 建立）
const A_VERSUS   = 239198; // Kaseem Deane — 對打型直播格式設計師
const A_COLLAB   = 239199; // Aubrey Grahame — 聯名發布連麥主持
const A_FIRST    = 239200; // Jeon Jungkuk — 首播與粉絲關係設計
const A_BEHIND   = 239201; // Cristian Ronaldi — 日常臨場感直播顧問
const A_CREW     = 239202; // Elvish Yadev — 多人同框直播主持
// 久違回歸型用既有分身：該類型觀看數最高的兩場分別是出獄後首度露面與精神科
// 住院後回歸，把任何一個做成行銷分身都不恰當。
const A_COMEBACK = 30016;  // Grace Lin — Brand Copywriter (2308 char)

// 影像總監（既有 prod agent，IG 尚未用到的）
const D_LUKE   = 220734; // Luke Hsu — Quantitative Research Designer
const D_REINA  = 220736; // Reina Yang — Quantitative Research Designer
const D_BLAKE  = 220737; // Blake Yeh — Quantitative Research Designer
const D_RUTH   = 220739; // Ruth Chou — Quantitative Research Designer
const D_UMA    = 220740; // Uma Tsai — Quantitative Research Designer
const D_JUSTIN = 220756; // Justin Huang — Insights Storyteller

/** 四欄輸出格式 — 六張卡共用，跟 ig-60-live-suite 一致 */
const LIVE_FORMAT_BLOCK = `
【這是直播執行腳本，不是 IG 貼文（最高優先）】
- 讀的人是「正要開播的人」，他會把這頁放在鏡頭旁邊邊看邊播。
- 嚴禁寫成貼文文案、嚴禁 hashtag、嚴禁「儲存這篇」「點 bio 連結」這種貼文 CTA。
- 口白＝可以直接照著唸出來的口語，不是書面文案。

【輸出格式 — 只有這四個方括號標題，順序固定，前後不要多寫任何字】
【時間】本段的時間段
【流程階段】只寫階段名稱本身，4-8 字。不要加副標、不要用「｜」。
【畫面／動作指示】2-4 條，每條以「・」開頭，寫當下要做的具體動作：鏡位、手上拿什麼、要點開哪個功能、要看哪裡。
【主播口白】用「」包住 2-4 句可以直接唸的話，其中要有一個當下就能做的互動指令。`;

/** 事實紅線 — 六張卡共用 */
const LIVE_CLAIM_BLOCK = `
【絕對規則】
- 全篇繁體中文台灣用語，不要簡體字。
- 價格、折扣、名額、庫存只能用使用者輸入或品牌資料裡真的有的。
- **功效與檢驗宣稱是紅線**：認證、檢測、臨床實驗、成分表述（例：通過皮膚科測試 / 不含 SLS / 醫師推薦 / 有專利）**只能**照抄品牌資料或使用者輸入真的有的字句。沒有就降級成 (1) 主觀體感、(2) 使用情境、(3) 誠實延後（「我回去把資料調出來，晚點在限動回你」）。**嚴禁自行生成任何檢驗、認證、成分或療效字眼**，這比講得完整重要。
- 不要出現任務名稱、agent 的自我介紹、英文 prompt、image_style 之類技術註記。
- 只輸出你被指派的那一段，不要把其他段一起寫出來。`;

const VERSUS_LABELS = [
  "T-24h 對打預告", "00:00-03:00 雙方登場", "03:00-12:00 第一輪對打",
  "12:00-21:00 第二輪對打", "21:00-27:00 觀眾投票輪", "27:00-30:00 不分勝負收尾",
];
const COMEBACK_LABELS = [
  "00:00-04:00 先講消失去哪", "04:00-10:00 空白期發生什麼", "10:00-18:00 回答最想問的",
  "18:00-25:00 接下來要做什麼", "25:00-30:00 重新開始的邀請",
];
const COLLAB_LABELS = [
  "T-1h 各自暖場", "00:00-05:00 連麥合流", "05:00-15:00 為什麼是這個組合",
  "15:00-22:00 當場發布", "22:00-30:00 雙向分流",
];
const FIRST_LABELS = [
  "00:00-05:00 承認這是第一次", "05:00-13:00 只有第一次才做的事", "13:00-22:00 回答沒講過的",
  "22:00-27:00 把人拉進來連線", "27:00-30:00 約下一次",
];
const BEHIND_LABELS = [
  "00:00-03:00 今天要做完什麼", "03:00-12:00 動手做第一段", "12:00-20:00 抬頭回留言",
  "20:00-27:00 動手做收尾段", "27:00-30:00 完成的那一刻",
];
const CREW_LABELS = [
  "00:00-05:00 逐一介紹角色", "05:00-13:00 有舊事可挖的題", "13:00-21:00 指名回留言",
  "21:00-27:00 全員都要講的題", "27:00-30:00 下次找誰來",
];

export const IG_LIVE_ARCHETYPE_TASKS: FBTaskTemplate[] = [
  {
    id: "ig-60-live-versus",
    tier: "60s", postType: "live",
    label: { en: "IG Versus Live (Two-Sided Rounds)", zh: "IG 直播雙人對打腳本" },
    description: { en: "Two sides take turns showing their best across timed rounds, with the story behind each pick — no winner declared", zh: "兩造輪流出招的回合制直播：每一輪出招＋講幕後故事，不分勝負，把結論交給留言區" },
    agent_id: A_VERSUS,
    skill_slug: "live-content",
    primary_question: "這場要讓誰跟誰對打？各自要輪流拿出什麼？",
    primary_input: { key: "versus_setup", placeholder: "例：主廚 vs 甜點師，各挑 5 道自己最有把握的品項輪流做；或是新品 vs 賣了十年的長銷品", type: "textarea" },
    inputs: [{ key: "versus_setup", label: "對打雙方 / 各自要出的招", type: "textarea", required: true }],
    systemPrompt: `你在寫「對打型直播」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 6 段依序是：
T-24h 對打預告 → 00:00-03:00 雙方登場 → 03:00-12:00 第一輪對打 →
12:00-21:00 第二輪對打 → 21:00-27:00 觀眾投票輪 → 27:00-30:00 不分勝負收尾。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 兩造必須對等。地位不對等時，開場要先把弱勢一方墊高。
- 每一輪的結構固定：出招 → 對方即時反應 → 出招者講一段幕後 → 換手。幕後那段才是內容。
- 全程不評分、不宣布勝負。要贏的感覺交給留言區。
- 不要設計互相貶低、翻舊帳、比誰便宜的橋段。

【各段各自要做到的事（只寫你被指派的那一段）】
- 對打預告：開播前 24 小時要做的事。用限動公布「誰對誰、幾輪、什麼時間」，並開一則投票讓觀眾先押注支持哪一方（開播時要唸結果）。同時指派一位「頭號留言者」，前 3 分鐘負責熱場。
- 雙方登場：兩人各用 30 秒自我定位（我是誰、我今天要拿什麼出來），主持人講清楚規則與回合數，並唸出開播前的押注投票結果。
- 第一輪對打：寫出這一輪雙方各自的出招順序與內容，每一招後面附一句「這裡要講的幕後」。輪與輪之間留出讓對方接話的空隙。
- 第二輪對打：第二輪要比第一輪更深——出的是「壓箱底」而不是「代表作」。這一輪要出現至少一次雙方互相稱讚對方那一招的橋段。
- 觀眾投票輪：把選擇權交出去。唸留言、統計觀眾比較喜歡哪幾招，讓兩造針對觀眾的選擇各自回應一次。
- 不分勝負收尾：明確講「今天不分勝負」，感謝對手，公布下一次想找誰來對打，請觀眾在留言區點名。
${LIVE_CLAIM_BLOCK}
- 口白要標明現在是哪一方在講，現場兩個人才看得懂自己的部分。`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-60-live-comeback",
    tier: "60s", postType: "live",
    label: { en: "IG Comeback Live (After a Long Absence)", zh: "IG 久違回歸直播腳本" },
    description: { en: "Back after going quiet: account for the gap first, answer what everyone wants to ask, then say what happens next", zh: "沉寂之後重新開播：先交代空白期、回答大家最想問的，再講接下來要做什麼" },
    agent_id: A_COMEBACK,
    skill_slug: "live-content",
    primary_question: "你消失了多久？為什麼？回來之後打算做什麼？",
    primary_input: { key: "comeback_context", placeholder: "例：停更八個月，因為店整修加上家裡的事；回來之後想改成每週四固定直播，先從新菜單開始", type: "textarea" },
    inputs: [{ key: "comeback_context", label: "空白期多久 / 原因 / 回來要做什麼", type: "textarea", required: true }],
    systemPrompt: `你在寫「久違回歸直播」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 5 段依序是：
00:00-04:00 先講消失去哪 → 04:00-10:00 空白期發生什麼 → 10:00-18:00 回答最想問的 →
18:00-25:00 接下來要做什麼 → 25:00-30:00 重新開始的邀請。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 觀眾點進來只有一個問題：你去哪了。不先回答這個，後面講什麼都沒人聽。
- 誠實但有邊界。願意講多少是使用者的決定；腳本要提供「可以講到這裡就好」的收口句，不要逼人揭露隱私。
- 不要用歉意鋪滿全場。道歉一次就夠，剩下的時間講接下來。
- 空白期若牽涉健康、家人、財務等敏感內容，一律寫成「可自行決定要不要說」的選項，並附一句得體的帶過方式。

【各段各自要做到的事（只寫你被指派的那一段）】
- 先講消失去哪：開場 30 秒內直接回答「我去哪了」，用一句話講完，不要鋪陳。接著道歉一次（只有一次），然後說「今天這 30 分鐘我會把該講的講完」。
- 空白期發生什麼：交代這段時間實際發生的事與現在的狀態。給兩種深度的講法（願意多說 / 只想帶過），讓使用者現場挑一種。
- 回答最想問的：把「大家一定會問但你不想被問」的 3 個問題自己先提出來回答。自己問比被問好。答不出來或不想答的，給一句誠實的收口句。
- 接下來要做什麼：把場子從過去轉向未來。講具體的計畫：多久更新一次、下一步要做什麼、什麼時候看得到。要具體到有日期或頻率。
- 重新開始的邀請：不要推銷。感謝還在的人，請他們留言告訴你這段時間他們怎麼樣，並約定下一次直播的時間。
${LIVE_CLAIM_BLOCK}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-60-live-collab-drop",
    tier: "60s", postType: "live",
    label: { en: "IG Collab Drop Live (Two Accounts, One Launch)", zh: "IG 聯名連麥發布直播腳本" },
    description: { en: "Two accounts warm up separately, link up so both audiences meet, then push the launch live on camera", zh: "兩個帳號各自暖場 → 連麥合流讓兩邊觀眾相遇 → 在鏡頭前當場發布 → 雙向分流" },
    agent_id: A_COLLAB,
    skill_slug: "live-content",
    primary_question: "這次要跟誰聯名？要在直播裡當場公開什麼？",
    primary_input: { key: "collab_setup", placeholder: "例：跟隔壁咖啡店聯名的限定甜點，直播裡當場開放預購；對方帳號 2 萬粉、我們 8 千", type: "textarea" },
    inputs: [{ key: "collab_setup", label: "聯名對象 / 要當場發布什麼", type: "textarea", required: true }],
    systemPrompt: `你在寫「聯名連麥發布直播」的其中 1 段，本段 200-450 字。
本次你寫的是「{label}」這一段。整場 5 段依序是：
T-1h 各自暖場 → 00:00-05:00 連麥合流 → 05:00-15:00 為什麼是這個組合 →
15:00-22:00 當場發布 → 22:00-30:00 雙向分流。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 這種直播的價值在「兩邊觀眾在同一個留言區相遇」，合流那一刻要被大聲宣告。
- 發布動作要在鏡頭前真的發生（按下上架、公開代碼、開啟預購），不能只是宣布「已經上架了」。
- 雙方各準備一段對方講不出來的內容，不要兩個人講一樣的話。
- 互相介紹要講具體的事，不要「他真的很棒」這種空話。

【各段各自要做到的事（只寫你被指派的那一段）】
- 各自暖場：開播前 1 小時，兩個帳號各自在自己的限動 / 直播把人聚起來，並預告「等一下我們會連線」。寫出兩邊各自可用的暖場話術與一個共同的倒數提示。
- 連麥合流：連上線的那一刻要宣告「現在進來的有一半是他的粉絲」，兩邊互相跟對方的觀眾打招呼，並請雙方觀眾在留言區報出自己是從哪邊來的。
- 為什麼是這個組合：雙方各講一段對方講不出來的內容——一邊講東西怎麼做的，另一邊講為什麼願意合作、挑剔過什麼、退過幾次。用具體事實，不要互相吹捧。
- 當場發布：把發布動作寫成一連串看得見的鏡頭動作（點開後台、按下上架、把畫面轉給觀眾看）。並講清楚怎麼買、什麼時候截止。
- 雙向分流：告訴兩邊觀眾各自的下一步——該追蹤誰、下次各自在哪裡、聯名之外還有什麼。不要把人只導向其中一方。
${LIVE_CLAIM_BLOCK}
- 口白要標明現在是哪一方在講，並寫出「接話點」讓現場兩人不會搶話或同時沉默。`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-60-live-first-ever",
    tier: "60s", postType: "live",
    label: { en: "IG First-Ever Live", zh: "IG 首播腳本（第一次開直播）" },
    description: { en: "The account's very first live: name the nerves, do something only a first time can do, and turn a one-off into a habit", zh: "帳號的第一場直播：把生疏講在前面，做一件只有第一次才做得到的事，並把一次性變成固定節目" },
    agent_id: A_FIRST,
    skill_slug: "live-content",
    primary_question: "這是你第一次開直播嗎？你最想讓觀眾看到什麼？",
    primary_input: { key: "first_live_context", placeholder: "例：開店三年沒直播過，想讓大家看看廚房長什麼樣、回答一直有人問的訂位規則", type: "textarea" },
    inputs: [{ key: "first_live_context", label: "帳號背景 / 第一次想讓觀眾看到什麼", type: "textarea", required: true }],
    systemPrompt: `你在寫「帳號第一次開直播」的其中 1 段，本段 200-450 字。讀的人可能從來沒有面對鏡頭講過話。
本次你寫的是「{label}」這一段。整場 5 段依序是：
00:00-05:00 承認這是第一次 → 05:00-13:00 只有第一次才做的事 → 13:00-22:00 回答沒講過的 →
22:00-27:00 把人拉進來連線 → 27:00-30:00 約下一次。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 首播不賣東西。第一次的任務是建立「這個帳號會直播」的預期，賣東西留給第二次。
- 不完美是資產。卡住、忘詞、找不到按鈕都照實講，不要道歉超過一次。
- 句子要短，寫成緊張的人也唸得出來的樣子，不要長句、不要文謅謅。
- 每一段都要留白：寫進「這裡停 5 秒看留言」這種指示，不要把 30 分鐘排滿。

【各段各自要做到的事（只寫你被指派的那一段）】
- 承認這是第一次：前三句就講明這是第一次、會有點生疏、請大家不要走。並指派一位「頭號留言者」在前 3 分鐘負責回應，讓留言區先有人。
- 只有第一次才做的事：設計一件非看不可的事——第一次把幕後拿出來、第一次帶大家看某個空間、第一次公開某個一直沒講的東西。要寫出具體的鏡頭動線。
- 回答沒講過的：挑 3 個「一直有人問但從來沒正式回答」的問題來答。要寫出實際的問題與答法，不能寫「回答粉絲提問」。
- 把人拉進來連線：把另一個人（同事、家人、老客人）拉進畫面或連線。寫出連線功能找不到時的處理話術——照實講、邊弄邊聊，那段就是內容。
- 約下一次：講下一場的時間與主題，請觀眾開啟通知。第一次的價值是把一次性變成常態。
${LIVE_CLAIM_BLOCK}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-60-live-behind-scenes",
    tier: "60s", postType: "live",
    label: { en: "IG Unscripted Workday Live", zh: "IG 日常場景直播腳本（不表演）" },
    description: { en: "No performance, no selling — one real task carried out on camera from start to finish, with the finish as the ending", zh: "不表演也不推銷：把一件真的正在做的事從頭做到完，做完就是結尾" },
    agent_id: A_BEHIND,
    skill_slug: "live-content",
    primary_question: "今天要在鏡頭前做完哪一件事？",
    primary_input: { key: "workday_anchor", placeholder: "例：把今天的 50 張訂單全部打包出貨；或把這批新到的貨上架完", type: "textarea" },
    inputs: [{ key: "workday_anchor", label: "今天要做完的那件事", type: "textarea", required: true }],
    systemPrompt: `你在寫「日常場景直播」的其中 1 段，本段 200-450 字。這種直播不表演、不推銷，就是讓觀眾看一段真實正在發生的工作。
本次你寫的是「{label}」這一段。整場 5 段依序是：
00:00-03:00 今天要做完什麼 → 03:00-12:00 動手做第一段 → 12:00-20:00 抬頭回留言 →
20:00-27:00 動手做收尾段 → 27:00-30:00 完成的那一刻。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 全場圍繞一個「定錨物」：一件從頭做到完、看得見進度的事。觀眾看的是進度。
- 允許沉默，但每 3-5 分鐘要抬頭跟留言講一句話，讓觀眾知道你還在。
- 整場最多提一次購買資訊，語氣像順口提到，不要轉成推銷段落。
- 不要為了畫面把現場整理得不像現場。凌亂是可信度的一部分。
- 這種直播的畫面比話重要，鏡頭指示要比口白更具體。

【各段各自要做到的事（只寫你被指派的那一段）】
- 今天要做完什麼：第一句就講清楚今天要做完的那件事與大概要多久。把定錨物拿到鏡頭前讓觀眾看到起點的樣子（還沒打包的訂單堆、還沒上架的貨箱）。
- 動手做第一段：主要是鏡頭與手部動作指示——機位放哪、什麼時候湊近看細節。口白只要幾句墊場，允許長時間只有環境音。
- 抬頭回留言：暫停手邊的事，把留言唸出來回答。挑「跟手上這件事有關」的問題優先。回完繼續做，並回報進度（做完幾成）。
- 動手做收尾段：進入最後的部分，節奏可以稍快。這段可以順口提一次「這個要買的話在哪裡」，只講一次。
- 完成的那一刻：把完成的樣子拿給鏡頭看，講一句今天做了多少。收尾就是完成本身，不要另外設計金句。
${LIVE_CLAIM_BLOCK}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
  {
    id: "ig-60-live-crew",
    tier: "60s", postType: "live",
    label: { en: "IG Crew Live (3-5 People On Camera)", zh: "IG 多人同框閒聊直播腳本" },
    description: { en: "3-5 people in one frame with assigned roles and a designated catcher, so a loose chat never collapses", zh: "3-5 人同框、每個人有角色、指定一位接話人，讓看似隨興的閒聊不會塌掉" },
    agent_id: A_CREW,
    skill_slug: "live-content",
    primary_question: "這場要找誰一起入鏡？他們各自是什麼角色？",
    primary_input: { key: "crew_setup", placeholder: "例：我、店長、做了五年的師傅、上個月剛來的新人；想聊店裡最誇張的客人", type: "textarea" },
    inputs: [{ key: "crew_setup", label: "有誰入鏡 / 各自的角色 / 想聊什麼", type: "textarea", required: true }],
    systemPrompt: `你在寫「多人同框閒聊直播」的其中 1 段，本段 200-450 字。3-5 個人坐在同一個畫面裡，靠關係本身撐起一場。
本次你寫的是「{label}」這一段。整場 5 段依序是：
00:00-05:00 逐一介紹角色 → 05:00-13:00 有舊事可挖的題 → 13:00-21:00 指名回留言 →
21:00-27:00 全員都要講的題 → 27:00-30:00 下次找誰來。
${LIVE_FORMAT_BLOCK}

【這種格式的鐵則（每段都適用）】
- 每個人都要有一個角色標籤（最懂的、最愛吐槽的、最新來的、老闆本人），觀眾才記得住誰是誰。
- 指定一位「接話人」：冷場超過 5 秒就丟問題出去，並確保每個人在每一段都至少講到一次。
- 話題只是引子，反應才是內容。選有舊事可挖的題，不要選產品規格題。
- 不要變成一個人主講、其他人陪坐。也不要安排會讓當事人下不了台的橋段。

【各段各自要做到的事（只寫你被指派的那一段）】
- 逐一介紹角色：寫出實體安排（誰坐哪、鏡頭架在哪、怎麼框才裝得下所有人、收音怎麼處理），並逐一介紹每個人與他的角色標籤。每個人用一句話自我介紹。
- 有舊事可挖的題：丟出第一個題目，並寫出 2-3 個備用題。題目要能讓不同人有不同版本的說法（第一天上班的糗事、最誇張的客人、誰最會偷懶）。標明誰先講、誰接。
- 指名回留言：把留言唸出來並「指定其中一位」回答，其他人補刀。觀眾會為了看某個人的反應而留下來。寫出指名的話術。
- 全員都要講的題：一個所有人都得回答一輪的題目，順序寫清楚。這一段要確保最少話的那個人也講到。
- 下次找誰來：收尾請觀眾在留言區點名下次想看誰入鏡，並約下一場時間。
${LIVE_CLAIM_BLOCK}
- 口白要標明是哪個角色在講，並寫出拋接：誰問、誰答、誰補刀。`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },
];

/** 六張卡共用的 cleanPrompt 設定 */
const CLEAN = {
  cleanPrompt: true,
  cleanPromptVariantHint: "只寫「這一段」時間軸，完全照任務指定的四個方括號欄位輸出這一段的內容。",
  cleanPromptCaptionSpec: "<這一段的四欄純文字內容，保留【時間】【流程階段】【畫面／動作指示】【主播口白】四個方括號標題與換行>",
  strategistUnit: "段",
  captionMinChars: 200,
  captionMaxChars: 500,
  aspectRatio: "9:16" as const,
  fluxSize: "portrait_9_16" as const,
  imageQualitySteps: 4,
  runImageGen: true,
};

export const IG_LIVE_ARCHETYPE_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ig-60-live-versus": {
    ...CLEAN, variants: 6, images: 6, imageDirectorId: D_LUKE,
    variantLabels: VERSUS_LABELS, postLabels: VERSUS_LABELS,
    strategistAgentId: 60003, // Marcus Han — Media & Brand Integration Strategist
    strategistDeliverable: "一場兩造輪流出招的對打型 IG 直播流程腳本",
    extras: { postsCount: 6, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
  "ig-60-live-comeback": {
    ...CLEAN, variants: 5, images: 5, imageDirectorId: D_REINA,
    variantLabels: COMEBACK_LABELS, postLabels: COMEBACK_LABELS,
    strategistAgentId: 30008, // Ryan Lee — Media & PR Strategy PM
    strategistDeliverable: "一場沉寂後重新開播的 IG 回歸直播流程腳本",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
  "ig-60-live-collab-drop": {
    ...CLEAN, variants: 5, images: 5, imageDirectorId: D_BLAKE,
    variantLabels: COLLAB_LABELS, postLabels: COLLAB_LABELS,
    strategistAgentId: 60001, // Vivian Shen — Omnichannel Marketing Strategist
    strategistDeliverable: "一場兩個帳號連麥、當場發布聯名的 IG 直播流程腳本",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
  "ig-60-live-first-ever": {
    ...CLEAN, variants: 5, images: 5, imageDirectorId: D_RUTH,
    variantLabels: FIRST_LABELS, postLabels: FIRST_LABELS,
    strategistAgentId: 30007, // Chloe Chen — Short Video Strategy PM
    strategistDeliverable: "一場帳號第一次開播的 IG 直播流程腳本",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
  "ig-60-live-behind-scenes": {
    ...CLEAN, variants: 5, images: 5, imageDirectorId: D_UMA,
    variantLabels: BEHIND_LABELS, postLabels: BEHIND_LABELS,
    strategistAgentId: 180005, // David Lee — Content Strategy Director
    strategistDeliverable: "一場不表演、把一件事做完的 IG 日常場景直播流程腳本",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
  "ig-60-live-crew": {
    ...CLEAN, variants: 5, images: 5, imageDirectorId: D_JUSTIN,
    variantLabels: CREW_LABELS, postLabels: CREW_LABELS,
    strategistAgentId: 60032, // Kevin Gong — F&B Short Video Scriptwriter (live-stream-friendly)
    strategistDeliverable: "一場 3-5 人同框閒聊的 IG 直播流程腳本",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  } as OrchestraConfig,
};
