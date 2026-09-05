/**
 * brandPacks/hotu — HOTU（色彩文具／著色療癒品牌，美國市場）。
 *
 * 來源：
 *   1. 0818_HOTU_品牌定位更新提案.pdf（SoWork，2026-08-18）—— 品牌願景/使命/
 *      價值觀/承諾兩個方向（Born Vivid 哲學層／Shine as you 行動層）、
 *      「彩己」命名解讀、留白→沉浸→悅己→主體性關鍵詞路徑。
 *   2. W10平台定位20260901.pdf（SoWork，2026-09-01）—— 確認 HOTU 主打美國市場
 *      （IG / TikTok / 獨立站），HOTU 自己的三頻道定位命名：
 *        IG      = Color Studio 美感靈感館
 *        TikTok  = Peace Sanctuary 情緒避風港
 *        獨立站  = Grounding Haven 定心沉浸站
 *
 * ── 這批卡片怎麼來的（2026-09-05 CJ 命名原則校正）─────────────────────
 * CJ 最初以為卡片要叫「HOTU + 目的」，後來釐清：真正的命名原則是「來源帳號 /
 * 內容型態 + 類別」——每張卡對應 W10 簡報裡引用的一則具體參考貼文，卡片的
 * SKILL 是把「那則貼文的撰寫方式」萃取出來，而不是泛用的類別說明。
 * 「品牌信任與質感查證」類別因為簡報第 6 頁沒有可點擊連結、抓不到單一來源
 * 帳號，CJ 決定放棄這個類別，不建卡。
 * 兩個帳號名稱不好用（純數字匿名帳號、TikTok 官方精選帳號非個人聲音），
 * CJ 指示改用「內容型態」命名：
 *   user5287900024332 → 業配（付費合作、零文案、純產品展示）
 *   @makeup（TikTok 官方帳號）→ 妝容ASMR（該帳號策展的內容型態）
 *
 * ── 獨立站卡怎麼來的（2026-09-05 補建）──────────────────────────────
 * W10 簡報沒有給 HOTU 自己的獨立站執行矩陣，只給了「通用三類行為＋LifeLines
 * 案例示範」，所以這兩張卡照 LifeLines 案例命名（來源從個人創作者換成標竿
 * 品牌，邏輯不變）。「無壓力購物流程」本質是結帳 UX，不是內容任務卡，沒有
 * 建卡。細節見下方「獨立站」區塊的註解。
 *
 * ── Amazon 是全新頻道，卡片來源是研究不是萃取（2026-09-05）───────────
 * CJ「你要搜尋市面上亞馬遜常常要寫到內容的地方」——這批卡不是「萃取某個
 * 創作者的貼文風格」，是研究 Amazon 賣家實際會需要填寫文字的位置。7 張卡
 * 對應 2026 年現況研究出的 7 個內容位置，細節與排除項（Amazon Posts 已於
 * 2025-07-31 關閉、賣家不能公開回覆評論）見下方「Amazon」區塊註解。
 *
 * ── 長青／爆款卡（2026-09-06，CJ「還需要一些長青的任務卡和爆款任務卡」）─
 * 全庫沒有「長青 vs 爆款」的既有卡片分類先例。查證後：
 *   ・「爆款」在這個 repo 一律指「一則真實存在、已經在爆的貼文/影片」，用來
 *     反推結構再套上品牌——全域已有 ig-60-viral-rewrite / tt-60-viral-rewrite
 *     等一整組「爆款改寫」卡，機制是 primary_input.key === "viral_source"，
 *     由 viralSourceGuard.ts 在呼叫模型前擋掉空白/敷衍/太模糊的輸入。HOTU
 *     這兩張（IG／TikTok 各一）沿用同一套「借結構、換主角」原則與同一個
 *     guard，但維持 HOTU 其他卡一致的 30s／純文字設定，不跟進 60s 全域卡
 *     那套雙人設＋比較表的重量級 config。
 *   ・「長青」在這個 repo 只當形容詞用（「能長期沿用不過期」），沒有任何
 *     任務卡機制可沿用。IG／TikTok 既有的卡全部綁在某個具體情境或趨勢上，
 *     沒有一張是「品牌宣言，什麼時候發都一樣有效」的內容，這兩張（IG／
 *     TikTok 各一）填的是這個空缺，錨定在「彩己」／Born Vivid 起源故事，
 *     不需要外部參考來源。
 *
 * ── agent_id 是借用的，不是 HOTU 專屬人設 ─────────────────────────────
 * HOTU 目前沒有專屬 persona，這裡沿用 quickTaskIG.ts / quickTaskTikTok.ts
 * 既有的全域 caption_writer，依任務性質選最貼近的一位（懶人包→Kurt Chen
 * 教學型／社群曬圖→Iris Liang IG 專員／搜尋向影片→real-reaction 系人設／
 * ASMR→product-asmr 同一人／衝動購買→product-hero 同一人）。等 HOTU 有自己
 * 的人設就整批換掉，換法見 project_fb_agent_persona_standard 記憶。
 *
 * ── 語言 ────────────────────────────────────────────────────────────
 * HOTU 是美國市場（W10 頁 3 明講），輸出一律英文，語氣要像美國 Gen Z /
 * Millennial 在用的自然口語，不是翻譯腔。
 */
import type { BrandPack, BrandPackCard } from "./types";
import type { FBTaskTemplate, OrchestraConfig } from "../quickTaskFB";

/** 每張卡都要重申的品牌骨幹，避免模型漂走或掉回罐頭語氣。 */
const HOTU_BRAND_CORE = `
【HOTU 是誰】
色彩文具品牌，核心哲學是「彩己」——彩（動詞：用色彩做一件事）＋己（主體：是你，不是
別人的標準）。兩個並存的品牌敘事層：
・Born Vivid（哲學層，"You were born vivid"）——你本來就是這樣的人，只是還沒被允許。
・Shine as you（行動層，主標語，"Just by being you"）——你現在就可以，就照你本來的樣子。
產品：First Page Kit、Color My Mug Kit、Color Your Space Set、Tear-off Art Sheet 等
著色／色彩工具套組。

【輸出語言】
一律英文。語氣自然、口語，像美國 Gen Z / Millennial 平常在用的講法，不要翻譯腔、
不要教科書式的完整句。`;

/** 少寫一層巢狀，四個共同欄位固定注入。 */
function card(
  channel: BrandPack["channels"][number]["key"],
  format: string,
  template: FBTaskTemplate,
  config: OrchestraConfig,
  origin: "brand" | "sowork" = "brand",
): BrandPackCard {
  return { kind: "custom", channel, format, origin, config, template };
}

