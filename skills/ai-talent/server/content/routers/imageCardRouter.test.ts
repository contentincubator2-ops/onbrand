import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("imageCardRouter", () => {
  it("builds and exposes list / propose / render / saveAsPost / tray / setTray", async () => {
    const { imageCardRouter } = await import("./imageCardRouter");
    const procs = Object.keys((imageCardRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["brandColours", "fitPhoto", "list", "planSeries", "propose", "render", "saveAsPost", "setTray", "solidBackground", "tray", "uploadTitled"]);
  }, 60_000);

  it("publicSpec tells the client when Nano Banana cannot hit the ratio", async () => {
    const { publicSpec } = await import("./imageCardRouter");
    const { getImageSpec } = await import("../../platform/core/media/platformImageSpecs");
    expect(publicSpec(getImageSpec("web-img-og")!).nanoBanana).toBe(false);
    expect(publicSpec(getImageSpec("ig-img-feed-45")!).nanoBanana).toBe(false);
    expect(publicSpec(getImageSpec("line-img-richmsg")!).nanoBanana).toBe(true);
    expect(publicSpec(getImageSpec("ig-img-feed-45")!).ratio).toBe("4:5");
  }, 60_000);
});
