import { describe, expect, it } from "vitest";
import { gatewayMessage, isGatewayError, retryOnGateway } from "./gatewayRetry";

const gw = (message: string, httpStatus?: number) => Object.assign(new Error(message), httpStatus ? { data: { httpStatus } } : {});
const app = (message: string) => Object.assign(new Error(message), { data: { code: "BAD_REQUEST", httpStatus: 400 } });

describe("isGatewayError", () => {
  it("502／503／504、連不上、回來的是 nginx 的 HTML 都算", () => {
    expect(isGatewayError(gw("x", 502))).toBe(true);
    expect(isGatewayError(gw("Unexpected token '<', \"<html>\r\n<h\"... is not valid JSON"))).toBe(true);
    expect(isGatewayError(gw("502 Bad Gateway"))).toBe(true);
    expect(isGatewayError(gw("Failed to fetch"))).toBe(true);
    expect(isGatewayError(gw("Gateway Timeout", 504))).toBe(true);
  });
  it("伺服器自己回的錯不算——就算訊息裡剛好有數字", () => {
    expect(isGatewayError(app("還沒有企劃，先排出企劃再草擬提案"))).toBe(false);
    expect(isGatewayError(app("額度剩 502 點"))).toBe(false);
    expect(isGatewayError(new Error("這一次沒有寫成"))).toBe(false);
    expect(isGatewayError(null)).toBe(false);
  });
});

describe("retryOnGateway", () => {
  const noSleep = async () => {};
  it("閘道錯誤等一下重送，成功就回結果", async () => {
    let n = 0; const waits: number[] = [];
    const r = await retryOnGateway(async () => { if (++n < 3) throw gw("x", 502); return "ok"; }, { sleep: noSleep, onWait: (a) => waits.push(a) });
    expect(r).toBe("ok");
    expect(n).toBe(3);
    expect(waits).toEqual([1, 2]);
  });
  it("伺服器自己回的錯不重送", async () => {
    let n = 0;
    await expect(retryOnGateway(async () => { n++; throw app("資料不對"); }, { sleep: noSleep })).rejects.toThrow("資料不對");
    expect(n).toBe(1);
  });
  it("重送完還是不行，丟最後一個錯", async () => {
    let n = 0;
    await expect(retryOnGateway(async () => { n++; throw gw("x", 502); }, { sleep: noSleep, delays: [1, 1] })).rejects.toThrow();
    expect(n).toBe(3);
  });
});

describe("gatewayMessage", () => {
  it("閘道錯誤不露出 502，講內容還在", () => {
    const m = gatewayMessage(gw("502 Bad Gateway"), "沒寫成", false);
    expect(m).not.toMatch(/502|Gateway/);
    expect(m).toContain("你的內容都還在");
  });
  it("伺服器寫給人看的訊息照顯示；沒有就用 fallback", () => {
    expect(gatewayMessage(app("還沒有企劃"), "沒寫成", false)).toBe("還沒有企劃");
    expect(gatewayMessage(new Error(""), "沒寫成", false)).toBe("沒寫成");
  });
});
