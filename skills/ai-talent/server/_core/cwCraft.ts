/**
 * Cross-Platform craft layer — 2026-05-17.
 * Faithful mirror of igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW) for the CW family only. Injected only for
 * cw-family body tasks so other platforms are completely unaffected.
 *
 * Cross-platform craft is about platform-native adaptation, NOT
 * copy-paste. Each platform has its own language; the same idea must
 * be re-expressed, not just reformatted. A/B variants test different
 * hypotheses, not different executions of the same hypothesis.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a Cross-Platform task?
 * Covers cw-* templates exclusively.
 */
export function isCrossplatformTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  return id.startsWith("cw-");
}

/** Both CW tasks are full-body outputs — no fragment exclusions. */
export function isCrossplatformBodyTask(template: FBTaskTemplate): boolean {
  return isCrossplatformTask(template);
}

/** The award-grade Cross-Platform rubric — platform-native + zh-TW. */
export const CW_CRAFT_RUBRIC = `
# 跨平台工藝準則（嚴格遵守）
跨平台改編是平台原生表達，不是複製貼上——每個平台有自己的母語，同一個想法必須用平台的語言重新說：
【平台原生語言 craft】
- TikTok：Hook（前 1-3 秒）＋聲音/音樂驅動＋字卡強化＋挑戰/參與機制；敘事節奏快、真實感勝過精緻製作。
- Instagram：視覺主張優先＋情感共鳴＋儲存/分享誘因；carousel 說故事、Reel 娛樂/教育、Story 互動。
- Facebook：社群感＋分享動機＋完整資訊（FB 受眾願意讀長文）；事件/社團/在地連結有優勢。
- LinkedIn：洞察/數據＋專業框架＋個人觀點；第一行是 hook，結尾邀請討論（不是行銷 CTA）。
- YouTube：信任建立型長內容；縮圖＋標題決定點擊率；前 30 秒決定留存；CTA 在視頻中間（觀眾最投入時）。
- LINE：台灣最高滲透率；訊息要短（3-5 行）＋強 CTA；圖文卡/貼圖是台灣特有格式。
【跨貼策略 craft】
- 測試：先發效果最好的主平台版本，再根據反饋調整其他平台。
- 時間差：不同平台最佳發佈時間不同（LinkedIn 週二早上/IG 週三晚上/FB 週五午後）。
- 同一主張，不同切入點：每個平台版本都是對同一核心訊息的不同入口，受眾完整接觸後應強化同一品牌認知。
【A/B 測試 craft】
- 一次測試一個變數：不能同時改 headline＋圖片＋CTA（無法判斷是哪個造成差異）。
- 每個 variant＝一個不同假設：Variant A 假設「受眾對恐懼訴求有反應」，Variant B 假設「受眾對利益訴求有反應」——這是兩個假設，不是同一假設的兩個版本。
- 樣本量要夠：統計顯著需要足夠樣本；太早宣告勝負是常見錯誤。
- 失敗的 variant 和成功的一樣有價值：記錄「什麼不 work」是品牌知識累積。
【zh-TW 在地化｜最高優先】
- 台灣多平台行為：LINE/FB 仍是最高滲透率（全年齡層）；IG 用於發現＋生活靈感；YouTube 用於信任建立（購買前研究）；TikTok/短影音快速成長中。
- 台灣用戶對「硬推銷」的容忍度低；原生感（native feel）是各平台成效的前提。
- 繁體中文、台灣口語；各平台的在地最佳實踐（台灣品牌案例）優先於西方平台規範。
`.trim();

/**
 * Per-task award reference — transferable craft pattern per task.
 */
const CW_TASK_REF: Record<string, string> = {
  "cw-60-crosspost-4platform": "Spotify「Wrapped」跨平台活動（Cannes Lions Grand Prix＋Shorty Award Best Cross-Platform Campaign）：同一個資料故事用 4 種不同的平台原生語言說給 4 個不同平台的受眾聽；不是同一素材的格式轉換，是同一主張的不同表達。",
  "cw-60-ab-variants":         "Netflix A/B 縮圖與文案測試方法論（Netflix Technology Blog）：Netflix 每個片名測試 10-20 個 variant；A/B variant＝不同假設，不是同一想法的不同執行——每個 variant 必須對應一個清楚的受眾假設。",
};

/** Per-use-case playbook — keyed by taskId pattern. */
export function cwPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = CW_TASK_REF[id];
  // 2026-09-06 (CJ): fallback exemplar per branch. Until now `ref` existed
  // only on an exact task-id hit, and a brand pack's custom ids are never in
  // CW_TASK_REF — so those cards got the structure and no case. Each fallback is
  // resolved from the SAME regex that selected the branch, against this
  // module's own case pool: no second lookup table to drift, no new claim.
  const P = (s: string, fallbackKey?: keyof typeof CW_TASK_REF) => {
    const use = ref ?? (fallbackKey ? CW_TASK_REF[fallbackKey] : undefined);
    return `# 本任務 playbook（跨平台得獎模式）\n${s}` +
      (use ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${use}` : "");
  };

  if (/crosspost/.test(id))
    return P("跨貼四平台：TikTok（hook＋聲音＋快節奏）→IG（視覺主張＋情感）→FB（社群感＋完整資訊）→LinkedIn（洞察＋數據＋專業框架）；同一核心主張，四種平台原生語言，不是四個格式轉換。", "cw-60-crosspost-4platform");
  if (/ab-variants/.test(id))
    return P("A/B Variants：每個 variant 對應一個清楚的受眾假設（非同一假設的兩個版本）；一次只改一個變數（headline/圖片/CTA 擇一）；記錄每個 variant 測試的假設，不論成敗都是品牌知識。", "cw-60-ab-variants");

  return P("跨平台通用：平台原生表達（不是複製貼上）、每個平台有自己的母語、A/B 測試一次一個變數、台灣 LINE/FB 仍是最高滲透率優先考量。", "cw-60-crosspost-4platform");
}
