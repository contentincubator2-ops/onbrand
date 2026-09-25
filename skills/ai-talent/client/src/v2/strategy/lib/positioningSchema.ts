/**
 * positioningSchema — typed config for the brand / product / event
 * positioning books.
 *
 * Each scope has an ordered list of segments. Each segment lists its
 * fields, a recommended agent slug for auto-fill, and a label.
 *
 * Field types supported:
 *   text       — single-line input
 *   textarea   — multi-line textarea
 *   array       — string[] (each item rendered as removable chip-input row)
 *   tableRows   — array of objects with named columns
 *   number      — numeric input (used for scores)
 *   needsGroups — array of named groups (e.g. audience segments), each with
 *                 its own addable tableRows-style needs list. `columns`
 *                 describes the inner needs table; the number of groups AND
 *                 the number of needs per group are both open-ended.
 *
 * Stored in DB as JSON keyed by segment.id under
 *   brands.positioning / products.positioning / events.positioning.
 */

export type FieldType = "text" | "textarea" | "array" | "tableRows" | "number" | "needsGroups";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  /** For tableRows: list of column keys. */
  columns?: { key: string; label: string; type: "text" | "textarea" | "number" }[];
  /** Optional placeholder / hint shown below input. */
  hint?: string;
}

export interface SegmentSpec {
  id: string;
  /** Section number in the printed doc, e.g., "1.1". */
  num: string;
  title: string;
  /** English title — displayed when UI language is "en". */
  titleEn?: string;
  /** Recommended agent slug — used by the "🤖 由 X 幫我填寫" button. */
  agent: string;
  fields: FieldSpec[];
  /**
   * 2026-05-11 — One-line rationale: WHY this step exists in the
   * SoWork brand positioning method. Surfaces on the layer-1 card so
   * users understand the methodology, not just the form. Reviewer:
   * 「目前定位頁的段落像問卷，不像方法論」.
   */
  rationale?: string;
  /** English rationale — displayed when UI language is "en". */
  rationaleEn?: string;
  /**
   * 這一段只由使用者填，AI 不代填。
   *
   * 2026-09-25（CJ「將產品定位中，增加價格/規格／重量／份數 還有網址」）：
   * 這些是**事實**，不是判斷。讓 AI 去「產生」一個售價或克重，它一定編得出來，
   * 而且編得很像真的——然後這個假數字會流進文案、流進定價建議、流進給策略總監
   * 的脈絡。所以這一段刻意沒有「自動填寫」按鈕，產出定位的 pipeline 也不會碰它
   * （positioningSteps.ts 的步驟是寫死的一段一步，不吃這個 segment）。
   */
  userOnly?: boolean;
}

