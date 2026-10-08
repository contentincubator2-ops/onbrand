/**
 * 換人改寫／請主筆改的格式合約 —— 2026-09-29。
 *
 * 實測（dev /run/3777，FB Reels 固定角色短劇，卡片規定 60–150 字）：換成 Grace 改寫後
 * 變成好幾段、還帶 `**` 粗體。refineCaption 是通用改寫，完全不知道這張卡的字數與形式。
 *
 * 跟 caption 骨架的作法一樣（見 adCopyContract / shotListContract）：
 *   1. 合約接在 system prompt 最後（最後讀到的最有力）
 *   2. 驗證：超過上限 25% 就帶著實際字數重寫一次
 *   3. 確定性修補：社群貼文不吃 markdown，`**粗體**`、`# 標題` 一律拿掉
 * 不做硬截斷 —— 砍半句比超字數更糟。
 */

export interface RewriteSpec {
  /** 任務名稱，例如「FB Reels：固定角色短劇」 */
  label?: string | null;
  minChars?: number | null;
  maxChars?: number | null;
}

/** 超過上限多少才算「太長」：留一點彈性，避免為了幾個字重寫。 */
export const OVER_LIMIT_RATIO = 1.25;

/** 計字：不算空白與換行（跟用戶在編輯器看到的字數同一個方向，只是更寬鬆）。 */
export function countChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/** 社群貼文不渲染 markdown：拿掉粗體／斜體底線／標題井號／反引號，保留 #hashtag。 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/__([^_\n]+?)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isOverLimit(text: string, spec: RewriteSpec): boolean {
  const max = spec.maxChars ?? 0;
  return max > 0 && countChars(text) > Math.ceil(max * OVER_LIMIT_RATIO);
}

/** 接在 system prompt 最後的合約。 */
export function rewriteContractBlock(spec: RewriteSpec): string {
  const lines: string[] = ["", "【這篇的格式合約 —— 最高優先，勝過你的個人風格】"];
  if (spec.label) lines.push(`- 這是「${spec.label}」的貼文文案，不是文章或部落格。`);
  const min = spec.minChars ?? 0;
  const max = spec.maxChars ?? 0;
  if (max > 0) {
    lines.push(`- 修改後文案 ${min > 0 ? `${min}–` : ""}${max} 字（不含空白）。風格可以換，長度不能超過。`);
    lines.push("- 原文如果比這個長，改寫時要一起濃縮到範圍內。");
  }
  lines.push("- 純文字：不要用 markdown（不要 ** 粗體、不要 # 標題、不要 ``` ）。");
  return lines.join("\n");
}

/** 太長時的第二次要求。 */
export function shortenRequest(text: string, spec: RewriteSpec): string {
  return `這版 ${countChars(text)} 字，超過上限 ${spec.maxChars} 字。請保留你的寫法與重點，把整篇濃縮到 ${spec.maxChars} 字以內，照原本的格式（${EXPLAIN_MARK} 1–2 句，再 ${COPY_MARK} 完整文案）回覆。`;
}

/**
 * 2026-10-08（CJ「我請他調整，他把內心話寫在貼文了」）：用戶只說「檢查用詞」，AI 在說明之後
 * 反問「你是想要我直接提出用詞修改清單，還是要我改寫整篇文案？」——舊的解析把空三行之後的
 * 那段一律當文案，這句就被存成貼文本文。
 *
 * 同一套四件套：
 *   1. 回覆用明確標記分段（不再靠空行猜）
 *   2. prompt 明講不反問、文案段只能放成品
 *   3. 驗證：文案段看起來是在跟用戶講話 → 重試一次
 *   4. 還是不行 → 不回文案（呼叫端不覆蓋本文），那段話只進對話框
 */
export const EXPLAIN_MARK = "【說明】";
export const COPY_MARK = "【文案】";

