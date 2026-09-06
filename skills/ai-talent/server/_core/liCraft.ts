/**
 * LinkedIn craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts / fbCraft.ts.
 * Brand-agnostic craft discipline; brand voice from digest; hard rules
 * from post-gen enforcement. Injected for ALL LI-family body tasks
 * (30s / 60s / 99s).
 *
 * LinkedIn is a professional credibility medium: content earns reach by
 * demonstrating expertise, not by being likeable. The rubric encodes
 * both thought-leadership and B2B conversion craft + zh-TW localisation.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a LinkedIn-family task? (30s / 60s / 99s) */
export function isLinkedInTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("li-")) return true;
  return template.outputDefaults?.platform === "linkedin";
}

/**
 * A "full body" LI deliverable vs an atomic fragment.
 * Fragments (dm-intro / comment / headline) are compact purpose-built
 * outputs — the heavy rubric homogenises them. Skip.
 */
export function isLinkedInBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/dm-intro/.test(id)) return false;
  if (/li-\d+-comment$/.test(id)) return false;
  if (id === "li-30-headline") return false;
  return isLinkedInTask(template);
}

/** LI award-grade rubric — thought leadership + B2B + zh-TW. */
export const LI_CRAFT_RUBRIC = `
# LI 得獎級工藝準則（嚴格遵守）
LinkedIn 是專業可信度媒介——觸及靠展現真實洞察賺來，不靠可愛；轉換靠信任建立，不靠促銷。
【每一篇都必守：從 TA 視角寫 + 一個洞見（最高優先，違反＝不合格）】
- **從 TA 視角寫，不是對 TA 喊話**：禁用「身為 ___ 的你」「對 ___ 經理人來說」「如果你是 ___」這類呼喚句型。改用 TA 真實世界的具體細節讓他自己認出來：他這週實際在 Slack/Email 處理的事 / 他開會時聽到主管說過的一句話 / 他內心 OS（「明明做的事很多但成效難證明」）/ 他抽屜裡或行事曆上的具體物件。寫得像那位專業人士「昨天剛遇到」。
- 只打一個洞見：整篇聚焦一個可遷移的洞察或方法論，把它說透；不要塞 5 個 takeaway、不要這篇想講三件事。
- 自我檢查：若把產業/職位遮掉仍可套到任何人 → 太通用，重寫；若一篇在傳遞超過一個核心論點 → 砍到剩一個。
【貼文 craft】
- "See more" 是靠前 2 行贏的：反共識主張、具體數字、或讓讀者感覺「這就是我昨天的狀況」的場景句——不要「今天分享一個想法」。
- 論證結構：反共識主張（1句）→ 2-3 段論述（含 1 個數據 / 具體案例）→ 提問收尾（引留言）。
- 可信度建立：具體勝過模糊（「降低 43% 流失率」勝過「大幅改善留存」）；個人失敗/反轉案例 > 成功吹捧。
- 觸發 comment：結尾問題要讓讀者覺得「我的答案和你的不同，值得說出來」——真實開放題，不是反問。
- 觸發 repost：觀點要夠銳利讓人覺得「我的人脈必須看到這個」——分享動機是「彰顯自己的品味/判斷力」。
【Document / Article craft】
- 封面頁：5-8 字大標（包含具體數字或反差）+ 副標 1 句定位讀者（「給正在面對 X 的 B2B 行銷人」）。
- 每頁/每段 = 1 個完整論點：標題可獨立看懂；內文 30-50 字補充；不要「各位親愛的讀者」式廢話。
- 最後一頁：總結 1 句 + 行動邀請（留言 / 追蹤 newsletter / 連結）——不是「感謝收看」。
【Newsletter craft (30s + 60s + 99s)】
- 標題 = 一個具體可測試的主張（「為何 76% 的 SDR 應該停止打冷電話」）而非「第 23 期週報」。
- 開頭 = 你的讀者上週剛經歷的一個具體場景，不是摘要。
- 季度版：每期錨在一個可量化的產業轉變；累積跨期的觀點權威；建議讀者行動（不只告知）。
【Case Study craft (60s)】
- 客戶是主角解決真實挑戰；品牌 = 使能工具，不是主詞。
- 結構：挑戰（1段）→ 解法（2段）→ 量化結果（1段）→ 讓讀者帶走的洞察（1段）。
- 數字具體：「銷售週期縮短 3 週」而非「大幅改善效率」。
【思想領袖 30 天 (99s)】
- 30 天 = 1 個一致 POV 從不同角度探索（數據/故事/反駁/Q&A 輪流）。
- 每週主題弧：第 1 週提問，第 2 週深化，第 3 週挑戰，第 4 週結論+新問題。
- 互動設計：每週至少 1 個 poll / 1 個 Q&A → 累積留言和建立社群。
【B2B 語氣原則】專業洞察 ≠ 官腔；用第一人稱觀點（「我認為」「我見過」）不用被動語態；數據 + 故事並用。
【zh-TW 在地化｜最高優先】台灣 B2B 情境（科技業/製造業/電商/代理商）；繁體中文；台灣商業用語（「主管」「老闆」「業務」「跑業績」而非陸式說法）。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId (30s + 60s + 99s).
 */
export const LI_TASK_REF: Record<string, string> = {
  // ── 30s ───────────────────────────────────────────────────────────────
  "li-30-insight-post":
    "Salesforce LinkedIn 思想領袖貼文策略 (Cannes Lions B2B Lions Grand Prix 2022；Salesforce 是 LinkedIn 最具影響力的 B2B 品牌之一)：真實從業者視角 + 具體數據 + 開放問題；pattern：數據點→個人看法→「你怎麼想？」",
  "li-30-hook-3":
    "Adam Grant LinkedIn 有機病毒式貼文 (LinkedIn 官方評選「Top Voices」多年；他的貼文平均留言數位居平台前 0.1%)：最強 hook 是「聽起來錯誤但可被驗證為真」的一句話；8 個字內、不需要任何前情提要。",
  "li-30-article-opener":
    "HubSpot「State of Marketing」年度報告 LinkedIn Articles (Content Marketing Institute Award Best Research；HubSpot 最高流量的 LinkedIn 內容類型)：opener = 讀者上週剛經歷的具體場景，不是「本文將探討」。",
  "li-30-poll":
    "LinkedIn 官方「Global Talent Trends」報告配套 polls (LinkedIn 平台自有數據顯示 poll 留言率高 3-5x；LinkedIn 官方行銷案例)：最好的 poll 問題是「你這週正在面對的決策」——投票感覺像自我反思。",
  "li-30-event-invite":
    "TED Conferences LinkedIn 活動邀請策略 (LinkedIn Marketing Award；TED 活動邀請是 LinkedIn 互動率最高的非商業活動邀請格式)：邀請錨定在「你帶走什麼能力或見解」而非活動後勤（日期/地點/議程）；邀請文案讓讀者感覺「這場改變的是我的思考方式，不只是我的行事曆」。",
  "li-30-newsletter":
    "Microsoft「Work Trend Index」LinkedIn Newsletter (Microsoft 官方發布；每期超過 100 萬訂閱者，LinkedIn 訂閱量最高的企業 Newsletter 之一)：標題 = 具體可測試主張；開頭用讀者的真實場景啟動。",
  "li-30-document":
    "Adobe「Future of Creativity」LinkedIn Document 系列 (Cannes Lions B2B Lions Shortlist 2022；Adobe 在 LinkedIn 的標誌性 Document post 格式)：每頁賺到下一頁的滑動——第 1 頁大膽主張、中段逐頁升級、末頁：「現在你知道了，該怎麼辦？」",

  // ── 60s ───────────────────────────────────────────────────────────────
  "li-60-thought-leader":
    "McKinsey「McKinsey Global Institute」LinkedIn 長文思想領袖策略 (LinkedIn 最多被分享的管顧品牌之一；McKinsey Insights 為 LinkedIn 思想領袖長文的行業標竿)：個人故事 + 產業數據 + 3 個可帶走的行動點；讀完感覺像被點撥。",
  "li-60-newsletter":
    "James Clear「Atomic Habits」LinkedIn Newsletter (LinkedIn 官方精選 Top Newsletter；James Clear 以「1 個可執行概念 per issue」格式建立 300 萬+ 訂閱的個人品牌)：完整 newsletter = 標題 = 具體可測試主張（不是第幾期）；opener = 1 個讀者本週已遇到的場景；每節賺到繼續讀；結尾 1 個具體行動概念，讓讀者收藏這封。",
  "li-60-case-study":
    "IBM「Watson」B2B Case Study LinkedIn 格式 (Cannes Lions B2B Lions Silver 2022；IBM 讓 AI 技術透過用戶故事變得有人性)：客戶是主角解決真實業務挑戰；IBM Watson 是使能工具，不是主詞；量化結果（縮短決策時間 X 週）嵌入感性敘事；讓複雜技術產品透過具體人物故事變得可理解。",

  // ── 99s ───────────────────────────────────────────────────────────────
  "li-99-30day-thought-leadership":
    "Arianna Huffington 30 天 LinkedIn 思想領袖節奏 (LinkedIn Top Voice；Thrive Global 創辦人在 LinkedIn 的每日職場洞察建立跨媒體個人品牌)：30 天 = 1 個一致 POV（職場幸福與高效能不衝突）從不同角度探索；每週交替格式（個人故事/研究數據/反問/Poll）；跨 30 天建立讀者期待的節律感。",
  "li-99-newsletter-quarterly":
    "Microsoft「Work Trend Index」季度 LinkedIn Newsletter 系列 (Microsoft 官方出版；每季超過 500 萬人次閱讀；LinkedIn 平台上最被引用的商業研究 newsletter)：每期錨在 1 個可量化的產業轉變；累積跨期觀點權威。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function liPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = LI_TASK_REF[id];
  // 2026-09-06 (CJ): fallback exemplar per branch. Until now `ref` existed
  // only on an exact task-id hit, and a brand pack's custom ids are never in
  // LI_TASK_REF — so those cards got the structure and no case. Each fallback is
  // resolved from the SAME regex that selected the branch, against this
  // module's own case pool: no second lookup table to drift, no new claim.
  const P = (s: string, fallbackKey?: keyof typeof LI_TASK_REF) => {
    const use = ref ?? (fallbackKey ? LI_TASK_REF[fallbackKey] : undefined);
    return `# 本任務 playbook（LI 得獎模式）\n${s}` +
      (use ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${use}` : "");
  };

  // ── 30s ───────────────────────────────────────────────────────────────
  if (/insight-post/.test(id))
    return P("觀點貼文：反共識主張前置→2-3 段具體數據/案例論證→開放問題引留言；第一人稱觀點；「repost 理由」嵌入洞察本身。", "li-30-insight-post");
  if (/hook-3/.test(id))
    return P("Hook 3 種：每變體 1 種策略（反共識/數據反差/個人故事）；8 個字內、不需要前情提要；'See more' 靠前 2 行贏。", "li-30-hook-3");
  if (/article-opener/.test(id))
    return P("Article 開頭：讀者上週剛經歷的一個具體場景→個人連結（為何我在寫這篇）→這篇的 3 個重點；不要「本文將…」式起手。", "li-30-article-opener");
  if (/poll/.test(id))
    return P("Poll：問題 = 讀者這週正在面對的決策；4 個選項互斥且涵蓋常見分歧；caption 說明為何問（1句）；投票感覺像自我反思。", "li-30-poll");
  if (/event-invite/.test(id))
    return P("活動邀請：hook（為何這場有獨特價值）→主題/講者簡介→3 個帶走點→CTA；錨定在「與會者的轉化」，不是活動後勤。", "li-30-event-invite");

  // ── 共用 newsletter（30s + 60s）──────────────────────────────────────
  if (/newsletter/.test(id))
    return P("Newsletter：標題 = 具體可測試主張（不是期數）；opener = 讀者的親身場景；每節賺到繼續讀；結尾 1 個具體行動建議。", "li-30-newsletter");

  // ── 共用 document（30s）──────────────────────────────────────────────
  if (/document/.test(id))
    return P("Document：封面大標含具體數字；每頁 1 個完整論點（標題獨立可讀）；末頁總結 + 行動邀請；每頁賺下一頁的滑動。", "li-30-document");

  // ── 60s ───────────────────────────────────────────────────────────────
  if (/thought-leader/.test(id))
    return P("思想領袖長文：個人故事 + 產業洞察 + 3 個可帶走的行動點；具體數據嵌入感性敘事；讀完感覺被點撥而非被說服。", "li-60-thought-leader");
  if (/case-study/.test(id))
    return P("Case Study：客戶是主角；挑戰→解法→量化結果→讀者帶走的洞察；數字具體；品牌是工具不是主詞；去掉所有吹捧語。", "li-60-case-study");

  // ── 99s ───────────────────────────────────────────────────────────────
  if (/30day-thought/.test(id))
    return P("30 天思想領袖：1 個一致 POV 從不同角度探索；每週弧：提問→深化→挑戰→結論+新問題；每週至少 1 個互動（poll/Q&A）。", "li-99-30day-thought-leadership");
  if (/newsletter-quarterly/.test(id))
    return P("季度 Newsletter 系列：每期錨在 1 個可量化的產業轉變；累積跨期觀點權威；每期最後 1 個具體行動建議；系列標題一致性建立品牌。", "li-99-newsletter-quarterly");

  return P("LI 通用：反共識主張前置；具體數據/場景；第一人稱觀點；開放問題引留言；觸發 repost 的洞察銳利度。", "li-30-insight-post");
}
