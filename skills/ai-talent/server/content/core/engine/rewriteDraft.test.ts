import { beforeEach, describe, expect, it, vi } from "vitest";

const { callModelMock, buildBrandPrefixMock, enforceBrandRulesOnTextMock } = vi.hoisted(() => ({
  callModelMock: vi.fn(),
  buildBrandPrefixMock: vi.fn(),
  enforceBrandRulesOnTextMock: vi.fn(async (_brandId: unknown, text: string) => text),
}));

vi.mock("../../../platform/core/llm/multiModelRouter", () => ({ callModel: callModelMock }));
vi.mock("../../../strategy/core/brand/brandContext", () => ({
  buildBrandPrefix: buildBrandPrefixMock,
  enforceBrandRulesOnText: enforceBrandRulesOnTextMock,
}));

import { rewriteDraft } from "./rewriteDraft";

describe("rewriteDraft", () => {
  beforeEach(() => {
    callModelMock.mockReset();
    buildBrandPrefixMock.mockReset();
    buildBrandPrefixMock.mockResolvedValue("");
    enforceBrandRulesOnTextMock.mockReset();
    enforceBrandRulesOnTextMock.mockImplementation(async (_brandId: unknown, text: string) => text);
  });

  it("runs diagnose → rewrite → cta in sequence and parses the final three sections", async () => {
    callModelMock
      .mockResolvedValueOnce({ content: "**病因**\n- 太抽象\n\n**處方**\n數字證據", provider: "qwen", model: "m" })
      .mockResolvedValueOnce({ content: "改寫後的版本文字", provider: "qwen", model: "m" })
      .mockResolvedValueOnce({
        content: "**最終文案**\n改寫後的版本文字，微調過\n\n**CTA**\n立即體驗\n\n**改了什麼**\n加了數字證據",
        provider: "qwen", model: "m",
      });

    const result = await rewriteDraft({ material: "原文案內容", audience: "新手媽媽" });

    expect(callModelMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      rewritten: "改寫後的版本文字，微調過",
      cta: "立即體驗",
      whatChanged: "加了數字證據",
    });
  });

  it("falls back to the whole response as rewritten text when the model ignores the section format", async () => {
    callModelMock
      .mockResolvedValueOnce({ content: "診斷內容", provider: "qwen", model: "m" })
      .mockResolvedValueOnce({ content: "改寫內容", provider: "qwen", model: "m" })
      .mockResolvedValueOnce({ content: "沒有照格式回的一整段文字", provider: "qwen", model: "m" });

    const result = await rewriteDraft({ material: "x" });

    expect(result.rewritten).toBe("沒有照格式回的一整段文字");
    expect(result.cta).toBe("");
    expect(result.whatChanged).toBe("");
  });

  it("falls back to forge when qwen fails", async () => {
    callModelMock
      .mockRejectedValueOnce(new Error("qwen down"))
      .mockResolvedValueOnce({ content: "diag", provider: "forge", model: "m" })
      .mockRejectedValueOnce(new Error("qwen down"))
      .mockResolvedValueOnce({ content: "rewrite", provider: "forge", model: "m" })
      .mockRejectedValueOnce(new Error("qwen down"))
      .mockResolvedValueOnce({ content: "**最終文案**\nfinal", provider: "forge", model: "m" });

    const result = await rewriteDraft({ material: "x" });

    expect(callModelMock).toHaveBeenCalledTimes(6);
    expect(result.rewritten).toBe("final");
  });

  it("injects the brand voice prefix (mode core) into every stage's system prompt", async () => {
    buildBrandPrefixMock.mockResolvedValue("\n[品牌調性]\n溫暖、直接");
    callModelMock.mockResolvedValue({ content: "**最終文案**\nfinal", provider: "qwen", model: "m" });

    await rewriteDraft({ material: "x", brandId: 42 });

    expect(buildBrandPrefixMock).toHaveBeenCalledWith(42, undefined, undefined, "core");
    for (const call of callModelMock.mock.calls) {
      const systemMsg = call[0][0].content as string;
      expect(systemMsg).toContain("溫暖、直接");
    }
  });

  it("runs the final rewrite through enforceBrandRulesOnText, and a rule-engine failure doesn't block the result", async () => {
    callModelMock.mockResolvedValue({ content: "**最終文案**\nraw output", provider: "qwen", model: "m" });
    enforceBrandRulesOnTextMock.mockResolvedValueOnce("raw output（已套用品牌禁用詞規則）");

    const result = await rewriteDraft({ material: "x", brandId: 7 });
    expect(enforceBrandRulesOnTextMock).toHaveBeenCalledWith(7, "raw output");
    expect(result.rewritten).toBe("raw output（已套用品牌禁用詞規則）");

    enforceBrandRulesOnTextMock.mockRejectedValueOnce(new Error("rule engine down"));
    const result2 = await rewriteDraft({ material: "x", brandId: 7 });
    expect(result2.rewritten).toBe("raw output");
  });
});
