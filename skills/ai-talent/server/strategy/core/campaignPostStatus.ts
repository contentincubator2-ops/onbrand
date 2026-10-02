/**
 * campaignPostStatus — 活動企劃上「一篇」走到哪一關。
 *
 * 2026-10-02（CJ 看著活動地圖上的文章「想要真實產出…最後可以按草稿、還是修改中、
 * 還是送審中、或是已發布？」→ 定案：狀態由系統走，不是四顆按鈕；團隊版才有送審）。
 *
 *   未產出 → 草稿 →（團隊版）待審核 ⇄ 退回修改 → 已核准 → 已發布
 *
 * 「修改中」不是一個狀態：有人正在改是協作資訊，不是內容走到哪一關。
 *
 * 狀態不另存一份：草稿／核准／發布讀 mission_outputs.status，送審讀
 * mission_review_queue 最新那一筆。兩邊各自已經是權威來源，再抄一份到企劃
 * 只會多一個會不同步的地方。純函式，有測試。
 */

export type CampaignPostState = "draft" | "in_review" | "revision" | "approved" | "published";

/**
 * outputStatus：mission_outputs.status。reviewStatus：mission_review_queue 最新一筆的
 * status（沒送過審＝null）。
 *
 * 發布最大：發出去就是發出去了，審核紀錄是什麼都不改變這件事。
 * 其次看審核佇列——它比 output.status 新（舊資料送審時沒有同步 output.status）。
 */
export function campaignPostState(outputStatus: string | null | undefined, reviewStatus: string | null | undefined): CampaignPostState {
  if (outputStatus === "published") return "published";
  if (reviewStatus === "pending" || reviewStatus === "in_review") return "in_review";
  if (reviewStatus === "revision_requested") return outputStatus === "approved" || outputStatus === "scheduled" ? "approved" : "revision";
  if (reviewStatus === "approved") return "approved";
  if (outputStatus === "approved" || outputStatus === "scheduled") return "approved";
  if (outputStatus === "pending_review") return "in_review";
  return "draft";
}

/** 可以標成已發布的狀態：核准過才能發（團隊版的審核才有意義）。 */
export function canMarkPublished(state: CampaignPostState): boolean {
  return state === "approved" || state === "published";
}

const clean = (s: unknown) => (typeof s === "string" ? s : "")
  .replace(/\\r\\n|\\n|\\r/g, "\n").replace(/<[^>]+>/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/**
 * 一篇產出的本文（第一個版本）。mission_outputs.content 有三種長相：
 * 版本陣列、策略包（publicVariants）、或純文字。讀不到回空字串。
 */
export function firstCaption(content: unknown): string {
  if (content == null) return "";
  let v: any = content;
  if (typeof content === "string") {
    try { v = JSON.parse(content); } catch { return clean(content); }
  }
  const pick = (arr: any): string => {
    if (!Array.isArray(arr)) return "";
    for (const x of arr) {
      const c = clean(x?.caption);
      if (c) return c;
      if (Array.isArray(x?.cards)) {
        const cards = x.cards.map((k: any) => [clean(k?.headline), clean(k?.body)].filter(Boolean).join("\n")).filter(Boolean);
        if (cards.length) return cards.join("\n\n");
      }
    }
    return "";
  };
  if (Array.isArray(v)) return pick(v);
  if (v && typeof v === "object") return pick(v.publicVariants) || pick(v.variants) || clean(v.caption);
  return typeof v === "string" ? clean(v) : "";
}
