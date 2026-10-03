/**
 * KPI 指標與可下廣告通路：前端與後端各宣告一份，這裡比對兩邊不會漂移。
 * 跨邊界測試放 server 側（見 campaignPlanVocab.test.ts）。
 */
import { describe, it, expect } from "vitest";
import { KPI_METRICS, PAID_CHANNELS } from "./campaignKpi";
import { KPI_METRICS as CLIENT_METRICS, PAID_CHANNELS as CLIENT_PAID, KPI_METRIC_LABEL, money, metricLine } from "../../../../client/src/v2/strategy/lib/campaign/campaignKpi";

describe("KPI 語彙", () => {
  it("指標與可下廣告通路兩邊一致，每個指標都有中英文名", () => {
    expect([...CLIENT_METRICS]).toEqual([...KPI_METRICS]);
    expect([...CLIENT_PAID]).toEqual([...PAID_CHANNELS]);
    for (const m of KPI_METRICS) expect(KPI_METRIC_LABEL[m].zh.length).toBeGreaterThan(1);
  });

  it("金額與指標的顯示", () => {
    expect(money(150000, false)).toBe("NT$15 萬");
    expect(money(12500, false)).toBe("NT$1.3 萬");
    expect(money(8000, false)).toBe("NT$8,000");
    expect(money(null, false)).toBe("—");
    expect(metricLine({ metric: "leads", target: 120 }, false)).toBe("名單／申請 120");
    expect(metricLine({ metric: "reach", target: null }, false)).toBe("觸及人數");
  });
});
