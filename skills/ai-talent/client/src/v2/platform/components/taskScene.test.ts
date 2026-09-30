import { describe, expect, it } from "vitest";
import { pickTaskScene } from "./taskScene";

describe("pickTaskScene", () => {
  it("題材優先於形式：母語好康的 Reels 畫語言，不畫場記板", () => {
    expect(pickTaskScene({
      label_zh: "IG Reels：用對方的母語笨拙地講一個好康",
      label_en: "Reel: Clumsy but Sincere in Their Language",
      primary_question: "你想對哪一群說不同語言的人，講哪一個具體好康？",
    })).toBe("language");
    expect(pickTaskScene({ label_zh: "FB Reels：把負評演出來" })).toBe("apology");
    expect(pickTaskScene({ label_zh: "IG 直播：觀眾投票淘汰賽" })).toBe("poll");
  });

  it("題材沒命中時看形式", () => {
    expect(pickTaskScene({ label_zh: "IG 直播 30 分鐘流程腳本" })).toBe("live");
    expect(pickTaskScene({ label_zh: "FB 5 卡輪播" })).toBe("carousel");
    expect(pickTaskScene({ label_zh: "FB 留言回覆（一般）" })).toBe("chat");
    expect(pickTaskScene({ label_zh: "歡迎信（新訂閱者）" })).toBe("mail");
  });

  it("限時動態不是倒數；description 不是 script", () => {
    expect(pickTaskScene({ label_zh: "FB 限時動態文案" })).toBe("story");
    expect(pickTaskScene({ label_zh: "FB 廣告說明 5 種", label_en: "FB Ad Descriptions x5" })).not.toBe("video");
  });

  it("什麼都沒命中就用預設便條", () => {
    expect(pickTaskScene({ label_zh: "品牌命名候選 10 個" })).toBe("brief");
    expect(pickTaskScene({})).toBe("brief");
  });
});