// ── Brand (8 segments) ───────────────────────────────────────────────────
export const BRAND_SEGMENTS: SegmentSpec[] = [
  {
    id: "goldenCircle",
    num: "1.1",
    title: "品牌黃金圈",
    titleEn: "Brand Golden Circle",
    agent: "brand-archetype-positioning",
    rationale: "先有 WHY，才有 HOW 跟 WHAT — Sinek 的黃金圈是定位的起點，沒鎖定信念，後面標語、價值觀、差異化都會飄。",
    rationaleEn: "WHY before HOW and WHAT — Sinek's golden circle is where positioning starts. Without a locked belief, taglines, values, and differentiation all drift.",
    fields: [
      { key: "why",  label: "WHY — 品牌願景",        type: "textarea" },
      { key: "how",  label: "HOW — 品牌使命",        type: "textarea" },
      { key: "what", label: "WHAT — 品牌產品 / 服務", type: "textarea" },
    ],
  },
  {
    id: "tagline",
    num: "1.2",
    title: "品牌核心標語",
    titleEn: "Core Brand Tagline",
    agent: "brand-tagline-writer",
    rationale: "標語把 WHY 濃縮成一句記得住的話 — 它是黃金圈的對外口號，所有貼文 / 廣告的 CTA 都會以此為錨。",
    rationaleEn: "The tagline distils the WHY into one memorable line — it's the golden circle's public face. Every post and ad CTA anchors to it.",
    fields: [
      { key: "zhTagline",      label: "中文標語",      type: "text" },
      { key: "enTagline",      label: "英文標語",      type: "text" },
      { key: "type",           label: "標語類型",      type: "text" },
      { key: "scenes",         label: "應用場景",      type: "array" },
      { key: "competitorDiff", label: "競品差異",      type: "textarea" },
      { key: "story",          label: "標語品牌故事",  type: "textarea" },
    ],
  },
  {
    id: "taglineScore",
    num: "1.3",
    title: "標語評分摘要",
    titleEn: "Tagline Score Summary",
    agent: "brand-tagline-scorer",
    rationale: "好標語不只憑感覺 — 6 維度（記憶 / 差異 / 情感 / 簡潔 / 國際化 / 可延展）量化打分，低於 75 分要重寫。",
    rationaleEn: "Good taglines aren't just a feeling — scored across 6 dimensions (memorability / differentiation / emotion / simplicity / international / extensibility). Below 75 means rewrite.",
    fields: [
      { key: "rows", label: "評分", type: "tableRows", columns: [
        { key: "dim",     label: "維度",   type: "text" },
        { key: "code",    label: "英文",   type: "text" },
        { key: "score",   label: "分數",   type: "number" },
        { key: "comment", label: "評析",   type: "text" },
      ]},
      { key: "total", label: "總分 / 100", type: "number" },
    ],
  },
  {
    id: "origin",
    num: "2.1",
    title: "品牌起源故事",
    titleEn: "Brand Origin Story",
    agent: "brand-storyteller",
    rationale: "起源故事是用戶相信你的 receipt — 「為什麼是你做這件事？」沒有故事的品牌只是另一個 logo。",
    rationaleEn: "The origin story is the receipt that earns user trust — 'Why are you the one doing this?' A brand without a story is just another logo.",
    fields: [
      { key: "story",         label: "起源故事",       type: "textarea" },
      { key: "belief5Layers", label: "信念五層深挖",   type: "tableRows", columns: [
        { key: "layer", label: "層", type: "text" },
        { key: "body",  label: "內容", type: "textarea" },
      ]},
    ],
  },
  {
    id: "values",
    num: "2.2",
    title: "品牌核心價值觀",
    titleEn: "Core Brand Values",
    agent: "brand-values-coach",
    rationale: "價值觀是品牌的內建決策框 — 遇到取捨時依此判斷。3-5 條最有力，多了就變裝飾品。",
    rationaleEn: "Values are the brand's built-in decision framework — use them when trade-offs arise. 3-5 is most powerful; any more becomes decoration.",
    fields: [
      { key: "items", label: "核心價值觀", type: "tableRows", columns: [
        { key: "label", label: "核心",   type: "text" },
        { key: "body",  label: "說明",   type: "textarea" },
      ]},
    ],
  },
  {
    id: "audience",
    num: "3",
    title: "目標受眾",
    titleEn: "Target Audience",
    agent: "persona-architect",
    rationale: "AI 寫不像你的品牌，多半是受眾沒鎖定 — 主受眾的痛點、情感需求一旦定義清楚，每篇文章的「對誰說」就有了。",
    rationaleEn: "When AI doesn't sound like your brand, the audience is usually undefined. Once the primary audience's pain points and emotional needs are clear, every piece has a 'who it's for'.",
    fields: [
      { key: "primary",   label: "主受眾（人口統計 / 心理 / 情感需求 / 痛點 / 偏好管道）", type: "textarea" },
      { key: "secondary", label: "次受眾",                                                  type: "textarea" },
      { key: "matrix",    label: "各族群情感 / 功能需求", type: "needsGroups", columns: [
        { key: "dim",     label: "需求維度（情感或功能）", type: "text" },
        { key: "score",   label: "需求強度 (1-10)",        type: "number" },
        { key: "weight",  label: "重要性 (★)",             type: "text" },
      ]},
    ],
  },
  {
    id: "competition",
    num: "4",
    title: "競爭格局分析",
    titleEn: "Competitive Landscape",
    agent: "competitive-intel",
    rationale: "不認識競品，差異化只是自己騙自己 — 直接 / 間接 / 潛在三層分清楚，才知道空白在哪裡。",
    rationaleEn: "Without knowing competitors, differentiation is self-deception — map direct / indirect / latent tiers to find the white space.",
    fields: [
      { key: "intensity",  label: "競爭強度評估",  type: "textarea" },
      { key: "direct",     label: "直接競爭對手",  type: "tableRows", columns: [
        { key: "name",     label: "名稱",   type: "text" },
        { key: "position", label: "市場地位", type: "text" },
        { key: "tone",     label: "品牌調性", type: "text" },
        { key: "weakness", label: "弱點",     type: "textarea" },
        { key: "ourEdge",  label: "我方差異點", type: "textarea" },
      ]},
      { key: "indirect",   label: "間接競爭對手",  type: "tableRows", columns: [
        { key: "name",     label: "名稱",      type: "text" },
        { key: "threat",   label: "威脅程度",  type: "text" },
        { key: "response", label: "應對策略",  type: "textarea" },
      ]},
      { key: "map",        label: "競爭定位地圖（描述）", type: "textarea" },
    ],
  },
  {
    id: "differentiation",
    num: "5",
    title: "品牌差異化戰略",
    titleEn: "Brand Differentiation Strategy",
    agent: "differentiation-strategist",
    rationale: "差異化要同時拿下情感（為什麼愛我）與功能（為什麼選我） — 只有其中之一，會被便宜或熱情壓過去。",
    rationaleEn: "Differentiation must win on both emotional (why they love you) and functional (why they choose you). Just one gets outcompeted on price or passion.",
    fields: [
      { key: "emotional",  label: "情感差異化",  type: "textarea" },
      { key: "functional", label: "功能差異化",  type: "textarea" },
      { key: "summary",    label: "差異化總結",  type: "textarea" },
      // 2026-09-23（CJ「比對國際品牌的品牌定位書」→ P&G/Unilever Brand Key
      // 8-box 模型）：discriminator 跟 reason to believe 是 Brand Key 裡
      // 刻意跟 benefits/summary 分開的兩格——一個逼你只挑一條最尖銳的理由
      // 而不是含混的好幾條，一個逼你的主張要有證據，不能只是自己說好。
      { key: "discriminator",  label: "唯一致勝理由（比總結更尖銳，只能一條）", type: "text",
        hint: "跟差異化總結不同：這格只能有一個，是所有理由裡最尖銳、最讓人選你而非競品的那一個" },
      { key: "reasonToBelieve", label: "支撐證據（Reason to Believe）", type: "textarea",
        hint: "數據、專利、得獎、創辦人資歷、客戶實證等——沒有真的證據就留空，不要編" },
    ],
  },
  {
    id: "trends",
    num: "7",
    title: "市場趨勢與機會",
    titleEn: "Market Trends & Opportunities",
    agent: "trend-radar",
    rationale: "趨勢決定切入時機 — 對的策略放錯時機等於 0，識別有利趨勢 + 風險，是內容議題日曆的母本。",
    rationaleEn: "Trends determine timing — the right strategy at the wrong moment equals zero. Identifying favorable trends and risks is the master template for the content calendar.",
    fields: [
      { key: "favorable", label: "有利趨勢", type: "tableRows", columns: [
        { key: "name", label: "趨勢", type: "text" },
        { key: "body", label: "說明", type: "textarea" },
      ]},
      { key: "risks", label: "需關注的風險", type: "tableRows", columns: [
        { key: "name", label: "風險", type: "text" },
        { key: "body", label: "說明", type: "textarea" },
      ]},
    ],
  },
  {
    id: "voice",
    num: "8",
    title: "品牌個性與溝通風格",
    titleEn: "Brand Personality & Voice",
    agent: "brand-voice-coach",
    rationale: "Voice 是 AI 寫貼文的最後一道濾鏡 — 人格原型 + 語調詞 + 禁區字三件套，把品牌「說話的方式」變成可複製的規則。",
    rationaleEn: "Voice is the final filter for AI-generated posts — persona archetype + tone keywords + forbidden zones turn 'how the brand speaks' into replicable rules.",
    fields: [
      { key: "archetypes", label: "人格原型（主 / 次）",   type: "array" },
      { key: "tone",       label: "核心語調關鍵詞",         type: "array" },
      { key: "forbidden",  label: "溝通禁區",               type: "array" },
      { key: "samples",    label: "溝通範例對比",            type: "tableRows", columns: [
        { key: "generic", label: "一般說法", type: "textarea" },
        { key: "ours",    label: "我們的說法", type: "textarea" },
      ]},
    ],
  },
];

