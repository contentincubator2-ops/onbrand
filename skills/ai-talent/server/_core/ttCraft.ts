/**
 * TikTok craft layer — 2026-05-17 (CJ「所有平台都要得獎工藝層」).
 * Architecture mirrors igCraft.ts / edmCraft.ts. Brand-agnostic craft
 * discipline; brand voice from digest; hard rules from post-gen enforcement.
 * Injected for ALL TT-family body tasks (30s / 60s / 99s).
 *
 * TikTok is a sound-first, attention-scarce medium: 1.5 seconds to
 * earn the stay. The rubric encodes hook engineering, script architecture,
 * series design, and virality mechanics proven by award-winning campaigns.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/** Is this a TikTok-family task? (30s / 60s / 99s) */
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
【每一部都必守：從 TA 視角拍 + 一個 USP（最高優先，違反＝不合格）】
- **從 TA 視角拍，不是對 TA 喊話**：禁用「身為 ___ 的你」「凌晨 X 點還在 ___ 嗎」這類把 TA 寫在第一句的呼喚句型/開場 caption。改用 TA 真實世界的具體畫面與細節讓他自己認出來：他這週實際在做的事 / 他內心 OS / 他手邊那個讓他煩的物件 / 他聽過別人對他說的一句話。讓 TA 覺得「這個 creator 是不是偷裝攝影機在我家」。
- 只打一個賣點/主張：整部影片聚焦一個梗、一個對比、或一個 payoff；不要一支片想塞 3 個重點。
- 自我檢查：若把品牌名遮掉仍適用任何競品 → 太通用，重寫；若一部影片在賣超過一個東西 → 拆成多部。
【Hook craft — 前 3 秒是全部】
- 第 0 秒就進主題：沒有開場白、沒有 logo 動畫、沒有「大家好我是 ___」。
- Hook = 視覺衝擊 + 字幕 + （可選）聲音三重觸發；任何一層都能抓人就成功。
- 好 hook 的公式：「視覺不可能事件」或「字幕反直覺主張」或「前 1 秒就有後果」——讓人停在「等等這是什麼」。
- 字幕切在情緒節拍（不是字數）：每行 6-10 字；強調詞可全大寫；不要三行同時出現。
【腳本結構（30-60s）】
- Hook（0-3s）→ Payoff Promise（3-8s，說清楚「留下來你會得到什麼」）→ 主體 3 點（8-45s，每點 5-8s）→ 反差或高潮（45-55s）→ CTA 或 loop 回 hook（55-60s）。
- 每個節拍換一件事（鏡頭/主題/節奏），防止「滑走衝動」。
- 結尾設計成可 loop：最後一幀讓人想重看、或留一個沒解答的問題。
【系列 craft (60s + 99s)】
- 連載：每集完整但讓人「必須看下一集」；角色弧 + 未解張力比劇情更重要。
- 30 天月曆：1 個可重複的前提 / 格式 + 每日微調；challenge 機制讓社群接棒；創作者/KOL 帳號擴散。
- 趨勢週：快速反應日曆——識別 emerging trend → 品牌版本 → 社群種子 → 記錄反應；時機 > 完美製作。
【病毒力 craft】
- 可截圖時刻：至少 1 個畫面/字幕讓人想截圖 + 分享（觀點夠銳、反差夠強、數據夠具體）。
- Duet/Stitch 友善：留白給別人接（問題沒說完，或明確說「stitch 告訴我你的版本」）。
- 聲音策略：trending sound 增加發現率；但內容靜音看也要能看懂（字幕補滿）。
【Trend remix 原則】
- 好的改編改 1 個元素讓它變品牌的：不要從頭重建，要「劫持」——只換 1 個字/1 個鏡頭/1 個轉折。
- 時機 > 完美製作：trend 高峰期 24h 內；粗糙但即時 > 精緻但過時。
【zh-TW 在地化｜最高優先】台灣 TikTok 慣用語、台式幽默（自嘲/誇飾/反差）；台灣節點與時事梗；繁體字幕。不要用對岸流行語或美式網路語。
`.trim();

/**
 * Per-task award reference — keyed by exact taskId (30s + 60s + 99s).
 */
export const TT_TASK_REF: Record<string, string> = {
  // ── 30s ───────────────────────────────────────────────────────────────
  "tt-30-opening-hook":
    "E.l.f. Cosmetics「#EyesLipsFace」TikTok 挑戰 (Shorty Award Best Use of TikTok 2020；5 百萬+ UGC 影片、5 十億+ 觀看次數，TikTok 最早的品牌 challenge 成功案例)：第一幀 = 視覺衝擊或行動後果，不是 logo；原創 TikTok 音效 × 挑戰機制 = 有機觸及爆發。",
  "tt-30-full-script":
    "Duolingo TikTok 帳號 @duolingo (Shorty Award Best Brand Presence on TikTok 多屆；超過 1000 萬追蹤者；Fast Company 最具創意品牌)：角色弧 + 未解張力；每支影片完整但讓人「必須看下一集」；吉祥物成為有自己邏輯的角色，不只是代言人。",
  "tt-30-duet-angle":
    "Ocean Spray × Nathan Apodaca「Dreams」TikTok 有機協作 (Shorty Award Best Branded Content 2021；品牌 24h 內回應讓有機病毒事件成為品牌資產)：最好的 duet 角是「加入相反能量」——品牌成為支持角色，不是主角；反差 = 文化張力 = 分享動機。",
  "tt-30-trend-remix":
    "Wendy's TikTok 趨勢即時改編 (Shorty Award Best Brand Use of TikTok 2022；Ad Age 評選最佳快餐社群策略)：改 1 個元素讓它變品牌的；不重建 trend，只劫持它；時機正確的粗糙版 > 遲到的精緻版。",
  "tt-30-live-opening":
    "WWE TikTok Live 開場設計 (TikTok 官方創作者案例；WWE 是非音樂類 TikTok Live 最高同時在線的體育娛樂品牌)：開場 30 秒說清楚「今晚的衝突是什麼 + 為何不能重播 + 你現在能影響什麼（投票/喊話）」；即時互動機制在開場就啟動——觀眾感覺自己是劇情的一部分，不只是觀眾。",

  // ── 60s ───────────────────────────────────────────────────────────────
  "tt-60-foryou-full":
    "Washington Post @washingtonpost TikTok 完整腳本格式 (Shorty Award Best in News & Politics 2021；傳統媒體轉型 TikTok 最成功案例)：完整 ForYou 腳本 = 0-3s 反直覺新聞主張 → 3-8s 為何你要在意 → 主體 3 段（每段換鏡頭/格式防滑走）→ 45s 反差後果 → CTA 留言辯論；嚴肅新聞用 TikTok 原生語言傳播的教科書。",
  "tt-60-series-3":
    "Ryanair TikTok 自嘲幽默連載系列 (Shorty Award Best Airline Social Media 2022；歐洲追蹤數最高的航空品牌 TikTok 帳號)：3 集 = 1 個可重複的「品牌拿自己開玩笑」前提；每集新的自嘲場景但相同角色邏輯（廉價航空的驕傲與無奈）；粉絲追劇的理由是看品牌繼續拆自己台；角色弧比劇情更重要。",
  "tt-60-viral-rewrite":
    "Dove「反有害美容濾鏡」TikTok 病毒回應 (Cannes Lions Bronze Digital Craft 2022；Dove 反擊 TikTok 上有害濾鏡趨勢)：鎖定傷害品牌價值觀的病毒趨勢 → 以品牌立場反向回應（#NoDigitalDistortion）→ 品牌成為文化對話的一方而非旁觀者；病毒改寫 = 選擇立場，不只是搭便車；分享機制是「我支持這個立場」。",

  // ── 99s ───────────────────────────────────────────────────────────────
  "tt-99-30day-foryou":
    "Chipotle「#GuacDance」TikTok challenge (Shorty Awards 第 12 屆最佳食品飲料類；250,000+ UGC 影片、4 億 3 千萬次影片播放；National Avocado Day 24h 內最高酪梨醬銷售紀錄)：1 個 challenge 機制錨全月；每天微調讓社群接棒；品牌參與自己的 challenge。",
  "tt-99-trend-week":
    "NBA TikTok 帳號 @nba (全球體育品牌 TikTok 追蹤最多之一；Shorty Award Best Brand in Sports 多次；趨勢快速反應的體育媒體標竿)：快速反應日曆；識別 emerging trend → 品牌版 → 社群種子 → 記錄反應；每天格式不同；時機比精緻度更重要。",
};

/** Per-use-case playbook — per taskId pattern + award reference appended. */
export function ttPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = TT_TASK_REF[id];
  // 2026-09-06 (CJ): fallback exemplar per branch. Until now `ref` existed
  // only on an exact task-id hit, and a brand pack's custom ids are never in
  // TT_TASK_REF — so those cards got the structure and no case. Each fallback is
  // resolved from the SAME regex that selected the branch, against this
  // module's own case pool: no second lookup table to drift, no new claim.
  const P = (s: string, fallbackKey?: keyof typeof TT_TASK_REF) => {
    const use = ref ?? (fallbackKey ? TT_TASK_REF[fallbackKey] : undefined);
    return `# 本任務 playbook（TikTok 得獎模式）\n${s}` +
      (use ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${use}` : "");
  };

  // ── 30s ───────────────────────────────────────────────────────────────
  if (/opening-hook/.test(id))
    return P("前 3 秒 hook：第 0 秒就進主題；視覺+字幕雙重觸發；好公式：視覺不可能事件或字幕反直覺主張；不要開場白。", "tt-30-opening-hook");
  if (/full-script/.test(id))
    return P("完整腳本：Hook(0-3s)→Payoff Promise(3-8s)→主體 3 點(8-45s)→反差高潮(45-55s)→CTA/loop(55-60s)；每節拍換一件事；結尾可 loop 或留開放問題。", "tt-30-full-script");
  if (/duet/.test(id))
    return P("Duet 角度：加入相反能量而非相同能量；品牌成為支持角色；反差製造文化張力；說清楚觀眾能接的方向。", "tt-30-duet-angle");
  if (/trend-remix/.test(id))
    return P("Trend 改編：改 1 個元素讓它變品牌的；不重建從頭；時機 > 完美製作；說明改了哪個元素 + 為何這個 timing。", "tt-30-trend-remix");
  if (/live/.test(id))
    return P("Live 開場：前 10 秒說清楚「現在正在發生什麼 + 為何不能重播 + 你能做什麼」；即時互動機制立刻啟動。", "tt-30-live-opening");

  // ── 60s ───────────────────────────────────────────────────────────────
  if (/foryou-full/.test(id))
    return P("完整 TikTok：Hook(0-3s)→Promise(3-8s)→主體 3 點(8-45s)→反差(45-55s)→loop/CTA(55-60s)；每秒有理由存在；靜音看也能懂；至少 1 個可截圖時刻。", "tt-60-foryou-full");
  if (/series/.test(id))
    return P("3 集系列：集 1 setup + 鉤子，集 2 complication + 深化，集 3 resolution + 重啟循環；角色弧比劇情更重要；每集獨立可看但讓人看下集。", "tt-60-series-3");
  if (/viral-rewrite/.test(id))
    return P("病毒改寫：分析原作分享機制（反差/情緒/可截圖哪個）→ 萃取 → 用品牌素材重建；不抄創意，借機制；說明分析過程。", "tt-60-viral-rewrite");

  // ── 99s ───────────────────────────────────────────────────────────────
  if (/30day/.test(id))
    return P("30 天月曆：1 個可重複 challenge 格式錨全月；每天微調讓社群接棒；KOL 種子第 1 週啟動；品牌參與自己的 challenge；記錄社群反應作為後期內容。", "tt-99-30day-foryou");
  if (/trend-week/.test(id))
    return P("趨勢週：快速反應日曆；識別 emerging trend → 品牌版 → 社群種子 → 記錄反應；每天格式不同（duet/stitch/original）；時機比精緻度更重要。", "tt-99-trend-week");

  return P("TikTok 通用：1.5 秒 hook、字幕切情緒節拍、可截圖時刻、結尾可 loop 或留開放張力。", "tt-30-opening-hook");
}
