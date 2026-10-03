/**
 * 跨邊界漂移測試：活動企劃的語彙在 client 與 server 各有一份，不能漂移。
 *
 * 2026-09-25：產生企劃在 server（campaignPlan.ts），畫面在 client
 * （lib/campaignSchema.ts）。server 不 import client 的檔案，所以兩邊各宣告一份
 * 活動類型與檔期階段的 id。漂移的後果不會在 tsc 或畫面上現形——會是 server 產出
 * 一個 client 認不得的 phase，時間軸上那一格變成無標題的空白卡。
 *
 * 測試放 server 側，因為這個 repo 的規矩是「client 不得 value-import server，
 * 跨邊界測試放 server 側」（見 project_merge_ci_gates）。
 */
import { describe, it, expect } from "vitest";
import { CAMPAIGN_TYPE_IDS, CAMPAIGN_PHASE_IDS } from "./campaignPlan";
import { CAMPAIGN_TYPES, CAMPAIGN_PHASES } from "../../../../client/src/v2/strategy/lib/campaignSchema";

describe("活動企劃語彙 client ↔ server", () => {
  it("活動類型的 id 兩邊完全一致（順序也一樣，畫面與 prompt 才對得起來）", () => {
    expect(CAMPAIGN_TYPES.map((t) => t.id)).toEqual([...CAMPAIGN_TYPE_IDS]);
  });

  it("檔期階段的 id 兩邊完全一致", () => {
    expect(CAMPAIGN_PHASES.map((p) => p.id)).toEqual([...CAMPAIGN_PHASE_IDS]);
  });

  it("每個階段在 client 都有中文標題與「這一段在幹嘛」的說明", () => {
    for (const p of CAMPAIGN_PHASES) {
      expect(p.zh, p.id).toBeTruthy();
      expect(p.purposeZh.length, p.id).toBeGreaterThan(8);
    }
  });

  it("每個活動類型都有機制欄位的提示 —— 那一格空著使用者就不知道要寫多細", () => {
    for (const t of CAMPAIGN_TYPES) {
      expect(t.mechanicHintZh.length, t.id).toBeGreaterThan(10);
      expect(t.defaultChannels.length, t.id).toBeGreaterThan(0);
    }
  });
});
