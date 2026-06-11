/**
 * YouTube craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts. Brand-agnostic craft
 * discipline; brand voice from digest; hard rules from post-gen enforcement.
 * Injected for ALL YT-family body tasks (30s / 60s / 99s).
 *
 * YouTube is a search-discovery + retention medium: titles and thumbnails
 * drive clicks; opening hooks + chapter structure drive watch time;
 * both determine whether the algorithm amplifies the video.
 * The rubric encodes CTR engineering + retention architecture + SEO craft.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a YouTube-family task? (30s / 60s / 99s) */
export function isYouTubeTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("yt-")) return true;
  return template.outputDefaults?.platform === "youtube";
}

/**
 * A "full body" YT deliverable vs an atomic fragment.
 * Fragments (comment-reply / pinned-comment) are small purpose-built
 * responses — skip the heavy rubric.
 */
export function isYouTubeBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/comment-reply|pinned-comment/.test(id)) return false;
  return isYouTubeTask(template);
}

/** YT award-grade rubric — CTR + retention + SEO + zh-TW. */
export const YT_CRAFT_RUBRIC = `
# YouTube 得獎級工藝準則（嚴格遵守）
YouTube 是搜尋發現 + 留存媒介——標題/縮圖決定點擊；開場 hook + 章節結構決定觀看時長；兩者共同決定演算法放大力。
【標題 craft (CTR 工程)】
- 標題 = 承諾 + 好奇缺口：告訴你「是什麼」但不說「怎麼」或「結果是誰」——讓點擊感覺像完成一個未竟的想法。
- 強力公式：數字（「7 個...」）/ 反差（「我以為 X，結果 Y」）/ 超級修飾詞（「史上最...」）/ 搜尋意圖直接命中。
- ≤ 60 字元在搜尋結果不被截斷；主關鍵字前置（演算法 + 人眼都掃前半）。
- 不要點擊誘餌（承諾兌現不了的）；YouTube 演算法現在懲罰低滿意度的高 CTR。
【縮圖 craft】
- 縮圖大字：3-5 字、高對比色、放在情緒表情旁邊（人臉 + 文字是最高 CTR 組合）。
- 文字補充標題的好奇缺口（標題說「為什麼失敗」→縮圖字說「真相」）。
- 手機縮圖只有 100px 寬——字要大到在小螢幕也秒讀。
【開場 hook craft (前 30 秒)】
- 第 0-3 秒：大膽主張 + 視覺佐證——讓留下來感覺有意義。
- 第 3-15 秒：「為什麼你該看完這支」——具體回報（節省時間/解決問題/給認知優勢）。
- 第 15-30 秒：建立信任（一個你親身驗證過的數據或案例）。
- 不要 30 秒 logo 動畫、不要「大家好歡迎回來」。
【章節時間軸 craft】
- 章節標題 = 獨立搜尋查詢（「00:12 - 為什麼 GPT-4 在這個測試失敗」，不是「第一章」）。
- 每個章節 1.5-3 分鐘（太短 = 瑣碎；太長 = 失去導覽價值）。
- 章節提升 SEO：Google 在搜尋頁面直接展示章節——章節標題是額外的關鍵字機會。
【系列 craft (60s + 99s)】
- 3 集系列：1 個主題的 3 個深度層次；每集獨立但累積；訂閱在第 2 集中段自然出現。
- 6 集系列：完整課程感；每集 = 獨立搜尋查詢 + 系列一部分；末集 = 總結 + 下一系列預告。
- 季度策略：內容支柱（evergreen）+ 重複系列（訂閱理由）+ 季節時刻（觸及爆發）三種類型混搭。
【Description SEO craft】
- 前 2 行（展開前可見）= searchable hook（含主關鍵字 1-2 次）。
- 後半段：章節時間戳 + 相關連結 + 5-10 個標籤關鍵字 + 訂閱 CTA。
- Description 是內容，不是元數據——第 1 段要讓觀眾想點「更多」。
【Community Post / End Screen craft】
- Community Post：訂閱者優先——先給看不到的幕後或尚未發布的線索；1 張圖 + 1 個問題 = 留言率 10x。
- End Screen：放在情緒峰值（大揭示後立刻）；推薦「與剛看完的主題相連」的下一支，不是隨機。
- Premiere 套組：發布前 Community Post 預熱 → 計劃首映 → 首映當天 Live Chat → 首映後 Community 追蹤。
【zh-TW 在地化｜最高優先】台灣 YouTube 閱聽習慣（中文標題 + 縮圖中文字）；繁體字幕；台灣熱搜詞作為關鍵字素材；不要照搬英語標題公式。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId (30s + 60s + 99s).
 */
export const YT_TASK_REF: Record<string, string> = {
  // ── 30s ───────────────────────────────────────────────────────────────
  "yt-30-title-strategies":
    "MrBeast YouTube 頻道 (Streamy Award Creator of the Year 2023；超過 3 億訂閱者)：標題公式 WHAT + 數字/最高級 + 好奇缺口（告訴你是什麼但不說怎麼或誰贏）；好奇缺口是工程設計，不是意外；每個標題都在 A/B 測試後才上線。",
  "yt-30-thumbnail-text":
    "Mark Rober YouTube 頻道 (Streamy Award Science/Education 2022；NASA 前工程師，縮圖 CTR 業界最高之一)：單張縮圖 = 人臉情緒表情 + 3-5 字補充標題缺口 + 高對比色；手機 100px 也能秒讀；縮圖與標題是一套系統，不是兩件事。",
  "yt-30-description-seo":
    "TED Talks YouTube 頻道 (Webby Award Best Education/Reference Channel 多次；Google 搜尋被引用最多的 YouTube 頻道)：前 2 行 = searchable + 情緒 hook（含主關鍵字 1-2 次）；章節時間戳讓 Google 在搜尋結果直接展示段落；description 是 SEO 文章，不是元數據。",
  "yt-30-chapter-timeline":
    "Lex Fridman Podcast YouTube 章節策略 (YouTube 訪談類最多訂閱頻道之一；其章節標題是業界引用最廣的可搜尋章節設計)：每個章節標題 = 獨立搜尋查詢（不是「主題 3」，是「為何 X 認為 AGI 在 5 年內」）；章節是額外的 SEO 關鍵字機會。",
  "yt-30-shorts-script":
    "Google「Search On '22」YouTube Shorts 系列 (Webby Award Best Brand Shorts 2023；Google 官方 Shorts 格式標竿)：單支 Shorts = 垂直、單一揭示弧、最後 2 秒是分享時刻（不是 CTA）；每幀有目的，沒有浪費的幀。",
  "yt-30-opening-hook":
    "Kurzgesagt「In a Nutshell」開場設計 (Webby Award Best Animation 多次；Shorty Award Best Science & Education)：前 3 秒 = 大膽主張 + 視覺佐證；15 秒說清楚「留下來的回報」；hook 本身就是論點，不是論點的目錄。",
  "yt-30-end-cta":
    "MKBHD (Marques Brownlee) YouTube 結尾 CTA 策略 (Streamy Award Best Tech Channel；Webby Award Best Technology Channel)：CTA 放在影片情緒峰值（大揭示後立刻，不是片尾 30 秒）；End Screen 推薦主題相連的下一支，感覺像自然延伸，不是廣告。",
  "yt-30-community-post":
    "National Geographic YouTube Community Post 策略 (Shorty Award Best Brand in Travel 多次；YouTube 品牌頻道最佳社群互動率之一)：單則 Community Post = 訂閱者優先的幕後線索；1 張圖 + 1 個真實開放問題 = 留言率比廣播型高 10 倍；不要公告，要對話。",

  // ── 60s ───────────────────────────────────────────────────────────────
  "yt-60-video-package":
    "Tasty by BuzzFeed YouTube 完整影片製作套組 (Webby Award Best Food & Drink Channel；YouTube 食物類史上成長最快頻道)：標題/縮圖/描述/章節/end screen 是統一系統；Tasty 的 60 秒食譜格式讓每個元件都強化同一支影片的可發現性與留存率。",
  "yt-60-shorts-script":
    "Khan Academy YouTube Shorts 教育腳本系列 (Webby Award Best Education/Reference Channel；全球最大免費教育機構)：「1 概念 per short」格式是教育型 Shorts 的黃金標準；每支完整解釋 1 個知識點，靜音也能看懂，最後 2 秒留下可分享的結論。",
  "yt-60-thumbnail-suite":
    "Linus Tech Tips (LTT) YouTube 縮圖套組系統 (Shorty Award Best in Technology；跨 100+ 影片的一致縮圖視覺語言)：縮圖套組 = 跨系列影片的品牌視覺識別系統；同一套高對比色/字型/人臉構圖讓觀眾在演算法推薦列表中秒辨認 LTT。",
  "yt-60-series-3ep":
    "Wendover Productions YouTube 3 集系列格式 (Webby Award Best Informational/Educational；地理/系統分析類頻道標竿)：3 集 = 1 個主題的入門/深化/應用三個深度層次；每集獨立搜尋但積累完整理解；訂閱鉤子在第 2 集中段情緒最投入時自然出現。",
  "yt-60-community-post":
    "NASA YouTube Community Post 完整生命週期策略 (NASA 是政府頻道 YouTube 社群互動率最高的帳號)：Community Post 套組 = 發布前預熱（任務倒數）+ 發布當天（即時互動）+ 發布後追蹤（結果揭示）；每個時間點有不同的觀眾再參與鉤子。",
  "yt-60-viral-rewrite":
    "Veritasium (Derek Muller) YouTube 病毒機制分析策略 (Webby Award Best Science & Education；Derek Muller 曾公開發表《The Illusion of Truth》等病毒傳播機制研究)：分析原作被分享的核心機制（洞察衝突/驚喜反轉/情感觸動三選一）→ 萃取 → 以自己主題重建；不抄創意，借機制。",

  // ── 99s ───────────────────────────────────────────────────────────────
  "yt-99-series-6ep":
    "3Blue1Brown YouTube 數學長系列格式 (Webby Award Best Animation；Grant Sanderson 的《Essence of Calculus》/《Essence of Linear Algebra》是 YouTube 6 集以上教育系列的設計標竿)：6 集 = 完整課程感；每集 = 獨立搜尋查詢 + 系列一部分；末集總結全局觀點 + 預告下一系列；建立「追劇」訂閱習慣。",
  "yt-99-quarterly-strategy":
    "Ali Abdaal YouTube 季度內容策略 (Entrepreneur.com 年度最佳個人品牌創業者；生產力類 YouTube 頻道全球訂閱增速最快)：季度 = Evergreen 支柱（長期 SEO 流量）+ 重複系列（訂閱理由）+ 季節時刻（觸及爆發）三種類型的節奏表；每月有 1 個高峰旗艦內容。",
  "yt-99-premiere-kit":
    "BTS「Permission to Dance on Stage」YouTube Premiere 首映套組 (YouTube Music Awards；打破 YouTube 同時在線觀看紀錄)：Community Post 預熱（發布前 3 天）→ 計劃首映設定 → 首映 Live Chat 互動腳本 → 首映後 Community 追蹤問答；把每次上傳變成一個全球同步的社群事件。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function ytPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = YT_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（YouTube 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  // ── 30s ───────────────────────────────────────────────────────────────
  if (/title-strategies/.test(id))
    return P("標題 5 種：每種策略 1 個（SEO/反差/數字/懸念/直球）；每個 ≤ 60 字元；好奇缺口工程化——主關鍵字前置；加 1 句說明為何選這個切角。");
  if (/thumbnail-text/.test(id))
    return P("縮圖大字：3-5 字；補充標題的好奇缺口；高對比色；手機 100px 也秒讀；配合情緒表情旁放置。");
  if (/description-seo/.test(id))
    return P("Description SEO：前 2 行 searchable hook（含主關鍵字）；後段章節時間戳 + 相關連結 + 5-10 標籤 + 訂閱 CTA；description 是內容不是元數據。");
  if (/chapter-timeline/.test(id))
    return P("章節時間軸：每個標題 = 獨立搜尋查詢（5-15 字，含具體資訊）；每章 1.5-3 分鐘；章節標題是額外 SEO 關鍵字機會。");
  if (/opening-hook/.test(id))
    return P("開場 hook：前 3 秒大膽主張 + 視覺佐證；15 秒內說清楚「看完的回報」；30 秒前建立信任（一個親身驗證的數據）；不要歡迎開場。");
  if (/end-cta/.test(id))
    return P("結尾 CTA：放在影片情緒峰值（大揭示後）；推薦主題相連的下一支；感覺像自然延伸；End Screen 卡的文字呼應剛看完的主題。");

  // ── 共用 shorts（30s + 60s）──────────────────────────────────────────
  if (/shorts/.test(id))
    return P("Shorts：垂直 9:16；單一揭示弧；最後 2 秒 = 分享時刻（不是 CTA）；靜音可看懂（字幕補滿）；沒有浪費的幀；前 1 秒就進主題。");

  // ── 共用 community（30s + 60s）───────────────────────────────────────
  if (/community/.test(id))
    return P("Community Post：訂閱者優先的幕後線索；1 圖 + 1 個真實問題；留言率比廣播型高 10x；建立發布前/中/後的完整生命週期互動。");

  // ── 60s ───────────────────────────────────────────────────────────────
  if (/video-package/.test(id))
    return P("影片製作套組：標題/縮圖/描述/章節/end screen 統一系統；每個元件強化同一支影片的可發現性；缺一則整體 SEO 力打折。");
  if (/thumbnail-suite/.test(id))
    return P("縮圖套組：跨 5 支影片的一致視覺語言；好奇缺口公式 + 情緒表情 + 高對比文字；系列辨識度建立訂閱習慣。");
  if (/series-3ep/.test(id))
    return P("3 集系列：1 個主題 3 個深度層次；每集獨立但累積理解；訂閱 CTA 在第 2 集中段；末集整合 + 下一系列預告。");
  if (/viral-rewrite/.test(id))
    return P("病毒改寫：分析原作分享機制（洞察/驚喜/觸動哪種）→ 萃取 → 以自己主題重建；說明分析過程；不抄創意，借機制。");

  // ── 99s ───────────────────────────────────────────────────────────────
  if (/series-6ep/.test(id))
    return P("6 集系列：完整課程感；每集 = 獨立搜尋查詢 + 系列一部分；集集末推薦下一集；末集總結 + 下一系列鉤子；建立「追劇」習慣。");
  if (/quarterly/.test(id))
    return P("季度策略：Evergreen 支柱（長期 SEO）+ 重複系列（訂閱理由）+ 季節時刻（觸及爆發）三種類型的節奏表；每月有 1 個高峰內容。");
  if (/premiere/.test(id))
    return P("Premiere 首映套組：Community Post 預熱（3 天前）→ 計劃首映設定 → 首映 Live Chat 互動腳本 → 首映後 Community 追蹤；把上傳變成一個社群事件。");

  return P("YouTube 通用：標題好奇缺口 + 主關鍵字前置；開場 30 秒建立留下來的理由；章節結構延長觀看時長；End Screen 在情緒峰值。");
}
