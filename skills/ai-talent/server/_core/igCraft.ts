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
const IG_TASK_REF: Record<string, string> = {
  "ig-30-caption-short":        "Veronika NYC「Feast For The Eyes」(IAC 餐飲)：一則一個簡化的引人概念，抽象勾引勝過列功能，一句一情緒。",
  "ig-30-pure-text-hook":       "Adobe「The Unfinished Film」(IAC Best of Show)：hook 設計成開放邀請/挑釁，把滑過變參與。",
  "ig-30-reel-hook":            "93 Boyz「Channel 93」(IAC)：首幀＝有風險的真實行動（非 logo/開場），真實感勝過精緻。",
  "ig-30-reel-script-full":     "Adobe「The Unfinished Film」(IAC)：15-30s 圍繞單一轉變/參與弧，結尾要求行動而非觀看。",
  "ig-30-story-text":           "Genesis「G90 Artist Series」(IAC 汽車)：Story 當引導式敘事層（序列揭曉＋互動貼紙）導向更深 hub。",
  "ig-30-carousel-structure":   "Genesis「G90 Artist Series」(IAC Guide)：10 頁＝策展導覽弧，鉤子卡→逐張升級→payoff/CTA，張張誘下滑。",
  "ig-30-bio-rewrite":          "Lilly Pulitzer「New Generation of Originals」(IAC 時尚)：一句身分定位橋接傳承＋新受眾。",
  "ig-30-hashtag-set":          "Explore Louisiana「Gumbo Day」(IAC 旅遊)：錨在可擁有的活動/節點主題＋創作者/地點標籤，綁日曆時刻。",
  "ig-30-comment-reply":        "8x8「The Power of You」(IAC B2B)：回覆讓留言者成為主角，肯定/認可語氣非打發。",
  "ig-30-dm-script":            "Pink Shell Resort 網紅活動 (IAC 飯店)：DM 當高精準下一步（分眾→相關 offer→低摩擦行動）。",
  "ig-30-live-opening":         "Florida Lottery「Scratch Factor Live」(IAC)：30 秒內即時互動有風險的 hook（現在正發生、觀眾能左右）。",
  "ig-30-story-repost-strategy":"Genesis「G90 Artist Series」(IAC)：重發成週期性序列 guide，讓限時內容累積成持久敘事。",
  "ig-30-threads-cross-post":   "Adobe「The Unfinished Film」(IAC)：改寫成文字原生挑釁/邀請，保留參與鉤子、去掉視覺依賴。",
  "ig-60-feed-full":            "Veronika NYC「Feast For The Eyes」(IAC 餐飲)：完整貼文＝連貫視覺敘事＋單一簡化訊息，feed 美學一致建品牌世界。",
  "ig-60-reel-full":            "Adobe「The Unfinished Film」(IAC)：完整 Reel 建在參與/轉變弧＋收尾行動，為 remix/分享而設計。",
  "ig-60-carousel-7":           "Genesis「G90 Artist Series」(IAC)：7 卡策展弧，鉤子→5 張升級→payoff/CTA，每卡控節奏拉下滑。",
  "ig-60-story-3frame":         "Genesis「G90 Artist Series」(IAC)：3 幀小弧 預告→揭曉→互動/CTA，末幀貼紙互動。",
  "ig-60-countdown-5day":       "Select Registry「Stay for the Story」(IAC 飯店)：5 天分眾升級（認知→意圖→轉換），每天獨立目標。",
  "ig-60-highlight-suite":      "Genesis「G90 Artist Series」(IAC)：5 個 Highlight 封面組成永久主題畫廊，視覺系統一致。",
  "ig-60-live-suite":           "Florida Lottery「Scratch Factor Live」(IAC)：5 段 Live 圍繞重複的即時互動/風險節拍維持全程參與。",
  "ig-60-serial-3":             "93 Boyz「Channel 93」(IAC)：連載建在可重複的真實前提＋品牌標語，集集獨立又累積。",
  "ig-60-viral-rewrite":        "93 Boyz「Channel 93」(IAC)：為被轉發而設計——具體、出乎意料、可截圖的行動，真實勝過製作。",
  "ig-60-testimonial-rewrite":  "8x8「The Power of You」(IAC B2B)：把客戶寫成解決真實挑戰的主角（短片敘事），非產品為主詞。",
  "ig-99-30day-calendar":       "Explore Louisiana「Gumbo Day」(IAC 旅遊)：一個月錨一個可擁有主題，多格式混搭，跨自有＋夥伴帳號分發。",
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
