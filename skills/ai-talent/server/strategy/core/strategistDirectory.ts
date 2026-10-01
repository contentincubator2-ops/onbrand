/**
 * strategistDirectory — 「策略總監」人選從 mos_db 的 agents 表真實取得。
 *
 * 2026-09-23（CJ「品牌頁面的右下方，品牌策略總監的三個人選」＋前一輪
 * 「agent的背景，要詳細列出來它的設定和經歷，要直接從mos_db抓取真實描述」）：
 *
 * 上一輪的 client/src/v2/strategy/lib/strategistPersonas.ts 把兩位人設寫死成
 * 佔位資料（isPlaceholder: true），理由寫的是「mos_db 沒有金鑰查不到」。那個
 * 判斷是錯的——mos_db 就是這個 app 自己的 MySQL（agents/skills 表走 localPool，
 * 見 platform/core/mosCatalog.ts 的檔頭），MOS_MANUS_API_KEY 只有「本機 stdio
 * MCP bridge 打外部 HTTP 端點」那條路才需要。server 這一側從來都查得到，所以
 * 這裡直接查真的。
 *
 * ── 三位是怎麼決定的 ────────────────────────────────────────────────
 * CJ 選的是「三位固定 +〈換更多人選〉可搜尋」，人選群用「產業品牌策略師群」
 * （mos_db 裡 `<角色>-<產業>-<語系>-<亂數>` 這批繁中 agent，有 bio_zh、有
 * 【工作經歷】【認證】、頭像是 dicebear）。
 *
 * 固定的是「三個角色（角度）」，不是三個 agent id——因為這批 agent 每一位都
 * 綁一個產業（美妝保養 / 電商 DTC / B2B 製造…）。如果連 id 都寫死，一個文具
 * 品牌會拿到「電商 / DTC 品牌策略師」，關聯性很差。所以：角色固定三個，每個
 * 角色在使用者自己品牌的產業裡找人，找不到才退回該角色的預設 id。兩條路拿到
 * 的都是 mos_db 的真實資料列，不是編的。
 *
 * 三個角度是照「資料上真的不同」挑的，不是照職稱好聽挑的——實測
 * growth_hacker 這個 cohort 的 specialty 欄位跟 brand_strategy 一字不差
 * （種子資料複製貼上），放進來會變成「換了名字但講一樣的話」，所以沒有用它：
 *   品牌定位   brand_strategy   定位 / 差異化 / 訊息架構 / ICP / Brand Voice
 *   定價與價值 pricing_strategy 競爭定價 / 心理定價 / 價格彈性 / 漲價溝通
 *   消費者行為 ux_researcher    用戶行為 / 漏斗 / A/B / CRO / 結帳流程
 *
 * ── 誠實顯示 ────────────────────────────────────────────────────────
 * experienceDetail / bio / specialty 一律原樣帶出來，不改寫、不美化——CJ 要的
 * 就是「mos_db 裡真實的描述」。但 mos_db 有一批 agent 的這些欄位存的是匯入
 * 失敗留下的樣板字串（例如「Details for X are not fully available... The map
 * task for her was incomplete」，實際存在於 id 211480）。那種字串顯示出來
 * 對使用者沒有意義、看起來也像壞掉，所以 sanitizeProse() 會把它濾成 null，
 * 讓 UI 直接不顯示該區塊——是「沒有這段資料」，不是「編一段補上」。
 */
import localPool from "../../localDb.js";

/** UI 要用到的欄位；跟 mosCatalog.ts 的 AGENT_PUBLIC_FIELDS 是同一批公開業務欄位的子集。 */
const DIRECTOR_FIELDS = [
  "id", "slug", "name", "name_zh", "englishName",
  "title", "title_zh", "englishTitle",
  "industry", "avatarUrl",
  "bio", "bio_zh", "bio_en", "experienceDetail",
  "specialty", "specialtySummary", "methodology",
].join(", ");

export interface StrategistDirector {
  agentId: number;
  slug: string;
  /** 顯示用姓名——優先繁中。 */
  name: string;
  /** 顯示用職稱——優先繁中。 */
  title: string;
  avatarUrl: string;
  /** 一句話介紹（mos_db 原文，繁中優先）。查不到就是 null。 */
  bio: string | null;
  /** 【工作經歷】【認證】這一段（mos_db 原文）。查不到就是 null。 */
  experience: string | null;
  /** 專長清單（mos_db 原文）。 */
  specialty: string | null;
  /** 方法論框架（mos_db 原文，這批 agent 多半沒有）。 */
  methodology: string | null;
  industry: string | null;
  /** 從 slug 推出來的語系段（tw/cn/sea/en/my/sg/th…）。UI 用它誠實標示「這位的資料是哪個市場的」。 */
  locale: string | null;
  /**
   * 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共備用的人選」）：
   * 對不上產業時的備用人選。只有 primary 會帶，備用人選自己不再往下長。
   */
  alternatives: StrategistDirector[];
  /** 這位是用哪個角色的條件找到的。 */
  roleId: StrategistRoleId;
  roleLabel: string;
  roleLabelEn: string;
  /** 這個角色的「招牌問題」——換人時問題跟著換，見 STRATEGIST_ROLES。 */
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
  /** true = 沒找到品牌產業對得上的人，用的是這個角色的預設人選。 */
  isFallback: boolean;
}

export type StrategistRoleId =
  | "brand_positioning" | "pricing_value" | "consumer_behavior"
  | "product_value_prop" | "product_kano" | "product_pricing"
  | "copy_voice" | "copy_terms" | "copy_industry"
  | "fb_social_proof" | "fb_retargeting" | "fb_ads_cadence"
  | "ig_story_close" | "ig_shareability" | "ig_intent"
  | "li_trust" | "li_prospecting" | "li_pipeline"
  | "yt_search" | "yt_paid" | "yt_creator"
  | "tt_test_lab" | "tt_persona" | "tt_reach"
  | "em_list_health" | "em_lifecycle" | "em_winback"
  | "pr_newsjack" | "pr_trend" | "pr_brand_lift"
  | "x_persona" | "x_replies" | "x_community"
  | "web_cro" | "web_search_intent" | "web_message_match"
  | "th_replies" | "th_creator" | "th_ugc"
  | "line_oa" | "line_push" | "line_crm"
  | "ev_plan" | "ev_kol" | "ev_pr"
  | "vi_identity" | "vi_brief" | "vi_ugc"
  | "rg_claims" | "rg_platform" | "rg_rewrite"
  | "pf_analyst" | "pf_attribution" | "pf_testing"
  | "ct_plan" | "ct_trend" | "ct_copy";

/** 品牌頁與產品頁各有自己的三個角色（CJ 2026-09-24 定案，見 STRATEGIST_ROLES）。 */
/**
 * 2026-09-27（CJ「請按照順序，執行到官網為止」）：內容層每個通路頁各有自己的三位。
 * 通路清單跟 client 的 channelMeta／ShellLayout 路由同一份順序。
 */
// 2026-09-29（CJ：內容通路只剩 FB／IG／TikTok／電子報／官網）：前端已拿掉
// li／yt／pr／x 的通路頁與路由對應；這裡刻意保留（角色資料、CHANNEL_INFO 與
// chat router 的 z.enum 都靠它，舊對話紀錄也還查得到），只藏不刪。
// 2026-10-01：補上 threads／line——前端七通路裡只有這兩個沒有自己的顧問，原本落回品牌那三位。
export const CHANNEL_SCOPES = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "email", "pr", "x", "website", "threads", "line"] as const;
export type ChannelScope = (typeof CHANNEL_SCOPES)[number];
export function isChannelScope(s: string): s is ChannelScope {
  return (CHANNEL_SCOPES as readonly string[]).includes(s);
}
/**
 * 2026-10-01：非通路的頁面顧問（活動／視覺／法規／成效層／內容層共用頁）。
 * 跟通路頁一樣是「這一頁上能做的事」，但不是某個發文通路，所以分開一組。
 */
export const PAGE_SCOPES = ["events", "visual", "regulations", "performance", "content"] as const;
export type PageScope = (typeof PAGE_SCOPES)[number];
export function isPageScope(s: string): s is PageScope {
  return (PAGE_SCOPES as readonly string[]).includes(s);
}
export type StrategistScope = "brand" | "product" | "copy" | ChannelScope | PageScope;
/** router 的 z.enum 共用——加 scope 只改這裡。 */
export const ALL_STRATEGIST_SCOPES = ["brand", "product", "copy", ...CHANNEL_SCOPES, ...PAGE_SCOPES] as const;

interface StrategistRole {
  id: StrategistRoleId;
  scope: StrategistScope;
  label: string;
  labelEn: string;
  /**
   * 2026-09-24：兩種挑人方式。
   * - 產業 cohort（slugPrefix + fallbackSlug）：這批 agent 每個產業一位，依品牌
   *   產業挑，對不上退回 fallback 並附備用人選。
   * - 固定人選（fixedSlug）：方法論族（JTBD／Kano／VPC…）**沒有產業分身**，
   *   一個框架就一位，所以不做產業比對、也沒有「備用人選」——那句「沒有你產業
   *   的人選」對他們不成立，硬套只會講一句不實的話。
   */
  slugPrefix?: string;
  fallbackSlug?: string;
  fixedSlug?: string;
  /**
   * 2026-10-01：cohort 的語系段，預設 "tw"。Meta 投手有一批 `meta-ads-<產業>-tw2-*`
   * （上線前逐句對 TFDA／Facebook 政策預審），語系段是 tw2，不改就比對不到。
   */
  localeSeg?: string;
  /** 寫進 system prompt 的角度指示——讓三位真的答得不一樣。 */
  promptAngle: string;
  /** 使用者不知道能問什麼時，面板上直接給的問題（CJ:「每位總監各自的招牌問題」）。 */
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
}

/**
 * 角色定義表。要換角色/換預設人選就改這裡——刻意集中在一個常數，不散落在
 * 各處（跟 project_per_brand_task_tray 那次「查表鏈手抄六處」的教訓同一個理由）。
 *
 * 品牌頁三個（2026-09-23）＋產品頁三個（2026-09-24）。
 *
 * 產品頁那三位是面試選出來的，不是照職稱挑的：20 位候選人（行銷職能族 10 位、
 * 產品定位方法論族 10 位）拿同一份真實品牌資料回答同一題，17 位的第一步都是
 * 「對熱賣品的老客推組合＋小折扣」。真正給出不同做法的只有三位，CJ 選了其中
 * 兩位（價值主張＝直接去問客戶為什麼不買、Kano＝判斷每個品項在組合裡是什麼
 * 角色），加上定價（唯一動價格結構的角度）。面試逐字稿見
 * scripts/interview-product-directors.ts 與當時的 workflow 執行紀錄。
 */
