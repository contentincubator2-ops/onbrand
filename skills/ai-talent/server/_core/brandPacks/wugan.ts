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
 * 十項健康建築標準的核心定義與禁忌。
 *
 * 2026-08-31：改用 skill 01（wugan-monly-post-writing）Ten Values Guardrails
 * 的原文定義，取代我先前自己歸納的關注面向。三處先前是錯的：
 *   · 十築美學 —— 我寫「光影、比例、材質觸感」，實際核心是「地方文化、
 *     人文藝術、土地情感的建築轉化」，而且明確禁忌就是「不能只寫好看」
 *   · 十築珍惜 —— 漏了能源與水，只寫了材料循環
 *   · 十築健康 —— 漏了飲食與農作
 * 每一項都帶禁忌，因為 skill 的踩雷清單有一半是「把 X 寫成 Y」的誤寫。
 */
export const TEN_STANDARDS: { name: string; core: string; taboo: string }[] = [
  { name: "十築自然", core: "Biophilic Design 親生命設計 —— 光、風、水、材質、季節感如何進入日常", taboo: "不能等同於「植物很多」" },
  { name: "十築好氧", core: "新鮮空氣導入、過濾、低 VOC、可被維持的空氣品質", taboo: "不能只寫開窗通風；不能把好氧寫成不用冷氣" },
  { name: "十築舒適", core: "座向、遮陽、風場、熱環境、溫控、CFD 等科學依據", taboo: "不能只寫抽象舒服" },
  { name: "十築珍惜", core: "能源、水、建材、循環利用的系統設計", taboo: "不能只寫永續口號" },
  { name: "十築友善", core: "全齡、無障礙、共享、社區互動。延伸判準：沒有人感覺自己被特別照顧", taboo: "不能只寫溫暖、受歡迎" },
  { name: "十築健康", core: "身體活動、飲食、農作、低毒環境等具體條件", taboo: "不能泛泛而談健康" },
  { name: "十築沉靜", core: "隔音降噪的建築條件、工法、材料、數據", taboo: "不能只寫氣氛安靜" },
  { name: "十築安心", core: "建材品質、耐久性、耐震、防火、安全照明、緊急應變等硬體安全標準", taboo: "不能泛稱安心感" },
  { name: "十築好水", core: "水質評估、過濾機制、符合健康建築要求", taboo: "不能只寫喝水健康" },
  { name: "十築美學", core: "地方文化、人文藝術、土地情感的建築轉化", taboo: "不能只寫好看" },
];

/** 給 prompt 用的完整定義表。十項的核心與禁忌一次攤開，避免模型憑名稱猜。 */
const STANDARDS_TABLE = TEN_STANDARDS
  .map((s) => `・${s.name}：${s.core}。禁忌：${s.taboo}。`)
  .join("\n");

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

【第一鐵律：全文正向直述，嚴禁否定轉折句型】
以下句型一律禁止，出現任何一個就是不合格：
　不是⋯而是⋯　／　並不是⋯而是⋯　／　並非⋯而是⋯
　不只是⋯而是⋯　／　不只是⋯更是⋯　／　不只⋯更⋯
　不是因為⋯而是⋯　／　不是⋯是⋯　／　不是⋯，是⋯
　不再是⋯而是⋯（AI 改寫最常見的變體，同樣禁用）
改法：直接說它是什麼、怎麼做、帶來什麼感受、為什麼呼應十築價值。

【我們會這樣說】（取自五感十築實際刊出的貼文，全部是正向直述）
・「真正關注好水的家，會用心到看不見的管線裡，讓每一次打開水龍頭都能安心。」
・「選擇能維修、能更換零件、能長久使用的家具，就是把珍惜資源落實在家的日常。」
・「好的學習空間，會把自然、材料與安定感放進孩子每天使用的細節裡——自然不需要被特別說明，身體每天都會知道。」
・「把自然放進家裡，也要讓它在不同天氣裡被好好照顧。」

