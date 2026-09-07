import { describe, it, expect } from "vitest";
import { buildTaskCatalogIndex, recentCatalogCards } from "./taskCatalogIndex";
import { TASK_CARD_DATES } from "./taskCardDates";

/**
 * 上架日是從 git 歷史產的（scripts/gen-task-card-dates.ts）。這支測試擋兩件事：
 * 1. 新卡進目錄但沒重跑產生器 —— 卡片會顯示「上架日期不明」，節奏就斷了。
 * 2. 日期格式壞掉或在未來 —— 那代表產生器或時鐘有問題，不是卡有問題。
 */
describe("taskCardDates", () => {
  const ISO_DAY = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
  const today = new Date().toISOString().slice(0, 10);

  it("目錄裡每一張卡都查得到上架日（漏了就去跑 npm run cards:dates）", () => {
    const missing = buildTaskCatalogIndex().filter((t) => !t.addedAt).map((t) => t.id);
    expect(missing, `缺上架日：${missing.join(", ")}`).toEqual([]);
  });

  it("日期是 YYYY-MM-DD，而且不在未來", () => {
    for (const [id, d] of Object.entries(TASK_CARD_DATES)) {
      expect(d, id).toMatch(ISO_DAY);
      expect(d <= today, `${id} 的上架日在未來：${d}`).toBe(true);
    }
  });

  it("recentCatalogCards 只回區間內的卡，並且新到舊", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    const recent = recentCatalogCards(30, now);
    expect(recent.length).toBeGreaterThan(0);
    for (const t of recent) expect(t.addedAt! >= "2026-08-09").toBe(true);
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1]!.addedAt! >= recent[i]!.addedAt!).toBe(true);
    }
    // 「現在」在所有卡之前 → 沒有一張算最近（區間是 [now-days, now]，不是「now 以後全算」）
    expect(recentCatalogCards(30, new Date("2000-01-01T00:00:00Z"))).toEqual([]);
  });
});
