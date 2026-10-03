import { describe, expect, it } from "vitest";
import { cancelToastText, newRunKey } from "./runCancel";

describe("runCancel helpers", () => {
  it("generates keys the server accepts", () => {
    const k = newRunKey();
    expect(k).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newRunKey()).not.toBe(k);
  });
  it("mentions points only when refunded", () => {
    expect(cancelToastText({ cancelled: true, refundedPoints: 5 }, true)).toContain("5 points");
    expect(cancelToastText({ cancelled: true, refundedPoints: 5 }, false)).toContain("退還 5 點");
    expect(cancelToastText({ cancelled: true, refundedPoints: 0 }, true)).toBe("Stopped.");
    expect(cancelToastText({ cancelled: true }, false)).not.toContain("點");
  });
  it("is silent when the run was not found", () => {
    expect(cancelToastText({ cancelled: false, refundedPoints: 0 }, true)).toBeNull();
    expect(cancelToastText(null, true)).toBeNull();
  });
});
