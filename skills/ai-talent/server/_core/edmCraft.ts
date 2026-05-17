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

/** Is this an email-family task (em-*, email:dm/edm/newsletter, PR media-pitch)? */
export function isEmailTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("em-")) return true;
  if (id === "kl-30-invite-opener" || id === "kl-30-followup") return true; // 1:1 outreach email
  if (id.includes("media-pitch")) return true;
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
**zh-TW 在地化（最高優先）**：不要套用美式節慶（聖派翠克/Black Friday/Giving Tuesday/感恩節/12 Days）。把「機制」（文化時刻時效、配對捐款急迫、多日主題節奏）移植到台灣在地節點（過年/中秋/母親節/雙11/在地公益時刻）。語言：繁體中文、台灣用語。
`.trim();

/** Per-use-case playbook — keyed by taskId pattern. The 2-4
 *  highest-leverage moves award winners used for that email type. */
export function edmPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const P = (s: string) => `# 本任務 playbook（得獎模式）\n${s}`;
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