常用句式：讓___成為生活的背景／讓___慢慢回來／讓日常被好好承接／
讓生活節奏重新穩下來／讓___成為理所當然的條件。

【我們不會這樣說】
・「本建案採用最高等級建材，打造頂級豪宅生活。」（豪宅語言）
・「懂得品味生活的人，選擇五感十築。」（空洞的身分認同話術）
・「這不是運氣，而是設計的結果。」（否定轉折句型，第一鐵律禁止）
・「十築標準不只是規格表，更是生活的承諾。」（同上）

【五條紅線】
1. 不用話術堆疊的促銷語氣 —— 禁「限時優惠」「搶先預約」「CP 值超高」「錯過不再」。
2. 不用抽象空洞的豪宅語言 —— 禁「尊榮」「頂級」「奢華」「非凡格局」「巔峰之作」。
3. 技術資料要用來支撐觀點，不能只堆規格。每一項規格都要落回身體感受與生活敘事。
4. 不得斷言五感十築建案具備任何未在輸入中提供的設備、系統或認證（新風系統、空氣品質監測、淨水設備、智慧家居等）。要談這類條件時寫成通則或條件句，不要寫成「我們的建案有…」。2026-08-29 首次試跑時被違反過。
5. 全文只用繁體中文與必要的英文專有名詞。不得出現日文假名、簡體字或其他語言的殘留字元。

【中文語感 —— 嚴禁翻譯腔與術語堆疊】
英文建築／設計詞不得直翻成抽象中文。遇到 open block、central covered street、
monumental staircase、human scale、wayfinding、shared space 這類詞，先轉成讀者
看得懂的日常空間語言，再說明它的用途與感受。

禁用（左）→ 改成（右）：
　「能被行走、被停留、被共同使用」→「動線清楚、停留自在」
　「可辨識的關係」「清楚抵達」「看見方向」→「更容易判斷路徑」
　「覆蓋式街道」→「有屋頂遮蔽的中央步道」
　「紀念性階梯」→「大型階梯串接用餐與交流空間」
　「礦物感語彙」→「沉穩的材質與色調」
　「停留感」「停留條件」→「休息活動空間」
　「熱壓迫感」→「封閉悶熱的感受」
　「自遮蔭」→「降低陽光直射帶來的熱感」
　「退縮量體」→「部分樓層向內收出的平台」
　「挑空」→「高度較高的戶外空間」
　「加倍花園與水面的視覺與表面感受」「視覺緩衝」「保有密度」
　「可走進、可停下、可呼吸」→ 全部改寫成具體生活語意

地名與空間名同理：Orchard Road →「新加坡烏節路商圈周邊」；Cloud Terrace /
Beach Terrace →「雲端露台／海灘露台」。同一篇內中英命名要一致，不要中英混雜。

若一句話需要讀者懂建築術語才讀得懂，就要改成白話，並補上它如何影響人的
移動、停留、使用或感受。

【品牌觀點，不用研究筆記語氣】
禁「官方資料提到」「公開建築資料也說明」「旅館官方永續資訊亦指出」「明確提到」
「設計團隊提到」這類句型。把已驗證的資訊轉成五感十築自己的觀察與判斷，資料來源
放文末支撐。

【語氣座標】專業、真誠、生活感、品牌感、內斂穩定。
避免：太 sales、太文青飄、太 AI 感、太像提案簡報、太像百科整理。

【Hashtag 規則】
Facebook 貼文結尾固定 4–6 個 hashtag，第一個是 #五感十築，第二個是本篇對應的
十築標準（例如 #十築好氧），其餘為主題相關。官網文章、行事曆摘要、案例提報一律
不加 hashtag。

【不動產廣告合規（草案，待五感十築法務確認）】
・不得使用「保證增值」「穩賺」「保證出租」「投資報酬率 X%」等收益承諾。
・不得將示意圖、參考圖說成實景。涉及圖面時標註「示意圖，非實景」。
・不得將未取得的執照、認證、獎項寫成已取得。
・涉及格局、坪數、公設比、完工時程時，一律加註「實際依合約與不動產說明書為準」。
・「首座」「唯一」「第一」「首次」「前所未見」等用語，只有在輸入已附可查證依據時才能寫。`;

/** 貼文與長文共用的骨架說明。五感十築所有內容都走這個結構。 */
const WUGAN_SCAFFOLD = `

