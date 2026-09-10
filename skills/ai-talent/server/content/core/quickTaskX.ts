/**
 * quickTaskX — X（原 Twitter，x-）任務卡目錄。
 *
 * 2026-09-10 (CJ「補上 X 通路」)
 *
 * ── 為什麼現在補 ──────────────────────────────────────────────────────
 * 同一天量測 TW + JP 的小型獨立電商官網時，x／Twitter 的連結出現率是 50%，
 * 跟 facebook 同一個量級 —— 而我們一張 X 卡都沒有。那批品牌從官網導流到 X，
 * 到了 OnBrand 卻找不到地方寫。
 *
 * mockup 這一側早就備好了（跟 2026-08-29 官網頻道一樣的情況）：
 * PlatformMockup/twitter.tsx 的 XTweet / XThread 兩個元件已實作並註冊為
 * twitter:tweet / twitter:thread。缺的只有 server 端的任務定義。
 *
 * ── 只有兩種 postType，因為只有兩個 mockup ────────────────────────────
 *   tweet   單推   → twitter:tweet
 *   thread  討論串 → twitter:thread
 *
 * 不要為了「形式多」而開第三種 postType —— 沒有對應的 mockup，
 * UnsupportedVariantPlaceholder 會接手，那是空貨架。要開新形式先開元件。
 *
 * ── X 的平台通則（這些是卡片結構的依據）──────────────────────────────
 * 一般帳號單則上限 280 字元。時間軸只展開前幾行，所以第一行就是全部 ——
 * 這是 X 與 FB / IG 最大的結構差異：沒有「看更多」之前的緩衝。
 *
 * 三件在 X 上會反過來扣分、但在 IG 上是常態的事，卡片一律禁止：
 *   · 堆 hashtag（X 自己在 2024 說過 hashtag 已不是分發訊號）
 *   · 開頭寫「大家好」「跟大家分享一件事」這種暖場
 *   · 把整篇塞進一則然後截斷
 *
 * ── 語言刻意不寫死 ────────────────────────────────────────────────────
 * 官網那批卡的共通段寫著「繁體中文，台灣用語」，因為它們當時只服務台灣。
 * X 是 CJ 指定的兩個市場（TW / US）共用的頻道，所以這裡**不寫語言**，
 * 交給 buildMarketContext 的語言指令決定（resolveMarketCode 對 zh-TW 與
 * en-US 都有完整 master persona，兩個市場都不會落到「沒有人設」）。
 * 在 systemPrompt 裡寫「繁體中文」會直接跟美國品牌的市場指令打對台。
 *
 * ── source 為什麼全是長青 ─────────────────────────────────────────────
 * 全部標 evergreen（平台通則），因為上面那些依據就是平台通則，它們不需要
 * 出處。X 的爆款結構卡要標 viral 就必須附 metric + asOf（真實的傳播數字與
 * 量測年月，見 taskSource.ts），那需要先實際拆帳號。還沒拆就標 viral，
 * pill 上會印出一個答不出來的出處 —— 那比不標更傷。
 *
 * ── agent_id 為什麼留空 ───────────────────────────────────────────────
 * agent_id 是 mos_db agents.id，填錯會讓卡片綁到別人的人設。這批卡在離線
 * 環境寫的，驗不了 id 是否存在，所以一律留空 —— 型別上是 optional，UI 會
 * 退回通用頭像。上架前要跑一次 agent 指派（見 agentMatcher.ts），並比照
 * FB 的人設標準（taskSystemPrompt ≥ 2200 字，npm run db:audit-fb-personas）。
 *
 * ── outputDefaults.platform 為什麼是 "generic" ────────────────────────
 * mission_outputs.platform 的 enum（recordTaskRun.SAFE_PLATFORMS）是
 * facebook / instagram / linkedin / youtube / google_ads / email / ppt /
 * doc / script / other —— **沒有 X**，也沒有語意接近的值。官網那次能挑到
 * "doc" 是運氣好。這裡誠實用 "generic"，它會被降級寫成 "other"：語意丟了，
 * 但沒有假裝自己是別的平台。正解是替 enum 加一個值，那要 migration，
 * 不在這批的範圍。mockup 不受影響 —— RunPage Layer 1 由 taskId 前綴決定。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

/** 所有 x- 卡共用的平台底線。接在每張卡 systemPrompt 的最後。 */
const X_RULES = `

【X 平台鐵則】
- 單則上限 280 字元，含空白與標點。超過就是被截斷，不是「稍微長一點」。
- 第一行決定一切。時間軸只展開前幾行，沒有「看更多」之前的緩衝。
- 不要暖場。不要「大家好」「想跟大家分享」「你有沒有想過」這類開場，直接進入內容。
- 不要堆 hashtag。最多 1 個，而且只在它真的是一個社群標籤時才用（例如活動標籤）。沒有就不要放。
- 不要寫「詳見連結」然後把重點留在連結裡。這一則本身要讀得完、有價值。
- 語言、語氣與在地用語一律依照品牌設定的市場與輸出語言，不要自行預設。
- 沒有把握的事實不要寫。需要品牌自行補的資訊用【待補：xxx】標記，不要杜撰，也不要反問使用者。`;

