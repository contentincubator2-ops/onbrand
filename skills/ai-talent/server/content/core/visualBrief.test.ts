import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLMMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
}));

vi.mock("../../platform/core/llm", () => ({
  invokeLLM: invokeLLMMock,
}));

import { captionToBilingualVisualBrief } from "./visualBrief";

const response = {
  choices: [{ message: { content: "A safe generic product scene." } }],
};

describe("captionToBilingualVisualBrief brand identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeLLMMock.mockResolvedValue(response);
  });

  it("includes brand name and industry in the user message", async () => {
    await captionToBilingualVisualBrief({
      caption: "A runner laces up before sunrise.",
      platform: "instagram",
      brandIdentity: { name: "Adidas", industry: "Sportswear" },
    });

    const request = invokeLLMMock.mock.calls[0][0];
    expect(request.messages[1].content).toContain("Brand: Adidas — Sportswear\n");
  });

  it("uses the explicit unknown marker when brand identity is unavailable", async () => {
    await captionToBilingualVisualBrief({
      caption: "A runner laces up before sunrise.",
      platform: "instagram",
      brandIdentity: null,
    });

    const request = invokeLLMMock.mock.calls[0][0];
    expect(request.messages[1].content).toContain("Brand: (unknown)\n");
  });

  it("protects the attached product's own identifiers in subject mode", async () => {
    await captionToBilingualVisualBrief({
      caption: "Place the photographed shoe in a running scene.",
      brandIdentity: { name: "小安素", industry: "營養補充" },
      subjectMode: true,
    });

    const request = invokeLLMMock.mock.calls[0][0];
    expect(request.messages[0].content).toContain(
      "Preserve the attached real product and all of its own logos",
    );
    expect(request.messages[0].content).toContain(
      "Apart from those attached-product identifiers",
    );
    expect(request.messages[0].content).not.toContain(
      "products must be generic, unbranded, and plain",
    );
    expect(request.messages[1].content).toContain("Brand: (unknown)\n");
    expect(request.messages[1].content).not.toContain("小安素");
  });

  it("returns matching English and Chinese briefs from one LLM call", async () => {
    invokeLLMMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        prompt: "A runner ties her shoes beside a sunrise window.",
        promptZh: "晨光窗邊，一名跑者正在綁鞋帶。",
      }) } }],
    });

    await expect(captionToBilingualVisualBrief({
      caption: "晨跑前的準備時刻",
    })).resolves.toEqual({
      prompt: "A runner ties her shoes beside a sunrise window.",
      promptZh: "晨光窗邊，一名跑者正在綁鞋帶。",
    });
    expect(invokeLLMMock).toHaveBeenCalledOnce();
    expect(invokeLLMMock.mock.calls[0][0].messages[0].content).toContain(
      "semantically equivalent versions",
    );
    expect(invokeLLMMock.mock.calls[0][0].maxTokens).toBe(1200);
  });

  it("falls back when the provider reports a truncated response", async () => {
    invokeLLMMock.mockResolvedValue({
      choices: [{
        finish_reason: "length",
        message: { content: '{"prompt":"complete English","promptZh":"截斷' },
      }],
    });

    await expect(captionToBilingualVisualBrief({ caption: "完整貼文" })).resolves.toEqual({
      prompt: "Photorealistic editorial scene representing: 完整貼文",
      promptZh: "寫實的編輯攝影場景，呈現：完整貼文",
    });
  });
});
