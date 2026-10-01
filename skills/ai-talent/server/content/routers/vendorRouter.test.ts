import { describe, it, expect } from "vitest";
import { vendorRouter } from "./vendorRouter";

// tRPC 保留字（apply/call/bind…）會讓 router 建構期就炸、伺服器起不來，而 tsc 全綠——每個 router 配一支。
describe("vendorRouter", () => {
  it("router 建得起來，procedure 名稱如預期", () => {
    expect(Object.keys((vendorRouter as any)._def.procedures).sort()).toEqual(["context", "search"]);
  });
});
