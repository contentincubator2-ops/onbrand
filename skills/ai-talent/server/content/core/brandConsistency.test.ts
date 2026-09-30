import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLLM = vi.fn();
vi.mock("../../platform/core/llm", () => ({ invokeLLM: (...a: any[]) => invokeLLM(...a) }));

import { acceptRevision, checkBrandConsistency } from "./brandConsistency";

const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const base = {
  caption: "我們幫品牌把語氣找回來。每一篇都像同一個人寫的。\n#品牌 #行銷",
  brandPrefix: "語氣：洞察而不說教、溫厚而有立場。禁用：技術術語堆砌。",
  userMsg: "[本業] 行銷顧問",
  taskLabel: "FB Reels",
  isZhTW: true,
  timeoutMs: 20_000,
};

describe("checkBrandConsistency", () => {
  beforeEach(() => invokeLLM.mockReset());

  it("一致 → consistent，原稿不動", async () => {
    invokeLLM.mockResolvedValue(reply({ consistent: true, issues: [], revised: "" }));
    const r = await checkBrandConsistency(base);
    expect(r.status).toBe("consistent");
    expect(r.caption).toBe(base.caption);
  });

  it("不一致且修正稿合格 → fixed，交出修正稿", async () => {
    const revised = "我們幫品牌把說話的方式找回來。每一篇都像同一個人寫的。\n#品牌 #行銷";
    invokeLLM.mockResolvedValue(reply({ consistent: false, issues: [{ aspect: "語氣", detail: "第一句太像廣告" }], revised }));
    const r = await checkBrandConsistency(base);
    expect(r.status).toBe("fixed");
    expect(r.caption).toBe(revised);
    expect(r.issues[0]!.aspect).toBe("語氣");
  });

  it("修正稿太短 → flagged，保留原稿", async () => {
    invokeLLM.mockResolvedValue(reply({ consistent: false, issues: [{ aspect: "事實", detail: "編了數字" }], revised: "短" }));
    const r = await checkBrandConsistency(base);
    expect(r.status).toBe("flagged");
    expect(r.caption).toBe(base.caption);
  });

  it("LLM 失敗 → skipped，絕不回假的通過", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: "抱歉，我無法完成" } }] });
    const r = await checkBrandConsistency(base);
    expect(r.status).toBe("skipped");
    expect(r.caption).toBe(base.caption);
  });

  it("沒有品牌大腦或時間不夠 → skipped，不呼叫 LLM", async () => {
    expect((await checkBrandConsistency({ ...base, brandPrefix: "" })).status).toBe("skipped");
    expect((await checkBrandConsistency({ ...base, timeoutMs: 1000 })).status).toBe("skipped");
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("回傳包在 ```json 裡也能解析", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: "```json\n{\"consistent\":true,\"issues\":[]}\n```" } }] });
    expect((await checkBrandConsistency(base)).status).toBe("consistent");
  });
});

describe("acceptRevision", () => {
  it("掉了連結就不採用", () => {
    expect(acceptRevision("看這裡 https://a.com/x 很棒的內容喔", "看這裡 https://a.com/y 很棒的內容喔", { isZhTW: true })).toMatch(/dropped link/);
  });
  it("zh-TW 品牌的修正稿變成英文就不採用", () => {
    expect(acceptRevision("我們幫品牌把語氣找回來，每一篇都像同一個人寫的", "Brand voice back, always ok", { isZhTW: true })).toMatch(/language/);
  });
  it("長度合理、語言一致 → 採用", () => {
    expect(acceptRevision("我們幫品牌把語氣找回來", "我們替品牌把語氣找回來", { isZhTW: true })).toBeNull();
  });
});
