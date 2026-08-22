import { describe, it, expect } from "vitest";
import { parseRunOfShow } from "./runOfShow";

const WELL_FORMED = `【時間】00:00-03:00
【流程階段】黃金開場
【畫面／動作指示】
・對著鏡頭揮手，確認收音與燈光都正常
・把留言區點開放在畫面右側
【主播口白】
「大家好，聽得到聲音嗎？今天要來開箱這罐新的洗面乳。剛進來的朋友幫我按個愛心，等一下有直播限定的福利。」`;

describe("parseRunOfShow", () => {
  it("pulls the four bracket fields out of a well-formed segment", () => {
    const r = parseRunOfShow(WELL_FORMED, "00:00-03:00 黃金開場");
    expect(r.time).toBe("00:00-03:00");
    expect(r.stage).toBe("黃金開場");
    expect(r.cues).toContain("確認收音與燈光");
    expect(r.cues).not.toContain("【");
    expect(r.script).toContain("聽得到聲音嗎");
    // the host script must not swallow the cue lines
    expect(r.script).not.toContain("留言區點開");
  });

  it("falls back to the variant label when the model drops the headings", () => {
    const r = parseRunOfShow("倒數最後 5 個名額，要的趕快截圖私訊小編。", "23:00-28:00 限時催單");
    expect(r.time).toBe("23:00-28:00");
    expect(r.stage).toBe("限時催單");
    expect(r.cues).toBe("");
    expect(r.script).toBe("倒數最後 5 個名額，要的趕快截圖私訊小編。");
  });

  it("tolerates a half-width slash in the cues heading", () => {
    const r = parseRunOfShow("【畫面/動作指示】・展示商品背面成分表", "10:00-18:00 深度互動");
    expect(r.cues).toBe("・展示商品背面成分表");
    // cues found → the raw caption is not duplicated into the script column
    expect(r.script).toBe("");
  });

  it("keeps a multi-word stage name from the label", () => {
    const r = parseRunOfShow("", "18:00-23:00 高潮／優惠公布");
    expect(r.time).toBe("18:00-23:00");
    expect(r.stage).toBe("高潮／優惠公布");
  });
});
