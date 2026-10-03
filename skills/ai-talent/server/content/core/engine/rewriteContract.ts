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
  return `這版 ${countChars(text)} 字，超過上限 ${spec.maxChars} 字。請保留你的寫法與重點，把整篇濃縮到 ${spec.maxChars} 字以內，照原本的格式（先 1–2 句說明，空三行，再給完整文案）回覆。`;
}
