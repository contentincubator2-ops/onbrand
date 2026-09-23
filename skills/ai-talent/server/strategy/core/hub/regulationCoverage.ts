/**
 * regulationCoverage — 法規更新到底接上了沒有。
 *
 * 2026-09-23 (CJ「接下去往下一頁，是 regulation update，請同樣使用任務卡的呈現方式」)。
 *
 * ── 這一頁最容易變成漂亮的謊 ─────────────────────────────────────────
 * 每一條法規上面掛著一個狀態：「已套用至政策包」。那個狀態是**手動維護的欄位**
 * ——資料庫裡的一個字串，沒有任何東西驗證政策包真的跟著改了。一個看起來很有
 * 說服力的綠色標籤，背後可以什麼都沒有。
 *
 * 完全驗證是做不到的（「這條法規的意思有沒有被正確翻譯成規則」是人的判斷）。
 * 但有一半是驗得動的，而且正是最容易出錯的那一半：**每條法規都指名它影響哪幾
 * 項檢查（disclosure / price / claims …）。那些檢查在該市場的政策包裡存在嗎？**
 *
 * 不存在就代表這個對應是空的——法規卡上寫著「影響：核准價格」，而政策包裡根本
 * 沒有這項檢查。這種錯誤在改名或重構檢查 id 的時候一定會發生，而且不會有人發現，
 * 因為兩邊是靠字串對上的。
 *
 * 另外算兩個日期差，因為這一頁真正的風險只有一種形狀：**已經生效了，但還沒套用。**
 * 那個狀態不會自己浮出來，得算。
 */

export interface RegulationCoverage {
  id: number;
  /** 指名的檢查裡，政策包真的有的。 */
  known: string[];
  /** 指名了、但政策包裡沒有 —— 這個對應是空的。 */
  unknown: string[];
  /** 已生效但狀態還不是 applied，算幾天了。null＝不適用。 */
  overdueDays: number | null;
  /** 還沒生效，還有幾天。null＝不適用（已生效，或沒有生效日）。 */
  daysUntil: number | null;
}

interface RegLike {
  id: number;
  market: string;
  rules: string[];
  status: string;
  effectiveOn: string | null;
}

/** YYYY-MM-DD 直接比字串、算天數也只用 UTC —— 跟緘默期同一條紀律，不碰本地時區。 */
function dayDiff(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function coverRegulations(
  regs: RegLike[],
  packRuleIds: Record<string, string[]>,
  today: string,
): Record<number, RegulationCoverage> {
  const out: Record<number, RegulationCoverage> = {};
  for (const r of regs) {
    const known: string[] = [];
    const unknown: string[] = [];
    const ids = new Set(packRuleIds[r.market] ?? []);
    for (const rule of r.rules ?? []) (ids.has(rule) ? known : unknown).push(rule);

    let overdueDays: number | null = null;
    let daysUntil: number | null = null;
    if (r.effectiveOn) {
      const delta = dayDiff(r.effectiveOn, today);
      if (delta != null) {
        // 已生效（delta >= 0）而狀態不是 applied → 這才是這一頁要喊出來的事。
        if (delta >= 0 && r.status !== "applied") overdueDays = delta;
        if (delta < 0) daysUntil = -delta;
      }
    }
    out[r.id] = { id: r.id, known, unknown, overdueDays, daysUntil };
  }
  return out;
}

/** 整頁一句話：有沒有「已生效但還沒套用」的。沒有的話也要說出來。 */
export function overdueCount(coverage: Record<number, RegulationCoverage>): number {
  return Object.values(coverage).filter((c) => c.overdueDays != null).length;
}

/** 對應到不存在的檢查的那幾條。這是設定錯誤，不是風險排序問題。 */
export function brokenMappings(coverage: Record<number, RegulationCoverage>): RegulationCoverage[] {
  return Object.values(coverage).filter((c) => c.unknown.length > 0);
}