// ── Product (6 segments) ─────────────────────────────────────────────────
export const PRODUCT_SEGMENTS: SegmentSpec[] = [
  {
    // 2026-09-25（CJ「將產品定位中，增加價格/規格／重量／份數 還有網址」）：
    // 起因是產品策略總監在畫面寫著 NT$560 的情況下反問售價，追下去發現售價只存在
    // positioning 的頂層（intake／掃描寫的），定位書裡根本沒有這一格；而「幾克、
    // 幾份」這種顧客第一個會問的事，連存的地方都沒有。
    //
    // 編號用 1.0 而不是插進 1.1——既有六段的編號散落在文件、PDF 與使用者的記憶裡，
    // 為了加一段把它們全部往後推一號不划算。
    id: "facts",
    num: "1.0",
    title: "商品事實",
    titleEn: "Product Facts",
    agent: "product-strategist",
    userOnly: true,
    fields: [
      { key: "price",    label: "售價",          type: "text", hint: "例：NT$560（含幣別，照你實際賣的寫）" },
      { key: "spec",     label: "規格",          type: "text", hint: "例：2 片裝／厚度 1.5cm／真空包" },
      { key: "weight",   label: "重量／容量",     type: "text", hint: "例：300g（顧客判斷划不划算的第一個數字）" },
      { key: "servings", label: "份數",          type: "text", hint: "例：2–3 人份" },
      { key: "url",      label: "商品網址",       type: "text", hint: "商品頁連結，寫文案要放連結時直接取用" },
    ],
    rationale: "售價、規格、重量、份數、連結是事實不是判斷——AI 不會也不該幫你編。填了它們，寫文案與談定價時才有共同的地面。",
    rationaleEn: "Price, spec, weight, servings and the product URL are facts, not judgements — AI will not invent them for you. Filling them gives copy and pricing work a shared ground truth.",
  },
  {
    id: "core",
    num: "1.1",
    title: "產品核心定位",
    titleEn: "Product Core Positioning",
    agent: "product-strategist",
    fields: [
      { key: "name",          label: "產品名稱",       type: "text" },
      { key: "zhTagline",     label: "中文標語",       type: "text" },
      { key: "enTagline",     label: "英文標語",       type: "text" },
      { key: "coreStatement", label: "核心定位",       type: "textarea" },
      { key: "oneLineValueProp", label: "一句話價值主張（速查卡用）", type: "textarea" },
    ],
  },
  {
    id: "audience",
    num: "1.2",
    title: "目標族群",
    titleEn: "Target Group",
    agent: "persona-architect",
    fields: [
      { key: "primary",   label: "主目標族群",  type: "textarea" },
      { key: "secondary", label: "次目標族群",  type: "textarea" },
      { key: "pains",     label: "族群痛點",    type: "array" },
      { key: "needs",     label: "族群需求",    type: "array" },
      { key: "mots",      label: "MOT（每受眾關鍵時刻）", type: "tableRows", columns: [
        { key: "audience", label: "受眾",   type: "text" },
        { key: "mot",      label: "MOT",   type: "textarea" },
      ]},
    ],
  },
  {
    id: "value",
    num: "2",
    title: "產品價值主張",
    titleEn: "Product Value Proposition",
    agent: "product-value-mapper",
    fields: [
      { key: "coreFunctions", label: "核心功能",   type: "array" },
      { key: "features",      label: "產品特色",   type: "array" },
      { key: "advantages",    label: "產品優勢",   type: "array" },
      { key: "primaryEmotion", label: "主要情緒價值", type: "textarea" },
      { key: "personality",    label: "品牌個性",     type: "textarea" },
      { key: "userFeeling",    label: "使用者感受",   type: "textarea" },
    ],
  },
  {
    id: "competition",
    num: "3",
    title: "競爭定位",
    titleEn: "Competitive Positioning",
    agent: "competitive-intel",
    fields: [
      { key: "competitors", label: "競品", type: "tableRows", columns: [
        { key: "name",     label: "名稱",   type: "text" },
        { key: "position", label: "定位",   type: "text" },
      ]},
      { key: "uniqueUsp",   label: "獨家賣點",         type: "textarea" },
      { key: "rareUsp",     label: "少數競品也說的賣點", type: "textarea" },
      { key: "commonUsp",   label: "多數競爭者都說的賣點", type: "textarea" },
    ],
  },
  {
    id: "strategy",
    num: "4",
    title: "產品策略",
    titleEn: "Product Strategy",
    agent: "gtm-architect",
    fields: [
      { key: "positioning",         label: "產品定位策略", type: "textarea" },
      { key: "pricing",             label: "定價策略",      type: "textarea" },
      { key: "channel",             label: "通路策略",      type: "textarea" },
      { key: "promotion",           label: "推廣策略",      type: "array" },
      { key: "lifecycleStage",      label: "生命週期階段",  type: "text" },
      { key: "developmentStrategy", label: "發展策略",      type: "textarea" },
      { key: "marketGap",           label: "市場受眾缺口",  type: "textarea" },
      { key: "channelGap",          label: "銷售通路缺口",  type: "textarea" },
      { key: "priceGap",            label: "價格區間缺口",  type: "textarea" },
      { key: "promotionGap",        label: "推廣策略缺口",  type: "textarea" },
    ],
  },
  {
    id: "marketing",
    num: "6",
    title: "行銷文字指引",
    titleEn: "Copy & Marketing Guidelines",
    rationale: "語氣、溝通風格、關鍵詞彙 — 這是你的「文字 DNA」，所有文案都要符合這份指引。",
    rationaleEn: "Tone, style, and keywords — the copy DNA every piece of content must match.",
    agent: "brand-voice-coach",
    fields: [
      { key: "tone",          label: "品牌語氣",      type: "textarea" },
      { key: "style",         label: "溝通風格",      type: "textarea" },
      { key: "keywords",      label: "關鍵詞彙",      type: "array" },
      { key: "visualStyle",   label: "視覺文字搭配",  type: "textarea" },
      { key: "colorStrategy", label: "色彩與情緒聯想", type: "textarea" },
      { key: "imageStyle",    label: "圖像語言",      type: "textarea" },
    ],
  },
];