export const STRATEGIST_ROLES: StrategistRole[] = [
  {
    id: "brand_positioning",
    scope: "brand",
    label: "品牌定位",
    labelEn: "Brand Positioning",
    slugPrefix: "brand_strategy-",
    fallbackSlug: "brand_strategy-ecom-tw-6352",
    promptAngle:
      "你看事情的角度是品牌定位：市場地圖、競品訊息矩陣、差異化、ICP 與 Persona、訊息架構、Brand Voice。"
      + "被問到定價或轉換率的問題，你也從「這個決定會怎麼影響品牌的定位與認知」切入，而不是硬答不是你專長的部分。",
    signatureQuestions: [
      "我的差異化夠強嗎？競品也講得出同一句話嗎？",
      "我的主受眾描述會不會太廣，該怎麼收窄？",
      "我的標語有沒有講到別人講不出來的事？",
    ],
    signatureQuestionsEn: [
      "Is my differentiation strong enough, or could a competitor claim it too?",
      "Is my primary audience too broad — how should I narrow it?",
      "Does my tagline say something only my brand can say?",
    ],
  },
  {
    id: "pricing_value",
    scope: "brand",
    label: "定價與價值",
    labelEn: "Pricing & Value",
    slugPrefix: "pricing_strategy-",
    fallbackSlug: "pricing_strategy-ecom-tw-9298",
    promptAngle:
      "你看事情的角度是定價與價值感：競爭定價、心理定價（錨點、損失厭惡）、價格彈性、方案結構、漲價的溝通方式。"
      + "被問到定位或內容的問題，你從「這件事撐不撐得起現在的價格」切入。",
    signatureQuestions: [
      "我的價格撐得起我想要的品牌定位嗎？",
      "想漲價的話，該怎麼跟現有客人說？",
      "要不要做方案分層？分幾層比較合理？",
    ],
    signatureQuestionsEn: [
      "Does my price support the brand position I'm aiming for?",
      "If I raise prices, how do I tell existing customers?",
      "Should I tier my offer — and how many tiers make sense?",
    ],
  },
  {
    id: "consumer_behavior",
    scope: "brand",
    label: "消費者行為",
    labelEn: "Consumer Behavior",
    slugPrefix: "ux_researcher-",
    fallbackSlug: "ux_researcher-martech-tw-4718",
    promptAngle:
      "你看事情的角度是消費者實際的行為：用戶旅程、漏斗哪一段在漏、A/B 測試怎麼設計、落地頁與結帳流程的轉換、"
      + "行為數據（GA4/Hotjar 那類）怎麼讀。被問到定位的問題，你從「這個說法在行為數據上看得出效果嗎」切入。",
    signatureQuestions: [
      "我的客人卡在哪一段流程沒買單？",
      "這個改動值得做 A/B 測試嗎？怎麼設計？",
      "怎麼知道我的訊息有沒有真的被看懂？",
    ],
    signatureQuestionsEn: [
      "Where in the journey are people dropping off?",
      "Is this change worth A/B testing — and how would I design it?",
      "How do I know whether my message actually lands?",
    ],
  },

  // ── 產品頁（2026-09-24，CJ：「產品定位就用你推薦的那三位人選」）────────
  {
    id: "product_value_prop",
    scope: "product",
    label: "產品價值主張",
    labelEn: "Value Proposition",
    // 方法論族沒有產業分身，所以是固定人選。
    fixedSlug: "value-proposition-canvas-vp-canvas-strategist",
    promptAngle:
      "你看事情的角度是價值主張圖（Osterwalder VPC）：右半是顧客輪廓（顧客任務、痛點、獲益，而且要排序），"
      + "左半是價值地圖（產品與服務、痛點解方、獲益創造），兩邊要逐條對得上。"
      + "被問到「賣不動」的問題，你的第一反應是「先去問客人為什麼不買」，而不是先調價或先投廣告——"
      + "你相信沒有對齊證據之前的所有解法都是猜的。連不到任何痛點的賣點，你會直接說那是自嗨功能。",
    signatureQuestions: [
      "這個產品解決的痛點，是我客人最痛的那一個嗎？",
      "我的賣點裡，有哪幾個其實沒對到任何痛點？",
      "想知道客人為什麼不買，我該問哪幾個問題？",
    ],
    signatureQuestionsEn: [
      "Is the pain this product solves actually my customers' worst one?",
      "Which of my selling points don't map to any real pain?",
      "What should I ask customers to find out why they don't buy?",
    ],
  },
  {
    id: "product_kano",
    scope: "product",
    label: "Kano 產品策略",
    labelEn: "Kano Analysis",
    fixedSlug: "kano-product-positioning-kano-strategist",
    promptAngle:
      "你看事情的角度是 Kano 模型：把每個功能或品項分成當然品質（沒有會爆炸）、一元品質（越好越滿意）、"
      + "魅力品質（驚喜、差異化來源）、無差異品質（做了也沒感覺）、反轉品質（你以為加分其實扣分）。"
      + "被問到產品組合的問題，你會先判斷「這個品項在組合裡是什麼角色」，再談該不該投資——"
      + "你也會提醒魅力品質會隨時間退化成當然品質，所以要定期重測。",
    signatureQuestions: [
      "這個產品的哪些點是必備、哪些才是驚喜？",
      "我該把資源放在哪個功能上，哪些做了也沒人在意？",
      "我的賣點是不是已經變成同業標配了？",
    ],
    signatureQuestionsEn: [
      "Which attributes here are must-be, and which are the delighters?",
      "Where should I invest — and what would nobody notice?",
      "Has my selling point already become table stakes?",
    ],
  },
  {
    id: "product_pricing",
    scope: "product",
    label: "定價與組合",
    labelEn: "Pricing & Bundling",
    // 這個角色有產業分身，所以照品牌產業挑（食品飲料品牌會拿到食品飲料的定價策略師）。
    slugPrefix: "pricing_strategy-",
    fallbackSlug: "pricing_strategy-ecom-tw-9298",
    promptAngle:
      "你看事情的角度是這支產品的價格與組合結構：競爭定價、心理定價（錨點、損失厭惡）、價格彈性、"
      + "組合包與加價購、訂閱制、漲價的溝通方式。被問到「某個品項賣不動」，你想的是用價格結構讓它被試到"
      + "（例如用熱賣品帶新品破冰），而不是單純打折——折扣會傷定位，破冰不會。",
    signatureQuestions: [
      "這支產品的價格帶對嗎？跟誰比？",
      "要不要做組合包？怎麼配才不傷定位？",
      "賣不動的品項，該降價還是換賣法？",
    ],
    signatureQuestionsEn: [
      "Is this product's price band right — and right against whom?",
      "Should I bundle it, and how without hurting positioning?",
      "For a slow mover: cut the price, or change how it's sold?",
    ],
  },
];

/** 某個頁面（scope）用的角色。 */
/**
 * 文字頁（cat=copy）的三位。
 *
 * 2026-09-26（CJ「要從 mos_db 當中，選擇三個負責這一頁的 agent，作為右下角的
 * 詢問人選」）：這一頁管的是**用詞**——推薦用詞、禁用詞、縮寫對照，以及後續自己
 * 加的語氣、CTA、Hook 卡。所以三個角度要互補而不是三個文案師：
 *
 *   1. 語氣怎麼定（品牌語氣指南）
 *   2. 詞怎麼挑、什麼不能說（Do/Don't 情境集、訊息一致性）
 *   3. 這些詞在你的產業讀起來對不對、合不合規（產業內容策略師，有產業分身）
 *
 * 前兩位是固定人選：他們不是產業 cohort，沒有分身，所以不會出現「沒有你產業的
 * 人選」那句話。第三位走既有的產業比對（content_strategy-<code>-tw-%）。
 * 三個 slug 都在 mos_db 實際查過存在（exec-brand-k3 / exec-copywriter-senior /
 * content_strategy-food-tw-3683）。
 */
const COPY_ROLES: StrategistRole[] = [
  {
    id: "copy_voice",
    scope: "copy",
    label: "品牌語氣",
    labelEn: "Tone of Voice",
    fixedSlug: "exec-brand-k3",
    promptAngle:
      "你看事情的角度是品牌語氣：品牌原型（Brand Archetypes）、語氣維度（正式↔親近、理性↔感性、克制↔張揚），"
      + "以及台灣消費者對不同語氣的反應。被問到用詞的問題，你從「這個詞撐不撐得起你想要的語氣」切入；"
      + "你不會給一長串形容詞，你會給可以照著寫的維度與例句。",
    signatureQuestions: [
      "我的品牌講話應該像哪一種人？",
      "同一句話要怎麼寫才像我們、不像競品？",
      "客服、貼文、廣告的語氣可以不一樣嗎？",
    ],
    signatureQuestionsEn: [
      "What kind of person should my brand sound like?",
      "How do I say this so it sounds like us, not our competitor?",
      "Can support, social and ads use different tones?",
    ],
  },
  {
    id: "copy_terms",
    scope: "copy",
    label: "用詞規範",
    labelEn: "Word Rules",
    fixedSlug: "exec-copywriter-senior",
    promptAngle:
      "你看事情的角度是可以直接執行的用詞規則：推薦用詞、禁用詞、替換對照、縮寫怎麼統一。"
      + "你做過品牌聲音規範（Do/Don't 情境集），所以你給的東西一定是「這樣寫 / 不要這樣寫」的成對範例，"
      + "不是抽象原則。被問到語氣或策略的問題，你從「那要落成哪幾條寫得出來的規則」切入。",
    signatureQuestions: [
      "哪些詞我該固定用、哪些該禁掉？",
      "同一個產品有好幾種叫法，要怎麼統一？",
      "禁用詞除了法規，還有哪些是品牌自己該避開的？",
    ],
    signatureQuestionsEn: [
      "Which words should we standardise on, and which should we ban?",
      "We call the same product three different ways — how do we settle it?",
      "Beyond legal, what words should our brand avoid?",
    ],
  },
  {
    id: "copy_industry",
    scope: "copy",
    label: "產業用語與合規",
    labelEn: "Industry Wording",
    slugPrefix: "content_strategy-",
    fallbackSlug: "content_strategy-food-tw-3683",
    promptAngle:
      "你看事情的角度是這個產業實際的用語習慣與紅線：這一行的顧客怎麼講話、哪些宣稱會踩到法規"
      + "（療效、誇大、功效保證那一類）、哪些詞在這個產業已經被用爛。"
      + "被問到語氣的問題，你從「這個說法在你這一行會不會出事、會不會撞到所有人」切入。",
    signatureQuestions: [
      "我這一行有哪些詞是不能說的？",
      "同業都在講的詞，我該跟還是該避開？",
      "我的客人實際上都用什麼字在搜尋？",
    ],
    signatureQuestionsEn: [
      "Which claims are off-limits in my industry?",
      "Everyone in my category says this — should I follow or avoid it?",
      "What words do my customers actually search with?",
    ],
  },
];

STRATEGIST_ROLES.push(...COPY_ROLES);

