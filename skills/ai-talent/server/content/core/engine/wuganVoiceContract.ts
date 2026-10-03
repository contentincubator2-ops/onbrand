/**
 * wuganVoiceContract — 五感十築的「正向直述」句型合約。
 *
 * 2026-08-31。skill 01（wugan-monly-post-writing）Hard Rules 第 1 條：
 * 嚴禁所有「否定＋轉折＋肯定」句型。這是這個品牌最硬的一條規則。
 *
 * ── 為什麼光靠 prompt 不夠 ────────────────────────────────────────────
 * 規則已經寫在 pack 的 systemPrompt 最前面，而且列出全部變體。實測結果：
 * 同一張卡（wg-fb-life-practice）三個變體仍然出現 8 處違反 ——
 *   「好氧不是選擇題，而是讓新鮮空氣、過濾系統、低毒建材一起運作」
 *   「秋天的清晨不是拒絕開窗的理由，而是讓空氣對流更有效率的季節」
 *   「家裡的空氣始終在流動，而不是被困在溫度與濕度的選擇題裡」
 *   「讓呼吸成為最理所當然的事，不再是需要被計算、被妥協的生活選項」
 *
 * 這個句型在中文行銷文案裡是極強的吸引子，模型會一路滑回去。所以照
 * adCopyContract / shotListContract 已經確立的做法處理：驗證 → 具名重試
 * → 確定性修補。
 *
 * ── 為什麼修補是保守的 ────────────────────────────────────────────────
 * 修補只做「不會改變語意」的機械變換：把對比句的否定半邊拿掉，留下肯定
 * 半邊。凡是拿不準的形式一律不修，交由驗證擋下重試 —— 寧可重跑一次，也
 * 不要把句子改壞。
 */

/** 這張卡是否適用本合約。以 pack 注入的鐵律標題為記號。 */
export function isWuganVoiceTemplate(template: { systemPrompt: string }): boolean {
  return template.systemPrompt.includes("嚴禁否定轉折句型");
}

export interface WuganVoiceIssue {
  /** 命中的句型名稱，用於重試提示。 */
  pattern: string;
  /** 原文摘錄，讓模型知道是哪一句。 */
  excerpt: string;
  /** 全文命中總數。 */
  count: number;
}

/** 句子邊界：中文句號、驚嘆、問號、分號與換行。破折號不算，它常在句中。 */
const STOP = "。！？；\\n";

/**
 * skill 01 明列的禁用句型，外加「而不是」——它是同一個否定轉折構造，
 * 只是把否定半邊挪到後面，實測產出裡出現得比正序還頻繁。
 */
const BANNED: { name: string; re: RegExp }[] = [
  { name: "並不是⋯而是", re: new RegExp(`並不是[^${STOP}]{0,40}?而是`, "g") },
  { name: "並非⋯而是", re: new RegExp(`並非[^${STOP}]{0,40}?而是`, "g") },
  { name: "不只是⋯而是", re: new RegExp(`不只是[^${STOP}]{0,40}?而是`, "g") },
  { name: "不只是⋯更是", re: new RegExp(`不只是[^${STOP}]{0,40}?更是`, "g") },
  // 2026-08-31：dry-run 修 DB 語氣範例時發現的漏洞 —— 原本只比對「不是」，
  // 漏掉同一家族的「不止於／不僅／不光／不只」。skill 01 禁的是整個
  // 「否定＋轉折＋肯定」構造，不是單一個詞。
  { name: "不止(於)⋯而是", re: new RegExp(`不止(於)?[^${STOP}]{0,40}?而是`, "g") },
  { name: "不僅⋯而是", re: new RegExp(`不僅[^${STOP}]{0,40}?[而更]是`, "g") },
  { name: "不光⋯而是", re: new RegExp(`不光[^${STOP}]{0,40}?[而更]是`, "g") },
  { name: "不只⋯而是", re: new RegExp(`不只[^${STOP}]{0,40}?[而更]是`, "g") },
  { name: "不是因為⋯而是", re: new RegExp(`不是因為[^${STOP}]{0,40}?而是`, "g") },
  { name: "不再是⋯而是", re: new RegExp(`不再是[^${STOP}]{0,40}?而是`, "g") },
  { name: "不是⋯而是", re: new RegExp(`不是[^${STOP}]{0,40}?而是`, "g") },
  { name: "而不是", re: /而不是/g },
  // 2026-08-31：原本把單獨的「不再是」全部視為違反，那是過度攔截。skill 禁的
  // 是「不再是⋯而是⋯」這個轉折構造；「讓空調不再是唯一的調節工具」是正常
  // 中文，攔它只會白白燒掉一次重試。改成必須帶轉折續句才算。
  { name: "不再是⋯、是", re: new RegExp(`不再是[^${STOP}，,、]{1,30}[，,、]\\s*是`, "g") },
  // 逗號後緊接「不再是」＝對比尾巴（「A，不再是B」），與「而不是」同構。
  // 而「，讓空調不再是唯一的工具」中間隔了主語，是正常敘述，不算。
  { name: "，不再是（對比尾巴）", re: new RegExp(`[，,]\\s*不再是`, "g") },
  { name: "不是⋯、是", re: new RegExp(`不是[^${STOP}，,、]{1,30}[，,、]\\s*是`, "g") },
];

