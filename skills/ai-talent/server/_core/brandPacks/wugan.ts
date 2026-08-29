/**
 * brandPacks/wugan — 五感十築（宏國建設永續創新品牌）。
 *
 * 來源：CJ 2026-08-29 提供的貼文撰寫 skill 與後續結構指示，加上
 * 2026-06-15 五月月報的實際貼文與配比，以及品牌 2840 在資料庫裡已驗證過的
 * voice.samples / voice.forbidden。
 *
 * ── 四個頻道 ──────────────────────────────────────────────────────────
 * 官網    ：原創文章 / 遇見十築 / 十築建築展   ← 三種是不同性質，各自成卡
 * Facebook：生活實踐 / 生態健築 / 永續生活 / 永續價值 / 分享文
 * 案例    ：十項標準各一張，獨立於月報
 * 行事曆  ：每種內容類型一張，按下去產出該類型當月篇數的摘要，獨立於月報
 *
 * ── 為什麼案例與行事曆要獨立於月報 ────────────────────────────────────
 * CJ 2026-08-29「案例設立獨立於月報的任務卡」「行事曆，獨立於月報，成立一個
 * 區塊」。案例庫是持續累積的素材，行事曆是每月的內容規劃 —— 兩者都不該只在
 * 做月報的時候才存在。月報是把它們整理出來的產物，不是它們的容器。
 *
 * ── 十項建築標準 ──────────────────────────────────────────────────────
 * 每一篇內容都必須掛在其中一項底下。這是品牌的骨幹，不是裝飾。
 */

import type { BrandPack, BrandPackCard } from "./types";
import type { FBTaskTemplate, OrchestraConfig } from "../quickTaskFB";

/**
 * 十項健康建築標準，以及各自的關注面向。
 *
 * focus 是給案例搜尋用的切面提示 —— 沒有它，十張案例卡的 prompt 會長得
 * 一模一樣，模型只能靠標準名稱猜，產出會全部往「綠建築」那個平均值靠。
 * 這些切面對得上五月月報實際用過的案例（好水→Hotel Sonne 管線自動沖洗、
 * 珍惜→TAKT 可維修家具、舒適→Manitoba 雙層外牆與水幕）。
 */
export const TEN_STANDARDS: { name: string; focus: string }[] = [
  { name: "十築自然", focus: "綠意配置、生物多樣性、親生命設計、室內外連結、可接觸的自然" },
  { name: "十築好氧", focus: "自然通風、新風與換氣、空氣品質監測、二氧化碳與揮發性有機物控制" },
  { name: "十築舒適", focus: "溫度與濕度調節、熱舒適、外殼隔熱、體感穩定度" },
  { name: "十築安心", focus: "結構安全、防火、防災韌性、建材安全性、長期維護" },
  { name: "十築沉靜", focus: "隔音構造、樓板衝擊音、聲景設計、噪音源隔離" },
  { name: "十築友善", focus: "通用設計、無障礙、共享空間、鄰里與社區連結、全齡使用" },
  { name: "十築健康", focus: "促進日常活動的空間、身心恢復、光照節律、健康習慣的養成條件" },
  { name: "十築美學", focus: "光影、比例、材質觸感、空間秩序、經得起時間的設計" },
  { name: "十築好水", focus: "飲用水水質、管線衛生與停滯控制、雨水與中水再利用、節水" },
  { name: "十築珍惜", focus: "材料循環與可拆解、可維修可替換、碳足跡揭露、延長使用壽命" },
];

const STANDARDS_LINE = TEN_STANDARDS.map((s) => s.name).join("、");

/**
 * 每月各類型的產出篇數，供行事曆卡決定要產幾篇摘要。
 *
 * FB 那四項來自五月月報 slide 36（生活實踐 2 / 生態健築 3 / 永續生活 1 /
 * 永續價值 2）。官網那三項是拆分 slide 35 的「原創長文 4 篇」而來 ——
 * **這個 2/1/1 的拆法是推的，不是月報寫的，待五感十築確認。**
 * 要改就改這裡一個數字，行事曆卡的變體數會跟著動。
 */
export const MONTHLY_QUOTA = {
  官網長文: 2,
  遇見十築: 1,
  十築建築展: 1,
  生活實踐: 2,
  生態健築: 3,
  永續生活: 1,
  永續價值: 2,
} as const;