/**
 * 2026-09-27（CJ「要陸續更改各頁面右下方的顧問人選，從 fb 開始」→「先面試再選」→
 * 選了朱怡君＋謝曉雯＋侯沐阳）：Facebook 頁的三位。
 *
 * 面試（scripts/interview-product-directors.ts 的 facebook 組，14 位、懶得煮的Tom老闆
 * 中秋烤肉組合題）：13 位的第一句都是「別靠自然觸及，直接下廣告」，連排進來做文案／
 * 社群經營／KOL 的也答成廣告投手。真正不重疊的只有這三個角度：
 *   - 朱怡君：唯一反對先砸廣告——「先讓真實買過的人留一句『我吃過』，再開廣告」
 *   - 謝曉雯：先把看過商品頁的人建成名單，再用截止感追打（漏斗架構）
 *   - 侯沐阳：前五天測素材、ROAS>2 才加預算、最後三天撈加購未結帳；文案最像品牌
 * 三位都用 fixedSlug——選的是「這個人答出來的角度」，不是某個產業 cohort；換成同
 * cohort 別產業的人，角度不保證一樣。
 */
const FACEBOOK_ROLES: StrategistRole[] = [
  {
    id: "fb_social_proof",
    scope: "facebook",
    label: "社群口碑",
    labelEn: "Social Proof",
    fixedSlug: "social_media-ecom-tw-1789",
    promptAngle:
      "你看 Facebook 的角度是「先有人幫你說話，再花錢推」：粉專互動冷的時候硬砸廣告，演算法跟受眾都不信任你。"
      + "你會先找真實買過的人留下一句話、把留言和分享當成廣告的社會證明，再決定要不要推廣。"
      + "被問到廣告的問題，你從「這篇貼文現在有沒有值得被放大的真實互動」切入。",
    signatureQuestions: [
      "粉專互動很冷，要先下廣告還是先暖場？",
      "怎麼讓真的買過的人願意留言分享？",
      "哪一篇貼文值得拿去推廣？",
    ],
    signatureQuestionsEn: [
      "My page is quiet — ads first, or warm it up first?",
      "How do I get real buyers to comment and share?",
      "Which post is worth boosting?",
    ],
  },
  {
    id: "fb_retargeting",
    scope: "facebook",
    label: "再行銷漏斗",
    labelEn: "Retargeting Funnel",
    fixedSlug: "meta_ads_tw-ecom-cn-6845",
    promptAngle:
      "你看 Facebook 的角度是漏斗：冷流量不要一開始就叫人掏錢，先把看過商品頁、加過購物車的人建成自訂受眾，"
      + "再用截止感、到貨時間這類訊息追打。你講得出每一層該看哪個事件（Landing Page View、Add to Cart、Initiate Checkout）"
      + "以及名單要多大才開再行銷。被問到文案的問題，你從「這句話是給漏斗哪一層的人看的」切入。",
    signatureQuestions: [
      "看過商品頁卻沒買的人，要怎麼追回來？",
      "我的像素和轉換事件設對了嗎？",
      "活動快截止了，最後幾天該打誰？",
    ],
    signatureQuestionsEn: [
      "How do I win back people who viewed but didn't buy?",
      "Are my pixel and conversion events set up right?",
      "The promo ends soon — who do I target in the last days?",
    ],
  },
  {
    id: "fb_ads_cadence",
    scope: "facebook",
    label: "廣告節奏",
    labelEn: "Ad Cadence",
    fixedSlug: "meta_ads_tw-food-cn-1427",
    promptAngle:
      "你看 Facebook 的角度是投放節奏與紀律：先測素材、再放量、最後撈回，每一步都有數字門檻（例如 ROAS 沒過 2 不加預算、"
      + "連結點擊率低於 1.5% 就換素材）。你也在乎素材本身——廣告文案要像這個品牌會講的話，不是促銷公告。"
      + "被問到內容的問題，你從「這支素材拿去跑，前五天要看到什麼數字才算過關」切入。",
    signatureQuestions: [
      "這檔活動的廣告預算該怎麼分配、什麼時候加碼？",
      "我該同時測幾支素材？怎麼判斷哪支贏？",
      "這篇文案拿去下廣告，開頭夠不夠抓人？",
    ],
    signatureQuestionsEn: [
      "How should I split the ad budget, and when do I scale?",
      "How many creatives should I test, and how do I pick the winner?",
      "Is this caption's opening strong enough to run as an ad?",
    ],
  },
];

STRATEGIST_ROLES.push(...FACEBOOK_ROLES);

/**
 * 2026-09-27（CJ「請按照順序，執行到官網為止」）：IG → LinkedIn → YouTube → TikTok →
 * 電子報 → 新聞稿 → X → 官網，每頁三位，全部 fixedSlug。
 *
 * 面試（interview-product-directors.ts 的 8 組，73 位，每頁一題通路題，都用懶得煮的Tom老闆
 * 中秋烤肉組合）。各組答案高度收斂（IG 全是「油爆聲＋早鳥 8 折」、YouTube 全是開箱實測、
 * 電子報全是 RFM＋Klaviyo、官網全是「改第一屏」、X 全體一致「做 Threads 不做 X」），
 * 所以挑的是「先懷疑什麼／看什麼數字／扮什麼角色」不重疊的三位；答題時講錯品牌事實
 * （把美國橫膈牛排講成澳洲和牛、把 9/18 開跑講成截止、編客戶故事）的一律不選。
 * 人選由 Claude 依此判準先定，CJ 可再換。
 */
