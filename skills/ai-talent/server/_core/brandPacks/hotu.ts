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
 *        獨立站  = Grounding Haven 定心沉浸站（尚未建任務卡，見下）
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
 * ── 為什麼沒有獨立站卡 ──────────────────────────────────────────────
 * W10 簡報只給了獨立站的「通用三類行為＋LifeLines 案例示範」，沒有像 IG／
 * TikTok 那樣產出 HOTU 自己的執行矩陣，且其中一類（無壓力購物流程）本質是
 * 網站 UX／結帳流程，不是內容任務卡。等 HOTU 自己的獨立站內容矩陣補齊後
 * 再建。
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
      ],
    },
  ],

  cards: [
    hotuIgMavix, hotuIgInges, hotuIgCherry, hotuIgBts, hotuIgFateH,
    hotuTtRandom, hotuTtLifePretty, hotuTtToxic,
    hotuTtBader, hotuTtLisandra, hotuTtChillFeedz, hotuTtMakeupAsmr,
    hotuTtShopUs, hotuTtPaidImpulse,
  ],
};
