/**
 * Instagram craft layer — 2026-05-17 (CJ「為所有 IG 任務加值，比照
 * EDM 得獎工藝層」). Faithful mirror of edmCraft.ts: brand-AGNOSTIC
 * craft discipline (the HOW) for the IG family only; brand voice/
 * essence still comes from the brand digest, hard rules from the
 * post-gen enforcement layer. Static constant — no DB, no per-brand
 * state, no bloat. Injected only for IG-family body tasks so other
 * platforms (fb/li/yt/email/…) are completely unaffected.
 *
 * Instagram is visual-first: image/video is the content, copy is the
 * assist. The rubric encodes both tracks (visual craft + copy craft)
 * plus zh-TW localisation as the highest priority.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this an Instagram-family task?
 * Strictly the ig-* templates (quickTaskIG / quickTaskIG60 /
 * ig-99-* in quickTask100) + any task whose output channel is
 * instagram. Must NOT bleed into fb/li/yt/email/threads/etc.
 */
export function isInstagramTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("ig-")) return true;
  return template.outputDefaults?.platform === "instagram";
}

/** A "full body" IG deliverable (craft matters) vs an atomic fragment
 *  (hashtag set / bio rewrite / DM script / comment reply — already
 *  tiny & purpose-built, skip the heavy post-gen pass, same idea as
 *  email subject-line / preview-text). */
export function isInstagramBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/hashtag-set|bio-rewrite|dm-script|comment-reply/.test(id)) return false;
  return isInstagramTask(template);
}

/** The award-grade IG rubric — dual-track (visual + copy) + zh-TW.
 *  Concrete + operational so it actually changes output. */
export const IG_CRAFT_RUBRIC = `
# IG 得獎級工藝準則（嚴格遵守）
Instagram 是視覺優先媒介——圖/影是內容本體，文案是輔助。雙軌都要達標：
【每一篇都必守：從 TA 視角寫 + 一個 USP（最高優先，違反＝不合格）】
- **從 TA 視角寫，不是對 TA 喊話**：禁用「身為 ___ 的你」「對 ___ 來說」「如果你是 ___」這類把 TA 寫在第一句的呼喚句型。改用 TA 真實世界的具體細節讓他自己認出來：他這週實際在做的事 / 他內心 OS（會在心裡跟自己說的話）/ 他桌上行事曆上的具體物件 / 他聽過別人對他說的一句話。
- 只打一個 USP：整篇聚焦一個最強的賣點，把它講深；不要塞功能清單、不要這篇想講三件事。其他賣點留給別篇。
- 自我檢查：若把品牌名遮掉仍適用任何競品 → 太通用，重寫；若一篇在講超過一個賣點 → 砍到剩一個。
【視覺 craft】
- 首屏鉤子：feed 首圖／Reel 前 1 秒／carousel 封面必須 0.5 秒內讓人停下；高對比、單一焦點、留白給文字。
- 比例正確：feed 直式 4:5 或 1:1；Reels/Story 9:16 滿版；carousel 1:1。錯比例＝被裁切＝失敗。
- 輪播弧線：封面拋問題/承諾 → 中間逐張遞進（一張一個重點）→ 末張 payoff＋CTA；張張可獨立看懂。
- Reels：3 秒內進主題、有 on-screen 字卡、結尾能無縫 loop；節奏快、不冷場。
- Story：用互動元件（投票/問答/滑桿/問題貼紙）創造參與，不只貼圖。
- 品牌視覺一致：色彩/字體/濾鏡/構圖語言與品牌大腦一致，可被一眼認出。
【文案 craft】
- 第一行就是 hook（手機只露 1-2 行）：好奇/利益/反差，不要「大家好今天要分享」。
- 可掃讀：短句、換行分段、必要時 emoji 當視覺錨點（不濫用）。
- 一個主要 CTA（留言/分享/儲存/點 bio 連結擇一），明確動詞。
- 觸發 save/share：給「值得收藏」的具體價值或「想 tag 朋友」的共鳴。
- Hashtag：3-8 個、混合大中小標籤、放文末或首則留言，不堆砌、與內容相關。
【zh-TW 在地化｜最高優先】不要套美式節慶/用語；用台灣節點與口語（過年/中秋/母親節/雙11/在地梗）。繁體中文、台灣用語。
`.trim();

/**
 * Per-task award reference — 2026-05-17 (CJ「列出個別參考哪個得獎案例」
 * → 內化進 playbook). Each IG task is anchored to the most relevant IAC
 * Social-Media-Campaign winner; the line is the *transferable craft
 * pattern* that case teaches (principle, NOT the campaign's creative).
 * Appended to the pattern playbook so generation is guided by a proven
 * award model, brand-agnostic.
 */
