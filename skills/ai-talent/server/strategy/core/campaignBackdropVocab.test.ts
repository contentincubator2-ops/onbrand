/**
 * 活動頁底圖模板：前端的模板清單（名稱、產業對應）跟產圖腳本的畫面描述是兩份，
 * 這裡比對兩邊的 id 不會漂移——前端列了一組卻沒有人會去畫它，或腳本畫了一組
 * 前端選不到。跨邊界測試放 server 側（見 campaignPlanVocab.test.ts）。
 */
import { describe, it, expect } from "vitest";
import { BACKDROP_SCENES, BACKDROP_STYLE } from "../../../scripts/gen-campaign-backdrops";
import { BACKDROP_THEMES, DEFAULT_BACKDROP } from "../../../client/src/v2/strategy/lib/campaignBackdrops";

describe("活動頁底圖模板", () => {
  it("有圖的模板＝腳本會畫的那幾組（傳播圈不用圖）", () => {
    const client = BACKDROP_THEMES.map((t) => t.id).filter((id) => id !== DEFAULT_BACKDROP).sort();
    expect(Object.keys(BACKDROP_SCENES).sort()).toEqual(client);
  });

  it("每組都有左右兩張的描述，而且畫風要求不放字", () => {
    for (const [id, s] of Object.entries(BACKDROP_SCENES)) {
      expect(s.left.length, `${id}-left`).toBeGreaterThan(30);
      expect(s.right.length, `${id}-right`).toBeGreaterThan(30);
    }
    expect(BACKDROP_STYLE).toMatch(/no text/i);
  });
});
