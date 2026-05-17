/**
 * Facebook craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW); brand voice/essence still from the brand digest;
 * hard rules from the post-gen enforcement layer. Static constant — no DB,
 * no per-brand state. Injected for ALL FB-family body tasks (30s/60s/99s).
 *
 * Facebook is a community-first medium: organic reach is earned by
 * triggering saves/shares/comments. Ads live or die by the first 3 words.
 * Both tracks (organic + paid) encoded here.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a Facebook-family task? (30s / 60s / 99s) */
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
【60s 系列 / 套組 craft】
- 連載 (serial)：3 集 = 1 情緒弧；第 1 集介紹＋鉤子，第 2 集深化，第 3 集解決＋重新開放；每集獨立可看懂但讓人想看下集。
- 倒數套組 (countdown)：每天是獨立 hook 不只是數字——先給線索或問題，讓等待本身有價值；社群一起等。
- 廣告包 (ad pack)：3 支廣告 = 漏斗覆蓋（認知/考慮/轉換）；每支獨立訊息，但共用一條 campaign 主軸。
- 病毒改寫 (viral-rewrite)：分析原作為何引起分享 → 萃取可遷移的機制 → 用品牌素材重建。
- 見證改寫 (testimonial-rewrite)：客戶是解決真實挑戰的主角；品牌是工具，不是主詞；量化結果嵌入故事。
【廣告 craft】
- 標題（Headline）：≤ 8 個字，包含核心價值主張或反差；不要疑問句。
- 主文（Primary text）：前 3 個字決定是否繼續讀——用數字/問題/具體結果開場；痛點 → 解方 → 證明 結構。
- 描述（Description）：補充標題沒說到的具體細節（節省多少時間 / 適合誰 / 價格錨點）。
- CTA 按鈕：用結果型動詞（「開始使用」「取得報告」）而非點擊型（「了解更多」太泛）。
【99s 活動 craft】
- 30 天月曆：1 個可擁有的主題錨 + 多格式混搭（影片/圖文/故事/直播）+ UGC 鼓勵貫穿。
- 危機 playbook：承認→調查→修正→重建 4 個階段各有內容策略；語氣隨時間從危機管理→正常溫度。
- 發表工具包：每個觸點（前期預告/發表日/後期）獨立訊息但共用一個中心創意概念。
【zh-TW 在地化｜最高優先】台灣節點（春節/端午/中秋/雙十一/母親節/228）、繁體中文、台灣口語（「超～」「真的假的」「嗯嗯嗯」視語氣選用）。不要套用美式節慶或陸式用語。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId (30s + 60s + 99s).
 * Each entry cites the most relevant internationally-awarded campaign for
 * this specific task type + the transferable craft pattern.
 * Principle only — NOT copying the campaign's creative.
 */
