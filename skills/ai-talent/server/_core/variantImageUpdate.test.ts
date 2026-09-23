import { describe, expect, it } from "vitest";
import { applyVariantImageUpdate } from "./variantImageUpdate";

describe("applyVariantImageUpdate", () => {
  it("replaces stale flat prompts together with the nested image prompt", () => {
    const result = applyVariantImageUpdate({
      image: {
        style: "既有風格方向",
        prompt: "old nested prompt",
        promptZh: "舊的巢狀指令",
        url: "https://example.com/old.png",
        status: "ready",
      },
      imagePrompt: "old flat prompt",
      imagePromptZh: "舊的平面指令",
      imageUrl: "https://example.com/old.png",
    }, {
      imageUrl: "https://example.com/new.png",
      prompt: "new model prompt",
      promptZh: "新的使用者指令",
      modelId: "imagen-4.0-generate-001",
      requestedModelId: "gpt-image-2",
      fallbackUsed: true,
    });

    expect(result.image).toMatchObject({
      style: "既有風格方向",
      prompt: "new model prompt",
      promptZh: "新的使用者指令",
      url: "https://example.com/new.png",
      status: "ready",
    });
    expect(result).toMatchObject({
      imagePrompt: "new model prompt",
      imagePromptZh: "新的使用者指令",
      imageUrl: "https://example.com/new.png",
      imageStatus: "ready",
      imageModelId: "imagen-4.0-generate-001",
      imageRequestedModelId: "gpt-image-2",
      imageFallbackUsed: true,
    });
  });

  it("preserves legacy flat visual metadata when no replacement is supplied", () => {
    const result = applyVariantImageUpdate({
      imageStyle: "legacy direction",
      imagePrompt: "legacy model prompt",
      imagePromptZh: "舊版中文指令",
    }, {
      imageUrl: "/static/covers/new.png",
    });

    expect(result.image).toMatchObject({
      style: "legacy direction",
      prompt: "legacy model prompt",
      promptZh: "舊版中文指令",
    });
    expect(result.imagePrompt).toBe("legacy model prompt");
  });
});


describe("repairing an individual carousel/storyboard image", () => {
  it("updates only the selected frame and clears its old failure", () => {
    const original = { image: { url: "/static/cover.png", status: "ready" }, cards: [
      { headline: "Keep", image: { url: "/static/first.png", status: "ready" } },
      { headline: "Repair", image: { url: null, status: "failed", errorMsg: "timeout", canSwitchTo: "nano-banana" } },
    ] };
    const result = applyVariantImageUpdate(original, { cardIndex: 1, imageUrl: "/static/fixed.png", modelId: "nano-banana" });
    expect(result.image).toEqual(original.image);
    expect(result.cards[0]).toEqual(original.cards[0]);
    expect(result.cards[1].image).toMatchObject({ url: "/static/fixed.png", status: "ready", modelId: "nano-banana" });
    expect(result.cards[1].image.errorMsg).toBeUndefined();
    expect(result.cards[1].image.canSwitchTo).toBeUndefined();
    expect(original.cards[1].image.status).toBe("failed");
  });
  it("rejects an invalid frame instead of overwriting the cover", () => {
    for (const cardIndex of [-1, 0, 2, 0.5]) {
      expect(() => applyVariantImageUpdate({ cards: [] }, { cardIndex, imageUrl: "/static/a.png" })).toThrow("Image card not found");
    }
  });
});