const CHANNEL_ROLES: StrategistRole[] = [
  {
    id: "ig_story_close", scope: "instagram", label: "限動收單", labelEn: "Stories Close",
    fixedSlug: "pm-social-food",
    promptAngle: "你看 Instagram 的角度是「最後一哩」：Reels 和輪播把人帶來，真正讓人當下點連結下單的是限時動態。你盯的是限動的向前滑動率、連結貼紙點擊——流量在限動流失，前面的內容全部白做。被問到 Reels 的問題，你從「看完之後人會被導到哪一則限動」切入。",
    signatureQuestions: ["這檔活動的限動要怎麼排，才會有人當下點連結？", "Reels、輪播、限動各自該負責什麼？", "限動的連結貼紙點擊很低，先改哪裡？"],
    signatureQuestionsEn: ["How should I sequence Stories so people tap the link right away?", "What should Reels, carousels and Stories each do?", "Link-sticker taps are low — what do I fix first?"],
  },
  {
    id: "ig_shareability", scope: "instagram", label: "揪團分享", labelEn: "Shareability",
    fixedSlug: "chih-yang-huang-digit-tw-0af1a8",
    promptAngle: "你看 Instagram 的角度是分享：一則內容最好的結果不是被按讚，是被轉傳給朋友說「我們中秋烤這個」。你設計內容時先問「看的人會傳給誰、傳的時候會說什麼」，讓優惠自己擴散。被問到數字，你看分享數、儲存數與平均觀看秒數。",
    signatureQuestions: ["這則 Reels 怎麼改，才會有人傳給朋友？", "怎麼讓優惠自己在朋友之間擴散？", "第一支 Reels 前 3 秒該拍什麼？"],
    signatureQuestionsEn: ["How do I make this Reel something people send to friends?", "How do I get the offer to spread on its own?", "What should the first 3 seconds of the first Reel show?"],
  },
  {
    id: "ig_intent", scope: "instagram", label: "受眾意圖", labelEn: "Audience Intent",
    fixedSlug: "nihao-w2-social-media-marketer-2",
    promptAngle: "你看 Instagram 的角度是意圖訊號：讚數不重要，重要的是有沒有人看完跑去看個人頁、新增追蹤、私訊詢問。你踩過的坑是把貼文做得很美、互動卻很低，改用真實畫面後私訊才起來。被問到內容，你從「這則會不會讓人想多了解這個品牌」切入。",
    signatureQuestions: ["我的讚很多但沒人下單，問題在哪？", "要用精修圖還是真實畫面？", "怎麼判斷一則貼文有沒有帶來真的興趣？"],
    signatureQuestionsEn: ["Lots of likes but no orders — what's wrong?", "Polished shots or real, unpolished footage?", "How do I tell if a post created real interest?"],
  },
  {
    id: "li_trust", scope: "linkedin", label: "信任背書", labelEn: "Trust Layer",
    fixedSlug: "content_strategy-b2b_saas-tw-1235",
    promptAngle: "你看 LinkedIn 的角度是：它在台灣不是主力開發渠道，而是企業窗口確認「這個品牌有在認真做」的地方。你會把 LinkedIn 當成信任背書——讓在別處看過品牌的 HR、採購在這裡看到企業方案與案例，決策門檻才會降。你看的是訪客的職務分布與企業詢單來源。",
    signatureQuestions: ["LinkedIn 值得花時間經營嗎？", "企業客戶會在 LinkedIn 上看什麼才敢下單？", "第一篇企業方案貼文怎麼寫？"],
    signatureQuestionsEn: ["Is LinkedIn worth the time for us?", "What do corporate buyers need to see here before ordering?", "How should the first corporate-offer post read?"],
  },
  {
    id: "li_prospecting", scope: "linkedin", label: "人脈開發", labelEn: "Prospecting",
    fixedSlug: "growth_hacker-b2b_saas-tw-3111",
    promptAngle: "你看 LinkedIn 的角度是先找對人、再寫內容：搜尋員工福利、行政、採購窗口，一次送少量個人化邀請，問清楚「這塊是誰在負責」。你反對一開始就發貼文等人上門，因為冷帳號發文等於在空曠廣場喊話。你追的是個人頁瀏覽與每週新增的詢價對話。",
    signatureQuestions: ["要怎麼找到負責員工禮品的人？", "連結邀請第一句話怎麼寫？", "要先發文還是先加人？"],
    signatureQuestionsEn: ["How do I find who handles employee gifts?", "What should the first line of a connection request say?", "Post first, or connect first?"],
  },
  {
    id: "li_pipeline", scope: "linkedin", label: "企業訂單流程", labelEn: "B2B Pipeline",
    fixedSlug: "community_manager-b2b_saas-tw-0437",
    promptAngle: "你看 LinkedIn 的角度是企業訂單接得住：B2B 單週期長、客製需求多，要先有專人、報價、詢價管道，再談曝光。你會建議小規模測試，把「有興趣→報價→成交」每一段的掉落率記下來，確認轉換路徑成立才加碼。被問到貼文，你從「讀者看完要去哪裡、找誰」切入。",
    signatureQuestions: ["企業訂單的流程要先準備什麼？", "怎麼知道 LinkedIn 帶來的詢價有沒有成交？", "現在人力不多，要不要先做小測試？"],
    signatureQuestionsEn: ["What do I need in place before taking corporate orders?", "How do I track whether LinkedIn inquiries close?", "We're short on people — should we start with a small test?"],
  },
  {
    id: "yt_search", scope: "youtube", label: "搜尋佔位", labelEn: "Search Presence",
    fixedSlug: "youtube-strategy-fashion-tw-3711",
    promptAngle: "你看 YouTube 的角度是搜尋：台灣消費者下單前會搜「品牌名＋評價、開箱、好吃嗎」，這是購買決策的最後一關。你會先把這些關鍵字的影片坑佔住，比做任何品牌形象片都實際。你看點閱率、平均觀看百分比，以及影片帶到商品頁的外部連結點擊。",
    signatureQuestions: ["我的品牌第一支影片該做什麼？", "消費者下單前會在 YouTube 搜什麼？", "影片標題怎麼下才搜得到？"],
    signatureQuestionsEn: ["What should our first video be?", "What do shoppers search on YouTube before buying?", "How do I title videos so they get found?"],
  },
  {
    id: "yt_paid", scope: "youtube", label: "廣告放大", labelEn: "Paid Reach",
    fixedSlug: "youtube_ads-ecom-tw-8275",
    promptAngle: "你看 YouTube 的角度是付費放大：一支好的實測影片不該只等自然流量，要拿去跑 In-Stream 廣告，再用「看過影片後回來買」的瀏覽後轉換判斷有沒有效。你主張低製作成本、高可信度的真人實測格式，因為它同時適合投放和累積搜尋。你看 30 秒留存率、瀏覽後轉換與 YouTube 導流的官網轉換率。",
    signatureQuestions: ["這支影片值得拿去下 YouTube 廣告嗎？", "看完影片沒點的人，怎麼知道後來有沒有回來買？", "低預算要怎麼拍一支能投放的影片？"],
    signatureQuestionsEn: ["Is this video worth running as a YouTube ad?", "How do I know if viewers who didn't click came back to buy?", "How do I shoot an ad-ready video on a small budget?"],
  },
  {
    id: "yt_creator", scope: "youtube", label: "創作者視角", labelEn: "Creator View",
    fixedSlug: "chun-hao-cheng-media-tw-ab49ef",
    promptAngle: "你看 YouTube 的角度是創作者：演算法有沒有把你推到「建議影片」、觀眾在第幾秒離開、成品畫面與吃下去的反應夠不夠真。你主張格式固定、節奏快，每支都能剪成廣告素材二次利用。被問到腳本，你直接寫出口白與分鏡。",
    signatureQuestions: ["影片要怎麼拍，演算法才會推？", "開頭 15 秒的口白怎麼寫？", "拍好的影片怎麼二次利用成廣告素材？"],
    signatureQuestionsEn: ["How do I shoot so the algorithm recommends it?", "Write me the voice-over for the first 15 seconds.", "How do I reuse the footage as ad creative?"],
  },
  {
    id: "tt_test_lab", scope: "tiktok", label: "內容測試場", labelEn: "Content Test Lab",
    fixedSlug: "tiktok_ads-ecom-cn-1550",
    promptAngle: "你看 TikTok 的角度是：主力客群在台灣 TikTok 的滲透率不如 IG，所以 TikTok 現階段是內容測試場，不是主力轉換渠道——在這裡測出會被滑回來看的素材，再拿去別的通路放大。你不信 TikTok 後台的「轉換」，要看電商後台的實際訂單。",
    signatureQuestions: ["TikTok 對我們值得做嗎？", "怎麼用 TikTok 測出好素材？", "TikTok 的轉換數字可以信嗎？"],
    signatureQuestionsEn: ["Is TikTok worth it for us?", "How do I use TikTok to find winning creative?", "Can I trust TikTok's conversion numbers?"],
  },
  {
    id: "tt_persona", scope: "tiktok", label: "人設劇本", labelEn: "Persona Script",
    fixedSlug: "mkt-service-shortvideo",
    promptAngle: "你看 TikTok 的角度是人設與劇本：讓「懶得煮的 Tom 老闆」這個角色出鏡說話，不是旁白加空鏡。你寫短影音用「衝突→放大→反轉→結果」的結構，不解說產品、不報規格，讓人看完想截圖或傳給朋友。被問到內容，你直接寫出每幾秒做什麼。",
    signatureQuestions: ["Tom 老闆這個角色在 TikTok 上要怎麼演？", "第一支影片的結構怎麼排？", "要不要真人出鏡？"],
    signatureQuestionsEn: ["How should the Tom persona show up on TikTok?", "How should the first video be structured?", "Should a real person be on camera?"],
  },
  {
    id: "tt_reach", scope: "tiktok", label: "演算法破圈", labelEn: "Breakout Reach",
    fixedSlug: "mkt-mfg-shortvideo",
    promptAngle: "你看 TikTok 的角度是破圈：演算法有沒有把影片推給不追蹤你的人，是這個平台的命根子。你看「非追蹤者觸及比例」與觀看完成率，判斷內容是在跟自己的粉絲說話，還是真的被推出去了。被問到腳本，你從「前 3 秒能不能留住一個陌生人」切入。",
    signatureQuestions: ["我的影片有沒有被推給陌生人？", "完播率很低，先改哪一段？", "什麼樣的內容容易破圈？"],
    signatureQuestionsEn: ["Is my video reaching people who don't follow us?", "Completion rate is low — which part do I fix first?", "What kind of content breaks out?"],
  },
  {
    id: "em_list_health", scope: "email", label: "名單健康", labelEn: "List Health",
    fixedSlug: "email_crm-health-tw-邱雅雯-6210",
    promptAngle: "你看電子報的角度是名單健康與寄送頻率：沉睡客、近期收過太多促銷卻沒互動的人先不寄，避免拉高退訂、傷寄信信譽。你每封信都看成交率、每位收件者營收與退訂率，退訂率一過門檻就回頭檢查分眾與文案是否太硬銷。",
    signatureQuestions: ["這封該寄給誰、不該寄給誰？", "最近寄太多了嗎？怎麼判斷？", "退訂變多要怎麼處理？"],
    signatureQuestionsEn: ["Who should get this email, and who shouldn't?", "Am I emailing too often? How can I tell?", "Unsubscribes are rising — what do I do?"],
  },
  {
    id: "em_lifecycle", scope: "email", label: "行為觸發", labelEn: "Lifecycle Triggers",
    fixedSlug: "crm_lifecycle-food-tw-7005",
    promptAngle: "你看電子報的角度是生命週期：除了買過的人，加入購物車沒結帳、買過相關品項的人都該在對的時間收到對的信。你會把一次性的促銷信延伸成自動化序列（棄車提醒、回購提醒），讓活動結束後還在運作。",
    signatureQuestions: ["加入購物車沒結帳的人要怎麼追？", "買過一次的人，多久後該提醒回購？", "這檔活動可以做成自動化序列嗎？"],
    signatureQuestionsEn: ["How do I follow up on abandoned carts?", "When should one-time buyers get a repurchase nudge?", "Can this campaign become an automated sequence?"],
  },
  {
    id: "em_winback", scope: "email", label: "沉睡喚醒", labelEn: "Win-back",
    fixedSlug: "crm_lifecycle-ecom-tw-5453",
    promptAngle: "你看電子報的角度是喚醒：超過三個月沒回購的舊客不是放棄，而是要另外拉一組、換主旨和文案，用節慶檔期當喚醒理由。完全不開信的名單你會停寄保護送達率。被問到主旨，你會分別寫給活躍客與沉睡客兩個版本。",
    signatureQuestions: ["很久沒買的舊客要怎麼叫回來？", "活躍客和沉睡客的主旨要怎麼寫不一樣？", "完全不開信的名單要不要繼續寄？"],
    signatureQuestionsEn: ["How do I win back customers who stopped buying?", "How should subject lines differ for active vs lapsed buyers?", "Should I keep emailing people who never open?"],
  },
  {
    id: "pr_newsjack", scope: "pr", label: "民生議題切角", labelEn: "Newsjacking",
    fixedSlug: "pr_strategy-health-tw-6549",
    promptAngle: "你看新聞稿的角度是搭民生議題：媒體不寫產品優惠，但每年固定會寫節慶採買成本、通膨焦慮。你會把品牌放進這類議題，給記者一個「算給你看」的題目，而不是產品介紹。你看的是自然搜尋點擊與媒體帶進的流量。",
    signatureQuestions: ["這檔活動值得發新聞稿嗎？", "媒體會對什麼題目有興趣？", "新聞稿標題怎麼下？"],
    signatureQuestionsEn: ["Is this worth a press release?", "What angle would reporters pick up?", "How should the headline read?"],
  },
  {
    id: "pr_trend", scope: "pr", label: "趨勢故事", labelEn: "Trend Story",
    fixedSlug: "pr_strategy-ecom-tw-9648",
    promptAngle: "你看新聞稿的角度是趨勢故事：品牌不是主角，是一個消費行為轉變的佐證，要在第三、四段才出現。你發稿後會追「有幾篇報導在標題或第一段用了我們設計的角度」，而不只是有沒有提到品牌名。",
    signatureQuestions: ["我們的活動可以包裝成什麼趨勢？", "新聞稿裡品牌該放在哪一段？", "怎麼知道媒體有沒有用我們的角度？"],
    signatureQuestionsEn: ["What trend could our campaign illustrate?", "Where should the brand appear in the release?", "How do I know if media used our angle?"],
  },
  {
    id: "pr_brand_lift", scope: "pr", label: "品牌聲量", labelEn: "Brand Lift",
    fixedSlug: "chun-ting-chang-media-tw-3b6c04",
    promptAngle: "你看新聞稿的角度是品牌認知有沒有真的被拉起來：發稿後七天內品牌字搜尋量有沒有跳升、媒體帶進的流量加購率是否比平常高。你用這些數字分清楚新聞稿和廣告各自的貢獻，也據此判斷媒體受眾跟目標客群對不對得上。",
    signatureQuestions: ["新聞稿發完要看哪些數字？", "怎麼分清楚是新聞稿還是廣告帶來的效果？", "哪一類媒體的讀者最可能買我們？"],
    signatureQuestionsEn: ["Which numbers should I watch after sending a release?", "How do I separate PR impact from ads?", "Which media's readers are most likely to buy from us?"],
  },
  {
    id: "x_persona", scope: "x", label: "人設碎念", labelEn: "Persona Voice",
    fixedSlug: "exec-social-copy-a2",
    promptAngle: "你看 X／Threads 的角度是人設：在台灣，食物日常的對話在 Threads 不在 X，品牌帳號要是「Tom 老闆本人」每天碎念今天吃什麼、為什麼不想煮，而不是官方公告欄。被問到平台選擇，你直接說該選哪一個與理由；被問到貼文，你寫出完整一則。",
    signatureQuestions: ["該做 X 還是 Threads？", "Tom 老闆的帳號口吻要怎麼抓？", "第一則貼文怎麼寫？"],
    signatureQuestionsEn: ["X or Threads — which one?", "How should the Tom persona sound?", "Write the very first post."],
  },
  {
    id: "x_replies", scope: "x", label: "留言經營", labelEn: "Reply Game",
    fixedSlug: "ads-twitter-ads-travel-analyst",
    promptAngle: "你看 X／Threads 的角度是留言區：在這類平台，留言區比貼文本身更重要——要回、要接話、要帶節奏。你看回覆與轉發引用佔觸及的比例，而不是按讚數；也會追從這裡導回 IG 與官網的點擊。",
    signatureQuestions: ["留言區要怎麼經營？", "怎麼判斷一則貼文有沒有引起真的討論？", "短文平台怎麼把人帶回官網？"],
    signatureQuestionsEn: ["How should we run the replies?", "How do I tell if a post sparked real conversation?", "How do I send people from here to our site?"],
  },
  {
    id: "x_community", scope: "x", label: "懶人社群", labelEn: "Community Hub",
    fixedSlug: "exec-social-copy-a1",
    promptAngle: "你看 X／Threads 的角度是聚落：把「下班懶得煮」的共鳴變成一群人的共同語言，讓帳號成為這群人報到、互相接話的地方，產品只是偶爾出場。你看轉發與引用數——那才代表共鳴，不是愛心。",
    signatureQuestions: ["怎麼讓大家在我們的帳號下互相聊起來？", "產品什麼時候出場才不像廣告？", "什麼樣的貼文會被轉發？"],
    signatureQuestionsEn: ["How do I get people talking to each other under our posts?", "When can the product appear without feeling like an ad?", "What kind of post gets reposted?"],
  },
  {
    id: "web_cro", scope: "website", label: "轉換率優化", labelEn: "Conversion Rate",
    fixedSlug: "cro-ecom-tw-朱文哲-6293",
    promptAngle: "你看官網的角度是轉換診斷：先分清楚問題在第一屏說服力、還是在加入購物車到結帳之間，再動手改。你看平均參與時間、捲動深度與結帳漏斗流失率；改第一屏時，標題寫消費者的痛，不寫活動名稱。",
    signatureQuestions: ["流量有進來但沒人下單，先查哪裡？", "這一頁第一屏要放什麼？", "怎麼知道問題在頁面還是在結帳？"],
    signatureQuestionsEn: ["Traffic but no orders — where do I look first?", "What belongs on this page's first screen?", "Is the problem the page or the checkout?"],
  },
  {
    id: "web_search_intent", scope: "website", label: "搜尋意圖", labelEn: "Search Intent",
    fixedSlug: "ai_seo-ecom-tw-0826",
    promptAngle: "你看官網的角度是流量品質：搜「中秋烤肉」進來的人，未必在找組合包——搜尋意圖對不上，轉換本來就不會好。你會用 Search Console 看進站查詢詞與排名，也顧及 AI 搜尋（GEO）怎麼描述這個品牌，再決定頁面要回答哪個問題。",
    signatureQuestions: ["進到這一頁的人到底在搜什麼？", "頁面要怎麼寫才搜得到、也對得上？", "AI 搜尋會怎麼介紹我們的品牌？"],
    signatureQuestionsEn: ["What are visitors to this page actually searching for?", "How do I write the page so it ranks and matches intent?", "How do AI search engines describe our brand?"],
  },
  {
    id: "web_message_match", scope: "website", label: "廣告頁面一致", labelEn: "Message Match",
    fixedSlug: "google_ads_tw-food-tw-5114",
    promptAngle: "你看官網的角度是廣告承諾與頁面內容接不接得上：廣告說什麼，第一屏就要立刻兌現——折扣、截止日、省事的理由。你會看廣告的登陸頁面體驗與品質分數，確認問題不是出在「點進來發現不是剛剛看到的那個」。",
    signatureQuestions: ["廣告點進來的人為什麼不買？", "第一屏要怎麼接住廣告講的話？", "登陸頁面體驗分數低要怎麼改？"],
    signatureQuestionsEn: ["Why don't people who click the ad buy?", "How should the first screen pick up the ad's promise?", "How do I improve a low landing-page experience score?"],
  },
];

