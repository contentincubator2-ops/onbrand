/**
 * editLogSelection — 「紀錄」分頁勾選要留哪幾筆（2026-10-09）。純函式。
 *
 * CJ「紀錄，可以選擇要哪幾個紀錄嗎？例如調整一陣子後，我想要開頭短一點，但不要反差開場了」。
 *
 * 做法：不是把某一筆「倒退」（後面的修改疊在它上面，倒不回去），而是回到原稿，
 * 只把勾選的那幾筆重新套一次 ——
 *   · 換個寫法：留最後勾選的那一張任務卡
 *   · 換口氣：留最後勾選的那一位
 *   · 請他改／照留言改：勾選的每一句都照順序重套
 * 重新整理本身也留一筆（kind＝rebuild，ref 記下留了哪幾筆），之後打開紀錄才知道哪幾筆還算數。
 * 「還原」的紀錄不能勾：它不是一條意見，沒有東西可以重套。
 */
export type EditKind = "chat" | "restyle" | "voice" | "comment" | "restore" | "rebuild";

export interface LogRowLite {
  id: number;
  kind: EditKind;
  ask: string | null;
  ref: string | null;
}

const SELECTABLE: ReadonlySet<EditKind> = new Set(["chat", "comment", "restyle", "voice"]);

export function isSelectable(row: Pick<LogRowLite, "kind">): boolean {
  return SELECTABLE.has(row.kind);
}

function keptOf(ref: string | null): number[] | null {
  if (!ref) return null;
  try {
    const kept = JSON.parse(ref)?.kept;
    return Array.isArray(kept) ? kept.map(Number).filter(Number.isFinite) : null;
  } catch {
    return null;
  }
}

export function rebuildRef(keptIds: number[]): string {
  return JSON.stringify({ kept: keptIds });
}

/**
 * 目前還算數的是哪幾筆（rows：新→舊，跟畫面同一個順序）。
 * 最近一次重新整理之後的每一筆都算；之前的只算那次重新整理留下來的。
 */
export function effectiveIds(rows: LogRowLite[]): number[] {
  const idx = rows.findIndex((r) => r.kind === "rebuild" && keptOf(r.ref) !== null);
  if (idx < 0) return rows.filter(isSelectable).map((r) => r.id);
  const kept = new Set(keptOf(rows[idx]!.ref)!);
  return rows
    .filter((r, i) => isSelectable(r) && (i < idx || kept.has(r.id)))
    .map((r) => r.id);
}

export interface RebuildPlan {
  /** 要重套的任務卡（最後勾選的那一張）；null＝維持原本那張卡的結構。 */
  restyleTaskId: string | null;
  restyleName: string | null;
  /** 要用哪一位的口氣（最後勾選的那一位的 key）；null＝主筆。 */
  voiceKey: string | null;
  /** 要照順序重套的意見（舊→新）。 */
  asks: string[];
  keptIds: number[];
}

/** rows：新→舊；keepIds：用戶勾選要留的。 */
export function buildRebuildPlan(rows: LogRowLite[], keepIds: Iterable<number>): RebuildPlan {
  const keep = new Set(keepIds);
  const kept = rows.filter((r) => isSelectable(r) && keep.has(r.id)).reverse(); // 舊→新
  const lastOf = (kind: EditKind) => [...kept].reverse().find((r) => r.kind === kind) ?? null;
  const restyle = lastOf("restyle");
  const voice = lastOf("voice");
  return {
    restyleTaskId: restyle?.ref ?? null,
    restyleName: restyle?.ask ?? null,
    voiceKey: voice?.ref ?? null,
    asks: kept.filter((r) => r.kind === "chat" || r.kind === "comment").map((r) => (r.ask ?? "").trim()).filter(Boolean),
    // 同一類只留最後一張／最後一位，前面勾的那幾張其實沒有被套用，不能記成「留下」。
    keptIds: kept.filter((r) => (r.kind !== "restyle" || r === restyle) && (r.kind !== "voice" || r === voice)).map((r) => r.id),
  };
}

/** 送給模型的那一句：把留下的意見編號列出來。上限跟 refineCaption 的 userFeedback 一樣。 */
export function rebuildRequest(plan: Pick<RebuildPlan, "asks" | "restyleName">, en: boolean, maxChars = 1000): string {
  const head = plan.restyleName
    ? (en ? `Rewrite this post to follow the "${plan.restyleName}" task card.` : `請照「${plan.restyleName}」這張任務卡的寫法，把這篇重寫一次。`)
    : "";
  if (!plan.asks.length) return (head || (en ? "Rewrite this in your own style." : "請用你的寫法重寫這篇。")).slice(0, maxChars);
  const intro = en ? "Apply every one of these edits:" : "請把下面每一條修改意見都做到：";
  const list = plan.asks.map((a, i) => `${i + 1}. ${a.replace(/\s+/g, " ")}`).join("\n");
  return [head, intro, list].filter(Boolean).join("\n").slice(0, maxChars);
}

export function sameIds(a: Iterable<number>, b: Iterable<number>): boolean {
  const x = new Set(a), y = new Set(b);
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}
