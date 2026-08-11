import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLMMock, invokeSingleMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
  invokeSingleMock: vi.fn(),
}));

vi.mock("./env", () => ({
  ENV: { QWEN_API_KEY: "test-qwen-key" },
}));

vi.mock("./llm", () => ({
  invokeLLM: invokeLLMMock,
  invokeLLMSingleProvider: invokeSingleMock,
}));

import { callModel, callModelStrict } from "./multiModelRouter";

const response = (content: string) => ({
  choices: [{ message: { content } }],
});

describe("callModelStrict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only the single-provider primitive for Qwen-authorized payloads", async () => {
    invokeSingleMock.mockResolvedValue(response("public content"));

    await expect(callModelStrict([{ role: "user", content: "safe payload" }], "qwen"))
      .resolves.toEqual({ content: "public content", provider: "qwen", model: "qwen-plus" });
    expect(invokeSingleMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "qwen" }));
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("propagates a Qwen failure without entering the fallback router", async () => {
    invokeSingleMock.mockRejectedValue(new Error("qwen unavailable"));

    await expect(callModelStrict([{ role: "user", content: "safe payload" }], "qwen"))
      .rejects.toThrow("qwen unavailable");
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("passes caller cancellation only to the authorized provider request", async () => {
    invokeSingleMock.mockResolvedValue(response("public content"));
    const controller = new AbortController();

    await callModelStrict(
      [{ role: "user", content: "safe payload" }],
      "qwen",
      undefined,
      { signal: controller.signal },
    );

    expect(invokeSingleMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: "qwen",
      signal: controller.signal,
    }));
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("keeps the normal callModel fallback path unchanged", async () => {
    invokeLLMMock.mockResolvedValue(response("legacy content"));
    await expect(callModel([{ role: "user", content: "ordinary payload" }], undefined, "qwen"))
      .resolves.toMatchObject({ content: "legacy content", provider: "qwen" });
    expect(invokeLLMMock).toHaveBeenCalled();
    expect(invokeSingleMock).not.toHaveBeenCalled();
  });
});
