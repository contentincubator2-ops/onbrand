/**
 * Facebook craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW); brand voice/essence still from the brand digest;
 * hard rules from the post-gen enforcement layer. Static constant — no DB,
 * no per-brand state. Injected only for FB-family body tasks.
 *
 * Facebook is a community-first medium: organic reach is earned by
 * triggering saves/shares/comments. Ads live or die by the first 3 words.
 * Both tracks (organic + paid) encoded here.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a Facebook-family task? */
export function isFacebookTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("fb-")) return true;
  return template.outputDefaults?.platform === "facebook";
}

/**
 * A "full body" FB deliverable vs an atomic fragment.
 * Fragments (comment-reply / hashtag-set) are already purpose-built
 * tiny outputs — the heavy rubric homogenises them. Skip.
 */
export function isFacebookBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/comment-reply|hashtag-set/.test(id)) return false;
  return isFacebookTask(template);
}

/** FB award-grade rubric — organic + paid tracks + zh-TW. */
export const FB_CRAFT_RUBRIC = `
# FB 得獎級工藝準則（嚴格遵守）
Facebook 是社群優先媒介——觸及靠分享/留言/儲存賺來，廣告靠前 3 個字留人。雙軌都要達標：
【有機貼文 craft】
- 前 2 行就是命運（動態牆只露 2 行）：給具體利益、反共識觀點、或強烈情緒鉤子；不要「大家好今天要分享」。
- 觸發分享：「我要 tag 某人」型（共鳴/實用/好笑）> 「很好看」型——想分享的理由要嵌入內容本身。
- 觸發留言：結尾拋一個真實開放問題（不是反問）；問題要讓讀者覺得自己的答案值得說。
- 可掃讀：短句換行、段落間空行、重點 emoji 當視覺錨（不濫用）。
- 連結貼文：caption 先給脈絡再給連結——「為什麼你要點」比「這裡有什麼」重要。
- 置頂/個人形象貼：2 句話定位品牌 + 一個明確 CTA（追蹤/了解更多/連結）。
【廣告 craft】
- 標題（Headline）：≤ 8 個字，包含核心價值主張或反差；不要疑問句。
- 主文（Primary text）：前 3 個字決定是否繼續讀——用數字/問題/具體結果開場；痛點 → 解方 → 證明 結構。
- 描述（Description）：補充標題沒說到的具體細節（節省多少時間 / 適合誰 / 價格錨點）。
- CTA 按鈕：用結果型動詞（「開始使用」「取得報告」）而非點擊型（「了解更多」太泛）。
- 廣告文案長度：主文 ≤ 125 字最佳展示；如需要長文先放最重要的 insight，展開才有後續。
【zh-TW 在地化｜最高優先】台灣節點（春節/端午/中秋/雙十一/母親節/228/光棍節）、繁體中文、台灣口語（「超～」「真的假的」「嗯嗯嗯」等視語氣選用）。不要套用美式節慶或陸式用語。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId.
 * Each entry cites the most relevant internationally-awarded campaign for
 * this specific task type + the transferable craft pattern it demonstrates.
 * Principle only — NOT copying the campaign's creative.
 */
const FB_TASK_REF: Record<string, string> = {
  "fb-30-caption-short":
    "Wendy's「National Roast Day」Facebook (Shorty Award Best Brand Presence 2019)：每則短貼文是獨立的文化時刻；品牌機智 > 產品功能；不需要 setup，直接就是 punchline。",
  "fb-30-pure-text-hook":
    "Ryan Reynolds / Mint Mobile「Maximum Effort」Facebook 純文字貼文 (Shorty Award Humor 2020)：讀起來像真人寫的、不像行銷——反共識前置、沒有任何官腔修飾詞。",
  "fb-30-link-caption":
    "BuzzFeed Tasty Facebook 連結貼文 (Webby Award People's Voice 2017)：caption 讓點擊感覺像「完成一個被打斷的念頭」，而不是廣告；先給脈絡再給連結。",
  "fb-30-ad-headline":
    "Dollar Shave Club Facebook 廣告 (Effie Platinum New Brand 2013)：標題 = 價值主張 + 個性，一句話；「Our blades are f***ing great」的清晰度——不繞彎、不疑問。",
  "fb-30-ad-primary":
    "Airbnb「Belong Anywhere」Facebook 活動 (Cannes Lions Titanium 2014)：主文串起故事與轉換——社會證明嵌入敘事；情緒共鳴先於行動呼籲。",
  "fb-30-ad-cta":
    "Peloton 獲客漏斗 Facebook 廣告 (Shorty Award Health & Fitness 2022)：CTA 錨定在轉化結果（「開始你的旅程」）而非點擊行為——讓按鈕像承諾而非指令。",
  "fb-30-ad-description":
    "Squarespace「Make Your Next Move」Facebook 廣告 (Shorty Award 2018)：description 從不同角度強化標題、補上標題省略的具體細節；不重複、只補充。",
  "fb-30-pinned-short":
    "National Geographic Facebook 主頁 (Shorty Award Best Brand Presence Travel)：置頂 = 品牌永久第一印象；2 句話說清楚「我們是誰 + 為什麼你要追蹤」。",
  "fb-30-story-text":
    "Sephora Facebook Stories (Shorty Award Beauty Brand 2021)：Stories 是微型旅程——3 個畫面：吊胃口→產品揭示→上滑 CTA；每格獨立可看懂。",
  "fb-30-live-title":
    "Red Bull Facebook Live 活動系列 (Shorty Award Sports 2020)：直播標題 = 現在時態的緊迫感；「正在發生什麼 + 為何不能錯過」兩件事都說清楚。",
  "fb-30-countdown-1day":
    "HBO《Game of Thrones》Facebook 倒數系列 (Shorty Award Entertainment 2019)：每天倒數本身是獨立 hook——不只是「還有 X 天」，而是「今天先給你這個線索」。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function fbPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = FB_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（FB 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/ad-headline/.test(id))
    return P("廣告標題：≤ 8 字、核心價值主張 + 品牌個性；數字/反差/具體結果開場；不要疑問句；每字都要 earn its place。");
  if (/ad-primary/.test(id))
    return P("廣告主文：前 3 字決定留不留；痛點→解方→社會證明結構；≤ 125 字最佳；重要資訊不要藏在折疊後。");
  if (/ad-cta/.test(id))
    return P("廣告 CTA：結果型動詞（「取得報告」「開始使用」）而非點擊型；CTA 要像一個承諾，不是命令。");
  if (/ad-description/.test(id))
    return P("廣告描述：補充標題的具體細節（時間/錢/誰適合）；不重複主文；每個字都給轉換理由。");
  if (/ad-/.test(id))
    return P("廣告文案：標題抓注意→主文建立信任→CTA 收割；每層都有獨立工作，不要疊床架屋。");
  if (/pure-text-hook/.test(id))
    return P("純文字貼文：不依賴圖片；反共識主張或強烈情緒前置；讀起來像真人說話；觸發「我要分享這個」。");
  if (/link-caption/.test(id))
    return P("連結貼文：先給為什麼點的脈絡；讓點擊感覺像延伸自己的想法；不要只說「快來看看」。");
  if (/story/.test(id))
    return P("Story：3 格微型旅程（吊胃口→揭示→行動）；每格獨立可看懂；互動貼紙（投票/問題）創造參與。");
  if (/live/.test(id))
    return P("直播標題/開場：現在時態的緊迫感；前 10 秒說清楚「為什麼現在要留下來」；互動指令明確。");
  if (/pinned/.test(id))
    return P("置頂貼文：品牌永久第一印象；2 句定位 + 1 個 CTA；讓陌生訪客 3 秒內知道為何追蹤。");
  if (/countdown/.test(id))
    return P("倒數貼文：每天是獨立 hook（不只 '-X 天'）；給小線索/預告/問題——讓等待本身有價值。");
  // caption-short / default
  return P("FB 貼文：前 2 行就是命運；觸發分享的理由嵌入內容；結尾開放問題引留言；可掃讀短句。");
}