/** 找出第一個違反。沒有就回 null。 */
export function validateWuganVoice(text: string): WuganVoiceIssue | null {
  if (!text) return null;
  let total = 0;
  let first: { name: string; at: number; hit: string } | null = null;
  for (const { name, re } of BANNED) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      total++;
      if (!first || m.index! < first.at) first = { name, at: m.index!, hit: m[0] };
    }
  }
  if (!first) return null;
  const from = Math.max(0, first.at - 12);
  return {
    pattern: first.name,
    excerpt: text.slice(from, first.at + first.hit.length + 16).replace(/\s+/g, " "),
    count: total,
  };
}

/** 重試時附給模型的具名提示。 */
export function buildWuganVoiceReminder(issue: WuganVoiceIssue): string {
  return `出現 ${issue.count} 處禁用的否定轉折句型（第一處是「${issue.pattern}」：…${issue.excerpt}…）。`
    + `五感十築嚴禁「不是⋯而是⋯」「並不是⋯而是⋯」「不只是⋯而是⋯」「不只是⋯更是⋯」`
    + `「不再是⋯」「而不是⋯」等所有否定轉折句型。請直接說它是什麼、怎麼做、帶來什麼感受，`
    + `全文改成正向直述後重寫。`;
}

/**
 * 確定性修補 —— 最後一次嘗試仍違反時使用。
 *
 * 只做語意安全的變換：
 *   「A不是X，而是Y」   → 「A是Y」
 *   「A，而不是X」      → 「A」（刪掉對比尾巴）
 *   「A，不再是X」      → 「A」（同上）
 * 其餘形式不動，讓它們留在文字裡 —— 修壞比留著更糟，而且驗證已經先擋過
 * 一次重試了。
 */
export function repairWuganVoice(text: string): string {
  if (!text) return text;
  let out = text;

  // 1. 「不是A，而是」→「是」（並不是 / 並非 / 不只是 / 不是因為 同構）
  out = out.replace(
    new RegExp(`(並不是|並非|不只是|不是因為|不再是|不是)[^${STOP}，,、]{0,40}[，,、]\\s*(而是|更是)`, "g"),
    "是",
  );

  // 1b. 頓號形式：「家不再是悶的、是透氣的」→「家是透氣的」
  out = out.replace(new RegExp(`(不再是|不是)[^${STOP}，,、]{1,30}[，,、]\\s*是`, "g"), "是");

  // 2. 對比尾巴：「，而不是…」「，不再是…」整段刪到句末
  out = out.replace(new RegExp(`[，,]\\s*而不是[^${STOP}]*`, "g"), "");
  out = out.replace(new RegExp(`[，,]\\s*不再是[^${STOP}]*`, "g"), "");
  // 破折號引出的對比尾巴同理
  out = out.replace(new RegExp(`[—–-]{1,2}\\s*(而不是|不再是)[^${STOP}]*`, "g"), "");

  // 2b. 無逗號的「A而不是B」——實測出現在 bullet 標題裡：
  //     「讓冷氣成為支持而不是依賴」。刪掉被否定的那半邊，保留肯定的。
  //     邊界要含 * 與 」，否則會把 Markdown 粗體的收尾記號一起吃掉。
  out = out.replace(new RegExp(`而不是[^。！？；，,、*」
]{0,20}`, "g"), "");

  // 3. 清掉修補後可能留下的重複標點與行尾逗號
  out = out.replace(/[，,]{2,}/g, "，").replace(new RegExp(`[，,](?=[${STOP}])`, "g"), "");
  return out;
}
