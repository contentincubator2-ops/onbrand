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
