/**
 * PR / Press Release craft layer — 2026-05-17.
 * Faithful mirror of igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW) for the PR family only. Injected only for
 * pr-family body tasks so other platforms are completely unaffected.
 *
 * PR copy is inverted-pyramid first: most newsworthy fact leads.
 * The rubric encodes both long-form release craft + short-form pitch
 * craft plus zh-TW Taiwan media landscape localisation.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a PR-family task?
 * Covers pr-* templates + any task whose output channel is press-release.
 */
export function isPRTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("pr-")) return true;
  return (template.outputDefaults?.platform as string) === "press-release";
}

/** All PR tasks are full-body outputs — no atomic fragments to exclude. */
export function isPRBodyTask(template: FBTaskTemplate): boolean {
  return isPRTask(template);
}

/** The award-grade PR rubric — inverted pyramid + zh-TW Taiwan media. */
export const PR_CRAFT_RUBRIC = `
# PR 得獎級工藝準則（嚴格遵守）
新聞稿是倒三角結構——最有新聞價值的事實放第一段，細節往下遞減：
【新聞價值 craft】
- 5W 第一段：Who、What、When、Where、Why 在首段全部回答；記者不需要讀第二段就能判斷能否寫成新聞。
- 新聞鉤：Timeliness（今天/這週）+ Significance（影響多少人）+ Human Interest（誰的生活會改變）三選二以上。
- 數字說話：具體數字勝過形容詞（「降低 40% 碳排」勝過「大幅減少碳排放」）。
- 反直覺角度：最好的 PR 鉤子都有輕微的認知衝突（Patagonia 叫消費者不要買），讓記者有故事可以說。
【結構 craft】
- Headline：主動語態、動詞放前面、含最強新聞點、45 字以內（英文）/ 20 字以內（中文）。
- Lead paragraph：一句話版本的整篇新聞稿；能獨立被轉推。
- Subhead：用資訊密度＋巧思壓縮一個次要重點；非標題的重複。
- 引言（CEO quote）：品牌立場聲明，非 PR 填充語（「我們很興奮」一律刪除）；引言要有可被截取的觀點。
- Boilerplate：公司描述 100 字內、有具體事實（成立年份/服務範圍/用戶數）、無行銷語言。
- Fact Sheet：資料表格式，一行一事實，記者複製貼上即可使用。
【媒體 pitch craft】
- 一個 pitch 一個角度：不要一次投三個故事；選最適合那個媒體讀者的那一個。
- 個人化：第一句說明為什麼這個故事適合這個記者（引用其過去報導）。
- 新聞搶奪視窗：Newsjacking 必須在 1-2 小時內發出；過了窗口就沒有新聞性。
【zh-TW 在地化｜最高優先】
- 台灣媒體生態：自由時報、聯合報、中時、商業週刊、數位時代、TechOrange 各有不同讀者與角度。
- 繁體中文、正式新聞稿語氣；引言用台灣高階主管慣用語；避免中國大陸用詞。
- 台灣特有新聞節點（金鐘獎/金曲獎/台灣大選/雙11/年貨大街）優先於西方節慶。
`.trim();

/**
 * Per-task award reference. Each PR task is anchored to the most
 * relevant award case; the line captures the transferable craft
 * pattern (principle, NOT the campaign's creative).
 */
