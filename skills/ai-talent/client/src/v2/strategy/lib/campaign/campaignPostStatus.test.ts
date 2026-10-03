import { describe, it, expect } from "vitest";
import { POST_STATES, isPostDone, postStateLabel, postStateOf } from "./campaignPostStatus";

describe("postStateOf", () => {
  it("沒寫就是未產出，不管伺服器說什麼", () => {
    expect(postStateOf(null, "approved")).toBe("unwritten");
    expect(postStateOf(undefined, undefined)).toBe("unwritten");
  });
  it("寫了但伺服器還沒回狀態（或回了不認得的）→ 草稿", () => {
    expect(postStateOf(12, undefined)).toBe("draft");
    expect(postStateOf(12, "weird")).toBe("draft");
    expect(postStateOf(12, "unwritten")).toBe("draft");
  });
  it("照伺服器回的狀態", () => {
    expect(postStateOf(12, "in_review")).toBe("in_review");
    expect(postStateOf(12, "published")).toBe("published");
  });
});

describe("labels", () => {
  it("每個狀態都有中英文，而且沒有「修改中」", () => {
    for (const s of POST_STATES) {
      expect(postStateLabel(s, false)).toBeTruthy();
      expect(postStateLabel(s, true)).toBeTruthy();
    }
    expect(POST_STATES.map((s) => postStateLabel(s, false))).not.toContain("修改中");
  });
  it("核准與發布才算完成", () => {
    expect(POST_STATES.filter(isPostDone)).toEqual(["approved", "published"]);
  });
});
