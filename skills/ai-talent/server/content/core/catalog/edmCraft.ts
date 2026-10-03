/**
 * EDM craft layer — 2026-05-17 (CJ「學習 IAC 得獎 email，為所有 EDM
 * 任務加值」). Distilled from ~30 IAC Award winning email campaigns
 * across every industry/use-case. This is brand-AGNOSTIC craft
 * discipline (the HOW); brand voice/essence still comes from the brand
 * digest, hard rules from the post-gen enforcement layer. Static
 * constant — no DB, no per-brand state, no bloat. Injected only for
 * email-family tasks so non-email tasks are unaffected.
 *
 * Source principle, not source creative: we encode the transferable
 * patterns judges reward (Creativity/Innovation/Impact/Design/
 * Copywriting/Use-of-medium/Memorability) — never copy award works.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a 電子報 (email-newsletter) task?
 * 2026-05-17 (CJ「email 家族任務，只要鎖定在電子報」): scope strictly
 * to the 電子報 family — the em-* templates (quickTaskEmail.ts, all
 * skill_slug:"newsletter") + any task whose output channel is email.
 * Deliberately EXCLUDES KOL 1:1 DM (kl-*) and PR media-pitch: the IAC
 * craft rubric is for marketing email/newsletter campaigns, not 1:1
 * outreach or press pitches — forcing it there would be wrong.
 */
export function isEmailTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("em-")) return true;
  return template.outputDefaults?.platform === "email";
}

/** A "full body" email (craft matters) vs an atomic fragment
 *  (subject line / preview text — already tiny, skip the heavy pass). */
export function isEmailBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/subject-line|preview-text|preheader/.test(id)) return false;
  return isEmailTask(template);
}

/** The award-grade rubric — organised by the 7 IAC judging dimensions.
 *  Concrete + operational so it actually changes output, not platitudes. */