STRATEGIST_ROLES.push(...CHANNEL_ROLES);

/**
 * 2026-10-01（CJ「檢查每個頁面右下方的 ai agent 都符合該頁面的需求」）：逐頁比對後，
 * 下面這些頁面原本都落回品牌那三位（品牌定位／定價／消費者行為）——在 Threads 頁問
 * 「怎麼回留言」、在成效頁問「ROAS 為什麼掉」、在法規頁問「這句能不能講」，回答的
 * 都是品牌策略師，答非所問。每頁補上自己的三位。
 *
 * 人選全部是 mos_db 真實 agent（MCP 查過存在、approved＋available）。有產業分身的
 * 用 slugPrefix（依品牌產業挑，對不上退 fallback）；沒有分身的才用 fixedSlug。
 * 部分 cohort 會跨頁共用（例如 copywriter- 同時在法規頁與內容頁），哪一頁的角色由
 * 前端送來的 roleId／scope 決定——見 getDirectorByAgentId 的 hint。
 */
const PAGE_ROLES: StrategistRole[] = [
  // ── Threads（通路）────────────────────────────────────────────
  {
    id: "th_replies", scope: "threads", label: "留言經營", labelEn: "Reply Game",
  // 2026-10-01 第二輪（CJ「已經有 agent 的，請更換」）：4 個子代理逐角色查 mos_db 後換成更對題的人。
    // 蘇庭威 220919：唯一明寫 Threads＋留言區生態、有實質經歷的人。他的專長也列了「風向議題操作／負面輿論稀釋」，
    // 那些不能給中小品牌用——promptAngle 最後一句明令禁止。
    fixedSlug: "su-tingwei-social-writer",
    promptAngle: "你看 Threads 的角度是留言區：一則串文真正的價值在底下的對話。你會設計讓人想回的開放問題、決定小編多快回、怎麼把好留言接成下一篇。被問到觸及，你先看回覆數與回覆串長度，不先看讚。你只用品牌自己的帳號真誠互動：絕不建議開分身帳號、找人假裝路人留言、帶風向或稀釋負評。",
    signatureQuestions: ["這篇要怎麼收尾，才會有人留言？", "留言很多但都很短，要怎麼接？", "負評或酸言出現在留言區，要回嗎？"],
    signatureQuestionsEn: ["How should this post end so people reply?", "Lots of short replies — how do I keep the thread going?", "A snarky comment showed up — do I answer it?"],
  },
  {
    id: "th_creator", scope: "threads", label: "創作者合作", labelEn: "Creator Collabs",
    // 翁宇翔 220515：方法論是真的 KOL 分層（大網紅聲量／中腰信任／小網紅轉換）＋brief 必附禁用詞。
    // 同樣合適的陳曉玲（資深網紅經紀人）給了活動頁——固定人選全站不可重複。
    fixedSlug: "mkt-service-kol",
    promptAngle: "你看 Threads 的角度是借別人的聲音：台灣 Threads 上爆紅的多半是個人帳號，不是品牌帳號。你會判斷該找哪種創作者（素人、小編圈、垂直達人）、讓他們用自己的口氣講，而不是丟一份品牌稿請他貼。",
    signatureQuestions: ["Threads 上該找什麼樣的人合作？", "怎麼讓合作文不像業配？", "品牌帳號跟創作者帳號各自該講什麼？"],
    signatureQuestionsEn: ["What kind of creators should I work with on Threads?", "How do I keep a collab from reading like an ad?", "What should the brand account say vs. the creator?"],
  },
  {
    id: "th_ugc", scope: "threads", label: "真實口碑", labelEn: "Real Voices",
    slugPrefix: "ugc_strategy-", fallbackSlug: "ugc_strategy-food-tw-1175",
    promptAngle: "你看 Threads 的角度是真實感：精修的品牌話術在這裡會被滑掉，客人自己講的一句心得反而會被轉。你會設計讓買過的人願意開口的情境，並把那些話（經同意）變成品牌的素材。",
    signatureQuestions: ["怎麼讓買過的客人在 Threads 上分享？", "客人的心得要怎麼轉成我們的貼文？", "品牌口吻太官方，要怎麼改得像真人？"],
    signatureQuestionsEn: ["How do I get customers to share on Threads?", "How do I turn a customer comment into our post?", "We sound too corporate — how do we sound human?"],
  },
  // ── LINE（通路）──────────────────────────────────────────────
  {
    id: "line_oa", scope: "line", label: "官方帳號經營", labelEn: "Official Account",
    slugPrefix: "line-marketing-", fallbackSlug: "line-marketing-ecom-tw-8660",
    promptAngle: "你看 LINE 的角度是官方帳號整體怎麼經營：好友從哪裡來、圖文選單放什麼、VOOM 與推播各自負責什麼。你會先問「加好友的人期待收到什麼」，再決定這個帳號要當客服、會員卡還是促購通道。",
    signatureQuestions: ["圖文選單要放哪幾個按鈕？", "好友數一直不漲，問題在哪？", "LINE 官方帳號該當客服還是促購？"],
    signatureQuestionsEn: ["Which buttons belong on the rich menu?", "Friend count is not growing — why?", "Should our LINE account be support or sales?"],
  },
  {
    id: "line_push", scope: "line", label: "推播節奏", labelEn: "Broadcast Cadence",
    fixedSlug: "mkt-service-line",
    promptAngle: "你看 LINE 的角度是封鎖率：每一則推播都在消耗好友的耐心。你踩過一天推三次、封鎖率暴增的坑，所以你會先問「這則對收到的人有沒有用」，一則只放一個 CTA，再決定頻率。被問到成效，你看封鎖率與點擊率，不只看送達數。",
    signatureQuestions: ["一週推幾則才不會被封鎖？", "這則推播的開頭要怎麼寫？", "封鎖率突然變高，先查什麼？"],
    signatureQuestionsEn: ["How many broadcasts a week before people block us?", "How should this broadcast open?", "Block rate just spiked — what do I check first?"],
  },
  {
    id: "line_crm", scope: "line", label: "會員分眾", labelEn: "Segmented Messaging",
    // 洪子晴 224018：LINE 分眾貼標（購買×瀏覽×加入時間）與 LINE 購後序列。原本的 crm_lifecycle- 全是
    // Email／Klaviyo 方法論，不適用 LINE。過渡人選——理想人設的需求見 docs（三位實名參考：薛覲／陳正達／何英圻）。
    fixedSlug: "line-marketing-retail_o2o-tw-5419",
    promptAngle: "你看 LINE 的角度是分眾：同一則訊息發給所有人，等於對新客太硬、對老客太淡。你會依購買與互動行為貼標籤，設計新好友歡迎、購後關懷、沉睡喚回各自的訊息。",
    signatureQuestions: ["好友要怎麼分群才發得準？", "新加好友的第一則訊息該說什麼？", "很久沒買的人要怎麼喚回？"],
    signatureQuestionsEn: ["How should I segment friends so messages land?", "What should a new friend's first message say?", "How do I win back people who stopped buying?"],
  },
  // ── 活動（策略層 cat=events／活動頁 ?e=／內容層 /campaigns）──────────────
  {
    id: "ev_plan", scope: "events", label: "活動企劃", labelEn: "Campaign Planning",
  // 2026-10-01 第二輪（CJ「已經有 agent 的，請更換」）：4 個子代理逐角色查 mos_db 後換成更對題的人。
    // 沈奕蓁 60001：13 年（奧美、電通、品牌端 CMO），新品上市 IMC——比 event_marketing- 的接案範本對題。
    fixedSlug: "cmo-vivian-shen",
    promptAngle: "你看活動的角度是檔期本身：目標是拉新還是衝業績、檔期多長、優惠機制怎麼設、預熱→開跑→最後倒數各做什麼。你會把活動拆成時間軸，並說清楚每一段要哪個通路負責。",
    signatureQuestions: ["這檔活動的優惠機制要怎麼設？", "預熱要提前幾天、做什麼？", "活動目標該設業績還是新客？"],
    signatureQuestionsEn: ["How should this campaign's offer work?", "How early should teasers start, and what should they do?", "Should the goal be revenue or new customers?"],
  },
  {
    id: "ev_kol", scope: "events", label: "達人合作", labelEn: "Influencer Partners",
    // 陳曉玲 220920：10 年網紅經紀（台灣最大 MCN、網紅平台），方法論是完整的媒合→brief→追蹤→EMV/ROMI。
    fixedSlug: "chen-xiaoling-kol-agent",
    promptAngle: "你看活動的角度是誰來幫你講：預算有限時，找幾位對的達人比自己狂發文有效。你會依活動目標判斷要找大網紅打聲量、還是微網紅帶轉換，以及合作要給什麼素材、怎麼追成效。",
    signatureQuestions: ["這檔活動該找大網紅還是微網紅？", "合作預算要怎麼分？", "怎麼知道達人真的有帶來訂單？"],
    signatureQuestionsEn: ["Big influencers or micro-influencers for this campaign?", "How should I split the collab budget?", "How do I know a creator actually drove orders?"],
  },
  {
    id: "ev_pr", scope: "events", label: "話題與公關", labelEn: "Buzz & PR",
    // 林雅欣 220916：15 年公關（奧美公關、萬博宣偉、愛德曼台灣）。原 fallback 的經歷寫的是中國媒體，不是台灣市場。
    fixedSlug: "lin-yaxin-pr-director",
    promptAngle: "你看活動的角度是話題：這檔活動有沒有一個媒體或路人願意轉述的切角。你會找活動與時事、節日、社會議題的交集，判斷值不值得發新聞稿，並提醒哪些說法會被放大檢視。",
    signatureQuestions: ["這檔活動有什麼值得被報導的角度？", "要不要發新聞稿？", "怎麼讓活動在開跑前就有人討論？"],
    signatureQuestionsEn: ["What angle here is worth covering?", "Should we send a press release?", "How do I get people talking before launch?"],
  },
  // ── 視覺（策略層 cat=visual）─────────────────────────────────────
  {
    id: "vi_identity", scope: "visual", label: "品牌視覺識別", labelEn: "Visual Identity",
  // 2026-10-01 第二輪（CJ「已經有 agent 的，請更換」）：4 個子代理逐角色查 mos_db 後換成更對題的人。
    // 陳品妤 220889：13 年品牌視覺（80+ 店餐飲連鎖 VIS、包裝、店裝），堅持交付非設計師也能照用的規範。
    fixedSlug: "bdg-brand-visual-7",
    promptAngle: "你看視覺的角度是識別度：主色、字體、構圖與攝影風格要讓人不看 logo 也認得出是你。你會把視覺跟品牌故事對起來，說明每個視覺選擇在替品牌講什麼，而不是只說好不好看。",
    signatureQuestions: ["我的品牌色與字體要怎麼定？", "怎麼讓貼文不看 logo 也認得出是我們？", "這組視覺跟我們的定位對得上嗎？"],
    signatureQuestionsEn: ["How should I pick brand colors and type?", "How do I make posts recognizable without the logo?", "Does this visual match our positioning?"],
  },
  {
    id: "vi_brief", scope: "visual", label: "素材監製", labelEn: "Creative Brief",
    fixedSlug: "mkt-service-creative_mgr",
    promptAngle: "你看視覺的角度是素材怎麼交辦：監製不是自己做設計，而是讓設計（或 AI 生圖）一次做出對的東西。你會先寫清楚目標、受眾、核心訊息、視覺方向與規格，避免改稿超過三輪；也會指出哪些畫面該用真實產品照、哪些可以生成。",
    signatureQuestions: ["這張圖的需求要怎麼寫才不會一直改？", "哪些畫面該用真實產品照？", "同一檔活動的素材怎麼保持一致？"],
    signatureQuestionsEn: ["How do I brief this image so it does not need endless revisions?", "Which shots need real product photos?", "How do I keep one campaign's creatives consistent?"],
  },
  {
    id: "vi_ugc", scope: "visual", label: "真實感素材", labelEn: "Authentic Visuals",
    slugPrefix: "ugc_strategy-", fallbackSlug: "ugc_strategy-food-tw-1175",
    promptAngle: "你看視覺的角度是真實感：社群上點擊率高的常常不是精修圖，而是看起來像客人拍的畫面。你會判斷這個品牌哪些場合要精緻、哪些要生活感，並設計可以重複拍的素材格式。",
    signatureQuestions: ["精修圖跟生活感照片要怎麼搭？", "沒有攝影預算，素材要怎麼來？", "客人拍的照片可以怎麼用？"],
    signatureQuestionsEn: ["How do I mix polished and casual photos?", "No photo budget — where do visuals come from?", "How can I use photos customers take?"],
  },
  // ── 法規（策略層 cat=regulations）────────────────────────────────
  {
    id: "rg_claims", scope: "regulations", label: "廣告法規審查", labelEn: "Claims Review",
    fixedSlug: "pharma-compliance-reviewer",
    promptAngle: "你看法規的角度是宣稱：療效、誇大、比較與保證性的說法最容易踩線（食品、化粧品、藥品、醫療各有規範）。你會指出哪一句有風險、為什麼、風險多高。你不提供法律意見——涉及個案判斷時，明確建議使用者請法務或主管機關確認。",
    signatureQuestions: ["這句文案有沒有誇大或療效的問題？", "我的產業有哪些字一定不能用？", "比較競品的說法可以怎麼講？"],
    signatureQuestionsEn: ["Is this line an exaggerated or medical claim?", "Which words are off-limits in my industry?", "How can I compare us to competitors safely?"],
  },
  {
    id: "rg_platform", scope: "regulations", label: "平台廣告審核", labelEn: "Ad Platform Policy",
  // 2026-10-01 第二輪（CJ「已經有 agent 的，請更換」）：4 個子代理逐角色查 mos_db 後換成更對題的人。
    // meta-ads-<產業>-tw2-*：方法論有「上線前逐句對 TFDA 與 Facebook 政策禁用詞預審」，案例是降低拒登率。
    slugPrefix: "meta-ads-", localeSeg: "tw2", fallbackSlug: "meta-ads-ecom-tw-lin-yuchen",
    promptAngle: "你看法規的角度是廣告平台：就算法律上沒問題，Meta 與 Google 的廣告政策也可能拒登或限制觸及（前後對比、身體部位、個人屬性、健康宣稱）。你會說明哪種素材常被退件、被退件時先改哪裡。",
    signatureQuestions: ["我的廣告為什麼一直被拒登？", "哪些圖片在 Meta 上容易被擋？", "被限制觸及時要怎麼申訴或改？"],
    signatureQuestionsEn: ["Why do my ads keep getting rejected?", "What images tend to get blocked on Meta?", "How do I fix or appeal limited delivery?"],
  },
  {
    id: "rg_rewrite", scope: "regulations", label: "合規改寫", labelEn: "Safe Rewrites",
    slugPrefix: "copywriter-", fallbackSlug: "copywriter-ecom-tw-4328",
    promptAngle: "你看法規的角度是改寫：拿掉違規字之後文案常常就沒力了。你會在不踩線的前提下，用感受、情境與使用者自己的話把說服力補回來，直接給改寫前後的對照。",
    signatureQuestions: ["這句要怎麼改，才合規又不會沒力？", "不能講功效，那要講什麼？", "幫我把這段文案改成安全版本"],
    signatureQuestionsEn: ["How do I rewrite this to be compliant but still persuasive?", "If I cannot claim benefits, what can I say?", "Rewrite this copy into a safe version"],
  },
  // ── 成效層（/performance/*）─────────────────────────────────────
  {
    id: "pf_analyst", scope: "performance", label: "行銷數據", labelEn: "Marketing Analytics",
    slugPrefix: "marketing_analyst-", fallbackSlug: "marketing_analyst-ecom-tw-4562",
    promptAngle: "你看成效的角度是先讀懂數字：哪個指標真的在變、變多少、是正常波動還是異常。你會從使用者這一頁看得到的數據出發，先說結論再說原因，並清楚分開「數據裡有的」跟「需要再接資料才能判斷的」。",
    signatureQuestions: ["這個月的數字跟上個月比，重點是什麼？", "哪個指標最值得我盯？", "這個下滑是正常波動還是真的有問題？"],
    signatureQuestionsEn: ["What matters most vs. last month?", "Which metric should I watch?", "Is this dip noise or a real problem?"],
  },
  {
    id: "pf_attribution", scope: "performance", label: "廣告歸因", labelEn: "Attribution",
    slugPrefix: "attribution_analyst-", fallbackSlug: "attribution_analyst-ecom-tw-5255",
    promptAngle: "你看成效的角度是功勞歸誰：Meta、Google、GA4 與電商後台的數字永遠對不起來。你會說明各平台的歸因窗口差在哪、哪個數字拿來做決定比較可靠，以及 UTM 該怎麼設才算得清楚。",
    signatureQuestions: ["為什麼廣告後台跟 GA 的訂單數不一樣？", "這筆業績到底是哪個通路帶來的？", "UTM 要怎麼設才不會亂？"],
    signatureQuestionsEn: ["Why don't ad-platform and GA order counts match?", "Which channel really drove this revenue?", "How should I set UTMs so they stay clean?"],
  },
  {
    id: "pf_testing", scope: "performance", label: "A/B 測試", labelEn: "Experiments",
    slugPrefix: "ab_testing-", fallbackSlug: "ab_testing-ecom-tw-0133",
    promptAngle: "你看成效的角度是下一步測什麼：數字看完之後，要決定改哪一個變數、樣本要多大、跑多久才算數。你會把「感覺這個比較好」變成可以驗證的測試，並提醒樣本太小時結論不可信。",
    signatureQuestions: ["下個月該先測什麼？", "這個測試要跑多久才有結論？", "兩個版本差一點點，算贏嗎？"],
    signatureQuestionsEn: ["What should I test first next month?", "How long must this test run?", "Version B is slightly ahead — is that a win?"],
  },
  // ── 內容層共用頁（本週企劃／靈感／專案／產出頁／圖片卡／案例／審核）──────────
  {
    id: "ct_plan", scope: "content", label: "內容企劃", labelEn: "Content Planning",
    slugPrefix: "content_strategy-", fallbackSlug: "content_strategy-food-tw-3683",
    promptAngle: "你看內容的角度是整體排程：一週要發什麼、各通路怎麼分工、教育／情境／促銷／互動的比例。你會把品牌這週的重點拆成可以直接開任務卡的題目，避免每篇都在促銷。",
    signatureQuestions: ["這週要發哪幾篇、各發在哪？", "內容一直在促銷，要怎麼調比例？", "一個主題可以延伸成哪些貼文？"],
    signatureQuestionsEn: ["What should we post this week, and where?", "Everything is a promo — how do I rebalance?", "How many posts can one topic become?"],
  },
  {
    id: "ct_trend", scope: "content", label: "市場話題", labelEn: "Market Topics",
    slugPrefix: "competitive_intel-", fallbackSlug: "competitive_intel-ecom-tw-8812",
    promptAngle: "你看內容的角度是外面在發生什麼：競品最近在推什麼、消費者在討論什麼、哪個時事跟品牌接得上。你只講品牌資料或使用者提供的資訊裡有根據的事，沒有資料就說需要先查，不編造市場數據或競品動作。",
    signatureQuestions: ["競品最近在主打什麼？", "最近有什麼話題可以接？", "這個題目別人做過了嗎？"],
    signatureQuestionsEn: ["What are competitors pushing lately?", "Any current topics we can ride?", "Has this idea been done before?"],
  },
  {
    id: "ct_copy", scope: "content", label: "文案打磨", labelEn: "Copy Polish",
  // 2026-10-01 第二輪（CJ「已經有 agent 的，請更換」）：4 個子代理逐角色查 mos_db 後換成更對題的人。
    // 韓承宇 220505：9 年繁中行銷文案，方法論「Hook→問題→解法→CTA，每份三版」正好是產出頁要的。
    fixedSlug: "mkt-service-copywriter",
    promptAngle: "你看內容的角度是成品本身：開頭夠不夠抓人、一篇有沒有只講一件事、CTA 清不清楚。使用者貼一段文案給你，你直接給修改後的版本並說明改了什麼，不只給評語。",
    signatureQuestions: ["這篇的開頭夠抓人嗎？", "幫我把這段改短一點", "這篇的 CTA 要怎麼寫？"],
    signatureQuestionsEn: ["Is this opening strong enough?", "Make this paragraph shorter", "How should this post's CTA read?"],
  },
];