const FB_TASK_REF: Record<string, string> = {
  // ── 30s ───────────────────────────────────────────────────────────────
  "fb-30-caption-short":
    "Wendy's 社群策略 (Shorty Awards 多年最佳品牌社群 + Ad Age Social Media Campaign of the Year 2018)：每則短貼文是獨立的文化時刻；品牌機智 > 產品功能；不需要 setup，直接就是 punchline。",
  "fb-30-pure-text-hook":
    "Ryan Reynolds / Aviation Gin「Maximum Effort」Facebook 純文字系列 (Shorty Award Best Humor Brand 2020，Cannes Lions Silver 2021)：讀起來像真人寫的、不像行銷——反共識前置、沒有任何官腔修飾詞。",
  "fb-30-link-caption":
    "BuzzFeed Tasty Facebook 原生影片 (Webby Award People's Voice Best Food & Drink 2017)：caption 讓點擊感覺像「完成一個被打斷的念頭」；Facebook 原生影片先鋒；先給脈絡再給連結。",
  "fb-30-ad-headline":
    "Old Spice「The Man Your Man Could Smell Like」Facebook 廣告 (Cannes Lions Grand Prix Titanium 2010，Effie Gold 2011)：廣告標題 = 價值主張 + 個性，一句話說完；每個字有存在理由；結語即記憶點。",
  "fb-30-ad-primary":
    "Airbnb「Belong Anywhere」Facebook 活動 (Cannes Lions Grand Prix Titanium 2014)：主文串起故事與轉換——社會證明嵌入敘事；情緒共鳴先於行動呼籲。",
  "fb-30-ad-cta":
    "Spotify「2018 Wrapped」Facebook 廣告系列 (Cannes Lions Silver Outdoor + Social 2019)：CTA 錨定在個人化數據帶來的情緒峰值——讓按鈕像「看看你的年度結果」的承諾，不是指令。",
  "fb-30-ad-description":
    "Squarespace「Make Your Next Move」Facebook 廣告 (D&AD Wood Pencil Integrated Digital Campaigns 2018)：description 從不同角度強化標題、補上省略的具體細節；不重複、只補充。",
  "fb-30-pinned-short":
    "National Geographic Facebook 主頁 (Shorty Award Best Brand Presence in Travel 多屆，全球最多 Facebook 追蹤者之一)：置頂 = 品牌永久第一印象；2 句話說清楚「我們是誰 + 為什麼你要追蹤」。",
  "fb-30-story-text":
    "Sephora Facebook/Instagram Stories 全管道策略 (Shorty Award Best in Beauty多屆)：Stories 是微型旅程——3 個畫面：吊胃口→產品揭示→上滑 CTA；每格獨立可看懂。",
  "fb-30-live-title":
    "Red Bull Facebook Live 活動系列 (多次 Shorty Award Best in Sports；Red Bull Media House 旗艦直播格式)：直播標題 = 現在時態的緊迫感；「正在發生什麼 + 為何不能錯過」兩件事都說清楚。",
  "fb-30-countdown-1day":
    "HBO《Game of Thrones》Facebook 倒數系列 (Shorty Award Best in Entertainment，2019 最終季活動)：每天倒數是獨立 hook——不只「還有 X 天」，而是「今天先給你這個線索」。",

  // ── 60s ───────────────────────────────────────────────────────────────
  "fb-60-single-full":
    "Dove「Real Beauty」系列 (Cannes Lions Grand Prix Titanium 2006 + Effie Grand Prix Creative Effectiveness 2013)：單貼文 = 完整情緒弧；品牌價值觀嵌入真實故事，不是標語；結尾邀請讀者成為一部分。",
  "fb-60-link-full":
    "BuzzFeed Tasty Facebook 原生影片 (Webby Award People's Voice 2017；Facebook 原生影片格式定義者)：連結貼文 = 先用 caption 完成 70% 的說服，點擊是延伸；影片本身在 Facebook 原生播放。",
  "fb-60-album-4":
    "National Geographic Facebook 相簿策略 (Shorty Award Best Brand Presence Travel；Instagram 第 1 個突破 1 億追蹤者的品牌)：相簿 = 策展敘事；每張圖賺到下一張點擊；caption 序列建立整體弧線。",
  "fb-60-carousel-5":
    "Airbnb「Experiences」Facebook 輪播系列 (Cannes Lions Titanium Grand Prix 2014；Facebook 輪播廣告早期標竿)：5 張輪播 = 1 個完整故事弧；封面承諾 payoff；每張賺到滑動；末張是預訂 CTA。",
  "fb-60-countdown-5day":
    "HBO《Game of Thrones》最終季 5 日倒數系列 (Shorty Award Best in Entertainment 2019；社群期待工程的教科書)：每天獨立 hook + 揭示一個新線索；momentum 累積到發布日。",
  "fb-60-launch-kit":
    "Nike「Dream Crazy」全平台發表套組 (Cannes Lions Grand Prix Outdoor 2018；One Show Grand Prix 2019)：發表套組 = 1 個中心創意概念適配每個觸點；每件內容單獨完整，合起來更強。",
  "fb-60-live-suite":
    "Red Bull「Stratos」平流層跳傘 Facebook Live 套組 (Shorty Award Best in Sports 2013；全球同步觀看人數破紀錄)：Live 套組 = 預告→直播錨→事後回顧；每個階段有不同的觀眾再參與鉤子。",
  "fb-60-pinned-suite":
    "National Geographic Facebook 置頂套組 (Shorty Award Best Brand Presence Travel；Facebook 頁面架構設計標竿)：置頂套組 = 品牌永久建構架構；組合回答「我是誰、我做什麼、你為何在乎」。",
  "fb-60-serial-3":
    "Dove「Real Beauty Sketches」Facebook 連載 (Cannes Lions Grand Prix Film + Titanium 2013；當時史上觀看次數最多的廣告影片)：3 集 = 1 情緒弧；設問→深化→解決 + 重開循環。",
  "fb-60-viral-rewrite":
    "Ryan Reynolds / Aviation Gin「Peloton Wife」病毒回應 (Cannes Lions Silver 2021；48 小時內完成拍攝發布的教科書病毒改寫)：分析原作分享機制 → 萃取 → 以品牌素材重建；速度是關鍵。",
  "fb-60-trend-rewrite":
    "Wendy's 社群趨勢內容改編 (Ad Age Social Media Campaign of the Year 2018；Shorty Award Best in Food & Beverage)：改 1 個元素讓它變品牌的；時機 > 製作精緻度；讓 trend 替自己發聲。",
  "fb-60-testimonial-rewrite":
    "P&G「Thank You Mom」奧運見證系列 (Cannes Lions Grand Prix Creative Effectiveness 2013；Effie Grand Prix 2012)：客戶 = 主角解決真實挑戰；品牌 = 使能工具，不是主詞；量化結果嵌入感性故事。",
  "fb-60-ad-pack-3":
    "Dollar Shave Club 廣告包 (Webby Award Best Viral Campaign 2012；AICP Next Award 2012；全球最高 ROI 的品牌發表之一)：3 支覆蓋漏斗認知/考慮/轉換；共用 1 條 campaign 主軸；每支單獨完整。",

  // ── 99s ───────────────────────────────────────────────────────────────
  "fb-99-30day-calendar":
    "Coca-Cola「Share a Coke」30 天多平台月曆 (Cannes Lions Grand Prix + Creative Effectiveness Grand Prix；在超過 80 個國家執行)：1 個可擁有主題錨 30 天；多格式混搭；UGC 鼓勵貫穿全月。",
  "fb-99-14day-countdown":
    "HBO《Game of Thrones》最終季 14 日社群倒數 (Shorty Award Best in Entertainment 2019；創下 HBO 平台流量紀錄)：14 天升級揭示——每天獨立 hook + 累積 momentum；社群期待本身成為節目。",
  "fb-99-launch-toolkit":
    "Nike「Dream Crazy」跨平台發表工具包 (Cannes Lions Grand Prix Outdoor 2018；One Show Grand Prix 2019)：工具包 = 1 個中心創意概念跨所有觸點；從預告到發表日到長尾；每件內容強化同一個文化主張。",
  "fb-99-livestream-9seg":
    "Red Bull「Stratos」Facebook Live 9 段直播製作 (Shorty Award Best in Sports 2013；打破 YouTube 直播同時在線紀錄)：9 段 = 前中後完整生命週期；每段有獨立的再參與鉤子；直播事件 = 媒體財產。",
  "fb-99-crisis-playbook":
    "Domino's Pizza「Pizza Turnaround」社群危機回應 (Effie Gold Crisis & Issue Management 2010；危機發生 48h 內用 YouTube/Facebook 公開道歉重建信任的教科書)：承認→調查→修正→重建 4 階段；透明度 = 最強的危機文案策略。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function fbPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = FB_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（FB 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  // ── 廣告系列 ──────────────────────────────────────────────────────────
  if (/ad-headline/.test(id))
    return P("廣告標題：≤ 8 字、核心價值主張 + 品牌個性；數字/反差/具體結果開場；不要疑問句；每字都要 earn its place。");
  if (/ad-primary/.test(id))
    return P("廣告主文：前 3 字決定留不留；痛點→解方→社會證明結構；≤ 125 字最佳；重要資訊不要藏在折疊後。");
  if (/ad-cta/.test(id))
    return P("廣告 CTA：結果型動詞（「取得報告」「開始使用」）而非點擊型；CTA 要像一個承諾，不是命令。");
  if (/ad-description/.test(id))
    return P("廣告描述：補充標題的具體細節（時間/錢/誰適合）；不重複主文；每個字都給轉換理由。");
  if (/ad-pack/.test(id))
    return P("廣告包：3 支覆蓋認知/考慮/轉換漏斗；每支獨立訊息但共用 campaign 主軸；格式差異化（影片/圖片/輪播）。");
  if (/ad-/.test(id))
    return P("廣告文案：標題抓注意→主文建立信任→CTA 收割；每層獨立工作，不要疊床架屋。");

  // ── 60s 系列任務 ──────────────────────────────────────────────────────
  if (/serial/.test(id))
    return P("連載 3 集：1 情緒弧；集 1 設問/介紹+鉤子，集 2 深化/轉折，集 3 解決+重開循環；每集獨立可看懂但讓人想看下集。");
  if (/viral-rewrite/.test(id))
    return P("病毒改寫：分析原作為何分享 → 萃取分享機制 → 以品牌素材重建；搭文化便車，不是抄創意；品牌角度給舊事件新理由。");
  if (/trend-rewrite/.test(id))
    return P("趨勢改寫：改 1 個元素讓它變品牌的；不重建從頭、只劫持；時機 > 製作精緻度；說明改了哪個元素 + 為何 timing 對。");
  if (/testimonial-rewrite/.test(id))
    return P("見證改寫：客戶是主角解決真實挑戰；品牌是工具不是主詞；量化結果嵌入感性故事；去掉「我很感謝 X 品牌」這種句子。");
  if (/launch-kit/.test(id))
    return P("發表套組：1 個中心創意概念跨所有觸點（預告/發表日/後期）；每件內容單獨完整、合起來更強；格式多元化。");
  if (/live-suite/.test(id))
    return P("直播套組：預告→直播錨→事後回顧 3 個生命週期；每個階段有不同的觀眾再參與鉤子；累積跨越直播時間點的觸及。");
  if (/album/.test(id))
    return P("相簿：每張圖賺到下一張點擊；caption 序列建立整體弧線；最後一張 = 故事收束 + CTA。");
  if (/carousel/.test(id))
    return P("輪播：封面承諾 payoff；每張一重點且視覺連貫；末張 CTA + 儲存誘因；5 張 = 完整故事弧。");
  if (/pinned-suite/.test(id))
    return P("置頂套組：品牌永久建構架構；組合回答「我是誰/做什麼/你為何在乎」；視覺一致性讓帳號看起來有策略。");

  // ── 99s 活動任務 ──────────────────────────────────────────────────────
  if (/30day-calendar/.test(id))
    return P("30 天月曆：1 個可擁有的主題錨全月；多格式混搭（影片/圖文/故事/直播）；UGC 鼓勵貫穿；每週有一個高峰內容。");
  if (/14day-countdown|countdown-5day/.test(id))
    return P("倒數系列：每天獨立 hook + 累積 momentum；給線索/預告/問題讓等待有回報；社群期待本身成為事件。");
  if (/launch-toolkit/.test(id))
    return P("發表工具包：中心創意概念跨所有觸點；前期鋪陳→發表日高峰→長尾延伸；每件內容強化同一個文化主張。");
  if (/livestream/.test(id))
    return P("直播 9 段：前期/中期/後期完整生命週期；每段有獨立觀眾再參與鉤子；直播事件 = 媒體財產，不只是一次播出。");
  if (/crisis/.test(id))
    return P("危機 playbook：承認→調查→修正→重建 4 階段各有內容策略；語氣從危機管理逐漸回品牌正常溫度；每階段訊息清晰、不模糊。");

  // ── 通用 ──────────────────────────────────────────────────────────────
  if (/pure-text-hook/.test(id))
    return P("純文字貼文：不依賴圖片；反共識主張或強烈情緒前置；讀起來像真人說話；觸發「我要分享這個」。");
  if (/link/.test(id))
    return P("連結貼文：先給為什麼點的脈絡；讓點擊感覺像延伸自己的想法；不要只說「快來看看」。");
  if (/story/.test(id))
    return P("Story：3 格微型旅程（吊胃口→揭示→行動）；每格獨立可看懂；互動貼紙（投票/問題）創造參與。");
  if (/live/.test(id))
    return P("直播標題/開場：現在時態的緊迫感；前 10 秒說清楚「為什麼現在要留下來」；互動指令明確。");
  if (/pinned/.test(id))
    return P("置頂貼文：品牌永久第一印象；2 句定位 + 1 個 CTA；讓陌生訪客 3 秒內知道為何追蹤。");
  if (/countdown/.test(id))
    return P("倒數貼文：每天是獨立 hook（不只 '-X 天'）；給小線索/預告/問題——讓等待本身有價值。");
  return P("FB 貼文：前 2 行就是命運；觸發分享的理由嵌入內容；結尾開放問題引留言；可掃讀短句。");
}
