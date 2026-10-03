/**
 * LinkedIn quick-task templates (2026-05-05).
 * 10 LI 30s tasks. All caption_writer agents distinct from FB+IG+YT+TT pools.
 * image_director = Zeyu Yang (60071, Brand Visual Copy Integration).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const LI_TONE = `
LinkedIn 受眾偏 B2B 專業人士。語氣要有專業洞察、不要 IG 那種口語。
偏好「真實案例 + 數據 + 觀點」格式，不要硬推銷。`;

export const LI_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "li-30-insight-post",
    tier: "30s", postType: "feed",
    label: { en: "LI Short Post (Professional Insight)", zh: "LI 短貼文（專業觀點）" },
    description: { en: "A 150-300-word professional-insight post", zh: "150-300 字的專業觀點貼文" },
    agent_id: 30018, skill_slug: "linkedin-b2b",
    primary_question: "今天想分享什麼專業洞察？",
    primary_input: { key: "topic", placeholder: "例：AI 工具用了 6 個月後的 3 個體悟", type: "textarea" },
    inputs: [{ key: "topic", label: "主題 / 觀點", type: "textarea", required: true }],
    systemPrompt: `產出 LI 觀點貼文（150-300 字）。
結構：1 句鉤子（拋一個反共識觀點）→ 2-3 段論述（含 1 個數據 / 案例）→ 收尾（提問引留言）。
${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-hook-3",
    tier: "30s", postType: "feed",
    label: { en: "LI Openers ×3 (Scroll-Stopping)", zh: "LI 開場句 3 種（吸引滑停）" },
    description: { en: "The first 1-2 sentences (they decide the scroll-stop)", zh: "前 1-2 句鉤子（決定看不看下去）" },
    agent_id: 60005, skill_slug: "hook-copywriter", // Aaron Pei — B2B Tech Brand Marketing (1181 char)
    primary_question: "貼文主題？",
    primary_input: { key: "topic", placeholder: "例：B2B SaaS 行銷成本優化", type: "textarea" },
    inputs: [{ key: "topic", label: "主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI 開場 hook（30-60 字）。每變體 1 種策略（反共識 / 數據反差 / 個人故事）。
LI 演算法看頭 2 行決定要不要展開（"see more"），鉤子要強。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-article-opener",
    tier: "30s", postType: "article",
    label: { en: "LI Article Opener (First 200 Words)", zh: "LI 長文開頭（前 200 字）" },
    description: { en: "First 200 words of a LinkedIn Article (they decide whether readers continue)", zh: "LinkedIn Article 開頭 200 字（決定讀者要不要繼續）" },
    agent_id: 180172, skill_slug: "thought-leadership",
    primary_question: "這篇 Article 想討論什麼？",
    primary_input: { key: "topic", placeholder: "例：為何 70% 的數位轉型會失敗", type: "textarea" },
    inputs: [{ key: "topic", label: "文章主題", type: "textarea", required: true }],
    systemPrompt: `產出 LinkedIn Article 開頭（150-250 字）。
結構：1 段強烈場景或 1 個事實 → 1 段個人連結 / 為何寫這篇 → 1 段這篇會談的 3 個重點。
不要 "在這篇文章中我會分享..." 這種範本式起手。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "linkedin", post_type: "article" },
  },
  {
    id: "li-30-poll",
    tier: "30s", postType: "poll",
    label: { en: "LI Poll Post (Question + 4 Options)", zh: "LI 投票貼文（問題 + 4 選項）" },
    description: { en: "Poll question + 4 options", zh: "投票貼文的問題 + 4 個選項" },
    agent_id: 180173, skill_slug: "linkedin-engagement",
    primary_question: "想問你產業的什麼？",
    primary_input: { key: "topic", placeholder: "例：B2B 行銷 KPI / 遠端工作效率", type: "textarea" },
    inputs: [{ key: "topic", label: "想問的問題領域", type: "textarea", required: true }],
    systemPrompt: `產出 LI poll。每變體 1 種角度。
結構：問題（30 字內）+ 4 個選項（10 字內）+ 1 句「為什麼問」說明（在 caption 中）。
選項要互斥且涵蓋常見答案，不要全部讓人選同一個。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "linkedin", post_type: "poll" },
  },
  {
    id: "li-30-event-invite",
    tier: "30s", postType: "feed",
    label: { en: "LI Event Invitation Post", zh: "LI 活動邀請貼文" },
    description: { en: "Invite people to a webinar / meetup / workshop", zh: "邀請別人參加 webinar / meetup / 工作坊" },
    agent_id: 180176, skill_slug: "linkedin-events",
    primary_question: "活動主題 / 時間 / 對象？",
    primary_input: { key: "event", placeholder: "例：「B2B SaaS 增長」線上分享，6/15 19:00", type: "textarea" },
    inputs: [{ key: "event", label: "活動資訊", type: "textarea", required: true }],
    systemPrompt: `產出 LI 活動邀請貼文（150-250 字）。
結構：1 句鉤子（為何這場有價值）→ 講者 / 主題簡介 → 3 個重點 → 報名連結 + CTA。
${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-dm-intro",
    tier: "30s", postType: "feed",
    label: { en: "LI DM Opener (Cold Connection)", zh: "LI 私訊開場（陌生連結）" },
    description: { en: "The first DM after connecting", zh: "連結後的第一封私訊" },
    agent_id: 180197, skill_slug: "linkedin-outreach",
    primary_question: "你想 connect 的對象是誰？目的？",
    primary_input: { key: "context", placeholder: "對象身份 + 你想做什麼（合作 / 請教 / 自我介紹）", type: "textarea" },
    inputs: [{ key: "context", label: "對象 + 目的", type: "textarea", required: true }],
    systemPrompt: `產出 LI DM 開場訊息（80-150 字）。每變體 1 種角度（求教式 / 共同點式 / 直接價值交換）。
規則：絕對不要直接賣東西。先給點價值或共鳴，再提具體小請求（不是大忙）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-comment",
    tier: "30s", postType: "feed",
    label: { en: "LI Comment Engagement (On Others' Posts)", zh: "LI 留言互動（給別人貼文）" },
    description: { en: "A genuinely valuable comment on someone else's LI post", zh: "在別人 LI 貼文下留一則有價值的留言" },
    agent_id: 180203, skill_slug: "linkedin-engagement",
    primary_question: "貼上原貼文 / 描述貼文內容",
    primary_input: { key: "context", placeholder: "別人的貼文內容", type: "textarea" },
    inputs: [{ key: "context", label: "原貼文", type: "textarea", required: true }],
    systemPrompt: `產出 LI 留言（50-150 字）。每變體 1 種策略（補充經驗 / 不同觀點 / 提問擴展）。
LI 留言能帶曝光 — 要寫得讓原 PO 想回覆你（給連結機會）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-headline",
    tier: "30s", postType: "feed",
    label: { en: "LI Profile Headline", zh: "LI 個人簡介標語" },
    description: { en: "Your LinkedIn profile headline (under 120 chars)", zh: "你的 LinkedIn 個人頁眉標題（120 字內）" },
    agent_id: 180199, skill_slug: "personal-branding",
    primary_question: "你做什麼？想吸引誰？",
    primary_input: { key: "context", placeholder: "你的角色 + 想吸引的對象（潛在合作 / 客戶 / 同行）", type: "textarea" },
    inputs: [{ key: "context", label: "角色 + 受眾", type: "textarea", required: true }],
    systemPrompt: `產出 LI profile headline（120 字內）。每變體 1 種角度（職稱+價值 / 結果型 / 個性型）。
結構：你做什麼 + 為誰 + 結果。可用 | 分隔符（LI headline 慣例）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-newsletter",
    tier: "30s", postType: "newsletter",
    label: { en: "LI Newsletter Title + Opening", zh: "LI 電子報標題 + 開頭" },
    description: { en: "LI newsletter title + first paragraph (they decide the subscribe)", zh: "LI Newsletter 標題 + 第一段（決定要不要訂閱）" },
    agent_id: 180009, skill_slug: "newsletter-editor",
    primary_question: "本期 Newsletter 要講什麼？",
    primary_input: { key: "topic", placeholder: "本期主題", type: "textarea" },
    inputs: [{ key: "topic", label: "本期主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI Newsletter 標題（30 字內）+ 第一段開頭（150-250 字）。
標題：要 specific（含具體數字 / 反差 / 問題），不要 "Weekly Digest" 這種。
開頭：1 句鉤子 + 為什麼這期值得讀完。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "linkedin", post_type: "newsletter" },
  },
  {
    id: "li-30-document",
    tier: "30s", postType: "document",
    label: { en: "LI Document Post (PDF Carousel) — 8-Page Structure", zh: "LI 文件貼文（PDF 輪播）8 頁結構" },
    description: { en: "8-page LI document-post structure + copy per page", zh: "8 頁的 LI 文件貼文結構 + 每頁文字" },
    agent_id: 220862, skill_slug: "narrative-editor",
    primary_question: "Document 想教 / 解釋什麼？",
    primary_input: { key: "topic", placeholder: "例：B2B 漏斗的 5 個常見錯誤", type: "textarea" },
    inputs: [{ key: "topic", label: "文件主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI Document 8 頁結構。
caption 用 "---" 分隔每一頁：
頁 1（封面）：5-8 字大標 + 副標 1 句
頁 2-7（內容 6 頁）：每頁 1 個重點 + 30-50 字補充（標號 #1-#6）
頁 8（CTA）：總結 1 句 + 邀請動作（追蹤 / 留言 / 連結）
${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "linkedin", post_type: "document" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "li-30-feed-cost-of-stance",
    tier: "30s",
    postType: "feed",
    label: { en: "Feed: Name What Your Stance Costs", zh: "LI 貼文：講出這個立場讓你少賺多少" },
    description: { en: "Prove the stance with what you gave up", zh: "用放棄的東西證明主張是真的" },
    agent_id: 30018, // 沿用同 postType 現役卡
    skill_slug: "linkedin-b2b",
    source: {
      type: "viral",
      short: "Patagonia「Don't Buy This Jacket」",
      metric: "隔年營收成長約三成至 5.43 億美元",
      asOf: "2011-11",
      takeaway:
        "B2B 的信任不是靠主張建立的，是靠「你為這個主張付了多少」——把代價寫成數字，主張才不是話術。",
    },
    primary_question: "你們有什麼做法，是明知會少賺還在做的？",
    primary_input: { key: "topic", placeholder: "例：不接某類案子 / 用比較貴的料 / 拒絕加價快出", type: "textarea" },
    inputs: [
      { key: "topic", label: "明知少賺還在做的事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 LinkedIn 貼文，用「我們為這個立場付出的代價」來證明立場是真的。

結構：
1. 第一句直接講那個做法，不鋪陳。
2. 立刻給代價，而且要有數字（少接的案子數、多出的成本、拉長的天數）。
3. 講一次為什麼仍然這樣做，用一件具體發生過的事，不要用理念。
4. 收在一個開放問題，邀請同業講他們的取捨。

硬規則：
- 代價沒有數字就不要寫這則貼文，回去把數字找出來。
- 不要比較競爭對手，不要暗示別人做得不對。
- 不要用「我們相信」開頭。
- 250-550 字，段落要短，手機上可讀。`,
    preferredModel: "qwen",
    maxTokens: 1210,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-article-own-the-failure",
    tier: "30s",
    postType: "article",
    label: { en: "Article: Publish the Post-Mortem", zh: "LI 長文：把出包寫成公開檢討" },
    description: { en: "Tell it before someone else does", zh: "錯誤自己講完，比被別人講完好" },
    agent_id: 180172, // 沿用同 postType 現役卡
    skill_slug: "thought-leadership",
    source: {
      type: "viral",
      short: "KFC「FCK」",
      metric: "逾 700 則報導，觸及約 7.97 億人",
      asOf: "2018-02",
      takeaway:
        "出包的公開檢討之所以會傳，是因為它稀少——先認錯、用自嘲降低防衛、再給具體修正，順序錯了就變成公關稿。",
    },
    primary_question: "你們最近一次出包是什麼？後來怎麼處理的？",
    primary_input: { key: "topic", placeholder: "例：出貨延誤三週 / 系統當機 / 品質批次問題", type: "textarea" },
    inputs: [
      { key: "topic", label: "出過的包 + 處理過程", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一篇 LinkedIn 長文，公開檢討一次自家的出包。

結構（順序不可調換）：
1. 開頭 3 句內把錯誤講完，用最直白的說法，不要鋪墊背景。
2. 用一個自嘲的說法降低防衛，但不要把事情講輕。
3. 時間軸：什麼時候發現、什麼時候動作、多久修好。給時間點。
4. 根因：講到制度層面，不要停在「某位同事疏失」。
5. 修正：已經改了什麼、還沒改什麼、什麼時候改完。
6. 受影響的人怎麼補償。

硬規則：
- 禁止「造成不便敬請見諒」這類公關語。
- 不要在文中推銷任何產品。
- 沒有做到的修正不要寫成已完成，寫成期限。
- 如果還在處理中，就明說還在處理，不要假裝結案。`,
    preferredModel: "qwen",
    maxTokens: 2640,
    outputDefaults: { platform: "linkedin", post_type: "article" },
  },
  {
    id: "li-30-document-proof-deck",
    tier: "30s",
    postType: "document",
    label: { en: "Document: A Deck Made of Evidence", zh: "LI 文件：用實例組成的證據簡報" },
    description: { en: "One sample per page; reader draws the conclusion", zh: "每頁一個實例，結論留給讀者" },
    agent_id: 220862, // 沿用同 postType 現役卡
    skill_slug: "narrative-editor",
    source: {
      type: "viral",
      short: "Heinz「Draw Ketchup」",
      metric: "賺得媒體 580 萬美元，為投放金額的 127 倍",
      asOf: "2021-01",
      takeaway:
        "簡報最有力的一頁不是結論頁，是讓人自己數出結論的那幾頁——先給樣本，結論最後才出現，而且只出現一次。",
    },
    primary_question: "你有什麼可以蒐集的實例，能證明你想講的那件事？",
    primary_input: { key: "topic", placeholder: "例：50 個客戶被問到同一題的答案", type: "textarea" },
    inputs: [
      { key: "topic", label: "可蒐集的實例 + 想證明的事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一份 8 頁的 LinkedIn 文件貼文（PDF 輪播），用實例證明一件事。

每頁寫出「標題（不超過 15 字）＋ 內文（不超過 50 字）」。

結構：
- 第 1 頁：這個蒐集怎麼做的（問了誰、幾個人、什麼時候）。不給結論。
- 第 2-7 頁：一頁一個實例，只描述，不評論。
- 第 8 頁：結論一句話 + 一個給讀者的問題。

硬規則：
- 前 7 頁不准出現品牌自誇。
- 樣本數要誠實，12 個就寫 12 個。
- 沒有真的做過就在第 1 頁註明這是提案。
- 第 8 頁不要放 CTA。`,
    preferredModel: "qwen",
    maxTokens: 1760,
    outputDefaults: { platform: "linkedin", post_type: "document" },
  },
  {
    id: "li-30-newsletter-referral-loop",
    tier: "30s",
    postType: "newsletter",
    label: { en: "Newsletter: Let Readers Recruit Readers", zh: "LI 電子報：讓訂閱者幫你招訂閱者" },
    description: { en: "Make forwarding worth something", zh: "把轉寄變成有回報的動作" },
    agent_id: 180009, // 沿用同 postType 現役卡
    skill_slug: "newsletter-editor",
    source: {
      type: "viral",
      short: "Morning Brew 推薦訂閱制",
      metric: "訂閱數從 10 萬成長至 450 萬，2020 年以 7,500 萬美元被收購",
      asOf: "2020-10",
      takeaway:
        "訂閱成長靠的是「讀者手上有一個轉寄的理由」——把最值得轉的那一段做成可獨立存在的區塊，再給轉寄的人一個回報。",
    },
    primary_question: "你的電子報裡，哪一段是讀者會想轉給同事看的？",
    primary_input: { key: "topic", placeholder: "例：每期的一張數據圖 / 一段業內祕辛", type: "textarea" },
    inputs: [
      { key: "topic", label: "讀者會想轉寄的那一段", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一份 LinkedIn 電子報，核心是「讓現有讀者主動帶新讀者進來」。

要產出：
1. 一個固定區塊的設計：每期都有、可以單獨截圖轉發、看得懂而不需要前文。
2. 一句話的轉寄請求，放在那個區塊正下方。
3. 一個推薦回報機制：推薦幾人得到什麼，要具體、要做得到、不要用抽獎。
4. 本期的開頭 150 字，示範那個固定區塊長什麼樣。

硬規則：
- 回報必須是你真的能持續給的東西，不要開一次性的空頭。
- 不要在同一期放兩個以上的行動要求。
- 轉寄請求要短，一句話，不要解釋機制細節。`,
    preferredModel: "qwen",
    maxTokens: 1650,
    outputDefaults: { platform: "linkedin", post_type: "newsletter" },
  },
  {
    id: "li-30-poll-public-wager",
    tier: "30s",
    postType: "poll",
    label: { en: "Poll: Put Something on the Line", zh: "LI 投票：開一個你願意兌現的條件" },
    description: { en: "The result obliges you to act", zh: "投票結果會讓你真的要做某件事" },
    agent_id: 180173, // 沿用同 postType 現役卡
    skill_slug: "linkedin-engagement",
    source: {
      type: "viral",
      short: "Wendy's × Carter Wilkerson",
      metric: "340 萬次轉推，當時史上最多",
      asOf: "2017-05",
      takeaway:
        "投票率低是因為沒有後果——把一個你真的會兌現的條件綁在票數上，投票就從表態變成參與。",
    },
    primary_question: "你願意為投票結果做什麼？",
    primary_input: { key: "topic", placeholder: "例：破 500 票就把內部教材公開", type: "textarea" },
    inputs: [
      { key: "topic", label: "你願意依投票結果兌現的事", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則 LinkedIn 投票貼文，把一個「你會兌現的條件」綁在結果上。

要產出：
- 投票題目（不超過 30 字）與 2-4 個選項（每個不超過 12 字）。
- 貼文內文：講清楚票數到多少、或哪個選項贏，你會做什麼。
- 兌現的時間點。
- 一句話說明你為什麼願意賭這個。

硬規則：
- 條件必須是你真的做得到、也真的願意做的。做不到就把門檻降低。
- 選項之間不能有明顯正確答案。
- 不要用投票收集名單，也不要要求私訊。
- 100-260 字。`,
    preferredModel: "qwen",
    maxTokens: 572,
    outputDefaults: { platform: "linkedin", post_type: "poll" },
  },
];

const ZEYU_ID      = 60071;  // Zeyu Yang (主場 insight-post)
const LI_DIR_TODD  = 220730; // Todd Huang — Decision Design Consultant
const LI_DIR_DAWN  = 220725; // Dawn Su — Decision Design Consultant
const LI_DIR_GLEN  = 220729; // Glen Liu — Decision Design Consultant
const LI_DIR_TONY  = 220728; // Tony Chiang — Decision Design Consultant
export const LI_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "li-30-insight-post":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1.91:1",variantLabels: ["反共識", "數據驅動", "個人故事"], captionMinChars: 150, captionMaxChars: 350 },
  "li-30-hook-3":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["反共識", "數據反差", "個人故事"], captionMinChars: 30, captionMaxChars: 80 },
  "li-30-article-opener": { variants: 3, images: 3, runImageGen: false, imageDirectorId: LI_DIR_TODD, aspectRatio: "1.91:1",variantLabels: ["場景式", "個人連結", "重點預告"], captionMinChars: 150, captionMaxChars: 300 },
  "li-30-poll":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["策略選擇", "經驗分歧", "未來預測"], captionMinChars: 80, captionMaxChars: 200 },
  "li-30-event-invite":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: LI_DIR_DAWN, aspectRatio: "1.91:1",variantLabels: ["專業敘述", "故事邀請", "稀缺感"], captionMinChars: 120, captionMaxChars: 300 },
  "li-30-dm-intro":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["求教式", "共同點", "價值交換"], captionMinChars: 80, captionMaxChars: 150 },
  "li-30-comment":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["補充經驗", "不同觀點", "提問擴展"], captionMinChars: 50, captionMaxChars: 150 },
  "li-30-headline":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["職稱+價值", "結果型", "個性型"], captionMinChars: 30, captionMaxChars: 120 },
  "li-30-newsletter":     { variants: 3, images: 3, runImageGen: false, imageDirectorId: LI_DIR_GLEN, aspectRatio: "1.91:1",variantLabels: ["數據驅動", "故事性", "問題式"], captionMinChars: 150, captionMaxChars: 300 },
  "li-30-document":       { variants: 3, images: 3, runImageGen: false, imageDirectorId: LI_DIR_TONY, aspectRatio: "1:1",variantLabels: ["教學清單型", "故事型", "反差型"], captionMinChars: 400, captionMaxChars: 1500 },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "li-30-feed-cost-of-stance": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["數字版", "故事版", "拒絕清單版"],
    captionMinChars: 250, captionMaxChars: 550,
  },
  "li-30-article-own-the-failure": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["時間軸版", "根因版", "賠償版"],
    captionMinChars: 600, captionMaxChars: 1200,
  },
  "li-30-document-proof-deck": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["樣本版", "對照版", "時間序版"],
    captionMinChars: 350, captionMaxChars: 800,
  },
  "li-30-newsletter-referral-loop": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["轉寄誘因版", "專屬解鎖版", "共同署名版"],
    captionMinChars: 350, captionMaxChars: 750,
  },
  "li-30-poll-public-wager": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["門檻版", "二選一版", "公開挑戰版"],
    captionMinChars: 100, captionMaxChars: 260,
  },
};

export function getLIOrchestraConfig(taskId: string): OrchestraConfig | null {
  return LI_30S_ORCHESTRA[taskId] ?? null;
}
