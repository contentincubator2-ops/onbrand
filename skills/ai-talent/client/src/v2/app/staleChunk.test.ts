import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026-09-30（CJ「短暫一秒內出現錯誤畫面，然後轉回正常」）：
 * 部署後舊分頁的 lazy chunk 404 → vite:preloadError 被 preventDefault →
 * Vite 把 import 結果當 undefined 交給 React.lazy → React 丟
 * "Cannot use 'in' operator to search for 'default' in undefined"。
 * 這條路上 error boundary 不能閃紅卡、不能寫 error_log。
 * 旗標是 module 狀態，每個 case 都重新 import 一份乾淨的。
 */
async function fresh() {
  vi.resetModules();
  sessionStorage.clear();
  return await import("./staleChunk");
}

describe("staleChunk", () => {
  beforeEach(() => { sessionStorage.clear(); });

  it("認得 React.lazy 拿到 undefined module 的兩種症狀", async () => {
    const m = await fresh();
    expect(m.isChunkLoadError(new TypeError("Cannot use 'in' operator to search for 'default' in undefined"))).toBe(true);
    expect(m.isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
    expect(m.isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
  });

  it("一般錯誤不是 chunk 錯誤，也不會被 recover 吃掉", async () => {
    const m = await fresh();
    const err = new TypeError("Failed to construct 'URL': Invalid URL");
    expect(m.isStaleReloadPending()).toBe(false);
    expect(m.isChunkLoadError(err)).toBe(false);
    expect(m.recoverFromStaleChunk(err)).toBe(false);
  });

  it("重載排定後：旗標亮、任何錯誤都算已處理、不再重複排重載", async () => {
    const m = await fresh();
    // jsdom 的 location.reload 是 not-implemented（只印警告不丟錯），可以直接叫。
    expect(m.recoverFromStaleChunk(new TypeError("Failed to fetch dynamically imported module"))).toBe(true);
    expect(m.isStaleReloadPending()).toBe(true);
    // 重載前的殘影：連不像 chunk 錯誤的訊息也視為後果。
    expect(m.isChunkLoadError(new Error("whatever"))).toBe(true);
    // 第二次不會再消耗自動重載額度。
    const before = sessionStorage.getItem("_chunk_reload_log");
    expect(m.recoverFromStaleChunk(new Error("again"))).toBe(true);
    expect(sessionStorage.getItem("_chunk_reload_log")).toBe(before);
  });

  it("vite:preloadError 走 preventDefault（讓 Vite 吞掉 import），並把旗標亮起", async () => {
    const m = await fresh();
    m.installStaleChunkRecovery();
    const ev = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(m.isStaleReloadPending()).toBe(true);
  });
});
