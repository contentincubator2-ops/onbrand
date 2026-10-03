/**
 * runOrchestra60 intake guard — router-level.
 *
 * 2026-08-23 (CJ「tt-60-viral-rewrite 沒給爆款連結或主題時要出現錯誤提醒」)
 *
 * 這裡驗的是「錯誤真的從 API 回來」而不只是 guard 函式本身，外加一件同樣
 * 重要的事：被擋下來的請求 **一點都不能扣**。所以 pointsService 與
 * llmWithBilling 都被 mock 成「一被呼叫就讓測試失敗」。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// quickTaskRouter pulls in localDb at import time, which refuses to load
// without a password. The guard throws long before any query runs (that is
// the point of the test), so a placeholder is enough — mysql2 pools connect
// lazily.
process.env.LOCAL_DB_PASSWORD ||= "test";

const deductPoints = vi.fn(async () => {});
const assertPoints = vi.fn(async () => {});
const preflightCostCheck = vi.fn(async () => ({ ok: true as const }));
const runOrchestra = vi.fn(async () => ({ variants: [] }));

vi.mock("../../platform/core/billing/pointsService", () => ({ assertPoints, deductPoints }));
vi.mock("../../platform/core/llm/llmWithBilling", () => ({ preflightCostCheck }));
vi.mock("../core/engine/quickTaskOrchestra", () => ({ runOrchestra }));

const { quickTaskRouter } = await import("./quickTaskRouter");

const caller = () => quickTaskRouter.createCaller({ user: { id: 1 } } as any);

const run = (inputs: Record<string, string>) =>
  caller().runOrchestra60({ taskId: "tt-60-viral-rewrite", inputs });

/** 同一個 guard 掛在另一條 tier 路徑上（99s 走 runOrchestra99）。 */
const run99 = (inputs: Record<string, string>) =>
  caller().runOrchestra99({ taskId: "fb-99-viral-rewrite", inputs });

beforeEach(() => {
  assertPoints.mockClear();
  deductPoints.mockClear();
  preflightCostCheck.mockClear();
  runOrchestra.mockClear();
});

function expectNothingCharged() {
  expect(assertPoints).not.toHaveBeenCalled();
  expect(deductPoints).not.toHaveBeenCalled();
  expect(runOrchestra).not.toHaveBeenCalled();
}

describe("runOrchestra60 — tt-60-viral-rewrite intake guard", () => {
  it("rejects a missing viral source and charges nothing", async () => {
    await expect(run({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("TikTok"),
    });
    expectNothingCharged();
  });

  it("rejects a blank viral source", async () => {
    await expect(run({ viral_source: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNothingCharged();
  });

  it("rejects a filler answer", async () => {
    await expect(run({ viral_source: "隨便" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("看不出是哪一支爆款"),
    });
    expectNothingCharged();
  });

  it("rejects an answer too short to identify a post", async () => {
    await expect(run({ viral_source: "美食" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNothingCharged();
  });

  it("lets a pasted link through to the orchestra", async () => {
    await run({ viral_source: "https://vt.tiktok.com/ZSAbCdEfG/", brand_angle: "" });
    expect(deductPoints).toHaveBeenCalledTimes(1);
    expect(runOrchestra).toHaveBeenCalledTimes(1);
  });

  it("lets a described topic through to the orchestra", async () => {
    await run({ viral_source: "下班後 10 分鐘快煮那支" });
    expect(runOrchestra).toHaveBeenCalledTimes(1);
  });
});

describe("runOrchestra99 — fb-99-viral-rewrite intake guard", () => {
  it("rejects a missing viral source and charges nothing", async () => {
    await expect(run99({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("FB"),
    });
    expectNothingCharged();
  });

  it("rejects a filler answer", async () => {
    await expect(run99({ viral_source: "不知道" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNothingCharged();
  });

  it("lets a pasted viral post through to the orchestra", async () => {
    await run99({ viral_source: "https://www.facebook.com/share/p/abc123/" });
    expect(deductPoints).toHaveBeenCalledTimes(1);
    expect(runOrchestra).toHaveBeenCalledTimes(1);
  });
});