export const IG_TASK_REF: Record<string, string> = {
  "ig-30-caption-short":        "Veronika NYC「Feast For The Eyes」(IAC 餐飲 Best of Show)：短 caption = 一個簡化的引人概念；抽象勾引勝過列功能；一句一情緒；不解釋圖片，讓圖片說話，文案製造張力。",
  "ig-30-pure-text-hook":       "Adobe「The Unfinished Film」(IAC Best of Show)：hook 設計成開放邀請/挑釁，把滑過變參與。",
  "ig-30-reel-hook":            "93 Boyz「Channel 93」(IAC)：首幀＝有風險的真實行動（非 logo/開場），真實感勝過精緻。",
  "ig-30-reel-script-full":     "Tastemade「Tiny Kitchen」Reel 腳本格式 (Shorty Award Best in Food & Drink；短影音食物系列腳本結構教科書)：完整腳本 = 開場視覺鉤子（食材本身就是第一個驚喜）→ 動作高潮 → 完成品揭示；每個鏡頭推進一個動作，沒有連接鏡頭。",
  "ig-30-story-text":           "Sephora Instagram Story 美妝體驗策略 (Shorty Award Best in Beauty 多屆；Sephora IG Story 是美妝品牌完成率最高的 Story 格式)：Story 文案設計成「引導式體驗」而非廣播——投票貼紙讓用戶選色號、問答貼紙讓用戶提問、上滑 CTA 讓瀏覽者直接試妝；Story 是雙向對話，不是數位傳單。",
  "ig-30-carousel-structure":   "Genesis「G90 Artist Series」(IAC Guide)：10 頁＝策展導覽弧，鉤子卡→逐張升級→payoff/CTA，張張誘下滑。",
  "ig-30-bio-rewrite":          "Liquid Death Instagram Bio 策略 (Shorty Award Most Irreverent Brand；Clio Award Grand Prix)：「Murder Your Thirst」4 個字讓品牌個性在 bio 完全傳達——不是公司介紹，是宣戰書；最強 bio 讓訪客秒判斷「這個品牌和我有沒有緣分」；品牌聲音在 150 字限制內必須無損壓縮。",
  "ig-30-hashtag-set":          "Explore Louisiana「Gumbo Day」(IAC 旅遊)：錨在可擁有的活動/節點主題＋創作者/地點標籤，綁日曆時刻。",
  "ig-30-comment-reply":        "Zappos Instagram 留言回覆策略 (Business Insider Best Customer Service Brand；Zappos 的每則留言回覆都是品牌聲音的體現)：回覆讓留言者感覺被真人而非模板回應——叫出名字、呼應具體內容、語氣比品牌官方語氣再暖一個溫度；每則回覆都是公開可被其他人看到的品牌展示。",
  "ig-30-dm-script":            "Pink Shell Resort 網紅活動 (IAC 飯店)：DM 當高精準下一步（分眾→相關 offer→低摩擦行動）。",
  "ig-30-live-opening":         "Florida Lottery「Scratch Factor Live」(IAC)：30 秒內即時互動有風險的 hook（現在正發生、觀眾能左右）。",
  "ig-30-story-repost-strategy":"Tastemade Instagram Story 重發與館藏策略 (Shorty Award Best Lifestyle Brand；Story Highlight 策略讓短暫限時內容累積成永久品牌圖書館)：重發 = 周期性策展（每週一個主題）而非隨機補發；Highlight 命名即定位；限時內容透過系統化重發獲得 Evergreen 生命力。",
  "ig-30-threads-cross-post":   "NASA Threads 跨貼策略 (NASA 是 Threads 平台最早採用的大型機構帳號之一)：科學內容在 Threads 文字原生格式的跨貼示範——去掉 IG 視覺依賴，改寫成「一個讓人想回覆的觀點或問題」；保留參與鉤子，換成 Threads 的對話語氣。",
  "ig-60-feed-full":            "Patagonia Instagram 完整 feed 貼文策略 (Shorty Award Best in Retail；環境品牌 IG feed 互動率最高的標竿)：完整 feed 貼文 = 真實戶外行動者故事（非模特兒廣告）+ 品牌環境使命的一個具體體現 + 行動邀請；每張圖可獨立存在，合起來建立「守護地球」的一致世界觀。",
  "ig-60-reel-full":            "Red Bull Instagram Reels 完整腳本策略 (Shorty Award Best in Sports 多屆；Red Bull Media House 運動極限類短影音標竿)：完整 Reel = 動作峰值開場（不是解釋）→ 衝突/挑戰展開 → 反轉/完成揭示 → loop 回第一幀；建在「為分享設計」的弧線上，不是為了觀看。",
  "ig-60-carousel-7":           "HubSpot 教育型 7 卡輪播格式 (CMI Award Best Content Marketing；B2B 社群 save 率最高的內容格式之一)：7 卡 = 封面主張 → 6 張每卡一個獨立可截圖洞察 → 末卡行動邀請；每張洞察可獨立儲存，合起來構成完整框架；教育型輪播的目標是 save，不只是讚。",
  "ig-60-story-3frame":         "Headspace Instagram Story 3 幀冥想邀請 (Shorty Award Best in Health & Wellness；Headspace 的 3 幀 Story 是健康品牌最高完成率的微內容格式)：3 幀 = 問題引發（你最近睡不好？）→ 概念揭示（10 分鐘能改變一切）→ 互動/CTA（試試這個呼吸練習）；末幀互動貼紙讓 Story 從廣播變對話。",
  "ig-60-countdown-5day":       "Select Registry「Stay for the Story」(IAC 飯店)：5 天分眾升級（認知→意圖→轉換），每天獨立目標。",
  "ig-60-highlight-suite":      "Glossier Instagram Highlight 套組 (Shorty Award Best in Beauty；Glossier 把 Highlight 設計成品牌永久圖書館)：5 個 Highlight = 封面視覺一致的主題分類系統；每個 Highlight 標題即品牌語言（不是「新品」「活動」，是「Skin」「You Look」「Into The Gloss」）；讓陌生訪客 3 秒掌握品牌世界觀。",
  "ig-60-live-suite":           "NBA Instagram Live 完整直播套組 (Shorty Award Best Brand in Sports 多屆；NBA 的賽前/賽中/賽後 IG Live 三段式套組是體育品牌直播的標準格式)：5 段 Live 套組 = 賽前熱身（球員暖身幕後）→ 賽中即時互動（球迷投票預測）→ 賽後獨家 Q&A（更衣室訪問）；每段有不同的觀眾參與機制，建立完整的直播事件生命週期。",
  "ig-60-serial-3":             "Humans of New York Instagram 連載格式 (TIME Magazine 封面故事；Peabody Award；Instagram 人物連載的定義性帳號)：3 集連載建在一個可無限持續的採訪前提（問 1 個問題 + 真實答案）；每集獨立完整，合起來建立整個世界觀；可重複的格式是讓創作者不會枯竭的結構。",
  "ig-60-viral-rewrite":        "Ryan Reynolds / Maximum Effort 病毒改寫策略 (Shorty Award Best Humor Brand 2021；Aviation Gin / Mint Mobile 一系列即時病毒回應)：分析文化病毒事件的分享機制（反差/荒謬/意外）→ 以「低預算但高智慧」幽默反差重建；品牌成為評論者而非主角；速度比製作精緻度重要。",
  "ig-60-testimonial-rewrite":  "8x8「The Power of You」(IAC B2B)：把客戶寫成解決真實挑戰的主角（短片敘事），非產品為主詞。",
  "ig-99-30day-calendar":       "National Geographic Instagram 30 天主題月曆策略 (Shorty Award Best Brand Presence Travel；Instagram 第 1 個突破 1 億追蹤者的品牌)：30 天錨在一個可擁有的自然主題（「海洋月」「叢林月」）；多格式混搭（單張/輪播/Reel/Story）；跨攝影師/科學家/合作帳號分發；UGC 徵集貫穿全月；月曆本身成為訂閱者期待的年度儀式。",
  "ig-99-reel-series-6":        "Genesis「G90」＋ Adobe (IAC)：6 集＝一個可重複格式/前提，每集不同主角，靠協作者帳號擴散。",
  "ig-99-account-reposition":   "Lilly Pulitzer「New Generation of Originals」(IAC 時尚)：保留核心資產同時為新世代重構，全帳號視覺一致刷新。",
};