/**
 * 共用語氣規則。
 *
 * 前三條紅線直接來自品牌 2840 positioning.voice.forbidden（已在資料庫裡，
 * 不是推測的）。示範句取自 voice.samples 的 ours/generic 對照。
 *
 * 第 4、5 條是 2026-08-29 首次實跑 wg-fb-life-practice 後補的：變體 2 自行
 * 斷言五感十築有「新風系統」與「IAQ 監測」，而輸入裡沒有這些資訊；同一則還
 * 混進一個日文假名。兩者都是產出看起來很順、但實際上不能出稿的問題。
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

【五條紅線，不可違反】
1. 不用話術堆疊的促銷語氣 —— 禁「限時優惠」「搶先預約」「CP 值超高」「錯過不再」。
2. 不用抽象空洞的豪宅語言 —— 禁「尊榮」「頂級」「奢華」「非凡格局」「巔峰之作」。
3. 不要只堆數據與規格表。每一項規格都要落回身體感受與生活敘事，否則就是還沒寫完。
4. **不得斷言五感十築建案具備任何未在輸入中提供的設備、系統或認證。** 包括但不限於新風系統、空氣品質監測、淨水設備、智慧家居。要談這類條件時，寫成通則（「能持續換氣的家」）或條件句（「若住家配有…」），不要寫成「我們的建案有…」。這一條在 2026-08-29 首次試跑時被違反過。
5. 全文只用繁體中文與必要的英文專有名詞。不得出現日文假名、簡體字或其他語言的殘留字元。

【語氣座標】嚴謹而溫潤、有底氣的克制、感知導向、不疾不徐的自信。原型是創造者與智者，不是推銷員。

【Hashtag 規則】
Facebook 貼文結尾固定 4–6 個 hashtag，第一個是 #五感十築，第二個是本篇對應的十築標準（例如 #十築好氧），其餘為主題相關。官網文章與行事曆摘要一律不加 hashtag。

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

/** 少寫一層巢狀。custom 卡的共同結構就這四個欄位。 */
function card(
  channel: BrandPack["channels"][number]["key"],
  format: string,
  template: FBTaskTemplate,
  config: OrchestraConfig,
  origin: "brand" | "sowork" = "brand",
): BrandPackCard {
  return { kind: "custom", channel, format, origin, template, config };
}

