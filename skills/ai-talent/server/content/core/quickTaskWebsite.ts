/**
 * quickTaskWebsite — 官網（web-）任務卡目錄。
 *
 * 2026-08-29 (CJ「官網長文會新增一個官網類別，裡面有長文還有產品描述的
 * 不同類別的任務」):
 *
 * ── 為什麼需要這個頻道 ────────────────────────────────────────────────
 * 在這之前，CatalogPlatform 只有 facebook / instagram / youtube / tiktok /
 * linkedin / email / pr / brand / audience / kol —— 全是社群與公關通路。
 * 品牌自己的官網長文（部落格文章、品牌專欄、案例深度介紹、產品頁文案）
 * 在系統裡沒有家，只能硬塞進 pr- 或 br-，然後拿到一個新聞稿版型。
 *
 * mockup 這一側其實早就備好了：PlatformMockup/web.tsx 的 WebLanding /
 * WebBlog / WebProduct 三個元件已實作並註冊為 web:landing / web:blog /
 * web:product-page。缺的只有 server 端的任務定義。
 *
 * ── 形式分類（format）─────────────────────────────────────────────────
 * 官網底下分兩類，對應 UI 的 pill：
 *   長文     —— web-30-longform / web-30-column / web-30-case-study
 *   產品描述 —— web-30-product-desc / web-30-product-faq
 *
 * 這裡的卡是「任何品牌都用得到的通用形式」。品牌專有的長文型態（例如
 * 五感十築的《遇見十築》、十築建築展）走 brandPacks 那一層注入，不放在
 * 全域目錄裡 —— 否則每個客戶的任務頁都會看到別人的專有名詞。
 *
 * ── 為什麼全部是 document 模式 ────────────────────────────────────────
 * outputMode:"document" 讓 orchestra 跳過社群 caption 骨架（台灣社群 master
 * persona +「主角必須是輸入內容」+ 貼文格式規則）。官網長文一旦走那條路，
 * 會被改寫成一則貼文 —— 這正是 2026-05-16 KOL Brief 那個 bug 的成因。
 *
 * ── outputDefaults.platform 為什麼是 "doc" 不是 "web" ─────────────────
 * mission_outputs.platform 是 enum，值域 facebook/instagram/linkedin/
 * youtube/google_ads/email/ppt/doc/script/other，沒有 web。recordTaskRun
 * 的 SAFE_PLATFORMS 會把未知值默默降級成 "other"，能寫入但丟失語意。
 * "doc" 在值域內且語意正確，所以用它。mockup 不受影響 —— RunPage 的
 * Layer 1 由 taskId 前綴決定（web- → web），優先於 DB 欄位。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

/** 官網文章共用的語氣底線。所有 web- 卡的 systemPrompt 末端都接這一段。 */
const WEB_TONE = `

【共通要求】
- 繁體中文，台灣用語。
- 從讀者的具體生活情境或處境開場，不要用「在這個瞬息萬變的時代」這類空話起手。
- 專業詞、外語詞先轉成讀者看得懂的日常語言，再說明它的用途與影響。必要的專有名詞可保留，但要補一句中文說明。
- 技術資料用來支撐觀點，不是炫耀專業。每一項規格都要說清楚它替讀者解決了什麼、改善了什麼條件。
- 不要寫成資料整理文、百科條目或提案簡報。
- 沒有把握的事實不要寫。需要品牌自行補上的資訊，用【待補：xxx】標記，不要杜撰，也不要反問使用者。`;