const PR_TASK_REF: Record<string, string> = {
  "pr-30-headline":        "Apple 產品發表新聞稿標題（PR Week Award Best Technology PR）：主動語態＋最強事實＋45 字內；「One more thing」結構成為業界標準。",
  "pr-30-lead-paragraph":  "Patagonia「Don't Buy This Jacket」新聞稿（Cannes Lions PR Grand Prix 2013）：首段即呈現反直覺主張，記者一句話就抓到故事角度。",
  "pr-30-subhead":         "《經濟學人》副標寫作風格（多屆編輯大獎）：資訊密度＋機智，一行壓縮次要重點，非主標重複。",
  "pr-30-news-hook":       "Liquid Death「最髒的廣告」公關新聞鉤（Inc. Magazine Most Creative Brand；Clio Award Grand Prix）：反常識品牌主張讓媒體自動報導而無需主動 pitch；每個新聞鉤都製造記者「我必須寫這篇」的認知衝突；PR 曝光超過廣告投入 20 倍。",
  "pr-30-ceo-quote":       "Satya Nadella 微軟文化轉型 CEO 引言策略（Wall Street Journal 企業公關分析；《Hit Refresh》出版後媒體引用率最高的科技 CEO 引言）：「Growth mindset」系列引言讓 CEO 成為文化變革的可信代言人而非企業 spin 機器；每句引言都是一個可被記者獨立成文的品牌觀點。",
  "pr-30-boilerplate":     "Stripe 公司介紹 boilerplate（Stripe 的 boilerplate 是科技新創 PR 業界最被引用的精簡範本）：3 句內：「做什麼（具體產品）→ 服務誰（具體受眾）→ 規模（具體數字）」；零行銷語言；記者複製貼上即可直接引用；不說「leading provider」或「innovative solutions」。",
  "pr-30-fact-sheet":      "Tesla 車款規格 Fact Sheet（Product Hunt Product of the Year）：事實表即敘事——數字排列順序決定閱讀節奏，非只是規格羅列。",
  "pr-30-media-pitch":     "Dollar Shave Club TechCrunch pitch（48 小時 12,000 人註冊；新創 PR 史上最被引用的 media pitch）：一個故事角度、個人化開場、說明為何這個記者的讀者需要知道。",
  "pr-30-spokesperson-qa": "Netflix「魷魚遊戲」PR Q&A（SABRE Award Best Entertainment PR 2022）：Q&A 是故事播種工具而非 FAQ；每個 A 都埋入可被引用的新聞點。",
  "pr-30-launch-social":   "Nike「Dream Crazy」發布社群 PR 文案（Cannes Lions PR Grand Prix 2019）：社群 PR 文案將新聞稿的中心主張延伸為社群對話，不是截圖新聞稿。",
  "pr-60-news-release-full":"Tesla Model 3 完整新聞稿（《Wired》科技 PR 十年最佳；零傳統廣告投入、新聞稿本身創造等效 40 億美元媒體曝光）：倒三角完整新聞稿 = 最強事實 Lead（48 小時 35 萬輛預訂）→ 產品細節（每段獨立可截取）→ CEO 引言（Musk 的立場，非填充語）→ Boilerplate；新聞稿是內容，不是宣傳品。",
  "pr-99-launch-toolkit":  "Oatly 美國市場上市完整 PR 工具包（Cannes Lions Grand Prix Outdoor 2020；以「反廣告」策略設計的上市 PR）：工具包 = 反常識媒體素材包（把廣告批評自己的聲音做成廣告）→ 記者主動報導而非被 pitch → KOL 有機分享 → 零售通路同步報導；讓媒體自己生出「這是最奇怪的食品 PR」的標題。",
  "pr-99-newsjack":        "Oreo「Dunk in the Dark」即時 Newsjacking（Cannes Lions Titanium Shortlist 2013）：1 小時內發出；品牌關聯性強；非機會主義式；15,000 轉推＋20,000 Facebook 讚一小時內。",
};

/** Per-use-case playbook — keyed by taskId pattern. */
export function prPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = PR_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（PR 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/headline/.test(id))
    return P("主動語態、動詞優先、最強新聞點在前；中文 20 字內、英文 45 字內；避免形容詞堆砌。");
  if (/lead/.test(id))
    return P("倒三角第一段：5W 全回答、一句話能獨立轉推；含最強新聞事實＋反直覺角度。");
  if (/subhead/.test(id))
    return P("資訊密度優先：壓縮一個次要重點＋輕微機智；不重複標題、不是廢話裝飾。");
  if (/news-hook/.test(id))
    return P("鉤子公式：Timeliness＋Significance＋Human Interest；目標是創造媒體週期，不只一篇報導。");
  if (/ceo-quote/.test(id))
    return P("引言要有立場：刪掉所有「我們很興奮/很榮幸」；每句都必須是可被截取的品牌觀點。");
  if (/boilerplate/.test(id))
    return P("公司描述 100 字以內；含成立年份、核心服務、具體規模數字；零行銷語言。");
  if (/fact-sheet/.test(id))
    return P("一行一事實、表格格式；數字排列順序要說故事；記者複製貼上即可直接引用。");
  if (/media-pitch/.test(id))
    return P("一個 pitch 一個故事角度；第一句個人化（引用記者過去報導）；說明為何該媒體讀者需要知道。");
  if (/spokesperson|qa/.test(id))
    return P("每個 Q 背後有記者真實疑慮；每個 A 都埋可被引用的新聞點；長度控制在 3 句話以內。");
  if (/launch-social/.test(id))
    return P("社群 PR 文案＝將新聞稿中心主張轉成社群語氣；不是截圖新聞稿；有 share 誘因。");
  if (/news-release|release-full/.test(id))
    return P("完整新聞稿：Headline→Lead→Subhead→正文（倒三角）→CEO 引言→Boilerplate；每段可獨立截取。");
  if (/launch-toolkit/.test(id))
    return P("工具包＝一個中心編輯主張＋多格式分發（新聞稿/媒體 pitch/社群/發言人 Q&A）；每件素材都能獨立引發報導。");
  if (/newsjack/.test(id))
    return P("速度第一（1-2 小時窗口）；品牌關聯性必須真實不勉強；非機會主義式；一條內容、一個清晰品牌角度。");

  return P("PR 通用：倒三角結構、5W 首段、數字說話、CEO 引言有立場、媒體 pitch 一角度一媒體。");
}