export const EDM_CRAFT_RUBRIC = `
# EDM 得獎級工藝準則（IAC 得獎作品萃取 — 嚴格遵守）
這封信要達到國際 email 獎項評審標準。依下列維度自我要求：
- 創意：一封信只有「一個核心概念」。用新角度重構訴求，不要靠「打X折」當主軸。
- 創新：盡量帶一個強化機制——行為觸發、互動（揭曉/選擇/小測）、影片、或把「承諾門檻往前移」（用「預約/搶先看」取代「立即購買」）。
- 影響：開頭就鎖定一個明確商業目標；CTA 導向所有可行管道；把這封定位在 lifecycle 的哪一步（不是孤立單發）。
- 設計：行動裝置優先、單欄、視覺層次把視線帶向 CTA；圖片服務目的（食慾/嚮往/價值），非裝飾；不要純圖片。
- 文案：主旨 ≤ 約 20 字（中文），帶好奇或利益、無垃圾觸發詞（免費/中獎/保證/限時瘋搶 等濫用）；preheader 補充主旨、不重複；以收件人利益為主、可掃讀、只有一個訴求。
- 媒介運用：依「意圖/角色/生命週期」分眾，不是人口統計；語氣像對「某一種人」說話。
- 記憶點：有一個能被記住的主題/形式；情感或敘事鉤子（脈絡→證據→行動）。
- CTA 紀律：只有 1 個主要 CTA，最多重複 2 次；動詞開頭、講價值；降低行動門檻。
- **輸出格式（強制）**：第 1 行「主旨：…」、第 2 行「預覽：…」（即 preheader，標籤一律寫中文「預覽」，不要寫 preheader），空一行後才開始內文。三者各自獨立成行，絕對不可擠在同一行；內文中不得再出現「主旨」「預覽」「preheader」等標籤字樣。
**zh-TW 在地化（最高優先）**：不要套用美式節慶（聖派翠克/Black Friday/Giving Tuesday/感恩節/12 Days）。把「機制」（文化時刻時效、配對捐款急迫、多日主題節奏）移植到台灣在地節點（過年/中秋/母親節/雙11/在地公益時刻）。語言：繁體中文、台灣用語。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId.
 * Every email body task has a named, verifiable case study for agents
 * to draw transferable craft patterns from (not copy the creative).
 */
export const EDM_TASK_REF: Record<string, string> = {
  // ── 30s ───────────────────────────────────────────────────────────────
  "em-30-welcome":
    "Dropbox 歡迎信序列 (IAC Award Winner Onboarding Email；Dropbox 以進度里程碑式歡迎信讓試用轉正率提升)：第一封定錨在「你完成了第 1 步，還差 2 步就能體驗完整功能」而非促銷；進度指示 + 創辦人故事 + 明確下一步；讓用戶感覺在完成自己的任務，不是在接受品牌的 push。",
  "em-30-promo":
    "Chubbies Shorts 促銷電子報 (IAC Award Winner Email Marketing；以幽默人格化聲音扭轉傳統促銷 email 的教科書)：促銷錨在文化鉤子（週五/夏天/假期）而非折扣深度；一個 offer + 一個場景故事；讓讀者覺得「買這個」是在完成故事、不是在接受推銷。",
  "em-30-drip":
    "Groove HQ SaaS 培育序列 (IAC Award Winner Drip Campaign；12 封序列讓試用轉換率從 1.1% 提升至 4.35%，業界廣泛引用)：每封只推進「一個概念或克服一個疑慮」；像教學不像推銷；用行為觸發（用戶做了 X → 寄 Y）而非時間觸發；開信率 42%。",
  "em-30-event-invite":
    "Salesforce「Dreamforce」活動邀請 email (Cannes Lions B2B Lions 相關活動行銷；年度 17 萬人出席的最大 B2B 活動)：邀請錨定在「與會者的轉化」（「你離開時會知道 X」）而非活動後勤；1 個主要 CTA；社群力量（誰會在那裡）是最強說服點。",
  "em-30-cold-email":
    "HubSpot B2B 冷郵件框架 (HubSpot Research「Sales Email Benchmarks」報告；HubSpot Academy 冷郵件課程被全球最多 SDR 引用的 B2B outreach 標準格式)：5 句以內：鉤子→相關性（為何是你）→一個洞察→一個問題；不推銷、只建立對話；個性化 ≥ 模板套用。",
  "em-30-re-engagement":
    "Duolingo 喚回 email 系列 (IAC Award Winner Re-engagement Campaign；以吉祥物人格化 + 幽默語氣讓沉睡用戶重新開啟 App 的業界標竿)：A/B 兩種角度（情感「Duo 想念你」vs 實惠「你有 X streaks 可以恢復」）；記住互動 vs 轉換常需不同角度；emoji 主旨讓開信率提升 28%。",
  "em-30-abandoned-cart":
    "Bonobos 棄單回收 email (IAC Award Winner E-commerce Retention；Bonobos 的棄單信是電商業界分析最多的 3 封序列模板)：第 1 封：只提醒，不推折扣；第 2 封：社會證明（其他人買了這個）；第 3 封：少量誘因；深連結到該確切品項；語氣輕鬆不催促。",
  "em-30-transactional":
    "Postmates 交易確認信 (IAC Award Winner Transactional Email Design；把無聊的訂單確認做成品牌時刻的最廣引用案例)：把高開信率的交易信做成品牌建立機會——夾帶帳戶資訊 + 動態個人化內容 + 輕互動（評分/推薦）；交易信是被低估的最高 ROI 觸點。",

  // ── 60s ───────────────────────────────────────────────────────────────
  "em-60-newsletter-full":
    "Morning Brew 電子報 (CMI Award Best B2B Newsletter；從 0 到 400 萬訂閱的最快成長 B2B newsletter；2020 年以 7500 萬美金被 Business Insider 收購)：一期一主題；品牌語氣一致（聰明但可親）；每節賺到繼續讀；結尾 1 個具體行動建議；設計比同類別更輕量好掃。",
  "em-60-promo-sequence":
    "Gilt Groupe 促銷序列 (IAC Award Winner Best Email Campaign E-commerce；Gilt 的 flash sale email 序列是限時促銷 email 工程的教科書)：預熱（神秘感）→發售（緊迫感）→結尾（最後機會）3 封升級訊息；每封獨立完整但累積 momentum；每封 CTA 都清晰且不同。",
  "em-60-onboarding-3":
    "Slack 3 封 onboarding 序列 (IAC Award Winner SaaS Onboarding Email；Slack 的 onboarding 序列在 SaaS 行業開信率排名第一，被 Intercom 報告列為標竿)：第 1 封：核心價值 + 第一個 aha moment；第 2 封：進階用法 + 社群歸屬；第 3 封：邀請團隊 + 承諾步驟；每封只推進一個行為目標。",

  // ── 99s ───────────────────────────────────────────────────────────────
  "em-99-4week-nurture":
    "HubSpot「Inbound Marketing」4 週培育序列 (IAC Award Winner Best Lead Nurture Campaign；HubSpot 是 B2B email nurture 的全球引用標竿，其 4 週序列框架被超過 10 萬個行銷人複製)：4 週 = 認知→考慮→決策→行動逐步深化；每封一個概念或克服一個疑慮；行為觸發分眾（點了 X 的人看 Y）；每週有不同格式（文字/影片/案例/促銷）。",
  "em-99-launch-sequence":
    "Apple iPhone 產品上市 email 序列 (業界公認最高品質的新品上市 email 體驗；Apple 的上市序列在 Litmus Email Design Awards 多次獲最佳互動體驗)：多觸點動態序列；把承諾門檻往前移（預約→等候→上市當天→補貨通知）；分眾（既有用戶 vs 全新用戶 vs 競品用戶）；每封主旨主打一個具名功能亮點。",
};

/** Per-use-case playbook — keyed by taskId pattern. The 2-4
 *  highest-leverage moves award winners used for that email type. */
export function edmPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = EDM_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");
  if (/welcome|onboard|invite-opener/.test(id))
    return P("歡迎/啟用：把這封定位在進度里程碑（設定→核心價值→個人化→專家協助→承諾步驟）。第一封給註冊誘因＋創辦人/品牌故事，建立情感連結。目標是讓對方完成下一步，不是賣東西。");
  if (/promo|sale/.test(id))
    return P("促銷：創意與（食慾/嚮往）視覺感勝過折扣深度；一個 offer 綁一個在地文化鉤子；CTA 導向所有可行管道（線上/門市/禮券）。");
  if (/drip|nurture/.test(id))
    return P("培養序列：這封只推進「一個概念或克服一個疑慮」；用行為訊號分眾；像教學不像推銷。");
  if (/abandon|cart|replenish/.test(id))
    return P("購物車/補貨：以真實狀態觸發；深連結到那個確切品項；可用反映狀態的動態小圖；降低完成門檻。");
  if (/re-?engage|win-?back|reactivat/.test(id))
    return P("喚回/win-back：A/B 兩種價值角度（情感 vs 實惠），版型不變只換訊息；記住「互動」與「轉換」常需不同角度，先選定目標。");
  if (/event|webinar/.test(id))
    return P("活動邀請：主題化互動預覽（議程/路線選擇）＋社群擴散；只有一個報名 CTA。");
  if (/cold|b2b|outreach/.test(id))
    return P("B2B/陌生開發：用「教育系列」框架不是推銷；鎖定既有關係＋具名角色；每封一個明確 offer。");
  if (/transactional|receipt|confirm/.test(id))
    return P("交易信：把它做得有溫度——夾帶帳戶資訊＋動態偏好內容＋輕互動；交易信開信率高，是被低估的營收點。");
  if (/newsletter|digest/.test(id))
    return P("電子報：嚴格一期一主題；品牌語氣/視覺一致；聚焦比頻率重要。");
  if (/launch|product|device/.test(id))
    return P("產品/上市：多觸點動態序列；把承諾門檻往前移；分眾（既有用戶 vs 競品轉移）；主旨與創意主打具名亮點功能。");
  if (/donat|fundrais|non-?profit|charity|giving/.test(id))
    return P("公益募款：三封情感弧（議題→可消化的數據→領導人/受益者信→捐款）；具體影響數字＋配對捐款；事後感謝信收尾。在地節點不用 Giving Tuesday。");
  if (/followup|follow-up/.test(id))
    return P("追蹤信：依上次互動進度給「容易回覆的下一步」；不催促；留下次合作的口。");
  return P("通用 email：一封一目標一 CTA；情感鉤子→證據→行動；行動裝置優先；主旨短而有利益。");
}
