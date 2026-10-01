/**
 * 異業合作（co-branding / partnership）任務卡。
 *
 * 2026-10-01（CJ「這兩件事情，都要修正」——異業合作跟網紅一樣，不能只是活動頁上一段說明，
 * 要能被納入行銷計畫）：活動企劃的「異業合作」那條線排的是品牌要做的五件事，每件對一張卡：
 *
 *   −28 天 合作夥伴輪廓與合作形式  cb-30-partner-shortlist
 *   −21 天 異業合作提案信          cb-30-pitch-letter
 *   −14 天 提案後追蹤訊息          cb-30-followup
 *   −10 天 合作條件與分工表        cb-30-deal-terms
 *   開賣日 雙方聯合公告貼文        cb-30-joint-post
 *
 * 跟 KOL 卡同一條原則（quickTaskKOL.ts「我們提供說法，不提供名單」）：我們不替品牌編出
 * 「某某品牌願意合作」這種事實。夥伴清單給的是**輪廓與篩選條件**，真的品牌名由使用者決定；
 * 數字、折扣、分潤比例沒給就標 [待補]，不自己編。
 *
 * Agent 都是 mos_db 裡真的做過聯名／異業合作的人（2026-10-01 以 mos-agents 搜尋「聯名」挑的）：
 *   180279 蔡雅玲 統一超商 行銷策略總監（零售品牌策略、聯名合作）
 *   220610 滕宛庭 媒體與贊助合作 BD 專員（提案→談判→簽約的完整 BD 流程）
 *   220609 司徒昕妍 媒體與贊助合作 BD 專員（同上，追蹤）
 *   180282 許志豪 統一超商 促銷活動專員（聯名商品、集點、節慶促銷）
 *   180241 陳佳蓉 LINE Taiwan 活動行銷專員（聯名合作、促銷活動）
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const COBRAND_TONE = `
語氣要求：平視、務實、像一個認真想把事情做成的合作窗口，不是業務話術。
先講「對方能得到什麼」，再講「我們想要什麼」。
**禁區：** 編造對方品牌的數據、粉絲數、合作意願；「雙贏」「強強聯手」這類空話；沒給的折扣與分潤比例。
`;

export const COBRAND_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "cb-30-partner-shortlist",
    tier: "30s", postType: "generic",
    label: { en: "Partner Profiles & Collab Formats", zh: "異業合作夥伴輪廓與合作形式" },
    description: { en: "Who to partner with (profiles & screening criteria, not invented names) and 3 collab formats that fit", zh: "該找什麼樣的品牌合作（輪廓與篩選條件，不編品牌名）＋ 3 種適合的合作形式" },
    agent_id: 180279, skill_slug: "brand-strategy",
    primary_question: "這次想借誰的客群？活動要達成什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：上市活動，想接觸 25-40 歲中小品牌主，希望多一個非社群的曝光管道",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "活動與想接觸的客群", type: "textarea", required: true }],
    contextSources: [
      "brand.positioning.goldenCircle.why",
      "brand.positioning.tagline.zhTagline",
    ],
    systemPrompt: `產出一份「異業合作夥伴輪廓與合作形式」建議（Markdown）。
目的：找受眾重疊、但品類不衝突的品牌，借對方的客群，用這檔活動當共同理由。

# 合作夥伴輪廓
列 4-6 種**品牌類型**（不是具體品牌名），每一種：
- **類型**：一句話（例：「服務中小品牌主的記帳／發票 SaaS」）
- **為什麼是他們**：受眾怎麼重疊、為什麼不衝突
- **篩選條件**：3 個可以檢查的條件（例：客群規模、調性、是否已有類似合作）
- **對方能得到什麼**：一句話

# 適合的合作形式
3 種，每種寫：怎麼做、雙方各出什麼、適合哪一型夥伴、風險。
（互相曝光／聯名組合／交換名單／共同贈品／共同內容……依活動挑）

# 下一步
2-3 句：先找哪一型、怎麼開口（提案信那張卡接手）。

**規則**：繁體中文、台灣用語。不編具體品牌名、不編對方的數據或合作意願。不知道的寫 [待補：…]。只輸出文件本身。
${COBRAND_TONE}`,
    preferredModel: "anthropic", maxTokens: 1800,
    outputMode: "document",
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "cb-30-pitch-letter",
    tier: "30s", postType: "generic",
    label: { en: "Co-branding Pitch Letter", zh: "異業合作提案信" },
    description: { en: "A first-contact proposal letter: what they get, what we ask, one easy next step", zh: "第一次聯繫的提案信：對方能得到什麼、我們想要什麼、一個好回覆的下一步" },
    agent_id: 220610, skill_slug: "kol-outreach",
    primary_question: "要寄給哪一型的品牌？想一起做什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：寄給服務中小品牌的記帳 SaaS，想在對方電子報曝光試用活動，我們回饋對方用戶專屬方案",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "對象與合作構想", type: "textarea", required: true }],
    systemPrompt: `產出 1 封異業合作提案信（250-400 字）。
**結構**：
1. 開場：一句話說明為什麼找上對方——講對方的客群或品牌特質跟這次活動的連結（不要編對方的數據）。
2. 對方能得到什麼：具體寫出好處（曝光、給用戶的福利、共同內容…），放在「我們想要什麼」之前。
3. 合作構想：這次活動是什麼、想怎麼一起做，描繪畫面，先不談硬條件。
4. 收尾：一個低壓力、容易回覆的下一步（例如「方便約 20 分鐘聊聊嗎？」）。
**輸出**：只寫信件本文，不寫主旨行、不寫「以下是範例」。日期、窗口、方案細節未知用 [待補：…]。
${COBRAND_TONE}`,
    preferredModel: "anthropic", maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "cb-30-followup",
    tier: "30s", postType: "generic",
    label: { en: "Partnership Follow-Up", zh: "異業合作追蹤訊息（沒回／已聊／談條件）" },
    description: { en: "Follow-ups for three stages — never pushy", zh: "三種情境的追蹤訊息，推進但不催促" },
    agent_id: 220609, skill_slug: "kol-outreach",
    primary_question: "目前進行到哪？對方是誰、上次聊到哪？",
    primary_input: {
      key: "context",
      placeholder: "例：提案信寄出一週沒回／已經通過電話，對方想先看分工",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "進度與對象", type: "textarea", required: true }],
    systemPrompt: `產出 1 則異業合作追蹤訊息（80-180 字），依使用者描述的進度寫：
- 還沒回：補一個新的、對對方有用的資訊再問一次，不重複上一封。
- 已經聊過：整理上次共識、提出下一步與時間。
- 談條件中：把待決定的 2-3 件事列清楚，請對方挑或回覆。
只輸出訊息本文。未知的用 [待補：…]。
${COBRAND_TONE}`,
    preferredModel: "anthropic", maxTokens: 500,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "cb-30-deal-terms",
    tier: "30s", postType: "generic",
    label: { en: "Collab Terms & Responsibilities", zh: "異業合作條件與分工表" },
    description: { en: "Who provides what, offer, traffic tracking, timeline — a table both sides can sign off", zh: "誰出素材、誰出優惠、導流怎麼算、時程——一張雙方都能確認的表" },
    agent_id: 180282, skill_slug: "brand-strategy",
    primary_question: "合作夥伴是誰？雙方大致談好了什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：與記帳 SaaS 互換電子報曝光，各給對方用戶一個專屬方案，12/1 上線",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "夥伴與已談好的內容", type: "textarea", required: true }],
    systemPrompt: `產出一份「異業合作條件與分工表」（Markdown），讓雙方逐項確認。

# 合作摘要
一段話：誰跟誰、做什麼、什麼時候、雙方各得到什麼。

# 分工
Markdown 表格，欄位固定：
| 項目 | 我方 | 對方 | 截止日 |
| --- | --- | --- | --- |
至少涵蓋：素材製作、文案審核、曝光版位、用戶優惠／福利、客服與兌換、上線發布。

# 優惠與導流
- 雙方用戶各拿到什麼（沒給的數字用 [待補]）
- 導流怎麼追蹤：每一方用自己的追蹤連結或優惠碼（寫出建議命名方式）
- 成效怎麼互相回報、多久一次

# 對外說法
一句雙方共用的核心訊息＋各自貼文必須提到與不能提到的事。

# 待雙方確認
條列還沒定的事。

**規則**：不編分潤比例、金額、對方的數據；未知一律 [待補：…]。只輸出文件本身。
${COBRAND_TONE}`,
    preferredModel: "anthropic", maxTokens: 2000,
    outputMode: "document",
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "cb-30-joint-post",
    tier: "30s", postType: "generic",
    label: { en: "Joint Announcement Post", zh: "異業合作聯合公告貼文" },
    description: { en: "One announcement both brands can post — same core message, each with its own opening", zh: "雙方都能發的聯合公告：同一句核心訊息，各自的開場" },
    agent_id: 180241, skill_slug: "social-copy",
    primary_question: "跟誰合作？雙方用戶各拿到什麼？",
    primary_input: {
      key: "context",
      placeholder: "例：OnBrand Studio × 某記帳 SaaS，雙方用戶都能申請試用＋專屬方案，12/1–12/25",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "合作內容", type: "textarea", required: true }],
    systemPrompt: `產出一篇異業合作的聯合公告貼文（200-350 字），可以在雙方的社群發。
**結構**：
1. 第一句：為什麼這兩個品牌會一起出現（對用戶有什麼意義），不要寫「強強聯手」。
2. 合作內容：用戶能拿到什麼、怎麼參加、期限。
3. 一個明確的行動呼籲。
另外附兩個替代開場句：一個給我方粉專用、一個給對方粉專用（標「我方開場：」「對方開場：」）。
未知的品牌名、日期、優惠用 [待補：…]，不要自己編。
${COBRAND_TONE}`,
    preferredModel: "anthropic", maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
];

export const COBRAND_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "cb-30-partner-shortlist": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["受眾重疊版", "通路互補版", "內容共創版"],
    captionMinChars: 500, captionMaxChars: 2400,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "cb-30-pitch-letter": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["真誠版", "互惠版", "時機切入版"],
    captionMinChars: 220, captionMaxChars: 450,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "cb-30-followup": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["輕觸版", "推進版", "收斂版"],
    captionMinChars: 70, captionMaxChars: 200,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "cb-30-deal-terms": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["完整版", "精簡版", "第一次合作版"],
    captionMinChars: 500, captionMaxChars: 2600,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "cb-30-joint-post": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["用戶好處版", "故事版", "期限版"],
    captionMinChars: 200, captionMaxChars: 450,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
};
