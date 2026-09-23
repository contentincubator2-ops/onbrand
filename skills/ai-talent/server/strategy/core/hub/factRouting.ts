/**
 * factRouting — 一則市場消息該送到哪幾位業務手上。
 *
 * 2026-09-23 (CJ「等於是，對業務的客戶有幫助的資訊…例如補助案等等，可以主動
 * 推播給業務，所以每個市場消息，應該要匹配到公司的客戶行業標籤，這樣才能推播
 * 給對應的業務，讓業務轉給客戶」)。
 *
 * ── 這改變了市場數據這一頁的性質 ─────────────────────────────────────
 * 它原本是「業務可以說出口的數字白名單」——被動的、給合規引擎讀的。
 * 現在多了一個方向：**哪些消息值得主動送到業務手上，讓他轉給客戶。**
 *
 * 兩種用途對同一筆資料的要求不一樣，所以這支把它們分開算：
 *
 *   可引用（quotable）  = 有查證、有數字 → 合規引擎的白名單
 *   可轉發（forwardable）= 對客戶有用、還沒過期 → 推播清單
 *
 * 一筆資料可以同時是兩者，也可以只是其中一個。台灣中小企業家數那種統計是
 * 好的引用素材但不值得推播（它不會變）；補助截止日是好的推播素材但沒有業務
 * 會在貼文裡引用它的百分比。硬把兩者當成同一件事，就會兩邊都做不好。
 */
import { ALL_INDUSTRIES, isLive, daysLeft, reaches, unknownIndustries } from "./industries";

interface FactLike {
  id: number;
  kind: string;
  market: string;
  industries: string[];
  expiresOn: string | null;
  confidence: string;
  figures?: { percents?: Array<{ value: number }>; amounts?: number[] };
}

interface RepLike {
  id: number;
  name: string;
  market: string;
  industries: string[];
}

export interface FactRouting {
  id: number;
  /** 這則消息會送到的業務 id。 */
  repIds: number[];
  /** 還剩幾天可以用。null = 沒有期限。 */
  daysLeft: number | null;
  /** 今天還在有效期內嗎。 */
  live: boolean;
  /**
   * 值得主動推給業務轉客戶嗎。
   *
   * 三個條件，缺一不可：**沒過期**（過期的補助推出去，是業務要對客戶吞的難堪）、
   * **有人收得到**、以及**不是只給總部的內容**。競品比較與待查證的消息刻意
   * 排除——它們是總部的判斷材料，不是可以往外轉的東西。
   */
  forwardable: boolean;
  /** 不在字彙表裡的產業標籤。資料錯字的唯一出口。 */
  unknownIndustries: string[];
}

/** 只給總部看、不該往客戶方向送的類別。 */
const HQ_ONLY_KINDS = new Set(["competitor"]);

export function routeFacts(
  facts: FactLike[],
  reps: RepLike[],
  today: string,
): Record<number, FactRouting> {
  const out: Record<number, FactRouting> = {};
  for (const f of facts) {
    // 市場先分：台灣的補助不該出現在美國業務的手機上。
    const audience = reps.filter((r) => r.market === f.market && reaches(f.industries, r.industries));
    const live = isLive(f.expiresOn, today);
    out[f.id] = {
      id: f.id,
      repIds: audience.map((r) => r.id),
      daysLeft: daysLeft(f.expiresOn, today),
      live,
      forwardable:
        live &&
        audience.length > 0 &&
        !HQ_ONLY_KINDS.has(f.kind) &&
        f.confidence !== "needs_verification",
      unknownIndustries: unknownIndustries(f.industries ?? []),
    };
  }
  return out;
}

/**
 * 每位業務今天會收到幾則。
 *
 * 這是這一頁對總部最有用的一個數字：不是「我們有幾則消息」，是**「每個人會
 * 收到幾則」**。有人收到二十則、有人收到零則，那是標籤出了問題，而總筆數
 * 完全看不出這件事。
 */
export function perRepCounts(
  routing: Record<number, FactRouting>,
  reps: RepLike[],
): Array<{ id: number; name: string; market: string; count: number }> {
  const counts = new Map<number, number>();
  for (const r of reps) counts.set(r.id, 0);
  for (const info of Object.values(routing)) {
    if (!info.forwardable) continue;
    for (const id of info.repIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return reps.map((r) => ({ id: r.id, name: r.name, market: r.market, count: counts.get(r.id) ?? 0 }));
}

/** 一個人都送不到的消息。標錯產業、或那個市場沒有對應的業務。 */
export function unreachable(
  facts: FactLike[],
  routing: Record<number, FactRouting>,
): FactLike[] {
  return facts.filter(
    (f) => !HQ_ONLY_KINDS.has(f.kind) && f.confidence !== "needs_verification" &&
      isLiveInRouting(routing[f.id]) && (routing[f.id]?.repIds.length ?? 0) === 0,
  );
}

function isLiveInRouting(r: FactRouting | undefined): boolean {
  return r ? r.live : false;
}

/** 這則消息是不是「可以被貼文引用的數字」。跟可不可以轉發是兩回事。 */
export function isQuotable(f: FactLike): boolean {
  const hasFigures = Boolean(f.figures?.percents?.length || f.figures?.amounts?.length);
  return f.confidence !== "needs_verification" && hasFigures;
}

export { ALL_INDUSTRIES };