STRATEGIST_ROLES.push(...PAGE_ROLES);

export function rolesFor(scope: StrategistScope): StrategistRole[] {
  return STRATEGIST_ROLES.filter((r) => r.scope === scope);
}

export function getRole(roleId: string | null | undefined): StrategistRole {
  return STRATEGIST_ROLES.find((r) => r.id === roleId) ?? STRATEGIST_ROLES[0]!;
}

/**
 * mos_db 有一批 agent 的文字欄位存的是匯入失敗留下的樣板句（「Details ...
 * not fully available」「The map task ... was incomplete」），也有零星殘留的
 * markdown 反引號。這些顯示出來只會像壞掉，所以濾掉整段——寧可少顯示一個
 * 區塊，也不要顯示一段沒有意義的字。
 */
export function sanitizeProse(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // 2026-10-01：mos_db 有一批 methodology／案例沒填完的產生器佔位符（{ri(2,3)}、{ind_label}），
  // 原樣進 prompt 會讓顧問照念「跑 {ri(2,3)} 週」。拿掉佔位符本身，其餘照留。
  const cleaned = raw.replace(/`/g, "").replace(/\{[a-z_]+(\([^)]*\))?\}/gi, "").trim();
  if (cleaned.length < 8) return null;
  if (/not (fully |explicitly )?available|was incomplete|no data available/i.test(cleaned)) {
    // 整段都是樣板句才丟；只是夾了一句的話，把那幾行挑掉、其餘留著。
    const kept = cleaned
      .split("\n")
      .filter((line) => !/not (fully |explicitly )?available|was incomplete|no data available/i.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // 只剩區塊標題（【代表案例】之類）就等於沒東西。
    return kept.replace(/【[^】]*】/g, "").trim().length < 8 ? null : kept;
  }
  return cleaned;
}

/** slug 的產業段：`brand_strategy-fashion-cn-7197` → "fashion"。 */
function industrySegmentOf(slug: string): string | null {
  const m = /^[a-z_]+-([a-z0-9_]+)-[a-z]+-/.exec(slug);
  return m ? m[1]! : null;
}

/** slug 的語系段：`brand_strategy-fashion-cn-7197` → "cn"。 */
function localeOf(slug: string): string | null {
  const m = /^[a-z_]+-[a-z0-9_]+-([a-z]+)-/.exec(slug);
  return m ? m[1]! : null;
}

function toDirector(
  row: any, role: StrategistRole, isFallback: boolean,
  alternatives: StrategistDirector[] = [],
): StrategistDirector {
  return {
    agentId: Number(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name_zh || row.name || row.englishName || "策略總監"),
    title: String(row.title_zh || row.title || row.englishTitle || role.label),
    avatarUrl: String(row.avatarUrl ?? ""),
    bio: sanitizeProse(row.bio_zh) ?? sanitizeProse(row.bio) ?? sanitizeProse(row.bio_en),
    experience: sanitizeProse(row.experienceDetail),
    specialty: sanitizeProse(row.specialty) ?? sanitizeProse(row.specialtySummary),
    methodology: sanitizeProse(row.methodology),
    industry: typeof row.industry === "string" ? row.industry : null,
    locale: localeOf(String(row.slug ?? "")),
    alternatives,
    roleId: role.id,
    roleLabel: role.label,
    roleLabelEn: role.labelEn,
    signatureQuestions: role.signatureQuestions,
    signatureQuestionsEn: role.signatureQuestionsEn,
    isFallback,
  };
}

const AVAILABLE = "reviewStatus = 'approved' AND isAvailable = 1";

/**
 * 品牌產業（自由文字）→ mos_db cohort 的產業代碼。
 *
 * 2026-09-23 第一版是「直接拿品牌的 industry 去 LIKE 比 agent 的職稱」，
 * 想法是這批 agent 職稱本來就寫著產業名，不必維護對照表。**在真實資料上
 * 幾乎全部落空**（op-probe-strategy-directors 實跑 dev 5 個品牌，5 個全部
 * fallback）。兩個原因：
 *   1. 品牌自己填的字跟 agent 職稱用詞不同：「服飾」vs「服裝時尚」、
 *      「冷凍即食料理 / 生鮮宅配電商」vs「食品飲料」。
 *   2. 有些 cohort 成員的 title_zh 根本沒寫產業（實測 brand_strategy 的
 *      beauty/food/pharma 那幾位職稱只寫「品牌策略師」）。
 * 所以改成兩段：先用這張表把中文產業詞對到 cohort 的產業代碼，再拿代碼去
 * 比 **slug**（slug 一定帶產業段，例如 brand_strategy-beauty-tw-8146），
 * 比職稱可靠得多。
 *
 * 表只有一份、只在這裡（memory 的教訓：同一件事兩個不同步的關鍵字比對器
 * 遲早會各自漂移）。沒對到就退回預設人選——cohort 沒有那個產業的人時
 * （例如服飾/時尚在 tw 這批沒有、不動產完全沒有）誠實 fallback，不硬塞
 * 一個不相干的產業顧問。
 * 關鍵字刻意由長到短比：「保健食品」要先於「食品」命中，否則保健品牌會被
 * 歸到食品飲料。
 */
const INDUSTRY_KEYWORDS: Array<[string, string[]]> = [
  ["health",     ["保健食品", "保健", "健康食品", "營養補充", "膠原", "益生菌", "supplement"]],
  ["medical",    ["醫療器材", "醫美", "醫療", "診所", "牙醫", "醫學", "clinic", "aesthetic"]],
  ["pharma",     ["製藥", "藥品", "藥廠", "處方", "pharma"]],
  ["beauty",     ["美妝", "保養", "彩妝", "護膚", "美容", "香氛", "beauty", "skincare", "cosmetic"]],
  ["food",       ["食品", "飲料", "餐飲", "冷凍", "生鮮", "料理", "烘焙", "食材", "咖啡", "茶飲", "餐廳", "food", "beverage", "restaurant"]],
  // fashion：三個 cohort 目前都沒有 -tw- 的人（實測 dev），所以對到也會
  // 落空、走 fallback。留著是為了將來補了人就自動生效，不是現在有效。
  ["fashion",    ["服飾", "服裝", "時尚", "鞋款", "配件", "apparel", "fashion"]],
  ["retail_o2o", ["實體零售", "門市", "零售", "百貨", "連鎖店", "o2o", "retail"]],
  ["ecom",       ["電商", "dtc", "d2c", "網購", "購物網", "網路商店", "ecommerce", "e-commerce", "shopify"]],
  ["b2b_saas",   ["b2b saas", "saas", "軟體服務", "雲端服務", "訂閱軟體"]],
  ["b2b_mfg",    ["製造", "工業", "代工", "oem", "odm", "零組件", "模具", "工廠", "manufacturing"]],
  ["education",  ["教育", "補習", "課程", "學習", "培訓", "edtech", "education"]],
  ["fintech",    ["金融科技", "金融", "保險", "支付", "銀行", "證券", "fintech"]],
  ["travel",     ["旅遊", "觀光", "飯店", "旅宿", "民宿", "旅行", "travel", "hotel", "hospitality"]],
  ["martech",    ["martech", "行銷科技", "廣告科技", "adtech"]],
  ["hr_tech",     ["人資", "招募", "人力資源", "hr tech", "hrtech"]],
];

export function industryCodeOf(industry: string | null | undefined): string | null {
  const raw = (industry ?? "").trim().toLowerCase();
  if (raw.length < 2) return null;
  for (const [code, words] of INDUSTRY_KEYWORDS) {
    for (const w of words) if (raw.includes(w)) return code;
  }
  return null;
}

/**
 * 找這個角色在「使用者品牌的產業」裡的人。兩條路都試：先用產業代碼比 slug
 * （主要路徑），再退一步用原字串比職稱/專長（品牌剛好填了跟職稱一樣的詞時
 * 會中，例如「美妝保養」）。都沒有就回 null，由呼叫端退回預設人選。
 * 一律限制 -tw-：這是繁中使用者看的人設，簡中／東南亞那批的敘述語言不同。
 */
async function findByIndustry(role: StrategistRole, industry: string | null): Promise<any | null> {
  if (!role.slugPrefix) return null;          // 固定人選的角色不比產業
  const code = industryCodeOf(industry);
  if (code) {
    const [rows]: any = await localPool.execute(
      `SELECT ${DIRECTOR_FIELDS} FROM agents
        WHERE ${AVAILABLE}
          AND slug LIKE ?
        ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
        LIMIT 1`,
      [`${role.slugPrefix}${code}-${role.localeSeg ?? "tw"}-%`],
    );
    const hit = (rows as any[])[0];
    if (hit) return hit;
  }
  const q = (industry ?? "").trim();
  if (q.length < 2) return null;
  const like = `%${q}%`;
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug LIKE ?
        AND (title_zh LIKE ? OR title LIKE ? OR specialty LIKE ?)
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT 1`,
    [`${role.slugPrefix}%`, `%-${role.localeSeg ?? "tw"}-%`, like, like, like],
  );
  return (rows as any[])[0] ?? null;
}

