/**
 * brandPacks/wugan — 五感十築（宏國建設永續創新品牌）。
 *
 * 來源：CJ 2026-08-29 提供的四份 skill（貼文撰寫 / 月報內容規劃 / 月報
 * insight / 月報製作），加上 2026-06-15 五月月報實際貼文，以及品牌 2840
 * 在資料庫裡已驗證過的 voice.samples / voice.forbidden。
 *
 * ── 這個品牌的內容結構 ────────────────────────────────────────────────
 * 官網：原創文章（官網長文 / 十築建築展）、遇見十築
 * FB  ：四個內容分類 —— 生活實踐、生態健築、永續生活、永續價值
 * 每月 8 篇，配比 生活實踐 2 / 生態健築 3 / 永續生活 1 / 永續價值 2
 *
 * ── 十項建築標準 ──────────────────────────────────────────────────────
 * 每一篇內容都必須掛在其中一項底下。這是品牌的骨幹，不是裝飾。
 */

import type { BrandPack } from "./types";

/** 十項健康建築標準。每篇內容都要掛一項。 */
export const TEN_STANDARDS = [
  "十築自然", "十築好氧", "十築舒適", "十築安心", "十築沉靜",
  "十築友善", "十築健康", "十築美學", "十築好水", "十築珍惜",
] as const;

const STANDARDS_LINE = TEN_STANDARDS.join("、");

/**
 * 共用語氣規則。
 *
 * 前三條直接來自品牌 2840 positioning.voice.forbidden（已在資料庫裡，
 * 不是我推測的）。後面的示範句取自 voice.samples 的 ours/generic 對照。
 */
const WUGAN_VOICE = `

【品牌語氣 —— 我們會這樣說】
・「午後的陽光進到室內，帶來的是柔和明亮，而不是散不掉的悶熱——這不是運氣，是座向與日照在設計之初就被認真安排好的結果。」
・「十項健康建築標準，不是給你看的規格表。它是管線裡流動的水質、門縫間流過的空氣、腳踩在地板上時身體感受到的安定。」
・「真正懂選的人，不再追逐昂貴的標價。他們要的是一種知根知底的底氣——清楚自己住的家，每一寸都被認真對待過。」

【我們不會這樣說】
・「本建案採用最高等級建材，打造頂級豪宅生活。」
・「五感十築提供十項健康建築標準，全方位守護居住品質。」
・「懂得品味生活的人，選擇五感十築。」

【三條紅線（來自品牌定位，不可違反）】
1. 不用話術堆疊的促銷語氣 —— 禁「限時優惠」「搶先預約」「CP 值超高」「錯過不再」。
2. 不用抽象空洞的豪宅語言 —— 禁「尊榮」「頂級」「奢華」「非凡格局」「巔峰之作」。
3. 不要只堆數據與規格表。每一項規格都要落回身體感受與生活敘事，否則就是還沒寫完。

【語氣座標】嚴謹而溫潤、有底氣的克制、感知導向、不疾不徐的自信。原型是創造者與智者，不是推銷員。

【不動產廣告合規（草案，待五感十築法務確認）】
・不得使用「保證增值」「穩賺」「保證出租」「投資報酬率 X%」等收益承諾。
・不得將示意圖、參考圖說成實景。涉及圖面時標註「示意圖，非實景」。
・不得將未取得的執照、認證、獎項寫成已取得。
・涉及格局、坪數、公設比、完工時程時，一律加註「實際依合約與不動產說明書為準」。
・「首座」「唯一」「第一」等最高級用語，只有在輸入已附可查證依據時才能寫。`;

/** 貼文與長文共用的骨架說明。五感十築所有內容都走這個結構。 */
const WUGAN_SCAFFOLD = `

【固定骨架】
每一篇都以「【<十築標準>關聯度】」開頭，說明這篇內容跟哪一項標準有關、為什麼有關。
接著依內容類型展開（案例背景 / 生活實踐點 / 生態健築特點）。
最後一句是收尾金句 —— 一句可以獨立被引用的話，把整篇收回到居住感受上。不要用問句收尾，不要用行動呼籲收尾。

十項標準：${STANDARDS_LINE}。一篇掛一項為主，最多再帶一項。`;

