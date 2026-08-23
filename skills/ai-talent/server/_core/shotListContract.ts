// 2026-08-23 (CJ「參考史上互動最高的 10 支 TikTok 開新任務卡」):
// 那批卡的交付物是「可以照著拍的分格腳本」，不是貼文。但每一次 caption
// 呼叫都會先吃到共用的社群骨架，而那段骨架正好明文寫著
//   「段落像真人寫的，不要排成『標題｜內文｜hashtag』結構化卡片」
//   「hashtag 集中放在文末最後一行」
//   「輸出嚴格 JSON：{"caption":"<完整貼文>","hashtags":[...]}」
// —— 三條都在把分格腳本往貼文推。實測（probe-orchestra，2026-08-23）：
// 三個變體全部回傳帶 hashtag 的貼文文案，一格腳本都沒有。
//
// 解法沿用廣告格式合約（adCopyContract.ts）已經驗證過的那一招：把合約
// 接在 system prompt 的**最後**，成為最新鮮、優先級最高的指令，再加上
// 產出後的驗證（不合格就重試）與確定性修補（砍掉硬長出來的 hashtag）。
//
// 偵測刻意收得很窄 —— 只認 TT_MECHANIC_CORE 那段五行格式區塊的標記字串。
// 其他任務（貼文、字幕、bio…）完全不受影響。

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * 五行格式區塊的指紋。TT_MECHANIC_CORE 裡逐字出現這一行，
 * 其他任何 systemPrompt 都沒有 —— 改動那段時務必同步這裡（有測試綁著）。
 */
const SHOT_LIST_MARKER = "【輸出格式 — 每一格都照這五行寫，不可寫成散文】";

/** 這個 template 的交付物是不是分格腳本。 */
export function isShotListTemplate(template: Pick<FBTaskTemplate, "systemPrompt">): boolean {
  return (template.systemPrompt ?? "").includes(SHOT_LIST_MARKER);
}

/**
 * 合約本文。接在 system prompt 最後，明確把社群骨架的三條規則各自關掉。
 */
export function buildShotListRule(): string {
  return (
    `\n\n【分格腳本合約 — 最高優先，蓋過上方所有格式規則】\n` +
    `- 本任務的交付物**不是貼文**，是導演拿著就能開拍的分格腳本。` +
    `**例外**於上方「不要排成結構化卡片」規則：caption 必須是結構化的一格一格。\n` +
    `- caption 必須包含**至少 3 格**，每一格開頭是時間戳 [起-迄s]，` +
    `接著依序四行「畫面：」「動作：」「聲音：」「字卡：」，四行缺一不可。\n` +
    `- **全篇禁止 hashtag**（# 開頭的字串一個都不准出現，也不要放在最後一行）。` +
    `hashtags 欄位一律回傳空陣列 []。\n` +
    `- 四行必須**各自獨立換行**（真的輸出換行字元）。不可以把四行擠在同一行，` +
    `不可以用方括號寫成 [畫面：…][動作：…]，時間戳那一行只放格名。\n` +
    `- 禁止寫旁白稿。要講的話只能出現在「字卡：」那一行。\n` +
    `- 不要寫任何開場白、結語或「以下是腳本」之類的引導句，caption 第一個字元就是 [。\n`
  );
}

export interface ShotListIssue {
  reason: "too_few_shots" | "missing_lines" | "has_hashtags" | "no_timestamps";
  detail: string;
}

/** 一格的開頭：[0-1.5s] / [0.0-1.5s] / [12-15 s] 都算。 */
const SHOT_HEAD_RE = /^\s*\[\s*\d+(?:\.\d+)?\s*[-–~]\s*\d+(?:\.\d+)?\s*s?\s*\]/gmu;

/**
 * 四行標籤。每個標籤同時收繁體與簡體寫法 —— 這裡驗的是**結構**，
 * 不是用字。降級到中國模型（zhipu / deepseek）時會回「画面：」，
 * 那是簡繁問題，已經有 zh-TW sanitizer 在管；在這裡擋掉只會白白吃掉
 * 一次重試，最後還修不回來（實測 2026-08-23）。
 */
const LINE_LABELS: ReadonlyArray<readonly string[]> = [
  ["畫面", "画面"],
  ["動作", "动作"],
  ["聲音", "声音"],
  ["字卡"],
];

const HASHTAG_RE = /(?:^|\s)#[^\s#]+/gu;

export function countShots(caption: string): number {
  return (caption.match(SHOT_HEAD_RE) ?? []).length;
}