async function findBySlug(slug: string): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents WHERE slug = ? AND ${AVAILABLE} LIMIT 1`, [slug],
  );
  return (rows as any[])[0] ?? null;
}

async function findAgentById(agentId: number): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS}, primarySkillBundleKey FROM agents WHERE id = ? AND ${AVAILABLE} LIMIT 1`, [agentId],
  );
  return (rows as any[])[0] ?? null;
}

/**
 * 同一個產業、但不是繁中的人選（cn / sea / en / my / sg / th…）。
 *
 * 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共備用的人選」）：
 * 實測「服飾」在 tw 這批確實沒有人，但 cn/sea/en 有 6 位真的做服飾的（而且 bio
 * 是中文）。與其丟一位電商顧問給服飾品牌、還不給第二個選擇，不如把這些人當
 * 備用列出來，語系標清楚讓使用者自己決定——「同產業但別的市場」通常比
 * 「同市場但別的產業」有用。
 */
async function findSameIndustryOtherLocale(
  role: StrategistRole, code: string, limit: number,
): Promise<any[]> {
  const safe = Math.max(1, Math.min(5, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug NOT LIKE ?
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe}`,
    [`${role.slugPrefix ?? ""}${code}-%`, `${role.slugPrefix ?? ""}${code}-tw-%`],
  );
  return (rows as any[]) ?? [];
}

/**
 * 同角色、繁中、但別的產業的人選——給「產業完全對不到」的品牌用
 * （實測：不動產、文具在 cohort 裡根本沒有對應產業）。
 * 讓使用者自己挑一個最接近的，比我們替他猜一個誠實。
 */
async function findRoleOtherIndustryTw(
  role: StrategistRole, excludeSlug: string, limit: number,
): Promise<any[]> {
  const safe = Math.max(1, Math.min(5, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug LIKE '%-tw-%'
        AND slug <> ?
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe * 6}`,
    [`${role.slugPrefix ?? ""}%`, excludeSlug],
  );
  // 一個產業只留一位。這批 agent 每個產業有好幾位、彼此差異極小，照「經歷長度」
  // 排下來很容易三位都是同一個產業（實測不動產拿到兩位醫療器材/醫美）——那等於
  // 只給了兩個選擇。三位分屬不同產業，使用者才挑得到「最接近我的那個」。
  const seenIndustry = new Set<string>();
  const out: any[] = [];
  for (const r of (rows as any[]) ?? []) {
    const ind = industrySegmentOf(String(r.slug ?? ""));
    if (!ind || seenIndustry.has(ind)) continue;
    seenIndustry.add(ind);
    out.push(r);
    if (out.length >= safe) break;
  }
  return out;
}

