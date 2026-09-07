/**
 * Press Release (新聞稿) quick-task templates (2026-05-05).
 * 10 PR 30s tasks. All caption_writer agents distinct from prior pools.
 * image_director = Vincent Chu (60011, PR Strategist Tech) — repurposed.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

// 2026-05-17 (CJ「參考 PR 獎項得獎工藝，強化所有新聞稿任務」):
// shared earned-media craft prepended to every PR task. Distilled from
// what Cannes Lions PR / PR Awards Asia / Marketing-Interactive PR
// reward (general industry knowledge applied — award pages NOT executed).
const PR_TONE = `
【共同準則 — earned-media 工藝】
1. 通過「記者測試」：記者會不會主動選擇報導這件事？要用事實贏得關注，不是用形容詞宣稱關注。寫之前先想「so what／為什麼是現在」，並把它放第一句。
2. 具體勝過修辭：用數字、名字、日期、第三方背書取代形容詞。沒有可查證事實寧可標「[待補]」也不要灌水，絕不杜撰。
3. 文化與時機連結：扣住此刻人們已經在乎的事（趨勢、節點、社會情緒），讓新聞「可被傳播」而非只是「被發出」。
4. 一個銳利角度：聚焦單一最強角度，不要把所有訊息塞進去。
5. 客觀、第三人稱、倒金字塔（最重要的事實在最前，往後刪不影響理解）。
6. 可被原句引用：寫成記者能直接 copy 進報導的句子。
7. 禁：過度形容詞、buzzword、「業界領導／顛覆／革命性」、「我們很高興／自豪宣布」、暖身式開頭（近年來／隨著／在這個…時代）。`;

export const PR_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "pr-30-headline",
    tier: "30s", postType: "press-release",
    label: { en: "Press-Release Headline", zh: "新聞稿標題" },
    description: { en: "The first line that decides whether a reporter opens it", zh: "決定記者要不要打開的第一行" },
    agent_id: 29, skill_slug: "press-release",
    source: { type: "award", short: "The Tampon Book（Cannes Lions 2019）", takeaway: "重新框架舊事實，新聞自己長出來" },
    primary_question: "這則新聞核心事件是？",
    primary_input: { key: "event", placeholder: "誰 + 做了什麼 + 何時 / 何地", type: "textarea" },
    inputs: [{ key: "event", label: "新聞事件", type: "textarea", required: true }],
    // 2026-05-17 (CJ「調整新聞稿標題品質」): rewritten with standard
    // press-release headline craft (倒金字塔 / 主動動詞 / 具體事實 /
    // 記者可直接引用 / 無 buzzword). Each variant = a distinct
    // journalistic angle so the user has real choice, not 3 rewrites.
    systemPrompt: `【得獎工藝參考】The Tampon Book（The Female Company，Cannes Lions 2019 PR 全場大獎）：得獎關鍵是一個「重新框架」——把舊事實換一個角度，新聞自己長出來。標題的最高境界＝一個讓記者「咦？」的 reframe＋一個具體數字，而不是把事件平鋪直敘。
你在寫「新聞稿標題」——記者掃過 50 封信時，決定打不打開的那一行。

寫作準則（每一條都要做到）：
1. 倒金字塔：最有新聞價值的事實放最前面（誰 + 做了什麼），不要鋪陳。
2. 主動語態 + 強動詞（推出 / 宣布 / 達成 / 攜手 / 突破），不要「致力於」「持續努力」這種軟詞。
3. 一個具體錨點：數字、金額、名字、地點或日期擇一，且必須來自輸入事實，不可杜撰。
4. 一行讀完：12–24 個中文字最佳，最多不超過 30 字；不用驚嘆號、不用冒號堆砌（問號**僅「反問式」變體**可用，其餘不用）。
5. 記者可「原封不動」引用：客觀第三人稱，無行銷形容詞、無 buzzword、無 clickbait、無「業界領先 / 顛覆 / 革命性」。
6. 一眼看懂價值：標題本身要能回答「為什麼這值得報導」。

【角度必須真的不同｜最高優先 — 不可違反】
每個變體是「完全不同的視角／句構」，不是同一句換詞。判定失敗的情形：兩條主詞相同、句子骨架相同、或只是同義詞替換（如「發布/首發」「揭露/指出」互換）。每一條都要能讓記者下一個**不同的標**。請依下方 variantLabel 從「根本不同的切入點」下手：

- 事實式：中性陳述「誰＋做了什麼＋最關鍵衝擊」。（主詞＝機構）
- 受影響者視角：以「那個孩子／當事人／受影響的人」為主詞或開頭，不是機構。例：「23萬個孩子，4成沒看過牙醫」。
- 對比式：用一組反差／對照當骨架（多 vs 少、看得見 vs 看不見、A 卻 B）。例：「全台最會看牙的城市，藏著4成沒看過牙醫的孩子」。
- 反問式：用一個讓人停下來的具體問句當標（此任務允許問號）。例：「23萬個孩子的牙，為什麼沒人看見？」。
- 數據衝擊式：把「一個」最震撼的數字放句首當主角，其餘全刪。例：「4成貧窮兒童，一輩子沒看過牙醫」。
- 時機式：扣「為什麼是現在／首份」，把時間點變成新聞點。
- 引述式：用一句像真的會被講出口的短話帶出新聞（不是場面話）。
- 懸念式：留一個具體鉤子讓記者想點開（仍須是事實，不可標題黨）。

自我檢查：把 8 條並排，若任兩條交換主詞或句構後意思幾乎一樣 → 失敗，重寫該條。

只輸出標題本身，不要前綴、不要編號、不要解釋。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-subhead",
    tier: "30s", postType: "press-release",
    label: { en: "Press-Release Subhead + Quote", zh: "新聞稿副標 + 引言" },
    description: { en: "The 1-2 extension sentences under the headline", zh: "標題下方的延伸 1-2 句" },
    agent_id: 30008, skill_slug: "media-pr",
    source: { type: "award", short: "Project Revoice（Cannes Lions 2018）", takeaway: "標題給事件，副標給非讀不可的理由" },
    primary_question: "標題重點 + 想擴充什麼面向？",
    primary_input: { key: "context", placeholder: "標題 + 你想引申的", type: "textarea" },
    inputs: [{ key: "context", label: "標題 + 引申", type: "textarea", required: true }],
    systemPrompt: `【得獎工藝參考】Project Revoice（ALS Association / BWM Dentsu，Cannes Lions 2018 健康類全場大獎）：標題給「事件」，但讓人非讀不可的是「人的代價」那一層。副標的工作＝扛起標題扛不動的影響/人味，補上利害關係。
產出新聞稿副標 / 引言（subhead，30–80 字）。
副標的工作：在標題之外「加一個記者沒料到的角度」，讓人更想讀內文——不是把標題換句話再講一次。
- 補標題沒講的那層：影響面（對誰造成什麼改變）、規模（多大／多快／多少）、或時程（為什麼是現在／接下來會怎樣）。
- 一定要帶一個標題裡沒出現過的具體事實或數字。
- 不與標題重複用詞；讀起來像「延伸」不是「重述」。
每個變體一種延伸角度（影響面 / 規模 / 時程）。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-lead-paragraph",
    tier: "30s", postType: "press-release",
    label: { en: "Inverted-Pyramid Lead Paragraph", zh: "倒金字塔導言第一段" },
    description: { en: "The 5W1H first paragraph (the facts that matter most)", zh: "5W1H 第一段（最重要的事實）" },
    agent_id: 60035, skill_slug: "press", // Yizhen Lin | Tech Brand PR Writer
    source: { type: "award", short: "The Lost Class（Cannes Lions 2022）", takeaway: "第一個事實揭露就讓人重新理解整件事" },
    primary_question: "事件的 5W1H？",
    primary_input: { key: "event", placeholder: "誰 / 做了什麼 / 何時 / 何地 / 為何 / 如何", type: "textarea" },
    inputs: [{ key: "event", label: "5W1H 細節", type: "textarea", required: true }],
    // 2026-05-17 (CJ): rewritten with press-release first-line / lead
    // craft (general PR best practice applied; page used as reference,
    // not executed).
    systemPrompt: `【得獎工藝參考】The Lost Class（Change the Ref / Leo Burnett，Cannes Lions 2022）：威力來自第一個事實揭露就讓人倒抽一口氣、重新理解整件事。導言第一句＝那個一說出口就改變讀者認知的事實，不是鋪陳。
你在寫新聞稿的「導言第一段」——記者掃過信件、決定「這值不值得我往下讀」就看這幾句。

第一句（最關鍵，決定生死）——以下為**最高優先、不可違反的硬規則**：
- 【結構規則】第一句必須是「單一獨立事實句」：**只能有一組主詞＋動詞，整句最多 1 個逗號**。**禁止**用逗號串接多個事實／並列子句／「指出…，令人震驚的是…」這種堆疊。寫不下的資訊一律丟到第二句。
- 【字數規則】第一句（到第一個句號為止）**≤ 30 個中文字元**。寫完**逐字數**，超過就刪到剩核心。
- 【WHEN/WHERE 規則】時間、地點、機構全名、數字清單**一律不放第一句**，移到第二句。第一句只回答「誰＋做了什麼＋最關鍵的那一個衝擊」。
- 一個具體錨點（數字或名字，來自輸入、不可杜撰）可放第一句，但只能一個。
- 能單獨成立——記者只讀這一句就懂核心。

❌ 壞例（違反，68 字、多個並列子句）：「家扶基金會攜手台灣大學，針對兒童貧困問題，首次發布白皮書，指出全台約23萬名兒童生活在貧窮線下，令人震驚的是39%孩子從未接受牙科檢查。」
✅ 好例（第一句 19 字、單一事實、可單獨成立）：「全台逾23萬名貧窮兒童，4成從未看過牙醫。」（第二句再補：家扶基金會與台灣大學5月17日發布首份「台灣兒童貧窮白皮書」揭露此現況……）

故事感型例外提醒：即使是故事感型，第一句仍須是上述「事實句」（不可純場景鋪陳如「某個午後孩子在操場玩耍」）；場景可放第二句。

第二、三句（支撐，總長 80–170 字）：
- 第二句補 WHY（意義 / 影響面），第三句補 HOW 或規模延伸（若重要才寫）。
- 倒金字塔：重要性遞減，後面刪掉也不影響理解。

絕對禁止的開頭與寫法：
- 「近年來…」「隨著…」「在這個…的時代」「X 公司很高興 / 自豪地宣布」這類暖身。
- 被動語態、堆形容詞、buzzword、「業界領先 / 顛覆 / 革命性」。
- 反問、感嘆、設問句當開頭。

自我檢查：記者能不能幾乎原句拿去當報導第一段？不行就重寫。

每個變體用 variantLabel 的不同 lead 角度切入：
- 事實密度型：單位時間塞進最多可查證事實，最像通訊社電頭。
- 影響面型：第一句就點出對市場 / 用戶 / 產業的具體改變。
- 故事感型：用一個具體場景或人物動作開場，但第一句仍須含 WHAT+WHO（不可純情境鋪陳）。

只輸出導言段落本身，不要標題、不要前綴、不要解釋。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    // 2026-05-17 (CJ「CEO QUOTE 改成 CEO SPEECH，要知道主講者，產出完整
    // 講稿 ~2700 字，mockup 像致辭簡報、可編輯下載」). id kept stable
    // for routing/data; behaviour fully reworked.
    id: "pr-30-ceo-quote",
    tier: "30s", postType: "press-release",
    label: { en: "CEO Speech Script", zh: "CEO 致辭講稿" },
    description: { en: "A stage-ready full speech script + speaker/occasion", zh: "可直接上台念的完整致辭稿 + 主講人/場合" },
    agent_id: 60036, skill_slug: "press",
    source: { type: "benchmark", short: "Patagonia 2022 公開信", takeaway: "立場先於修辭，句子可被單獨引用" },
    primary_question: "致辭主題與想傳達的核心觀點？",
    // 2026-05-17 (CJ bug「Missing required input: speaker」): the 30s
    // quick-task form only ever submits the ONE primary input — extra
    // inputs[] were never collected, so a required `speaker` could
    // never be satisfied. Collapse to a single guided textarea; the
    // prompt extracts 主講人/職稱/場合 from it.
    primary_input: { key: "context", placeholder: "主講人姓名＋職稱｜場合/時間/地點｜致辭主題與想傳達的觀點＋想提到的事實或數字", type: "textarea" },
    inputs: [
      { key: "context", label: "主講人 + 場合 + 致辭主題與觀點", type: "textarea", required: true },
    ],
    systemPrompt: `【得獎工藝參考】Patagonia「Earth is now our only shareholder」（Yvon Chouinard 2022 公開信，全球 earned-media 典範）：高層發言之所以變成新聞，是因為它本身就是「行動＋價值觀」，每一句都可被記者原句引用。致辭要有可被擷取的金句，不是場面話。
你在撰寫一篇「可以直接上台念出來」的 CEO 致辭講稿（口語、有節奏、約 2400–2800 字）。

輸入是一段 [context] 自由文字，裡面可能同時包含：主講人姓名與職稱、場合/時間/地點、致辭主題與想傳達的觀點、想提到的事實或數字。請自行從中辨識出「主講人 / 職稱 / 場合 / 講題」並填入下方 metadata；其餘內容作為致辭素材。務必把主講人與場合自然寫進稿中（開場致意、結尾署名）。沒有提供的欄位寫「[待補：主講人]」之類標記，不要杜撰、不要反問使用者。

輸出格式（嚴格遵守，第一行開始就是 metadata，方便排版解析）：
【主講人】<speaker>
【職稱】<speakerTitle，無則留空>
【場合】<occasion，無則寫「企業致辭」>
【講題】<一句話講題>
---
[開場] 一段問候與破題（點出今天為何站在這裡、與聽眾的連結）
[重點一] 小標 + 一段論述（含具體事實/數字/例子）
[重點二] 小標 + 一段論述
[重點三] 小標 + 一段論述
[展望] 一段對未來的承諾與呼籲
[結語] 收束＋感謝＋署名（主講人姓名）

寫作準則：
- 第一人稱、口語可朗讀（短句、停頓感、可以唸出口），不是書面新聞稿。
- 每個重點都要有「可被記者單獨擷取引用」的一兩句金句。
- 真誠具體，禁止「我們很高興 / 致力於 / 業界領先」這類空話與 buzzword。
- 每個變體用 variantLabel 的角度貫穿全篇：願景式（描繪未來圖像、使命感）／客戶價值式（一切回到對客戶與社會的價值）／市場觀察式（從產業趨勢與洞察切入、展現格局）。
${PR_TONE}`,
    // document mode → systemPrompt is 最高指令, structure preserved
    // verbatim (not rewritten into a social caption).
    outputMode: "document",
    preferredModel: "qwen", maxTokens: 2200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-boilerplate",
    tier: "30s", postType: "press-release",
    label: { en: "Company Boilerplate", zh: "公司簡介定型段落" },
    description: { en: "The standing \"About X\" paragraph at the bottom of releases", zh: "新聞稿底部固定的「關於 XXX」段落" },
    agent_id: 60037, skill_slug: "press",
    source: { type: "award", short: "PR Awards Asia 評審準則", takeaway: "名次靠可佐證的成效，不是形容詞" },
    primary_question: "公司核心業務 / 規模 / 重要里程碑？",
    primary_input: { key: "context", placeholder: "業務 + 規模 + 創辦時間 + 主要產品", type: "textarea" },
    inputs: [{ key: "context", label: "公司資料", type: "textarea", required: true }],
    systemPrompt: `【得獎工藝參考】PR 獎項評審共通準則（PR Awards Asia / Marketing-Interactive）＋ Dove「Real Beauty」長青一致性：得獎名次靠「可佐證的成效」，不是形容詞。boilerplate 是會被反覆引用的公司門面，要用可驗證事實＋第三方背書建立可信度，且能長期沿用不過期。
產出新聞稿底部「關於 XXX」boilerplate（150–250 字，一段或兩段）。
這是會被原封不動轉貼到每一篇報導末尾的固定段落——必須事實精準、可長期沿用、不過期。
結構：第一句用「可驗證的事實」定位公司（在做什麼、服務誰），不要用願景或形容詞當定位 → 核心產品/服務 → 規模（成立年、員工/客戶/用戶數、營收或市佔，能查證才寫）→ 1–2 個關鍵里程碑或第三方背書（獲獎、認證、知名客戶）→ 官網/媒體聯絡。
記者引用 boilerplate 是要「交代這家公司是誰」，所以具體可查證 > 動聽。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-fact-sheet",
    tier: "30s", postType: "press-release",
    label: { en: "Fact Sheet (One-Pager)", zh: "事實資料表（一頁式彙整）" },
    description: { en: "A bullet list reporters can reference fast", zh: "給記者快速 reference 的 bullet 清單" },
    agent_id: 60038, skill_slug: "press",
    source: { type: "benchmark", short: "Spotify Wrapped", takeaway: "把資料變成 10 秒看懂、想分享的數字" },
    primary_question: "事件的所有可量化事實？",
    primary_input: { key: "context", placeholder: "所有可寫進 fact sheet 的數字 / 名字 / 時間", type: "textarea" },
    inputs: [{ key: "context", label: "事實素材", type: "textarea", required: true }],
    // 2026-05-17 (CJ「factsheet 產出跟 factsheet 不符」): a fact sheet is
    // a SCANNABLE one-pager (labels + numbers + fragments), NOT prose.
    // Strict parseable format so the one-pager mockup can lay it out.
    systemPrompt: `【得獎工藝參考】Spotify Wrapped（全球 earned-media 與多項廣告獎常勝）：把資料變成「10 秒看懂、忍不住想分享」的數字。Fact Sheet 的勝負在掃描性 > 完整性——每個數字都要一眼有感、可被單獨擷取。
你在做一份「一頁式 Fact Sheet」——記者 10 秒掃完就能抓到所有可查證事實。重點是「可掃描」：標籤＋數字＋短句，**絕對不要寫成段落或文章**。

從輸入抽取事實，嚴格照此格式輸出（每段以 ## 開頭，欄位用全形｜分隔；缺值寫「[待補]」，不可杜撰）：

【標題】<主體名稱>　Fact Sheet
【副題】<一句 12–25 字的定位/overview>
---
##關鍵數據
<指標名>｜<數值>｜<單位或說明>
（3–6 行，挑最有力、最可查證的數字，例如 成立年、規模、用戶數、市佔、金額）
##重點事實
- <一句一個事實，含具體數字/名字/時間>
（4–7 條）
##里程碑
<年份>｜<事件>
（3–5 行，由舊到新）
##產品/服務
- <名稱>：<一句說明含關鍵規格或價格>
（2–4 條；公司型主體可改放「核心業務」）
##聯絡
<單位>｜<email>｜<電話或網址>

寫作準則：
- 全部用短句/片語，不寫「我們致力於」這類空話與形容詞、不寫 buzzword。
- 數字一定帶單位與時間基準（例：月活躍 3.9 萬人 · 2026Q1）。
- 每個變體用 variantLabel 調整「哪一段放最前、著墨最多」：產品優先＝產品/服務最詳盡；公司優先＝公司規模與里程碑為主；市場優先＝市佔/客戶/數據為主。
- 只輸出上述結構，不要前言、不要結語、不要額外標題。
${PR_TONE}`,
    // document mode → structure preserved verbatim, not rewritten.
    outputMode: "document",
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-media-pitch",
    tier: "30s", postType: "press-release",
    label: { en: "Media Pitch Email", zh: "媒體邀訪信" },
    description: { en: "The \"why cover us\" email to reporters", zh: "寄給記者的「為何要報導我」信" },
    agent_id: 180175, skill_slug: "press",
    source: { type: "award", short: "Whopper Detour（Cannes Lions 2019）", takeaway: "角度本身就是故事，記者才會報導" },
    primary_question: "新聞主題 + 為何這個記者會感興趣？",
    primary_input: { key: "context", placeholder: "新聞主題 + 記者過往報導 + 為何相關", type: "textarea" },
    inputs: [{ key: "context", label: "邀約脈絡", type: "textarea", required: true }],
    systemPrompt: `【得獎工藝參考】Whopper Detour（Burger King / FCB，Cannes Lions 2019）：媒體會報導，是因為「角度本身就是故事」、且與讀者切身。pitch 要賣「這位記者的讀者會在乎的角度」與一個不可抗拒的鉤，不是賣品牌、不是發稿通知。
產出 media pitch email（總長 120–200 字，越短越強）。
這封信只有一個目的：讓這位記者覺得「這是寫給我的、而且值得我報」。得獎級 pitch 的共通點是「站在記者的讀者角度賣角度，不是賣公司」。
結構：
- Subject ≤30 字：直接是新聞角度＋一個具體鉤子（數字/名字），不要寫「新聞稿」「邀請報導」這種字。
- 第一句 personalize：具體提到這位記者寫過的某篇/某主題，並說明「為什麼這條新聞延續他關心的線」。
- 一句話講清楚 news 是什麼＋為什麼現在（so what）。
- 一個 hook 數字或獨家點（他在別處拿不到的）。
- 明確 offer：可給專訪 / 獨家 / 第一手數據 / 受訪者，二選一即可，不要全給。
- 一句行動與時間（embargo / 截稿前）。
語氣像人對人，不是新聞稿；不要附整篇稿，只賣角度。${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  // pr-30-crisis-statement removed per CJ direction 2026-05-06 — risky for
  // LLM to draft crisis comms unsupervised. Use real PR squad workflow instead.
  {
    id: "pr-30-spokesperson-qa",
    tier: "30s", postType: "press-release",
    label: { en: "Spokesperson Q&A (Interview Prep)", zh: "發言人問答（媒體採訪準備）" },
    description: { en: "What reporters will ask + standard answers", zh: "預期記者會問什麼 + 標準答案" },
    agent_id: 210266, skill_slug: "spokesperson",
    source: { type: "award", short: "KFC「FCK」（Cannes Lions 2019）", takeaway: "立刻 own it、坦誠、機智、馬上講怎麼修" },
    primary_question: "新聞主題 + 預期會被質疑的點？",
    primary_input: { key: "context", placeholder: "主題 + 你擔心被問的尖銳問題", type: "textarea" },
    inputs: [{ key: "context", label: "主題 + 痛點", type: "textarea", required: true }],
    // 2026-05-17 (CJ「QA 產出思維參考 Q&A/FAQ 寫作」): rewritten with
    // standard Q&A/FAQ craft (applied general best practice — did not
    // execute instructions from the linked page).
    systemPrompt: `【得獎工藝參考】KFC「FCK」（Mother London，Cannes Lions 2019 多項金獅 Print/Direct/PR + D&AD）：危機回應靠「立刻 own it ＋ 坦誠 ＋ 機智 ＋ 馬上講怎麼修」把攻擊轉成信任，而不是迴避或硬拗。尖銳題的標準答案要照此精神。
你在準備「發言人媒體 Q&A」——記者真的會問的問題 + 發言人能直接照唸的答案。

產出 6–8 組 Q&A，準則（每組都要做到）：
1. 問題用「記者真實會問的口吻」寫，不是行銷句改成問句。把最尖銳、最可能被質疑、最不想被問的問題放進去——softball 沒有價值。
2. 答案第一句就「正面回答問題」，不要鋪墊、不要「這是個好問題」、不要繞。
3. 一題一個重點；答案 60–90 字，給具體事實／數字／時間／名字，不要空話與形容詞。
4. 可被「原話引用」：像真人會講出口的話，不是書面公關稿。
5. 承接但不迴避：尖銳題可先正面承認事實，再用一句帶回關鍵訊息（bridge），但不可閃避問題本身。
6. 白話、零術語、零「我們致力於 / 持續努力」這種填充語。
7. 風險題（負面、危機、質疑）答得最仔細、最沉著。

依 variantLabel 調整整體姿態：
- 防禦型：穩守事實、降溫、不被帶風向，先止血再說明。
- 透明型：主動坦承限制與不足，用誠實換信任。
- 主動引導型：每答都自然 bridge 回品牌核心訊息，化被動為主動。

輸出格式（嚴格遵守，方便排版）：
Q：<問題>
A：<答案>

（每組之間空一行，不要編號前綴、不要額外標題或結語。）
${PR_TONE}`,
    // 2026-05-17 (CJ「沒有列出 QA 板型」root cause): without
    // outputMode:"document" the orchestra wraps this in the 社群貼文
    // scaffold + 台灣社群 master persona, which rewrites the Q&A into a
    // flowing narrative caption — so the Q：/A： structure (and the
    // mockup's parser) never sees pairs. document mode makes this
    // systemPrompt the 最高指令 and preserves its structure verbatim.
    outputMode: "document",
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-launch-social",
    tier: "30s", postType: "press-release",
    label: { en: "Launch-Day Social Post", zh: "新聞發布同步社群文" },
    description: { en: "The FB/LI companion post for release day", zh: "新聞稿發出當天同步發 FB/LI 的引導文" },
    agent_id: 180193, skill_slug: "press",
    source: { type: "benchmark", short: "Spotify Wrapped 社群擴散", takeaway: "被分享的是有觀點的一句話，不是公告" },
    primary_question: "新聞主題 + 想讓社群點進新聞稿做什麼？",
    primary_input: { key: "context", placeholder: "新聞核心 + CTA", type: "textarea" },
    inputs: [{ key: "context", label: "新聞 + 行動呼籲", type: "textarea", required: true }],
    systemPrompt: `【得獎工藝參考】Spotify Wrapped 社群擴散：被分享的不是「公告」，是「有觀點、有梗、與我有關」的一句話。社群同步文要有態度、可被轉發，且事實與新聞稿一致。
產出新聞發布同步社群文（每變體 1 個平台口吻：FB / LinkedIn / Threads）。
這是新聞稿發出當天，品牌官方帳號用「人話」把新聞推出去、引導點進完整稿。社群版要做新聞稿做不到的事：有觀點、有情緒、可被分享。
規則：
- 100–200 字。第一句是鉤子或一個反直覺事實，不要「我們今天宣布／很高興分享」。
- 用第一人稱品牌口吻（社群可以有態度，不必第三人稱），但事實仍須與新聞稿一致。
- 含 1 個具體數字或名字；點出「對讀者而言為什麼值得在意」。
- 平台差異：FB 口語帶情緒、LinkedIn 講產業意義與專業觀點、Threads 短句直接有梗。
- 結尾一個明確 CTA，連到完整新聞稿。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    // 2026-05-17 (CJ「新聞稿類別增加新聞點子產生器，先 30s 測最完整版」):
    // upstream task — turns "公司想講的事" into "記者會主動報的角度".
    // Pool of 8 distinct earned-idea angles (reuse headline reveal-more).
    id: "pr-30-news-hook",
    tier: "30s", postType: "press-release",
    label: { en: "News Angle Generator", zh: "新聞點子產生器" },
    description: { en: "Turn \"what the company wants to say\" into \"the angle reporters volunteer to run\"", zh: "把「公司想講的事」變成「記者會主動報的角度」" },
    agent_id: 29, skill_slug: "press-release",
    source: { type: "award", short: "The Tampon Book（Cannes Lions 2019）", takeaway: "先找到記者會想寫的主張，再談產品" },
    primary_question: "公司想對外講的事 / 素材是什麼？（越具體越好）",
    primary_input: { key: "context", placeholder: "你想宣布/想讓外界知道的事＋手上有的事實、數字、人、時間點", type: "textarea" },
    inputs: [{ key: "context", label: "想對外講的事 + 手上素材", type: "textarea", required: true }],
    systemPrompt: `【得獎工藝參考】The Tampon Book（Cannes Lions 2019 PR 全場大獎）＋ Whopper Detour（Cannes Lions 2019）：得獎不是「把公告寫好」，而是先找到一個「記者會主動想報、群眾會主動想傳」的角度（earned idea）。你的工作就是產出這個角度，不是寫稿。

輸入是公司「想講的事」與手上素材。請產出「一個」可被記者報導的新聞角度（每個變體＝一個完全不同的切入），嚴格照此格式輸出：

【角度】<一句話：這則新聞的鉤是什麼，不是公司想說什麼，而是記者會怎麼下標>
【為什麼會被報】<2–3 句：對記者的讀者/社會為何重要、為什麼是現在；扣一個具體事實或數字（沒有就標[待補]）>
【一句 pitch】<可直接貼給記者的一句話，賣角度不賣品牌>
【建議下一步】<接哪個新聞稿任務展開：例「用『新聞稿標題』生標題」「用『media pitch』寫信給科技記者」>

準則：
- 角度要通過「記者測試」：記者會主動選嗎？不要把公關公告改寫成問句。
- 善用 reframe（換框架）、newsjack（借時事/趨勢）、反直覺數據、人的故事、產業意義——每個變體用不同手法，不要同一招換句話。
- 具體勝過修辭；不杜撰，缺的事實標 [待補]。
- 只輸出上面四個欄位，不要前言或結語。
${PR_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "pr-30-stunt-release",
    tier: "30s",
    postType: "press-release",
    label: { en: "Release: Build a Place, Not a Message", zh: "新聞稿：把一個實體場景變成新聞" },
    description: { en: "Reporters need something to photograph", zh: "記者要拍得到東西才會來" },
    agent_id: 29,              // 沿用同 postType 現役卡
    skill_slug: "press-release",
    source: {
      type: "viral",
      short: "Airbnb「Barbie 夢幻之家」",
      metric: "逾 13,000 則媒體報導、2.5 億次社群曝光",
      asOf: "2023-07",
      takeaway:
        "會被大量轉載的新聞稿背後都有一個「可以被拍」的實體——先做出那個東西，新聞稿只是說明書。",
    },
    primary_question: "你可以做出什麼實體的、可以被拍照的東西？",
    primary_input: { key: "topic", placeholder: "例：把門市改造成某個場景 / 開放一天的特殊空間", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以被拍照的實體場景", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則以「實體場景」為核心的新聞稿。

結構：
1. 標題：講那個東西是什麼、在哪裡、什麼時候，不要形容詞。
2. 首段：記者可以拍到什麼（列出 3 個具體畫面）。
3. 為什麼做這件事，一段，不超過 100 字。
4. 參與或採訪方式：時間、地點、聯絡窗口、是否需預約。
5. 引述：一位真的參與製作的人，講一件執行上的細節，不要講願景。

硬規則：
- 首段不准出現品牌形容詞（領先、首創、頂級）。
- 「可以拍到什麼」必須具體到攝影記者看得懂。
- 沒有確定的時間地點不要發稿，寫成待定會被丟掉。
- 引述要像人講的話。`,
    preferredModel: "qwen",
    maxTokens: 1980,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  {
    id: "pr-30-media-own-mistake",
    tier: "30s",
    postType: "press",
    label: { en: "Media: Say It All Before They Ask", zh: "媒體關係：出事時先把話講完" },
    description: { en: "Take the story back with self-deprecation", zh: "用自嘲換回主導權的回應包" },
    agent_id: 223197,              // 沿用同 postType 現役卡
    skill_slug: "pr-writing",
    source: {
      type: "viral",
      short: "KFC「FCK」",
      metric: "逾 700 則報導，觸及約 7.97 億人",
      asOf: "2018-02",
      takeaway:
        "危機報導的長度取決於記者還能問到什麼——把已知的全部先講完，並用一個自嘲的動作降低敵意，故事就會提早結束。",
    },
    primary_question: "現在發生了什麼事？已知的事實有哪些？",
    primary_input: { key: "topic", placeholder: "例：缺貨 / 系統故障 / 品質問題，以及已確認的原因", type: "textarea" },
    inputs: [
      { key: "topic", label: "事件 + 目前已確認的事實", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一份危機情況的媒體回應包。

要產出：
1. 一句話聲明：把事情講完，不超過 40 字，不要辯解。
2. 已知事實清單：時間、範圍、影響人數，只列已確認的。
3. 未知事項清單：明白寫出還不知道什麼、什麼時候會知道。
4. 一個能降低敵意的具體動作（自嘲式的公開表達、主動公開資料、開放查核）。
5. 記者最可能問的 5 個問題與答案，包含最難的那一題。

硬規則：
- 未知的事要說未知，不要用模糊句掩蓋。
- 禁止「造成不便深感抱歉」這類套語，用具體的話道歉。
- 不要把責任推給供應商或個別員工。
- 答不出來的題目就寫「目前無法回答，X 日前補充」，不要編。`,
    preferredModel: "qwen",
    maxTokens: 1760,
    outputDefaults: { platform: "press", post_type: "press" },
  },
];

const VINCENT_ID = 60011;
export const PR_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  // 2026-05-17 (CJ「存很多產出，每次給幾個，不滿意再多給」): generate a
  // POOL of 8 distinct-angle headlines in one run. RunPage surfaces 3,
  // 「再給我幾個標題」reveals the rest from this already-persisted pool —
  // zero extra cost/latency. captionMax tightened to one-line headline.
  "pr-30-headline":           { variants: 8, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["事實式", "受影響者視角", "對比式", "反問式", "數據衝擊", "時機式", "引述式", "懸念式"], captionMinChars: 12, captionMaxChars: 42 },
  "pr-30-subhead":            { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["影響面", "規模延伸", "時程感"], captionMinChars: 30, captionMaxChars: 80 },
  "pr-30-lead-paragraph":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["事實密度型", "影響面型", "故事感型"], captionMinChars: 70, captionMaxChars: 180 },
  "pr-30-ceo-quote":          { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["願景式", "客戶價值", "市場觀察"], captionMinChars: 1800, captionMaxChars: 3200 },
  "pr-30-boilerplate":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["產品導向", "規模導向", "里程碑導向"], captionMinChars: 150, captionMaxChars: 300 },
  "pr-30-fact-sheet":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["產品優先", "公司優先", "市場優先"], captionMinChars: 280, captionMaxChars: 1400 },
  "pr-30-media-pitch":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["共同議題切入", "獨家數據切入", "採訪邀請切入"], captionMinChars: 100, captionMaxChars: 250 },
  "pr-30-spokesperson-qa":    { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["防禦型", "透明型", "主動引導"], captionMinChars: 300, captionMaxChars: 1000 },
  "pr-30-launch-social":      { variants: 3, images: 3, runImageGen: false, imageDirectorId: VINCENT_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["FB 口吻", "LinkedIn 口吻", "Threads 口吻"], captionMinChars: 100, captionMaxChars: 250 },
  // 8-angle pool; RunPage pool mode (>4) gives 再給我幾個 reveal-more.
  "pr-30-news-hook":          { variants: 8, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["Reframe 換框架", "Newsjack 借時事", "反直覺數據", "人的故事", "產業意義", "對比衝突", "首次/之最", "在地連結"], captionMinChars: 80, captionMaxChars: 400 },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "pr-30-stunt-release": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["場景版", "限時版", "開放參觀版"],
    captionMinChars: 400, captionMaxChars: 900,
  },
  "pr-30-media-own-mistake": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, fluxSize: null, imageQualitySteps: 0,
    variantLabels: ["自嘲版", "時間軸版", "第三方查核版"],
    captionMinChars: 350, captionMaxChars: 800,
  },
};

export function getPROrchestraConfig(taskId: string): OrchestraConfig | null {
  return PR_30S_ORCHESTRA[taskId] ?? null;
}
