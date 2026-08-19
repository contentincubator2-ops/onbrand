import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLMMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
}));

vi.mock("./llm", () => ({
  invokeLLM: invokeLLMMock,
}));

import { captionToVisualBrief } from "./visualBrief";

const response = {
  choices: [{ message: { content: "A safe generic product scene." } }],
};

describe("captionToVisualBrief brand identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeLLMMock.mockResolvedValue(response);
  });

  it("includes brand name and industry in the user message", async () => {
    await captionToVisualBrief({
      caption: "A runner laces up before sunrise.",
      platform: "instagram",
      brandIdentity: { name: "Adidas", industry: "Sportswear" },
    });

    const request = invokeLLMMock.mock.calls[0][0];
    expect(request.messages[1].content).toContain("Brand: Adidas — Sportswear\n");
  });

  it("uses the explicit unknown marker when brand identity is unavailable", async () => {
    await captionToVisualBrief({
      caption: "A runner laces up before sunrise.",
      platform: "instagram",
      brandIdentity: null,
    });

    const request = invokeLLMMock.mock.calls[0][0];
    expect(request.messages[1].content).toContain("Brand: (unknown)\n");
  });

  it("protects the attached product's own identifiers in subject mode", async () => {
    await captionToVisualBrief({
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
});
