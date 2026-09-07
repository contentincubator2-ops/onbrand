import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLMMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
}));

vi.mock("../../platform/core/llm", () => ({
  invokeLLM: invokeLLMMock,
}));

import { translateImagePromptToEnglish, translationMaxTokens } from "./imagePromptTranslation";

describe("translateImagePromptToEnglish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates a prompt containing CJK", async () => {
    invokeLLMMock.mockResolvedValue({
      choices: [{ message: { content: "A steaming bowl on a warm wooden table." } }],
    });

    await expect(translateImagePromptToEnglish("溫暖木桌上的一碗熱湯")).resolves.toEqual({
      prompt: "A steaming bowl on a warm wooden table.",
      translated: true,
    });
    expect(invokeLLMMock).toHaveBeenCalledOnce();
    expect(invokeLLMMock.mock.calls[0][0]).toMatchObject({
      provider: "azure-foundry",
      model: "gpt-4o-mini",
    });
  });

  it("still translates when azure-position is unavailable", async () => {
    delete process.env.AZURE_POSITION_API_KEY;
    delete process.env.AZURE_POSITION_ENDPOINT;
    invokeLLMMock.mockResolvedValue({
      model: "qwen-plus",
      choices: [{ message: { content: "Soft daylight beside the window." } }],
    });

    await expect(translateImagePromptToEnglish("窗邊的柔和日光")).resolves.toEqual({
      prompt: "Soft daylight beside the window.",
      translated: true,
    });
    expect(invokeLLMMock).toHaveBeenCalledOnce();
  });

  it("does not translate an English-only prompt", async () => {
    const prompt = "A steaming bowl on a warm wooden table.";
    await expect(translateImagePromptToEnglish(prompt)).resolves.toEqual({
      prompt,
      translated: false,
    });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("falls back to the original CJK prompt without throwing", async () => {
    invokeLLMMock.mockRejectedValue(new Error("translator unavailable"));
    const prompt = "窗邊自然柔光，不要文字";

    await expect(translateImagePromptToEnglish(prompt)).resolves.toEqual({
      prompt,
      translated: false,
    });
  });

  it("allocates enough output tokens for the router's longest accepted prompt", async () => {
    const prompt = "中".repeat(4_000);
    invokeLLMMock.mockResolvedValue({
      choices: [{ message: { content: "translated long prompt" } }],
    });

    await translateImagePromptToEnglish(prompt);

    expect(translationMaxTokens(prompt)).toBe(6_000);
    expect(invokeLLMMock.mock.calls[0][0].maxTokens).toBe(6_000);
  });
});