【固定骨架】
每一篇都以「【<十築標準>關聯度】」開頭，說明這篇內容跟哪一項標準有關、為什麼有關。
接著依內容類型展開（案例背景 / 生活實踐點 / 生態健築特點）。
最後一句是收尾金句 —— 一句可以獨立被引用的話，把整篇收回到居住感受上。不要用問句收尾，不要用行動呼籲收尾。

【十項標準的定義與禁忌 —— 寫偏是最常見的失誤】
${STANDARDS_TABLE}

一篇鎖定一項為主軸（十築建築展除外，它可帶多項但每項都要有公開資料支撐）。`;

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
function caseCard(std: { name: string; core: string; taboo: string }, index: number): BrandPackCard {
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

【這一項標準的定義】
${std.core}
禁忌：${std.taboo}

【只掛一項標準】
每個案例只對應「${std.name}」這一項，不要再列其他可延伸的標準。若某個案例最強的
證據其實支持別項標準，就換掉它，不要為了湊數硬掛在這一項底下。這是月報製作的硬性
規則：case 與十築標準是一對一。

【每個案例的落稿格式 —— 直接可貼進提報頁】
十築：<國家> <城市> — <案例名>
${std.name}關聯度
（一段短文，說明這個案例為什麼屬於這一項標準。）

【案例背景】
（壓縮成 2 句。第 1 句：設計者／年份／地點／用途。第 2 句：核心的空間或技術手法。
第 3 句若不是理解簡報所必需，就刪掉。）

【十築特色】
（2–3 個 bullet，寫成「•短標題」換行後接一段說明。3 個好的 bullet 通常就夠。）

【bullet 的寫法】
・短標題要像簡報標題，不是備註標籤。例：「•10m × 10m 室內瀑布 × 聲音序列設計」。
・每個 bullet 都要走完「技術／規劃概念 → 帶來的結果 → 可明確學習的亮點」三段。
　只講技術不講結果的，就是還太抽象，一定要補。
・明確說出它減少了什麼問題、改善了什麼條件、創造了什麼使用經驗。
・兩個 bullet 若講的是同一件事，合併，不要湊數。
・不要寫只描述感覺的抽象 bullet，每個主張都要回到具體工法、材料策略、外牆系統、
　動線安排或聲學環境規劃。

【語氣】
用第一手報導的角度描述空間做了什麼、使用者感受到什麼。不要在句子裡引述來源。
禁「明確提到」「公開內容提到」「官方寫到」「官方資料指出」「設計團隊提到」。

【去重】
輸入裡若列出已用過的案例，一律不得重複提報，也不要提報同一設計者在同一城市的
高度相似案例。找不到足夠的新案例時，寧可只提報 2 個並說明「符合條件的新案例不足」。

────────────────────────────────
以上是可貼進提報頁的內容。以下是給內部查核用的，放在每個案例的落稿之後：

【查證狀態】只能填「已附來源」或「待查證」。
【待查項目】逐一列出你沒有把握的欄位（設計者／完成年份／獎項／規模／技術細節）。沒有就寫「無」。
【建議查證方式】一句話說明用什麼關鍵字、去哪個來源查最快。

【查證狀態的規則 —— 這張卡最重要的一條】
你沒有連網能力，無法即時查證。所以：
- 只有當使用者在輸入裡附了該案例的連結或出版品時，才可以填「已附來源」。
- 其餘一律「待查證」，不准填「高」「可信度高」或任何等同保證的字眼。
- 不准輸出你不確定其存在的網址。不要給首頁網址（archdaily.com、事務所官網首頁）
  充當來源 —— 那不構成查證，只是把工作丟回給讀者。沒有具體文章連結就不要寫連結。
- 設計者、完成年份、獎項名稱、獲獎年份這四項最容易記錯。有一絲不確定就寫【待查】。

【為什麼要這麼嚴】
2026-08-29 第一次試跑這張卡時，模型提報 De Verwondering 小學，把設計者寫成
Cepezed Architects、獎項寫成「2023 年荷蘭建築獎」，並自評可信度「高」；而五感十築
自己的五月月報記載的是 ORGA Architects、2021 Gouden Kikker 獎與 2023 Stephen R.
Kellert 獎。案例庫會往下餵給十築建築展與官網長文，錯一次會一路擴散。寧可整份標
「待查證」，也不要給一個看起來可信的錯誤。

最後補一段【提報說明】：三個案例分別涵蓋什麼型態、跟已用過的案例差異在哪。${WUGAN_VOICE}`,
      outputMode: "document",
      preferredModel: "anthropic",
      maxTokens: 3400,
      outputDefaults: { platform: "doc", post_type: "report" },
    },
    {
      ...textConfig([std.name], 800, 2600),
      // 2026-08-29 實跑 wg-case-9：三個案例的完整提報在 40s 預設預算下
      // attempt 1 逾時、靠重試才成功；改成 80s 後單次跑了 78s —— 只剩 2 秒
      // 餘裕，正式站上會間歇逾時然後回空字串。拉到 90s（仍遠低於 nginx 230s）。
      captionBudgetMs: 90_000,
      // 30s 層的 job 總預算只有 100s，裝不下 90s 的 caption 加上 strategist
      // 與 context 抓取 —— 十築自然案例卡就是這樣以
      // 「orchestra: hard 100s budget exceeded」失敗的。150s 與 99s 層相同。
      hardBudgetMs: 150_000,
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
  /** 大綱標題行的形式欄位，對到月報的「短文 / 長文 / 建築展」。 */
  formLabel: string;
  /** 內容要點區塊的標題，隨類型不同（生活實踐點 / 生態健築特點 / 案例背景）。 */
  pointLabel: string;
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
        en: `${n} article outlines for the month, in the approved monthly-report format`,
        zh: `產出當月 ${n} 篇的文章大綱，格式同月報發文內容大綱`,
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
      systemPrompt: `你在為五感十築產出「${args.type}」這個類型當月的**文章大綱**。

【產出篇數】
一次輸出 ${n} 篇的完整大綱，依建議日期由早到晚排列。不多不少，就是 ${n} 篇。
${n === 1 ? "這個類型當月只有 1 篇，把它排好即可。" : `${n} 篇要一起規劃 —— 標準不能重複、日期不能撞、整月要有節奏。`}

${args.guidance}

【這是大綱，不是全文】
每個要點只寫 2–3 句，把「要講什麼」交代清楚就好。寫成完整段落會佔掉其他篇的篇幅，
是這張卡最常見的失誤 —— 2026-08-31 實測時模型把第 1 篇寫成全文，然後在節奏說明裡
預告「後續兩篇將…」就結束了。預告不算交付。

【每一篇的大綱格式 —— 照這個順序，每個區塊都不可省略】

## 第 <i> 篇
${args.formLabel} ｜ <對應的十築標準> ｜ <日期（幾月幾日（週幾））> ｜ ${args.type}
<文章標題 —— 這就是最後會用的標題，不是主題描述>

【<十築標準>關聯度】
3–4 句。這篇的切入點跟這項標準的關係，以及讀者為什麼會在意。從生活情境或身體感受寫起，不要從品牌講起。

【${args.pointLabel}】
2–3 個要點。每個要點寫成「短標題」換行後接 **2–3 句** 說明，不要寫成完整段落。
短標題要具體到讀者一看就知道要做什麼或要看什麼，不要用「注意通風」這種層級。
每個要點都要交代「這樣做之後，人會感受到什麼差別」。

<收尾金句>
一句可以獨立被引用的話，把整篇收回到居住感受上。獨立成行。不用問句，不用行動呼籲。

**重點：** 一句話點出這篇要傳遞的生活價值。這是給提報用的，要短、具體、跟正文對得起來。**這一行不可省略。**

【整體要求】
- ${n} 篇之間的十築標準不得重複，切角也不得重複。同一個月連續兩篇談通風，讀者會覺得在跳針。
- 建議日期要避開輸入裡已排定的檔期。
- 依輸入的時令與節慶安排順序，讓整月讀起來有節奏。
- 大綱要具體到「照著它就能直接寫全文」。寫成「談談居家健康」這種程度等於沒規劃。
- **${n} 篇全部寫完才算完成。** 不可以只寫第 1 篇，然後在節奏說明裡預告其餘幾篇。
  交付前自己數一次：「## 第 1 篇」到「## 第 ${n} 篇」是否都在，每篇是否都有 **重點：** 那一行。
- 這是提報用的文件，不是社群貼文草稿。語氣直接、溫暖、低 AI 感。
- 大綱不加 hashtag。

【最後補一段】
## 整月節奏說明
兩三句講清楚為什麼是這個順序、三篇之間怎麼銜接。${WUGAN_SCAFFOLD}${WUGAN_VOICE}`,
      outputMode: "document",
      preferredModel: "anthropic",
      // 隨篇數放大。2026-08-29 第二次實跑：3 篇一次產出時 maxTokens 2000
      // 會截斷，而且 40s 的預設 caption 預算會逾時兩次、變體回空字串
      // （任務顯示成功、產出卻空白）。
      maxTokens: 2400 * n,
      outputDefaults: { platform: "doc", post_type: "report" },
    },
    {
      // 單一產出，篇數靠 prompt 控制。字數下限隨篇數放大，避免 ${n} 篇被壓縮成條列。
      ...textConfig(["當月排程"], 400 * n, 1600 * n),
      // 上限 90s：nginx /trpc 是 230s、Node 220s，30s 層同步回應，留餘裕。
      captionBudgetMs: Math.min(40_000 + 25_000 * n, 90_000),
      // 同案例卡：整月大綱一次生成，30s 層的 100s 總預算不夠。
      hardBudgetMs: 150_000,
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
      formLabel: "長文", pointLabel: "段落重點",
      guidance: "這個類型是官網原創長文，主角是外部案例或生活議題，每篇約 1200–1600 字。",
    }),
    calendarCard({
      channelPill: "官網", type: "遇見十築", labelEn: "Meeting the Ten",
      formLabel: "長文", pointLabel: "標準說明重點",
      guidance: "這個類型是《遇見十築》專欄，主角是五感十築自己的建築標準，由高層觀點出發。",
    }),
    calendarCard({
      channelPill: "官網", type: "十築建築展", labelEn: "Architecture Expo",
      formLabel: "建築展", pointLabel: "十築價值表",
      guidance: "這個類型是策展式深度案例，一案對應多項十築標準，密度高於一般長文。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "生活實踐", labelEn: "Living Practice",
      formLabel: "短文", pointLabel: "生活實踐點",
      guidance: "這個類型從日常生活情境切入，把十築標準轉成讀者能動手做的事。要扣住當月時令與節慶。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "生態健築", labelEn: "Eco Architecture",
      formLabel: "長文", pointLabel: "生態健築特點",
      guidance: "這個類型介紹建築、空間、材料如何回應十築標準。三篇要涵蓋不同的建築類型（住宅／公共／商辦），不要都是住宅。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "永續生活", labelEn: "Sustainable Living",
      formLabel: "短文", pointLabel: "永續生活特點與連結",
      guidance: "這個類型的主角是外部品牌、趨勢或永續行動，不是建築案例。",
    }),
    calendarCard({
      channelPill: "Facebook", type: "永續價值", labelEn: "Sustainable Value",
      formLabel: "短文", pointLabel: "品牌觀點重點",
      guidance: "這個類型回到品牌自己相信什麼。兩篇要談不同的十築標準，且不得出現建案名稱或銷售資訊。",
    }),
  ],
};