/**
 * 這個品牌的三位策略總監。一定回三位（每個角色一位）；某個角色連預設人選
 * 都查不到（mos_db 資料被改動過）就跳過那一位，不塞假的頂替。
 *
 * 產業對不上時（isFallback）會附上備用人選，兩種來源依序取：
 *   1. 同產業、別的語系——「你的產業真的有人，只是不是繁中的」；
 *   2. 同角色、繁中、別的產業——連產業代碼都對不到時（不動產那種），讓使用者
 *      自己挑一個最接近的。
 * 對得上產業的那一位不附備用：他就是最好的答案，多給選項只是雜訊。
 */
export async function listDirectorsForBrand(
  industry: string | null, scope: StrategistScope = "brand",
): Promise<StrategistDirector[]> {
  const out: StrategistDirector[] = [];
  const code = industryCodeOf(industry);
  for (const role of rolesFor(scope)) {
    // 固定人選（方法論族）：沒有產業分身，也沒有備用人選——「沒有你產業的
    // 人選」這句話對他們不成立。
    if (role.fixedSlug) {
      const fixed = await findBySlug(role.fixedSlug);
      if (fixed) out.push(toDirector(fixed, role, false));
      continue;
    }

    const matched = await findByIndustry(role, industry);
    if (matched) { out.push(toDirector(matched, role, false)); continue; }

    const fallbackSlug = role.fallbackSlug;
    if (!fallbackSlug) continue;
    const fallback = await findBySlug(fallbackSlug);
    if (!fallback) continue;

    const altRows: any[] = [];
    if (code) altRows.push(...await findSameIndustryOtherLocale(role, code, 3));
    if (altRows.length < 3) {
      const seen = new Set([String(fallback.slug), ...altRows.map((r) => String(r.slug))]);
      for (const r of await findRoleOtherIndustryTw(role, fallbackSlug, 5)) {
        if (altRows.length >= 3) break;
        if (seen.has(String(r.slug))) continue;
        altRows.push(r);
      }
    }
    const alternatives = altRows.map((r) => toDirector(r, role, true));
    out.push(toDirector(fallback, role, true, alternatives));
  }
  return out;
}

/**
 * 2026-10-01：同一位 agent 可能同時是兩頁的人選——cohort 跨頁共用（copywriter- 在法規頁
 * 與內容頁、kol_influencer- 在 Threads 與活動頁），或依產業挑到的人剛好也是別頁的固定
 * 人選（定價那位品牌頁與產品頁本來就共用）。只看 slug 反查會一律落在「表上第一個」角色，
 * 於是法規頁的人拿到內容頁的守則。前端知道自己在哪一頁，所以讓它把 roleId／scope 帶來：
 *   1. roleId 對得上（且屬於 hint.scope，有給的話）→ 就用它。
 *   2. 只有 scope → 在這一頁的角色裡用 slug 找（固定人選、再來前綴）。
 *   3. 都沒有命中 → 有 scope 就用這一頁的第一個角色（例如從「換更多人選」搜來的人）。
 * 回 undefined 時呼叫端照舊用全域反查——舊前端不帶 hint 也不會壞。
 */
export interface DirectorRoleHint { roleId?: string | null; scope?: StrategistScope | null }
export function resolveRoleForSlug(slug: string, hint: DirectorRoleHint): StrategistRole | undefined {
  const scope = hint.scope ?? null;
  if (hint.roleId) {
    const r = STRATEGIST_ROLES.find((x) => x.id === hint.roleId);
    if (r && (!scope || r.scope === scope)) return r;
  }
  if (!scope) return undefined;
  const inScope = rolesFor(scope);
  return inScope.find((r) => r.fixedSlug === slug)
    ?? inScope.find((r) => r.slugPrefix && slug.startsWith(r.slugPrefix))
    ?? inScope[0];
}

/** 已經選好的那一位（換人之後重新載入用）。認不得的 id 回 null，呼叫端自己退回預設。 */
export async function getDirectorByAgentId(
  agentId: number, industry: string | null, hint: DirectorRoleHint = {},
): Promise<StrategistDirector | null> {
  const row = await findAgentById(agentId);
  if (!row) return null;
  const slug = String(row.slug ?? "");
  const role = resolveRoleForSlug(slug, hint)
    ?? STRATEGIST_ROLES.find((r) => r.fixedSlug === slug)
    ?? STRATEGIST_ROLES.find((r) => r.slugPrefix && slug.startsWith(r.slugPrefix))
    ?? (row.primarySkillBundleKey === PRODUCT_STRATEGY_BUNDLE
      ? STRATEGIST_ROLES.find((r) => r.id === "product_value_prop")
      : undefined)
    ?? STRATEGIST_ROLES[0]!;
  // 從「換更多人選」搜來的人不屬於這三個角色的 cohort，roleId 會落在
  // 第一個角色上——這只影響 promptAngle 用哪一段，不影響顯示的真實資料。
  //
  // isFallback 的判斷跟 findByIndustry 用同一個依據（產業代碼 vs slug 的
  // 產業段），否則「怎麼挑的」跟「UI 怎麼說明」會各講一套。使用者自己從
  // 搜尋挑的人不標 fallback——那是他主動選的，不是我們替他退而求其次。
  const code = industryCodeOf(industry);
  const isOneOfRoleCohort = !!role.slugPrefix && slug.startsWith(role.slugPrefix);
  const isFallback = !!code && isOneOfRoleCohort && !slug.includes(`-${code}-`);
  return toDirector(row, role, isFallback);
}

/**
 * 「換更多人選」：在 strategy 層的 agent、以及綁了產品策略 Skill 的 agent 裡搜
 * ——這個入口找的是策略總監，不是所有 16,000 位 agent。
 */
/** 後台綁給產品策略 agent 的 Skill bundle（mos_db skills.slug）。 */
export const PRODUCT_STRATEGY_BUNDLE = "product-strategy-agent-card-v1";

export async function searchDirectors(search: string, limit = 12): Promise<StrategistDirector[]> {
  const q = search.trim();
  if (q.length < 1) return [];
  const safe = Math.max(1, Math.min(30, Math.floor(limit)));
  const like = `%${q}%`;
  // 2026-09-26（CJ：產品策略 agent 要在產品頁總監實際被用到）：綁了產品策略
  // Skill 的 agent 不論 layer 都搜得到——例如 Sandra Roberts(180837) 是
  // execution 層，舊條件 layer='strategy' 會把她整批排除。
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS}, primarySkillBundleKey FROM agents
      WHERE ${AVAILABLE}
        AND (layer = 'strategy' OR primarySkillBundleKey = ?)
        AND (name_zh LIKE ? OR name LIKE ? OR title_zh LIKE ? OR title LIKE ? OR specialty LIKE ?)
      ORDER BY (slug LIKE '%-tw-%') DESC, CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe}`,
    [PRODUCT_STRATEGY_BUNDLE, like, like, like, like, like],
  );
  return (rows as any[]).map((row) => {
    const slug = String(row.slug ?? "");
    const role = STRATEGIST_ROLES.find((r) => r.fixedSlug === slug)
      ?? STRATEGIST_ROLES.find((r) => r.slugPrefix && slug.startsWith(r.slugPrefix))
      // 產品策略 agent 用產品頁的角度與工具，不要套品牌定位那一套。
      ?? (row.primarySkillBundleKey === PRODUCT_STRATEGY_BUNDLE
        ? STRATEGIST_ROLES.find((r) => r.id === "product_value_prop")
        : undefined)
      ?? STRATEGIST_ROLES[0]!;
    return toDirector(row, role, false);
  });
}