/** 沒有圖、單一產出的 config —— 長文與摘要類卡片的預設。 */
function textConfig(labels: string[], min: number, max: number): OrchestraConfig {
  return {
    variants: labels.length, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: labels, captionMinChars: min, captionMaxChars: max,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Facebook 分享文 —— 三種來源，骨架相同、素材與比例不同
// ══════════════════════════════════════════════════════════════════════

/**
 * CJ 2026-08-29「Facebook的任務，還分成 GQ文章分享文、遇見十築文章分享文
 * 還有原創官網分享文」。
 *
 * 三種都是把一篇既有長文改寫成 FB 貼文，差別在「主角是誰」與「品牌可以講
 * 多少」：GQ 是聯名媒體，主角是 GQ 的生活主張，品牌只能收尾帶一下；遇見
 * 十築本來就是品牌自己的專欄，可以正面講標準；官網原創文的主角是案例。
 * 比例寫死在各自的 prompt 裡，不靠模型自己拿捏。
 */
function shareCard(args: {
  id: string;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
  question: string;
  placeholder: string;
  ratio: string;
  extra: string;
}): BrandPackCard {
  return card(
    "facebook",
    "分享文",
    {
      id: args.id,
      tier: "30s",
      postType: "link",
      label: { en: args.labelEn, zh: args.labelZh },
      description: { en: args.descEn, zh: args.descZh },
      agent_id: 220862, // Rita Chen — Brand Narrative Editor
      skill_slug: args.id,
      primary_question: args.question,
      primary_input: { key: "context", placeholder: args.placeholder, type: "textarea" },
      inputs: [{ key: "context", label: "原文內容 / 連結", type: "textarea", required: true }],
      contextSources: ["brand.name", "brand.positioning.voice", "brand.positioning.values"],
      systemPrompt: `你在把一篇既有長文改寫成 Facebook 分享貼文（350–650 字）。

【比例】${args.ratio}
比例是硬性要求，不是建議。品牌講太多就變成廣告，讀者會直接滑掉。

【結構】
1. 開場用原文裡最有畫面的那個情境或反差當鉤子，2–3 句。不要用「你知道嗎」「快來看看」這種起手式。
2. 中段把原文的核心主張講清楚，讓沒點進去的人也能讀懂重點。**但不要把結論全講完** —— 留下點進去的理由。
3. 收尾金句 ＋ 克制的引導閱讀（「完整內容在官網」這種程度即可）。

${args.extra}

分享文不是摘要。摘要會讓人覺得已經看完了，就不會點。要挑一個切面把人勾住。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
      preferredModel: "anthropic",
      maxTokens: 1800,
      outputDefaults: { platform: "facebook", post_type: "post" },
    },
    textConfig(["情境鉤子", "反差鉤子", "提問鉤子"], 350, 700),
  );
}

// ══════════════════════════════════════════════════════════════════════
// 案例卡 —— 十項標準各一張，獨立於月報
// ══════════════════════════════════════════════════════════════════════

/**
 * CJ 2026-08-29「案例設立獨立於月報的任務卡。分為十個建築標準，分別成立
 * 一個獨立的任務卡。用戶可以看想點選哪一個任務卡，看該任務卡所產出的任務」。
 *
 * 每張卡負責一項標準的國際案例查找與提報。分開的好處是產出會累積在各自的
 * 任務底下 —— 點進「十築好水」就看得到歷來找過的好水案例，去重才有依據。
 *
 * 提報格式取自五月月報實際的案例條目（案例背景 / 特點 / 十築價值對照 /
 * 資料來源）。若五感十築的月報製作 skill 另有規定的提報表格，改這裡即可。
 */
function caseCard(std: { name: string; focus: string }, index: number): BrandPackCard {
  const short = std.name.replace("十築", "");
  return card(
    "case",
    std.name,
    {
      id: `wg-case-${index + 1}`,
      tier: "30s",
      postType: "research",
      label: { en: `Case Scouting — ${std.name}`, zh: `${std.name}｜案例提報` },
      description: {
        en: `International cases that answer the ${short} standard`,
        zh: `查找並提報回應「${short}」的國際建築案例`,
      },
      agent_id: 220751, // Jake Chou — Insights Storyteller
      skill_slug: `wugan-case-${index + 1}`,
      primary_question: `這次要找哪個方向的${short}案例？已經用過哪些，不要重複？`,
      primary_input: {
        key: "context",
        placeholder: `例：想找住宅或學校類的${short}案例。已用過：（貼上先前提報過的案名，避免重複）`,
        type: "textarea",
      },
      inputs: [{ key: "context", label: "查找方向 + 已用過的案例", type: "textarea", required: true }],
      contextSources: ["brand.name", "brand.positioning.values"],
      systemPrompt: `你在為五感十築的「${std.name}」建立案例庫，提報 3 個可用的國際建築案例。

【這項標準關注什麼】
${std.focus}

【去重】
輸入裡若列出已用過的案例，一律不得重複提報，也不要提報同一設計者在同一城市的高度相似案例。找不到足夠的新案例時，寧可只提報 2 個並說明「符合條件的新案例不足」，不要湊數。

【每個案例的提報格式】（每一段的標題都要寫出來，不可省略）
案名（原文名稱 ＋ 中譯）
所在地｜設計者｜完成年份｜建築類型與規模
【案例背景】2–3 句：為什麼這樣設計，核心手法是什麼。
【${std.name}對應點】2–3 個。每一點寫「具體做法 → 使用者實際感受到什麼」。只寫做法不寫感受的，代表還沒想清楚，要補。
【可延伸的十築價值】除了${std.name}，這個案例還能對到哪一兩項標準。
【查證狀態】見下方規則，只能填「已附來源」或「待查證」。
【待查項目】把你沒有把握的欄位逐一列出（設計者／完成年份／獎項／規模／技術細節）。沒有就寫「無」。
【建議查證方式】一句話說明用什麼關鍵字、去哪個來源查最快。

【查證狀態的規則 —— 這是這張卡最重要的一條】
你沒有連網能力，無法即時查證。所以：
- 只有當「使用者在輸入裡附了該案例的連結或出版品」時，才可以填「已附來源」。
- 其餘一律填「待查證」，不准填「高」「可信度高」或任何等同保證的字眼。
- 不准輸出你不確定其存在的網址。**不要給首頁網址（例如 archdaily.com、事務所官網首頁）充當來源** —— 那不構成查證，只是把查證工作丟回給讀者。沒有具體文章連結就不要寫連結。
- 設計者、完成年份、獎項名稱、獲獎年份這四項最容易記錯。只要有一絲不確定就寫【待查】並列進【待查項目】，不要填近似值。

【為什麼要這麼嚴】
2026-08-29 第一次試跑這張卡時，模型提報了 De Verwondering 小學，把設計者寫成 Cepezed Architects、獎項寫成「2023 年荷蘭建築獎」，並自評可信度「高」；而五感十築自己的五月月報記載的是 ORGA Architects、2021 Gouden Kikker 獎與 2023 Stephen R. Kellert 獎。案例庫的產出會往下餵給十築建築展與官網長文，錯一次會一路擴散。**寧可整份都標「待查證」，也不要給一個看起來可信的錯誤。**

【其他要求】
- 只提報你確實有印象的真實案例。完全沒把握就不要湊數 —— 少提報一個，遠好過提報一個不存在的。
- 不要用「首座」「唯一」「全球第一」，除非使用者在輸入裡已附上依據。
- 最後補一段【提報說明】：三個案例分別涵蓋什麼型態、跟已用過的案例差異在哪。${WUGAN_VOICE}`,
      outputMode: "document",
      preferredModel: "anthropic",
      maxTokens: 3400,
      outputDefaults: { platform: "doc", post_type: "report" },
    },
    {
      ...textConfig([std.name], 800, 2600),
      // 2026-08-29 實跑 wg-case-9：三個案例的完整提報在 40s 預設預算下
      // attempt 1 逾時，靠重試才成功（總共 75s）。給足預算避免白跑一次。
      captionBudgetMs: 80_000,
    },
  );
}

// ══════════════════════════════════════════════════════════════════════
// 行事曆卡 —— 每種內容類型一張，產出當月篇數的摘要
// ══════════════════════════════════════════════════════════════════════

/**
 * CJ 2026-08-29「行事曆，獨立於月報，成立一個區塊，每種類型的內容都有獨立
 * 的任務卡，按下去後，會產出符合該篇數要求的內容篇數，寫法則跟月報當中每
 * 一篇文的摘要方式相同」。
 *
 * variants = 1，**不是**該類型的當月篇數。
 *
 * 一開始做成「一篇一變體」（variants = N），想借用 RunPage 的逐變體編輯 UI。
 * 2026-08-29 實跑 wg-cal-eco-architecture（3 篇）證明那是錯的：
 *   · orchestra 的每個變體是獨立呼叫，變體之間看不到彼此
 *   · 於是變體 1 與變體 2 各自把整個月的 3 篇都寫了一遍，只有變體 3 寫一篇
 *   · 而且三個變體各自挑標準，變體 1 排舒適/好氧/自然、變體 2 排舒適/好氧/
 *     安心 —— 「N 篇之間標準不重複」這個要求在獨立生成下根本無法成立
 *
 * 行事曆的本質是「整月一起排」：標準不能重複、日期要避開已佔用檔期、整月
 * 要有節奏。這些都需要同時看到全部 N 篇才做得到，所以必須在同一次生成裡完成。
 */
function calendarCard(args: {
  channelPill: "官網" | "Facebook";
  type: keyof typeof MONTHLY_QUOTA;
  labelEn: string;
  guidance: string;
}): BrandPackCard {
  const n = MONTHLY_QUOTA[args.type];
  return card(
    "calendar",
    args.channelPill,
    {
      id: `wg-cal-${args.labelEn.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      tier: "30s",
      postType: "calendar",
      label: { en: `Calendar — ${args.labelEn}`, zh: `${args.type}｜當月排程（${n} 篇）` },
      description: {
        en: `${n} post outlines for the month, in monthly-report summary form`,
        zh: `產出當月 ${n} 篇的內容摘要，格式同月報`,
      },
      agent_id: 220535, // Yu-Ting Tien — Creative Production Manager
      skill_slug: `wugan-calendar-${args.labelEn.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      primary_question: "這個月的議題設定是什麼？有哪些節慶、時令或品牌活動要納入？",
      primary_input: {
        key: "context",
        placeholder: "例：9 月。中秋、開學、颱風季尾。想聚焦在家的空氣與濕度。已排定：9/18 GQ 聯名。",
        type: "textarea",
      },
      inputs: [{ key: "context", label: "月份 + 議題設定 + 已排定事項", type: "textarea", required: true }],
      contextSources: ["brand.name", "brand.positioning.values", "brand.positioning.audience.primary"],
      systemPrompt: `你在為五感十築規劃「${args.type}」這個類型當月的內容排程。

【產出篇數】
一次輸出 ${n} 篇的摘要，依建議日期由早到晚排列。不多不少，就是 ${n} 篇。
${n === 1 ? "這個類型當月只有 1 篇，把它排好即可。" : `${n} 篇要一起規劃，因為它們彼此有關係 —— 標準不能重複、日期不能撞、整月要有節奏。`}

${args.guidance}

【每一篇的摘要格式】
標題：一句，就是這篇最後會用的標題，不是主題描述。
對應標準：${STANDARDS_LINE} 其中一項。
建議日期：依輸入的月份與已排定事項給一個具體日期（例如 9/4（三）），避開已佔用的檔期。
切角：一段話說明這篇從哪裡切入、要回答讀者什麼問題。
內容要點：3 條，就是正文會展開的三個段落各自要講什麼。
收尾方向：一句，這篇最後要把讀者帶到哪個感受。

【整體要求】
- ${n} 篇之間的十築標準不得重複，切角也不得重複。同一個月連續講兩篇通風，讀者會覺得在跳針。
- 建議日期要避開輸入裡已排定的檔期。
- 依輸入的時令與節慶安排順序，讓整月讀起來有節奏。
- ${n} 篇全部列完後，補一段「整月節奏說明」，用兩三句講清楚為什麼是這個順序。
- 每一篇都要具體到「照著這份摘要就能直接寫全文」。寫成「談談居家健康」這種程度等於沒規劃。
- 摘要不加 hashtag。${WUGAN_VOICE}`,
      outputMode: "document",
      preferredModel: "anthropic",
      // 隨篇數放大。2026-08-29 第二次實跑：3 篇一次產出時 maxTokens 2000
      // 會截斷，而且 40s 的預設 caption 預算會逾時兩次、變體回空字串
      // （任務顯示成功、產出卻空白）。
      maxTokens: 1400 * n,
      outputDefaults: { platform: "doc", post_type: "report" },
    },
    {
      // 單一產出，篇數靠 prompt 控制。字數下限隨篇數放大，避免 ${n} 篇被壓縮成條列。
      ...textConfig(["當月排程"], 300 * n, 1200 * n),
      // 上限 90s：nginx /trpc 是 230s、Node 220s，30s 層同步回應，留餘裕。
      captionBudgetMs: Math.min(40_000 + 25_000 * n, 90_000),
    },
  );
}

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
        // CJ 2026-08-29：官網分原創文章與遇見十築；十築建築展也要獨立成卡。
        // 三者性質不同 —— 原創文章的主角是外部案例或議題，遇見十築的主角是
        // 品牌自己的標準，十築建築展是策展式的深度案例展示。
        { id: "原創文章", labelZh: "原創文章", labelEn: "Original Articles" },
        { id: "遇見十築", labelZh: "遇見十築", labelEn: "Meeting the Ten" },
        { id: "十築建築展", labelZh: "十築建築展", labelEn: "Architecture Expo" },
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
        { id: "分享文", labelZh: "分享文", labelEn: "Share Posts" },
      ],
    },
    {
      key: "case",
      labelZh: "案例",
      labelEn: "Case Library",
      // 一個標準一個 pill，各自對到一張卡。點 pill 就等於挑標準。
      formats: TEN_STANDARDS.map((s) => ({ id: s.name, labelZh: s.name, labelEn: s.name })),
    },
    {
      key: "calendar",
      labelZh: "行事曆",
      labelEn: "Calendar",
      formats: [
        { id: "官網", labelZh: "官網", labelEn: "Website" },
        { id: "Facebook", labelZh: "Facebook", labelEn: "Facebook" },
      ],
    },
  ],

  cards: [
    // ══ 官網 ═════════════════════════════════════════════════════════
    card("website", "原創文章", {
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
    }, textConfig(["官網長文"], 1200, 2400)),

    card("website", "遇見十築", {
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

這個系列跟官網長文的關鍵差別：重點不是外部案例，而是把五感十築自己的建築標準說清楚。不要去找國際案例當主角。

寫法：
1. 由執行長／創新長的觀點出發，用第一人稱敘事帶。不要寫成訪談逐字稿，也不要寫成 Q&A。
2. 先定義這一項十築標準是什麼 —— 用生活語言定義，不要用工程術語開場。
3. 再延伸到居住感受：這項標準沒有做好的時候，人會感覺到什麼；做好了以後，日常會有什麼不同。
4. 最後才落到建築條件：要達到這件事，結構、材料、設備上實際要做什麼。注意紅線第 4 條 —— 講的是「要達到這件事需要什麼條件」，不是宣稱我們的建案已經有這些設備。
5. 收尾回到一個讀者可以自己拿去判斷房子的標準。

語氣像品牌專欄，比一般案例介紹更慢、更有份量。篇幅要夠，寫太短會變成空泛心得。

發言人姓名與職稱：輸入有就用，沒有就寫【待補：發言人職稱】，不要自己取名字。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
      outputMode: "document",
      preferredModel: "anthropic",
      maxTokens: 3600,
      outputDefaults: { platform: "doc", post_type: "report" },
    }, textConfig(["遇見十築"], 1400, 2800)),

    card("website", "十築建築展", {
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
    }, textConfig(["十築建築展"], 1800, 3400)),

    // ══ Facebook · 原創 ══════════════════════════════════════════════
    card("facebook", "生活實踐", {
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
    }, textConfig(["生活場景切入", "身體感受切入", "季節時令切入"], 500, 900)),

    card("facebook", "生態健築", {
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
    }, textConfig(["技術切入", "使用者感受切入", "問題意識切入"], 600, 1100)),

    card("facebook", "永續生活", {
      id: "wg-fb-sustain-life",
      tier: "30s",
      postType: "feed",
      label: { en: "Sustainable Living Viewpoint", zh: "永續生活觀點文" },
      description: {
        en: "An international brand, trend, or action, read through the ten standards",
        zh: "從國際品牌、生活趨勢或永續行動延伸品牌價值觀",
      },
      agent_id: 220862,
      skill_slug: "wugan-fb-sustain-life",
      primary_question: "要談哪個國際品牌、趨勢或永續行動？想延伸到哪一項十築標準？",
      primary_input: {
        key: "context",
        placeholder: "例：丹麥家具品牌 TAKT 公開碳足跡、提供零件自行維修，想延伸到十築珍惜",
        type: "textarea",
      },
      inputs: [{ key: "context", label: "品牌／趨勢／行動 + 對應標準", type: "textarea", required: true }],
      contextSources: ["brand.name", "brand.positioning.values", "brand.positioning.voice"],
      systemPrompt: `你在為五感十築撰寫一則 Facebook 永續生活觀點文（450–750 字）。

這一類的主角是外部的品牌、趨勢或永續行動 —— 不是建築案例，也不是五感十築自己。品牌的角色是「從這件事看到什麼」。

結構：
【<十築標準>關聯度】
這個外部案例為什麼值得住宅產業關注。2–3 句。

正文
把這個品牌／趨勢在做的事講清楚，具體到讀者能理解它的運作方式，不要停在「很環保」。接著帶出它挑戰了什麼既有做法。

收尾金句
一句話把這個道理接回居住。品牌觀點只能出現在最後 1–2 句。

比例：外部主角 7 : 居住連結 2 : 品牌觀點 1。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
      preferredModel: "anthropic",
      maxTokens: 1800,
      outputDefaults: { platform: "facebook", post_type: "post" },
    }, textConfig(["做法解析", "趨勢觀察", "價值反思"], 450, 800)),

    card("facebook", "永續價值", {
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

這一類要回到品牌自己 —— 我們相信什麼、某項十築標準該怎麼被理解。這是唯一可以正面談品牌的類型，但正因如此更不能寫成宣傳。

結構：
【<十築標準>關聯度】
先講一個大多數人對這件事的既有理解或誤解。2–3 句。

正文
說明五感十築為什麼不那樣看。用具體的居住場景說明，不要用形容詞。可以講做法、材料、結構，但每一項都要落回感受，且遵守紅線第 4 條。

收尾金句
一句可以獨立被引用的話，把標準變成讀者能拿去判斷房子的尺規。

嚴禁：出現建案名稱、銷售資訊、參觀預約、任何行動呼籲。這一類貼文的任務是建立理解，不是帶看。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
      preferredModel: "anthropic",
      maxTokens: 1800,
      outputDefaults: { platform: "facebook", post_type: "post" },
    }, textConfig(["破除誤解", "標準定義", "長期價值"], 400, 800)),

    // ══ Facebook · 分享文（三種來源）═══════════════════════════════════
    shareCard({
      id: "wg-fb-share-gq",
      labelZh: "GQ 文章分享文",
      labelEn: "GQ Column Share",
      descZh: "把《五感十築 X GQ》專欄改寫成 FB 貼文",
      descEn: "Rework a GQ co-branded column into a Facebook post",
      question: "要分享哪一篇 GQ 專欄？貼上原文。",
      placeholder: "貼上《五感十築 X GQ》原文，或摘要 + 網址",
      ratio: "GQ 原文觀點 6 : 居住連結 3 : 品牌觀點 1。",
      extra: `GQ 是聯名媒體，讀者是為了 GQ 的生活主張而來。主角必須是原文的觀點，不是五感十築。
「家也是如此」這個轉折要自然，不要生硬地拉回建案。
不得出現任何建案名稱或銷售資訊。`,
    }),
    shareCard({
      id: "wg-fb-share-meetten",
      labelZh: "遇見十築文章分享文",
      labelEn: "Meeting the Ten Share",
      descZh: "把《遇見十築》專欄導流成 FB 貼文",
      descEn: "Drive traffic to a Meeting the Ten column",
      question: "要分享哪一篇《遇見十築》？貼上原文。",
      placeholder: "貼上《遇見十築》原文或摘要 + 官網網址",
      ratio: "標準說明 6 : 居住感受 3 : 引導閱讀 1。",
      extra: `《遇見十築》本來就是品牌自己的專欄，所以這一類可以正面談十築標準，不需要像 GQ 那樣克制。
但仍然是分享文不是全文 —— 把標準的「定義」講清楚，把「為什麼這樣做」留在官網。
發言人若原文有具名，貼文中要提到是誰的觀點。`,
    }),
    shareCard({
      id: "wg-fb-share-web",
      labelZh: "原創官網分享文",
      labelEn: "Website Article Share",
      descZh: "把官網原創長文或十築建築展導流成 FB 貼文",
      descEn: "Drive traffic to an original website article",
      question: "要分享哪一篇官網文章？貼上原文。",
      placeholder: "貼上官網長文或十築建築展原文 + 網址",
      ratio: "案例內容 6 : 居住連結 3 : 品牌觀點 1。",
      extra: `主角是原文裡的那個案例或議題。挑一個最有畫面的細節當鉤子 —— 通常是「一般人不會注意、但其實很關鍵」的那一項。
不要把三個特點全列出來，那樣讀者就不必點進去了。`,
    }),

    // ══ 案例 · 十項標準各一張 ═══════════════════════════════════════
    ...TEN_STANDARDS.map((std, i) => caseCard(std, i)),

    // ══ 行事曆 · 每種內容類型一張 ════════════════════════════════════
    calendarCard({
      channelPill: "官網", type: "官網長文", labelEn: "Website Long-form",
      guidance: "這個類型是官網原創長文，主角是外部案例或生活議題，每篇約 1200–1600 字。",
    }),
    calendarCard({
      channelPill: "官網", type: "遇見十築", labelEn: "Meeting the Ten",
      guidance: "這個類型是《遇見十築》專欄，主角是五感十築自己的建築標準，由高層觀點出發。",
    }),
    calendarCard({
      channelPill: "官網", type: "十築建築展", labelEn: "Architecture Expo",
      guidance: "這個類型是策展式深度案例，一案對應多項十築標準，密度高於一般長文。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "生活實踐", labelEn: "Living Practice",
      guidance: "這個類型從日常生活情境切入，把十築標準轉成讀者能動手做的事。要扣住當月時令與節慶。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "生態健築", labelEn: "Eco Architecture",
      guidance: "這個類型介紹建築、空間、材料如何回應十築標準。三篇要涵蓋不同的建築類型（住宅／公共／商辦），不要都是住宅。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "永續生活", labelEn: "Sustainable Living",
      guidance: "這個類型的主角是外部品牌、趨勢或永續行動，不是建築案例。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "永續價值", labelEn: "Sustainable Value",
      guidance: "這個類型回到品牌自己相信什麼。兩篇要談不同的十築標準，且不得出現建案名稱或銷售資訊。",
    }),
  ],
};