export const WEBSITE_30S_TASKS: FBTaskTemplate[] = [
  // ── 長文 ────────────────────────────────────────────────────────────
  {
    id: "web-30-longform",
    tier: "30s",
    postType: "blog",
    label: { en: "Website Long-form Article", zh: "官網長文" },
    description: {
      en: "Intro + 3 sections — a case, an issue, or a point of view",
      zh: "引言＋3 段落，介紹一個案例、議題或觀點",
    },
    agent_id: 220751, // Jake Chou — Insights Storyteller
    skill_slug: "website-longform",
    primary_question: "這篇要寫什麼案例、議題或觀點？連同你想帶到的角度一起說。",
    primary_input: {
      key: "context",
      placeholder: "例：某個國外的健康住宅案例，想帶到「空氣品質怎麼影響每天的睡眠」這個角度",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "題材與角度", type: "textarea", required: true }],
    contextSources: [
      "brand.name",
      "brand.industry",
      "brand.positioning.goldenCircle.why",
      "brand.positioning.differentiation.summary",
      "brand.positioning.audience.primary",
    ],
    systemPrompt: `你在寫一篇放在品牌官網上的長文（約 1200–1800 字）。

固定結構 —— 引言 ＋ 3 個段落，不要多一段也不要少一段：

【引言】
丟出一個讀者會有共鳴的生活感受或具體情境，帶出這篇要回答的問題。不要在引言就講品牌。

【段落一】背景與成因
這個案例／議題是什麼、發生在哪裡、由誰做的、為什麼會這樣做。給出設計或決策的依據，不只是描述現象。

【段落二】核心特點一 → 落回人的感受
挑一個最有感的特點，說清楚它的做法，然後把它翻譯成「住在裡面／使用的人每天會感受到什麼」。

【段落三】核心特點二 ＋ 收尾
第二個特點，同樣要落到人的感受。品牌觀點融進這一段的最後 1–2 句，不要獨立成第四段，也不要突然變成品牌口號。

小標寫法：帶觀點，不要只是「背景介紹」「特點分析」這種分類標籤。

一篇只講一件事。主軸單一，不要把三個不相關的重點塞進同一篇。${WEB_TONE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 3200,
    outputDefaults: { platform: "doc", post_type: "report" },
  },
  {
    id: "web-30-column",
    tier: "30s",
    postType: "blog",
    label: { en: "Brand Column (Executive POV)", zh: "品牌專欄（高層觀點）" },
    description: {
      en: "Narrative long-form in a founder or executive's voice",
      zh: "以創辦人／高階主管觀點出發的敘事長文",
    },
    agent_id: 220862, // Rita Chen — Brand Narrative Editor
    skill_slug: "brand-column",
    primary_question: "這一篇要談品牌的哪個主張或標準？由誰的觀點來說？",
    primary_input: {
      key: "context",
      placeholder: "例：由執行長觀點談「安靜」這件事 —— 為什麼我們把隔音當成基本條件，而不是加價選配",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "主張 + 發言人觀點", type: "textarea", required: true }],
    contextSources: [
      "brand.name",
      "brand.positioning.goldenCircle.why",
      "brand.positioning.values",
      "brand.positioning.voice",
    ],
    systemPrompt: `你在寫一篇品牌專欄長文（約 1400–2000 字），由品牌的創辦人或高階主管觀點出發。

這不是案例介紹文，重點是把品牌自己相信的一個主張／標準說清楚。

寫法：
1. 先從人的感受或一個真實的生活困擾開場 —— 讀者要先覺得「這個我有經歷過」。
2. 再自然帶入發言人的觀點。用敘事的方式帶，不要寫成 Q&A，也不要寫成訪談逐字稿。
3. 後段才慢慢落到具體的做法、材料、結構、條件 —— 說明這個主張在實務上長什麼樣子。
4. 收尾回到一個「讀者可以拿來判斷的標準」，不是知識結論，也不是品牌口號。

篇幅要夠。這類文章寫太短會變成空泛的心得，失去專欄的份量。

發言人的姓名與職稱若輸入裡有就用，沒有就寫【待補：發言人姓名／職稱】，不要自己取名字。${WEB_TONE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 3600,
    outputDefaults: { platform: "doc", post_type: "report" },
  },
  {
    id: "web-30-case-study",
    tier: "30s",
    postType: "blog",
    label: { en: "In-depth Case Study", zh: "案例深度介紹" },
    description: {
      en: "Curated, higher-density case write-up with a value table",
      zh: "策展式的完整案例展示，密度高於一般長文",
    },
    agent_id: 220751, // Jake Chou — Insights Storyteller
    skill_slug: "case-study",
    primary_question: "要介紹哪個案例？它值得寫的地方在哪裡？",
    primary_input: {
      key: "context",
      placeholder: "例：荷蘭某小學，木構＋生物基材料，想對到「自然」「安靜」「珍惜」三個主張",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "案例 + 想對應的品牌主張", type: "textarea", required: true }],
    contextSources: ["brand.name", "brand.positioning.values", "brand.positioning.differentiation.summary"],
    systemPrompt: `你在寫一篇策展式的案例深度介紹（約 1600–2200 字）。密度比一般官網長文高，資訊要更完整。

結構：

【策展式開場】
一段話說明「為什麼現在要看這個案例」，給讀者一個進入的理由。

【基本資料】
案名、所在地、完成年份、設計者、規模／使用者。條列，簡潔。

【案例背景】
壓縮成 2 句：第一句交代設計者／年份／地點／用途，第二句交代核心的空間或技術手法。不要寫成研究筆記。

【特色】
2–4 個 bullet。每個 bullet 寫成「•短標題」加一段說明。短標題要像簡報標題，不是備註標籤。
每一點都要走完「做法 → 帶來的結果 → 可以學到什麼」三段。只講做法不講結果的，就是還太抽象，要改。
兩個 bullet 如果講的是同一件事，合併，不要湊數。

【觀點】
品牌看這個案例看到什麼、它印證了什麼。

【價值對照】
把案例的特點對到品牌主張，一行一組。

【資料來源】
列出可查證的來源。查不到公開來源的細節就不要寫進去 —— 寧可少寫一個特點，也不要放推論當事實。

嚴禁「首座」「首次」「前所未見」這類最高級宣稱，除非輸入裡已經附上可查證的依據。${WEB_TONE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 4000,
    outputDefaults: { platform: "doc", post_type: "report" },
  },

  // ── 產品描述 ────────────────────────────────────────────────────────
  {
    id: "web-30-product-desc",
    tier: "30s",
    postType: "product-page",
    label: { en: "Product Page Copy", zh: "產品頁文案" },
    description: {
      en: "Hero line, value points, and spec framing for a product page",
      zh: "產品頁的主標、價值段落與規格陳述",
    },
    agent_id: 238853,
    skill_slug: "product-page",
    primary_question: "這個產品是什麼？賣給誰、解決什麼問題？",
    primary_input: {
      key: "context",
      placeholder: "產品名稱 + 主要規格 + 想強調的賣點 + 目標客群",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "產品資料", type: "textarea", required: true }],
    contextSources: [
      "brand.name",
      "brand.positioning.audience.primary",
      "product.positioning.coreStatement",
      "product.positioning.usp",
    ],
    systemPrompt: `你在寫一個產品頁的文案（約 600–900 字）。

輸出結構：
【主標】一句話說清楚這是什麼、給誰用。不要用形容詞堆疊。
【副標】一句補充，帶出最主要的差異點。
【價值段落】3 段，每段一個小標 ＋ 一段說明。每段只講一個好處，並且把規格翻譯成「使用者實際會感受到什麼」。
【規格重點】條列。照實寫，不美化。
【行動呼籲】一句，具體說明下一步要做什麼（不是「立即購買」這種通用句）。

寫作準則：
- 規格本身不是賣點，規格帶來的差別才是。每寫一個數字就要接一句「所以你會感覺到什麼」。
- 不要用「業界領先」「頂級」「極致」這類無法驗證的詞。
- 輸入沒提供的規格不要補，用【待補：xxx】標記。${WEB_TONE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 1800,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },
  {
    id: "web-30-product-faq",
    tier: "30s",
    postType: "product-page",
    label: { en: "Product FAQ", zh: "產品常見問答" },
    description: {
      en: "The questions buyers actually ask, answered straight",
      zh: "買家真的會問的問題，直接回答",
    },
    agent_id: 60002,
    skill_slug: "product-faq",
    primary_question: "這個產品的客戶最常問什麼？有哪些顧慮？",
    primary_input: {
      key: "context",
      placeholder: "產品 + 已知的常見問題 + 客戶常見的疑慮或誤解",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "產品 + 已知問題", type: "textarea", required: true }],
    contextSources: ["brand.name", "product.positioning.coreStatement", "brand.positioning.audience.primary"],
    systemPrompt: `你在寫產品頁的常見問答（8–12 組）。

每一組：
Q：用客戶真的會講的話寫，不要寫成官方語言。
A：直接回答，2–4 句。先給答案，再補理由。

選題原則：
- 優先寫「會擋住購買決定」的問題（規格疑慮、適用性、售後、比較），不要只寫方便回答的問題。
- 客戶的誤解要正面澄清，不要迴避。
- 不確定或需要因案而異的，寫「這取決於 ___，建議 ___」，不要給假確定。

嚴禁：
- 把 FAQ 寫成推銷文。每個答案的重點是解決疑問，不是再賣一次。
- 承諾任何無法保證的結果。${WEB_TONE}`,
    outputMode: "document",
    preferredModel: "anthropic",
    maxTokens: 2200,
    outputDefaults: { platform: "doc", post_type: "product_desc" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "web-30-longform-open-books",
    tier: "30s",
    postType: "blog",
    label: { en: "Long-form: Open the Books", zh: "官網長文：把成本和取捨攤開來寫" },
    description: { en: "Publish the ugly numbers yourself", zh: "把難看的數字自己寫出來" },
    agent_id: 220751, // 沿用同 postType 現役卡
    skill_slug: "website-longform",
    source: {
      type: "viral",
      short: "Patagonia「Don't Buy This Jacket」",
      metric: "隔年營收成長約三成至 5.43 億美元",
      asOf: "2011-11",
      takeaway:
        "把不利於自己的數字自己寫出來，讀者就沒有理由懷疑其他數字——透明的說服力來自你放棄的辯解空間。",
    },
    primary_question: "你的產品有哪些成本或取捨，是一般不會公開的？",
    primary_input: { key: "topic", placeholder: "例：一件的用水量 / 為什麼比別人貴 / 哪裡妥協了", type: "textarea" },
    inputs: [
      { key: "topic", label: "通常不會公開的成本或取捨", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一篇官網長文，公開產品的成本與取捨，包含對自己不利的部分。

結構：
1. 開頭直接給一個對自己不利的數字，不鋪陳。
2. 拆解：這個數字怎麼來的，逐項列出。
3. 我們試過什麼方法降低它，哪些失敗了。失敗要寫清楚。
4. 目前的取捨是什麼、為什麼選這個。
5. 還沒解決的部分，以及打算什麼時候處理。

硬規則：
- 至少要有一個對自己不利的具體數字，沒有就不要寫這篇。
- 不要在文末轉成促銷，最後一段仍然講未解決的問題。
- 不要拿競爭對手當對照。
- 沒有實際數據的段落要註明是估算，並寫出估算方式。
- 1200-2400 字。`,
    preferredModel: "qwen",
    maxTokens: 5280,
    outputDefaults: { platform: "doc", post_type: "report" },
  },
  {
    id: "web-30-product-page-plain-talk",
    tier: "30s",
    postType: "product-page",
    label: { en: "Product Page: Talk, Don't Pitch", zh: "產品頁：用講話的方式賣東西" },
    description: { en: "One person, one take, no spec sheet", zh: "一個人把話講完，沒有規格表" },
    agent_id: 238853, // 沿用同 postType 現役卡
    skill_slug: "product-page",
    source: {
      type: "viral",
      short: "Dollar Shave Club",
      metric: "48 小時 12,000 筆訂單，首小時官網被灌爆",
      asOf: "2012-03",
      takeaway:
        "產品頁最有效的版本常常是「一個人把話講完」——先講價格與最直接的好處，把規格留到願意往下滑的人再看。",
    },
    primary_question: "如果只能講一段話介紹這個產品，你會說什麼？",
    primary_input: { key: "topic", placeholder: "例：它就是一把好刮的刀，一個月一百塊", type: "textarea" },
    inputs: [
      { key: "topic", label: "你會親口講的那一段介紹", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一個產品頁，全篇像一個人在講話，不是型錄。

結構：
1. 開頭 2 句：這是什麼、多少錢。價格不要藏。
2. 一段自嘲或反話術，先把讀者心裡的懷疑講出來。
3. 三個具體好處，每個配一個生活情境，不要用形容詞堆疊。
4. 誰不適合買——明確講出來。
5. 規格與細節放最後，用清單。

硬規則：
- 前四段不准出現「頂級／極致／完美／領先／匠心」。
- 「誰不適合買」一定要寫，而且要是真的。
- 價格若無法確定，寫成「待填」，不要編。
- 500-1000 字。`,
    preferredModel: "qwen",
    maxTokens: 2200,
    outputDefaults: { platform: "doc", post_type: "report" },
  },
];

/**
 * 官網卡的 orchestra 參數。
 *
 * 全部 runImageGen:false —— 官網長文的配圖規則（主圖用案例官方照、配圖要
 * 能支撐文章講的特點）不是 AI 生圖能滿足的，硬生會產出漂亮但與內容無關的
 * 圖。使用者要圖時走 MediaGenFlow 另外開。
 *
 * variants 一律 1：長文沒有「給你三個版本挑」的意義，讀者只會看到一篇，
 * 而且三倍長度的產出會直接撞上 token 上限。要改稿走 RunPage 的重寫。
 */
export const WEBSITE_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "web-30-longform": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["官網長文"], captionMinChars: 1200, captionMaxChars: 2400,
  },
  "web-30-column": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["品牌專欄"], captionMinChars: 1400, captionMaxChars: 2800,
  },
  "web-30-case-study": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["案例深度"], captionMinChars: 1600, captionMaxChars: 3000,
  },
  "web-30-product-desc": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["產品頁"], captionMinChars: 600, captionMaxChars: 1400,
  },
  "web-30-product-faq": {
    variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["常見問答"], captionMinChars: 600, captionMaxChars: 1800,
  },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "web-30-longform-open-books": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["成本版", "取捨版", "失敗紀錄版"],
    captionMinChars: 1200, captionMaxChars: 2400,
  },
  "web-30-product-page-plain-talk": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["口語版", "比價版", "反話術版"],
    captionMinChars: 500, captionMaxChars: 1000,
  },
};

export function getWebsiteOrchestraConfig(taskId: string): OrchestraConfig | null {
  return WEBSITE_30S_ORCHESTRA[taskId] ?? null;
}