/** 不合格回傳 issue，合格回傳 null。 */
export function validateShotList(caption: string): ShotListIssue | null {
  const shots = countShots(caption);
  if (shots === 0) {
    return { reason: "no_timestamps", detail: "caption 沒有任何 [起-迄s] 時間戳，這不是分格腳本" };
  }
  if (shots < 3) {
    return { reason: "too_few_shots", detail: `只有 ${shots} 格，分格腳本至少要 3 格` };
  }
  const missing = LINE_LABELS
    .filter((forms) => !forms.some((f) => new RegExp(`${f}\\s*[：:]`, "u").test(caption)))
    .map((forms) => forms[0]!);
  if (missing.length > 0) {
    return { reason: "missing_lines", detail: `每一格都要有「${missing.join("」「")}」這幾行` };
  }
  if (HASHTAG_RE.test(caption)) {
    HASHTAG_RE.lastIndex = 0;
    return { reason: "has_hashtags", detail: "分格腳本不能有 hashtag" };
  }
  HASHTAG_RE.lastIndex = 0;
  return null;
}

/**
 * 一格的四個標籤（含簡體），用來把擠在同一行的內容拆開。
 * 前面必須先有一個「非空白字元」才算擠在一起 —— 否則行首縮排用的
 * 全形空格會被誤判成 inline，把縮排孤零零留在上一行。
 */
const INLINE_LABEL_RE = /([^\n\s　])[ \t　]*((?:畫面|画面|動作|动作|聲音|声音|字卡)\s*[：:])/gu;

/** 模型硬塞進 caption 的 JSON / markdown 外殼殘骸。 */
const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gu;
const JSON_HEAD_RE = /^\s*\{?\s*["「']?caption["」']?\s*[：:]\s*\[?\s*["']?/u;
const JSON_TAIL_RE = /["'\]\}，,\s]+$/u;

/**
 * 把模型「內容對、包裝爛」的回應救回來 —— 在驗證**之前**跑。
 *
 * 實測（probe-orchestra，2026-08-23，降級到 zhipu）三種包裝問題：
 *   ① caption 裡是字面的 \n 兩個字元，不是真的換行
 *   ② JSON 外殼漏出來：開頭 ```json{"caption":[ 、結尾 "]}
 *   ③ 四行擠成一行，或時間戳與「畫面：」黏在同一行
 * 全部是機械性的，修得回來；修完就能通過驗證，不必燒掉一次重試。
 */
export function normalizeShotList(caption: string): string {
  let t = caption.replace(FENCE_RE, "");
  t = t.replace(JSON_HEAD_RE, "");
  // 字面 "\n"（反斜線 + n）→ 真的換行。順帶處理 \r\n 與逸出的引號。
  t = t.replace(/\\r\\n|\\n/gu, "\n").replace(/\\"/gu, '"');
  // 結尾的 JSON 殘骸只有在「整串都是括號/引號/逗號/空白」時才砍，
  // 避免吃掉字卡本身的標點。
  const tail = t.match(JSON_TAIL_RE);
  if (tail && /["'\]\}]/u.test(tail[0])) t = t.slice(0, t.length - tail[0].length);
  // 每個時間戳自成一行的開頭。
  // 2026-08-23 VM probe：句子裡順帶提到的時間戳不算一格 —— 「無縫接回第一格
  // [0.0-0.5s]）」被切開後會留下一行孤零零的「[0.0-0.5s]）」。真正的格頭後面
  // 接的是格名，不會緊跟著收尾標點，所以用後方字元排除掉這種行內引用。
  t = t.replace(
    /(?!^)[ \t　]*(\[\s*\d+(?:\.\d+)?\s*[-–~]\s*\d+(?:\.\d+)?\s*s?\s*\])(?![）)〕】\]，,。、；;])/gu,
    "\n$1",
  );
  // 四個標籤各自獨立成行
  t = t.replace(INLINE_LABEL_RE, "$1\n$2");
  // 腳本後面的區塊標題（【開拍前準備】…）也要自成一行 —— 實測會黏在最後
  // 一格的「字卡：」後面（字卡：開了。【開拍前準備】）。
  t = t.replace(/([^\n])[ \t　]*(【[^】\n]{2,10}】)/gu, "$1\n\n$2");
  return t.replace(/\n{3,}/gu, "\n\n").trim();
}

/**
 * 確定性修補 —— 最後一道防線。先正規化，再砍掉 hashtag。
 * 格數不足、缺行這種問題修不了（要重寫內容），交給重試處理。
 */
export function repairShotList(caption: string): string {
  return normalizeShotList(caption)
    .split("\n")
    .map((line) => line.replace(HASHTAG_RE, "").replace(/[ \t]+$/u, ""))
    .filter((line, i, arr) => line.trim() !== "" || (i > 0 && arr[i - 1]!.trim() !== ""))
    .join("\n")
    .trim();
}
