/**
 * 法規合規檢查（2026-09-30 CJ「要多加一道寫完後的合規檢查」）。守：
 *   1. 沒違規照交原稿；有違規交修正稿並留原稿。
 *   2. 修正稿過不了守門、或還留著違規原句 → flagged、交原稿，不假裝修好。
 *   3. LLM 失敗／沒時間 → skipped。模型編出原稿沒有的「違規句」不收。
 *   4. 品牌沒有法規 → 整關不跑（回 null）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const llm = vi.hoisted(() => ({ reply: "" as string | Error, calls: 0 }));
vi.mock("../../platform/core/llm", () => ({
  invokeLLM: async () => {
    llm.calls++;
    if (llm.reply instanceof Error) throw llm.reply;
    return { choices: [{ message: { content: llm.reply } }] };
  },
  invokeLLMSingleProvider: async () => ({}),
}));
const regs = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("../../strategy/core/brandRegulations", async (orig) => ({
  ...(await orig<any>()),
  loadActiveRegulations: async () => regs.rows,
}));

import { checkRegulationCompliance, checkVariantsCompliance, cleanIssues } from "./regulationCompliance";

const REG = [{ title: "化粧品廣告", source: "食藥署", body: "不得宣稱醫療效能，例如助眠、舒緩焦慮。" }];
const CAP = "睡前點一支香氛，幫助入眠、舒緩焦慮。今晚，把時間留給自己。#香氛 #放鬆";
const base = { regulations: REG, isZhTW: true, timeoutMs: 10_000 };

beforeEach(() => { llm.reply = ""; llm.calls = 0; regs.rows = []; });

describe("checkRegulationCompliance", () => {
  it("沒違規：原稿照交", async () => {
    llm.reply = '{"compliant": true, "issues": [], "revised": ""}';
    const r = await checkRegulationCompliance({ caption: CAP, ...base });
    expect(r).toMatchObject({ status: "compliant", caption: CAP, issues: [] });
  });

  it("有違規：交修正稿、留原稿與違規句", async () => {
    const revised = "睡前點一支香氛，讓房間多一點安靜的氣味。今晚，把時間留給自己。#香氛 #放鬆";
    llm.reply = JSON.stringify({ compliant: false, issues: [{ regulation: "化粧品廣告", quote: "幫助入眠、舒緩焦慮", detail: "宣稱醫療效能" }], revised });
    const r = await checkRegulationCompliance({ caption: CAP, ...base });
    expect(r.status).toBe("fixed");
    expect(r.caption).toBe(revised);
    expect(r.before).toBe(CAP);
    expect(r.issues[0]!.quote).toBe("幫助入眠、舒緩焦慮");
  });

  it("修正稿還留著違規原句：flagged、交原稿", async () => {
    llm.reply = JSON.stringify({ compliant: false, issues: [{ regulation: "x", quote: "幫助入眠、舒緩焦慮", detail: "d" }], revised: CAP + "！" });
    const r = await checkRegulationCompliance({ caption: CAP, ...base });
    expect(r).toMatchObject({ status: "flagged", caption: CAP });
  });

  it("修正稿長度差太多：flagged、交原稿", async () => {
    llm.reply = JSON.stringify({ compliant: false, issues: [{ regulation: "x", quote: "幫助入眠", detail: "d" }], revised: "短" });
    expect((await checkRegulationCompliance({ caption: CAP, ...base })).status).toBe("flagged");
  });

  it("LLM 壞掉或沒時間：skipped，不假裝檢查過", async () => {
    llm.reply = new Error("boom");
    expect((await checkRegulationCompliance({ caption: CAP, ...base })).status).toBe("skipped");
    llm.calls = 0;
    expect((await checkRegulationCompliance({ caption: CAP, ...base, timeoutMs: 1_000 })).status).toBe("skipped");
    expect(llm.calls).toBe(0);
  });

  it("模型編出原稿沒有的違規句：不收，視為沒違規", () => {
    expect(cleanIssues([{ regulation: "x", quote: "保證治好失眠", detail: "d" }], CAP)).toEqual([]);
  });
});

describe("checkVariantsCompliance", () => {
  it("品牌沒有啟用中的法規：整關不跑", async () => {
    const r = await checkVariantsCompliance({ brandId: 1, captions: [{ caption: CAP }], isZhTW: true, timeoutMs: 10_000, onFixed: async () => {} });
    expect(r).toBeNull();
    expect(llm.calls).toBe(0);
  });

  it("有法規：每個版本一筆、記下對照幾條，修正稿交給呼叫端", async () => {
    regs.rows = [{ ...REG[0], id: 1, brandId: 1, enabled: true, chars: 20 }];
    const revised = "睡前點一支香氛，讓房間多一點安靜的氣味。今晚，把時間留給自己。#香氛 #放鬆";
    llm.reply = JSON.stringify({ compliant: false, issues: [{ regulation: "化粧品廣告", quote: "幫助入眠、舒緩焦慮", detail: "醫療效能" }], revised });
    const got: string[] = [];
    const r = await checkVariantsCompliance({ brandId: 1, captions: [{ caption: CAP }, null], isZhTW: true, timeoutMs: 10_000, onFixed: async (_i, t) => { got.push(t); } });
    expect(r).toHaveLength(1);
    expect(r![0]).toMatchObject({ variantIndex: 0, status: "fixed", regulationCount: 1 });
    expect(got).toEqual([revised]);
  });
});
