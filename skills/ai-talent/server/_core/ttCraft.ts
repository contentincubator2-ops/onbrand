/**
 * TikTok craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts. Brand-agnostic craft
 * discipline; brand voice from digest; hard rules from post-gen enforcement.
 * Injected only for TT-family body tasks.
 *
 * TikTok is a sound-first, attention-scarce medium: 1.5 seconds to
 * earn the stay. The rubric encodes the hook engineering, script
 * architecture, and virality mechanics that award-winning TikTok
 * campaigns consistently use.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a TikTok-family task? */
export function isTikTokTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("tt-")) return true;
  return template.outputDefaults?.platform === "tiktok";
}

/**
 * A "full body" TT deliverable vs an atomic fragment.
 * Fragments (bio-rewrite / hashtag-set / caption-rhythm /
 * caption-description / comment-reply) are tiny purpose-built
 * outputs — the heavy rubric homogenises them. Skip.
 */
export function isTikTokBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/bio-rewrite|hashtag-set|caption-rhythm|caption-description|comment-reply/.test(id))
    return false;
  return isTikTokTask(template);
}

/** TikTok award-grade rubric — hook engineering + script arc + zh-TW. */
export const TT_CRAFT_RUBRIC = `
# TikTok 得獎級工藝準則（嚴格遵守）
TikTok 是注意力極度稀缺的媒介——1.5 秒沒抓住就滑掉；聲音是第一層 hook；垂直全版是唯一比例。
【Hook craft — 前 3 秒是全部】
- 第 0 秒就進主題：沒有開場白、沒有 logo 動畫、沒有「大家好我是 ___」。
- Hook = 視覺衝擊 + 字幕 + （可選）聲音三重觸發；任何一層都能抓人就成功。
- 好 hook 的公式：「視覺不可能事件」或「字幕反直覺主張」或「前 1 秒就有後果」——讓人停在「等等這是什麼」。
- 字幕切在情緒節拍（不是字數）：每行 6-10 字；強調詞可全大寫；不要三行同時出現。
【腳本結構】
- 30-60s 弧線：Hook（0-3s）→ Payoff Promise（3-8s，說清楚「留下來你會得到什麼」）→ 主體 3 點（8-45s，每點 5-8s）→ 反差或高潮（45-55s）→ CTA 或 loop 回到 hook（55-60s）。
- 每個節拍換一件事（鏡頭/主題/節奏），防止「滑走衝動」。
- 結尾設計成可 loop：最後一幀讓人想重看、或留一個沒解答的問題。
【病毒力 craft】
- 可截圖時刻：至少 1 個畫面/字幕讓人想截圖 + 分享（觀點夠銳、反差夠強、或數據夠具體）。
- Duet/Stitch 友善：留白給別人接（問題沒說完、或明確說「stitch 告訴我你的版本」）。
- 聲音策略：用 trending sound 增加發現率；但內容本身靜音看也要能看懂（字幕補滿）。
【Trend remix 原則】
- 好的改編改 1 個元素讓它變品牌的：不要從頭重建 trend，要「劫持」它——只換 1 個字/1 個鏡頭/1 個轉折。
- 時機 > 完美製作：trend 高峰期 24h 內；粗糙但即時 > 精緻但過時。
【zh-TW 在地化｜最高優先】台灣 TikTok 慣用語、台式幽默（自嘲/誇飾/反差）；台灣節點與時事梗；繁體字幕。不要用對岸流行語或美式網路語。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId.
 */
const TT_TASK_REF: Record<string, string> = {
  "tt-30-opening-hook":
    "E.l.f. Cosmetics「Eyes. Lips. Famous.」TikTok (Cannes Lions Social & Influencer Gold 2023)：第一幀 = 視覺不可能事件或行動後果，不是 logo；原創 TikTok 音效 × 挑戰機制 = 4M+ 有機觀看，earned attention 勝過 paid。",
  "tt-30-full-script":
    "Duolingo「The Last Lesson」TikTok 系列 (Shorty Award Best Brand Social Campaign 2023)：角色弧 + 未解張力；每支影片完整但讓人「必須看下一集」；吉祥物成為有自己行動邏輯的角色，不只是代言人。",
  "tt-30-duet-angle":
    "Ocean Spray × Nathan Apodaca「Dreams」TikTok 協作 (Shorty Award Best Branded Content 2021)：最好的 duet 角是「加入相反能量」——品牌成為支持角色，不是主角；反差 = 文化張力 = 分享動機。",
  "tt-30-trend-remix":
    "Wendy's「Baconator」trend 改編系列 (Shorty Award Best Fast Food Social 2023)：改 1 個元素讓它變品牌的；不重建 trend，只劫持它；時機正確的粗糙版 > 遲到的精緻版。",
  "tt-30-live-opening":
    "Florida Lottery「Scratch Factor Live」(IAC Gold Award Social Media 2023)：開場 10 秒：正在發生什麼 + 為何不能重播 + 觀眾能控制什麼；即時互動機制在前 30 秒就啟動。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function ttPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = TT_TASK_REF[id];
  const P = (s: string) =>
    `# 本任務 playbook（TikTok 得獎模式）\n${s}` +
    (ref ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${ref}` : "");

  if (/opening-hook/.test(id))
    return P("前 3 秒 hook：第 0 秒就進主題；視覺+字幕雙重觸發；好公式：視覺不可能事件或字幕反直覺主張；不要開場白。");
  if (/full-script/.test(id))
    return P("完整腳本：Hook(0-3s)→Payoff Promise(3-8s)→主體3點(8-45s)→反差高潮(45-55s)→CTA/loop(55-60s)；每節拍換一件事；結尾可 loop 或留開放問題。");
  if (/duet/.test(id))
    return P("Duet 角度：加入相反能量而非相同能量；品牌成為支持角色；反差製造文化張力；說清楚觀眾能接的方向。");
  if (/trend-remix/.test(id))
    return P("Trend 改編：改 1 個元素讓它變品牌的；不重建從頭；時機 > 完美製作；說明改了哪個元素 + 為何這個 timing。");
  if (/live/.test(id))
    return P("Live 開場：前 10 秒說清楚「現在正在發生什麼 + 為何不能重播 + 你能做什麼」；即時互動機制立刻啟動。");
  // default
  return P("TikTok 通用：1.5 秒 hook、字幕切情緒節拍、可截圖時刻、結尾可 loop 或留開放張力。");
}
