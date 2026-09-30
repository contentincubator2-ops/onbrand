/**
 * 法規審查重點萃取（2026-09-30 CJ「萃取好以後請用戶回來確認」）。守：
 *   1. 切段在條文邊界，不把一條拆兩半；沒換行的長文也切得開。
 *   2. 進度一段一段往上走；結果放 draftDigest、狀態 review（不直接生效）。
 *   3. 整理後仍超過 800 字就在行尾截斷；萃取期間原文被改就丟掉結果。
 *   4. 找不到相關規範、LLM 壞掉 → failed，不假裝萃取好了。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as any,
  jobs: [] as Array<{ status: string; progress: any; error: string | null }>,
  replies: [] as Array<string | Error>,
  prompts: [] as string[],
  mutateBodyAfterCalls: -1,
}));

vi.mock("../../platform/core/llm", () => ({
  invokeLLM: async (p: any) => {
    state.prompts.push(p.messages[1].content);
    if (state.mutateBodyAfterCalls >= 0 && state.prompts.length > state.mutateBodyAfterCalls) state.row.body = "被改掉的原文";
    const r = state.replies.shift() ?? "無";
    if (r instanceof Error) throw r;
    return { choices: [{ message: { content: r } }] };
  },
}));
vi.mock("../../localDb", () => ({
  default: {
    execute: async (sql: string, params: any[]) => {
      if (/SET draftDigest = \?/.test(sql)) state.row.draftDigest = params[0];
      return [[]];
    },
  },
}));
vi.mock("./brandRegulations", async (orig) => ({
  ...(await orig<any>()),
  getRegulation: async () => (state.row ? { ...state.row } : null),
  setJob: async (_id: number, status: string, progress: any, error: string | null = null) => {
    state.jobs.push({ status, progress, error });
  },
}));

import { CHUNK_CHARS, clipAtLine, cleanBullets, runRegulationExtraction, splitRegulation } from "./regulationDigest";

beforeEach(() => {
  state.row = null; state.jobs = []; state.replies = []; state.prompts = []; state.mutateBodyAfterCalls = -1;
});

const article = (n: number, len: number) => `第${n}條 ${"規".repeat(len)}`;

describe("splitRegulation", () => {
  it("短的不切", () => {
    expect(splitRegulation("第1條 不得誇大")).toEqual(["第1條 不得誇大"]);
  });
  it("在條文邊界切，每段不超過上限", () => {
    const text = Array.from({ length: 12 }, (_, i) => article(i + 1, 1_000)).join("\n");
    const chunks = splitRegulation(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect([...c].length).toBeLessThanOrEqual(CHUNK_CHARS);
      expect(c.startsWith("第")).toBe(true);      // 每段都從一條的開頭開始
    }
    expect(chunks.join("\n")).toBe(text);
  });
  it("沒有換行的長文硬切", () => {
    const chunks = splitRegulation("字".repeat(CHUNK_CHARS * 2 + 10));
    expect(chunks.length).toBe(3);
  });
});

describe("cleanBullets / clipAtLine", () => {
  it("只留條列、統一成「- 」；「無」是空", () => {
    expect(cleanBullets("以下是：\n• 第28條 不得宣稱療效\n* 不得誇大")).toBe("- 第28條 不得宣稱療效\n- 不得誇大");
    expect(cleanBullets("無")).toBe("");
  });
  it("行尾截斷，不切半句", () => {
    expect(clipAtLine("- 一二三\n- 四五六\n- 七八九", 12)).toBe("- 一二三\n- 四五六");
  });
});

describe("runRegulationExtraction", () => {
  it("多段：逐段萃取、整理，結果放待確認，進度一路往上", async () => {
    state.row = { id: 1, title: "化粧品法", body: Array.from({ length: 12 }, (_, i) => article(i + 1, 1_000)).join("\n") };
    const n = splitRegulation(state.row.body).length;
    state.replies = [...Array.from({ length: n }, (_, i) => `- 第${i + 1}條 不得宣稱療效`), "- 第1條 不得宣稱療效\n- 第2條 不得誇大"];
    await runRegulationExtraction(1);
    expect(state.row.draftDigest).toBe("- 第1條 不得宣稱療效\n- 第2條 不得誇大");
    const last = state.jobs[state.jobs.length - 1]!;
    expect(last.status).toBe("review");
    const dones = state.jobs.filter((j) => j.progress?.stage === "extracting").map((j) => j.progress.done);
    expect(dones[0]).toBe(0);
    expect(dones[dones.length - 1]).toBe(n);
    expect(state.jobs.some((j) => j.progress?.stage === "merging")).toBe(true);
  });

  it("整理後還太長：重試，最後在行尾截到 800 字以內", async () => {
    state.row = { id: 1, title: "t", body: Array.from({ length: 12 }, (_, i) => article(i + 1, 1_000)).join("\n") };
    const n = splitRegulation(state.row.body).length;
    const long = Array.from({ length: 60 }, (_, i) => `- 第${i}條 ${"不得".repeat(10)}`).join("\n");
    state.replies = [...Array.from({ length: n }, () => "- x"), long, long, long];
    await runRegulationExtraction(1);
    expect([...state.row.draftDigest].length).toBeLessThanOrEqual(800);
    expect(state.jobs[state.jobs.length - 1]!.status).toBe("review");
  });

  it("萃取期間原文被改：丟掉結果、回到 idle", async () => {
    state.row = { id: 1, title: "t", body: "第1條 不得誇大" };
    state.replies = ["- 不得誇大"];
    state.mutateBodyAfterCalls = 0;
    await runRegulationExtraction(1);
    expect(state.row.draftDigest).toBeUndefined();
    expect(state.jobs[state.jobs.length - 1]!.status).toBe("idle");
  });

  it("整份都沒有行銷相關規範：failed 並說明", async () => {
    state.row = { id: 1, title: "t", body: "第1條 本法主管機關為衛福部" };
    state.replies = ["無"];
    await runRegulationExtraction(1);
    const last = state.jobs[state.jobs.length - 1]!;
    expect(last.status).toBe("failed");
    expect(last.error).toContain("找不到");
  });

  it("LLM 壞掉：failed", async () => {
    state.row = { id: 1, title: "t", body: "第1條 不得誇大" };
    state.replies = [new Error("boom")];
    await runRegulationExtraction(1);
    expect(state.jobs[state.jobs.length - 1]).toMatchObject({ status: "failed", error: "boom" });
  });
});