// ── Event (11 segments — CJ direction 2026-04-29) ────────────────────────
//
// Schema mirrors the 10 user-facing campaign sections (背景 → 受眾 → 目標 →
// SMP → 訊息 → 創意 → 規範 → 管道 → 旅程) plus an upfront `brief` segment
// auto-filled by the intake agent (eventType / roleThisRound) and the
// `awards` segment which sits between objectives and SMP and is grounded in
// DB-injected creative_cases (RAG).
//
// NOTE on backward compat: old events have segId in
// {overview, diagnosis, awards, solution}. New schema reuses `awards` and
// retires the others. Old data stays in JSON but the new UI won't render
// it; user must re-run the pipeline to repopulate. Migration script TBD.
export const EVENT_SEGMENTS: SegmentSpec[] = [
  {
    // 1. Strategic brief — filled automatically by intake agent reading
    // brand + product positioning. User can edit afterwards.
    id: "brief",
    num: "1",
    title: "戰略 Brief（intake 自動填寫）",
    agent: "intake-agent",
    rationale: "先定調這次活動在品牌旅程中的角色——是升維、切入新市場、建立認知還是衝轉換，角色不同，後面每個創意與媒體決策的判準都不同。",
    rationaleEn: "Name this campaign's role in the brand's journey first — brand-building, new-market entry, awareness, or conversion. The role changes every judgment call that follows.",
    fields: [
      { key: "eventType",       label: "活動類型（brand / growth / conversion / hybrid）", type: "text" },
      { key: "roleThisRound",   label: "本次角色（品牌升維 / 新市場切入 / 認知建立 / 轉換衝刺）", type: "text" },
      { key: "briefSummary",    label: "活動定位摘要（200 字）", type: "textarea" },
      { key: "relatedProducts", label: "對應產品（從 ScopeBar 自動帶入；可能多個）", type: "array" },
    ],
  },
  {
    // 2. Background & problem — user section 2
    id: "context",
    num: "2",
    title: "背景與問題",
    agent: "business-diagnostician",
    rationale: "行銷解法救不了診斷錯的病——先把商業現況、市場認知落差與根本原因說清楚，避免創意跳過診斷直接開跑，打到錯的靶。",
    rationaleEn: "A marketing fix can't cure a misdiagnosed problem — nail the business reality, the perception gap, and the root cause before creative starts, or you'll hit the wrong target well.",
    fields: [
      { key: "businessBackground", label: "商業背景（公司 / 品牌目前狀態）", type: "textarea" },
      { key: "marketingStatus",    label: "當前行銷現況（被市場怎麼認知）", type: "textarea" },
      { key: "coreProblem",        label: "核心問題（1 句話）",            type: "textarea" },
      { key: "rootCause",          label: "根本原因（為什麼會發生）",       type: "textarea" },
    ],
  },
  {
    // 3. Audience — three layers
    id: "audience",
    num: "3",
    title: "目標受眾",
    agent: "audience-strategist",
    rationale: "活動受眾不是重新發明的人——鎖定品牌既有受眾裡「這次特別要對誰說話」的核心洞察，創意才有一個具體的人在聽，而不是對空氣喊話。",
    rationaleEn: "Campaign audiences aren't invented from scratch — pin down who, within the brand's existing audience, this round is really speaking to. Creative needs a specific listener, not a crowd.",
    fields: [
      { key: "primaryAudience",   label: "核心受眾（人群輪廓 / 行為特徵 / 心理洞察）", type: "textarea" },
      { key: "secondaryAudience", label: "次要受眾",                                  type: "textarea" },
      { key: "keyInsight",        label: "關鍵洞察（一句話）",                        type: "textarea" },
    ],
  },
  {
    // 4. Objectives — three tiers (business / marketing / user-action)
    id: "objectives",
    num: "4",
    title: "活動目標（三層）",
    agent: "campaign-objectives",
    rationale: "商業、行銷、用戶行為三層目標要分開寫——只顧商業目標容易流於空泛的營收數字，只顧用戶行為又見樹不見林，三層對齊才知道這次活動算不算贏。",
    rationaleEn: "Business, marketing, and user-action goals need separate lines — business-only goals go vague, action-only goals miss the forest for the trees. All three aligned is how you know if this campaign actually won.",
    fields: [
      { key: "businessGoal",  label: "商業目標（Business）",        type: "textarea" },
      { key: "marketingGoal", label: "行銷目標（Marketing / Brand）", type: "textarea" },
      { key: "userActionGoal",label: "用戶行為目標（User Action）",   type: "textarea" },
      { key: "kpis",          label: "可量化 KPI 指標",              type: "array" },
    ],
  },
  {
    // 5. Award matching (DB-RAG retained from previous schema)
    id: "awards",
    num: "5",
    title: "獎項匹配（DB-RAG）",
    agent: "award-matcher",
    rationale: "站在得獎案例的肩膀上——找到方法論相近的得獎作品，讓創意有可驗證的參考座標，不是團隊憑空發想、自己說服自己。",
    rationaleEn: "Stand on the shoulders of award-winning work — find campaigns with a similar methodology so creative has a verifiable reference point, not just the team convincing itself.",
    fields: [
      { key: "selectedAwards", label: "推薦子獎項", type: "tableRows", columns: [
        { key: "name",         label: "完整名稱",     type: "text" },
        { key: "subCategory",  label: "子獎項",       type: "text" },
        { key: "matchScore",   label: "匹配分數",     type: "number" },
        { key: "matchReason",  label: "匹配理由",     type: "textarea" },
      ]},
    ],
  },
  {
    // 6. Single-Minded Proposition — the highest creative principle
    id: "smp",
    num: "6",
    title: "單一核心命題（SMP）",
    agent: "smp-architect",
    rationale: "SMP 是整場活動最高指導原則——一句話定生死，後面所有創意、訊息、素材都要能回答「這句話」，答不了的就是跑題。",
    rationaleEn: "The SMP is the campaign's highest governing principle — one line that everything else must answer to. If a piece of creative can't trace back to it, it's off-brief.",
    fields: [
      { key: "singleMindedProposition", label: "SMP（一句話）",          type: "textarea" },
      { key: "rationale",               label: "為什麼是這句（200 字內）", type: "textarea" },
    ],
  },
  {
    // 7. Messaging framework
    id: "messaging",
    num: "7",
    title: "訊息架構",
    agent: "messaging-architect",
    rationale: "核心訊息要有支撐點與證據——沒有 proof 的 claim 只是空話，消費者不會信；案例、數據、真實用戶故事才讓訊息站得住腳。",
    rationaleEn: "A core message needs support and proof — a claim with nothing behind it is just noise. Cases, data, and real user stories are what make it believable.",
    fields: [
      { key: "coreMessage",      label: "核心訊息（Core Message）",        type: "textarea" },
      { key: "supportingPoints", label: "支撐訊息（3-5 條）",              type: "array" },
      { key: "proofs",           label: "證據（案例 / 數據 / 使用者故事）", type: "array" },
    ],
  },
  {
    // 8. Creative concept — uses Grand Prix / Gold cases as RAG benchmark
    id: "creative",
    num: "8",
    title: "創意概念",
    agent: "creative-architect",
    rationale: "大創意要能被一句話講完、也要能被一個比喻記住——測試標準是：說給一個沒有背景的人聽，他隔天還記不記得住。",
    rationaleEn: "A big idea must fit in one sentence and stick as one metaphor — the test is whether a stranger, hearing it once, still remembers it the next day.",
    fields: [
      { key: "creativeTheme",   label: "創意主題（活動 big idea）",        type: "textarea" },
      { key: "coreMetaphor",    label: "核心比喻（市場/事件對應為何 metaphor）", type: "textarea" },
      { key: "coreTranslation", label: "核心轉譯（一句話 hook）",         type: "textarea" },
      { key: "referenceCases",  label: "參考案例（注入的 Grand Prix / Gold）", type: "tableRows", columns: [
        { key: "brand",       label: "品牌",       type: "text" },
        { key: "awardLevel",  label: "獎項層級",   type: "text" },
        { key: "year",        label: "年份",       type: "text" },
        { key: "description", label: "案例描述",   type: "textarea" },
      ]},
    ],
  },
  {
    // 9. Creative & content guidelines — pulled from brand visual + voice
    id: "guidelines",
    num: "9",
    title: "創意與內容規範",
    titleEn: "Creative & Content Guidelines",
    rationale: "語氣基調、必須元素、禁用元素 — 讓所有創意執行人員有共同的遵守準則。",
    rationaleEn: "Tone of voice, must-haves, and forbidden elements — the creative guardrails every execution must follow.",
    agent: "guideline-architect",
    fields: [
      { key: "visualLanguage",     label: "視覺語言（Visual System）",       type: "textarea" },
      { key: "toneOfVoice",        label: "語氣（Tone of Voice）",           type: "textarea" },
      { key: "mustHaveElements",   label: "必須出現元素（Must-have）",        type: "array" },
      { key: "forbiddenElements",  label: "禁用元素（Don't）",                type: "array" },
      { key: "sourceWarning",      label: "資料完整度警告（系統自動填）",      type: "textarea" },
    ],
  },
  {
    // 10. Content & channel strategy — Taiwan term: 管道, not 渠道
    id: "channels",
    num: "10",
    title: "內容與管道策略",
    agent: "channel-architect",
    rationale: "管道不是均分預算——每個階段該用什麼管道、什麼內容型態，要對應受眾當下的意識階段與情緒狀態，用錯階段等於對牛彈琴。",
    rationaleEn: "Channel budget isn't split evenly — each stage's channel and content type must match the audience's actual awareness level and emotional state, or the message lands on deaf ears.",
    fields: [
      { key: "phases", label: "階段 + 管道 + 內容型態", type: "tableRows", columns: [
        { key: "stage",        label: "階段",         type: "text" },
        { key: "channels",     label: "管道（逗號分隔）",   type: "text" },
        { key: "contentTypes", label: "內容型態（逗號分隔）", type: "text" },
        { key: "rationale",    label: "為何這配置",    type: "textarea" },
      ]},
    ],
  },
  {
    // 11. User journey — 5 step Awareness → Conversion arc
    id: "journey",
    num: "11",
    title: "用戶旅程",
    agent: "journey-architect",
    rationale: "五步驟的 Awareness → Conversion 旅程是用來抓斷點——每一步的情緒與接觸點沒接上，用戶就會在中途流失，旅程圖就是抓漏工具。",
    rationaleEn: "The 5-step Awareness→Conversion arc exists to catch drop-off points — wherever a step's emotion and touchpoint don't connect, users leak out. The journey map is a leak detector.",
    fields: [
      { key: "journey", label: "旅程（每步：情緒 / 接觸點 / 期望反應）", type: "tableRows", columns: [
        { key: "step",       label: "步驟",     type: "text" },
        { key: "emotion",    label: "情緒狀態", type: "text" },
        { key: "touchpoint", label: "接觸點",   type: "text" },
        { key: "outcome",    label: "預期反應", type: "textarea" },
      ]},
    ],
  },
];

export const SCOPE_SEGMENTS = {
  brand: BRAND_SEGMENTS,
  product: PRODUCT_SEGMENTS,
  event: EVENT_SEGMENTS,
} as const;
