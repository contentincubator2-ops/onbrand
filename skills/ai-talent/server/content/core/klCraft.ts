/**
 * KOL / Influencer craft layer — 2026-05-17.
 * Faithful mirror of igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW) for the KOL family only. Injected only for
 * kl-family body tasks so other platforms are completely unaffected.
 *
 * KOL craft is creator-first: the brief gives creative direction,
 * not creative prescription. The rubric encodes invite opener,
 * influencer brief, pitch pack, and campaign toolkit craft plus
 * zh-TW Taiwan KOL ecosystem localisation.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a KOL-family task?
 * Covers kl-* templates exclusively.
 */
export function isKOLTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  return id.startsWith("kl-");
}

/** kl-30-followup is a short DM fragment — skip the heavy craft pass.
 *  All other KOL tasks are full-body outputs. */
export function isKOLBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/followup/.test(id)) return false;
  return isKOLTask(template);
}

/** The award-grade KOL rubric — creator-first + zh-TW ecosystem. */
export const KL_CRAFT_RUBRIC = `
# KOL / 網紅工藝準則（嚴格遵守）
KOL 合作是創作者優先——brief 給方向不給劇本；成功的 KOL 活動讓創作者的創意放大品牌訊息：
【邀請開場 craft】
- 真誠不交易：第一封信必須讓創作者感受到品牌真的了解他們的內容，不是群發 copy-paste。
- 具體個人化：引用創作者的特定作品或觀點，說明為什麼是「他」而不是「任何 KOL」。
- 價值先行：說明對創作者的價值（觀眾共鳴/創作自由/品牌信念契合），再談合作細節。
- 低門檻下一步：第一封信不要談金額；邀請進入對話，不是簽合約。
【網紅 brief craft】
- 創作自由區：明確標示創作者可以自由發揮的範疇（角度/格式/語氣/個人風格）。
- 品牌不可妥協點：清楚列出 2-3 個絕對不能出現的元素（競品曝光/特定語句/不當聯想）。
- 成效衡量清晰：創作者需要知道品牌用什麼指標評估成功（觀看/互動/轉換/情感聯繫）。
- 給靈感不給劇本：附上品牌案例和競品案例作為方向參考，而非要求複製。
【Pitch pack craft（創作者對品牌）】
- 創意概念優先：pitch 以一個獨特創意機制為核心（不是「我有很多粉絲」）。
- 受眾契合度：用數據說明頻道受眾與品牌目標受眾的重疊；不只是總粉絲數。
- 獨特機制：這個合作能做到其他創作者做不到的事是什麼？
- 成效衡量框架：提前說明如何追蹤成效；品牌 ROI 邏輯。
【Campaign toolkit craft】
- 創作者原生執行：toolkit 必須以創作者的平台語言設計，不是品牌廣告的 KOL 版本。
- 可複製的核心機制：設計一個讓其他創作者也想參與的挑戰/格式/鉤子。
- 品牌非擾動：品牌存在感足夠但不干擾創作者的真實風格。
【zh-TW 在地化｜最高優先】
- 台灣 KOL 生態：YouTube 知識/Vlog 型 KOL、Instagram 生活風格 KOL、TikTok/抖音創作者、小紅書台灣創作者各有不同brief 格式。
- 台灣創作者文化：重視真實感與長期關係；一次性露出效果遠不如長期大使計畫。
- 繁體中文、台灣口語；避免中國大陸 KOL 術語（改用台灣慣用詞）。
`.trim();

/**
 * Per-task award reference — transferable craft pattern per task.
 */
export const KL_TASK_REF: Record<string, string> = {
  "kl-30-invite-opener":    "Gymshark 網紅種子計畫邀請信（Shorty Award Best in Sports & Fitness）：真正了解創作者內容的個人化開場＋對品牌信念的共鳴，建立了 Gymshark 的核心創作者社群。",
  "kl-30-influencer-brief": "TikTok「Creator Marketplace」官方 brief 模板（TikTok for Business Award）：在清晰品牌護欄內給予充分創作自由；創作者的個人風格是資產，不是風險。",
  "kl-60-pitch-pack":       "MrBeast 品牌合作 pitch 模型（YouTube Streamy Award Top Creator 2022-2023）：pitch pack＝創意概念＋受眾契合＋獨特機制＋成效衡量；四件缺一品牌不會簽。",
  "kl-99-campaign-toolkit": "Chipotle「#ChipotleLidFlip」活動工具包（Shorty Award Best Food & Beverage Social；111,000 影片投稿＋1.04 億觀看）：工具包為創作者原生執行設計，不是品牌廣告的 KOL 改編版。",
};

/** Per-use-case playbook — keyed by taskId pattern. */
export function klPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = KL_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（KOL 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/invite/.test(id))
    return P("邀請開場：引用創作者特定作品→說明為何是「他」→說明對創作者的價值→低門檻下一步（進入對話而非談合約）。");
  if (/brief/.test(id))
    return P("Brief 三欄：創作自由區（可發揮範疇）＋品牌不可妥協點（2-3 條）＋成效衡量清晰；給靈感不給劇本。");
  if (/pitch-pack/.test(id))
    return P("Pitch pack 四件：獨特創意概念＋受眾數據契合度＋這個合作的不可複製機制＋ROI 衡量框架。");
  if (/campaign-toolkit/.test(id))
    return P("Campaign toolkit＝創作者原生執行設計；可複製的挑戰/格式/鉤子讓其他創作者也想參與；品牌存在感足夠不干擾。");

  return P("KOL 通用：創作者優先、真誠不交易、brief 給方向不給劇本、長期關係勝過一次性露出。");
}