/** 純文字產出（無配圖）的共用 config —— 這批卡全部是文案／分鏡腳本卡。 */
function textConfig(labels: string[], min: number, max: number): OrchestraConfig {
  return {
    variants: labels.length, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: labels, captionMinChars: min, captionMaxChars: max,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Instagram — 頻道定位「Color Studio 美感靈感館」
// ══════════════════════════════════════════════════════════════════════

// ── 懶人包（W10 頁 7：靈感蒐集與懶人包）──────────────────────────────

const hotuIgMavix = card(
  "instagram", "懶人包",
  {
    id: "hotu-ig-mavix-guide",
    tier: "30s",
    postType: "carousel",
    label: { en: "mavix_xo — Cheat Sheet", zh: "mavix_xo懶人包" },
    description: {
      en: "Canva-style DIY tutorial carousel, styled as a torn notebook page",
      zh: "仿 Canva 教學撕頁筆記本風格的輪播懶人包",
    },
    // Kurt Chen — Insights Storyteller（沿用 ig-30-carousel-structure）
    agent_id: 220754,
    skill_slug: "hotu-mavix-guide",
    primary_question: "這篇懶人包要教哪個 3 步驟小技巧？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. how to blend two HOTU markers without streaks",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Tutorial topic", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.values"],
    systemPrompt: `你在為 HOTU 寫一篇 IG 輪播懶人包文案，風格參考來源：@mavix_xo 的 "HOW TO MAKE
THIS ON CANVA" 貼文（撕頁筆記本背景、手寫貼紙字體標題、"STEP BY STEP TUTORIAL, NO
CANVA PRO NEEDED" 副標，配一小張生活情境照當視覺錨點）。

【要複製的撰寫特徵】
・大標題像手寫貼紙字：短、口語、帶一點玩心，不要正式的教學用語。
・副標明講「不需要任何前置門檻」——mavix_xo 講的是 "NO CANVA PRO NEEDED"，HOTU
  對應要講的是「不需要畫畫基礎 / 不需要買齊全套顏色」這類無門檻承諾。
・輪播每頁一個動作，配一句極短說明，不要長段落。
・不用「乾貨」「必看」這種標題黨用語，語氣輕鬆像朋友傳訊息教你。

【交付格式】
第 1 行：卡片大標題（貼紙感，≤8 字）
第 2 行：無門檻承諾副標（≤12 字）
第 3-6 行：輪播 4 頁，每頁「頁碼｜動作＋一句話說明」
最後一行：caption（60-100 字，延續同樣輕鬆語氣，結尾邀請留言分享成果）
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },
  textConfig(["3步驟版", "常見錯誤版", "顏色搭配版"], 300, 900),
);

const hotuIgInges = card(
  "instagram", "懶人包",
  {
    id: "hotu-ig-inges-guide",
    tier: "30s",
    postType: "carousel",
    label: { en: "ingesillustrations — Cheat Sheet", zh: "ingesillustrations懶人包" },
    description: {
      en: "Numbered step-by-step carousel that opens with a doubt-busting question",
      zh: "用反問句開場、破除自我懷疑的編號步驟輪播",
    },
    agent_id: 220754,
    skill_slug: "hotu-inges-guide",
    primary_question: "這篇要用哪個題材破除用戶「我不會畫」的疑慮？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. drawing a simple flower with 3 colors",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Beginner subject", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.values"],
    systemPrompt: `你在為 HOTU 寫一篇 IG 輪播懶人包文案，風格參考來源：@ingesillustrations 的
熊貓教學貼文（"Think drawing is difficult? Let this cute panda tutorial proof you
wrong! Just follow the steps and surprise yourself..." + 編號 STEP 輪播）。

【要複製的撰寫特徵】
・開場一定是反問句，直接點名讀者心裡的自我懷疑（"Think X is hard?"）。
・反問句之後立刻用一句話推翻它、給信心，不拖泥帶水。
・輪播用 STEP 1／STEP 2… 編號，每步一句祈使句指令（"Next, the eyebrows and a cute
  little nose" 這種語感——具體到下一筆該畫哪裡）。
・整體語氣溫暖、鼓勵，像在旁邊手把手教，不是在展示自己的技巧。

【交付格式】
第 1 行：開場反問句 hook（呼應「彩己」——你以為自己不會，其實只是還沒被允許）
第 2 行：推翻疑慮的一句話
第 3-6 行：STEP 1-4，每步一句具體指令
最後一行：caption（60-100 字）
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },
  textConfig(["花朵入門版", "動物入門版", "圖騰入門版"], 300, 900),
);

const hotuIgCherry = card(
  "instagram", "懶人包",
  {
    id: "hotu-ig-cherry-guide",
    tier: "30s",
    postType: "feed",
    label: { en: "cherry.artstt — Cheat Sheet", zh: "cherry.artstt懶人包" },
    description: {
      en: "Minimal-caption mixed-media art journal page with bold overlay text",
      zh: "極簡文案、混合媒材手帳頁配大字報疊字",
    },
    agent_id: 220754,
    skill_slug: "hotu-cherry-guide",
    primary_question: "這篇想邀請用戶臨摹哪個畫面？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. a slice of cake with sparkle details",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Reference image subject", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.values"],
    systemPrompt: `你在為 HOTU 寫一篇 IG 貼文文案，風格參考來源：@cherry.artstt 的手帳頁貼文
（"New Drawing⋆˚꩜｡..." 極簡開場 ＋ 畫面疊字 "LET'S DRAW SOMETHING SIMILAR TO
THIS."）。

【要複製的撰寫特徵】
・caption 本身極簡，不解釋、不教學，就是輕輕拋出一句話（可以帶裝飾性符號 ⋆˚꩜｡）。
・真正的「邀請臨摹」訊息是畫面上疊字寫的，不是 caption 講的——疊字要直接、口語、
  像朋友傳訊息說「一起畫這個」，不是正式邀請函。
・不解釋為什麼要畫、不解釋畫的意義，純粹丟出畫面本身的吸引力。

【交付格式】
第 1 行：caption（1 句，≤15 字，可帶裝飾符號）
第 2 行：畫面疊字文案（"Let's draw something similar to this." 同等語感，≤8 字一行，
  可分 2 行）
第 3 行：hashtag 建議（3-5 個，藝術／手作向，不要品牌行銷向）
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 400,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  textConfig(["靜物版", "人物版", "圖騰版"], 100, 400),
);

// ── 社群認同（W10 頁 8：社群認同與標記分享）──────────────────────────

const hotuIgBts = card(
  "instagram", "社群認同",
  {
    id: "hotu-ig-bts-community",
    tier: "30s",
    postType: "feed",
    label: { en: "bangtansocialclub — Community", zh: "bangtansocialclub社群認同" },
    description: {
      en: "Lyric-riffing, fandom-voiced caption folding a soft announcement into casual chat",
      zh: "歌詞玩梗式問答語氣，把公告悄悄包進閒聊裡",
    },
    // Iris Liang — Instagram Marketing Specialist（沿用 ig-30-caption-short）
    agent_id: 180166,
    skill_slug: "hotu-bts-community",
    primary_question: "這篇想用哪首歌/哪句流行語玩梗？順便帶什麼消息？",
    primary_input: {
      key: "context",
      placeholder: "e.g. riff on a trending song lyric, mention new color restock",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Lyric/meme angle + soft announcement", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.voice"],
    systemPrompt: `你在為 HOTU 寫一篇 IG 貼文文案，風格參考來源：@bangtansocialclub 的貼文
（"What you need twin? What you need? I need the butterflies (DJ spin that), the
flowers, and to hang out with my friends!..." + 隨性帶出補貨公告 + 粉絲黑話
hashtag）。

【要複製的撰寫特徵】
・開場用「問答句式」自問自答，像跟粉絲玩梗互動，不是發布公告的口吻。
・答案句要有畫面感、有節奏（短句頓號式列舉），不要寫成完整說明句。
・要帶的「正事」（新色上架 / 補貨）放在閒聊語氣裡順便講一句，不要另起一段正式宣布。
・結尾情緒外露（可以用一個表情符號收），像在跟朋友分享心情，不是品牌對外發言。
・hashtag 要有社群歸屬感（呼應「彩己」社群自創詞彙），不要純功能性 hashtag。

【交付格式】
caption（60-100 字）：問答式開場 → 畫面感列舉句 → 順帶一句正事 → 情緒收尾
hashtag：4-5 個，含 1 個 HOTU 自創社群標籤
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  textConfig(["新色補貨版", "限量組合版", "純玩梗版"], 200, 500),
);

const hotuIgFateH = card(
  "instagram", "社群認同",
  {
    id: "hotu-ig-fateh-community",
    tier: "30s",
    postType: "feed",
    label: { en: "_fate.h — Community", zh: "_fate.h社群認同" },
    description: {
      en: "First-person hands-on review caption, tagging the brand like a genuine shout-out",
      zh: "第一人稱實測心得，像真心感謝一樣標記品牌",
    },
    agent_id: 180166,
    skill_slug: "hotu-fateh-community",
    primary_question: "這則 UGC 用戶提到了什麼具體的使用心得？",
    primary_input: {
      key: "context",
      placeholder: "e.g. vibrant color payoff, great for detailing small illustrations",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "UGC review detail to echo", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.values"],
    systemPrompt: `你在為 HOTU 寫一篇轉發用戶成果的 IG 貼文文案，風格參考來源：@_fate.h 的貼文
（"Trying out these acrylics gel pens from @arrtxart with a cute digital style cake
illustration." + 具體顯色度/好上色度心得 + 標記品牌帳號與比賽標籤）。

【要複製的撰寫特徵】
・開場交代「在嘗試 XX」，語氣是自己在做實驗、分享過程，不是幫品牌打廣告。
・接一句具體到可以被驗證的產品心得（顯色度、好不好疊色、適合細節還是大面積），
  不要空泛誇獎。
・自然標記品牌帳號，位置像在感謝提供工具的人，不是置入行銷。
・可以加一個小型活動/徵件 hashtag，營造「這是社群常態」的感覺。

【交付格式】
caption（50-90 字）：正在嘗試什麼 → 具體產品心得（1-2 句）→ 標記 @hotu 感謝
hashtag：3-4 個，含 1 個 HOTU 社群徵件／挑戰標籤
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 400,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  textConfig(["顯色度心得版", "細節適用版", "新手初體驗版"], 150, 400),
);

// ── 長青（2026-09-06，CJ「還需要一些長青的任務卡」）───────────────────
//
// 全庫沒有「長青」當作任務卡類型的先例，唯一穩定用法是形容詞——「能長期
// 沿用不過期」（見 quickTaskPR.ts 的長青一致性、seed-local-squads.ts 的
// 長青內容更新再分發）。IG/TikTok 既有的卡全部綁在某個具體情境或趨勢上
// （懶人包教技巧、社群認同曬單、感官解壓靠 ASMR 當下感受），沒有一張是
// 「品牌宣言，什麼時候發都一樣有效」的內容——這是真正的空缺，不是重複
// 造輪子。內容錨定在「彩己」／Born Vivid 起源故事，不需要外部參考來源。

const hotuIgEvergreenManifesto = card(
  "instagram", "長青",
  {
    id: "hotu-ig-evergreen-manifesto",
    tier: "30s",
    postType: "feed",
    label: { en: "Brand Manifesto — Evergreen", zh: "品牌宣言長青版" },
    description: {
      en: "Timeless 'why HOTU exists' post — no trend or season dependency, safe to run anytime",
      zh: "不綁時事或檔期的「為什麼 HOTU 存在」貼文，任何時候發都成立",
    },
    agent_id: 180166, // Iris Liang — Instagram Marketing Specialist
    skill_slug: "hotu-ig-evergreen-manifesto",
    primary_question: "這次想從「彩己」的哪個面向切入（留白／沉浸／悅己／主體性）？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. the moment you stopped waiting to be 'good enough' to pick up a marker",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "彩己面向 + 想切入的角度", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.goldenCircle.why"],
    systemPrompt: `你在為 HOTU 寫一篇「品牌宣言」貼文——這篇的價值是「長青」：不綁任何檔期、
熱點或當下情境，一年後重發還是成立。內容錨定在品牌起源故事（彩己＝彩「動詞，用色彩做
一件事」＋己「主體，是你，不是別人的標準」；Born Vivid＝你本來就是這樣的人，只是還沒
被允許）。

【跟其他 IG 卡的差異——不要寫成懶人包或曬單】
・不教技巧、不轉發 UGC、不提任何限時活動或新品——那些是別的卡在做的事。
・這篇要做的是把「為什麼 HOTU 存在」講清楚，讓一個第一次看到這個帳號的人，看完就懂
  品牌在說什麼。

【交付格式】
caption（100-180 字）：從一個具體的「還沒被允許」的情境開場（怕畫錯、怕被評價）→
帶出「你本來就是這樣的人」的核心信念 → 收尾回到 Shine as you 的行動邀請。
hashtag：3-4 個，品牌向（#BornVivid 系），不要追時事標籤。
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  textConfig(["留白切入版", "克服恐懼切入版", "主體性切入版"], 250, 550),
);

// ── 爆款改寫（2026-09-06）────────────────────────────────────────────
//
// 全庫既有的「爆款改寫」機制（ig-60-viral-rewrite / tt-60-viral-rewrite /
// yt-60-viral-rewrite / fb-99-viral-rewrite）：用戶每次貼一個「真的正在
// 爆」的連結或具體主題，模型只借結構／hook／節奏，主角換成品牌自己的事。
// 由 viralSourceGuard.ts 在呼叫模型前擋掉空白／敷衍／太模糊的輸入，
// 靠的是 primary_input.key === "viral_source"，不看 taskId，所以品牌包
// 卡片一樣吃得到這層保護，不需要另外接線。
// HOTU 版本沿用同一套「借結構、換主角」原則，但保持跟 HOTU 其他卡一致的
// 30s／純文字設定，不跟進 60s 全域卡那套 strategist+specialty 雙人設、
// compare table 的重量級 config。

const hotuIgViralRewrite = card(
  "instagram", "爆款",
  {
    id: "hotu-ig-viral-rewrite",
    tier: "30s",
    postType: "feed",
    label: { en: "Viral Post Rewrite", zh: "IG爆款改寫" },
    description: {
      en: "Paste a real trending IG post — borrow its hook/structure, swap in HOTU",
      zh: "貼一則真的在爆的 IG 貼文，借它的鉤子與結構，主角換成 HOTU",
    },
    agent_id: 180166,
    skill_slug: "hotu-ig-viral-rewrite",
    primary_question: "貼上爆款原文 / 連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款貼文連結，或具體到能指認是哪一支的主題描述", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結 / 主題", type: "textarea", required: true },
      { key: "brand_angle", label: "想換成 HOTU 的哪個角度（可選）", type: "textarea", required: false },
    ],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.voice"],
    systemPrompt: `你在為 HOTU 做 IG 爆款改寫。輸入是一則真實存在、正在爆的 IG 貼文（連結或主題
描述）。

【原則：結構抄學，主題換血】
・只借用原貼文的敘事結構、hook 機制、情緒節奏——不要照抄原文字句，不要複製原貼文的
  人生哲學或通用情感場景硬套。
・主角必須換成 HOTU 自己的事：彩己哲學、Shine as you、或某個具體產品。
・不確定原貼文實際內容時，不要憑空編造細節去填——只根據用戶輸入裡實際提供的資訊改寫，
  資訊不夠具體的地方寫得抽象一點，不要杜撰。

【交付格式】
第 1 行：一句話說明借用了原貼文的什麼結構/hook（給操作者看，不放進最終貼文）
caption（100-200 字）：套用該結構，主角是 HOTU
hashtag：3-5 個
${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  textConfig(["保結構式", "情感放大式", "反差式"], 200, 500),
);

// ══════════════════════════════════════════════════════════════════════
// TikTok — 頻道定位「Peace Sanctuary 情緒避風港」
// ══════════════════════════════════════════════════════════════════════

const TT_HOTU_SUFFIX = `
TikTok 觀眾專注力極短，前 1.5 秒沒抓住就滑掉。這是分鏡腳本，交付給要拿手機拍的人，
不是旁白稿——每一行都要具體到「看完就知道手該放哪、鏡頭對哪」。`;

// ── 搜尋引擎化（W10 頁 11）────────────────────────────────────────────

const hotuTtRandom = card(
  "tiktok", "搜尋引擎化",
  {
    id: "hotu-tt-random-search",
    tier: "30s",
    postType: "foryou",
    label: { en: "random.userr327 — Search Discovery", zh: "random.userr327搜尋引擎化" },
    description: {
      en: "Near-zero caption, pure visual+audio nostalgia hook riding a trend",
      zh: "幾乎零文案，純靠懷舊視覺與音效觸發轉發",
    },
    // 沿用 tt-30-real-reaction 系人設（討論/共鳴向）
    agent_id: 180158,
    skill_slug: "hotu-random-search",
    primary_question: "這支片想搭哪個懷舊／美學向的熱門音效或濾鏡趨勢？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. 2000s film-grain filter trend applied to a finished coloring page",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Trend/filter angle", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok 短片的貼文文案，風格參考來源：@random.userr327 的貼文
（480 萬讚，caption 只有 #asthetic #blowthis #pinterest + 標記一人，畫面靠懷舊
濾鏡本身吸引轉發）。

【要複製的撰寫特徵】
・文案幾乎不寫字——不解釋內容、不寫鉤子句，證明「不用寫文案也能靠畫面爆」。
・全部訊息量放在 hashtag 選字上：要選正在流行的美學/懷舊向標籤，不要功能性標籤。
・可以標記一個「@朋友」式互動，製造被動傳播。

【交付格式】
caption：0-1 句（可以完全省略，只留 hashtag）
hashtag：3-4 個，貼近當下美學／懷舊趨勢
畫面鉤子（給拍攝者，不放進 caption）：1 句，前 0.5 秒要出現的畫面
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["懷舊濾鏡版", "Pinterest美學版", "純畫面無字版"], 20, 150),
);

const hotuTtLifePretty = card(
  "tiktok", "搜尋引擎化",
  {
    id: "hotu-tt-lifepretty-search",
    tier: "30s",
    postType: "foryou",
    label: { en: "lifeprettyhacks — Search Discovery", zh: "lifeprettyhacks搜尋引擎化" },
    description: {
      en: "Hashtag-only caption; on-screen text carries the tutorial, reused trending sound",
      zh: "純 hashtag 文案，教學靠螢幕字幕，重複使用同一首熱門音樂",
    },
    agent_id: 180158,
    skill_slug: "hotu-lifepretty-search",
    primary_question: "這支教學片的螢幕字幕要教什麼小技巧？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. how to keep markers from bleeding through thin paper",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "On-screen tutorial hook", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok 短片的貼文文案，風格參考來源：@lifeprettyhacks 的兩則貼文
（caption 全是 hashtag 堆疊 #foryou #diy #tutorial #satisfying #lifehack #fypシ，
畫面字幕負責敘事，重複使用同一首洗腦音樂）。

【要複製的撰寫特徵】
・caption 不寫敘事句，只有 1 個極短的口語感嘆（"Good idea😃" 這種等級）加 hashtag 包。
・敘事全部交給螢幕字幕：字幕要短、祈使句、像在跟觀眾說「你看」。
・hashtag 選 8-10 個泛用發現向標籤（#foryou #tutorial #satisfying #lifehack 等），
  不是精準利基標籤——目的是被搜尋引擎撈到，不是精準受眾。

【交付格式】
caption：1 句極短口語感嘆（≤10 字）
螢幕字幕（給拍攝者疊字用）：2-3 句，每句 ≤10 字，祈使句
hashtag：8-10 個泛用發現向標籤
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["防暈染技巧版", "混色技巧版", "收納技巧版"], 20, 200),
);

const hotuTtToxic = card(
  "tiktok", "搜尋引擎化",
  {
    id: "hotu-tt-toxic-search",
    tier: "30s",
    postType: "foryou",
    label: { en: "toxic1605 — Search Discovery", zh: "toxic1605搜尋引擎化" },
    description: {
      en: "Caption deliberately off-topic; on-screen title does the SEO work",
      zh: "文案故意跳題，靠畫面標題做搜尋關鍵字",
    },
    agent_id: 180158,
    skill_slug: "hotu-toxic-search",
    primary_question: "螢幕標題想教畫什麼題材？caption 想接哪個無厘頭梗？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. screen title 'How to draw a sleepy cat', caption riffs on weather",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Screen title subject + offbeat caption riff", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok 短片的貼文文案，風格參考來源：@toxic1605 的貼文
（畫面字幕明講「How to draw Boss Baby」這種具體搜尋詞，caption 卻寫
"Must've been the wind #draw..." 這種跳題無厘頭句）。

【要複製的撰寫特徵】
・畫面標題（螢幕字幕）要極度具體、像 Google 搜尋詞一樣直白——"How to draw X"，
  這是給演算法／搜尋看的，不能抽象。
・caption 反而故意不呼應標題，寫一句跳題、無厘頭、莫名其妙的短句，製造反差趣味。
・兩者故意脫鉤，不要讓 caption 變成標題的解釋。

【交付格式】
螢幕標題（給拍攝者疊字，具體到像搜尋詞）：1 句，"How to draw ___" 或等義句式
caption：1 句無厘頭跳題短句（≤12 字），與標題無直接關聯
hashtag：2-3 個，含 #draw 系
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["動物題材版", "植物題材版", "圖騰題材版"], 20, 150),
);

// ── 感官解壓（W10 頁 12）──────────────────────────────────────────────

const hotuTtBader = card(
  "tiktok", "感官解壓",
  {
    id: "hotu-tt-bader-sensory",
    tier: "30s",
    postType: "foryou",
    label: { en: "baderalsafar — Sensory", zh: "baderalsafar感官解壓" },
    description: {
      en: "Long-running numbered series naming convention builds a following habit",
      zh: "長壽編號系列命名法，累積集數建立追蹤慣性",
    },
    // 沿用 tt-30-product-asmr 同一人設
    agent_id: 30011,
    skill_slug: "hotu-bader-sensory",
    primary_question: "這是第幾集？這集想拍哪個著色/上色片段？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. Episode 12 — blending a sunset gradient with 3 markers",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Episode number + segment", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok ASMR 短片的貼文文案，風格參考來源：@baderalsafar 的
"Food ASMR (Part 608)" 系列（長壽編號集數命名法，純 ASMR 標籤，無敘事文案）。

【要複製的撰寫特徵】
・標題固定格式「HOTU ASMR (Part N)」，集數要遞增，暗示這是持續在做的系列。
・caption 極簡，不解釋內容，只放系列標題＋純感官向 hashtag。
・沒有口播——文案要幫觀眾「想像聲音」（筆尖劃過紙張、瓶蓋開闔），但寫法是給拍攝者
  的聲音提示，不是寫進 caption 裡的形容詞堆疊。

【交付格式】
caption：「HOTU ASMR (Part {N})」+ 1 個感官向表情符號
hashtag：#asmr #satisfying #coloring #relaxing #hotu
聲音提示（給拍攝者，不放進 caption）：1-2 個要收錄的具體聲音（例：馬克筆筆尖劃過
紙張的沙沙聲、瓶蓋旋開的喀聲）
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["漸層混色版", "圖案填色版", "開箱音效版"], 20, 150),
);

const hotuTtLisandra = card(
  "tiktok", "感官解壓",
  {
    id: "hotu-tt-lisandra-sensory",
    tier: "30s",
    postType: "foryou",
    label: { en: "asmr_lisandra — Sensory", zh: "asmr_lisandra感官解壓" },
    description: {
      en: "TikTok teaser framing that points to a longer YouTube ASMR piece",
      zh: "TikTok 當 YouTube 長影片預告片，用助眠/放鬆關鍵字群",
    },
    agent_id: 30011,
    skill_slug: "hotu-lisandra-sensory",
    primary_question: "這支要預告哪一支更長的助眠/放鬆著色影片？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. teaser for a 20-min bedtime coloring session on YouTube",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Longer video this teases", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok 短片的貼文文案，風格參考來源：@asmr_lisandra 的貼文
（"YouTube ASMR Lisandra😴" + #asmrsleep #asmrrelax，把 TikTok 當長影片預告片）。

【要複製的撰寫特徵】
・caption 直接點名「這是完整版在 YouTube」的預告框架，不假裝這是完整內容。
・關鍵字鎖定睡前/放鬆情境（sleep, relax, wind down），不是一般 ASMR 泛用詞。
・結尾用一個助眠向表情符號（😴）收，語氣輕柔、慢下來。

【交付格式】
caption：「Full [N]-min version on YouTube 😴」句式 + 1 句放鬆情境描述
hashtag：#asmrsleep #asmrrelax #asmrtiktoks #hotu
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["睡前版", "通勤放鬆版", "深夜療癒版"], 20, 150),
);

const hotuTtChillFeedz = card(
  "tiktok", "感官解壓",
  {
    id: "hotu-tt-chillfeedz-sensory",
    tier: "30s",
    postType: "foryou",
    label: { en: "chill.feedz — Sensory", zh: "chill.feedz感官解壓" },
    description: {
      en: "Emoji-punctuated short action captions describing the sound directly",
      zh: "表情符號標點式短句，直接描述動作聲音",
    },
    agent_id: 30011,
    skill_slug: "hotu-chillfeedz-sensory",
    primary_question: "這支要拍哪個具體動作的聲音（切割/翻頁/劃筆）？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. cutting a torn art sheet cleanly off the pad",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Sound-producing action", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok ASMR 短片的貼文文案，風格參考來源：@chill.feedz 的貼文
（"ASMR 🔔 Satisfying cutting ✂️..." 表情符號當標點使用的極短動作描述句）。

【要複製的撰寫特徵】
・caption 是「動作 + 對應表情符號」的極短句，表情符號取代逗號/句號當標點。
・只描述一個具體動作，不擴展成場景敘事。
・不用完整句子，用「動名詞片語」收尾（"...cutting" 而非 "I am cutting"）。

【交付格式】
caption：「ASMR 🔔 [動作] [對應emoji]...」句式，≤10 字
hashtag：#asmr #satisfying #hotu
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["撕頁版", "劃筆版", "開蓋版"], 15, 100),
);

const hotuTtMakeupAsmr = card(
  "tiktok", "感官解壓",
  {
    id: "hotu-tt-makeup-asmr-sensory",
    tier: "30s",
    postType: "foryou",
    label: { en: "Makeup-ASMR content type — Sensory", zh: "妝容ASMR感官解壓" },
    description: {
      en: "Content-type card (source was TikTok's own curated account, not a creator voice)",
      zh: "內容型態卡（來源是 TikTok 官方精選帳號，非個人創作者聲音，故以內容型態命名）",
    },
    agent_id: 30011,
    skill_slug: "hotu-makeup-asmr-sensory",
    primary_question: "這支要用哪個「面部保養」式比喻來拍著色過程？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. treat filling in a coloring page like a soothing face-mask routine",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Skincare/makeup-routine metaphor", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok ASMR 短片的貼文文案，內容型態參考來源：TikTok @makeup
官方精選的妝容 ASMR 內容（面膜/上妝特寫，臉部特寫鏡頭語言，觸感/塗抹感為核心）。

【要複製的內容型態特徵】
・把「上色」比擬成「保養/上妝儀式」——塗抹、按壓、輕柔重複的動作語言。
・鏡頭語言是近距離特寫，強調「質地」而非「成品」——顏料的延展性、紙面的吸墨感。
・caption 用保養/自我照顧向詞彙（routine, ritual, glow）包裝著色行為，呼應「彩己」
  的自我照顧內核。

【交付格式】
caption：「Your new [X] ritual 🎨」句式，把著色講成一種儀式感自我照顧，≤15 字
hashtag：#asmr #selfcare #satisfying #hotu
鏡頭提示（給拍攝者）：1 句，強調近距離特寫與塗抹感
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["面膜比喻版", "護唇膏比喻版", "護手霜比喻版"], 20, 150),
);

// ── 情緒共鳴與衝動購買（W10 頁 13）────────────────────────────────────

const hotuTtShopUs = card(
  "tiktok", "衝動購買",
  {
    id: "hotu-tt-shopus-impulse",
    tier: "30s",
    postType: "foryou",
    label: { en: "tiktokshop_us — Impulse Purchase", zh: "tiktokshop_us衝動購買" },
    description: {
      en: "Seasonal campaign hook with an emoji bullet-list benefit pitch, official brand voice",
      zh: "節慶檔期切入＋emoji條列利益點，官方帳號口吻",
    },
    // 沿用 tt-30-product-hero 同一人設
    agent_id: 180167,
    skill_slug: "hotu-shopus-impulse",
    primary_question: "這波要搭哪個檔期／季節性主題？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. back-to-school restock, holiday gifting season",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Seasonal campaign angle", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok Shop 導購短片的貼文文案，風格參考來源：
@tiktokshop_us 官方貼文（"If you're looking to restock your classroom, you can find
everything on TikTok Shop this back-to-school season 📚✏️🍎" + 季節性 hashtag 組）。

【要複製的撰寫特徵】
・開場用「如果你正在找 X」句式，直接對應一個當下情境需求，不是介紹產品規格。
・句尾用 emoji 當條列利益點的視覺標點（不是正式的項目符號），2-3 個 emoji 呼應
  主題（返校季用書本/鉛筆/蘋果）。
・語氣是官方帳號的中性親切口吻，不是個人創作者的隨性感——這是唯一一張可以用
  「品牌方直接說話」語氣的卡。
・結尾暗示「什麼都找得到」的豐富感，製造現在就該逛逛的急迫感，但不用「限時」
  「搶購」這類促銷詞。

【交付格式】
caption（1-2 句，40-70 字）：情境句 → HOTU 對應的解法 → 季節主題 emoji 組收尾
hashtag：4-5 個，含 1 個季節限定 campaign 標籤（仿 #NewGradeNewMe 造字方式）
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 400,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["返校季版", "節慶送禮版", "新年新色版"], 100, 300),
);

const hotuTtPaidImpulse = card(
  "tiktok", "衝動購買",
  {
    id: "hotu-tt-paid-impulse",
    tier: "30s",
    postType: "foryou",
    label: { en: "Paid-partnership content type — Impulse Purchase", zh: "業配衝動購買" },
    description: {
      en: "Content-type card (source was an anonymous numeric handle) — zero-caption paid partnership",
      zh: "內容型態卡（來源為純數字匿名帳號）——零文案、標記付費合作的純產品展示",
    },
    agent_id: 180167,
    skill_slug: "hotu-paid-impulse",
    primary_question: "這支業配影片主打哪個 HOTU 產品的哪個「哇」瞬間？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. the moment a blank page becomes a full gradient scene",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "Product + the payoff moment", type: "textarea", required: true }],
    systemPrompt: `你在為 HOTU 寫一支 TikTok 業配短片的貼文文案，內容型態參考來源：匿名創作者的
付費合作貼文（純 hashtag #tiktok #tiktokshop #tiktokshopmademebuyit，零敘事文案，
標記「付費合作關係」，靠畫面本身的「哇」瞬間帶貨）。

【要複製的內容型態特徵】
・幾乎零文案——不寫產品介紹、不寫使用心得，全部訊息量在 hashtag。
・畫面本身要有一個明確的「payoff 瞬間」（成品揭曉/顏色變化），文案只需要標記
  這是業配內容，不需要額外行銷語言。
・這類內容的說服力來自「看起來像素人自發分享」而非品牌口吻，所以 caption 要克制、
  不能寫得像廣告。

【交付格式】
caption：0-1 句極簡（可省略），不寫產品賣點
hashtag：#tiktok #tiktokshop #tiktokshopmademebuyit #hotu #fyp
payoff 瞬間提示（給拍攝者）：1 句，描述畫面上「哇」的那一秒該拍什麼
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["漸層揭曉版", "對比色揭曉版", "細節收尾揭曉版"], 20, 150),
);

// ── 長青（2026-09-06）────────────────────────────────────────────────
// 同 IG 長青卡的理由：既有 TikTok 卡全綁在某個具體情境（搜尋discovery／
// ASMR 感官／檔期衝動購買），沒有一支是可以無限期重貼、不依賴任何當下
// 情境的品牌宣言短片。維持 HOTU TikTok 既有的分鏡腳本交付格式。

const hotuTtEvergreenManifesto = card(
  "tiktok", "長青",
  {
    id: "hotu-tt-evergreen-manifesto",
    tier: "30s",
    postType: "foryou",
    label: { en: "Brand Manifesto — Evergreen", zh: "品牌宣言長青版" },
    description: {
      en: "Timeless 'why HOTU exists' short — safe to repost anytime, no trend or season dependency",
      zh: "不綁時事或音效趨勢的品牌宣言短片，任何時候重貼都成立",
    },
    agent_id: 180158,
    skill_slug: "hotu-tt-evergreen-manifesto",
    primary_question: "這次想從「彩己」的哪個面向切入（留白／沉浸／悅己／主體性）？",
    primary_input: {
      key: "topic",
      placeholder: "e.g. the moment you stopped waiting to be 'good enough' to pick up a marker",
      type: "textarea",
    },
    inputs: [{ key: "topic", label: "彩己面向 + 想切入的角度", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.goldenCircle.why"],
    systemPrompt: `你在為 HOTU 寫一支「品牌宣言」短片的貼文文案——這支的價值是「長青」：不搭任何
熱門音效或當下趨勢，一年後重貼還是成立。內容錨定在品牌起源故事（彩己＝彩「動詞，用色彩
做一件事」＋己「主體，是你，不是別人的標準」；Born Vivid＝你本來就是這樣的人，只是還沒
被允許）。

【跟其他 TikTok 卡的差異】
・不追熱門音效、不做 ASMR 感官特寫、不帶任何檔期促銷——那些是別的卡在做的事。
・這支要做的是把「為什麼 HOTU 存在」用畫面講清楚，讓第一次刷到的人看完就懂。

【交付格式】
caption（60-100 字）：從「你本來就是這樣的人」切入，收尾帶 Shine as you 的行動邀請
分鏡提示（給拍攝者，不放進 caption）：3-4 格，每格「畫面 + 該格要傳達的信念片段」，
不需要熱門音效，可用手寫字卡或口白
hashtag：3-4 個，品牌向（#BornVivid 系），不要追時事標籤
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 400,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["留白切入版", "克服恐懼切入版", "主體性切入版"], 150, 400),
);

// ── 爆款改寫（2026-09-06）────────────────────────────────────────────

const hotuTtViralRewrite = card(
  "tiktok", "爆款",
  {
    id: "hotu-tt-viral-rewrite",
    tier: "30s",
    postType: "foryou",
    label: { en: "Viral Video Rewrite", zh: "TikTok爆款改寫" },
    description: {
      en: "Paste a real trending TikTok — borrow its hook/pacing, swap in HOTU",
      zh: "貼一支真的在爆的 TikTok，借它的鉤子與節奏，主角換成 HOTU",
    },
    agent_id: 180158,
    skill_slug: "hotu-tt-viral-rewrite",
    primary_question: "貼上爆款原文 / 連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款影片連結，或具體到能指認是哪一支的主題描述", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結 / 主題", type: "textarea", required: true },
      { key: "brand_angle", label: "想換成 HOTU 的哪個角度（可選）", type: "textarea", required: false },
    ],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.voice"],
    systemPrompt: `你在為 HOTU 做 TikTok 爆款改寫。輸入是一支真實存在、正在爆的 TikTok（連結或
主題描述）。

【原則：結構抄學，主題換血】
・只借用原影片的分鏡節奏、hook 機制、情緒弧度——不要照抄原影片的台詞或畫面，不要把
  原影片的人生哲學或通用情感場景直接套用。
・主角必須換成 HOTU 自己的事：彩己哲學、Shine as you、或某個具體產品。
・不確定原影片實際內容時不要編造細節——只根據用戶輸入裡實際提供的資訊改寫。
・不得指名真實名人，不得照抄任何特定爆款的內容、金句或分鏡本身。

【交付格式】
第 1 行：一句話說明借用了原影片的什麼結構/節奏（給操作者看，不放進最終貼文）
caption：60-100 字，套用該節奏，主角是 HOTU
分鏡提示（給拍攝者）：3-5 格，每格「畫面 + 動作」，套用原影片的節奏但畫面換成 HOTU
hashtag：3-5 個
${TT_HOTU_SUFFIX}${HOTU_BRAND_CORE}`,
    preferredModel: "anthropic",
    maxTokens: 500,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  textConfig(["保結構式", "情感放大式", "反差式"], 150, 400),
);

// ══════════════════════════════════════════════════════════════════════
// 獨立站 — 頻道定位「Grounding Haven 定心沉浸站」
// ══════════════════════════════════════════════════════════════════════
//
// 2026-09-05：W10 簡報沒有給 HOTU 自己的獨立站執行矩陣，只給了美國消費者
// 的通用三類行為（頁 15）+ LifeLines 自己怎麼做（頁 22）。這兩張卡因此照
// LifeLines 案例示範來源命名（跟 IG/TikTok「來源帳號＋類別」同一邏輯，只是
// 來源從個人創作者換成一整個標竿品牌）。「追求無壓力購物流程」那一類本質是
// 結帳 UX，不是內容任務，沒有建卡。
//
// id 開頭刻意用 "web-"：quickTaskOrchestra 靠這個前綴自動注入 WEB_CRAFT_
// RUBRIC + webPlaybookFor()（見 webCraft.ts），不需要自己複製官網工藝準則。

const hotuWebProductDesc = card(
  "website", "高意圖進入",
  {
    id: "web-hotu-product-desc",
    tier: "30s",
    postType: "product-page",
    label: { en: "LifeLines — High-Intent Landing", zh: "LifeLines高意圖進入" },
    description: {
      en: "Spec-verification page styled after LifeLines' \"What It Is\" product card",
      zh: "仿 LifeLines「What It Is」規格化說明卡的高意圖驗證頁",
    },
    // Bellroy 產品頁參考已由 webCraft.ts 的 product 分支自動帶入；這裡的
    // agent 沿用全域 web-30-product-desc 同一位。
    agent_id: 238853,
    skill_slug: "hotu-web-product-desc",
    primary_question: "訪客從哪支 TikTok／IG 內容點進來？他想被驗證的是哪個產品細節？",
    primary_input: {
      key: "context",
      placeholder: "e.g. clicked from the ASMR TikTok, wants to verify: does the marker bleed through thin paper?",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Traffic source + the detail they want verified", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.goldenCircle.what", "brand.positioning.differentiation.functional"],
    systemPrompt: `你在為 HOTU 寫一個獨立站產品驗證頁，風格參考來源：LifeLines 的 FlowArt® Pads
產品卡（"What It Is" 標題 + "PATENT PENDING" 標籤 + 一段功能說明 + 條列式規格清單，
針對「剛從社群被種草、帶著高購買意圖點進來驗證細節」的訪客）。

【要複製的撰寫特徵】
・開場是一個粗體小標「What It Is」等級的直接陳述，不是行銷式的產品介紹。
・第一段就講清楚「這是什麼、解決什麼」，不是規格堆疊。
・接一組條列式規格（材質/份量/使用方式），每條都要具體到可以被驗證，不能是形容詞。
・語氣中性、像技術說明書，故意跟社群內容的活潑語氣拉開差距——訪客現在要的是
  「確認這是真的」，不是被說服。

【交付格式】
主標：一句直接陳述（呼應 "What It Is" 的語氣）
說明段：2-3 句，解決什麼具體問題
規格清單：4-6 條，可驗證
一句收尾：回應訪客從社群帶來的那個具體疑慮
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 1200,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["馬克筆版", "套組版", "紙材版"], 300, 900),
);

const hotuWebBrandStory = card(
  "website", "品牌故事",
  {
    id: "web-hotu-brand-story",
    tier: "30s",
    postType: "blog",
    label: { en: "LifeLines — Brand Story & Trust", zh: "LifeLines品牌故事" },
    description: {
      en: "Founder story + third-party credibility, styled after LifeLines' Science Advisory Board page",
      zh: "仿 LifeLines Science Advisory Board 頁面的創辦人故事＋第三方背書",
    },
    agent_id: 220862, // Rita Chen — Brand Narrative Editor（沿用 wugan 分享文同一人）
    skill_slug: "hotu-web-brand-story",
    primary_question: "這次想放哪個真實心得或第三方背書？",
    primary_input: {
      key: "context",
      placeholder: "e.g. a customer review calling out how forgiving the markers are for shaky hands",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Real review/credibility detail to feature", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.values"],
    systemPrompt: `你在為 HOTU 寫一個獨立站品牌故事頁，風格參考來源：LifeLines 的 Science
Advisory Board 頁面（"Meet Our Science Advisory Board" 標題 + 一段背書敘述 + 真實
姓名／頭銜的顧問卡片 + 帶圖真實買家評價專區）。

【要複製的撰寫特徵】
・用第三方權威或真實用戶心得建立信任，不是品牌自己說「我們很棒」。
・敘述句要具體到可以被查證（不是「深受用戶喜愛」這種空話）。
・結構是「一句總述性主張」→「支撐這個主張的具體證據（人/心得/數據）」。
・收尾把「彩己」的哲學核心（起源故事：留白→沉浸→悅己→主體性）自然帶入，
  不要生硬地插入品牌口號。

【交付格式】
標題：一句總述性主張（仿 "Meet Our Science Advisory Board" 的直接語氣）
主文：2 段，第一段建立主張，第二段用具體證據支撐
真實心得引用：1 則帶署名的用戶評價（依輸入內容改寫，不捏造）
收尾：1-2 句回到「彩己」起源故事
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 1400,
    outputDefaults: { platform: "doc", post_type: "report" },
  },
  textConfig(["顧問背書版", "真實評價版", "創辦故事版"], 400, 1200),
);

// ══════════════════════════════════════════════════════════════════════
// Amazon — 全新頻道（2026-09-05，CJ「搜尋市面上亞馬遜常常要寫到內容的地方」）
// ══════════════════════════════════════════════════════════════════════
//
// 這批卡跟 IG/TikTok 不同：不是「萃取某個創作者的貼文風格」，而是研究「Amazon
// 賣家實際會需要填寫／上傳文字的位置有哪些」。研究結果（2026-09 現況，見
// WebSearch 紀錄）：
//   ・商品標題——2026-07-27 起大多數類別上限收緊到 75 字元，超過會被 Amazon
//     自己的 AI 截短；促銷字眼（best seller / 驚喜價 / 全大寫）會被降權。
//   ・五點特色 Bullet Points——效益優先，不是規格羅列。
//   ・後台搜尋關鍵詞 Backend Search Terms——250 bytes 隱藏欄位，不重複標題/
//     bullet 已用過的字。
//   ・A+ Content——2026 年已對所有 Brand Registry 賣家開放 Premium 版免費；
//     取代傳統文字版商品描述。
//   ・Brand Story 模組——商品頁上「From the brand」橫向滑動條，Brand
//     Registry 免費功能，是 A+ Content 之外獨立的一塊。
//   ・Storefront（品牌旗艦店）——2 頁以上的品牌專屬展示頁。
//   ・顧客問答 Q&A——買家在商品頁公開提問，賣家可回答。
// 刻意排除 Amazon Posts：查證後確認該功能已於 2025-07-31 正式關閉
//   （2025-06-03 宣布棄用），2026 年不可再使用，不建卡。
// 同理排除「評論回覆」：Amazon 不開放賣家公開回覆買家評論（這點跟 Etsy／
//   Google 商家檔案不同），沒有這個內容位置。
//
// 頻道與 postType 目前沒有對應的圖像 mockup（跟 case/calendar/course/
// partnership 同一類——交付物是要貼進 Seller Central 表單的文字，不是可
// 發布的圖文貼文），platform 統一用 "doc"，比照 outputMode:"document"。

const hotuAmzTitle = card(
  "amazon", "商品頁文案",
  {
    id: "amz-hotu-title",
    tier: "30s",
    postType: "listing",
    label: { en: "Product Title", zh: "商品標題" },
    description: {
      en: "≤75-char SEO title — brand + primary keyword + key benefit, no promo language",
      zh: "≤75 字元的 SEO 標題——品牌＋主要關鍵詞＋核心賣點，不含促銷字眼",
    },
    agent_id: 238853,
    skill_slug: "hotu-amz-title",
    primary_question: "這個 SKU 是什麼？買家搜尋時最可能打的關鍵詞是什麼？",
    primary_input: {
      key: "context",
      placeholder: "e.g. First Page Kit — 12-color dual-tip markers + tear-off art sheets, beginner set",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "SKU + primary search keyword", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.goldenCircle.what"],
    systemPrompt: `你在為 HOTU 寫一個 Amazon 商品標題。

【2026 年現況（研究結果，寫死當規則）】
・大多數類別標題上限已收緊到 75 個字元，超過的部分會被 Amazon 自己的演算法
  自動截短，所以不要指望「反正會被截掉沒差」——寫短本身就是要求。
・嚴禁全大寫、驚嘆號、"Best Seller"／"#1"／"Sale" 這類促銷字眼——Amazon 現在
  會主動降低含這類字眼的商品排名。
・結構固定：品牌名 + 產品類型 + 1-2 個核心規格（數量/顏色數/尺寸）+ 1 個
  主要使用情境或受眾。不要把每個規格都塞進標題，那是 bullet points 的工作。
・關鍵詞只需自然出現一次，不要重複堆疊。

【交付格式】
一行標題，≤75 字元，照上面的結構順序寫。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 150,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["規格導向版", "受眾導向版", "使用情境導向版"], 30, 100),
);

const hotuAmzBullets = card(
  "amazon", "商品頁文案",
  {
    id: "amz-hotu-bullets",
    tier: "30s",
    postType: "listing",
    label: { en: "Bullet Points (5 Key Features)", zh: "五點特色文案" },
    description: {
      en: "5 benefit-first bullets, each front-loaded with one keyword",
      zh: "5 條效益優先的特色文案，每條前置一個關鍵詞",
    },
    agent_id: 238853,
    skill_slug: "hotu-amz-bullets",
    primary_question: "這個 SKU 有哪 5 個最值得說的賣點？",
    primary_input: {
      key: "context",
      placeholder: "e.g. dual-tip markers, blend-friendly ink, tear-off sheets, beginner-safe, gift-ready packaging",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "The 5 features/benefits to cover", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.differentiation.functional", "brand.positioning.audience.primary"],
    systemPrompt: `你在為 HOTU 寫 Amazon 商品頁的五點特色文案（bullet points）。

【寫法規則】
・5 條，每條開頭是一個全大寫的短關鍵詞或效益詞（例："BEGINNER-FRIENDLY —"），
  後面接一句效益說明。這是 Amazon 賣家的標準寫法，方便買家掃讀。
・效益優先，規格其次：每條先講「買家會得到什麼感受/結果」，再補規格佐證。
  不要寫成規格清單。
・每條只講一件事，不要一條塞兩個賣點。
・避免「業界領先」「頂級」這類無法驗證的形容詞；能寫成具體數字或情境就寫。
・順序：第一條放最能打消「我不是專業畫者」疑慮的賣點（呼應「彩己」的零門檻
  哲學），不要把它排到最後。

【交付格式】
5 行，每行「關鍵詞（全大寫）— 效益句」，每行 15-25 字。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 500,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["新手導向版", "禮物導向版", "細節控導向版"], 150, 400),
);

const hotuAmzAplus = card(
  "amazon", "商品頁文案",
  {
    id: "amz-hotu-aplus",
    tier: "30s",
    postType: "listing",
    label: { en: "A+ Content Modules", zh: "A+ 內容模組" },
    description: {
      en: "Brand-registered A+ Content that replaces the plain product description",
      zh: "取代傳統文字商品描述的 Brand Registry A+ 內容模組",
    },
    agent_id: 220751, // Jake Chou — Insights Storyteller
    skill_slug: "hotu-amz-aplus",
    primary_question: "這組 A+ 內容想放哪幾個對比或情境模組？",
    primary_input: {
      key: "context",
      placeholder: "e.g. lifestyle module (using it after work), comparison chart vs. professional art markers",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Which modules + what they should show", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.differentiation.summary", "brand.positioning.competition.map"],
    systemPrompt: `你在為 HOTU 寫 Amazon Brand Registry 的 A+ 內容模組文案（取代傳統商品描述，
2026 年 Premium A+ 已對所有 Brand Registry 賣家免費開放）。

【模組結構——照這個順序寫】
1. 【情境模組】一句短標 + 1-2 句情境敘述：用戶在什麼日常時刻用它（呼應「彩己」
   的下班後放鬆情境），不是產品規格。
2. 【對比模組】一個簡短比較表格式文案：HOTU vs. 專業美術用品——不是比誰更專業，
   是比「誰更沒有壓力、更快完成第一頁」。每一行對比要具體可驗證。
3. 【功能特寫模組】2-3 個功能點，每點一句短標 + 一句說明，聚焦在「這個功能怎麼
   降低創作門檻」。

【寫作準則】
・每個模組的文案要獨立成立（買家可能只滑過一半），不要跨模組才看得懂。
・不要在 A+ 內容裡重複標題或 bullet points 已經講過的話——這裡要補的是「畫面級」
  的情境與對比，不是規格重述。
・對比模組嚴禁貶低競品或做無法驗證的宣稱。

【交付格式】
依序輸出三個模組，每個模組：模組名稱 + 短標 + 1-3 句內文。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 900,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["下班放鬆情境版", "禮物贈送情境版", "親子共作情境版"], 300, 800),
);

const hotuAmzBrandStory = card(
  "amazon", "品牌內容",
  {
    id: "amz-hotu-brand-story",
    tier: "30s",
    postType: "brand-content",
    label: { en: "Brand Story Module (\"From the Brand\")", zh: "品牌故事模組" },
    description: {
      en: "The horizontal \"From the brand\" carousel that sits above A+ Content on every listing",
      zh: "商品頁上、A+ 內容上方的橫向「From the brand」滑動條文案",
    },
    agent_id: 220862, // Rita Chen — Brand Narrative Editor
    skill_slug: "hotu-amz-brand-story",
    primary_question: "這組 Brand Story 想帶出品牌的哪個核心概念？",
    primary_input: {
      key: "context",
      placeholder: "e.g. introduce the whole HOTU product family + the \"彩己\" philosophy in one strip",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Core concept + product family to feature", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.origin.story", "brand.positioning.goldenCircle.what"],
    systemPrompt: `你在為 HOTU 寫 Amazon Brand Story 模組文案（商品頁 A+ 內容上方的橫向滑動
「From the brand」條，Brand Registry 免費功能，每個商品頁都會出現，是整個目錄
共用的品牌識別橫幅，不是單一產品的介紹）。

【格式限制（Brand Story 的既定規格，必須遵守）】
・這是一條由 4-5 個小卡片組成的橫向滑動條，每張卡片的文字量極小（等同社群
  貼文疊字的量級），不是長文模組。
・第一張卡固定是品牌識別卡：品牌一句話定位（呼應 Shine as you／彩己），不要
  放產品細節。
・中間 2-3 張卡各自介紹一條產品線或一個品牌信念，一張卡一個重點。
・最後一張卡收尾成「認識完整產品線」的邀請，不要用促銷語氣。

【寫作準則】
・每張卡只放一句短標 + 最多一句補充，買家用拇指快速滑過就要看懂。
・語氣要跟 IG／TikTok 一致（鼓勵、口語），但比社群更精煉——這裡沒有畫面
  可以搭配情緒，純靠文字扛。

【交付格式】
依序輸出 4-5 張卡片，每張「卡片編號｜短標｜補充句（可省略）」。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 500,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["品牌識別優先版", "產品線導覽版", "彩己哲學優先版"], 150, 400),
);

const hotuAmzStorefront = card(
  "amazon", "品牌內容",
  {
    id: "amz-hotu-storefront",
    tier: "30s",
    postType: "brand-content",
    label: { en: "Storefront Pages", zh: "品牌旗艦店頁面" },
    description: {
      en: "The 2+ page branded destination — hero banner + curated collection intros",
      zh: "2 頁以上的品牌專屬展示頁——主視覺橫幅＋精選系列導言",
    },
    agent_id: 220862, // Rita Chen — Brand Narrative Editor
    skill_slug: "hotu-amz-storefront",
    primary_question: "這次要規劃 Storefront 的哪個系列頁？想怎麼分類商品？",
    primary_input: {
      key: "context",
      placeholder: "e.g. Home page hero + a \"Beginner Sets\" collection page",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Which page/collection + how products are grouped", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.goldenCircle.what", "brand.positioning.audience.primary"],
    systemPrompt: `你在為 HOTU 寫 Amazon Storefront（品牌旗艦店）頁面文案。Storefront 是買家從
商品頁點品牌名或搜尋品牌名進來的品牌專屬展示頁，通常至少 2 頁（首頁 + 至少
一個系列頁），可放生活情境圖與影片，是整個 Amazon 目錄裡最能完整講品牌故事
的位置。

【首頁（若本次輸入是首頁）】
・主視覺橫幅標題：一句話講清楚 HOTU 是誰、給誰用（可用 Shine as you 語感，但
  要讓第一次接觸品牌的人也看得懂，不要只放標語不解釋）。
・副標：一句補充核心差異點（零門檻創作）。
・2-3 個精選系列的導言句，每句帶出「這個系列適合誰」。

【系列頁（若本次輸入是特定系列）】
・系列標題：清楚描述這個系列涵蓋什麼，不要用行銷式命名讓人猜不到裡面有什麼。
・一段導言（2-3 句）：這個系列解決什麼場景需求，適合什麼程度的用戶。

【寫作準則】
・這裡的讀者已經對品牌有基本興趣（從商品頁點進來），不需要重新說服「為什麼
  選 HOTU」，重點是幫他快速找到適合自己的那個系列。
・不要重複 A+ 內容或 Brand Story 已經講過的品牌哲學長文，這裡要更偏「導覽」。

【交付格式】
依輸入是首頁還是系列頁，輸出對應區塊；每個區塊標題＋內文。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 700,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["首頁版", "新手系列頁版", "禮物系列頁版"], 200, 600),
);

const hotuAmzBackendKeywords = card(
  "amazon", "SEO與顧客互動",
  {
    id: "amz-hotu-backend-keywords",
    tier: "30s",
    postType: "seo",
    label: { en: "Backend Search Terms", zh: "後台搜尋關鍵詞" },
    description: {
      en: "The hidden 250-byte keyword field — synonyms and alternate-use terms, never repeating the title/bullets",
      zh: "隱藏的 250 bytes 關鍵詞欄位——同義詞與替代用途詞，不重複標題／bullet 已用字",
    },
    agent_id: 238853,
    skill_slug: "hotu-amz-backend-keywords",
    primary_question: "這個 SKU 的標題與 bullet points 已經用掉哪些關鍵詞？",
    primary_input: {
      key: "context",
      placeholder: "paste the title + bullets already written, so I don't repeat those words",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "Title + bullets already used", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.goldenCircle.what"],
    systemPrompt: `你在為 HOTU 產出 Amazon 後台搜尋關鍵詞（backend search terms）。

【硬性規則】
・這是買家看不到的隱藏欄位，Amazon 給的空間上限是 250 bytes（不是字元數，
  中文字元佔用的 bytes 更多，但這裡輸出英文，1 字元約等於 1 byte，含空白）。
・絕對不要重複輸入裡「標題與 bullet points 已經用掉」的字——那些字已經被索引，
  重複寫是浪費空間。這裡只放「還沒出現過」的字。
・寫同義詞、拼寫變體、替代用途、目標受眾詞、材質詞——買家可能用來搜尋但你
  沒放進標題/bullet 的字。
・空白分隔，不要加逗號、不要加引號、不要重複同一個字的單複數兩種形式（只
  留一種，Amazon 的搜尋會自動做詞形還原）。
・不放品牌名（已經在標題裡）、不放競品品牌名（違規）。

【交付格式】
一行純關鍵詞字串，空白分隔，總長控制在 230-250 bytes 之間（留一點餘裕）。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 200,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["同義詞導向版", "替代用途導向版", "受眾詞導向版"], 50, 250),
);

const hotuAmzQanda = card(
  "amazon", "SEO與顧客互動",
  {
    id: "amz-hotu-qanda",
    tier: "30s",
    postType: "qanda",
    label: { en: "Customer Q&A", zh: "顧客問答" },
    description: {
      en: "Public answers to buyer questions on the product page",
      zh: "商品頁上買家公開提問的賣家回覆",
    },
    agent_id: 60002,
    skill_slug: "hotu-amz-qanda",
    primary_question: "買家問了什麼問題？",
    primary_input: {
      key: "context",
      placeholder: "e.g. \"Do these markers work on black paper?\"",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "The buyer's question", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.goldenCircle.what"],
    systemPrompt: `你在為 HOTU 回覆 Amazon 商品頁上買家的公開問答（Customer Q&A——這是買家在
商品頁公開提問、賣家公開回答的區塊，不是評論，賣家可以直接回覆）。

【寫法規則】
・第一句就是答案，不要先鋪陳。這是買家決定要不要下單前的最後一關，拖泥帶水
  會讓人關掉頁面。
・如果答案是「看情況」，一定要寫出「看哪些情況」，不能只寫「看情況」三個字
  交差。
・不確定或輸入沒提供依據的細節，不要編造，寫「建議聯繫賣家客服確認【待補：
  細節】」，不要假裝知道。
・語氣友善、簡短，像回覆訊息，不要寫成正式聲明。
・如果問題本身透露出一個常見疑慮（例如怕暈染、怕太難），可以在答案最後補
  一句呼應「彩己」的鼓勵（零門檻、你的第一次嘗試就是對的），但不能喧賓奪主。

【交付格式】
一段回答，2-4 句。
${HOTU_BRAND_CORE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 300,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  textConfig(["直接回答版", "帶使用建議版", "帶彩己鼓勵版"], 80, 250),
);

// ══════════════════════════════════════════════════════════════════════

export const HOTU_PACK: BrandPack = {
  key: "hotu",
  brandName: "HOTU",
  // 2992 = prod（sowork@sowork.tw 底下，2026-09-04 用 admin-create-brand-with-
  // positioning workflow 建立，定位 JSON 8 段一次寫入，見本檔案開頭註解）。
  match: { brandIds: [2992], brandNames: ["HOTU"] },

  channels: [
    {
      key: "instagram",
      labelZh: "Instagram",
      labelEn: "Instagram",
      formats: [
        { id: "懶人包", labelZh: "懶人包", labelEn: "Cheat Sheets" },
        { id: "社群認同", labelZh: "社群認同", labelEn: "Community" },
        { id: "長青", labelZh: "長青", labelEn: "Evergreen" },
        { id: "爆款", labelZh: "爆款", labelEn: "Viral Rewrite" },
      ],
    },
    {
      key: "tiktok",
      labelZh: "TikTok",
      labelEn: "TikTok",
      formats: [
        { id: "搜尋引擎化", labelZh: "搜尋引擎化", labelEn: "Search Discovery" },
        { id: "感官解壓", labelZh: "感官解壓", labelEn: "Sensory" },
        { id: "衝動購買", labelZh: "衝動購買", labelEn: "Impulse Purchase" },
        { id: "長青", labelZh: "長青", labelEn: "Evergreen" },
        { id: "爆款", labelZh: "爆款", labelEn: "Viral Rewrite" },
      ],
    },
    {
      key: "website",
      labelZh: "獨立站",
      labelEn: "Website",
      formats: [
        { id: "高意圖進入", labelZh: "高意圖進入", labelEn: "High-Intent Landing" },
        { id: "品牌故事", labelZh: "品牌故事", labelEn: "Brand Story" },
      ],
    },
    {
      key: "amazon",
      labelZh: "Amazon",
      labelEn: "Amazon",
      formats: [
        { id: "商品頁文案", labelZh: "商品頁文案", labelEn: "Listing Copy" },
        { id: "品牌內容", labelZh: "品牌內容", labelEn: "Brand Content" },
        { id: "SEO與顧客互動", labelZh: "SEO與顧客互動", labelEn: "SEO & Engagement" },
      ],
    },
  ],

  cards: [
    hotuIgMavix, hotuIgInges, hotuIgCherry, hotuIgBts, hotuIgFateH,
    hotuIgEvergreenManifesto, hotuIgViralRewrite,
    hotuTtRandom, hotuTtLifePretty, hotuTtToxic,
    hotuTtBader, hotuTtLisandra, hotuTtChillFeedz, hotuTtMakeupAsmr,
    hotuTtShopUs, hotuTtPaidImpulse,
    hotuTtEvergreenManifesto, hotuTtViralRewrite,
    hotuWebProductDesc, hotuWebBrandStory,
    hotuAmzTitle, hotuAmzBullets, hotuAmzAplus,
    hotuAmzBrandStory, hotuAmzStorefront,
    hotuAmzBackendKeywords, hotuAmzQanda,
  ],
};