/** Per-use-case playbook — keyed by taskId pattern, plus the specific
 *  award reference for this exact task appended when known. */
export function igPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = IG_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（IG 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");
  if (/feed|caption-short/.test(id))
    return P("單圖/feed：首圖一個視覺主張＋首行 hook；文案先給價值再 CTA；3-8 hashtag 文末。");
  if (/carousel/.test(id))
    return P("封面承諾一個 payoff；每張一重點、視覺連貫；末張 CTA＋儲存誘因。");
  if (/reel/.test(id))
    return P("前 1 秒視覺鉤子＋字卡；3 秒內進主題；結尾可 loop；文案補充不重複畫面。");
  if (/story/.test(id))
    return P("用互動貼紙（投票/問答/滑桿）；單一訊息；明確下一步（上滑/點貼紙）。");
  if (/bio/.test(id))
    return P("一句定位＋具體價值＋一個明確 CTA（連結）；可掃讀、有個性、含關鍵字。");
  if (/hashtag/.test(id))
    return P("3-8 個分層（大流量/中精準/小社群/品牌專屬）、與內容相關、不重複堆砌。");
  if (/dm|comment/.test(id))
    return P("像真人、先共鳴再回應；不模板、不冷淡；一個自然的下一步。");
  if (/live/.test(id))
    return P("開場 30 秒講清楚「為什麼留下來」；預告 hook；CTA 互動。");
  return P("IG 通用：視覺首屏鉤子＋文案首行 hook＋單一 CTA＋分層 hashtag。");
}
