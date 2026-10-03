import { describe, it, expect } from "vitest";
import { resolveTrayIds, isDefaultTray, toggleTrayId, taskPlatformOf } from "./taskTrayClient";

const cards = (n: number, postType = "feed") =>
  Array.from({ length: n }, (_, i) => ({ id: `fb-${i}`, postType: i % 2 ? postType : `${postType}-b` }));

describe("resolveTrayIds", () => {
  it("還沒載入就回空（不要先閃出全部再縮回去）", () => {
    expect(resolveTrayIds(undefined, cards(3))).toEqual([]);
  });
  it("存過的照存的順序，但只留現在看得到的（降級／退役的卡不能從常用清單漏出來）", () => {
    const tray = { stored: ["fb-2", "gone", "fb-0"], fallback: [] };
    expect(resolveTrayIds(tray, cards(3))).toEqual(["fb-2", "fb-0"]);
  });
  it("沒存過、卡不超過上限 → 全部擺出來", () => {
    expect(resolveTrayIds({ stored: null, fallback: [], maxTray: 12 }, cards(8))).toHaveLength(8);
  });
  it("沒存過、卡超過上限 → 每個形式一張，照 server 的預設順序挑", () => {
    const list = [
      { id: "a", postType: "feed" }, { id: "b", postType: "feed" },
      { id: "c", postType: "reel" }, { id: "d", postType: "reel" },
    ];
    expect(resolveTrayIds({ stored: null, fallback: ["b", "d"], maxTray: 3 }, list)).toEqual(["b", "d"]);
  });
  it("存的全都看不到了 → 當成沒存過", () => {
    const tray = { stored: ["gone"], fallback: [], maxTray: 12 };
    expect(resolveTrayIds(tray, cards(2))).toEqual(["fb-0", "fb-1"]);
    expect(isDefaultTray(tray, cards(2))).toBe(true);
  });
  it("isDefaultTray：有任何一張存過且看得到就不是預設", () => {
    expect(isDefaultTray({ stored: ["fb-1"], fallback: [] }, cards(2))).toBe(false);
    expect(isDefaultTray({ stored: null, fallback: [] }, cards(2))).toBe(true);
  });
});

describe("toggleTrayId（卡片上的星號）", () => {
  it("沒在清單裡 → 加到最後", () => {
    expect(toggleTrayId(["a"], "b")).toEqual({ ok: true, next: ["a", "b"], added: true });
  });
  it("在清單裡 → 拿掉", () => {
    expect(toggleTrayId(["a", "b"], "a")).toEqual({ ok: true, next: ["b"], added: false });
  });
  it("到上限不能再加", () => {
    expect(toggleTrayId(["a", "b"], "c", 2)).toEqual({ ok: false, reason: "full" });
  });
  it("最後一張不能拿掉——存空陣列會變成回到系統預設，畫面會跳出一批他沒挑的卡", () => {
    expect(toggleTrayId(["a"], "a")).toEqual({ ok: false, reason: "last" });
  });
});

describe("taskPlatformOf", () => {
  it("有 platform 就用它；沒有就看 id 前綴；都認不出來當 Facebook（跟平台頁原本的規則一樣）", () => {
    expect(taskPlatformOf({ id: "u12-promo", platform: "line" })).toBe("line");
    expect(taskPlatformOf({ id: "ig-reel-1" })).toBe("instagram");
    expect(taskPlatformOf({ id: "th-thread-1" })).toBe("threads");
    expect(taskPlatformOf({ id: "ln-push-1" })).toBe("line");
    expect(taskPlatformOf({ id: "web-blog-1" })).toBe("website");
    expect(taskPlatformOf({ id: "fb-viral-1" })).toBe("facebook");
  });
});