/** 接在 system prompt 裡的回覆格式。 */
export function replyFormatBlock(): string {
  return [
    "回覆格式（兩段都要有，標記照抄）：",
    `${EXPLAIN_MARK}`,
    // 用「我」當主詞：以「用戶希望…」開頭會被 llm.ts 的 CoT 偵測當成內心獨白整則退掉。
    "用一兩句直接告訴用戶你改了哪裡，用「我」當主詞（例：我把宣告的語氣改成邀請）。",
    `${COPY_MARK}`,
    "完整的修改後文案（不要省略，不要寫「如下」）。",
    "",
    `${COPY_MARK}之後只能放可以直接發布的成品——不能出現對用戶說的話、問題、選項、修改清單。`,
    "不要反問用戶。意見不夠具體時（例如「檢查用詞」「再順一點」），自己判斷後直接改完，改了什麼寫在說明裡。",
    `真的沒有需要改的地方，${COPY_MARK}就放原文，並在說明裡講為什麼不用改。`,
  ].join("\n");
}

const HR = /\n+[-—_*]{3,}\s*\n+/;

/** 把模型回覆拆成「說明」與「文案」。有標記用標記；沒有才退回舊的空三行／分隔線。 */
export function parseRewriteReply(raw: string): { explanation: string; rewritten: string } {
  const text = (raw ?? "").trim();
  let explanation = "";
  let rewritten = text;
  const at = text.indexOf(COPY_MARK);
  if (at >= 0) {
    explanation = text.slice(0, at);
    rewritten = text.slice(at + COPY_MARK.length);
  } else {
    let parts = text.split(/\n\n\n+/);
    // 2026-07-07（/run/2887 實測）：模型有時用 markdown 分隔線代替空行。
    if (parts.length === 1) parts = text.split(HR);
    if (parts.length > 1) {
      explanation = parts[0] ?? "";
      rewritten = parts.slice(1).join("\n\n");
    }
  }
  explanation = explanation.replace(EXPLAIN_MARK, "").replace(/^[\s:：]+/, "").trim();
  rewritten = rewritten
    .replace(/^[\s:：]+/, "")
    .replace(/^(?:[-—_*]{3,}\s*\n+)+/, "")
    .replace(/\n+(?:[-—_*]{3,}\s*)+$/, "")
    .trim();
  return { explanation, rewritten: stripMarkdown(rewritten) };
}

/** AI 對用戶講話時才會出現的句子（成品文案的「你」是讀者，不會問讀者要不要改稿）。 */
const TALKING_TO_USER = new RegExp([
  "你是?想要我", "還是要我", "要我(?:直接|幫你|改寫|重寫|調整|提出)", "需要我(?:直接|幫你|改寫|重寫|調整|提出)",
  "請(?:告訴|提供給?)我", "請問你", "我理解你的意見", "我重新檢查", "我可以(?:幫|為)你",
  "修改(?:清單|建議)(?:如下|：|:)", "以下是(?:修改|調整|我的)",
  "would you like me to", "do you want me to", "should i (?:rewrite|revise|list)", "let me know (?:if|which|how)",
].join("|"), "i");

/**
 * 文案段其實是在跟用戶講話（反問、說明、清單），不是能發出去的成品。
 * 兩個條件都要成立才算，避免誤傷正常文案：有對用戶講話的句子，而且明顯比原文短
 * （真的改寫不會只剩一兩句）。空的也算。
 */
export function looksLikeReplyToUser(rewritten: string, original: string): boolean {
  const t = (rewritten ?? "").trim();
  if (!t) return true;
  if (!TALKING_TO_USER.test(t)) return false;
  return countChars(t) < Math.max(60, countChars(original ?? "") * 0.5);
}

/** 文案段不是成品時的第二次要求。 */
export function copyOnlyRequest(): string {
  return `你在${COPY_MARK}放的是對我說的話，不是貼文。不要問我，照你的判斷直接改完，用同樣格式回覆：${EXPLAIN_MARK} 1–2 句，再 ${COPY_MARK} 可以直接發布的完整文案。`;
}
