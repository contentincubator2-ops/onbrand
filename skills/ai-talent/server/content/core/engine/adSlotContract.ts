/**
 * adSlotContract — FB 廣告「單一欄位」任務卡的產出合約（標題／說明／CTA）。
 *
 * 2026-09-25（CJ「剛剛生出來的文案，顯示得很奇怪」）：那一則的 mockup 幾乎全是
 * 灰色骨架，真正的產出被擠在最底下一個小框裡，按鈕則退回泛用的「選購」。
 *
 * 畫面沒有壞——壞的是**內容的形狀**。`fb-30-ad-cta` 承諾的是
 *   第一行＝CTA 按鈕文字（6–12 字）
 *   第二行＝「適合：<一句情境>」
 * 模型回來的卻是一整段促銷文。於是：
 *   · mockup 的按鈕只接受 ≤12 字的第一行 → 落回「選購」
 *   · 整段長文只好塞進按鈕下方那個 note 框 → 看起來像產出被丟在角落
 *
 * ── 為什麼需要一支合約 ────────────────────────────────────────────────
 * 這三張卡（headline / description / cta）都在 systemPrompt 裡寫了硬性字數，
 * 但**沒有任何東西在驗證**——跟 adCopyContract 管的整包廣告文案不同，那一套只認
 * [headline]/[primary]/[CTA] 標記，這幾張單欄位卡沒有標記，所以整個掉在守備範圍外。
 *
 * 做法沿用站上已經驗證過的四件套（adCopyContract / shotListContract /
 * wuganVoiceContract）：**合約接在 prompt 最後 → 驗證 → 具名重試一次 → 確定性修補**。
 * 修補不是為了漂亮，是為了「最後一次嘗試也不能交出一個版面放不進去的東西」。
 */
import type { FBTaskTemplate } from "../catalog/quickTaskFB";

export type AdSlot = "headline" | "description" | "cta";

export interface SlotSpec {
  /** 這一格最多幾個字（中文字數，emoji 與空白不算）。 */
  maxChars: number;
  /** 幾行才合法。cta 是兩行（按鈕＋適合情境），其餘單行。 */
  lines: 1 | 2;
  zh: string;
}

export const SLOT_SPECS: Record<AdSlot, SlotSpec> = {
  headline:    { maxChars: 25, lines: 1, zh: "廣告標題" },
  description: { maxChars: 30, lines: 1, zh: "廣告說明" },
  // 12 是 mockup 按鈕真的放得下的上限（FBAd 的 ctaFirstLine.length <= 12）。
  // 合約與版面用同一個數字，不然「合約過了、版面還是爆」。
  cta:         { maxChars: 12, lines: 2, zh: "廣告行動呼籲" },
};

/** 這張卡是不是單欄位廣告卡；是的話回它填的是哪一格。 */
export function adSlotOf(taskId: string | null | undefined): AdSlot | null {
  const id = String(taskId ?? "");
  if (/ad-headline/.test(id)) return "headline";
  if (/ad-description|link-desc/.test(id)) return "description";
  if (/ad-cta/.test(id)) return "cta";
  return null;
}

/** 字數只算「看得見的字」：emoji、空白、標點前後的空格不該吃掉額度。 */
export function visibleLength(s: string): number {
  return Array.from(
    s.replace(/\s+/gu, "")
     .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ""),
  ).length;
}

export interface SlotIssue { reason: "too_long" | "too_many_lines" | "missing_context_line" | "empty"; detail: string }

/** 合約本文——接在 systemPrompt 最後面，用模型看得懂的話再講一次。 */
export function buildAdSlotRule(slot: AdSlot): string {
  const spec = SLOT_SPECS[slot];
  if (slot === "cta") {
    return `

【輸出合約｜必須遵守】
- 第一行：CTA 按鈕文字，**最多 ${spec.maxChars} 個字**（這是 Facebook 按鈕真的放得下的長度，超過就會被截斷）。
- 第二行：以「適合：」開頭的一句搭配情境。
- 總共就這兩行。不要寫成一段廣告文案、不要加開場白、不要編號、不要引號。
- 這張卡只產出按鈕文字，**不要**寫主文案、不要寫價格細節——那是別張卡的工作。`;
  }
  return `

【輸出合約｜必須遵守】
- 只輸出一行${spec.zh}，**最多 ${spec.maxChars} 個字**。
- 不要加開場白、不要編號、不要引號、不要解釋。`;
}

export function validateAdSlot(text: string, slot: AdSlot): SlotIssue | null {
  const spec = SLOT_SPECS[slot];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { reason: "empty", detail: "沒有產出任何文字" };

  const first = lines[0]!;
  const len = visibleLength(first);
  if (len > spec.maxChars) {
    return { reason: "too_long", detail: `${spec.zh}「${first.slice(0, 20)}…」有 ${len} 字，上限 ${spec.maxChars} 字` };
  }
  if (spec.lines === 1 && lines.length > 1) {
    return { reason: "too_many_lines", detail: `${spec.zh}只能一行，收到 ${lines.length} 行` };
  }
  if (spec.lines === 2) {
    if (lines.length > 2) return { reason: "too_many_lines", detail: `只能兩行（按鈕文字＋適合情境），收到 ${lines.length} 行` };
    if (lines.length < 2 || !/^適合[：:]/.test(lines[1]!)) {
      return { reason: "missing_context_line", detail: "第二行必須以「適合：」開頭說明搭配情境" };
    }
  }
  return null;
}

/**
 * 確定性修補：最後一次嘗試也不能交出版面放不進去的東西。
 *
 * 刻意**不重寫語意**，只做切割與搬移：
 *   · 太長 → 從第一個句讀切一段當按鈕文字，剩下的搬去情境行（不丟掉使用者看得到的字）
 *   · 一整段 → 第一句當按鈕文字，其餘整段搬去情境行
 * 切出來仍然超長才硬截——截斷是最後手段，而且截在字元邊界上。
 */
export function repairAdSlot(text: string, slot: AdSlot): string {
  const spec = SLOT_SPECS[slot];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return text.trim();

  // 先把整段拆成句子，第一個夠短的句子就是按鈕／標題本身。
  const firstLine = lines[0]!;
  const pieces = firstLine.split(/(?<=[。！？!?，,、；;：:])/u).map((p) => p.trim()).filter(Boolean);
  let head = pieces[0] ?? firstLine;
  head = head.replace(/[，,、；;：:。！？!?]+$/u, "").trim();
  if (visibleLength(head) > spec.maxChars) {
    head = Array.from(head).slice(0, spec.maxChars).join("").trim();
  }

  const rest = [
    pieces.slice(1).join(""),
    ...lines.slice(1),
  ].map((x) => x.trim()).filter(Boolean).join(" ");

  if (spec.lines === 1) return head;

  const existing = lines.find((l) => /^適合[：:]/.test(l));
  const context = existing
    ? existing
    : `適合：${(rest || firstLine).replace(/^適合[：:]/, "").trim().slice(0, 60)}`;
  return `${head}\n${context}`;
}
