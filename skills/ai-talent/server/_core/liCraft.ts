/**
 * LinkedIn craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts / fbCraft.ts.
 * Brand-agnostic craft discipline; brand voice from digest; hard rules
 * from post-gen enforcement. Injected only for LI-family body tasks.
 *
 * LinkedIn is a professional credibility medium: content earns reach by
 * demonstrating expertise, not by being likeable. The rubric encodes
 * both thought-leadership and B2B conversion craft + zh-TW localisation.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a LinkedIn-family task? */
export function isLinkedInTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("li-")) return true;
  return template.outputDefaults?.platform === "linkedin";
}

/**
 * A "full body" LI deliverable vs an atomic fragment.
 * Fragments (dm-intro / comment / headline) are already compact
 * purpose-built outputs — the heavy rubric homogenises them. Skip.
 */
export function isLinkedInBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/dm-intro|^li-\d+-comment$/.test(id)) return false;
  // headline is a single-line profile field — skip rubric
  if (id === "li-30-headline") return false;
  return isLinkedInTask(template);
}

/** LI award-grade rubric — thought leadership + B2B + zh-TW. */
export const LI_CRAFT_RUBRIC = `
# LI 得獎級工藝準則（嚴格遵守）
LinkedIn 是專業可信度媒介——觸及靠展現真實洞察賺來，不靠可愛；轉換靠信任建立，不靠促銷。
【貼文 craft】
- "See more" 是靠前 2 行贏的：反共識主張、具體數字、或讓讀者感覺「這就是我昨天的狀況」的場景句——不要「今天分享一個想法」。
- 論證結構：反共識主張（1句）→ 2-3 段論述（含 1 個數據 / 具體案例）→ 提問收尾（引留言）。
- 可信度建立：具體勝過模糊（「降低 43% 流失率」勝過「大幅改善留存」）；個人失敗/反轉案例 > 成功吹捧。
- 觸發 comment：結尾問題要讓讀者覺得「我的答案和你的不同，值得說出來」——不是反問，是真實開放題。
- 觸發 repost：觀點要夠銳利讓人覺得「我的人脈必須看到這個」——分享動機是「彰顯自己的品味」。
【Document / Article craft】
- 封面頁：5-8 字大標（包含具體數字或反差）+ 副標 1 句定位讀者（「給正在面對 X 的 B2B 行銷人」）。
- 每頁/每段 = 1 個完整論點：標題可獨立看懂；內文 30-50 字補充；不要「各位親愛的讀者」式廢話。
- 最後一頁：總結 1 句 + 行動邀請（留言 / 追蹤 newsletter / 連結）——不是「感謝收看」。
【Newsletter craft】
- 標題 = 一個具體可測試的主張（「為何 76% 的 SDR 應該停止打冷電話」）而非「第 23 期週報」。
- 開頭 = 你的讀者上週剛經歷的一個具體場景，不是摘要。
【B2B 語氣原則】專業洞察 ≠ 官腔；用第一人稱觀點（「我認為」「我見過」）不用被動語態；數據 + 故事並用。
【zh-TW 在地化｜最高優先】台灣 B2B 情境（科技業/製造業/電商/代理商）；繁體中文；台灣商業用語（「主管」「老闆」「業務」「跑業績」而非陸式說法）。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId.
 */
const LI_TASK_REF: Record<string, string> = {
  "li-30-insight-post":
    "IBM「The Machine」LinkedIn 思想領袖系列 (LinkedIn Marketing Award Best Thought Leadership B2B 2020)：真實從業者視角 + 具體數據 + 開放問題；pattern：數據點→個人看法→「你怎麼想？」",
  "li-30-hook-3":
    "Adam Grant LinkedIn 病毒式貼文系列 (Shorty Award Best Creator Thought Leadership 2022)：最強 hook 是「聽起來錯誤但可被驗證為真」的一句話；8 個字內、不需要任何前情提要。",
  "li-30-article-opener":
    "HubSpot「State of Marketing」LinkedIn Articles (Content Marketing Award Best Research Content 2022)：opener = 你的讀者上週剛經歷的一個具體場景（不是「本文將探討」，是「上週二你的業務第 8 次被拒絕了」）。",
  "li-30-poll":
    "LinkedIn 官方「Global Talent Trends」polls (LinkedIn Marketing Award Best Content Campaign 2021)：最好的 poll 問題是「你這週正在面對的決策」——投票感覺像自我反思，不像填問卷。",
  "li-30-event-invite":
    "Salesforce「Dreamforce」LinkedIn 活動系列 (Cannes Lions B2B Lions Best Campaign 2022)：邀請錨定在「與會者的轉化」（「你離開時會知道 X」）而非活動後勤；成為對方值得花一天的理由。",
  "li-30-newsletter":
    "Microsoft LinkedIn Newsletter「Work Trend Index」(LinkedIn Marketing Award Best Newsletter 2023)：標題 = 一個具體可測試的主張，讓訂閱者覺得「不讀就落後了」；開頭用讀者的真實場景啟動。",
  "li-30-document":
    "Adobe「Future of Creativity」LinkedIn Document (Cannes Lions B2B Lions Best Branded Content 2023)：每頁賺到下一頁的滑動——第 1 頁大膽主張、第 2-7 頁逐頁升級證明、最後 1 頁：「現在你知道了，該怎麼辦？」",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function liPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = LI_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（LI 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/insight-post/.test(id))
    return P("觀點貼文：反共識主張前置→2-3 段具體數據/案例論證→開放問題引留言；第一人稱觀點；「repost 理由」嵌入洞察本身。");
  if (/hook-3/.test(id))
    return P("Hook 3 種：每變體 1 種策略（反共識/數據反差/個人故事）；8 個字內、不需要前情提要；'See more' 靠前 2 行贏。");
  if (/article-opener/.test(id))
    return P("Article 開頭：讀者上週剛經歷的一個具體場景→個人連結（為何我在寫這篇）→這篇的 3 個重點；不要「本文將…」式起手。");
  if (/poll/.test(id))
    return P("Poll：問題 = 讀者這週正在面對的決策；4 個選項互斥且涵蓋常見分歧；caption 說明為何問（1句）；投票感覺像自我反思。");
  if (/event-invite/.test(id))
    return P("活動邀請：hook（為何這場有獨特價值）→主題/講者簡介→3 個帶走點→CTA；錨定在「與會者的轉化」，不是活動後勤。");
  if (/newsletter/.test(id))
    return P("Newsletter 標題 + 開頭：標題 = 具體可測試主張；開頭 = 讀者的真實場景；讓不讀感覺像落後。");
  if (/document/.test(id))
    return P("Document：封面大標含具體數字；每頁 1 個完整論點（標題獨立可讀）；末頁總結 + 行動邀請；每頁賺下一頁的滑動。");
  // default
  return P("LI 通用：反共識主張前置；具體數據/場景；第一人稱觀點；開放問題引留言；觸發 repost 的洞察銳利度。");
}