export const WUGAN_PACK: BrandPack = {
  key: "wugan",
  brandName: "五感十築",
  // 2840 = prod。名稱比對是為了 dev 或日後重建品牌時仍能命中。
  match: { brandIds: [2840], brandNames: ["五感十築"] },

  channels: [
    {
      key: "website",
      labelZh: "官網",
      labelEn: "Website",
      formats: [
        // CJ 2026-08-29「官網的文章，有分為原創文章、還有遇見十築」。
        // 《遇見十築》是品牌自己的標準介紹專欄，性質跟一般原創文章不同
        // ——它不找外部案例，主角是五感十築自己的建築標準——所以獨立成一類。
        { id: "原創文章", labelZh: "原創文章", labelEn: "Original Articles" },
        { id: "遇見十築", labelZh: "遇見十築", labelEn: "Meeting the Ten" },
      ],
    },
    {
      key: "facebook",
      labelZh: "Facebook",
      labelEn: "Facebook",
      formats: [
        { id: "生活實踐", labelZh: "生活實踐", labelEn: "Living Practice" },
        { id: "生態健築", labelZh: "生態健築", labelEn: "Eco Architecture" },
        { id: "永續生活", labelZh: "永續生活", labelEn: "Sustainable Living" },
        { id: "永續價值", labelZh: "永續價值", labelEn: "Sustainable Value" },
      ],
    },
  ],

  cards: [
    // ══ 官網 · 長文 ══════════════════════════════════════════════════
    {
      kind: "custom",
      channel: "website",
      format: "原創文章",
      origin: "brand",
      template: {
        id: "wg-web-longform",
        tier: "30s",
        postType: "blog",
        label: { en: "Website Long-form", zh: "官網長文" },
        description: {
          en: "International case or living issue, tied to one of the ten standards",
          zh: "國際案例／生活議題／空間觀點，對應一項十築標準",
        },
        agent_id: 220751,
        skill_slug: "wugan-website-longform",
        primary_question: "要寫哪個案例或議題？想對應哪一項十築標準？",
        primary_input: {
          key: "context",
          placeholder: "例：瑞士 Hotel Sonne 的飲用水管線自動沖洗系統，想對到十築好水",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "案例／議題 + 對應標準", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.goldenCircle.why", "brand.positioning.values"],
        systemPrompt: `你在為五感十築撰寫一篇官網長文（約 1200–1600 字）。

固定結構 —— 引言 ＋ 3 個段落：

【引言】
從讀者的生活感受切入，帶出這篇要談的居住條件。不要在引言講品牌，也不要先介紹案例。

【段落一】案例背景與設計原因
這個案例是誰做的、在哪裡、為什麼這樣設計。要交代設計決策的依據，不是只描述外觀。

【段落二】核心特色一 → 生活感受
第一個特色的做法，然後翻譯成「住在裡面的人每天感受到什麼」。

【段落三】核心特色二 ＋ 五感十築觀點收尾
第二個特色，同樣落回身體感受。最後 1–2 句帶出五感十築的觀點，融進段落裡，不要獨立成段、不要變成口號。

小標要帶觀點，不要用「案例背景」「特色分析」這種分類標籤。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        outputMode: "document",
        preferredModel: "anthropic",
        maxTokens: 3200,
        outputDefaults: { platform: "doc", post_type: "report" },
      },
      config: {
        variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["官網長文"], captionMinChars: 1200, captionMaxChars: 2400,
      },
    },
    {
      kind: "custom",
      channel: "website",
      format: "遇見十築",
      origin: "brand",
      template: {
        id: "wg-web-meetten",
        tier: "30s",
        postType: "blog",
        label: { en: "Meeting the Ten (Brand Column)", zh: "《遇見十築》" },
        description: {
          en: "Executive-voice column explaining one of the ten standards",
          zh: "由執行長／創新長觀點出發，說明一項十築標準",
        },
        agent_id: 220862,
        skill_slug: "wugan-meet-ten",
        primary_question: "這一篇要談十項標準裡的哪一項？由誰的觀點來說？",
        primary_input: {
          key: "context",
          placeholder: "例：十築沉靜，由創新長觀點談為什麼隔音是基本條件而不是加價選配",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "十築標準 + 發言人觀點", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.goldenCircle.why", "brand.positioning.values", "brand.positioning.voice"],
        systemPrompt: `你在撰寫五感十築的《遇見十築》系列文章（約 1400–1800 字）。

這個系列跟官網長文的關鍵差別：**重點不是外部案例，而是把五感十築自己的建築標準說清楚。** 不要去找國際案例當主角。

寫法：
1. 由執行長／創新長的觀點出發，用第一人稱敘事帶。不要寫成訪談逐字稿，也不要寫成 Q&A。
2. 先定義這一項十築標準是什麼 —— 用生活語言定義，不要用工程術語開場。
3. 再延伸到居住感受：這項標準沒有做好的時候，人會感覺到什麼；做好了以後，日常會有什麼不同。
4. 最後才落到建築條件：要達到這件事，結構、材料、設備上實際要做什麼。
5. 收尾回到一個讀者可以自己拿去判斷房子的標準。

語氣像品牌專欄，比一般案例介紹更慢、更有份量。篇幅要夠，寫太短會變成空泛心得。

發言人姓名與職稱：輸入有就用，沒有就寫【待補：發言人職稱】，不要自己取名字。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        outputMode: "document",
        preferredModel: "anthropic",
        maxTokens: 3600,
        outputDefaults: { platform: "doc", post_type: "report" },
      },
      config: {
        variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["遇見十築"], captionMinChars: 1400, captionMaxChars: 2800,
      },
    },
    {
      kind: "custom",
      channel: "website",
      // 十築建築展也是原創產出（策展式深度案例），只是密度比一般長文高。
      // 若五感十築認為它該自成一類，把 formats 加一項再改這裡即可。
      format: "原創文章",
      origin: "brand",
      template: {
        id: "wg-web-expo",
        tier: "30s",
        postType: "blog",
        label: { en: "Ten Standards Expo", zh: "十築建築展" },
        description: {
          en: "Curated deep-dive; one case mapped across several standards",
          zh: "策展式深度案例，一案對應多項十築標準",
        },
        agent_id: 220751,
        skill_slug: "wugan-expo",
        primary_question: "要展出哪個建築案例？預計對應哪幾項十築標準？",
        primary_input: {
          key: "context",
          placeholder: "例：荷蘭 De Verwondering 小學，ORGA Architects，木構＋生物基材料，想對到自然／沉靜／珍惜／友善",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "案例 + 對應標準", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.values", "brand.positioning.differentiation.summary"],
        systemPrompt: `你在撰寫五感十築的《十築建築展》文章（約 1800–2400 字）。這是品牌策展文章，密度與資訊量都高於一般官網長文。

固定結構，順序不可調換：

【策展式開場】
一段話說明為什麼把這個案例放進十築建築展 —— 它讓我們看見什麼。

【基本資料】
案名、國家與城市、設計者、完成年份、規模／使用者、獲獎或認證。條列。

【建築案例背景】
2–3 句。設計者的意圖與核心手法。不要寫成研究筆記。

【十築價值段落】
針對輸入指定的每一項十築標準各寫一段。每段格式：
  <十築標準>： 這個案例在這一項上做了什麼（具體做法）→ 使用者實際感受到什麼。
只講做法不講感受的段落是沒寫完的，要補。

【十築觀點】
五感十築從這個案例看到什麼，它印證了我們相信的什麼。

【價值對照表】
一行一組：<十築標準> ｜ <案例中的具體做法> ｜ <對居住者的意義>

【資料來源】
可查證的來源。查不到公開來源的細節就不要寫 —— 寧可少一項特色，也不要放推論當事實。

嚴禁在沒有依據的情況下寫「首座」「唯一」「全球第一」。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        outputMode: "document",
        preferredModel: "anthropic",
        maxTokens: 4200,
        outputDefaults: { platform: "doc", post_type: "report" },
      },
      config: {
        variants: 1, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["十築建築展"], captionMinChars: 1800, captionMaxChars: 3400,
      },
    },

    // ══ Facebook · 生活實踐 ══════════════════════════════════════════
    {
      kind: "custom",
      channel: "facebook",
      format: "生活實踐",
      origin: "brand",
      template: {
        id: "wg-fb-life-practice",
        tier: "30s",
        postType: "feed",
        label: { en: "Living Practice Post", zh: "生活實踐短文" },
        description: {
          en: "Turn one standard into something readers can do this week",
          zh: "把一項十築標準轉成讀者這週就能做的事",
        },
        agent_id: 220862,
        skill_slug: "wugan-fb-life",
        primary_question: "這篇要談什麼生活情境？對應哪一項十築標準？",
        primary_input: {
          key: "context",
          placeholder: "例：父親節前的一餐飯，對到十築健康 —— 從食材、共煮到飯後活動",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "生活情境 + 對應標準", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.values", "brand.positioning.voice"],
        systemPrompt: `你在為五感十築撰寫一則 Facebook 生活實踐短文（500–800 字）。

這一類的重點：從日常生活情境切入，把十築標準轉成讀者可以理解、可以動手做的生活做法。不是介紹建築，是講生活。

結構：
【<十築標準>關聯度】
說明這個生活情境跟這項標準的關係。2–4 句。

【生活實踐點】
2–3 個具體做法。每一個做法用一個短標題起頭，接一段說明。做法要具體到讀者今天就能做 —— 「注意通風」不算，「把怕西曬的植物移離窗邊」才算。

收尾金句
一句話把整篇收回到「家可以是支持這件事的環境」。獨立成行。

不要寫成衛教文或知識整理。每個做法都要有畫面。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        preferredModel: "anthropic",
        maxTokens: 2000,
        outputDefaults: { platform: "facebook", post_type: "post" },
      },
      config: {
        variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["生活場景切入", "身體感受切入", "季節時令切入"],
        captionMinChars: 500, captionMaxChars: 900,
      },
    },

    // ══ Facebook · 生態健築 ══════════════════════════════════════════
    {
      kind: "custom",
      channel: "facebook",
      format: "生態健築",
      origin: "brand",
      template: {
        id: "wg-fb-eco-case",
        tier: "30s",
        postType: "feed",
        label: { en: "Eco Architecture Case Post", zh: "生態健築案例文" },
        description: {
          en: "How a building or material answers one of the ten standards",
          zh: "建築、材料或環境設計如何回應一項十築標準",
        },
        agent_id: 220751,
        skill_slug: "wugan-fb-eco",
        primary_question: "要介紹哪個建築或材料案例？對應哪一項十築標準？",
        primary_input: {
          key: "context",
          placeholder: "例：加拿大 Manitoba Hydro Place 的雙層外牆與中庭水幕，對到十築舒適",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "案例 + 對應標準", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.values"],
        systemPrompt: `你在為五感十築撰寫一則 Facebook 生態健築貼文（600–1000 字）。

結構：
【<十築標準>關聯度】
這個案例為什麼跟這項標準有關。2–4 句，要點出「一般人會忽略、但其實決定居住品質」的那個環節。

【案例背景】
2–3 句：案名、地點、設計者、年份、核心手法。

【生態健築特點】
2–3 個特點。每個用一個短標題起頭 ＋ 一段說明，走完「做法 → 結果 → 對居住的意義」。

收尾金句
一句話把案例的道理收回到「家」。獨立成行。

寫不出「對居住的意義」的特點就刪掉，不要湊數。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        preferredModel: "anthropic",
        maxTokens: 2400,
        outputDefaults: { platform: "facebook", post_type: "post" },
      },
      config: {
        variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["技術切入", "使用者感受切入", "問題意識切入"],
        captionMinChars: 600, captionMaxChars: 1100,
      },
    },
    {
      kind: "custom",
      channel: "facebook",
      format: "生態健築",
      origin: "brand",
      template: {
        id: "wg-fb-drive",
        tier: "30s",
        postType: "link",
        label: { en: "Traffic Post for a Website Article", zh: "官網長文導流文" },
        description: {
          en: "Short FB post that sends readers to the full article",
          zh: "搭配官網長文，引導讀者進官網閱讀",
        },
        agent_id: 220862,
        skill_slug: "wugan-fb-drive",
        primary_question: "要導流哪一篇官網長文？把它的內容或連結貼進來。",
        primary_input: {
          key: "context",
          placeholder: "貼上官網長文的全文或摘要，加上網址",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "官網長文內容 / 網址", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.voice"],
        systemPrompt: `你在為五感十築撰寫一則 Facebook 導流貼文（180–320 字），目的是讓讀者點進官網看完整長文。

結構：
1. 開頭用長文裡最有畫面的那個生活情境或反差當鉤子。2–3 句。不要用「你知道嗎」「快來看看」這種開場。
2. 中段點出這篇文章會回答什麼問題，但**不要把答案講完** —— 留下要點進去的理由。
3. 收尾一句金句 ＋ 引導閱讀。引導語要克制，「完整內容在官網」這種程度就好，不要用「立即點擊」「錯過可惜」。

導流文不是長文的摘要。摘要會讓人覺得已經看完了，就不會點。要挑一個切面把人勾住。

【<十築標準>關聯度】這一段在導流文不用寫出標題，但選鉤子時要扣著那項標準。${WUGAN_VOICE}`,
        preferredModel: "anthropic",
        maxTokens: 1200,
        outputDefaults: { platform: "facebook", post_type: "post" },
      },
      config: {
        variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["情境鉤子", "反差鉤子", "提問鉤子"],
        captionMinChars: 180, captionMaxChars: 360,
      },
    },

    // ══ Facebook · 永續生活 ══════════════════════════════════════════
    {
      kind: "custom",
      channel: "facebook",
      format: "永續生活",
      origin: "brand",
      template: {
        id: "wg-fb-gq-rewrite",
        tier: "30s",
        postType: "feed",
        label: { en: "GQ Column Rewrite", zh: "GQ 文章改寫" },
        description: {
          en: "Rework a GQ co-branded piece into a Facebook post",
          zh: "把《五感十築 X GQ》專欄改寫成 FB 貼文",
        },
        agent_id: 220862,
        skill_slug: "wugan-fb-gq",
        primary_question: "要改寫哪一篇 GQ 專欄？貼上原文。",
        primary_input: {
          key: "context",
          placeholder: "貼上《五感十築 X GQ》原文，或摘要 + 網址",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "GQ 原文", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.voice", "brand.positioning.values"],
        systemPrompt: `你在把一篇《五感十築 X GQ》專欄改寫成 Facebook 貼文（400–700 字）。

改寫原則：
1. **主角是 GQ 原文的觀點，不是五感十築。** 先把原文最有意思的那個生活主張講清楚，讓沒看過原文的人也能讀懂。
2. 中後段才把這個主張接到居住 —— 「家也是如此」這個轉折要自然，不要生硬地拉回建案。
3. 最後 2–3 句才是五感十築的觀點，扣一項十築標準。
4. 收尾金句要能獨立被引用。

比例大約是 原文觀點 6 : 居住連結 3 : 品牌觀點 1。品牌講太多就變成廣告，GQ 的讀者會直接滑掉。

不要改寫成推銷文，不要出現任何建案名稱或銷售資訊。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        preferredModel: "anthropic",
        maxTokens: 1800,
        outputDefaults: { platform: "facebook", post_type: "post" },
      },
      config: {
        variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["原文金句開場", "生活提問開場", "情境描寫開場"],
        captionMinChars: 400, captionMaxChars: 800,
      },
    },

    // ══ Facebook · 永續價值 ══════════════════════════════════════════
    {
      kind: "custom",
      channel: "facebook",
      format: "永續價值",
      origin: "brand",
      template: {
        id: "wg-fb-brand-view",
        tier: "30s",
        postType: "feed",
        label: { en: "Brand Point of View", zh: "品牌觀點文" },
        description: {
          en: "What 五感十築 believes, and the standard behind it",
          zh: "回到五感十築自己相信什麼、十築標準怎麼被理解",
        },
        agent_id: 220862,
        skill_slug: "wugan-fb-view",
        primary_question: "這篇要談哪一項十築標準或哪個品牌主張？",
        primary_input: {
          key: "context",
          placeholder: "例：談十築珍惜 —— 為什麼我們在意建材能不能被修、被換，而不是只看它新的時候多好看",
          type: "textarea",
        },
        inputs: [{ key: "context", label: "標準 / 品牌主張", type: "textarea", required: true }],
        contextSources: ["brand.name", "brand.positioning.goldenCircle.why", "brand.positioning.values", "brand.positioning.voice"],
        systemPrompt: `你在為五感十築撰寫一則 Facebook 品牌觀點貼文（400–700 字）。

這一類要回到品牌自己 —— 我們相信什麼、某項十築標準該怎麼被理解。這是四類裡唯一可以正面談品牌的，但正因如此更不能寫成宣傳。

結構：
【<十築標準>關聯度】
先講一個大多數人對這件事的既有理解或誤解。2–3 句。

正文
說明五感十築為什麼不那樣看。用具體的居住場景說明，不要用形容詞。可以講做法、材料、結構，但每一項都要落回感受。

收尾金句
一句可以獨立被引用的話，把標準變成讀者能拿去判斷房子的尺規。

嚴禁：出現建案名稱、銷售資訊、參觀預約、任何行動呼籲。這一類貼文的任務是建立理解，不是帶看。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
        preferredModel: "anthropic",
        maxTokens: 1800,
        outputDefaults: { platform: "facebook", post_type: "post" },
      },
      config: {
        variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
        aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
        variantLabels: ["破除誤解", "標準定義", "長期價值"],
        captionMinChars: 400, captionMaxChars: 800,
      },
    },
  ],
};