/** 討論串專用的追加規則。 */
const THREAD_RULES = `

【討論串結構】
- 每一則獨立成段，用空行分隔，開頭標序號（1/、2/、3/…）。
- 第 1 則要做出一個具體的承諾：讀完這串會得到什麼。承諾要小而確定，不要「改變你的看法」這種空話。
- 中間每一則只講一件事。一則裡塞兩個重點，讀者會漏掉第二個。
- 最後一則收束：把整串的結論用一句話說完，然後給一個明確的下一步（不是「歡迎追蹤」）。
- 每一則都要能單獨被轉推。這是 X 的分發機制 —— 中段那則被轉出去時，它要自己站得住。`;

export const X_30S_TASKS: FBTaskTemplate[] = [
  // ── 單推（tweet）────────────────────────────────────────────────────
  {
    id: "x-30-hot-take",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Point of View", zh: "X 觀點短推" },
    description: {
      en: "One claim, one reason — the format X rewards most",
      zh: "一個主張＋一個理由，X 上最吃得開的結構",
    },
    skill_slug: "x-hot-take",
    primary_question: "你想在 X 上主張什麼？連同你的理由一起說。",
    primary_input: {
      key: "context",
      placeholder: "例：我們不做限時折扣。因為打折會訓練客人等打折，最後傷到願意用原價支持的人",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "主張與理由", type: "textarea", required: true }],
    contextSources: [
      "brand.name",
      "brand.positioning.goldenCircle.why",
      "brand.positioning.voice",
      "brand.positioning.differentiation.summary",
    ],
    systemPrompt: `你在寫一則 X 觀點短推。

結構固定兩句，不要第三句：
第一句 —— 主張。一個立場明確、可以被反駁的句子。能被反駁才有觀點；沒人會反駁的句子是廢話。
第二句 —— 理由。說出這個主張背後的機制或代價，不是重複主張。

三個常見的失敗寫法，不要寫成這樣：
✗ 主張＋自我讚美（「我們堅持品質，因為我們在乎你」）
✗ 主張＋空泛理由（「因為這才是對的」）
✗ 把主張軟化成問句（「你有沒有想過…？」）—— 那是在躲，不是在主張

寫 3 個版本，主張同一件事但切入的角度不同：
版本一 直說 —— 最直接的講法
版本二 從代價說 —— 不這樣做會發生什麼
版本三 從對照說 —— 別人怎麼做、我們為什麼不${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-data-hook",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Data Hook", zh: "X 數據鉤子推" },
    description: {
      en: "Lead with one number, land on what it means",
      zh: "用一個數字開場，收在它的意義上",
    },
    skill_slug: "x-data-hook",
    primary_question: "你有什麼數字想講？它代表什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：我們的回購率是 43%。同業平均 18%。差別在我們每一單都手寫一張卡片",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "數字與它的意義", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.industry", "brand.positioning.differentiation.summary"],
    systemPrompt: `你在寫一則以數字開場的 X 短推。

第一行只放數字與它的主體，不要鋪陳。數字要是這一則的第一個字元附近就出現。
第二行給對照或落差 —— 一個數字單獨存在沒有意義，有比較才有訊息。
第三行收在「所以呢」：這個落差是怎麼來的，或它對讀者意味著什麼。

鐵則：
- 使用者沒給的數字**絕對不要生成**。缺對照基準就寫【待補：同業平均】，不要編一個看起來合理的數字。這一則的全部價值就在那個數字是真的。
- 不要用「驚人的」「高達」「僅僅」這類替數字加戲的形容詞。數字自己會說話，加了反而像廣告。
- 百分比與絕對值至少要有一個是具體的。「成長 3 倍」沒有基準時等於沒說。

寫 3 個版本：
版本一 落差版 —— 我們 vs 同業
版本二 時間版 —— 現在 vs 以前
版本三 換算版 —— 把數字翻成讀者有感的單位（每天幾個人、幾杯咖啡的錢）${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-build-in-public",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Build in Public", zh: "X 進度公開推" },
    description: {
      en: "What you shipped, what broke, what you learned",
      zh: "做了什麼、哪裡出錯、學到什麼",
    },
    skill_slug: "x-build-in-public",
    primary_question: "這週做了什麼？有什麼沒照計畫走？",
    primary_input: {
      key: "context",
      placeholder: "例：上了新的包裝，結果第一批運送破損率反而變高，紙盒改薄了 0.3mm 就撐不住",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "進度與意外", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.voice"],
    systemPrompt: `你在寫一則進度公開（build in public）的 X 短推。

這個形式在 X 上有效的原因是「可信」，不是「勵志」。所以：
- 一定要有一個具體的、不好看的細節。沒有出錯的進度報告讀起來像新聞稿，沒人轉。
- 數字、規格、時間要具體（0.3mm、第 3 批、兩週）。模糊的自述沒有可信度。
- 不要把失誤包裝成成長金句。說完發生什麼、怎麼處理，就結束。
- 不要在結尾要求互動（「你們遇過嗎？」）。這個形式靠內容本身帶回覆。

結構：
第一行 —— 做了什麼（一句，具體）
中段   —— 哪裡不如預期，具體到可以被檢查
最後   —— 現在怎麼處理。還沒解決就說還沒解決

寫 3 個版本：
版本一 只講這一次的事
版本二 帶上一次的對照（上一批 vs 這一批）
版本三 把處理方式寫成別人可以直接借用的做法${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-industry-reply",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Take on Industry News", zh: "X 業界話題回應推" },
    description: {
      en: "Add the angle only your brand can add",
      zh: "只有你這個品牌講得出來的那個角度",
    },
    skill_slug: "x-industry-reply",
    primary_question: "你想回應哪個業界話題？你的角度是什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：大家在討論運費漲價。我們想講的是為什麼我們寧可吸收成本也不改用更薄的包材",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "話題與你的角度", type: "textarea", required: true }],
    contextSources: [
      "brand.name",
      "brand.industry",
      "brand.positioning.goldenCircle.why",
      "brand.positioning.differentiation.summary",
    ],
    systemPrompt: `你在寫一則回應業界話題的 X 短推。

這個形式唯一的價值是「角度」。所以第一件事是自我檢查：這一則如果換成同業發，成不成立？成立的話就是廢話，重寫。

結構：
第一行 —— 用一句話說出這個話題的重點，不要複述新聞。假設讀者已經知道發生什麼事。
第二行起 —— 你的角度。這裡要出現只有你們的實務經驗才拿得出來的東西：一個具體做法、一個實際數字、一次踩過的坑。
收尾   —— 你們的選擇是什麼。表態，不要「值得大家思考」。

鐵則：
- 不要評論競爭對手的具體品牌名，講機制不講人。
- 話題本身的事實只用使用者提供的，不要補充你記得的產業消息 —— 那是最容易寫錯又最難查的地方。
- 不要蹭跟品牌無關的熱點。無關就不該寫這一則。

寫 3 個版本，角度層次不同：
版本一 從我們的實務經驗切
版本二 從被影響的人切（客人／同業／供應鏈）
版本三 從長期看切 —— 這件事三年後會變成什麼${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-launch",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Launch Post", zh: "X 上線公告推" },
    description: {
      en: "New product or feature — what changed for the reader",
      zh: "新品或新功能，講讀者身上有什麼變化",
    },
    skill_slug: "x-launch",
    primary_question: "要公告什麼？它替使用者解決了什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：補貨的通知功能上線了。以前缺貨只能自己一直回來看，現在留 email 就會通知",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "上線的東西與它解決的問題", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.audience.primary", "brand.positioning.voice"],
    systemPrompt: `你在寫一則上線公告的 X 短推。

X 上的上線公告最常見的失敗是「從我們的角度講」：我們很興奮、我們花了半年、我們終於。讀者不在意。

結構：
第一行 —— 這件事現在可以做了。用讀者的動作寫，不是用我們的動作寫。
第二行 —— 以前是怎樣。對照出落差，這一行才是公告的重點。
第三行 —— 怎麼開始用。一個明確的動作。

鐵則：
- 不要用「隆重推出」「全新升級」「我們很興奮地宣布」。
- 不要列規格清單。挑一個最有感的變化講完。
- 不要承諾使用者輸入裡沒有的東西（免費、限時、無限）。沒說就不要加。

寫 3 個版本：
版本一 落差版 —— 以前 vs 現在
版本二 情境版 —— 一個具體的使用時刻
版本三 一句版 —— 只留一句，把它壓到最短還說得完${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-tip",
    tier: "30s",
    postType: "tweet",
    label: { en: "X Actionable Tip", zh: "X 實用技巧推" },
    description: {
      en: "One thing the reader can use today",
      zh: "一個讀者今天就能用的做法",
    },
    skill_slug: "x-tip",
    primary_question: "你想教一個什麼做法？誰會用得到？",
    primary_input: {
      key: "context",
      placeholder: "例：教怎麼判斷保養品該不該冰。看成分表有沒有維他命C衍生物就好",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "技巧與適用的人", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.industry", "brand.positioning.audience.primary"],
    systemPrompt: `你在寫一則實用技巧的 X 短推。

判準只有一個：讀完能不能立刻做。做不到就不是技巧，是知識。

結構：
第一行 —— 技巧本身，用動詞開頭的一句話。
第二行 —— 為什麼有效，一句。給機制，不要給保證。
第三行 —— 什麼情況不適用。這一行是可信度的來源，不要省。

鐵則：
- 不要把品牌產品當成技巧的答案。技巧要在不買任何東西的情況下就能用。品牌只能出現在「我們是怎麼發現的」那一層，而且可以完全不出現。
- 不要寫成清單。一則只教一個。要教多個就用討論串卡。
- 專業詞先翻成日常語言。

寫 3 個版本：
版本一 直接教
版本二 從常見的誤解切入 —— 大家都以為 X，其實是 Y
版本三 從一個具體的踩坑經驗切入${X_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "post" },
  },

  // ── 討論串（thread）─────────────────────────────────────────────────
  {
    id: "x-30-thread-howto",
    tier: "30s",
    postType: "thread",
    label: { en: "X How-to Thread", zh: "X 教學討論串" },
    description: {
      en: "Step-by-step, one step per tweet",
      zh: "步驟拆解，一則一步",
    },
    skill_slug: "x-thread-howto",
    primary_question: "要教什麼？完成後讀者會得到什麼結果？",
    primary_input: {
      key: "context",
      placeholder: "例：教怎麼挑一張適合久坐的椅子。看完能自己在賣場判斷，不用聽業務講",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "主題與完成後的結果", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.industry", "brand.positioning.audience.primary"],
    systemPrompt: `你在寫一串 X 教學討論串，5–7 則。

第 1 則的承諾要寫成一個可檢查的結果（「看完你能自己在賣場判斷」），不是一個感受（「重新認識椅子」）。

中段每一則一個步驟，每則的結構是：做什麼 → 怎麼判斷做對了。
「怎麼判斷做對了」這半句是教學串跟清單串的差別，不要省。

最後一則把整串壓成一句可以記住的判準，再給一個明確的下一步。

鐵則：
- 步驟數就是步驟數。不要為了湊 7 則把一步拆成兩步。5 則講得完就 5 則。
- 不要在中段插入品牌產品。品牌最多出現在最後一則，而且是可以整句拿掉的。
- 每一則都要能單獨被轉推 —— 中段那則被轉出去時，它自己要說得完一件事。${X_RULES}${THREAD_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 2400,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-thread-story",
    tier: "30s",
    postType: "thread",
    label: { en: "X Story Thread", zh: "X 敘事討論串" },
    description: {
      en: "A process with a turn — what you expected, what happened",
      zh: "一段有轉折的過程：原本以為，結果發現",
    },
    skill_slug: "x-thread-story",
    primary_question: "要講哪一段經過？轉折點是什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：為了降成本換了供應商，結果客訴變多，最後算下來比原本更貴",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "經過與轉折", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.voice", "brand.positioning.goldenCircle.why"],
    systemPrompt: `你在寫一串 X 敘事討論串，5–8 則。

這個形式靠轉折推進。沒有轉折的過程敘述沒人讀完。

結構：
第 1 則 —— 起點與當時的判斷。要寫出當時為什麼那樣想，而且要讓那個判斷聽起來合理 —— 事後看很笨的決定，當下都有理由。
中段   —— 依時間推進。每一則推進一步，並且帶一個具體的事實（數字、時間、對話、規格）。
轉折則 —— 明確標出哪一則是「原本以為 X，結果是 Y」。這一則要單獨成立。
最後一則 —— 現在怎麼做，以及為什麼。不要寫成教訓金句。

鐵則：
- 只用使用者提供的事實。過程敘事最容易被「補完」成一個更好聽的故事，那是杜撰。缺的環節就用【待補：xxx】。
- 不要美化結果。如果還沒解決，就寫還沒解決。
- 不要在最後要求追蹤或轉推。${X_RULES}${THREAD_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 2600,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-thread-teardown",
    tier: "30s",
    postType: "thread",
    label: { en: "X Teardown Thread", zh: "X 拆解討論串" },
    description: {
      en: "Take one thing apart and say why it works",
      zh: "拆一個東西，說清楚它為什麼有效",
    },
    skill_slug: "x-thread-teardown",
    primary_question: "要拆解什麼？你想證明的結論是什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：拆解一個賣很好的競品詳情頁，想證明它贏在把退貨政策放最上面",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "拆解對象與結論", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.industry", "brand.positioning.differentiation.summary"],
    systemPrompt: `你在寫一串 X 拆解討論串，5–8 則。

拆解串的價值在「可遷移」：讀者要能把結論用到自己身上。所以每一則都要回答「所以我可以怎麼做」。

結構：
第 1 則 —— 拆解對象＋你要證明的結論。結論先講，不要留到最後才揭曉，X 上沒人會等。
中段   —— 一則一個機制。每則的結構是：它做了什麼 → 為什麼這樣做有效 → 可以怎麼套用。
最後一則 —— 把可遷移的部分收成一句，明確指出哪些條件下不適用。

鐵則：
- 拆解對象的事實只用使用者提供的。不要憑印象補「它們的轉換率應該有…」，那是編的。
- 講機制不要貶人。拆競品時只描述做法與效果，不要評價團隊或動機。
- 不要把結論導向「所以你需要我們的產品」。${X_RULES}${THREAD_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 2600,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
  {
    id: "x-30-thread-listicle",
    tier: "30s",
    postType: "thread",
    label: { en: "X List Thread", zh: "X 清單討論串" },
    description: {
      en: "N points, each one able to stand alone",
      zh: "N 個要點，每一則都能單獨成立",
    },
    skill_slug: "x-thread-listicle",
    primary_question: "要列什麼清單？收給誰看？",
    primary_input: {
      key: "context",
      placeholder: "例：列 5 個第一次開網店最容易花錯的錢，給剛要開店的人看",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "清單主題與讀者", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.industry", "brand.positioning.audience.primary"],
    systemPrompt: `你在寫一串 X 清單討論串，5–8 則（含開頭與收尾）。

清單串最常見的失敗是每一項都很淺。判準：把任何一項單獨拿出來當一則短推發，撐不撐得住？撐不住就是湊數。

結構：
第 1 則 —— 清單主題＋數量＋收給誰看。指名讀者，不要「給所有人」。
每一項 —— 一則。結構是：要點（一句）→ 一個具體的例子或數字 → 一句可執行的建議。
最後一則 —— 如果只能記一項，記哪一項，為什麼。

鐵則：
- 數量就是實際有幾項。不要為了「5 個」湊到 5 個，4 個就寫 4 個。
- 各項之間不要重複同一個道理換句話說。
- 不要把自家產品列成其中一項。${X_RULES}${THREAD_RULES}`,
    preferredModel: "anthropic",
    maxTokens: 2600,
    outputDefaults: { platform: "generic", post_type: "post" },
  },
];

/**
 * orchestra 設定。
 *
 * captionMaxChars 的意義在單推與討論串上不同：
 *   單推   280 是**平台硬上限**，不是風格建議。給 260 留一點餘裕給
 *          全形標點（中文標點在 X 上算 1 個字元，但 emoji 算 2）。
 *   討論串 是整串的總長。5–8 則 × 每則 ~200 字元 ≈ 1000–1600。
 *
 * 單推一律 3 個 variant（短、便宜，多給幾個角度挑）；討論串 1 個
 * （長、貴，而且三串同題材的討論串沒人會全部讀完）。
 * images 全部 0 —— X 的圖文另開卡，先把文字這條做對。
 */
export const X_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "x-30-hot-take": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["直說版", "代價版", "對照版"],
    captionMinChars: 40, captionMaxChars: 260,
  },
  "x-30-data-hook": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["落差版", "時間版", "換算版"],
    captionMinChars: 40, captionMaxChars: 260,
  },
  "x-30-build-in-public": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["單次版", "對照版", "可借用版"],
    captionMinChars: 40, captionMaxChars: 260,
  },
  "x-30-industry-reply": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["實務版", "被影響的人版", "長期版"],
    captionMinChars: 40, captionMaxChars: 260,
  },
  "x-30-launch": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["落差版", "情境版", "一句版"],
    captionMinChars: 30, captionMaxChars: 260,
  },
  "x-30-tip": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["直接教版", "破除誤解版", "踩坑版"],
    captionMinChars: 40, captionMaxChars: 260,
  },

  "x-30-thread-howto": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["教學串"], captionMinChars: 500, captionMaxChars: 1600,
  },
  "x-30-thread-story": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["敘事串"], captionMinChars: 600, captionMaxChars: 1800,
  },
  "x-30-thread-teardown": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["拆解串"], captionMinChars: 600, captionMaxChars: 1800,
  },
  "x-30-thread-listicle": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["清單串"], captionMinChars: 600, captionMaxChars: 1800,
  },
};

export function getXOrchestraConfig(taskId: string): OrchestraConfig | null {
  return X_30S_ORCHESTRA[taskId] ?? null;
}

export function getXTemplate(taskId: string): FBTaskTemplate | null {
  return X_30S_TASKS.find((t) => t.id === taskId) ?? null;
}
